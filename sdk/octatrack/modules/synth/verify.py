#!/usr/bin/env python3
"""FM Synth native Part smoke: retain summaries only, never firmware/RAM/card bytes."""
import argparse, hashlib, importlib.util, json, os, selectors, struct
import subprocess, tempfile, time
from pathlib import Path

BASE=Path(__file__).resolve().parent
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj

class Port:
    def __init__(self,command,cwd):
        self.process=subprocess.Popen(command,cwd=cwd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            env={k:v for k,v in os.environ.items() if not k.startswith('OT_')})
        self.poll=selectors.DefaultSelector();self.poll.register(self.process.stdout,selectors.EVENT_READ)
        self.pending=b'';self.rows=[0]*8;self.reply((b'ready ',))
    def reply(self,prefixes):
        deadline=time.monotonic()+120
        while True:
            while b'\n' in self.pending:
                line,self.pending=self.pending.split(b'\n',1)
                if line.startswith(prefixes):
                    if line.startswith(b'err'):raise RuntimeError(line.decode())
                    return line.decode()
            if time.monotonic()>deadline or self.process.poll() is not None:raise RuntimeError('Emulator stopped or timed out')
            if self.poll.select(timeout=1):
                data=os.read(self.process.stdout.fileno(),65536)
                if not data:raise RuntimeError('Emulator exited')
                self.pending+=data
    def send(self,line,prefix=b'ok'):
        self.process.stdin.write((line+'\n').encode());self.process.stdin.flush()
        answer=self.reply((prefix,b'err'))
        if line.startswith('run ') and 'stop=time' not in answer:raise RuntimeError('Emulator did not complete panel action')
        return answer
    def run(self,ms):self.send('run '+str(ms))
    def press(self,*keys):
        codes={'FUNC':0x2d,'SRC':0x22,'AMP':0x23,'LFO':0x24,'YES':0x31,'NO':0x32,'UP':0x33,'DOWN':0x20,'STOP':0x27,'PLAY':0x28,'REC':0x29,
               **{'T'+str(i+1):0x10+i for i in range(8)},**{'TRIG'+str(i+1):i for i in range(16)}}
        for names,down in [(keys,True),(reversed(keys),False)]:
            for name in names:
                c=codes[name];r=c>>3;b=1<<(c&7)
                self.rows[r]=(self.rows[r]|b) if down else (self.rows[r]&~b)
                self.send(f'key {0x20|r} {self.rows[r]}');self.run(50)
    def knob(self,name,delta):
        self.send(f'knob {0x30+"ABCDEF".index(name)} {delta&255}');self.run(200)
    def peek(self,addr,n):return bytes.fromhex(self.send(f'peek {addr} {n}',b'peek ')[5:])
    def close(self):
        try:self.send('quit');self.process.wait(timeout=10)
        finally:
            if self.process.poll() is None:self.process.terminate();self.process.wait(timeout=10)
            self.poll.close()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--emulator',type=Path,required=True)
    p.add_argument('--image',type=Path,required=True)
    p.add_argument('--image-sha256',required=True)
    p.add_argument('--sdk',type=Path,required=True)
    a=p.parse_args()
    image=a.image.resolve()
    assert hashlib.sha256(image.read_bytes()).hexdigest()==a.image_sha256
    codec=module('card',a.sdk.resolve()/'tools/emu/emu_card.py')
    report={'imageSha256':a.image_sha256,'checks':{},'limitations':['Panel smoke only; Empty-card storage/UI smoke; audio is tested separately in Octemu. No cycle, hardware, file persistence or maximum-load qualification.']}
    with tempfile.TemporaryDirectory(prefix='fm-smoke.') as tmp:
        w=Path(tmp);tree=w/'tree';tree.mkdir();card=w/'card.img';card.write_bytes(codec.build_image(str(tree),32))
        port=Port([str(a.emulator.resolve()),'--image',str(image),'--card',str(card),'--dsp','--frame','--ms','3000','--interactive','--rtc','host','--mkii','--main-level','64'],w)
        try:
            port.run(3000);port.press('YES');port.run(2000);port.press('NO')
            bank=int.from_bytes(port.peek(0x46c82456,4),'big');idx=port.peek(0x100b14cf,1)[0]&3
            part=bank+0x8ed80+idx*6322;shadow=0x100a4ece+idx*6322
            slots=port.peek(bank+idx*6322+0x8f04a,40)
            for t in range(8):
                port.press('T'+str(t+1));port.press('FUNC','SRC')
                for _ in range(5):port.press('DOWN')
                port.press('YES');port.press('SRC')
                assert port.peek(part+0x22+t,1)==bytes([1]),'Machine byte'
                assert port.peek(part+60+t*30,3)==b'FM\x01','FM Part signature'
                assert port.peek(shadow+60+t*30,3)==b'FM\x01','FM shadow signature'
                assert port.peek(part+0x30+t*30,6)==bytes([64,12,32,64,0,40]),'FM defaults'
                print(f'Panel selection/readback passed on T{t+1}',flush=True)
            assert port.peek(bank+idx*6322+0x8f04a,40)==slots,'Sample slots changed'
            report['checks']['eightTrackSelection']='passed';report['checks']['sampleSlotsUnchanged']='passed';report['checks']['partAndShadowSignature']='passed'
            port.press('T1');port.press('SRC');port.knob('C',13)
            value=port.peek(part+0x32,1)
            port.press('FUNC','SRC');port.press('YES');port.press('SRC')
            assert port.peek(part+0x32,1)==value,'Reselect reset controls'
            report['checks']['reselectPreservesControls']='passed'
            # Return to FLEX via the same machine selector; clear only our signature.
            port.press('FUNC','SRC')
            for _ in range(4):port.press('UP')
            port.press('YES');port.press('SRC')
            assert port.peek(part+60,3)==b'\0\0\0','Stock transition signature'
            assert port.peek(part+0x22,1)==bytes([1]),'Return to FLEX'
            assert port.peek(bank+idx*6322+0x8f04a,40)==slots,'Stock transition slots'
            report['checks']['returnToFlex']='passed'
        finally:port.close()
    a.output.write_text(json.dumps(report,indent=2)+'\n')
    assert all(v=='passed' for v in report['checks'].values()),'Native smoke incomplete; see sanitized report'

if __name__=='__main__':main()
