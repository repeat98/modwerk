#!/usr/bin/env python3
"""Native MKII recording/stress gate. Run from the native SDK directory with
private ot_emu, final-symbols.txt and a disposable keys.img in WORK. That card
must start as unsigned FLEX with a loaded sample, AMP HOLD/REL 127.
The gate assigns POLY through SRC SETUP and verifies LOOP OFF and both markers.
Never commit generated card images, firmware, LCD planes or memory dumps.
"""
from pathlib import Path
import json,subprocess,argparse,re
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('work',type=Path)
w=parser.parse_args().work.resolve();sym={r[2]:int(r[0],16) for l in (w/'t06-symbols.txt').read_text().splitlines() if len(r:=l.split())==3}
cmd=[str(w/'ot_emu'),'--image','out/mainos_bus.bin','--card',str(w/'t06-checkpoint.img'),'--card-rw','--mount','--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--interactive','--lcd',str(w/'t06-checkpoint-lcd.bin')]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
log=(w/'t06-checkpoint-protocol.log').open('w')
def until(prefix):
 while True:
  l=p.stdout.readline();log.write(l);log.flush()
  if not l:raise RuntimeError('emulator ended')
  if l.startswith(prefix):return l.strip()
def send(c,prefix='ok'):
 log.write('> '+c+'\n');log.flush();p.stdin.write(c+'\n');p.stdin.flush();return until(prefix)
def peek(a,n):return bytes.fromhex(send(f'peek {a:#x} {n}','peek ')[5:])
rows=[0]*8
report={}
def key(k,down):
 r=k//8;b=1<<(k%8);rows[r]=rows[r]|b if down else rows[r]&~b;send(f'key {0x20+r:#x} {rows[r]:#x}')
def run(ms):
 result=send(f'run {ms}')
 assert 'stop=time' in result,result
 return result
def tap(k):key(k,1);run(50);key(k,0);run(50)
try:
 until('ready ');send('frame on');run(100)
 assert peek(0x40170f60+0x3c,3)==bytes(3), 'Fixture must start without marker'
 report['initial_mode']=int.from_bytes(peek(0x460d16f0,4),'big')
 tap(49) # Dismiss the native SET DATE/TIME startup prompt.
 # Real SRC SETUP assignment from unsigned FLEX, no direct callback or poke.
 key(45,1);run(50);tap(34);key(45,0);run(100)
 for _ in range(4):tap(32)
 tap(49);run(400)
 report['assigned_marker']=peek(0x40170f60+0x3c,3).hex()
 report['assigned_mirror']=peek(0x100a4ece+0x3c,3).hex()
 assert report['assigned_marker']==report['assigned_mirror']=='504c01',report
 tap(49);tap(50);tap(50);tap(34)

 key(45,1);run(50);tap(32);tap(32);key(45,0);run(100);tap(49);run(100)
 report['mode']=int.from_bytes(peek(0x460d16f0,4),'big')
 assert report['mode']==1, 'Not in CHROMATIC mode'
 report['amp']=peek(0x40170f60+0x120,6).hex();report['loop']=peek(0x40170f60+0x1e0,1).hex()
 # Watch the recorder and panel callback; the panel bytes are the real input.
 send('watch '+','.join(hex(sym[n]) for n in ['pm_record_key','poly_chromatic_key']))
 key(41,1);run(100);tap(40);key(41,0);run(100)
 report['live']=peek(0x460d172a,4).hex();report['transport']=peek(0x800065b8,4).hex();report['note_config']=peek(0x8000004c,1).hex()
 for k in [0,1,2,3]:key(k,1);run(10)
 report['guards']={hex(a):peek(a,4).hex() for a in [0x460d1a90,0x460d1a94,0x46c7e956,0x46c7dd26]};report['held']=list(peek(sym['poly_held'],64));report['record_hits']=send('hits','hits ')
 pat=peek(0x400e21e0,2330);(w/'t06-panel-recorded-pattern.bin').write_bytes(pat)
 assert sorted(k for k in report['held'] if k!=255)==[72,73,74,75]
 report['chord_records']=[{'step':i+1,'root':pat[0x59+i*32],'shape':pat[0x59+i*32+30]} for i in range(64) if pat[0x59+i*32+30]<232]
 assert any(r['root']==72 and r['shape']==67 for r in report['chord_records']), 'Four-note capture missing'
 for k in [0,1,2,3]:key(k,0)
 run(300);tap(39)
 send('watch off')
 report['held_after_stop']=list(peek(sym['poly_held'],64))
 assert report['held_after_stop']==[255]*64
 assert report['amp'][2:6]=='7f7f' and report['loop']=='00'
 # Request a real SAVE job after the existing checkpoint backoff.
 now=int.from_bytes(peek(0x460d5de0,4),'big')
 send('poke 0x460d5de0 '+((now+2100)&0xffffffff).to_bytes(4,'big').hex());run(100)
 target=int.from_bytes(peek(sym['octamod_log_retained']+68+12,4),'big')
 tap(28);run(100);tap(49);run(100);tap(32);tap(49);run(200);tap(49);run(2000)
 for _ in range(40):
  if int.from_bytes(peek(sym['octamod_log_retained']+68+24,4),'big')>=target:break
  run(250)
 assert int.from_bytes(peek(sym['octamod_log_retained']+68+24,4),'big')>=target,'SAVE checkpoint did not complete'
 report['checkpoint_target']=target
 data=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)+b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096))
 (w/'t06-save-menu.lcd').write_bytes(data)
 report['card_status']=send('card status','card ')
 h=[int.from_bytes(peek(sym['octamod_log_retained']+68+i*4,4),'big') for i in range(8)]
 report['logger_ring']={'head':h[3],'count':h[4],'flushed':h[6]}
 report['image_sha256']=__import__('hashlib').sha256(Path('out/mainos_bus.bin').read_bytes()).hexdigest()
 send('quit');p.wait(timeout=30)
finally:
 (w/'t06-checkpoint-report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if p.poll() is None:p.kill()
print(json.dumps({k:v for k,v in report.items() if k not in ['held','held_after_stop','record_hits']},indent=2))
