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

/* Voice governor. Every POLY voice is fetched, resampled, enveloped and mixed
 * in the frame interrupt, so voices take time from every task below it. On a
 * base that runs module code uncached a voice cost about 13 points of CPU on
 * the owner's MKII (23 Oct 2026), and four held notes starved the UI task,
 * whose key-ups would have ended them (#646). pm_govern times each frame's
 * POLY work with stock's frame timer (DTCN3, 132 MHz, about 47,900 counts a
 * frame) and lowers the voice cap when their average passes GOV_BUDGET, when
 * one frame passes GOV_PEAK, or when the UI has not ticked for GOV_STARVED
 * frames whatever the cause; admit() then retires release tails first, then
 * the oldest notes. The cap comes back one voice at a time once a further
 * voice fits for GOV_CALM frames. Single frames vary (about 1.6 render calls a
 * frame), so the share is judged on the average and only the deadline on each
 * frame: with the budget off, six voices took about 34,000 counts in a frame
 * and the frames stopped for good. */
#ifndef POLY_POOL_HOST_TEST
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
#else
extern volatile uint32_t test_timer;
#define DTCN3 test_timer
#endif
#define GOV_FRAME 47900u
#ifndef GOV_BUDGET
#define GOV_BUDGET 19200u       /* the average, 40 % of a frame */
#endif
#define GOV_PEAK 26000u         /* any one frame, about 197 us */
#define GOV_SMOOTH 4u           /* the average follows about 16 frames */
#define GOV_STARVED 280u        /* frames, about 100 ms */
#define GOV_CALM 256u           /* frames, about 93 ms */
volatile uint32_t pm_voice_cap=POOL_CAPACITY, pm_ui_ticks=0;
volatile uint32_t pm_gov_sheds=0, pm_gov_starved=0, pm_gov_peak=0, pm_gov_total=0;
volatile uint32_t pm_gov_cost[POOL_CAPACITY+1]={0}; /* the last frame's counts by voices rendered, for diagnostics */
static uint32_t win_start=0, win_cost=0, win_voices=0, seen_ticks=0, starved=0, calm=0, mean16=0;

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
        if(!count || (count+incoming<=pm_voice_cap && cost+incoming_cost<=FETCH_BUDGET)) return;
        retire(oldest);
    }
}
void pm_enforce_budget(unsigned track) {
    if(track>=8 || budget_tuning[track]==poly_track_inc[track]) return;
    budget_tuning[track]=poly_track_inc[track]; admit(0,0);
}

/* One frame's POLY work, `cost` counts with `voices` rendered at most. */
static void judge(uint32_t cost, unsigned voices) {
    if(cost>pm_gov_peak) pm_gov_peak=cost;
    if(voices<=POOL_CAPACITY) pm_gov_cost[voices]=cost;
    mean16+=cost-(mean16>>GOV_SMOOTH);           /* 16 times the average */
    uint32_t mean=mean16>>GOV_SMOOTH;
    if(pm_ui_ticks!=seen_ticks) seen_ticks=pm_ui_ticks, starved=0;
    else if(starved<GOV_STARVED) ++starved;
    if(cost>GOV_PEAK || mean>GOV_BUDGET || starved>=GOV_STARVED) {
        if(starved>=GOV_STARVED) ++pm_gov_starved, starved=0;
        if(voices>1) {
            if(voices-1<pm_voice_cap) pm_voice_cap=voices-1;
            ++pm_gov_sheds; admit(0,0);
            mean16=mean16/voices*(voices-1);       /* what the remaining voices cost */
        }
        calm=0;
        return;
    }
    /* Raise the cap only while it binds and one more voice of this frame's
     * average cost would still fit both limits, with an eighth to spare. */
    if(pm_voice_cap>=POOL_CAPACITY || voices<pm_voice_cap
       || mean+mean/voices>GOV_BUDGET-GOV_BUDGET/8u || cost+cost/voices>GOV_PEAK-GOV_PEAK/8u) { calm=0; return; }
    if(++calm>=GOV_CALM) { ++pm_voice_cap; calm=0; }
}
/* Called by the renderer after each POLY track's chunk, with the frame timer
 * read at its start. The calls of one frame (about 362.8 us apart) add up. */
void pm_govern(uint32_t start, unsigned voices) {
    uint32_t cost=DTCN3-start;
    pm_gov_total+=cost;                /* all POLY render time, for diagnostics */
    if(voices && start-win_start<GOV_FRAME/2u) {
        win_cost+=cost; if(voices>win_voices) win_voices=voices;
        return;
    }
    if(win_voices) judge(win_cost, win_voices);
    win_start=start; win_cost=cost; win_voices=voices;
}
/* The common trigger already masks audio interrupts. Reserve an extension
 * for its previous primary after making room for the new head. */
int pm_reserve(unsigned track) {
    if(track>=8) return -1;
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
    if(PRIMARY[track][0] && poly_primary_note[track]==key) {
        poly_primary_note[track]=255;
        if(poly_env_stage[track]) poly_env_stage[track]=3;
    }
    for(unsigned i=0;i<EXTRA_CAPACITY;++i)
        if(poly_extra_voices[i][0] && poly_extra_track[i]==track && poly_extra_note[i]==key) {
            poly_extra_note[i]=255;
            if(poly_env_stage[i+8]) poly_env_stage[i+8]=3;
        }
}

/* Sequencer/grid triggers have no key-up owner. End the previous chord's
 * hold on the next native trigger so finite REL can run even with HOLD=INF.
 * Call once before expanding the new chord, never between its notes. Live
 * presses retain independent ownership and must not release sequenced heads.
 */
void pm_sequence_retrigger(unsigned track) {
    if(track>=8 || poly_pending_key[track]!=255) return;
    pm_release_head(track,255);
}
