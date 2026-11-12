# SPDX-License-Identifier: MIT
"""SYNTIZ: the engine, the knob map and the USB package.

1. test_engine.c on the host under UBSan/ASan: levels, DC, aliasing, extreme renders of the six models, MORPH at
   MIX 0 and 127 against TABLE (TESTING.md).
2. test_machine_map.c: every knob byte reaching its control, and the played pitch on stock's curve.
3. The package build.py makes from the sources is byte for byte the published one
   (src/engine/assets/octatrack-module-packages.json).
Needs a host C compiler for 1-2 and m68k-elf-gcc for 3; what cannot run here is reported as skipped.
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
FLAGS = ['-std=c11', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all']

cc = shutil.which('cc')
if not cc:
    sys.exit('[SKIP] no host C compiler: the engine and knob map checks did not run.')
with tempfile.TemporaryDirectory() as folder:
    for name, sources, args in (('engine', ['engine.c', 'test_engine.c'], ['check']),
                                ('map', ['engine.c', 'machine_map.c', 'test_machine_map.c'], [])):
        exe = Path(folder) / name
        subprocess.run([cc, *FLAGS, '-o', str(exe), *[str(HERE / s) for s in sources], '-lm'], check=True)
        subprocess.run([str(exe), *args], check=True, stdout=subprocess.DEVNULL)
if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] package: no m68k-elf-gcc here; the host checks passed.')
row = next(r for r in json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
           if r['id'] == 'syntiz')
with tempfile.TemporaryDirectory() as folder:
    out = Path(folder) / 'syntiz.mwrm'
    subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), *[str(ROOT / s) for s in row['sources']],
                    *[arg for hook in row['subscribe'] for arg in ('--subscribe', hook)],
                    *[arg for event in row.get('raise', []) for arg in ('--raise', event)], '-o', str(out)],
                   check=True, capture_output=True, cwd=ROOT)
    data = out.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if digest != row['sha256'] or (ROOT / 'public' / row['path']).read_bytes() != data:
    sys.exit('[FAIL] the package built from source (%s) is not the published one (%s)' % (digest[:16], row['sha256'][:16]))
print('[PASS] SYNTIZ %s: engine and knob map on the host, package %s identical to the published one'
      % (row['version'], digest[:16]))
