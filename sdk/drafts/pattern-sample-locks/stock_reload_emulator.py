#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Load the saved native project in a fresh emulator without uploading a module."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from capture_emulator import Port
import stress_emulator

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','base','card','receipt','out'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--stock-main',type=Path,help='Diagnostic: original stock MAIN, with no Modwerk base')
    args=parser.parse_args();out=args.out.resolve()
    root=Path(__file__).resolve().parents[3]
    assert out!=root and root not in out.parents
    out.mkdir(parents=True,exist_ok=False)
    prior=json.loads(args.receipt.read_text())
    expected=prior['checks']['savedAudioSha256']
    main=args.stock_main or args.base/'MAIN.raw'
    main_hash=hashlib.sha256(main.read_bytes()).hexdigest()
    card_hash=hashlib.sha256(args.card.read_bytes()).hexdigest()
    card=out/'card.private.img';shutil.copyfile(args.card,card)
    port=Port([str(args.emulator),'--image',str(main),'--card',str(card),'--card-rw',
        '--mount','--set','BEATLAB','--project','PROJECT 261023','--load-ms','30000',
        '--load-early','--dsp','--frame','--ips','3990','--ms','3000',
        '--interactive','--main-level','off','--rtc','host','--mkii'],out)
    try:
        port.reply(b'ready ',timeout=300)
        # The line-protocol gate can precede the GUI's asynchronous startup.
        # Dismiss initial dialogs and let native loading settle before PROJ.
        for _ in range(3):
            port.command('key 0x26 4');port.command('run 80')
            port.command('key 0x26 0');port.command('run 80')
        for _ in range(20):assert 'stop=time' in port.command('run 250')
        def read(at,n):
            return b''.join(port.peek(at+i,min(4096,n-i)) for i in range(0,n,4096))
        def u32(at):return int.from_bytes(port.peek(at,4),'big')
        guard='d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf'
        def stock_sites():
            for at in (0x4002dc68,0x4002dc90,0x4002dcc4):
                assert hashlib.sha256(port.peek(at,6)).hexdigest()==guard,'module unexpectedly restored'
        stock_sites()
        port.attest=stock_sites
        initial_work=hashlib.sha256(read(u32(0x46c82456),8*0x91a)).hexdigest()
        part_before=read(u32(0x46c82456)+0x8ed80,0xc5b0)
        port.command('watchmem 0x80170f82 1')
        def run(ms):
            reply=port.command('run '+str(ms))
            assert 'stop=time' in reply,reply
        def tap(row,mask):
            port.command(f'key {row:#x} {mask}');run(80)
            port.command(f'key {row:#x} 0');run(80)
        def key(name):
            tap(*{'UP':(0x26,8),'DOWN':(0x24,1),'YES':(0x26,2),'NO':(0x26,4),'LEFT':(0x26,16),'RIGHT':(0x24,2)}[name])
        # A saved .strd snapshot is distinct from the current .work state.
        # Use native RELOAD PROJECT to test that snapshot without this module.
        stress_emulator.panel_job(port,run,tap,key,reload=True)
        assert port.peek(0x100b14d0,1)==b'\0'
        blob=read(u32(0x46c82456),8*0x91a)
        assert hashlib.sha256(blob).hexdigest()==expected,'saved native audio tracks changed'
        mirror=read(0x1001614e,len(blob))
        part_after=read(u32(0x46c82456)+0x8ed80,0xc5b0)
        part_changes=[(i,a,b) for i,(a,b) in enumerate(zip(part_before,part_after)) if a!=b]
        (out/'part-writes.private.txt').write_text(port.command('writes',b'writes ')+'\n')
        assert mirror==blob,'native battery mirror mismatch'
        print('Part changes under '+('plain stock' if args.stock_main else 'shared base')+': '+str(part_changes[:30]),flush=True)
        if args.stock_main:
            import re
            def frames():return int(re.search(r'frames=(\d+)',port.command('status',b'status '))[1])
        else:
            symbols=json.loads((args.base/'symbols.json').read_text())
            def frames():return u32(symbols['dl_frames'])
        count=frames();reply=port.command('run 500');assert 'stop=time' in reply
        assert frames()>count
        result=dict(hardware=False,dspExecution=True,moduleUploaded=False,
            freshProcessWithoutBatterySnapshot=True,allThreeOpenersStock=True,
            nativeProjectReloadWithoutModule=True,initialWorkAudioSha256=initial_work,
            nativeSavedTracksExact=True,nativeBatteryMirrorMatches=True,
            savedAudioSha256=expected,base=None if args.stock_main else json.loads((args.base/'proofs.json').read_text())['configurationHash'],
            mainSha256=main_hash,cardInputSha256=card_hash,plainStockFirmware=bool(args.stock_main),partChanges=part_changes,
            emulatorSha256=hashlib.sha256(args.emulator.read_bytes()).hexdigest(),
            helperSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            menuHelperSha256=hashlib.sha256(Path(stress_emulator.__file__).read_bytes()).hexdigest())
        (out/'stock-reload.json').write_text(json.dumps(result,indent=2)+'\n')
        print('PASS fresh native project load without module or retained battery snapshot',flush=True)
    finally:port.close()
if __name__=='__main__':main()
