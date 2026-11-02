"""Compile private repeated-menu admission with immutable resident layouts.

No loader reclamation, production ABI or installable package is implied.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from source_boot_native import ROOT,run,sha

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('output','main','core-recipe'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--core-recipe-sha256',required=True);a=p.parse_args()
    subprocess.run([sys.executable,'-B',str(ROOT/'selection_boot_native.py'),'--output',str(a.output),
                    '--main',str(a.main),'--core-recipe',str(a.core_recipe),
                    '--core-recipe-sha256',a.core_recipe_sha256],check=True)
    out=a.output.resolve();receipt=out/'source-boot.json';report=json.loads(receipt.read_text())
    spec=importlib.util.spec_from_file_location('guard',ROOT.parents[2]/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    added=[]
    for name in ('resident_menu','test_resident_menu_boot','test_resident_selection','test_resident_ui'):
        obj=out/(name+'.o');run('m68k-elf-gcc',*report['flags'],'-c',str(ROOT/(name+'.c')),'-o',str(obj));added.append(obj)
    guard.check(added)
    objects=[out/n for n in report['objectSha256'] if n not in ('test_selection_menu.o','test_selection_native.o','test_selection_ui.o')]+added
    elf,binary,symbols=out/'source-boot.elf',out/'source-boot.bin',out/'source-boot.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_engine_test_init','-Ttext='+hex(report['textBase']),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end,=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end']
    if end+32>0x46025de0:p.error('Resident-menu fixture exceeds its eight-page reservation.')
    sizes={row.split()[-1]:int(row.split()[1],16) for row in run('m68k-elf-nm','-S',str(elf)).splitlines() if len(row.split())==4}
    report.update({'scope':'Private immutable resident-menu fixture; fixed owner/layout and pinned storage, no production loader retirement',
        'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{o.name:sha(o) for o in objects},'fixtureSize':run('m68k-elf-size',str(elf)).splitlines(),
        'residentMenuBytes':{n:sizes[n] for n in ('bs_resident_six','bs_resident_nine')},
        'residentSize':run('m68k-elf-size',str(out/'resident_menu.o')).splitlines(),
        'residentStackUsage':(out/'resident_menu.su').read_text().splitlines()})
    report['sourceSha256'].update({n:sha(ROOT/n) for n in ('resident_boot_native.py','resident_menu.c','resident_menu.h','test_resident_menu_boot.c','test_resident_selection.c','test_resident_ui.c')})
    receipt.write_text(json.dumps(report,indent=2)+'\n');print('Compiled immutable resident-menu fixture; execution remains separate.')

if __name__=='__main__':main()
