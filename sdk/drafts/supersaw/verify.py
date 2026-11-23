#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Offline source checks only. Never build/install firmware or access USB."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE / 'support'))
import m68k_codegen

def run(args):
    p = subprocess.run(list(map(str,args)), check=True, text=True, capture_output=True)
    return p.stdout.strip()

def main():
    original = json.loads((HERE/'provenance.json').read_text())
    for name, digest in original['engine'].items():
        assert hashlib.sha256((HERE/'engine'/name).read_bytes()).hexdigest()==digest, name
    for name, digest in original['sdkFiles'].items():
        assert hashlib.sha256((HERE/name).read_bytes()).hexdigest()==digest, name
    print('PASS: all frozen V0.27 engine sources match recorded SHA-256')
    common = ['-std=c11','-Wall','-Wextra','-Werror']
    src = ['usb_machine.c','bridge.c','engine/machine.c','engine/adapter.c','engine/ot_records.c']
    reports = {'version':original['version'], 'engineUnchanged':True,
               'hardwareTested':False,'usbLifecycleTested':False,'cpuPercent':None}
    with tempfile.TemporaryDirectory(prefix='supersaw-usb-') as temp:
        work=Path(temp)
        cc=shutil.which('clang')
        if not cc: raise RuntimeError('clang is required for the sanitizer checks')
        host=[cc,*common,'-O1','-g','-fsanitize=address,undefined',
              '-I'+str(HERE/'sdk_include')]
        executable=work/'bridge-test'
        run([*host,*(HERE/n for n in ['test_bridge.c',*src[1:]]),'-o',executable])
        reports['bridge']=run([executable]); print(reports['bridge'])
        eq=work/'equivalence-test'
        run([*host,HERE/'engine/test_render_equivalence.c',
             HERE/'engine/test_reference_render.c',HERE/'engine/adapter.c',
             HERE/'engine/ot_records.c','-o',eq])
        reports['engineEquivalence']=run([eq]); print(reports['engineEquivalence'])
        cross=os.environ.get('M68K_PREFIX','m68k-elf-')
        if not shutil.which(cross+'gcc') and Path('/opt/homebrew/bin/m68k-elf-gcc').exists():
            cross='/opt/homebrew/bin/m68k-elf-'
        if not shutil.which(cross+'gcc'): raise RuntimeError('m68k-elf-gcc is required')
        flags=['-mcpu=54455','-malign-int','-msoft-float','-Os',*common,
               *m68k_codegen.FLAGS,'-ffreestanding','-fno-builtin','-fno-common',
               '-fno-pic','-fno-tree-loop-distribute-patterns',
               '-fno-asynchronous-unwind-tables','-fno-unwind-tables',
               '-fomit-frame-pointer','-ffunction-sections','-fdata-sections',
               '-I'+str(HERE/'sdk_include')]
        objs=[]
        for name in src:
            obj=work/(Path(name).stem+'.o')
            run([cross+'gcc',*flags,'-c',HERE/name,'-o',obj]); objs.append(obj)
        asm=work/'events.o'
        run([cross+'as','-mcpu=54455',HERE/'events.s','-o',asm]); objs.append(asm)
        count=m68k_codegen.check_mcf54455(objs,objdump=cross+'objdump')
        syms=run([cross+'nm','-S',objs[0]])
        assert '00000050 R sw_usb_machine' in syms
        assert '00000010 R sw_usb_machine_start' in syms
        assert any(line.split()[-2:]==['T','sw_usb_start'] for line in syms.splitlines())
        symbols={}
        for obj in objs:
            for line in run([cross+'nm','-S',obj]).splitlines():
                p=line.split()
                if len(p)==4: symbols[p[3]]=(int(p[1],16),p[2])
        recipe=json.loads((HERE/'runtime.json').read_text())
        contract=json.loads((HERE/'sdk-contract.json').read_text())
        assert recipe['schema']==1
        declared=recipe['subscribe']+recipe['contribute']
        assert len(declared)==len({r.get('event',r.get('to')) for r in declared})
        for r in declared:
            event=r.get('event',r.get('to')); kind=contract[event]['kind']
            size,typ=symbols[r.get('fn',r.get('data'))]
            assert typ==('T' if kind=='call' else 'R'), (event,typ)
            if kind=='take': assert size==8
        reports['recipe']={'subscriptions':len(recipe['subscribe']),'contributions':len(recipe['contribute']),'typedSymbols':'pass',
                           'scope':'source contract only; not package or loader validation'}
        reports['coldfire']={'objects':count,'machineAbiBytes':80,'startAbiBytes':16,
                            'lateCombineAndMcf54455Guard':'pass',
                            'compiler':run([cross+'gcc','--version']).splitlines()[0]}
        print('PASS: six MCF54455 objects, compiler/ISA guard, 80-byte machine and 16-byte typed START ABI')
        print('PASS: recipe names and symbol types match pinned SDK event contracts')
    (HERE/'evidence/local-checks.json').write_text(json.dumps(reports,indent=2)+'\n')
    print('NOT TESTED by this host gate: native hooks, complete base/emulator USB, UI, Keep/Undo, hardware and interrupt timing')

if __name__=='__main__': main()
