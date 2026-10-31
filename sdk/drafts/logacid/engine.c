/* SPDX-License-Identifier: GPL-3.0-only
 * LOGACID pattern engine. The generator follows tb3po.c (charlesvestal/schwung-tb3po f49d81d0, from the Phazerville
 * Hemisphere TB_3PO applet by Logarhythm, MIT, as modified by djphazer) call for call: the same xorshift32, the same
 * draws in the same order, so a line has the same shape as the Move's at the same settings. Its 0.0-1.0 floats are
 * 24-bit fractions here (tb3po.c's rng_next_f keeps 24 bits of the word), its knobs 0-127. Firmware-free. */
#include "engine.h"

const LogacidParams logacid_defaults = {89, 51, 32, 0, 1, 0, 2, LOGACID_FWD, 0}; /* tb3po.c: 0.7, 0.4, 0.25, Minor, 2 octaves */
const char *const logacid_scale_names[LOGACID_SCALES] = {"MINR", "PHRY", "HMIN", "MPNT", "DORI", "MAJR"};
const uint8_t logacid_scale_degrees[LOGACID_SCALES][7] = {
    {0, 2, 3, 5, 7, 8, 10}, {0, 1, 3, 5, 7, 8, 10}, {0, 2, 3, 5, 7, 8, 11},
    {0, 3, 5, 7, 10, 0, 0}, {0, 2, 3, 5, 7, 9, 10}, {0, 2, 4, 5, 7, 9, 11},
};
const uint8_t logacid_scale_length[LOGACID_SCALES] = {7, 7, 7, 5, 7, 7};

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

static void roll_kind(LogacidStep *s, uint32_t *rng, const LogacidParams *p)
{
    unsigned kind = LOGACID_NOTE;
    if (frac(rng) < knob(p->accent)) kind = LOGACID_ACCENT;
    if (frac(rng) < knob(p->slide)) kind = LOGACID_SLIDE;
    s->kind = (uint8_t)kind;
}
static void roll_pitch(LogacidStep *s, uint32_t *rng, const LogacidParams *p)
{
    unsigned octs = p->octs < 1u ? 1u : p->octs > 3u ? 3u : p->octs;
    s->degree = (uint8_t)pick(rng, logacid_scale_length[p->scale]);
    s->octave = (uint8_t)pick(rng, octs);
}
/* tb3po.c generate_pattern over `n` steps. */
static void generate(LogacidStep *m, unsigned n, uint32_t *rng, const LogacidParams *p)
{
    uint32_t density = knob(p->density);
    for (unsigned i = 0; i < n; ++i) {
        m[i].kind = LOGACID_REST; m[i].degree = 0; m[i].octave = 0;
        if (frac(rng) > density) continue;
        if (i % 4u == 0 && frac(rng) < 0x59999au) m[i].degree = 0; /* on the beat, 35 %: the root */
        else m[i].degree = (uint8_t)pick(rng, logacid_scale_length[p->scale]);
        m[i].octave = (uint8_t)pick(rng, p->octs < 1u ? 1u : p->octs > 3u ? 3u : p->octs);
        roll_kind(&m[i], rng, p);
    }
}
/* tb3po.c mutate_pattern: about a quarter of the steps re-rolled, half of those their state, half their pitch. */
static void mutate(LogacidStep *m, unsigned n, uint32_t *rng, const LogacidParams *p)
{
    uint32_t density = knob(p->density);
    for (unsigned i = 0; i < n; ++i) {
        if (frac(rng) >= 0x400000u) continue;
        if (frac(rng) < 0x800000u) {
            if (frac(rng) > density) m[i].kind = LOGACID_REST;
            else roll_kind(&m[i], rng, p);
        } else roll_pitch(&m[i], rng, p);
    }
}

unsigned logacid_next_seed(unsigned seed) { return (seed + 1u) & 127u; }

