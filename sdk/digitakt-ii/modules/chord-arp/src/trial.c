/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Local trial adapter for the draft Digitakt II base collection. */
#include "arp.h"
#include "locks.h"
#include "panel.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/project-generation.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/seq-phrase.h"
#include "../../../../machines/digitakt-ii/include/mk2/core.h"

static const uint16_t periods[] = {
    384, 288, 192, 128, 144, 96, 64, 72, 48, 32, 36, 24, 16, 18, 12, 8, 9, 6, 4,
};

struct playback {
    uint32_t epoch;
    uint32_t generation;
    uint32_t cycle;
    uint32_t rhythm_origin;
    uint32_t note_position;
    uint16_t pattern;
    uint8_t step;
    uint8_t length;
    uint8_t source_step;
    uint8_t division;
    uint8_t valid;
    uint8_t had_lock;
};

static struct playback playback[AUDIO_TRACKS];
static struct chord_arp_settings carried_locks[AUDIO_TRACKS];

int chord_arp_trial_repeat_max(int division)
{
    const unsigned int period = periods[division];
    const unsigned int slots = (ARP_UNITS_PER_STEP + period - 1) / period;
    return DT2_SEQ_PHRASE_MAX_NOTES / slots - 1;
}

static uint32_t grid_tick(const struct dt2_seq_grid_window *window, int offset)
{
    const int32_t unit = window->pulses_per_step * (900000 / ARP_UNITS_PER_STEP);
    return window->onset + (uint32_t)(offset * unit);
}

static uint32_t scale_deadline(uint32_t offset, uint32_t ratio)
{
    return offset / 256u * ratio + offset % 256u * ratio / 256u;
}

