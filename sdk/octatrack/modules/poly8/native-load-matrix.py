#!/usr/bin/env python3
"""Private native instruction/audio comparison. No hardware cycle claims."""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil,subprocess,sys,wave
p=argparse.ArgumentParser();p.add_argument('work',type=Path);p.add_argument('--image',required=True,type=Path);p.add_argument('--symbols',required=True,type=Path);p.add_argument('--prefix',required=True);p.add_argument('--cases',default='idle,one,eight,eight-high,wide-pitches,attack,release,tuned-high,mixed,budget-edge,modulated,budget-pressure');a=p.parse_args()
w=a.work.resolve();sdk=w/'sdk/octabam';sys.path.insert(0,str(sdk/'tools'));import toolpath,ot_project as otp,emu_card,verify_repitch as fixture
sym={r[2]:int(r[0],16) for l in a.symbols.read_text().splitlines() if len(r:=l.split())==3}
out=w/'load';out.mkdir(exist_ok=True)
cases={'idle':[], 'one':[84], 'eight':list(range(84,92)), 'eight-high':list(range(96,104)), 'wide-pitches':[60,64,68,72,76,80,84,127], 'attack':list(range(84,92)), 'release':list(range(84,92)), 'tuned-high':list(range(84,92)), 'mixed':list(range(84,92)), 'modulated':list(range(84,92)), 'budget-pressure':list(range(108,116)), 'budget-edge':list(range(101,109))}
result=[]
for name in a.cases.split(','):
 notes=cases[name];label=a.prefix+'-'+name;d=out/name;d.mkdir(exist_ok=True);card=d/'card.img'
 if not card.exists():
  project=d/'project';shutil.copytree(w/'fresh-project',project)
  for suffix in ['work','strd']:
   f=project/('project.'+suffix)
   if not f.exists():continue
   b=f.read_bytes()
   for key,value in [('MIDI_AUDIO_TRK_NOTE_IN',1),('MIDI_AUDIO_TRK_CC_IN',1),('MIDI_AUTO_CHANNEL',10),*[(f'MIDI_TRIG_CH{t+1}',t) for t in range(8)]]:
    b,n=re.subn(rb'(?m)^'+key.encode()+rb'=[^\r\n]*',f'{key}={value}'.encode(),b);assert n==1,key
   f.write_bytes(b)
  def mutate(data):
   for part in range(otp.NPARTS_ALL):
    b=otp.PART_BASE+part*otp.PART_STRIDE
    for t in range(8):
     data[b+otp.MTYPE_OFF+t]=1
     data[b+0x2d3+t*5+1]=0
     data[b+0x1e3+t*30+6]=1;data[b+0x1e3+t*30+10]=0
     data[b+0x33+t*30+6]=64;data[b+0x33+t*30+9]=127
     data[b+0x45+t*30:b+0x48+t*30]=b'PL\x01' if t==0 else bytes(3)
     data[b+0x129+t*24:b+0x12f+t*24]=bytes([100 if name=='attack' else 0,127,80 if name=='release' else 127,64,64,0])
     if name=='modulated':
      l1=b+otp.LFO_P1_OFF+t*24;l2=b+otp.LFO_PM_OFF+t*30
      data[l1:l1+6]=bytes((20,36,52,20,28,18))
      data[l2:l2+6]=bytes((0 if t==0 else 18,19,24,1,1,1))
   for pattern in range(16):
    for t in range(8):
     o=otp.trac_off(pattern,t);data[o:o+64]=bytes(64);data[o+0x59:o+0x59+64*32]=bytes([255])*(64*32)
  otp._bank_write(project,1,mutate,guard=False)
  tone=d/'tone.wav';fixture.make_loop(tone)
  raw,_=emu_card.stage_project(project,'OCTABAM','POLYBENCH',tree=d/'tree',image_mb=64,audio=[f'{tone}:{fixture.SAMPLE_REL}']);card.write_bytes(raw)
 events=[(100+i*20,[0x90,n,100]) for i,n in enumerate(notes)]
 if name=='release':events += [(450,[v for n in notes for v in [0x80,n,0]])]
 if name in ('mixed','modulated','budget-edge'):events += [(270+t*10,[0x90+t,84,100]) for t in range(1,8)]
 # MIDI/setup events finish before the frame-500 measurement reset.
 # Native LFOs keep running throughout the measured window.
 midi=out/(label+'.midi');midi.write_text('\n'.join(str(f)+' '+' '.join(f'{v:02x}' for v in vals) for f,vals in events)+'\n')
 prefix=out/label
 dumps=[(0x800049d8,1344,'primary'),(sym['poly_extra_voices'],31*168,'extra'),(sym['poly_voice_inc'],39*4,'increments'),(sym['poly_env_stage'],39,'env'),(sym['poly_amp'],32,'amp'),(sym['poly_track_inc'],32,'tuning-end'),(sym['poly_sum'],128,'sum')]
 cmd=[str(w/'ot_emu'),'--image',str(a.image.resolve()),'--card',str(card),'--set','OCTABAM','--project','POLYBENCH','--names-early','--load-ms','90000','--mkii','--dsp','--main-level','64','--sequencer','--internal-clock','--frames','1500','--midi',str(midi),'--step',f'500:dump:0x800065b8,4={prefix}-transport.bin;{sym["poly_track_inc"]:#x},32={prefix}-tuning-start.bin','--mem-dump',';'.join(f'{ad:#x},{n}={prefix}-{tag}.bin' for ad,n,tag in dumps),'--audio-out',str(prefix),'--profile','--dsp-stopwatch','1:17a:333']
 if name in ('tuned-high','budget-pressure'):
  # Changes occur before measurement; a separate sustained panel/LFO gate
  # covers motion. This row is intentionally a high-tuning steady load.
  midi.write_text(midi.read_text()+('400 b0 10 7f\n' if name=='budget-pressure' else '400 b0 10 70\n'))
 (out/(label+'-command.json')).write_text(json.dumps(cmd,indent=2)+'\n')
 with (out/(label+'.log')).open('w') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,cwd=sdk,check=True,timeout=300)
 text=(out/(label+'.log')).read_text();assert 'run ended REACHED' in text,label
 instr=int(re.search(r'^cpu\s*:\s*(\d+) ColdFire',text,re.M)[1])
 primary=(out/(label+'-primary.bin')).read_bytes();extra=(out/(label+'-extra.bin')).read_bytes();active=sum(primary[i*168]!=0 for i in range(8))+sum(extra[i*168]!=0 for i in range(31))
 expected=0 if name=='idle' else 1 if name=='one' else 2 if name=='budget-pressure' else 15 if name in ('mixed','modulated','budget-edge') else 8
 assert active==expected,(label,active,expected)
 assert (out/(label+'-transport.bin')).read_bytes()==bytes.fromhex('00000001'),label
 wav=out/(label+'_core0.wav')
 with wave.open(str(wav)) as wf:
  audio=wf.readframes(wf.getnframes());pcm=dict(channels=wf.getnchannels(),sample_width=wf.getsampwidth(),frames=wf.getnframes(),sha256=hashlib.sha256(audio).hexdigest())
 assert pcm['channels']==8 and pcm['sample_width']==3
 tail=audio[-16000*24:];peak=max(abs(int.from_bytes(tail[i:i+3],'little',signed=True)) for i in range(0,len(tail),3))
 assert name=='idle' or peak>100,(label,peak)
 pcm['tail_peak']=peak
 if name=='modulated':assert (out/(label+'-tuning-start.bin')).read_bytes()!=(out/(label+'-tuning-end.bin')).read_bytes(),'PTCH LFO did not move'
 match=re.search(r'dsp stopwatch:.*?instructions per pair mean ([\d.]+) min (\d+) max (\d+)',text)
 row=dict(case=name,image_sha256=hashlib.sha256(a.image.read_bytes()).hexdigest(),instructions=instr,measured_blocks=1000,instructions_per_16_samples=instr/1000,active_records=active,audio=pcm,dsp_four_track_loop=dict(mean=float(match[1]),minimum=int(match[2]),maximum=int(match[3])) if match else None,scope='Native instruction counts, not hardware cycles; DSP summary includes startup and warm-up.')
 result.append(row);(out/(a.prefix+'-report.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(row),flush=True)
