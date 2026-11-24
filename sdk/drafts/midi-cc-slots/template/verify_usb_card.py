#!/usr/bin/env python3
"""Fresh boot of the unchanged USB base restoring the installer seeds."""
import argparse,json,shutil
from pathlib import Path
from bench import card_tools
from usb_card_bench import UsbCardBench

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for n in ['emulator','build','saved-tree','receipt','output']:p.add_argument('--'+n,type=Path,required=True)
 a=p.parse_args();out=a.output.resolve()
 if out.exists() or any((v/'.git').exists() for v in [out,*out.parents]):p.error('Choose a new private output folder outside Git')
 out.mkdir(mode=0o700);tree=out/'tree';shutil.copytree(a.saved_tree,tree)
 for n in ['MODWERK0.SET','MODWERK1.SET']:shutil.copyfile(a.build/n,tree/n)
 card=card_tools();image=out/'card.private.img';image.write_bytes(card.build_image(tree,size_mb=64));checks=[]
 def expect(ok,label):
  if not ok:raise AssertionError(label)
  checks.append(label)
 for phase in ['boot','restart']:
  b=UsbCardBench(a.emulator,a.build,image,out/phase,a.receipt)
  try:
   expect(set(b.modules)=={'95cff696','be4ff75a','73bab3b1','f36a496d'},'all four original USB packages restored: '+phase)
   expect(int.from_bytes(b.read(b.base_symbols['modwerk_modset_result'],4),'big')==1,'base confirms complete saved-set restoration: '+phase)
   expect(b.number('loaded')==1,'MIDI profile loaded from real restored module: '+phase)
   if phase=='boot':
    b.bank(0);b.rename('USB16A');b.channel(6);b.save_project()
    b.bank(3);b.rename('USB16D');b.channel(7);b.save_project();b.cmd('card flush')
   else:
    b.bank(0);expect(b.name()==b'USB16A' and b.channels()[0]==6,'Bank A name/channel survive fresh USB base boot')
    b.bank(3);expect(b.name()==b'USB16D' and b.channels()[0]==7,'Bank D remains independent after restart')
   expect(not any(c.startswith(('poke ','call ')) for c,_ in b.log),'no publication/state/call/timing fixture: '+phase)
  finally:b.close()
 (out/'report.json').write_text(json.dumps({'checks':checks,'baseReceipt':json.loads((a.build/'installer-receipt.json').read_text()),'hardware':'not tested','limitations':['Emulator with DSP cores; no physical USB driver, card flashing, audio or power-loss qualification.']},indent=2)+'\n');print(json.dumps({'checks':len(checks),'report':str(out/'report.json')}))
if __name__=='__main__':main()
