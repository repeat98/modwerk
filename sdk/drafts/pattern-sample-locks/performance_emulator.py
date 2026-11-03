# SPDX-License-Identifier: MIT
"""Matched stopped-state load estimates and exact-object operation watches.

The emulator executes instructions, not the chip's complete cycle model.
Reported model milliseconds are not hardware deadlines or audible evidence.
"""
import hashlib
import json
from pathlib import Path
import statistics
import stress_emulator as fixture

state={}
INSTRUCTIONS_PER_MS=3990.0*44.1  # ot_emu's default --ips, per audio sample

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    exact=port.profile_symbols
    assert exact and exact['packageSha256']
    base=int.from_bytes(port.peek(0x4002dc6a,4),'big')-exact['psl_open']
    symbols=port.base_symbols
    def u32(at):return int.from_bytes(port.peek(at,4),'big')
    def meter():
        blob=port.peek(symbols['modwerk_status'],48)
        values=[int.from_bytes(blob[n:n+4],'big') for n in range(0,48,4)]
        return dict(cpuPermille=values[0],dsp0Permille=values[1],dsp1Permille=values[3],
                    dsp0PeakPermille=values[2],dsp1PeakPermille=values[4],
                    freshDspReads=u32(symbols['modwerk_status_reads']),
                    frames=u32(symbols['dl_frames']),idle0=values[10],idle1=values[11])
    def sample(label):
        run(1000);rows=[]
        for _ in range(10):run(500);rows.append(meter())
        print('Sampled '+label,flush=True)
        return dict(readings=rows,mean={name:statistics.mean(row[name] for row in rows)
                    for name in ('cpuPermille','dsp0Permille','dsp1Permille')},
                    dspReadAdvance=rows[-1]['freshDspReads']-rows[0]['freshDspReads'])
    def menu(clear,all_tracks,confirm=True):
        port.command('key 0x25 32');run(80);tap(0x23,32)
        port.command('key 0x25 0');run(80)
        encoder(6,-24);encoder(6,20 if clear else 16);key('YES')
        encoder(0,4 if all_tracks else -4)
        if not all_tracks:encoder(1,4)
        if confirm:key('YES')
    def watch():
        functions=exact['performanceFunctions']
        points={base+offset for fn in functions.values() for offset in [fn['begin'],*fn['ends']]}
        points.update(base+n for n in [exact['begin'],*exact['ends']])
        port.command('watch '+','.join(hex(n) for n in sorted(points)))
        port.command('hits',b'hits ')
    def finish_watch():
        hits=[[int(n,16) for n in hit.split(':')] for hit in port.command('hits',b'hits ').split()[2:]]
        port.command('watch off');result={}
        for name,fn in exact['performanceFunctions'].items():
            stack=[];spans=[]
            for count,pc,*_ in hits:
                if pc==base+fn['begin']:stack.append(count)
                elif pc in {base+n for n in fn['ends']} and stack:
                    spans.append(count-stack.pop()+1)
            assert not stack and spans, 'Missing completed watch: '+name
            result[name]=dict(instructionSpans=spans,totalInstructions=sum(spans),
                              modelMilliseconds=sum(spans)/INSTRUCTIONS_PER_MS)
        start=None;guards=[]
        for count,pc,*_ in hits:
            if pc==base+exact['begin']:assert start is None;start=count
            elif pc in {base+n for n in exact['ends']}:
                assert start is not None;guards.append(count-start);start=None
        assert start is None and guards
        result['writeGuards']=dict(count=len(guards),maxInstructions=max(guards),
                                  maxModelMicroseconds=max(guards)*1000/INSTRUCTIONS_PER_MS)
        return result
    tap(0x22,1)
    assert u32(0x800065b8)==0
    bank=u32(0x46c82456);assert bank==0x400e21e0
    reports={};initial=fixture.read(port,bank,8*0x91a)
    for label,track_count,step_count in (('small',1,2),('maximum',8,64)):
        source=bytearray(initial)
        for track in range(8):
            at=track*0x91a
            source[at:at+8]=((1<<step_count)-1 if track<track_count else 0).to_bytes(8,'big')
            for step in range(64):source[at+0x78+32*step]=255
        fixture.put(port,bank,source);fixture.put(port,0x1001614e,source)
        fixture.call_idle(port,0x400339d8)
        if label=='maximum':
            reports['closedWithModule']=sample('closed, module installed')
            menu(False,True,False)
            reports['selectionWithModule']=sample('track selection, module installed')
            key('NO')
        operations={}
        for clear in (False,True):
            watch();menu(clear,track_count==8)
            key('YES');run(200);measurement=finish_watch()
            assert u32(0x800065b8)==0
            blob=fixture.read(port,bank,len(source))
            for track in range(8):
                kind=port.peek(bank+0x8ed80+0x22+track,1)[0]
                expected=255 if clear else port.peek(bank+0x8ed80+0x2ca+5*track+kind,1)[0]
                for step in range(64):
                    value=expected if track<track_count and step<step_count else 255
                    assert blob[track*0x91a+0x78+32*step]==value
            assert fixture.read(port,0x1001614e,len(source))==blob
            measurement['guardTimerMax']=u32(base+exact['symbols']['psl_guard_max'])
            operations['clear' if clear else 'lock']=measurement
            key('NO')
        reports[label]=dict(changedLocks=track_count*step_count,operations=operations)
        print('Profiled '+label,flush=True)
    state.update(sample=sample,reports=reports,out=out)
    return {'performanceOperationsVerified':True,'performanceHelperSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def after_undo(port,out):
    reports=state['reports'];reports['closedWithoutModule']=state['sample']('closed, module removed')
    reports['model']=dict(instructionsPerMillisecond=INSTRUCTIONS_PER_MS,
        hardware=False,scope='Stopped disposable MKII emulator fixture; native panel operations; no audio qualification')
    (out/'performance.json').write_text(json.dumps(reports,indent=2)+'\n')
    return {'performanceBaselineAfterRemoval':True}
