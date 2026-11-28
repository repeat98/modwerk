/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Mono Synth's voice (ms_dsp.h). Everything is 32-bit fixed point: the core has no FPU and
 * the module links no libgcc, so no 64-bit products, no float and no pow at run time.
 *
 * Per block: TUN, the range and MOD are smoothed (a one-pole of 1/8 a block, about 5 ms),
 * the LFO steps, and the oscillator's step for the block's end is worked out from 2^x
 * (a quartic, within 0.01 cents). Per sample the step ramps there linearly, so neither a
 * lock nor a fast LFO steps the pitch, and the four levels ramp to their new values.
 *
 * The oscillator is one phase. The saw falls at its wrap, the pulse rises at the wrap and
 * falls at PW (fixed, a little under half), and the sub flips at wraps: every one for -1
 * octave, every other for -2, as a flip-flop divider would. Every edge is smoothed with a
 * two-sample polyBLEP, the sub's with the same correction as the wrap it follows. */
#include "ms_dsp.h"
#include "modwerk/dsp.h"

#define Q31(x) ((int32_t)((x) * 2147483648.0))
#define HALF (1 << 30)

/* the step of note 60 (261.626 Hz) at 8', a whole uint32 a period */
#define INC_C4 23409859
#define INC_MAX 0x40000000u          /* 12 kHz: the BLEP's two regions never meet */
#define PW 0x7a000000u               /* the pulse's width: 47.7 % */
#define LFO_INC_MIN 286331           /* 0.1 Hz a block: 0.1 x 32 / 48000 x 2^32 */
#define LFO_SPAN 1087047             /* log2(300) / 127, Q24: 127 is 30 Hz */
#define SMOOTH 3                     /* one-pole of 1/8 a block */

int32_t ms_exp2_q30(int32_t oct, int *shift)
{
    int32_t f = (int32_t)(((uint32_t)oct & 0xffffffu) << 7);    /* the fraction, Q31 */
    /* a quartic fitted to 2^x on [0, 1), exact at both ends: half its coefficients, as
     * their sum is 1, past Q31 */
    int32_t p = Q31(0.34651605910829597) + qmul(f, Q31(0.12068988499443187) + qmul(f, Q31(0.026016183422094347)
                + qmul(f, Q31(0.006777872475177804))));
    *shift = oct >> 24;
    return HALF + qmul(f, p);
}

static uint32_t shift_inc(uint32_t x, int e)
{
    if (e >= 0) {
        if (e > 30 || x > (INC_MAX >> e))
            return INC_MAX;
        return x << e;
    }
    return e < -31 ? 0 : x >> -e;
}

uint32_t ms_osc_inc(int32_t ratio, int32_t oct)
{
    int e;
    int32_t m = ms_exp2_q30(oct, &e);
    int32_t x = sshl(qmul(INC_C4, ratio), 3);   /* the note: ratio is Q28 */
    x = sshl(qmul(x, m), 1);                    /* 2^fraction: m is Q30 */
    uint32_t inc = shift_inc((uint32_t)x, e);
    return inc ? inc : 1;
}

uint32_t ms_lfo_inc(int knob)
{
    int e;
    int32_t m = ms_exp2_q30(knob * LFO_SPAN, &e);
    return (uint32_t)sshl(qmul(LFO_INC_MIN, m), 1) << e;
}

int32_t ms_tri(uint32_t ph)
{
    uint32_t v = ph & 0x80000000u ? ~ph : ph;    /* 0 .. 2^31 - 1, up then down */
    return (int32_t)((v << 1) ^ 0x80000000u);   /* -1 at 0, +1 at the half period */
}

int32_t ms_depth(int knob)
{
    return knob * knob * 3121;                  /* 3 octaves x (knob / 127)^2, Q24 */
}

int32_t ms_tune(int knob, int range)
{
    /* TUN: 3/8 semitone a step, +-24 semitones (+-2 octaves at 0 and 127); the range:
     * 16' is -1 octave against the note, 2' +2. */
    return (int32_t)((uint32_t)(knob - 64) << 19) + (int32_t)((uint32_t)(range - 1) << 24);
}

static int32_t level(int knob)
{
    return knob >= 127 ? MW_QMAX : knob * 16909320;     /* 0..127 to 0..1, Q31 */
}

/* the sub's level and octave: 0 off, 1..63 -1 octave from 0 to full, 64..127 -2 octaves */
static int32_t sub_level(int knob, int *two)
{
    *two = knob >= 64;
    if (knob <= 0)
        return 0;
    if (knob < 64)
        return knob >= 63 ? MW_QMAX : (knob - 1) * 34636833;     /* / 62 */
    return knob >= 127 ? MW_QMAX : (knob - 64) * 34087042;       /* / 63 */
}

