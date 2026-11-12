# SPDX-License-Identifier: MIT
from pathlib import Path
import subprocess
vendor=Path("/work/vendor/dsp56300")
import sys
sys.path.insert(0,"modules/sidechain-compressor/tools")
from static_probe import generate
generate("/work/meter-host.cpp","/work/static-host.cpp")
libraries=[str(vendor/"build/source"/a/b) for a,b in [("dsp56kEmu","libdsp56kEmu.a"),("vtuneSdk","libvtuneSdk.a"),("dsp56kBase","libdsp56kBase.a"),("asmjit","libasmjit.a")]]
subprocess.run(["g++-15","-O2","-std=c++17","-DDSP56300_DEBUGGER=0","-DDSP56K_USE_PERF_JIT_PROFILING","-DDSP56K_USE_VTUNE_JIT_PROFILING_API","-I"+str(vendor/"source"),"-I"+str(vendor/"source/asmjit/src"),"-DASMJIT_STATIC","static-host.cpp","meter-dsp.o",*libraries,"-ldl","-lpthread","-lrt","-o","static-host"],check=True)
p=subprocess.run(["/work/static-host","-mem","/work/A.mem","-memB","/work/B.mem","-init","1aa4","-proc","1ab1","-frames","16","-audio","0","-blocks","1","-params","64,64,127,0,0,127,0,0,0,64,64,0"],capture_output=True,text=True,check=True)
Path("/work/static-costs.txt").write_text("\n".join(l for l in p.stdout.splitlines() if l.startswith("STATIC_COST")))
