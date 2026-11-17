/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_SEQ_NOTE_H
#define MODWERK_DT2_SEQ_NOTE_H

#include <stdint.h>

#define DT2_SEQ_NOTE_HANDLERS 4
#define DT2_SEQ_NOTE_EUCLIDEAN 1u

struct dt2_seq_note_context {
    uint16_t pattern;       /* Zero-based stock pattern slot. */
    uint16_t scale_mask;    /* Pitch classes relative to root, bit 0 is the root. */
    uint8_t track;         /* Zero-based playback track. */
    uint8_t step;          /* Zero-based stock step for this event. */
    uint8_t root;          /* Pitch class, 0 is C. */
    uint8_t flags;
};

/* Return a pitch in 0..127 or -1 to retain the current pitch. */
typedef int32_t (*dt2_seq_note_handler)(const struct dt2_seq_note_context *, uint32_t);

/* The base linker supplies this collection in subscription order. */
extern dt2_seq_note_handler const ev_seq_note[DT2_SEQ_NOTE_HANDLERS];

uint32_t core_seq_note_pitch(const struct dt2_seq_note_context *context, uint32_t pitch);

#endif
