/* SPDX-License-Identifier: GPL-3.0-or-later
 * TB-3PO pattern engine. The generator follows tb3po.c (charlesvestal/schwung-tb3po f49d81d0, from the Phazerville
 * Hemisphere Suite TB_3PO applet by djphazer and contributors, GPL-3.0) call for call: the same xorshift32, the same
 * draws in the same order, so a line has the same shape as the Move's at the same settings. Its 0.0-1.0 floats are
 * 24-bit fractions here (tb3po.c's rng_next_f keeps 24 bits of the word), its knobs 0-127. Firmware-free. */
#include "engine.h"

const Tb3poParams tb3po_defaults = {89, 51, 32, 0, 1, 0, 2, TB3PO_FWD, 0}; /* tb3po.c: 0.7, 0.4, 0.25, Minor, 2 octaves */
const char *const tb3po_scale_names[TB3PO_SCALES] = {"MINR", "PHRY", "HMIN", "MPNT", "DORI", "MAJR"};
const uint8_t tb3po_scale_degrees[TB3PO_SCALES][7] = {
    {0, 2, 3, 5, 7, 8, 10}, {0, 1, 3, 5, 7, 8, 10}, {0, 2, 3, 5, 7, 8, 11},
    {0, 3, 5, 7, 10, 0, 0}, {0, 2, 3, 5, 7, 9, 10}, {0, 2, 4, 5, 7, 9, 11},
};
const uint8_t tb3po_scale_length[TB3PO_SCALES] = {7, 7, 7, 5, 7, 7};

#define ONE 0x1000000u /* 1.0 as a 24-bit fraction */
static uint32_t rng_next(uint32_t *rng)
{
    uint32_t x = *rng ? *rng : 1u;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return *rng = x;
}
/* tb3po.c's rng_next_f: a fraction in [0, 1) as 24 bits. */
static uint32_t frac(uint32_t *rng) { return rng_next(rng) & 0xffffffu; }
/* A 0-127 knob as that fraction: 127 is 1.0 (never cleared by a draw), 0 is 0.0. */
static uint32_t knob(unsigned v) { return v >= 127u ? ONE : (uint32_t)v * ONE / 127u; }
/* tb3po.c's (int)(f * n): the draw scaled to 0 .. n-1. */
static unsigned pick(uint32_t *rng, unsigned n) { unsigned k = (frac(rng) * n) >> 24; return k >= n ? n - 1u : k; } /* n <= 64: fits 32 bits */
/* The seed word a SEED value stands for: tb3po.c's 0xBEEF for 0, a different nonzero word for each other value. */
static uint32_t seed_word(unsigned seed) { return 0xbeefu ^ ((uint32_t)seed * 0x9e3779b9u); }

static void roll_kind(Tb3poStep *s, uint32_t *rng, const Tb3poParams *p)
{
    unsigned kind = TB3PO_NOTE;
    if (frac(rng) < knob(p->accent)) kind = TB3PO_ACCENT;
    if (frac(rng) < knob(p->slide)) kind = TB3PO_SLIDE;
    s->kind = (uint8_t)kind;
}
static void roll_pitch(Tb3poStep *s, uint32_t *rng, const Tb3poParams *p)
{
    unsigned octs = p->octs < 1u ? 1u : p->octs > 3u ? 3u : p->octs;
    s->degree = (uint8_t)pick(rng, tb3po_scale_length[p->scale]);
    s->octave = (uint8_t)pick(rng, octs);
}
/* tb3po.c generate_pattern over `n` steps. */
static void generate(Tb3poStep *m, unsigned n, uint32_t *rng, const Tb3poParams *p)
{
    uint32_t density = knob(p->density);
    for (unsigned i = 0; i < n; ++i) {
        m[i].kind = TB3PO_REST; m[i].degree = 0; m[i].octave = 0;
        if (frac(rng) > density) continue;
        if (i % 4u == 0 && frac(rng) < 0x59999au) m[i].degree = 0; /* on the beat, 35 %: the root */
        else m[i].degree = (uint8_t)pick(rng, tb3po_scale_length[p->scale]);
        m[i].octave = (uint8_t)pick(rng, p->octs < 1u ? 1u : p->octs > 3u ? 3u : p->octs);
        roll_kind(&m[i], rng, p);
    }
}
/* tb3po.c mutate_pattern: about a quarter of the steps re-rolled, half of those their state, half their pitch. */
static void mutate(Tb3poStep *m, unsigned n, uint32_t *rng, const Tb3poParams *p)
{
    uint32_t density = knob(p->density);
    for (unsigned i = 0; i < n; ++i) {
        if (frac(rng) >= 0x400000u) continue;
        if (frac(rng) < 0x800000u) {
            if (frac(rng) > density) m[i].kind = TB3PO_REST;
            else roll_kind(&m[i], rng, p);
        } else roll_pitch(&m[i], rng, p);
    }
}

unsigned tb3po_next_seed(unsigned seed) { return (seed + 1u) & 127u; }

