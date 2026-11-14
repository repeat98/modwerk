#!/usr/bin/env python3
"""Private generated fixtures for broader Track Solo emulator checks."""
import argparse,hashlib,importlib.util,json,re,shutil,struct,sys,wave
from pathlib import Path
HERE=Path(__file__).resolve().parent;SDK=next(parent for parent in HERE.parents if (parent/'octabam/tools/hw/ot_project.py').is_file());TOOLS=SDK/'octabam/tools'
sys.path.insert(0,str(TOOLS/'hw'));sys.path.insert(0,str(TOOLS/'emu'))
import ot_project as op
import ot_bank as ob
import emu_card

def prepare(source,out):
 out.mkdir(parents=True,exist_ok=False);reports=[]
 for profile in ('control','machines','master','recorder'):
  machine_profile=profile in ('machines','recorder')
  dest=out/profile;project=dest/'project';project.mkdir(parents=True)
  for f in (source/'project').iterdir():
   if f.is_file():shutil.copy2(f,project/f.name)
  audio=dest/'audio';audio.mkdir()
  for i in range(1,9):shutil.copy2(source/f'T{i}.wav',audio/f'T{i}.wav')
  with wave.open(str(audio/'T3.wav'),'rb') as r:
   params=r.getparams();short=r.readframes(1764)
  with wave.open(str(audio/'SHORT.wav'),'wb') as w:
   w.setparams(params);w.writeframes(short)
  for fn in ('project.work','project.strd'):
   p=project/fn;raw=p.read_bytes()
   settings={b'MIDI_PROGRAM_CHANGE_RECEIVE':1,b'MIDI_PROGRAM_CHANGE_RECEIVE_CH':8,b'MIDI_TRANSPORT_RECEIVE':1,b'MASTER_TRACK':int(profile=='master')}
   for key,value in settings.items():
    raw,n=re.subn(rb'(?m)^'+key+rb'=[^\r\n]*',key+b'='+str(value).encode(),raw);assert n==1,(key,n)
   blocks=[]
   for i in range(1,9):
    m=re.search(rb'\[SAMPLE\]\r\nTYPE=FLEX\r\nSLOT=%03d\r\n.*?\[/SAMPLE\]\r\n\r\n'%i,raw,re.S);assert m,i
    blocks.append(m[0].replace(b'TYPE=FLEX',b'TYPE=STATIC',1))
   if machine_profile:
    pat=rb'(\[SAMPLE\]\r\nTYPE=FLEX\r\nSLOT=003\r\n)(.*?)(\[/SAMPLE\])'
    def short_block(m):return m[1]+m[2].replace(b'T3.wav',b'SHORT.wav').replace(b'LOOPMODE=1',b'LOOPMODE=0')+m[3]
    raw,n=re.subn(pat,short_block,raw,flags=re.S);assert n==1
   raw+=b''.join(blocks);p.write_bytes(raw)
  for fn in ('markers.work','markers.strd'):
   p=project/fn;d=bytearray(p.read_bytes())
   for i in range(8):
    a=0x16+i*784;b=0x16+(136+i)*784;d[b:b+784]=d[a:a+784]
   if machine_profile:struct.pack_into('>III',d,0x16+2*784,0,1764,0)
   d[-2:]=(sum(d[16:-2])&65535).to_bytes(2,'big');p.write_bytes(d)
  for num in range(1,17):
   def mutate(d):
    for part in range(8):
     b=op.PART_BASE+part*op.PART_STRIDE
     if profile=='control' and part%4==1:d[b+op.MTYPE_OFF+1]=0;d[b+op.SLOT_OFF+5]=1
     if machine_profile:
      # Isolate R5's MAIN output from its downstream Neighbor for a positive control.
      types=[1,0,1,1,1,1 if profile=='recorder' else 3,4,2]
      for t,kind in enumerate(types):d[b+op.MTYPE_OFF+t]=kind
      d[b+op.SLOT_OFF+5]=1 # Static slot 2 on T2
      d[b+0x1e3+2*30+6]=0 # T3 LOOP off
      v=b+0x033+3*30+6;d[v+4]=4;d[v+5]=48 # T4 RTRG / RTIM
      d[b+op.SLOT_OFF+4*5+1]=132 # recorder buffer 5
      v=b+0x3f+7*30;d[v:v+6]=bytes([1,127,0,0,0,0]) # THRU AB
      for t in (4,6):
       r=b+op.REC_SETUP_OFF+t*12;d[r:r+12]=bytes([1,0,15,0,0,1,0,0,0,255,255,0])
    for pat in range(16):
     tail=ob.PTRN_BASE+(pat+1)*ob.PTRN_STRIDE
     d[tail-5]=pat%4
     d[tail-7]=int(pat in (2,3))
     for t in range(8):
      at=ob.trac(pat,t)+ob.DATA
      steps=() if pat==15 else ((1,4,7,10,13,16) if pat in (2,3) else (1,5,9,13))
      ob.set_mask(d,pat,t,sum(1<<(s-1) for s in steps),0)
      d[at+0x50]=16;d[at+0x51]=([0,1,2,3,4,5,6,2] if pat==2 else [6,5,4,3,2,1,0,2] if pat==3 else [2]*8)[t]
      d[at+0x52]=20 if pat==2 else 30 if pat==3 else 0
      d[at+0x40:at+0x48]=(0xaaaaaaaaaaaaaaaa).to_bytes(8,'big')
      if machine_profile and t==4 and pat!=15:ob.set_mask(d,pat,t,1,4) # REC1 step 1
   op._bank_write(project,num,mutate,guard=False)
  op.write_stored(project)
  # A stock delay on every track of Part 3 creates the FX stress condition.
  delay=Path(source).parent/'fixture-mute-delay/project/bank01.work'
  if delay.exists():
   ref=delay.read_bytes();rb=op.PART_BASE;fid=ref[rb+op.FX2_OFF];knob1=ref[rb+op.P1_OFF+6:rb+op.P1_OFF+12];knob2=ref[rb+op.P2_OFF+6:rb+op.P2_OFF+12]
   for num in range(1,17):
    def effects(d):
     for part in (2,6):
      b=op.PART_BASE+part*op.PART_STRIDE
      for t in range(8):
       d[b+op.FX2_OFF+t]=fid;p1=b+op.P1_OFF+t*op.TRACK_STRIDE;p2=b+op.P2_OFF+t*op.P2_STRIDE
       d[p1+6:p1+12]=knob1;d[p2+6:p2+12]=knob2
    op._bank_write(project,num,effects,guard=False)
  for p in project.glob('bank*.*'):
   d=p.read_bytes();assert (sum(d[16:-2])&65535)==int.from_bytes(d[-2:],'big'),p
  audio_args=[str(p)+':AUDIO/USBSIG/'+p.name for p in sorted(audio.glob('*.wav'))]
  image,_=emu_card.stage_project(project,'SOLO','TEST',tree=dest/'tree',audio=audio_args,image_mb=32)
  (dest/'card.private.img').write_bytes(image)
  reports.append({'profile':profile,'cardSha256':hashlib.sha256(image).hexdigest(),'generatedAudioOnly':True,'firmwareIncluded':False,'bankChecksumsValid':True})
 (out/'fixtures.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();prepare(a.source,a.output)
