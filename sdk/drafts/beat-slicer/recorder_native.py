"""Compile private recorder entry/return observers; no production hook or ABI.

Stock replay bytes are hash-checked and kept only in private output. A native
paired runner separately checks stock behavior and observer state.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
from inspect_stock import STOCK_MAIN_SHA256
ROOT=Path(__file__).resolve().parent
SITES={
    'enter':{'address':0x400068e4,'length':8,'sha256':'c37ae892e5ce12f10f2658717beb991455bbb898e42b08f0d620f7dab7b1d69c'},
    'leave':{'address':0x40007954,'length':8,'sha256':'46e9fe8321dbc1c3dbf1bd6cdbd5d83a847fac0b18983bcb1646cc3e79a4ba55'},
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):return subprocess.check_output(args,text=True).strip()
def interior_scan(stock,sites=None):
    # Deliberately conservative encoding/literal leads, not a disassembler or
    # complete control-flow proof. Indirect targets remain a separate review.
    load=0x40000400
    targets={s['address']+i for s in (SITES if sites is None else sites).values() for i in range(2,s['length'],2)}
    branches=[]
    for i in range(0,len(stock)-6,2):
        word=int.from_bytes(stock[i:i+2],'big');target=None
        if word&0xf000==0x6000:
            displacement=word&255
            if displacement==0:displacement=int.from_bytes(stock[i+2:i+4],'big',signed=True)
            elif displacement==255:displacement=int.from_bytes(stock[i+2:i+6],'big',signed=True)
            elif displacement>=128:displacement-=256
            target=load+i+2+displacement
        elif word&0xf0f8==0x50c8 or word in (0x4efa,0x4eba):
            target=load+i+2+int.from_bytes(stock[i+2:i+4],'big',signed=True)
        elif word in (0x4ef9,0x4eb9):target=int.from_bytes(stock[i+2:i+6],'big')
        if target in targets:branches.append({'from':load+i,'target':target})
    literals=[]
    for target in sorted(targets):
        at=0;needle=target.to_bytes(4,'big')
        while (at:=stock.find(needle,at))>=0:
            literals.append({'at':load+at,'target':target});at+=1
    return {'scope':'Aligned encoding and absolute-literal leads only; indirect/control-flow completeness unqualified',
            'interiorTargets':sorted(targets),'branchCandidates':branches,'literalCandidates':literals}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--text-base',type=lambda x:int(x,0),default=0x47040000)
    p.add_argument('--main',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--executable',type=Path)
    p.add_argument('--compile-only',action='store_true')
    a=p.parse_args()
    if not __debug__:p.error('Assertions must remain enabled.')
    if sha(a.main)!=STOCK_MAIN_SHA256:p.error('Private MAIN identity differs.')
    if a.text_base not in (0x47040000,0x46019df0):p.error('Unsupported fixture placement.')
    if not a.compile_only and (not a.executable or a.text_base!=0x47040000):p.error('Isolated runner required.')
    out,repo=a.output.resolve(),ROOT.parents[2]
    if out.exists() or out==repo or repo in out.parents:p.error('Use fresh private output outside Git.')
    out.mkdir(parents=True)
    spec=importlib.util.spec_from_file_location('guard',repo/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    flags=['-std=c99','-mcpu=5475','-msoft-float','-O2','-ffreestanding','-fno-builtin',
           '-fno-common','-fno-jump-tables','-fno-tree-loop-distribute-patterns',
           '-fno-optimize-sibling-calls','-fno-asynchronous-unwind-tables','-fno-unwind-tables',
           '-fno-ident','-fstack-usage','-Wall','-Wextra','-Werror','-pedantic',*guard.FLAGS]
    objects=[]
    for name in ('preview_guard','recorder_boundary','test_recorder_boundary','test_recorder_stock'):
        obj=out/(name+'.o');run('m68k-elf-gcc',*flags,'-c',str(ROOT/(name+'.c')),'-o',str(obj));objects.append(obj)
    guard.check(objects)
    stock=a.main.read_bytes();scan=interior_scan(stock)
    if scan['branchCandidates'] or scan['literalCandidates']:p.error('Review incoming interior-target leads before patching.')
    assembly=['.text','.align 2']
    for name,site in SITES.items():
        address,length=site['address'],site['length']
        replay=stock[address-0x40000400:address-0x40000400+length]
        assert hashlib.sha256(replay).hexdigest()==site['sha256']
        private=out/(name+'-replay.private.bin');private.write_bytes(replay)
        # MOVEM/LEA do not alter CCR. Save SR through D0 after saving D0;
        # restore SR before MOVEM restores D0. The 64-byte frame has 60 bytes
        # of registers, two of SR and two padding. C gets its original base.
        assembly += [f'.globl bs_recorder_{name}_entry',f'bs_recorder_{name}_entry:',
            'lea -64(%sp),%sp','movem.l %d0-%d7/%a0-%a6,(%sp)',
            'move.w %sr,%d0','move.w %d0,60(%sp)','move.l %sp,%a0',
            'lea -4(%sp),%sp','move.l %a0,(%sp)',f'jsr bs_recorder_test_{name}',
            'lea 4(%sp),%sp','move.w 60(%sp),%d0','move.w %d0,%sr',
            'movem.l (%sp),%d0-%d7/%a0-%a6','lea 64(%sp),%sp',
            f'.incbin "{private}"',f'jmp {address+length:#x}']
    asm=out/'recorder-hooks.private.S';asm.write_text('\n'.join(assembly)+'\n')
    obj=out/'recorder-hooks.private.o';run('m68k-elf-gcc','-mcpu=5475','-c',str(asm),'-o',str(obj));objects.append(obj)
    elf,binary,symbols=out/'recorder.elf',out/'recorder.bin',out/'recorder.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_recorder_test_init','-Ttext='+hex(a.text_base),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end'][0]
    if end+32>a.text_base+(49136 if a.text_base==0x46019df0 else 65536):p.error('Fixture exceeds reservation.')
    names=('recorder_native.py','recorder_boundary.c','recorder_boundary.h','preview_guard.c','preview_guard.h',
           'test_recorder_boundary.c','test_recorder_stock.c','stock_probe/recorder_native_probe.cpp',
           'stock_probe/recorder_probe.cpp','stock_probe/CMakeLists.txt','inspect_stock.py')
    report={'scope':'Private compiled recorder entry/return observer; synthetic isolated execution, no source service or physical timing',
        'mainSha256':STOCK_MAIN_SHA256,'textBase':a.text_base,'fixtureEnd':end,'hookSites':SITES,
        'interiorScan':scan,'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'compiler':run('m68k-elf-gcc','--version').splitlines()[0],
        'flags':flags,'sourceSha256':{n:sha(ROOT/n) for n in names},'objectSha256':{o.name:sha(o) for o in objects},
        'codegenGuard':'passed','freestandingLink':True,
        'boundarySize':run('m68k-elf-size',str(out/'recorder_boundary.o')).splitlines(),
        'boundaryStackUsage':(out/'recorder_boundary.su').read_text().splitlines(),
        'hardware':'not tested','audio':'not tested','timing':'not measured','nativeSourceAccess':'not implemented'}
    if not a.compile_only:
        r=subprocess.run([str(a.executable.resolve()),str(a.main.resolve()),str(binary),str(symbols)],text=True,capture_output=True,timeout=600)
        inputs=('recorder_native_probe.cpp','recorder_probe.cpp','../preview_guard.c','../preview_guard.h')
        binding=''.join(n+':'+sha(ROOT/'stock_probe'/n)+'\n' for n in inputs)
        if 'SOURCE_SHA256: '+hashlib.sha256(binding.encode()).hexdigest() not in r.stdout.splitlines():p.error('Rebuild runner from current source.')
        report.update({'exitCode':r.returncode,'stdout':r.stdout.splitlines(),'stderrLines':len(r.stderr.splitlines()),
                       'stderrSha256':hashlib.sha256(r.stderr.encode()).hexdigest(),'runnerSha256':sha(a.executable)})
        print(r.stdout,end='')
        if r.returncode:print(r.stderr,end='')
    (out/'recorder.json').write_text(json.dumps(report,indent=2)+'\n')
    if not a.compile_only:raise SystemExit(r.returncode)
    print('Compiled private recorder fixture; execution remains separate.')
if __name__=='__main__':main()
