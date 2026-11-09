/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-phrase.h"

enum {
    EVENT_BASE = 0x44e67e88u, EVENT_COUNT = 128, EVENT_STRIDE = 108,
    PATTERN_BASE = 0x41776cb8u, PATTERN_STRIDE = 0x1db8cu, TRACK_STRIDE = 0x6a5u,
    STEP_VALUES = 0x6a50, STEP_VALUE_SIZE = 6, STEP_VALUE_COUNT = 16 * 128,
    FREE_EVENT_HEAD = 0x44e6b494u, FREE_DEADLINE_HEAD = 0x44e6b490u,
    STOCK_RESERVE = 16,
};

typedef uintptr_t (*allocate_fn)(void);
typedef void (*release_fn)(void *);
typedef void (*copy_fn)(void *, const void *);
typedef void (*submit_fn)(void *, uint32_t);

static const allocate_fn allocate = (allocate_fn)(uintptr_t)0x4013a806u;
static const release_fn recycle = (release_fn)(uintptr_t)0x4013a83cu;
static const copy_fn copy_event = (copy_fn)(uintptr_t)0x4013a870u;
static const submit_fn submit = (submit_fn)(uintptr_t)0x4013a98cu;

struct dt2_seq_grid_window core_seq_phrase_windows[16];

/* The DSP dispatcher reads an inline row for index -1 and a pattern row otherwise. */
static const uint8_t *source_values(const uint8_t *source)
{
    const int32_t index = *(const int32_t *)(source + 32);
    if (index < 0) {
        return source + 36;
    }
    return (const uint8_t *)*(const uintptr_t *)(source + 28) + STEP_VALUE_SIZE * index;
}

static int has_room(uintptr_t head, unsigned int next, unsigned int required)
{
    uintptr_t entry = *(const volatile uintptr_t *)head;
    for (unsigned int i = 0; i < required; ++i) {
        if (!entry) {
            return 0;
        }
        entry = *(const volatile uintptr_t *)(entry + next);
    }
    return 1;
}

/* Interrupts are masked by the caller. Reserve before changing the queue. */
int core_seq_phrase_commit(uint8_t *source, const struct dt2_seq_phrase_note *notes, uint32_t count)
{
    uint8_t *records[DT2_SEQ_PHRASE_MAX_NOTES * 2];
    if (!count || count > DT2_SEQ_PHRASE_MAX_NOTES ||
        !has_room(FREE_DEADLINE_HEAD, 16, 2 * count + STOCK_RESERVE) ||
        !has_room(FREE_EVENT_HEAD, 104, 2 * count + STOCK_RESERVE)) {
        return 0;
    }

    for (unsigned int i = 0; i < 2 * count; ++i) {
        records[i] = (uint8_t *)allocate();
        if (!records[i]) {
            while (i) {
                recycle(records[--i]);
            }
            return 0;
        }
    }

    for (unsigned int i = 0; i < count; ++i) {
        uint8_t *const on = records[2 * i];
        uint8_t *const off = records[2 * i + 1];
        const struct dt2_seq_phrase_note *const note = &notes[i];
        copy_event(on, source);
        *(uint32_t *)(on + 8) = note->onset;
        *(int32_t *)(on + 32) = -1;
        on[36] = source_values(source)[0];
        on[37] = source_values(source)[1];
        on[38] = note->pitch;
        on[39] = note->velocity;
        on[40] = 126;
        copy_event(off, on);
        *(uint32_t *)(off + 4) = 0;
        *(uint32_t *)(off + 8) = note->release;
        submit(on, note->onset);
        submit(off, note->release);
    }
    recycle(source);
    return 1;
}

static int notes_fit(const struct dt2_seq_grid_window *window,
                     const struct dt2_seq_phrase_note *notes, unsigned int count)
{
    if (!count || count > DT2_SEQ_PHRASE_MAX_NOTES) {
        return 0;
    }
    const uint32_t span = window->next - window->onset;
    uint32_t last = 0;
    for (unsigned int i = 0; i < count; ++i) {
        const struct dt2_seq_phrase_note *const note = &notes[i];
        if (!note->velocity || note->velocity > 127 || note->pitch > 127) {
            return 0;
        }
        const uint32_t on = note->onset - window->onset;
        const uint32_t off = note->release - window->onset;
        if (on < last || off <= on || off > span) {
            return 0;
        }
        last = off;
    }
    return 1;
}

int core_seq_phrase_replace(uint8_t *source, uint32_t deadline)
{
    const uintptr_t offset = (uintptr_t)source - EVENT_BASE;
    if (offset >= EVENT_COUNT * EVENT_STRIDE || offset % EVENT_STRIDE ||
        *(const uint32_t *)source || *(const uint32_t *)(source + 4) != 1 ||
        *(const uint32_t *)(source + 20) != 1 || !*(const uintptr_t *)(source + 84) ||
        !(*(const uint32_t *)(source + 56) & 128u) || *(const uint32_t *)(source + 8) != deadline) {
        return 0;
    }
    const unsigned int track = *(const uint32_t *)(source + 16);
    if (track >= 16) {
        return 0;
    }
    struct dt2_seq_grid_window *const pending = &core_seq_phrase_windows[track];
    const struct dt2_seq_grid_window window = *pending;
    pending->length = 0;
    const uintptr_t stock_pattern = PATTERN_BASE + window.pattern * PATTERN_STRIDE;
    const uint8_t *const stock_track = (const uint8_t *)(stock_pattern + track * TRACK_STRIDE);
    if (!window.length || (window.flags & DT2_SEQ_GRID_PLAY_SOURCE) || window.onset != deadline ||
        *(const uint8_t *const *)(source + 44) != stock_track) {
        return 0;
    }
    const int32_t index = *(const int32_t *)(source + 32);
    if (index >= STEP_VALUE_COUNT ||
        (index >= 0 && *(const uintptr_t *)(source + 28) != stock_pattern + STEP_VALUES)) {
        return 0;
    }
    const uint8_t *const row = source_values(source);
    const uint8_t pitch = row[2] <= 127 ? row[2] : stock_track[0x485];
    const uint8_t velocity = row[3] <= 127 ? row[3] : stock_track[0x480];
    if (row[0] > 127 || pitch > 127 || !velocity || velocity > 127) {
        return 0;
    }

    struct dt2_seq_phrase_note notes[DT2_SEQ_PHRASE_MAX_NOTES];
    for (unsigned int i = 0; i < DT2_SEQ_PHRASE_HANDLERS && ev_seq_audio_phrase[i]; ++i) {
        for (unsigned int n = 0; n < DT2_SEQ_PHRASE_MAX_NOTES; ++n) {
            notes[n].velocity = 0;
        }
        const uint32_t count = ev_seq_audio_phrase[i](&window, pitch, velocity, notes);
        if (notes_fit(&window, notes, count)) {
            return core_seq_phrase_atomic(source, notes, count);
        }
    }
    return 0;
}
