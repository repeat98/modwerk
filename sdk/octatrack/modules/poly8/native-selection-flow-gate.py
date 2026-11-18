"""Private matched stock/POLY selection-flow probe; raw captures stay local."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, sys
p=argparse.ArgumentParser();p.add_argument('work',type=Path);p.add_argument('--image',type=Path,required=True);p.add_argument('--emulator',type=Path,required=True);p.add_argument('--machine',choices=['static','flex','poly8'],required=True);p.add_argument('--observe',action='store_true',help='Record stock or pre-fix behavior without asserting the new flow.');a=p.parse_args();w=a.work.resolve()
sys.path.insert(0,str(w/'sdk/octabam/tools'));import toolpath,lcd_view
lcd_view.ON=(255,255,255);lcd_view.OFF=(0,0,0)
env=os.environ.copy();env['OT_BOOT_POISON']='40a955e0:a18800:ff'
proc=subprocess.Popen([str(a.emulator),'--image',str(a.image),'--card',str(w/'fresh.img'),'--mount','--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--interactive'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env)
log=(w/'protocol.log').open('w');rows=[0]*8;report={'imageSha256':hashlib.sha256(a.image.read_bytes()).hexdigest(),'machine':a.machine,'poisonBeforeLoader':env['OT_BOOT_POISON']}
def until(prefix):
 while True:
  line=proc.stdout.readline()
  if not line:raise RuntimeError('Emulator ended')
  log.write(line);log.flush()
  if line.startswith('err'):raise RuntimeError(line)
  if line.startswith(prefix):return line.strip()
def send(s,prefix='ok'):
 log.write('> '+s+'\n');log.flush();proc.stdin.write(s+'\n');proc.stdin.flush();return until(prefix)
def peek(at,n):return bytes.fromhex(send(f'peek {at:#x} {n}','peek ')[5:])
def word(at):return int.from_bytes(peek(at,4),'big')
def run(ms):
 result=send(f'run {ms} wall 35');assert 'stop=time' in result,result
def key(k,on):
 row=k//8;bit=1<<(k%8);rows[row]=rows[row]|bit if on else rows[row]&~bit;send(f'key {0x20+row:#x} {rows[row]:#x}')
def tap(k):key(k,True);run(50);key(k,False);run(70)
def setup():key(45,True);run(50);tap(34);key(45,False);run(100)
def state(name):
 d={'setup':word(0x460e5e30),'pool':word(0x460e70e0),'poolPane':word(0x460e739a),'poolRow':word(0x460e738e),'setupRow':word(0x460d5c30),'pageKind':peek(0x46c7d8d8,1).hex(),'machine':peek(part+0x22,1).hex(),'marker':peek(part+0x3c,3).hex(),'loop':peek(part+0x1e0,1)[0]}
 report[name]=d
 raw=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)+b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096))
 (w/(name+'.lcd')).write_bytes(raw);lcd_view.png(lcd_view.screen(raw),w/(name+'.png'),6)
 return d
def choose_setup(row):
 setup();current=word(0x460d5c30)
 for _ in range(abs(row-current)):tap(32 if row>current else 51)
 tap(49);run(250)
def main_page():tap(50);tap(50);tap(34)
def slots():main_page();tap(16);tap(16);run(200)
try:
 until('ready ');send('frame on');run(100);tap(49)
 bank=word(0x46c82456);part=bank+0x8ed80+(peek(0x100b14cf,1)[0]&3)*6322
 state('initial');target={'static':0,'flex':1,'poly8':5}[a.machine]
 # Change machine first, so FLEX is a fresh assignment rather than a reselect.
 if target==1:choose_setup(0);main_page()
 choose_setup(target);s=state('assigned')
 if not a.observe:assert s['pool']==0,'Assignment unexpectedly opened sample pool'
 main_page();before=peek(part,4096)+peek(part+4096,6322-4096)
 choose_setup(target);s=state('reselected');after=peek(part,4096)+peek(part+4096,6322-4096)
 report['reselectPartUnchanged']=before==after
 if not a.observe:assert s['pool']==0 and before==after,report
 slots();s=state('double-track-slots');assert s['pool'],report
 tap(52);run(100);s=state('left-machine-chooser');assert s['poolRow']==target and not s['poolPane'],report
 tap(33);run(100);s=state('right-sample-slots');assert s['poolPane'],report
 tap(49);run(200);s=state('sample-confirmed')
 if target==5:assert s['marker']=='504c01',report
 # Exercise the other entry: replace from the double-TRACK machine chooser.
 slots();tap(52);current=word(0x460e738e)
 alternate=1 if target!=1 else 0
 for _ in range(abs(alternate-current)):tap(32 if alternate>current else 51)
 tap(49);run(250);state('alternate-from-chooser')
 slots();tap(52);current=word(0x460e738e)
 for _ in range(abs(target-current)):tap(32 if target>current else 51)
 tap(49);run(250);s=state('assigned-from-chooser')
 if not a.observe:assert s['pool'] and s['poolPane']==0 and s['poolRow']==target,'Machine chooser commit did not retain the machine pane'
 report['result']='Observed' if a.observe else 'PASS: SRC assignment/reselect leave pool closed; chooser assignment retains the machine pane; double-TRACK, LEFT/RIGHT and sample YES work'
 send('quit');proc.wait(timeout=30)
finally:
 (w/'report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if proc.poll() is None:proc.kill()
print(json.dumps(report,indent=2))
