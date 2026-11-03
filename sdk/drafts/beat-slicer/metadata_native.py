"""Compile and execute the synthetic Flex metadata selftest with the pinned tools.

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
    objects = []
    for name in ('planner', 'planner_job', 'pcm_reader', 'preview_guard', 'preview_session',
                 'marker_edit', 'edit_candidate', 'flex_metadata', 'test_flex_metadata'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *flags, '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        objects.append(obj)
    guard.check(objects)
    elf, binary = out / 'metadata.elf', out / 'metadata.bin'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_metadata_selftest', '-Ttext=0x47040000',
        *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    entry, = [line.split()[0] for line in run('m68k-elf-nm', str(elf)).splitlines()
              if line.split()[-1] == 'bs_metadata_selftest']
    r = subprocess.run([str(a.executable.resolve()), str(binary), '0x' + entry],
                       text=True, capture_output=True, timeout=600)
    if 'SOURCE_SHA256: ' + sha(ROOT / 'stock_probe/job_probe.cpp') not in r.stdout.splitlines():
        p.error('Runner differs from current source; rebuild it.')
    names = ('flex_metadata.c', 'flex_metadata.h', 'planner.c', 'planner_job.c',
             'pcm_reader.c', 'preview_guard.c', 'preview_session.c', 'marker_edit.c',
             'edit_candidate.c', 'edit_candidate.h', 'marker_edit.h', 'preview_session.h',
             'preview_guard.h', 'pcm_reader.h', 'planner_job.h', 'planner.h',
             'test_flex_metadata.c', 'metadata_native.py',
             'stock_probe/job_probe.cpp', 'stock_probe/CMakeLists.txt')
    report = {
        'scope': 'Flex metadata target execution: 1536 complete captures, 39 paired refusals, null outputs, 40 session transitions and two inactive-record candidate refusals; synthetic bindings/lifetimes',
        'sourceSha256': {n: sha(ROOT / n) for n in names},
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0], 'flags': flags,
        'objectSha256': {o.name: sha(o) for o in objects},
        'runnerSha256': sha(a.executable), 'codegenGuard': 'passed', 'freestandingLink': True,
        'metadataSize': run('m68k-elf-size', str(out / 'flex_metadata.o')).splitlines(),
        'metadataStackUsage': (out / 'flex_metadata.su').read_text().splitlines(),
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
        'nativeSourceAccess': 'not implemented',
    }
    (out / 'metadata.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
