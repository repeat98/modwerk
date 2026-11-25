#!/usr/bin/env python3
"""Portable planner and popup regressions; never opens firmware or a device."""
from pathlib import Path
import subprocess
import sys
import tempfile
HERE=Path(__file__).resolve().parent
ROOT=next(parent for parent in HERE.parents if (parent/'sdk/runtime/loader/modwerk_module.h').is_file())
# The simplified package has no persistent storage or native edit observers.
import json
runtime=json.loads((HERE/'runtime.json').read_text())
assert runtime.get('contribute')==[{'to':'ot_part_menu','data':'psl_part_menu','order':50}]
native=(HERE/'native.c').read_text()
assert 'psl_nv_' not in native and 'modwerk_lifecycle' not in native
print('PASS no ownership storage or lifecycle contribution; one Part Edit menu row')
with tempfile.TemporaryDirectory(prefix='psl-tests-') as folder:
    for name,sources in (
        ('engine',['engine.c','test_engine.c']),
        ('ui',['engine.c','font.c','ui.c','test_ui.c']),
    ):
        output=str(Path(folder)/name)
        subprocess.run(['cc','-std=c99','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-fno-sanitize-recover=all',
            '-I',str(ROOT/'sdk/runtime/loader'),'-I',str(ROOT/'sdk/machines/octatrack/include'),*[str(HERE/s) for s in sources],'-o',output],check=True)
        subprocess.run([output],check=True)
subprocess.run([sys.executable,'-B',str(HERE/'test_native_commit.py')],check=True)
print('PASS portable tests; emulator, native writer and hardware results remain separate')
