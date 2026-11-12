#!/usr/bin/env python3
"""Firmware-free core and authored assembly gate; run in the isolated toolchain.
Emulator behavior, resource bounds and hardware waiver are separate records.
"""
from pathlib import Path
import subprocess
import tempfile
here=Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='vector-gate.') as directory:
    work=Path(directory)
    subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined',str(here/'engine.c'),str(here/'test_engine.c'),'-o',str(work/'core')],check=True)
    subprocess.run([str(work/'core')],check=True)
    subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined',str(here/'persistence.c'),str(here/'test_persistence.c'),'-o',str(work/'persistence')],check=True)
    subprocess.run([str(work/'persistence')],check=True)
    subprocess.run(['python3','-B',str(here/'prepare.py'),'--output',str(work/'control.s')],check=True)
    if (work/'control.s').read_bytes() != (here/'control.s').read_bytes():
        raise SystemExit('VECTOR control.s differs from the current authored C/hooks and pinned compiler')
print('VECTOR firmware-free core, writer and assembly reproducibility passed; physical hardware remains untested.')
