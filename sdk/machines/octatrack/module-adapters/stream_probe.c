/* SPDX-License-Identifier: GPL-3.0-or-later
 * Stream probe A, the ColdFire side (stream_probe.py --stream-probe N): development twins only, never for users.
 * module-adapters/stream_probe.py has the design. dsp_hooks.s calls the first three from the frame transfer's
 * state 7, in the eDMA completion interrupt (IPL 6) with the frame interrupt masked: short, no firmware call.
 *
 *   mw_stream_block     the state's first visit: fill the block, save TCD0; its minor loops, 0 for none
 *   mw_stream_complete  the visit the block's completion brings
 *   mw_stream_account   dl_complete, every frame, right before the unmask: TCD0 back, the times kept
 *
 * dev.c request 47 (modwerk_stream_request), wValue: 0 reads; 1 starts sending (and restarts the time windows);
 * 2 stops after one last block that asks the checker for a snapshot; 3 asks the next block for a snapshot, then
 * reads the checker's published words with the loader's PEEK (a bit a packet: read again until 240 bits are in);
 * 4 reads and restarts the time windows. Times are DTCN3 counts (132 MHz, 47,891 a frame) since the frame
 * interrupt's entry (mw_frame_t0); the unmask is kept for frames without a block too, as the baseline. A block whose
 * transfer the watchdog gave up (dsp.c) stops the probe for good. */
#include <stdint.h>

#define WORDS MODWERK_STREAM_WORDS
#define LOOPS (WORDS / 32u)
#define MAGIC 0x5350u
#define DSP_WORDS 10u
#define WINDOWS 5u
#define REPLY_WORDS (16u + 5u * WINDOWS + DSP_WORDS)
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
#define PINS (*(volatile uint8_t *)0xfc094005u) /* EPORT pin levels: bit 1 is core 0's host request */
#define TCD0_SADDR (*(volatile uint32_t *)0xfc045000u)
#define TCD0_NBYTES (*(volatile uint32_t *)0xfc045008u)
#define TCD0_CITER (*(volatile uint16_t *)0xfc045014u)
#define TCD0_BITER (*(volatile uint16_t *)0xfc04501cu)
typedef char whole_minor_loops[WORDS % 32u == 0 && WORDS >= 32u && WORDS <= 160u ? 1 : -1];

uint32_t modwerk_machine_mask(void);
void modwerk_machine_unmask(uint32_t sr);
unsigned mw_stream_block(void);
void mw_stream_complete(void);
void mw_stream_account(void);
void mw_stream_dma_failed(void);
uint32_t modwerk_stream_request(unsigned op, uint8_t *out);
extern volatile uint32_t mw_frame_t0;            /* machine_registry.c: DTCN3 at the frame interrupt's entry */
extern volatile uint32_t dl_early, dl_straddle;  /* dsp_hooks.s: early state-7 visits; loader packets across a frame */

volatile uint16_t mw_stream_tx[WORDS] __attribute__((aligned(16))) = {0}; /* TCD0's inherited 16-byte bursts */
volatile uint32_t mw_stream_started;        /* dsp_hooks.s: DTCN3 right after the block's transfer started */
volatile uint8_t mw_stream_pin_start;       /* ... and the EPORT pins then */
volatile int32_t mw_stream_dsp_wanted;      /* dsp.c peek_tick: read the checker's published words now */
volatile uint32_t mw_stream_dsp_bits, mw_stream_dsp[DSP_WORDS];

static volatile uint32_t armed, stopping, failed, snap_pending, snap_wait, flight; /* flight: 1 sent, 2 snapshot, 4 done */
static volatile uint32_t offered, sent, completed, accounted, straddles, refused, snaps, seq, done_at;
static volatile uint8_t pin_done;
static volatile uint32_t saved_saddr, saved_nbytes;
static volatile uint16_t saved_citer, saved_biter;
struct window { uint32_t min, max, count, hi, lo; };
/* The block's start, its completion, the transfer, the unmask; the unmask in a frame without a block (the baseline). */
static volatile struct window windows[WINDOWS];

static void keep(unsigned k, uint32_t v)
{
    volatile struct window *w = &windows[k];
    if (!w->count || v < w->min) w->min = v;
    if (v > w->max) w->max = v;
    w->count = w->count + 1u;
    uint32_t lo = w->lo + v;
    if (lo < v) w->hi = w->hi + 1u;
    w->lo = lo;
}

