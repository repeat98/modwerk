#!/usr/bin/env python3
"""Prepare a private eight-tone stock-FX-free test card from a local project.

Reuses the SDK's tone/marker/project tools. Source template and generated card
stay outside Git. No factory samples are used: every tone is generated here.
"""
import argparse
import importlib.util
from pathlib import Path
import shutil
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
SDK=next(parent for parent in HERE.parents if (parent/'octabam/tools/harness/usb_sig_project.py').is_file())
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def prepare(source,out,t1_delay=False):
    out=out.resolve()
    if out.exists(): raise ValueError('Choose a new output directory')
    if not (source/'project.work').is_file() or not (source/'bank01.work').is_file():
        raise ValueError('A local project.work and bank01.work are required')
    tone=load('solo_tones',SDK/'octabam/tools/harness/usb_sig_project.py')
    card=load('solo_card',SDK/'octabam/tools/emu/emu_card.py')
    out.mkdir(parents=True,mode=0o700)
    project=out/'project';project.mkdir()
    for path in source.iterdir():
        if path.is_file() and path.suffix in ('.work','.strd'):
            shutil.copy2(path,project/path.name)
    tone.FX1=tone.FX2=('NONE',)*8
    none=SimpleNamespace(params=[],is_stock=True,menu=SimpleNamespace(fx2_id=0),key='NONE',knob_map_all=lambda:{})
    mods={'NONE':none}
    tone.set_project_text(project);tone.set_markers(project)
    # The shared tone helper includes bar-count hints which stock omits on
    # saving these unstretched FLEX samples. Use stock's observed text form
    # from the start, so this fixture tests solo rather than a first-save
    # truncation of a synthetic project across a FAT16 cluster boundary.
    for name in ('project.work','project.strd'):
        path=project/name
        if not path.exists(): continue
        raw=path.read_bytes()
        hints=b'TRIM_BARSx100=100\r\nLOOP_BARSx100=100\r\n'
        assert raw.count(hints)==8, 'unexpected generated tone sample format'
        path.write_bytes(raw.replace(hints,b''))
    for num in range(1,17):
        tone.otp._bank_write(project,num,lambda data,n=num:tone.mutate_bank(data,n,mods),guard=False)
    tone.otp.write_stored(project);tone.verify(project,mods)
    if t1_delay:
        # Authored tail-test settings: TIME, FB, VOL, BASE, WDTH, SEND;
        # then X, TAPE, DIR, SYNC, LOCK, PASS. All other tracks keep NONE.
        tone.otp.set_fx(project,'fx2',1,'DELAY',page=[47,96,100,0,127,127],
                        page2=[0,1,127,1,0,0],guard=False)
        tone.otp.write_stored(project)
    audio=[]
    for track in range(8):
        path=out/f'T{track+1}.wav';tone.make_sample(path,track)
        audio.append(str(path)+f':AUDIO/USBSIG/T{track+1}.wav')
    image,_=card.stage_project(project,'SOLO','TEST',tree=out/'tree',audio=audio,image_mb=32)
    (out/'card.private.img').write_bytes(image)
    print('Prepared private eight-tone fixture; SET SOLO, PROJECT TEST; T1 DELAY' if t1_delay else
          'Prepared private stock-only eight-tone fixture; SET SOLO, PROJECT TEST')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--t1-delay',action='store_true',help='Stock delay on T1 for Mute Modes tail comparisons')
    a=p.parse_args();prepare(a.source,a.output,a.t1_delay)
