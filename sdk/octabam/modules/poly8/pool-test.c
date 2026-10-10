/* SPDX-License-Identifier: MIT */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define POLY_POOL_HOST_TEST
#include "pool.c"
volatile uint8_t test_primary[8][168],poly_extra_voices[31][168];
volatile uint8_t poly_extra_track[31],poly_primary_note[8],poly_extra_note[31];
volatile uint8_t poly_held[8][64],poly_chord_count[8],poly_armed_key[8],poly_pending_key[8],poly_released[8];
volatile uint8_t poly_env_stage[39];
volatile uint32_t poly_track_inc[8];
volatile int8_t poly_primary_shift[8],poly_extra_shift[31],poly_pending_shift[8];
static unsigned enabled[8]={1,1,1,1,1,1,1,1};
unsigned pm_is_poly_track(unsigned t){return enabled[t];}
static unsigned active(void){unsigned n=0;for(unsigned i=0;i<8;i++)n+=!!test_primary[i][0];for(unsigned i=0;i<31;i++)n+=!!poly_extra_voices[i][0];return n;}
static void trigger(unsigned t,unsigned key){int s=pm_reserve(t);if(s>=0){memcpy((void*)poly_extra_voices[s],(void*)test_primary[t],168);poly_extra_note[s]=poly_primary_note[t];poly_env_stage[s+8]=poly_env_stage[t];}test_primary[t][0]=1;poly_primary_note[t]=key;poly_env_stage[t]=1;}
static void seq(unsigned t,int8_t shift){poly_pending_key[t]=255;poly_pending_shift[t]=shift;int s=pm_reserve(t);if(s>=0){memcpy((void*)poly_extra_voices[s],(void*)test_primary[t],168);poly_extra_note[s]=poly_primary_note[t];poly_extra_shift[s]=poly_primary_shift[t];poly_env_stage[s+8]=poly_env_stage[t];}test_primary[t][0]=1;poly_primary_note[t]=255;poly_primary_shift[t]=shift;poly_env_stage[t]=1;}
static void clear(void){for(unsigned t=0;t<8;t++){pm_clear_extensions(t);test_primary[t][0]=0;}memset((void*)poly_held,255,sizeof(poly_held));}
int main(void){
 clear();for(unsigned i=0;i<8;i++){trigger(0,i);assert(active()==i+1);}assert(test_primary[0][0]);for(unsigned i=0;i<7;i++)assert(poly_extra_track[i]==0);
 trigger(1,64);assert(active()==8);assert(test_primary[1][0]);assert(poly_extra_note[0]==255); // oldest moved head
 for(unsigned i=0;i<10000;i++){trigger((i*7)%8,i%127);assert(active()==8);}
 clear();for(unsigned t=0;t<8;t++)trigger(t,t);assert(active()==8);trigger(2,90);assert(active()==8);assert(!test_primary[0][0]); // oldest primary stolen
 clear();poly_held[0][0]=72;trigger(0,72);poly_held[0][1]=84;trigger(0,84);assert(active()==2);
 pm_release_head(0,84);assert(active()==2);assert(poly_env_stage[0]==3);assert(poly_env_stage[8]==1);
 pm_release_head(0,72);assert(active()==2);assert(poly_env_stage[8]==3);
 clear();for(unsigned i=0;i<8;++i)trigger(0,i);pm_release_head(0,6);trigger(1,90);assert(active()==8);for(unsigned i=0;i<31;++i)assert(poly_extra_note[i]!=6);assert(poly_extra_note[0]==0); // release tail before oldest held
 poly_track_inc[0]=0x7fffffff;poly_track_inc[1]=0x7fffffff;pm_enforce_budget(0);assert(active()<=1);poly_track_inc[0]=poly_track_inc[1]=0x4000000;
 clear();trigger(0,10);trigger(0,11);enabled[0]=0;trigger(1,12);assert(!poly_extra_voices[0][0]);enabled[0]=1;clear();assert(active()==0);
 clear();for(unsigned i=0;i<100;i++){seq(0,0);assert(active()==1);} // one-note pattern: one voice, not eight
 clear();for(unsigned i=0;i<100;i++){seq(0,0);seq(0,4);seq(0,7);assert(i<1||active()==3);} // repeated chord: three voices
 clear();seq(0,0);seq(0,5);assert(active()==2);seq(0,0);assert(active()==2);seq(1,0);assert(active()==3);seq(1,0);assert(active()==3); // per pitch and per track
 clear();poly_pending_key[0]=72;trigger(0,72);assert(active()==1);seq(0,0);assert(active()==2);seq(0,0);assert(active()==2); // keyed voices stay, unkeyed restarts
 puts("PASS: eight-head bound; 10,000 cross-track steals; release tails first; pitch-work bound; sequencer retrigger restarts instead of stacking; independent release; machine cleanup");
}
