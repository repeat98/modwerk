// SPDX-License-Identifier: GPL-3.0-or-later
// Every base (base.json's common): the unit's diagnostics log, in the Octatrack's layout (diag.h), filled from what
// the Rytm base sees: the audio load (load.c), the time between audio blocks, the UI tick, the keys pressed and whether
// the sequencer plays. Numbers and stock key codes only: no names, patterns or audio. The link's DIAG names its place
// (link.c). The Model:Cycles' base (durchgemacht) keeps the same log the same way; this is its code with the Rytm's
// clock and context.
//
// Two sides write it. The audio interrupt (mw_diag_block, mw_diag_window) keeps the five-minute sums, the gaps and a
// freeze; the UI tick (mw_diag_tick) alone writes the rings, as the Octatrack's does, so a reader never meets half a
// record: a record's seq is 0 while it is written and set last.
#include <stdint.h>
#include "diag.h"

#ifdef MODWERK_HOST /* test_diag.c */
extern volatile int mw_test_playing;
#define SEQ_PLAYING mw_test_playing
#else
#define SEQ_PLAYING (*(volatile int *)SEQ_PLAYING_AT)
#endif

#define BLOCKS_A_SECOND 1500u    // 32 frames at 48 kHz: the audio's own clock, for every time the log keeps
#define CAL_BLOCKS 1500u         // a second of block gaps gives the timer's counts a block
#define GAP_BLOCKS 98u           // a gap this many blocks long is past 65,535 µs
#define WINDOWS 600u             // half-second windows in a load record: five minutes
#define FREEZE_BLOCKS 7500u      // five seconds of audio blocks without a UI tick: longer than a project load
#define HOT 900u                 // per mille
#define HOT_GAP 1200u            // windows between two HOT incidents: ten minutes
#define SETTLED 120u             // no HOT in the first minute

volatile struct diag_log mw_diag_log;
#define LOG (&mw_diag_log)

static volatile uint8_t keys[16];
static volatile uint32_t key_count, ticks, blocks;
// The audio interrupt's side.
static uint32_t last_start, since_tick, seen_ticks, w_sum, w_peak, w_n, w_played, w_gap, w_tickgap, hot_run, hot_at;
static uint32_t cal_sum, cal_n, block_counts;   // the timer's counts in one block, from the last second's gaps
static volatile uint32_t windows, last_avg;
static volatile uint32_t hot_due;                // half-seconds hot, for the tick to log; 0 none
static volatile uint32_t freeze_blocks;          // the freeze record's length so far; the tick logs it when it ends
// A finished load record, for the tick to put in the ring.
static volatile uint32_t done_seq;
static uint32_t taken_seq;
static volatile struct diag_load done;

static void context(volatile struct diag_incident *r, unsigned kind)
{
    uint32_t k = key_count;
    unsigned i;
    for (i = 0; i < sizeof *r; i++)
        ((volatile uint8_t *)r)[i] = 0;
    r->kind = (uint16_t)kind;
    r->cpu = (uint16_t)last_avg;
    r->playing = SEQ_PLAYING != 0;
    for (i = 0; i < 16u; i++)
        r->keys[i] = k + i >= 16u ? keys[(k + i) % 16u] : 0xffu;
}
static volatile struct diag_incident *slot(void)
{
    volatile struct diag_incident *r = &LOG->incident[LOG->incidents % DIAG_INCIDENTS];
    r->seq = 0;
    return r;
}
static void push(volatile struct diag_incident *r)
{
    LOG->seq = LOG->seq + 1u;
    r->seq = LOG->seq;
    LOG->incidents = LOG->incidents + 1u;
}
static void add(unsigned kind, uint32_t a)
{
    volatile struct diag_incident *r = slot();
    context(r, kind);
    r->boot = LOG->boot, r->second = blocks / BLOCKS_A_SECOND, r->a = a;
    push(r);
}

// link.c's boot gate: a new log. Its START and the set this boot runs follow at the first tick, once stock runs.
static uint32_t start_crc, started;
void mw_diag_start(uint32_t nonce, uint32_t set_crc)
{
    unsigned i;
    for (i = 0; i < sizeof *LOG; i++)
        ((volatile uint8_t *)LOG)[i] = 0;
    LOG->nonce = nonce, LOG->boot = 1;
    LOG->version = DIAG_VERSION, LOG->magic = DIAG_MAGIC;
    start_crc = set_crc, started = 0;
}

