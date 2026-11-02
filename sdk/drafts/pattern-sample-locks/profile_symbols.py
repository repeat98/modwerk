#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Bind instruction watches to the exact linked CF package, without firmware."""
import argparse
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--object',type=Path,required=True)
    p.add_argument('--package',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();root=Path(__file__).resolve().parents[3]
    tree=ast.parse((root/'sdk/runtime/loader/build.py').read_text())
    script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCRIPT' for t in n.targets))
    parser_spec=importlib.util.spec_from_file_location('psl_recipe',root/'sdk/runtime/loader/verify_static.py')
    parser=importlib.util.module_from_spec(parser_spec);parser_spec.loader.exec_module(parser)
    image,*_=parser.unpack_recipe(a.package.read_bytes())
    with tempfile.TemporaryDirectory(prefix='psl-profile-') as tmp:
        d=Path(tmp);(d/'link.ld').write_text(script%0)
        subprocess.run(['m68k-elf-ld','--no-warn-rwx-segments','-T',str(d/'link.ld'),'-o',str(d/'unit.elf'),str(a.object.resolve())],check=True)
        subprocess.run(['m68k-elf-objcopy','-O','binary','-j','.image',str(d/'unit.elf'),str(d/'image')],check=True)
        assert (d/'image').read_bytes()==image,'profile object does not reproduce package image'
        symbols={}
        for line in subprocess.check_output(['m68k-elf-nm',str(d/'unit.elf')],text=True).splitlines():
            value,_,name=line.split();symbols[name]=int(value,16)
        functions={};name=None
        for line in subprocess.check_output(['m68k-elf-objdump','-d',str(d/'unit.elf')],text=True).splitlines():
            label=re.match(r'^[0-9a-f]+ <([^>]+)>:',line)
            if label:name=label[1];functions[name]=[]
            ins=re.match(r'^\s*([0-9a-f]+):\s+(?:[0-9a-f]{4} )+\s*(\S+)\s*(.*)$',line)
            if ins and name:functions[name].append((int(ins[1],16),ins[2],ins[3]))
        guard=functions['psl_write_step']
        begin=[pc for pc,op,args in guard if '%sr' in args and '#9984' in args]
        ends=[pc for pc,op,args in guard if args.endswith(',%sr') and '#' not in args]
        assert len(begin)==len(ends)==1,'review IRQ guard assembly'
        saved=[args for pc,op,args in guard if args.startswith('%sr,%d')]
        assert len(saved)==1
        saved_register=int(saved[0].split('%d')[1])
        # Emulator hit records expose D0/D1 followed by A0/A1, SP and five
        # stack words, then D2..D7. They do not expose the current SR.
        saved_field=2+saved_register if saved_register<2 else 10+saved_register
        result={'psl_open':symbols['psl_open'],'begin':begin[0],'ends':ends,
            'savedSrHitField':saved_field,'publicationMaskFromAssembly':7,
            'symbols':{n:symbols[n] for n in ('psl_open','psl_guard_max','psl_guard_spans','__image_end','__bss_end','phase','cursor','selected','replace','select_all','preferences','last_action','remembered')},
            'performanceFunctions':{},'monitorPoints':[0x400a1e0c],
            'objectSha256':hashlib.sha256(a.object.read_bytes()).hexdigest(),
            'packageSha256':hashlib.sha256(a.package.read_bytes()).hexdigest()}
        for n in ('psl_native_commit','psl_prepare','module_key'):
            returns=[pc for pc,op,args in functions[n] if op=='rts']
            assert returns,n
            result['performanceFunctions'][n]={'begin':symbols[n],'ends':returns}
        a.out.write_text(json.dumps(result,indent=2)+'\n')
        print('PASS exact-package profile symbols and IRQ boundary watches')

if __name__=='__main__':main()
