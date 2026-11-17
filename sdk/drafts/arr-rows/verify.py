#!/usr/bin/env python3
"""ARR ROWS's gate.

    python3 -B verify.py     # needs a host C compiler (cc); m68k-elf-gcc for the generated-unit check

1. arr_rows_host.c drives arr_rows.c (-DARR_HOST) against simulated OS 1.40C memory, big-endian as on the unit
   (55 checks): every key is stock's while the editor is closed, without a selection and without rows copied here;
   CUE + UP/DOWN reaches stock and marks the rows; copy, clear, paste over and insert of a range; LOOP/JUMP targets
   after an insert; undo by repeating, and no undo after another edit; the 256-row limit; the changed marks stock
   sets; a stock copy, a stock insert or delete, NO and the editor closing each end the module's part.
2. arr_rows_core.s is what arr_rows.c generates, with no unresolved symbol and through the shared ColdFire guard.
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
    host = pathlib.Path(tmp) / 'arr_rows_host'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', '-DARR_HOST', '-o', str(host),
                    str(HERE / 'arr_rows_host.c'), str(HERE / 'arr_rows.c')], check=True)
    run = subprocess.run([str(host)], capture_output=True, text=True)
    print(run.stdout, end='')
    if run.returncode:
        sys.exit('[FAIL] host checks')

if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] generated unit: no m68k-elf-gcc here; the host checks passed.')
subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], check=True)
print('[PASS] ARR ROWS: host checks and the generated unit')
