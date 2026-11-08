"""Host checks for the fixed-input USB probe, including planner failure paths."""
import argparse,hashlib,json,os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path);p.add_argument('--sdk-revision');a=p.parse_args()
    if a.output and not a.sdk_revision:p.error('Pin the SDK revision for a retained report.')
    if a.output and a.output.exists():p.error('Use a fresh report path.')
    cc=os.environ.get('CC','cc');flags=['-std=c99','-O1','-g','-Wall','-Wextra','-Werror','-pedantic','-fsanitize=address,undefined','-fno-omit-frame-pointer']
    with tempfile.TemporaryDirectory(prefix='beat-slicer-usb-probe-') as work:
        work=Path(work);obj=work/'probe.o';exe=work/'probe'
        subprocess.run([cc,*flags,'-Dbs_preview=bs_probe_test_planner','-c',str(ROOT/'usb_probe.c'),'-o',str(obj)],check=True)
        subprocess.run([cc,*flags,str(obj),str(ROOT/'planner.c'),str(ROOT/'test_usb_probe.c'),'-o',str(exe)],check=True)
        runs=[]
        for failure in (0,1,2):
            run=subprocess.run([str(exe),str(failure)],text=True,capture_output=True,timeout=30)
            print(run.stdout,end='');print(run.stderr,end='');run.check_returncode();runs.append({'failureAt':failure,'exitCode':run.returncode,'stdout':run.stdout.splitlines()})
    if a.output:
        report={'scope':'host USB probe with generated silence, injected planner failures and guarded frame storage; no instrument IO',
          'sourceSha256':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ('usb_probe.c','planner.c','planner.h','test_usb_probe.c','test_usb_probe.py')},
          'sdkRevision':a.sdk_revision,'sdkDependencySha256':{'sdk/runtime/loader/modwerk_module.h':hashlib.sha256((ROOT.parents[2]/'sdk/runtime/loader/modwerk_module.h').read_bytes()).hexdigest()},
          'compiler':subprocess.check_output([cc,'--version'],text=True).splitlines()[0],'flags':flags,'runs':runs,'exitCode':0,'hardware':'not tested'}
        a.output.write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':main()
