"""Compile the proposed base-side owner check; no native link/execution is claimed."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):return subprocess.check_output(args,text=True)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    out=a.output.resolve()
    if out.exists() or out==REPO or REPO in out.parents:p.error('Use a new private output directory outside the source tree.')
    out.mkdir(parents=True)
    guard_path=REPO/'sdk/runtime/m68k_codegen.py'
    spec=importlib.util.spec_from_file_location('guard',guard_path);guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    flags=['-std=c99','-mcpu=5475','-msoft-float','-O2','-ffreestanding','-fno-builtin','-fno-common',
           '-fno-jump-tables','-fno-tree-loop-distribute-patterns','-fno-optimize-sibling-calls',
           '-fno-asynchronous-unwind-tables','-fno-unwind-tables','-fno-ident','-fstack-usage',
           '-Wall','-Wextra','-Werror','-pedantic',*guard.FLAGS,'-DRUNTIME_MODULES=128u','-DRUNTIME_POOL_BYTES=786432u']
    obj=out/'menu_owner.o';dep=out/'menu_owner.d'
    run('m68k-elf-gcc',*flags,'-I',str(REPO/'sdk/runtime/upload'),'-MMD','-MF',str(dep),'-c',str(ROOT/'menu_owner.c'),'-o',str(obj))
    pinned=json.loads((ROOT/'menu-owner-runtime-sources.json').read_text());dependencies={}
    for word in dep.read_text().replace('\\\n',' ').split(':',1)[1].split():
        path=Path(word).resolve()
        if path.is_relative_to(ROOT):continue
        name=path.relative_to(REPO).as_posix();digest=sha(path)
        if pinned['sha256'].get(name)!=digest:raise RuntimeError('SDK dependency differs: '+name)
        dependencies[name]=digest
    guard.check([obj]);undefined=run('m68k-elf-nm','-u',str(obj)).splitlines()
    assert sorted(line.split()[-1] for line in undefined)==['modwerk_runtime_module','modwerk_runtime_owner_valid'],undefined
    report={'scope':'ColdFire compile and code-generation guard only; expected loader imports remain unresolved; no native link/execution',
            'sourceSha256':{n:sha(ROOT/n) for n in ('menu_owner.c','menu_owner.h','menu_owner_native.py','menu-owner-runtime-sources.json')},
            'sdkRevision':pinned['revision'],'sdkDependencySha256':dependencies,'codegenGuardSha256':sha(guard_path),
            'compiler':run('m68k-elf-gcc','--version').splitlines()[0],'flags':flags,'objectSha256':sha(obj),
            'size':run('m68k-elf-size',str(obj)).splitlines(),'localStackUsage':(out/'menu_owner.su').read_text().splitlines(),
            'expectedLoaderImports':undefined,'codegenGuard':'passed','exitCode':0,
            'nativeLink':'not performed','nativeExecution':'not performed','hardware':'not tested'}
    (out/'menu-owner.json').write_text(json.dumps(report,indent=2)+'\n')
    print('PASS compile-only: ColdFire owner check; only expected loader imports; code-generation guard; no native execution')
if __name__=='__main__':main()
