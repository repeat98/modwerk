#!/usr/bin/env python3
from pathlib import Path
import sys,shutil,argparse
parser=argparse.ArgumentParser(description='Make a disposable unsigned FLEX assignment fixture from native-fixture output.');parser.add_argument('work',type=Path);w=parser.parse_args().work.resolve();p=w/'sdk/octabam';sys.path[:0]=[str(p/'tools')]
import toolpath,ot_project as otp,emu_card
pr=w/'fresh-project';shutil.copytree(w/'fixture/project',pr,dirs_exist_ok=True)
def mutate(d):
 for part in range(otp.NPARTS_ALL):
  b=otp.PART_BASE+part*otp.PART_STRIDE
  for t in range(8):
   d[b+otp.MTYPE_OFF+t]=1;d[b+0x45+30*t:b+0x48+30*t]=bytes(3)
  d[b+0x129+1]=127;d[b+0x129+2]=127
  d[b+0x1e3+6]=1
 for t in range(8):
  o=otp.trac_off(0,t);d[o:o+64]=bytes(64);d[o+0x59:o+0x59+2048]=bytes([255])*2048
otp._bank_write(pr,1,mutate,guard=False)
c,_=emu_card.stage_project(pr,'OCTABAM','POLYBENCH',tree=w/'fresh-tree',image_mb=64,audio=[str(w/'fixture/tone.wav')+':AUDIO/REPITCH_440_120.wav'])
(w/'fresh.img').write_bytes(c)
