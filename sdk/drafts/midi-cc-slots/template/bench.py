"""Private native bench; no hardware transport and no parameter/name injection."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import selectors
import struct
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE.parent))
import emulator_fixture


class Bench:
    def __init__(self,emulator,stock,build,card,output,project='TRIAL',origin=0x47e00000):
        self.out=Path(output);self.out.mkdir(parents=True,exist_ok=False)
        self.symbols=json.loads((Path(build)/'symbols.json').read_text())['symbols'];self.origin=origin
        self.fixture=emulator_fixture.load(Path(build)/f'reconstruction/fixture-{origin:x}.private.json',Path(stock).read_bytes())
        self.log=[];self.rows=[0]*8;self.pending=b''
        self.port=subprocess.Popen([str(emulator),'--image',str(stock),'--mkii','--boot-logo','--ms','4000','--interactive','--internal-clock','--rtc','off','--main-level','off','--card',str(card),'--card-rw','--mount','--set','TEST','--project',project,'--lcd',str(self.out/'lcd.bin')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(self.out/'stderr.log').open('wb'))
        self.selector=selectors.DefaultSelector();self.selector.register(self.port.stdout,selectors.EVENT_READ)
        self.response(b'ready ')
        emulator_fixture.publish(self.fixture,self.cmd,self.read)
        # The private image has no runtime registry. Supply the base's normal
        # UI-tick callback; the package itself contains the real key/site hooks.
        at=origin+0x10000
        source='''.text
 jsr 0x4005213c
 jsr 0x4007e940
 lea %sp@(-16),%sp
 moveml %d0-%d1/%a0-%a1,%sp@
 clrl %sp@-
 jsr TICK
 addql #4,%sp
 moveml %sp@,%d0-%d1/%a0-%a1
 lea %sp@(16),%sp
 jmp 0x40052228
'''.replace('TICK',hex(origin+self.symbols['mm_profile_tick']))
        (self.out/'tick.s').write_text(source)
        subprocess.run(['m68k-elf-as','-mcpu=54455','-o',str(self.out/'tick.o'),str(self.out/'tick.s')],check=True)
        subprocess.run(['m68k-elf-ld','-Ttext',hex(at),'-o',str(self.out/'tick.elf'),str(self.out/'tick.o')],check=True,capture_output=True)
        subprocess.run(['m68k-elf-objcopy','-O','binary',str(self.out/'tick.elf'),str(self.out/'tick.bin')],check=True)
        shim=(self.out/'tick.bin').read_bytes();assert not any(self.read(at,len(shim)))
        self.cmd(f'poke {hex(at)} '+shim.hex());self.cmd('poke 0x4005221e '+struct.pack('>HIHH',0x4ef9,at,0x4e71,0x4e71).hex())
        # Private emulator fixture for the documented first-sector IRQ race
        # (TRAPS.md#trap-first-sector-irq). This is not part of the package.
        # Retain SR until after sector bookkeeping, then replay stock's return.
        stock_bytes=Path(stock).read_bytes()
        saved=stock_bytes[0x148f2:0x148f4];epilogue=stock_bytes[0x14958:0x14960]
        assert hashlib.sha256(saved).hexdigest()=='0c909116348ee4ce8d492f320764690dd3fd1c1e9ff996ab032ad36c49791171'
        assert hashlib.sha256(epilogue).hexdigest()=='06a71fd5f5432f683af9fd0d67b79482e795b56b944198f76b531e9d906a4f01'
        assert self.read(0x40014cf2,2)==saved and self.read(0x40014d58,8)==epilogue
        guard_at=origin+0x10100
        assert not any(self.read(guard_at,10))
        self.cmd(f'poke {hex(guard_at)} 46c3'+epilogue.hex())
        self.cmd('poke 0x40014cf2 3600')
        self.cmd('poke 0x40014d58 '+struct.pack('>HIH',0x4ef9,guard_at,0x4e71).hex())
        (self.out/'ata-fixture.json').write_text(json.dumps({'kind':'private first-sector IRQ timing fixture','stockSha256':hashlib.sha256(stock_bytes).hexdigest(),'savedSrSiteSha256':hashlib.sha256(saved).hexdigest(),'epilogueSha256':hashlib.sha256(epilogue).hexdigest(),'packageIncludesThis':False},indent=2)+'\n')
        self.press(0x32);self.press(0x31);self.run(500)
        if not any(self.read(0x80000012,4)):self.press(0x35)
        self.press(0x22);self.run(1500)

    def response(self,prefix):
        until=time.monotonic()+180
        while time.monotonic()<until:
            while b'\n' in self.pending:
                line,self.pending=self.pending.split(b'\n',1)
                if line.startswith(prefix):return line.decode()
            if self.port.poll() is not None:raise RuntimeError('Emulator exited.')
            if self.selector.select(1):self.pending+=os.read(self.port.stdout.fileno(),65536)
        raise TimeoutError('Native reply timeout.')

    def cmd(self,value):
        self.port.stdin.write((value+'\n').encode());self.port.stdin.flush()
        result=self.response((b'ok',b'peek ',b'card ',b'midi-tx ',b'hits ',b'status ',b'err'))
        self.log.append([value,result]);(self.out/'commands.private.json').write_text(json.dumps(self.log,indent=2)+'\n')
        if result.startswith('err') or ('stop=' in result and 'stop=time' not in result):raise RuntimeError(result)
        return result

    def run(self,ms=100):return self.cmd('run '+str(ms))
    def read(self,at,n):return bytes.fromhex(self.cmd(f'peek {hex(at)} {n}').split()[1])
    def number(self,name):return int.from_bytes(self.read(self.origin+self.symbols[name],4),'big')
    def key(self,code,down,ms=50):
        row,bit=code>>3,1<<(code&7);self.rows[row]=self.rows[row]|bit if down else self.rows[row]&~bit
        self.cmd(f'key {32|row} {self.rows[row]}')
        if ms:self.run(ms)
    def press(self,code):self.key(code,True);self.key(code,False)
    def setup(self):
        self.press(0x22);self.run(500)
        for _ in range(6):
            if self.read(0x400bcd14,4)==bytes.fromhex('400bc6b8') and any(self.read(0x400bc6c0,4)):return
            self.press(0x22);self.press(0x22);self.run(150)
        raise AssertionError('MIDI SRC SETUP not active.')
    def text(self,text):
        for _ in range(16):self.press(0x34)
        for i,v in enumerate(text.encode()):
            seen=set();direction=1
            for _ in range(320):
                now=self.read(0x460e743c+i,1)[0]
                if now==v:break
                # Stay within a letter/digit group when both characters are
                # there. The extended punctuation tail does not cycle back to
                # ASCII letters, so blindly incrementing can get trapped.
                groups=[range(65,91),range(97,123),range(48,58)]
                same_group=any(now in group and v in group for group in groups)
                if now in seen:direction=-1
                seen.add(now)
                up=now<v if same_group else direction>0
                self.press(0x33 if up else 0x20)
            else:raise AssertionError('Stock editor character not reached.')
            if i+1<len(text):self.press(0x21)
    def apply(self):
        self.setup();self.key(0x2d,True);self.key(0x3b,True);self.key(0x3b,False,1)
        for _ in range(100):
            if self.number('busy') or self.number('status')==9:break
            self.run(1)
        self.key(0x2d,False,0)
    def rename(self,text):
        self.setup();self.press(0x3d);assert any(self.read(0x460e7612,4))
        self.text(text);self.press(0x31);self.run(1500)
    def channel(self,want):
        self.setup()
        for _ in range(40):
            now=int.from_bytes(self.read(0x460d5cb4,4),'big')
            if now==want:break
            self.cmd(f'knob 48 {4 if now<want else -4}');self.run()
        else:raise AssertionError('Stock channel not reached.')
        self.press(0x31);self.run(100)
    def save_project(self):
        self.press(0x32);self.key(0x2d,True);self.press(0x1c);self.key(0x2d,False)
        # A full first save creates both copies of all sixteen banks. Allow
        # that native operation to finish before sending further panel keys.
        for _ in range(90):
            self.run(5000);self.press(0x31)
            self.press(0x22);self.run(500);self.press(0x22);self.press(0x22);self.run(150)
            if self.read(0x400bcd14,4)==bytes.fromhex('400bc6b8') and any(self.read(0x400bc6c0,4)):return
        raise AssertionError('Native project save did not release the panel.')
    def bank(self,index):
        self.press(0x32);self.key(0x2f,True);self.press(index);self.key(0x2f,False);self.press(0);self.run(100)
        assert self.read(0x100b14ce,1)==bytes([index])
    def channels(self):
        base=int.from_bytes(self.read(0x46c82456,4),'big');part=self.read(0x100b14cf,1)[0]
        return bytes(self.read(base+0x8f262+part*6322+t*36,1)[0] for t in range(8))
    def name(self):
        bank=self.read(0x100b14ce,1)[0]
        at=self.origin+self.symbols['names_store'] if not bank else self.origin+self.symbols['state']+(bank-1)*128
        return self.read(at,16).split(b'\0',1)[0]
    def close(self):
        if self.port.poll() is None:
            self.port.stdin.write(b'quit\n');self.port.stdin.flush()
            try:self.port.wait(timeout=10)
            except subprocess.TimeoutExpired:self.port.kill();self.port.wait()
        self.selector.close()


def card_tools():
    spec=importlib.util.spec_from_file_location('template_card_tools',ROOT/'sdk/octabam/tools/emu/emu_card.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
