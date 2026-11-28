/* SPDX-License-Identifier: GPL-3.0-or-later
 * The stream channel, its frame side (build_core.py --stream-channel, in the beta base beside USB AUDIO IN).
 * Probes A and B carry the blocks of the slots that stream (events.json ot_dsp_effects stream_in, stream_out) instead
 * of a pattern: every frame, state 7 sends the in-region X:$x1be0.. of the next bank to core 0 (probe A's path) and
 * state 0 reads the out-region X:$x1840.. that core 0 wrote in the bank before (probe B's path); after state 7's unmask
 * each lane's take() gets the blocks just read and its fill() writes the next ones. Beside USB AUDIO IN, state 7 sends its
 * block first and this one at its completion (stream_probe.py scheduler). dsp_programs.c opens and closes
 * the lanes on the UI tick and names their blocks in the slot records only once they are filled.
 * Core 1 the same way at the times stock talks to it (dsp_core1.s): its in-region goes at state 3, right after the
 * loader's packet to core 1, and its out-region is read at state 1's entry, right after stock's own pull from core 1.
 * Core 1's lanes are built and host-tested only: no unit has run them yet (26 November 2026).
 *
 * Frames: the chain's count `frame` k. At chain k state 0 reads what the DSP wrote in frame k - 1; state 7 sends what
 * the DSP reads in frame k + 1, filled at chain k - 1's end. So at chain k's end take(k - 1) runs, then fill(k + 2):
 * fill(f) has every out-block up to f - 3 (MODWERK_DSP_STREAM_LAG). */
#include <stdint.h>
#include "stream_channel.h"
#include "modwerk_events.h"
#ifndef MW_STREAM_TEST
#include "loader.h"
#endif

#ifdef MW_STREAM_TEST
/* The host test's eDMA: TCD0 and TCD1 as plain words, so the saves and restores run as on the unit. */
static volatile uint32_t tcd32[3];
static volatile uint16_t tcd16[4];
static volatile uint8_t cint;
#define TCD0_SADDR tcd32[0]
#define TCD0_NBYTES tcd32[1]
#define TCD1_NBYTES tcd32[1]
#define TCD1_DADDR tcd32[2]
#define TCD0_CITER tcd16[0]
#define TCD0_BITER tcd16[1]
#define TCD1_CITER tcd16[2]
#define TCD1_BITER tcd16[3]
#define CINT cint
#else
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
#define TCD0_SADDR (*(volatile uint32_t *)0xfc045000u)
#define TCD0_NBYTES (*(volatile uint32_t *)0xfc045008u)
#define TCD0_CITER (*(volatile uint16_t *)0xfc045014u)
#define TCD0_BITER (*(volatile uint16_t *)0xfc04501cu)
#define TCD1_NBYTES (*(volatile uint32_t *)0xfc045028u)
#define TCD1_DADDR (*(volatile uint32_t *)0xfc045030u)
#define TCD1_CITER (*(volatile uint16_t *)0xfc045034u)
#define TCD1_BITER (*(volatile uint16_t *)0xfc04503cu)
#define CINT (*(volatile uint8_t *)0xfc04401cu)
extern volatile uint32_t mw_frame_t0; /* machine_registry.c: DTCN3 at the frame interrupt's entry */
#define UNCACHED(p) ((uintptr_t)(p) + 0x08000000u)
#endif

volatile uint16_t mw_stream_tx[MW_STREAM_IN_WORDS] __attribute__((aligned(16)));  /* TCD0's 16-byte bursts */
volatile uint16_t mw_stream_rx[MW_STREAM_OUT_WORDS] __attribute__((aligned(16))); /* TCD1's */
volatile uint32_t mw_stream_started, mw_stream_read_started; /* dsp_hooks.s: DTCN3 as each transfer starts */
volatile uint8_t mw_stream_pin_start;                        /* dsp_hooks.s: the EPORT pins as A starts */
volatile uint16_t mw_stream_read_count, mw_stream_read_iter; /* dsp_hooks.s: B's count - 1 and its CITER/BITER */
volatile uint16_t mw_stream_tx1[MW_STREAM_IN1_WORDS] __attribute__((aligned(16))); /* core 1's, dsp_core1.s */
volatile uint16_t mw_stream_rx1[MW_STREAM_OUT_WORDS] __attribute__((aligned(16)));
volatile uint16_t mw_stream_read_count1, mw_stream_read_iter1;
/* Diagnostics, never an ABI, in initialized data so a development base's MEM reaches them: chains, blocks sent, read,
 * transfers refused (one still open), reads lost to a frame that began again, fills and takes skipped because the
 * slot's record was gone. */
