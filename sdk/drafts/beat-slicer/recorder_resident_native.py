"""Compile private resident UI/engine previews with shared recorder exclusion.

Combines existing original fixtures inside the reserved arena. No exported
editor/source ABI, mutable menu reclamation, USB package or hardware claim.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from recorder_native import ROOT,run,sha

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('main','output','core-recipe'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--core-recipe-sha256',required=True)
    a=p.parse_args();repo=ROOT.parents[2];out=a.output.resolve()
    if not __debug__:p.error('Assertions must remain enabled.')
    if out.exists() or out==repo or repo in out.parents:p.error('Use fresh private output outside Git.')
    out.mkdir(parents=True)
    subprocess.run([sys.executable,'-B',str(ROOT/'resident_boot_native.py'),'--main',str(a.main),
        '--output',str(out/'ui'),'--core-recipe',str(a.core_recipe),'--core-recipe-sha256',a.core_recipe_sha256],check=True)
    subprocess.run([sys.executable,'-B',str(ROOT/'recorder_engine_native.py'),'--main',str(a.main),
        '--output',str(out/'recorder'),'--prepare'],check=True)
    ui=json.loads((out/'ui/source-boot.json').read_text());recorder=json.loads((out/'recorder/recorder-engine.json').read_text())
    assert ui['textBase']==recorder['textBase']==0x46019df0
    spec=importlib.util.spec_from_file_location('guard',repo/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    obj=out/'test_recorder_resident_engine.o'
    run('m68k-elf-gcc',*recorder['flags'],'-c',str(ROOT/'test_recorder_resident_engine.c'),'-o',str(obj));guard.check([obj])
    async_obj=out/'test_async_boot.no-direct-result.o'
    run('m68k-elf-gcc',*recorder['flags'],'-DBS_BOOT_NO_DIRECT_RESULT=1','-c',str(ROOT/'test_async_boot.c'),'-o',str(async_obj))
    guard.check([async_obj])
    objects=[out/'ui'/name for name in ui['objectSha256'] if name not in
        ('worker_boundary.o','test_worker_stock.o','test_engine_boot.o','test_async_boot.o')]
    objects += [out/'recorder'/name for name in recorder['objectSha256'] if name not in
        ('preview_guard.o','engine_boundary.o','test_recorder_engine.o')]
    objects.extend((obj,async_obj))
    elf,binary,symbols=out/'source-boot.elf',out/'source-boot.bin',out/'source-boot.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_engine_test_init','-Ttext='+hex(ui['textBase']),
        '--defsym','bs_worker_test_guard=bs_recorder_test_guard',
        '--defsym','bs_engine_test_boundary=bs_recorder_engine_boundary',*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    assert not any(row.split()[-1] in ('bs_boot_result','bs_boot_plan') for row in symbols.read_text().splitlines())
    end=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end'][0]
    if end+32>0x46025de0:p.error('Combined fixture exceeds its eight-page reservation.')
    sources=dict(ui['sourceSha256'])
    for name,value in recorder['sourceSha256'].items():
        if name in sources:assert sources[name]==value
        sources[name]=value
    sources.update({name:sha(ROOT/name) for name in ('test_recorder_resident_engine.c','recorder_resident_native.py')})
    ui.update({'scope':'Private resident UI/engine preview and recorder/preparation guard composition; compilation only',
        'sourceSha256':sources,'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{str(o.relative_to(out)):sha(o) for o in objects},'fixtureSize':run('m68k-elf-size',str(elf)).splitlines(),
        'directResultOmitted':True,'recorderComposition':True,'recorderHookSites':recorder['hookSites'],
        'preparationHookSites':recorder['preparationHookSites'],
        'sdkRevision':recorder['sdkRevision'],'sdkDependencySha256':recorder['sdkDependencySha256'],
        'codegenGuardSha256':recorder['codegenGuardSha256'],
        'nativeSourceAccess':'fixed lifetimes and immutable resident menus; production source/loader admission and USB remain unimplemented'})
    (out/'source-boot.json').write_text(json.dumps(ui,indent=2)+'\n')
    print('Compiled private recorder/resident UI composition; execution remains separate.')
if __name__=='__main__':main()
