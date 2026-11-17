#!/usr/bin/env python3
"""Validate current-pool native dumps; keep private images and dumps out of Git."""
import argparse, json, math, struct
from pathlib import Path

def validate(work):
 def read(label,name):return (work/f'final-{label}-{name}.bin').read_bytes()
 def increments(label):return struct.unpack('>39I',read(label,'poly_voice_inc'))
 def tuning(label):return int.from_bytes(read(label,'poly_track_inc')[:4],'big')
 notes=[0,127,71,72,84,96,97,126]
 for note in notes:
  owner=127 if note==127 else note+128
  on,off=f'on-{note}',f'off-{note}'
  assert owner in read(on,'poly_held')[:64],(note,'held owner')
  assert read(on,'poly_primary_note')[0]==owner,(note,'voice owner')
  got=increments(on)[0];want=min(0x7fffffff,tuning(on)*2**((note-84)/12))
  assert abs(1200*math.log2(got/want))<.07,(note,'pitch')
  assert read(off,'poly_held')==bytes([255])*512,(note,'stuck held note')
  assert read(off,'poly_primary_note')[0]==255,(note,'stuck owner')
  assert read(off,'poly_env_stage')==bytes(39),(note,'release did not finish')
  for label in (on,off):assert read(label,'locks')==b'\xff',(note,'PTCH lock overwritten')
 before,after=increments('chord'),increments('tuned')
 assert read('chord','poly_held')==read('tuned','poly_held')==bytes([200,204,207])+bytes([255])*509
 assert tuning('tuned')>tuning('chord')
 for i in [0,8,9]:
  assert after[i]>before[i],('voice did not follow tuning',i)
  assert abs(after[i]/after[0]-before[i]/before[0])<.0001,('chord interval changed',i)
 for label in ('chord','tuned','released'):assert read(label,'locks')==b'\xff'
 assert read('released','poly_held')==bytes([255])*512
 assert read('released','poly_env_stage')==bytes(39)
 assert read('chord','poly_amp')[:3]==bytes([0,127,20]),'fixture AMP settings not delivered'
 return {'boundary_notes':notes,'velocity_zero_off':True,'independent_tuning':True,'ptch_lock_unchanged':True,'finite_release_reclaims_voices':True}
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('work',type=Path);a=ap.parse_args();print(json.dumps(validate(a.work),indent=2))
