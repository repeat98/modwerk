/* SPDX-License-Identifier: MIT
 * SYNTIZ's oscillators (engine.h). Band-limited saws by polyBLEP; a pulse is the difference of two
 * saws a width apart, a square sub the same at half width; the sines are a corrected parabola, so
 * no table is needed. Controls become increments and gains once per block; the per-sample loop
 * only adds, shifts and multiplies values below 2^16. */
#include "engine.h"
#include "tables.h"

/* The module builder compiles for size (-Os); the per-sample loops are measured at -O2 (TESTING.md). */
#pragma GCC optimize("O2")

const uint32_t wave_ratio[49] = {
    16384u, 17358u, 18390u, 19484u, 20643u, 21870u, 23170u, 24548u,
    26008u, 27554u, 29193u, 30929u, 32768u, 34716u, 36781u, 38968u,
    41285u, 43740u, 46341u, 49097u, 52016u, 55109u, 58386u, 61858u,
    65536u, 69433u, 73562u, 77936u, 82570u, 87480u, 92682u, 98193u,
    104032u, 110218u, 116772u, 123715u, 131072u, 138866u, 147123u, 155872u,
    165140u, 174960u, 185364u, 196386u, 208064u, 220436u, 233544u, 247431u,
    262144u,
};

/* The rest 0. MORPH: SAW and DSAW (a saw and its octave) half and half; CHOIR: one VOWA voice through the chorus. */
const WaveControls wave_defaults[WAVE_MODELS] = {
    [WAVE_SAW]   = { .model = WAVE_SAW, .det = 24, .pw = 64, .note = { 64, 64, 64 }, .drive = 64 },
    [WAVE_PULSE] = { .model = WAVE_PULSE, .det = 16, .pw = 64, .note = { 64, 64, 64 }, .drive = 64 },
    [WAVE_ENS]   = { .model = WAVE_ENS, .note = { 64, 64, 64 }, .chor = 64, .drive = 64 },
    [WAVE_TABLE] = { .model = WAVE_TABLE, .note = { 64, 64, 64 }, .drive = 64 },
    [WAVE_MORPH] = { .model = WAVE_MORPH, .note = { 64, 64, 64 }, .drive = 64, .table = 8, .wav2 = 24, .mix = 64 },
    [WAVE_CHOIR] = { .model = WAVE_CHOIR, .note = { 64, 64, 64 }, .chor = 64, .drive = 64, .table = 108 },
};

/* Start phases a seventh of a turn apart: oscillators that start together never add in phase. */
static void spread(Wave *w)
{
    for (unsigned k = 0; k < 8u; ++k) w->ph[k] = k * 0x24924924u;
    w->sub = 0x40000000u, w->sub2 = 0x40000000u;
}

void wave_reset(Wave *w)
{
    spread(w);
    w->sweep = 0x40000000u, w->lfo = 0, w->write = 0, w->dcx = w->dcy = 0, w->sx = w->sf = w->ex = 0;
    w->fade = 0, w->armed = 0;
    for (unsigned k = 0; k < WAVE_DELAY; ++k) w->line[k] = 0;
}

void wave_note(Wave *w, const WaveControls *c)
{
    if (c->rtrg >= 64u) spread(w), w->sweep = 0x40000000u;
}

/* One saw sample at phase p, rising from -32768 to 32767 and falling at the wrap, with the polyBLEP
 * residual over the sample on each side of the fall. inc >> 15 is at least 1 (wave_render). The
 * divide runs on two samples a period only. */
static inline int32_t saw(uint32_t p, uint32_t inc)
{
    int32_t s = (int32_t)(p ^ 0x80000000u) >> 16;
    if (p < inc) {
        uint32_t u = p / (inc >> 15);
        int32_t t = u > 32767u ? 32767 : (int32_t)u; /* inc >> 15 rounds down: very low notes overshoot */
        s -= 2 * t - ((t * t) >> 15) - 32768;
    } else if (p > ~inc) {
        uint32_t u = ~p / (inc >> 15);
        int32_t t = u > 32767u ? 32767 : (int32_t)u;
        s -= ((t * t) >> 15) - 2 * t + 32768;
    }
    return s;
}