#ifdef __m68k__
#define SEEN __attribute__((section(".data")))
#else
#define SEEN
#endif
volatile uint32_t mw_stream_chains SEEN, mw_stream_sent SEEN, mw_stream_reads SEEN, mw_stream_refused SEEN,
    mw_stream_lost SEEN, mw_stream_skipped SEEN;

static volatile struct mw_stream_lane lanes[MW_STREAM_LANES];
static volatile uint32_t frame, failed;
/* Each core's transfers (0, 1): A's minor loops and B's words, a send or read open, B's phase and its frame. */
static volatile uint32_t in_loops[2], out_words[2], flight[2], rphase[2], rflight[2], rframe[2];
static volatile uint32_t saved_saddr, saved_nbytes, rsaved_daddr[2], rsaved_nbytes[2];
static volatile uint16_t saved_citer, saved_biter, rsaved_citer[2], rsaved_biter[2];

uint32_t mw_stream_frame(void) { return frame; }

static unsigned core_of(unsigned slot) { return (slot & 7u) < 4u ? 1u : 0u; } /* T1-T4 core 1, T5-T8 core 0 */

/* UI task, masked: a lane's place and extent; each core's transfers cover its open lanes. */
static void extents(void)
{
    unsigned in[2] = {0, 0}, out[2] = {0, 0};
    for (unsigned k = 0; k < MW_STREAM_LANES; ++k) {
        unsigned c = core_of(lanes[k].slot);
        if (!lanes[k].open) continue;
        if (lanes[k].in_at + lanes[k].in_n > in[c]) in[c] = lanes[k].in_at + lanes[k].in_n;
        if (lanes[k].out_at + lanes[k].out_n > out[c]) out[c] = lanes[k].out_at + lanes[k].out_n;
    }
    for (unsigned c = 0; c < 2u; ++c) {
        in_loops[c] = (in[c] + 31u) / 32u;        /* A: 64-byte minor loops */
        out_words[c] = (out[c] + 15u) & ~15u;     /* B: 32-byte ones */
    }
    mw_stream_read_count = (uint16_t)(out_words[0] ? out_words[0] - 1u : 0u);
    mw_stream_read_iter = (uint16_t)(0x8200u + out_words[0] / 16u); /* each minor loop links to the next, as stock's */
    mw_stream_read_count1 = (uint16_t)(out_words[1] ? out_words[1] - 1u : 0u);
    mw_stream_read_iter1 = (uint16_t)(0x8200u + out_words[1] / 16u);
}

/* The first fit of n words in [0, room) past every open lane's span on core c in that region (in: 0, out: 1). */
static int fit(unsigned c, unsigned which, unsigned n, unsigned room)
{
    for (unsigned at = 0;;) {
        unsigned moved = 0;
        if (at + n > room) return -1;
        for (unsigned k = 0; k < MW_STREAM_LANES; ++k) {
            unsigned a = which ? lanes[k].out_at : lanes[k].in_at, m = which ? lanes[k].out_n : lanes[k].in_n;
            if (!lanes[k].open || core_of(lanes[k].slot) != c || !m || at >= a + m || at + n <= a) continue;
            at = a + m, moved = 1;
        }
        if (!moved) return (int)at;
    }
}

