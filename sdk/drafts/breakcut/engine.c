/* SPDX-License-Identifier: GPL-3.0-or-later
 * BREAKCUT engine. The cut procedures follow Livecut's BBCutter.cpp (Remy Muller, GPL-2.0-or-later, mdsp/Livecut
 * 2695d386ebb23b13ceeb1a4aa76b6851ce9ea050): CutProc11's repeats and end-of-phrase stutter, WarpCut's straight,
 * regular and accelerating blocks with ritardando, SQPusher's quaver and semiquaver pushes and its thirteen fills, with
 * Livecut's defaults where BREAKCUT has no knob. Livecut draws from rand(); this draws from a seeded xorshift, so a
 * line reproduces from its settings. Integers only. Firmware-free. */
#include "engine.h"

const BcParams bc_defaults = {BC_CUT, 16, 64, 100, 12, 0, 1};
const char *const bc_algo_names[4] = {"CUT", "WARP", "SQP", "MIX"};

#define UNITS_PER_BAR 16u
#define MAX_CUTS 128u
typedef struct { uint16_t start, len; int8_t semis; } Cut;
typedef struct {
    uint32_t rng;
    const BcParams *p;
    BcLine *out;
    unsigned length;
    Cut cuts[MAX_CUTS];
    unsigned ncuts;
} Ctx;

static uint32_t next(Ctx *c) { uint32_t x = c->rng ? c->rng : 1u; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return c->rng = x; }
static unsigned frac16(Ctx *c) { return next(c) >> 16; }                     /* [0, 65536) */
static int chance127(Ctx *c, unsigned v) { return v >= 127u || frac16(c) < v * 516u; } /* v / 127 */
static int chance100(Ctx *c, unsigned pct) { return frac16(c) < pct * 656u; }       /* pct / 100 */
static unsigned randint(Ctx *c, unsigned lo, unsigned hi) { return lo + (next(c) >> 8) % (hi - lo + 1u); }
static unsigned wchoose(Ctx *c, const uint8_t *weights, unsigned n) /* weights in percent, summing to 100 */
{
    unsigned v = (next(c) >> 8) % 100u, sum = 0;
    for (unsigned k = 0; k < n; ++k) { sum += weights[k]; if (v < sum) return k; }
    return n - 1u;
}
static int ramp_semis(const BcParams *p, unsigned i, unsigned n) { return n ? ((int)p->ramp - 12) * (int)i / (int)n : 0; }
static void add_cut(Ctx *c, unsigned start, unsigned len, int semis)
{
    if (c->ncuts >= MAX_CUTS || !len) return;
    c->cuts[c->ncuts].start = (uint16_t)start; c->cuts[c->ncuts].len = (uint16_t)len; c->cuts[c->ncuts].semis = (int8_t)semis;
    ++c->ncuts;
}

/* One block at step b, n steps long: its cuts (ticks from the block's start, sorted) all replay the slice the block
 * starts on. A step takes the first cut starting in it (micro-timing), with the others as retrigs at their mean
 * spacing; a step no cut starts in continues the cut sounding into it with the next slice, when that slice is due in
 * it. A reversed block plays its slices backwards. */