/* sin(pi x) for x = (int32_t)p / 2^31, Q15: a parabola, then the usual 0.225 correction
 * (within about 0.1 % of full scale). */
static inline int32_t sine(uint32_t p)
{
    int32_t x = (int32_t)p >> 16, ax = x < 0 ? -x : x;
    int32_t y = 4 * x - ((x * ax) >> 13), ay = y < 0 ? -y : y;
    return y + ((7373 * (((y * ay) >> 15) - y)) >> 15);
}

/* a * r / 2^16 for a Q16 ratio r < 2^19, saturating: an increment past the top is silenced. */
static uint32_t scale(uint32_t a, uint32_t r)
{
    uint32_t hi = a >> 16, lo = a & 0xffffu, x = hi * r;
    if (hi && x / hi != r) return 0xffffffffu;
    uint32_t y = x + ((lo * (r >> 3)) >> 13);
    return y < x ? 0xffffffffu : y;
}

#define NYQUIST 0x7f000000u            /* an oscillator at or above about 21.8 kHz is silent */
static inline uint32_t audible(uint32_t inc) { return inc >= 32768u && inc < NYQUIST; }

/* The output stage: the sum times DRIVE, then a cubic that maps 1.5 of full scale to full scale, so
 * stacked oscillators thicken instead of wrapping, then a DC blocker (one pole at about 7 Hz, 1 - 2^-10,
 * no multiply): a saturated stack of saws is not symmetric.
 * The cubic is anti-aliased (the author's choice B, 27 Oct 2026: at DRIVE 110 a stack sat on the flat a third
 * of the time and its aliasing rose 7-9 dB): first-order antiderivative anti-aliasing (Parker, Zavalishin
 * and Le Bivic, DAFx 2016). The output is the mean of the curve between this sample and the last, the
 * difference of its antiderivative over the difference of the inputs: F(x) = x^2/2 - x^4/27 up to 1.5,
 * then |x| - 0.5625. x in Q13 up to 4, F in Q24; one divide a sample. */
static inline int32_t gain_of(unsigned drive) { return (int32_t)((24576u * drive * drive) >> 12); } /* 64: 0.75 */
static inline int32_t cubic(int32_t x)  /* Q15 */
{
    if (x > 49152) x = 49152; else if (x < -49152) x = -49152;
    int32_t a = x >> 1, a3 = (((a * a) >> 15) * a) >> 15;
    return x - ((a3 * 38836) >> 15);    /* x - (4/27) x^3, as 8 a^3 * 4/27 */
}
static inline int32_t antiderivative(int32_t x)
{
    int32_t ax = x < 0 ? -x : x;
    if (ax >= 12288) return ax * 2048 - 9437184;
    int32_t x2 = (ax * ax) >> 13;
    return ((ax * ax) >> 3) - (int32_t)((((uint32_t)(x2 * x2) >> 10) * 9709u) >> 10); /* x^4 / 108 in Q26 */
}
/* The output stage's state, copied in for a block so it can live in registers. */
typedef struct { int32_t sx, sf, dcx, dcy, ex; } Out;
static inline Out out_load(const Wave *w) { Out o = { w->sx, w->sf, w->dcx, w->dcy, w->ex }; return o; }
static inline void out_store(Wave *w, const Out *o)
{
    w->sx = o->sx, w->sf = o->sf, w->dcx = o->dcx, w->dcy = o->dcy, w->ex = o->ex;
}
/* The mean over a sample is a gentle low-pass (-2.4 dB at 10 kHz, -5.8 dB at 15 kHz on a clean signal).
 * A first-order emphasis before the curve, x + 0.3 (x - x[-1]), gives that treble back (within 0.2 dB
 * to 10 kHz) and the curve still bounds the peaks (the author's choice B2, 27 Oct 2026). */
static inline int32_t shape(Out *o, int32_t x)
{
    if (x > 131071) x = 131071; else if (x < -131071) x = -131071;
    int32_t x13 = x >> 2;
    int32_t e = x13 + (((x13 - o->ex) * 9830) >> 15);
    o->ex = x13, x13 = e > 40000 ? 40000 : e < -40000 ? -40000 : e;
    int32_t f = antiderivative(x13), d = x13 - o->sx, y;
    if (d > 16 || d < -16) y = ((f - o->sf) * 8 / d) * 2;  /* Q27 / Q13 = Q14 */
    else y = cubic(((x13 + o->sx) / 2) * 4);               /* too close to divide: the curve at the midpoint */
    o->sx = x13, o->sf = f;
    return y;
}

