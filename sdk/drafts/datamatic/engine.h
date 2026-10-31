/* SPDX-License-Identifier: GPL-3.0-or-later
 * DATAMATIC engine: data read as rhythm. A built-in bit stream (the binary digits of pi, e, the golden ratio or the
 * square root of two, the Fibonacci word, the primes, the Thue-Morse sequence, an elementary cellular automaton or an
 * LFSR) is read through a window that slides along it one stride a step; the window's value decides whether the step
 * plays, and the bits after it its note, velocity and micro-timing. The same settings always give the same line, so
 * a knob turn rewrites the track from them. Integers only, no library. Firmware-free. */
#ifndef DATAMATIC_ENGINE_H
#define DATAMATIC_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define DM_STEPS 64u
#define DM_NO_LOCK 255u
#define DM_TABLE_BITS 2048u
enum { DM_PI, DM_E, DM_PHI, DM_SQRT2, DM_FIBO, DM_PRIME, DM_THUE, DM_CA, DM_LFSR, DM_SOURCES };
enum { DM_OCT, DM_FIFTH, DM_TRITONE, DM_WHOLE, DM_CLUSTER, DM_INTERVALS };
#define DM_RULES 16u

typedef struct {
    uint8_t source; /* DM_PI .. DM_LFSR */
    uint8_t offset; /* 0-127: the window starts 8 x this bits into the stream (YES: the next) */
    uint8_t bits;   /* 1-8: the window's width */
    uint8_t dens;   /* 0-127: 0 plays a step whose window is all ones (with BITS 1: the stream itself), 127 every step */
    uint8_t spread; /* 0-4: octaves the notes may reach above the track's NOTE */
    uint8_t intv;   /* DM_OCT .. DM_CLUSTER: the intervals they jump by */
    uint8_t vdat;   /* 0-127: how far the data pulls velocity down from the track's VEL */
    uint8_t jitter; /* 0-23: micro-timing from the data, at most this many 1/24 of a step late */
    uint8_t rule;   /* 0-15: the automaton's rule (dm_rules) */
    uint8_t seed;   /* 0-127: the automaton's first row (0: one cell) and the LFSR's start */
    uint8_t stride; /* 1-8: bits the window moves a step (below BITS the windows overlap) */
} DmParams;
typedef struct { uint8_t trig, note, vel, micro; } DmStep;
typedef struct { DmStep steps[DM_STEPS]; uint8_t length; } DmLine;

extern const DmParams dm_defaults;
extern const char *const dm_source_names[DM_SOURCES];
extern const char *const dm_interval_names[DM_INTERVALS];
extern const uint8_t dm_rules[DM_RULES];
extern const uint8_t dm_tables[7][DM_TABLE_BITS / 8u];

/* Bit k of a source's stream (k below DM_TABLE_BITS for the tables; any k for CA and LFSR up to dm_stream_bits). */
#define DM_STREAM_BITS 2048u
typedef struct { uint8_t bits[DM_STREAM_BITS / 8u]; } DmStream;
int dm_stream(DmStream *out, const DmParams *p);
unsigned dm_bit(const DmStream *s, unsigned k);
/* The line for a track of `length` (1-64) steps, its notes above `base_note` and velocities below `base_vel`. */
int dm_generate(DmLine *out, const DmParams *p, unsigned length, unsigned base_note, unsigned base_vel);

/* The Octatrack's MIDI track record (0x8b0 bytes a track; LOGACID's and VECTOR 0.3.0's midi.c): five 64-bit masks at
 * +0 (0 trigs, 1 trigless marks, 2 lock-only steps, 3 swing, 4 slide), the length at +0x28, 32 lock bytes a step at
 * +0x30 (NOTE 0, VEL 1, LEN 2; 255 none), a two-byte trig word a step at +0x830 (micro-timing in bits 12-7). */
#define DM_TRACK_BYTES 0x8b0u
#define DM_LOCKS 0x30u
#define DM_TIMING 0x830u
int dm_track_empty(const uint8_t *record);
/* The line into the record in place, only the bytes that change, mirrored when `mirror` is not NULL: it owns the
 * trigs, the NOTE and VEL locks and the trig words of the steps inside the length; LEN and every other lock, swing
 * and steps past the length stay. `locked` gets whether each step keeps any lock. Returns the number of trigs. */
unsigned dm_write(uint8_t *record, uint8_t *mirror, const DmLine *line, uint8_t locked[DM_STEPS]);
#endif
