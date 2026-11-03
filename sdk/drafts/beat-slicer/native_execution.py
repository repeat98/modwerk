"""Run the compiled planner in synthetic CPU memory; no stock OS or device IO.

First run native_probe.py into a fresh directory. This script verifies that
receipt and relinks its object at a synthetic emulator address. CPU execution
proves neither on-device timing nor an editor adapter nor audible smoothing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--compiled', type=Path, required=True)
    p.add_argument('--executable', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    repo = ROOT.parents[2]
    destination = a.output.resolve()
    if destination == repo or repo in destination.parents:
        p.error('Keep compiled execution artifacts outside the repository.')
    compile_report = json.loads((a.compiled / 'native.json').read_text())
    obj = a.compiled / 'planner.o'
    if (digest(obj) != compile_report['objectSha256'] or
            any(digest(ROOT / n) != h for n, h in compile_report['sourceSha256'].items()) or
            compile_report['undefinedSymbols'] or not compile_report['freestandingLink']):
        p.error('Native object/receipt/source mismatch; rebuild before executing.')
    a.output.mkdir(parents=True, exist_ok=False)
    elf, binary = a.output / 'synthetic.elf', a.output / 'synthetic.bin'
    subprocess.run(['m68k-elf-ld', '--no-undefined', '-e', 'bs_preview', '-Ttext=0x47040000',
                    str(obj), '-o', str(elf)], check=True)
    subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary)], check=True)
    symbols = subprocess.check_output(['m68k-elf-nm', str(elf)], text=True).splitlines()
    entry, = [int(line.split()[0], 16) for line in symbols if line.split()[-1] == 'bs_preview']
    r = subprocess.run([str(a.executable.resolve()), str(binary.resolve()), hex(entry)],
                       capture_output=True, text=True)
    if 'SOURCE_SHA256: ' + digest(ROOT / 'stock_probe/planner_probe.cpp') not in r.stdout.splitlines():
        p.error('CPU runner executable differs from current source; rebuild it.')
    report = {
        'scope': 'compiled ColdFire planner executed in synthetic CPU memory; no stock OS or device access',
        'objectSha256': digest(obj), 'runnerSha256': digest(a.executable),
        'sourceSha256': {n: digest(ROOT / n) for n in ('planner.c', 'planner.h',
                         'native_execution.py', 'stock_probe/planner_probe.cpp')},
        'exitCode': r.returncode, 'stdout': r.stdout.splitlines(),
        'stderrLines': len(r.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(r.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'timing': 'not measured',
    }
    (a.output / 'execution.json').write_text(json.dumps(report, indent=2) + '\n')
    print(r.stdout, end='')
    if r.returncode:
        print(r.stderr, end='')
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
