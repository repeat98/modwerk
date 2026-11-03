#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Compile without firmware, then diagnose unchanged stock scanners separately.

All outputs belong in a new private directory outside Git. No gate, package or
module runtime is changed. Scan hits contain offsets and hashes, never bytes.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCES = ('translation.c', 'native.c', 'engine.c', 'engine.h', 'ui.c', 'ui.h', 'font.c', 'font.h')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(args):
    result = subprocess.run([str(arg) for arg in args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def write_json(filename, document):
    filename.write_text(json.dumps(document, indent=2) + '\n')


def compile_sources(out):
    out.mkdir(parents=True, exist_ok=False)
    builder = load('psl_scan_builder', ROOT / 'sdk/runtime/loader/build.py')
    guard = load('psl_scan_codegen', ROOT / 'sdk/runtime/m68k_codegen.py')
    flags = [*builder.CFLAGS, *guard.FLAGS, '-g']
    results = {}
    for label, source in (('module', HERE / 'translation.c'), ('probe', HERE / 'scanner_probe.c')):
        work = out / label
        work.mkdir()
        obj = work / 'source.o'
        run(['m68k-elf-gcc', *flags, '-c', source, '-o', obj])
        guard.check_mcf54455([obj])
        # The production linker deliberately rejects orphan debug sections.
        # Keep the debug object for source lines; link its stripped twin through
        # the unchanged production path. Both put their single .text at zero.
        linked_obj = work / 'linked.o'
        run(['m68k-elf-objcopy', '--strip-debug', obj, linked_obj])
        image, symbols, bss, relocations = builder.link_units([linked_obj], 'm68k-elf-', 0, work, anywhere=True)
        (work / 'image.bin').write_bytes(image)
        write_json(work / 'symbols.json', symbols)
        (work / 'authored-disassembly.private.txt').write_text(run(['m68k-elf-objdump', '-d', work / '0.elf']))
        results[label] = dict(imageBytes=len(image), imageSha256=sha(image), bssBytes=bss,
                              relocations=len(relocations))
    report = dict(stage='firmware-blind compilation', compiler=run(['m68k-elf-gcc', '--version']).splitlines()[0],
                  flags=flags, results=results, helperSha256=sha(Path(__file__).read_bytes()),
                  sourceHashes={name: sha((HERE / name).read_bytes()) for name in (*SOURCES, 'scanner_probe.c')},
                  builderHashes={name: sha((ROOT / name).read_bytes()) for name in
                                 ('sdk/runtime/loader/build.py', 'sdk/runtime/m68k_codegen.py')})
    write_json(out / 'compilation.json', report)
    print(json.dumps(report['results'], indent=2))


def exact_runs(data, stock, weighted, scanner):
    """Explain rejected seed starts, preserving the production scanner's verdict."""
    before = scanner.filler(data)
    details = []
    for start, count in sorted(weighted.items()):
        if count < scanner.LIMIT:
            continue
        seed = data[start:start + scanner.SEED]
        cursor, candidates = 0, []
        while True:
            at = stock.find(seed, cursor)
            if at < 0:
                break
            cursor = at + 1
            length = scanner.SEED
            while start + length < len(data) and at + length < len(stock) and data[start + length] == stock[at + length]:
                length += 1
            value = length - (before[start + length] - before[start])
            if value == count:
                candidates.append((length, at))
        assert candidates, 'Diagnostic explanation disagrees with production scan'
        length, stock_at = max(candidates, key=lambda item: item[0])
        details.append(dict(offset=start, bytes=length, countedBytes=count, stockOffset=stock_at,
                            matchSha256=sha(data[start:start + length])))
    return details


def location(out, label, address):
    text = run(['m68k-elf-addr2line', '-f', '-e', out / label / 'source.o', hex(address)]).splitlines()
    return dict(function=text[0], source=text[1].replace(str(HERE) + '/', '') if len(text) > 1 else 'unknown')


def analyse(a, out):
    compilation = json.loads((out / 'compilation.json').read_text())
    for name, expected in compilation['sourceHashes'].items():
        assert sha((HERE / name).read_bytes()) == expected, 'Source changed after blind compilation: ' + name
    package = a.package.read_bytes()
    assert package[:4] == b'MWRM' and struct.unpack_from('>H', package, 4)[0] == 8
    image_size, hooks = struct.unpack_from('>I', package, 8)[0], struct.unpack_from('>I', package, 20)[0]
    image_offset = 76 + hooks * 4
    image = (out / 'module/image.bin').read_bytes()
    assert package[image_offset:image_offset + image_size] == image, 'Debug C image differs from candidate'
    scanner = load('psl_scan_production', ROOT / 'sdk/machines/octatrack/elekloader/module_packages.py')
    stock_free = load('psl_scan_stock_free', ROOT / 'sdk/machines/octatrack/elekloader/check_stock_free.py')
    haystacks = stock_free.haystacks(a.stock, a.upstream)
    stock = dict(haystacks)['MAIN']

    def scan(label, data):
        weighted = scanner.runs(data, stock)
        exact = stock_free.stock_runs({'sections': {'literal': {'parts': [['hex', data.hex()]]}}}, haystacks, 16)
        detailed = exact_runs(data, stock, weighted, scanner)
        for row in detailed:
            address = row['offset'] - image_offset if label == 'package' else row['offset']
            row['imageOffset'] = address
            row['authoredLocation'] = location(out, 'module' if label == 'package' else 'probe', address)
        return dict(weightedRejects=any(value >= scanner.LIMIT for value in weighted.values()),
                    longestWeightedRun=max(weighted.values(), default=0), rejectedSeeds=detailed,
                    sixteenByteScanRejects=bool(exact),
                    sixteenByteMatches=[dict(where=where, offset=offset, bytes=n, stockLocation=source)
                                        for where, offset, n, source in exact])

    package_result = scan('package', package)
    probe = (out / 'probe/image.bin').read_bytes()
    probe_result = scan('probe', probe)
    # Establish the independent probe's relationship to the existing rejection.
    symbols = json.loads((out / 'probe/symbols.json').read_text())
    probe_at = symbols['scanner_abi_probe']
    prologue = probe[probe_at:probe_at + 16]
    original_at = package.find(prologue, image_offset, image_offset + image_size)
    assert original_at >= 0, 'Minimal probe did not reproduce the rejected module sequence'
    assert any(row['offset'] == probe_at and row['bytes'] >= 16 for row in probe_result['sixteenByteMatches'])
    report = dict(schema=1, hardware=False, published=False, packageSha256=sha(package),
                  cDebugBuildMatchesCandidate=True, compilation=compilation,
                  scans={'package': package_result, 'probe': probe_result},
                  abiProbe=dict(imageOffset=probe_at, candidatePackageOffset=original_at, bytes=16,
                                matchSha256=sha(prologue),
                                explanation='Empty compiler barrier emits no inline instructions; GCC generates the ABI frame/register saves and argument loads.'),
                  scannerHashes={str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in
                                 (ROOT / 'sdk/machines/octatrack/elekloader/module_packages.py',
                                  ROOT / 'sdk/machines/octatrack/elekloader/check_stock_free.py')},
                  limitations='Demonstrates coincidental compiler/ABI matches. Scanners, candidate and release verdict remain unchanged; no permission to publish or exception is inferred.')
    write_json(out / 'investigation.json', report)
    print(json.dumps({key: report[key] for key in ('packageSha256', 'cDebugBuildMatchesCandidate', 'abiProbe')}, indent=2))
    for label, result in report['scans'].items():
        print(label, 'weighted rejection:', result['weightedRejects'], '16-byte rejection:', result['sixteenByteScanRejects'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='stage', required=True)
    compile_parser = sub.add_parser('compile', help='run with no stock/reference inputs mounted')
    compile_parser.add_argument('--out', type=Path, required=True)
    analyse_parser = sub.add_parser('analyse', help='scan previously compiled output against private stock')
    analyse_parser.add_argument('--out', type=Path, required=True)
    analyse_parser.add_argument('--package', type=Path, required=True)
    analyse_parser.add_argument('--stock', type=Path, required=True)
    analyse_parser.add_argument('--upstream', type=Path, required=True)
    a = parser.parse_args()
    out = a.out.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Outputs must stay outside Git')
    if a.stage == 'compile':
        compile_sources(out)
    else:
        analyse(a, out)


if __name__ == '__main__':
    main()
