"""Host ASan/UBSan tests of resident selection-context authority."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SOURCES = ('selection_context.c', 'selection_context.h', 'editor_menu.h', 'test_selection_context.c', 'test_selection_context.py')
DRIVER = r'''
#include <stdio.h>
int bs_selection_selftest(void);
int main(void) {
    int line = bs_selection_selftest();
    if (line) { printf("FAIL line %d\n", line); return 1; }
    puts("PASS: 200 repeated context lifetimes, direct/late/duplicate callback refusal, exact task/table/row/owner/epoch binding, blocked selection and serial exhaustion");
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
    with tempfile.TemporaryDirectory(prefix='beat-slicer-selection-') as work:
        work = Path(work)
        driver, exe = work / 'main.c', work / 'test-selection'
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
                'scope': 'portable resident selection-context checks; serialized trusted adapter model, not actual native dispatch or loader lifetime',
                'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in SOURCES},
                'compiler': subprocess.check_output([cc, '--version'], text=True).splitlines()[0],
                'flags': flags, 'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
                'hardware': 'not tested', 'audio': 'not tested', 'nativeSourceAccess': 'not implemented',
            }
            args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
