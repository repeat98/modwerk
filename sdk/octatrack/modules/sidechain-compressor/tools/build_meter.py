# SPDX-License-Identifier: MIT
from pathlib import Path
import sys,subprocess
sys.path.insert(0,"modules/sidechain-compressor/tools")
from meter_adapter import generate
vendor=Path("/work/vendor/dsp56300")
generate(vendor,"/reviewed-host/dsp_host.cpp",Path("/work"))
flags=["g++-15","-O2","-std=c++17","-fPIC","-DASMJIT_STATIC","-DDSP56300_DEBUGGER=0","-DDSP56K_USE_PERF_JIT_PROFILING","-DDSP56K_USE_VTUNE_JIT_PROFILING_API","-I"+str(vendor/"source"),"-I"+str(vendor/"source/dsp56kEmu"),"-I"+str(vendor/"source/asmjit/src")]
subprocess.run(flags+["-c","meter-dsp.cpp","-o","meter-dsp.o"],check=True)
libraries=[str(vendor/"build/source"/a/b) for a,b in [("dsp56kEmu","libdsp56kEmu.a"),("vtuneSdk","libvtuneSdk.a"),("dsp56kBase","libdsp56kBase.a"),("asmjit","libasmjit.a")]]
subprocess.run(flags+["meter-host.cpp","meter-dsp.o",*libraries,"-ldl","-lpthread","-lrt","-o","meter-host"],check=True)
sys.path.insert(0,"tools");import toolpath
from dsp_modmap import modules,PAYLOADS
import struct
image=Path("out/mainos_bus.bin").read_bytes()
for tag,va,length in PAYLOADS:
    records,data=modules(image,va,length)
    out=bytearray()
    for space,address,count,offset in records:
        out+=struct.pack("<BII",space,address,count)
        for i in range(count):out+=struct.pack("<I",int.from_bytes(data[offset+i*3:offset+i*3+3],"little"))
    out+=struct.pack("<BII",255,0,0)
    Path(tag+".mem").write_bytes(out)
print("Meter built; private native DSP dumps prepared",flush=True)
