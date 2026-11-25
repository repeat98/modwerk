/* SPDX-License-Identifier: MIT
 * Analog BD's two bassdrums on the ColdFire: the 909 fitted to Skee Mask's TR-909 recordings, and the 808. No
 * firmware, DSP or stock dependencies; the track's AMP, LFOs and effects follow it.
 *
 * Integer only, and no 64-bit products (the ColdFire multiplies 32 x 32 -> 32). Each voice keeps its own 16-sample
 * grid from its trig: every event (the 909's body opening, its click, its release, the end of its hold) falls on a
 * block edge, the envelopes are computed exactly once a block and ramped across it, and the sample loop reads tables,
 * multiplies and adds. A voice whose hit has died away rests and costs a few instructions a call. */
#ifndef AB_DRUM_H
#define AB_DRUM_H
#include <stdint.h>

enum { AB_PARAMS = 12 };
/* The twelve Part bytes, SRC page then SRC SETUP. SAT (5), LOW, HIGH and LPF (9-11) were 0.1.x's desk, which 0.2.0
 * does not have: their bytes stay in the Part, unread. */
enum { AB_PTCH, AB_DCAY, AB_TUNE, AB_ATK, AB_TDEP, AB_SAT, AB_TYPE, AB_FIXD, AB_ACNT, AB_LOW, AB_HIGH, AB_LPF };

typedef struct {
    uint32_t lcg;                       /* the per-hit variation's random words */
    uint32_t u, inc;                    /* phase and its increment, turns (2^32 a cycle) */
    int32_t dinc;
    int32_t a1, a2, da1, da2;           /* body gains, Q17: the 909's on its two tables, the 808's in a1 */
    int32_t r, dr;                      /* 909: thump and the click's tails, Q23 */
    int32_t ne, dne;                    /* 909: the noise envelope, Q23 */
    uint32_t kc;                        /* 909: the knobs exc, gdc, gq and incb were computed for */
    uint32_t exc, incb;                 /* 909: their sweep excursion (turns) and settled pitch (turns) */
    int32_t gdc, gq;                    /* 909: their thump level and body gain, Q15 */
    uint32_t ep, o, m, g, th, e1, e2, n2, n3;  /* envelopes where the block ends, Q31 */
    uint32_t ep0;                       /* 909: the sweep depth the coming body opens with, Q31 */
    int32_t sinca, sgdch;               /* 909: sweep excursion (turns) and thump level (Q15), slewed */
    int32_t g1, g2, g3, g4, gn, gl;     /* 909: this hit's click (Q14), tails (Q23), noise (Q15), lead-in (Q15) */
    int32_t tf;                         /* 808: TONE's one-pole, Q23 */
    int32_t tg;                         /* 808: this hit's transient gain, Q15 */
    uint16_t lead;                      /* 909: samples since the trig while the lead-in plays */
    uint16_t blocks;                    /* blocks since the 909's body opened or the 808's trig, saturating */
    uint16_t left;                      /* samples left in the current block (0: compute the next) */
    uint16_t pp, np, tp;                /* click row, noise index, 808 transient index */
    uint16_t level;                     /* 909: the body copy this block reads (its offset in ab9_body) */
    uint8_t model;                      /* the model this hit plays: 0 808, 1 909 */
    uint8_t state;                      /* AB_REST, AB_LEAD (909 only) or AB_PLAY */
    uint8_t fixd;                       /* this hit's FIXD */
    uint8_t warm;                       /* the 909's slewed values hold a hit's targets */
    uint8_t loud;                       /* 909: a sample of this block may reach full scale */
} AbVoice;
enum { AB_REST, AB_LEAD, AB_PLAY };

void ab_reset(AbVoice *v);
/* n samples (up to 16) of the track, from its twelve Part bytes as played (locks, LFOs and scenes applied). trig: a
 * hit starts at the first sample. lr: n left/right pairs of longs, the 24-bit sample in their high bits (the packer's
 * source format). */
void ab_render(AbVoice *v, const uint8_t *k, int trig, uint32_t *lr, unsigned n);

extern const uint8_t ab_defaults[AB_PARAMS];
#endif
