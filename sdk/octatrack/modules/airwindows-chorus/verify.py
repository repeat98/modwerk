#!/usr/bin/env python3
"""Assemble and run the real Air Chorus DSP against the pinned float oracle.
Synthetic memory, no firmware. Software results cannot establish hardware
timing, real dispatcher/panel integration, project persistence or release safety.
"""
import hashlib
import json
import math
import os
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference
from packed_sine import packed_table

Q, ORG = 1 << 23, 0x2000
TOOLS = pathlib.Path(os.environ.get("DSP_TOOLS", "/opt/toolchain/vendor/dsp56300/build/source"))
ASM = TOOLS / "dsp_host/dsp_asm"
HOST = TOOLS / "dsp_host/dsp_host"
DIS = TOOLS / "disassemble/dsp56kDisassemble"
failures = []
results = []
def check(name, ok, detail=""):
    results.append({"name":name, "passed":bool(ok), "detail":detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}", flush=True)
    if not ok:
        failures.append(name)

def rec(space, address, words):
    return struct.pack("<BII", space, address, len(words)) + struct.pack(f"<{len(words)}I", *words)

def assemble(work):
    blob, sym = work / "chorus.bin", work / "chorus.sym"
    r = subprocess.run([str(ASM), "-in", str(HERE/"chorus.asm"), "-org", f"{ORG:x}",
                        "-out", str(blob), "-sym", str(sym)], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stdout + r.stderr)
    symbols = {k:int(v,16) for k,v in (line.split() for line in sym.read_text().splitlines() if line.strip())}
    code = blob.read_bytes()
    words = [int.from_bytes(code[i:i+3],"little") for i in range(0,len(code),3)]
    d = subprocess.run([str(DIS), "-in", str(blob), "-pc", f"{ORG:x}", "-le"],
                       capture_output=True, text=True, check=True).stdout
    check("signed multiply encodings", "mpysu" not in d, "no unsigned-second-operand multiply")
    check("init preserves dispatcher r1", not re.search(r"\b(?:r1|n1|m1)\b", (HERE/"chorus.asm").read_text().split("init:")[1].split("proc:")[0]))
    table = packed_table() if (HERE/'packed_sine.py').exists() else [round(math.sin(math.pi*i/2048)*(Q-1)) for i in range(1025)] + [Q-1]
    # The native builder relocates the table; replicate that one literal fixup
    # in the synthetic image. It emits x-table reads when stock DJ EQ is absent.
    words = [0x2800 if w == 0xfab1e0 else w for w in words]
    mem = rec(0,ORG,words) + rec(0,0x2800,table) + rec(0,0x40,[0,0,0,0])
    values = {0x415:0x700,0x416:0x700,0x419:0,0x208:0x500,0x20a:0x6000,
              0x20c:0,0x20d:16,0x20e:0,0x213:0x255}
    bases = [0x1000,0x4000,0x1c00,0x8000,0x2800,0x30000,0x3400,0x34000]
    for i,base in enumerate(bases):
        values[0x255+i] = base
    for addr,value in values.items():
        mem += rec(1,addr,[value])
    path = work/"chorus.mem"
    path.write_bytes(mem + struct.pack("<BII",0xff,0,0))
    return path,symbols,len(words),hashlib.sha256(code).hexdigest()

def run(work,mem,syms,left,right,knobs=(64,64,64),slot=2,dirty=False,schedules=(),split=0):
    n = len(left)
    src,out = work/"in.raw",work/"out.raw"
    src.write_bytes(struct.pack(f"<{2*n}i", *(s for pair in zip(left,right) for s in pair)))
    params=[knobs[0],knobs[1],0,0,0,knobs[2]]+[0]*6
    alloc={1:0,2:1,4:2,5:3,7:4,8:5,10:6,11:7}[slot]
    cmd=[str(HOST),"-mem",str(mem),"-init",f"{syms['init']:x}","-proc",f"{syms['proc']:x}",
         "-ctx","40,41,42","-frames","16","-blocks",str((n+15)//16),
         "-r7",str(slot),"-alloc",str(alloc),"-guard","-stereo",
         "-params",",".join(map(str,params)),"-in",str(src),"-out",str(out)]
    if split:
        cmd += ["-split",str(split)]
    if dirty:
        cmd += ["-dirty","12648430"]
    for schedule in schedules:
        cmd += ["-sched",schedule]
    r=subprocess.run(cmd,capture_output=True,text=True,timeout=600)
    if r.returncode:
        raise RuntimeError(r.stdout[-1800:]+r.stderr[-1800:])
    raw=out.read_bytes()
    samples=struct.unpack(f"<{len(raw)//4}i",raw)
    meter=re.search(r"\(([\d.]+)/sample max",r.stdout)
    return list(samples[0::2])[:n],list(samples[1::2])[:n],float(meter.group(1)) if meter else None,r.stdout

def main():
    with tempfile.TemporaryDirectory(prefix="air-chorus-") as folder:
        work=pathlib.Path(folder)
        mem,syms,words,code_sha=assemble(work)
        print(f"program {words} words; assembled SHA256 {code_sha}",flush=True)
        n=16384
        left=[round(0.28*(Q-1)*math.sin(2*math.pi*997*i/44100)) for i in range(n)]
        right=[round(0.21*(Q-1)*math.sin(2*math.pi*331*i/44100)) for i in range(n)]
        worst,measured=0.0,0.0
        for knobs in [(64,64,64),(0,0,127),(127,127,127),(127,32,127),
                      (32,127,64),(64,64,0),(127,0,127)]:
            l,r,m,log=run(work,mem,syms,left,right,knobs)
            a,b=reference.Chorus().process([x/Q for x in left],[x/Q for x in right],
                          speed=knobs[0],range_=knobs[1],mix=knobs[2])
            error=max(max(abs(x/Q-y) for x,y in zip(l,a)),max(abs(x/Q-y) for x,y in zip(r,b)))
            worst=max(worst,error)
            measured=max(measured,m or 0)
            check(f"float oracle {knobs}",error<0.003,f"peak error {error:.6g}")
            check(f"memory guard {knobs}","guard: ok" in log.lower() or "nothing written" in log.lower(),log.strip().splitlines()[-1])
            if knobs[2]==0:
                check("MIX 0 exact bypass",l==left and r==right)
        for slot in (1,4,7,10):
            l,r,_,_=run(work,mem,syms,left[:1024],right[:1024],(127,127,127),slot=slot,dirty=True)
            check(f"FX1 slot {slot} safely dry",l==left[:1024] and r==right[:1024])
        for slot in (2,5,8,11):
            l,r,_,_=run(work,mem,syms,[0]*4096,[0]*4096,(127,127,127),slot=slot,dirty=True)
            check(f"FX2 slot {slot} dirty-state silence",not any(l+r))
        l,r,_,_=run(work,mem,syms,left,right,(64,64,127))
        ml,_,_,_=run(work,mem,syms,left,left,(64,64,127))
        mr,_,_,_=run(work,mem,syms,right,right,(64,64,127))
        check("L/R state independence",l==ml and r==mr)
        schedules=["128:0:0=127,128:0:1=127,128:0:5=127",
                   "256:0:0=0,256:0:1=0,256:0:5=0",
                   "512:0:0=64,512:0:1=64,512:0:5=64"]
        l,r,m,log=run(work,mem,syms,left,right,(64,64,64),dirty=True,schedules=schedules)
        check("control-change memory guard","guard: ok" in log.lower() or "nothing written" in log.lower())
        clean_l,clean_r,_,_=run(work,mem,syms,left,right,(64,64,64))
        dirty_l,dirty_r,_,_=run(work,mem,syms,left,right,(64,64,64),dirty=True)
        check("dirty-state music equals clean init",clean_l==dirty_l and clean_r==dirty_r)
        # Identical parameter events at sample 2048 and 4096, with short
        # calls replacing 16-frame calls. This exercises the DSP's n7 path,
        # not the physical ColdFire trig dispatcher.
        event=lambda frames: [f"{2048//frames}:0:0=127,{2048//frames}:0:1=127,{2048//frames}:0:5=127,"
                              f"{4096//frames}:0:0=0,{4096//frames}:0:1=0,{4096//frames}:0:5=0"]
        normal_l,normal_r,_,_=run(work,mem,syms,left,right,(64,64,64),schedules=event(16))
        for split in (1,4,8):
            short_l,short_r,_,_=run(work,mem,syms,left,right,(64,64,64),schedules=event(16),split=split)
            check(f"{split}+{16-split}-frame split continuity",short_l==normal_l and short_r==normal_r)
        # A burst followed by three seconds tests decay and fixed-point idle latches.
        burst=[round(0.8*(Q-1)*math.sin(2*math.pi*19000*i/44100)) for i in range(512)]+[0]*132300
        l,r,m,log=run(work,mem,syms,burst,burst,(127,127,127))
        peak=max(abs(v) for v in l[-22050:]+r[-22050:])/Q
        check("burst settles after three seconds",peak<10**(-90/20),f"last half-second peak {peak:.6g}")
        output={"programWords":words,"assembledSha256":code_sha,"floatOraclePeakError":worst,
                "maxInstructionsPerSample":max(measured,m or 0),"results":results,
                "limitations":["Synthetic DSP memory only; no firmware, panel, dispatcher, physical hardware, or persistence qualification."]}
        if os.environ.get("CHORUS_RESULTS"):
            pathlib.Path(os.environ["CHORUS_RESULTS"]).write_text(json.dumps(output,indent=2)+"\n")
    if failures:
        raise SystemExit(f"{len(failures)} failed gates")
    print("All Air Chorus software gates passed.")

if __name__=="__main__":
    main()
