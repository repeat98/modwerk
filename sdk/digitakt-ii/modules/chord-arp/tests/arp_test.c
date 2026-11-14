/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <stddef.h>
#include "arp.h"

static const uint8_t input[] = {64, 60, 67, 70};
static const struct arp_pitch_range full_range = {0, 127};

static void check_order(enum arp_order order, const uint8_t *expected, size_t size)
{
    struct arp_phrase phrase;
    arp_prepare(&phrase, input, sizeof input, full_range, order, 123);
    for (size_t i = 0; i < size; ++i) {
        assert(arp_note_at(&phrase, (uint32_t)i) == expected[i]);
    }
}

#define CHECK(order, ...) do { \
    const uint8_t expected[] = {__VA_ARGS__}; \
    check_order(order, expected, sizeof expected); \
} while (0)

static void check_shuffle(void)
{
    struct arp_phrase phrase;
    arp_prepare(&phrase, input, sizeof input, full_range, ARP_SHUFFLE, 123);
    unsigned int seen = 0;
    for (uint32_t i = 0; i < sizeof input; ++i) {
        const int note = arp_note_at(&phrase, i);
        assert(note == arp_note_at(&phrase, i + sizeof input));
        unsigned int j = 0;
        while (j < sizeof input && note != input[j]) {
            ++j;
        }
        assert(j < sizeof input);
        assert(!(seen & (1u << j)));
        seen |= 1u << j;
    }
}

static void check_chords(void)
{
    uint8_t notes[ARP_MAX_NOTES];
    const uint8_t extended[] = {10, 14, 18, 21};
    const uint8_t expected[] = {60, 64, 67, 70, 74, 78, 81};
    assert(arp_chord_notes(60, ARP_DOMINANT, extended, 0, notes) == sizeof expected);
    for (size_t i = 0; i < sizeof expected; ++i) {
        assert(notes[i] == expected[i]);
    }

    const uint8_t plain[4] = {0};
    const uint8_t natural[] = {11, 14, 0, 0};
    assert(arp_chord_notes(60, ARP_ALTERED, natural, 0, notes) == 5);
    assert(notes[3] == 71 && notes[4] == 74);
    assert(arp_chord_notes(60, ARP_QUARTAL, plain, 0, notes) == 4);
    assert(notes[1] == 65 && notes[2] == 70 && notes[3] == 75);
    assert(arp_chord_notes(60, ARP_MAJOR, (const uint8_t[]){7, 0, 0, 0}, 0, notes) == 0);
    assert(arp_chord_notes(127, ARP_MAJOR, plain, 7, notes) == 1);
    assert(notes[0] == 127);
    assert(arp_chord_notes(12, ARP_MAJOR, plain, -7, notes) == 6);
    assert(notes[3] == 0 && notes[5] == 7);
    assert(arp_chord_notes(128, ARP_MAJOR, plain, 0, notes) == 0);
    assert(arp_chord_notes(60, ARP_CHORD_COUNT, plain, 0, notes) == 0);
    assert(arp_chord_notes(60, ARP_MAJOR, plain, 8, notes) == 0);
}

static void check_octave_limits(void)
{
    struct arp_phrase phrase;
    uint8_t notes[ARP_MAX_NOTES];
    const uint8_t extensions[] = {10, 14, 0, 0};
    const uint8_t count = arp_chord_notes(60, ARP_MAJOR, extensions, 2, notes);
    arp_prepare(&phrase, notes, count, arp_octave_range(60, 1, 2), ARP_UP, 0);
    assert(phrase.count == 6);
    assert(arp_note_at(&phrase, 0) == 72);
    assert(arp_note_at(&phrase, 1) == 74);
    assert(arp_note_at(&phrase, 4) == 82);
    assert(arp_note_at(&phrase, 5) == 84);
    assert(arp_note_at(&phrase, 6) == 72);

    arp_prepare(&phrase, notes, count, arp_octave_range(60, -2, -1), ARP_UP, 0);
    assert(arp_note_at(&phrase, 0) == -1);
    arp_prepare(&phrase, notes, count, arp_octave_range(60, 2, 1), ARP_UP, 0);
    assert(arp_note_at(&phrase, 0) == -1);

    struct arp_pitch_range range = arp_octave_range(61, -1, 2);
    assert(range.first == 49 && range.last == 85);
    range = arp_octave_range(5, -10, 10);
    assert(range.first == 5 && range.last == 125);
    range = arp_octave_range(127, 0, 10);
    assert(range.first == 127 && range.last == 127);
    const uint8_t extremes[] = {119, 120, 127, 128};
    arp_prepare(&phrase, extremes, sizeof extremes,
                range, ARP_DOWN, 0);
    assert(phrase.count == 1 && arp_note_at(&phrase, 0) == 127);
}