int mw_stream_open(unsigned slot, const void *row, unsigned in_n, unsigned out_n)
{
    if (slot >= 16u || in_n > MW_STREAM_IN_MOST || out_n > MW_STREAM_OUT_MOST || !(in_n | out_n) || failed) return -1;
    unsigned k = 0, c = core_of(slot), in_total = in_n, out_total = out_n;
    for (unsigned j = 0; j < MW_STREAM_LANES; ++j) /* both cores' blocks share the one frame interrupt */
        if (lanes[j].open) in_total += lanes[j].in_n, out_total += lanes[j].out_n;
    if (in_total > MW_STREAM_IN_MOST || out_total > MW_STREAM_OUT_MOST) return -1;
    while (k < MW_STREAM_LANES && lanes[k].open) ++k;
    int in = in_n ? fit(c, 0, in_n, c ? MW_STREAM_IN1_WORDS : MW_STREAM_IN_WORDS) : 0;
    int out = out_n ? fit(c, 1, out_n, MW_STREAM_OUT_WORDS) : 0;
    if (k == MW_STREAM_LANES || in < 0 || out < 0) return -1;
    uint32_t sr = modwerk_machine_mask();
    lanes[k].row = row, lanes[k].slot = (uint8_t)slot, lanes[k].in_at = (uint16_t)in, lanes[k].in_n = (uint16_t)in_n;
    lanes[k].out_at = (uint16_t)out, lanes[k].out_n = (uint16_t)out_n, lanes[k].since = frame, lanes[k].open = 1;
    mw_stream_live((int)k, 0);
    extents();
    modwerk_machine_unmask(sr);
    return (int)k;
}

/* The slot's record names lane k's blocks now (its op 12 answered): out-blocks from the next frame on are its DSP's;
 * or (on 0) it is about to name them no more: take() stops at once, fill() runs on until the lane closes. */
void mw_stream_live(int k, int on)
{
    if (k >= 0 && k < (int)MW_STREAM_LANES) lanes[k].live_from = frame + (on ? 1u : 0x40000000u);
}

unsigned mw_stream_room(unsigned *in, unsigned *out)
{
    *in = MW_STREAM_IN_MOST, *out = MW_STREAM_OUT_MOST;
    return failed ? 0u : MW_STREAM_LANES;
}

void mw_stream_close(int k)
{
    if (k < 0 || k >= (int)MW_STREAM_LANES) return;
    uint32_t sr = modwerk_machine_mask();
    lanes[k].open = 0, lanes[k].row = 0;
    extents();
    modwerk_machine_unmask(sr);
}

/* Lane k's blocks' offsets in a host bank (0 for a direction it does not use), once its first fill has been sent: the
 * frame after the next chain's state 7. */
int mw_stream_ready(int k, uint32_t *in_offset, uint32_t *out_offset)
{
    if (k < 0 || k >= (int)MW_STREAM_LANES || !lanes[k].open || frame - lanes[k].since < 3u) return 0;
    *in_offset = lanes[k].in_n ? MW_STREAM_IN_REGION + lanes[k].in_at : 0u;
    *out_offset = lanes[k].out_n ? MW_STREAM_OUT_REGION + lanes[k].out_at : 0u;
    return 1;
}

/* State 7's first visit: core 0's in-region's 64-byte minor loops to send now, TCD0 saved; 0 none. */
unsigned mw_stream_block(void)
{
    unsigned loops = in_loops[0];
    if (!loops || failed) return 0;
    if (flight[0]) { mw_stream_refused = mw_stream_refused + 1u; return 0; }
    saved_saddr = TCD0_SADDR, saved_nbytes = TCD0_NBYTES, saved_citer = TCD0_CITER, saved_biter = TCD0_BITER;
    flight[0] = 1u;
    mw_stream_sent = mw_stream_sent + 1u;
    return loops;
}

void mw_stream_complete(void) { if (flight[0]) flight[0] = flight[0] | 4u; }

/* dl_complete, every frame, right before the unmask: TCD0 as it was before the block (stock's, or USB AUDIO IN's block's
 * beside it; stock's state 1 rewrites all four before anything reads them). */
void mw_stream_account(void)
{
    if (!flight[0]) return;
    TCD0_SADDR = saved_saddr, TCD0_NBYTES = saved_nbytes, TCD0_CITER = saved_citer, TCD0_BITER = saved_biter;
    flight[0] = 0;
}

/* State 3, once the loader's packet to core 1 is done or there is none: core 1's in-region's minor loops, 0 none. No
 * save: stock's state 3 writes all of TCD0 that the block does before its own transfer. */
unsigned mw_stream_block1(void)
{
    unsigned loops = in_loops[1];
    if (!loops || failed) return 0;
    if (flight[1]) { mw_stream_refused = mw_stream_refused + 1u; return 0; }
    flight[1] = 1u;
    mw_stream_sent = mw_stream_sent + 1u;
    return loops;
}

void mw_stream_complete1(void) { flight[1] = 0; }

/* B's read on core c, each visit of its state (core 0: stock's state 0; core 1: state 1): 1 read the out-region now
 * (TCD1 saved), 2 the read's completion (TCD1 back), 0 go on. */
