#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Private reconstruction experiment; never changes admission or publishes."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import sys

from prepare_beta_candidate import load, run

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REFERENCE = '28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d'
HASH = lambda data: hashlib.sha256(data).hexdigest()
NATIVE = ('translation.c', 'native.c', 'engine.c', 'engine.h', 'ui.c', 'ui.h', 'font.c', 'font.h',
          'unit.s', 'manifest.py', 'runtime.json')


def dump(path, document):
    path.write_text(json.dumps(document, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('out', 'stock', 'upstream', 'reference-package'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--reference-profile', type=Path)
    a = parser.parse_args()
    out = a.out.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Use a new private output outside Git')
    out.mkdir(parents=True, exist_ok=False)
    reference = a.reference_package.read_bytes()
    assert HASH(reference) == REFERENCE, 'Reference package changed'
    builder = load('psl_reconstruction_builder', ROOT / 'sdk/runtime/loader/build.py')
    static = load('psl_reconstruction_parser', ROOT / 'sdk/runtime/loader/verify_static.py')
    guard = load('psl_reconstruction_codegen', ROOT / 'sdk/runtime/m68k_codegen.py')
    adapters = ROOT / 'sdk/machines/octatrack/module-adapters'
    sys.path.insert(0, str(adapters))
    adapter = load('psl_reconstruction_adapter', adapters / 'standalone_runtime.py')
    import firmware_codec as firmware
    firmware.use_elekloader(a.upstream)
    from elekloader import formats
    parsed, device, release = formats.load(str(a.stock))
    stock = formats.main_image(parsed, device)
    assert device.key == 'octatrack' and release.version == '1.40C' and HASH(stock) == release.main_sha256

    def stock_at(address, length):
        at = address - device.main_load
        if at < 0 or length < 0 or at + length > len(stock):
            raise ValueError('Copy source outside stock MAIN')
        return stock[at:at + length]

    image, relocations, sites, old_copies, fills = static.unpack_recipe(reference)
    assert not old_copies and not fills
    work = out / 'audit'
    work.mkdir()
    run(['m68k-elf-gcc', *builder.CFLAGS, *guard.FLAGS, '-c', HERE / 'translation.c', '-o', work / 'source.o'])
    run(['m68k-elf-as', '-mcpu=54455', '--defsym', 'MODWERK_EVENTS=1', HERE / 'unit.s', '-o', work / 'unit.o'])
    for label in ('source', 'unit'):
        folder = work / label
        folder.mkdir()
        result = builder.link_units([work / (label + '.o')], 'm68k-elf-', 0, folder, anywhere=True)
        assert result[0] == image and result[3] == list(relocations)
        assert result[2] == struct.unpack_from('>I', reference, 12)[0]
    guard.check_mcf54455([work / 'source.o', work / 'unit.o'])
    source_paths = [HERE / name for name in NATIVE] + [ROOT / name for name in (
        'sdk/runtime/loader/build.py', 'sdk/runtime/loader/modwerk_module.h',
        'sdk/runtime/m68k_codegen.py', 'sdk/machines/octatrack/module-adapters/standalone_runtime.py',
        'sdk/machines/octatrack/module-adapters/stock_recipe.py',
        'sdk/machines/octatrack/elekloader/runtime.c')]
    inputs = {str(path.relative_to(ROOT)): HASH(path.read_bytes()) for path in source_paths}
    investigation = json.loads((HERE / 'evidence/stock-scan-investigation-20261030.json').read_text())
    seeds = {row['offset']: row for row in investigation['scans']['package']['rejectedSeeds']}
    # Explicit, source-attributed selection. Shorten the first label copy to
    # ten bytes so it ends exactly where the next label copy starts.
    selections = [(854, 13, 'engine.c', [51, 52], 'psl_validate'),
                  (3828, 16, 'ui.c', [149, 150], 'module_enc'),
                  (4080, 12, 'ui.c', [164, 164], 'module_enc'),
                  (4304, 14, 'native.c', [57, 58], 'psl_native_text'),
                  (4562, 15, 'native.c', [79, 79], 'psl_native_part_menu_draw'),
                  (6048, 12, 'native.c', [180, 182], 'psl_native_commit'),
                  (7965, 10, 'ui.c', [21, 22], 'part_rows'),
                  (7975, 15, 'ui.c', [21, 22], 'part_rows')]
    start = 76 + 4 * struct.unpack_from('>I', reference, 20)[0]
    glue = (ROOT / 'sdk/machines/octatrack/elekloader/runtime.c').read_text()
    stock_from, stock_end = [int(re.search(r'#define '+name+r' (0x[0-9a-f]+)u', glue)[1], 16)
                             for name in ('STOCK_FROM', 'BOOTLOADER_FROM')]
    base_doc = json.loads((ROOT / 'src/engine/assets/octatrack-base.elemod').read_text())
    blocked = [(int(row['addr'], 16), row['len']) for row in base_doc['sites']]
    native_doc = json.loads((ROOT / 'src/engine/assets/requested-packages.json').read_text())
    for group in native_doc['groups']:
        blocked += [(row['address'], row['guardLength']) for kind in ('detours', 'refs', 'pokes') for row in group.get(kind, [])]
        blocked += [(row['address'], 4) for table in group.get('tables', []) for row in table['refs']]
    manifest = json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())
    for entry in manifest['packages']:
        _, _, other_sites, _, _ = static.unpack_recipe((ROOT / 'public' / entry['path']).read_bytes())
        blocked += [(row[0], max(len(row[2]), row[5] if len(row) > 5 else len(row[1]))) for row in other_sites]
    def permitted(address, length):
        return (stock_from <= address and address + length <= stock_end and
                not any(address < at + n and at < address + length for at, n in blocked))
    def alternate(span):
        at = stock_from - device.main_load
        while True:
            at = stock.find(span, at, stock_end - device.main_load)
            if at < 0:
                raise ValueError('No permitted reconstruction source for this authored slice')
            if permitted(device.main_load + at, len(span)):
                return device.main_load + at
            at += 1
    records = []
    for package_at, length, source, lines, symbol in selections:
        row = seeds[package_at]
        at = package_at - start
        address = device.main_load + row['stockOffset']
        assert stock_at(address, length) == image[at:at + length]
        # The unique 16-byte prologue also occurs in protected bootloader
        # storage. Use two independently guarded eight-byte sources in ordinary
        # patchable OS memory, preserving the same authored destination bytes.
        slices = [(0, length)] if permitted(address, length) else [(0, 8), (8, length - 8)]
        for delta, n in slices:
            span = image[at + delta:at + delta + n]
            origin = address if delta == 0 and len(slices) == 1 else alternate(span)
            assert permitted(origin, n) and stock_at(origin, n) == span
            records.append(dict(offset=at + delta, length=n, address=origin, sha256=HASH(span),
                                purpose='Independently compiled authored coincidence; reconstruct the unchanged runtime image',
                                authored=dict(source=str((HERE / source).relative_to(ROOT)), lines=lines,
                                              symbol=symbol, method='native-unit')))
    recipe = dict(schema=1, imageSha256=HASH(image), sources=inputs, copies=records, fills=[])
    masked, copies = adapter.apply(image, relocations, recipe, inputs, ROOT, stock_at)
    assert adapter.apply(image, relocations, recipe, inputs, ROOT, None) == (masked, copies)
    dump(out / 'candidate-recipe.json', recipe)

    rejected = []
    def refuse(name, change=None, changed_image=None, changed_inputs=None, reader=stock_at, changed_relocations=None):
        bad = copy.deepcopy(recipe)
        if change:
            change(bad)
        try:
            adapter.apply(image if changed_image is None else changed_image,
                          relocations if changed_relocations is None else changed_relocations,
                          bad, inputs if changed_inputs is None else changed_inputs, ROOT, reader)
        except ValueError as error:
            rejected.append(dict(case=name, reason=str(error)))
        else:
            raise AssertionError('Invalid reconstruction accepted: ' + name)
    refuse('changed source inputs', changed_inputs={**inputs, next(iter(inputs)): '0' * 64})
    changed = bytearray(image); changed[0] ^= 1
    refuse('changed compiled image', changed_image=bytes(changed))
    refuse('wrong span hash', lambda r: r['copies'][0].update(sha256='0' * 64))
    refuse('changed stock bytes', reader=lambda address, n: bytes([stock_at(address, n)[0] ^ 1]) + stock_at(address, n)[1:])
    refuse('overlapping copies', lambda r: r['copies'].append(copy.deepcopy(r['copies'][0])))
    refuse('relocation overlap', changed_relocations=[records[0]['offset']])
    refuse('copy outside image', lambda r: r['copies'][0].update(offset=len(image)))
    refuse('oversized copy', lambda r: r['copies'][0].update(length=33))
    refuse('invalid source address', lambda r: r['copies'][0].update(address=0x100000000))
    refuse('missing authored provenance', lambda r: r['copies'][0]['authored'].update(symbol=''))
    refuse('undeclared initializer fill', lambda r: r['fills'].append(dict(offset=0, length=1, value=1)))
    source_key = records[0]['authored']['source']
    def wrong_file(r):
        r['sources'][source_key] = '0' * 64
    refuse('authored file hash mismatch', wrong_file, changed_inputs={**inputs, source_key: '0' * 64})

    hooks = struct.unpack_from('>%dI' % struct.unpack_from('>I', reference, 20)[0], reference, 76)
    flags = struct.unpack_from('>H', reference, 6)[0]
    bss = struct.unpack_from('>I', reference, 12)[0]
    title = reference[50:66].split(b'\0')[0].decode('ascii')
    layout = struct.unpack_from('>H', reference, 66)[0]
    package = builder.package(masked, bss, hooks, relocations, sites, name='pattern-sample-locks',
                              flags=flags, hashed=True, title=title, layout=layout, copies=copies, abi=8)
    actual, offsets, new_sites, new_copies, new_fills = static.unpack_recipe(package)
    assert offsets == relocations and new_sites == sites and new_copies == copies and not new_fills
    restored = bytearray(actual)
    for at, address, n, digest in new_copies:
        span = stock_at(address, n)
        assert HASH(span) == digest.hex() and not any(restored[at:at + n])
        restored[at:at + n] = span
    assert bytes(restored) == image
    for base in (0x41000000, 0x41003080, 0x42000000):
        assert static.placed(restored, offsets, base) == static.placed(image, relocations, base)
    scanner = load('psl_reconstruction_scans', ROOT / 'sdk/machines/octatrack/elekloader/module_packages.py')
    strict = load('psl_reconstruction_strict', ROOT / 'sdk/machines/octatrack/elekloader/check_stock_free.py')
    longest = max((n for view in [package, *scanner.dsp_words(package)] for n in scanner.runs(view, stock).values()), default=0)
    strict_hits = strict.stock_runs({'sections': {'package': {'parts': [['hex', package.hex()]]}}},
                                    strict.haystacks(a.stock, a.upstream), 16)
    assert longest < scanner.LIMIT and not strict_hits, 'Unchanged strict scanner rejected candidate'
    name = 'pattern-sample-locks-0.1.8-candidate.mwrm'
    (out / name).write_bytes(package)
    entry = dict(id='pattern-sample-locks', version='0.1.8-experimental', name=title, octabam=True,
                 bytes=len(package), sha256=HASH(package), path=name, **scanner.capabilities(package))
    dump(out / 'candidate-manifest.json', dict(schema=1, packages=[entry]))
    if a.reference_profile:
        profile = json.loads(a.reference_profile.read_text())
        assert profile['packageSha256'] == REFERENCE and profile['phaseAssemblySha256'] == HASH((HERE / 'unit.s').read_bytes())
        profile.update(referencePackageSha256=REFERENCE, packageSha256=HASH(package),
                       profileImageBinding='Unchanged image proven by reconstruction and mandatory full live-image attestation')
        dump(out / 'profile-symbols.json', profile)
    # Valid-size but malicious records for browser and actual native-loader refusal.
    copy_start = start + len(image) + 4 * len(relocations) + sum(40 + len(row[2]) + 2 * len(row[3]) for row in sites)
    variants = []
    def variant(label, mutate, runtime_refusal):
        data = bytearray(package); mutate(data)
        filename = label + '.private.mwrm'; (out / filename).write_bytes(data)
        variants.append(dict(case=label, file=filename, runtimeRefusal=runtime_refusal, sha256=HASH(data)))
    variant('wrong-stock-hash', lambda d: d.__setitem__(copy_start + 12, d[copy_start + 12] ^ 1), 8)
    variant('nonzero-placeholder', lambda d: d.__setitem__(start + records[0]['offset'], 1), 1)
    def overlap(d):
        struct.pack_into('>I', d, copy_start + 44, records[0]['offset'])
        struct.pack_into('>H', d, copy_start + 44 + 8, records[0]['length'])
    variant('overlapping-copy', overlap, 1)
    variant('relocation-overlap', lambda d: struct.pack_into('>I', d, copy_start, relocations[0]), 1)
    variant('invalid-stock-address', lambda d: struct.pack_into('>I', d, copy_start + 4, 0), 1)
    variant('zero-copy-length', lambda d: struct.pack_into('>H', d, copy_start + 8, 0), 1)
    dump(out / 'negative-packages.json', variants)
    # Reuse independent GNU link oracles for component parity; only package
    # literal reconstruction changed, so these object/oracle inputs stay valid.
    report = dict(hardware=False, published=False, admittedToPublicBuilder=False, referencePackageSha256=REFERENCE,
                  candidatePackageSha256=HASH(package), packageBytes=len(package), initializedBytes=len(image), bssBytes=bss,
                  reconstructedBytes=sum(row['length'] for row in records), copyCount=len(copies),
                  nativeCopySourceBounds=dict(start=stock_from, endExclusive=stock_end),
                  cAndAssemblyMatchReference=True, exactImageReconstruction=True, relocationCases=3,
                  weightedScan=dict(longest=longest, failAt=scanner.LIMIT, passed=True), sixteenByteScanPassed=True,
                  recipeRejections=rejected, negativePackages=variants, helperSha256=HASH(Path(__file__).read_bytes()),
                  sourceHashes=inputs, sourceCheckpoint='bc11ad94',
                  limitations='Private direct use of unchanged adapter and package APIs. No production admission, card integration, hardware timing or total-stack qualification.')
    dump(out / 'reconstruction.json', report)
    print(json.dumps({k: report[k] for k in ('candidatePackageSha256', 'packageBytes', 'copyCount', 'reconstructedBytes',
                                          'exactImageReconstruction', 'weightedScan', 'sixteenByteScanPassed')}, indent=2))


if __name__ == '__main__':
    main()
