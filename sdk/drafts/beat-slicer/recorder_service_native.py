"""Compile private shared-guard recorder/engine with an engine-owned preview service.

Compilation only. Borrowed main calls are a test driver, not production service
scheduling, owner admission, a USB package or hardware qualification.
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
    p.add_argument('--main',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();repo=ROOT.parents[2]
    if not __debug__:p.error('Assertions must remain enabled.')
    subprocess.run([sys.executable,'-B',str(ROOT/'recorder_source_native.py'),'--main',str(a.main),
        '--output',str(a.output)],check=True)
    out=a.output.resolve();report=json.loads((out/'recorder-source.json').read_text())
    spec=importlib.util.spec_from_file_location('guard',repo/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    added=[]
    for name in ('preview_async','test_recorder_service','test_recorder_engine_service'):
        obj=out/(name+'.o');run('m68k-elf-gcc',*report['flags'],'-c',str(ROOT/(name+'.c')),'-o',str(obj));added.append(obj)
    guard.check(added)
    objects=[out/name for name in report['objectSha256'] if name not in ('test_recorder_source.o','test_recorder_engine.o')]+added
    elf,binary,symbols=out/'recorder-service.elf',out/'recorder-service.bin',out/'recorder-service.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_recorder_engine_init','-Ttext='+hex(report['textBase']),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end'][0]
    if end+32>0x46025de0:p.error('Fixture exceeds eight-page reservation.')
    names=('preview_async.c','preview_async.h','test_recorder_service.c','test_recorder_engine_service.c','recorder_service_native.py')
    report['sourceSha256'].update({name:sha(ROOT/name) for name in names})
    report.update({'scope':'Private recorder/engine-owned preview service compilation only',
        'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{o.name:sha(o) for o in objects},'sourcePreviewEnabled':True,'enginePreviewService':True,
        'nativeSourceAccess':'private fixed-lifetime engine service; production admission, retirement and USB remain unimplemented'})
    (out/'recorder-service.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Compiled private source fixture; execution and production admission remain separate.')
if __name__=='__main__':main()
