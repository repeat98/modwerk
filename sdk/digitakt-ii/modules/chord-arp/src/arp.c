/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "arp.h"

static const uint8_t voicings[ARP_CHORD_COUNT][4] = {
    [ARP_MAJOR] = {4, 7}, [ARP_MINOR] = {3, 7},
    [ARP_DIMINISHED] = {3, 6}, [ARP_AUGMENTED] = {4, 8},
    [ARP_SUS2] = {2, 7}, [ARP_SUS4] = {5, 7},
    [ARP_DOMINANT] = {4, 7, 10}, [ARP_HALF_DIMINISHED] = {3, 6, 10},
    [ARP_DIMINISHED_SEVENTH] = {3, 6, 9},
    [ARP_ALTERED] = {4, 8, 10, 13}, [ARP_QUARTAL] = {5, 0, 10, 15},
};

static const uint8_t extension_limits[4][2] = {{9, 11}, {13, 15}, {17, 18}, {20, 22}};

static uint8_t root_at_octave(uint8_t root, int offset)
{
    const int pitch_class = root % 12;
    const int last_octave = (127 - pitch_class) / 12;
    int octave = root / 12 + offset;
    if (octave < 0) {
        octave = 0;
    } else if (octave > last_octave) {
        octave = last_octave;
    }
    return (uint8_t)(pitch_class + 12 * octave);
}

struct arp_pitch_range arp_octave_range(uint8_t root, int8_t low, int8_t high)
{
    if (root > 127 || low < -ARP_MAX_OCTAVE || high > ARP_MAX_OCTAVE || low > high) {
        return (struct arp_pitch_range){1, 0};
    }
    return (struct arp_pitch_range){root_at_octave(root, low), root_at_octave(root, high)};
}

uint8_t arp_chord_notes(uint8_t root, enum arp_chord chord,
                       const uint8_t extensions[4], int8_t octaves,
                       uint8_t notes[ARP_MAX_NOTES])
{
    if (root > 127 || (unsigned int)chord >= ARP_CHORD_COUNT ||
        octaves < -7 || octaves > 7) {
        return 0;
    }

    uint8_t intervals[7] = {0};
    unsigned int size = 1;
    const uint8_t *voicing = voicings[chord];
    for (unsigned int i = 0; i < 2; ++i) {
        if (voicing[i]) {
            intervals[size++] = voicing[i];
        }
    }
    for (unsigned int i = 0; i < 4; ++i) {
        uint8_t interval = extensions[i];
        if (interval && (interval < extension_limits[i][0] || interval > extension_limits[i][1])) {
            return 0;
        }
        if (!interval && i < 2) {
            interval = voicing[2 + i];
        }
        if (interval) {
            intervals[size++] = interval;
        }
    }

    uint8_t count = 0;
    uint8_t seen[16] = {0};
    const int direction = octaves < 0 ? -1 : 1;
    for (int octave = 0; octave != octaves + direction; octave += direction) {
        for (unsigned int i = 0; i < size; ++i) {
            const int pitch = root + 12 * octave + intervals[i];
            if (pitch < 0 || pitch > 127) {
                continue;
            }
            const unsigned int bit = 1u << (pitch % 8);
            if (seen[pitch / 8] & bit) {
                continue;
            }
            seen[pitch / 8] |= (uint8_t)bit;
            notes[count++] = (uint8_t)pitch;
            if (count == ARP_MAX_NOTES) {
                return count;
            }
        }
    }
    return count;
}

static uint32_t mix(uint32_t value)
{
    value ^= value >> 16;
    value *= 0x7feb352du;
    value ^= value >> 15;
    value *= 0x846ca68bu;
    return value ^ (value >> 16);
}

void arp_prepare(struct arp_phrase *phrase, const uint8_t *notes, uint8_t count,
                 struct arp_pitch_range range, enum arp_order order, uint32_t seed)
{
    phrase->count = 0;
    phrase->order = order;
    phrase->seed = seed;
    for (unsigned int i = 0; i < count && phrase->count < ARP_MAX_NOTES; ++i) {
        const uint8_t note = notes[i];
        if (note < range.first || note > range.last || note > 127) {
            continue;
        }
        unsigned int j = phrase->count++;
        if (order != ARP_INPUT_ORDER) {
            while (j > 0 && phrase->notes[j - 1] > note) {
                phrase->notes[j] = phrase->notes[j - 1];
                --j;
            }
        }
        phrase->notes[j] = note;
    }
    if (order == ARP_SHUFFLE) {
        for (unsigned int i = phrase->count; i > 1; --i) {
            const unsigned int j = mix(seed + i) % i;
            const uint8_t last = phrase->notes[i - 1];
            phrase->notes[i - 1] = phrase->notes[j];
            phrase->notes[j] = last;
        }
    }
}

