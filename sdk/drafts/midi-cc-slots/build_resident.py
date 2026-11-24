#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Adapt a reviewed ABI-8 module and pinned shared bus to the existing card linker.

No firmware input. Stock replay bytes stay zero with checked copy descriptions.
The existing card bootstrap owns boot copying and the arena; only the shared
bus's tick/key/encoder sites are installed, never a second boot or arena owner.
"""
import argparse, hashlib, importlib.util, json, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]

def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 for n in ['package','upstream','output']:p.add_argument('--'+n,type=Path,required=True)
 a=p.parse_args();up=a.upstream.resolve();pin=json.loads((ROOT/'vendor/elekloader/kit/kit.json').read_text())['commit']
 def run(*cmd):return subprocess.check_output(cmd,text=True).strip()
 if run('git','-C',str(up),'rev-parse','HEAD')!=pin or run('git','-C',str(up),'status','--porcelain','--untracked-files=no'):p.error('Use the clean pinned Elekloader checkout')
 spec=importlib.util.spec_from_file_location('card_document',ROOT/'sdk/drafts/midi-cc-slots/build_card.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 data=a.package.read_bytes();doc,copies=module.card_document(data,{})
 # The draft-specific ABI reader supplies a checked intermediate; this adapter
 # consumes its ordinary .run, abs32 relocations and event contributions.
 parts=doc['sections']['.run']['parts'];image=bytearray()
 for kind,value,*rest in parts:image.extend(bytes.fromhex(value) if kind=='hex' else bytes(rest[0]))
 with tempfile.TemporaryDirectory(prefix='card-resident-') as folder:
  w=Path(folder);(w/'image.bin').write_bytes(image)
  meta=json.loads((up/'mods/core-ot/mod.json').read_text());bus=up/'mods/core-ot/bus.s'
  subprocess.run(['m68k-elf-as','-mcpu=54455',*[x for k,v in meta['defsym'].items() for x in ['--defsym',f'{k}={v}']],'-o',str(w/'bus.raw.o'),str(bus)],check=True)
  subprocess.run(['m68k-elf-objcopy','--rename-section','.run=.text','--prefix-symbols=modwerk_card_',str(w/'bus.raw.o'),str(w/'bus.o')],check=True)
  lines=['.text','.balign 16','.globl modwerk_card_image','modwerk_card_image:'];at=0
  for _,offset,kind,target,addend in doc['relocs']:
   if kind!='abs32' or target!='sec:.run':raise ValueError('Unsupported resident relocation')
   if offset>at:lines.append(f'.incbin "{w}/image.bin",{at},{offset-at}')
   lines.append(f'.long modwerk_card_image+{addend}');at=offset+4
  if at<len(image):lines.append(f'.incbin "{w}/image.bin",{at},{len(image)-at}')
  for event in ['tick','draw','key','enc','midi','frame']:
   lines+=['.balign 4',f'.globl modwerk_card_ev_{event}',f'modwerk_card_ev_{event}:']
   for entry in doc['contribute']:
    if entry['to']=='ev_'+event:
     symbol=entry['relocs'][0][2].removeprefix('sym:');lines.append(f'.long modwerk_card_image+{doc["symbols"][symbol][1]}')
   lines.append('.long 0')
  (w/'image.s').write_text('\n'.join(lines)+'\n')
  subprocess.run(['m68k-elf-as','-mcpu=54455','-o',str(w/'image.o'),str(w/'image.s')],check=True)
  subprocess.run(['m68k-elf-ld','-r','-o',str(w/'resident.o'),str(w/'bus.o'),str(w/'image.o')],check=True)
  obj=(w/'resident.o').read_bytes()
 sites=[]
 for row in meta['sites']:
  if row['target'] in ['core_tick','core_key','core_enc']:
   sites.append({'address':int(row['addr'],0),'length':len(bytes.fromhex(row['stock'])),'sha256':sha(bytes.fromhex(row['stock'])),'target':'modwerk_card_'+row['target']})
 result={'schema':1,'kind':'resident-card-object','version':'0.0.15-experimental','firmwareLabel':'MIDI2 C15','moduleId':doc['id'],'implementationSha256':sha(data),'coreCommit':pin,'busSourceSha256':sha(bus.read_bytes()),'object':obj.hex(),'objectSha256':sha(obj),'imageSymbol':'modwerk_card_image','copies':[{'offset':o,'address':ad,'length':n,'sha256':digest} for o,ad,n,digest in copies],'sites':doc['sites'],'busSites':sites}
 a.output.write_text(json.dumps(result,separators=(',',':'))+'\n');print(json.dumps({'bytes':a.output.stat().st_size,'sha256':sha(a.output.read_bytes())}))
if __name__=='__main__':main()
