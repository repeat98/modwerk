#!/usr/bin/env python3
"""Portable planner and popup regressions; never opens firmware or a device."""
from pathlib import Path
import subprocess
import sys
import re
import tempfile
HERE=Path(__file__).resolve().parent
ROOT=next(parent for parent in HERE.parents if (parent/'sdk/runtime/loader/modwerk_module.h').is_file())
# Stock-unreferenced CS1 is not base-free: independently check the actual
# base definitions, rather than trusting the module pair declaration alone.
header=(HERE/'ownership.h').read_text()
nv_base=int(re.search(r'#define PSL_NV_BASE (0x[0-9a-f]+)u',header).group(1),16)
entries=int(re.search(r'#define PSL_NV_ENTRIES ([0-9]+)u',header).group(1))
nv_end=nv_base+0x400+entries*16
for filename,macro,length in (('diag.c','LOG',0x2000),('fxmap.c','MAP',0x1800),('crash.c','REC',0x100),('dsp.c','STALL',0x600)):
    source=(ROOT/'sdk/machines/octatrack/elekloader'/filename).read_text()
    start=int(re.search(r'#define '+macro+r' .*?(0x[0-9a-f]+)u',source).group(1),16)
    assert not (nv_base<start+length and start<nv_end), f'ownership overlaps base {filename}'
assert 0x100f8f06<=nv_base<nv_end<=0x100fff00
print('PASS ownership reservation avoids actual base diagnostics, effect map, crash/stall records and stock settings')
with tempfile.TemporaryDirectory(prefix='psl-tests-') as folder:
    for name,sources in (
        ('engine',['engine.c','test_engine.c']),
        ('ownership',['ownership.c','test_ownership.c']),
        ('ui',['engine.c','font.c','ui.c','test_ui.c']),
    ):
        output=str(Path(folder)/name)
        subprocess.run(['cc','-std=c99','-Wall','-Wextra','-Werror','-fsanitize=address,undefined',
            '-I',str(ROOT/'sdk/runtime/loader'),*[str(HERE/s) for s in sources],'-o',output],check=True)
        subprocess.run([output],check=True)
subprocess.run([sys.executable,'-B',str(HERE/'test_native_scope.py')],check=True)
print('PASS portable tests; emulator, native writer and hardware results remain separate')
