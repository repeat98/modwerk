"""Compile and execute the Flex Apply/Undo fixture against private stock with the pinned tools.

Original compiled code calls stock lookup and editor refresh with synthetic memory, no device access.
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
                 'marker_edit', 'edit_candidate', 'edit_transaction', 'flex_copy', 'test_flex_copy', 'test_flex_chain', 'test_transaction_stock'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    asm = out / 'flex_lookup.o'
    run('m68k-elf-gcc', '-mcpu=5475', '-c', str(ROOT / 'flex_lookup.S'), '-o', str(asm))
    objects.append(asm)
    guard.check(objects)
    elf, binary = out / 'transaction-stock.elf', out / 'transaction-stock.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_transaction_stock_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    entry, = [line.split()[0] for line in run('m68k-elf-nm', str(elf)).splitlines()
              if line.split()[-1] == 'bs_transaction_stock_selftest']
    r = subprocess.run([str(a.executable.resolve()), str(a.main.resolve()), str(binary), '0x' + entry],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/transaction_native_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('planner.c', 'planner.h', 'planner_job.c', 'planner_job.h',
             'pcm_reader.c', 'preview_guard.c', 'preview_session.c', 'marker_edit.c',
             'marker_edit.h', 'edit_transaction.c', 'edit_transaction.h', 'edit_candidate.c', 'edit_candidate.h', 'flex_copy.c', 'flex_copy.h', 'flex_lookup.S', 'preview_session.h',
             'preview_guard.h', 'pcm_reader.h',
             'test_flex_fixture.h', 'test_chain_fixture.h', 'test_flex_copy.c', 'test_flex_chain.c', 'test_transaction_stock.c', 'transaction_stock_native.py', 'stock_probe/transaction_native_probe.cpp',
             'stock_probe/CMakeLists.txt')
    report = {
        'scope': 'compiled Flex chain: 32 historical Apply/Undo pairs, 64 commit/clear cycles without history, 12 rollback cases and 300 stock refreshes; synthetic ownership/publication/clear/playback, no live transaction',
        'mainSha256': STOCK_MAIN_SHA256,
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'assemblyFlags': ['-mcpu=5475', '-c'],
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'copySize': run('m68k-elf-size', str(out / 'flex_copy.o'), str(asm)).splitlines(),
        'copyStackUsage': (out / 'flex_copy.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'compiled transaction chain with fixture publisher and real editor refresh; live lock, complete writer coverage, audio and native atomicity absent',
    }
    (out / 'transaction-stock.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
