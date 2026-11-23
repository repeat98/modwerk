#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Pinned 0.7.13 base: unassigned ten-second RAM trial and automatic Undo."""
import sys
import subprocess
from read_hardware import run_client

if __name__ == '__main__':
    try:
        if sys.argv[1:]:
            raise RuntimeError('Aucune option acceptée.')
        run_client('trial_current_base.mjs')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print('ARRÊT : ' + str(error), file=sys.stderr)
        sys.exit(1)
