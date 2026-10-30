"""Compile private recorder plus existing base-owned engine hook composition.

No production hook/event, source reader or package is enabled. Replay bytes stay
in private output; full-boot execution is a separate, source-bound experiment.
"""
import argparse
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from recorder_native import ROOT,run,sha,interior_scan

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--main',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--prepare',action='store_true',help='Also bracket complete stock preparation calls.')
    p.add_argument('--text-base',type=lambda x:int(x,0),default=0x46019df0)
    p.add_argument('--executable',type=Path)
    a=p.parse_args();repo=ROOT.parents[2]
    if not __debug__:p.error('Assertions must remain enabled.')
    if a.text_base not in (0x46019df0,0x47040000):p.error('Unsupported placement.')
    if a.executable and a.text_base!=0x47040000:p.error('The isolated runner needs its isolated placement.')
    pin=json.loads((ROOT/'recorder-engine-runtime-sources.json').read_text())
    for name,expected in pin['sha256'].items():
        if sha(repo/name)!=expected:p.error('SDK dependency differs: '+name)
    subprocess.run([sys.executable,'-B',str(ROOT/'recorder_native.py'),'--main',str(a.main),
                    '--output',str(a.output),'--compile-only','--text-base',hex(a.text_base)],check=True)
    out=a.output.resolve();receipt=out/'recorder.json';report=json.loads(receipt.read_text())
    spec=importlib.util.spec_from_file_location('guard',repo/'sdk/runtime/m68k_codegen.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    added=[]
    for name in ('engine_boundary','test_recorder_engine',*(('test_recorder_prepare',) if a.prepare else ())):
        obj=out/(name+'.o');run('m68k-elf-gcc',*report['flags'],'-c',str(ROOT/(name+'.c')),'-o',str(obj));added.append(obj)
    guard.check(added)
    guards=json.loads((repo/'sdk/runtime/logging/stock-guards.json').read_text());stock=a.main.read_bytes()
    assembly=['.text','.align 2']
    preparation={
        'enter':{'address':0x40005ff0,'length':8,'sha256':'528455adb37f738a3aa0af9ef04cc1c0069f81405025b7f0cea526cbba9389e4'},
        'leave':{'address':0x4000670a,'length':8,'sha256':'b3c64cdb09d421052742154877f60c4cd52e8cc5e54d70ff2c9186a53256225a'},
    } if a.prepare else {}
    prep_scan=interior_scan(stock,preparation)
    if prep_scan['branchCandidates'] or prep_scan['literalCandidates']:p.error('Review preparation interior-target leads.')
    for name,address in (('idle',0x4008484e),('job',0x4008485e)):
        site=guards[name];assert site['address']==address and site['length']==6
        replay=stock[address-0x40000400:address-0x40000400+6]
        import hashlib
        assert hashlib.sha256(replay).hexdigest()==site['sha256']
        private=out/(name+'-replay.private.bin');private.write_bytes(replay)
        assembly += [f'.globl bs_recorder_engine_{name}_entry',f'bs_recorder_engine_{name}_entry:',
            'lea -64(%sp),%sp','movem.l %d0-%d7/%a0-%a6,(%sp)',
            'move.w %sr,%d0','move.w %d0,60(%sp)','move.l %sp,%a0',
            'lea -4(%sp),%sp','move.l %a0,(%sp)',f'jsr bs_recorder_engine_{name}',
            'lea 4(%sp),%sp','move.w 60(%sp),%d0','move.w %d0,%sr',
            'movem.l (%sp),%d0-%d7/%a0-%a6','lea 64(%sp),%sp',
            f'.incbin "{private}"',f'jmp {address+6:#x}']
    for name,site in preparation.items():
        address,length=site['address'],site['length'];replay=stock[address-0x40000400:address-0x40000400+length]
        assert hashlib.sha256(replay).hexdigest()==site['sha256']
        private=out/('prepare-'+name+'-replay.private.bin');private.write_bytes(replay)
        assembly += [f'.globl bs_recorder_prepare_{name}_entry',f'bs_recorder_prepare_{name}_entry:',
            'lea -64(%sp),%sp','movem.l %d0-%d7/%a0-%a6,(%sp)',
            'move.w %sr,%d0','move.w %d0,60(%sp)','move.l %sp,%a0',
            'lea -4(%sp),%sp','move.l %a0,(%sp)',f'jsr bs_recorder_prepare_{name}',
            'lea 4(%sp),%sp','move.w 60(%sp),%d0','move.w %d0,%sr',
            'movem.l (%sp),%d0-%d7/%a0-%a6','lea 64(%sp),%sp',
            f'.incbin "{private}"',f'jmp {address+length:#x}']
    asm=out/'recorder-engine-hooks.private.S';asm.write_text('\n'.join(assembly)+'\n')
    obj=out/'recorder-engine-hooks.private.o';run('m68k-elf-gcc','-mcpu=5475','-c',str(asm),'-o',str(obj));added.append(obj)
    objects=[out/name for name in report['objectSha256']]+added
    elf,binary,symbols=out/'recorder-engine.elf',out/'recorder-engine.bin',out/'recorder-engine.symbols'
    run('m68k-elf-ld','--no-undefined','-e','bs_recorder_engine_init','-Ttext='+hex(report['textBase']),*map(str,objects),'-o',str(elf))
    if run('m68k-elf-nm','-u',str(elf)):p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary));symbols.write_text(run('m68k-elf-nm',str(elf))+'\n')
    end=[int(row.split()[0],16) for row in symbols.read_text().splitlines() if row.split()[-1]=='_end'][0]
    if end+32>a.text_base+(49136 if a.text_base==0x46019df0 else 65536):p.error('Fixture exceeds placement bound.')
    report.update({'scope':'Private recorder/engine hook composition compilation only; execution is separate',
        'binarySha256':sha(binary),'symbolsSha256':sha(symbols),'fixtureEnd':end,
        'objectSha256':{o.name:sha(o) for o in objects},'sdkRevision':pin['revision'],'sdkDependencySha256':pin['sha256'],
        'codegenGuardSha256':sha(repo/'sdk/runtime/m68k_codegen.py'),
        'engineHookSites':{name:guards[name] for name in ('idle','job')},
        'preparationEnabled':a.prepare,'preparationHookSites':preparation,'preparationInteriorScan':prep_scan})
    report['sourceSha256'].update({n:sha(ROOT/n) for n in ('recorder_engine_native.py','recorder-engine-runtime-sources.json',
        'engine_boundary.c','engine_boundary.h','test_recorder_engine.c',*(('test_recorder_prepare.c',) if a.prepare else ()))})
    if a.executable:
        result=subprocess.run([str(a.executable.resolve()),str(a.main.resolve()),str(binary),str(symbols)],text=True,capture_output=True,timeout=600)
        inputs=('recorder_native_probe.cpp','recorder_probe.cpp','../preview_guard.c','../preview_guard.h')
        binding=''.join(n+':'+sha(ROOT/'stock_probe'/n)+'\n' for n in inputs)
        if 'SOURCE_SHA256: '+hashlib.sha256(binding.encode()).hexdigest() not in result.stdout.splitlines():p.error('Rebuild the current runner.')
        report.update({'scope':'Private compiled recorder/preparation pairs against complete stock routines; engine glue linked but not driven by this isolated runner',
            'exitCode':result.returncode,'stdout':result.stdout.splitlines(),'stderrLines':len(result.stderr.splitlines()),
            'stderrSha256':hashlib.sha256(result.stderr.encode()).hexdigest(),'runnerSha256':sha(a.executable)})
        print(result.stdout,end='')
        if result.returncode:print(result.stderr,end='')
    (out/'recorder-engine.json').write_text(json.dumps(report,indent=2)+'\n')
    if a.executable:raise SystemExit(result.returncode)
    print('Compiled private shared-guard recorder/engine fixture; no execution or source admission claim.')
if __name__=='__main__':main()
