#!/usr/bin/env python3
"""SONGBOOK's gate.

    python3 -B verify.py     # needs a host C compiler (cc); m68k-elf-gcc for the generated-unit check

1. songbook_host.c drives songbook.c (-DAS_HOST) against simulated battery RAM and simulated stock file
   routines (40 checks): book switching both ways, arr09-arr128 named and written 8 at a time, book 1's backup and
   arr01-08 repaired on return, a file that will not read never written back, refusals, reinstall and power-cycle
   detection, SAVE/RELOAD PROJECT, the label.
2. songbook_core.s is what songbook.c generates, with no unresolved symbol and through the shared ColdFire guard.
What only the firmware shows (the routed keys, the screen rows, the message box) is measured under ot_emu and on a
unit: TESTING.md.
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent

with tempfile.TemporaryDirectory() as tmp:
    host = pathlib.Path(tmp) / 'songbook_host'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', '-DAS_HOST', '-o', str(host),
                    str(HERE / 'songbook_host.c'), str(HERE / 'songbook.c')], check=True)
    run = subprocess.run([str(host)], capture_output=True, text=True)
    print(run.stdout, end='')
    if run.returncode:
        sys.exit('[FAIL] host checks')

if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] generated unit: no m68k-elf-gcc here; the host checks passed.')
subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], check=True)
print('[PASS] SONGBOOK: host checks and the generated unit')
