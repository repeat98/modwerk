/* SPDX-License-Identifier: MIT
 * The shared scale (../modwerk_scale.s; README "Shared scale"): octabam's 52-ID scale catalogue and one pure
 * snap, the rule Scale Quantizer plays. No state: the caller passes the scale and the root it keeps (the base
 * its own SCALE and ROOT, a card build its own settings). Link ../modwerk_scale.s into the build; an assembly
 * module calls the same entry with jsr (the source's header has the sequence). */
#ifndef MODWERK_SCALE_H
#define MODWERK_SCALE_H
#include <stdint.h>

#define MODWERK_SCALE_COUNT 52u        /* IDs 1..52; 0 is no scale. An ID never changes meaning. */
#define MODWERK_SCALE_QUANTIZER_COUNT 24u

/* The MIDI note nearest to note whose degree above root (0..11, C = 0) is in scale id (1..52), the lower one on a
 * tie, within 0..127. Returns note unchanged when id, root or note is out of range. */
int modwerk_scale_snap(int note, unsigned id, unsigned root);

/* modwerk_scale_masks[id - 1]: bit d set = d semitones above the tonic are in the scale (bit 0 always). */
extern const uint16_t modwerk_scale_masks[MODWERK_SCALE_COUNT];

/* Scale Quantizer's saved SCALE 0..24 (0 OFF) -> the catalogue ID with the same mask (0 OFF): IDs 1..7 are the
 * same, 8..24 differ. Index it only after checking n <= MODWERK_SCALE_QUANTIZER_COUNT. */
extern const uint8_t modwerk_scale_from_quantizer[MODWERK_SCALE_QUANTIZER_COUNT + 1u];

#endif
