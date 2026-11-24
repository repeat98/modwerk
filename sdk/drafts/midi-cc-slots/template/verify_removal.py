#!/usr/bin/env python3
"""Retire and poison the exact package while the NAME stock editor is open."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from bench import Bench,card_tools
import emulator_fixture


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['emulator','stock','build','saved-tree','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();out=a.output.resolve()
    if out.exists() or any((d/'.git').exists() for d in [out,*out.parents]):p.error('Choose a new private directory.')
    out.mkdir(parents=True,mode=0o700);stock=a.stock.read_bytes();checks=[]
    for action in [0x31,0x32]:
        folder=out/('yes' if action==0x31 else 'no');folder.mkdir();tree=folder/'tree';shutil.copytree(a.saved_tree,tree)
        image=folder/'card.private.img';image.write_bytes(card_tools().build_image(tree,size_mb=64))
        b=Bench(a.emulator,a.stock,a.build,image,folder/'native')
        try:
            b.setup();b.press(0x3d);assert any(b.read(0x460e7612,4))
            # Confirm a name after retirement, so a stale confirmation
            # handler or module-owned destination would actually be exercised.
            b.text('BASS3')
            assert b.read(0x460e761e,4)==bytes.fromhex('460e743c')
            emulator_fixture.restore(b.fixture,b.cmd)
            b.cmd('poke 0x4005221e '+stock[0x51e1e:0x51e28].hex())
            for at in range(0,len(b.fixture['image']),512):
                n=min(512,len(b.fixture['image'])-at)
                b.cmd(f'poke {hex(b.origin+at)} '+('4afc'*(n//2)))
            b.cmd(f'poke {hex(b.origin+0x10000)} '+('4afc'*24))
            b.press(action);b.run(500);assert not any(b.read(0x460e7612,4))
            b.setup();b.press(0x3d);assert not any(b.read(0x460e7612,4))
            checks.append(('YES' if action==0x31 else 'NO')+' closes NAME safely after every module site is restored and module RAM is poisoned')
        finally:b.close()
    (out/'report.json').write_text(json.dumps({'packageSha256':hashlib.sha256((a.build/'trial.mwrm').read_bytes()).hexdigest(),'checks':checks,'hardware':'not tested'},indent=2)+'\n')
    print(json.dumps({'report':str(out/'report.json')}))


if __name__=='__main__':main()
