#!/usr/bin/env python3
"""Verify different valid working/stored channels on a private project copy."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from bench import Bench,card_tools


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','build','project-tree','output']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--action',choices=['apply','cancel','interrupt'],required=True)
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private output directory.')
    out.mkdir(parents=True,mode=0o700);tree=out/'tree';(tree/'TEST/AUDIO').mkdir(parents=True)
    shutil.copytree(a.project_tree,tree/'TEST/TRIAL');card=card_tools();image=out/'card.private.img'
    image.write_bytes(card.build_image(tree,size_mb=64));before={f.name:f.read_bytes() for f in (tree/'TEST/TRIAL').glob('bank*')}
    assert len(before)==32
    at=lambda part,track:0x8eed6+part*0x18bb+9+0x4e2+track*36
    want=bytes(before['bank01.work'][at(0,t)] for t in range(8))
    checkpoints=[f.read_bytes() for f in (tree/'TEST/TRIAL').glob('MIDI4_?.DAT')]
    baseline=max(checkpoints,key=lambda d:int.from_bytes(d[8:12],'big'))
    assert baseline[12:16]==b'\0\0\0\1'
    assert any(before[f'bank{b:02d}.work'][at(part,t)]!=before[f'bank{b:02d}.strd'][at(part,t)] for b in range(1,17) for part in range(8) for t in range(8))
    b=Bench(a.emulator,a.stock,a.build,image,out/'run')
    try:
        b.press(0x12);b.setup();shutil.copyfile(b.out/'lcd.bin',out/'setup.lcd.bin')
        b.apply();b.run(100);assert b.number('status')==18
        shutil.copyfile(b.out/'lcd.bin',out/'confirm.lcd.bin');b.press(0x31)
        for _ in range(2000):
            b.run(100)
            if b.number('step')==2 and b.number('cursor')>=2:break
            assert b.number('busy'),'Check rejected a valid working/stored channel difference: '+str(b.number('failure'))
        else:raise AssertionError('Did not reach persisted Bank B.')
        shutil.copyfile(b.out/'lcd.bin',out/'progress.lcd.bin')
        if a.action=='cancel':b.press(0x32)
        if a.action!='interrupt':
            for _ in range(2000):
                b.run(100)
                if not b.number('busy') and not b.number('recovery'):break
            else:raise AssertionError('Transaction did not finish.')
            assert b.number('status')==(7 if a.action=='apply' else 11)
        b.cmd('card flush')
        if a.action=='interrupt':
            cut_files=card.extract_image(image.read_bytes())
            for i in range(2):
                j=cut_files[f'TEST/TRIAL/MIDI4_J{i}.DAT'];assert j[4:8]==b'\0\0\0\2' and j[32:36]==b'MAP2'
    finally:b.close()
    b=Bench(a.emulator,a.stock,a.build,image,out/'restart')
    try:
        for _ in range(2000):
            if not b.number('busy') and not b.number('recovery'):break
            b.run(100)
        else:raise AssertionError('Fresh process did not finish recovery.')
        assert int.from_bytes(b.read(b.origin+b.symbols['state']+2456,4),'big')==1
        b.cmd('card flush');files=card.extract_image(image.read_bytes())
        for name,old in before.items():
            data=files['TEST/TRIAL/'+name]
            if a.action!='apply':assert data==old,'Did not restore each disk copy exactly: '+name
            else:
                expected=bytearray(old)
                for part in range(8):
                    for t in range(8):expected[at(part,t)]=want[t]
                expected[-2:]=(sum(expected[16:-2])&65535).to_bytes(2,'big')
                assert data==expected,'Changed unrelated bytes or missed a channel: '+name
        newest=max((files['TEST/TRIAL/'+f'MIDI4_{i}.DAT'] for i in range(2)),key=lambda d:int.from_bytes(d[8:12],'big'))
        expected_names=baseline[16:144]*16 if a.action=='apply' else baseline[16:2064]
        assert newest[16:2064]==expected_names
        if a.action=='apply':
            for bank in range(16):b.bank(bank);assert b.channels()==want
        report={'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'action':a.action,'checks':['Selected MIDI track 3; confirmed replacement passes valid differing work/strd channels','Bank B persisted before cancellation/interruption','Fresh process retains initialized marker','All 32 files preserve unrelated bytes and exact expected channel/checksum contents','Each original file restored independently' if a.action!='apply' else 'Every bank uses Bank A channels and names after restart','Name checkpoint matches committed or previous snapshot'],'limitations':['Disposable private project copy, publication/tick/IRQ fixtures; no physical card writes or hardware qualification.']}
        (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'report':str(out/'report.json')}))
    finally:b.close()


if __name__=='__main__':main()
