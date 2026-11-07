#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Firmware-free FRACT compile/link gate; not device or release qualification."""
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    raise SystemExit(subprocess.call([
        sys.executable, '-B', str(Path(__file__).resolve().with_name('check_source.py')),
        *sys.argv[1:],
    ]))
