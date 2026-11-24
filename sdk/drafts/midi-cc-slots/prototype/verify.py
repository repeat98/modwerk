#!/usr/bin/env python3
"""Private native template test. No device connection; staged files stay private."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import shutil
import struct
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent))
import emulator_fixture
from stage import stage,bank_channels


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','source-card','build','output']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--resume-card',type=Path,help='Continue a private native project-save run')
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private directory.')
    out.mkdir(parents=True,mode=0o700)
    spec=importlib.util.spec_from_file_location('template_card',ROOT/'sdk/octabam/tools/emu/emu_card.py')
    card=importlib.util.module_from_spec(spec);spec.loader.exec_module(card)
    source=out/'source'
    original=card.extract_image(a.source_card.read_bytes())
    source.mkdir()
    for name,data in original.items():
        if name.startswith('TEST/PROFILE/'):(source/Path(name).name).write_bytes(data)
    tree=out/'tree';project=tree/'TEST/TEMPLATE'
    receipt=stage(source,project)
    (tree/'TEST/AUDIO').mkdir()
    image=out/'card.private.img';image.write_bytes(card.build_image(tree,size_mb=64))
    if a.resume_card:image.write_bytes(a.resume_card.read_bytes())
    stock=a.stock.read_bytes();fixture_path=a.build/'reconstruction/fixture-47e00000.private.json'
    fixture=emulator_fixture.load(fixture_path,stock);origin=fixture['origin']
    symbols=json.loads((a.build/'symbols.json').read_text())['symbols']
    checks=[];commands=[]
    def expect(condition,message):
        if not condition:raise AssertionError(message)
        checks.append(message)
    # Explicit simulation of future shared hooks. Only this private native
    # fixture adds the Save to New notification; the package does not own it.
    stubs='''.text
.global tick_stub,clone_stub,clone_source
tick_stub:
 jsr 0x4005213c
 jsr 0x4007e940
 lea %sp@(-16),%sp
 moveml %d0-%d1/%a0-%a1,%sp@
 clrl %sp@-
 jsr TICK
 addql #4,%sp
 moveml %sp@,%d0-%d1/%a0-%a1
 lea %sp@(16),%sp
 jmp 0x40052228
clone_stub:
 movel %d2,%sp@-
 movel %sp@(20),%sp@-
 movel %sp@(20),%sp@-
 movel %sp@(20),%sp@-
 movel %sp@(20),%sp@-
 jsr 0x400917c8
 lea %sp@(16),%sp
 movel %d0,%d2
 tstl %d0
 bmi.s clone_done
 pea clone_source
 jsr CLONE
 addql #4,%sp
clone_done:
 movel %d2,%d0
 movel %sp@+,%d2
 rts
clone_source: .space 260
'''.replace('TICK',hex(origin+symbols['mm_profile_tick'])).replace('CLONE',hex(origin+symbols['mm_template_destination_created']))
    (out/'stubs.s').write_text(stubs)
    subprocess.run(['m68k-elf-as','-mcpu=54455','-o',str(out/'stubs.o'),str(out/'stubs.s')],check=True)
    subprocess.run(['m68k-elf-ld','-Ttext',hex(origin+0x8000),'-o',str(out/'stubs.elf'),str(out/'stubs.o')],check=True,capture_output=True)
    subprocess.run(['m68k-elf-objcopy','-O','binary',str(out/'stubs.elf'),str(out/'stubs.bin')],check=True)
    stub_symbols={line.split()[2]:int(line.split()[0],16) for line in subprocess.check_output(['m68k-elf-nm','--defined-only',str(out/'stubs.elf')],text=True).splitlines()}
    for phase,project_name in [('create','TEMPLATE'),('restart','TEMPLATE'),('copy-restart','COPYTEST')]:
        if phase=='create' and a.resume_card:continue
        port=subprocess.Popen([str(a.emulator),'--image',str(a.stock),'--mkii','--boot-logo','--ms','4000','--interactive','--internal-clock','--rtc','off','--main-level','off','--card',str(image),'--card-rw','--mount','--set','TEST','--project',project_name,'--lcd',str(out/(phase+'.lcd.bin'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/(phase+'.stderr.log')).open('wb'))
        selector=selectors.DefaultSelector();selector.register(port.stdout,selectors.EVENT_READ)
        pending=b'';rows=[0]*8
        def response(prefix):
            nonlocal pending
            until=time.monotonic()+180
            while time.monotonic()<until:
                while b'\n' in pending:
                    line,pending=pending.split(b'\n',1)
                    if line.startswith(prefix):return line.decode()
                if port.poll() is not None:raise RuntimeError('Emulator exited.')
                if selector.select(1):pending+=os.read(port.stdout.fileno(),65536)
            raise TimeoutError('Emulator response timeout.')
        def cmd(command):
            port.stdin.write((command+'\n').encode());port.stdin.flush()
            reply=response((b'ok',b'peek ',b'card ',b'midi-tx ',b'err'))
            commands.append([phase,command,reply])
            (out/'commands.private.json').write_text(json.dumps(commands,indent=2)+'\n')
            if reply.startswith('err') or ('stop=' in reply and 'stop=time' not in reply):raise RuntimeError(reply)
            return reply
        def run(ms=100):cmd('run '+str(ms))
        def read(at,n):return bytes.fromhex(cmd(f'peek {hex(at)} {n}').split()[1])
        def key(code,down):
            row,bit=code>>3,1<<(code&7);rows[row]=rows[row]|bit if down else rows[row]&~bit
            cmd(f'key {32|row} {rows[row]}');run(50)
        def press(code):key(code,True);key(code,False)
        def bank(index,settle=100):
            press(0x32);key(0x2f,True);press(index);key(0x2f,False);press(0);run(settle)
            expect(read(0x100b14ce,1)==bytes([index]),f'{phase}: bank {index+1} selected')
        def channels():
            at=int.from_bytes(read(0x46c82456,4),'big');part=read(0x100b14cf,1)[0]
            return bytes(read(at+0x8f262+part*6322+t*36,1)[0] for t in range(8))
        def setup():press(0x22);run(500);press(0x22);press(0x22)
        def channel(want):
            setup()
            for _ in range(40):
                now=int.from_bytes(read(0x460d5cb4,4),'big')
                if now==want:break
                cmd(f'knob 48 {4 if now<want else -4}');run()
            else:raise AssertionError('Channel knob failed.')
            press(0x31);run(100)
        def name(index=0):
            b=read(0x100b14ce,1)[0]
            if b:return read(origin+symbols['state']+544+(b-1)*128+index*16,16).split(b'\0',1)[0]
            return read(origin+symbols['names_store']+index*16,16).split(b'\0',1)[0]
        def type_text(text):
            for _ in range(16):press(0x34)
            for index,character in enumerate(text.encode()):
                for _ in range(96):
                    current=read(0x460e743c+index,1)[0]
                    if current==character:break
                    press(0x33 if current<character else 0x20)
                else:raise AssertionError('Name character not reached.')
                if index+1<len(text):press(0x21)
        def rename(text):
            setup();press(0x3d)
            expect(any(read(0x460e7612,4)),phase+': MIDI NAME opens stock editor')
            type_text(text);press(0x31);run(1500)
        try:
            response(b'ready ')
            emulator_fixture.publish(fixture,cmd,read)
            stub=(out/'stubs.bin').read_bytes();expect(not any(read(origin+0x8000,len(stub))),'private stub RAM verified empty')
            cmd(f'poke {hex(origin+0x8000)} '+stub.hex())
            for at,symbol,length in [(0x4005221e,'tick_stub',10),(0x4008505c,'clone_stub',6)]:
                expect(read(at,length)==stock[at-0x40000400:at-0x40000400+length],f'{phase}: stock notification guard {hex(at)}')
                code=struct.pack('>HI',0x4ef9 if length==10 else 0x4eb9,stub_symbols[symbol])+b'\x4e\x71'*((length-6)//2)
                cmd(f'poke {hex(at)} '+code.hex())
            press(0x32);press(0x31);run(500)
            if not any(read(0x80000012,4)):press(0x35)
            expect(any(read(0x80000012,4)),phase+': MIDI editing mode confirmed')
            press(0x22);run(1500)
            expect(read(origin+symbols['loaded'],4)==b'\0\0\0\1',phase+': name profile loaded')
            if phase=='create':
                expect(channels()==bytes(receipt['channels']),'native startup channels come from bank storage')
                initial=name();bank(1);expect(channels()==bytes(receipt['channels']),'Bank B has template channels without profile restore')
                expect(name()==initial,'Bank B starts with independent template name')
                key(0x2d,True);press(0x2a);key(0x2d,False);run(300);press(0x31);run(300)
                expect(channels()==bytes(receipt['channels']),'Reload Part retains initialized channels')
                channel(5);expect(channels()[0]==5,'native panel changes Bank B channel')
                rename('LEAD2');expect(name()==b'LEAD2','native name editor commits independent Bank B name')
                bank(0);channel(3);rename('BASS3');bank(1,20)
                expect(name()==b'LEAD2','Bank A name edit does not change Bank B snapshot')
                expect(channels()[0]==5,'Bank B native Part retains override without profile channel restore')
                press(0x25);run(100)
                before=bytes.fromhex(cmd('midi-tx').split(' ',1)[1]);cmd('knob 48 4');run(100)
                after=bytes.fromhex(cmd('midi-tx').split(' ',1)[1])[len(before):]
                expect(any(v==0xe4 for v in after),'Bank B controller transmits pitch bend on channel 5')
                bank(2,20);expect(channels()[0]==2,'Bank C does not inherit later Bank A edit')
                expect(name()==initial,'Bank C name does not inherit later Bank A edit')
                # Save project through the native shortcut; no bank files are
                # rewritten by host code after the initial staged fixture.
                key(0x2d,True);press(0x1c);key(0x2d,False);run(3000);press(0x31);run(2000)
                expect('errors=0' in cmd('card flush'),'native project save flushes without errors')
            elif phase=='restart':
                bank(0);expect(channels()[0]==3,'fresh process restores Bank A channel 3 natively')
                bank(1,20);expect(channels()[0]==5,'fresh process restores independent Bank B channel 5')
                bank(2,20);expect(channels()[0]==2,'fresh process does not reinitialize Bank C')
                source_identity=read(origin+symbols['directory'],260)
                expect(source_identity.split(b'\0',1)[0].endswith(b'/TEST/TEMPLATE'),'private event fixture binds confirmed source identity')
                cmd(f"poke {hex(stub_symbols['clone_source'])} "+source_identity.hex())
                press(0x1c);run(300)
                shutil.copyfile(out/(phase+'.lcd.bin'),out/'menu-before.bin')
                press(0x21)
                shutil.copyfile(out/(phase+'.lcd.bin'),out/'menu-right.bin')
                for _ in range(4):press(0x20)
                shutil.copyfile(out/(phase+'.lcd.bin'),out/'menu-down.bin')
                press(0x31)
                # Stock saves the source project before opening this editor.
                for _ in range(24):
                    run(500)
                    if any(read(0x460e7612,4)):break
                expect(any(read(0x460e7612,4)),'Save to New opens stock naming editor')
                shutil.copyfile(out/(phase+'.lcd.bin'),out/'new-editor.bin')
                type_text('COPYTEST');press(0x31)
                for _ in range(60):
                    run(500)
                    if read(origin+symbols['mm_template_clone_count'],4)==b'\0\0\0\1':break
                run(3000)
                shutil.copyfile(out/(phase+'.lcd.bin'),out/'after-copy.bin')
                expect(read(0x100f8378,9)==b'COPYTEST\0','native Save to New activates COPYTEST project')
                expect(read(origin+symbols['mm_template_clone_count'],4)==b'\0\0\0\1','successful native Save to New sends one profile-copy notification')
                expect(read(origin+symbols['mm_template_clone_failed'],4)==b'\0'*4,'name-copy callback reports success')
                expect(name()==b'BASS2','new project retains Bank C template name')
                bank(0);expect(name()==b'BASS3','Save to New retains Bank A name edit')
                bank(1);expect(name()==b'LEAD2','Save to New retains Bank B name override')
                cmd('card flush')
            else:
                bank(0);expect(name()==b'BASS3','fresh copied project restores Bank A name')
                expect(channels()[0]==3,'fresh copied project restores Bank A native channel')
                bank(1);expect(name()==b'LEAD2','fresh copied project restores Bank B name')
                expect(channels()[0]==5,'fresh copied project restores Bank B native channel')
                rename('COPY2');expect(name()==b'COPY2','copied project name can change independently')
                bank(2);expect(name()==b'BASS2','copied project retains frozen Bank C name')
                expect(channels()[0]==2,'copied project retains frozen Bank C native channel')
            cmd('card flush')
        finally:
            if port.poll() is None:
                port.stdin.write(b'quit\n');port.stdin.flush()
                try:port.wait(timeout=10)
                except subprocess.TimeoutExpired:port.kill();port.wait()
            selector.close()
    files=card.extract_image(image.read_bytes(),out/'saved')
    for bank_index in range(1,17):
        data=files[f'TEST/TEMPLATE/bank{bank_index:02d}.work']
        expect(int.from_bytes(data[-2:],'big')==sum(data[16:-2])&65535,f'bank {bank_index}: native checksum valid')
        expect(bank_channels(data,0)[0]=={1:3,2:5}.get(bank_index,2),f'bank {bank_index}: saved native channel correct')
        copy=files[f'TEST/COPYTEST/bank{bank_index:02d}.work']
        expect(bank_channels(copy,0)==bank_channels(data,0),f'bank {bank_index}: Save to New copies native channels')
        for part in range(1,8):expect(bank_channels(copy,part)==bytes(receipt['channels']),f'bank {bank_index} Part copy {part+1}: native template retained')
    newest=lambda project:max((files[f'TEST/{project}/MIDI3_{i}.DAT'] for i in range(2)),key=lambda d:int.from_bytes(d[8:12],'big'))
    expect(newest('TEMPLATE')[688:704].split(b'\0',1)[0]==b'LEAD2','editing COPY does not change TEMPLATE name on card')
    expect(newest('COPYTEST')[688:704].split(b'\0',1)[0]==b'COPY2','COPYTEST owns independent name checkpoint')
    report={'checks':checks,'fixture':receipt,'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'stockSha256':hashlib.sha256(stock).hexdigest(),'emulatorSha256':hashlib.sha256(a.emulator.read_bytes()).hexdigest(),'sourceCardSha256':hashlib.sha256(a.source_card.read_bytes()).hexdigest(),'limitations':['Staged-card initializer, not on-device atomic initialization.','Private UI scheduling and Save to New notification fixtures; not full resident base.','No hardware testing.']}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'assertions':len(checks),'report':str(out/'report.json')}))


if __name__=='__main__':main()
