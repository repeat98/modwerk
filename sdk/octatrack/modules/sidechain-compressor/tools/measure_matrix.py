"""Run only in private isolation against reviewed meter-host and native DSP dumps."""
from pathlib import Path
import json,subprocess
root=Path("/work"); rows=[]
for split in range(16):
    args=[str(root/"meter-host"),"-mem",str(root/"A.mem"),"-memB",str(root/"B.mem"),"-audio","0","-frames","16","-blocks","2304","-inst","16","-init",",".join(["1aa4"]*8+["1864"]*8),"-proc",",".join(["1ab1"]*8+["1871"]*8),"-core",",".join(["0"]*8+["1"]*8),"-alloc",",".join(map(str,list(range(8))*2)),"-r7",",".join(map(str,[1,2,4,5,7,8,10,11]*2)),"-audioidx",",".join(["0"]*16),"-split",str(split),"-meter",str(root/"meter.txt")]
    for instance in range(16):
        file=root/f"parameters-{instance}.txt"
        values=[]
        for block in range(2304):
            b=(block+instance*113)%2304
            main=[127 if b&(1<<i) else 0 for i in range(6)]
            values.append(str(block)+" "+",".join(map(str,main+[127 if b%2 else 0,0,b%9,(b//9)%128,((b//9)%16)*8+(7 if b<1152 else 0),(b//1152)%2])))
        file.write_text("\n".join(values)+"\n")
        args+=["-params","64,64,127,0,0,127,0,0,0,64,64,0","-paramfile",str(file)]
    result=subprocess.run(args,capture_output=True,text=True,timeout=120)
    (root/"matrix-last.log").write_text(result.stdout+result.stderr)
    if result.returncode:raise RuntimeError("meter-host failed; inspect private log")
    samples=[list(map(int,line.split())) for line in (root/"meter.txt").read_text().splitlines()]
    assert len(samples)==2304
    row=dict(split=split,blocks=len(samples),coreA=max(x[1] for x in samples),coreB=max(x[2] for x in samples),allCallsReturned=True)
    rows.append(row);print(json.dumps(row),flush=True)
report=dict(schemaVersion=1,imageSha256="b5aa8cee7787a3dc0ea53007fe31358ba14d155421ebec9c7f98948de740675f",instances=16,rows=rows,scope="Both full patched stock COMPRESSOR calls; isolated published parameter workload, not streaming scheduler or live cross-core taps.")
(root/"cycle-matrix.json").write_text(json.dumps(report,indent=2)+"\n")
