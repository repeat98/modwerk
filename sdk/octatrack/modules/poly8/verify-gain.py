#!/usr/bin/env python3
"""Validate private native full-scale DC dumps; keep audio and memory dumps private."""
from pathlib import Path
import argparse,json,struct
p=argparse.ArgumentParser(description=__doc__);p.add_argument('work',type=Path);w=p.parse_args().work
report={}
for frame,count in [(130,1),(330,8)]:
 voices=(w/f'gain-{frame}-voices.bin').read_bytes();extra=(w/f'gain-{frame}-extra.bin').read_bytes()
 assert sum(voices[i*168]!=0 for i in range(8))+sum(extra[i*168]!=0 for i in range(31))==count
for polarity,want in [('positive',33546240),('negative',-33554432)]:
 values=struct.unpack('>32i',(w/f'gain-{polarity}-sum.bin').read_bytes())
 assert min(values)>=-33554432 and max(values)<=33554431
 assert values==(want,)*32,(polarity,values)
 report[polarity]={'sum':want,'heads':8,'within_full_scale':True}
print(json.dumps(report,indent=2))
