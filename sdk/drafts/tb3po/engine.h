/* SPDX-License-Identifier: GPL-3.0-or-later
 * TB-3PO pattern engine: the generative 303-style acid line of the Phazerville Hemisphere Suite TB_3PO applet
 * (djphazer and contributors, GPL-3.0), as Charles Vestal's Schwung port tb3po.c (charlesvestal/schwung-tb3po,
 * f49d81d05d1e29ae37728a08e30f193892be3bc9) runs it, in integers for the Octatrack's ColdFire: no float, no library,
 * no firmware. The pattern is a function of the controls and the seed, so the same values always give the same line
 * and a knob turn rewrites the track from them. */
#ifndef TB3PO_ENGINE_H
#define TB3PO_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define TB3PO_STEPS 64u
#define TB3PO_MAX_MOTIF 32u
#define TB3PO_SCALES 6u
#define TB3PO_NO_LOCK 255u

enum { TB3PO_REST = 0, TB3PO_NOTE = 1, TB3PO_ACCENT = 2, TB3PO_SLIDE = 3 };
enum { TB3PO_FWD = 0, TB3PO_REV = 1, TB3PO_PING = 2, TB3PO_RND = 3 };

/* The generator's own controls, each 0-127 as the track's arp note bytes keep them (value - 64). OCT, ROOT, GATE and
 * VEL are the track's own NOTE, LEN and VEL and are not here. */
typedef struct {
    uint8_t density;  /* 0-127: the chance a step plays (tb3po.c density 0.0-1.0) */
    uint8_t accent;   /* 0-127: the chance a note is accented */
    uint8_t slide;    /* 0-127: the chance a note slides into the next */
    uint8_t scale;    /* 0-5: Minor, Phrygian, HarmMinor, MinPent, Dorian, Major */
    uint8_t seed;     /* 0-127: the variation; YES advances it */
    uint8_t var;      /* 0-127: 0 the seed's line; else a mutation pass, as tb3po.c's MUT, salted with it */
    uint8_t octs;     /* 1-3: octave range above the root */
    uint8_t dir;      /* 0-3: FWD, REV, PING, RND: the order the generated steps are laid on the track */
    uint8_t motif;    /* 0 the whole track; 2-32 a motif of that many steps repeated along it */
} Tb3poParams;
typedef struct {
    uint8_t kind;     /* TB3PO_REST .. TB3PO_SLIDE */
    uint8_t degree;   /* index into the scale */
    uint8_t octave;   /* 0 .. octs - 1 */
} Tb3poStep;
typedef struct {
    Tb3poStep steps[TB3PO_STEPS];
    uint8_t length;
} Tb3poPattern;

extern const Tb3poParams tb3po_defaults;
extern const char *const tb3po_scale_names[TB3PO_SCALES];
extern const uint8_t tb3po_scale_degrees[TB3PO_SCALES][7];
extern const uint8_t tb3po_scale_length[TB3PO_SCALES];

/* The line for a track of `length` steps (1-64) from the controls. 0 on a bad argument. */
int tb3po_generate(Tb3poPattern *out, const Tb3poParams *p, unsigned length);
/* The next seed after YES: a different line, never the same one twice in a row. */
unsigned tb3po_next_seed(unsigned seed);
/* The MIDI note of a step: the track's NOTE (the root in its octave), the degree's semitones and the step's octave. */
unsigned tb3po_note(const Tb3poParams *p, const Tb3poStep *s, unsigned base_note);

/* The Octatrack's MIDI track record (0x8b0 bytes a track, 16 a pattern): five 64-bit step masks at +0 (0 trigs,
 * 1 trigless/one-shot marks, 2 lock-only steps, 3 swing, 4 slide), the track's own length at +0x28, 32 lock bytes a
 * step at +0x30 (NOTE 0, VEL 1, LEN 2; 255 no lock), and a two-byte trig word a step at +0x830 (micro-timing in bits
 * 12-7, condition in 6-0). octabam docs/firmware/STEP_LOCKS.md; VECTOR 0.3.0's midi.c. */
#define TB3PO_TRACK_BYTES 0x8b0u
#define TB3PO_LOCKS 0x30u
#define TB3PO_TIMING 0x830u
/* No trigs, lock-only steps or NOTE/VEL/LEN locks: a line may be written without replacing anything. */
int tb3po_track_empty(const uint8_t *record);
/* The line into the record, in place, only the bytes that change: a note is a trig with a NOTE lock, an accent adds a
 * VEL lock of `accent_vel`, a slide a LEN lock of `slide_len` (so it overlaps the next note); plain notes keep the
 * track's own VEL and LEN. Steps past the length and other locks stay. Every changed byte is mirrored into `mirror`
 * when it is not NULL. `locked` (64 bytes) gets whether each step keeps any lock. Returns the number of trigs. */
unsigned tb3po_write(uint8_t *record, uint8_t *mirror, const Tb3poPattern *pattern, const Tb3poParams *p,
                     unsigned base_note, unsigned accent_vel, unsigned slide_len, uint8_t locked[TB3PO_STEPS]);
#endif
