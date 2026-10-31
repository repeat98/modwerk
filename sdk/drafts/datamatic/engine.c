/* SPDX-License-Identifier: GPL-3.0-or-later
 * DATAMATIC engine. The streams: seven tables of 2048 bits (tables.c, written by generate_tables.py from the constants
 * and sequences themselves), an elementary cellular automaton 32 cells wide on a ring (Wolfram's rule numbering, one
 * row after another), and a 16-bit Galois LFSR. A step's window is BITS bits read MSB first at OFFSET x 8 + step x
 * STRIDE; it plays when its value reaches the DENS threshold; the 4 bits after the window pick its interval, the
 * next 4 its velocity and the next 4 its micro-timing. Integers only. Firmware-free. */
#include "engine.h"

/* PI, OFFS 0, BITS 1, DENS 0 (the stream as it is), SPRD 1, INTV OCT, VDAT 64, JITR 0, RULE 30, SEED 0, STEP 1. */
const DmParams dm_defaults = {DM_PI, 0, 1, 0, 1, DM_OCT, 64, 0, 0, 0, 1};
const char *const dm_source_names[DM_SOURCES] = {"PI", "E", "PHI", "SQR2", "FIBO", "PRIM", "THUE", "CA", "LFSR"};
const char *const dm_interval_names[DM_INTERVALS] = {"OCT", "5TH", "TRIT", "WHOL", "CLST"};
const uint8_t dm_rules[DM_RULES] = {30, 45, 54, 60, 73, 90, 105, 110, 122, 126, 150, 169, 182, 184, 225, 250};

unsigned dm_bit(const DmStream *s, unsigned k)
{
    return k < DM_STREAM_BITS ? (s->bits[k >> 3] >> (7u - (k & 7u))) & 1u : 0u;
}
static void set_bit(DmStream *s, unsigned k, unsigned v)
{
    uint8_t m = (uint8_t)(0x80u >> (k & 7u));
    s->bits[k >> 3] = (uint8_t)(v ? s->bits[k >> 3] | m : s->bits[k >> 3] & (uint8_t)~m);
}
static uint32_t lfsr_start(unsigned seed) { uint32_t x = (0xACE1u ^ (uint32_t)seed * 0x9E37u) & 0xffffu; return x ? x : 1u; }
static uint32_t lfsr_step(uint32_t x) { return (x >> 1) ^ (-(x & 1u) & 0xB400u); } /* x^16 + x^14 + x^13 + x^11 + 1 */
int dm_stream(DmStream *out, const DmParams *p)
{
    if (!out || !p || p->source >= DM_SOURCES) return 0;
    if (p->source < DM_CA) {
        const uint8_t *t = dm_tables[p->source];
        for (unsigned k = 0; k < DM_STREAM_BITS / 8u; ++k) out->bits[k] = t[k];
        return 1;
    }
    if (p->source == DM_LFSR) {
        uint32_t x = lfsr_start(p->seed);
        for (unsigned k = 0; k < DM_STREAM_BITS; ++k) { set_bit(out, k, x & 1u); x = lfsr_step(x); }
        return 1;
    }
    /* the automaton: a 32-cell ring, row 0 one live cell in the middle (SEED 0) or the LFSR's bits */
    unsigned rule = dm_rules[p->rule % DM_RULES];
    uint32_t row = 0;
    if (!p->seed) row = 1u << 16;
    else { uint32_t x = lfsr_start(p->seed); for (unsigned c = 0; c < 32u; ++c) { row |= (x & 1u) << c; x = lfsr_step(x); } }
    for (unsigned r = 0; r < DM_STREAM_BITS / 32u; ++r) {
        for (unsigned c = 0; c < 32u; ++c) set_bit(out, 32u * r + c, (row >> (31u - c)) & 1u);
        uint32_t next = 0;
        for (unsigned c = 0; c < 32u; ++c) {
            unsigned l = (row >> ((c + 1u) & 31u)) & 1u, m = (row >> c) & 1u, rt = (row >> ((c + 31u) & 31u)) & 1u;
            next |= (uint32_t)((rule >> (l << 2 | m << 1 | rt)) & 1u) << c;
        }
        row = next;
    }
    return 1;
}
static unsigned read(const DmStream *s, unsigned at, unsigned bits)
{
    unsigned v = 0;
    for (unsigned b = 0; b < bits; ++b) v = v << 1 | dm_bit(s, at + b);
    return v;
}
/* The intervals of each set, in semitones, up to four octaves. */
static const uint8_t intervals[DM_INTERVALS][25] = {
    {0, 12, 24, 36, 48},
    {0, 7, 12, 19, 24, 31, 36, 43, 48},
    {0, 6, 12, 18, 24, 30, 36, 42, 48},
    {0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48},
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12},
};
static const uint8_t interval_count[DM_INTERVALS] = {5, 9, 9, 25, 13};
int dm_generate(DmLine *out, const DmParams *p, unsigned length, unsigned base_note, unsigned base_vel)
{
    static DmStream stream; /* 256 bytes: kept off the UI task's stack */
    if (!out || !p || !length || length > DM_STEPS || p->bits < 1u || p->bits > 8u || p->stride < 1u || p->stride > 8u
        || p->spread > 4u || p->intv >= DM_INTERVALS || p->jitter > 23u || p->dens > 127u || p->vdat > 127u
        || base_note > 127u || base_vel > 127u || !dm_stream(&stream, p)) return 0;
    unsigned threshold = ((127u - p->dens) << p->bits) / 128u, top = 12u * p->spread, reach = 0;
    while (reach < interval_count[p->intv] && intervals[p->intv][reach] <= top) ++reach;
    for (unsigned i = 0; i < DM_STEPS; ++i) {
        DmStep *s = &out->steps[i];
        s->trig = s->note = s->vel = s->micro = 0;
        if (i >= length) continue;
        unsigned at = 8u * p->offset + i * p->stride, v = read(&stream, at, p->bits);
        if (v < threshold) continue;
        unsigned pick = read(&stream, at + p->bits, 4), level = read(&stream, at + p->bits + 4u, 4);
        unsigned late = read(&stream, at + p->bits + 8u, 4), note = base_note + intervals[p->intv][pick % reach];
        while (note > 127u) note -= 12u;
        unsigned drop = base_vel * p->vdat * (15u - level) / (127u * 15u), vel = base_vel > drop ? base_vel - drop : 1u;
        s->trig = 1;
        s->note = (uint8_t)note;
        s->vel = (uint8_t)(vel ? vel : 1u);
        s->micro = (uint8_t)(late * p->jitter / 15u);
    }
    out->length = (uint8_t)length;
    return 1;
}

