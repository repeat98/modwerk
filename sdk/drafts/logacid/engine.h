/* SPDX-License-Identifier: GPL-3.0-or-later
 * LOGACID pattern engine: the generative 303-style acid line of the TB_3PO Hemisphere applet by Logarhythm
 * (MIT, Copyright (c) 2020 Logarhythm; reseed() by Qiemem; extensively modified by djphazer in O_C-Phazerville), as
 * Charles Vestal's Schwung port tb3po.c (charlesvestal/schwung-tb3po,
 * f49d81d05d1e29ae37728a08e30f193892be3bc9) runs it, in integers for the Octatrack's ColdFire: no float, no library,
 * no firmware. The pattern is a function of the controls and the seed, so the same values always give the same line
 * and a knob turn rewrites the track from them. */
#ifndef LOGACID_ENGINE_H
#define LOGACID_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define LOGACID_STEPS 64u
#define LOGACID_MAX_MOTIF 32u
#define LOGACID_SCALES 6u
#define LOGACID_NO_LOCK 255u

enum { LOGACID_REST = 0, LOGACID_NOTE = 1, LOGACID_ACCENT = 2, LOGACID_SLIDE = 3 };
enum { LOGACID_FWD = 0, LOGACID_REV = 1, LOGACID_PING = 2, LOGACID_RND = 3 };

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
} LogacidParams;
typedef struct {
    uint8_t kind;     /* LOGACID_REST .. LOGACID_SLIDE */
    uint8_t degree;   /* index into the scale */
    uint8_t octave;   /* 0 .. octs - 1 */
} LogacidStep;
typedef struct {
    LogacidStep steps[LOGACID_STEPS];
    uint8_t length;
} LogacidPattern;

extern const LogacidParams logacid_defaults;
extern const char *const logacid_scale_names[LOGACID_SCALES];
extern const uint8_t logacid_scale_degrees[LOGACID_SCALES][7];
extern const uint8_t logacid_scale_length[LOGACID_SCALES];

/* The line for a track of `length` steps (1-64) from the controls. 0 on a bad argument. */
int logacid_generate(LogacidPattern *out, const LogacidParams *p, unsigned length);
/* The next seed after YES: a different line, never the same one twice in a row. */
unsigned logacid_next_seed(unsigned seed);
/* The MIDI note of a step: the track's NOTE (the root in its octave), the degree's semitones and the step's octave. */
unsigned logacid_note(const LogacidParams *p, const LogacidStep *s, unsigned base_note);

/* The Octatrack's MIDI track record (0x8b0 bytes a track, 16 a pattern): five 64-bit step masks at +0 (0 trigs,
 * 1 trigless/one-shot marks, 2 lock-only steps, 3 swing, 4 slide), the track's own length at +0x28, 32 lock bytes a
 * step at +0x30 (NOTE 0, VEL 1, LEN 2; 255 no lock), and a two-byte trig word a step at +0x830 (micro-timing in bits
 * 12-7, condition in 6-0). octabam docs/firmware/STEP_LOCKS.md; VECTOR 0.3.0's midi.c. */
#define LOGACID_TRACK_BYTES 0x8b0u
#define LOGACID_LOCKS 0x30u
#define LOGACID_TIMING 0x830u
/* No trigs, lock-only steps or NOTE/VEL/LEN locks: a line may be written without replacing anything. */
int logacid_track_empty(const uint8_t *record);
/* The line into the record, in place, only the bytes that change: a note is a trig with a NOTE lock, an accent adds a
 * VEL lock of `accent_vel`, a slide a LEN lock of `slide_len` (so it overlaps the next note); plain notes keep the
 * track's own VEL and LEN. Steps past the length and other locks stay. Every changed byte is mirrored into `mirror`
 * when it is not NULL. `locked` (64 bytes) gets whether each step keeps any lock. Returns the number of trigs. */
unsigned logacid_write(uint8_t *record, uint8_t *mirror, const LogacidPattern *pattern, const LogacidParams *p,
                     unsigned base_note, unsigned accent_vel, unsigned slide_len, uint8_t locked[LOGACID_STEPS]);

