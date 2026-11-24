#!/usr/bin/env python3
"""Native on-device INIT action and actual Save to New hooks; private cards only."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from bench import Bench,card_tools


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','source-card','build','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private directory.')
    out.mkdir(parents=True,mode=0o700);card=card_tools();tree=out/'tree'
    (tree/'TEST/TRIAL').mkdir(parents=True);(tree/'TEST/AUDIO').mkdir()
    old=card.extract_image(a.source_card.read_bytes())
    for name,data in old.items():
        if name.startswith('TEST/PROFILE/'):(tree/'TEST/TRIAL'/Path(name).name).write_bytes(data)
    image=out/'card.private.img';image.write_bytes(card.build_image(tree,size_mb=64))
    checks=[]
    def expect(condition,message):
        if not condition:raise AssertionError(message)
        checks.append(message)
    def wait(b,initialized):
        for _ in range(1000):
            if b.number('busy')==0 and b.number('recovery')==0:
                # state.initialized follows names + flags + old channels.
                value=int.from_bytes(b.read(b.origin+b.symbols['state']+2456,4),'big')
                if value==initialized:return
            b.run(500)
        raise AssertionError('Initialization/recovery did not complete: '+str(b.number('status')))
    for phase,project in [('create','TRIAL'),('restart','TRIAL'),('copy-restart','COPYTEST'),('replace-restart','COPYTEST')]:
        b=Bench(a.emulator,a.stock,a.build,image,out/phase,project)
        try:
            expect(b.number('loaded')==1,phase+': profile loaded in engine')
            if phase=='create':
                b.channel(3);b.rename('BASS3');b.setup()
                shutil.copyfile(b.out/'lcd.bin',out/'init-control.lcd.bin')
                b.press(0x3b);expect(not any(b.read(0x460e7612,4)) and b.number('requested')==0,'plain D only shows the FUNC hint; no text editor or initialization')
                b.save_project()
                b.cmd('card flush');before_init=card.extract_image(image.read_bytes(),out/'before-init')
                b.apply();b.press(0x25)
                expect(not any(b.read(0x400bc6c0,4)),'bare FX1 page navigation remains usable during Apply')
                b.press(0x32);wait(b,0)
                expect(b.number('status')==11,'actual NO cancels cooperative Apply')
                b.apply()
                for _ in range(1000):
                    b.run(100)
                    if b.number('step')==2 and b.number('cursor')>0:
                        shutil.copyfile(b.out/'lcd.bin',out/'apply-progress.lcd.bin');break
                    if b.number('busy')==0:break
                wait(b,1);expect(b.number('status')==7,'native action confirms MIDI SETUP SAVED')
                b.cmd('card flush');bankfiles=card.extract_image(image.read_bytes())
                for bank in range(1,17):
                    for suffix in ['work','strd']:
                        data=bankfiles[f'TEST/TRIAL/bank{bank:02d}.{suffix}']
                        expect(int.from_bytes(data[-2:],'big')==sum(data[16:-2])&65535,f'bank {bank} {suffix}: checksum valid')
                        before=before_init[f'TEST/TRIAL/bank{bank:02d}.{suffix}']
                        allowed={len(data)-2,len(data)-1}
                        for part in range(8):
                            for track in range(8):allowed.add(0x8eed6+part*0x18bb+9+0x4e2+track*36)
                        expect(len(before)==len(data) and all(x==y or i in allowed for i,(x,y) in enumerate(zip(before,data))),f'bank {bank} {suffix}: every non-channel byte preserved')
                        for part in range(8):
                            at=0x8eed6+part*0x18bb+9+0x4e2
                            want=5 if bank==2 and part%4==0 else 2 if bank==3 and part%4==0 else 3
                            expect(data[at]==want,f'bank {bank} {suffix} Part {part+1}: initialized native channel')
                b.bank(1);expect(b.channels()[0]==5,'legacy Bank B override retained')
                expect(b.name()==b'LEAD','legacy Bank B name retained')
                b.bank(3);expect(b.channels()[0]==3,'unvisited Bank D initialized before first selection')
                expect(b.name()==b'BASS3','Bank D snapshots Bank A name')
                b.bank(0);b.channel(4);b.rename('BASS4');b.bank(3)
                expect(b.channels()[0]==3,'later Bank A channel edit does not change Bank D')
                expect(b.name()==b'BASS3','later Bank A name edit does not change Bank D')
                b.apply();b.run(100)
                expect(b.number('status')==18,'initialized project asks before replacing all banks')
                shutil.copyfile(b.out/'lcd.bin',out/'replace-confirm.lcd.bin')
                b.press(0x32);b.run(100)
                expect(b.number('busy')==0 and b.name()==b'BASS3' and b.channels()[0]==3,'NO dismisses replacement without changing independent Bank D')
                b.save_project();b.press(0x32)
            elif phase=='restart':
                wait(b,1);b.bank(0);expect(b.channels()[0]==4,'fresh process retains later Bank A channel edit')
                expect(b.name()==b'BASS4','fresh process retains Bank A name edit')
                b.bank(3);expect(b.channels()[0]==3,'fresh process does not reapply Bank A to Bank D')
                expect(b.name()==b'BASS3','fresh process retains independent Bank D name')
                b.press(0x1c);b.run(300);b.press(0x21)
                for _ in range(4):b.press(0x20)
                b.press(0x31)
                for _ in range(900):
                    b.run(500)
                    if any(b.read(0x460e7612,4)):break
                expect(any(b.read(0x460e7612,4)),'native Save to New editor opens')
                # TRIAL has five characters, so replace it with an eight-letter
                # name (no host-side parameter or text writes).
                b.text('COPYTEST');b.press(0x31)
                for _ in range(900):
                    b.run(500)
                    if b.read(0x100f8378,9)==b'COPYTEST\0' and b.number('generation')>=2 and b.number('clone_ready')==0:break
                b.run(3000)
                expect(b.read(0x100f8378,9)==b'COPYTEST\0','native Save to New activates copied project')
                expect(b.number('status')==2,'package hooks save copied names without injected source identity')
            elif phase=='copy-restart':
                wait(b,1);b.bank(0);expect(b.name()==b'BASS4','copied project restores Bank A name')
                expect(b.channels()[0]==4,'copied project restores Bank A native channel')
                b.bank(3);expect(b.name()==b'BASS3','copied project restores Bank D snapshot')
                expect(b.channels()[0]==3,'copied project restores Bank D native channel')
                b.rename('COPY4');b.bank(0);b.channel(6);b.rename('REMAP');b.save_project()
                b.apply();b.run(100)
                expect(b.number('status')==18,'copied initialized project also requires explicit replacement confirmation')
                b.press(0x31);wait(b,1)
                expect(b.number('status')==7,'YES confirms replacement and reaches MIDI SETUP SAVED')
                for bank in range(16):
                    b.bank(bank)
                    expect(b.channels()[0]==6 and b.name()==b'REMAP',f'bank {bank+1}: explicit replacement copies Bank A channel and name')
                b.cmd('card flush');replaced=card.extract_image(image.read_bytes())
                for bank in range(1,17):
                    for suffix in ['work','strd']:
                        data=replaced[f'TEST/COPYTEST/bank{bank:02d}.{suffix}']
                        for part in range(8):
                            at=0x8eed6+part*0x18bb+9+0x4e2
                            expect(data[at]==6,f'replaced bank {bank} {suffix} Part {part+1}: native channel saved')
                b.save_project()
            else:
                wait(b,1)
                for bank in [0,1,3,15]:
                    b.bank(bank);expect(b.channels()[0]==6 and b.name()==b'REMAP',f'fresh process bank {bank+1}: replacement persists')
                b.bank(0);b.channel(7);b.rename('AFTER');b.save_project();b.bank(3)
                expect(b.channels()[0]==6 and b.name()==b'REMAP','ordinary Bank A edits do not reapply after replacement')
            expect('errors=0' in b.cmd('card flush'),phase+': card flush clean')
        finally:b.close()
    files=card.extract_image(image.read_bytes(),out/'saved')
    newest=lambda project:max((files[f'TEST/{project}/MIDI4_{i}.DAT'] for i in range(2)),key=lambda d:int.from_bytes(d[8:12],'big'))
    expect(newest('TRIAL')[16+3*128:32+3*128].split(b'\0',1)[0]==b'BASS3','copy edit leaves original project unchanged')
    expect(newest('COPYTEST')[16+3*128:32+3*128].split(b'\0',1)[0]==b'REMAP','copy owns replaced name checkpoint')
    for name,data in old.items():
        if name.startswith('TEST/PROFILE/MIDI3_'):expect(files['TEST/TRIAL/'+Path(name).name]==data,'old v7 profile remains byte-identical')
    report={'checks':checks,'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'stockSha256':hashlib.sha256(a.stock.read_bytes()).hexdigest(),'emulatorSha256':hashlib.sha256(a.emulator.read_bytes()).hexdigest(),'initialization':'Actual FUNC + D; cooperative native engine persistence','copy':'Actual source-capture/destination package hooks; no injected project identity','limitations':['Private runtime publication, UI tick shim and separately recorded first-sector IRQ fixture, not full resident base.','Hardware and shared lifecycle admission not qualified.']}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'assertions':len(checks),'report':str(out/'report.json')}))


if __name__=='__main__':main()