static inline int16_t finish(Out *o, int32_t acc, int32_t g)
{
    int32_t x = shape(o, ((acc >> 2) * (g >> 4)) >> 9);
    o->dcy += (x - o->dcx) * 256 - (o->dcy >> 10), o->dcx = x;
    x = o->dcy >> 8;
    return (int16_t)(x > 32767 ? 32767 : x < -32768 ? -32768 : x);
}

/* The subs, shared by every model: a square an octave down (two saws half a turn apart) and a sine
 * two octaves down. */
typedef struct { uint32_t i1, i2; int32_t g1, g2; } Subs;
/* A sub below 25 Hz is not heard and only spends headroom (the author, 27 Oct 2026): silent there, fading in
 * up to 30 Hz so a glide or an LFO crossing it does not click. */
#define SUB_LO 2434789u                 /* 25 Hz */
#define SUB_HI 2921746u                 /* 30 Hz */
static int32_t heard(int32_t g, uint32_t i)
{
    if (i >= SUB_HI) return audible(i) ? g : 0;
    if (i <= SUB_LO) return 0;
    return (int32_t)((uint32_t)g * ((i - SUB_LO) >> 5) / ((SUB_HI - SUB_LO) >> 5));
}
static Subs subs_of(const WaveControls *c, uint32_t inc)
{
    Subs s = { inc >> 1, inc >> 2, 0, 0 };
    s.g1 = heard(c->sub * 258, s.i1), s.g2 = heard(c->sub2 * 258, s.i2);
    return s;
}
static inline int32_t subs_tick(uint32_t q[2], const Subs *s) /* q: the block's copies of sub, sub2 */
{
    int32_t a = 0;
    if (s->g1) a += (s->g1 * ((saw(q[0], s->i1) - saw(q[0] + 0x80000000u, s->i1)) >> 1)) >> 15;
    if (s->g2) a += (s->g2 * sine(q[1])) >> 15;
    q[0] += s->i1, q[1] += s->i2;
    return a;
}

/* The unison pairs' detune: a frequency ratio 1 +/- d, d = 0.0595 (a semitone) at 127, quadratic. */
static inline uint32_t detune_q16(unsigned det) { return (det * det * 3962u) >> 14; }

static void render_saw(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    uint32_t d = detune_q16(c->det), di = scale(inc, d), dw = scale(inc, 2u * d);
    uint32_t i1 = inc + di, i2 = inc - di, i3 = inc + dw, i4 = inc - dw;
    int32_t gu = c->uni * 181, gw = c->wide * 181; /* 0.7 each at 127 */
    if (!audible(i1) || !audible(i2)) gu = 0;
    if (!audible(i3) || !audible(i4)) gw = 0;
    Subs s = subs_of(c, inc);
    int32_t g = gain_of(c->drive);
    uint32_t p0 = w->ph[0], p1 = w->ph[1], p2 = w->ph[2], p3 = w->ph[3], p4 = w->ph[4], q[2] = { w->sub, w->sub2 };
    Out o = out_load(w);
    for (unsigned k = 0; k < n; ++k) {
        int32_t acc = saw(p0, inc);
        p0 += inc;
        if (gu) acc += (gu * ((saw(p1, i1) + saw(p2, i2)) >> 1)) >> 14, p1 += i1, p2 += i2;
        if (gw) acc += (gw * ((saw(p3, i3) + saw(p4, i4)) >> 1)) >> 14, p3 += i3, p4 += i4;
        acc += subs_tick(q, &s);
        out[k] = finish(&o, acc, g);
    }
    w->ph[0] = p0, w->ph[1] = p1, w->ph[2] = p2, w->ph[3] = p3, w->ph[4] = p4, w->sub = q[0], w->sub2 = q[1];
    out_store(w, &o);
}

/* PULSE's width as a turn: PW 64 is a square, 0 and 127 a 3 % pulse; PWM sweeps a triangle of
 * that depth around it at PWS's speed (0 holds it, 127 about 5 Hz). */