static unsigned read_on(unsigned c)
{
#ifdef MW_STREAM_TEST
    uint32_t t0 = frame;
#else
    uint32_t t0 = mw_frame_t0;
#endif
    if (rphase[c]) {
        rphase[c] = 0;
        if (rframe[c] == t0) {
            CINT = 1u;
            TCD1_DADDR = rsaved_daddr[c], TCD1_NBYTES = rsaved_nbytes[c], TCD1_CITER = rsaved_citer[c], TCD1_BITER = rsaved_biter[c];
            rflight[c] = rflight[c] | 4u;
            mw_stream_reads = mw_stream_reads + 1u;
            return 2u;
        }
        mw_stream_lost = mw_stream_lost + 1u, rflight[c] = 0; /* the frame began again with the read open */
    }
    if (!out_words[c] || failed) return 0;
    if (rflight[c]) { mw_stream_refused = mw_stream_refused + 1u; return 0; }
    rsaved_daddr[c] = TCD1_DADDR, rsaved_nbytes[c] = TCD1_NBYTES, rsaved_citer[c] = TCD1_CITER, rsaved_biter[c] = TCD1_BITER;
    rframe[c] = t0, rphase[c] = 1u, rflight[c] = 1u;
    return 1u;
}

unsigned mw_stream_read(void) { return read_on(0); }
unsigned mw_stream_read1(void) { return read_on(1); }

/* The row a lane serves, if its module still contributes it: read masked as every frame-interrupt reader of a table
 * does, so a removal is never seen half-way (machine_registry.c's rule). */
static int contributed(const void *row)
{
#ifdef MW_STREAM_TEST
    return mw_stream_test_contributed(row);
#else
    for (uintptr_t volatile *r = modwerk_runtime_event_row[MODWERK_OT_DSP_EFFECTS - RUNTIME_EVENTS]; *r; ++r)
        if ((const void *)*r == row) return 1;
    return 0;
#endif
}

/* After state 7's unmask, every frame: each lane's take() on the out-blocks state 0 read, then its fill() of the next
 * in-blocks; the count moves on. */
void mw_stream_check(void)
{
    uint32_t k0 = frame, read[2] = {rflight[0] & 4u, rflight[1] & 4u};
    rflight[0] = rflight[1] = 0;
    mw_stream_chains = mw_stream_chains + 1u;
    for (unsigned k = 0; k < MW_STREAM_LANES && !failed; ++k) {
        volatile struct mw_stream_lane *l = &lanes[k];
        if (!l->open) continue;
        const struct modwerk_dsp_effect *e = (const struct modwerk_dsp_effect *)l->row;
        if (!contributed(e)) { mw_stream_skipped = mw_stream_skipped + 1u; continue; }
        unsigned c = core_of(l->slot);
#ifdef MW_STREAM_TEST
        volatile uint16_t *tx = c ? mw_stream_tx1 : mw_stream_tx, *rx = c ? mw_stream_rx1 : mw_stream_rx;
#else
        volatile uint16_t *tx = (volatile uint16_t *)UNCACHED(c ? mw_stream_tx1 : mw_stream_tx);
        volatile uint16_t *rx = (volatile uint16_t *)UNCACHED(c ? mw_stream_rx1 : mw_stream_rx);
#endif
        if (read[c] && l->out_n && e->take && (int32_t)(k0 - 1u - l->live_from) >= 0) e->take(l->slot, k0 - 1u, rx + l->out_at);
        if (l->in_n && e->fill) e->fill(l->slot, k0 + 2u, tx + l->in_at);
    }
    frame = k0 + 1u;
}

/* dsp.c's recovery gave the frame chain up: send and read no more. */
void mw_stream_dma_failed(void) { failed = 1u, flight[0] = flight[1] = 0; }
void mw_stream_read_failed(void)
{
    failed = 1u;
    for (unsigned c = 0; c < 2u; ++c) {
        if (rphase[c]) /* a read still open: TCD1 as stock left it */
            TCD1_DADDR = rsaved_daddr[c], TCD1_NBYTES = rsaved_nbytes[c], TCD1_CITER = rsaved_citer[c], TCD1_BITER = rsaved_biter[c];
        rphase[c] = rflight[c] = 0;
    }
}
