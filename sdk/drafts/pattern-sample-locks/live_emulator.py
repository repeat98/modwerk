# SPDX-License-Identifier: MIT
"""Native live SAMPLE edits and cached CPU monitoring on disposable media.

Instruction intervals include interrupt activity and are not hardware cycles.
All fixture writes are confined to the emulator; panel actions are native.
"""
import hashlib
import json
import statistics
from pathlib import Path
import profile_emulator
import stress_emulator as fixture

state={}
PATTERN_BYTES=0x8ed8
TRACK_BYTES=0x91a

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    exact=port.profile_symbols;assert exact
    base=fixture.u32(port,0x4002dc6a)-exact['psl_open']
    def u32(at):return fixture.u32(port,at)
    def ui():
        current_base=u32(0x4002dc6a)-exact['psl_open']
        return {n:u32(current_base+exact['symbols'][n]) for n in ('phase','cursor','selected','replace','select_all')}
    def frames():return u32(port.base_symbols['dl_frames'])
    def meter():
        values=[int.from_bytes(port.peek(port.base_symbols['modwerk_status']+4*i,4),'big') for i in range(12)]
        return dict(cpuPermille=values[0],dsp5to8Permille=values[1],dsp5to8PeakPermille=values[2],
            dsp1to4Permille=values[3],dsp1to4PeakPermille=values[4],frames=frames(),
            meterUpdates=u32(port.base_symbols['modwerk_status_reads']))
    report={'hardware':False,'scope':'Native emulator only; cached meters and elapsed instruction intervals, not isolated hardware CPU cost',
        'packageSha256':exact['packageSha256'],'cpuWindows':{},'operations':{},'checks':{},'fixture':'Copied emulator card; explicit pattern/trig/p-lock fixtures, native panel input for operations'}
    def sample(label):
        rows=[]
        for _ in range(10):run(50);rows.append(meter())
        result={'readings':rows,'cpuMeanPermille':statistics.mean(r['cpuPermille'] for r in rows),
            'cpuMaxPermille':max(r['cpuPermille'] for r in rows),'frameAdvance':rows[-1]['frames']-rows[0]['frames']}
        report['cpuWindows'][label]=result
        print('CPU window '+label+': '+str(result['cpuMeanPermille']/10)+'% cached meter',flush=True)
        return result
    def open_part():
        port.command('key 0x25 32');run(80);tap(0x23,32);port.command('key 0x25 0');run(80)
    def menu(clear):
        open_part();encoder(6,-24);encoder(6,20 if clear else 16);key('YES');assert ui()['phase']==2
    def go(track):
        if ui()['cursor']//4!=track//4:key('RIGHT' if track//4 else 'LEFT')
        for _ in range(4):key('UP')
        while ui()['cursor']<track:key('DOWN')
        assert ui()['cursor']==track
    def choose(mask=None,all_tracks=False,replace=None):
        if all_tracks:encoder(0,4)
        elif mask is not None:
            encoder(0,-4)
            for t in range(8):
                if mask&(1<<t):go(t);encoder(1,4)
        if replace is not None:encoder(2,4 if replace else -4)
        key('YES');assert ui()['phase']==3
    def apply(label,changes=None,expected_playing=1):
        before=meter();play=u32(0x800065b8)
        assert bool(play)==bool(expected_playing)
        for n in ('psl_guard_max','psl_guard_spans'):fixture.put(port,base+exact['symbols'][n],bytes(4))
        token=profile_emulator.start(port) if changes else None
        port.command('key 0x26 2');during=[]
        for _ in range(120):
            run(1);during.append(meter())
            if ui()['phase'] in (0,4):break
        else:raise AssertionError('Apply did not finish in bounded event window')
        port.command('key 0x26 0');run(20)
        result=profile_emulator.finish(port,token) if token else {}
        result.update(before=before,during=during,after=meter(),uiAfter=ui(),playingBefore=bool(play),
            playingAfter=bool(u32(0x800065b8)),guardTimerMax=u32(base+exact['symbols']['psl_guard_max']),
            guardCount=u32(base+exact['symbols']['psl_guard_spans']))
        assert result['playingBefore']==result['playingAfter'],'operation changed transport'
        if changes:
            assert result['guardCount']<=64 and result['publicationGuardSpans']==result['guardCount']
            assert result['guardSavedMasks']==[2] and result['publicationMaskFromAssembly']==7
        report['operations'][label]=result
        print('Applied '+label+', playing='+str(result['playingAfter'])+', guards='+str(result['guardCount']),flush=True)
        return result
    bank=u32(0x46c82456);assert bank==0x400e21e0
    fixture.normalize_fixture_parts(port);fixture.save_fixture_part(port,run,tap,key)
    parts=fixture.read(port,bank+0x8ed80,0xc5b0)
    original=bytearray(fixture.read(port,bank,PATTERN_BYTES))
    for t in range(8):
        original[t*TRACK_BYTES:t*TRACK_BYTES+8]=bytes([255])*8
        for step in range(64):original[t*TRACK_BYTES+0x78+32*step]=255
    original[0x59]=33;original[TRACK_BYTES+0x59+32*31]=50
    def load_pattern(pattern,blob):
        fixture.put(port,bank+pattern*PATTERN_BYTES,blob)
        fixture.put(port,0x1001614e+pattern*PATTERN_BYTES,blob)
    def current_pattern():return port.peek(0x100b14d0,1)[0]
    def read_pattern(pattern=0):return fixture.read(port,bank+pattern*PATTERN_BYTES,PATTERN_BYTES)
    def assert_pattern(blob,pattern=0):
        assert read_pattern(pattern)==blob,'unrelated pattern bytes changed'
        assert fixture.read(port,0x1001614e+pattern*PATTERN_BYTES,PATTERN_BYTES)==blob,'canonical mirror differs'
    load_pattern(0,original);load_pattern(1,original)
    manual=bytearray(original);manual[0x78]=1;load_pattern(0,manual)
    fixture.call_idle(port,0x400339d8)
    menu(False);assert ui()['selected']==0 and ui()['replace']==0;key('NO')
    report['checks']['freshSessionSafeDefaults']=True
    tap(0x25,1);assert u32(0x800065b8)
    play_frames=frames();sample('closedWithModuleBeforeEdits')
    menu(False);choose(mask=1,replace=False)
    capture('live-lock-confirm.png');sample('confirmationBeforeLock')
    apply('oneTrackLock',63)
    locked=bytearray(manual)
    part=bank+0x8ed80+port.peek(0x100b14cf,1)[0]*0x18b2
    def assignment(t):
        kind=port.peek(part+0x22+t,1)[0];assert kind<2
        return port.peek(part+0x2ca+5*t+kind,1)[0]
    for step in range(1,64):locked[0x78+32*step]=assignment(0)
    assert_pattern(locked);assert ui()['phase']==0
    menu(False);assert ui()['selected']==1 and ui()['replace']==0
    encoder(0,4);encoder(2,4);key('NO')
    menu(False);assert ui()['selected']==1 and ui()['replace']==0;choose();apply('repeatLockNoChanges')
    assert report['operations']['repeatLockNoChanges']['guardCount']==0;assert_pattern(locked)
    # Source mutation is a labelled emulator fixture, not a hidden writer.
    menu(False);choose(replace=True)
    changed=bytearray(locked);changed[0x98]=255;load_pattern(0,changed);fixture.call_idle(port,0x400339d8)
    apply('staleRefusal');assert ui()['phase']==4;assert_pattern(changed);key('NO')
    load_pattern(0,locked);fixture.call_idle(port,0x400339d8)
    menu(False);assert ui()['selected']==1 and ui()['replace']==0;key('NO')
    menu(True);choose(mask=1);capture('live-clear-confirm.png');apply('oneTrackClear',64);assert_pattern(original)
    # Independent custom profile, including cursor and the last action row.
    menu(True);choose(mask=4);apply('clearNoChanges')
    open_part();key('YES');assert ui()['phase']==2 and ui()['selected']==4 and ui()['cursor']==2
    key('NO');menu(False);assert ui()['selected']==1 and ui()['cursor']==0;key('NO')
    report['checks'].update(independentRamProfiles=True,cancelledAndRefusedDraftsIgnored=True,lastActionAndCursorRecalled=True)
    # Full publication: every stored step of every sample track.
    load_pattern(0,manual);fixture.call_idle(port,0x400339d8)
    menu(False);choose(all_tracks=True,replace=True);capture('live-512-lock-confirm.png');apply('maximumLock',512)
    maximum=bytearray(original)
    for t in range(8):
        for step in range(64):maximum[t*TRACK_BYTES+0x78+32*step]=assignment(t)
    assert_pattern(maximum)
    menu(True);choose(all_tracks=True);capture('live-512-clear-confirm.png');apply('maximumClear',512);assert_pattern(original)
    assert fixture.read(port,bank+0x8ed80,0xc5b0)==parts,'operation changed Part records'
    sample('closedAfterLiveEdits')
    # Pattern selection is a real panel gesture. An armed confirmation must
    # retire before it; it cannot write the new pattern using the old plan.
    menu(False);choose();port.command('key 0x25 64');run(80);tap(0x20,2);port.command('key 0x25 0')
    for _ in range(24):
        run(100)
        if current_pattern()==1:break
    assert current_pattern()==1 and ui()['phase']==0 and u32(0x800065b8)
    assert_pattern(original,0);assert_pattern(original,1)
    menu(False);assert ui()['selected']==255 and ui()['replace']==1;choose();apply('newPatternLock',512)
    part=bank+0x8ed80+port.peek(0x100b14cf,1)[0]*0x18b2
    next_locked=bytearray(original)
    for t in range(8):
        for step in range(64):next_locked[t*TRACK_BYTES+0x78+32*step]=assignment(t)
    assert_pattern(next_locked,1);assert_pattern(original,0)
    menu(True);choose();apply('newPatternClear',512);assert_pattern(original,1)
    port.command('key 0x25 64');run(80);tap(0x20,1);port.command('key 0x25 0')
    for _ in range(24):
        run(100)
        if current_pattern()==0:break
    assert current_pattern()==0 and u32(0x800065b8)
    report['checks'].update(patternChangeRetiresConfirmation=True,settingsFollowToNewPattern=True,onlyConfirmedPatternEdited=True)
    # At least 30 seconds of native playback, using the instrument clock.
    while frames()-play_frames<82700:run(100)
    report['nativePlaybackFrameAdvance']=frames()-play_frames
    # Real REC+PLAY; the operation refuses without ending recording or play.
    port.command('key 0x25 2');run(80);port.command('key 0x25 3');run(80)
    port.command('key 0x25 2');run(80);port.command('key 0x25 0');run(80)
    assert u32(0x460d172a)
    before=read_pattern();menu(False);choose();apply('liveRecordingRefusal')
    assert ui()['phase']==4 and u32(0x460d172a) and u32(0x800065b8);assert_pattern(before);key('NO')
    tap(0x24,128);assert not u32(0x800065b8) and not u32(0x460d172a)
    menu(False);choose();apply('stoppedLock',512,0);assert_pattern(maximum)
    menu(True);choose();apply('stoppedClear',512,0);assert_pattern(original)
    report['checks'].update(liveRecordingRefusedWithoutStopping=True,stoppedStatePreserved=True,maximum512LockAndClear=True,nonSampleBytesAndMirrorsPreserved=True)
    # Ordinary native persistence, and preferences survive reload in RAM.
    menu(False);choose();apply('savedLock',512,0);assert_pattern(maximum)
    prefs=fixture.read(port,base+exact['symbols']['preferences'],10)
    fixture.panel_job(port,run,tap,key)
    fixture.put(port,bank+0x78,b'\xff');fixture.put(port,0x1001614e,b'\xff')
    fixture.panel_job(port,run,tap,key,reload=True);assert_pattern(maximum)
    assert fixture.read(port,base+exact['symbols']['preferences'],10)==prefs
    menu(True);choose();apply('reloadedClear',512,0);assert_pattern(original)
    report['checks'].update(nativeProjectSaveReloadPassed=True,preferencesRemainRamOnlyAcrossReload=True)
    tap(0x25,1);sample('closedWithModuleAfterAllChecks');tap(0x24,128)
    menu(True);key('YES');key('NO');capture('live-removal-open-tracks.png')
    report['checks'].update(playbackPreserved=True,noImplicitTransportCommands=True)
    state.update(report=report,sample=sample,run=run,tap=tap,frames=frames,ui=ui,menu=menu,key=key)
    return dict(livePlaybackVerified=True,ramPreferencesVerified=True,cpuMonitorRecorded=True,
        nativeSaveReloadPassed=True,maximumLiveLocksWritten=512,maximumLiveLocksCleared=512)

def after_undo(port,out):
    report=state['report'];state['tap'](0x25,1)
    state['sample']('closedWithoutModuleMatchedPlayback')
    state['tap'](0x24,128)
    port.reinstall_trial();state['run'](100);port.attest()
    for clear in (False,True):
        state['menu'](clear);s=state['ui']()
        assert s['selected']==0 and s['replace']==0 and s['select_all']==0,'preferences survived module reload'
        state['key']('NO')
    port.undo_reinstalled();state['run'](100)
    report['checks']['preferencesResetOnModuleReload']=True
    report['checks'].update(moduleRemovedWithOverlayOpen=True,stockSitesRestored=True)
    baseline=report['cpuWindows']['closedWithoutModuleMatchedPlayback']['cpuMeanPermille']
    report['cpuMeterSaturated']=baseline>=990
    report['cpuInterpretation']='Cached CPU meter saturated on the unloaded baseline; no module load percentage can be resolved.' if baseline>=990 else 'Whole-instrument cached meter differences include UI, native playback and sampling; they are not isolated commit cost.'
    report['helperSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (out/'live-performance.json').write_text(json.dumps(report,indent=2)+'\n')
    return fixture.after_undo(port,out)
