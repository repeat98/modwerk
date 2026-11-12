#!/usr/bin/env python3
"""Native DSP-only eight-instance stress: tempo-derived LFO/lock targets.
This replays synthetic target bytes; it does not exercise the ColdFire LFO,
sequencer, scene, MIDI or project-persistence paths.
"""
import hashlib,json,math,pathlib,struct,subprocess,sys,tempfile
sys.path.insert(0,sys.argv[1]); import verify
outdir=pathlib.Path(sys.argv[2]);outdir.mkdir(exist_ok=True)
blocks=round(31*44100/16); n=blocks*16
with tempfile.TemporaryDirectory() as tmp:
 w=pathlib.Path(tmp);mem,s,words,sha=verify.assemble(w);blob=mem.read_bytes();mb=w/'B.mem';mb.write_bytes(blob[:-9]+verify.rec(1,0x25a,[0x38000])+verify.rec(1,0x25c,[0x3c000])+blob[-9:])
 inputs=[];autos=[]
 for i in range(8):
  inp=w/f'in{i}.raw';auto=w/f'params{i}.csv';inputs.append(str(inp));autos.append(str(auto))
  with inp.open('wb') as f:
   for b in range(blocks):
    samples=[]
    for j in range(16):
     t=b*16+j;level=.98 if b%128<16 else .25
     samples += [round(level*(verify.Q-1)*math.sin(2*math.pi*(331+113*i)*t/44100)),round(level*(verify.Q-1)*math.sin(2*math.pi*(701+79*i)*t/44100))]
    f.write(struct.pack('<32i',*samples))
  with auto.open('w') as f:
   for b in range(blocks):
    beat=b*16/44100*2; step=int(beat*4)
    vals=[round(63.5+63.5*math.sin(2*math.pi*beat/(2**k)+(i+k)*.37)) for k in range(3)]
    row=[(step*17+i*13+k*29)%128 for k in range(12)]
    for k,slot in enumerate([0,1,5]):row[slot]=([0,127][(step+i+k)%2] if b%345<8 else vals[k])
    f.write(','.join(map(str,[b]+row))+'\n')
 meter=w/'meter.csv';output=w/'out.raw'
 cmd=[str(verify.HOST),'-mem',str(mem),'-memB',str(mb),'-init',','.join([f"{s['init']:x}"]*8),'-proc',','.join([f"{s['proc']:x}"]*8),'-ctx','40,41,42','-ctxB','40,41,42','-inst','8','-core','0,0,0,0,1,1,1,1','-r7','2,5,8,11,2,5,8,11','-alloc','1,3,5,7,1,3,5,7','-audio','9000','-frames','16','-blocks',str(blocks),'-inmask','255','-stereo','-dirty','12648430','-in',','.join(inputs),'-out',str(output),'-guard','16384','-guard-shared','-split','1,8,15,0,1,8,15,0','-meter',str(meter)]
 for p in autos:cmd+=['-params','64,64,0,0,0,64,0,0,0,0,0,0','-paramfile',p]
 r=subprocess.run(cmd,capture_output=True,text=True,timeout=1800)
 (outdir/'private-host.log').write_text(r.stdout+r.stderr)
 if r.returncode:raise RuntimeError(r.stdout[-2000:]+r.stderr[-1000:])
 guard='guard: ok' in r.stdout.lower() or 'nothing written' in r.stdout.lower()
 lines=meter.read_text().splitlines(); print('METER',lines[:3],flush=True)
 record={'version':json.loads((verify.HERE/'octamod.module.json').read_text())['version'],'assemblySha256':sha,'dspHostSha256':hashlib.sha256(verify.HOST.read_bytes()).hexdigest(),'sampleRate':44100,'framesPerBlock':16,'blocks':blocks,'seconds':n/44100,'instances':8,'instancesPerCore':4,'modeledLfosPerTrack':3,'targetSlotsLockedPerStep':12,'guardPassed':guard,'dirtySeed':12648430,'clobbers':0 if guard else None,'hangs':0,'splitPerInstance':[1,8,15,0]*2,'conditions':'31-second native DSP-only replay of three tempo-derived LFO target streams per instance (120 BPM; 1/2/4-beat periods), rapid endpoint locks and 12 parameter-byte targets each step. Only SPD/RNG/MIX have an audible path; other slots are inactive. Both cores, four independent rings each, 0.98-FS bursts plus tones, dirty state and local/shared canaries. ColdFire sequencer/LFO, scenes, MIDI, transport, project and physical timing are not tested.'}
 (outdir/'stress.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
 if not guard:raise SystemExit('guard failed')
