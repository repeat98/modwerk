#!/usr/bin/env python3
"""Check native pool dumps, kept privately by native-fixture.py."""
from pathlib import Path
import argparse,json,struct
p=argparse.ArgumentParser(description=__doc__);p.add_argument('work',type=Path);a=p.parse_args();reports=[]
for label,expected in [('pool-one',(1,7)),('pool-many',(8,0)),('pool-steal',(2,6))]:
 def read(kind):return (a.work/f'{label}-{kind}.bin').read_bytes()
 primary,extra=read('voices'),read('extra')
 assert len(primary)==8*168 and len(extra)==31*168
 counts=(sum(primary[i]!=0 for i in range(0,len(primary),168)),sum(extra[i]!=0 for i in range(0,len(extra),168)))
 assert counts==expected,(label,counts)
 assert sum(counts)==8
 tracks=read('track');notes=read('note');inc=struct.unpack('>39I',read('inc'))
 if label=='pool-one':
  assert read('primary')[0]==212
  owned=[notes[i] for i in range(31) if extra[i*168]]
  assert sorted(owned)==list(range(205,212)),owned
  assert all(tracks[i]==0 for i in range(31) if extra[i*168])
 if label=='pool-steal':
  assert read('primary')[:2]==bytes([213,212]),'new notes were not allocated'
  assert 181 not in notes,'stolen oldest note still owns a head'
 reports.append({'case':label,'primary':counts[0],'extensions':counts[1],'total':sum(counts)})
print(json.dumps(reports,indent=2))