static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
int dm_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 24; ++i) if (r[i]) return 0;
    for (unsigned i = 32; i < 40; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < DM_STEPS; ++i)
        for (unsigned k = 0; k < 3; ++k) if (r[DM_LOCKS + 32u * i + k] != DM_NO_LOCK) return 0;
    return 1;
}
static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v)
{
    if (r[at] == v) return;
    r[at] = v;
    if (mirror) mirror[at] = v;
}
unsigned dm_write(uint8_t *r, uint8_t *mirror, const DmLine *line, uint8_t locked[DM_STEPS])
{
    uint8_t masks[40];
    unsigned trigs = 0, length = line->length > DM_STEPS ? DM_STEPS : line->length;
    for (unsigned k = 0; k < 40; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < DM_STEPS; ++i) {
        const DmStep *s = &line->steps[i];
        unsigned at = DM_LOCKS + 32u * i, old = bit(masks, 0, i), active = i < length && s->trig, any;
        if (i >= length) { /* past the track's length: as it was */
            any = 0;
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != DM_NO_LOCK;
            locked[i] = (uint8_t)any;
            continue;
        }
        put(r, mirror, at, active ? s->note : (uint8_t)DM_NO_LOCK);
        put(r, mirror, at + 1u, active ? s->vel : (uint8_t)DM_NO_LOCK);
        setbit(masks, 0, i, active);
        if (old || active) { /* its own trig word: the data's micro-timing, no condition; no stale marks */
            unsigned word = active ? (unsigned)(s->micro & 0x3fu) << 7 : 0u;
            put(r, mirror, DM_TIMING + 2u * i, (uint8_t)(word >> 8));
            put(r, mirror, DM_TIMING + 2u * i + 1u, (uint8_t)word);
            setbit(masks, 1, i, 0); setbit(masks, 4, i, 0);
        }
        any = active;
        for (unsigned k = 2; !any && k < 32; ++k) any = r[at + k] != DM_NO_LOCK;
        locked[i] = (uint8_t)any;
        setbit(masks, 2, i, !active && any);
        trigs += active;
    }
    for (unsigned k = 0; k < 40; ++k) put(r, mirror, k, masks[k]);
    return trigs;
}
