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
parser.add_argument('--dsp',action='store_true',help='Run the DSP interpreter as well as the panel')
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
    plane = Path(tmp)/'lcd.bin'
    shutil.copyfile(args.card, card)
    with panel(args.emulator, args.base_dir/'MAIN.raw', card,
               ['--card-rw',*(['--dsp'] if args.dsp else []),'--names-early','--lcd',str(plane)]) as cmd:
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
            lcd.png(lcd.screen(lcd.read_plane(plane)),args.output/(name+'.png'))

        arr,yes,no,down,right=0x1f,0x31,0x32,0x20,0x21
        cmd('run 3000'); tap(no); cmd('run 3000'); tap(no); cmd('run 500'); tap(yes); cmd('run 2000')
        assert call('modwerk_runtime_active')==0
        free=call('modwerk_runtime_free',0)
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
        tap(down,right)
        check('cursor row 2 track 2',slot=1,track=1,playing=0)
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
        switch(0)
        assert call('modwerk_runtime_active')==0 and call('modwerk_runtime_free',0)==free
        receipt['free_before_after']=free
(args.output/'replay.json').write_text(json.dumps(receipt,indent=2)+'\n')
