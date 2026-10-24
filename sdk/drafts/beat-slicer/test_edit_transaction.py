"""Host ASan/UBSan tests of preview-bound edit transactions."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SOURCES = ('planner.c', 'planner.h', 'planner_job.c', 'planner_job.h',
           'pcm_reader.c', 'pcm_reader.h', 'preview_guard.c', 'preview_guard.h',
           'preview_session.c', 'preview_session.h', 'marker_edit.c', 'marker_edit.h', 'edit_candidate.c', 'edit_candidate.h',
           'edit_transaction.c', 'edit_transaction.h', 'test_edit_transaction.c', 'test_edit_transaction.py')
DRIVER = r'''
#include <stdio.h>
int bs_transaction_selftest(void);
int main(void) {
    int line = bs_transaction_selftest();
    if (line) { printf("FAIL line %d\n", line); return 1; }
    puts("PASS: 40 confirmations, 388 publication rollbacks, 386 stale tables, 23 stale metadata cases and fault/lifecycle checks");
    puts("PASS: commit without history: 120 create/clear cycles, 194 internal rollback points, stale-clear refusal, waits/reentry and terminal faults");
    return 0;
}
'''



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error('Use a new evidence path.')
    cc = os.environ.get('CC', 'cc')
    with tempfile.TemporaryDirectory(prefix='beat-slicer-transactions-') as work:
        work = Path(work)
        driver, exe = work / 'main.c', work / 'test-markers'
        driver.write_text(DRIVER)
        flags = ['-std=c99', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-pedantic',
                 '-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run([cc, *flags, '-I', str(ROOT),
                        *[str(ROOT / n) for n in SOURCES if n.endswith('.c')],
                        str(driver), '-o', str(exe)], check=True)
        result = subprocess.run([str(exe)], text=True, capture_output=True, timeout=60)
        print(result.stdout, end='')
        print(result.stderr, end='')
        if args.output:
            report = {
                'scope': 'commit without history and historical Apply/Undo orchestration with a synthetic atomic publication backend; no native transaction or hardware qualification',
                'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in SOURCES},
                'compiler': subprocess.check_output([cc, '--version'], text=True).splitlines()[0],
                'flags': flags, 'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
                'hardware': 'not tested', 'audio': 'not tested', 'nativeSourceAccess': 'not implemented',
            }
            args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
