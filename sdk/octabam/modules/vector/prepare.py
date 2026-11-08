#!/usr/bin/env python3
"""Regenerate authored control.s with guarded stock spans left as zero holes.
Run the compiler in the isolated toolchain; firmware is not an input.
"""
from pathlib import Path
import argparse
import re
import subprocess
import tempfile

FLAGS = ['-mcpu=5475','-msoft-float','-O2','-ffreestanding','-fno-builtin',
         '-fno-common','-fno-jump-tables','-fno-asynchronous-unwind-tables',
         '-fno-ident','-fomit-frame-pointer','-fno-zero-initialized-in-bss',
         '-Wall','-Wextra','-Werror']
REPLAYS = (
    ('st_name_replay',0x400334d8,6),
    ('st_main_replay',0x4007981c,6),
    ('st_edit_replay',0x4003a52e,8),
    ('st_draw_replay',0x4003cd98,8),
)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    octatrack=here.parents[2]/'machines/octatrack'
    if args.output.exists(): parser.error('Output exists; use a fresh private build directory.')
    with tempfile.TemporaryDirectory(prefix='vector-cf.') as directory:
        work=Path(directory)
        unity=work/'vector.c'
        # On a card VECTOR is the one MIDI generator: it links the base's registry with its own record.
        unity.write_text('#include "engine.c"\n#include "persistence.c"\n#include "native.c"\n#include "midi.c"\n'
                         '#define MG_FIXED vector_midi\n#include "midi_generators.c"\n')
        assembly=work/'vector.s'
        include=[x for d in (here,octatrack/'elekloader',octatrack/'include') for x in ('-I',str(d))]
        subprocess.run(['m68k-elf-gcc',*FLAGS,*include,'-S',str(unity),'-o',str(assembly)],check=True)
        # A card unit's .bss is never loaded or zeroed (tools/remix/platform_build.py), and -fno-zero-initialized-in-bss
        # leaves statics without an initialiser in .comm: put them in .data as zeros, and keep the unit free of .bss.
        compiled=re.sub(r'\t\.local\t(\S+)\n\t\.comm\t\1,(\d+),(\d+)\n',
                        r'\t.pushsection .data\n\t.balign \3\n\1:\n\t.zero \2\n\t.popsection\n',assembly.read_text())
        if re.search(r'\.(?:l?comm|bss)\b',compiled): raise SystemExit('VECTOR must not have .bss: a card never zeroes it.')
        text=(compiled+'\n#APP\n'+(here/'hooks.s').read_text()+'\n'+
              (octatrack/'elekloader/midi_generators.s').read_text()+'\n.text\n.balign 2\n')
        # The shared native/browser linkers restore these from verified local OS.
        for name,address,length in REPLAYS:
            text+=name+':\n.space '+str(length)+'\njmp '+hex(address+length)+'\n'
        args.output.write_text(text)
    print('Prepared authored ColdFire source with zero stock placeholders.')

if __name__=='__main__': main()
