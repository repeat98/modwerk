"""Compile the portable planner only; no firmware, package, or device access.

Run inside the pinned sdk/build/Dockerfile image, with this checkout mounted
read-only at /source and a private output directory mounted at /output:
    python3 -B sdk/drafts/beat-slicer/native_probe.py --output /output
An object is not an installable module or execution/performance evidence.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    if out == REPO or REPO in out.parents:
        parser.error('Keep compilation output outside the repository.')
    out.mkdir(parents=True, exist_ok=True)
    obj = out / 'planner.o'
    if obj.exists() or (out / 'native.json').exists():
        parser.error('Use a fresh output directory; do not overwrite evidence.')
    spec = importlib.util.spec_from_file_location('m68k_codegen', REPO / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    flags = ['-std=c99', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding',
             '-fno-builtin', '-fno-common', '-fno-jump-tables',
             '-fno-tree-loop-distribute-patterns',
             '-fno-optimize-sibling-calls', '-fno-asynchronous-unwind-tables',
             '-fno-unwind-tables', '-fno-ident', '-fstack-usage',
             '-Wall', '-Wextra', '-Werror', '-pedantic', *guard.FLAGS]
    run('m68k-elf-gcc', *flags, '-c', str(ROOT / 'planner.c'), '-o', str(obj))
    guard.check([obj])
    undefined = run('m68k-elf-nm', '-u', str(obj)).splitlines()
    linked = False
    if not undefined:
        # Synthetic address, for link closure only; never an instrument address.
        run('m68k-elf-ld', '--no-undefined', '-e', 'bs_preview', '-Ttext=0',
            str(obj), '-o', str(out / 'planner.elf'))
        linked = True
    report = {
        'scope': 'ColdFire object compilation only; no native execution, adapter or package',
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0],
        'assembler': run('m68k-elf-as', '--version').splitlines()[0],
        'flags': flags,
        'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest()
                         for n in ('planner.c', 'planner.h', 'native_probe.py')},
        'objectSha256': hashlib.sha256(obj.read_bytes()).hexdigest(),
        'size': run('m68k-elf-size', str(obj)).splitlines(),
        'stackUsage': (out / 'planner.su').read_text().splitlines(),
        'codegenGuard': 'passed', 'undefinedSymbols': undefined,
        'freestandingLink': linked,
        'hardware': 'not tested', 'audio': 'not tested',
    }
    (out / 'native.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if undefined:
        raise SystemExit('Unresolved runtime helpers: adapter/link integration remains blocked.')


if __name__ == '__main__':
    main()
