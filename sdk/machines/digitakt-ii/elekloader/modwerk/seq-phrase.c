/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-phrase.h"
#include "mk2/core.h"

enum {
    EVENT_BASE = 0x44e67e88u, EVENT_COUNT = 128, EVENT_STRIDE = 108,
    PATTERN_BASE = 0x41776cb8u, PATTERN_STRIDE = 0x1db8cu, TRACK_STRIDE = 0x6a5u,
    STEP_VALUES = 0x6a50, STEP_VALUE_SIZE = 6, STEP_VALUE_COUNT = 16 * 128,
    STEP_VALUE_INDICES = 0x12a50,
    FREE_EVENT_HEAD = 0x44e6b494u, FREE_DEADLINE_HEAD = 0x44e6b490u,
    FREE_PAYLOAD_HEAD = 0x44e6b48cu, PLAY_PAYLOAD_BASE = 0x44f61c40u, PLAY_PAYLOAD_STRIDE = 0x484,
    STOCK_RESERVE = 16,
};

typedef uintptr_t (*allocate_fn)(void);
typedef void (*release_fn)(void *);
typedef void (*copy_fn)(void *, const void *);
typedef void (*submit_fn)(void *, uint32_t);

static const allocate_fn allocate = (allocate_fn)(uintptr_t)0x4013a806u;
static const allocate_fn allocate_payload = (allocate_fn)(uintptr_t)0x4013a7b6u;
static const release_fn recycle = (release_fn)(uintptr_t)0x4013a83cu;
static const release_fn recycle_payload = (release_fn)(uintptr_t)0x4013a7d8u;
static const copy_fn copy_event = (copy_fn)(uintptr_t)0x4013a870u;
static const submit_fn submit = (submit_fn)(uintptr_t)0x4013a98cu;

struct dt2_seq_grid_window core_seq_phrase_windows[16];
uint32_t core_seq_transport_epoch;

struct phrase_carry {
    uint32_t event[EVENT_STRIDE / sizeof(uint32_t)];
    dt2_seq_phrase_handler handler;
    uint32_t epoch;
    uint16_t pattern;
};
static struct phrase_carry carries[16];

/* Ordinary pattern trigs use the stock step-value row's signed microtiming
 * byte, scaled by track speed and the same Q16 multiplier as the queue path. */
static int32_t micro_offset(const uint8_t *pattern, unsigned int track,
                            unsigned int step, unsigned int pulses)
{
    const uint8_t *const trigs = pattern + track * TRACK_STRIDE;
    if (!(trigs[step * 2 + 1] & 5u)) {
        return 0;
    }
    const uint8_t *const entry = pattern + STEP_VALUE_INDICES + 2 * (track * 128 + step);
    const unsigned int index = (unsigned int)entry[0] << 8 | entry[1];
    if (index >= STEP_VALUE_COUNT) {
        return 0;
    }
    const int32_t timing = (int8_t)pattern[STEP_VALUES + STEP_VALUE_SIZE * index + 5];
    const int track_amount = (int8_t)trigs[0x48e];
    const int pattern_amount = (int8_t)pattern[0x1db7b];
    const int amount = track_amount > pattern_amount ? track_amount : pattern_amount;
    const int32_t scale = ((100 - amount) * 83887) >> 7;
    const uint32_t product = (uint32_t)(timing * (int32_t)pulses * 25) * (uint32_t)scale;
    return ((int32_t)product >> 16) * 1500;
}

