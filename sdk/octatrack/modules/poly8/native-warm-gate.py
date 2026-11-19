#!/usr/bin/env python3
from pathlib import Path
import json,subprocess,os,argparse
parser=argparse.ArgumentParser(description='Restart from private battery RAM without explicit project load; requires the persistence audit emulator.');parser.add_argument('work',type=Path);w=parser.parse_args().work.resolve();env=os.environ.copy();env['OT_PERSIST_SRAM_IN']=str(w/'t03-sram.bin');p=subprocess.Popen([str(w/'ot_emu_warm'),'--image','out/mainos_bus.bin','--card',str(w/'fresh.img'),'--mkii','--dsp','--main-level','64','--interactive','--lcd',str(w/'warm-lcd.bin')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env);log=(w/'warm-protocol.log').open('w');report={}
def until(pre):
 while True:
  l=p.stdout.readline();log.write(l);log.flush()
  if not l:raise RuntimeError('emulator ended')
  if l.startswith(pre):return l.strip()
def send(c,pre='ok'):
 log.write('> '+c+'\n');log.flush();p.stdin.write(c+'\n');p.stdin.flush();return until(pre)
def peek(a,n):return bytes.fromhex(send(f'peek {a:#x} {n}','peek ')[5:])
try:
 until('ready ');send('frame on');report['run']=send('run 7000');assert 'stop=time' in report['run']
 bank=int.from_bytes(peek(0x46c82456,4),'big');part=peek(0x100b14cf,1)[0]&3;address=bank+0x8ed80+part*6322
 report['bank']=hex(bank);report['part']=part;report['marker']=peek(address+0x3c,3).hex();report['mirror']=peek(0x100a4ece+part*6322+0x3c,3).hex();report['machine']=peek(address+0x22,1).hex();report['loop']=peek(address+0x1e0,1).hex()
 assert report['marker']==report['mirror']=='504c01',report
 assert report['machine']=='01' and report['loop']=='00'
 report['part_sha_match']=peek(address,400)==(w/'t03-assigned-part.bin').read_bytes()[:400]
 assert report['part_sha_match']
 send('quit');p.wait(timeout=30)
finally:
 (w/'warm-report.json').write_text(json.dumps(report,indent=2)+'\n');log.close()
 if p.poll() is None:p.kill()
print(json.dumps(report,indent=2))
