"""Host ASan/UBSan tests of copied UI intents and engine-owned preview publication."""
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
           'preview_session.c', 'preview_session.h', 'preview_async.c', 'preview_async.h', 'test_preview_async.c', 'test_preview_async.py')
DRIVER = r'''
#include <stdio.h>
int bs_async_selftest(void);
int main(void) {
    int line = bs_async_selftest();
    if (line) { printf("FAIL line %d\n", line); return 1; }
    puts("PASS: 32 complete previews, 72 cancel/replace/revoke/reentry/lock-refusal/publication interleavings, waiting/readiness, stale publication and sequence exhaustion");
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
    with tempfile.TemporaryDirectory(prefix='beat-slicer-async-') as work:
        work = Path(work)
        driver, exe = work / 'main.c', work / 'test-async'
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
                'scope': 'portable copied UI/engine exchange with modeled serialized interleavings; no native task/source access',
                'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in SOURCES},
                'compiler': subprocess.check_output([cc, '--version'], text=True).splitlines()[0],
                'flags': flags, 'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
                'hardware': 'not tested', 'audio': 'not tested', 'nativeSourceAccess': 'not implemented',
            }
            args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
