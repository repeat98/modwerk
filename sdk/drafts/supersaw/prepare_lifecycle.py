#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Prepare private, disposable CF images from a separate owner project copy."""
import argparse,hashlib,json,re,sys
from pathlib import Path
sys.dont_write_bytecode=True
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--sdk',type=Path,required=True)
ap.add_argument('--project',type=Path,required=True)
ap.add_argument('--out',type=Path,required=True)
a=ap.parse_args();a.out=a.out.resolve();a.out.mkdir(parents=True,exist_ok=False)
sdk=a.sdk.resolve();source=a.project.resolve()
sys.path[:0]=[str(sdk/'sdk/octabam/tools/harness'),str(sdk/'sdk/octabam/tools/emu'),str(sdk/'sdk/octabam/tools/hw')]
import ab_fixture,emu_card,ot_project as otp
# The owner's older project may use shorter PART/PTRN records. Never apply
# modern fixed offsets to it: validate every current and saved Part first.
for bank in source.glob('bank*.*'):
    if bank.suffix not in ('.work','.strd'):continue
    raw=bank.read_bytes()
    for i in range(8):
        at=otp.PART_BASE+i*otp.PART_STRIDE
        if raw[at:at+4]!=b'PART':
            raise ValueError(bank.name+': incompatible Part layout; use a modern disposable donor')
proof={'scope':'synthetic private CF project; native Save Project not exercised','hardwareTested':False,'images':{}}
for signed in (False,True):
    label='signed' if signed else 'plain'
    project=ab_fixture.prepare(source,a.out/(label+'-project'))
    for p in project.glob('project.*'):
        raw=p.read_bytes()
        # A donor may name hundreds of external samples. They are not staged:
        # remove its pool records so native LOAD PROJECT can actually finish.
        raw=re.sub(rb'\[SAMPLE\].*?\[/SAMPLE\]\s*',b'',raw,flags=re.S)
        for key,value in {'TRACK':7,'MIDI_AUDIO_TRK_NOTE_IN':1,'MIDI_AUDIO_TRK_CC_IN':1,'MIDI_CLOCK_RECEIVE':0,'MIDI_TRIG_CH1':0}.items():
            raw,n=re.subn(rb'(?m)^'+key.encode()+rb'=[^\r\n]*',key.encode()+b'='+str(value).encode(),raw)
            if n!=1:raise ValueError('Missing/ambiguous project field '+key)
        p.write_bytes(raw)
    for p in project.glob('bank*.work'):
        def mutate(data):
            for i in range(8):data[otp.PART_BASE+i*otp.PART_STRIDE+9+0x122]=10
            if signed:
                base=otp.PART_BASE+9
                data[base+60:base+63]=b'SW\1'
                data[base+48:base+54]=bytes((64,85,127,6,127,80))
                data[base+480:base+486]=bytes((113,114,115,116,117,118))
        otp._bank_write(project,int(p.stem[4:]),mutate,guard=False)
    image,tree=emu_card.stage_project(project,'MODWERK','TEMPLATE',tree=a.out/(label+'-tree'))
    path=a.out/(label+'.img');path.write_bytes(image)
    proof['images'][label]={'sha256':hashlib.sha256(image).hexdigest(),'bytes':len(image),'externalSampleRecords':0}
(a.out/'fixture.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
