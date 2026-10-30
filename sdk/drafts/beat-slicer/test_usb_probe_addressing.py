"""Regression: reject the actual wrong-target indexed mode seen on the MKII."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--sdk-revision',required=True);a=p.parse_args();out=a.output.resolve()
    if out.exists() or out==REPO or REPO in out.parents:p.error('Use fresh private output outside Git.')
    out.mkdir(parents=True)
    probe=load('probe',ROOT/'build_usb_probe.py');sdk=load('sdk_builder',REPO/'sdk/runtime/loader/build.py');guard=load('codegen',REPO/'sdk/runtime/m68k_codegen.py')
    outcomes={}
    for target in ('5475','54455'):
        flags=[f for f in sdk.CFLAGS if not f.startswith('-mcpu=')]+['-mcpu='+target,*guard.FLAGS]
        obj=out/(target+'.o');subprocess.run(['m68k-elf-gcc',*flags,'-c',str(ROOT/'usb_probe.c'),'-o',str(obj)],check=True)
        rejected=False
        try:probe.check_addressing([obj])
        except RuntimeError:rejected=True
        assert rejected==(target=='5475'),target
        outcomes[target]={'rejected':rejected,'flags':flags,'objectSha256':probe.digest(obj)}
    report={'scope':'compile exact probe source for wrong and SDK CPU targets; forbidden-index guard rejects the physical-failure class; no hardware retest',
      'sourceSha256':{n:probe.digest(ROOT/n) for n in ('usb_probe.c','planner.h','build_usb_probe.py','test_usb_probe_addressing.py')},
      'sdkRevision':a.sdk_revision,'sdkDependencySha256':{n:probe.digest(REPO/n) for n in ('sdk/runtime/loader/build.py','sdk/runtime/loader/modwerk_module.h','sdk/runtime/m68k_codegen.py')},
      'compiler':subprocess.check_output(['m68k-elf-gcc','--version'],text=True).splitlines()[0],'targets':outcomes,'exitCode':0,'hardware':'not retested'}
    (out/'addressing-regression.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS: wrong-target instruction rejected; SDK target accepted.')
if __name__=='__main__':main()
