"""Compile and execute the preview-bound edit-transaction selftest with the pinned tools.

Reuse the source-bound stock-free CPU runner from job_native.py; no firmware IO.
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
             '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic', *guard.FLAGS]
    # Target layout, not host-pointer sizes. These arrays only encode sizeof
    # for nm; they are never linked into the executable or firmware.
    layout = out / 'layout.c'
    types = ('bs_preview_guard', 'bs_preview_session', 'bs_edit_candidate', 'bs_edit_transaction')
    layout.write_text('#include "edit_transaction.h"\n' + ''.join(
        'char layout_' + name + '[sizeof(struct ' + name + ')];\n' for name in types))
    layout_obj = out / 'layout.o'
    run('m68k-elf-gcc', *flags, '-I', str(ROOT), '-c', str(layout), '-o', str(layout_obj))
    sizes = {parts[3][7:]: int(parts[1], 16)
             for line in run('m68k-elf-nm', '-S', str(layout_obj)).splitlines()
             if len(parts := line.split()) == 4 and parts[3].startswith('layout_')}
    if set(sizes) != set(types):
        p.error('Target layout symbols missing.')
    objects = []
    for name in ('planner', 'planner_job', 'pcm_reader', 'preview_guard', 'preview_session', 'marker_edit', 'edit_candidate', 'edit_transaction', 'test_edit_transaction'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'transaction.elf', out / 'transaction.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_transaction_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    entry, = [line.split()[0] for line in run('m68k-elf-nm', str(elf)).splitlines()
              if line.split()[-1] == 'bs_transaction_selftest']
    r = subprocess.run([str(a.executable.resolve()), str(binary), '0x' + entry],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/job_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('planner.c', 'planner.h', 'planner_job.c', 'planner_job.h',
             'pcm_reader.c', 'pcm_reader.h', 'preview_guard.c', 'preview_guard.h',
             'preview_session.c', 'preview_session.h', 'marker_edit.c', 'marker_edit.h', 'edit_candidate.c', 'edit_candidate.h', 'edit_transaction.c', 'edit_transaction.h',
             'test_edit_transaction.c', 'transaction_native.py',
             'stock_probe/job_probe.cpp', 'stock_probe/CMakeLists.txt')
    report = {
        'scope': 'commit without history: 120 create/clear cycles, 194 rollback points and failure/stale lifecycle checks; historical Apply/Undo regression: 40 confirmations, 388 rollbacks, 386 stale tables and 23 metadata cases',
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'callerOwnedBytes': sizes, 'callerOwnedTotalBytes': sum(sizes.values()),
        'storageLimit': 'excludes native backend, menu, allocator, stack, code and PCM pool; not a qualified RAM placement',
        'transactionSize': run('m68k-elf-size', str(out / 'edit_transaction.o')).splitlines(),
        'transactionStackUsage': (out / 'edit_transaction.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'not implemented',
    }
    (out / 'transaction.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
