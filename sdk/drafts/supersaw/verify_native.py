#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Private seeded CPU fixture, not a firmware/base/USB qualification.

Uses an existing Octabam emulator build and the owner's private MAIN OS.
Never contacts a device. Outputs stay in the explicit private --out folder.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'support'))
import m68k_codegen

def run(args):
    return subprocess.run(list(map(str,args)),check=True,capture_output=True,text=True).stdout

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--native',type=Path,required=True)
    ap.add_argument('--stock',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    a=ap.parse_args(); out=a.out.resolve(); out.mkdir(parents=True,exist_ok=False)
    native=a.native.resolve(); stock=a.stock.resolve()
    cross=os.environ.get('M68K_PREFIX','/opt/homebrew/bin/m68k-elf-')
    flags=['-mcpu=54455','-malign-int','-msoft-float','-Os','-std=c11',
           *m68k_codegen.FLAGS,'-ffreestanding','-fno-builtin','-fno-common','-fno-pic',
           '-fno-tree-loop-distribute-patterns','-fno-asynchronous-unwind-tables',
           '-fno-unwind-tables','-fomit-frame-pointer','-Wall','-Wextra','-Werror',
           '-I'+str(HERE/'sdk_include')]
    src=['usb_machine.c','bridge.c','engine/machine.c','engine/adapter.c','engine/ot_records.c']
    objs=[]
    for n in src:
        obj=out/(Path(n).stem+'.o'); run([cross+'gcc',*flags,'-c',HERE/n,'-o',obj]);objs.append(obj)
    m68k_codegen.check_mcf54455(objs,objdump=cross+'objdump')
    asm=out/'events.o'; run([cross+'as','-mcpu=54455',HERE/'events.s','-o',asm]);objs.append(asm)
    m68k_codegen.check_mcf54455([asm],objdump=cross+'objdump')
    script=out/'fixture.ld'
    script.write_text('ENTRY(sw_usb_start)\nSECTIONS { . = 0x47800000; .text : { *(.text*) } .rodata : { *(.rodata*) } .data : { *(.data*) } .bss : { *(.bss*) *(COMMON) } }\n')
    elf=out/'fixture.elf'; binary=out/'fixture.bin'
    run([cross+'gcc','-mcpu=54455','-nostdlib','-Wl,-T,'+str(script),*objs,'-lgcc','-o',elf])
    run([cross+'objcopy','-O','binary',elf,binary])
    nm=run([cross+'nm','-n',elf]); symbols={p[2]:int(p[0],16) for l in nm.splitlines() if len(p:=l.split())==3}
    (out/'usb_symbols.h').write_text(''.join(f'#define SYM_{k} 0x{v:x}u\n' for k,v in symbols.items() if k.startswith('sw_usb_')))
    source=native/'tools/emu/ot_emu'; libs=native/'out/emu'
    archives=[libs/'libot_machine.a',libs/'mc68k/lib68kEmu.a',libs/'dsp56300/dsp56kEmu/libdsp56kEmu.a',libs/'dsp56300/dsp56kBase/libdsp56kBase.a',libs/'dsp56300/asmjit/libasmjit.a']
    executable=out/'native-probe'
    run(['/usr/bin/c++','-O2','-flto','-arch','arm64','-std=c++17','-I'+str(source),
         '-I'+str(native/'vendor'),'-I'+str(native/'vendor/dsp56300/source'),'-I'+str(out),
         HERE/'native_probe.cpp',*archives,'-lpthread','-o',executable])
    result=run([executable,stock,binary]); print(result,end='')
    report={'version':json.loads((HERE/'provenance.json').read_text())['version'],'scope':'seeded ColdFire callbacks and selected native MIDI continuations; no RTOS, whole base, USB, DSP or hardware',
            'stockSha256':hashlib.sha256(stock.read_bytes()).hexdigest(),
            'fixtureSha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
            'sourceSha256':{n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in [*src,'events.s','native_probe.cpp']},
            'emulatorArchives':{str(p.relative_to(native)):hashlib.sha256(p.read_bytes()).hexdigest() for p in archives},
            'result':result,'hardwareTested':False,'usbLifecycleTested':False,'cpuPercent':None}
    (HERE/'evidence/native-checks.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__': main()