unsigned mw_stream_block(void)
{
    if (!armed) return 0;
    offered = offered + 1u;
    if (failed || flight) {
        refused = refused + 1u;
        return 0;
    }
    uint32_t s = (seq + 1u) & 0xffffu, snap = snap_pending || stopping ? 1u : 0u, base = (s & 0xffu) << 8;
    volatile uint32_t *w = (volatile uint32_t *)((uintptr_t)mw_stream_tx + 0x08000000u); /* uncached, as dl_tx */
    seq = s;
    w[0] = (MAGIC | snap) << 16 | s;
    for (unsigned i = 2; i < WORDS; i += 2) w[i / 2u] = (base | i) << 16 | base | (i + 1u);
    saved_saddr = TCD0_SADDR, saved_nbytes = TCD0_NBYTES, saved_citer = TCD0_CITER, saved_biter = TCD0_BITER;
    if (snap) snap_pending = 0;
    if (stopping) stopping = 0, armed = 0;
    flight = 1u | snap << 1;
    sent = sent + 1u;
    return LOOPS;
}

void mw_stream_complete(void)
{
    if (!(flight & 1u) || flight & 4u) return;
    done_at = DTCN3, pin_done = PINS;
    flight = flight | 4u;
    completed = completed + 1u;
}

void mw_stream_account(void)
{
    uint32_t now = DTCN3, t0 = mw_frame_t0, f = flight;
    if (snap_wait) { /* the checker publishes at the frame head after the block lands: read a few frames on */
        snap_wait = snap_wait - 1u;
        if (!snap_wait) mw_stream_dsp_wanted = 1, snaps = snaps + 1u;
    }
    if (!(f & 1u)) {
        keep(4, now - t0);
        return;
    }
    TCD0_SADDR = saved_saddr, TCD0_NBYTES = saved_nbytes, TCD0_CITER = saved_citer, TCD0_BITER = saved_biter;
    if (f & 4u) {
        uint32_t start = mw_stream_started;
        keep(0, start - t0), keep(1, done_at - t0), keep(2, done_at - start);
        if ((mw_stream_pin_start ^ pin_done) & 2u) straddles = straddles + 1u;
    }
    keep(3, now - t0);
    if (f & 2u) snap_wait = 3u;
    flight = 0;
    accounted = accounted + 1u;
}

/* dsp.c's recovery gave the transfer up: send no more. */
void mw_stream_dma_failed(void)
{
    failed = 1u, flight = 0, armed = 0;
}

uint32_t modwerk_stream_request(unsigned op, uint8_t *out)
{
    uint32_t taken = 0;
    if (op == 1u && !failed) armed = 1u, stopping = 0, taken = 1u;
    else if (op == 2u && armed) stopping = 1u, taken = 1u;
    else if (op == 3u && armed && !snap_pending && !snap_wait && !mw_stream_dsp_wanted) snap_pending = 1u, taken = 1u;
    uint32_t v[REPLY_WORDS] = {0x4d575350u, WORDS, armed | stopping << 1 | failed << 2 | snap_pending << 3 |
                               (snap_wait ? 16u : 0u) | (mw_stream_dsp_wanted ? 32u : 0u),
                               offered, sent, completed, accounted, straddles, refused, snaps, seq, dl_early, dl_straddle,
                               mw_stream_dsp_bits, MODWERK_STREAM_COUNTERS, taken};
    uint32_t sr = modwerk_machine_mask(); /* 25 words, well under the frame interrupt's 200 us */
    for (unsigned k = 0; k < WINDOWS; ++k) {
        volatile struct window *w = &windows[k];
        v[16u + 5u * k] = w->min, v[17u + 5u * k] = w->max, v[18u + 5u * k] = w->count;
        v[19u + 5u * k] = w->hi, v[20u + 5u * k] = w->lo;
        if (op == 1u || op == 4u) w->min = w->max = w->count = w->hi = w->lo = 0;
    }
    modwerk_machine_unmask(sr);
    for (unsigned i = 0; i < DSP_WORDS; ++i) v[16u + 5u * WINDOWS + i] = mw_stream_dsp[i];
    for (unsigned i = 0; i < 4u * REPLY_WORDS; ++i) out[i] = (uint8_t)(v[i / 4u] >> (24 - 8 * (i % 4u)));
    return 4u * REPLY_WORDS;
}
