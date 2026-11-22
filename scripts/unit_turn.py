# SPDX-License-Identifier: GPL-3.0-or-later
"""The unit's turn for a Python device script (scripts/unit-queue.mjs, docs/OCTATRACK_DRIVING.md#taking-turns-on-the-unit).

take_turn(script, …) runs `script` again under `node scripts/unit-queue.mjs run`, which waits in line for the unit, runs it
with MODWERK_UNIT_TURN set and gives the turn back however it ends. It acts only when `script` is the program that runs
(its __main__): imported by another script or a test, the caller owns the turn. Inside a turn already (MODWERK_UNIT_TURN
set), or with MODWERK_UNIT=emulator, it returns at once too. device-send.py does the same in its own lines."""
import os, shutil, subprocess, sys


def take_turn(script, note, expect='15m'):
    main = getattr(sys.modules.get('__main__'), '__file__', None)
    if not main or os.path.realpath(main) != os.path.realpath(script):
        return
    if os.environ.get('MODWERK_UNIT_TURN') or os.environ.get('MODWERK_UNIT') in ('emulator', 'served'):
        return
    node = shutil.which('node')
    if not node:
        raise SystemExit('The unit queue needs Node on PATH (scripts/unit-queue.mjs): use Node 24 (.nvmrc), or set MODWERK_UNIT=emulator for an emulator.')
    queue = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'unit-queue.mjs')
    command = [node, queue, 'run', '--note', note[:120], '--expect', expect, '--', sys.executable, '-B', os.path.realpath(script)] + sys.argv[1:]
    sys.stdout.flush()
    if os.name == 'posix':
        os.execv(node, command)  # the same process: signals and the exit status stay this script's
    sys.exit(subprocess.call(command))
