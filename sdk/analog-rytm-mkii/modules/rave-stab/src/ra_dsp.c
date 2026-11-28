/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SY RAVE's voice (ra_dsp.h). Everything is 32-bit fixed point: the core has no FPU and
 * the module links no libgcc, so no 64-bit products, no float and no pow at run time.
 *
 * At the hit: the chord (CHD) and its voicing (VOI) give six notes, STR the order and gap in
 * which they open, PCH a pitch offset that falls away, and the velocity the gain; they hold for the hit, so a lock plays its own step's chord and
 * the next step's value never changes a ringing one.
 *
 * Per block: TUN with the register, DET and WAV are smoothed (a one-pole of 1/8 a block,
 * about 5 ms), and each oscillator's step comes from 2^x (a quartic). The level holds: the
 * track's AMP page gives the stab its shape. A note waiting for its turn in a strum is
 * silent; it fades in (or, sounding from the last hit, out) over one block, never a click.
 *
 * Per sample: six phases, each a saw and a pulse with two-sample polyBLEPs at the wrap and
 * at the pulse's rise; both fall at the wrap, so their crossfade never cancels. WAV crossfades saw to square (0..64), then narrows the pulse to 12 %
 * (64..127), its mean taken off so the narrow pulse adds no DC. PCH starts the chord off its
 * pitch at the hit, up to two octaves above (over 64) or below (under 64), and falls back to
 * it with a 20 ms time constant, a block at a time. */
#include "ra_dsp.h"
#include "modwerk/dsp.h"

#define Q31(x) ((int32_t)((x) * 2147483648.0))
#define HALF (1 << 30)
#define SMOOTH 3
#define INC_C4 23409859              /* note 60, 261.626 Hz, a whole uint32 a period */
#define INC_MAX 0x40000000u          /* 12 kHz: the BLEP's two regions never meet */
#define CENT_Q24 13981               /* a cent in octaves, Q24 */
#define OCT (1 << 24)
#define PW_STEP 25906152u            /* 50 % to 12 % over WAV 64..127 */
#define SQ_LEVEL Q31(0.58)           /* the square at the saw's loudness (rms 0.5 against 0.289) */
#define PCH_FALL Q31(0.96722)        /* PCH's fall a block: exp(-(32/48000) / 20 ms) */

static const int8_t register_oct[RA_OCTAVES] = { -1, -2, 0, 1 };
static const int16_t det_pattern[RA_NOTES] = { 0, 3303, -3303, 1982, -1982, 991 };   /* 30 cents x (0, 1, -1, .6, -.6, .3) / 127 */

