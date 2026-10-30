"""Compile the command observer and execute queued recorder-stop follow-ups.

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
    p.add_argument('--text-base', type=lambda x: int(x, 0), default=0x47040000)
    p.add_argument('--main', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--executable', type=Path, required=True)
    a = p.parse_args()
    if sha(a.main) != STOCK_MAIN_SHA256:
        p.error('Private stock MAIN identity differs.')
    if a.text_base != 0x47040000:
        p.error('Only isolated fixture placement is supported.')
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
    for name in ('preview_guard', 'worker_boundary', 'test_worker_stock'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'worker.elf', out / 'worker.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_worker_test_init', '-Ttext=' + hex(a.text_base),
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols = out / 'worker.symbols'
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    r = subprocess.run([str(a.executable.resolve()), str(a.main.resolve()), str(binary), str(symbols)],
                       text=True, capture_output=True, timeout=600)
    runner_inputs = ('recorder_followup_probe.cpp', 'recorder_probe.cpp', '../preview_guard.c', '../preview_guard.h')
    binding = ''.join(n + ':' + sha(ROOT / 'stock_probe' / n) + '\n' for n in runner_inputs)
    if 'SOURCE_SHA256: ' + hashlib.sha256(binding.encode()).hexdigest() not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('worker_boundary.c', 'worker_boundary.h', 'preview_guard.c', 'preview_guard.h',
             'test_worker_stock.c', 'recorder_followup_native.py', 'stock_probe/recorder_followup_probe.cpp',
             'stock_probe/recorder_probe.cpp', 'stock_probe/CMakeLists.txt', 'inspect_stock.py')
    report = {
        'scope': 'Compiled command observer around real queued recorder-stop follow-ups; 16 silent synthetic-active recorder positive controls and 32 single follow-ups plus four paired-recorder FIFO cases; no mocks, scheduler, ISR, UI consumer, manual stop/overdub, native source admission or hardware',
        'mainSha256': STOCK_MAIN_SHA256,
        'recorderPositiveControls':16,'followupCases':32,'pairedRecorderCases':4,
        'codegenGuardSha256':sha(repo/'sdk/runtime/m68k_codegen.py'),
        'sdkRevision':'c8fcb8054b10366b3a7881ec957a566460aab3d4',
        'sdkDependencySha256':{'sdk/runtime/m68k_codegen.py':sha(repo/'sdk/runtime/m68k_codegen.py')},
        'textBase': a.text_base, 'binarySha256': sha(binary), 'symbolsSha256': sha(symbols),
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'boundarySize': run('m68k-elf-size', str(out / 'worker_boundary.o')).splitlines(),
        'boundaryStackUsage': (out / 'worker_boundary.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'not implemented',
    }
    (out / 'recorder-followup.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
