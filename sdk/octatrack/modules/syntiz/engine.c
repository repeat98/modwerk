/* SPDX-License-Identifier: MIT
 * SYNTIZ's oscillators (engine.h). Band-limited saws by polyBLEP; a pulse is the difference of two
 * saws a width apart, a square sub the same at half width; the sines are a corrected parabola, so
 * no table is needed. Controls become increments and gains when they change (wave_prepare); a block runs one
 * short loop per oscillator, then one for the output stage, so each keeps its state in registers. The per-sample
 * loops only add, shift and multiply values below 2^16. */
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
 * residual over the sample on each side of the fall. inc >> 15 is at least 1 and inc below 2^31 (only an
 * audible increment reaches it), so p + inc < 2 inc says in one compare that p < inc or p > ~inc. The
 * divide runs on two samples a period only. */
static inline int32_t saw(uint32_t p, uint32_t inc)
{
    int32_t s = (int32_t)(p ^ 0x80000000u) >> 16;
    if (p + inc < 2u * inc) {
        if (p < inc) {
            uint32_t u = p / (inc >> 15);
            int32_t t = u > 32767u ? 32767 : (int32_t)u; /* inc >> 15 rounds down: very low notes overshoot */
            s -= 2 * t - ((t * t) >> 15) - 32768;
        } else {
            uint32_t u = ~p / (inc >> 15);
            int32_t t = u > 32767u ? 32767 : (int32_t)u;
            s -= ((t * t) >> 15) - 2 * t + 32768;
        }
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
/* The output stage over a block, in place: lr[2 k] holds the sum, then lr[2 k] and lr[2 k + 1] the sample. The mean
 * over a sample is a gentle low-pass (-2.4 dB at 10 kHz, -5.8 dB at 15 kHz on a clean signal). A first-order emphasis
 * before the curve, x + 0.3 (x - x[-1]), gives that treble back (within 0.2 dB to 10 kHz) and the curve still bounds
 * the peaks (the author's choice B2, 27 Oct 2026). */
static __attribute__((noinline)) void finish(Wave *w, uint32_t *lr, unsigned n)
{
    int32_t g4 = w->g4, sx = w->sx, sf = w->sf, ex = w->ex, dcx = w->dcx, dcy = w->dcy;
    for (unsigned k = 0; k < n; ++k) {
        int32_t x = (((int32_t)lr[2 * k] >> 2) * g4) >> 9;
        if (x > 131071) x = 131071; else if (x < -131071) x = -131071;
        int32_t x13 = x >> 2;
        int32_t e = x13 + (((x13 - ex) * 9830) >> 15);
        ex = x13, x13 = e > 40000 ? 40000 : e < -40000 ? -40000 : e;
        int32_t f = antiderivative(x13), d = x13 - sx, y;
        if (d > 16 || d < -16) y = ((f - sf) * 8 / d) * 2;  /* Q27 / Q13 = Q14 */
        else y = cubic(((x13 + sx) / 2) * 4);               /* too close to divide: the curve at the midpoint */
        sx = x13, sf = f;
        dcy += (y - dcx) * 256 - (dcy >> 10), dcx = y;
        y = dcy >> 8;
        lr[2 * k] = lr[2 * k + 1] = (uint32_t)(uint16_t)(y > 32767 ? 32767 : y < -32768 ? -32768 : y) << 16;
    }
    w->sx = sx, w->sf = sf, w->ex = ex, w->dcx = dcx, w->dcy = dcy;
}

/* The subs, shared by every model but MORPH: a square an octave down (two saws half a turn apart) and a sine
 * two octaves down. A sub below 25 Hz is not heard and only spends headroom (the author, 27 Oct 2026): silent
 * there, fading in up to 30 Hz so a glide or an LFO crossing it does not click. */
#define SUB_LO 2434789u                 /* 25 Hz */
#define SUB_HI 2921746u                 /* 30 Hz */
static int32_t heard(int32_t g, uint32_t i)
{
    if (i >= SUB_HI) return audible(i) ? g : 0;
    if (i <= SUB_LO) return 0;
    return (int32_t)((uint32_t)g * ((i - SUB_LO) >> 5) / ((SUB_HI - SUB_LO) >> 5));
}
static void subs_of(Wave *w, const WaveControls *c, uint32_t inc)
{
    w->si1 = inc >> 1, w->si2 = inc >> 2;
    w->sg1 = heard(c->sub * 258, w->si1), w->sg2 = heard(c->sub2 * 258, w->si2);
}
/* The oscillators' passes sum into acc[2 k], the L long of each sample (wave_play). The subs add theirs; a silent
 * one only moves its phase on. */
static __attribute__((noinline)) void subs_add(Wave *w, int32_t *acc, unsigned n)
{
    uint32_t q = w->sub, i = w->si1;
    int32_t g = w->sg1;
    if (g) for (unsigned k = 0; k < n; ++k, q += i) acc[2 * k] += (g * ((saw(q, i) - saw(q + 0x80000000u, i)) >> 1)) >> 15;
    else q += i * n;
    w->sub = q;
    q = w->sub2, i = w->si2, g = w->sg2;
    if (g) for (unsigned k = 0; k < n; ++k, q += i) acc[2 * k] += (g * sine(q)) >> 15;
    else q += i * n;
    w->sub2 = q;
}
static inline void subs(Wave *w, int32_t *acc, unsigned n)
{
    if (w->sg1 | w->sg2) subs_add(w, acc, n);
    else w->sub += w->si1 * n, w->sub2 += w->si2 * n;
}

/* The unison pairs' detune: a frequency ratio 1 +/- d, d = 0.0595 (a semitone) at 127, quadratic. */
static inline uint32_t detune_q16(unsigned det) { return (det * det * 3962u) >> 14; }

static void prepare_saw(Wave *w, const WaveControls *c, uint32_t inc)
{
    uint32_t d = detune_q16(c->det), di = scale(inc, d), dw = scale(inc, 2u * d);
    w->i[0] = inc + di, w->i[1] = inc - di, w->i[2] = inc + dw, w->i[3] = inc - dw;
    w->ga = c->uni * 181, w->gb = c->wide * 181; /* 0.7 each at 127 */
    if (!audible(w->i[0]) || !audible(w->i[1])) w->ga = 0;
    if (!audible(w->i[2]) || !audible(w->i[3])) w->gb = 0;
}
/* A saw a block: acc[2 k] set from phase *ph. */
static __attribute__((noinline)) void saw_set(int32_t *acc, uint32_t *ph, uint32_t inc, unsigned n)
{
    uint32_t p = *ph;
    for (unsigned k = 0; k < n; ++k, p += inc) acc[2 * k] = saw(p, inc);
    *ph = p;
}
/* A detuned pair, ph[0] at ia and ph[1] at ib, added at gain g. */
static __attribute__((noinline)) void saw_pair(int32_t *acc, uint32_t *ph, uint32_t ia, uint32_t ib, int32_t g, unsigned n)
{
    uint32_t pa = ph[0], pb = ph[1];
    for (unsigned k = 0; k < n; ++k, pa += ia, pb += ib) acc[2 * k] += (g * ((saw(pa, ia) + saw(pb, ib)) >> 1)) >> 14;
    ph[0] = pa, ph[1] = pb;
}
static void play_saw(Wave *w, int32_t *acc, unsigned n)
{
    saw_set(acc, &w->ph[0], w->inc, n);
    if (w->ga) saw_pair(acc, &w->ph[1], w->i[0], w->i[1], w->ga, n);
    if (w->gb) saw_pair(acc, &w->ph[3], w->i[2], w->i[3], w->gb, n);
    subs(w, acc, n);
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

static void prepare_pulse(Wave *w, const WaveControls *c, uint32_t inc)
{
    uint32_t d = detune_q16(c->det) >> 1, di = scale(inc, d);
    w->i[0] = inc + di, w->i[1] = inc - di;
    w->ga = c->uni * 181;
    if (!audible(w->i[0]) || !audible(w->i[1])) w->ga = 0;
}
static void play_pulse(Wave *w, const WaveControls *c, int32_t *acc, unsigned n)
{
    uint32_t wd = width(w, c, n), inc = w->inc, p = w->ph[0];
    for (unsigned k = 0; k < n; ++k, p += inc) acc[2 * k] = (saw(p, inc) - saw(p + wd, inc)) >> 1;
    w->ph[0] = p;
    if (w->ga) {
        uint32_t pa = w->ph[1], pb = w->ph[2], ia = w->i[0], ib = w->i[1];
        int32_t g = w->ga;
        for (unsigned k = 0; k < n; ++k, pa += ia, pb += ib)
            acc[2 * k] += (g * ((saw(pa, ia) - saw(pa + wd, ia) + saw(pb, ib) - saw(pb + wd, ib)) >> 2)) >> 14;
        w->ph[1] = pa, w->ph[2] = pb;
    }
    subs(w, acc, n);
}

/* ENS: up to four notes of one shape (a saw at 0, a square at 64, a 5 % pulse at 127: the second
 * saw fades in, then moves), then a dry voice and two taps of a delay swept in quadrature by a
 * 0.2 Hz sine, 11 ms +/- 7.7 ms (about 17 cents of drift at the sweep's fastest).
 * CHOIR: the same with one of TABLE's cycles for the shape, read as TABLE reads it. */
static void prepare_ens(Wave *w, const WaveControls *c, uint32_t inc, unsigned table)
{
    unsigned voices = 1;
    w->i[0] = inc;
    for (unsigned k = 0; k < 3u; ++k) {
        int s = (int)c->note[k] - 64;
        if (!s) continue;
        if (s < -24) s = -24; else if (s > 24) s = 24;
        uint32_t x = scale(inc, wave_ratio[s + 24]);
        if (audible(x)) w->i[voices++] = x;
    }
    int32_t kb = table ? 0 : c->pw < 64u ? c->pw * 512 : 32767;
    w->off = c->pw < 64u ? 0x80000000u : 0x80000000u - (uint32_t)(c->pw - 64u) * 30678337u;
    int32_t gv = voices > 1u ? 22938 : 32767; /* 0.7 a note in a chord */
    w->ga = (int32_t)(((uint32_t)gv << 15) / (32768u + (uint32_t)kb)); /* a note's peak is 1 + kb */
    w->gb = kb, w->voices = (uint8_t)voices;
    w->gd = 32767 - c->chor * 103, w->gt = c->chor * 90; /* at 127: 0.6 dry, 0.35 a tap */
}
/* One note of ENS added to acc[2 k]: a saw, less kb of a second one off a turn behind. */
static __attribute__((noinline)) void ens_note(int32_t *acc, uint32_t *ph, uint32_t i, int32_t gn, int32_t kb, uint32_t off,
                                               unsigned n)
{
    uint32_t p = *ph;
    for (unsigned k = 0; k < n; ++k, p += i) {
        int32_t a = saw(p, i);
        if (kb) a -= (kb * saw(p + off, i)) >> 15;
        acc[2 * k] += (gn * (a >> 1)) >> 14;
    }
    *ph = p;
}
/* One note of CHOIR: its cycle, read as TABLE reads it. */
static __attribute__((noinline)) void choir_note(int32_t *acc, uint32_t *ph, uint32_t i, int32_t gn, const int16_t *tab,
                                                 unsigned n)
{
    uint32_t p = *ph;
    for (unsigned k = 0; k < n; ++k, p += i) acc[2 * k] += (gn * ((tab[p >> 23] * 16) >> 1)) >> 14;
    *ph = p;
}
static void play_ens(Wave *w, const WaveControls *c, int32_t *acc, unsigned n)
{
    const int16_t *tab = c->model == WAVE_CHOIR ? wave_tables[c->table >> 2] : 0;
    for (unsigned k = 0; k < n; ++k) acc[2 * k] = 0;
    for (unsigned v = 0; v < w->voices; ++v)
        if (tab) choir_note(acc, &w->ph[v], w->i[v], w->ga, tab, n);
        else ens_note(acc, &w->ph[v], w->i[v], w->ga, w->gb, w->off, n);
    subs(w, acc, n);
}
/* The dry voice lr[0..2n) through the chorus, in place. The taps are at least 145 samples back, so they read no sample
 * of this block. */
static __attribute__((noinline)) void chorus(Wave *w, uint32_t *lr, unsigned n)
{
    /* The taps, held for the block: Q8 samples. */
    int32_t sa = sine(w->lfo), sb = sine(w->lfo + 0x40000000u);
    uint32_t t1 = (uint32_t)(485 * 256 + ((340 * 256 / 2) * sa >> 14));
    uint32_t t2 = (uint32_t)(485 * 256 + ((340 * 256 / 2) * sb >> 14));
    w->lfo += 19478u * n;              /* 0.2 Hz */
    int32_t gd = w->gd, gt = w->gt;
    uint32_t f1 = t1 & 255u, f2 = t2 & 255u, m = WAVE_DELAY - 1u, d1 = t1 >> 8, d2 = t2 >> 8, at = w->write;
    int16_t *line = w->line;
    for (unsigned k = 0; k < n; ++k, ++at) {
        int32_t dry = (int32_t)lr[2 * k] >> 16;
        line[at & m] = (int16_t)dry;
        uint32_t r1 = at - d1, r2 = at - d2;
        int32_t a1 = line[r1 & m], b1 = line[(r1 - 1u) & m];
        int32_t a2 = line[r2 & m], b2 = line[(r2 - 1u) & m];
        int32_t wet = a1 + (((b1 - a1) * (int32_t)f1) >> 8) + a2 + (((b2 - a2) * (int32_t)f2) >> 8);
        int32_t y = ((gd * dry) >> 15) + ((gt * wet) >> 15); /* each product below 2^31, not their sum */
        lr[2 * k] = lr[2 * k + 1] = (uint32_t)(uint16_t)(y > 32767 ? 32767 : y < -32768 ? -32768 : y) << 16;
    }
    w->write = at;
}

/* TABLE: one of 32 single cycles of 512 points and 12 bits (tables.h), read without interpolation or
 * band-limiting, so that high notes fold back as the original's do: that grain is the model's character.
 * MORF crossfades toward the next table (MSWP sweeps it with a triangle instead). SYNC replaces the
 * cycle by one running at 1 to 8 times the note and restarted at each of the note's periods (hard sync). */
static void prepare_table(Wave *w, const WaveControls *c, uint32_t inc)
{
    w->ga = c->morph * 258;
    uint32_t si = c->sync ? scale(inc, 65536u + (uint32_t)c->sync * c->sync * 28u) : inc; /* 1x to 7.9x */
    w->i[0] = audible(si) ? si : inc;
}
static void play_table(Wave *w, const WaveControls *c, int32_t *acc, unsigned n)
{
    unsigned t = c->table >> 2;
    const int16_t *ta = wave_tables[t], *tb = wave_tables[(t + 1u) & (WAVE_TABLES - 1u)];
    int32_t m = w->ga;
    if (c->msweep) {
        int32_t x = (int32_t)w->sweep >> 15;
        m = x < 0 ? -x : x;                                   /* 0..65536: a triangle */
        m = m > 32767 ? 32767 : m;
        w->sweep += c->msweep * 3896u * n;
    }
    uint32_t pm = w->ph[0], ps = w->ph[1], inc = w->inc, si = w->i[0];
    unsigned sync = c->sync;
    for (unsigned k = 0; k < n; ++k) {
        unsigned i = (sync ? ps : pm) >> 23;
        int32_t v = ta[i];
        if (m) v += ((tb[i] - v) * m) >> 15;                  /* 12 bits */
        acc[2 * k] = v * 16;
        uint32_t next = pm + inc;
        ps = next < pm ? 0u : ps + si;                        /* the note's period restarts the synced cycle */
        pm = next;
    }
    w->ph[0] = pm, w->ph[1] = ps;
    subs(w, acc, n);
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
static void prepare_morph(Wave *w, const WaveControls *c, uint32_t inc)
{
    uint32_t i2 = inc;
    int32_t m = c->mix + (c->mix >> 6);                         /* 0..128 */
    if (c->wid) {
        unsigned s8 = (c->wid * c->wid * 390u) >> 10, s = s8 >> 8; /* 24 (v / 127)^2 semitones, Q8 */
        uint32_t r = s >= 24u ? wave_ratio[48]
                              : wave_ratio[24 + s] + (((wave_ratio[25 + s] - wave_ratio[24 + s]) * (s8 & 255u)) >> 8);
        i2 = scale(inc, r);
        if (!audible(i2)) m = 0;                                /* the second cycle past Nyquist: the first alone */
    }
    Crush k1 = crush_of(c->bit1), k2 = crush_of(c->bit2);
    w->i[0] = i2, w->ga = m, w->off = fade_step(c->fade);
    w->sh1 = (uint8_t)k1.shift, w->gd = k1.k, w->sh2 = (uint8_t)k2.shift, w->gt = k2.k;
}
static void play_morph(Wave *w, const WaveControls *c, int32_t *acc, unsigned n)
{
    unsigned t1 = c->table >> 2, t2 = c->wav2 >> 2;
    if (!w->armed) w->ta = (uint8_t)t1, w->tb = (uint8_t)t2, w->armed = 1, w->fade = 0;
    if (t1 != w->ta || t2 != w->tb) {
        if (c->fade) w->fa = w->ta, w->fb = w->tb, w->fade = 1u << 24;
        w->ta = (uint8_t)t1, w->tb = (uint8_t)t2;
    }
    const int16_t *a = wave_tables[t1], *b = wave_tables[t2], *oa = wave_tables[w->fa], *ob = wave_tables[w->fb];
    uint32_t f = w->fade, step = f ? w->off : 0, inc = w->inc, i2 = w->i[0];
    int32_t m = w->ga;
    Crush k1 = { w->sh1, w->gd }, k2 = { w->sh2, w->gt };
    uint32_t p1 = w->ph[0], p2 = c->wid ? w->ph[1] : p1;
    for (unsigned k = 0; k < n; ++k) {
        unsigned x1 = p1 >> 23, x2 = p2 >> 23;
        int32_t u = crush(a[x1], &k1), v = crush(b[x2], &k2), y = u + (((v - u) * m) >> 7);
        if (f) {
            int32_t ou = crush(oa[x1], &k1), ov = crush(ob[x2], &k2), oy = ou + (((ov - ou) * m) >> 7);
            y += ((oy - y) * (int32_t)(f >> 9)) >> 15;
            f = f > step ? f - step : 0;
        }
        p1 += inc, p2 += i2;
        acc[2 * k] = y * 16;
    }
    w->ph[0] = p1, w->ph[1] = p2, w->fade = f;
}

const char *wave_table_name(unsigned t) { return wave_table_names[t & (WAVE_TABLES - 1u)]; }

void wave_prepare(Wave *w, const WaveControls *c, uint32_t inc)
{
    w->inc = inc;
    if (!audible(inc)) return;
    w->g4 = gain_of(c->drive) >> 4;
    subs_of(w, c, inc);
    switch (c->model) {
    case WAVE_PULSE: prepare_pulse(w, c, inc); break;
    case WAVE_ENS: prepare_ens(w, c, inc, 0); break;
    case WAVE_TABLE: prepare_table(w, c, inc); break;
    case WAVE_MORPH: prepare_morph(w, c, inc); break;
    case WAVE_CHOIR: prepare_ens(w, c, inc, 1); break;
    default: prepare_saw(w, c, inc); break;
    }
}

void wave_play(Wave *w, const WaveControls *c, uint32_t *lr, unsigned n)
{
    if (!audible(w->inc)) { for (unsigned k = 0; k < 2u * n; ++k) lr[k] = 0; return; }
    int32_t *acc = (int32_t *)lr;
    switch (c->model) {
    case WAVE_PULSE: play_pulse(w, c, acc, n); break;
    case WAVE_ENS: case WAVE_CHOIR: play_ens(w, c, acc, n); break;
    case WAVE_TABLE: play_table(w, c, acc, n); break;
    case WAVE_MORPH: play_morph(w, c, acc, n); break;
    default: play_saw(w, acc, n); break;
    }
    finish(w, lr, n);
    if (c->model == WAVE_ENS || c->model == WAVE_CHOIR) chorus(w, lr, n);
}

void wave_render(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n)
{
    uint32_t lr[32];
    wave_prepare(w, c, inc);
    wave_play(w, c, lr, n);
    for (unsigned k = 0; k < n; ++k) out[k] = (int16_t)(lr[2 * k] >> 16);
}
