#!/usr/bin/env python3
"""SMART RELOAD's gate.

    python3 -B verify.py     # needs a host C compiler (cc); m68k-elf-gcc for the generated-unit check

1. smart_reload_host.c drives smart_reload.c (-DSR_HOST) against simulated memory and a stock RELOAD PART that copies
   the saved Part's scenes back: the row's scenes written after the reload as the arranger's row start writes them, a
   "--" side left to the Part, and every case that must stay stock's reload (pattern mode, no row, a REM row, another
   bank or Part, nothing to reload).
2. smart_reload_core.s is what smart_reload.c generates, with no unresolved symbol and through the shared ColdFire guard.
What only the firmware shows (the scenes heard and drawn after FUNC + CUE) is tested on a unit: TESTING.md.
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent

with tempfile.TemporaryDirectory() as tmp:
    host = pathlib.Path(tmp) / 'smart_reload_host'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', '-DSR_HOST', '-o', str(host),
                    str(HERE / 'smart_reload_host.c'), str(HERE / 'smart_reload.c')], check=True)
    run = subprocess.run([str(host)], capture_output=True, text=True)
    print(run.stdout, end='')
    if run.returncode:
        sys.exit('[FAIL] host checks')

if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] generated unit: no m68k-elf-gcc here; the host checks passed.')
subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], check=True)
print('[PASS] SMART RELOAD: host checks and the generated unit')
