#!/usr/bin/env python3
"""Native four-machine composition gate; all firmware, SRAM and audio stay private."""
from pathlib import Path
import argparse,array,json,subprocess,sys,hashlib,re
p=argparse.ArgumentParser();p.add_argument('work',type=Path);p.add_argument('--image',required=True,type=Path);p.add_argument('--prefix',required=True);p.add_argument('--symbols',type=Path,required=True);a=p.parse_args();w=a.work.resolve();sys.path.insert(0,str(w/'sdk/octabam/tools'));import toolpath,lcd_view
lcd_view.ON=(255,255,255);lcd_view.OFF=(0,0,0)
out=w/a.prefix;out.mkdir(exist_ok=True)
cmd=[str(w/'ot_emu_warm'),'--image',str(a.image.resolve()),'--card',str(w/'fresh.img'),'--mount','--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--interactive']
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1);log=(out/'protocol.log').open('w');report=dict(image_sha256=hashlib.sha256(a.image.read_bytes()).hexdigest());rows=[0]*8;symbols={row[2]:int(row[0],16) for line in a.symbols.read_text().splitlines() if len(row:=line.split())==3}
def until(prefix):
 while True:
  line=proc.stdout.readline()
  if not line:raise RuntimeError('Emulator ended')
  if prefix!='audio ':log.write(line);log.flush()
  if line.startswith('err'):raise RuntimeError(line)
  if line.startswith(prefix):return line.strip()
def send(cmd,prefix='ok'):
 log.write('> '+cmd+'\n');log.flush();proc.stdin.write(cmd+'\n');proc.stdin.flush();return until(prefix)
def peek(at,n):return bytes.fromhex(send(f'peek {at:#x} {n}','peek ')[5:])
def run(ms):
 for step in range(0,ms,250):
  value=send(f'run {min(250,ms-step)} wall 35')
  if 'stop=time' not in value:
   report['failure_cpu']=send('cfstatus','cfstatus ')
   report['failure_status']=send('status','status ')
   raise AssertionError(value)
def key(k,on):
 row=k//8;mask=1<<(k%8);rows[row]=rows[row]|mask if on else rows[row]&~mask;send(f'key {0x20+row:#x} {rows[row]:#x}')
def tap(k):key(k,True);run(50);key(k,False);run(70)
def setup():key(45,True);run(50);tap(34);key(45,False);run(100)
def screen(name):
 raw=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)+b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096));(out/(name+'.lcd')).write_bytes(raw);lcd_view.png(lcd_view.screen(raw),out/(name+'.png'),6)
def loop():return peek(0x40170f60+0x1e0,1)[0]
def capture(label):
 send('audio start main');run(200)
 _,frames,pcm=send('audio read 20000','audio ').split(' ',2)
 samples=array.array('h');samples.frombytes(bytes.fromhex(pcm))
 report[label]={'frames':int(frames),'peak':max(map(abs,samples),default=0)}
 assert int(frames)>=8000 and report[label]['peak']>32,report[label]
 send('audio stop')
def part_bytes():return b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096))
def active_poly():
 return int(peek(0x800049d8+2*168,1)[0]!=0)+sum(peek(symbols['poly_extra_voices']+168*i,1)[0]!=0 for i in range(31))
try:
 until('ready ');send('frame on');run(100);tap(49)
 setup();screen('initial-setup')
 for n in range(7):
  tap(32);run(60);screen('setup-row-'+str(n+2))
 report['cursor']=int.from_bytes(peek(0x460d5c30,4),'big')
 tap(49);run(200);screen('assigned-fm');report['fm_marker']=peek(0x40170f60+0x3c,3).hex()
 tap(50);tap(50);tap(34);setup();screen('reopened-fm-setup')
 tap(50);tap(34);tap(17);setup()
 for _ in range(6):tap(32)
 tap(49);run(200);screen('assigned-vector');report['vector_marker']=peek(0x40170f60+0x3c+30,3).hex()
 tap(50);tap(50);tap(34);tap(18);setup()
 for _ in range(4):tap(32)
 tap(49);run(200);screen('assigned-poly');report['poly_marker']=peek(0x40170f60+0x3c+60,3).hex()
 tap(50);tap(50);tap(34);tap(19);setup()
 for _ in range(5):tap(32)
 tap(49);run(200);screen('assigned-analog-bd');report['analog_bd_marker']=peek(0x40170f60+0x3c+90,3).hex()
 assert report['cursor']==8,report
 assert report['fm_marker']=='464d01',report
 assert report['vector_marker']=='533202',report
 assert report['poly_marker']=='504c01',report
 assert report['analog_bd_marker']=='414201',report
 tap(49);tap(50);tap(50);tap(34)
 # FM double-TRACK reopens the shared chooser on its actual ninth row.
 tap(16);tap(16);run(100);screen('fm-double-track')
 report['fm_double_track_row']=int.from_bytes(peek(0x460e738e,4),'big')
 assert report['fm_double_track_row']==8,report
 tap(50);tap(50);tap(34)
 # Refuse a second POLY8 before mutating any Part state.
 tap(20);before=part_bytes();setup()
 for _ in range(4):tap(32)
 tap(49);run(100);screen('second-poly-modal')
 report['second_poly_modal']=peek(0x460d1e70,4).hex()
 assert report['second_poly_modal']!='00000000',report
 assert before==part_bytes(),'Refusal changed Part state'
 tap(50);assert peek(0x460d1e70,4)==bytes(4)
 report['modal_no_dismissal']='pass'
 tap(50);tap(34);setup()
 for _ in range(4):tap(32)
 tap(49);assert peek(0x460d1e70,4)!=bytes(4)
 run(2500);assert peek(0x460d1e70,4)==bytes(4)
 report['modal_automatic_dismissal']='pass';assert before==part_bytes()
 tap(50);tap(34)
 key(45,True);run(50);tap(32);tap(32);key(45,False);run(100);tap(49)
 assert int.from_bytes(peek(0x460d16f0,4),'big')==1
 for track,label in [(0,'fm_audio'),(1,'vector_audio'),(2,'poly_audio'),(3,'analog_bd_audio')]:
  tap(16+track);key(0,True);capture(label);key(0,False);tap(39)
 # Panel controls establish the originally reported HOLD/REL maximum.
 tap(18);tap(35)
 for _ in range(4):send('knob 0x31 127');send('knob 0x32 127');run(50)
 run(100)
 report['poly_amp']=peek(0x40170f60+0x120+2*24,6).hex()
 assert bytes.fromhex(report['poly_amp'])[1:3]==bytes([127,127]),report
 tap(34);report['stress_start']=send('status','status ');maximum=0
 for i in range(128):
  report['stress_press']=i
  key(i%16,True);run(10);key(i%16,False);run(10)
  if i%16==15:
   n=active_poly();maximum=max(maximum,n);assert n<=8,n
 report['stress_maxactive']=maximum;report['stress_end']=send('status','status ')
 frames=lambda value:int(re.search(r'frames=(\d+)',value)[1])
 assert frames(report['stress_end'])-frames(report['stress_start'])>=7000,report
 tap(39);tap(39)
 report['result']='Four signed machines, shared chooser, isolated audio, second-POLY refusal and 128 rapid panel presses pass; hardware timing remains unqualified' 
 send('quit');proc.wait(timeout=30)

finally:
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if proc.poll() is None:proc.kill()
print(json.dumps(report,indent=2))
