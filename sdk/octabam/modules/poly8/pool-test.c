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
volatile uint32_t test_timer;
volatile int8_t poly_primary_shift[8],poly_extra_shift[31],poly_pending_shift[8];
static unsigned enabled[8]={1,1,1,1,1,1,1,1};
unsigned pm_is_poly_track(unsigned t){return enabled[t];}
static unsigned active(void){unsigned n=0;for(unsigned i=0;i<8;i++)n+=!!test_primary[i][0];for(unsigned i=0;i<31;i++)n+=!!poly_extra_voices[i][0];return n;}
static void trigger(unsigned t,unsigned key){int s=pm_reserve(t);if(s>=0){memcpy((void*)poly_extra_voices[s],(void*)test_primary[t],168);poly_extra_note[s]=poly_primary_note[t];poly_env_stage[s+8]=poly_env_stage[t];}test_primary[t][0]=1;poly_primary_note[t]=key;poly_env_stage[t]=1;}
static void clear(void){for(unsigned t=0;t<8;t++){pm_clear_extensions(t);test_primary[t][0]=0;}memset((void*)poly_held,255,sizeof(poly_held));}
int main(void){
 clear();for(unsigned i=0;i<8;i++){trigger(0,i);assert(active()==i+1);}assert(test_primary[0][0]);for(unsigned i=0;i<7;i++)assert(poly_extra_track[i]==0);
 trigger(1,64);assert(active()==8);assert(test_primary[1][0]);assert(poly_extra_note[0]==255); // oldest moved head
 for(unsigned i=0;i<10000;i++){trigger((i*7)%8,i%127);assert(active()==8);}
 clear();for(unsigned t=0;t<8;t++)trigger(t,t);assert(active()==8);trigger(2,90);assert(active()==8);assert(!test_primary[0][0]); // oldest primary stolen
 clear();poly_held[0][0]=72;trigger(0,72);poly_held[0][1]=84;trigger(0,84);assert(active()==2);
 pm_release_head(0,84);assert(active()==2);assert(poly_env_stage[0]==3);assert(poly_env_stage[8]==1);
 pm_release_head(0,72);assert(active()==2);assert(poly_env_stage[8]==3);
 clear();trigger(0,255);trigger(0,255);trigger(0,72);trigger(1,255);
 poly_pending_key[0]=73;pm_sequence_retrigger(0);assert(poly_env_stage[8]==1&&poly_env_stage[9]==1);
 poly_pending_key[0]=255;pm_sequence_retrigger(0);
 assert(poly_env_stage[8]==3&&poly_env_stage[9]==3);assert(poly_env_stage[0]==1&&poly_primary_note[0]==72);assert(poly_env_stage[1]==1);
 trigger(0,255);assert(poly_env_stage[0]==1); // incoming chord starts after the one release pass
 test_primary[0][0]=0;poly_env_stage[0]=2;poly_extra_voices[0][0]=0;poly_env_stage[8]=2;
 pm_sequence_retrigger(0);pm_sequence_retrigger(8);assert(poly_env_stage[0]==2&&poly_env_stage[8]==2); // inactive records stay untouched
 clear();for(unsigned i=0;i<8;++i)trigger(0,i);pm_release_head(0,6);trigger(1,90);assert(active()==8);for(unsigned i=0;i<31;++i)assert(poly_extra_note[i]!=6);assert(poly_extra_note[0]==0); // release tail before oldest held
 poly_track_inc[0]=0x7fffffff;poly_track_inc[1]=0x7fffffff;pm_enforce_budget(0);assert(active()<=1);poly_track_inc[0]=poly_track_inc[1]=0x4000000;
 clear();trigger(0,10);trigger(0,11);enabled[0]=0;trigger(1,12);assert(!poly_extra_voices[0][0]);enabled[0]=1;clear();assert(active()==0);
 /* Voice governor: one frame past the peak sheds at once, an average past the budget sheds after it builds up,
    calls within half a frame add up, a calm stretch raises the cap again, and a UI that stops ticking sheds
    whatever the cost. */
 clear();for(unsigned i=0;i<4;++i)trigger(0,i);assert(active()==4);
 uint32_t t=100000;pm_ui_ticks=1;
 #define FRAME(cost,voices) do{test_timer=t+(cost);pm_govern(t,voices);t+=GOV_FRAME;++pm_ui_ticks;}while(0)
 FRAME(GOV_PEAK+1,4);FRAME(1000,4);assert(pm_voice_cap==3&&active()==3&&pm_gov_sheds==1);
 trigger(0,9);assert(active()==3); // a new note steals within the cap
 for(unsigned i=0;i<64&&pm_voice_cap==3;++i){FRAME(GOV_BUDGET+GOV_BUDGET/4,3);}
 assert(pm_voice_cap==2&&active()==2&&pm_gov_sheds==2); // the average went over
 for(unsigned i=0;i<64;++i){FRAME(GOV_BUDGET-GOV_BUDGET/4,2);} assert(pm_voice_cap==2); // no room for a third
 for(unsigned i=0;i<2*GOV_CALM;++i){test_timer=t+2000;pm_govern(t,2);test_timer=t+4000;pm_govern(t+2000,2);t+=GOV_FRAME;++pm_ui_ticks;}
 assert(pm_voice_cap==3); // two calls a frame, 4000 in all: room again
 for(unsigned i=0;i<2*GOV_CALM;++i){FRAME(2000,2);} assert(pm_voice_cap==3); // a cap that does not bind stays
 trigger(0,10);trigger(0,11);assert(active()==3);
 for(unsigned i=0;i<GOV_STARVED+2;++i){test_timer=t+1000;pm_govern(t,3);t+=GOV_FRAME;} // the UI stands still
 assert(pm_voice_cap==2&&active()==2&&pm_gov_starved==1);
 for(unsigned i=0;i<4*GOV_STARVED;++i){FRAME(1000,2);} assert(pm_gov_starved==1&&pm_voice_cap>=2); // it ticks again
 pm_voice_cap=POOL_CAPACITY;
 puts("PASS: eight-head bound; 10,000 cross-track steals; release tails first; pitch-work bound; independent release; sequence retrigger and live/track isolation; machine cleanup; voice governor (frame peak, average budget, frame sums, calm recovery, UI starvation)");
}
