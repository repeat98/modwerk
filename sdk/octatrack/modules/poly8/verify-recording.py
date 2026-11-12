#!/usr/bin/env python3
"""Verify private native cold-reload dumps: recorded cluster, four voices,
unchanged track tuning. Never commit card images or raw memory dumps.
"""
from pathlib import Path
import argparse,json,struct
p=argparse.ArgumentParser(description=__doc__);p.add_argument('work',type=Path);a=p.parse_args()
def read(name):return (a.work/f'reloaded-{name}.bin').read_bytes()
b=read('pattern');records=[{'step':i+1,'root':b[0x59+i*32],'shape':b[0x59+i*32+30]} for i in range(64) if b[0x59+i*32+30]<232]
assert {'step':3,'root':72,'shape':67} in records,records
v,e,s,x=map(read,['voices','poly_extra_voices','poly_primary_shift','poly_extra_shift'])
assert len(v)==8*168 and len(e)==31*168
shifts=[struct.unpack('b',s[i:i+1])[0] for i in range(8) if v[i*168]]+[struct.unpack('b',x[i:i+1])[0] for i in range(31) if e[i*168]]
assert sorted(shifts)==[-12,-11,-10,-9],shifts
part=read('part');tuning=int.from_bytes(read('poly_track_inc')[:4],'big')
assert part[0x30]==64 and tuning==0x4000000,(part[0x30],tuning)
log=(a.work/'reloaded.log').read_text();assert 'LOAD PROJECT handled' in log and 'target 1300), run ended REACHED' in log
print(json.dumps({'cold_reloaded_records':records,'playing_offsets':shifts,'track_tuning':tuning,'part_PTCH':part[0x30]},indent=2))
