"""Use the repository's FX click-census metric on Air Chorus's assembled DSP.
Tests endpoint jumps and one-byte turns, with the other controls active.
The measurement cannot establish physical DSP deadlines or panel routing.
"""
import ast
import json
import math
import os
import pathlib
import sys
import tempfile
import statistics
import types

HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import verify
ROOT=next(p for p in HERE.parents if (p/"sdk/octabam/tools/verify/verify_knob_clicks.py").is_file())
# Load the shared metric verbatim without its firmware/registry-dependent
# render driver. Drafts do not belong to the published rig fixture yet.
metric_path=ROOT/"sdk/octabam/tools/verify/verify_knob_clicks.py"
tree=ast.parse(metric_path.read_text(),filename=str(metric_path))
functions={"phase_energy","step_db","measure","flagged","self_test"}
constants={"FRAMES","J1","J2","S0","END","LO","HI","STEP_LIMIT","MARGIN","WINDOWS"}
body=[node for node in tree.body if
      (isinstance(node,ast.FunctionDef) and node.name in functions) or
      (isinstance(node,ast.Assign) and
       all(isinstance(n,ast.Name) and n.id in constants for n in
           ast.walk(node.targets[0]) if isinstance(n,ast.Name)) and
       any(isinstance(n,ast.Name) and n.id in constants for n in ast.walk(node.targets[0])))]
namespace={"math":math,"statistics":statistics,
           "vo":types.SimpleNamespace(TONE_HZ=438.75,SR=44100)}
exec(compile(ast.Module(body=body,type_ignores=[]),str(metric_path),"exec"),namespace)
assert functions | constants <= namespace.keys(), "Shared click metric changed; update the adapter"
census=types.SimpleNamespace(**namespace)

def main():
    if not census.self_test():
        raise SystemExit("Click measurement failed its own known-bad / known-good controls")
    rows=[]
    with tempfile.TemporaryDirectory(prefix="air-chorus-controls-") as d:
        work=pathlib.Path(d)
        mem,syms,_,_=verify.assemble(work)
        n=(census.END+2)*16
        tone=[round(0.3*(verify.Q-1)*math.sin(2*math.pi*438.75*i/44100)) for i in range(n)]
        for case,lower,upper,context in [("panel",20,110,[64,64,127]),
                                         ("endpoints",0,127,[127,127,127])]:
          for name,pos,slot in [("SPEED",0,0),("RANGE",1,1),("MIX",2,5)]:
            base=list(context)
            base[pos]=lower
            l,r,_,_=verify.run(work,mem,syms,tone,tone,base)
            lo=[[v/verify.Q for v in ch] for ch in [l,r]]
            base[pos]=upper
            l,r,_,_=verify.run(work,mem,syms,tone,tone,base)
            hi=[[v/verify.Q for v in ch] for ch in [l,r]]
            base[pos]=lower
            schedule=",".join(f"{b}:0:{slot}={v}" for b,v in
                [(census.J1,upper),(census.J2,lower)]+
                [(census.S0+2*k,v) for k,v in enumerate(range(lower+1,upper+1))])
            l,r,m,log=verify.run(work,mem,syms,tone,tone,base,dirty=True,schedules=[schedule])
            movement=[[v/verify.Q for v in ch] for ch in [l,r]]
            measured=census.measure(movement,lo,hi)
            flagged=census.flagged(measured)
            print(f"[{'FAIL' if flagged else 'PASS'}] {case} {name}: {measured}",flush=True)
            rows.append({"case":case,"control":name,"flagged":flagged,
                         "windows":{k:{"movingDbfs":a,"staticDbfs":b} for k,(a,b) in measured.items()},
                         "maxInstructionsPerSample":m})
    if os.environ.get("CHORUS_CONTROL_RESULTS"):
        pathlib.Path(os.environ["CHORUS_CONTROL_RESULTS"]).write_text(json.dumps(rows,indent=2)+"\n")
    if any(row["flagged"] for row in rows):
        raise SystemExit("Control zipper-noise checks failed")

if __name__=="__main__":
    main()
