/* SPDX-License-Identifier: GPL-3.0-or-later
 * Stream probes A and B, the ColdFire side (stream_probe.py --stream-probe N, --stream-read N): development twins
 * only, never for users. module-adapters/stream_probe.py has the design. Everything below runs in the frame
 * transfer's eDMA completion interrupt (IPL 6), with the frame interrupt masked but for mw_stream_check: short, no
 * firmware call. Times are DTCN3 counts (132 MHz, 47,891 a frame) since the frame interrupt's entry (mw_frame_t0).
 *
 * Probe A (MODWERK_STREAM_WORDS), from dsp_hooks.s's state 7:
 *   mw_stream_block     the state's first visit: fill the block, save TCD0; its minor loops, 0 for none
 *   mw_stream_complete  the visit the block's completion brings
 * dev.c request 47 (modwerk_stream_request), wValue: 0 reads; 1 starts sending (and restarts the time windows);
 * 2 stops after one last block that asks the checker for a snapshot; 3 asks the next block for a snapshot, then
 * reads the checker's published words with the loader's PEEK (a bit a packet: read again until 240 bits are in);
 * 4 reads and restarts the time windows. The unmask is kept for frames without a block too, as the baseline. A block
 * whose transfer the watchdog gave up (dsp.c) stops the probe for good.
 *
 * Probe B (MODWERK_STREAM_READ_WORDS), from stock's state 0 (dsp_hooks.s mw_stream_state0):
 *   mw_stream_read      each visit: 1 read the block now (TCD1 saved); 2 the read's completion (TCD1 back);
 *                       0 go on to stock's state 0
 *   mw_stream_check     after state 7's unmask: the block checked, the check timed
 * dev.c request 48 (modwerk_stream_read_request), wValue: 0 reads; 1 starts reading (counts and windows restart);
 * 2 stops; 3 zeroes the counts; 4 reads and restarts the time windows.
 *
 *   mw_stream_account   dl_complete, every frame, right before the unmask: TCD0 back (A), the times kept (A, B)
 */
#include <stdint.h>

#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
#define UNCACHED(p) ((uintptr_t)(p) + 0x08000000u)
struct window { uint32_t min, max, count, hi, lo; };

static void keep(volatile struct window *w, uint32_t v)
{
    if (!w->count || v < w->min) w->min = v;
    if (v > w->max) w->max = v;
    w->count = w->count + 1u;
    uint32_t lo = w->lo + v;
    if (lo < v) w->hi = w->hi + 1u;
    w->lo = lo;
}

static void zero(volatile struct window *w, unsigned n)
{
    for (unsigned k = 0; k < n; ++k) w[k].min = w[k].max = w[k].count = w[k].hi = w[k].lo = 0;
}

/* A window's five words into a reply, at v[at]. */
static void put(uint32_t *v, unsigned at, const volatile struct window *w)
{
    v[at] = w->min, v[at + 1u] = w->max, v[at + 2u] = w->count, v[at + 3u] = w->hi, v[at + 4u] = w->lo;
}

static void bytes(uint8_t *out, const uint32_t *v, unsigned words)
{
    for (unsigned i = 0; i < 4u * words; ++i) out[i] = (uint8_t)(v[i / 4u] >> (24 - 8 * (i % 4u)));
}

#ifndef MODWERK_HOST
uint32_t modwerk_machine_mask(void);
void modwerk_machine_unmask(uint32_t sr);
void mw_stream_account(void);
extern volatile uint32_t mw_frame_t0;            /* machine_registry.c: DTCN3 at the frame interrupt's entry */
extern volatile uint32_t dl_early, dl_straddle;  /* dsp_hooks.s: early state-7 visits; loader packets across a frame */
#endif

#ifdef MODWERK_STREAM_WORDS
#define WORDS MODWERK_STREAM_WORDS
#define LOOPS (WORDS / 32u)
#define MAGIC 0x5350u
#define DSP_WORDS 10u
#define WINDOWS 5u
#define REPLY_WORDS (16u + 5u * WINDOWS + DSP_WORDS)
#define PINS (*(volatile uint8_t *)0xfc094005u) /* EPORT pin levels: bit 1 is core 0's host request */
#define TCD0_SADDR (*(volatile uint32_t *)0xfc045000u)
#define TCD0_NBYTES (*(volatile uint32_t *)0xfc045008u)
#define TCD0_CITER (*(volatile uint16_t *)0xfc045014u)
#define TCD0_BITER (*(volatile uint16_t *)0xfc04501cu)
/* Whole 64-byte minor loops: up to 160 at X:$x360, from 192 to 928 at X:$x1be0 (stream_probe.py region_a). */
typedef char whole_minor_loops[WORDS % 32u == 0 && WORDS >= 32u && WORDS <= 928u ? 1 : -1];

unsigned mw_stream_block(void);
void mw_stream_complete(void);
void mw_stream_dma_failed(void);
uint32_t modwerk_stream_request(unsigned op, uint8_t *out);

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
/* The block's start, its completion, the transfer, the unmask; the unmask in a frame without a block (the baseline). */
static volatile struct window windows[WINDOWS];

