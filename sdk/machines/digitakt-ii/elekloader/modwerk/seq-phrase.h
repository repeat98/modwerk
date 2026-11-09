/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_SEQ_PHRASE_H
#define MODWERK_DT2_SEQ_PHRASE_H

#include "seq-grid.h"

#define DT2_SEQ_PHRASE_HANDLERS 4
#define DT2_SEQ_PHRASE_MAX_NOTES 8

struct dt2_seq_phrase_note {
    uint32_t onset;
    uint32_t release;
    uint8_t pitch;
    uint8_t velocity;
};

/* Experimental source-trig callback. Zero leaves the source note in stock. */
typedef uint32_t (*dt2_seq_phrase_handler)(const struct dt2_seq_grid_window *,
    uint32_t pitch, uint32_t velocity, struct dt2_seq_phrase_note *);
extern dt2_seq_phrase_handler const ev_seq_audio_phrase[DT2_SEQ_PHRASE_HANDLERS];

/* Shared only by the two base bridges in the stock scheduling interrupt. */
extern struct dt2_seq_grid_window core_seq_phrase_windows[16];

int core_seq_phrase_commit(uint8_t *source, const struct dt2_seq_phrase_note *notes, uint32_t count);
int core_seq_phrase_atomic(uint8_t *source, const struct dt2_seq_phrase_note *notes, uint32_t count);

#endif
