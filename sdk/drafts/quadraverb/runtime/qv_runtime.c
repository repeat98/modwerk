/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Quadraverb's ColdFire half: its ot_dsp_effects record (runtime.json). program() reads PROG, code() gives a
 * program's area words for the base to write into P, and the stream (ENGINE.md, "The SDRAM stream") keeps each
 * streamed delay line in a ring here: take() files the head words the DSP wrote in a frame, fill() sends back the runs
 * its reads take, MODWERK_DSP_STREAM_LAG (3) frames later. This is qvs.ColdFire in C; engine/test_qv_runtime.py holds
 * it to that model. fill and take run in the frame interrupt, program and code in the UI task; they share no state.
 *
 * Out-block (DSP to here): the tag 0x5100 | index, K (the DSP's frame since the program started, modulo 0x8000;
 * 0xffff while it waits), then each streamed line's 16 head words newest first, then each moving window's published U.
 * In-block (here to DSP): each window's run, as qvs.ColdFire.compose, zeros past the program's words. */
#include "qv_runtime.h"
#ifndef QV_TABLES
#define QV_TABLES "../gen/qv_tables.h"
#endif
#include QV_TABLES

#ifndef QV_POOL_HALFWORDS
#define QV_POOL_HALFWORDS QV_RING_MAX /* the dearest program alone; two chambers fit side by side */
#endif
#define LAT 3u                        /* MODWERK_DSP_STREAM_LAG */
#define STALE 8                       /* frames with no fill: the slot has left the effect */
#define NOFIT 0xffffffffu

#ifdef QV_HOST
/* The host test's frame records: the bytes from 0x80000000 on. */
uint8_t qv_host_mem[0x800] __attribute__((aligned(4)));
#define AT(a) (qv_host_mem + ((a) - 0x80000000u))
#else
#define AT(a) ((volatile uint8_t *)(a))
#endif

#ifdef __m68k__
#define SEEN __attribute__((section(".data"))) /* in the image, as Midiverb's state, so MEM reaches it */
#else
#define SEEN
#endif

struct slot {
    uint8_t prog;         /* the index + 1; 0 none */
    uint8_t room, known, unsynced;
    uint32_t at;          /* its rings' offset in the pool, while room */
    uint32_t base;        /* the frame the DSP's K counts from, while known */
    uint32_t kn, have;    /* the newest frame filed and how many samples since the stream started */
    uint32_t seen;        /* the last fill's frame */
    uint32_t pubk[8];     /* the frame of each published entry */
    uint16_t pub[8][QV_MOVING_MAX];
};

static struct slot slots[16] SEEN;
static uint16_t pool[QV_POOL_HALFWORDS]; /* never assumed zero: a slot reads only what it filed since it started */
volatile uint32_t qv_resyncs SEEN, qv_no_room SEEN, qv_missing SEEN, qv_gaps SEEN, qv_bad_tags SEEN;

int32_t qv_program(unsigned slot)
{
    if (slot < 8u || slot >= 16u) return -1; /* FX1: never ours */
    uint32_t bank = *(volatile uint32_t *)AT(0x800000e0u) & 1u;
    unsigned v = *(volatile uint8_t *)AT(0x80000110u + bank * 512u + (slot - 8u) * 64u + 24u); /* FX2 knob A */
    return v < QV_PROGRAMS ? (int32_t)v : QV_PROGRAMS - 1;
}

uint32_t qv_code(unsigned slot, int32_t program, uint32_t at, uint32_t *out)
{
    (void)slot;
    if (program < 0 || program >= QV_PROGRAMS) return 0;
    const struct qv_prog *p = &qv_progs[program];
    const uint8_t *b = qv_area + 3u * p->area0;
    for (uint32_t i = 0; i < p->area_n; ++i, b += 3)
        out[i] = (uint32_t)b[0] << 16 | (uint32_t)b[1] << 8 | b[2];
    for (uint32_t i = 0; i < p->reloc_n; ++i) {
        uint32_t *w = &out[qv_relocs[p->reloc0 + i]];
        *w = (*w + at - p->origin) & 0xffffffu;
    }
    return p->area_n;
}

