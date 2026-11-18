#!/usr/bin/env python3
"""ARR SETLISTS's gate.

    python3 -B verify.py     # needs a host C compiler (cc); m68k-elf-gcc for the generated-unit check

1. arr_setlists_host.c drives arr_setlists.c (-DAS_HOST) against simulated battery RAM and a simulated file
   layer (30 checks): book switches both ways, the backup of A and arr01-08 rewritten on return, other books never in
   arr01-08, refusals, reinstall and power-cycle detection, SAVE/RELOAD PROJECT, the book letter.
2. arr_setlists_core.s is what arr_setlists.c generates, with no unresolved symbol and through the shared ColdFire guard.
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
    host = pathlib.Path(tmp) / 'arr_setlists_host'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', '-DAS_HOST', '-o', str(host),
                    str(HERE / 'arr_setlists_host.c'), str(HERE / 'arr_setlists.c')], check=True)
    run = subprocess.run([str(host)], capture_output=True, text=True)
    print(run.stdout, end='')
    if run.returncode:
        sys.exit('[FAIL] host checks')

if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] generated unit: no m68k-elf-gcc here; the host checks passed.')
subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], check=True)
print('[PASS] ARR SETLISTS: host checks and the generated unit')
