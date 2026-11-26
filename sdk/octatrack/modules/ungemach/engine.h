/* SPDX-License-Identifier: MIT
 * UNGEMACH's sound: a drone of sixteen detuned oscillators and four subs, on waveforms of its own, that modulate each
 * other and never stop moving. Integer only, no allocation, no firmware calls: it builds and is checked on the host
 * (test_engine.c). */
#ifndef UNGEMACH_ENGINE_H
#define UNGEMACH_ENGINE_H
#include <stdint.h>

typedef struct {
    uint16_t ptch;      /* SRC A, stock PTCH's halfword: raw byte << 8 (4..124), two a semitone; locks and LFOs in it */
    uint8_t diss;       /* SRC B: 0 octave and fifth .. 127 chaos, along one path of dissonance */
    uint8_t diss_frac;  /* SRC B's halfword's low byte: between two steps, as a slide or an LFO moves it */
    uint8_t tone;       /* SRC C: the drone's low-pass, dark to bright */
    uint16_t wave;      /* SRC D's halfword: the waveform, 0 soft .. 127 << 8 harsh, crossfaded (locks and LFOs in it) */
    uint8_t rate;       /* SRC E: 0..63 free, 64..127 synced to the track's steps */
    uint8_t move;       /* how deep RATE's movement goes: 0 none, 64 as designed, 127 about twice that */
    uint8_t sprd;       /* SETUP E: MONO, NARW, WIDE, FULL */
    uint8_t dirt;       /* SRC F: FM, resonance and saturation */
    uint8_t pnch;       /* SETUP F: how hard a trig's punch opens the filter, adds DIRT and lifts the level, 0 none */
    uint8_t frames;     /* frames since the last frame's figures, the skipped ones too (machine.c, from the timer); 0 reads as 1 */
    uint16_t sync_phase;/* where the synced cycle is, 0..65535 (machine.c, from the sequencer's clock) */
} UgControls;

#define UG_NVOICES 16
#define UG_SLOW 8u     /* the slow figures every 8th frame (2.9 ms): drift, voices, ratios, waveforms, RATE's movement */
#define UG_NSUBS 4
#define UG_GROUPS 4    /* the root, the second and third ratio, the subs */
typedef struct {
    uint32_t rng;
    uint32_t ph[UG_NVOICES], phs[UG_NSUBS], phm;   /* the voices, the subs and the FM sine */
    int16_t work[UG_GROUPS][257];       /* each group's waveform: two waves crossfaded at one mip, and its first sample again */
    int32_t vdrift[UG_NVOICES], vtarget[UG_NVOICES];   /* each voice's own drift, in 1/256 cents */
    uint32_t vturn;
    int32_t lowl, bandl, lowr, bandr;   /* the low-pass's two states a side (trapezoidal: ic2 and ic1) */
    int32_t noise_lp, fb;
    int32_t dcl, dcr;                   /* the DC blocker, Q8 */
    int32_t fade;                       /* the drone fading in, Q15 */
    int32_t pk, pc;                     /* PNCH: the punch's body and its crack, Q15, falling from a trig */
    uint8_t vskip;                      /* frames until the next slow figures (UG_SLOW) */
    int32_t drift[2], target[2];        /* slow random walks: pitch, cutoff (Q15) */
    uint32_t drift_count;
    uint32_t lfo_phase[3];              /* free RATE: three curves, pitch, cutoff and level, each at its own pace */
    int32_t lfo_from[3], lfo_to[3];
    /* cost: WAVE glides, and the four groups' waveforms are made again a slice at a time, round the groups; the
     * oscillators run at half the rate, every other sample, and a half-band interpolator draws the full rate */
    int32_t pos;                        /* WAVE's place, gliding, 0..(UG_WAVES - 1) << 8 */
    uint8_t slice, half, gmip[UG_GROUPS];
    int32_t upl[16], upr[16];           /* the oscillators' last eight samples a side, twice, so eight in a row read from up + 1 */
    uint8_t up, wleft[UG_GROUPS];       /* the newest's place; slices of each group's waveform still to make */
    uint32_t wkey[UG_GROUPS];           /* what each group's waveform is being made from: its place and mip */
    int32_t r2q, r3q;                   /* DISS gliding: the ratios (Q20) */
    int32_t xl1, xr1;                   /* the full rate's next sample a side */
    int32_t subl, subr;                 /* the subs' last sample a side (they run at an eighth of the rate) */
    uint8_t subq;                       /* which of four oscillator steps the subs are at */
    int32_t subl0, subr0;               /* the subs' sample before their last, to draw a line between */
    /* what the frame works out once (ug_frame) and its calls use: the increments, the filter and the levels */
    struct {
        uint32_t inc[UG_NVOICES], sinc[UG_NSUBS], minc;
        int32_t f, q, sat, fm, fbk, gain, width, gfd, cut0, level0;   /* cut0, level0: before PNCH */
        int32_t a1, a2, a3; /* the trapezoidal low-pass's coefficients, Q12 */
        uint8_t ready;
    } fr;
} Ungemach;

void ug_reset(Ungemach *k);
/* a trig: the punch starts again (PNCH sets how much of it is heard) */
void ug_punch(Ungemach *k);
/* n samples (at most 16) into left and right; works the frame's figures out first */
void ug_render(Ungemach *k, const UgControls *c, int16_t *left, int16_t *right, unsigned n);
/* the same in a frame's parts: fresh on the frame's first call (its figures are worked out once, for 16 samples), not
 * on a second call after the trig's offset */
void ug_render_part(Ungemach *k, const UgControls *c, int16_t *left, int16_t *right, unsigned n, int fresh);
/* the same, written straight into the packer's buffer: an L and an R long a sample, the sample in the high half */
void ug_render_out(Ungemach *k, const UgControls *c, volatile uint32_t *dst, unsigned n, int fresh);

#endif