/* The first fit of n halfwords past every other slot's rings; a slot not filled for STALE frames gives its rings up. */
static uint32_t fit(unsigned self, uint32_t n, uint32_t now)
{
    for (uint32_t at = 0;;) {
        unsigned moved = 0;
        if (at + n > QV_POOL_HALFWORDS) return NOFIT;
        for (unsigned j = 0; j < 16u; ++j) {
            struct slot *o = &slots[j];
            uint32_t len = o->prog ? qv_progs[o->prog - 1].ring : 0;
            if (j == self || !o->room || !len || at >= o->at + len || at + n <= o->at) continue;
            if ((int32_t)(now - o->seen) > STALE) { o->prog = o->room = o->known = 0; continue; }
            at = o->at + len, moved = 1;
        }
        if (!moved) return at;
    }
}

/* The stream starts (or starts again) at frame k: nothing filed yet, nothing published. */
static void start(struct slot *s, uint32_t k)
{
    s->kn = k - 1u, s->have = 0;
    for (unsigned i = 0; i < 8u; ++i) s->pubk[i] = k - 1u;
}

void qv_take(unsigned slot, uint32_t f, const volatile uint16_t *out)
{
    if (slot >= 16u) return;
    struct slot *s = &slots[slot];
    unsigned tag = out[0], K = out[1];
    if ((tag >> 8) != 0x51u || (tag & 0xffu) >= QV_PROGRAMS) { s->unsynced = 1, qv_bad_tags = qv_bad_tags + 1u; return; }
    s->unsynced = 0;
    if (s->prog != (tag & 0xffu) + 1u) s->prog = (uint8_t)((tag & 0xffu) + 1u), s->room = s->known = 0;
    if (K == 0xffffu) return;
    const struct qv_prog *p = &qv_progs[s->prog - 1];
    if (!s->room) {
        uint32_t at = fit(slot, p->ring, f);
        if (at == NOFIT) { qv_no_room = qv_no_room + 1u; return; }
        s->at = at, s->room = 1;
    }
    if (!s->known) s->base = f - K, s->known = 1, start(s, K);
    else if (((f - s->base) & 0x7fffu) != K) s->base = f - K, start(s, K), qv_resyncs = qv_resyncs + 1u;
    uint32_t k = f - s->base;
    if (k != s->kn + 1u) qv_gaps = qv_gaps + 1u;
    const volatile uint16_t *o = out + 2;
    for (unsigned l = 0; l < p->lines; ++l, o += 16) {
        const struct qv_line *L = &qv_lines[p->line0 + l];
        uint16_t *r = pool + s->at + L->at;
        uint32_t n = 16u * k + 15u, mask = L->mask; /* locals: the volatile reads would reload them every word */
        for (unsigned i = 0; i < 16u; ++i) r[(n - i) & mask] = o[i];
    }
    for (unsigned j = 0; j < p->moving; ++j) s->pub[k & 7u][j] = o[j];
    s->pubk[k & 7u] = k, s->kn = k;
    if (s->have < 0x40000000u) s->have += 16u;
}

void qv_fill(unsigned slot, uint32_t f, volatile uint16_t *in)
{
    unsigned d = 0;
    if (slot < 16u) {
        struct slot *s = &slots[slot];
        s->seen = f;
        if (s->known && !s->unsynced) {
            const struct qv_prog *p = &qv_progs[s->prog - 1];
            uint32_t k = f - s->base, u = (k - LAT) & 7u, have = s->have;
            for (unsigned x = p->win0; x < p->win0 + p->windows; ++x) {
                const struct qv_window *w = &qv_windows[x];
                const uint16_t *r = pool + s->at + qv_lines[w->line].at;
                uint32_t mask = qv_lines[w->line].mask;
                int32_t B = w->b;
                if (w->mv >= 0) B += s->pubk[u] == k - LAT ? s->pub[u][w->mv] : w->u0;
                uint32_t n = 16u * k + 15u - (uint32_t)B;           /* the run's newest sample */
                int32_t age = (int32_t)(16u * (s->kn - k)) + B;      /* how far it is behind the newest filed */
                for (unsigned i = 0; i < w->w; ++i, --n, ++age) {
                    if (age < 0) { in[d++] = 0, qv_missing = qv_missing + 1u; continue; }
                    in[d++] = (uint32_t)age < have ? r[n & mask] : 0;
                }
            }
        }
    }
    while (d < QV_STREAM_IN) in[d++] = 0;
}

const struct modwerk_dsp_effect qv_effect = {
    MODWERK_DSP_EFFECT_ABI, QV_PROGRAM_WORDS, qv_program, qv_code, QV_STREAM_IN, QV_STREAM_OUT, qv_fill, qv_take, 0,
};
