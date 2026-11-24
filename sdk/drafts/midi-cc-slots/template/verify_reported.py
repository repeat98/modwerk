#!/usr/bin/env python3
"""Recheck a private reported project copy, including actual track-6 MIDI OUT."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from bench import Bench,card_tools


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','build','project','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private output directory.')
    out.mkdir(parents=True,mode=0o700);shutil.copytree(a.project,out/'tree/TEST/NEW');(out/'tree/TEST/AUDIO').mkdir()
    card=card_tools();image=out/'card.private.img';image.write_bytes(card.build_image(out/'tree',size_mb=64))
    old={p.name:p.read_bytes() for p in a.project.glob('MIDI3_*.DAT')}
    records=[p.read_bytes() for p in a.project.glob('MIDI4_[01].DAT')]
    source=max(records,key=lambda d:int.from_bytes(d[8:12],'big'));name=source[16+5*16:32+5*16].split(b'\0',1)[0]
    b=Bench(a.emulator,a.stock,a.build,image,out/'native','NEW');checks=[]
    try:
        b.press(0x15);assert b.read(0x100b14cc,1)==b'\5'
        b.apply()
        for _ in range(1600):
            b.run(500)
            if not b.number('busy') and not b.number('recovery'):break
        assert b.number('status')==7,'Apply failed: '+str(b.number('failure'))
        checks.append('FUNC + D completes on a private copy of reported NEW without automatic project reload')
        b.bank(1);assert b.channels()==bytes(range(1,9))
        at=b.origin+b.symbols['state']+5*16
        assert b.read(at,16).split(b'\0',1)[0]==name
        checks.append('Bank B has all eight native channels and the reported MIDI track-6 name')
        b.press(0x25);b.run(300)
        b.key(0x2d,True);b.press(0x38);b.key(0x2d,False);b.run(200)
        before=bytes.fromhex(b.cmd('midi-tx').split(' ',1)[1])
        b.cmd('knob 48 4');b.run(400)
        after=bytes.fromhex(b.cmd('midi-tx').split(' ',1)[1])[len(before):]
        assert any(v in after for v in [0xb5,0xd5,0xe5]),'No control message transmitted on MIDI channel 6.'
        checks.append('Actual controller output from MIDI track 6 in Bank B uses channel 6')
        b.cmd('card flush');files=card.extract_image(image.read_bytes())
        for n,data in old.items():assert files['TEST/NEW/'+n]==data
        for suffix in ['work','strd']:
            data=files['TEST/NEW/bank02.'+suffix]
            for part in range(8):assert data[0x8eed6+part*0x18bb+9+0x4e2+5*36]==6
        checks.append('Both Bank B files and all current/saved Parts retain channel 6; legacy profiles remain unchanged')
    finally:b.close()
    (out/'report.json').write_text(json.dumps({'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'checks':checks,'limitations':['Reported project copied read-only to a disposable emulator card.','Private publication/tick/first-sector IRQ fixtures; no physical fix qualification.']},indent=2)+'\n')
    print(json.dumps({'report':str(out/'report.json')}))


if __name__=='__main__':main()
