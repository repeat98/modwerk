"""Build a private fixed-input USB smoke-test package using existing tick/draw hooks.

This does not build or qualify the live sample-editor module. No firmware needed.
"""
import argparse,hashlib,importlib.util,json,subprocess,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def check_addressing(objects):
    """Reject index modes that raise address errors on MCF54455 (RM 3.3.4.2)."""
    for obj in objects:
        assembly=subprocess.check_output(['m68k-elf-objdump','-d',str(obj)],text=True)
        bad=[line for line in assembly.splitlines() if re.search(r'%[ad][0-7]:w|:[wl]:8',line)]
        if bad:raise RuntimeError('MCF54455-incompatible indexed addressing in '+obj.name)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--sdk-revision',required=True);p.add_argument('--runner',type=Path);p.add_argument('--stock-main',type=Path);p.add_argument('--version',required=True);a=p.parse_args()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+-experimental',a.version):p.error('Use the explicit experimental version.')
    out=a.output.resolve()
    if not re.fullmatch(r'[0-9a-f]{40}',a.sdk_revision):p.error('Pin the SDK Git revision.')
    if out.exists() or out==REPO or REPO in out.parents:p.error('Use a fresh private directory outside Git.')
    out.mkdir(parents=True)
    build=load('probe_runtime_builder',REPO/'sdk/runtime/loader/build.py');guard=load('probe_codegen',REPO/'sdk/runtime/m68k_codegen.py')
    flags=[*build.CFLAGS,*guard.FLAGS]
    if '-mcpu=54455' not in flags:p.error('Use the reviewed Octatrack SDK MCF54455 target.')
    objects=[];dependencies={}
    for name in ('usb_probe','planner'):
        obj=out/(name+'.o');dep=out/(name+'.d')
        subprocess.run(['m68k-elf-gcc',*flags,'-MMD','-MF',str(dep),'-c',str(ROOT/(name+'.c')),'-o',str(obj)],check=True);objects.append(obj)
        for word in dep.read_text().replace('\\\n',' ').split(':',1)[1].split():
            path=Path(word).resolve()
            if not path.is_relative_to(ROOT):dependencies[path.relative_to(REPO).as_posix()]=digest(path)
    guard.check(objects);check_addressing(objects)
    image,symbols,bss,relocations=build.link_units(objects,'m68k-elf-',0,out)
    hooks=[symbols.get(name,build.NONE) for name in build.HANDLERS]
    assert hooks[0]!=build.NONE and hooks[1]!=build.NONE and hooks[2:]==[build.NONE,build.NONE]
    data=build.package(image,bss,hooks,relocations,name='beat-slicer-usb-probe',hashed=True,abi=8,title='BEAT SLICER USB')
    package=out/'beat-slicer-usb-probe.mwrm';package.write_bytes(data)
    for n in ('sdk/runtime/loader/build.py','sdk/runtime/m68k_codegen.py'):dependencies[n]=digest(REPO/n)
    report={'version':a.version,'scope':'private USB fixed-input planner/display smoke test; no live source, editor action, DSP or stock patch',
      'sourceSha256':{n:digest(ROOT/n) for n in ('usb_probe.c','planner.c','planner.h','build_usb_probe.py','trial_usb_probe.mjs')},
      'sdkRevision':a.sdk_revision,
      'sdkDependencySha256':dict(sorted(dependencies.items())),
      'compiler':subprocess.check_output(['m68k-elf-gcc','--version'],text=True).splitlines()[0],'flags':flags,
      'packageSha256':digest(package),'packageBytes':len(data),'imageBytes':len(image),'bssBytes':bss,'relocations':len(relocations),
      'moduleId':format(build.module_id('beat-slicer-usb-probe'),'08x'),'hooks':hooks,'sites':0,'copies':0,'fills':0,'dsp':False,
      'objectSha256':{p.name:digest(p) for p in objects},'codegenGuard':'passed','addressingGuard':'MCF54455 index modes passed','hardware':'not tested','qualification':False}
    if a.runner:
        private=out/'package.private.c'
        private.write_text('#include <stdint.h>\nconst uint8_t bs_probe_package[]={'+','.join(str(b) for b in data)+'};\nconst uint32_t bs_probe_package_bytes='+str(len(data))+';\n')
        native_flags=[*flags,'-ffunction-sections','-fdata-sections','-DRUNTIME_MODULES=128u','-DRUNTIME_POOL_BYTES=786432u','-I',str(REPO/'sdk/runtime/upload')]
        runtime_objects=[]
        own_sources=dict(report['sourceSha256'])
        for n in ('stock_probe/job_probe.cpp','stock_probe/CMakeLists.txt'):own_sources[n]=digest(ROOT/n)
        for index,source in enumerate((ROOT/'test_usb_probe_loader.c',private,ROOT/'menu_owner.c')):
            obj=out/('loader-'+str(index)+'.o');dep=out/('loader-'+str(index)+'.d')
            subprocess.run(['m68k-elf-gcc',*native_flags,'-MMD','-MF',str(dep),'-c',str(source),'-o',str(obj)],check=True);runtime_objects.append(obj)
            for word in dep.read_text().replace('\\\n',' ').split(':',1)[1].split():
                path=Path(word).resolve()
                if path==private:continue
                if path.is_relative_to(ROOT):own_sources[path.relative_to(ROOT).as_posix()]=digest(path)
                else:dependencies[path.relative_to(REPO).as_posix()]=digest(path)
        guard.check(runtime_objects);check_addressing(runtime_objects)
        elf=out/'loader-test.elf';binary=out/'loader-test.bin'
        subprocess.run(['m68k-elf-ld','--no-undefined','--gc-sections','-e','bs_usb_probe_target_selftest','-Ttext=0x47040000','-Tbss=0x47400000',*map(str,runtime_objects),'-o',str(elf)],check=True)
        subprocess.run(['m68k-elf-objcopy','-O','binary',str(elf),str(binary)],check=True)
        symbols=subprocess.check_output(['m68k-elf-nm',str(elf)],text=True)
        entry=next(row.split()[0] for row in symbols.splitlines() if row.split()[-1]=='bs_usb_probe_target_selftest')
        run=subprocess.run([str(a.runner),str(binary),'0x'+entry],capture_output=True,text=True,timeout=120)
        print(run.stdout,end='');print(run.stderr,end='');run.check_returncode()
        assert 'SOURCE_SHA256: '+digest(ROOT/'stock_probe/job_probe.cpp') in run.stdout.splitlines()
        report.update({'sourceSha256':own_sources,'sdkDependencySha256':dict(sorted(dependencies.items())),
          'runtimeFlags':native_flags,'runtimeObjectSha256':{p.name:digest(p) for p in runtime_objects},
          'runnerSha256':digest(a.runner),'runtimeTrials':2,'runtimeUndoAndReinstall':True,'companionPreserved':True,
          'runtimeStdout':run.stdout.splitlines(),'runtimeExitCode':run.returncode})
    if a.stock_main:
        stock=a.stock_main.read_bytes()
        if hashlib.sha256(stock).hexdigest()!='164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e':p.error('Use the pinned private 1.40C MAIN for this scan.')
        scanner_path=REPO/'sdk/machines/octatrack/elekloader/check_stock_free.py'
        scanner=load('probe_stock_scanner',scanner_path)
        haystacks=[('MAIN',stock)]
        for phase in range(3):
            words=b''.join(stock[i:i+3][::-1] for i in range(phase,len(stock)-2,3))
            haystacks.append(('24-bit reversed view '+str(phase),words))
        found=scanner.stock_runs({'sections':{'package':{'parts':[['hex',data.hex()]]}}},haystacks,16)
        if found:raise RuntimeError('Stock-free scan found matching runs: '+repr(found))
        report['stockFreeScan']={'passed':True,'mainSha256':digest(a.stock_main),'minimumRun':16,'minimumDistinctBytes':scanner.DISTINCT,'views':len(haystacks),'matches':0,'scope':'entire saved package against MAIN and all three aligned reversed 24-bit views'}
        report['sdkDependencySha256']['sdk/machines/octatrack/elekloader/check_stock_free.py']=digest(scanner_path)
    (out/'usb-probe-build.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Built private USB probe:',len(data),'bytes; no source/editor/DSP access. Hardware remains untested.')
if __name__=='__main__':main()
