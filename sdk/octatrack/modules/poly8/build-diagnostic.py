#!/usr/bin/env python3
"""Private native POLY/core-logger composition. Run from a disposable SDK.
No shared builder or logger source changes; original stock is guarded.
"""
import hashlib,json,os,runpy,sys
from pathlib import Path

sdk=Path.cwd().resolve()
root=sdk.parents[1]
if any((p/'.git').exists() for p in (sdk,*sdk.parents)):
    raise SystemExit('Build only in disposable /private/tmp staging')
(sdk/'remixes/poly8.py').write_bytes((Path(__file__).parent/'remix.py').read_bytes())
sys.path.insert(0,str(sdk/'tools'))
sys.path.insert(0,str(root/'sdk/runtime/logging'))
from package import compile_package
from build_local import populate,STOCK_SHA,BASE
from remix import platform_build,stock
out=sdk/'out/poly-diagnostic';out.mkdir(parents=True,exist_ok=True)
original=(sdk/'out/raw/section_3_MAIN_OS.bin').read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
if sha(original)!=STOCK_SHA:raise SystemExit('Original 1.40C MAIN required')
compile_package(out/'core.json');pkg=json.loads((out/'core.json').read_text())
(out/'core.o').write_bytes(bytes.fromhex(pkg['code']))
inputs=('polyphony.s','pool.c','recording.c','registration.c','registration-hooks.s','registration.s','diagnostics.c','manifest.py','prepare-registration.py','build-diagnostic.py','remix.py','shared-machine.c','shared-machine-hooks.s','shared-machine.s','prepare-shared-machine.py','composition.json')
source={name:sha((Path(__file__).parent/name).read_bytes()) for name in inputs}
source_hash=sha(json.dumps(dict(poly=source,core=pkg['sourceSha256']),sort_keys=True,separators=(',',':')).encode())
keys={m.menu.fx2_id:m.key for m in stock.MODULES};keys[0]='NONE'
configuration=dict(fx1=[keys[i] for i in stock.fx1_order()],fx2=[keys[i] for i in stock._chooser_order(stock.FX2_CHOOSER)],hidden=[],logger=pkg['version'],modules=[dict(id='poly8',version=json.loads((Path(__file__).parent/'octamod.module.json').read_text())['version'])],os='1.40C',source=source_hash,stockfx2=True)
native_run=platform_build._run
def link_run(args,cwd):
    if args[0]=='m68k-elf-ld' and any(str(a).endswith('runtime.elf') for a in args):
        args=[*args,out/'core.o']
    return native_run(args,cwd)
platform_build._run=link_run
native_link=platform_build.link_runtime
def link(units,work,defs,base,includes=None,region_symbols=(),unit_defs=None):
    raw,symbols=native_link(units,work,defs,base,includes,region_symbols,unit_defs)
    raw=populate(raw,symbols,original,pkg,configuration,base)
    (work/'runtime.bin').write_bytes(raw)
    return raw,symbols
platform_build.link_runtime=link
native_build=platform_build.build
final={}
def build(units,payloads,work,reserve=None,defsyms=None,**kwargs):
    if reserve is None:raise ValueError('POLY runtime reservation missing')
    base,size=reserve;retained=base+size-8192
    defs=dict(defsyms or {},octamod_log_retained=retained,
              octamod_log_io=((retained+6144+511)&~511)+0x08000000)
    result=native_build(units,payloads,work,reserve=(base,size-8192),defsyms=defs,**kwargs)
    final.update(symbols=result[1],retained=retained,reserve=dict(base=base,bytes=size))
    return result
platform_build.build=build
os.environ.update(REMIX='poly8',BUILD='15',XBUS='1',SPEC='1',OCTAMOD_CORE_LOGGER_PAGES='16',OCTABAM_STATIC_STOCK='1')
runpy.run_path(str(sdk/'tools/build/build_bus.py'),run_name='__main__')
image=bytearray((sdk/'out/mainos_bus.bin').read_bytes());symbols=final['symbols']
# POLY is ColdFire-only. This private profile must never acquire a DSP loader
# through the SDK's automatic platform selection, or alter either stock upload.
from remix import registry
selected=registry.remix('poly8')
if any(registry.modules()[k].dynamic_stock for k in selected.modules):
    raise ValueError('Private POLY profile unexpectedly carries a DSP loader')
from dsp_modmap import PAYLOADS
dsp_payloads={}
for tag,address,length in PAYLOADS:
    at=address-BASE;before=original[at:at+length];after=image[at:at+length]
    if after!=before:raise ValueError('Private POLY changed original DSP payload '+tag)
    dsp_payloads[tag]=dict(address=address,bytes=length,sha256=sha(after),original=True)

for key in ('idle','job','transport','open','read','write','close'):
    row=pkg['guards'][key];n=row.get('patchLength',row['length']);at=row['address']-BASE
    if image[at:at+n]!=original[at:at+n]:raise ValueError('Logger hook overlaps module: '+key)
    image[at:at+n]=b'\x4e\xf9'+symbols['olog_'+key+'_hook'].to_bytes(4,'big')+b'\x4e\x71'*((n-6)//2)
(sdk/'out/mainos_bus.bin').write_bytes(image)
(out/'report.json').write_text(json.dumps(dict(version=json.loads((Path(__file__).parent/'octamod.module.json').read_text())['version'],configuration=configuration,imageSha256=sha(image),coreSource=pkg['sourceSha256'],polySources=source,dspPayloads=dsp_payloads,staticStock=True,**final),indent=2)+'\n')
print('T06 POLY + core logger + original DSP payloads composed with guarded hooks; MAIN SHA256 '+sha(image))
