#!/usr/bin/env python3
"""Focused native MKII UX fixture: real backend, UART keys, LED stream and DSP.

Private inputs are supplied externally. Routine setup calls and synthetic
canonical-state edits are labeled; panel commands themselves use the UART.
One eight-tone card is reused. No physical device is accessed.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import struct
from emulator_test import Emulator, assert_frame_progress
from panel_test import check_scratch_fat16, check_bank_checksums

def run(a):
    out=a.output;out.mkdir(parents=True,exist_ok=False)
    inputs=a.inputs
    symbols=json.loads((inputs/'base-symbols.json').read_text())
    own=json.loads((inputs/'symbols.json').read_text())
    package=(inputs/'track-solo.mwrm').read_bytes()
    card=out/'card.private.img';shutil.copy2(inputs/'card.private.img',card)
    extra=['--card',card,'--mount','--set','SOLO','--project','TEST','--load-ms','90000','--rtc','1793318400']
    if a.audio:extra+=['--dsp','--frame']
    if a.save:extra+=['--card-rw']
    e=Emulator(inputs/'ot_emu',inputs/'MAIN.raw',out,extra=extra)
    rows=[0]*8;checks=[];read32=lambda at:int.from_bytes(e.read(at,4),'big')
    def advance(ms):return e.command('run '+str(ms))
    def invoke(at,*args):
        if a.audio:e.command('frame off');advance(10)
        try:
            for n in range(100):
                try:return e.call(at,*args)
                except RuntimeError as err:
                    if "not main's spin" not in str(err) or n==99:raise
                    advance(1)
        finally:
            if a.audio:e.command('frame on');advance(10)
    def call(name,*args):return invoke(symbols[name],*args)
    def task_window():
        if a.audio:
            for _ in range(3000):
                if read32(0x46104d4e)==0:return
                advance(.01)
            raise AssertionError('no task window')
    def canonical(value=None):
        task_window()
        if value is not None:e.u32(0x80000008,value)
        return read32(0x80000008)
    def install(data):
        for off in range(0,len(data),4096):e.write(0x47010000+off,data[off:off+4096])
        answer=call('modwerk_backend_prepare',0,0x47010000,len(data))
        assert answer==1,('prepare refused',answer,call('modwerk_runtime_refusal'))
        assert call('modwerk_backend_publish',0)==1
        assert call('modwerk_backend_retire',0)==1
    def key(code,down=True,ms=40):
        row,bit=code>>3,1<<(code&7)
        rows[row]=rows[row]|bit if down else rows[row]&~bit
        e.command(f'key {0x20|row} {rows[row]}');advance(ms)
    def tap(code):key(code);key(code,False)
    def check(name,**evidence):
        checks.append({'case':name,**evidence})
        (out/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
        print('PASS '+name,flush=True)
    decoder=importlib.util.spec_from_file_location('ux_panel',inputs/'panel_link.py')
    mod=importlib.util.module_from_spec(decoder);decoder.loader.exec_module(mod);panel=mod.PanelLink()
    def panel_read():
        panel.feed(bytes.fromhex(e.command('tx').split()[1]));return panel
    def audio():
        e.command('audio start tracks');advance(150)
        f=e.command('audio read').split();n=int(f[1]);assert n>2048
        data=struct.unpack('<%dh'%(len(f[2])//4),bytes.fromhex(f[2]))[-2048*24:]
        return [round(math.sqrt(sum(v*v for i,v in enumerate(data) if i%24 in (8+2*t,9+2*t))/4096),3) for t in range(8)]
    try:
        assert e.project_loaded
        sites=[0x4000aee0,0x4000d98e,0x4009220c,0x40092230,0x400135b0,0x40013654,0x400866c4]
        original_sites={at:e.read(at,8) for at in sites}
        install(package)
        if a.paired:install((inputs/'mute-modes.mwrm').read_bytes())
        record=call('modwerk_runtime_module',0);assert record
        base=read32(record+8)-own['ts_tick']
        overlay=lambda:read32(base+own['ts_overlay'])
        def enabled(on=True):invoke(base+own['ts_set'],1 if on else -1,0);advance(60)
        def arm(track=1):
            key(0x10+track);advance(2100)
            assert overlay()==1<<track,('arm failed',track,overlay(),e.read(0x46100b18,8).hex())
        def finish(track=1):
            key(0x10+track,False);assert overlay()==0;advance(80)
        for _ in range(3):tap(0x32)
        advance(2200)
        panel_read()
        key(0x11);advance(2200);assert overlay()==0;key(0x11,False)
        check('G01 OFF preserves long press')
        enabled()
        if a.save:
            # No editing/recording/MIDI cases before this no-edit save comparison.
            def saved_files():
                e.command('card flush');image=card.read_bytes();check_scratch_fat16(image)
                sdk=next(parent for parent in Path(__file__).resolve().parents if (parent/'octabam/tools/emu/emu_card.py').is_file())
                spec=importlib.util.spec_from_file_location('ux_card',sdk/'octabam/tools/emu/emu_card.py')
                c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
                files={n:v for n,v in c.extract_image(image).items() if n.upper().startswith('SOLO/TEST/') and n.endswith(('.work','.strd'))}
                check_bank_checksums(files);return files
            def save():
                for code in (0x1c,0x21,*([0x33]*8),0x20,0x31,0x31):tap(code);advance(100)
                previous=0;stalled=0
                for poll in range(900):
                    advance(100)
                    if read32(0x460d17d2)==0 and read32(0x460d17da)!=0:break
                    if poll%10==9:
                        import re
                        current=int(re.search(r'written=(\d+)',e.command('card status'))[1])
                        stalled=0 if current>previous else stalled+1000;previous=current
                        assert stalled<10000,'save stalled'
                else:raise AssertionError('save timeout')
                advance(3000);tap(0x32);tap(0x32);advance(2200)
            save();baseline=saved_files();assert len(baseline)==52
            arm();tap(0x12);assert overlay()==6
            save();assert overlay()==0 and rows[2]&2
            after=saved_files();assert after==baseline, [n for n in baseline if after.get(n)!=baseline[n]]
            finish();check('P01 P02 P06 no-edit SAVE with physical anchor held',files=len(after))
            # Exercise the seventh guarded entry through a real project reload,
            # including the unchanged shared base hook immediately after it.
            e.command('watch 0x400866c4')
            for code in (0x1c,0x21,*([0x33]*8),*([0x20]*2),0x31,0x31):
                tap(code);advance(100)
            load_seen=False
            for _ in range(900):
                advance(100)
                load_seen=load_seen or '400866c4' in e.command('hits')
                if load_seen and read32(0x460d17d2)==0 and read32(0x460d17da)!=0:break
            else:raise AssertionError('project reload did not enter and complete the guarded load path')
            advance(3000);tap(0x32);tap(0x32);advance(2200)
            assert overlay()==0 and saved_files()==baseline
            arm();finish()
            check('P03 real project reload completes through guarded entry, files unchanged')
            # Fresh original-stock reload, DSP optional but matching the run.
            e.close();e=None
            reload_dir=out/'stock-reload';reload_dir.mkdir()
            r=Emulator(inputs/'ot_emu',inputs/'stock-main.raw',reload_dir,extra=['--card',card,'--mount','--set','SOLO','--project','TEST','--load-ms','90000',*(['--dsp'] if a.audio else [])])
            try:assert r.project_loaded
            finally:r.close()
            check('P02 saved project reloads in original stock firmware')
        elif a.audio:
            # Keep the DSP lane lean: the separate UART control lane exercises
            # every anchor and page. Here exercise edits and real commands while
            # voices/frames are running, including the optional companion.
            modes=(0,3,1,2) if a.paired else (0,)
            for mode in modes:
                canonical(0);enabled(False);tap(0x27);tap(0x27)
                if a.paired:task_window();e.u32(0x800000dc,mode)
                tap(0x28);advance(300);enabled();arm();tap(0x12)
                tap(0x25);e.command('key 0x30 1');advance(100)
                assert overlay()==6
                for _ in range(4):tap(0x13);tap(0x13)
                # LEN 16, 1X, 120 BPM, one trig on step 1. In either -T
                # policy a stopped joined voice waits for that native trig;
                # membership must not synthesize a trigger of its own.
                resume_wait=2100 if mode in (1,2) else 0
                if resume_wait:advance(resume_wait)
                held=audio();assert held[1]>8 and held[2]>8,(mode,held)
                if mode==0:assert max(held[t] for t in (0,3,4,5,6,7))<3,(mode,held)
                muted=2 if a.paired else 3
                key(0x2d);tap(0x10+muted);key(0x2d,False)
                assert canonical()&(1<<(8+muted)) and overlay()==6
                during=audio()
                assert during[1]>8 and during[2]>8,(mode,during)
                word=canonical();finish();assert canonical()==word
                released=audio()
                if mode==0:assert released[muted]<3 and released[0]>8,(mode,released)
                check('DSP: editing, 8 live membership toggles, quick mute underneath and release',mode=mode,resumeWaitMs=resume_wait,mutedTrack=muted+1,held=held,during=during,released=released,word=hex(word))
                tap(0x27);tap(0x27)
            # Actual MIDI while the frame override runs, followed by release.
            canonical(0);enabled(False)
            if a.paired:task_window();e.u32(0x800000dc,0)
            tap(0x28);enabled();arm()
            midi_muted=1 if a.paired else 2
            e.command(f'midi {0xb0+midi_muted:02x} 31 7f');advance(100)
            if a.paired:e.command('midi b0 32 7f');advance(100)
            assert canonical()&(1<<(8+midi_muted)) and overlay()==2
            if a.paired:assert canonical()&1
            held=audio();assert held[1]>8 and held[0]<3
            finish();released=audio()
            if a.paired:assert released[1]<3 and released[0]>8
            else:assert released[1]>8 and released[2]<3
            check('DSP: real MIDI mute survives frame override and becomes audible on release',held=held,released=released)
            tap(0x27);tap(0x27);canonical(0);arm();tap(0x12)
            ident=struct.unpack_from('>I',package,28)[0]
            install(struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,ident))
            advance(100);assert all(e.read(at,8)==saved for at,saved in original_sites.items())
            key(0x12,False);key(0x11,False)
            check('DSP: active removal restores seven guarded sites')
        else:
            # One real hold per anchor verifies the physical key path; host suite
            # covers all 1024 anchor/group combinations without eight-tone reruns.
            for t in range(8):
                arm(t)
                assert invoke(0x4009220c,0x10+t)==0
                assert invoke(0x40092230,2)==0
                assert e.read(0x46100b1a,1)==bytes([1<<t])
                finish(t)
            check('G02 G10 K01-K06 eight physical anchors hidden from stock readers')
            canonical(0);arm();tap(0x12);assert overlay()==6
            p=panel_read()
            levels=[p.leds[40+2*t] for t in range(8)]
            assert levels==[3,15,15,3,3,3,3,3],levels
            assert all(p.led_rows[5+t//4]&(3<<(2*(t%4))) for t in range(8))
            check('V03-V05 native panel stream: members bright, excluded dim but lit',levels=levels)
            for t in (0,3,4,5,6,7):tap(0x10+t)
            assert overlay()==255
            for t in (0,3,4,5,6,7):tap(0x10+t)
            assert overlay()==6
            check('G05-G09 all eight memberships and repeatable removal')
            selected=e.read(0x80000000,1)
            for page in (0x22,0x23,0x24,0x25,0x26):
                tap(page);assert overlay()==6
                e.command('key 0x30 1');advance(80);assert overlay()==6
                key(0x2d);tap(page);key(0x2d,False);assert overlay()==6
                tap(0x32);advance(2100)
            assert e.read(0x80000000,1)==selected
            check('E01 E02 E06 K10 all parameter pages, SETUP and encoder preserve group/selection')
            # Confirm an actual stock parameter write, not merely an encoder callback.
            tap(0x23)
            params=read32(0x46c82456)+0x8ee9a+e.read(0x100b14cc,1)[0]*24
            before_params=e.read(params,24)
            e.command('key 0x30 1');advance(100)
            edited_params=e.read(params,24);assert edited_params!=before_params
            key(0x2d);tap(0x13);key(0x2d,False)
            assert overlay()==6 and canonical()&0x800
            # A modifier alone cannot operate on the invisible anchor.
            assert not canonical()&0x200
            check('M03 K06 K07 quick mute changes only underlying non-anchor track',word=hex(canonical()))
            key(0x2a);tap(0x14);key(0x2a,False)
            assert canonical()&0x100000 and not canonical()&0x20000 and overlay()==6
            check('K08 R01 native CUE+TRACK works with anchor excluded')
            tap(0x30);assert overlay()==6
            before=canonical();tap(0x00);assert canonical()!=before and overlay()==6
            key(0x2a);tap(0x03);key(0x2a,False);assert canonical()&8 and overlay()==6
            tap(0x30);assert overlay()==6
            check('M01 M02 E03 V01 mixer mute and solo update underneath without inheritance',word=hex(canonical()))
            word=canonical();finish();assert canonical()==word
            assert e.read(params,24)==edited_params
            check('E02 parameter changes remain after release',changedBytes=sum(x!=y for x,y in zip(before_params,edited_params)))
            check('M07 latest underlying mute/solo survives release')
            canonical(0);advance(2100);arm()
            tap(0x28);assert overlay()==2
            assert call('modwerk_machine_stopped')==0
            tap(0x27);assert overlay()==2
            assert call('modwerk_machine_stopped')==1
            check('K01 E07 PLAY/STOP control sequencer with anchor hidden')
            tap(0x29);assert overlay()==2
            p=panel_read();assert p.led_rows[10]&16
            assert not any(e.read(0x80004f1e+i*84,1)[0] for i in range(16))
            tap(0x29);assert overlay()==2
            check('K02 normal REC enters grid recording without starting anchor recorder')
            for code in (0x31,0x32,0x34,0x21):
                tap(code);assert overlay()==2;advance(2100)
            check('K04 K05 YES/NO and navigation keep solo')
            # FUNC alone and scene keys must not cancel. Scene edits are stock.
            for code in (0x2d,0x19,0x1a,0x1d,0x1e,0x2f):
                tap(code);assert overlay()==2
                tap(0x32);advance(2100)
            check('E04 E06 E08 scene, Part, sample editor and bank navigation keep solo')
            tap(0x1c);assert overlay()==0
            assert invoke(0x4009220c,0x11)==0
            advance(2200);assert overlay()==0
            finish();tap(0x32);advance(2200)
            check('P01 G12 PROJECT cancels and held anchor remains hidden/inactive')
            arm();tap(0x35);assert overlay()==0;finish();tap(0x35);advance(2200)
            check('E09 MIDI editing mode cancels')
            # Actual incoming CCs, not synthetic calls into module handlers.
            arm()
            for ch,cc,v in ((2,49,127),(0,50,127),(3,51,127)):
                e.command('midi '+f'{0xb0+ch:02x} {cc:02x} {v:02x}');advance(100)
            assert overlay()==2 and canonical()&0x400 and canonical()&1 and canonical()&0x80000
            word=canonical();finish();assert canonical()==word
            check('M04 R01 MIDI mute/solo/cue retained underneath',word=hex(word))
            canonical(0);enabled(False);tap(0x27);tap(0x27);enabled();advance(2200);arm();tap(0x12)
            ident=struct.unpack_from('>I',package,28)[0]
            install(struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,ident))
            advance(150)
            assert all(e.read(at,8)==saved for at,saved in original_sites.items())
            key(0x12,False);key(0x11,False);advance(100)
            p=panel_read();assert all(p.leds[40+2*t]==15 for t in range(8)),p.leds
            assert canonical()==0
            check('G13 V06 active removal restores seven sites and stock TRACK levels')
        result={'result':'passed','checks':checks,'hardwareTested':False,'audio':a.audio,'paired':a.paired,'save':a.save,
                'packageSha256':hashlib.sha256(package).hexdigest(), 'baseSha256':hashlib.sha256((inputs/'MAIN.raw').read_bytes()).hexdigest()}
        if a.audio:result['frameProgressObservations']=assert_frame_progress(out/'emulator.private.log')
        (out/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    except Exception as err:
        (out/'report.json').write_text(json.dumps({'result':'failed','error':repr(err),'checks':checks},indent=2)+'\n')
        raise
    finally:
        if e is not None:e.close()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--inputs',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    for flag in ('audio','paired','save'):p.add_argument('--'+flag,action='store_true')
    run(p.parse_args())