int logacid_generate(LogacidPattern *out, const LogacidParams *p, unsigned length)
{
    LogacidStep motif[LOGACID_STEPS], laid[LOGACID_STEPS];
    uint8_t order[LOGACID_STEPS];
    if (!out || !p || !length || length > LOGACID_STEPS || p->scale >= LOGACID_SCALES || p->dir > LOGACID_RND
            || p->motif == 1u || p->motif > LOGACID_MAX_MOTIF) return 0;
    unsigned n = p->motif ? p->motif : length;
    if (n > length) n = length;
    uint32_t rng = seed_word(p->seed);
    generate(motif, n, &rng, p);
    if (p->var) { rng ^= (uint32_t)p->var * 0x85ebca6bu; mutate(motif, n, &rng, p); }
    /* The order the motif's steps take on the track: tb3po.c's playback directions, laid out once. */
    for (unsigned i = 0; i < n; ++i) order[i] = (uint8_t)i;
    if (p->dir == LOGACID_REV) for (unsigned i = 0; i < n; ++i) order[i] = (uint8_t)(n - 1u - i);
    if (p->dir == LOGACID_RND) {
        uint32_t shuffle = seed_word(p->seed) ^ 0x6c62272eu ^ ((uint32_t)p->var << 8);
        for (unsigned i = n; i > 1u; --i) { unsigned j = pick(&shuffle, i); uint8_t t = order[i - 1u]; order[i - 1u] = order[j]; order[j] = t; }
    }
    unsigned cycle = p->dir == LOGACID_PING && n > 1u ? 2u * n - 2u : n;
    for (unsigned j = 0; j < length; ++j) {
        unsigned k = j % cycle;
        laid[j] = motif[order[p->dir == LOGACID_PING && k >= n ? cycle - k : k]];
    }
    /* tb3po.c's cleanup on the line as it plays: a slide into a rest is a plain note; at least one note. */
    unsigned any = 0;
    for (unsigned j = 0; j < length; ++j) {
        if (laid[j].kind == LOGACID_SLIDE && laid[(j + 1u) % length].kind == LOGACID_REST) laid[j].kind = LOGACID_NOTE;
        if (laid[j].kind != LOGACID_REST) any = 1;
    }
    if (!any) { laid[0].kind = LOGACID_NOTE; laid[0].degree = 0; laid[0].octave = 0; }
    for (unsigned j = 0; j < LOGACID_STEPS; ++j) {
        if (j < length) out->steps[j] = laid[j];
        else { out->steps[j].kind = LOGACID_REST; out->steps[j].degree = 0; out->steps[j].octave = 0; }
    }
    out->length = (uint8_t)length;
    return 1;
}

unsigned logacid_note(const LogacidParams *p, const LogacidStep *s, unsigned base_note)
{
    unsigned scale = p->scale < LOGACID_SCALES ? p->scale : 0u, degree = s->degree < 7u ? s->degree : 0u;
    unsigned note = base_note + logacid_scale_degrees[scale][degree] + 12u * s->octave;
    return note > 127u ? 127u : note;
}

static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
int logacid_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 24; ++i) if (r[i]) return 0;
    for (unsigned i = 32; i < 40; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < LOGACID_STEPS; ++i)
        for (unsigned k = 0; k < 3; ++k) if (r[LOGACID_LOCKS + 32u * i + k] != LOGACID_NO_LOCK) return 0;
    return 1;
}
static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v)
{
    if (r[at] == v) return;
    r[at] = v;
    if (mirror) mirror[at] = v;
}
unsigned logacid_write(uint8_t *r, uint8_t *mirror, const LogacidPattern *pattern, const LogacidParams *p,
                     unsigned base_note, unsigned accent_vel, unsigned slide_len, uint8_t locked[LOGACID_STEPS])
{
    uint8_t masks[40];
    unsigned trigs = 0, length = pattern->length > LOGACID_STEPS ? LOGACID_STEPS : pattern->length;
    for (unsigned k = 0; k < 40; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < LOGACID_STEPS; ++i) {
        const LogacidStep *s = &pattern->steps[i];
        unsigned at = LOGACID_LOCKS + 32u * i, old = bit(masks, 0, i), active = i < length && s->kind != LOGACID_REST;
        if (i >= length) { /* past the track's length: as it was */
            unsigned any = 0;
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != LOGACID_NO_LOCK;
            locked[i] = (uint8_t)any;
            continue;
        }
        put(r, mirror, at, active ? (uint8_t)logacid_note(p, s, base_note) : (uint8_t)LOGACID_NO_LOCK);
        put(r, mirror, at + 1u, active && s->kind == LOGACID_ACCENT ? (uint8_t)(accent_vel > 127u ? 127u : accent_vel) : (uint8_t)LOGACID_NO_LOCK);
        put(r, mirror, at + 2u, active && s->kind == LOGACID_SLIDE ? (uint8_t)(slide_len > 127u ? 127u : slide_len) : (uint8_t)LOGACID_NO_LOCK);
        setbit(masks, 0, i, active);
        if (old || active) { /* a straight trig word: no micro-timing, no condition; no stale marks */
            put(r, mirror, LOGACID_TIMING + 2u * i, 0);
            put(r, mirror, LOGACID_TIMING + 2u * i + 1u, 0);
            setbit(masks, 1, i, 0); setbit(masks, 4, i, 0);
        }
        unsigned any = active;
        for (unsigned k = 3; !any && k < 32; ++k) any = r[at + k] != LOGACID_NO_LOCK;
        locked[i] = (uint8_t)any;
        setbit(masks, 2, i, !active && any);
        trigs += active;
    }
    for (unsigned k = 0; k < 40; ++k) put(r, mirror, k, masks[k]);
    return trigs;
}

