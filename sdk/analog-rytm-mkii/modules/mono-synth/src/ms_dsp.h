/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Mono Synth's voice: one oscillator with a saw and a pulse, a sub that divides it, white
 * noise and a triangle LFO on pitch, all in Q31 fixed point (modwerk/dsp.h). The same C
 * builds on the host with -DMW_DSP_HOST for tests/host_test.c. */
#ifndef MS_DSP_H
#define MS_DSP_H

#include <stdint.h>

#define MS_FRAMES 32
#define MS_RANGES 4                 /* the type: 16', 8', 4', 2' */

/* The knobs and the hit, as the base gives them (0..127). */
struct ms_knobs {
    uint8_t tun, lfo, mod, pls, saw, sub, nse;
    uint8_t range;                  /* 0..3: 16', 8', 4', 2' */
    int32_t ratio;                  /* the note against 60, Q28 */
};

struct ms_voice {
    uint32_t phase;                 /* the oscillator, a whole uint32 a period */
    uint32_t inc;                   /* its step at the end of the last block */
    uint32_t lfo;                   /* the LFO's phase */
    uint32_t noise;                 /* the noise generator's state */
    uint32_t count;                 /* the oscillator's periods, for the sub's divider */
    int32_t pitch;                  /* TUN and the range, smoothed, octaves Q24 */
    int32_t depth;                  /* MOD, smoothed, octaves Q24 */
    int32_t lvl[4];                 /* saw, pulse, sub, noise levels at the end of the last block, Q31 */
    uint8_t ready;
};

/* Set up a voice from the first hit's knobs, so it starts at their values. */
void ms_init(struct ms_voice *s, const struct ms_knobs *k);
/* One block: MS_FRAMES samples into out, Q31. */
void ms_render(struct ms_voice *s, const struct ms_knobs *k, int32_t *out);

/* Pieces, exported for the host tests. */
int32_t ms_exp2_q30(int32_t oct, int *shift);      /* 2^oct: mantissa Q30 in [1, 2) and its shift */
uint32_t ms_osc_inc(int32_t ratio, int32_t oct);    /* the oscillator's step for a note and an offset */
uint32_t ms_lfo_inc(int knob);                      /* the LFO's step a block */
int32_t ms_tri(uint32_t phase);                     /* -1..1, Q31 */
int32_t ms_depth(int knob);                         /* MOD's peak, octaves Q24 */
int32_t ms_tune(int knob, int range);               /* TUN and the range, octaves Q24 */

#define MS_RATE 48000
#define MS_Q24 (1 << 24)

#endif