// Each audio block, from the audio interrupt: when it ended, and whether the UI ticked since the last one.
void mw_diag_block(uint32_t start)
{
    uint32_t gap = start - last_start, t = ticks;
    last_start = start;
    if (blocks++) {                    // the first block has no block before it
        if (gap > w_gap)
            w_gap = gap;
        cal_sum += gap;
        if (++cal_n == CAL_BLOCKS) {
            block_counts = cal_sum / CAL_BLOCKS;
            cal_sum = cal_n = 0;
        }
    }
    if (t != seen_ticks || !t) {       // the UI ticked, or has not started yet
        seen_ticks = t;
        since_tick = 0;
        return;
    }
    if (++since_tick > w_tickgap)
        w_tickgap = since_tick;
    if (since_tick == FREEZE_BLOCKS && !LOG->freeze_state) {
        context(&LOG->freeze, DIAG_FREEZE);
        LOG->freeze.boot = LOG->boot, LOG->freeze.second = blocks / BLOCKS_A_SECOND;
        freeze_blocks = 0;
        LOG->freeze_state = 1;
    }
    if (LOG->freeze_state == 1)
        freeze_blocks = since_tick;
}

// A gap in the timer's counts as µs, a block being 2000/3 µs: 0 before the first second has given the block's length.
static uint16_t gap_us(uint32_t gap, uint32_t per_block)
{
    uint32_t div = per_block * 3u / 16u;
    if (!div)
        return 0;
    if (gap / per_block >= GAP_BLOCKS)
        return 0xffffu;
    gap = gap * 125u / div;            // gap * 2000 / (3 * per_block); under 2^32 below GAP_BLOCKS
    return (uint16_t)(gap > 0xffffu ? 0xffffu : gap);
}

// Each half-second window, from the audio interrupt (load.c): its share and dearest block, per mille.
void mw_diag_window(uint32_t avg, uint32_t wmax)
{
    uint32_t w = ++windows;
    last_avg = avg;
    w_sum += avg;
    if (wmax > w_peak)
        w_peak = wmax;
    if (SEQ_PLAYING)
        w_played++;
    if (avg >= HOT) {
        if (++hot_run == 2 && w > SETTLED && (!hot_at || w - hot_at >= HOT_GAP))
            hot_at = w, hot_due = hot_run;
    } else
        hot_run = 0;
    if (++w_n < WINDOWS)
        return;
    done.minute = w / 120u;
    done.cpu_mean = (uint16_t)(w_sum / w_n), done.cpu_peak = (uint16_t)(w_peak > 0xffffu ? 0xffffu : w_peak);
    done.samples = (uint16_t)w_n, done.playing = (uint16_t)w_played;
    done.frame_gap = gap_us(w_gap, block_counts);
    done.tick_gap = (uint16_t)(w_tickgap > 0xffffu ? 0xffffu : w_tickgap);
    done_seq = done_seq + 1u;
    w_sum = w_peak = w_n = w_played = w_gap = w_tickgap = 0;
}

// ev_tick: the UI task's side, which alone writes the rings.
void mw_diag_tick(void *ctrl)
{
    (void)ctrl;
    ticks = ticks + 1u;
    if (LOG->magic != DIAG_MAGIC)
        return;
    if (!started) {
        started = 1;
        add(DIAG_START, 0);
        add(DIAG_BASE, start_crc);
    }
    if (LOG->freeze_state == 1) {          // the UI stood still and came back: how long, in audio blocks
        volatile struct diag_incident *r = slot();
        const volatile uint8_t *from = (const volatile uint8_t *)&LOG->freeze;
        unsigned i;
        LOG->freeze.a = freeze_blocks;
        for (i = sizeof r->seq; i < sizeof *r; i++)
            ((volatile uint8_t *)r)[i] = from[i];
        push(r);
        LOG->freeze_state = 0;
    }
    if (hot_due) {
        add(DIAG_HOT, hot_due);
        hot_due = 0;
    }
    if (done_seq != taken_seq) {
        volatile struct diag_load *r = &LOG->load[LOG->loads % DIAG_LOADS];
        taken_seq = done_seq;
        r->seq = 0;
        r->boot = LOG->boot, r->minute = done.minute;
        r->cpu_mean = done.cpu_mean, r->cpu_peak = done.cpu_peak;
        r->dsp0_mean = r->dsp0_peak = r->dsp1_mean = r->dsp1_peak = 0;
        r->samples = done.samples, r->playing = done.playing;
        r->frame_gap = done.frame_gap, r->tick_gap = done.tick_gap;
        LOG->seq = LOG->seq + 1u;
        r->seq = LOG->seq;
        LOG->loads = LOG->loads + 1u;
    }
}

// ev_key, before the link's: remembers each press, takes none.
int mw_diag_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    (void)brain;
    if (flags & 1) {
        uint32_t k = key_count;
        keys[k % 16u] = (uint8_t)key;
        key_count = k + 1u;
    }
    return 0;
}
