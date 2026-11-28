#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run only the pinned, unused ten-second RAM trial; never Keep or flash."""
import subprocess
import sys
from read_hardware import run_client

if __name__ == '__main__':
    try:
        run_client('trial_unused.mjs')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print('ARRÊT : ' + str(error), file=sys.stderr)
        sys.exit(1)
