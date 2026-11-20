/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef EUCLIDEAN_SCALE_PITCH_H
#define EUCLIDEAN_SCALE_PITCH_H

#include <stdint.h>

#define EUC_PATTERNS 128u
#define EUC_TRACKS 16u
#define EUC_TRACK_SLOTS (EUC_PATTERNS * EUC_TRACKS)
#define EUC_ENABLED UINT32_C(0x80000000)
#define EUC_GENERATION UINT32_C(0x001fffff)
#define EUC_RANGE UINT32_C(0x7fe00000)
#define EUC_MIN_OCTAVE (-10)
#define EUC_MAX_OCTAVE 10

extern volatile uint32_t euclidean_state[EUC_TRACK_SLOTS];
uint32_t euclidean_track_state(const volatile uint32_t *track);
void euclidean_set_track_state(volatile uint32_t *track, uint32_t state);
int euclidean_octave_bound(uint32_t state, int upper);
uint32_t euclidean_turn_octave(uint32_t state, int upper, int32_t delta);

#endif
