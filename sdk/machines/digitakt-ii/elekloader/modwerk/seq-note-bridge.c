/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-note.h"
#include "seq-grid.h"

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

#define SEQ_TICK (*(const volatile uint32_t *)0x43158f7cu)
#define CURRENT_PATTERN (*(const volatile uintptr_t *)0x4316501cu)
#define PENDING_PATTERN (*(const volatile uintptr_t *)0x43165024u)
#define SEQ_SOURCE (*(const volatile uintptr_t *)0x4316513cu)
#define PATTERN_SOURCE 0x402a1bf8u
#define SPEED_PULSES ((const uint32_t *)0x4020e28cu)

static unsigned int pattern_word(const uint8_t *address)
{
    return (unsigned int)address[0] << 8 | address[1];
}

static unsigned int swing_trig(const uint8_t *track, unsigned int step)
{
    return track[step * 2u + 1u] & 16u;
}

void core_seq_grid_observe(const uint8_t *pattern, uint32_t track, uint32_t step,
                           uint32_t lookahead)
{
    const uintptr_t address = (uintptr_t)pattern;
    const uintptr_t offset = address - PATTERN_BASE;
    const uintptr_t slot = offset / PATTERN_STRIDE;
    const uintptr_t pending = PENDING_PATTERN;
    if (track >= 16 || step >= 128 || slot >= PATTERN_COUNT ||
        offset != slot * PATTERN_STRIDE || SEQ_SOURCE != PATTERN_SOURCE ||
        address != CURRENT_PATTERN || (pending && address != pending)) {
        return;
    }

    const uint8_t *track_data = pattern + track * TRACK_STRIDE;
    const uint8_t track_mode = pattern[0x1db79];
    if (track_mode > 1 || track_data[0x498] || track_data[0x5a4]) {
        return;
    }

    const unsigned int length = pattern_word(track_mode ? track_data + 0x48c : pattern + 0x1db74);
    const unsigned int speed = track_mode ? track_data[0x48f] : pattern[0x1db7a];
    if (length > 128 || step >= length || speed > 6) {
        return;
    }

    const unsigned int next_step = step + 1u == length ? 0 : step + 1u;
    const unsigned int previous_step = step ? step - 1u : length - 1u;
    const unsigned int following_step = next_step + 1u == length ? 0 : next_step + 1u;
    const unsigned int flags = (swing_trig(track_data, step) ? DT2_SEQ_GRID_SWING_NOW : 0)
        | (swing_trig(track_data, next_step) ? DT2_SEQ_GRID_SWING_NEXT : 0)
        | (swing_trig(track_data, previous_step) ? DT2_SEQ_GRID_SWING_PREVIOUS : 0)
        | (swing_trig(track_data, following_step) ? DT2_SEQ_GRID_SWING_FOLLOWING : 0);
    struct dt2_seq_grid_window window = {
        .pattern = (uint16_t)slot,
        .track = (uint8_t)track,
        .step = (uint8_t)step,
        .length = (uint8_t)length,
        .pulses_per_step = (uint8_t)SPEED_PULSES[speed],
    };
    if (core_seq_grid_timing(&window, SEQ_TICK, lookahead, pattern[0x1db78], flags)) {
        for (unsigned int i = 0; i < DT2_SEQ_GRID_HANDLERS && ev_seq_grid[i]; ++i) {
            ev_seq_grid[i](&window);
        }
    }
}

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

    /* Stock writes the default pitch only for a negative trig override index. */
    if (!(event[0x20] & 0x80u)) {
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
