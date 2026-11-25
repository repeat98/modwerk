#!/usr/bin/env python3
"""Stage private FLEX fixtures and native-port commands; no stock bytes copied.
Run inside the native toolchain with an existing project as the format template.
Pass paths as seen by the emulator (e.g. /work/... in a container).
"""
from pathlib import Path
import argparse,json,re,sys

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--sdk',type=Path,required=True)
p.add_argument('--template',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--symbols',type=Path,required=True,help='m68k-elf-nm -n runtime.elf output')
p.add_argument('--image',type=Path,required=True)
p.add_argument('--emulator',type=Path,required=True)
a=p.parse_args()
for name in ['sdk','template','out','symbols','image','emulator']:setattr(a,name,getattr(a,name).resolve())
a.out.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(a.sdk/'tools'),str(a.sdk/'tools/verify')]
import toolpath  # noqa: E402,F401
import ot_project as otp,emu_card,verify_repitch as fixture  # noqa: E402
sym={r[2]:int(r[0],16) for line in a.symbols.read_text().splitlines() if len(r:=line.split())==3}
wav=a.out/'tone.wav';fixture.make_loop(wav)
project=a.out/'project'
fixture.build_project(a.template,project,0,0,120,64,127,'flex')
# Explicit receive configuration; MIDI channel numbering in this file is 0-based.
pw=project/'project.work';text=pw.read_bytes()
for key,value in [('MIDI_AUDIO_TRK_NOTE_IN',1),('MIDI_AUDIO_TRK_CC_IN',1),('MIDI_AUTO_CHANNEL',10)]:
 text,n=re.subn(rb'(?m)^'+key.encode()+rb'=[^\r\n]*',f'{key}={value}'.encode(),text)
 if n!=1:raise SystemExit(f'Template lacks unique {key}')
for t in range(8):
 key=f'MIDI_TRIG_CH{t+1}'.encode()
 text,n=re.subn(rb'(?m)^'+key+rb'=[^\r\n]*',key+b'='+str(t).encode(),text)
 if n!=1:raise SystemExit(f'Template lacks unique {key.decode()}')
pw.write_bytes(text)
def mutate(data):
 for part in range(otp.NPARTS_ALL):
  b=otp.PART_BASE+part*otp.PART_STRIDE
  for t in range(8):
   data[b+otp.MTYPE_OFF+t]=1
   data[b+0x2d3+t*5+1]=0
   data[b+0x1e3+t*30+6]=1
   data[b+0x1e3+t*30+10]=0
   data[b+0x33+t*30+6]=64
   data[b+0x33+t*30+9]=127
   data[b+0x45+t*30:b+0x48+t*30]=b'PL\x01' if t==0 else bytes(3)
   # LFO page file +0x123; AMP follows at +0x129, not +0x12c.
   data[b+0x129+t*24:b+0x12f+t*24]=bytes([0,127,20,64,64,0])
 for t in range(8):
  off=otp.trac_off(0,t);data[off:off+64]=bytes(64)
  data[off+0x59:off+0x59+64*32]=bytes([255])*(64*32)
  data[off+0x890:off+0x910]=bytes(128)
otp._bank_write(project,1,mutate,guard=False)
card,_=emu_card.stage_project(project,'OCTABAM','POLYBENCH',tree=a.out/'tree',image_mb=64,audio=[f'{wav}:{fixture.SAMPLE_REL}'])
(a.out/'fixture.img').write_bytes(card)

def base(label,events,frames):
 midi=a.out/f'{label}.txt';midi.write_text('\n'.join(str(frame)+' '+' '.join(f'{v:02x}' for v in values) for frame,values in events)+'\n')
 return [str(a.emulator),'--image',str(a.image),'--card',str(a.out/'fixture.img'),'--set','OCTABAM','--project','POLYBENCH','--sequencer','--internal-clock','--frames',str(frames),'--names-early','--mkii','--load-ms','90000','--dsp','--main-level','64','--midi',str(midi),'--audio-out',str(a.out/label)]
def dump(cmd,frame,label,name,size,address=None):
 cmd+=['--step',f'{frame}:dump:{sym[name] if address is None else address:#x},{size}={a.out}/{label}-{name}.bin']

events=[];points=[]
for i,n in enumerate([0,127,71,72,84,96,97,126]):
 frame=100+i*200;events.extend([(frame,[0x90,n,100]),(frame+100,[0x90,n,0])]);points.extend([(frame+70,f'on-{n}'),(frame+170,f'off-{n}')])
events.extend([(1800,[0x90,72,100,0x90,76,100,0x90,79,100]),(2000,[0xb0,16,80]),(2200,[0x80,72,0,0x80,76,0,0x80,79,0])]);points.extend([(1900,'chord'),(2100,'tuned'),(2370,'released')])
cmd=base('midi-final',events,2400)
for frame,label in points:
 for name,size in [('poly_amp',32),('poly_env_stage',39),('poly_env_level',156),('poly_held',512),('poly_primary_note',8),('poly_extra_note',31),('poly_voice_inc',156),('poly_track_inc',32)]:dump(cmd,frame,'final-'+label,name,size)
 dump(cmd,frame,'final-'+label,'locks',1,0x46c7dfda)
(a.out/'midi-final-command.json').write_text(json.dumps(cmd,indent=2)+'\n')
one=[(100+i*20,[0x90,n,100]) for i,n in enumerate(range(53,85))]
for label,events,frames in [('pool-one',one,1700),('pool-many',[(100+t*100,[v for n in [84] for v in [0x90+t,n,100]]) for t in range(8)],2400),('pool-steal',one+[(1000,[0x90,85,100]),(1300,[0x91,84,100]),(1600,[0x80,53,0])],2200)]:
 cmd=base(label,events,frames)
 dump(cmd,1200,label+'-warm','voices',1344,0x800049d8)
 cmd+=['--mem-dump',';'.join(f'{address:#x},{size}={a.out}/{label}-{name}.bin' for name,address,size in [('voices',0x800049d8,1344),('extra',sym['poly_extra_voices'],31*168),('track',sym['poly_extra_track'],31),('note',sym['poly_extra_note'],31),('primary',sym['poly_primary_note'],8),('inc',sym['poly_voice_inc'],156)])]
 (a.out/f'{label}-command.json').write_text(json.dumps(cmd,indent=2)+'\n')
print('Staged generated FLEX fixture and commands. Execute each JSON argv in the native SDK working directory; then run verify-midi.py on this output directory.')
