# SPDX-License-Identifier: GPL-3.0-or-later
"""Tiempos: the C module and its USB package.

1. tiempos_host.c: the module against simulated OS memory and a simulated 132 MHz timer on the host (13 checks:
   the stock frame left alone while closed, CUE + MIDI, the measured speed, the row marks, the last 30 seconds,
   a tempo change, a retriggered Flex loop, PLAY and SRC reaching the unit).
2. The package build.py makes from the sources is byte for byte the published one
   (src/engine/assets/octatrack-module-packages.json).
Needs a host C compiler, and m68k-elf-gcc for the package; host-only checks still run without it.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]

with tempfile.TemporaryDirectory() as folder:
    host = Path(folder) / 'tiempos_host'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', '-DDECK_HOST', '-I', str(HERE), '-I', str(ROOT / 'sdk/runtime/loader'),
                    '-o', str(host), str(HERE / 'tiempos_host.c'), str(HERE / 'tiempos.c'), '-lm'], check=True)
    subprocess.run([str(host), folder], check=True)
if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] package: no m68k-elf-gcc here; the host checks passed.')
row = next(r for r in json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
           if r['id'] == 'tiempos')
with tempfile.TemporaryDirectory() as folder:
    out = Path(folder) / 'tiempos.mwrm'
    subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), *[str(ROOT / s) for s in row['sources']],
                    *[arg for hook in row.get('subscribe', []) for arg in ('--subscribe', hook)], '-o', str(out)],
                   check=True, capture_output=True, cwd=ROOT)
    data = out.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if 'sha256' not in row:
    sys.exit('[FAIL] the package row is not completed yet: run npm run octatrack:module-packages (built %s)' % digest[:16])
if digest != row['sha256'] or (ROOT / 'public' / row['path']).read_bytes() != data:
    sys.exit('[FAIL] the package built from source (%s) is not the published one (%s)' % (digest[:16], row['sha256'][:16]))
print('[PASS] Tiempos %s: host checks, package %s identical to the published one' % (row['version'], digest[:16]))
