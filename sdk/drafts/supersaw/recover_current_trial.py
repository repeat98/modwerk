#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Undo only an existing transaction on the pinned base; never stage a package."""
import subprocess
import sys
from read_hardware import run_client

if __name__ == '__main__':
    try:
        run_client('recover_current_trial.mjs')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print('RÉCUPÉRATION NON CONFIRMÉE : ' + str(error), file=sys.stderr)
        sys.exit(1)
