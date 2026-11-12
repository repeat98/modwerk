#!/usr/bin/env python3
"""Read native-port steady-window counts without its full-run denominator bug.
Example: benchmark-result.py separate-amp.log shared-amp.log --window 1200
The --step at the start of the window resets the CLI instruction counter;
its printed per-frame figure incorrectly divides by the entire run length.
"""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('logs',nargs='+',type=Path);p.add_argument('--window',required=True,type=int);a=p.parse_args();assert a.window>0
out=[]
for path in a.logs:
 matches=re.findall(r'^cpu\s*:\s*(\d+) ColdFire instructions',path.read_text(),re.M)
 if len(matches)!=1:raise SystemExit(f'{path}: expected one completed CPU report')
 n=int(matches[0]);out.append({'case':path.stem,'instructions':n,'measured_frames':a.window,'instructions_per_16_samples':n/a.window})
print(json.dumps(out,indent=2))
