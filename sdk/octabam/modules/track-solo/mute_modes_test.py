#!/usr/bin/env python3
"""Historical 0.1.x scenario; use ux_test.py for revised 0.2.0 UX.

Test Track Solo alongside unchanged Mute Modes in a private MKII emulator.

Real backend installation and UART gestures; synthetic canonical mute/solo and
mode inputs are explicit. No hardware, USB lifecycle or timing qualification.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
from emulator_test import Emulator, assert_frame_progress

MODES=(('OT',0),('OTFX',3),('OTFX-T',1),('DT-T',2))

def run(a):
    out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
    base_symbols=json.loads(a.base_symbols.read_text())
    own=json.loads(a.symbols.read_text());mm=json.loads(a.mute_symbols.read_text())
    package=a.package.read_bytes();mute=a.mute_package.read_bytes()
    card=out/'card.private.img';shutil.copy2(a.fixture/'card.private.img',card)
    extra=['--card',card,'--mount','--set','SOLO','--project','TEST','--load-ms','30000','--rtc','1793318400']
    if not a.preflight:extra+=['--dsp','--frame']
    e=Emulator(a.emulator,a.base_main,out,extra=extra)
    rows=[0]*8;observations=[]
    def advance(ms):e.command('run '+str(ms))
    def invoke(at,*args):
        if not a.preflight:e.command('frame off');advance(10)
        try:
            for n in range(100):
                try:return e.call(at,*args)
                except RuntimeError as error:
                    if "not main's spin" not in str(error) or n==99:raise
                    advance(1)
        finally:
            if not a.preflight:e.command('frame on');advance(10)
    def call(name,*args):return invoke(base_symbols[name],*args)
    def read32(at):return int.from_bytes(e.read(at,4),'big')
    def install(data):
        for at in range(0,len(data),4096):e.write(0x47010000+at,data[at:at+4096])
        result=call('modwerk_backend_prepare',0,0x47010000,len(data))
        assert result==1,('prepare refused',result,call('modwerk_runtime_refusal'))
        assert call('modwerk_backend_publish',0)==1
        assert call('modwerk_backend_retire',0)==1
    def key(code,down=True):
        row,bit=code>>3,1<<(code&7)
        rows[row]=rows[row]|bit if down else rows[row]&~bit
        e.command(f'key {0x20|row} {rows[row]}');advance(40)
    def tap(code):key(code);key(code,False);advance(100)
    def levels():
        e.command('audio start tracks');advance(100)
        fields=e.command('audio read').split();frames=int(fields[1])
        data=bytes.fromhex(fields[2]);samples=struct.unpack('<%dh'%(len(data)//2),data)[-2048*24:]
        assert frames>2048 and len(samples)==2048*24
        return [round(math.sqrt(sum(v*v for i,v in enumerate(samples) if i%24 in (8+2*t,9+2*t))/4096),3) for t in range(8)]
    def counters():return [read32(0x80004a68+t*168) for t in range(8)]
    def counter_window(ms=2100):
        before=counters();advance(ms);after=counters()
        return [(b-a)&0xffffffff for a,b in zip(before,after)]
    def record(row):
        observations.append(row);(out/'observations.json').write_text(json.dumps(observations,indent=2)+'\n')
        print(json.dumps(row),flush=True)
    try:
        assert e.project_loaded,'fixture project load incomplete'
        originals={at:e.read(at,6) for at in (0x40004dc6,0x40004dcc,0x4000aee0,0x4000d98e)}
        install(package);install(mute);advance(100)
        ts_record=call('modwerk_runtime_module',0);mm_record=call('modwerk_runtime_module',1)
        assert ts_record and mm_record
        ts_base=read32(ts_record+8)-own['ts_tick'];mm_base=read32(mm_record+8)-mm['mm_restore']
        def enabled(on):invoke(ts_base+own['ts_set'],1 if on else -1,0);advance(50)
        def overlay():return read32(ts_base+own['ts_overlay'])
        for _ in range(3):tap(0x32)
        advance(2000)
        assert read32(0x460d175c)==0,'a popup still owns the screen'
        assert all(e.read(at,2)==b'\x4e\xf9' for at in (0x40004dc6,0x4000aee0,0x4000d98e))
        assert e.read(0x40004dcc,6)==originals[0x40004dcc], 'late hard-cut override must be absent'
        if a.preflight:
            record({'case':'admission','result':'passed','sitesDistinct':True,'trackSoloBase':hex(ts_base),'muteModesBase':hex(mm_base)})
            return
        original=read32(0x80000008)
        def restart(mode,word=0):
            # Clear the fixture's canonical state before stopping so every voice
            # can be stopped through the ordinary firmware paths.
            key(0x11,False);enabled(False);e.u32(0x80000008,0)
            tap(0x27);tap(0x27);advance(100)
            assert call('modwerk_machine_stopped')==1
            e.u32(0x800000dc,mode);e.u32(0x80000008,word)
            tap(0x28);advance(300)
        for label,mode in MODES:
            if label not in a.modes:continue
            # Control: ordinary solo, applied after all eight voices are playing.
            restart(mode);advance(1200)  # charge the stock delay before testing its tail
            initial=levels();assert all(v>10 for v in initial),initial
            e.u32(0x80000008,2);advance(20)
            normal=levels();normal_trigs=counter_window()
            record({'mode':label,'case':'ordinary-solo-T2','initialRms':initial,'soloRms':normal,'voiceStartCounterDelta':normal_trigs})
            # Same sounding voices, but Track Solo's real two-second gesture.
            restart(mode);enabled(True);key(0x11);advance(2100)
            assert overlay()==2
            temporary=levels();temporary_trigs=counter_window()
            key(0x12);key(0x12,False);assert overlay()==6;joined_immediate=levels()
            # The fixture has one trig on step 1, LEN 16, 1X, 120 BPM.
            # A stopped voice in a -T mode resumes at its next trig; neither
            # a membership change nor ordinary unmute creates a new trig.
            if mode in (1,2):advance(2100)
            joined=levels() if mode in (1,2) else joined_immediate
            key(0x12);key(0x12,False);assert overlay()==2
            key(0x11,False);assert overlay()==0
            if mode in (1,2):advance(2100)
            released=levels()
            assert read32(0x80000008)==0 and read32(0x800000dc)==mode
            assert temporary[1]>10 and joined[1]>10 and joined[2]>10
            if label=='OT':assert max(temporary[:1]+temporary[2:])<1
            if label in ('OTFX','OTFX-T'):assert temporary[0]>10, ('delay tail lost',label,temporary)
            if label=='DT-T':assert all(v>10 for v in temporary), ('already sounding loops cut',temporary)
            record({'mode':label,'case':'hold-solo-T2','soloRms':temporary,'joinedImmediateRms':joined_immediate,'joinedT3Rms':joined,'releasedRms':released,'voiceStartCounterDelta':temporary_trigs,'canonicalPreserved':True,'resumeWaitMs':2100 if mode in (1,2) else 0})
            # A cold, already-muted anchor must be able to start if auditioning
            # overrides the mode's underlying mute. No voice is pre-started here.
            restart(mode,0x200);before=levels();enabled(True);key(0x11);advance(2100)
            assert overlay()==2
            if mode in (1,2):advance(2100)
            audition=levels();key(0x11,False)
            if mode in (1,2):advance(2100)
            after=levels()
            assert read32(0x80000008)==0x200 and read32(0x800000dc)==mode
            assert audition[1]>10, ('cold-muted anchor silent',label,audition)
            record({'mode':label,'case':'cold-muted-T2-anchor','beforeRms':before,'soloRms':audition,'releasedRms':after,'canonicalPreserved':True})
            restart(mode,1);before=levels();enabled(True);key(0x11);advance(2100)
            assert overlay()==2
            if mode in (1,2):advance(2100)
            audition=levels();key(0x11,False)
            if mode in (1,2):advance(2100)
            after=levels()
            assert read32(0x80000008)==1 and read32(0x800000dc)==mode
            assert audition[1]>10, ('prior solo prevents anchor',label,audition)
            record({'mode':label,'case':'preexisting-T1-solo-T2-anchor','beforeRms':before,'soloRms':audition,'releasedRms':after,'canonicalPreserved':True})
        e.u32(0x80000008,0);tap(0x27);tap(0x27);advance(100)
        assert call('modwerk_machine_stopped')==1
        for content in (package,mute):
            ident=struct.unpack_from('>I',content,28)[0]
            install(struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,ident))
        assert all(e.read(at,6)==saved for at,saved in originals.items())
        record({'case':'remove-both','result':'passed','originalSitesRestored':True})
        e.log.flush()
        assert_frame_progress(out/'emulator.private.log')
        result={'result':'passed','modes':a.modes,'hardwareTested':False,'baseMainSha256':hashlib.sha256(a.base_main.read_bytes()).hexdigest(),
                'trackSoloSha256':hashlib.sha256(package).hexdigest(),'muteModesSha256':hashlib.sha256(mute).hexdigest(),
                'observations':observations,'limits':['synthetic canonical mute/solo and mode inputs','real UART Track Solo gestures and real DSP stems','direct runtime backend, not USB review/trial/Keep/Undo','voice-start counters are supporting CPU observations, not complete audio behavior']}
        (out/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    finally:e.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','base-main','base-symbols','package','symbols','mute-package','mute-symbols','fixture','output'):
        p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--preflight',action='store_true')
    p.add_argument('--modes',nargs='+',choices=[n for n,_ in MODES],default=[n for n,_ in MODES])
    run(p.parse_args())
