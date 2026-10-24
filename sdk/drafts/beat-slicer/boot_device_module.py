#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Exercise the real independent AED slicer through an adapted emulator and USB.

Requires a disposable BEATLAB / PROJECT 261023 fixture with file-backed Flex
and Static slot zero, PULSE.wav (44,100 frames, stereo 16-bit, 44.1 kHz).
Uses panel gestures and the real loader; never writes emulator memory or drives
a physical unit. Copies the card before editing. Raw logs and frames are private.
A results receipt is written only after both kinds and USB Undo pass.
"""
from pathlib import Path
import sys,struct,json,hashlib,time,shutil
HERE=Path(__file__).resolve().parent
APP=HERE.parents[2]
sys.path.insert(0,str(APP/'sdk/machines/octatrack/elekloader'))
from boot_observe import Port
from boot_writer import tap
from boot_static import matrix_tap
import verify_vendor_usb as usb

import argparse
parser=argparse.ArgumentParser(description=__doc__)
for name in ('emulator','base-dir','package','card','output'):
    parser.add_argument('--'+name,type=Path,required=True)
parser.add_argument('--repeat',action='store_true',help='Repeat replacement/NO/YES with all five spacings before stock clearing.')
parser.add_argument('--set',default='BEATLAB')
parser.add_argument('--project',default='PROJECT 261023')
args=parser.parse_args()
for name in ('emulator','base_dir','package','card','output'):
    setattr(args,name,getattr(args,name).expanduser().resolve())
out=args.output
if out==APP or APP in out.parents:
    parser.error('Private output must be outside the repository.')
proof=json.loads((args.base_dir/'proofs.json').read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
inputs={name:{'sha256':digest(path),'bytes':path.stat().st_size} for name,path in
        (('emulator',args.emulator),('base',args.base_dir/'MAIN.raw'),
         ('proof',args.base_dir/'proofs.json'),('symbols',args.base_dir/'symbols.json'),
         ('package',args.package),('card',args.card),('driver',Path(__file__)))}
assert inputs['base']['sha256']==proof['manifest']['main_sha256'],'MAIN does not match its proof'
out.mkdir(parents=True,exist_ok=False)
shutil.copyfile(__file__,out/'driver.py')
shutil.copyfile(args.base_dir/'proofs.json',out/'base-proof.json')
card=out/'card.private.img';shutil.copyfile(args.card,card)
port=Port(['stdbuf','-oL',str(args.emulator),'--image',str(args.base_dir/'MAIN.raw'),
    '--card',str(card),'--mount','--set',args.set,'--project',args.project,
    '--load-ms','30000','--load-early','--pc-ring','256','--dsp','--frame','--ms','3000','--interactive',
    '--main-level','off','--rtc','host','--mkii','--usb-host',str(out/'usb.sock'),
    '--lcd',str(out/'lcd.private.bin')],out)
b=None
try:
    port.log.close();port.log=(out/'emulator-stdout.private.log').open('ab',buffering=0)
    port.reply(b'ready ',timeout=300)
    port.log.flush()
    print('BOOT STATUS',port.command('status',b'status '),flush=True)
    print('SOURCE/QUEUE',[(hex(a),port.peek(a,n).hex()) for a,n in ((0x46c922c4,44),(0x460d17ce,12),(0x460e6bcc,4),(0x46105408,4))],flush=True)
    assert port.loaded, 'LOAD PROJECT did not finish within the diagnostic bound'
    print('BOOT READY',flush=True);port.log.flush()
    port.command('pace on')
    b=usb.bench.Bench(str(out/'usb.sock'),timeout=60)
    usb.bench.enumerate_device(b,True)
    submit=usb.Submitter(b)
    st=usb.status(submit.exchange(usb.frame(0)))
    expected=json.loads((args.base_dir/'proofs.json').read_text())['configurationHash']
    assert st['base']==expected and st['known']==1
    session=st['session'];transaction=1
    def request(command,body=b'',tx=transaction):
        data=b'MWUP'+struct.pack('>HHII',1,command,tx,len(body))+session+body
        response=submit.exchange(data)
        assert response is not None
        result=usb.status(response)
        if result['result']:
            symbols=json.loads((args.base_dir/'symbols.json').read_text())
            print('LOADER REFUSAL',port.peek(symbols['modwerk_runtime_refusal'],4).hex(),flush=True)
        assert result['result']==0,(command,result)
        return result
    request(1,tx=0)
    package=args.package.read_bytes()
    request(2,bytes.fromhex(st['base'])+hashlib.sha256(package).digest()+struct.pack('>II',st['generation'],len(package)))
    for at in range(0,len(package),4096):request(3,struct.pack('>I',at)+package[at:at+4096])
    request(4);st=request(5);assert st['phase']==4
    st=request(9);assert st['phase']==5
    print('USB TRIAL INSTALLED',hashlib.sha256(package).hexdigest(),flush=True)
    port.command('pace off')
    native_command=port.command
    since_ping=0.0;maintain=True
    def maintained_command(text,prefixes=b'ok',timeout=60):
        global since_ping
        result=native_command(text,prefixes,timeout)
        if maintain and text.startswith('run '):
            since_ping+=float(text.split()[1])
            if since_ping>=1000:
                native_command('pace on')
                status=request(0,tx=0)
                assert status['phase']==5 and status['known']==1,'trial no longer active'
                native_command('pace off');since_ping=0
        return result
    port.command=maintained_command
    def word(at):return int.from_bytes(port.peek(at,4),'big')
    # The same stock panel sequence used by boot_slices, with no direct calls,
    # pokes or injected owner: actual package installed through the USB loader.
    for key in ('aed','edit','no','playback','playback','yes','no'):tap(port,key)
    port.command('key 0x26 8');port.command('run 60');tap(port,'track1')
    port.command('key 0x26 0');port.command('run 60');tap(port,'aed')
    matrix_tap(port,0x24,8);port.command('run 1000')
    assert word(0x46c8d1a0)==1 and word(0x46c8d19c)==0
    syms=json.loads((args.base_dir/'symbols.json').read_text())
    def state():return word(syms['mw_sample_editor']+20)
    def current_menu():
        labels=word(0x460e5e2c)
        count=word(syms['stock_count'])+word(syms['binding_count'])
        assert 7<=count<=13 and word(syms['binding_count'])==1
        names=[port.peek(word(labels+4*i),32).split(b'\0',1)[0].decode('ascii') for i in range(count)]
        assert names[-1]=='BEAT SLICER',names
        return names
    def choose(name):
        names=current_menu();target=names.index(name)
        for _ in range(13):
            row=word(0x460e5e40)
            if row==target:break
            tap(port,'down' if row<target else 'up')
        assert word(0x460e5e40)==target
        tap(port,'yes')
    def stock_clear(kind):
        at=(0x100d5b30,0x100b14f0)[kind]
        if not word(at+1092):return
        old=port.peek(at,1096)
        tap(port,'yes');choose('DELETE ALL SLICES');tap(port,'no')
        assert port.peek(at,1096)==old,'stock NO changed slices'
        tap(port,'yes');choose('DELETE ALL SLICES');tap(port,'yes')
        port.command('run 300')
        assert word(at+1092)==0,'stock clear failed'
    results=[]
    def exercise(kind):
        at=(0x100d5b30,0x100b14f0)[kind]
        assert word(0x46c8d1a0)==kind and word(0x46c8d19c)==0
        matrix_tap(port,0x24,8);port.command('run 300')
        stock_clear(kind)
        before=port.peek(at,1096)
        settings=struct.unpack('>274I',before)
        from fractions import Fraction
        interval=Fraction(44100*1440,settings[69])
        starts=[]
        for n in range(65):
            frame=settings[75]+int(n*interval+Fraction(1,2))
            if frame+min(64,word((0x46c90a78,0x46c922c4)[kind]+16))>settings[76]:break
            starts.append(frame)
        assert 0<len(starts)<=64
        expected=[(start,starts[i+1] if i+1<len(starts) else settings[76],0xffffffff) for i,start in enumerate(starts)]
        print('ORACLE',kind,settings[69],expected,flush=True)
        print('OPEN ACTION',kind,current_menu() if word(0x460e5e30) else 'closed',flush=True)
        tap(port,'yes');choose('BEAT SLICER')
        for wait in range(40):
            if state()==1:break
            port.command('run 100')
        print('OPEN WAIT MS',wait*100,flush=True)
        print('OPTIONS STATE',kind,state(),flush=True)
        (out/f'options-{kind}.private.bin').write_bytes(port.peek(word(0x400b9710),1024))
        if state()!=1:
            print('FULL SERVICE',port.peek(syms['mw_sample_editor'],32).hex(),flush=True)
            print('SOURCE CONTROL',port.peek((0x46c90a78,0x46c922c4)[kind],44).hex(),flush=True)
            print('PENDING/WORKER',{n:port.peek(syms[n],4).hex() for n in ('pending_at','pending_kind','pending_slot','pending_generation','job_active','idle_seen')},flush=True)
        assert state()==1,'actual contributed action did not admit a coherent source within its bounded wait'
        assert port.peek(at,1096)==before,'preview changed markers'
        tap(port,'yes');port.command('run 200')
        assert state()==2,'native question was not prepared'
        assert port.peek(at,1096)==before,'question changed markers'
        tap(port,'no');port.command('run 200')
        print('NO STATE',kind,state(),flush=True)
        assert state()==0 and port.peek(at,1096)==before,'NO did not cancel cleanly'
        tap(port,'yes');choose('BEAT SLICER');port.command('run 200')
        assert state()==1,'fresh action failed after NO'
        tap(port,'yes');port.command('run 200');assert state()==2
        tap(port,'yes');port.command('run 500')
        after=port.peek(at,1096)
        print('APPLIED STATE/COUNT',kind,state(),word(at+1092),flush=True)
        assert state()==0 and word(at+1092)==len(expected),'confirmed exact grid not published'
        assert after[:312]==before[:312] and after[1080:1092]==before[1080:1092]
        assert [struct.unpack('>3I',after[312+12*i:324+12*i]) for i in range(len(expected))]==expected
        assert after[312+12*len(expected):1080]==before[312+12*len(expected):1080],'inactive records changed'
        results.append({'kind':kind,'unchangedPreviewAndNO':True,'nativeYesCount':len(expected),'sampleBpm24':settings[69],'exactRecords':True})
        if args.repeat:
            for step in (4,16,32,64,1):
                old=port.peek(at,1096)
                tap(port,'yes');choose('BEAT SLICER');port.command('run 200')
                assert state()==1,'reopen after apply failed'
                tap(port,'up');port.command('run 200')
                (out/f'replace-options-{kind}-{step}.private.bin').write_bytes(port.peek(word(0x400b9710),1024))
                tap(port,'yes');port.command('run 200');assert state()==2
                assert word(syms['mw_sample_editor']+28)==1,'replacement warning not selected'
                tap(port,'no');port.command('run 200')
                assert state()==0 and port.peek(at,1096)==old,'replacement NO changed the table'
                tap(port,'yes');choose('BEAT SLICER');port.command('run 200')
                assert state()==1
                tap(port,'yes');port.command('run 200');assert state()==2
                tap(port,'yes');port.command('run 1000')
                replacement=[]
                for n in range(65):
                    start=settings[75]+int(n*interval*step+Fraction(1,2))
                    if start+64>settings[76]:break
                    replacement.append(start)
                table=port.peek(at,1096)
                assert state()==0 and word(at+1092)==len(replacement),'repeated replacement failed'
                assert table[:312]==old[:312] and table[1080:1092]==old[1080:1092]
                for i,start in enumerate(replacement):
                    end=replacement[i+1] if i+1<len(replacement) else settings[76]
                    assert struct.unpack('>3I',table[312+12*i:324+12*i])==(start,end,0xffffffff)
                print('REPLACED',kind,step,len(replacement),flush=True)
            results[-1]['repeatedReplacementSteps']=[4,16,32,64,1]
        stock_clear(kind);assert word(at+1092)==0
    exercise(1)
    tap(port,'no');tap(port,'track1');tap(port,'track1')
    matrix_tap(port,0x26,0x10);tap(port,'up');matrix_tap(port,0x24,2)
    for _ in range(3):tap(port,'yes')
    port.command('run 1000')
    tap(port,'yes');tap(port,'no');tap(port,'aed');port.command('run 1000')
    exercise(0)
    maintain=False
    port.command('pace on');request(1,tx=0);request(7);st=request(9);assert st['phase']==0;port.command('pace off')
    print('USB UNDONE',flush=True)
    tap(port,'yes')
    assert word(0x460e5e30),'stock AED menu did not open after Undo'
    labels=word(0x460e5e2c)
    stock_layouts={0x400ceb8c:6,0x400cebc8:9}
    assert labels in stock_layouts,'removed module still supplies the displayed menu'
    for i in range(stock_layouts[labels]):
        assert port.peek(word(labels+4*i),32).split(b'\0',1)[0]!=b'BEAT SLICER'
    tap(port,'no')
    print('STOCK MENU RESTORED',flush=True)
    (out/'results.json').write_text(json.dumps({'scope':'Normal emulator boot, USB loader, AED action and stock confirmation', 'inputs':inputs,'baseIdentity':proof['configurationHash'],'results':results,'usbUndo':True,'stockMenuAfterRemoval':True,'hardware':False},indent=2)+'\n')
finally:
    if b:b.sock.close()
    port.close()
