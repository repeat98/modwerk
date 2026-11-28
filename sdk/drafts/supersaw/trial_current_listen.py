#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Pinned manual T1 audition, no Keep; release T1 before verified Undo."""
import sys
from read_hardware import run_client

if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--end-check']):
            raise RuntimeError('Option inconnue ; utiliser --end-check pour le contrôle de fin de 30 secondes.')
        run_client('trial_current_listen.mjs', end_check=bool(sys.argv[1:]))
    except RuntimeError as error:
        print('ARRÊT : ' + str(error), file=sys.stderr)
        sys.exit(1)
