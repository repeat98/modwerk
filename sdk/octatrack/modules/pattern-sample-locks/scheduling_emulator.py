#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Local-only scheduling probe of the unchanged 0.1.8 package."""
import hashlib
import json
from pathlib import Path
import sys
import performance_emulator as performance
import stress_emulator as fixture

HERE=Path(__file__).resolve().parent
state={}
PACKAGE='28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d'
IPS_MS=3990*44.1

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    exact=port.profile_symbols
    assert exact['packageSha256']==PACKAGE and exact['phaseImageUnchanged']
    original=port.command
    def u32(at):return int.from_bytes(port.peek(at,4),'big')
    base=u32(0x4002dc6a)-exact['psl_open']
    # Reviewed exact-object instructions; no module code or SR is patched.
    offsets={'taskRaise':0x16f0,'taskRestore':0x1742,'maskRaise':0x3a,'maskRestore':0x88}
    for name,expected in [('taskRaise','46c0'),('taskRestore','46c1'),('maskRaise','46fc2700'),('maskRestore','46c2')]:
        assert port.peek(base+offsets[name],len(bytes.fromhex(expected)))==bytes.fromhex(expected)
    handlers={name:u32(0x40000000+4*vec) for name,vec in
              [('audio',0x41),('sequencer',0x60),('uiTimer',0x61),('scheduler',0xab),('dma8',0x48),('dma9',0x49),('dma15',0x57)]}
    assert handlers['scheduler']==0x40000550
    assert all(0x40000400<=pc<0x41000000 for pc in handlers.values())
    extra={base+n for n in offsets.values()}|set(handlers.values())|{0x400005a6}
    traces=[];windows=[]
    def analyze(reply):
        hits=[[int(n,16) for n in h.split(':')] for h in reply.split()[2:]]
        begins=[h for h in hits if h[1]==base+offsets['taskRaise']]
        ends=[h for h in hits if h[1]==base+offsets['taskRestore']]
        if not begins:return
        assert len(begins)==len(ends)==1
        a,b=begins[0][0],ends[0][0]
        assert a<b and (begins[0][2]>>8)&7==2 and (ends[0][3]>>8)&7==0
        guards=[];at=None;saved=set()
        for h in hits:
            if h[1]==base+offsets['maskRaise']:
                assert at is None;at=h[0];saved.add((h[12]>>8)&7)
            elif h[1]==base+offsets['maskRestore']:
                assert at is not None;guards.append((at,h[0]));at=None
        assert at is None and len(guards)==64 and saved=={2}
        during={name:[h[0] for h in hits if h[1]==pc and a<h[0]<b] for name,pc in handlers.items()}
        assert not during['scheduler']
        assert not any(a<h[0]<b and h[1]==0x400005a6 for h in hits)
        assert not any(lo<h[0]<hi and h[1] in handlers.values() for lo,hi in guards for h in hits)
        after=[h[0] for h in hits if h[1]==0x400005a6 and h[0]>b]
        assert after, 'No scheduler resume observed after restoring SR'
        spans=[hi-lo+1 for lo,hi in guards] # includes the restoring instruction
        traces.append({'taskExclusionInstructionsIncludingBoundaryOps':b-a+1,
                       'taskExclusionModelMs':(b-a+1)/IPS_MS,
                       'maskSpanInstructionsIncludingBoundaryOps':spans,
                       'maskSpanMaxModelUs':max(spans)*1000/IPS_MS,
                       'handlerEntriesDuringTaskExclusion':{n:len(v) for n,v in during.items()},
                       'schedulerEntriesDuringTaskExclusion':0,
                       'schedulerResumeObserved':True,
                       'firstPostRestoreDispatchInstructionDistance':after[0]-b,
                       'allHandlersOutsideFullMaskSpans':True,
                       'audioEntryInstructionGapsWhollyInsideTaskGuard':[y-x for x,y in zip(during['audio'],during['audio'][1:])],
                       'savedTaskMask':(ends[0][3]>>8)&7,'savedPublicationMasks':sorted(saved)})
    def command(line,prefix=b'ok'):
        if line.startswith('watch ') and line!='watch off':
            line+=','+','.join(hex(n) for n in sorted(extra))
        result=original(line,prefix)
        if line=='hits':analyze(result)
        return result
    port.command=command
    gap_names=('frame_gap','tick_gap','dl_frame_gap')
    def reset_gaps():
        for name in gap_names:fixture.put(port,port.base_symbols[name],bytes(4))
    def gaps():return {name:u32(port.base_symbols[name]) for name in gap_names}
    def final_key(name):
        if name!='YES' or u32(base+exact['symbols']['phase'])!=3:return key(name)
        assert u32(0x800065b8)
        reset_gaps();before=original('cfstatus',b'cfstatus ');run(4)
        baseline=gaps();baseline_end=original('cfstatus',b'cfstatus ')
        reset_gaps();start=original('cfstatus',b'cfstatus ')
        original('key 0x26 2')
        waited=0
        while u32(base+exact['symbols']['phase'])==3:
            run(.25);waited+=.25
            assert waited<=100, 'Apply did not complete in model window'
        assert u32(base+exact['symbols']['phase'])==0, 'Apply refused'
        original('key 0x26 0');run(4)
        windows.append({'baselineStart':before,'baselineEnd':baseline_end,'activeStart':start,
                        'activeEnd':original('cfstatus',b'cfstatus '),
                        'baselineGapCounters':baseline,'applyAndRecoveryGapCounters':gaps(),
                        'keyDeliveryThroughClosedModelMs':waited,
                        'timerModeHex':port.peek(0xfc07c000,2).hex(),
                        'baselineWindowModelMs':4,'recoveryWindowModelMs':4})
    port.performance_cases=[('maximumEmpty_'+str(i),8,64,None) for i in range(4)]
    checks=performance.exercise(port,run,tap,final_key,encoder,capture,out,reboot)
    assert len(traces)==len(windows)==8
    assert sum(row['handlerEntriesDuringTaskExclusion']['audio'] for row in traces)>0
    report={'hardware':False,'packageSha256':PACKAGE,'handlerAddresses':handlers,
            'exactObjectBoundaryOffsets':offsets,'instructionsPerModelMs':IPS_MS,
            'scope':'Four native maximum Lock/Clear pairs. Passive PC watches; emulator-only gap counters reset per window. No SR, vector, native writer or firmware code patched.',
            'limitations':['Instruction-derived model time is not physical cycles or wall-clock time.',
                           'No worst-case external streaming/MIDI/USB load qualification.',
                           'Handler entries show service, not interrupt assertion-to-entry latency.',
                           'Vectors can share handler addresses; handler counts must not be summed as distinct vector acknowledgements.',
                           'Active gap windows include key delivery and four model ms after completion.',
                           'Post-restore dispatch instruction distances may cross idle time skips; no time conversion.'],
            'traces':traces,'gapWindows':windows,
            'helperSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (out/'scheduling.json').write_text(json.dumps(report,indent=2)+'\n')
    state['report']=report
    return {**checks,'schedulingTraceVerified':True,'schedulingHelperSha256':report['helperSha256']}

def after_undo(port,out):return performance.after_undo(port,out)

if __name__=='__main__':
    import capture_emulator
    load=capture_emulator.load
    def local_load(name,path):
        return load(name,HERE/'scheduling_emulator.py') if name=='psl_exercise' else load(name,path)
    capture_emulator.load=local_load
    if '--performance' not in sys.argv:sys.argv.append('--performance')
    capture_emulator.main()
