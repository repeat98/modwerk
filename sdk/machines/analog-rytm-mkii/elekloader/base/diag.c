// SPDX-License-Identifier: GPL-3.0-or-later
// Every base (base.json's common): the unit's diagnostics log, in the Octatrack's layout (diag.h), filled from what
// the Rytm base sees: the audio load (load.c, from the CPU mark's sums), the time between UI ticks, the keys pressed and
// whether the sequencer plays. Numbers and stock key codes only: no names, patterns or audio. The link's DIAG names
// its place (link.c). The Model:Cycles' base (durchgemacht) keeps the same log; this is its design with the Rytm's
// clock and context.
//
// All of it runs on the UI task, nothing in the audio interrupt: the windows come from the CPU mark's look (load.c),
// the UI's own stalls from DMA timer 0 between ticks. A stall is logged when the UI comes back, which costs nothing
// here: the link answers from the UI tick too, so a stalled UI could not be read before it came back anyway.
#include <stdint.h>
#include "diag.h"

#ifdef MODWERK_HOST /* test_diag.c */
extern volatile int mw_test_playing;
extern volatile uint32_t mw_test_timer;
#define SEQ_PLAYING mw_test_playing
#define DTCN0 mw_test_timer
#else
#define SEQ_PLAYING (*(volatile int *)SEQ_PLAYING_AT)
#define DTCN0 (*(volatile uint32_t *)0xfc07000c)   // the core's timer (core-ar2/load.s)
#endif

#define BLOCKS_A_SECOND 1500u    // 32 frames at 48 kHz: the audio's own clock, for every time the log keeps
#define WINDOWS 600u             // half-second looks in a load record: about five minutes
#define FREEZE_BLOCKS 7500u      // five seconds without a UI tick: longer than a project load
#define HOT 900u                 // per mille
#define HOT_GAP 1200u            // looks between two HOT incidents: ten minutes
#define SETTLED 120u             // no HOT in the first minute
#define CALIBRATE_MIN 300u       // a look gives a block's length only when it is about a normal one (a fifth to four
#define CALIBRATE_MAX 3000u      //   times half a second), and once one has, only within a quarter of it: a block's
                                 //   length in timer counts never changes, so a look across a stall past the timer's
                                 //   wrap (about 32 s) or one where audio ran part of the time cannot move it

volatile struct diag_log mw_diag_log;
#define LOG (&mw_diag_log)

static uint8_t keys[16];
static uint32_t key_count, blocks, windows, last_avg;
static uint32_t w_sum, w_peak, w_n, w_played, w_tickgap, hot_run, hot_at;
static uint32_t look_at, tick_at, block_counts;   // DMA timer 0 at the last look and tick; its counts in one block

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
static void add(unsigned kind, uint32_t a)
{
    volatile struct diag_incident *r = &LOG->incident[LOG->incidents % DIAG_INCIDENTS];
    r->seq = 0;                         // 0 while written, set last
    context(r, kind);
    r->boot = LOG->boot, r->second = blocks / BLOCKS_A_SECOND, r->a = a;
    LOG->seq = LOG->seq + 1u;
    r->seq = LOG->seq;
    LOG->incidents = LOG->incidents + 1u;
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
    // The counts start again with the log (at boot they are zero already, the core having cleared .bss).
    key_count = blocks = windows = last_avg = 0;
    w_sum = w_peak = w_n = w_played = w_tickgap = hot_run = hot_at = 0;
    look_at = tick_at = block_counts = 0;
}

// load.c, on the UI task, at each of the CPU mark's looks: the look's mean and dearest block (per mille) and its
// audio blocks. The timer between two looks over their blocks gives a block's length in timer counts, for the stalls.
void mw_diag_window(uint32_t avg, uint32_t wmax, uint32_t n)
{
    uint32_t w, now = DTCN0;
    if (LOG->magic != DIAG_MAGIC)
        return;
    if (look_at && n >= CALIBRATE_MIN && n <= CALIBRATE_MAX) {
        uint32_t c = (now - look_at) / n;
        if (!block_counts || (c > block_counts - block_counts / 4u && c < block_counts + block_counts / 4u))
            block_counts = c;
    }
    look_at = now;
    if (!n)
        return;                         // a look without audio blocks: only its time counts
    w = ++windows;
    blocks += n;
    last_avg = avg;
    w_sum += avg;
    if (wmax > w_peak)
        w_peak = wmax;
    if (SEQ_PLAYING)
        w_played++;
    if (avg >= HOT) {
        if (++hot_run >= 2 && w > SETTLED && (!hot_at || w - hot_at >= HOT_GAP)) {
            hot_at = w;                 // >= 2: a load hot from boot, or past HOT_GAP, still logs
            add(DIAG_HOT, hot_run);
        }
    } else
        hot_run = 0;
    if (++w_n < WINDOWS)
        return;
    {
        volatile struct diag_load *r = &LOG->load[LOG->loads % DIAG_LOADS];
        r->seq = 0;
        r->boot = LOG->boot, r->minute = w / 120u;
        r->cpu_mean = (uint16_t)(w_sum / w_n), r->cpu_peak = (uint16_t)(w_peak > 0xffffu ? 0xffffu : w_peak);
        r->dsp0_mean = r->dsp0_peak = r->dsp1_mean = r->dsp1_peak = 0;
        r->samples = (uint16_t)w_n, r->playing = (uint16_t)w_played;
        r->frame_gap = 0;               // not measured: only the audio interrupt sees the blocks' spacing
        r->tick_gap = (uint16_t)(w_tickgap > 0xffffu ? 0xffffu : w_tickgap);
        LOG->seq = LOG->seq + 1u;
        r->seq = LOG->seq;
        LOG->loads = LOG->loads + 1u;
    }
    w_sum = w_peak = w_n = w_played = w_tickgap = 0;
}

// ev_tick: a stall of the UI since the last tick, in audio blocks, once a look has given a block's length; five
// seconds or more is a FREEZE, logged now that the UI is back (a: the blocks it stood still).
void mw_diag_tick(void *ctrl)
{
    uint32_t now = DTCN0;
    (void)ctrl;
    if (LOG->magic != DIAG_MAGIC)
        return;
    if (!started) {
        started = 1;
        // The core starts DMA timer 0 from 0 at every boot and the gate's CRC takes the same time each boot, so the
        // gate's nonce repeats from one power-up to the next; stock's boot and project load before this tick do not
        // take the same time twice. The site keys the records it has taken on the nonce.
        LOG->nonce = LOG->nonce ^ now * 2654435761u;
        add(DIAG_START, 0);
        add(DIAG_BASE, start_crc);
    } else if (block_counts) {
        uint32_t gap = (now - tick_at) / block_counts;
        if (gap > w_tickgap)
            w_tickgap = gap;
        if (gap >= FREEZE_BLOCKS)
            add(DIAG_FREEZE, gap);
    }
    tick_at = now;
}

// ev_key, before the link's: remembers each press, takes none.
int mw_diag_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    (void)brain;
    if (flags & 1) {
        keys[key_count % 16u] = (uint8_t)key;
        key_count++;
    }
    return 0;
}
