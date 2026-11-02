"""Compile and execute the composed Flex source lock accounting against private stock with the pinned tools.

Original compiled code calls the private stock lookup with synthetic memory, no device access.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--executable', type=Path, required=True)
    p.add_argument('--main', type=Path, required=True)
    a = p.parse_args()
    if sha(a.main) != STOCK_MAIN_SHA256:
        p.error("Expected private original 1.40C MAIN.")
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out == repo or repo in out.parents:
        p.error('Keep binaries outside the repository.')
    out.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location('guard', repo / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    flags = ['-DBS_FLEX_STOCK=1', '-std=c99', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding',
             '-fno-builtin', '-fno-common', '-fno-jump-tables',
             '-fno-tree-loop-distribute-patterns', '-fno-optimize-sibling-calls',
             '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-fno-ident',
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic', *guard.FLAGS]
    objects = []
    for name in ('planner', 'planner_job', 'pcm_reader', 'preview_guard', 'preview_session',
                 'flex_metadata', 'flex_copy', 'flex_source', 'test_flex_source'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    asm = out / 'flex_lookup.o'
    run('m68k-elf-gcc', '-mcpu=5475', '-c', str(ROOT / 'flex_lookup.S'), '-o', str(asm))
    objects.append(asm)
    guard.check(objects)
    elf, binary = out / 'source-lock.elf', out / 'source-lock.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_source_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols = out / 'source-lock.symbols'
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    r = subprocess.run([str(a.executable.resolve()), str(binary), str(symbols), str(a.main.resolve())],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/source_lock_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    from test_flex_source import SOURCES
    names = (*SOURCES, 'flex_lookup.S', 'source_lock_native.py',
             'stock_probe/source_lock_probe.cpp', 'stock_probe/CMakeLists.txt')
    report = {
        'scope': 'compiled composed Flex source lock accounting with real stock page lookup: 32 previews and ten invalidations, plus locked capture/copy and unlocked planner/decode instruction observation; synthetic ownership/identity/regions/tempo',
        'mainSha256': STOCK_MAIN_SHA256,
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'assemblyFlags': ['-mcpu=5475', '-c'],
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'componentSize': run('m68k-elf-size', str(out / 'flex_source.o'), str(out / 'flex_metadata.o'), str(out / 'flex_copy.o'), str(asm)).splitlines(),
        'copyStackUsage': (out / 'flex_copy.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'compiled preview/candidate chain with fixture provider; native lock, complete writer coverage and live admission absent',
    }
    (out / 'source-lock.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