static uint32_t width(Wave *w, const WaveControls *c, unsigned n)
{
    int32_t t = (int32_t)w->sweep >> 15, tri = (t < 0 ? -t : t) - 32768; /* -32768..32767 */
    int32_t q = 16384 + (((int32_t)c->pw - 64) * 15401) / 64 + ((tri * c->pwm) >> 7) * 15401 / 32768;
    if (q < 983) q = 983; else if (q > 31785) q = 31785;
    w->sweep += c->pws * 3896u * n;
    return (uint32_t)q << 17;
}

static void render_pulse(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    uint32_t d = detune_q16(c->det) >> 1, di = scale(inc, d), wd = width(w, c, n);
    uint32_t i1 = inc + di, i2 = inc - di;
    int32_t gu = c->uni * 181;
    if (!audible(i1) || !audible(i2)) gu = 0;
    Subs s = subs_of(c, inc);
    int32_t g = gain_of(c->drive);
    uint32_t p0 = w->ph[0], p1 = w->ph[1], p2 = w->ph[2], q[2] = { w->sub, w->sub2 };
    Out o = out_load(w);
    for (unsigned k = 0; k < n; ++k) {
        int32_t acc = (saw(p0, inc) - saw(p0 + wd, inc)) >> 1;
        p0 += inc;
        if (gu) acc += (gu * ((saw(p1, i1) - saw(p1 + wd, i1) + saw(p2, i2) - saw(p2 + wd, i2)) >> 2)) >> 14,
            p1 += i1, p2 += i2;
        acc += subs_tick(q, &s);
        out[k] = finish(&o, acc, g);
    }
    w->ph[0] = p0, w->ph[1] = p1, w->ph[2] = p2, w->sub = q[0], w->sub2 = q[1];
    out_store(w, &o);
}

/* ENS: up to four notes of one shape (a saw at 0, a square at 64, a 5 % pulse at 127: the second
 * saw fades in, then moves), then a dry voice and two taps of a delay swept in quadrature by a
 * 0.2 Hz sine, 11 ms +/- 7.7 ms (about 17 cents of drift at the sweep's fastest).
 * CHOIR: the same with one of TABLE's cycles (tab) for the shape, read as TABLE reads it. */