static void render_block(Ctx *c, unsigned b, unsigned n, unsigned rev)
{
    unsigned slices = c->p->slices ? c->p->slices : 1u, src = b % slices;
    for (unsigned s = b; s < b + n && s < c->length; ++s) {
        BcStep *o = &c->out->steps[s];
        unsigned rel0 = (s - b) * BC_TICKS, rel1 = rel0 + BC_TICKS, first = MAX_CUTS, last = 0, count = 0;
        for (unsigned k = 0; k < c->ncuts; ++k)
            if (c->cuts[k].start >= rel0 && c->cuts[k].start < rel1) { if (first == MAX_CUTS) first = k; last = k; ++count; }
        if (count) {
            const Cut *f = &c->cuts[first];
            unsigned span = (f->len + BC_TICKS - 1u) / BC_TICKS;
            o->trig = 1; o->micro = (uint8_t)(f->start - rel0); o->semis = f->semis; o->rev = (uint8_t)rev;
            o->slice = (uint8_t)((src + (rev ? span - 1u : 0u)) % slices);
            if (count > 1) {
                o->retrigs = (uint8_t)(count - 1u > 15u ? 15u : count - 1u);
                o->period = (uint8_t)((c->cuts[last].start - f->start) / (count - 1u));
                if (!o->period) o->period = 1;
            }
            continue;
        }
        for (unsigned k = 0; k < c->ncuts; ++k) { /* the cut sounding into this step */
            const Cut *cut = &c->cuts[k];
            if (cut->start >= rel0 || cut->start + cut->len <= rel0) continue;
            unsigned j = (rel0 - cut->start + BC_TICKS - 1u) / BC_TICKS, at = cut->start + j * BC_TICKS;
            unsigned span = (cut->len + BC_TICKS - 1u) / BC_TICKS;
            if (at < rel1 && j * BC_TICKS < cut->len) {
                o->trig = 1; o->micro = (uint8_t)(at - rel0); o->semis = cut->semis; o->rev = (uint8_t)rev;
                o->slice = (uint8_t)((src + (rev ? span - 1u - j : j)) % slices);
            }
            break;
        }
    }
}
static void block_done(Ctx *c, unsigned b, unsigned n)
{
    render_block(c, b, n, chance127(c, c->p->rev));
    c->ncuts = 0;
}

/* CutProc11, with Livecut's area 0.5 and minimum one occurrence; ACTV sets the maximum repeats (0-4), ROLL the
 * stutter chance. */
static void cutproc11(Ctx *c, unsigned start, unsigned total)
{
    static const uint8_t mults[6] = {1, 2, 3, 4, 6, 8}, probs[6] = {40, 30, 10, 10, 5, 5};
    unsigned maxrep = c->p->actv * 5u / 128u;
    for (unsigned done = 0; done < total;) {
        unsigned left = total - done, block;
        if (2u * left < UNITS_PER_BAR && chance127(c, c->p->roll)) { /* end-of-phrase stutter */
            unsigned mult = mults[wchoose(c, probs, 6)], repeats = left * mult, len = BC_TICKS / mult;
            for (unsigned i = 0; i < repeats; ++i) add_cut(c, i * len, len, ramp_semis(c->p, i, repeats));
            block = left;
        } else {
            unsigned units = 2u * randint(c, 0, UNITS_PER_BAR / 4u) + 1u, repeats = randint(c, 1, 1u + maxrep);
            while (units > left) units -= 2u;
            while (repeats * units > left) {
                if (repeats > 1u) --repeats;
                else if (left <= UNITS_PER_BAR / 2u + 1u) { units = left; repeats = 1; }
                else { units = 1; repeats = 1; }
            }
            for (unsigned i = 0; i < repeats; ++i) add_cut(c, i * units * BC_TICKS, units * BC_TICKS, 0);
            block = repeats * units;
        }
        block_done(c, start + done, block);
        done += block;
    }
}
/* WarpCut, with Livecut's ritard chance 0.5 and speed 0.9; ACTV is 1 - straight chance, ROLL the accelerando share
 * (1 - regular chance). */