/* ---- the sample tracks ---- */
const LogacidAudioSettings logacid_audio_defaults = {{89, 51, 32, 0, 1, 0, 2, LOGACID_FWD, 0}, {9, 16, 0, 12, 0, 0, 0}};

void logacid_copy_settings(LogacidAudioSettings *to, const LogacidAudioSettings *from)
{
    const uint8_t *f = (const uint8_t *)from; uint8_t *t = (uint8_t *)to;
    for (unsigned k = 0; k < sizeof *to; ++k) t[k] = f[k];
}
unsigned logacid_ptch(const LogacidParams *p, const LogacidStep *s, unsigned root)
{
    unsigned scale = p->scale < LOGACID_SCALES ? p->scale : 0u, degree = s->degree < 7u ? s->degree : 0u;
    /* Two octaves on stock's -12..+12: the root rotates the pitch classes inside them. */
    int semitone = -12 + (int)((root + logacid_scale_degrees[scale][degree]) % 12u) + 12 * (int)(s->octave & 1u);
    return (unsigned)(64 + 5 * semitone);
}
static unsigned abit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void asetbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
/* As VECTOR's: no trigs, marks or recorder events (masks 0-7 and 9; 8 is swing, a default) and no lock at all. */
int logacid_audio_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 64; ++i) if (r[i]) return 0;
    for (unsigned i = 72; i < 80; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < LOGACID_STEPS * 32u; ++i) if (r[LOGACID_AUDIO_LOCKS + i] != LOGACID_NO_LOCK) return 0;
    return 1;
}
static void aput(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v)
{
    if (r[at] == v) return;
    r[at] = v;
    if (mirror) mirror[at] = v;
}
/* In place, only the bytes that change, as the MIDI writer. Step i of the line: a rest clears the trig and its PTCH,
 * HOLD, VOL and DEPTH locks; a note is a trig with PTCH, HOLD (GATE, or longer when it slides) and, by kind, VOL and
 * DEPTH locks; the step after a slide keeps no trig: it is a lock-only step with the PTCH lock and the slide trig, so
 * the held sample glides to it. Old and new notes lose stale marks and get a straight trig word. `locked` gets
 * whether each step keeps any lock. Returns the number of trigs. */
unsigned logacid_write_audio(uint8_t *r, uint8_t *mirror, const LogacidPattern *pattern, const LogacidParams *p,
                           const LogacidAudio *a, uint8_t locked[LOGACID_STEPS])
{
    uint8_t masks[80], slid[LOGACID_STEPS];
    unsigned trigs = 0, length = pattern->length > LOGACID_STEPS ? LOGACID_STEPS : pattern->length, slide_mask = a->slide_mask;
    for (unsigned k = 0; k < 80; ++k) masks[k] = r[k];
    /* A step is slid into when the step before it (the last, into the first) slides: the line's cleanup promises a
     * note there. */
    for (unsigned i = 0; i < length; ++i) slid[i] = (uint8_t)(pattern->steps[(i + length - 1u) % length].kind == LOGACID_SLIDE && pattern->steps[i].kind != LOGACID_REST);
    for (unsigned i = 0; i < LOGACID_STEPS; ++i) {
        const LogacidStep *s = &pattern->steps[i];
        unsigned at = LOGACID_AUDIO_LOCKS + 32u * i, old = abit(masks, LOGACID_MASK_TRIGS, i), note = i < length && s->kind != LOGACID_REST;
        if (i >= length) {
            unsigned any = 0;
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != LOGACID_NO_LOCK;
            locked[i] = (uint8_t)any;
            continue;
        }
        unsigned trig = note && !slid[i], accent = note && s->kind == LOGACID_ACCENT;
        unsigned hold = 2u * a->gate;
        if (trig && s->kind == LOGACID_SLIDE) { /* hold through every step slid into after this one */
            for (unsigned j = (i + 1u) % length; j != i && slid[j]; j = (j + 1u) % length) hold += LOGACID_HOLD_STEP;
            if (hold > 126u) hold = 126u;
        }
        aput(r, mirror, at + LOGACID_LOCK_PTCH, note ? (uint8_t)logacid_ptch(p, s, a->root) : (uint8_t)LOGACID_NO_LOCK);
        aput(r, mirror, at + LOGACID_LOCK_HOLD, trig ? (uint8_t)hold : (uint8_t)LOGACID_NO_LOCK);
        aput(r, mirror, at + LOGACID_LOCK_VOL, note && a->avel && !accent ? (uint8_t)(a->base_vol > 4u * a->avel ? a->base_vol - 4u * a->avel : 0u) : (uint8_t)LOGACID_NO_LOCK);
        aput(r, mirror, at + LOGACID_LOCK_FX1_DEPTH, accent && a->filter && a->aflt ? (uint8_t)(18u * a->aflt) : (uint8_t)LOGACID_NO_LOCK);
        asetbit(masks, LOGACID_MASK_TRIGS, i, trig);
        if (slide_mask < 10u) asetbit(masks, slide_mask, i, slid[i]);
        if (old || note) { /* a straight trig word; no stale one-shot or condition marks (as VECTOR, masks 1, 3 and 9) */
            aput(r, mirror, LOGACID_AUDIO_TIMING + 2u * i, 0);
            aput(r, mirror, LOGACID_AUDIO_TIMING + 2u * i + 1u, 0);
            for (unsigned m = 1; m < 10u; m += (m == 1u ? 2u : 6u)) if (m != slide_mask) asetbit(masks, m, i, 0);
        }
        unsigned any = note;
        for (unsigned k = 1; !any && k < 32; ++k) any = k != LOGACID_LOCK_HOLD && k != LOGACID_LOCK_VOL && k != LOGACID_LOCK_FX1_DEPTH && r[at + k] != LOGACID_NO_LOCK;
        locked[i] = (uint8_t)any;
        asetbit(masks, LOGACID_MASK_LOCK_ONLY, i, !trig && any);
        trigs += trig;
    }
    for (unsigned k = 0; k < 80; ++k) aput(r, mirror, k, masks[k]);
    return trigs;
}

