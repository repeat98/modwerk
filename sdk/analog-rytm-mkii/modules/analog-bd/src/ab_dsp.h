/* SPDX-License-Identifier: MIT */
/* Analog BD's 808 and 909 voices, fixed point (Q31), one 32-frame block at a
 * time. The models are repeat98's (sdk/octabam/modules/analog-bassdrum):
 * this is the structure of dsp808.py's and dsp909.py's Voice, sample for
 * sample, at 48 kHz, with the Rytm's fixed choices: FIXD on, SAT 0, no LPF. The
 * 909 (0.1.7) steps its control every 16 samples, as the Octatrack's block does. */
#ifndef AB_DSP_H
#define AB_DSP_H
#include <stdint.h>

#define AB_FRAMES 32    /* MW_VOICE_FRAMES */

enum { AB_808, AB_909 };

/* The knobs as the models read them, 0..127. ACNT is the hit's velocity. */
struct ab_knobs {
    int ptch, dcay, tone, atk, swep, acnt, low, high;
    int32_t ratio;          /* the note's pitch ratio, Q28 (1.0 = 1 << 28) */
};

/* A voice's state. The hand-scheduled passes (ab_*.s) read and write it by offset; ab_dsp.c
 * pins each offset they use with a static assertion. */
struct ab_voice {
    int32_t cnt;                /* samples since the hit, held a block short of INT32_MAX */
    int32_t lb, m2;             /* the desk */
    union {
        struct {
            /* the body's state */
            int32_t ep;
            uint32_t u;
            int32_t o, m, th;
            /* the body's controls for the next 16 samples (worked out every 16) */
            int32_t aincb, asinca, dkp, dkm, glr, gk, gh, ngdc;
            /* the click: its gains, the slow modes' two decaying words, the table's row */
            int32_t g1, g2, g3, g4, e1, e2, pp;
            /* the noise: the chain, and its envelope ramped every 16 samples */
            int32_t env, denv, nh, nprev, n1, n2;
            uint32_t lcg;
            /* control only (C): the slewed sweep depth and thump, the shape scale, the
             * noise envelope's two words and its gain */
            int32_t sinca, sgdch, lr, e2n, e3n, gn16;
        } a;                    /* the 909 */
        struct {
            int32_t ep, e;
            uint32_t u;
            int32_t pc, ps, dc, tf;
        } b;                    /* the 808 */
    } v;
    struct ab_knobs set_k;      /* the knobs the block's settings below were worked out from */
    int32_t set[16];
    uint8_t model, seeded, set_ok, noise_on, tails_on;
};

void ab_init(struct ab_voice *s, int model);
void ab_trig(struct ab_voice *s);
/* One block into out (Q31, the Octatrack's full scale). */
void ab_render(struct ab_voice *s, const struct ab_knobs *k, int32_t *out);

#endif
