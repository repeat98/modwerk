# SPDX-License-Identifier: MIT
"""Beat Slicer: the C controller and its USB package.

1. test_device_module.py: the controller against the base's sample-editor service on the host (sanitizers), and
   the ColdFire package's ot_sample_editor_actions record at the registry's index (ABI 1, 64 bytes, aligned).
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
ROOT = HERE.parents[3]

subprocess.run([sys.executable, '-B', str(HERE / 'test_device_module.py')], check=True)
if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] package: no m68k-elf-gcc here; the host checks passed.')
row = next(r for r in json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
           if r['id'] == 'beat-slicer')
with tempfile.TemporaryDirectory() as folder:
    out = Path(folder) / 'beat-slicer.mwrm'
    subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), *[str(ROOT / s) for s in row['sources']],
                    *[arg for hook in row['subscribe'] for arg in ('--subscribe', hook)], '-o', str(out)],
                   check=True, capture_output=True, cwd=ROOT)
    data = out.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if digest != row['sha256'] or (ROOT / 'public' / row['path']).read_bytes() != data:
    sys.exit('[FAIL] the package built from source (%s) is not the published one (%s)' % (digest[:16], row['sha256'][:16]))
print('[PASS] Beat Slicer %s: host checks, descriptor at the registry index, package %s identical to the published one'
      % (row['version'], digest[:16]))
