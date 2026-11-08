#!/usr/bin/env python3
"""Choose Analog Bassdrum and select its engine using actual stock panel events."""
import json,os,pathlib,shutil,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/harness'))
from ab_fixture import prepare
def key(code, gap=.6, hold=.6):
    return [(gap, f"key {code:#x} down"), (hold, f"key {code:#x} up")]
OUT=pathlib.Path(os.environ.get('AB_UI_OUT',ROOT/'out/analog-bassdrum/ui-gate')).resolve()
def main():
    src=os.environ.get('OT_PROJECT')
    if not src:
        print('[SKIP] Analog Bassdrum panel: set OT_PROJECT to a stock project fixture');return
    OUT.mkdir(parents=True,exist_ok=True)
    fixture=prepare(src,OUT/'project')
    card=OUT/'card.img'
    subprocess.run([sys.executable,str(ROOT/'tools/emu/ot_emu/stage_card.py'),str(fixture),'OCTABAM','RIG','--tree',str(OUT/'tree'),'--out',str(card)],check=True,cwd=ROOT)
    image=OUT/'image.bin';shutil.copy2(os.environ.get('AB_IMAGE',ROOT/'out/mainos_bus.bin'),image)
    sym={l.split()[-1]:int(l.split()[0],16) for l in subprocess.check_output(['m68k-elf-nm',str(ROOT/'out/platform/runtime/runtime.elf')],text=True).splitlines() if len(l.split())==3}
    if os.environ.get('AB_SYMBOLS'): sym=json.loads(pathlib.Path(os.environ['AB_SYMBOLS']).read_text())
    spans=f'0x40170f60,6322={OUT}/part.bin;{sym["desc"]:#x},916={OUT}/desc.bin;0x400d5f4c,4={OUT}/page.bin;0x460e70e0,4={OUT}/pool.bin;0x400bb7d0,4={OUT}/setup.bin;0x460e5e30,28={OUT}/list.bin;0x100a4ece,6322={OUT}/shadow.bin;0x80000830,1={OUT}/live.bin;0x460e738e,16={OUT}/navigation.bin'
    cmd=[os.environ.get('AB_EMU',str(ROOT/'out/emu/ot_emu')),'--image',str(image),'--card',str(card),'--set','OCTABAM','--project','RIG','--load-ms','20000','--dsp','--mem-dump',spans]
    cmd += ["--lcd", str(OUT/"lcd.bin")]
    # T1 -> SRC SETUP -> bottom row -> YES; LPF encoder moves; close setup and double-tap T1:
    # 0.1.6 has no engine browser: the double-tap shows the machine column (not an engine list).
    script=key(0x10)+[(.6,'key 0x2d down'),(.3,'key 0x22 down'),(.3,'key 0x22 up'),(.3,'key 0x2d up')]
    for _ in range(6):script+=key(0x20,.25,.25)
    script+=key(0x31)
    script+=[(.8,'enc 5 -4')]
    script+=key(0x32)+[(.6,'key 0x10 down'),(.06,'key 0x10 up'),
                      (.15,'key 0x10 down'),(.06,'key 0x10 up'),(.8,'quit')]
    elapsed=0; events=[]
    for delay,event in script:
        elapsed+=round(delay*1000)
        events.append(f'{elapsed} {event}\n')
    eventfile=OUT/'events.txt';eventfile.write_text(''.join(events))
    with (OUT/'port.log').open('w') as log:
        subprocess.run(cmd+['--live-script',str(eventfile)],cwd=ROOT,
                       stdout=log,stderr=subprocess.STDOUT,timeout=600,check=True)
    part=(OUT/'part.bin').read_bytes();desc=(OUT/'desc.bin').read_bytes()
    assert part[0x22]==1 and part[60:63]==b'AB\x01', ('Analog BD selection did not land',part[0x22],part[60:63])
    assert int.from_bytes((OUT/'list.bin').read_bytes()[:4],'big')==0, 'double-tap opened an engine list'
    assert (OUT/'live.bin').read_bytes()==b'\0'
    log=(OUT/'port.log').read_text();assert 'ILLEGAL' not in log and 'ended on quit' in log
    assert 64 < part[0x1da+11] < 127, ('LPF encoder',part[0x1da+11])
    assert part[0x1da+6]==0,('TYPE',part[0x1da+6])
    assert list(part[48:54])==[64,80,80,64,64,0],list(part[48:54])
    assert int.from_bytes((OUT/'page.bin').read_bytes(),'big')==sym['desc']+0x38, 'TYPE page did not change'
    for model in (0,1):
        d=desc[model*458:(model+1)*458]
        name=lambda i: d[0x4e+6*i:0x4e+6*i+6].split(b'\0')[0]
        assert [name(i) for i in range(6,12)]==[b'TYPE',b'FIXD' if model else b'---',b'ACNT',b'LOW',b'HIGH',b'LPF']
        assert name(2)==(b'TONE' if model==0 else b'TUNE') and name(5)==b'SAT'
        assert list(d[0x96+6:0x96+12])==[0,0,64,64,64,127]
        assert int.from_bytes(d[0xd2+4*6:0xd2+4*7],'big')==2
        assert int.from_bytes(d[0x132+4*6:0x136+4*6],'big')==0x40046f10   # stock's two-state switch, as AMP SYNC
        assert int.from_bytes(d[0x162+4*6:0x166+4*6],'big')==0
        assert int.from_bytes(d[0x1c2:0x1c6],'big')==0x1111
        assert int.from_bytes(d[0x1c6:0x1ca],'big')==(0x11111111 if model else 0x01111111)
        if model:
            assert int.from_bytes(d[0xd2+4*7:0xd6+4*7],'big')==2
            assert int.from_bytes(d[0x102+4*7:0x106+4*7],'big')==0x4003c14c
            assert int.from_bytes(d[0x132+4*7:0x136+4*7],'big')==0x40046f10
            assert int.from_bytes(d[0x162+4*7:0x166+4*7],'big')==0
    print('PASS chooser: Analog Bassdrum, defaults, the TYPE and FIXD switches use stock\'s two-state widget, LPF (bottom right, OFF at 127) remains editable, and a double-tap on the track opens no engine list')
if __name__=='__main__':main()
