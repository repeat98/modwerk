/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SY RAVE's voice: six band-limited oscillators playing a chord, each a saw, a square or a
 * narrow pulse, detuned against each other, strummed and with a pitch drop at the hit, all in
 * Q31 fixed point (modwerk/dsp.h). The same C builds on the host with -DMW_DSP_HOST for
 * tools/host_test.c. */
#ifndef RA_DSP_H
#define RA_DSP_H

#include <stdint.h>
#include "ra_tables.h"

#define RA_FRAMES 32
#define RA_RATE 48000
#define RA_Q24 (1 << 24)
#define RA_OCTAVES 4                /* the type: the register, -1, -2, 0 or +1 octave */
#define RA_VOICINGS 9               /* VOI: as listed, root down, root and fifth down, drop 2, drop 3, drop 2+4, open, sub, wide */

struct ra_knobs {
    uint8_t tun, str, chd, voi, det, wav, pch;
    uint8_t octave;                 /* the type, 0..RA_OCTAVES - 1 */
    uint8_t velocity;               /* 1..127 */
    int32_t ratio;                  /* the note against 60, Q28 */
};

struct ra_voice {
    uint32_t ph[RA_NOTES];          /* the oscillators, free running from hit to hit */
    int32_t note[RA_NOTES];         /* the chord as voiced at the hit, octaves Q24 */
    int32_t tune, det, wav;         /* TUN and the register, DET, WAV: smoothed */
    int32_t env, amp;               /* the level (held: the AMP page shapes it), the hit's gain */
    int32_t gain[RA_NOTES];         /* each note's gate, Q31: STR opens them in turn */
    uint16_t wait[RA_NOTES];        /* blocks until each note opens */
    int32_t pitch;                  /* PCH's offset, octaves Q24: set at the hit, falling to 0 */
    uint8_t attack, ready;
};

void ra_hit(struct ra_voice *s, const struct ra_knobs *k);
void ra_render(struct ra_voice *s, const struct ra_knobs *k, int32_t *out);

/* Pieces, exported for the host tests. */
int32_t ra_exp2_q30(int32_t oct, int *shift);
uint32_t ra_inc(int32_t ratio, int32_t oct);         /* an oscillator's step: the note and an offset from it */
int32_t ra_tune(int knob, int octave);               /* TUN and the register, octaves Q24 */
void ra_voicing(int chd, int voi, int32_t *note);   /* the six notes, octaves Q24 */
int32_t ra_detune(int knob, int i);                  /* note i's detune at DET, octaves Q24 */
int32_t ra_pch(int knob);                            /* PCH's offset at the hit, octaves Q24 */
int ra_str_step(int knob);                           /* STR's gap between two notes, blocks */
void ra_strum(int knob, const int32_t *note, uint16_t *wait);   /* each note's wait at the hit */

#endif
