#!/usr/bin/env python3
"""Native battery-RAM restart, POLY/FLEX sound, sample preview and step progress.
Requires the private persistence-audit emulator and native assignment fixture.
All image, SRAM, audio and LCD data remain in the private work directory.
"""
from pathlib import Path
import argparse,array,hashlib,json,math,os,re,subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('work',type=Path)
parser.add_argument('--image',default='out/mainos_bus.bin')
parser.add_argument('--prefix',default='warm-audio')
parser.add_argument('--preview',action='store_true',help='Also collect the currently unqualified native sample-preview probe.')
args=parser.parse_args();w=args.work.resolve();env=os.environ.copy();env['OT_PERSIST_SRAM_IN']=str(w/'t03-sram.bin')
image=Path(args.image).resolve();report={'image_sha256':hashlib.sha256(image.read_bytes()).hexdigest()}
p=subprocess.Popen([str(w/'ot_emu_warm'),'--image',str(image),'--card',str(w/'fresh.img'),'--mkii','--dsp','--main-level','64','--interactive'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env)
log=(w/(args.prefix+'-protocol.log')).open('w');rows=[0]*8

def until(prefix):
    while True:
        line=p.stdout.readline()
        if not line:raise RuntimeError('emulator ended')
        if prefix!='audio ':log.write(line);log.flush()
        if line.startswith(prefix):return line.strip()
def send(command,prefix='ok'):
    log.write('> '+command+'\n');log.flush();p.stdin.write(command+'\n');p.stdin.flush();return until(prefix)
def peek(address,size):return bytes.fromhex(send(f'peek {address:#x} {size}','peek ')[5:])
def run(ms):
    result=send(f'run {ms} wall 35')
    assert 'stop=time' in result,result
    return result
def key(number,down):
    row=number//8;bit=1<<(number%8);rows[row]=rows[row]|bit if down else rows[row]&~bit
    send(f'key {0x20+row:#x} {rows[row]:#x}')
def tap(number):key(number,True);run(50);key(number,False);run(50)
def capture(label,mode='main'):
    send('audio start '+mode);run(200)
    _,frames,hex_pcm=send('audio read 20000','audio ').split(' ',2)
    samples=array.array('h');samples.frombytes(bytes.fromhex(hex_pcm))
    channels=8 if mode=='all' else 2
    result={'frames':int(frames),'channel_peaks':[max(map(abs,samples[i::channels]),default=0) for i in range(channels)]}
    report[label]=result
    assert result['frames']>=8000,result
    if label=='sample_preview':
        # Preview of this generated fixture is quiet. Check the
        # actual 440 Hz signal, rather than accepting the +/-1 idle residue.
        result['tone_amplitudes']=[round(2*abs(sum(v*complex(math.cos(2*math.pi*440*j/44100),math.sin(2*math.pi*440*j/44100)) for j,v in enumerate(samples[i::channels])))/len(samples[i::channels]),3) for i in range(channels)]
        result['expected_tone_confirmed']=max(result['tone_amplitudes'])>4
        result['qualification']='diagnostic only; stock control also failed to confirm the expected preview tone'
    else:assert max(result['channel_peaks'])>32,result
    send('audio stop')
def lcd(name):
    data=peek(0x46c7e0ea,1024)+peek(0x46c7d34c,280)
    data+=b''.join(peek(0x460d1f7b+i,min(4096,0x2800-i)) for i in range(0,0x2800,4096))
    (w/(args.prefix+'-'+name+'.lcd')).write_bytes(data)
try:
    until('ready ');send('frame on')
    # Never send keys after a wall-limited partial boot; finish every slice.
    for _ in range(36):run(250)
    tap(49)  # Dismiss the native date prompt.
    bank=int.from_bytes(peek(0x46c82456,4),'big');part=peek(0x100b14cf,1)[0]&3;address=bank+0x8ed80+part*6322
    report['marker']=peek(address+0x3c,3).hex();report['mirror']=peek(0x100a4ece+part*6322+0x3c,3).hex()
    report['machine']=peek(address+0x22,1).hex();report['loop']=peek(address+0x1e0,1).hex()
    assert report['marker']==report['mirror']=='504c01' and report['machine']=='01' and report['loop']=='00',report
    key(45,True);run(50);tap(32);tap(32);key(45,False);run(100);tap(49)
    report['chromatic_mode']=int.from_bytes(peek(0x460d16f0,4),'big')
    assert report['chromatic_mode']==1,report
    key(0,True);capture('poly_sound');key(0,False);tap(39)
    tap(17);key(0,True);capture('flex_sound');key(0,False);tap(39)
    if args.preview:
        tap(17);tap(17);run(200);lcd('sample-slots')
        report['sample_slots_open']=peek(0x460e70e0,4).hex()
        assert report['sample_slots_open']!='00000000',report
        key(45,True);run(50);tap(49);key(45,False);capture('sample_preview','all');tap(50);tap(50)
    else:report['sample_preview']='not tested; use --preview for the unqualified probe'
    tap(16);key(41,True);run(50);tap(40);key(41,False)
    report['transport']=peek(0x800065b8,4).hex();report['live_record']=peek(0x460d172a,4).hex()
    assert report['transport']==report['live_record']=='00000001',report
    report['play_start']=send('status','status ')
    for note in [0,4,7]:key(note,True);run(50);key(note,False);run(220)
    report['play_end']=send('status','status ');tap(39)
    pattern=peek(0x100b14d0,1)[0];data=peek(bank+pattern*0x8ed8,2330)
    report['records']=[{'step':i+1,'root':data[0x59+i*32],'shape':data[0x59+i*32+30]} for i in range(64) if data[0x59+i*32+30]<232]
    assert len({r['step'] for r in report['records']})>=3 and {72,76,79}<={r['root'] for r in report['records']},report
    frames=lambda s:int(re.search(r'frames=(\d+)',s)[1])
    assert frames(report['play_end'])-frames(report['play_start'])>=2000,report
    report['result']='POLY/FLEX key audio and advancing-step recording pass; sample preview not qualified';send('quit');p.wait(timeout=30)
finally:
    (w/(args.prefix+'-report.json')).write_text(json.dumps(report,indent=2)+'\n');log.close()
    if p.poll() is None:p.kill()
print(json.dumps(report,indent=2))
