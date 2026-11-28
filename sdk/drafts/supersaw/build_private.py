#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Build a private emulator candidate with the pinned SDK, never install it.

No public release claim. The exact base and whole lifecycle remain unqualified.
The package is kept in the explicit private output directory.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sdk',type=Path,required=True)
    ap.add_argument('--stock',type=Path,required=True)
    ap.add_argument('--upstream',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--base',type=Path,required=True,help='exact private base build directory')
    a=ap.parse_args(); sdk=a.sdk.resolve(); out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
    provenance=json.loads((HERE/'provenance.json').read_text())
    frozen={**{'engine/'+n:h for n,h in provenance['engine'].items()},**provenance['sdkFiles']}
    for name,digest in frozen.items():
        if hashlib.sha256((HERE/name).read_bytes()).hexdigest()!=digest:
            raise ValueError('Frozen engine or SDK header changed: '+name)
    builder=load('sw_private_builder',sdk/'sdk/runtime/loader/build.py')
    codegen=load('sw_private_codegen',sdk/'sdk/runtime/m68k_codegen.py')
    cross=os.environ.get('M68K_PREFIX','/opt/homebrew/bin/m68k-elf-')
    flags=['-mcpu=54455','-malign-int','-msoft-float','-Os','-std=c11',*codegen.FLAGS,
           '-ffreestanding','-fno-builtin','-fno-common','-fno-pic',
           '-fno-tree-loop-distribute-patterns','-fno-asynchronous-unwind-tables',
           '-fno-unwind-tables','-fomit-frame-pointer','-Wall','-Wextra','-Werror',
           '-I'+str(HERE/'sdk_include')]
    sources=['usb_machine.c','bridge.c','engine/machine.c','engine/adapter.c','engine/ot_records.c']
    objs=[]
    for name in sources:
        obj=out/(Path(name).stem+'.o')
        subprocess.run([cross+'gcc',*flags,'-c',str(HERE/name),'-o',str(obj)],check=True);objs.append(obj)
    asm=out/'events.o';subprocess.run([cross+'as','-mcpu=54455',str(HERE/'events.s'),'-o',str(asm)],check=True);objs.append(asm)
    codegen.check_mcf54455(objs,cross+'objdump')
    image,symbols,bss,relocs=builder.link_units(objs,cross,0,out)
    declared=builder.runtime_declaration(HERE)
    hooks=builder.subscribe([builder.NONE]*4,builder.entries(declared),symbols)
    data=builder.package(image,bss,hooks,relocs,name='supersaw',abi=8,hashed=True,title='SUPERSAW')
    # Run both unmodified stock-free scans, including the packed DSP views.
    builder.firmware_codec.use_elekloader(a.upstream.resolve())
    from elekloader import formats
    parsed,device,_=formats.load(str(a.stock.resolve()));main_image=formats.main_image(parsed,device)
    # Capture only exact coincidences identified by the unmodified SDK scans.
    # No bytes are borrowed into the authored engine; install reconstructs the
    # identical words from guarded original OS spans, never from another module.
    inputs={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in [*sources,'bridge.h','events.s','runtime.json']}
    recipe=builder.capture_machine_recipe('supersaw',image,relocs,inputs,a)
    base=json.loads((a.base/'base.elemod').read_text())
    held=[(int(s['addr'],16),s['len']) for s in base['sites']]
    cleared=bytearray(image); copies=[]
    for c in recipe['copies']:
        at,n,offset=c['address'],c['length'],c['offset']
        if not 0x40000400<=at<0x400de1e0 or at+n>0x400de1e0:
            raise ValueError('Reconstruction outside the runtime-readable stock range')
        if any(at<x+size and x<at+n for x,size in held):
            raise ValueError('Reconstruction overlaps the exact paired base')
        original=main_image[at-device.main_load:at-device.main_load+n]
        if image[offset:offset+n]!=original or hashlib.sha256(original).hexdigest()!=c['sha256']:
            raise ValueError('Reconstruction byte equality failed')
        if any(offset<r+4 and r<offset+n for r in relocs):
            raise ValueError('Reconstruction overlaps a relocation')
        cleared[offset:offset+n]=bytes(n)
        copies.append((offset,at,n,bytes.fromhex(c['sha256'])))
    builder.unevented([],copies)
    data=builder.package(bytes(cleared),bss,hooks,relocs,name='supersaw',abi=8,hashed=True,title='SUPERSAW',copies=copies)
    reconstructed=bytearray(cleared)
    for offset,at,n,_ in copies:
        reconstructed[offset:offset+n]=main_image[at-device.main_load:at-device.main_load+n]
    if bytes(reconstructed)!=image:raise ValueError('Full reconstruction differs from authored image')
    builder.private_stock_free(data,a.stock.resolve(),main_image,a.upstream.resolve())
    (out/'stock-recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
    path=out/'supersaw.mwrm';path.write_bytes(data)
    evidence={'version':json.loads((HERE/'provenance.json').read_text())['version'],'kind':'private-emulator-package','moduleId':f'{builder.module_id("supersaw"):08x}',
              'packageSha256':hashlib.sha256(data).hexdigest(),'abi':8,'imageBytes':len(image),'bssBytes':bss,
              'relocations':len(relocs),'eventWords':len(hooks),'stockCodeSites':0,
              'stockCopies':len(copies),'reconstructedImageEqualsAuthored':True,
              'basePackageSha256':hashlib.sha256((a.base/'base.elemod').read_bytes()).hexdigest(),
              'typedStart':'SDK accepted','stockFree':'both unchanged strict scans passed',
              'publicRelease':False,'hardwareTested':False,'usbLifecycleTested':False,
              'sources':{n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in [*sources,'bridge.h','events.s','runtime.json']}}
    (HERE/'evidence/package-checks.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence,indent=2));print('PRIVATE EMULATOR CANDIDATE ONLY:',path)

if __name__=='__main__':main()