static unsigned int bounce(uint32_t position, unsigned int last)
{
    const unsigned int phase = position % (2 * last);
    return phase <= last ? phase : 2 * last - phase;
}

static unsigned int outside_in(unsigned int phase, unsigned int last)
{
    return phase % 2 ? last - phase / 2 : phase / 2;
}

int arp_note_at(const struct arp_phrase *phrase, uint32_t position)
{
    const unsigned int count = phrase->count;
    if (!count) {
        return -1;
    }
    if (count == 1) {
        return phrase->notes[0];
    }

    const unsigned int last = count - 1;
    const unsigned int phase = position % count;
    unsigned int index = phase;
    switch (phrase->order) {
    case ARP_DOWN: index = last - phase; break;
    case ARP_UP_DOWN: index = bounce(position, last); break;
    case ARP_DOWN_UP: index = last - bounce(position, last); break;
    case ARP_DOUBLE: index = bounce(position / 2, last); break;
    case ARP_HIGH_LOW: index = last - outside_in(phase, last); break;
    case ARP_LOW_HIGH: index = outside_in(phase, last); break;
    case ARP_ZIGZAG_BOUNCE: index = outside_in(bounce(position, last), last); break;
    case ARP_PINKY: index = position % 2 ? last : (position / 2) % last; break;
    case ARP_THUMB: index = position % 2 ? 1 + (position / 2) % last : 0; break;
    case ARP_RANDOM: index = mix(phrase->seed + position) % count; break;
    default: break;
    }
    return phrase->notes[index];
}

static unsigned int pulses_before(unsigned int step, struct arp_rhythm rhythm)
{
    return (step * rhythm.pulses + rhythm.length - 1u) / rhythm.length;
}

int arp_rhythm_position(struct arp_rhythm rhythm, uint32_t step, uint8_t repeat,
                        uint32_t *position)
{
    const int length = rhythm.length;
    if (!length || length > 32 || !rhythm.pulses || rhythm.pulses > length ||
        rhythm.repeats > 16 || repeat > rhythm.repeats) {
        return 0;
    }

    const unsigned int origin = (length - rhythm.rotation % length) % length;
    const unsigned int offset = origin + step % rhythm.length;
    const unsigned int phase = offset % rhythm.length;
    const unsigned int before = pulses_before(phase, rhythm);
    if (before == pulses_before(phase + 1u, rhythm)) {
        return 0;
    }

    const unsigned int in_cycle = before + (offset >= rhythm.length ? rhythm.pulses : 0)
                                  - pulses_before(origin, rhythm);
    const uint32_t hits = (step / rhythm.length) * rhythm.pulses + in_cycle;
    *position = hits * (rhythm.repeats + 1u) + repeat;
    return 1;
}

static uint32_t fraction(uint32_t value, unsigned int numerator, unsigned int denominator)
{
    return value / denominator * numerator + value % denominator * numerator / denominator;
}

int arp_gate_window(uint32_t start, uint32_t end, uint8_t repeats, uint8_t repeat,
                    uint8_t gate_percent, struct arp_note_window *note)
{
    const unsigned int slots = repeats + 1u;
    const uint32_t span = end - start;
    if (repeats > 16 || repeat > repeats || gate_percent < 2 || gate_percent > 100 ||
        span < slots || span > INT32_MAX) {
        return 0;
    }
    const uint32_t first = fraction(span, repeat, slots);
    const uint32_t next = fraction(span, repeat + 1u, slots);
    const uint32_t duration = fraction(next - first, gate_percent, 100);
    note->onset = start + first;
    note->release = note->onset + (duration ? duration : 1);
    return 1;
}

struct groove_point {
    int8_t timing;
    int8_t accent;
};

