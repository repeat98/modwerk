"""Host ASan/UBSan tests, including exact-sized, unaligned packed PCM buffers."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SOURCES = ('planner.c', 'planner.h', 'planner_job.c', 'planner_job.h',
           'pcm_reader.c', 'pcm_reader.h', 'test_pcm_reader.c', 'test_pcm_reader.py')
DRIVER = r'''
#include "pcm_reader.h"
#include <stdio.h>
#include <stdlib.h>
int bs_reader_selftest(void);
int main(void) {
    int line = bs_reader_selftest();
    if (line) { printf("FAIL line %d\n", line); return 1; }
    for (unsigned bits = 16; bits <= 24; bits += 8)
    for (unsigned channels = 1; channels <= 2; ++channels)
    for (unsigned little = 0; little <= 1; ++little)
    for (unsigned frames = 1; frames <= BS_PCM_BLOCK_FRAMES; ++frames) {
        unsigned width = bits / 8 * channels, size = frames * width;
        unsigned char *allocation = malloc(size + 1), *bytes;
        struct bs_pcm_source source = {1, 2, 100, {bits, channels, little}};
        struct bs_request q = {8000, 0, 100, 2880, 2160, 1, 0, 0, NULL, 0, NULL, NULL};
        struct bs_pcm_reader reader;
        int32_t pcm[2];
        if (!allocation) return 2;
        bytes = allocation + 1; /* unaligned; final byte abuts the ASan redzone */
        for (unsigned i = 0; i < size; ++i) bytes[i] = (unsigned char)(i*37);
        if (!bs_pcm_decode(&source.format, bytes + size-width, width, pcm)) return 3;
        if (bs_reader_begin(&reader, &q, &source) != BS_READER_RUNNING) return 4;
        while (bs_reader_step(&reader, 2) != BS_READER_NEED_BLOCK) {}
        if (!bs_reader_supply(&reader, &reader.pending, bytes, size, 0)) return 5;
        free(allocation);
        if (bs_reader_step(&reader, 2) != BS_READER_RUNNING) return 6;
    }
    puts("PASS: 4160 decoder vectors, 40 paged previews, lifecycle checks and 256 exact-buffer ASan cases");
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
    with tempfile.TemporaryDirectory(prefix='beat-slicer-pcm-') as work:
        work = Path(work)
        driver, exe = work / 'main.c', work / 'test-pcm'
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
                'scope': 'portable staged PCM reader; synthetic host execution only',
                'sourceSha256': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in SOURCES},
                'compiler': subprocess.check_output([cc, '--version'], text=True).splitlines()[0],
                'flags': flags, 'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
                'hardware': 'not tested', 'audio': 'not tested', 'nativeSourceAccess': 'not implemented',
            }
            args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
