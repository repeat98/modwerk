"""Compile private shared-guard recorder/engine plus fixed-lifetime Flex previews.

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
    subprocess.run([sys.executable,'-B',str(ROOT/'recorder_engine_native.py'),'--main',str(a.main),
        '--output',str(a.output),'--prepare'],check=True)
    out=a.output.resolve();report=json.loads((out/'recorder-engine.json').read_text())
    spec=importlib.util.spec_from_file_location('guard',repo/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    added=[]
    for name in ('planner','planner_job','pcm_reader','preview_session','flex_metadata','flex_copy','flex_source','test_recorder_source'):
        obj=out/(name+'.o');run('m68k-elf-gcc',*report['flags'],'-c',str(ROOT/(name+'.c')),'-o',str(obj));added.append(obj)
    obj=out/'flex_lookup.o';run('m68k-elf-gcc','-mcpu=5475','-c',str(ROOT/'flex_lookup.S'),'-o',str(obj));added.append(obj)
    guard.check(added)
    objects=[out/name for name in report['objectSha256']]+added
    elf,binary,symbols=out/'recorder-source.elf',out/'recorder-source.bin',out/'recorder-source.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_recorder_engine_init','-Ttext='+hex(report['textBase']),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end'][0]
    if end+32>0x46025de0:p.error('Fixture exceeds eight-page reservation.')
    from test_flex_source import SOURCES
    names=(*[n for n in SOURCES if not n.startswith('test_')], 'test_flex_source.py',
        'test_source_boot.c','test_recorder_source.c','recorder_source_native.py','flex_lookup.S')
    report['sourceSha256'].update({name:sha(ROOT/name) for name in names})
    report.update({'scope':'Private shared recorder/engine guard plus fixed-lifetime Flex preview compilation only',
        'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{o.name:sha(o) for o in objects},'sourcePreviewEnabled':True,
        'nativeSourceAccess':'private fixed-lifetime test fixture only; production admission and scheduling are not implemented'})
    (out/'recorder-source.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Compiled private source fixture; execution and production admission remain separate.')
if __name__=='__main__':main()