/* Timing is a percentage of the shorter neighbouring interval. */
static const struct groove_point grooves[ARP_GROOVE_COUNT][4] = {
    [ARP_GROOVE_STRAIGHT] = {{0, 0}},
    [ARP_GROOVE_PUSH] = {{0, 40}, {-12, -20}, {-4, 18}, {-16, -28}},
    [ARP_GROOVE_LAID_BACK] = {{0, 30}, {16, -30}, {6, 14}, {12, -18}},
    [ARP_GROOVE_OFFBEAT] = {{0, -15}, {9, 42}, {-8, -24}, {4, 30}},
};

uint32_t arp_groove_onset(enum arp_groove groove, uint32_t step, uint8_t depth,
                          uint32_t previous, uint32_t current, uint32_t next)
{
    const uint32_t before = current - previous;
    const uint32_t after = next - current;
    if ((unsigned int)groove >= ARP_GROOVE_COUNT || depth > 100 ||
        !before || !after || before > INT32_MAX || after > INT32_MAX) {
        return current;
    }

    const unsigned int span = before < after ? before : after;
    const int timing = grooves[groove][step % 4].timing;
    const unsigned int magnitude = timing < 0 ? -timing : timing;
    const uint32_t offset = fraction(span, magnitude * depth, 10000);
    return timing < 0 ? current - offset : current + offset;
}

uint8_t arp_groove_velocity(enum arp_groove groove, uint32_t step, int8_t accent,
                             uint8_t velocity)
{
    if (!velocity) {
        return 0;
    }
    int result = velocity;
    if ((unsigned int)groove < ARP_GROOVE_COUNT && accent >= -100 && accent <= 100) {
        result += velocity * grooves[groove][step % 4].accent * accent / 10000;
    }
    return result < 1 ? 1 : result > 127 ? 127 : (uint8_t)result;
}

uint8_t arp_render_subdivision(const struct arp_phrase *phrase, struct arp_rhythm rhythm,
                                const struct arp_subdivision *subdivision,
                                struct arp_hit hits[ARP_MAX_HITS])
{
    uint32_t position;
    const uint32_t index = subdivision->index - subdivision->rhythm_origin;
    if (!phrase->count || !subdivision->velocity ||
        !arp_rhythm_position(rhythm, index, 0, &position)) {
        return 0;
    }

    if (subdivision->use_note_position) {
        position = subdivision->note_position;
    }
    const uint32_t start = arp_groove_onset(subdivision->groove, index,
        subdivision->timing_depth, subdivision->previous, subdivision->start, subdivision->end);
    const uint32_t end = arp_groove_onset(subdivision->groove, index + 1u,
        subdivision->timing_depth, subdivision->start, subdivision->end, subdivision->following);
    const uint8_t velocity = arp_groove_velocity(subdivision->groove, index,
        subdivision->accent, subdivision->velocity);

    for (uint8_t repeat = 0; repeat <= rhythm.repeats; ++repeat) {
        struct arp_note_window note;
        if (!arp_gate_window(start, end, rhythm.repeats, repeat, subdivision->gate_percent, &note)) {
            return 0;
        }
        hits[repeat] = (struct arp_hit){note, (uint8_t)arp_note_at(phrase, position + repeat), velocity};
    }
    return rhythm.repeats + 1;
}

struct arp_division_slice arp_division_at(uint32_t step, uint16_t period)
{
    struct arp_division_slice slice = {0};
    if (!period) {
        return slice;
    }

    const uint32_t remainder = step % period * ARP_UNITS_PER_STEP;
    const unsigned int phase = remainder % period;
    const unsigned int offset = phase ? period - phase : 0;
    if (offset < ARP_UNITS_PER_STEP) {
        slice.first_index = step / period * ARP_UNITS_PER_STEP
            + (remainder + period - 1u) / period;
        slice.first_offset = (uint8_t)offset;
        slice.count = (uint8_t)(1 + (ARP_UNITS_PER_STEP - 1u - offset) / period);
    }
    return slice;
}

uint32_t arp_grid_tick(uint32_t start, uint32_t end, uint8_t offset)
{
    const uint32_t span = end - start;
    if (offset > ARP_UNITS_PER_STEP || span > INT32_MAX) {
        return start;
    }
    return start + fraction(span, offset, ARP_UNITS_PER_STEP);
}
