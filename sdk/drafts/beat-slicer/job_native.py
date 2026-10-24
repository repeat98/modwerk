"""Compile and execute the resumable planner's synthetic target selftest.

Use the pinned native image and CPU runner documented in TESTING.md.
No stock firmware, device IO, editor integration or audio rendering.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--executable', type=Path, required=True)
    a = p.parse_args()
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
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic',
             '-DBS_JOB_VECTORS=100', *guard.FLAGS]
    objects = []
    for name in ('planner', 'planner_job', 'test_job'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'job.elf', out / 'job.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_job_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    entry, = [line.split()[0] for line in run('m68k-elf-nm', str(elf)).splitlines()
              if line.split()[-1] == 'bs_job_selftest']
    r = subprocess.run([str(a.executable.resolve()), str(binary), '0x' + entry],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/job_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    report = {
        'scope': 'synthetic cooperative planner target execution, 100 oracle vectors and lifecycle checks',
        'sourceSha256': {n: sha(ROOT / n) for n in ('planner.c', 'planner.h',
                         'planner_job.c', 'planner_job.h', 'test_job.c', 'test_job.py',
                         'job_native.py', 'stock_probe/job_probe.cpp', 'stock_probe/CMakeLists.txt')},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed',
        'freestandingLink': True,
        'plannerJobSize': run('m68k-elf-size', str(out / 'planner_job.o')).splitlines(),
        'plannerJobStackUsage': (out / 'planner_job.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
    }
    (out / 'job.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