static inline __attribute__((always_inline)) void ensemble(Wave *w, const WaveControls *c, uint32_t inc,
                                                           int16_t *out, unsigned n, const int16_t *tab)
{
    uint32_t i[4] = { inc }, off; unsigned voices = 1;
    for (unsigned k = 0; k < 3u; ++k) {
        int s = (int)c->note[k] - 64;
        if (!s) continue;
        if (s < -24) s = -24; else if (s > 24) s = 24;
        uint32_t x = scale(inc, wave_ratio[s + 24]);
        if (audible(x)) i[voices++] = x;
    }
    int32_t kb = tab ? 0 : c->pw < 64u ? c->pw * 512 : 32767;
    off = c->pw < 64u ? 0x80000000u : 0x80000000u - (uint32_t)(c->pw - 64u) * 30678337u;
    int32_t gv = voices > 1u ? 22938 : 32767; /* 0.7 a note in a chord */
    int32_t gn = (int32_t)(((uint32_t)gv << 15) / (32768u + (uint32_t)kb)); /* a note's peak is 1 + kb */
    Subs s = subs_of(c, inc);
    int32_t g = gain_of(c->drive);
    /* The taps, held for the block: Q8 samples. */
    int32_t sa = sine(w->lfo), sb = sine(w->lfo + 0x40000000u);
    uint32_t t1 = (uint32_t)(485 * 256 + ((340 * 256 / 2) * sa >> 14));
    uint32_t t2 = (uint32_t)(485 * 256 + ((340 * 256 / 2) * sb >> 14));
    w->lfo += 19478u * n;              /* 0.2 Hz */
    int32_t gd = 32767 - c->chor * 103, gt = c->chor * 90; /* at 127: 0.6 dry, 0.35 a tap */
    uint32_t f1 = t1 & 255u, f2 = t2 & 255u, m = WAVE_DELAY - 1u, d1 = t1 >> 8, d2 = t2 >> 8;
    uint32_t p[4] = { w->ph[0], w->ph[1], w->ph[2], w->ph[3] }, q[2] = { w->sub, w->sub2 }, at = w->write;
    int16_t *line = w->line;
    Out o = out_load(w);
    for (unsigned k = 0; k < n; ++k) {
        int32_t acc = 0;
        for (unsigned v = 0; v < voices; ++v) {
            int32_t a;
            if (tab) a = tab[p[v] >> 23] * 16;
            else {
                a = saw(p[v], i[v]);
                if (kb) a -= (kb * saw(p[v] + off, i[v])) >> 15;
            }
            acc += (gn * (a >> 1)) >> 14;
            p[v] += i[v];
        }
        acc += subs_tick(q, &s);
        int32_t dry = finish(&o, acc, g);
        line[at & m] = (int16_t)dry;
        uint32_t r1 = at - d1, r2 = at - d2;
        int32_t a1 = line[r1 & m], b1 = line[(r1 - 1u) & m];
        int32_t a2 = line[r2 & m], b2 = line[(r2 - 1u) & m];
        int32_t wet = a1 + (((b1 - a1) * (int32_t)f1) >> 8) + a2 + (((b2 - a2) * (int32_t)f2) >> 8);
        int32_t y = ((gd * dry) >> 15) + ((gt * wet) >> 15); /* each product below 2^31, not their sum */
        out[k] = (int16_t)(y > 32767 ? 32767 : y < -32768 ? -32768 : y);
        ++at;
    }
    for (unsigned v = 0; v < 4u; ++v) w->ph[v] = p[v];
    w->sub = q[0], w->sub2 = q[1], w->write = at;
    out_store(w, &o);
}
static void render_ens(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    ensemble(w, c, inc, out, n, 0);
}
static void render_choir(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    ensemble(w, c, inc, out, n, wave_tables[c->table >> 2]);
}

/* TABLE: one of 32 single cycles of 512 points and 12 bits (tables.h), read without interpolation or
 * band-limiting, so that high notes fold back as the original's do: that grain is the model's character.
 * MORF crossfades toward the next table (MSWP sweeps it with a triangle instead). SYNC replaces the
 * cycle by one running at 1 to 8 times the note and restarted at each of the note's periods (hard sync). */
static void render_table(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    unsigned t = c->table >> 2;
    const int16_t *ta = wave_tables[t], *tb = wave_tables[(t + 1u) & (WAVE_TABLES - 1u)];
    int32_t m;
    if (c->msweep) {
        int32_t x = (int32_t)w->sweep >> 15;
        m = x < 0 ? -x : x;                                   /* 0..65536: a triangle */
        m = m > 32767 ? 32767 : m;
        w->sweep += c->msweep * 3896u * n;
    } else m = c->morph * 258;
    uint32_t si = c->sync ? scale(inc, 65536u + (uint32_t)c->sync * c->sync * 28u) : inc; /* 1x to 7.9x */
    if (!audible(si)) si = inc;
    Subs s = subs_of(c, inc);
    int32_t g = gain_of(c->drive);
    uint32_t pm = w->ph[0], ps = w->ph[1], q[2] = { w->sub, w->sub2 };
    Out o = out_load(w);
    for (unsigned k = 0; k < n; ++k) {
        unsigned i = (c->sync ? ps : pm) >> 23;
        int32_t a = ta[i], v = a + (((tb[i] - a) * m) >> 15);   /* 12 bits */
        int32_t acc = v * 16 + subs_tick(q, &s);
        uint32_t next = pm + inc;
        ps = next < pm ? 0u : ps + si;                          /* the note's period restarts the synced cycle */
        pm = next;
        out[k] = finish(&o, acc, g);
    }
    w->ph[0] = pm, w->ph[1] = ps, w->sub = q[0], w->sub2 = q[1];
    out_store(w, &o);
}

/* MORPH's crossfade step a sample, Q24: 5 ms at 1 to 2 s at 127, exponential (2^(8.64 v / 127), the fraction's
 * power by a straight line, within 6 %). */
