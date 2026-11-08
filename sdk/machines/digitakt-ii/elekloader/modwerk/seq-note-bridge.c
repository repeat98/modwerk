/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-note.h"

/* Digitakt II OS 1.17. Guards for the stock sites and scale rows are in README.md. */
#define PATTERN_BASE 0x41776cb8u
#define PATTERN_STRIDE 0x1db8cu
#define PATTERN_COUNT 128u
#define TRACK_STRIDE 0x6a5u
#define EVENT_BASE 0x44e67e88u
#define EVENT_STRIDE 0x6cu
#define EVENT_COUNT 128u
#define SCALE_ROWS ((const uint8_t *)0x402258c4u)
#define SCALE_COUNT 35u

static uint16_t scale_mask(uint8_t scale)
{
    if (scale == 255) {
        return 0x0fff;
    }
    if (scale >= SCALE_COUNT) {
        return 0;
    }

    const uint8_t *row = SCALE_ROWS + 13 * scale;
    uint16_t mask = 0;
    for (unsigned int degree = 0; degree < 12; ++degree) {
        if (row[degree]) {
            mask |= (uint16_t)(1u << degree);
        }
    }
    return mask;
}

void core_seq_note_bridge(uint8_t *event, const uint8_t *pattern, uint32_t track, uint32_t step)
{
    if (!ev_seq_note[0] || track >= 16 || step >= 128) {
        return;
    }

    const uintptr_t event_offset = (uintptr_t)event - EVENT_BASE;
    if (event_offset >= EVENT_COUNT * EVENT_STRIDE || event_offset % EVENT_STRIDE != 0) {
        return;
    }

    const uintptr_t offset = (uintptr_t)pattern - PATTERN_BASE;
    const uintptr_t slot = offset / PATTERN_STRIDE;
    if (slot >= PATTERN_COUNT || offset != slot * PATTERN_STRIDE
        || pattern[0x498u + track * TRACK_STRIDE] != 1) {
        return;
    }

    /* Only the queued note record shape verified on the audio path. */
    if (event[0] || event[1] || event[2] || event[3] > 1
        || event[7] != 1 || event[13] != 1 || !event[0x27] || event[0x26] > 127) {
        return;
    }

    const uint8_t root = pattern[0x1db7f];
    const uint16_t mask = scale_mask(pattern[0x1db7d]);
    if (root >= 12 || !mask) {
        return;
    }

    const struct dt2_seq_note_context context = {
        (uint16_t)slot, mask, (uint8_t)track, (uint8_t)step, root, DT2_SEQ_NOTE_EUCLIDEAN
    };
    event[0x26] = (uint8_t)core_seq_note_pitch(&context, event[0x26]);
}
