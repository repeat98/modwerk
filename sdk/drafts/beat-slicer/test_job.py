"""Run synthetic cooperative preview tests with host ASan/UBSan.

500 oracle comparisons, pending/stale reads, cancellation and read failures
at every transition of a boundary search. No native editor or audio evidence.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent

def main():
    with tempfile.TemporaryDirectory(prefix='beat-slicer-job-') as work:
        work = Path(work)
        driver = work / 'main.c'
        driver.write_text('#include <stdio.h>\nint bs_job_selftest(void);\n'
                          'int main(void) { int line = bs_job_selftest(); '
                          'if (line) { printf("FAIL line %d\\n", line); return 1; } '
                          'puts("PASS: 500 oracle vectors and cooperative lifecycle checks"); return 0; }\n')
        exe = work / 'test-job'
        subprocess.run([os.environ.get('CC', 'cc'), '-std=c99', '-O1', '-g',
                        '-Wall', '-Wextra', '-Werror', '-pedantic',
                        '-fsanitize=address,undefined', '-fno-omit-frame-pointer',
                        str(ROOT / 'planner.c'), str(ROOT / 'planner_job.c'),
                        str(ROOT / 'test_job.c'), str(driver), '-o', str(exe)], check=True)
        subprocess.run([str(exe)], check=True)


if __name__ == '__main__':
    main()
