#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Pinned manual T1 audition, no Keep; release T1 before verified Undo."""
import sys
from read_hardware import run_client

if __name__ == '__main__':
    try:
        run_client('trial_listen.mjs')
    except RuntimeError as error:
        print('ARRÊT : ' + str(error), file=sys.stderr)
        sys.exit(1)
