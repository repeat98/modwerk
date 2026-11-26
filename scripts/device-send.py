#!/usr/bin/env python3
# SPDX-License-Identifier: Elastic-2.0
# Copyright (c) 2026 Jannik Aßfalg (repeat98)
"""device-send.py 'SEQUENCE' - one line to `npm run device -- serve`, its reply printed (macOS nc hangs up before it).
A line that drives the unit waits for this computer's turn on it first (scripts/unit-queue.mjs); a line that only reads does not."""
import os, shutil, socket, sys
line = ' '.join(sys.argv[1:])
# The queue runs this script again inside the turn (MODWERK_UNIT_TURN), or at once when the line only reads (--steps).
if not os.environ.get('MODWERK_UNIT_TURN') and os.environ.get('MODWERK_UNIT') not in ('emulator', 'served'):
    node = shutil.which('node')
    if not node:
        raise SystemExit('The unit queue needs Node on PATH (scripts/unit-queue.mjs); for an emulator, set MODWERK_UNIT=emulator.')
    here = os.path.abspath(__file__)
    os.execv(node, [node, os.path.join(os.path.dirname(here), 'unit-queue.mjs'), 'run', '--note', ('device-send ' + line)[:120],
                    '--expect', '2m', '--steps', line, '--', sys.executable, '-B', here] + sys.argv[1:])
path = os.environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock')
# A port number is TCP on this computer (Windows Python has no AF_UNIX), anything else a Unix socket.
s = socket.socket(socket.AF_INET) if path.isdigit() else socket.socket(socket.AF_UNIX)
s.connect(('127.0.0.1', int(path)) if path.isdigit() else path)
s.sendall((line + '\n').encode())
reply = s.makefile().read()
if not reply:
    raise SystemExit('The device server disconnected without a reply.')
sys.stdout.write(reply)
if any(line.startswith('error: ') for line in reply.splitlines()):
    raise SystemExit(1)
