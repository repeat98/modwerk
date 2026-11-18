/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef CHORD_ARP_H
#define CHORD_ARP_H

#include <stdint.h>

#define ARP_MAX_NOTES 72
#define ARP_MAX_OCTAVE 10
#define ARP_MAX_HITS 17
#define ARP_UNITS_PER_STEP 24

enum arp_order {
    ARP_UP, ARP_DOWN, ARP_UP_DOWN, ARP_DOWN_UP, ARP_DOUBLE,
    ARP_HIGH_LOW, ARP_LOW_HIGH, ARP_ZIGZAG_BOUNCE, ARP_PINKY, ARP_THUMB,
    ARP_RANDOM, ARP_SHUFFLE, ARP_INPUT_ORDER
};

enum arp_chord {
    ARP_MAJOR, ARP_MINOR, ARP_DIMINISHED, ARP_AUGMENTED, ARP_SUS2,
    ARP_SUS4, ARP_DOMINANT, ARP_HALF_DIMINISHED, ARP_DIMINISHED_SEVENTH,
    ARP_ALTERED, ARP_QUARTAL, ARP_CHORD_COUNT
};

struct arp_phrase {
    uint8_t notes[ARP_MAX_NOTES];
    uint8_t count;
    enum arp_order order;
    uint32_t seed;
};

struct arp_pitch_range {
    uint8_t first;
    uint8_t last;
};

struct arp_rhythm {
    uint8_t length;
    uint8_t pulses;
    int8_t rotation;
    uint8_t repeats;
};

struct arp_note_window {
    uint32_t onset;
    uint32_t release;
};

enum arp_groove {
    ARP_GROOVE_STRAIGHT, ARP_GROOVE_PUSH, ARP_GROOVE_LAID_BACK,
    ARP_GROOVE_OFFBEAT, ARP_GROOVE_COUNT
};

struct arp_subdivision {
    uint32_t index;
    uint32_t rhythm_origin;
    uint32_t note_position;
    uint32_t previous;
    uint32_t start;
    uint32_t end;
    uint32_t following;
    enum arp_groove groove;
    int8_t accent;
    uint8_t timing_depth;
    uint8_t gate_percent;
    uint8_t velocity;
    uint8_t use_note_position;
};

struct arp_hit {
    struct arp_note_window time;
    uint8_t pitch;
    uint8_t velocity;
};

struct arp_division_slice {
    uint32_t first_index;
    uint8_t first_offset;
    uint8_t count;
};

/* Convert signed octave bounds around the chord root to inclusive pitches. */
struct arp_pitch_range arp_octave_range(uint8_t root, int8_t low, int8_t high);
/* Extensions are root-relative 7th, 9th, 11th and 13th offsets.
 * Zero keeps the voicing's default for that extension. */
uint8_t arp_chord_notes(uint8_t root, enum arp_chord chord,
                       const uint8_t extensions[4], int8_t octaves,
                       uint8_t notes[ARP_MAX_NOTES]);
void arp_prepare(struct arp_phrase *phrase, const uint8_t *notes, uint8_t count,
                 struct arp_pitch_range range, enum arp_order order, uint32_t seed);
/* Position counts emitted arp pulses, supplied by the caller. -1 is silence. */
int arp_note_at(const struct arp_phrase *phrase, uint32_t position);

/* The caller supplies the stock-grid subdivision index. Repeat zero is the first hit. */
int arp_rhythm_position(struct arp_rhythm rhythm, uint32_t step, uint8_t repeat,
                        uint32_t *position);

/* Divide adjacent stock deadlines into non-overlapping gates in the same clock. */
int arp_gate_window(uint32_t start, uint32_t end, uint8_t repeats, uint8_t repeat,
                    uint8_t gate_percent, struct arp_note_window *note);

uint32_t arp_groove_onset(enum arp_groove groove, uint32_t step, uint8_t depth,
                          uint32_t previous, uint32_t current, uint32_t next);
uint8_t arp_groove_velocity(enum arp_groove groove, uint32_t step, int8_t accent,
                             uint8_t velocity);

/* Produce the notes for one subdivision of the stock grid. */
uint8_t arp_render_subdivision(const struct arp_phrase *phrase, struct arp_rhythm rhythm,
                                const struct arp_subdivision *subdivision,
                                struct arp_hit hits[ARP_MAX_HITS]);

/* Find the division onsets in a stock step. Period and offset are in 24ths of a step. */
struct arp_division_slice arp_division_at(uint32_t step, uint16_t period);
uint32_t arp_grid_tick(uint32_t start, uint32_t end, uint8_t offset);

#endif
