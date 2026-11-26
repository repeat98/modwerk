"""Exercise the private performance overlay via MKII panel edges on a disposable card."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

from mkii_panel import panel, peek

parser = argparse.ArgumentParser(description=__doc__)
for name in ('emulator', 'base_dir', 'card', 'module', 'module_symbols', 'octabam', 'output'):
    parser.add_argument(name, type=Path)

parser.add_argument('--stock-controls',action='store_true',help='Also compare native sound, Scenes and mode selection')
parser.add_argument('--sprint03',action='store_true',help='Also observe live stock data, pause, the selective edit lock, Cell Launch and view memory')
args = parser.parse_args()
if not __debug__:
    parser.error('Assertions must be enabled')
sys.path.insert(0, str(args.octabam.resolve() / 'tools/emu'))
import lcd_view as lcd

args.output.mkdir(parents=True, exist_ok=True)
symbols = json.loads((args.base_dir/'symbols.json').read_text())
module = json.loads(args.module_symbols.read_text())
assert hashlib.sha256(args.module.read_bytes()).hexdigest() == module['sha256']
receipt = {'module': module['sha256'], 'observations': []}
with tempfile.TemporaryDirectory() as tmp:
    card = Path(tmp)/'test.img'
    frame_hashes = {}
    shutil.copyfile(args.card, card)
    with panel(args.emulator, args.base_dir/'MAIN.raw', card,
               ['--card-rw','--dsp','--names-early']) as cmd:
        def num(addr, size=4):
            return int.from_bytes(peek(cmd,addr,size),'big')

        def call(name,*values):
            for _ in range(200):
                try:
                    result=cmd('call '+' '.join(hex(v) for v in (symbols[name],*values)))
                    return int(result.split('d0=')[1].split()[0],16)
                except RuntimeError as error:
                    if "not main's spin" not in str(error):
                        raise
                    cmd('run 3')
            raise RuntimeError(name+' did not reach idle')

        def switch(on):
            assert call('modwerk_modset_switch',0x34e1e379,on)==1
            for _ in range(100):
                cmd('run 15')
                status=num(symbols['modwerk_modset_switch_result'])
                if status!=1: break
            assert status==0,status
            cmd('run 1200')

        def tap(*keys):
            for key in keys:
                for val in (1 << (key%8),0):
                    cmd(f'key {32+key//8} {val}')
                    cmd('run 35')

        def check(event, **expected):
            observed={k:num(origin+module['offsets'][k],2 if k=='defined' else 4)
                      for k in expected}
            print(event,observed,flush=True)
            assert observed==expected,(event,observed,expected)
            receipt['observations'].append([event,observed])

        def shot(name):
            # The base copies the composed panel frame *after* module draw.
            # The emulator --lcd plane contains the earlier stock renderer.
            frame = peek(cmd,symbols['core:screen']+0x08000000+4,1024)
            assert len(frame)==1024 and any(frame), 'missing composed frame'
            digest=hashlib.sha256(frame).hexdigest()
            assert digest not in frame_hashes.values(), (name,'unchanged frame')
            frame_hashes[name]=digest
            lcd.png(lcd.pixels(frame),args.output/(name+'.png'))

        def stock_controls():
            # Compare the same physical edges on the same disposable project.
            def edge(key,pressed):
                cmd(f'key {32+key//8} {(1 << (key%8)) if pressed else 0}')
                cmd('run 60')
            tap(0x10,0x23)  # T1 and stock AMP.
            part = 0x400e21e0 + 0x8ed80
            def part_digest():
                data = b''.join(peek(cmd,part+i,min(1024,0x18b2-i)) for i in range(0,0x18b2,1024))
                return hashlib.sha256(data).hexdigest()
            start=part_digest()
            cmd('knob 0x30 7'); cmd('run 120')
            moved=part_digest()
            cmd('knob 0x30 249'); cmd('run 120')
            assert start != moved and part_digest()==start, 'expected reversible stock AMP knob'
            scenes = peek(cmd,part+0x10,2)
            edge(0x19,True); tap((scenes[0]+3)%16); edge(0x19,False)
            chosen = peek(cmd,part+0x10,2)
            assert chosen==bytes([(scenes[0]+3)%16,scenes[1]])
            edge(0x19,True); tap(scenes[0]); edge(0x19,False)
            assert peek(cmd,part+0x10,2)==scenes
            fader=[]
            for adc in (1,128,255,1):
                cmd(f'key 64 {adc}'); cmd('run 120')
                fader.append(num(0x460d16c8))
            assert fader==[0,64,127,0]
            initial=num(0x460d16f0)
            edge(0x2d,True); tap(0x20,0x20); edge(0x2d,False)
            cmd('run 1200')
            after=num(0x460d16f0)
            assert initial!=after,(initial,after)
            edge(0x2d,True); tap(0x33,0x33); edge(0x2d,False)
            cmd('run 1200')
            assert num(0x460d16f0)==initial
            return dict(amp=[start,moved],scene=[scenes.hex(),chosen.hex()],fader=fader,trig_mode=[initial,after,initial])

        def edge(key,pressed,ms=60):
            cmd(f'key {32+key//8} {(1 << (key%8)) if pressed else 0}')
            cmd(f'run {ms}')

        def frame():
            return peek(cmd,symbols['core:screen']+0x08000000+4,1024)

        def region(f,x0,x1,band):
            return bytes(f[x*8+7-band] for x in range(x0,x1+1))

        def digest(addr,size):
            return hashlib.sha256(b''.join(peek(cmd,addr+i,min(1024,size-i)) for i in range(0,size,1024))).hexdigest()

        def sprint03():
            obs={}
            part=0x400e21e0+0x8ed80
            home=lambda: digest(0x400e21e0,0x8ed8)
            tap(arr)
            check('S03 ARR returns to the remembered Panorama',view=1,mode=1,locked=0)
            # A2: the crossfader reaches the stock under CLYPS and the moved group stays live.
            fader,groups=[],[]
            for adc in (1,128,255,1):
                cmd(f'key 64 {adc}'); cmd('run 160')
                fader.append(num(0x460d16c8)); groups.append(region(frame(),75,127,7).hex())
            assert fader==[0,64,127,0],fader
            assert groups[0]!=groups[1]!=groups[2] and groups[3]==groups[0],'crossfader group not live'
            check('S03 crossfader under Panorama',view=1)
            obs['crossfader']=fader
            scenes=peek(cmd,part+0x10,2)
            edge(0x19,True); tap((scenes[0]+3)%16); edge(0x19,False)
            chosen=peek(cmd,part+0x10,2)
            assert chosen==bytes([(scenes[0]+3)%16,scenes[1]]),(scenes,chosen)
            check('S03 Scene A under Panorama, no launch',view=1,playing=0,requested=0)
            shot('s03-scene')
            edge(0x19,True); tap(scenes[0]); edge(0x19,False)
            assert peek(cmd,part+0x10,2)==scenes
            obs['scene']=[scenes.hex(),chosen.hex()]
            # A2: beat markers move with play (Clip sidebar, y 15-17).
            tap(arr)
            check('S03 Clip',view=2)
            tap(0x28); cmd('run 300'); a=frame(); cmd('run 520'); b=frame()
            beats=[region(a,14,37,2).hex(),region(b,14,37,2).hex()]
            assert num(0x800065b8)==1 and beats[0]!=beats[1],('beat markers static',beats)
            obs['beats']=beats
            shot('s03-clip-playing')
            # A3: PAUSE holds every request; the next boundary after resume commits it.
            tap(arr,0x28); cmd('run 200')
            run_word=num(0x800065b8)
            print('transport after PLAY during play',run_word,flush=True)
            assert run_word==2,('expected pause',run_word)
            tap(4); cmd('run 2500')
            check('S03 pause keeps the pending Row',view=1,pending_row=5,playing=0,last_row=0)
            shot('s03-pause')
            tap(0x28); cmd('run 2600')
            check('S03 resume commits at the next boundary',pending_row=0,last_row=5,playing=0x10)
            # C1/C2: TRACK + TRIG launches one cell; the path stays on R05 (requests held in pause).
            tap(0x28); cmd('run 200'); assert num(0x800065b8)==2
            edge(0x12,True); tap(1); edge(0x12,False)
            check('S03 T3 + TRIG 2: cell from R02',requested=0x10,org_req=0x05020505,pending_row=0,last_row=5)
            edge(0x11,True); tap(1); edge(0x11,False)
            check('S03 T2 + TRIG 2: second cell pending',requested=0,playing=0x10,org_req=0x05020205,org_play=0x05050505,last_row=5)
            shot('s03-cell-pending')
            tap(0x28); cmd('run 2600')
            check('S03 cells commit, path unchanged',playing=0,org_play=0x05020205,last_row=5,pending_row=0)
            tap(yes)
            check('S03 Row Advance ends after R05',last_row=5,pending_row=0)
            # B1: the edit lock frees sound and holds the sequence.
            edge(0x11,True); tap(4); edge(0x11,False); cmd('run 2600')
            check('S03 T2 A02 from R05',playing=0x10)
            tap(no)
            check('S03 native with foreign sources',view=0,locked=1)
            pattern=home(); before=digest(part,0x18b2)
            edge(0x23,True); edge(0x23,False)
            check('S03 AMP page passes',locked=1,lock_note=0)
            cmd('knob 0x30 7'); cmd('run 160'); moved=digest(part,0x18b2)
            cmd('knob 0x30 249'); cmd('run 160')
            assert moved!=before and digest(part,0x18b2)==before,'AMP knob did not edit the Part'
            tap(4)
            check('S03 trig edit held under the lock',lock_note=1,playing=0x10)
            shot('s03-lock-note')
            edge(4,True); cmd('knob 0x30 7'); cmd('run 160'); edge(4,False)
            tap(0x2d)
            assert home()==pattern,'home pattern changed under the lock'
            obs['lock']=dict(part=[before,moved],pattern=pattern)
            # B2: ARR returns to the remembered view.
            tap(arr,arr)
            check('S03 Clip remembered',view=2)
            edge(0x23,True); edge(0x23,False)
            check('S03 AMP page from Clip',view=0,locked=1)
            tap(arr)
            check('S03 ARR back to Clip',view=2)
            tap(0x27,no,yes)
            check('S03 stop and restore home',playing=0,requested=0,last_row=0,mode=0)
            return obs

        arr,yes,no,down,right=0x1f,0x31,0x32,0x20,0x21
        cmd('run 3000'); tap(no); cmd('run 3000'); tap(no); cmd('run 500'); tap(yes); cmd('run 2000')
        assert call('modwerk_runtime_active')==0
        free=call('modwerk_runtime_free',0)
        if args.stock_controls:
            receipt['stock_controls']=stock_controls()
        switch(1)
        for _ in range(5):
            if not num(0x460d1e70) and not num(0x460d175c):
                break
            cmd('run 2500')
            if num(0x460d1e70) or num(0x460d175c): tap(no)
        assert not num(0x460d1e70) and not num(0x460d175c), "stock dialog owns panel"
        row=num(symbols['modwerk_runtime_event_row']+4*(42-4))
        origin=num(row)-module['offsets']['clyps_project_init']
        print("stock context", {hex(a):num(a,n) for a,n in [(0x80000034,1),(0x460d1aec,4),(0x80006546,4),(0x80000028,1),(0x800065bd,4),(0x80000015,1),(0x460d1736,4),(0x460d172a,4),(0x460d1726,4),(0x460d1e70,4),(0x460d175c,4),(0x400eb030,4),(0x46100b18,4)]},flush=True)
        tap(arr)
        shot('first-arr')
        check('open row',view=1,mode=1,playing=0)
        tap(down,0x11)
        check('cursor row 2, T2 through the stock tab',slot=1,track=1,playing=0)
        assert num(0x100b14cc,1)==1, 'stock tab follows T2'
        tap(0x1b); shot('setup'); tap(yes)
        check('capture R02',defined=2,last_row=0)
        tap(arr,0x11,right,yes)
        check('T2 selects A02',view=2,track=1,src_cursor=1,playing=0x10)
        shot('clip')
        tap(arr,down,down,down,0x1b,yes)
        check('capture R05',view=1,defined=18,slot=4,last_row=0)
        tap(yes)
        check('advance to R02 independently of cursor',playing=0,last_row=2,slot=4)
        tap(yes)
        check('advance to R05',playing=0x10,last_row=5)
        tap(yes)
        check('end retains R05',playing=0x10,last_row=5)
        shot('row')
        tap(arr,0x11,2)
        check('override T2 retains path',playing=0x20,last_row=5)
        tap(arr,0x28,1)
        check('direct R02 pending during play',playing=0x20,pending_row=2,last_row=5)
        tap(yes,0x27)
        check('STOP cancels pending',playing=0x20,requested=0x20,pending_row=0,last_row=5)
        tap(no)
        check('exit with foreign edit lock',view=0,locked=1)
        tap(yes)
        check('stopped restore',playing=0,requested=0,last_row=0,mode=0)
        if args.stock_controls:
            tap(arr,no)
            check('Native mode at home',mode=1,view=0,locked=0)
            receipt['installed_controls']=stock_controls()
            assert receipt['stock_controls']==receipt['installed_controls']
            check('sound page and stock controls preserve sources',playing=0,requested=0)
            tap(arr,no,0x11,1)
            check('Native T2 trig launches A02',playing=0x10,locked=1)
            tap(yes)
        if args.sprint03:
            receipt['sprint03']=sprint03()
        switch(0)
        assert call('modwerk_runtime_active')==0 and call('modwerk_runtime_free',0)==free
        receipt['free_before_after']=free
        receipt['composed_frames']=frame_hashes
(args.output/'replay.json').write_text(json.dumps(receipt,indent=2)+'\n')
