"""Compile the original read-only source-preview full-boot test fixture.

Outputs stay private; this installs no runtime ABI or live source provider.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from inspect_stock import STOCK_MAIN_SHA256
import subprocess

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    text_base = 0x46019df0
    p.add_argument('--main', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    if sha(a.main) != STOCK_MAIN_SHA256:
        p.error('Private stock MAIN identity differs.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out == repo or repo in out.parents:
        p.error('Keep binaries outside the repository.')
    out.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location('guard', repo / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    flags = ['-std=c99', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding',
             '-fno-builtin', '-fno-common', '-fno-jump-tables',
             '-fno-tree-loop-distribute-patterns', '-fno-optimize-sibling-calls',
             '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-fno-ident',
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic', *guard.FLAGS]
    objects = []
    for name in ('preview_guard', 'worker_boundary', 'test_worker_stock', 'planner', 'planner_job',
                 'pcm_reader', 'preview_session', 'flex_metadata', 'flex_copy', 'flex_source', 'test_source_boot'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    asm = out / 'flex_lookup.o'
    run('m68k-elf-gcc', '-mcpu=5475', '-c', str(ROOT / 'flex_lookup.S'), '-o', str(asm))
    objects.append(asm)
    guard.check(objects)
    elf, binary = out / 'source-boot.elf', out / 'source-boot.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_worker_test_init', '-Ttext=' + hex(text_base),
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols = out / 'source-boot.symbols'
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    from test_flex_source import SOURCES
    names = (*[n for n in SOURCES if not n.startswith('test_')],
             'worker_boundary.c', 'worker_boundary.h', 'test_worker_stock.c',
             'test_source_boot.c', 'test_flex_source.py', 'source_boot_native.py', 'flex_lookup.S', 'inspect_stock.py')
    end = [int(line.split()[0], 16) for line in symbols.read_text().splitlines() if line.split()[-1] == '_end'][0]
    if end + 32 > 0x46025de0:
        p.error('Fixture and canary do not fit the explicit eight-page reservation.')
    report = {
        'scope': 'Compiled original full-boot read-only preview fixture; compilation only, not execution',
        'mainSha256': STOCK_MAIN_SHA256,
        'textBase': text_base, 'binarySha256': sha(binary), 'symbolsSha256': sha(symbols),
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'codegenGuard': 'passed', 'freestandingLink': True, 'fixtureEnd': end,
        'boundarySize': run('m68k-elf-size', str(out / 'worker_boundary.o')).splitlines(),
        'boundaryStackUsage': (out / 'worker_boundary.su').read_text().splitlines(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'fixture compiled only; live service not implemented',
    }
    (out / 'source-boot.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Compiled original full-boot fixture; execution remains separate.')


if __name__ == '__main__':
    main()
