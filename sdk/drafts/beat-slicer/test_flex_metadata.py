"""Host ASan/UBSan tests of bounded Flex metadata capture with synthetic bindings."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SOURCES = ('flex_metadata.c', 'flex_metadata.h', 'planner.c', 'planner_job.c',
             'pcm_reader.c', 'preview_guard.c', 'preview_session.c', 'marker_edit.c',
             'edit_candidate.c', 'edit_candidate.h', 'marker_edit.h', 'preview_session.h',
           'preview_guard.h', 'pcm_reader.h', 'planner_job.h', 'planner.h',
           'test_flex_metadata.c', 'test_flex_metadata.py')
DRIVER = r'''
#include <stdio.h>
int bs_metadata_selftest(void);
int main(void) {
    int line = bs_metadata_selftest();
    if (line) { printf("FAIL line %d\n", line); return 1; }
    puts("PASS: 1536 full metadata/table captures, 39 paired refusals, null outputs, 40 session transitions and two inactive-record candidate refusals");
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
    with tempfile.TemporaryDirectory(prefix='beat-slicer-metadata-') as work:
        work = Path(work)
        driver, exe = work / 'main.c', work / 'test-metadata'
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
                'scope': 'Flex metadata decoder with synthetic bindings/lifetimes; no native locking or source admission',
                'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in SOURCES},
                'compiler': subprocess.check_output([cc, '--version'], text=True).splitlines()[0],
                'flags': flags, 'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
                'hardware': 'not tested', 'audio': 'not tested', 'nativeSourceAccess': 'not implemented',
            }
            args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
