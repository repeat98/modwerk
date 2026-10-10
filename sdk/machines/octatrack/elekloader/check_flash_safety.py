#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Before flashing a private base build: prove it cannot touch the bootloader.

    python3 -B check_flash_safety.py --stock /private/OCTATRACK_OS1.40C.bin \\
        --build /private/NEW-core-output --upstream ~/.cache/modwerk-upstream/elekloader

Compares the built MAIN with stock. The bootloader copy the OS re-flashes when
its version is newer (0x400de1e0-0x400e21e0, version word 0x400dea48) must be
byte-identical, every other changed byte must lie inside a site the package
declares, and the .bin and .syx must decode to the same MAIN. Reads local
files only. Passing does not show that the build boots or works.
"""
import argparse
import glob
import json
from pathlib import Path
import sys

BOOTLOADER = (0x400de1e0, 0x400e21e0)


def unexplained(stock, built, load, sites):
    """Changed spans of the stock-length image that no (addr, len) site covers."""
    spans, i, n = [], 0, min(len(stock), len(built))
    while i < n:
        if stock[i] == built[i]:
            i += 1
            continue
        j = i
        while j < n and stock[j] != built[j]:
            j += 1
        if not any(a <= load + i and load + j <= a + m for a, m in sites):
            spans.append((load + i, j - i))
        i = j
    return spans


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--build', type=Path, required=True, help="build_core.py's output directory")
    parser.add_argument('--upstream', type=Path, required=True, help='the kit-pinned Elekloader checkout')
    args = parser.parse_args()
    sys.path.insert(0, str(args.upstream.expanduser()))
    from elekloader import formats
    parsed, dev, _ = formats.load(str(args.stock))
    stock = formats.main_image(parsed, dev)
    bin_main = formats.main_image(formats.parse(str(args.build / 'NOT_FLASH_CANDIDATE.bin'), dev), dev)
    syx_main = formats.main_image(formats.parse(str(args.build / 'NOT_FLASH_CANDIDATE.syx'), dev), dev)
    package = json.loads(Path(glob.glob(str(args.build / 'package' / '*.elemod'))[0]).read_text())
    sites = [(int(s['addr'], 16), s['len']) for s in package['sites']]
    lo, hi = (a - dev.main_load for a in BOOTLOADER)
    checks = {
        'bootloader copy identical': stock[lo:hi] == bin_main[lo:hi],
        '.bin and .syx carry the same OS': bin_main == syx_main,
        'every change inside a declared site': not unexplained(stock, bin_main, dev.main_load, sites),
    }
    for name, ok in checks.items():
        print('%-38s %s' % (name, 'passed' if ok else 'FAILED'))
    if not all(checks.values()):
        print('Do not flash this build.')
        sys.exit(1)
    print('Safe to flash with respect to the bootloader: Startup Menu recovery stays available. Not a boot test.')


if __name__ == '__main__':
    main()