/* The smoothed pitch and the levels the knobs ask for. */
static void targets(const struct ms_knobs *k, int32_t *pitch, int32_t *depth, int32_t *lvl, int *two)
{
    *pitch = ms_tune(k->tun, k->range);
    *depth = ms_depth(k->mod);
    lvl[0] = level(k->saw) >> 1;                /* each source at half scale: two at full */
    lvl[1] = level(k->pls) >> 1;                /* make full scale, all four drive it */
    lvl[2] = sub_level(k->sub, two) >> 1;
    lvl[3] = level(k->nse) >> 1;
}

void ms_init(struct ms_voice *s, const struct ms_knobs *k)
{
    int two;
    s->phase = 0;
    s->lfo = 0x40000000u;                       /* the triangle at its centre, rising */
    s->noise = 0x2545f491u;
    s->count = 0;
    targets(k, &s->pitch, &s->depth, s->lvl, &two);
    s->inc = ms_osc_inc(k->ratio, s->pitch);
    s->ready = 1;
}

/* (1 - x)^2 for x = t / dt, from the phase distance t (< dt) and r = 2^32 / dt: Q31,
 * halved, so it is one half-scale step's correction. */
static inline int32_t blep(uint32_t t, uint32_t r)
{
    int32_t u = (int32_t)(~(t * r) >> 1);
    return qmul(u, u) >> 1;
}

/* the sub's square at a count: -1 octave flips each period, -2 every other */
#define SUBSQ(c, two) ((((c) >> (two)) & 1) ? HALF - 1 : -HALF)

void ms_render(struct ms_voice *s, const struct ms_knobs *k, int32_t *out)
{
    int two;
    int32_t tp, td, tl[4];
    targets(k, &tp, &td, tl, &two);
    s->pitch += (tp - s->pitch) >> SMOOTH;
    s->depth += (td - s->depth) >> SMOOTH;

    s->lfo += ms_lfo_inc(k->lfo);
    int32_t oct = s->pitch + qmul(ms_tri(s->lfo), s->depth);
    uint32_t end = ms_osc_inc(k->ratio, oct);
    uint32_t inc = s->inc;
    int32_t dinc = (int32_t)(end - inc) / MS_FRAMES;
    uint32_t r = 0xffffffffu / (end > inc ? end : inc);
    s->inc = end;

    int32_t lv[4], dl[4];
    for (int i = 0; i < 4; i++) {
        int32_t t = s->lvl[i] + ((tl[i] - s->lvl[i]) >> SMOOTH);
        dl[i] = (t - s->lvl[i]) / MS_FRAMES;
        lv[i] = s->lvl[i];
        s->lvl[i] = t;
    }

    uint32_t ph = s->phase, cnt = s->count, n = s->noise;
    for (int i = 0; i < MS_FRAMES; i++) {
        inc += (uint32_t)dinc;
        uint32_t old = ph;
        ph += inc;
        if (ph < old)
            cnt++;
        int32_t saw = (int32_t)(ph ^ 0x80000000u) >> 1;     /* rises -1/2 .. 1/2 */
        int32_t pls = ph < PW ? HALF - 1 : -HALF;
        int32_t sub = SUBSQ(cnt, two);

        /* the wrap: the saw falls a whole step, the pulse rises one, the sub moves
         * by the step it makes there (0 when it holds) */
        uint32_t back = 0u - ph;
        if (ph < inc) {                         /* just after it */
            int32_t b = -blep(ph, r);
            int32_t d = SUBSQ(cnt, two) - SUBSQ(cnt - 1, two);
            saw -= b;
            pls += b;
            if (d)
                sub += d > 0 ? b : -b;
        } else if (back < inc) {                /* just before it */
            int32_t b = blep(back, r);
            int32_t d = SUBSQ(cnt + 1, two) - SUBSQ(cnt, two);
            saw -= b;
            pls += b;
            if (d)
                sub += d > 0 ? b : -b;
        }
        /* the pulse's fall at PW */
        uint32_t q = ph - PW;
        if (q < inc)
            pls += blep(q, r);
        else if ((0u - q) < inc)
            pls -= blep(0u - q, r);

        n = n * 1664525u + 1013904223u;
        int32_t nse = (int32_t)n >> 1;

        lv[0] += dl[0];
        lv[1] += dl[1];
        lv[2] += dl[2];
        lv[3] += dl[3];
        out[i] = sshl(sadd(qsum2(saw, lv[0], pls, lv[1]), qsum2(sub, lv[2], nse, lv[3])), 1);
    }
    s->phase = ph;
    s->count = cnt;
    s->noise = n;
}
