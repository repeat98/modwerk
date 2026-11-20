#!/usr/bin/env python3
# SPDX-License-Identifier: Elastic-2.0
# Copyright (c) 2026 Jannik Aßfalg (repeat98)
"""device-send.py 'SEQUENCE' - one line to `npm run device -- serve`, its reply printed (macOS nc hangs up before it).
A line that drives the unit waits for this computer's turn on it first (scripts/unit-queue.mjs); a line that only reads does not."""
import os, socket, sys
sys.dont_write_bytecode = True  # no __pycache__ beside the scripts
from unit_turn import take_turn
line = ' '.join(sys.argv[1:])
take_turn('device-send ' + line, expect='2m', steps=line)
s = socket.socket(socket.AF_UNIX)
s.connect(os.environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock'))
s.sendall((line + '\n').encode())
sys.stdout.write(s.makefile().read())
