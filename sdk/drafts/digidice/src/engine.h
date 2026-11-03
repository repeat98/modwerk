/* SPDX-License-Identifier: MIT */
/* digidice: a random melody generator for the Digitakt mk1, inspired by
 * Vermona's meloDICEr. The engine is plain C with no OS or libc calls: it
 * turns eight settings and two seeds into a trig, a note, a velocity and a
 * length for each step. The mod writes the result through the OS's own
 * setters (sdk/digitakt/research/pattern-write.md). */
#ifndef DIGIDICE_ENGINE_H
#define DIGIDICE_ENGINE_H

#include <stdint.h>

#define DD_STEPS      64
#define DD_SPACINGS   6     /* NOTE VALUE: 1, 2, 3, 4, 6 or 8 steps */
#define DD_SCALES     8
#define DD_RANGE_MAX  24    /* scale degrees above the root */
#define DD_LEN_UNIT   8     /* lengths are in eighths of a step */

/* The eight controls, each already inside its range. */
typedef struct {
    uint8_t density;    /* 0..127: chance a rhythm slot plays; 0 = silence, 127 = every slot */
    uint8_t spacing;    /* 0..DD_SPACINGS-1: the basic gap between notes */
    uint8_t variation;  /* 0..127: chance a slot's gap halves or doubles */
    uint8_t legato;     /* 0..127: length as a share of the gap; 127 ties to the next slot */
    uint8_t root;       /* 0..11: C..B */
    uint8_t scale;      /* 0..DD_SCALES-1, see dd_scale_name */
    uint8_t range;      /* 0..DD_RANGE_MAX: scale degrees above the root */
    uint8_t vel_spread; /* 0..127: how far velocities spread around vel_base */
} dd_settings;

typedef struct {
    uint8_t  on;    /* a note trig */
    uint8_t  note;  /* semitones above the C below the root: root + interval */
    uint8_t  vel;   /* 1..127 */
    uint16_t len;   /* in DD_LEN_UNIT ths of a step, at least 1 */
} dd_step;

/* Fill out[0..DD_STEPS-1]. Steps at or past `length` (1..64) are off.
 * The rhythm (which steps play, their lengths and velocities) depends only
 * on rhythm_seed; the note at each step only on note_seed, so either seed
 * can be rolled while the other half stays. Returns the number of notes. */
int dd_generate(const dd_settings *s, uint32_t rhythm_seed, uint32_t note_seed,
                int length, uint8_t vel_base, dd_step out[DD_STEPS]);

/* The next seed for a roll. Never returns the seed it was given. */
uint32_t dd_next_seed(uint32_t seed);

/* Clamp every field into its range. */
void dd_clamp(dd_settings *s);

const char *dd_scale_name(int scale);
int dd_spacing_steps(int spacing);

#endif
