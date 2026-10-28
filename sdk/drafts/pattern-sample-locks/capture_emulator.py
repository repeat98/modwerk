#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Capture or exercise a runtime package on a private MKII emulator through its USB loader.

Never connects to physical USB; requires the emulator's Unix socket. Stock,
cards, logs and runtime packages remain in the caller's private output folder.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import shutil
import struct
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]

def load(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class Port:
    def __init__(self,command,out):
        self.log=(out/'stdout.private.log').open('wb',buffering=0)
        self.err=(out/'stderr.private.log').open('wb')
        self.process=subprocess.Popen(['stdbuf','-oL',*command],stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,stderr=self.err,cwd=out)
        self.pending=b'';self.poll=selectors.DefaultSelector()
        self.poll.register(self.process.stdout,selectors.EVENT_READ)
    def reply(self,prefix=b'ok',timeout=60):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            while b'\n' in self.pending:
                line,self.pending=self.pending.split(b'\n',1);self.log.write(line+b'\n')
                if line.startswith(b'err'):raise RuntimeError(line.decode())
                if line.startswith(prefix):return line.decode()
            if self.process.poll() is not None:raise RuntimeError('Emulator exited; see private log')
            if self.poll.select(1):
                data=os.read(self.process.stdout.fileno(),65536)
                if not data:raise RuntimeError('Emulator output closed')
                self.pending+=data
        raise TimeoutError('Emulator command timed out')
    def command(self,line,prefix=b'ok'):
        self.log.write(('> '+line+'\n').encode());self.process.stdin.write((line+'\n').encode());self.process.stdin.flush()
        return self.reply(prefix)
    def peek(self,address,n):return bytes.fromhex(self.command(f'peek {address:#x} {n}',b'peek ').split()[1])
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(10)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
        self.poll.close();self.log.close();self.err.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','base','card','package','out'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--history',action='store_true',help='Adversarial native edit and absent-owner history on disposable media')
    parser.add_argument('--stress-save',action='store_true',help='Maximum native edits plus native save/reload on the copied card')
    parser.add_argument('--exercise',action='store_true',help='Exercise native edits on disposable emulator media')
    parser.add_argument('--companion',type=Path,help='Install an unrelated package after Lock, on this disposable emulator only')
    parser.add_argument('--profile-symbols',type=Path,help='Private exact-object offsets for publication guard instruction measurements')
    parser.add_argument('--keep',action='store_true',help='Keep only on the disposable emulator card for automatic restart testing')
    parser.add_argument('--boot-auto',action='store_true',help='Use the saved module set restored by native startup; never re-upload')
    parser.add_argument('--cs1-in',type=Path,help='Private battery snapshot for a fresh native power-up')
    parser.add_argument('--menu-only',action='store_true',help='Capture only the level-one list, then Undo')
    parser.add_argument('--no-dsp',action='store_true',help='Skip DSP execution; do not claim audio coverage')
    source_names=('capture_emulator.py','profile_emulator.py','history_emulator.py','stress_emulator.py','ownership.c','ownership.h','exercise_emulator.py','unit.s','engine.c','engine.h','ui.c','ui.h','native.c','font.c','font.h','runtime.json','manifest.py')
    source_hashes={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in source_names}
    args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=False)
    if ROOT==out or ROOT in out.parents:raise ValueError('Use private output outside the repository')
    usb=load('psl_usb',ROOT/'sdk/machines/octatrack/elekloader/verify_vendor_usb.py')
    lcd=load('psl_lcd',ROOT/'sdk/octabam/tools/emu/lcd_view.py')
    lcd.ON=(240,240,240);lcd.OFF=(24,24,24)
    card=out/'card.private.img';shutil.copyfile(args.card,card)
    plane=out/'lcd.private.bin';sock=out/'usb.sock'
    command=[str(args.emulator),'--image',str(args.base/'MAIN.raw'),'--card',str(card),
        '--mount','--set','BEATLAB','--project','PROJECT 261023','--load-ms','30000','--load-early',
        '--dsp','--frame','--ms','3000','--interactive','--main-level','off','--rtc','host','--mkii',
        '--usb-host',str(sock),'--lcd',str(plane)]
    if args.stress_save or args.history:args.exercise=True
    if args.stress_save or args.history or args.keep or args.boot_auto:command.append('--card-rw')
    if args.boot_auto and not args.cs1_in:raise ValueError('--boot-auto requires battery state')
    if args.no_dsp:command.remove('--dsp')
    if args.cs1_in:
        command.remove('--load-early');command.extend(['--cs1-in',str(args.cs1_in),'--boot-load'])
    profile_symbols=json.loads(args.profile_symbols.read_text()) if args.profile_symbols else None
    port=Port(command,out)
    bench=None
    port.profile_symbols=profile_symbols
    try:
        port.reply(b'ready ',timeout=300);print('Emulator booted',flush=True)
        port.command('pace on');bench=usb.bench.Bench(str(sock),timeout=60)
        usb.bench.enumerate_device(bench,True);submit=usb.Submitter(bench)
        status=usb.status(submit.exchange(usb.frame(0)));session=status['session'];base=status['base']
        def request(command,body=b'',transaction=1):
            raw=b'MWUP'+struct.pack('>HHII',1,command,transaction,len(body))+session+body
            reply=usb.status(submit.exchange(raw))
            if reply['result'] not in (0,11,12):raise RuntimeError('USB refusal: '+str(reply['result']))
            return reply
        package=args.package.read_bytes();package_hash=hashlib.sha256(package).hexdigest()
        kept=bool(args.boot_auto)
        if args.boot_auto:
            assert status['phase']==0, 'saved-set startup not normal'
            # An upload here would forget history, hiding a broken boot test.
            assert port.peek(0x40040ee0,2)==b'\x4e\xf9', 'automatic module restore absent'
        else:
            request(1,transaction=0)
            request(2,bytes.fromhex(base)+bytes.fromhex(package_hash)+struct.pack('>II',status['generation'],len(package)))
            for at in range(0,len(package),4096):request(3,struct.pack('>I',at)+package[at:at+4096])
            request(4);status=request(5)
            while status['result']==12:time.sleep(.025);status=request(5)
            assert status['phase']==4;status=request(9);assert status['phase']==5
            if args.stress_save or args.history or args.keep:
                # No physical USB surface is available to this process.
                request(1,transaction=0);request(6);status=request(9)
                assert status['phase']==0;kept=True
        def upload_kept(data,transaction):
            request(1,transaction=0);now=request(0,transaction=0)
            digest=hashlib.sha256(data).digest()
            request(2,bytes.fromhex(base)+digest+struct.pack('>II',now['generation'],len(data)),transaction=transaction)
            for at in range(0,len(data),4096):request(3,struct.pack('>I',at)+data[at:at+4096],transaction=transaction)
            request(4,transaction=transaction);done=request(5,transaction=transaction)
            while done['result']==12:time.sleep(.025);done=request(5,transaction=transaction)
            assert done['phase']==4;done=request(9,transaction=transaction);assert done['phase']==5
            request(1,transaction=0);request(6,transaction=transaction)
            assert request(9,transaction=transaction)['phase']==0
        if args.history:
            target_id=int.from_bytes(package[28:32],'big')
            removal=struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,target_id)
            def detach_target():
                port.command('pace on');upload_kept(removal,5);port.command('pace off')
            def attach_target():
                port.command('pace on');upload_kept(package,6);port.command('pace off')
            port.detach_target=detach_target;port.attach_target=attach_target
        companion=None
        if args.companion:
            if not kept:raise ValueError('--companion requires disposable Keep')
            companion=args.companion.read_bytes()
            def install_companion():
                port.command('pace on');upload_kept(companion,3);port.command('pace off')
            port.install_companion=install_companion
        print('Experimental package installed in emulator; disposable Keep='+str(kept),flush=True)
        port.command('pace off')
        elapsed=0
        def run(ms):
            nonlocal elapsed
            reply=port.command('run '+str(ms));elapsed+=ms
            if 'stop=time' not in reply:raise RuntimeError('Emulator stopped unexpectedly: '+reply)
            if elapsed>=600:
                port.command('pace on');assert request(0,transaction=0)['phase']==(0 if kept else 5)
                port.command('pace off');elapsed=0
        def tap(row,mask):
            port.command(f'key {row:#x} {mask}');run(80)
            port.command(f'key {row:#x} 0');run(80)
        def key(name):tap(*{'UP':(0x26,8),'DOWN':(0x24,1),'YES':(0x26,2),'NO':(0x26,4),'LEFT':(0x26,16),'RIGHT':(0x24,2)}[name])
        def encoder(n,delta):
            port.command(f'knob {0x30|n:#x} {delta&255}');run(160)
        captures=[]
        def capture(name):
            run(120)
            # The exported stock page/windows precede core draw hooks. Capture
            # the actual final LCD transfer buffer, including module UI.
            address=int.from_bytes(port.peek(0x400b9710,4),'big')
            frame=port.peek(address,1024)
            if name!='popup-closed.png':
                bottom=60 if name.endswith('-result.png') or name in ('part-edit.png','lock-menu-row.png','both-menu-actions.png') else 63
                marker=1<<(bottom%8)
                for _ in range(100):
                    if frame[121*8+7-bottom//8]&marker:break # final border pixel
                    run(1);frame=port.peek(address,1024)
                else:raise RuntimeError('No completed popup draw in capture bound')
            lcd.png(lcd.pixels(frame),str(out/name),6);captures.append(name)
        checks={}
        if args.exercise:
            exercise=load('psl_exercise',Path(__file__).with_name('history_emulator.py' if args.history else 'stress_emulator.py' if args.stress_save else 'exercise_emulator.py'))
            key('NO');key('NO')
            checks=exercise.exercise(port,run,tap,key,encoder,capture,out,bool(args.cs1_in))
        else:
            # Only native UART panel gestures: FUNC + PART on the MKII matrix.
            key('NO');key('NO')
            # Two ordinary machine assignments on the copied emulator project:
            # T3 THRU and T7 NEIGHBOR demonstrate visible disabled track cells.
            if not args.menu_only:
                for track,choice in ((2,2),(6,3)):
                    tap(0x22,1<<track)
                    port.command('key 0x25 32');run(80);tap(0x24,4)
                    port.command('key 0x25 0');run(80)
                    for _ in range(10):key('UP')
                    for _ in range(choice):key('DOWN')
                    key('YES');key('NO')
            tap(0x22,1)

            port.command('key 0x25 32');run(80);tap(0x23,32)
            port.command('key 0x25 0');run(80)
            capture('part-edit.png')
            for _ in range(4):key('DOWN')
            capture('lock-menu-row.png');key('DOWN');capture('both-menu-actions.png');key('UP')
            if not args.menu_only:
                key('YES');capture('lock-tracks.png')
                encoder(0,4);capture('lock-selected.png')
                key('DOWN');key('RIGHT');encoder(1,-4);capture('lock-individual.png')
                key('YES');capture('lock-confirm.png');key('NO');capture('lock-back-level2.png');key('NO')
                capture('popup-closed.png')
                port.command('key 0x25 32');run(80);tap(0x23,32)
                port.command('key 0x25 0');run(80)
                for _ in range(5):key('DOWN')
                key('YES');capture('clear-tracks.png');encoder(0,4)
                capture('clear-retain-default.png');key('YES');capture('clear-confirm.png');key('NO');key('NO')
            else:key('NO')
        port.command('pace on');request(1,transaction=0)
        if kept:
            # ABI 4 empty package with the exact live id: normal native
            # removal, not a code poke or a firmware reflash.
            module_id=int.from_bytes(package[28:32],'big')
            removal=struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,module_id)
            remove_hash=hashlib.sha256(removal).digest();now=request(0,transaction=0)
            request(2,bytes.fromhex(base)+remove_hash+struct.pack('>II',now['generation'],len(removal)),transaction=10)
            request(3,struct.pack('>I',0)+removal,transaction=10);request(4,transaction=10);status=request(5,transaction=10)
            while status['result']==12:time.sleep(.025);status=request(5,transaction=10)
            assert status['phase']==4;request(6,transaction=10);status=request(9,transaction=10)
            assert status['phase']==0 and status['known']==1
        else:
            status=request(7)
            while status['result']==11:time.sleep(.025);status=request(7)
            assert status['result']==0 and status['known']==1
        if args.exercise and hasattr(exercise,'after_undo'):
            port.command('pace off');checks.update(exercise.after_undo(port,out))
        if companion:
            for address in (0x40094296,0x40096eb2):
                assert port.peek(address,2)==b'\x4e\xf9','companion patch lost on target removal'
            module_id=int.from_bytes(companion[28:32],'big')
            removal=struct.pack('>4sHH6I',b'MWRM',4,0,0,0,0,0,0,module_id)
            port.command('pace on');upload_kept(removal,11);port.command('pace off')
            checks['companionPreservedOnTargetRemoval']=True
            checks['companionRemoved']=True
        reply=port.command('run 250')
        assert 'stop=time' in reply, 'runtime failed after Undo'
        assert source_hashes=={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in source_names}, 'source changed during emulator run'
        (out/'capture.json').write_text(json.dumps({'hardware':False,'scope':'Actual MKII emulator, native edits with panel input and a labelled stock-writer test injection' if args.exercise else 'Actual MKII emulator UI capture',
            'base':base,'packageSha256':package_hash,'emulatorSha256':hashlib.sha256(args.emulator.read_bytes()).hexdigest(),
            'profileSymbols':port.profile_symbols,'companionSha256':hashlib.sha256(companion).hexdigest() if companion else None,'captures':captures,'usbUndo':not kept,'disposableEmulatorKeep':kept,'usbRemoval':kept,'sampleLockWritesEnabled':True,'checks':checks,'automaticSavedSetRestore':args.boot_auto,'freshProcessBatteryBoot':bool(args.cs1_in),'dspExecution':not args.no_dsp,
            'captureBuffer':'Final LCD transfer buffer read through the emulator; includes core draw hooks',
            'sources':source_hashes
            },indent=2)+'\n')
        print('Captured '+', '.join(captures)+('; emulator removal passed' if kept else '; emulator Undo passed'),flush=True)
    finally:
        if bench:
            try:bench.close()
            except AttributeError:pass
        port.close()

if __name__=='__main__':main()
