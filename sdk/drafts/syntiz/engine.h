/* SPDX-License-Identifier: MIT
 * SYNTIZ's oscillators: an original engine for an Octatrack track machine. No firmware, DSP or
 * stock dependencies; the track's own filter, AMP envelope, LFOs and effects follow it.
 *
 * Integer only, and no 64-bit products: the ColdFire has no FPU and multiplies 32 x 32 -> 32,
 * so every product here is of two values below 2^16 or kept below 2^31 by its operands' range.
 * Samples are Q15; phases and increments are unsigned 32-bit turns (2^32 = one cycle). */
#ifndef WAVE_ENGINE_H
#define WAVE_ENGINE_H
#include <stdint.h>

enum { WAVE_SAW, WAVE_PULSE, WAVE_ENS, WAVE_TABLE, WAVE_MORPH, WAVE_CHOIR, WAVE_MODELS };
#define WAVE_RATE 44100u
#define WAVE_DELAY 1024u                /* the ensemble's delay line: 23 ms, a power of two */

/* Every control 0..127, as a Part byte stores it. A model reads only its own. */
typedef struct {
    uint8_t model;
    uint8_t det;                        /* SAW, PULSE: detune of the unison pairs */
    uint8_t uni;                        /* SAW, PULSE: inner pair level */
    uint8_t wide;                       /* SAW: outer pair level, at twice the detune */
    uint8_t sub;                        /* all: square one octave down (silent below 25 Hz) */
    uint8_t sub2;                       /* all: sine two octaves down (silent below 25 Hz) */
    uint8_t pw;                         /* PULSE: width, 64 square; ENS: shape, saw 0, square 64, spike 127 */
    uint8_t pwm;                        /* PULSE: width sweep depth */
    uint8_t pws;                        /* PULSE: width sweep speed */
    uint8_t note[3];                    /* ENS, CHOIR: chord notes, 64 = off, else -24..+24 semitones (32..96) */
    uint8_t chor;                       /* ENS, CHOIR: chorus amount */
    uint8_t drive;                      /* all: level into the output saturator, 64 = unity */
    uint8_t rtrg;                       /* all: >= 64 restarts the phases at each note */
    uint8_t table;                      /* TABLE, CHOIR: the single cycle, 32 tables of four values each (tables.h);
                                         * MORPH: the first one */
    uint8_t morph;                      /* TABLE: crossfade toward the next table */
    uint8_t msweep;                     /* TABLE: 0 holds MORF; above, a triangle sweep of the crossfade, about 5 Hz at 127 */
    uint8_t sync;                       /* TABLE: 0 off; above, a hard-synced cycle at up to 8 times the note */
    uint8_t wav2;                       /* MORPH: the second single cycle, as table */
    uint8_t mix;                        /* MORPH: 0 the first alone, 127 the second alone */
    uint8_t wid;                        /* MORPH: the second one's pitch above the note, 0..+24 semitones, quadratic */
    uint8_t fade;                       /* MORPH: a change of either cycle crossfades over 5 ms..2 s; 0 switches at once */
    uint8_t bit1, bit2;                 /* MORPH: each cycle's resolution, 12 bits at 0 down to 1 bit at 127 */
} WaveControls;

typedef struct {
    uint32_t ph[8];                     /* SAW, PULSE: base, inner +/-, outer +/-; ENS, CHOIR: one per chord note;
                                         * MORPH: the first and the second cycle */
    uint32_t sub, sub2;                 /* -1 and -2 octave phases */
    uint32_t sweep;                     /* PULSE's width triangle, TABLE's crossfade triangle */
    uint32_t lfo;                       /* ENS's and CHOIR's chorus */
    uint32_t write;                     /* their delay line's write index */
    int32_t dcx, dcy;                   /* the output's DC blocker: last input, last output in Q8 */
    int32_t sx, sf;                     /* the output stage's last input (Q13) and antiderivative (Q24) */
    int32_t ex;                         /* its treble emphasis's last input (Q13) */
    uint32_t fade;                      /* MORPH: what remains of the crossfade from the old pair, Q24 */
    uint8_t ta, tb, fa, fb, armed;      /* MORPH: the pair playing, the pair fading out, and whether ta/tb are set */
    int16_t line[WAVE_DELAY];
} Wave;

extern const WaveControls wave_defaults[WAVE_MODELS];

void wave_reset(Wave *w);
/* A trig or a note: restarts the phases when the controls ask for it. */
void wave_note(Wave *w, const WaveControls *c);
/* Fills out[0..n) with the track's source for one block at base increment inc (the played pitch,
 * in turns per sample: f / 44100 * 2^32). n up to 64. Controls are read once per block. */
void wave_render(Wave *w, const WaveControls *c, uint32_t inc, int16_t *out, unsigned n);

/* TABLE's table names (four letters) by table number 0..31. */
const char *wave_table_name(unsigned t);

/* Semitone ratios as Q16 for the chord, -24..+24: wave_ratio[s + 24]. */
extern const uint32_t wave_ratio[49];
#endif
