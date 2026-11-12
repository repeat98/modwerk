/* SPDX-License-Identifier: MIT */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define POLY_RECORD_HOST_TEST
unsigned pm_is_poly_track(unsigned t);
#include "recording.c"
volatile uint8_t poly_held[8][64],poly_pending_key[8];
static unsigned live=1,less=0,writes=0,placements=0; static int step=3;
static uint8_t saved[32];
unsigned pm_is_poly_track(unsigned t){return t!=7;}
uint32_t rec_test_read(uintptr_t a){return a==0x460d172a?live:a==0x46c7dd26?less:0x12345678;}
int rec_place(unsigned t,uint32_t ctx,unsigned l){assert(t==0&&ctx==0x12345678&&l==less);++placements;return step;}
void rec_lock(unsigned t,unsigned slot,unsigned v,int s,uint32_t ctx){assert(t==0&&s==step&&ctx==0x12345678);saved[slot]=v;++writes;}
int main(void){
 memset((void*)poly_pending_key,255,8); memset((void*)poly_held,255,512);
 for(unsigned shape=0;shape<CHORD_SHAPES;++shape){
  uint8_t v[32],m[32],before[32];memset(v,64,32);memset(m,1,32);v[0]=84;v[30]=shape;memcpy(before,v,32);
  pm_sequence_stage(0,v,m,1);assert(v[0]==255&&v[30]==255&&v[31]==64);
  unsigned count=0;for(unsigned i=0;i<12;++i)if(chord_masks[shape]&(1u<<i)){assert(pm_sequence_next(0)==(int)(84+i));++count;}
  assert(count>=1&&count<=4&&pm_sequence_next(0)==-1);
  for(unsigned i=1;i<30;++i)assert(v[i]==before[i]&&m[i]==1);
 }
 poly_held[0][0]=84;poly_held[0][1]=88;poly_held[0][2]=91;poly_held[0][3]=94;
 memset(saved,255,32);pm_record_key(0,94);assert(writes==2&&saved[0]==84&&saved[30]<232&&saved[31]==255);
 assert(chord_masks[saved[30]]==((1u<<0)|(1u<<4)|(1u<<7)|(1u<<10)));
 uint8_t v[32],m[32]={0};memcpy(v,saved,32);pm_sequence_stage(0,v,m,1);
 assert(pm_sequence_next(0)==84&&pm_sequence_next(0)==88&&pm_sequence_next(0)==91&&pm_sequence_next(0)==94&&pm_sequence_next(0)==-1);
 memcpy(v,saved,32);pm_sequence_stage(0,v,m,0);assert(pm_sequence_next(0)==-1);
 poly_held[0][4]=95;pm_record_key(0,95);assert(writes==2);
 poly_held[0][4]=255;poly_held[0][3]=96;pm_record_key(0,96);assert(writes==2);
 poly_held[0][3]=94;live=0;pm_record_key(0,94);assert(writes==2);live=1;step=-1;pm_record_key(0,94);assert(writes==2);
 step=3;less=1;pm_record_key(0,94);assert(writes==4);
 memcpy(v,saved,32);pm_sequence_stage(7,v,m,1);assert(pm_sequence_next(7)==-1&&v[0]==84);
 puts("PASS: 232 exact chord shapes; native grid/context; root isolation; stock locks and SAMPLE; bounds; trigless; recording-off");
}
