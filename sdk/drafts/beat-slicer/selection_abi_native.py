"""Compare private stock dispatcher ABI with the compiled resident wrappers.

Closed-popup processor fixture only; native menu lifetime is tested separately.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from inspect_stock import STOCK_MAIN_SHA256
ROOT=Path(__file__).resolve().parent

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(*args):return subprocess.check_output(args,text=True).strip()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('output','native','main','executable'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();out=a.output.resolve();repo=ROOT.parents[2]
    if out==repo or repo in out.parents or out.exists():p.error('Use a fresh private output directory.')
    if sha(a.main)!=STOCK_MAIN_SHA256:p.error('Private stock identity differs.')
    native=json.loads((a.native/'source-boot.json').read_text())
    for name,expected in native['sourceSha256'].items():
        if sha(ROOT/name)!=expected:p.error('Native source differs: '+name)
    if sha(a.native/'source-boot.bin')!=native['binarySha256'] or sha(a.native/'source-boot.symbols')!=native['symbolsSha256']:
        p.error('Compiled native image differs.')
    out.mkdir(parents=True)
    obj,elf,binary=out/'callback.o',out/'callback.elf',out/'callback.bin'
    run('m68k-elf-gcc','-mcpu=5475','-c',str(ROOT/'test_selection_abi.S'),'-o',str(obj))
    run('m68k-elf-ld','--no-undefined','-e','bs_selection_abi_callback','-Ttext=0x47040000',str(obj),'-o',str(elf))
    run('m68k-elf-objcopy','-O','binary',str(elf),str(binary))
    result=subprocess.run([str(a.executable.resolve()),str(a.main),str(a.native/'source-boot.bin'),
                           str(a.native/'source-boot.symbols'),str(binary)],text=True,capture_output=True,timeout=600)
    if 'SOURCE_SHA256: '+sha(ROOT/'stock_probe/selection_abi_probe.cpp') not in result.stdout.splitlines():
        p.error('Rebuild the exact ABI probe source.')
    names=('selection_abi_native.py','test_selection_abi.S','stock_probe/selection_abi_probe.cpp','stock_probe/CMakeLists.txt','inspect_stock.py')
    report={'scope':'48 paired closed-popup stock/wrapped selection calls compare all data/address registers, SP, SR, return slot and caller-visible argument/selection effects; four nested refusals. Synthetic callbacks, no scheduler or popup destruction; not loader lifetime or hardware qualification',
        'sourceSha256':{**native['sourceSha256'],**{n:sha(ROOT/n) for n in names}},
        'mainSha256':sha(a.main),'nativeReceiptSha256':sha(a.native/'source-boot.json'),
        'nativeBinarySha256':native['binarySha256'],'runnerSha256':sha(a.executable),
        'compiler':run('m68k-elf-gcc','--version').splitlines()[0],
        'callbackObjectSha256':sha(obj),'callbackBinarySha256':sha(binary),
        'exitCode':result.returncode,'stdout':result.stdout.splitlines(),
        'stderrLines':len(result.stderr.splitlines()),'stderrSha256':hashlib.sha256(result.stderr.encode()).hexdigest(),
        'hardware':'not tested','nativeLifetime':'not qualified','physicalTiming':'not measured'}
    (out/'selection-abi.json').write_text(json.dumps(report,indent=2)+'\n')
    print(result.stdout,end='')
    if result.returncode:print(result.stderr,end='')
    raise SystemExit(result.returncode)

if __name__=='__main__':main()
