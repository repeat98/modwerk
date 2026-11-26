#!/usr/bin/env python3
"""Interrupt actual INIT after bank writes begin, then recover in a fresh VM."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from bench import Bench,card_tools


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','build','saved-tree','output']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--replace',action='store_true',help='Interrupt a confirmed replacement on an initialized project')
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private output directory.')
    out.mkdir(parents=True,mode=0o700);tree=out/'tree';shutil.copytree(a.saved_tree,tree)
    card=card_tools();image=out/'card.private.img';image.write_bytes(card.build_image(tree,size_mb=64))
    original={p.name:p.read_bytes() for p in (tree/'TEST/TRIAL').glob('bank*')}
    assert len(original)==32
    b=Bench(a.emulator,a.stock,a.build,image,out/'interrupt')
    try:
        marker=int.from_bytes(b.read(b.origin+b.symbols['state']+2456,4),'big')
        if a.replace:
            assert marker==1
            b.bank(0);b.channel(9);b.rename('REPLACE');b.save_project();b.cmd('card flush')
            baseline=card.extract_image(image.read_bytes())
            original={Path(n).name:d for n,d in baseline.items() if n.startswith('TEST/TRIAL/bank')}
            old_generation=b.number('generation')
        b.apply()
        if a.replace:
            b.run(100);assert b.number('status')==18;b.press(0x31)
        for _ in range(1200):
            b.run(500)
            b.cmd('card flush');files=card.extract_image(image.read_bytes())
            pending=any(d[:4]==b'MM4J' and d[12:16]==b'\0\0\0\1' for n,d in files.items() if 'MIDI4_J' in n)
            committed=any(d[:4]==b'MM4P' and d[12:16]==b'\0\0\0\1' and (not a.replace or int.from_bytes(d[8:12],'big')>old_generation) for n,d in files.items() if 'MIDI4_' in n and 'MIDI4_J' not in n)
            changed=[name for name,data in original.items() if files['TEST/TRIAL/'+name]!=data]
            if pending and changed and not committed:break
            assert not committed,'Missed the uncommitted bank-write window.'
        else:raise AssertionError('No pending initialization with partial bank writes.')
        (out/'cut.json').write_text(json.dumps({'changedBanks':changed,'pendingIntent':pending,'committedMetadata':committed},indent=2)+'\n')
        # Quit ends the VM at this instruction slice, without running a save
        # or allowing the in-flight initialization to complete.
    finally:b.close()
    b=Bench(a.emulator,a.stock,a.build,image,out/'recover')
    try:
        for _ in range(1600):
            if b.number('loaded') and not b.number('busy') and not b.number('recovery'):break
            b.run(500)
        else:raise AssertionError('Native rollback/reload did not complete.')
        assert int.from_bytes(b.read(b.origin+b.symbols['state']+2456,4),'big')==marker
        b.cmd('card flush');files=card.extract_image(image.read_bytes())
        assert all(files['TEST/TRIAL/'+name]==data for name,data in original.items()),'Rollback changed original native bank contents.'
        assert b.channels()[0]==(9 if a.replace else 3),'Native reload did not restore the captured Bank A channel.'
        b.bank(3);want=3 if a.replace else 0
        assert b.channels()[0]==want,'Recovery reapplied Bank A to another bank.'
        b.run(4000);assert b.channels()[0]==want
        if a.replace:assert b.name()==b'BASS3','Recovery overwrote the prior independent Bank D name.'
        (out/'report.json').write_text(json.dumps({'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'replacement':a.replace,'checks':['Actual FUNC + D starts Apply; replacement requires YES' if a.replace else 'Actual FUNC + D starts Apply','Interrupted after native bank writes and before committed metadata','Fresh VM restores every bank byte to the pre-INIT snapshot','Native project reload completes','Previous initialization marker retained','Other-bank channel/name remains independent; defaults are not reapplied'],'limitations':['Private publication, tick and first-sector IRQ fixtures; not full base or physical power loss.']},indent=2)+'\n')
        print(json.dumps({'report':str(out/'report.json')}))
    finally:b.close()


if __name__=='__main__':main()