static void warpcut(Ctx *c, unsigned start, unsigned total)
{
    static const uint8_t sizes[3] = {1, 2, 4}, probs[3] = {50, 40, 10}, counts[3] = {4, 8, 16};
    for (unsigned done = 0; done < total;) {
        unsigned left = total - done, block = sizes[wchoose(c, probs, 3)];
        if (block > left) block = left;
        unsigned ticks = block * BC_TICKS;
        if (!chance127(c, c->p->actv)) add_cut(c, 0, ticks, 0); /* straight */
        else {
            unsigned repeats = counts[randint(c, 0, 2)];
            if (repeats > block * 8u) repeats = block * 8u; /* no cut under 3 ticks, the fastest retrig taken here */
            if (!chance127(c, c->p->roll)) { /* regular */
                for (unsigned i = 0; i < repeats; ++i) add_cut(c, i * ticks / repeats, (i + 1u) * ticks / repeats - i * ticks / repeats, ramp_semis(c->p, i, repeats));
            } else { /* accelerating, 0.9 a cut (Q16), reversed into a ritardando half the time */
                uint32_t w[16], sum = 0, a = 65536u;
                for (unsigned i = 0; i < repeats; ++i) { w[i] = a; sum += a; a = a * 58982u >> 16; }
                unsigned ritard = chance100(c, 50), at = 0;
                for (unsigned i = 0; i < repeats; ++i) {
                    unsigned k = ritard ? repeats - 1u - i : i;
                    unsigned len = i + 1u == repeats ? ticks - at : (unsigned)(ticks * w[k] / sum);
                    add_cut(c, at, len ? len : 1u, ramp_semis(c->p, i, repeats));
                    at += len;
                }
            }
        }
        block_done(c, start + done, block);
        done += block;
    }
}
/* SQPusher: its fill sequences in ticks (Livecut's beats x 96, rounded), block by block, as sqpusherinit() builds
 * them (its typos kept: fill 6's second block carries 2.33, fill 8's first block six cuts, empty blocks skipped). */
static const uint16_t sqp_fill_cuts[] = {
    72, 72, 72, 72, 0, 96, 0, 0xffffu,
    48, 96, 0, 96, 0, 96, 48, 0, 0xffffu,
    48, 0, 96, 96, 96, 0, 48, 0, 0xffffu,
    55, 0, 55, 55, 0, 55, 55, 0, 55, 0, 27, 27, 0, 0xffffu,
    96, 48, 0, 96, 48, 0, 48, 48, 0, 0xffffu,
    48, 48, 0, 63, 64, 64, 0, 96, 0, 0xffffu,
    33, 0, 32, 32, 224, 0, 33, 32, 0, 0xffffu,
    134, 0, 38, 38, 0, 58, 19, 0, 96, 0, 0xffffu,
    16, 16, 16, 96, 96, 48, 0, 96, 0, 0xffffu,
    144, 48, 96, 0, 24, 24, 24, 24, 0, 0xffffu,
    19, 19, 0, 38, 38, 0, 38, 38, 0, 192, 0, 0xffffu,
    72, 72, 96, 0, 24, 24, 24, 24, 24, 24, 0, 0xffffu,
    48, 96, 0, 48, 0, 12, 12, 12, 12, 0, 96, 0, 16, 16, 16, 0, 0xffffu,
};
static const uint16_t *sqp_fill(unsigned n)
{
    const uint16_t *f = sqp_fill_cuts;
    while (n--) { while (*f != 0xffffu) ++f; ++f; }
    return f;
}
static void sqpusher(Ctx *c, unsigned start, unsigned total)
{
    static const uint8_t sqweights[8] = {0, 30, 0, 50, 70, 80, 90, 60};
    const uint16_t *fill = 0;
    unsigned fill_cuts = 0;
    for (unsigned done = 0; done < total;) {
        unsigned bar_left = UNITS_PER_BAR - done % UNITS_PER_BAR, block;
        if (bar_left > total - done) bar_left = total - done;
        if (total - done == UNITS_PER_BAR && chance127(c, c->p->roll)) fill = sqp_fill(randint(c, 0, 12));
        if (fill && *fill != 0xffffu) {
            unsigned at = 0;
            while (*fill == 0) ++fill; /* skip an empty block */
            if (*fill == 0xffffu) { fill = 0; continue; }
            const uint16_t *cut = fill;
            unsigned n = 0;
            while (*cut && *cut != 0xffffu) { n++; ++cut; }
            for (unsigned i = 0; i < n; ++i) { add_cut(c, at, fill[i], ramp_semis(c->p, fill_cuts + i, fill_cuts + n + 2u)); at += fill[i]; }
            fill_cuts += n;
            fill = cut;
            block = (at + BC_TICKS / 2u) / BC_TICKS;
            if (!block) block = 1;
        } else {
            fill = 0; fill_cuts = 0;
            unsigned temp = 1u + 2u * randint(c, 0, 1);
            if (done % 4u == 2u) temp = 1;
            block = 2u * temp;
            unsigned quaver = (done % UNITS_PER_BAR) / 2u;
            if (frac16(c) < sqweights[quaver] * c->p->actv * 656u / 127u) /* semiquavers */
                for (unsigned i = 0; i < 2u * temp; ++i) add_cut(c, i * BC_TICKS, BC_TICKS, 0);
            else
                for (unsigned i = 0; i < temp; ++i) add_cut(c, i * 2u * BC_TICKS, 2u * BC_TICKS, 0);
        }
        if (block > bar_left) block = bar_left;
        block_done(c, start + done, block);
        done += block;
    }
}