static uint32_t fade_step(unsigned v)
{
    unsigned e = (v * 4460u) >> 8;                              /* Q8 */
    return 19478160u / ((256u + (e & 255u)) << (e >> 8));      /* 2^24 / (220.5 2^e) */
}

/* MORPH's resolution: BIT 0 keeps a cycle's 12 bits, 127 leaves 1 bit; the levels kept span the full range. */
typedef struct { unsigned shift; int32_t k; } Crush;
static Crush crush_of(unsigned v)
{
    unsigned bits = 12u - (v * 11u + 63u) / 127u;
    Crush r = { 12u - bits, (int32_t)((4095u << 12) / ((1u << bits) - 1u)) };
    return r;
}
static inline int32_t crush(int32_t s, const Crush *r)
{
    return r->shift ? ((((s + 2048) >> r->shift) * r->k) >> 12) - 2048 : s;
}

/* MORPH: two of TABLE's cycles mixed by MIX, the second WID semitones above the note (in phase with the first
 * while WID is 0), each at its own resolution. Changing either cycle crossfades from the pair that played over
 * TIME (a change during a crossfade starts from the pair last chosen). No subs: its two pages are full. */
static void render_morph(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    unsigned t1 = c->table >> 2, t2 = c->wav2 >> 2;
    if (!w->armed) w->ta = (uint8_t)t1, w->tb = (uint8_t)t2, w->armed = 1, w->fade = 0;
    if (t1 != w->ta || t2 != w->tb) {
        if (c->fade) w->fa = w->ta, w->fb = w->tb, w->fade = 1u << 24;
        w->ta = (uint8_t)t1, w->tb = (uint8_t)t2;
    }
    const int16_t *a = wave_tables[t1], *b = wave_tables[t2], *oa = wave_tables[w->fa], *ob = wave_tables[w->fb];
    uint32_t f = w->fade, step = f ? fade_step(c->fade) : 0, i2 = inc;
    int32_t m = c->mix + (c->mix >> 6);                         /* 0..128 */
    if (c->wid) {
        unsigned s8 = (c->wid * c->wid * 390u) >> 10, s = s8 >> 8; /* 24 (v / 127)^2 semitones, Q8 */
        uint32_t r = s >= 24u ? wave_ratio[48]
                              : wave_ratio[24 + s] + (((wave_ratio[25 + s] - wave_ratio[24 + s]) * (s8 & 255u)) >> 8);
        i2 = scale(inc, r);
        if (!audible(i2)) m = 0;                                /* the second cycle past Nyquist: the first alone */
    }
    Crush k1 = crush_of(c->bit1), k2 = crush_of(c->bit2);
    int32_t g = gain_of(c->drive);
    uint32_t p1 = w->ph[0], p2 = c->wid ? w->ph[1] : p1;
    Out o = out_load(w);
    for (unsigned k = 0; k < n; ++k) {
        unsigned x1 = p1 >> 23, x2 = p2 >> 23;
        int32_t u = crush(a[x1], &k1), v = crush(b[x2], &k2), y = u + (((v - u) * m) >> 7);
        if (f) {
            int32_t ou = crush(oa[x1], &k1), ov = crush(ob[x2], &k2), oy = ou + (((ov - ou) * m) >> 7);
            y += ((oy - y) * (int32_t)(f >> 9)) >> 15;
            f = f > step ? f - step : 0;
        }
        p1 += inc, p2 += i2;
        out[k] = finish(&o, y * 16, g);
    }
    w->ph[0] = p1, w->ph[1] = p2, w->fade = f;
    out_store(w, &o);
}

const char *wave_table_name(unsigned t) { return wave_table_names[t & (WAVE_TABLES - 1u)]; }

void wave_render(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    if (!audible(inc)) { for (unsigned k = 0; k < n; ++k) out[k] = 0; return; }
    switch (c->model) {
    case WAVE_PULSE: render_pulse(w, c, inc, out, n); break;
    case WAVE_ENS: render_ens(w, c, inc, out, n); break;
    case WAVE_TABLE: render_table(w, c, inc, out, n); break;
    case WAVE_MORPH: render_morph(w, c, inc, out, n); break;
    case WAVE_CHOIR: render_choir(w, c, inc, out, n); break;
    default: render_saw(w, c, inc, out, n); break;
    }
}
