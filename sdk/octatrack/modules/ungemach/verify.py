# SPDX-License-Identifier: MIT
"""UNGEMACH: the engine and the USB package.

1. test_engine.c on the host under UBSan/ASan: levels, DC and clipping at every corner of the controls, DISS's glide,
   a split frame sounding as one, three minutes of drone, PNCH's punch standing out and ending, a synced RATE that
   pulses (TESTING.md).
2. The package build.py makes from the sources is byte for byte the published one
   (src/engine/assets/octatrack-module-packages.json).
Needs a host C compiler for 1 and m68k-elf-gcc for 2; what cannot run here is reported as skipped.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]   # sdk/octatrack/modules/ungemach
FLAGS = ['-std=c99', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all']

cc = shutil.which('cc')
if not cc:
    sys.exit('[SKIP] no host C compiler: the engine checks did not run.')
with tempfile.TemporaryDirectory() as folder:
    exe = Path(folder) / 'engine'
    subprocess.run([cc, *FLAGS, '-o', str(exe), str(HERE / 'engine.c'), str(HERE / 'test_engine.c'), '-lm'], check=True)
    subprocess.run([str(exe)], check=True, stdout=subprocess.DEVNULL)
if not shutil.which('m68k-elf-gcc'):
    sys.exit('[SKIP] package: no m68k-elf-gcc here; the host checks passed.')
row = next((r for r in json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text(encoding='utf-8'))['packages']
            if r['id'] == 'ungemach'), None)
if row is None:
    sys.exit('[SKIP] package: UNGEMACH is a draft with no published package row yet; the host checks passed.')
with tempfile.TemporaryDirectory() as folder:
    out = Path(folder) / 'ungemach.mwrm'
    subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), *[str(ROOT / s) for s in row['sources']],
                    *[arg for hook in row['subscribe'] for arg in ('--subscribe', hook)],
                    *[arg for event in row.get('raise', []) for arg in ('--raise', event)], '-o', str(out)],
                   check=True, capture_output=True, cwd=ROOT)
    data = out.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if digest != row['sha256'] or (ROOT / 'public' / row['path']).read_bytes() != data:
    sys.exit('[FAIL] the package built from source (%s) is not the published one (%s)' % (digest[:16], row['sha256'][:16]))
print('[PASS] UNGEMACH %s: engine on the host, package %s identical to the published one' % (row['version'], digest[:16]))
