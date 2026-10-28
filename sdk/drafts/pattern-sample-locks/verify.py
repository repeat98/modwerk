#!/usr/bin/env python3
"""Portable planner and popup regressions; never opens firmware or a device."""
from pathlib import Path
import subprocess
import tempfile
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
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
print('PASS portable tests; emulator, native writer and hardware results remain separate')
