#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Firmware-free FRACT compilation and module contracts; not device qualification."""
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    module = Path(__file__).resolve().parent
    result = subprocess.call([
        sys.executable, '-B', str(Path(__file__).resolve().with_name('check_source.py')),
        *sys.argv[1:],
    ])
    if result:
        raise SystemExit(result)
    raise SystemExit(subprocess.call([
        sys.executable, '-B', '-m', 'unittest', 'discover',
        '-s', str(module / 'qualification/tests'), '-p', 'test_*.py',
    ]))
