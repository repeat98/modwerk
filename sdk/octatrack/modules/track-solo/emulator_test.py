#!/usr/bin/env python3
"""Compiled ColdFire + real stock-level-routine regression, without hardware.

Supply a private unpacked OS 1.40C MAIN, the generated runtime package, the
standard link_units symbol map, and ot_emu. No stock bytes enter this folder.
This is an isolated routine test: direct calls, synthetic gain inputs, no DSP
audio and no project persistence claim. Logs stay in the private output dir.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import re
import tempfile

BASE, API, LEVELS = 0x47400000, 0x47020000, 0x47021000
MUTE, SOLO_FLAG = 0x80000008, 0x80000037

def assert_frame_progress(log_path):
    """DSP tests may borrow main briefly, but may never lose the frame chain."""
    last_frames=None;last_progress=0;observations=0
    with Path(log_path).open() as lines:
        for line in lines:
            if not line.startswith('ok sample='):continue
            match=re.search(r'sample=([\d.]+) frames=(\d+)',line)
            if not match:continue
            sample,frames=float(match[1]),int(match[2]);observations+=1
            if last_frames is None or frames>last_frames:
                last_progress=sample
            else:
                assert frames==last_frames, 'frame count went backwards'
                assert sample-last_progress<=44100, ('DSP frame chain stopped for over one simulated second',frames)
            last_frames=frames
    assert observations and last_frames, 'no frame progress evidence'
    return observations

def packet_image(data, base=BASE, expected_sites=7):
    assert data[:4] == b'MWRM' and int.from_bytes(data[4:6], 'big') == 8
    image_len, bss, reloc_count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    assert bss == 0 and (expected_sites is None or sites == expected_sites)
    start = 76 + hooks * 4
    image = bytearray(data[start:start+image_len])
    offsets = struct.unpack_from('>%dI' % reloc_count, data, start+image_len)
    for at in offsets:
        struct.pack_into('>I', image, at, struct.unpack_from('>I', image, at)[0] + base)
    return image

class Emulator:
    def __init__(self, binary, image, out, extra=()):
        self.log = (out/'emulator.private.log').open('w')
        self.err = (out/'emulator-stderr.private.log').open('w')
        self.p = subprocess.Popen([str(binary), '--image', str(image), '--mkii',
            '--periph', '--interactive', '--ms', '1000', '--max', '500000000', *map(str,extra)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.err,
            text=True, bufsize=1)
        self.project_loaded = False
        self.call_ready = False
        self.call_stack = None
        self.call_count = 0
        while True:
            line = self.p.stdout.readline()
            if not line: raise RuntimeError('Emulator exited during boot')
            self.log.write(line)
            self.log.flush()
            if 'load run ended: LOAD PROJECT handled' in line:
                self.project_loaded = True
            if line.startswith('ready '): break
    def command(self, command):
        self.p.stdin.write(command+'\n'); self.p.stdin.flush()
        while True:
            line = self.p.stdout.readline()
            if not line: raise RuntimeError('Emulator exited during '+command.split()[0])
            self.log.write(line); self.log.flush()
            if line.startswith(('ok', 'peek ', 'audio ', 'tx ', 'card ', 'writes ', 'hits ', 'status ', 'err ')):
                if line.startswith('err '): raise RuntimeError(line.strip())
                return line.strip()
    def read(self, at, size): return bytes.fromhex(self.command(f'peek {at:#x} {size}').split()[1])
    def write(self, at, data): self.command(f'poke {at:#x} {data.hex()}')
    def u32(self, at, value): self.write(at, struct.pack('>I',value))
    def call(self, at, *args):
        assert len(args)<=8, 'fixture supports at most eight native arguments'
        if not self.call_ready:
            # Fixed code and a separate data block: no rewritten-code/JIT trap.
            with tempfile.TemporaryDirectory() as tmp:
                obj=Path(tmp)/'call.o';binary=Path(tmp)/'call.bin'
                subprocess.run(['m68k-elf-as','-mcpu=54455',str(Path(__file__).with_name('fixture_call.s')),'-o',str(obj)],check=True)
                subprocess.run(['m68k-elf-ld','-Ttext=0x4702f000','--oformat=binary',str(obj),'-o',str(binary)],check=True,capture_output=True)
                self.write(0x4702f000,binary.read_bytes())
            self.call_ready=True
        values=[at,*args,*([0]*(8-len(args)))]
        self.write(0x4702f100,struct.pack('>9I',*(v&0xffffffff for v in values)))
        reply=self.command('call 0x4702f000')
        before,after=struct.unpack('>II',self.read(0x4702f140,8))
        assert before==after, ('native fixture callee unbalanced its stack',hex(at),before,after)
        if self.call_stack is None:self.call_stack=before
        assert before==self.call_stack, 'debugger calls leaked caller argument slots'
        self.call_count+=1
        return int(reply.split('d0=')[1],0)
    def close(self):
        self.p.stdin.write('quit\n'); self.p.stdin.flush()
        self.p.communicate(timeout=20)
        self.log.close(); self.err.close()

def run(args):
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    sym=json.loads(args.symbols.read_text())
    data=args.package.read_bytes();image=packet_image(data)
    emu=Emulator(args.emulator,args.stock_main,out)
    checks=0
    try:
        emu.write(BASE,image)
        def call(name,*values): return emu.call(BASE+sym[name],*values)
        def overlay(): return int.from_bytes(emu.read(BASE+sym['ts_overlay'],4),'big')
        def tick(n=1):
            for _ in range(n): call('ts_tick',API)
        held=0
        def key(t,down=1):
            nonlocal held
            held = held | (1<<t) if down else held & ~(1<<t)
            emu.write(0x46100b1a,bytes([held]))
            return call('ts_key',0x10+t,down)
        emu.u32(0x80000012,0);emu.u32(0x460d175c,0)
        label=call('ts_get');assert emu.read(label,5)==b'HOLD\0'  # HOLD on install
        call('ts_set',-1,0);tick()
        key(1);tick(150);assert overlay()==0;key(1,0);tick()
        call('ts_set',1,0);tick()
        for anchor in range(8):
            assert key(anchor)==0;tick(29);assert overlay()==0
            tick();assert overlay()==1<<anchor
            other=(anchor+1)%8
            assert key(other)==1 and overlay()==(1<<anchor|1<<other)
            assert key(other)==1 and key(other,0)==1
            assert key(other)==1 and overlay()==1<<anchor
            assert key(anchor,0)==1 and overlay()==0
            assert key(other,0)==1;tick()
            checks+=1
        # The real getter adapter must return d0 pointing to the correct label.
        label=call('ts_get');assert emu.read(label,5)==b'HOLD\0'
        call('ts_set',-1,0)
        label=call('ts_get');assert emu.read(label,4)==b'OFF\0'
        checks+=1
        call('ts_set',1,0);tick();key(0);tick(30);assert overlay()==1
        emu.write(0x46100b1a,b'\0')  # lost release: no ts_key callback
        tick();assert overlay()==0
        held=0;tick(2)
        key(0);tick(30);assert overlay()==1  # re-arm without the lost callback
        key(0,0);tick()
        checks+=1

        # The compiled scope surrounds the actual stock level routine. Full
        # interrupt entry/exit and companion gates are tested separately with
        # real frames and DSP, rather than modelled here.
        def levels(word,flag,mask,patched):
            emu.u32(BASE+sym['ts_overlay'],mask)
            emu.u32(MUTE,word);emu.write(SOLO_FLAG,bytes([flag]))
            emu.u32(0x80003c10,LEVELS)
            emu.write(0x80000c60,struct.pack('>16H',*[0x1100+257*t for t in range(16)]))
            emu.write(0x80000c80,struct.pack('>8H',*[0x3000+t for t in range(8)]))
            emu.write(0x8000485a,bytes(64))
            emu.u32(0x8000009c,0)  # stock CUE MUTES TRACK off
            if patched:
                call('ts_scope_begin')
                expected=(word&0xffff0000)|mask if mask else word
                assert int.from_bytes(emu.read(MUTE,4),'big')==expected
            emu.call(0x40004db8)
            if patched:
                call('ts_scope_end')
                assert int.from_bytes(emu.read(BASE+sym['ts_frame_active'],4),'big')==0
            assert int.from_bytes(emu.read(MUTE,4),'big')==word
            assert emu.read(SOLO_FLAG,1)==bytes([flag])
            return emu.read(LEVELS,64)
        for flag in (0,1):
            for mask in range(1,256):
                expected=levels(0x550000|mask,flag,0,False)
                # Pre-existing mutes and solos are intentionally unrelated.
                word=0x55a581
                actual=levels(word,flag,mask,True)
                assert actual==expected,(flag,mask)
                checks+=1
            for word in (0,0x5500,0xff00,0x0042,0xff81):
                assert levels(word,flag,0,True)==levels(word,flag,0,False)
                checks+=1
        # Removing the overlay while active returns the exact original output.
        baseline=levels(0x5500,0,0,False)
        levels(0x5500,0,2,True)
        assert levels(0x5500,0,2,False)==baseline
        checks+=1
        # Even if the published selection changes, an entered scope must
        # restore its own snapshot. A later frame sees a new underlying word.
        for word,mask in ((0x551102,2),(0xaaff81,0xff)):
            emu.u32(MUTE,word);emu.u32(BASE+sym['ts_overlay'],mask)
            call('ts_scope_begin');emu.u32(BASE+sym['ts_overlay'],0)
            call('ts_scope_end');assert int.from_bytes(emu.read(MUTE,4),'big')==word
            checks+=1
        if args.mute_package:
            assert args.mute_symbols, '--mute-package needs its matching symbols'
            mm_base=BASE+0x10000;mm=json.loads(args.mute_symbols.read_text())
            emu.write(mm_base,packet_image(args.mute_package.read_bytes(),mm_base,None))
            emu.write(mm_base+mm['KEYMASK'],b'\0')
            # Execute the unchanged companion's actual voice-bind gate. This
            # is a synthetic routine test, distinct from real DSP playback.
            for mode in range(4):
                emu.u32(0x800000dc,mode)
                for group in range(1,256):
                    emu.u32(MUTE,0x55a581);emu.u32(BASE+sym['ts_overlay'],group)
                    call('ts_scope_begin')
                    for track in range(8):
                        drop=emu.call(mm_base+mm['mm_voice_bind'],track)
                        assert drop==int(mode in (1,2) and not group&(1<<track)), (mode,group,track,drop)
                        checks+=1
                    call('ts_scope_end')
                    assert int.from_bytes(emu.read(MUTE,4),'big')==0x55a581
    finally:
        emu.close()
    report={'result':'passed','checks':checks,'model':'MKII emulator','balancedNativeCalls':emu.call_count,
        'scope':'Compiled gesture/getter code and stock level routine; synthetic inputs; no audio, project or hardware qualification',
        'packageSha256':hashlib.sha256(data).hexdigest(),
        'stockMainSha256':hashlib.sha256(args.stock_main.read_bytes()).hexdigest(),
        'emulatorSha256':hashlib.sha256(args.emulator.read_bytes()).hexdigest()}
    if args.mute_package:report['muteModesSha256']=hashlib.sha256(args.mute_package.read_bytes()).hexdigest()
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','stock-main','package','symbols','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--mute-package',type=Path)
    parser.add_argument('--mute-symbols',type=Path)
    run(parser.parse_args())
