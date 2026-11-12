#!/usr/bin/env python3
"""Compile authored shared registration; inherited spans remain in polyui's guarded placeholders."""
from pathlib import Path
import argparse,subprocess,tempfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
if a.output.exists():p.error('Output exists; choose a fresh output file.')
here=Path(__file__).resolve().parent
flags=['-mcpu=5475','-msoft-float','-O2','-ffreestanding','-fno-builtin','-fno-common','-fno-jump-tables','-fno-asynchronous-unwind-tables','-fno-ident','-fomit-frame-pointer','-fno-zero-initialized-in-bss','-Wall','-Wextra','-Werror']
with tempfile.TemporaryDirectory(prefix='poly8-shared-') as d:
 out=Path(d)/'shared.s';subprocess.run(['m68k-elf-gcc',*flags,'-S',here/'shared-machine.c','-o',out],check=True)
 a.output.write_text(out.read_text()+'\n#APP\n'+(here/'shared-machine-hooks.s').read_text())
