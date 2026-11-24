#!/usr/bin/env python3
"""Actual standalone card boot, panel edits and fresh-process persistence."""
import argparse,hashlib,json,shutil
from pathlib import Path
from bench import card_tools
from card_bench import CardBench

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for n in ['emulator','build','saved-tree','output']:p.add_argument('--'+n,type=Path,required=True)
 a=p.parse_args();out=a.output.resolve()
 if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private output directory')
 out.mkdir(parents=True,mode=0o700);tree=out/'tree';shutil.copytree(a.saved_tree,tree);card=card_tools();image=out/'card.private.img';image.write_bytes(card.build_image(tree,size_mb=64));checks=[]
 def expect(ok,text):
  if not ok:raise AssertionError(text)
  checks.append(text)
 def wait(b):
  for _ in range(2000):
   if not b.number('busy') and not b.number('recovery'):return
   b.run(100)
  raise AssertionError('Card transaction did not complete')
 def cc_controls(b):
  def setup():
   b.press(0x32);b.run(500);b.press(0x25);b.run(500);b.press(0x25);b.press(0x25)
  def turn(encoder,delta):b.cmd(f'knob {48+encoder} {delta}');b.run(200)
  setup();b.press(0x38);b.press(0x39);turn(1,127)
  expect(int.from_bytes(b.read(0x460d5ce0,4),'big')==1 and int.from_bytes(b.read(0x460d5ce4,4),'big')==128,'card SETUP selects CC0 and CC127')
  b.press(0x31);b.press(0x25)
  for encoder,cc,value in [(0,0,37),(1,127,43)]:
   b.key(0x2d,True);b.press(0x38+encoder);b.key(0x2d,False);turn(encoder,-127);turn(encoder,-127)
   turn(encoder,value)
  shutil.copyfile(b.out/'lcd.bin',out/'controls.lcd.bin')
  setup();b.press(0x38);b.press(0x39)
  expect(b.read(0x460d5ce0,8)==bytes(8),'card SETUP restores native PB/AT assignments')
  b.press(0x31);b.press(0x25);turn(0,1);turn(1,1)
 for phase in ['boot','restart']:
  b=CardBench(a.emulator,a.build,image,out/phase)
  try:
   expect(b.number('loaded')==1,'actual card boot loads the MIDI profile without runtime publication: '+phase)
   expect(b.read(b.origin,8)!=bytes(8),'module code copied into reserved RAM by the core: '+phase)
   if phase=='boot':
    b.bank(0)
    b.rename('CARD14');expect(b.number('dirty')==0,'NAME edit autosaves from the card build')
    b.channel(6);cc_controls(b);b.save_project();b.apply();b.run(100);expect(b.number('status')==18,'initialized project requests explicit replacement')
    b.press(0x32);expect(b.number('busy')==0,'NO cancels the confirmation through the real card event bus')
    b.apply();b.run(100);b.press(0x31);wait(b);expect(b.number('status')==7,'card Apply reaches MIDI SETUP SAVED')
    b.bank(3);expect(b.channels()[0]==6 and b.name()==b'CARD14','Bank D receives Bank A name and channel')
    b.rename('BANK14');b.save_project();b.cmd('card flush')
   else:
    b.bank(0);expect(b.channels()[0]==6 and b.name()==b'CARD14','fresh card boot restores Bank A')
    b.bank(3);expect(b.channels()[0]==6 and b.name()==b'BANK14','fresh card boot restores independent Bank D')
   expect(not any(cmd.startswith(('poke ','call ')) for cmd,_ in b.log),'no injected code, state, calls or private timing fixture: '+phase)
  finally:b.close()
 files=card.extract_image(image.read_bytes());expect(not any(Path(n).name in ['MODWERK0.SET','MODWERK1.SET'] for n in files),'no CF saved runtime module set is present or needed')
 receipt=json.loads((a.build/'card-build.json').read_text());report={'cardBuild':receipt,'checks':checks,'hardware':'not tested','limitations':['Headless MKII emulator; no physical flashing, UART MIDI output, audio/timing or power-loss qualification.']}
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'checks':len(checks),'report':str(out/'report.json')}))

if __name__=='__main__':main()
