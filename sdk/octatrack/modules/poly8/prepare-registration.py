#!/usr/bin/env python3
"""Regenerate authored registration.s with guarded stock spans left as zero holes.
Run the compiler in the isolated toolchain; firmware is not an input.
"""
from pathlib import Path
import argparse
import subprocess
import tempfile

FLAGS = ['-mcpu=5475','-msoft-float','-O2','-ffreestanding','-fno-builtin',
         '-fno-common','-fno-jump-tables','-fno-asynchronous-unwind-tables',
         '-fno-ident','-fomit-frame-pointer','-fno-zero-initialized-in-bss',
         '-Wall','-Wextra','-Werror']
REPLAYS = (
    ('pm_name_replay',0x400334d8,6),
    ('pm_main_replay',0x4007981c,6),
    ('pm_edit_replay',0x4003a52e,8),
    ('pm_draw_replay',0x4003cd98,8),
)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    if args.output.exists(): parser.error('Output exists; use a fresh private build directory.')
    with tempfile.TemporaryDirectory(prefix='poly-cf.') as directory:
        work=Path(directory)
        unity=work/'vector.c'
        unity.write_text('#include "registration.c"\n#include "pool.c"\n#include "recording.c"\n#include "diagnostics.c"\n')
        assembly=work/'vector.s'
        subprocess.run(['m68k-elf-gcc',*FLAGS,'-I',str(here),'-S',str(unity),'-o',str(assembly)],check=True)
        text=assembly.read_text()+'\n#APP\n'+(here/'registration-hooks.s').read_text()+'\n.text\n.balign 2\n'
        # The shared native/browser linkers restore these from verified local OS.
        for name,address,length in REPLAYS:
            text+='.global '+name+'\n'+name+':\n.space '+str(length)+'\njmp '+hex(address+length)+'\n'
        args.output.write_text(text)
    print('Prepared authored ColdFire source with zero stock placeholders.')

if __name__=='__main__': main()
