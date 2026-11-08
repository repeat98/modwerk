"""Observe normal stock recording/retrigger/STOP on a disposable MKII project.

No injected hooks, direct native calls, device access or card write-back. Source
snapshots are paused observations, not a live ownership or interrupt-mask proof.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import shutil
import struct
import wave
from boot_observe import Port, digest
from boot_formats import observe
from boot_writer import hits, writes
from inspect_stock import STOCK_MAIN_SHA256

ROOT=Path(__file__).resolve().parent
KEYS={'track1':(0x22,1),'track8':(0x22,128),'recab':(0x25,8),'stop':(0x24,128)}

def key(port,name,down):
    row,mask=KEYS[name]
    port.command(f'key {row:#x} {mask if down else 0}')
    port.command('run 60')

def record(port,track):
    name='track'+str(track+1)
    key(port,name,True);key(port,'recab',True)
    key(port,'recab',False);key(port,name,False)

def snapshot(port,track):
    state=port.peek(0x80004f1c,84*16)
    bank=(int.from_bytes(port.peek(0x80004f18,4),'big')>>track)&1
    flags=[state[84*(track+8*b)+2] for b in range(2)]
    positions=[int.from_bytes(state[84*(track+8*b)+24:84*(track+8*b)+28],'big') for b in range(2)]
    return {'bank':bank,'states':flags,'positions':positions,
            'published':int.from_bytes(port.peek(0x46c802c8+4*track,4),'big'),
            'queueCounts':[int.from_bytes(port.peek(q+4,4),'big') for q in (0x460d17ce,0x460d17ae)]}

def state_changes(stores,track):
    result=[]
    for row in stores:
        for bank in range(2):
            address=0x80004f1c+84*(track+8*bank)+2
            if row[2]<=address<row[2]+row[4]:
                # Stock publishes pending state with a longword starting two
                # bytes earlier. Compare overlapping extents, not start alone.
                assert row[4] in (1,2,4)
                value=(row[3]>>(8*(row[4]-1-(address-row[2]))))&255
                result.append({'bank':bank,'value':value,'bytes':row[4],'pc':hex(row[1])})
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','main','card','wav','output'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--card-sha256',required=True)
    a=p.parse_args()
    if not __debug__:p.error('Assertions must remain enabled.')
    out,repo=a.output.resolve(),ROOT.parents[2]
    if out.exists() or out==repo or repo in out.parents:p.error('Use fresh private output outside Git.')
    if digest(a.main)!=STOCK_MAIN_SHA256 or digest(a.card)!=a.card_sha256:p.error('Private input identity differs.')
    with wave.open(str(a.wav),'rb') as f:
        if (f.getnchannels(),f.getsampwidth(),f.getframerate(),f.getnframes())!=(2,2,44100,44100):
            p.error('Expected the original one-second stereo Flex fixture.')
        raw=f.readframes(f.getnframes())
    original=list(struct.unpack('<'+'h'*(len(raw)//2),raw))
    out.mkdir(parents=True);card=out/'card.private.img';shutil.copyfile(a.card,card)
    command=[str(a.emulator.resolve()),'--image',str(a.main.resolve()),'--card',str(card),
             '--mount','--set','BEATLAB','--project','PROJECT 261023','--load-ms','90000',
             '--dsp','--frame','--ms','3000','--interactive','--main-level','off','--rtc','host','--mkii',
             '--lcd',str(out/'lcd.private.bin')]
    port=Port(command,out);results=[]
    try:
        port.reply(b'ready ',timeout=600);assert port.loaded
        folder=out/'baseline';folder.mkdir();baseline=observe(port,16,2,original,folder)
        port.command('watch 0x400068e4,0x40005ff0,0x40005e48')
        for track in (0,7):
            initial=snapshot(port,track)
            assert initial['states']==[0,0], 'Recorder is already active in fixture'
            count=int.from_bytes(port.peek(0x46c75e88+2*(128+track),2),'big')
            row=0x46c2e9c0+2*(track+2)*14602
            first=int.from_bytes(port.peek(row,2),'big')
            # 14,602 usable nonzero page IDs occupy a physical 14,603-page
            # arena. Recorder reservations can own the highest ID, 14,602.
            assert 0<count<=14602 and 0<first<=14602, 'No bounded reserved recorder page'
            pcm=0x40a955e0+first*6144;tail=row+2*14601
            port.command(f'watchmem {pcm:#x} 64');port.command(f'watchmem {tail:#x} 2')
            for bank in range(2):port.command(f'watchmem {0x80004f1c+84*(track+8*bank):#x} 84')
            hits(port);writes(port)  # Drain earlier track observations separately.
            record(port,track);port.command('run 200');started=snapshot(port,track)
            recorder_format=int.from_bytes(port.peek(0x46c922c4+44*(128+track),4),'big')
            assert recorder_format==3,'Pinned fixture no longer records packed 16-bit stereo'
            port.command('run 300');advanced=snapshot(port,track)
            assert started['states'][started['bank']]==2 and started['published']>0
            assert advanced['bank']==started['bank'] and advanced['published']>started['published']
            record(port,track);port.command('run 200');retriggered=snapshot(port,track)
            assert retriggered['bank']==1-started['bank'] and retriggered['states']==[2,2]
            assert retriggered['published']==retriggered['positions'][retriggered['bank']]
            assert 0<retriggered['published']<advanced['published'], 'Second REC did not restart'
            port.command('run 300');before_stop=snapshot(port,track)
            key(port,'stop',True);key(port,'stop',False);port.command('run 500')
            stopped=snapshot(port,track)
            assert stopped['bank']==retriggered['bank']
            assert stopped['states'][stopped['bank']]==0 and stopped['positions'][stopped['bank']]==0
            assert stopped['states'][1-stopped['bank']]==2, 'Retained inactive-bank state differs'
            assert stopped['published']>=before_stop['published'] and stopped['queueCounts']==[0,0]
            calls,stores=hits(port),writes(port)
            recorder=[r for r in calls if r[1]==0x400068e4 and r[8]==track]
            assert recorder and all(r[10]<=r[11]<=16 for r in recorder)
            callers=Counter(hex(r[7]) for r in recorder)
            assert set(callers)=={'0x4000d342','0x4000d36e'} and len(set(callers.values()))==1
            pcm_stores=[r for r in stores if pcm<=r[2]<pcm+64]
            tail_stores=[r for r in stores if r[2]==tail]
            transitions=state_changes(stores,track)
            assert [(r['bank'],r['value'],r['bytes']) for r in transitions]==[(1,1,4),(1,2,1),(0,1,4),(0,2,1),(0,0,1)]
            assert [r['pc'] for r in transitions]==['0x40006274','0x400069e6','0x40006274','0x400069e6','0x40005e9e']
            assert pcm_stores, 'PCM watch lacks a recording positive control'
            assert tail_stores and all(r[3:5]==(0,2) and r[1]==0x40095afc for r in tail_stores)
            assert int.from_bytes(port.peek(row,2),'big')==first
            assert int.from_bytes(port.peek(0x46c75e88+2*(128+track),2),'big')==count
            # An idle interval must not advance the selected bank or rewrite the
            # observed PCM/map spans; the stale other-bank 2 remains visible.
            port.command('run 500');idle=snapshot(port,track);idle_stores=writes(port)
            assert idle==stopped
            assert not any(pcm<=r[2]<pcm+64 or r[2]==tail for r in idle_stores)
            folder=out/f'after-track-{track+1}';folder.mkdir()
            after=observe(port,16,2,original,folder)
            assert after['settingsSha256']==baseline['settingsSha256'] and after['controlsSha256']==baseline['controlsSha256']
            results.append({'track':track+1,'initial':initial,'started':started,'advanced':advanced,
                'retriggered':retriggered,'beforeStop':before_stop,'stopped':stopped,'idle':idle,
                'recorderCalls':len(recorder),'callerReturnCounts':dict(callers),'pcmPrefixStores':len(pcm_stores),
                'mapTailStores':len(tail_stores),'allocatedPages':count,'retainedInactiveBank':True,
                'recorderFormat':recorder_format,'stateChanges':transitions,'firstPhysicalPage':first,
                'idleObservedSpansUnchanged':True,'flexSourceUnchanged':True})
            print('PASS: normal-panel track',track+1,'start/retrigger/STOP; pending-bank switch, retained old state and deferred map cleanup',flush=True)
        assert digest(card)==a.card_sha256,'Disposable card file changed'
    finally:port.close()
    names=('boot_recorder.py','boot_writer.py','boot_observe.py','boot_formats.py','inspect_stock.py','test_planner.py')
    report={'scope':'stock full-boot MKII emulator, normal panel recorder keys, both DSPs and scheduler; no injected module or device',
            'sourceSha256':{n:digest(ROOT/n) for n in names},'stockMainSha256':digest(a.main),
            'emulatorSha256':digest(a.emulator),'cardSha256':a.card_sha256,'wavSha256':digest(a.wav),
            'recorders':results,'cardUnchanged':True,'exitCode':0,'hardware':'not tested',
            'limits':'Paused observations and selected watched spans; no complete writer coverage, native source guard, SR/latency/cache proof, USB, audible or persistence qualification.'}
    (out/'recorder-panel.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
