# SPDX-License-Identifier: GPL-3.0-or-later
"""The unit's turn for a Python device script (scripts/unit-queue.mjs, docs/OCTATRACK_DRIVING.md#taking-turns-on-the-unit).

take_turn() runs the calling script again under `node scripts/unit-queue.mjs run`, which waits in line for the unit, runs
it with MODWERK_UNIT_TURN set and gives the turn back however it ends. Inside a turn already (MODWERK_UNIT_TURN set), or
with MODWERK_UNIT=emulator, it returns at once. steps: a device step line, for which the turn is taken only when it drives
the unit (device-send.py)."""
import os, pathlib, shutil, subprocess, sys


def take_turn(note, expect='15m', steps=None):
    if os.environ.get('MODWERK_UNIT_TURN') or os.environ.get('MODWERK_UNIT') in ('emulator', 'served'):
        return
    node = shutil.which('node')
    if not node:
        raise SystemExit('The unit queue needs Node on PATH (scripts/unit-queue.mjs): use Node 24 (.nvmrc), or set MODWERK_UNIT=emulator for an emulator.')
    queue = str(pathlib.Path(__file__).resolve().parent / 'unit-queue.mjs')
    command = [node, queue, 'run', '--note', note[:120], '--expect', expect] + (['--steps', steps] if steps is not None else []) + \
        ['--', sys.executable, '-B', os.path.abspath(sys.argv[0])] + sys.argv[1:]
    sys.stdout.flush()
    if os.name == 'posix':
        os.execv(node, command)  # the same process: signals and the exit status stay this script's
    sys.exit(subprocess.call(command))
