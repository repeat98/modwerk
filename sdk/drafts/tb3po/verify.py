# SPDX-License-Identifier: GPL-3.0-or-later
"""TB-3PO: the engine, the generator glue and the USB package.

1. test_engine.py: the integer engine against tb3po.c's generator (floats, as written) over 50,688 seed, scale,
   octave-range and length cases, step for step; determinism, scale membership, the slide and at-least-one-note
   rules, every direction and motif; the track-record writer (locks, masks, trig words, what it leaves alone); the
   ColdFire package's ot_midi_generators record at the registry's index (ABI 2, 36 bytes, aligned, order 40).
2. The package build.py makes from the sources is byte for byte the published one
   (src/engine/assets/octatrack-module-packages.json).
Needs m68k-elf-gcc for the package; host-only checks still run without it.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = next(d for d in HERE.parents if (d / 'package.json').is_file())  # sdk/octabam/modules/ or sdk/drafts/

subprocess.run([sys.executable, '-B', str(HERE / 'test_engine.py')], check=True)
if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] package: no m68k-elf-gcc here; the host checks passed.')
row = next((r for r in json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
            if r['id'] == 'tb3po'), None)
if not row or not row.get('sha256'):
    sys.exit('[SKIP] package: tb3po is not published in src/engine/assets/octatrack-module-packages.json yet; the host checks passed.')
with tempfile.TemporaryDirectory() as folder:
    out = Path(folder) / 'tb3po.mwrm'
    subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), *[str(ROOT / s) for s in row['sources']],
                    *[arg for hook in row['subscribe'] for arg in ('--subscribe', hook)], '-o', str(out)],
                   check=True, capture_output=True, cwd=ROOT)
    data = out.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if digest != row['sha256'] or (ROOT / 'public' / row['path']).read_bytes() != data:
    sys.exit('[FAIL] the package built from source (%s) is not the published one (%s)' % (digest[:16], row['sha256'][:16]))
print('[PASS] TB-3PO %s: engine and record checks, generator record at the registry index, package %s identical to the published one'
      % (row['version'], digest[:16]))
