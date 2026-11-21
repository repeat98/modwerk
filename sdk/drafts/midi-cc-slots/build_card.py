#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Private standalone card candidate using the unchanged Elekloader core/linker.

Translate the reviewed USB image without recompiling its implementation. Stock
copies remain format-2 references. Firmware outputs must stay outside Git.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys

HERE=Path(__file__).resolve().parent
APP=HERE.parents[2]
CARD_VERSION='0.0.14-experimental'


def sha(data):return hashlib.sha256(data).hexdigest()


def card_document(data,target):
    def require(ok,message):
        if not ok:raise ValueError(message)
    def take(n):
        nonlocal cursor
        require(0<=n<=len(data)-cursor,'Truncated runtime package')
        value=data[cursor:cursor+n];cursor+=n;return value
    require(len(data)>=92 and data[:8]==b'MWRM'+struct.pack('>HH',8,0),'Expected the reviewed ABI-8 hashed package')
    image_len,bss,reloc_count,hook_count,site_count,module=struct.unpack_from('>6I',data,8)
    copy_count,fills=struct.unpack_from('>2I',data,68)
    require(bss==fills==0 and hook_count==4 and site_count==24 and 0<image_len<1024*1024,'Unsupported runtime layout')
    require(module==int(sha(b'midi-cc-slots')[:8],16),'Wrong runtime module')
    cursor=76;hooks=struct.unpack('>4I',take(16));image=bytearray(take(image_len))
    require(all(hooks[i]!=0xffffffff for i in [0,2,3]),'Missing tick/key/encoder handler')
    relocs=[];previous=-1;relocated=[]
    for _ in range(reloc_count):
        at=struct.unpack('>I',take(4))[0]
        require(previous<at<=len(image)-4 and at%2==0,'Invalid image relocation')
        value=struct.unpack_from('>I',image,at)[0];require(value<len(image),'External image relocation')
        relocs.append(['.run',at,'abs32','sec:.run',value]);image[at:at+4]=bytes(4);previous=at;relocated.append(at)
    sites=[]
    for _ in range(site_count):
        addr,n,keep,checked,count=struct.unpack('>IBBBB',take(8));guard=take(32).hex();code=bytearray(take(n))
        require(keep==0 and n==checked and 0<n<=32,'Invalid site extent')
        offsets=struct.unpack('>'+str(count)+'H',take(count*2));fix=[]
        require(len(set(offsets))==len(offsets),'Duplicate site relocation')
        for at in offsets:
            require(at+4<=n,'Invalid site relocation');value=struct.unpack_from('>I',code,at)[0]
            require(value<len(image),'External site relocation');fix.append([at,'abs32','sec:.run',value]);code[at:at+4]=bytes(4)
        sites.append({'addr':hex(addr),'len':n,'stock_sha256':guard,'new':code.hex(),'kind':'code' if code[:2] in (b'\x4e\xf9',b'\x4e\xb9') else 'data','relocs':fix})
    copies=[]
    for _ in range(copy_count):
        at,addr,n,reserved=struct.unpack('>IIHH',take(12));guard=take(32).hex()
        require(not reserved and n>0 and at+n<=len(image) and not any(image[at:at+n]),'Invalid stock copy')
        require(not any(at<r+4 and r<at+n for r in relocated),'Stock copy overlaps a relocation')
        copies.append((at,addr,n,guard))
    require(cursor==len(data),'Trailing package data')
    parts=[];at=0
    for start,addr,n,_ in sorted(copies):
        require(start>=at,'Overlapping stock copies')
        if start>at:parts.append(['hex',image[at:start].hex()])
        parts.append(['stock',addr,n]);at=start+n
    if at<len(image):parts.append(['hex',image[at:].hex()])
    symbols={};contribute=[]
    for event,value in zip(['tick','draw','key','enc'],hooks):
        if value==0xffffffff:continue
        require(value<len(image),'Invalid hook offset');name='midi_mode2_'+event;symbols[name]=['.run',value]
        contribute.append({'to':'ev_'+event,'order':60,'data':'00000000','relocs':[[0,'abs32','sym:'+name,0]],'claims':[]})
    document={'elemod':2,'id':'midi-cc-slots','version':CARD_VERSION,'title':'Midi Mode 2 — standalone card test',
              'description':'Private card candidate; same implementation as the reviewed USB package. No saved runtime set required.',
              'author':'Cooper Scobey','license':'MIT','category':'MIDI & USB','target':target,
              'sections':{'.run':{'align':16,'len':len(image),'parts':parts}},'symbols':symbols,'exports':[],
              'imports':[],'relocs':relocs,'sites':sites,'contribute':contribute,'requires':['core']}
    return document,copies


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['stock','upstream','output']:p.add_argument('--'+name,type=Path,required=True)
    args=p.parse_args();out=args.output.resolve()
    if out.exists() or any((parent/'.git').exists() for parent in [out,*out.parents]):p.error('Choose a new output outside every Git checkout')
    upstream=args.upstream.resolve();pin=json.loads((APP/'vendor/elekloader/kit/kit.json').read_text())['commit']
    git=lambda *cmd:subprocess.check_output(['git','-C',str(upstream),*cmd],text=True).strip()
    if git('rev-parse','HEAD')!=pin or git('status','--porcelain','--untracked-files=no'):p.error('Use the exact clean Elekloader checkout pinned by the app')
    sys.path.insert(0,str(upstream))
    from elekloader import devices,formats,patch
    from elekloader.sdk import build as sdk
    original_file_hash=sha(args.stock.read_bytes())
    stock,device,release=formats.load(str(args.stock));original=formats.main_image(stock,device)
    if device.key!='octatrack' or release.version!='1.40C' or sha(original)!=release.main_sha256:p.error('Original Octatrack OS 1.40C required')
    out.mkdir(mode=0o700);runtime=out/'trial.mwrm'
    subprocess.run([sys.executable,'-B',str(HERE/'build_runtime.py'),'--profile','--project-template','--output',str(runtime),'--receipt',str(out/'runtime-symbols.json')],check=True)
    data=runtime.read_bytes();review=json.loads((HERE/'legacy-build.json').read_text())
    if sha(data)!=review['sha256'] or len(data)!=review['bytes']:raise ValueError('Runtime differs from the reviewed USB implementation')
    document,copies=card_document(data,devices.target_of(device,release))
    for _,address,n,digest in copies:
        if sha(original[address-device.main_load:address-device.main_load+n])!=digest:raise ValueError('Stock-copy guard failed')
    module=out/f'midi-mode2-{CARD_VERSION}.elemod';module.write_text(json.dumps(document,indent=1)+'\n')
    os.environ['ELEKLOADER_CROSS']='m68k-elf-'
    core,_=sdk.build(str(upstream/'mods/core-ot'),str(args.stock),str(out/'core'))
    # Shared card-platform branding, independent of the MIDI implementation.
    spec=importlib.util.spec_from_file_location('modwerk_card_art',APP/'sdk/runtime/startup/build.py')
    artwork=importlib.util.module_from_spec(spec);spec.loader.exec_module(artwork)
    core_doc=json.loads(Path(core).read_text())
    for guard,authored in artwork.writes():
        at=guard['address']-device.main_load
        if sha(original[at:at+len(authored)])!=guard['sha256']:raise ValueError('Startup artwork guard failed')
        core_doc['sites'].append({'addr':hex(guard['address']),'len':len(authored),'stock_sha256':guard['sha256'],'new':authored.hex(),'kind':'data'})
    core_doc.update(version='0.3.1-modwerk-card.1',title='Modwerk standalone card platform',license='GPL-3.0-or-later',author='irpina; Modwerk contributors (startup artwork)')
    core=out/'core-modwerk.elemod';core.write_text(json.dumps(core_doc,indent=1)+'\n')
    outputs,manifest=patch.build(str(args.stock),[str(core),str(module)],version='MIDI2-C14')
    written=patch.save(outputs,manifest,str(out/'Midi-Mode-2-card-test.syx'))
    # A raw MAIN for emulator boot, decoded from the actual packaged card file.
    packed=formats.parse(outputs['bin'],device)
    main_image=formats.main_image(packed,device);(out/'card-MAIN.private.bin').write_bytes(main_image)
    if sha(args.stock.read_bytes())!=original_file_hash:raise ValueError('Original firmware changed during packaging')
    receipt={'cardVersion':CARD_VERSION,'usbImplementationVersion':review['version'],'usbPackageSha256':sha(data),
             'toolCommit':pin,'originalFirmwareSha256':original_file_hash,'mainSha256':sha(main_image),
             'outputs':{Path(name).name:sha(Path(name).read_bytes()) for name in written},
             'corePackageSha256':sha(Path(core).read_bytes()),'modulePackageSha256':sha(module.read_bytes()),
             'hardware':'not tested','scope':'Standalone only; not a public catalogue release or mixed-module card build.'}
    (out/'card-build.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))


if __name__=='__main__':main()