static void bound_next(struct dt2_seq_grid_window *window, const uint8_t *pattern)
{
    const unsigned int step = window->step + 1u == window->length ? 0 : window->step + 1u;
    const int32_t offset = micro_offset(pattern, window->track, step, window->pulses_per_step);
    if (offset < 0) {
        window->next += (uint32_t)offset;
    }
}

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
    const uint32_t kind = *(const uint32_t *)source;
    const int owned = (uintptr_t)source - EVENT_BASE < EVENT_COUNT * EVENT_STRIDE;
    if (!count || count > DT2_SEQ_PHRASE_MAX_NOTES ||
        !has_room(FREE_DEADLINE_HEAD, 16, 2 * count + STOCK_RESERVE) ||
        !has_room(FREE_EVENT_HEAD, 104, 2 * count + STOCK_RESERVE) ||
        (kind == 1 && !has_room(FREE_PAYLOAD_HEAD, 16, STOCK_RESERVE))) {
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

    if (kind == 1) {
        /* PLAY and empty steps use a template. Queue records share a fresh empty payload. */
        const uintptr_t payload = allocate_payload();
        *(uint32_t *)(payload + 8) = 0;
        *(uintptr_t *)(source + 84) = payload;
        *(uint32_t *)source = 0;
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
    if (owned) {
        recycle(source);
    } else {
        recycle_payload((void *)*(const uintptr_t *)(source + 84));
    }
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

void core_seq_phrase_empty(unsigned int track)
{
    if (track >= 16 || !carries[track].handler) {
        return;
    }
    struct phrase_carry *const carry = &carries[track];
    struct dt2_seq_grid_window window = core_seq_phrase_windows[track];
    if (!window.length || carry->pattern != window.pattern ||
        carry->epoch != window.transport_epoch) {
        carry->handler = 0;
        return;
    }

    const uint8_t *const stock_track = (const uint8_t *)(uintptr_t)carry->event[11];
    if (stock_track[window.step * 2 + 1] & 5u) {
        return;
    }
    const uint8_t *const row = (const uint8_t *)&carry->event[9];
    struct dt2_seq_phrase_note notes[DT2_SEQ_PHRASE_MAX_NOTES];
    for (unsigned int i = 0; i < DT2_SEQ_PHRASE_MAX_NOTES; ++i) {
        notes[i].velocity = 0;
    }
    window.flags |= DT2_SEQ_GRID_EMPTY;
    bound_next(&window, stock_track - track * TRACK_STRIDE);
    if ((int32_t)(window.next - window.onset) <= 0) {
        return;
    }
    const uint32_t count = carry->handler(&window, row[2], row[3], notes);
    if (!count) {
        carry->handler = 0;
    } else if (notes_fit(&window, notes, count)) {
        uint32_t source[EVENT_STRIDE / sizeof(uint32_t)];
        fw_memcpy(source, carry->event, EVENT_STRIDE);
        core_seq_phrase_atomic((uint8_t *)source, notes, count);
    }
}

int core_seq_phrase_replace(uint8_t *source, uint32_t deadline)
{
    const uintptr_t offset = (uintptr_t)source - EVENT_BASE;
    if (offset >= EVENT_COUNT * EVENT_STRIDE || offset % EVENT_STRIDE) {
        return 0;
    }
    const uint32_t kind = *(const uint32_t *)source;
    if (kind > 1 || *(const uint32_t *)(source + 4) != 1 ||
        *(const uint32_t *)(source + 20) != 1 || !*(const uintptr_t *)(source + 84) ||
        !(*(const uint32_t *)(source + 56) & 128u)) {
        return 0;
    }
    const unsigned int track = *(const uint32_t *)(source + 16);
    if (track >= 16) {
        return 0;
    }
    struct dt2_seq_grid_window *const pending = &core_seq_phrase_windows[track];
    struct dt2_seq_grid_window window = *pending;
    pending->length = 0;
    const uintptr_t stock_pattern = PATTERN_BASE + window.pattern * PATTERN_STRIDE;
    const uint8_t *const stock_track = (const uint8_t *)(stock_pattern + track * TRACK_STRIDE);
    if (!window.length || !!(window.flags & DT2_SEQ_GRID_PLAY_SOURCE) != kind ||
        window.onset != *(const uint32_t *)(source + 8) ||
        *(const uint8_t *const *)(source + 44) != stock_track) {
        return 0;
    }
    if (kind == 1) {
        const uintptr_t payload = *(const uintptr_t *)(source + 84);
        if (payload != PLAY_PAYLOAD_BASE + track * PLAY_PAYLOAD_STRIDE ||
            *(const uint32_t *)(payload + 8) != 0) {
            return 0;
        }
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

    if (deadline != window.onset &&
        (kind != 0 || deadline - window.onset != (uint32_t)micro_offset(
            (const uint8_t *)stock_pattern, track, window.step, window.pulses_per_step))) {
        return 0;
    }
    window.onset = deadline;
    bound_next(&window, (const uint8_t *)stock_pattern);
    if ((int32_t)(window.next - window.onset) <= 0) {
        return 0;
    }

    struct dt2_seq_phrase_note notes[DT2_SEQ_PHRASE_MAX_NOTES];
    for (unsigned int i = 0; i < DT2_SEQ_PHRASE_HANDLERS && ev_seq_audio_phrase[i]; ++i) {
        for (unsigned int n = 0; n < DT2_SEQ_PHRASE_MAX_NOTES; ++n) {
            notes[n].velocity = 0;
        }
        const uint32_t result = ev_seq_audio_phrase[i](&window, pitch, velocity, notes);
        const int keep = result != DT2_SEQ_PHRASE_REST && (result & DT2_SEQ_PHRASE_CARRY);
        const uint32_t count = result & ~DT2_SEQ_PHRASE_CARRY;
        const int rest = result == DT2_SEQ_PHRASE_REST || (keep && !count);
        if (rest || notes_fit(&window, notes, count)) {
            struct phrase_carry *const carry = &carries[track];
            carry->handler = 0;
            if (keep) {
                fw_memcpy(carry->event, source, EVENT_STRIDE);
                carry->event[0] = 1; /* Template marker for a fresh payload. */
                carry->event[8] = UINT32_MAX; /* Use an inline row. */
                carry->event[21] = 0; /* The stock payload's lifetime ends with the source. */
                carry->event[26] = 0;
                uint8_t *const inline_row = (uint8_t *)&carry->event[9];
                inline_row[0] = row[0];
                inline_row[1] = row[1];
                inline_row[2] = pitch;
                inline_row[3] = velocity;
                carry->epoch = window.transport_epoch;
                carry->pattern = window.pattern;
            }
            if (rest) {
                recycle(source);
            } else if (!core_seq_phrase_atomic(source, notes, count)) {
                return 0;
            }
            if (keep) {
                carry->handler = ev_seq_audio_phrase[i];
            }
            return 1;
        }
    }
    carries[track].handler = 0;
    return 0;
}