int tb3po_generate(Tb3poPattern *out, const Tb3poParams *p, unsigned length)
{
    Tb3poStep motif[TB3PO_STEPS], laid[TB3PO_STEPS];
    uint8_t order[TB3PO_STEPS];
    if (!out || !p || !length || length > TB3PO_STEPS || p->scale >= TB3PO_SCALES || p->dir > TB3PO_RND
            || p->motif == 1u || p->motif > TB3PO_MAX_MOTIF) return 0;
    unsigned n = p->motif ? p->motif : length;
    if (n > length) n = length;
    uint32_t rng = seed_word(p->seed);
    generate(motif, n, &rng, p);
    if (p->var) { rng ^= (uint32_t)p->var * 0x85ebca6bu; mutate(motif, n, &rng, p); }
    /* The order the motif's steps take on the track: tb3po.c's playback directions, laid out once. */
    for (unsigned i = 0; i < n; ++i) order[i] = (uint8_t)i;
    if (p->dir == TB3PO_REV) for (unsigned i = 0; i < n; ++i) order[i] = (uint8_t)(n - 1u - i);
    if (p->dir == TB3PO_RND) {
        uint32_t shuffle = seed_word(p->seed) ^ 0x6c62272eu ^ ((uint32_t)p->var << 8);
        for (unsigned i = n; i > 1u; --i) { unsigned j = pick(&shuffle, i); uint8_t t = order[i - 1u]; order[i - 1u] = order[j]; order[j] = t; }
    }
    unsigned cycle = p->dir == TB3PO_PING && n > 1u ? 2u * n - 2u : n;
    for (unsigned j = 0; j < length; ++j) {
        unsigned k = j % cycle;
        laid[j] = motif[order[p->dir == TB3PO_PING && k >= n ? cycle - k : k]];
    }
    /* tb3po.c's cleanup on the line as it plays: a slide into a rest is a plain note; at least one note. */
    unsigned any = 0;
    for (unsigned j = 0; j < length; ++j) {
        if (laid[j].kind == TB3PO_SLIDE && laid[(j + 1u) % length].kind == TB3PO_REST) laid[j].kind = TB3PO_NOTE;
        if (laid[j].kind != TB3PO_REST) any = 1;
    }
    if (!any) { laid[0].kind = TB3PO_NOTE; laid[0].degree = 0; laid[0].octave = 0; }
    for (unsigned j = 0; j < TB3PO_STEPS; ++j) {
        if (j < length) out->steps[j] = laid[j];
        else { out->steps[j].kind = TB3PO_REST; out->steps[j].degree = 0; out->steps[j].octave = 0; }
    }
    out->length = (uint8_t)length;
    return 1;
}

unsigned tb3po_note(const Tb3poParams *p, const Tb3poStep *s, unsigned base_note)
{
    unsigned scale = p->scale < TB3PO_SCALES ? p->scale : 0u, degree = s->degree < 7u ? s->degree : 0u;
    unsigned note = base_note + tb3po_scale_degrees[scale][degree] + 12u * s->octave;
    return note > 127u ? 127u : note;
}

static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
int tb3po_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 24; ++i) if (r[i]) return 0;
    for (unsigned i = 32; i < 40; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < TB3PO_STEPS; ++i)
        for (unsigned k = 0; k < 3; ++k) if (r[TB3PO_LOCKS + 32u * i + k] != TB3PO_NO_LOCK) return 0;
    return 1;
}
static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v)
{
    if (r[at] == v) return;
    r[at] = v;
    if (mirror) mirror[at] = v;
}
unsigned tb3po_write(uint8_t *r, uint8_t *mirror, const Tb3poPattern *pattern, const Tb3poParams *p,
                     unsigned base_note, unsigned accent_vel, unsigned slide_len, uint8_t locked[TB3PO_STEPS])
{
    uint8_t masks[40];
    unsigned trigs = 0, length = pattern->length > TB3PO_STEPS ? TB3PO_STEPS : pattern->length;
    for (unsigned k = 0; k < 40; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < TB3PO_STEPS; ++i) {
        const Tb3poStep *s = &pattern->steps[i];
        unsigned at = TB3PO_LOCKS + 32u * i, old = bit(masks, 0, i), active = i < length && s->kind != TB3PO_REST;
        if (i >= length) { /* past the track's length: as it was */
            unsigned any = 0;
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != TB3PO_NO_LOCK;
            locked[i] = (uint8_t)any;
            continue;
        }
        put(r, mirror, at, active ? (uint8_t)tb3po_note(p, s, base_note) : (uint8_t)TB3PO_NO_LOCK);
        put(r, mirror, at + 1u, active && s->kind == TB3PO_ACCENT ? (uint8_t)(accent_vel > 127u ? 127u : accent_vel) : (uint8_t)TB3PO_NO_LOCK);
        put(r, mirror, at + 2u, active && s->kind == TB3PO_SLIDE ? (uint8_t)(slide_len > 127u ? 127u : slide_len) : (uint8_t)TB3PO_NO_LOCK);
        setbit(masks, 0, i, active);
        if (old || active) { /* a straight trig word: no micro-timing, no condition; no stale marks */
            put(r, mirror, TB3PO_TIMING + 2u * i, 0);
            put(r, mirror, TB3PO_TIMING + 2u * i + 1u, 0);
            setbit(masks, 1, i, 0); setbit(masks, 4, i, 0);
        }
        unsigned any = active;
        for (unsigned k = 3; !any && k < 32; ++k) any = r[at + k] != TB3PO_NO_LOCK;
        locked[i] = (uint8_t)any;
        setbit(masks, 2, i, !active && any);
        trigs += active;
    }
    for (unsigned k = 0; k < 40; ++k) put(r, mirror, k, masks[k]);
    return trigs;
}
