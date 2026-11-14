#!/usr/bin/env python3
"""Private full-scale DC gate on the exact native image, before stock DSP."""
from pathlib import Path
import argparse,hashlib,json,shutil,struct,subprocess,sys,wave
p=argparse.ArgumentParser();p.add_argument('work',type=Path);p.add_argument('--image',type=Path,required=True);p.add_argument('--symbols',type=Path,required=True);p.add_argument('--prefix',default='gain');a=p.parse_args();w=a.work.resolve();sdk=w/'sdk/octabam';sys.path.insert(0,str(sdk/'tools'));import toolpath,ot_project as otp,emu_card
sym={r[2]:int(r[0],16) for l in a.symbols.read_text().splitlines() if len(r:=l.split())==3};out=w/a.prefix;out.mkdir(exist_ok=True);result=[]
for name,level in [('positive',32767),('negative',-32768)]:
 d=out/name;d.mkdir(exist_ok=True);pr=d/'project';shutil.copytree(w/'fresh-project',pr,dirs_exist_ok=True)
 def edit(b):
  for part in range(otp.NPARTS_ALL):
   off=otp.PART_BASE+part*otp.PART_STRIDE
   b[off+otp.MTYPE_OFF]=1;b[off+0x45:off+0x48]=b'PL\1';b[off+0x1e9]=1;b[off+0x129:off+0x12f]=bytes([0,127,127,64,64,0])
  for pat in range(16):
   for t in range(8):
    off=otp.trac_off(pat,t);b[off:off+64]=bytes(64);b[off+0x59:off+0x59+2048]=bytes([255])*2048
 otp._bank_write(pr,1,edit,guard=False)
 with wave.open(str(d/'dc.wav'),'wb') as f:f.setparams((2,2,44100,0,'NONE','not compressed'));f.writeframes(struct.pack('<hh',level,level)*88200)
 raw,_=emu_card.stage_project(pr,'OCTABAM','POLYBENCH',tree=d/'tree',image_mb=64,audio=[str(d/'dc.wav')+':AUDIO/REPITCH_440_120.wav']);(d/'card.img').write_bytes(raw)
 (d/'notes.midi').write_text('\n'.join(f'{100+i*20} 90 {n:02x} 64' for i,n in enumerate(range(84,92)))+'\n')
 span=f'{sym["poly_sum"]:#x},128={d}/sum.bin;0x800049d8,1344={d}/primary.bin;{sym["poly_extra_voices"]:#x},5208={d}/extra.bin'
 cmd=[str(w/'ot_emu'),'--image',str(a.image.resolve()),'--card',str(d/'card.img'),'--set','OCTABAM','--project','POLYBENCH','--sequencer','--internal-clock','--frames','600','--names-early','--mkii','--load-ms','90000','--dsp','--midi',str(d/'notes.midi'),'--mem-dump',span]
 with (d/'native.log').open('w') as f:subprocess.run(cmd,cwd=sdk,stdout=f,stderr=subprocess.STDOUT,check=True,timeout=300)
 assert 'run ended REACHED' in (d/'native.log').read_text()
 active=sum(b[i]!=0 for file in ['primary.bin','extra.bin'] for b in [(d/file).read_bytes()] for i in range(0,len(b),168));assert active==8,active
 v=struct.unpack('>32i',(d/'sum.bin').read_bytes());want=level*1024
 # The stock fetch path can quantize full-scale PCM by a fraction of one
 # 16-bit LSB. Require a constant DC sum within one LSB of the ideal bound.
 assert len(set(v))==1 and abs(v[0]-want)<=1024,(v,want)
 assert all(-33554432<=x<=33554431 for x in v),v
 result.append(dict(polarity=name,input_pcm16=level,active_heads=active,q25_sum=v[0],ideal_q25_sum=want,frames_checked=16,within_full_scale=True))
report=dict(image_sha256=hashlib.sha256(a.image.read_bytes()).hexdigest(),cases=result,scope='Native mixer before stock DSP; no hardware output clipping claim.');(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
