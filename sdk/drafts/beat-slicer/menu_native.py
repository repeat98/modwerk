"""Compile and execute the native editor-menu selftest against private stock with the pinned tools.

Original compiled code calls the private stock menu routines with synthetic memory, no device access.
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
    flags = ['-std=c99', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding',
             '-fno-builtin', '-fno-common', '-fno-jump-tables',
             '-fno-tree-loop-distribute-patterns', '-fno-optimize-sibling-calls',
             '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-fno-ident',
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic', *guard.FLAGS]
    objects = []
    for name in ('editor_menu', 'test_editor_menu', 'test_menu_stock'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'menu.elf', out / 'menu.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_menu_stock_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    entry, = [line.split()[0] for line in run('m68k-elf-nm', str(elf)).splitlines()
              if line.split()[-1] == 'bs_menu_stock_selftest']
    r = subprocess.run([str(a.executable.resolve()), str(a.main.resolve()), str(binary), '0x' + entry],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/menu_native_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('editor_menu.c', 'editor_menu.h', 'test_editor_menu.c', 'test_menu_stock.c', 'menu_native.py',
             'stock_probe/menu_native_probe.cpp', 'stock_probe/CMakeLists.txt')
    report = {
        'scope': '20 portable menu selections and eight real stock open/select/dispatch cases; UI/drawing/stock action bodies mocked, synthetic ownership/detach',
        'mainSha256': STOCK_MAIN_SHA256,
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'menuSize': run('m68k-elf-size', str(out / 'editor_menu.o')).splitlines(),
        'menuStackUsage': (out / 'editor_menu.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'no installed editor hook, real loader synchronization or native detach proof',
    }
    (out / 'menu.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