unsigned bc_next_seed(unsigned seed) { return (seed + 1u) & 127u; }
int bc_generate(BcLine *out, const BcParams *p, unsigned length)
{
    static Ctx ctx; /* 600 bytes: kept off the UI task's stack */
    if (!out || !p || !length || length > BC_STEPS || p->algo > BC_MIX || !p->slices || p->slices > 64u || p->ramp > 24u) return 0;
    for (unsigned s = 0; s < BC_STEPS; ++s) {
        BcStep *o = &out->steps[s];
        o->trig = o->micro = o->slice = o->retrigs = o->period = o->rev = 0; o->semis = 0;
    }
    ctx.rng = 0xb8c07u ^ ((uint32_t)p->seed * 0x9e3779b9u);
    ctx.p = p; ctx.out = out; ctx.length = length; ctx.ncuts = 0;
    for (unsigned done = 0; done < length;) {
        unsigned algo = p->algo == BC_MIX ? randint(&ctx, 0, 2) : p->algo;
        unsigned total = randint(&ctx, 1, 4) * UNITS_PER_BAR; /* Livecut's phrase of 1-4 bars */
        if (total > length - done) total = length - done;
        if (algo == BC_CUT) cutproc11(&ctx, done, total);
        else if (algo == BC_WARP) warpcut(&ctx, done, total);
        else sqpusher(&ctx, done, total);
        done += total;
    }
    out->length = (uint8_t)length;
    return 1;
}

/* RTIM: 16 values an octave, 79 at one step (24 ticks): the value whose period is nearest `ticks` in the log sense.
 * Exact powers 2^(f/16) in Q16, so 12, 6 and 3 ticks land on 95, 111 and 127. */
static const uint32_t pow2_16th[16] = {65536u, 68438u, 71468u, 74632u, 77936u, 81386u, 84990u, 88752u, 92682u, 96785u, 101070u, 105545u, 110218u, 115098u, 120194u, 125515u};
static uint32_t rtim_period_q8(unsigned v) /* 24 x 2^((79 - v) / 16) ticks, Q8 */
{
    int e = 79 - (int)v;
    if (e >= 0) return ((6144u * pow2_16th[e % 16]) >> 16) << (e / 16);
    unsigned o = (unsigned)(-e + 15) / 16u, f = 16u * o - (unsigned)-e;
    return ((6144u * pow2_16th[f]) >> 16) >> o;
}
unsigned bc_rtim(unsigned ticks)
{
    if (!ticks) return 127;
    uint32_t want = ((uint32_t)ticks << 8) * 66973u >> 16; /* half a step up: x 2^(1/32) */
    for (unsigned v = 0; v < 127u; ++v) if (rtim_period_q8(v) <= want) return v;
    return 127;
}

