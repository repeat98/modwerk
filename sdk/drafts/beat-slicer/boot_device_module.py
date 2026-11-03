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
from boot_slices import choose as choose_stock
import verify_vendor_usb as usb

import argparse
parser=argparse.ArgumentParser(description=__doc__)
for name in ('emulator','base-dir','package','card','output'):
    parser.add_argument('--'+name,type=Path,required=True)
parser.add_argument('--check-encoders',action='store_true',help='Check four-count discrete stepping, stable substeps and inactive arrows through UART.')
parser.add_argument('--capture-only',action='store_true',help='Capture the first real popup after normal boot; do not claim full functional or Undo coverage.')
parser.add_argument('--companion-fx',action='store_true',help='An uploaded set includes TapeHead/Mini Verb; select them on T2 through stock UI.')
parser.add_argument('--repeat',action='store_true',help='Repeat replacement/NO/YES with all six spacings before stock clearing.')
parser.add_argument('--while-playing',action='store_true',help='Exercise the actual edit/confirmation while pattern playback runs.')
parser.add_argument('--recorders',action='store_true',help='Exercise empty/completed recorder sources and source-scoped recording admission.')
parser.add_argument('--recorders-only',action='store_true',help='Run recorder regressions without repeating the initial file-backed edits; implies --recorders.')
parser.add_argument('--set',default='BEATLAB')
parser.add_argument('--project',default='PROJECT 261023')
args=parser.parse_args()
if args.recorders_only:args.recorders=True
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
        assert result['command']==command and result['base']==expected and result['session']==session
        continuing=(command==5 and result['result']==12 and result['phase']==7 and not result['known']) or \
                   (command==7 and result['result']==11 and result['phase']==6 and not result['known'])
        if result['result'] and not continuing:
            symbols=json.loads((args.base_dir/'symbols.json').read_text())
            print('LOADER REFUSAL',port.peek(symbols['refusal'],4).hex(),flush=True)
        assert result['result']==0 or continuing,(command,result)
        return result
    package=args.package.read_bytes()
    if package[:4]==b'MWMS':
        # The active upload digest at cold boot is the base, not the cached
        # journal identity required by an encoded whole-set offer.
        for _ in range(1200):
            try:
                current=b.ctrl_in(usb.VENDOR_IN,38,0,usb.usb.VENDOR_INTERFACE,40)
                break
            except usb.bench.Stall:
                current=None;time.sleep(.05)
        assert current is not None and len(current)==40 and current[:4]==b'MWSD'
        assert package[16:48]==bytes.fromhex(st['base'])
        assert package[48:80]==current[8:40],'encoded set does not match actual module inventory identity'
    request(1,tx=0)
    request(2,bytes.fromhex(st['base'])+hashlib.sha256(package).digest()+struct.pack('>II',st['generation'],len(package)))
    for at in range(0,len(package),4096):request(3,struct.pack('>I',at)+package[at:at+4096])
    request(4)
    deadline=time.monotonic()+300
    st=request(5)
    # A positive PROGRESS acknowledgement explicitly authorizes the next
    # publication step, as UploadSession.activate does. Never retry a missing
    # or uncertain reply. No other refusal is replayed here.
    while st['result']==12:
        assert time.monotonic()<deadline,'confirmed publication progress timed out'
        time.sleep(.025);st=request(5)
    assert st['phase']==4 and st['active']==hashlib.sha256(package).hexdigest()
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
        assert names.index('CREATE BEAT GRID')+1==names.index('CREATE SLICE GRID'),names
        assert names[:names.index('CREATE BEAT GRID')]+names[names.index('CREATE BEAT GRID')+1:]==(['ADD SLICE HERE','DELETE ALL SLICES','CREATE SLICE GRID','CREATE LINEAR LOCKS','CREATE RANDOM LOCKS','CHANGE VIEW'] if count==7 else ['DISABLE LOOP','DELETE SLICE','REVERSE SLICE','NORMALIZE SLICE','DELETE ALL SLICES','CREATE SLICE GRID','CREATE LINEAR LOCKS','CREATE RANDOM LOCKS','CHANGE VIEW']),names
        return names
    def choose(name):
        names=current_menu();target=names.index(name)
        for _ in range(13):
            row=word(0x460e5e40)
            if row==target:break
            tap(port,'down' if row<target else 'up')
        assert word(0x460e5e40)==target
        tap(port,'yes')
        if name!='CREATE BEAT GRID':
            stock=names.copy();stock.remove('CREATE BEAT GRID')
            assert word(word(syms['remembered']))==stock.index(name),'stock remembered index shifted by contribution'
    companion_live=[]
    if args.companion_fx:
        def keycode(code):matrix_tap(port,0x20+code//8,1<<(code%8))
        def pick(slot,effect):
            tap(port,'no');port.command('run 300');keycode(0x11);keycode(0x24+slot)
            port.command('key 0x25 0x20');port.command('run 60')
            keycode(0x24+slot);port.command('key 0x25 0');port.command('run 150')
            target=word(syms['modwerk_fx'+str(slot)+'_id2pos']+4*effect)
            cursor=(0x460d5c94,0x460d5ca8)[slot-1]
            assert target,'companion absent from native chooser'
            delta=target-word(cursor)
            assert -127<=delta<=127
            if delta:port.command(f'knob 0x36 {delta}');port.command('run 150')
            assert word(cursor)==target,'native FX chooser did not reach companion'
            tap(port,'yes')
            at=0x80000ec4+8*(slot-1)+1
            for _ in range(30):
                if port.peek(at,1)==bytes([effect]):break
                port.command('run 100')
            assert port.peek(at,1)==bytes([effect]),'companion not live on T2'
            tap(port,'no');companion_live.append({'track':2,'slot':slot,'handle':effect})
            print('COMPANION LIVE',slot,effect,flush=True)
        pick(1,31);pick(2,23)
        keycode(0x10);tap(port,'aed');matrix_tap(port,0x24,8);port.command('run 300')
    def stock_clear(kind,slot=0):
        at=(0x100d5b30,0x100b14f0)[kind]+1096*slot
        if not word(at+1092):return
        old=port.peek(at,1096)
        tap(port,'yes');choose('DELETE ALL SLICES');tap(port,'no')
        assert port.peek(at,1096)==old,'stock NO changed slices'
        tap(port,'yes');choose('DELETE ALL SLICES');tap(port,'yes')
        port.command('run 300')
        assert word(at+1092)==0,'stock clear failed'
    results=[]
    def exercise(kind,slot=0,keep_grid=False,clear_before=True):
        at=(0x100d5b30,0x100b14f0)[kind]+1096*slot
        assert word(0x46c8d1a0)==kind and word(0x46c8d19c)==slot
        matrix_tap(port,0x24,8);port.command('run 300')
        if clear_before:stock_clear(kind,slot)
        if args.while_playing:
            if not word(0x800065b8):matrix_tap(port,0x25,1)
            assert word(0x800065b8),'pattern playback did not start'
        frames_before=word(syms['dl_frames'])
        before=port.peek(at,1096)
        settings=struct.unpack('>274I',before)
        from fractions import Fraction
        interval=Fraction(44100*1440,settings[69])
        starts=[]
        source_frames=word((0x46c90a78,0x46c922c4)[kind]+44*slot+16)
        for n in range(65) if source_frames else ():
            frame=settings[75]+int(n*interval+Fraction(1,2))
            if frame+min(64,source_frames)>settings[76]:break
            starts.append(frame)
        assert len(starts)<=64 and (starts or kind==1 and 128<=slot<136 and not source_frames)
        expected=[(start,starts[i+1] if i+1<len(starts) else settings[76],0xffffffff) for i,start in enumerate(starts)]
        print('ORACLE',kind,settings[69],expected,flush=True)
        print('OPEN ACTION',kind,current_menu() if word(0x460e5e30) else 'closed',flush=True)
        tap(port,'yes')
        if not word(0x460e5e30):
            (out/f'missing-menu-{kind}-{slot}.private.bin').write_bytes(port.peek(word(0x400b9710),1024))
        assert word(0x460e5e30),'stock action menu did not open for the source'
        choose('CREATE BEAT GRID')
        for wait in range(40):
            if state()==1:break
            port.command('run 100')
        print('OPEN WAIT MS',wait*100,flush=True)
        print('OPTIONS STATE',kind,state(),flush=True)
        # Admission can precede the next UI draw. Compare encoder frames only
        # after the opened options have had a normal display tick.
        port.command('run 100')
        (out/f'options-{kind}-{slot}.private.bin').write_bytes(port.peek(word(0x400b9710),1024))
        if state()!=1:
            print('FULL SERVICE',port.peek(syms['mw_sample_editor'],32).hex(),flush=True)
            print('SOURCE CONTROL',port.peek((0x46c90a78,0x46c922c4)[kind]+44*slot,44).hex(),flush=True)
            print('PENDING/WORKER',{n:port.peek(syms[n],4).hex() for n in ('pending_at','pending_kind','pending_slot','pending_generation','job_active','idle_seen')},flush=True)
        assert state()==1,'actual contributed action did not admit a coherent source within its bounded wait'
        assert port.peek(at,1096)==before,'preview changed markers'
        if not source_frames and not settings[273]:
            # EMPTY is a no-op action, not a question that promises creation.
            serial=word(syms['mw_sample_editor']+12)
            for _ in range(3):
                tap(port,'yes');port.command('run 250')
                assert state()==1 and not word(syms['question_active'])
                assert word(syms['mw_sample_editor']+12)==serial
                assert port.peek(at,1096)==before,'EMPTY/YES changed the source'
            tap(port,'no');port.command('run 250')
            assert state()==0 and port.peek(at,1096)==before
            tap(port,'yes');choose('CREATE BEAT GRID');port.command('run 250')
            assert state()==1,'menu did not reopen after EMPTY cancellation'
            tap(port,'no');port.command('run 250')
            assert state()==0 and port.peek(at,1096)==before
            if args.while_playing:assert word(0x800065b8)
            assert word(syms['dl_frames'])>frames_before
            results.append({'kind':kind,'slot':slot,'emptyNoAction':True,
                            'repeatedYesUnchanged':True,'cancelAndReopen':True})
            print('EMPTY NO-ACTION VERIFIED',kind,slot,flush=True)
            return
        if args.check_encoders or args.capture_only:
            frame_at=word(0x400b9710)
            def options_frame():
                # The popup clears its upper-left corner first. Its right border
                # at (124,61) is restored near the end of the final border pass.
                for _ in range(100):
                    frame=port.peek(frame_at,1024)
                    if frame[3*8+7]&2 and frame[124*8]&0x20:return frame
                    port.command('run 1')
                raise AssertionError('no completed options draw within the capture bound')
            original_frame=options_frame()
            (out/f'encoder-{kind}-baseline.private.bin').write_bytes(original_frame)
            if args.capture_only:
                (out/'capture.json').write_text(json.dumps({'scope':'Actual popup capture after normal emulator boot and USB module load',
                    'inputs':inputs,'baseIdentity':proof['configurationHash'],'kind':kind,
                    'hardware':False,'functionalSuiteCompleted':False,'usbUndoTested':False},indent=2)+'\n')
                print('POPUP CAPTURED',kind,flush=True)
                raise SystemExit(0)
            for substep in range(3):
                port.command('knob 0x31 1');port.command('run 100')
                frame=options_frame()
                (out/f'encoder-{kind}-substep-{substep}.private.bin').write_bytes(frame)
                assert frame==original_frame,'substep changed parameter'
            port.command('knob 0x31 1');port.command('run 100')
            assert options_frame()!=original_frame,'complete encoder step did not change parameter'
            port.command('knob 0x31 -4');port.command('run 100')
            assert options_frame()==original_frame
            tap(port,'up');tap(port,'down')
            assert options_frame()==original_frame,'arrows changed encoder-only settings'
            print('ENCODERS VERIFIED',kind,flush=True)
        tap(port,'yes');port.command('run 200')
        assert state()==2,'native question was not prepared'
        assert port.peek(at,1096)==before,'question changed markers'
        tap(port,'no');port.command('run 200')
        print('NO STATE',kind,state(),flush=True)
        assert state()==0 and port.peek(at,1096)==before,'NO did not cancel cleanly'
        tap(port,'yes');choose('CREATE BEAT GRID');port.command('run 200')
        assert state()==1,'fresh action failed after NO'
        tap(port,'yes');port.command('run 200');assert state()==2
        tap(port,'yes');port.command('run 500')
        after=port.peek(at,1096)
        print('APPLIED STATE/COUNT',kind,state(),word(at+1092),flush=True)
        assert state()==0 and word(at+1092)==len(expected),'confirmed exact grid not published'
        assert after[:312]==before[:312] and after[1080:1092]==before[1080:1092]
        assert [struct.unpack('>3I',after[312+12*i:324+12*i]) for i in range(len(expected))]==expected
        assert after[312+12*len(expected):1080]==before[312+12*len(expected):1080],'inactive records changed'
        results.append({'kind':kind,'slot':slot,'whilePlaying':bool(word(0x800065b8)),
                        'inputCount':settings[273],'unchangedPreviewAndNO':True,
                        'nativeYesCount':len(expected),'sampleBpm24':settings[69],'exactRecords':True})
        if args.repeat and source_frames:
            for step in (2,4,16,32,64,1):
                old=port.peek(at,1096)
                tap(port,'yes');choose('CREATE BEAT GRID');port.command('run 200')
                assert state()==1,'reopen after apply failed'
                port.command(f'knob 0x31 {4 if step!=1 else -20}');port.command('run 200')
                (out/f'replace-options-{kind}-{step}.private.bin').write_bytes(port.peek(word(0x400b9710),1024))
                tap(port,'yes');port.command('run 200');assert state()==2
                assert word(syms['mw_sample_editor']+28)==1,'replacement warning not selected'
                tap(port,'no');port.command('run 200')
                assert state()==0 and port.peek(at,1096)==old,'replacement NO changed the table'
                tap(port,'yes');choose('CREATE BEAT GRID');port.command('run 200')
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
            results[-1]['repeatedReplacementSteps']=[2,4,16,32,64,1]
        if not keep_grid:
            stock_clear(kind,slot);assert word(at+1092)==0
        if args.while_playing:assert word(0x800065b8),'edit stopped pattern playback'
        assert word(syms['dl_frames'])>frames_before,'emulated audio frames stopped during editing'
    if not args.recorders_only:exercise(1)
    tap(port,'no');tap(port,'track1');tap(port,'track1')
    matrix_tap(port,0x26,0x10);tap(port,'up');matrix_tap(port,0x24,2)
    for _ in range(3):tap(port,'yes')
    port.command('run 1000')
    tap(port,'yes');tap(port,'no');tap(port,'aed');port.command('run 1000')
    if not args.recorders_only:exercise(0)
    if args.recorders:
        def recorder_start(track):
            port.command(f'key 0x22 {1<<track}');port.command('run 60')
            port.command('key 0x25 8');port.command('run 60')
            port.command('key 0x25 0');port.command('key 0x22 0')
            bank=(word(0x80004f18)>>track)&1
            assert port.peek(0x80004f1e+84*(track+8*bank),1)[0] in (1,2), \
                'panel gesture did not start the requested recorder'
        def stop():
            matrix_tap(port,0x24,128);port.command('run 500')
            assert not word(0x800065b8)
        def recorder_editor(track):
            tap(port,'no');matrix_tap(port,0x22,1<<track)
            matrix_tap(port,0x25,0x88);port.command('run 500')
            assert word(0x46c8d1a0)==1 and word(0x46c8d19c)==128+track
        stop();recorder_editor(7)
        assert not word(0x46c922c4+44*135+16),'expected untouched empty recorder 8'
        exercise(1,135)
        tap(port,'yes');choose('CREATE SLICE GRID');choose_stock(port,'4 SLICES');tap(port,'no')
        port.command('run 500')
        empty_settings=0x100b14f0+1096*135
        assert word(empty_settings+1092)==4,'stock did not create empty placeholder rows'
        exercise(1,135,clear_before=False)
        tap(port,'no');recorder_start(0);port.command('run 1100');stop()
        assert word(0x46c922c4+44*128+16)>0,'ordinary recording produced no completed extent'
        recorder_editor(0);exercise(1,128,keep_grid=True)
        stop()
        recorder_settings=0x100b14f0+1096*128
        def recorder_markers():
            data=struct.unpack('>274I',port.peek(recorder_settings,1096))
            return data[76],[data[78+3*i] for i in range(data[273])]
        original_end,original_starts=recorder_markers()
        assert len(original_starts)>1,'recording too short to test permanent marker dropping'
        tap(port,'no');recorder_start(0);port.command('run 300');stop();recorder_editor(0)
        short_end,short_starts=recorder_markers()
        # Stock keeps the row count and clamps out-of-range starts. The owner
        # confirmed that the count remains unchanged on hardware too.
        assert short_end<original_end and short_starts==[min(s,short_end-64) for s in original_starts], \
            'shorter recording differs from the observed native boundary clamp'
        assert short_starts!=original_starts,'shorter recording did not affect any marker'
        tap(port,'no');recorder_start(0);port.command('run 1600');stop();recorder_editor(0)
        long_end,long_starts=recorder_markers()
        assert long_end>original_end and long_starts==short_starts, \
            'longer recording restored or moved previously dropped markers'
        results.append({'recorderRerecord':True,'extents':[original_end,short_end,long_end],
                        'absoluteStarts':[original_starts,short_starts,long_starts],
                        'nativeCleanup':'retained count with clamped duplicate starts'})
        # A normal recorder gesture retires an open edit before it passes to
        # stock. Returning to the same buffer must not revive that intent.
        matrix_tap(port,0x24,8);tap(port,'yes');choose('CREATE BEAT GRID')
        port.command('run 300');assert state()==1
        edit_serial=word(syms['mw_sample_editor']+12)
        recorder_start(0);port.command('run 600');stop();recorder_editor(0)
        assert state()==0 and word(syms['mw_sample_editor']+12)==edit_serial, \
            'recording gesture did not retire the existing edit'
        stopped_table=port.peek(recorder_settings,1096)
        port.command('run 500')
        assert port.peek(recorder_settings,1096)==stopped_table, \
            'retired edit applied after recording stopped'
        results.append({'recordGestureRetiresOpenEdit':True,'noApplyAfterStop':True})
        # Buffer A remains editable while the independent recorder B runs.
        tap(port,'no');recorder_start(1);port.command('run 200');recorder_editor(0)
        exercise(1,128)
        stop()
        # Return T1 from the Static machine to its file-backed Flex source.
        tap(port,'no');tap(port,'track1');tap(port,'track1')
        matrix_tap(port,0x26,0x10);tap(port,'down');matrix_tap(port,0x24,2)
        for _ in range(3):tap(port,'yes')
        port.command('run 500');tap(port,'yes');tap(port,'no');tap(port,'aed')
        assert word(0x46c8d1a0)==1 and word(0x46c8d19c)==0
        recorder_start(0);port.command('run 200')
        # Holding TRACK to start its recorder leaves AED for the track page.
        # The remembered AED identity alone does not prove AED is displayed.
        tap(port,'aed');port.command('run 500')
        exercise(1,0)  # the SAME playback track records into a different source
        stop();recorder_editor(0)
        recorder_start(0);port.command('run 200');recorder_editor(0)
        serial_before=word(syms['mw_sample_editor']+12)
        matrix_tap(port,0x24,8);tap(port,'yes')
        if word(0x460e5e30):
            choose('CREATE BEAT GRID');port.command('run 500')
        assert (state()!=1 and word(syms['mw_sample_editor']+12)==serial_before), \
            'recording into the selected buffer admitted a new editor token'
        stop();tap(port,'no');recorder_editor(0)
        results.append({'sourceScopedRecording':True,'selectedRecordingBufferRefused':True})
    commit_timing=None
    if args.recorders:
        commit_timing={key:word(syms['mw_sample_commit_'+key]) for key in ('max','last','spans')}
        assert commit_timing['spans']>0,'recorder count-publication path was not exercised'
        assert commit_timing['max']<48000,'count-publication body exceeded one emulated audio frame'
        print('RECORDER COMMIT TIMER (EMULATOR ONLY)',commit_timing,flush=True)
    if word(0x800065b8):matrix_tap(port,0x24,128)
    maintain=False
    port.command('pace on');before_undo=request(1,tx=0)
    # The real whole-set backend restores one row per engine turn. Only an
    # explicit retained-recovery reply permits another rollback request;
    # missing/uncertain replies still fail without replaying a write.
    for _ in range(129):
        st=request(7)
        if st['result']==0:break
        assert st['generation']==before_undo['generation'],'recovery changed generation before complete restoration'
    else:raise AssertionError('whole-set Undo did not complete within the recovery attempt bound')
    assert st['known']==1 and st['generation']==before_undo['generation']+1
    assert st['active']==before_undo['base'],'Undo did not restore the original empty base'
    st=request(9);assert st['phase']==0;port.command('pace off')
    print('USB UNDONE',flush=True)
    tap(port,'yes')
    assert word(0x460e5e30),'stock AED menu did not open after Undo'
    labels=word(0x460e5e2c)
    stock_layouts={0x400ceb8c:6,0x400cebc8:9}
    assert labels in stock_layouts,'removed module still supplies the displayed menu'
    for i in range(stock_layouts[labels]):
        assert port.peek(word(labels+4*i),32).split(b'\0',1)[0]!=b'CREATE BEAT GRID'
    tap(port,'no')
    print('STOCK MENU RESTORED',flush=True)
    (out/'results.json').write_text(json.dumps({'scope':'Normal emulator boot, USB loader, AED action and stock confirmation', 'inputs':inputs,'baseIdentity':proof['configurationHash'],'results':results,'usbUndo':True,'stockMenuAfterRemoval':True,'hardware':False,'companionFx':companion_live,'recorderCommitTimerEmulatorOnly':commit_timing},indent=2)+'\n')
finally:
    if b:b.sock.close()
    port.close()