/* Seven bits a byte: a field of `bits` at bit offset `at` across the nine bytes. */
static unsigned field(const uint8_t *in, unsigned at, unsigned bits)
{
    unsigned v = 0;
    for (unsigned b = 0; b < bits; ++b, ++at) v |= (unsigned)((in[at / 7u] >> (at % 7u)) & 1u) << b;
    return v;
}
static void set_field(uint8_t *out, unsigned at, unsigned bits, unsigned v)
{
    for (unsigned b = 0; b < bits; ++b, ++at) {
        uint8_t m = (uint8_t)(1u << (at % 7u));
        out[at / 7u] = (uint8_t)(v >> b & 1u ? out[at / 7u] | m : out[at / 7u] & (uint8_t)~m);
    }
}
static const uint8_t widths[12] = {7, 7, 7, 7, 5, 6, 5, 3, 2, 5, 4, 3}; /* DENS ACNT SLID SEED VAR GATE AVEL SCAL DIR MOTF ROOT AFLT */
void logacid_pack(uint8_t out[LOGACID_PACKED], const LogacidAudioSettings *s)
{
    unsigned v[12] = {s->p.density, s->p.accent, s->p.slide, s->p.seed, s->p.var, s->a.gate, s->a.avel, s->p.scale, s->p.dir,
                      s->p.motif ? s->p.motif - 1u : 0u, s->a.root, s->a.aflt};
    for (unsigned k = 0; k < LOGACID_PACKED; ++k) out[k] = 0;
    for (unsigned k = 0, at = 0; k < 12; at += widths[k++]) set_field(out, at, widths[k], v[k] & ((1u << widths[k]) - 1u));
}
void logacid_unpack(LogacidAudioSettings *s, const uint8_t in[LOGACID_PACKED])
{
    unsigned v[12];
    for (unsigned k = 0, at = 0; k < 12; at += widths[k++]) v[k] = field(in, at, widths[k]);
    logacid_copy_settings(s, &logacid_audio_defaults);
    s->p.density = (uint8_t)v[0]; s->p.accent = (uint8_t)v[1]; s->p.slide = (uint8_t)v[2]; s->p.seed = (uint8_t)v[3];
    s->p.var = (uint8_t)v[4]; s->a.gate = (uint8_t)v[5]; s->a.avel = (uint8_t)v[6];
    s->p.scale = (uint8_t)(v[7] < LOGACID_SCALES ? v[7] : 0u); s->p.dir = (uint8_t)v[8];
    s->p.motif = (uint8_t)(v[9] ? v[9] + 1u : 0u); s->a.root = (uint8_t)(v[10] < 12u ? v[10] : 0u); s->a.aflt = (uint8_t)v[11];
}
