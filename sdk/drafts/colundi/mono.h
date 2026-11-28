/* SPDX-License-Identifier: MIT */
#ifndef COLUNDI_MONO_H
#define COLUNDI_MONO_H
#include <stdint.h>

/* Zero initialization is silent. One instance belongs to exactly one lane. */
typedef struct {
    uint32_t phase, word;
    int32_t gain, target, colour, colour_target;
    uint32_t overtone_phase, overtone_word;
} ColundiVoice;

uint32_t colundi_word(unsigned palette, unsigned degree);
void colundi_note(ColundiVoice *v, unsigned palette, unsigned degree, unsigned bright);
void colundi_off(ColundiVoice *v);
void colundi_render(ColundiVoice *v, int16_t *out, unsigned count);
#endif
