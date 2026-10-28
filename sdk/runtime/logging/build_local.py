#!/usr/bin/env python3
"""Private core-logger probe. Stock stays in a disposable directory, never CI."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
from package import compile_package, run
HERE=Path(__file__).resolve().parent
APP=HERE.parents[2]
BASE=0x40000400
STOCK_SHA='164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'
sha=lambda b:hashlib.sha256(b).hexdigest()
HOOKS=('idle','job','transport','open','read','write','close','frame_entry','frame_exit','render_first','render_second')
def json_bytes(value):return json.dumps(value,separators=(',',':')).encode()

def populate(raw,symbols,original,pkg,configuration,base):
    """Native equivalent of the browser's bounded metadata/replay installation."""
    raw=bytearray(raw); fingerprint=sha(json_bytes(configuration))
    values=dict(build=fingerprint[:16],os=configuration['os'],modules=';'.join(m['id']+'@'+m['version'] for m in configuration['modules']),configuration=fingerprint,source=configuration['source'],fx1=';'.join(configuration['fx1']),fx2=';'.join(configuration['fx2']),hidden=';'.join(configuration['hidden']))
    for name,size in pkg['fields'].items():
        data=values[name].encode('ascii'); at=symbols['olog_'+name]-base
        if len(data)>=size or at<0 or at+size>len(raw):raise ValueError('Invalid identity field')
        raw[at:at+size]=data+b'\0'*(size-len(data))
    at=symbols['octamod_log_identity']-base+32
    raw[at:at+4]=int(configuration['stockfx2']).to_bytes(4,'big')
    for key,row in pkg['guards'].items():
        at=row['address']-BASE
        if sha(original[at:at+row['length']])!=row['sha256']:raise ValueError('Stock guard mismatch: '+key)
        if key not in HOOKS:continue
        n=row.get('replay',row.get('patchLength',row['length']));dst=symbols['olog_replay_'+key]-base
        if dst<0 or dst+n>len(raw):raise ValueError('Replay out of bounds')
        raw[dst:dst+n]=original[at:at+n]
    return bytes(raw)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();original=args.stock.read_bytes();out=args.output.resolve()
    if sha(original)!=STOCK_SHA:parser.error('Original, unmodified 1.40C MAIN OS required')
    if out.is_relative_to(APP):parser.error('Output must stay outside the repository')
    out.mkdir(parents=True,exist_ok=False)
    source=out/'source';shutil.copytree(APP/'sdk/octabam/tools',source/'tools')
    (source/'out/raw').mkdir(parents=True);(source/'out/raw/section_3_MAIN_OS.bin').write_bytes(original)
    sys.path.insert(0,str(source/'tools'))
    from remix import stock,arena,platform_build
    from remix.schema import Linked
    compile_package(out/'package.json');pkg=json.loads((out/'package.json').read_text())
    keys={m.menu.fx2_id:m.key for m in stock.MODULES};keys[0]='NONE'
    module_source=json.loads((APP/'src/engine/assets/module-build.json').read_text())['sourceTreeSha256']
    source_hash=sha(json_bytes(dict(core=pkg['sourceSha256'],modules=module_source)))
    configuration=dict(fx1=[keys[i] for i in stock.fx1_order()],fx2=[keys[i] for i in stock._chooser_order(stock.FX2_CHOOSER)],hidden=[],logger=pkg['version'],modules=[],os='1.40C',source=source_hash,stockfx2=True)
    reserve=('core logger','bottom',16);placed,_,_=arena.layout([reserve]);retained=placed[0].end-8192
    defs={'octamod_log_retained':retained,'octamod_log_io':((retained+6144+511)&~511)+0x08000000}
    (out/'core.o').write_bytes(bytes.fromhex(pkg['code']))
    def native_link(units,work,externals,base,includes=None):
        work.mkdir(parents=True,exist_ok=True)
        run(['m68k-elf-ld',f'-Ttext=0x{base:x}',*[f'--defsym={n}=0x{v:x}' for n,v in externals.items()],'-o',work/'runtime.elf',out/'core.o'])
        run(['m68k-elf-objcopy','-O','binary',work/'runtime.elf',work/'runtime.bin'])
        symbols=platform_build._nm(work/'runtime.elf',work)
        return populate((work/'runtime.bin').read_bytes(),symbols,original,pkg,configuration,base),symbols
    platform_build.link_runtime=native_link
    append,symbols,boot,_=platform_build.build([('core logger',Linked('core','unused',dram=True))],[],out/'platform',reserve=(placed[0].start,retained-placed[0].start),defsyms=defs)
    image=bytearray(original);writes=[*arena.pokes([reserve]),boot]
    for key in HOOKS:
        row=pkg['guards'][key];n=row.get('patchLength',row['length']);at=row['address']-BASE
        writes.append((row['address'],original[at:at+n],b'\x4e\xf9'+symbols['olog_'+key+'_hook'].to_bytes(4,'big')+b'\x4e\x71'*((n-6)//2),key))
    for address,expected,value,_ in writes:
        at=address-BASE
        if image[at:at+len(expected)]!=bytes(expected):raise ValueError('Overlapping/invalid native write')
        image[at:at+len(value)]=value
    image.extend(append);(out/'mainos.bin').write_bytes(image)
    (out/'symbols.json').write_text(json.dumps(symbols,sort_keys=True,indent=2)+'\n')
    (out/'build.json').write_text(json.dumps(dict(version=pkg['version'],configuration=configuration,configurationHash=sha(json_bytes(configuration)),imageSha256=sha(image),coreSource=pkg['sourceSha256'],reserve=dict(start=placed[0].start,end=placed[0].end,bytes=placed[0].end-placed[0].start,retained=retained),qualification='private core-only probe, not hardware qualification'),indent=2)+'\n')
    print('Built private core-only probe. Keep firmware and intermediates local.')
if __name__=='__main__':main()
