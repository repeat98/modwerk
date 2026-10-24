"""Compile private resident selection-context wrappers around the pinned dispatcher.

All replay bytes and built images stay private. No production hook/ABI is added.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from source_boot_native import ROOT, run, sha


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('output','main','core-recipe'): p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--core-recipe-sha256',required=True)
    a=p.parse_args()
    subprocess.run([sys.executable,'-B',str(ROOT/'async_ui_native.py'),'--output',str(a.output),
                    '--main',str(a.main),'--core-recipe',str(a.core_recipe),
                    '--core-recipe-sha256',a.core_recipe_sha256],check=True)
    out=a.output.resolve();receipt=out/'source-boot.json';report=json.loads(receipt.read_text())
    stock=a.main.read_bytes();entry,tail,target=0x4006d8f4,0x4006d91c,0x40020c28
    replay=stock[entry-0x40000400:entry-0x40000400+6]
    tail_bytes=stock[tail-0x40000400:tail-0x40000400+6]
    assert len(replay)==6 and tail_bytes==bytes.fromhex('4ef9')+target.to_bytes(4,'big')
    replay_path=out/'selection-entry-replay.private.bin';replay_path.write_bytes(replay)
    spec=importlib.util.spec_from_file_location('guard',ROOT.parents[2]/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    added=[]
    for name in ('selection_context','test_selection_native','test_selection_menu','test_selection_ui'):
        obj=out/(name+'.o');run('m68k-elf-gcc',*report['flags'],'-c',str(ROOT/(name+'.c')),'-o',str(obj));added.append(obj)
    guard.check(added)
    # No nested JSR into stock: it must see the original argument and return
    # layout. A resident post-return trampoline restores the original return
    # slot before RTS. Stack1 retains stock's callback-argument overwrite.
    save=['lea -64(%sp),%sp','movem.l %d0-%d7/%a0-%a6,(%sp)',
          'move.w %sr,%d0','move.l %d0,60(%sp)','move.w #0x2700,%sr']
    restore=['move.l 60(%sp),%d0','move.w %d0,%sr',
             'movem.l (%sp),%d0-%d7/%a0-%a6','lea 64(%sp),%sp']
    assembly=['.text','.align 2','.globl bs_selection_entry','bs_selection_entry:',*save,
              'lea 64(%sp),%a0','move.l %a0,-(%sp)','move.l (%a0),-(%sp)',
              'jsr bs_native_selection_enter','addq.l #8,%sp','tst.l %d0','beq bs_selection_refuse_nested',
              'move.l #bs_selection_return,%d0','move.l %d0,64(%sp)',*restore,f'.incbin "{replay_path}"',f'jmp {entry+6:#x}',
              'bs_selection_refuse_nested:',*restore,'moveq #0,%d0','rts',
              '.globl bs_selection_tail','bs_selection_tail:',*save,
              'lea 64(%sp),%a0','move.l %a0,-(%sp)','move.l 4(%a0),-(%sp)',
              'jsr bs_native_selection_arm','addq.l #8,%sp',*restore,f'jmp {target:#x}',
              '.globl bs_selection_return','bs_selection_return:',
              'lea -68(%sp),%sp','movem.l %d0-%d7/%a0-%a6,(%sp)',
              'move.w %sr,%d0','move.l %d0,60(%sp)','move.w #0x2700,%sr',
              'lea 68(%sp),%a0','move.l %a0,-(%sp)','jsr bs_native_selection_leave','addq.l #4,%sp',
              'move.l %d0,64(%sp)',*restore,'.globl bs_selection_return_rts','bs_selection_return_rts:','rts']
    asm=out/'selection-hooks.private.S';asm.write_text('\n'.join(assembly)+'\n')
    obj=out/'selection-hooks.private.o';run('m68k-elf-gcc','-mcpu=5475','-c',str(asm),'-o',str(obj));added.append(obj)
    objects=[out/name for name in report['objectSha256'] if name not in ('test_menu_boot.o','test_async_ui.o')]+added
    elf,binary,symbols=out/'source-boot.elf',out/'source-boot.bin',out/'source-boot.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_engine_test_init','-Ttext='+hex(report['textBase']),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end,=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end']
    if end+32>0x46025de0:p.error('Selection fixture exceeds its eight-page reservation.')
    import hashlib
    report.update({'scope':'Private resident selection-context fixture; compilation only, no production ABI or loader retirement',
        'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{o.name:sha(o) for o in objects},'fixtureSize':run('m68k-elf-size',str(elf)).splitlines(),
        'selectionSize':run('m68k-elf-size',str(out/'selection_context.o')).splitlines(),
        'selectionStackUsage':(out/'selection_context.su').read_text().splitlines(),
        'selectionHooksSha256':sha(asm),
        'selectionSites':{'entry':{'address':entry,'length':6,'sha256':hashlib.sha256(replay).hexdigest()},
                          'tail':{'address':tail,'length':6,'sha256':hashlib.sha256(tail_bytes).hexdigest(),'stockTarget':target}}})
    report['sourceSha256'].update({n:sha(ROOT/n) for n in ('selection_boot_native.py','selection_context.c','selection_context.h','test_selection_native.c','test_selection_menu.c','test_selection_ui.c')})
    receipt.write_text(json.dumps(report,indent=2)+'\n')
    print('Compiled private selection-context fixture; execution remains separate.')


if __name__=='__main__':main()
