# SPDX-License-Identifier: MIT
import sys,pathlib,subprocess,re
sys.path[:0]=['/work/tools','/work/tools/build']
import toolpath
from dsp_modmap import modules,PAYLOADS
image=pathlib.Path('/work/out/mainos_bus.bin').read_bytes()
for tag,va,n in PAYLOADS:
 records,data=modules(image,va,n)
 record=next(row for row in records if row[0]==0 and row[1]==(0x1aa4 if tag=='A' else 0x1864))
 _,addr,count,off=record
 p=pathlib.Path('/work/comp'+tag+'.bin');p.write_bytes(data[off:off+count*3])
 dis=subprocess.check_output(['/work/vendor/dsp56300/build/source/disassemble/dsp56kDisassemble','-in',str(p),'-pc',format(addr,'x'),'-le'],text=True)
 pathlib.Path('/work/comp'+tag+'.dis').write_text(dis)
 print(tag,count)
 for line in dis.splitlines():
  if re.search(r'\b(do|rep|bsr|jsr|bra|jmp)\b',line):
   # disclose control-flow structure only, never instruction encodings
   print(re.sub(r'^.*?\s(do|rep|bsr|jsr|bra|jmp)\s',r'\1 ',line))