static void check_rhythm(void)
{
    const struct arp_rhythm rhythm = {8, 3, 1, 2};
    const uint8_t steps[] = {1, 3, 6, 9, 11, 14};
    uint32_t position = 0;
    unsigned int hit = 0;
    for (uint32_t step = 0; step < 16; ++step) {
        if (hit < sizeof steps && step == steps[hit]) {
            for (uint8_t repeat = 0; repeat <= rhythm.repeats; ++repeat) {
                assert(arp_rhythm_position(rhythm, step, repeat, &position));
                assert(position == 3 * hit + repeat);
            }
            ++hit;
        } else {
            assert(!arp_rhythm_position(rhythm, step, 0, &position));
        }
    }
    assert(hit == sizeof steps);

    for (uint8_t length = 1; length <= 32; ++length) {
        for (uint8_t pulses = 1; pulses <= length; ++pulses) {
            for (int rotation = -length; rotation <= length; ++rotation) {
                const struct arp_rhythm rotated = {length, pulses, (int8_t)rotation, 0};
                hit = 0;
                for (uint32_t step = 0; step < 2u * length; ++step) {
                    if (arp_rhythm_position(rotated, step, 0, &position)) {
                        assert(position == hit++);
                    }
                }
                assert(hit == 2u * pulses);
            }
        }
    }
    assert(!arp_rhythm_position(rhythm, 1, 3, &position));
    assert(!arp_rhythm_position((struct arp_rhythm){0, 1, 0, 0}, 0, 0, &position));
    assert(!arp_rhythm_position((struct arp_rhythm){8, 0, 0, 0}, 0, 0, &position));
}

static void check_gate_windows(void)
{
    struct arp_note_window note;
    const uint32_t start = UINT32_MAX - 4;
    const uint32_t end = start + 14;
    const uint32_t offsets[] = {0, 4, 9, 14};
    for (uint8_t repeat = 0; repeat < 3; ++repeat) {
        assert(arp_gate_window(start, end, 2, repeat, 100, &note));
        assert(note.onset == start + offsets[repeat]);
        assert(note.release == start + offsets[repeat + 1]);
    }
    assert(arp_gate_window(100, 160, 1, 1, 50, &note));
    assert(note.onset == 130 && note.release == 145);
    assert(arp_gate_window(10, 11, 0, 0, 2, &note));
    assert(note.onset == 10 && note.release == 11);
    assert(!arp_gate_window(10, 11, 1, 0, 100, &note));
    assert(!arp_gate_window(10, 9, 0, 0, 100, &note));
    assert(!arp_gate_window(10, 90, 0, 1, 100, &note));
    assert(!arp_gate_window(10, 90, 0, 0, 101, &note));
}

static void check_groove(void)
{
    assert(arp_groove_onset(ARP_GROOVE_PUSH, 1, 100, 1000, 1800, 3000) == 1704);
    assert(arp_groove_onset(ARP_GROOVE_LAID_BACK, 1, 50, 1000, 1800, 3000) == 1864);
    assert(arp_groove_onset(ARP_GROOVE_PUSH, 1, 0, 1000, 1800, 3000) == 1800);
    assert(arp_groove_onset(ARP_GROOVE_PUSH, 1, 100, 100, 100, 120) == 100);
    assert(arp_groove_onset(ARP_GROOVE_LAID_BACK, 1, 100,
                            UINT32_MAX - 700, UINT32_MAX - 100, 799) == UINT32_MAX - 4);
    for (enum arp_groove groove = ARP_GROOVE_STRAIGHT; groove < ARP_GROOVE_COUNT; ++groove) {
        const uint32_t deadlines[] = {0, 500, 2000, 2500, 4000, 4500, 6000};
        uint32_t last = 0;
        for (uint32_t i = 1; i < sizeof deadlines / sizeof deadlines[0] - 1; ++i) {
            const uint32_t onset = arp_groove_onset(groove, i, 100,
                deadlines[i - 1], deadlines[i], deadlines[i + 1]);
            assert(onset > last);
            last = onset;
        }
    }
    assert(arp_groove_velocity(ARP_GROOVE_PUSH, 0, 100, 100) == 127);
    assert(arp_groove_velocity(ARP_GROOVE_PUSH, 0, -100, 100) == 60);
    assert(arp_groove_velocity(ARP_GROOVE_PUSH, 0, 0, 100) == 100);
    assert(arp_groove_velocity(ARP_GROOVE_PUSH, 0, 100, 0) == 0);
}

