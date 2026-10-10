/* SPDX-License-Identifier: MIT
 * Fixed storage; only playback heads are allocated, never AMP or FX chains.
 * Eight stock primary records are entry bridges. Up to 31 extension records
 * retain fixed storage from the earlier 32-head experiment. This hardware
 * test admits eight active heads and a pitch-weighted fetch budget. */
#include <stdint.h>
#define POOL_CAPACITY 8u
#define EXTRA_CAPACITY 31u
#define FETCH_BUDGET 40u
#define RECORD_SIZE 168u
#ifndef POLY_POOL_HOST_TEST
#define PRIMARY ((volatile uint8_t (*)[RECORD_SIZE])(uintptr_t)0x800049d8u)
#else
extern volatile uint8_t test_primary[8][RECORD_SIZE];
#define PRIMARY test_primary
#endif
extern volatile uint8_t poly_extra_voices[EXTRA_CAPACITY][RECORD_SIZE];
extern volatile uint8_t poly_extra_track[EXTRA_CAPACITY];
extern volatile uint8_t poly_primary_note[8], poly_extra_note[EXTRA_CAPACITY];
extern volatile uint8_t poly_held[8][64], poly_chord_count[8];
extern volatile uint8_t poly_armed_key[8], poly_pending_key[8];
extern volatile uint8_t poly_released[8], poly_env_stage[39];
extern unsigned pm_is_poly_track(unsigned track);
extern volatile uint32_t poly_track_inc[8];
extern volatile int8_t poly_primary_shift[8], poly_extra_shift[31], poly_pending_shift[8];
static uint32_t budget_tuning[8]={0};
static uint32_t primary_age[8]={0}, extra_age[EXTRA_CAPACITY]={0}, serial=0;
static uint8_t dirty[8]={0};
volatile uint32_t poly_extra_mask[8]={0};

void pm_clear_extensions(unsigned track) {
    if(track>=8 || !dirty[track]) return;
    for(unsigned i=0;i<EXTRA_CAPACITY;++i) if(poly_extra_track[i]==track) {
        poly_extra_voices[i][0]=0; poly_extra_track[i]=255; poly_extra_note[i]=255;
    }
    poly_extra_mask[track]=0;
    poly_primary_note[track]=255;
    for(unsigned i=0;i<64;++i) poly_held[track][i]=255;
    poly_chord_count[track]=0;
    poly_armed_key[track]=poly_pending_key[track]=255;
    poly_released[track]=0;
    dirty[track]=0;
}

/* One unit for fixed interpolation/mixing work plus a conservative source
 * fetch ratio. Positive note octaves round upward; ratios saturate at the
 * renderer's 32x limit. Recheck when tuning changes, including LFO changes.
 */
static unsigned head_cost(unsigned track,int shift) {
    uint32_t inc=poly_track_inc[track];
    unsigned ratio=(inc>>26)+!!(inc&0x3ffffffu);
    if(!ratio) ratio=1;
    if(shift>0) { unsigned oct=((unsigned)shift+11u)/12u; ratio=oct>=5?32:ratio<<oct; }
    if(ratio>32) ratio=32;
    return 1u+ratio;
}
static void retire(unsigned head) {
    if(head<8) { PRIMARY[head][0]=0; poly_primary_note[head]=255; }
    else { unsigned i=head-8;
        if(poly_extra_track[i]<8) poly_extra_mask[poly_extra_track[i]]&=~(1u<<(i+1));
        poly_extra_voices[i][0]=0; poly_extra_note[i]=255;
    }
}
/* A trigger with no owning key (the sequencer) restarts a sounding voice of
 * the same pitch on its track instead of stacking a copy. At HOLD INF no
 * key-up ends such a voice, so a one-note pattern would otherwise add a voice
 * every step until all eight sound, about 20k ColdFire instructions a frame.
 * Keyed voices (panel, MIDI) and other pitches are untouched. */
static void restart_same_pitch(unsigned track) {
    int8_t shift=poly_pending_shift[track];
    if(poly_pending_key[track]!=255) return;
    if(PRIMARY[track][0] && poly_primary_note[track]==255 && poly_primary_shift[track]==shift) retire(track);
    for(unsigned i=0;i<EXTRA_CAPACITY;++i)
        if(poly_extra_voices[i][0] && poly_extra_track[i]==track && poly_extra_note[i]==255 && poly_extra_shift[i]==shift) retire(i+8);
}
/* Release tails yield before held notes; age breaks ties across all tracks.
 * This loop is bounded by the 39 physical records, independent of input rate.
 */
static void admit(unsigned incoming,unsigned incoming_cost) {
    for(;;) {
        unsigned count=0,cost=0,oldest=0,released=0; uint32_t age=0;
        for(unsigned head=0;head<39;++head) {
            unsigned t; uint32_t born; int shift;
            if(head<8) {
                t=head; if(!PRIMARY[t][0] || !pm_is_poly_track(t)) continue;
                born=primary_age[t]; shift=poly_primary_shift[t];
            } else {
                unsigned i=head-8; t=poly_extra_track[i];
                if(!poly_extra_voices[i][0]) continue;
                if(t>=8 || !pm_is_poly_track(t)) { retire(head); continue; }
                born=extra_age[i]; shift=poly_extra_shift[i];
            }
            unsigned tail=poly_env_stage[head]==3; uint32_t distance=serial-born;
            if(!count || tail>released || (tail==released && distance>age)) {
                oldest=head; released=tail; age=distance;
            }
            ++count; cost+=head_cost(t,shift);
        }
        if(!count || (count+incoming<=POOL_CAPACITY && cost+incoming_cost<=FETCH_BUDGET)) return;
        retire(oldest);
    }
}
void pm_enforce_budget(unsigned track) {
    if(track>=8 || budget_tuning[track]==poly_track_inc[track]) return;
    budget_tuning[track]=poly_track_inc[track]; admit(0,0);
}
/* The common trigger already masks audio interrupts. Reserve an extension
 * for its previous primary after making room for the new head. */
int pm_reserve(unsigned track) {
    if(track>=8) return -1;
    restart_same_pitch(track);
    uint32_t now=++serial;
    admit(1,head_cost(track,poly_pending_shift[track]));
    int slot=-1;
    if(PRIMARY[track][0]) for(unsigned i=0;i<EXTRA_CAPACITY;++i)
        if(!poly_extra_voices[i][0]) {
            slot=(int)i;
            if(poly_extra_track[i]<8) poly_extra_mask[poly_extra_track[i]]&=~(1u<<(i+1));
            poly_extra_track[i]=(uint8_t)track; poly_extra_mask[track]|=1u<<(i+1);
            extra_age[i]=primary_age[track]; break;
        }
    primary_age[track]=now; dirty[track]=1;
    return slot;
}

/* Each owner releases only its preallocated envelope. The audio loop returns
 * that head to the shared pool when the release becomes inaudible. */
void pm_release_head(unsigned track,unsigned key) {
    if(track>=8) return;
    if(poly_primary_note[track]==key) {
        poly_primary_note[track]=255;
        if(poly_env_stage[track]) poly_env_stage[track]=3;
    }
    for(unsigned i=0;i<EXTRA_CAPACITY;++i)
        if(poly_extra_track[i]==track && poly_extra_note[i]==key) {
            poly_extra_note[i]=255;
            if(poly_env_stage[i+8]) poly_env_stage[i+8]=3;
        }
}