/* The Octatrack's audio track record (0x91a bytes a track, 16 a pattern; octabam tools/hw/ot_bank.py, VECTOR's
 * engine.c): eight 64-bit step masks at +0 (0 trigs, 2 lock-only steps), swing at +0x40, the track's own length at
 * +0x50, 32 lock bytes a step at +0x59 (PLAYBACK 0-5: PTCH 0; AMP 12-17: HOLD 13, VOL 15; FX1 18-23; 255 no lock) and
 * a two-byte trig word a step at +0x89a. The slide-trig mask's index is read from the unit (TESTING.md). */
#define LOGACID_AUDIO_TRACK_BYTES 0x91au
#define LOGACID_AUDIO_LOCKS 0x59u
#define LOGACID_AUDIO_TIMING 0x89au
#define LOGACID_LOCK_PTCH 0u
#define LOGACID_LOCK_HOLD 13u
#define LOGACID_LOCK_VOL 15u
#define LOGACID_LOCK_FX1_DEPTH 21u   /* FX1 knob D: the stock FILTER's envelope DEPTH */
#define LOGACID_MASK_TRIGS 0u
#define LOGACID_MASK_LOCK_ONLY 2u
#define LOGACID_FILTER_ID 4u         /* the stock FILTER's effect id */
#define LOGACID_HOLD_STEP 16u        /* AMP HOLD units in one sequencer step: to confirm on the unit (TESTING.md) */
/* How the line lands on a sample track: PTCH locks over two octaves (stock's -12..+12 semitones; 64 + 5 st), the
 * root rotating the pitch classes inside them; an accent is the Part's AMP VOL while plain notes are attenuated,
 * and, with the stock FILTER on FX1, a DEPTH lock; a slide holds the sample through the next step, which becomes a
 * lock-only step with a PTCH lock and a slide trig, so the pitch glides without a retrigger. */
typedef struct {
    uint8_t root;        /* 0-11: the pitch class of degree 0 */
    uint8_t gate;        /* 0-63: a note's HOLD lock is 2 x this, in stock's AMP HOLD units */
    uint8_t base_vol;    /* the Part's AMP VOL: an accent's level */
    uint8_t avel;        /* 0-31: plain notes sit 4 x this below base_vol; 0 writes no VOL locks */
    uint8_t aflt;        /* 0-7: an accent's FILTER DEPTH lock, 18 x this; 0 writes none */
    uint8_t filter;      /* 1 when the track's FX1 is the stock FILTER (else no DEPTH locks) */
    uint8_t slide_mask;  /* the slide-trig mask's index in the record */
} LogacidAudio;
unsigned logacid_ptch(const LogacidParams *p, const LogacidStep *s, unsigned root); /* the PTCH lock value, 4..119 */
int logacid_audio_empty(const uint8_t *record); /* no trigs, marks, recorder events or locks at all (VECTOR's rule) */
unsigned logacid_write_audio(uint8_t *record, uint8_t *mirror, const LogacidPattern *pattern, const LogacidParams *p,
                           const LogacidAudio *a, uint8_t locked[LOGACID_STEPS]);
/* The sample track's nine settings bytes, seven bits each (stock's validator may see them when the module is absent):
 * DENS 7, ACNT 7, SLID 7, SEED 7, VAR 5, GATE 6, AVEL 5, SCAL 3, DIR 2, MOTF 5, ROOT 4, AFLT 3 = 61 bits. */
typedef struct { LogacidParams p; LogacidAudio a; } LogacidAudioSettings;
#define LOGACID_PACKED 9u
void logacid_pack(uint8_t out[LOGACID_PACKED], const LogacidAudioSettings *s);
void logacid_unpack(LogacidAudioSettings *s, const uint8_t in[LOGACID_PACKED]);
extern const LogacidAudioSettings logacid_audio_defaults;
void logacid_copy_settings(LogacidAudioSettings *to, const LogacidAudioSettings *from); /* no C library on the unit */
#endif