static void check_render(void)
{
    struct arp_phrase phrase;
    arp_prepare(&phrase, input, sizeof input, full_range, ARP_DOWN_UP, 0);
    const struct arp_rhythm rhythm = {8, 3, 1, 2};
    struct arp_subdivision subdivision = {
        .index = 1, .previous = 1000, .start = 1800, .end = 3000, .following = 3800,
        .groove = ARP_GROOVE_PUSH, .accent = 100, .timing_depth = 100,
        .gate_percent = 50, .velocity = 100,
    };
    struct arp_hit hits[ARP_MAX_HITS];
    assert(arp_render_subdivision(&phrase, rhythm, &subdivision, hits) == 3);
    assert(hits[0].pitch == 70 && hits[1].pitch == 67 && hits[2].pitch == 64);
    assert(hits[0].velocity == 80 && hits[0].time.onset == 1704);
    for (unsigned int i = 0; i < 2; ++i) {
        assert(hits[i].time.release < hits[i + 1].time.onset);
    }
    assert(hits[2].time.release < 2968);
    subdivision.index = 2;
    assert(arp_render_subdivision(&phrase, rhythm, &subdivision, hits) == 0);
    subdivision.index = 1;
    subdivision.velocity = 0;
    assert(arp_render_subdivision(&phrase, rhythm, &subdivision, hits) == 0);
}

static void check_divisions(void)
{
    const uint16_t periods[] = {4, 6, 9, 12, 16, 24, 36, 48, 64, 96, 384};
    for (unsigned int i = 0; i < sizeof periods / sizeof periods[0]; ++i) {
        const uint16_t period = periods[i];
        uint32_t expected = 0;
        for (uint32_t step = 0; step < 128; ++step) {
            const struct arp_division_slice slice = arp_division_at(step, period);
            const uint32_t start = step * ARP_UNITS_PER_STEP;
            const uint32_t end = start + ARP_UNITS_PER_STEP;
            uint8_t count = 0;
            while (expected * period < end) {
                assert(expected * period >= start);
                if (!count) {
                    assert(slice.first_index == expected);
                    assert(slice.first_offset == expected * period - start);
                }
                ++count;
                ++expected;
            }
            assert(slice.count == count);
        }
    }
    assert(arp_division_at(0, 0).count == 0);
    const struct arp_division_slice wrap = arp_division_at(UINT32_MAX, 12);
    assert(wrap.first_index == UINT32_MAX - 1 && wrap.count == 2);
    assert(arp_grid_tick(1000, 2500, 12) == 1750);
    assert(arp_grid_tick(2500, 3000, 12) == 2750);
    assert(arp_grid_tick(UINT32_MAX - 5, 4, 18) == 1);
    assert(arp_grid_tick(3000, 2500, 12) == 3000);
}

int main(void)
{
    CHECK(ARP_UP, 60, 64, 67, 70, 60);
    CHECK(ARP_DOWN, 70, 67, 64, 60, 70);
    CHECK(ARP_UP_DOWN, 60, 64, 67, 70, 67, 64, 60, 64);
    CHECK(ARP_DOWN_UP, 70, 67, 64, 60, 64, 67, 70, 67);
    CHECK(ARP_DOUBLE, 60, 60, 64, 64, 67, 67, 70, 70, 67, 67);
    CHECK(ARP_HIGH_LOW, 70, 60, 67, 64, 70);
    CHECK(ARP_LOW_HIGH, 60, 70, 64, 67, 60);
    CHECK(ARP_ZIGZAG_BOUNCE, 60, 70, 64, 67, 64, 70, 60);
    CHECK(ARP_PINKY, 60, 70, 64, 70, 67, 70, 60);
    CHECK(ARP_THUMB, 60, 64, 60, 67, 60, 70, 60);
    CHECK(ARP_INPUT_ORDER, 64, 60, 67, 70, 64);
    check_shuffle();
    check_chords();
    check_octave_limits();
    check_rhythm();
    check_gate_windows();
    check_groove();
    check_render();
    check_divisions();

    struct arp_phrase phrase;
    arp_prepare(&phrase, input, 0, full_range, ARP_DOWN_UP, 0);
    assert(arp_note_at(&phrase, 0) == -1);
    arp_prepare(&phrase, input, 1, full_range, ARP_DOWN_UP, 0);
    assert(arp_note_at(&phrase, UINT32_MAX) == input[0]);
    arp_prepare(&phrase, input, 2, full_range, ARP_DOWN_UP, 0);
    assert(arp_note_at(&phrase, 0) == 64 && arp_note_at(&phrase, 1) == 60);
    arp_prepare(&phrase, input, sizeof input, full_range, ARP_RANDOM, 123);
    for (uint32_t i = 0; i < 100; ++i) {
        const int note = arp_note_at(&phrase, i);
        assert(note == 60 || note == 64 || note == 67 || note == 70);
        assert(note == arp_note_at(&phrase, i));
    }
    return 0;
}
