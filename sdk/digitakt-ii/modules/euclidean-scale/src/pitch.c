/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "pitch.h"
#include "../../../../machines/digitakt-ii/include/mk2/core.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/project-generation.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/seq-note.h"

volatile uint32_t euclidean_state[EUC_TRACK_SLOTS];
static uint32_t saved_state[EUC_TRACK_SLOTS];
static volatile uint32_t settings_project_generation[EUC_PATTERNS];

enum { LOW_SHIFT = 21, HIGH_SHIFT = 26, OCTAVE_MASK = 31, OCTAVE_ZERO = 11 };

int euclidean_octave_bound(uint32_t state, int upper)
{
    return (int)((state >> (upper ? HIGH_SHIFT : LOW_SHIFT)) & OCTAVE_MASK) - OCTAVE_ZERO;
}

uint32_t euclidean_turn_octave(uint32_t state, int upper, int32_t delta)
{
    const int low = state & EUC_RANGE ? euclidean_octave_bound(state, 0) : 0;
    const int high = state & EUC_RANGE ? euclidean_octave_bound(state, 1) : 0;
    const int min = upper ? low : EUC_MIN_OCTAVE;
    const int max = upper ? EUC_MAX_OCTAVE : high;
    const int current = upper ? high : low;
    const int next = delta < min - current ? min : delta > max - current ? max : current + delta;
    return (state & ~EUC_RANGE)
        | (uint32_t)((upper ? low : next) + OCTAVE_ZERO) << LOW_SHIFT
        | (uint32_t)((upper ? next : high) + OCTAVE_ZERO) << HIGH_SHIFT;
}

/* The core reads and writes serialized bytes. Publish whole words to playback. */
static void kit_loaded(int kit, int found)
{
    (void)found;
    const unsigned int first = (unsigned int)kit * EUC_TRACKS;
    for (unsigned int i = first; i < first + EUC_TRACKS; ++i) {
        const uint32_t state = saved_state[i];
        const int low = euclidean_octave_bound(state, 0);
        const int high = euclidean_octave_bound(state, 1);
        euclidean_state[i] = low < EUC_MIN_OCTAVE || high > EUC_MAX_OCTAVE || low > high
            ? state & ~EUC_RANGE : state;
    }
    settings_project_generation[kit] = core_project_kitdata_generation;
}

const core_kitdata_t euclidean_kitdata = {
    .tag = {'E', 'U', 'S', '2'},
    .size = EUC_TRACKS * sizeof(saved_state[0]),
    .data = saved_state,
    .changed = kit_loaded,
};

uint32_t euclidean_track_state(const volatile uint32_t *track)
{
    const unsigned int kit = (unsigned int)(track - euclidean_state) / EUC_TRACKS;
    const uint32_t generation = core_project_kitdata_generation;
    if (settings_project_generation[kit] != generation) {
        return 0;
    }
    const uint32_t state = *track;
    return core_project_kitdata_generation == generation ? state : 0;
}

void euclidean_set_track_state(volatile uint32_t *track, uint32_t state)
{
    const unsigned int slot = (unsigned int)(track - euclidean_state);
    if (settings_project_generation[slot / EUC_TRACKS] == core_project_kitdata_generation) {
        saved_state[slot] = state;
        *track = state;
    }
}

static int in_scale(const struct dt2_seq_note_context *note, unsigned int pitch)
{
    return (note->scale_mask >> ((pitch + 12u - note->root) % 12u)) & 1u;
}

static unsigned int nearest(const struct dt2_seq_note_context *note, unsigned int pitch)
{
    for (unsigned int distance = 0; distance < 12; ++distance) {
        if (pitch >= distance && in_scale(note, pitch - distance)) {
            return pitch - distance;
        }
        if (pitch + distance <= 127 && in_scale(note, pitch + distance)) {
            return pitch + distance;
        }
    }
    return pitch;
}

static uint32_t mix(uint32_t value)
{
    value ^= value >> 16;
    value *= UINT32_C(0x7feb352d);
    value ^= value >> 15;
    value *= UINT32_C(0x846ca68b);
    return value ^ (value >> 16);
}

