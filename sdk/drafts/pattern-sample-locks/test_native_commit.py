#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Compile the production native commit body with host-mapped MMIO addresses."""
from pathlib import Path
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent
source=(HERE/'native.c').read_text()
start=source.index('static int psl_commit_locked(')
body=source[start:source.index('\nint psl_native_commit(',start)]
# Translate only target addresses; retain the production validation/index logic.
translations={
 '(uint8_t *)(uintptr_t)(0x1001614eu+p->pattern*PSL_PATTERN_BYTES+t*PSL_TRACK_BYTES)':'mirrors[t]',
 '(volatile uint8_t *)(uintptr_t)(0x46c7d48cu+i)':'&index_bytes[i]',
 '(const volatile uint8_t *)(uintptr_t)(p->bank+PART_OFFSET+p->part*PSL_PART_BYTES)':'part_bytes',
}
for old,new in translations.items():
    assert body.count(old)==1, 'review production address translation'
    body=body.replace(old,new)
code=r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "engine.h"
static uint8_t tracks[8][PSL_TRACK_BYTES],mirrors[8][PSL_TRACK_BYTES];
static uint8_t before[8][PSL_TRACK_BYTES],index_bytes[64],part_bytes[PSL_PART_BYTES];
static uint32_t dirty_bank,dirty_project;
static struct psl_source context;
static unsigned transport,max_batch,batches;
struct psl_native_write {volatile uint8_t *working,*mirror;uint8_t before,after;};
static struct psl_native_write edits[PSL_TRACKS*PSL_STEPS+PSL_STEPS];
static uint8_t *mmio8(uint32_t at){assert(at>=0x46c7d48cu && at<0x46c7d4ccu);return index_bytes+(at-0x46c7d48cu);}
static uint32_t *mmio32(uint32_t at){
 if(at==0x100f8598u)return &dirty_project;
 assert(at==context.bank+0x9b332u);return &dirty_bank;
}
#define U8(at) (*mmio8(at))
#define U32(at) (*mmio32(at))
static unsigned psl_native_transport(void){return transport;}
static int psl_native_source(struct psl_source *s){*s=context;return 1;}
static int psl_native_context(uint32_t b,unsigned p,unsigned part){return b==context.bank && p==context.pattern && part==context.part;}
static void psl_write_batch(unsigned from,unsigned end){
 assert(end>=from && end-from<=16);if(end-from>max_batch)max_batch=end-from;++batches;
 for(unsigned i=from;i<end;++i){*edits[i].working=edits[i].after;if(edits[i].mirror)*edits[i].mirror=edits[i].after;}
}
''' + body + r'''
static uint8_t expected_index(unsigned step){
 unsigned result=0;
 for(unsigned t=0;t<8;++t)for(unsigned slot=0;slot<32;++slot)
  if(tracks[t][0x59+32*step+slot]!=255)result|=1u<<t;
 return (uint8_t)result;
}
static void setup(void){
 memset(tracks,255,sizeof tracks);memset(part_bytes,0,sizeof part_bytes);
 memset(&context,0,sizeof context);context.bank=0x400e21e0u;context.eligible=255;
 for(unsigned t=0;t<8;++t){
  memset(tracks[t],0,8);tracks[t][7]=3;
  context.track[t]=tracks[t];context.machine[t]=part_bytes[0x22+t]=(uint8_t)(t%2);
  context.sample[t]=part_bytes[0x2ca+5*t+t%2]=13;
 }
 tracks[0][0x78]=7;tracks[0][0x59]=11; /* SAMPLE plus another lock */
 tracks[0][0x98]=8;                  /* SAMPLE alone */
 tracks[1][0x98]=55;                 /* unselected track */
 tracks[2][0x78+63*32]=4;             /* SAMPLE without a trig */
 memcpy(mirrors,tracks,sizeof tracks);memcpy(before,tracks,sizeof tracks);
 for(unsigned i=0;i<64;++i)index_bytes[i]=expected_index(i);
 transport=max_batch=batches=0;dirty_bank=dirty_project=0;
}
int main(void){
 struct psl_plan plan;unsigned published;
 setup();assert(psl_prepare(&plan,&context,5,PSL_CLEAR,0)==PSL_OK && plan.changed==3);
 assert(psl_commit_locked(&plan,&published)==PSL_OK && published==5 && !plan.ready);
 assert(tracks[0][0x78]==255 && tracks[0][0x98]==255 && tracks[2][0x78+63*32]==255);
 assert(tracks[0][0x59]==11 && tracks[1][0x98]==55);
 assert(!memcmp(tracks,mirrors,sizeof tracks));
 for(unsigned t=0;t<8;++t)for(unsigned i=0;i<PSL_TRACK_BYTES;++i)
  if(!((t==0 && (i==0x78 || i==0x98)) || (t==2 && i==0x78+63*32)))assert(tracks[t][i]==before[t][i]);
 for(unsigned i=0;i<64;++i)assert(index_bytes[i]==expected_index(i));
 assert(index_bytes[0]&1);assert(!(index_bytes[1]&1));assert(index_bytes[1]&2);
 assert(dirty_bank==1 && dirty_project==1 && batches && max_batch<=16);
 setup();assert(psl_prepare(&plan,&context,5,PSL_CLEAR,0)==PSL_OK);
 ++mirrors[0][0x78];assert(psl_commit_locked(&plan,&published)==PSL_STALE);
 assert(!memcmp(tracks,before,sizeof tracks) && !dirty_bank && !dirty_project && !batches);
 setup();assert(psl_prepare(&plan,&context,5,PSL_CLEAR,0)==PSL_OK);
 transport=1;assert(psl_commit_locked(&plan,&published)==PSL_INVALID);
 assert(!memcmp(tracks,before,sizeof tracks) && !dirty_bank && !dirty_project && !batches);
 puts("PASS production native commit: other p-locks/index bits, selected tracks, mirror and refusal");
}
'''
with tempfile.TemporaryDirectory(prefix='psl-native-commit-') as tmp:
    folder=Path(tmp);(folder/'test.c').write_text(code)
    subprocess.run(['cc','-std=c99','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-fno-sanitize-recover=all',
        '-I',str(HERE),str(HERE/'engine.c'),str(folder/'test.c'),'-o',str(folder/'test')],check=True)
    subprocess.run([str(folder/'test')],check=True)
