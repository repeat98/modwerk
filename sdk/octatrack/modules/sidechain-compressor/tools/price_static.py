# SPDX-License-Identifier: MIT
import pathlib,re,json,sys,subprocess,struct
sys.path[:0]=['/work/tools','/work/tools/build'];import toolpath
from dsp_modmap import modules,PAYLOADS
R=pathlib.Path('/work');im=(R/'out/mainos_bus.bin').read_bytes()
costs={}
for l in (R/'static-costs.txt').read_text().splitlines():
 _,core,pc,cost,n=l.split();costs[int(core),int(pc,16)]=(int(cost),int(n))
result={}
for c,(tag,va,n) in enumerate(PAYLOADS):
 rec,data=modules(im,va,n);org=0x1282 if tag=='A' else 0x1042
 row=next(row for row in rec if row[0]==0 and row[1]<=org<row[1]+row[2])
 off=row[3]+(org-row[1])*3
 p=R/('side'+tag+'.bin');p.write_bytes(data[off:off+340*3])
 dis=subprocess.check_output(['/work/vendor/dsp56300/build/source/disassemble/dsp56kDisassemble','-in',str(p),'-pc',format(org,'x'),'-le'],text=True)
 (R/('side'+tag+'.dis')).write_text(dis)
 texts=[('sidechain',dis),('compressor',(R/('comp'+tag+'.dis')).read_text())]
 for label,txt in texts:
  instr=[]
  for m in re.finditer(r'^([0-9a-f]{6}):\s+(.+)',txt,re.M):
   pc=int(m[1],16)
   if (c,pc) in costs:instr.append((pc,m[2].split(';')[0].strip()))
  loops=[]
  for pc,text in instr:
   if text.startswith('do '):
    count,target=text[3:].split(',')
    trips=16 if count.strip()=='n7' else int(count.strip().replace('#<','').replace('$',''),16)
    end=int(target.strip().replace('>','').replace('$',''),16)
    loops.append((pc+costs[c,pc][1],end,trips))
  total=0;nonloop=0;body=0
  for pc,text in instr:
   mult=1
   for lo,hi,nloop in loops:
    if lo<=pc<hi:mult*=nloop
   cost=costs[c,pc][0]
   total+=mult*cost
   if mult==1:nonloop+=cost
   else:body+=mult*cost
  result[tag+'-'+label]=dict(allBranchUpper=total,nonLoop=nonloop,loopBody=body,loops=len(loops),instructions=len(instr),splitUpper=body+nonloop*2 if label=='compressor' else total)
(R/'static-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