static uint32_t reroll_random(const struct dt2_seq_note_context *note, uint32_t generation)
{
    const uint32_t key = ((uint32_t)note->pattern << 12) | ((uint32_t)note->track << 8) | note->step;
    return mix(key ^ (generation * UINT32_C(0x9e3779b9)));
}

static int32_t rerolled(const struct dt2_seq_note_context *note, unsigned int pitch, uint32_t generation)
{
    const unsigned int low = pitch >= 6 ? pitch - 6 : 0;
    const unsigned int high = pitch <= 121 ? pitch + 6 : 127;
    uint8_t choices[13];
    unsigned int count = 0;
    unsigned int nearest_index = 0;
    for (unsigned int candidate = low; candidate <= high; ++candidate) {
        if (in_scale(note, candidate)) {
            if (candidate == pitch) {
                nearest_index = count;
            }
            choices[count++] = (uint8_t)candidate;
        }
    }
    if (count < 2) {
        return (int32_t)pitch;
    }

    /* Alternate index parity so successive rerolls differ wherever there is a choice. */
    const unsigned int parity = (nearest_index + generation) & 1u;
    const unsigned int alternatives = (count + 1u - parity) / 2u;
    return choices[parity + 2u * (reroll_random(note, generation) % alternatives)];
}

static unsigned int root_octave(const struct dt2_seq_note_context *note, unsigned int pitch)
{
    /* Add five so an exact half-octave tie uses the lower root. */
    if (pitch + 5u < note->root) {
        return 0;
    }
    const unsigned int octave = (pitch + 5u - note->root) / 12u;
    const unsigned int last = (127u - note->root) / 12u;
    return octave < last ? octave : last;
}

static int bounded_octave(int octave, int last)
{
    return octave < 0 ? 0 : octave > last ? last : octave;
}

static int32_t ranged_reroll(const struct dt2_seq_note_context *note, unsigned int pitch,
                             uint32_t generation, int low, int high)
{
    const int anchor = (int)root_octave(note, pitch);
    const int last = (127 - note->root) / 12;
    const int first_octave = bounded_octave(anchor + low, last);
    const int last_octave = bounded_octave(anchor + high, last);
    const unsigned int first_pitch = note->root + 12u * (unsigned int)first_octave;
    uint8_t degrees[12];
    unsigned int scale_size = 0;
    for (unsigned int degree = 0; degree < 12; ++degree) {
        if (note->scale_mask & (1u << degree)) {
            degrees[scale_size++] = (uint8_t)degree;
        }
    }

    /* Whole octaves contribute every scale degree. The upper endpoint is a root. */
    const unsigned int count = (unsigned int)(last_octave - first_octave) * scale_size
                               + (note->scale_mask & 1u);
    if (!count) {
        return (int32_t)nearest(note, first_pitch);
    }
    const unsigned int parity = count > 1 ? generation & 1u : 0;
    const unsigned int alternatives = (count + 1u - parity) / 2u;
    const unsigned int index = parity + 2u * (reroll_random(note, generation) % alternatives);
    return (int32_t)(first_pitch + 12u * (index / scale_size) + degrees[index % scale_size]);
}

int32_t euclidean_pitch(const struct dt2_seq_note_context *note, uint32_t pitch)
{
    if (!(note->flags & DT2_SEQ_NOTE_EUCLIDEAN) || note->pattern >= EUC_PATTERNS || note->track >= EUC_TRACKS
        || note->root >= 12 || !(note->scale_mask & 0x0fffu) || pitch > 127) {
        return -1;
    }
    const uint32_t state = euclidean_track_state(&euclidean_state[note->pattern * EUC_TRACKS + note->track]);
    if (!(state & EUC_ENABLED)) {
        return -1;
    }

    const uint32_t generation = state & EUC_GENERATION;
    if (generation && (state & EUC_RANGE)) {
        return ranged_reroll(note, pitch, generation, euclidean_octave_bound(state, 0),
                             euclidean_octave_bound(state, 1));
    }
    const unsigned int quantized = nearest(note, pitch);
    return generation ? rerolled(note, quantized, generation) : (int32_t)quantized;
}