unsigned mw_stream_block(void)
{
    if (!armed) return 0;
    offered = offered + 1u;
    if (failed || flight) {
        refused = refused + 1u;
        return 0;
    }
    uint32_t s = (seq + 1u) & 0xffffu, snap = snap_pending || stopping ? 1u : 0u, base = (s & 0xffu) << 8;
    volatile uint32_t *w = (volatile uint32_t *)UNCACHED(mw_stream_tx); /* uncached, as dl_tx */
    seq = s;
    w[0] = (MAGIC | snap) << 16 | s;
    for (unsigned i = 2; i < WORDS; i += 2) w[i / 2u] = ((base + i) & 0xffffu) << 16 | ((base + i + 1u) & 0xffffu);
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

static void account_write(uint32_t now, uint32_t t0)
{
    uint32_t f = flight;
    if (snap_wait) { /* the checker publishes at the frame head after the block lands: read a few frames on */
        snap_wait = snap_wait - 1u;
        if (!snap_wait) mw_stream_dsp_wanted = 1, snaps = snaps + 1u;
    }
    if (!(f & 1u)) {
        keep(&windows[4], now - t0);
        return;
    }
    TCD0_SADDR = saved_saddr, TCD0_NBYTES = saved_nbytes, TCD0_CITER = saved_citer, TCD0_BITER = saved_biter;
    if (f & 4u) {
        uint32_t start = mw_stream_started;
        keep(&windows[0], start - t0), keep(&windows[1], done_at - t0), keep(&windows[2], done_at - start);
        if ((mw_stream_pin_start ^ pin_done) & 2u) straddles = straddles + 1u;
    }
    keep(&windows[3], now - t0);
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
    for (unsigned k = 0; k < WINDOWS; ++k) put(v, 16u + 5u * k, &windows[k]);
    if (op == 1u || op == 4u) zero(windows, WINDOWS);
    modwerk_machine_unmask(sr);
    for (unsigned i = 0; i < DSP_WORDS; ++i) v[16u + 5u * WINDOWS + i] = mw_stream_dsp[i];
    bytes(out, v, REPLY_WORDS);
    return 4u * REPLY_WORDS;
}
#endif

#ifdef MODWERK_STREAM_READ_WORDS
#define RWORDS MODWERK_STREAM_READ_WORDS
#define RMAGIC 0x5352u
#define RWINDOWS 6u
#define READ_COUNTS 20u
#define READ_REPLY_WORDS (READ_COUNTS + 5u * RWINDOWS)
/* Whole 32-byte minor loops (stream_probe.py READ_WORDS) within X:$x1840-$x1bdf. */
typedef char read_whole_minor_loops[RWORDS % 16u == 0 && RWORDS >= 32u && RWORDS <= 928u ? 1 : -1];

/* The ColdFire's check of one block (the test runs it on the host): magic, the sequence one past the last, every
 * pattern word ((sequence & $ff) << 8) + i, 16 bits each. An older block (the sequence at or behind the last: the DSP
 * did not write this frame's) is stale and leaves `last` where it was; any other break in the order is a jump. The
 * first block after a start sets the order. head: the first two words of the last block not good. */
struct mw_read_counts { uint32_t blocks, good, bad, missing, jumps, stale, last, diff, head[2]; };

void mw_stream_read_classify(const volatile uint32_t *r, volatile struct mw_read_counts *c)
{
    uint32_t w0 = r[0], s = w0 & 0xffffu, last = c->last, first = !c->blocks;
    c->blocks = c->blocks + 1u;
    if (w0 >> 16 != RMAGIC) {
        c->missing = c->missing + 1u, c->head[0] = w0, c->head[1] = r[1];
        return;
    }
    if (!first && s != ((last + 1u) & 0xffffu)) {
        if (((last - s) & 0xffffu) < 0x8000u) c->stale = c->stale + 1u;
        else c->jumps = c->jumps + 1u, c->last = s;
    } else c->last = s;
    uint32_t base = (s & 0xffu) << 8, diff = 0;
    for (unsigned i = 2; i < RWORDS; i += 2) diff |= r[i / 2u] ^ (((base + i) & 0xffffu) << 16 | ((base + i + 1u) & 0xffffu));
    if (diff) c->bad = c->bad + 1u, c->diff = (diff >> 16 | diff) & 0xffffu, c->head[0] = w0, c->head[1] = r[1];
    else c->good = c->good + 1u;
}

#ifndef MODWERK_HOST
#define CINT (*(volatile uint8_t *)0xfc04401cu)
#define TCD1_NBYTES (*(volatile uint32_t *)0xfc045028u)
#define TCD1_DADDR (*(volatile uint32_t *)0xfc045030u)
#define TCD1_CITER (*(volatile uint16_t *)0xfc045034u)
#define TCD1_BITER (*(volatile uint16_t *)0xfc04503cu)
unsigned mw_stream_read(void);
void mw_stream_check(void);
void mw_stream_read_failed(void);
uint32_t modwerk_stream_read_request(unsigned op, uint8_t *out);

volatile uint16_t mw_stream_rx[RWORDS] __attribute__((aligned(16))); /* TCD1's inherited 16-byte bursts; read uncached */
volatile uint32_t mw_stream_read_started;   /* dsp_hooks.s: DTCN3 right after the read started */

static volatile uint32_t rarmed, rfailed, rphase, rframe, rflight; /* rflight: 1 started, 4 done */
static volatile uint32_t roffered, rsent, rcompleted, rchecked, rrefused, rlost, rdone_at;
static volatile uint32_t rsaved_daddr, rsaved_nbytes;
static volatile uint16_t rsaved_citer, rsaved_biter;
static volatile struct mw_read_counts rcounts;
/* The read's start, its completion, the transfer, the unmask; the unmask in a frame without a read (the baseline);
 * the check after the unmask. */
static volatile struct window rwindows[RWINDOWS];

unsigned mw_stream_read(void)
{
    uint32_t t0 = mw_frame_t0;
    if (rphase) {
        rphase = 0;
        if (rframe == t0) { /* channel 1's completion: our read is in */
            CINT = 1u;
            rdone_at = DTCN3;
            TCD1_DADDR = rsaved_daddr, TCD1_NBYTES = rsaved_nbytes, TCD1_CITER = rsaved_citer, TCD1_BITER = rsaved_biter;
            rflight = rflight | 4u;
            rcompleted = rcompleted + 1u;
            return 2u;
        }
        rlost = rlost + 1u, rflight = 0; /* a frame began again with our read open: the frame entry rewrote TCD1 */
    }
    if (!rarmed) return 0;
    roffered = roffered + 1u;
    if (rfailed || rflight) {
        rrefused = rrefused + 1u;
        return 0;
    }
    rsaved_daddr = TCD1_DADDR, rsaved_nbytes = TCD1_NBYTES, rsaved_citer = TCD1_CITER, rsaved_biter = TCD1_BITER;
    rframe = t0, rphase = 1u, rflight = 1u;
    rsent = rsent + 1u;
    return 1u;
}

static void account_read(uint32_t now, uint32_t t0)
{
    uint32_t f = rflight;
    if (!(f & 4u)) {
        keep(&rwindows[4], now - t0);
        return;
    }
    uint32_t start = mw_stream_read_started;
    keep(&rwindows[0], start - t0), keep(&rwindows[1], rdone_at - t0), keep(&rwindows[2], rdone_at - start);
    keep(&rwindows[3], now - t0);
}

void mw_stream_check(void)
{
    if (!(rflight & 4u)) return;
    uint32_t t = DTCN3;
    mw_stream_read_classify((const volatile uint32_t *)UNCACHED(mw_stream_rx), &rcounts);
    keep(&rwindows[5], DTCN3 - t);
    rflight = 0;
    rchecked = rchecked + 1u;
}

/* dsp.c's recovery stopped the frame chain: read no more. */
void mw_stream_read_failed(void)
{
    rfailed = 1u, rarmed = 0, rphase = 0, rflight = 0;
}

uint32_t modwerk_stream_read_request(unsigned op, uint8_t *out)
{
    uint32_t taken = 0, v[READ_REPLY_WORDS];
    uint32_t sr = modwerk_machine_mask(); /* 50 words, well under the frame interrupt's 200 us */
    if (op == 1u && !rfailed) {
        rarmed = 1u, taken = 1u;
        roffered = rsent = rcompleted = rchecked = rrefused = rlost = 0;
    } else if (op == 2u && rarmed) rarmed = 0, taken = 1u;
    if (op == 1u || op == 3u) {
        rcounts.blocks = rcounts.good = rcounts.bad = rcounts.missing = rcounts.jumps = rcounts.stale = 0;
        rcounts.last = rcounts.diff = rcounts.head[0] = rcounts.head[1] = 0;
        taken = 1u;
    }
    uint32_t head[READ_COUNTS] = {0x4d575352u, RWORDS, rarmed | rfailed << 2, roffered, rsent, rcompleted, rchecked,
                                  rrefused, rlost, rcounts.blocks, rcounts.good, rcounts.bad, rcounts.missing,
                                  rcounts.jumps, rcounts.stale, rcounts.last, rcounts.diff, rcounts.head[0],
                                  rcounts.head[1], taken | MODWERK_STREAM_READ_REGION << 16};
    for (unsigned i = 0; i < READ_COUNTS; ++i) v[i] = head[i];
    for (unsigned k = 0; k < RWINDOWS; ++k) put(v, READ_COUNTS + 5u * k, &rwindows[k]);
    if (op == 1u || op == 4u) zero(rwindows, RWINDOWS);
    modwerk_machine_unmask(sr);
    bytes(out, v, READ_REPLY_WORDS);
    return 4u * READ_REPLY_WORDS;
}
#endif
#endif

#ifndef MODWERK_HOST
void mw_stream_account(void)
{
    uint32_t now = DTCN3, t0 = mw_frame_t0;
#ifdef MODWERK_STREAM_WORDS
    account_write(now, t0);
#endif
#ifdef MODWERK_STREAM_READ_WORDS
    account_read(now, t0);
#endif
    (void)now, (void)t0;
}
#endif
