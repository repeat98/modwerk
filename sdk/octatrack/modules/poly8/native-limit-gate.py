#!/usr/bin/env python3
from pathlib import Path
import json,subprocess,argparse
parser=argparse.ArgumentParser(description='Native single-instance modal and battery-RAM export gate; outputs stay private.');parser.add_argument('work',type=Path);w=parser.parse_args().work.resolve();sym={r[2]:int(r[0],16) for l in (w/'final-symbols.txt').read_text().splitlines() if len(r:=l.split())==3}
cmd=[str(w/'ot_emu_warm'),'--image','out/mainos_bus.bin','--card',str(w/'fresh.img'),'--mount','--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--interactive','--lcd',str(w/'limit-lcd.bin')]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1);log=(w/'limit-protocol.log').open('w');report={};rows=[0]*8

def until(pre):
 while True:
  l=p.stdout.readline();log.write(l);log.flush()
  if not l:raise RuntimeError('emulator ended')
  if l.startswith(pre):return l.strip()
def send(c,pre='ok'):
 log.write('> '+c+'\n');log.flush();p.stdin.write(c+'\n');p.stdin.flush();return until(pre)
def peek(a,n):return bytes.fromhex(send(f'peek {a:#x} {n}','peek ')[5:])
def run(ms):
 r=send(f'run {ms}');assert 'stop=time' in r,r

def key(k,on):
 r=k//8;b=1<<(k%8);rows[r]=rows[r]|b if on else rows[r]&~b;send(f'key {0x20+r:#x} {rows[r]:#x}')
def tap(k):key(k,1);run(70);key(k,0);run(100)
def dump(a,n,path):(w/path).write_bytes(b''.join(peek(a+i,min(4096,n-i)) for i in range(0,n,4096)))
def screen(name):dump(0x46c7e0ea,1024,name+'.page');data=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)+b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096));(w/(name+'.lcd')).write_bytes(data)
def assign_setup():
 key(45,1);run(50);tap(34);key(45,0);run(100)
 for _ in range(4):tap(32)
 tap(49);run(200)
try:
 until('ready ');send('frame on');run(100);tap(49)
 send('watch '+','.join(hex(sym[n]) for n in ['pm_src_commit','pm_src_commit2','pm_main_commit']))
 assign_setup();assert peek(0x40170f9c,3)==peek(0x100a4f0a,3)==b'PL\x01'
 tap(49);tap(50);tap(50);tap(34)
 before=b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096))
 tap(17);assign_setup();screen('second-poly-setup')
 report['src_modal']=peek(0x460d1e70,4).hex();report['timeout']=peek(0x460d1e6c,4).hex()
 assert report['src_modal']!='00000000' and report['timeout']=='00000000'
 assert peek(0x40170f9c,3)==b'PL\x01' and peek(0x40170f9c+30,3)==bytes(3)
 after=b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096));assert before==after,'refusal changed Part'
 run(2000);assert peek(0x460d1e70,4)!=bytes(4),'modal timed out'
 tap(50);assert peek(0x460d1e70,4)==bytes(4),'modal failed to dismiss'
 tap(50);tap(34)
 # Stock machine/sample chooser entered by double TRACK.
 tap(17);tap(17);run(200);tap(52);run(100)
 for _ in range(4):tap(32)
 tap(49);run(200);screen('second-poly-chooser')
 report['chooser_modal']=peek(0x460d1e70,4).hex()
 assert report['chooser_modal']!='00000000'
 after=b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096));assert before==after,'chooser refusal changed Part'
 tap(50);tap(50);tap(50);tap(16)
 report['commit_hits']=send('hits','hits ');send('watch off')
 report['marker']=peek(0x40170f9c,3).hex();report['mirror']=peek(0x100a4f0a,3).hex();report['loop']=peek(0x40171140,1).hex()
 dump(0x10000000,1048576,'t03-sram.bin');dump(0x40170f60,6322,'t03-assigned-part.bin')
 send('quit');p.wait(timeout=30)
finally:
 (w/'limit-report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if p.poll() is None:p.kill()
print(json.dumps(report,indent=2))