uint32_t chord_arp_panel_phrase(const struct dt2_seq_grid_window *window, uint32_t root,
                                uint32_t velocity, struct dt2_seq_phrase_note *notes)
{
    if (window->track >= AUDIO_TRACKS || chord_arp_project_generation != core_project_generation) {
        return 0;
    }
    const volatile struct chord_arp_settings *settings = &chord_arp_tracks[window->track];
    struct playback *const state = &playback[window->track];
    if (!settings->values[ARP][6]) {
        state->valid = 0;
        return 0;
    }
    const unsigned int reset = settings->values[GROOVE][3];
    const int latch = settings->values[GROOVE][4];
    const int span_enabled = settings->values[GROOVE][5];
    const int empty = window->flags & DT2_SEQ_GRID_EMPTY;
    const int new_run = !state->valid || state->epoch != window->transport_epoch ||
        state->generation != chord_arp_project_generation || state->pattern != window->pattern ||
        (window->flags & DT2_SEQ_GRID_PLAY_SOURCE);
    const int wrapped = !new_run && window->step <= state->step;
    if (empty && (new_run || (!latch && (!span_enabled || wrapped)) ||
                  (wrapped && !chord_arp_note_trig(window->pattern, window->track, state->source_step)))) {
        state->valid = 0;
        return 0;
    }
    if (new_run || (wrapped && !latch)) {
        *state = (struct playback){
            .epoch = window->transport_epoch, .generation = chord_arp_project_generation,
            .pattern = window->pattern, .valid = 1,
        };
    } else if (wrapped) {
        state->cycle += state->length;
    }
    state->step = window->step;
    state->length = window->length;
    if (!empty) {
        state->source_step = window->step;
        if (reset & 1u) {
            state->note_position = 0;
        }
    }
    struct chord_arp_settings locked;
    const uint32_t mask = chord_arp_lock_read(window->pattern, window->track, state->source_step, &locked);
    if (mask) {
        settings = &locked;
    }
    if (!empty) {
        state->had_lock = mask != 0;
        if (mask) {
            fw_memcpy(&carried_locks[window->track], &locked, sizeof locked);
        }
    } else if (state->had_lock && !chord_arp_note_trig(window->pattern, window->track, state->source_step)) {
        settings = &carried_locks[window->track];
    }
    const volatile int8_t (*const values)[8] = settings->values;
    if (values[CHORD][5] >= 0) {
        root = (uint8_t)values[CHORD][5];
    }

    uint8_t extensions[4];
    chord_arp_intervals(values[CHORD], extensions);
    uint8_t tones[ARP_MAX_NOTES];
    const uint8_t count = arp_chord_notes((uint8_t)root, values[CHORD][0], extensions,
                                          values[ARP][1], tones);
    const struct arp_pitch_range range = settings->manual_range
        ? arp_octave_range((uint8_t)root, values[ARP][2], values[ARP][3])
        : (struct arp_pitch_range){0, 127};
    struct arp_phrase phrase;
    arp_prepare(&phrase, tones, count, range, values[ARP][0], window->pattern);
    const uint8_t division = (uint8_t)values[ARP][5];
    const uint16_t period = periods[division];
    const uint8_t length = (uint8_t)values[RHYTHM][0];
    const uint8_t pulses = (uint8_t)values[RHYTHM][1];
    const int repeat_limit = chord_arp_trial_repeat_max(division);
    const int repeats = values[RHYTHM][3];
    const struct arp_rhythm rhythm = {
        length, pulses < length ? pulses : length, values[RHYTHM][2],
        (uint8_t)(repeats < repeat_limit ? repeats : repeat_limit),
    };
    const uint32_t step = state->cycle + window->step;
    const struct arp_division_slice slice = arp_division_at(step, period);
    if (state->division != division || !(reset & 2u)) {
        state->rhythm_origin = 0;
    }
    state->division = division;
    if (!empty && (reset & 2u)) {
        state->rhythm_origin = (step * ARP_UNITS_PER_STEP + period - 1u) / period;
    }
    const uint32_t available = window->next - window->onset;
    const uint32_t span = window->pulses_per_step * UINT32_C(900000);
    struct arp_hit hits[ARP_MAX_HITS];
    uint32_t produced = 0;
    for (uint8_t i = 0; i < slice.count; ++i) {
        const int offset = slice.first_offset + i * period;
        const int slow = period > ARP_UNITS_PER_STEP;
        const struct arp_subdivision subdivision = {
            .index = slice.first_index + i,
            .rhythm_origin = state->rhythm_origin,
            .note_position = state->note_position, .use_note_position = reset != 0,
            .previous = grid_tick(window, slow ? -ARP_UNITS_PER_STEP : offset - period),
            .start = grid_tick(window, offset),
            .end = grid_tick(window, slow ? ARP_UNITS_PER_STEP : offset + period),
            .following = grid_tick(window, slow ? 2 * ARP_UNITS_PER_STEP : offset + 2 * period),
            .groove = values[GROOVE][0], .accent = values[GROOVE][2],
            .timing_depth = (uint8_t)values[GROOVE][1],
            .gate_percent = (uint8_t)values[ARP][4], .velocity = (uint8_t)velocity,
        };
        const uint8_t rendered = arp_render_subdivision(&phrase, rhythm, &subdivision, hits);
        for (unsigned int n = 0; n < rendered; ++n) {
            const int32_t on = (int32_t)(hits[n].time.onset - window->onset);
            const int32_t off = (int32_t)(hits[n].time.release - window->onset);
            const uint32_t onset = on < 0 ? 0 : (uint32_t)on;
            const uint32_t release = off > (int32_t)span ? span : (uint32_t)off;
            if (off > 0 && onset < release) {
                notes[produced++] = (struct dt2_seq_phrase_note){
                    window->onset + onset, window->onset + release, hits[n].pitch, hits[n].velocity,
                };
                ++state->note_position;
            }
        }
    }
    if (produced) {
        const uint32_t end = notes[produced - 1].release - window->onset;
        if (end > available) {
            /* One ratio for the whole phrase. Preserve its repeat count and
             * keep the release before a following swung or early stock trig. */
            const uint32_t ratio = available / (end / 256u + 1u);
            if (!ratio) {
                produced = 0;
            }
            for (unsigned int i = 0; i < produced; ++i) {
                notes[i].onset = window->onset + scale_deadline(notes[i].onset - window->onset, ratio);
                notes[i].release = window->onset + scale_deadline(notes[i].release - window->onset, ratio);
            }
        }
    }
    if (!empty && (latch || span_enabled)) {
        return DT2_SEQ_PHRASE_CARRY | produced;
    }
    return produced ? produced : DT2_SEQ_PHRASE_REST;
}
