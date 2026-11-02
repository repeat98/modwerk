"""Measure compiled preview service instructions with an original synthetic backend.

Counts distinguish service work and ownership sections; they are not cycles or hardware time.
"""
import argparse
import hashlib
import importlib.util
import json
import re
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
    p.add_argument('--budget', type=int, choices=(1,2,4,8), default=1)
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
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic', f'-DBS_COST_BUDGET={a.budget}', *guard.FLAGS]
    objects = []
    for name in ('planner', 'planner_job', 'pcm_reader', 'preview_guard', 'preview_session', 'preview_async', 'test_preview_cost'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'cost.elf', out / 'cost.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_cost_run', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols = out / 'cost.symbols'
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    r = subprocess.run([str(a.executable.resolve()), str(binary), str(symbols)],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/preview_cost_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('planner.c', 'planner.h', 'planner_job.c', 'planner_job.h',
             'pcm_reader.c', 'pcm_reader.h', 'preview_guard.c', 'preview_guard.h',
             'preview_session.c', 'preview_session.h', 'preview_async.c', 'preview_async.h', 'test_preview_cost.c', 'preview_cost_native.py',
             'stock_probe/preview_cost_probe.cpp', 'stock_probe/CMakeLists.txt')
    private_steps = int(re.search(r'^#define BS_ASYNC_PRIVATE_STEPS (\d+)u$', (ROOT/'preview_async.h').read_text(), re.MULTILINE).group(1))
    report = {
        'serviceBudget': a.budget, 'privateStepsPerWork': private_steps,
        'scope': 'Sixteen compiled one/thirty-second synthetic previews: exact executed service/lock instructions, complete direct-planner equality and positive-control counters. Provider copies authored PCM with modeled 1536-frame page breaks; not stock metadata, cache, scheduler, cycles or hardware timing',
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'workUnit': 'explicitSteps counts work calls, each bounded by privateStepsPerWork and at most one live PCM copy; begin/setup and result publication are separate',
        'sessionSize': run('m68k-elf-size', str(out / 'preview_session.o')).splitlines(),
        'sessionStackUsage': (out / 'preview_session.su').read_text().splitlines(),
        'exchangeSize': run('m68k-elf-size', str(out / 'preview_async.o')).splitlines(),
        'exchangeStackUsage': (out / 'preview_async.su').read_text().splitlines(),
        'cases': [json.loads(line[5:]) for line in r.stdout.splitlines() if line.startswith('CASE ')],
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'physical time and cycles not measured; synthetic executed-instruction counts only',
        'nativeSourceAccess': 'not implemented',
    }
    (out / 'preview-cost.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
