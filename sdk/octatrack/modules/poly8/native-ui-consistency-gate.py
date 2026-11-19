#!/usr/bin/env python3
from pathlib import Path
import argparse,json,subprocess,sys,hashlib
p=argparse.ArgumentParser();p.add_argument('work',type=Path);p.add_argument('--image',required=True,type=Path);p.add_argument('--prefix',required=True);a=p.parse_args();w=a.work.resolve();sys.path.insert(0,str(w/'sdk/octabam/tools'));import toolpath,lcd_view
lcd_view.ON=(255,255,255);lcd_view.OFF=(0,0,0)
out=w/a.prefix;out.mkdir(exist_ok=True)
cmd=[str(w/'ot_emu_warm'),'--image',str(a.image.resolve()),'--card',str(w/'fresh.img'),'--mount','--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--interactive']
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1);log=(out/'protocol.log').open('w');report=dict(image_sha256=hashlib.sha256(a.image.read_bytes()).hexdigest());rows=[0]*8
def until(prefix):
 while True:
  line=proc.stdout.readline()
  if not line:raise RuntimeError('Emulator ended')
  log.write(line);log.flush()
  if line.startswith('err'):raise RuntimeError(line)
  if line.startswith(prefix):return line.strip()
def send(cmd,prefix='ok'):
 log.write('> '+cmd+'\n');log.flush();proc.stdin.write(cmd+'\n');proc.stdin.flush();return until(prefix)
def peek(at,n):return bytes.fromhex(send(f'peek {at:#x} {n}','peek ')[5:])
def run(ms):
 value=send(f'run {ms} wall 35');assert 'stop=time' in value,value
def key(k,on):
 row=k//8;mask=1<<(k%8);rows[row]=rows[row]|mask if on else rows[row]&~mask;send(f'key {0x20+row:#x} {rows[row]:#x}')
def tap(k):key(k,True);run(50);key(k,False);run(70)
def setup():key(45,True);run(50);tap(34);key(45,False);run(100)
def screen(name):
 raw=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)+b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096));(out/(name+'.lcd')).write_bytes(raw);lcd_view.png(lcd_view.screen(raw),out/(name+'.png'),6)
def loop():return peek(0x40170f60+0x1e0,1)[0]
try:
 until('ready ');send('frame on');run(100);tap(49)
 setup()
 for _ in range(4):tap(32)
 tap(49);run(200);screen('assigned-src');report['new_loop']=loop()
 report['sample_slots_after_assignment']=peek(0x460e70e0,4).hex();assert report['sample_slots_after_assignment']=='00000000',report
 tap(50);tap(50);tap(34);screen('main-poly')
 setup();screen('setup-poly')
 send('knob 0x30 4');run(150);screen('loop-encoder');report['loop_after_encoder']=loop()
 before=b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096))
 tap(49);run(250);report['loop_after_reselect']=loop();screen('reselected')
 report['sample_slots_after_reselect']=peek(0x460e70e0,4).hex();assert report['sample_slots_after_reselect']=='00000000',report
 after=b''.join(peek(0x40170f60+i,min(4096,6322-i)) for i in range(0,6322,4096));assert before==after,'Reselecting changed other Part bytes'
 report['reselect_part_unchanged']=True
 tap(50);tap(50);tap(34);tap(16);tap(16);run(200);screen('double-track-reopen');report['sample_slots_after_double_track']=peek(0x460e70e0,4).hex()
 tap(52);run(100);screen('left-machine-chooser');report['chooser_type']=peek(0x460e738e,4).hex()
 tap(33);run(100);screen('right-flex-pool')
 report['right_pane']=int.from_bytes(peek(0x460e739a,4),'big')
 report['right_machine']=int.from_bytes(peek(0x460e738e,4),'big')
 tap(49);run(100);report['marker_after_sample_yes']=peek(0x40170f60+0x3c,3).hex();report['loop_after_sample_yes']=loop()
 assert report['new_loop']==0 and report['loop_after_encoder']>0,report
 assert report['loop_after_reselect']==report['loop_after_encoder']==report['loop_after_sample_yes'],report
 assert report['chooser_type']=='00000005' and report['right_pane']==1 and report['right_machine']==1,report
 assert report['marker_after_sample_yes']=='504c01',report
 tap(50);tap(50);tap(34);tap(16);tap(16);tap(52)
 for _ in range(4):tap(51)
 tap(49);run(150);report['flex_marker']=peek(0x40170f60+0x3c,3).hex();assert report['flex_marker']=='000000',report
 tap(50);tap(50);tap(34);setup()
 for _ in range(4):tap(32)
 tap(49);run(150);report['reassigned_loop']=loop();assert report['reassigned_loop']==0,report
 tap(50);tap(50);tap(34);tap(16);tap(16);tap(52);tap(51);tap(50);run(100);report['cancel_marker']=peek(0x40170f60+0x3c,3).hex();assert report['cancel_marker']=='504c01',report
 tap(50);tap(34);setup();send('knob 0x30 16');run(100);assert loop()==3
 tap(49);run(150);report['pipo_after_reselect']=loop();assert report['pipo_after_reselect']==3,report
 send('quit');proc.wait(timeout=30)
finally:
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if proc.poll() is None:proc.kill()
print(json.dumps(report,indent=2))