int32_t ra_exp2_q30(int32_t oct, int *shift)
{
    int32_t f = (int32_t)(((uint32_t)oct & 0xffffffu) << 7);
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

uint32_t ra_inc(int32_t ratio, int32_t oct)
{
    int e;
    int32_t m = ra_exp2_q30(oct, &e);
    int32_t x = sshl(qmul(INC_C4, ratio), 3);
    x = sshl(qmul(x, m), 1);
    uint32_t inc = shift_inc((uint32_t)x, e);
    return inc ? inc : 1;
}

int32_t ra_tune(int knob, int octave)
{
    int o = octave < RA_OCTAVES ? register_oct[octave] : -1;
    return (int32_t)((uint32_t)(knob - 64) << 19) + (int32_t)((uint32_t)o << 24);
}

static int abs16(int x)
{
    return x < 0 ? -x : x;
}

void ra_voicing(int chd, int voi, int32_t *n)
{
    const int16_t *c = ra_chord_cents[chd < RA_CHORDS ? chd : RA_CHORDS - 1];
    for (int i = 0; i < RA_NOTES; i++)
        n[i] = c[i] * CENT_Q24;
    if (voi >= RA_VOICINGS)
        voi = RA_VOICINGS - 1;
    /* Each voicing moves notes down or opens them out, never puts a higher note in the
     * bass: the chord keeps its colour, a minor chord stays minor. The notes are listed
     * from the root up. */
    switch (voi) {
    case 1:                                     /* the root an octave down */
        n[0] -= OCT;
        break;
    case 2: {                                   /* the root and the fifth an octave down */
        int f = 1;
        for (int i = 1; i < RA_NOTES; i++)
            if (abs16(c[i] - 700) < abs16(c[f] - 700))
                f = i;
        n[0] -= OCT;
        if (abs16(c[f] - 700) <= 100)
            n[f] -= OCT;
        break;
    }
    case 3:                                     /* drop 2: the second highest an octave down */
        n[4] -= OCT;
        break;
    case 4:                                     /* drop 3: the third highest */
        n[3] -= OCT;
        break;
    case 5:                                     /* drop 2 and 4 */
        n[4] -= OCT;
        n[2] -= OCT;
        break;
    case 6:                                     /* the root down, the third and fifth notes up: open */
        n[0] -= OCT;
        n[2] += OCT;
        n[4] += OCT;
        break;
    case 7:                                     /* the root two octaves down: a sub under the chord */
        n[0] -= 2 * OCT;
        break;
    case 8:                                     /* wide: 0, 1, 2 octaves up in turn */
        for (int i = 0; i < RA_NOTES; i++)
            n[i] += (i % 3) * OCT;
        break;
    default:
        break;
    }
    /* the root stays the lowest: a note dropped under it takes it down an octave too */
    for (int i = 1; i < RA_NOTES; i++)
        while (n[i] < n[0] && (n[0] - n[i]) % OCT)
            n[0] -= OCT;
}

int32_t ra_detune(int knob, int i)
{
    return knob * det_pattern[i];
}

int ra_str_step(int knob)
{
    return knob * knob * 150 / 16129;              /* squared: fine near 0, 100 ms a note (150 blocks) at 127 */
}

/* The lowest note opens first, the rest in turn upwards. */
void ra_strum(int knob, const int32_t *note, uint16_t *wait)
{
    int step = ra_str_step(knob);
    for (int i = 0; i < RA_NOTES; i++) {
        int rank = 0;
        for (int j = 0; j < RA_NOTES; j++)
            if (note[j] < note[i] || (note[j] == note[i] && j < i))
                rank++;
        wait[i] = (uint16_t)(rank * step);
    }
}

int32_t ra_pch(int knob)
{
    int d = knob - 64;                  /* -64..63: squared, so the centre is fine and the ends reach 2 octaves */
    int32_t m = d * d * 8192;           /* d^2 / 4096 x 2 octaves, Q24 */
    return d < 0 ? -m : m;
}

static int32_t gain(int velocity)
{
    int32_t g = (velocity + 27) * 13944699;    /* (v + 27) / 154 */
    return g < 0 ? MW_QMAX : g;
}

void ra_hit(struct ra_voice *s, const struct ra_knobs *k)
{
    if (!s->ready) {
        for (int i = 0; i < RA_NOTES; i++)
            s->ph[i] = (uint32_t)i * 0x9e3779b9u;     /* spread unevenly: two voices on one note never cancel */
        s->tune = ra_tune(k->tun, k->octave);
        s->det = k->det << 16;
        s->wav = k->wav << 16;
        s->env = 0;
        s->ready = 1;
    }
    ra_voicing(k->chd, k->voi, s->note);
    ra_strum(k->str, s->note, s->wait);
    for (int i = 0; i < RA_NOTES; i++)
        if (!s->wait[i])
            s->gain[i] = MW_QMAX;              /* no wait: on at once, as the hit */
    s->amp = gain(k->velocity);
    s->pitch = ra_pch(k->pch);
    s->attack = 1;
}

static inline int32_t blep(uint32_t t, uint32_t r)
{
    int32_t u = (int32_t)(~(t * r) >> 1);
    return qmul(u, u) >> 1;
}

void ra_render(struct ra_voice *s, const struct ra_knobs *k, int32_t *out)
{
    s->tune += (ra_tune(k->tun, k->octave) - s->tune) >> SMOOTH;
    s->det += ((k->det << 16) - s->det) >> SMOOTH;
    s->wav += ((k->wav << 16) - s->wav) >> SMOOTH;

    int det = (s->det + 0x8000) >> 16, wav = (s->wav + 0x8000) >> 16;
    uint32_t inc[RA_NOTES], r[RA_NOTES], ph[RA_NOTES];
    int32_t g0[RA_NOTES], dg[RA_NOTES];
    uint8_t on[RA_NOTES];
    for (int j = 0; j < RA_NOTES; j++) {
        int32_t to = s->wait[j] ? 0 : MW_QMAX;     /* a waiting note fades out, then in at its turn */
        if (s->wait[j])
            s->wait[j]--;
        g0[j] = s->gain[j];
        dg[j] = (to >> 5) - (g0[j] >> 5);
        on[j] = g0[j] || to;
        s->gain[j] = to;
        inc[j] = ra_inc(k->ratio, s->tune + s->pitch + s->note[j] + ra_detune(det, j));
        r[j] = 0xffffffffu / inc[j];
        ph[j] = s->ph[j];
    }

    /* WAV: the saw's and the pulse's weights, the pulse's width and mean */
    int32_t ga, gb;
    uint32_t pw = 0x80000000u;
    if (wav <= 64) {
        gb = wav >= 64 ? MW_QMAX : wav * 33554432;     /* wav / 64 */
        ga = MW_QMAX - gb;
        gb = qmul(gb, SQ_LEVEL);
    } else {
        ga = 0;
        gb = SQ_LEVEL;
        pw -= (uint32_t)(wav - 64) * PW_STEP;
    }
    int32_t dc = HALF - (int32_t)(pw >> 1);         /* the pulse's mean, taken off */

    int32_t e1 = MW_QMAX;
    int32_t a = qmul(s->env, s->amp), a1 = qmul(e1, s->amp);
    int32_t da = (a1 - a) / RA_FRAMES;
    s->env = e1;
    s->attack = 0;

    s->pitch = qmul(s->pitch, PCH_FALL);

    for (int i = 0; i < RA_FRAMES; i++) {
        int32_t sum = 0;
        for (int j = 0; j < RA_NOTES; j++) {
            if (!on[j])
                continue;
            uint32_t p = ph[j] + inc[j];
            ph[j] = p;
            int32_t saw = (int32_t)(p ^ 0x80000000u) >> 1;
            int32_t pls = p < pw ? -HALF : HALF - 1;    /* falls at the wrap with the saw, rises at PW */
            uint32_t back = 0u - p;
            if (p < inc[j]) {                   /* just after the wrap */
                int32_t b = blep(p, r[j]);
                saw += b;
                pls += b;
            } else if (back < inc[j]) {         /* just before it */
                int32_t b = blep(back, r[j]);
                saw -= b;
                pls -= b;
            }
            uint32_t q = p - pw;                /* the pulse's rise */
            if (q < inc[j])
                pls -= blep(q, r[j]);
            else if ((0u - q) < inc[j])
                pls += blep(0u - q, r[j]);
            int32_t v = qsum2(saw, ga, pls - dc, gb) >> 2;
            if (dg[j])
                v = qmul(v, g0[j] + dg[j] * (i + 1));
            sum += v;
        }
        a += da;
        int32_t y = qmul(sum, a);
        out[i] = sadd(y, y >> 1);
    }
    for (int j = 0; j < RA_NOTES; j++)
        s->ph[j] = ph[j];
}