static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v) { if (r[at] != v) { r[at] = v; if (mirror) mirror[at] = v; } }
int bc_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 64; ++i) if (r[i]) return 0;
    for (unsigned i = 72; i < 80; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < BC_STEPS * 32u; ++i) if (r[BC_LOCKS + i] != BC_NO_LOCK) return 0;
    return 1;
}
unsigned bc_write(uint8_t *r, uint8_t *mirror, const BcLine *line, uint8_t locked[BC_STEPS])
{
    static const uint8_t owned[5] = {0, 1, 3, 4, 5}; /* PTCH, STRT, RATE, RTRG, RTIM */
    uint8_t masks[80];
    unsigned trigs = 0, length = line->length > BC_STEPS ? BC_STEPS : line->length;
    for (unsigned k = 0; k < 80; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < BC_STEPS; ++i) {
        unsigned at = BC_LOCKS + 32u * i, old = bit(masks, 0, i), any = 0;
        if (i < length) {
            const BcStep *s = &line->steps[i];
            uint8_t v[5] = {BC_NO_LOCK, BC_NO_LOCK, BC_NO_LOCK, BC_NO_LOCK, BC_NO_LOCK};
            if (s->trig) {
                if (s->semis) v[0] = (uint8_t)(64 + 5 * s->semis);
                v[1] = (uint8_t)(s->slice * BC_STRT_PER_SLICE);
                if (s->rev) v[2] = BC_RATE_REVERSE;
                if (s->retrigs) { v[3] = s->retrigs; v[4] = (uint8_t)bc_rtim(s->period); }
            }
            for (unsigned k = 0; k < 5; ++k) put(r, mirror, at + owned[k], v[k]);
            setbit(masks, 0, i, s->trig);
            if (old || s->trig) {
                unsigned word = s->trig ? (unsigned)(s->micro & 0x3fu) << 7 : 0u;
                put(r, mirror, BC_TIMING + 2u * i, (uint8_t)(word >> 8));
                put(r, mirror, BC_TIMING + 2u * i + 1u, (uint8_t)word);
                setbit(masks, 1, i, 0); setbit(masks, 3, i, 0); setbit(masks, 9, i, 0);
            }
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != BC_NO_LOCK;
            setbit(masks, 2, i, !s->trig && any);
            locked[i] = (uint8_t)(any || s->trig);
            trigs += s->trig;
        } else {
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != BC_NO_LOCK;
            locked[i] = (uint8_t)any;
        }
    }
    for (unsigned k = 0; k < 80; ++k) put(r, mirror, k, masks[k]);
    return trigs;
}

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
static const uint8_t widths[7] = {2, 6, 7, 7, 5, 7, 7}; /* ALGO SLCS-1 ACTV ROLL RAMP REV SEED */
void bc_pack(uint8_t out[BC_PACKED], const BcParams *p)
{
    unsigned v[7] = {p->algo, p->slices ? p->slices - 1u : 0u, p->actv, p->roll, p->ramp, p->rev, p->seed};
    for (unsigned k = 0; k < BC_PACKED; ++k) out[k] = 0;
    for (unsigned k = 0, at = 0; k < 7; at += widths[k++]) set_field(out, at, widths[k], v[k] & ((1u << widths[k]) - 1u));
}
void bc_unpack(BcParams *p, const uint8_t in[BC_PACKED])
{
    unsigned v[7];
    for (unsigned k = 0, at = 0; k < 7; at += widths[k++]) v[k] = field(in, at, widths[k]);
    p->algo = (uint8_t)v[0]; p->slices = (uint8_t)(v[1] + 1u); p->actv = (uint8_t)v[2]; p->roll = (uint8_t)v[3];
    p->ramp = (uint8_t)(v[4] <= 24u ? v[4] : 12u); p->rev = (uint8_t)v[5]; p->seed = (uint8_t)v[6];
}
