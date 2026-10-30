/* SPDX-License-Identifier: GPL-3.0-or-later
 * CALL & RESPONSE engine: the phrase generator of Nordl3's Call / Response Generator (MIT, Nordl3/Call-Response-Generator
 * dbd1f0c3, index.html: buildCall, buildResponse, applyEnding, mutatePhrase), in integers for the Octatrack's ColdFire.
 * A call is built from a motif of two to four steps repeated and varied along the phrase; a response is built from the
 * call by one of the generator's answer strategies, pulled toward the call by TGHT and closed by an ending. Two tracks
 * play one pair: the call track writes the call, an answer track rebuilds the same call from the call track's settings
 * and writes its response, so each track writes only its own record. Firmware-free. */
#ifndef CALLRESP_ENGINE_H
#define CALLRESP_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define CR_STEPS 64u
#define CR_NO_LOCK 255u
#define CR_MOTIFS 16u
#define CR_SCALES 8u
#define CR_MODES 3u
#define CR_ANSWERS 31u
#define CR_ENDINGS 11u
enum { CR_SPLIT = 0, CR_ALTERNATE = 1, CR_LAYER = 2 };   /* PHRS: C|R halves, C R C R' quarters, both at once */
enum { CR_END_MORE = 8 };

typedef struct {
    /* the call, read from the call track */
    uint8_t motif;  /* 0-15: the motif type (rhythm and contour) */
    uint8_t dens;   /* 0-127: density */
    uint8_t rept;   /* 0-127: repetition of the motif along the phrase */
    uint8_t scale;  /* 0-7 */
    uint8_t phrs;   /* 0-2: CR_SPLIT, CR_ALTERNATE, CR_LAYER */
    uint8_t seed;   /* 0-127: the call's seed on a call track, the response's on an answer track */
    uint8_t role;   /* 0 the call; 1-8 the answer to the call on track 1-8 */
    /* the response, read from the answer track */
    uint8_t answ;   /* 0-30: the answer strategy */
    uint8_t tght;   /* 0-127: how close the response stays to the call */
    uint8_t end;    /* 0-10: the response's ending */
    uint8_t mut;    /* 0-127: mutation of the response (of the second one in C R C R') */
    uint8_t trns;   /* 0-24: the response transposed -12..+12 semitones (12 none) */
} CrParams;
typedef struct { uint8_t active, accent; int8_t degree; } CrNote;
typedef struct { CrNote n[CR_STEPS]; uint8_t len; } CrPhrase;
typedef struct { uint8_t trig, accent; int8_t semis; } CrStep;
typedef struct { CrStep steps[CR_STEPS]; uint8_t length; } CrLine;

extern const CrParams cr_defaults;
extern const char *const cr_motif_names[CR_MOTIFS];
extern const char *const cr_scale_names[CR_SCALES];
extern const char *const cr_mode_names[CR_MODES];
extern const char *const cr_answer_names[CR_ANSWERS];
extern const char *const cr_ending_names[CR_ENDINGS];
extern const uint8_t cr_scale_length[CR_SCALES];
extern const uint8_t cr_scale_semis[CR_SCALES][7];

/* The phrase of `steps` (1-64) steps: the call from the call's settings, the response from the call and the answer's
 * settings. 0 on a bad argument. */
int cr_call(CrPhrase *out, const CrParams *call, unsigned steps);
int cr_response(CrPhrase *out, const CrPhrase *call, const CrParams *call_p, const CrParams *answer, unsigned steps);
/* The track's line of `length` (1-64) steps: `answer` NULL for the call track, else the answer track's settings with
 * `call` read from its call track. PHRS lays the phrases: C|R the call in the first half and the response in the
 * second, C R C R' quarters (the call repeated, the second response mutated), LAYR both over the whole length. */
int cr_generate(CrLine *out, const CrParams *call, const CrParams *answer, unsigned length);
/* The phrase length a PHRS mode gives a track of `length` steps (0 when nothing fits). */
unsigned cr_phrase_steps(unsigned mode, unsigned length);
int cr_semis(unsigned scale, int degree, int trns); /* a degree's semitones, folded into -12..+12 */
unsigned cr_next_seed(unsigned seed);

/* The audio track record, as TB-3PO's and BREAKCUT's (0x91a bytes; masks at +0, length at +0x50, 32 locks a step at
 * +0x59, trig words at +0x89a). PLAYBACK PTCH is slot 0 (64 + 5 semitones), AMP VOL slot 15. */
#define CR_TRACK_BYTES 0x91au
#define CR_LOCKS 0x59u
#define CR_LOCK_PTCH 0u
#define CR_LOCK_VOL 15u
#define CR_ACCENT_VOL 18u /* an accent's VOL lock is the Part's AMP VOL + this (at most 127) */
int cr_track_empty(const uint8_t *record);
/* The line into the record in place, only the bytes that change, mirrored when `mirror` is not NULL: it owns the trig
 * mask and the PTCH and VOL locks of the steps inside the length; other locks, trig words, swing and steps past the
 * length stay. A note is a trig with a PTCH lock, an accented one also a VOL lock of base_vol + CR_ACCENT_VOL. Returns
 * the number of trigs. */
unsigned cr_write(uint8_t *record, uint8_t *mirror, const CrLine *line, unsigned base_vol, uint8_t locked[CR_STEPS]);
#define CR_PACKED 9u
void cr_pack(uint8_t out[CR_PACKED], const CrParams *p);
void cr_unpack(CrParams *p, const uint8_t in[CR_PACKED]);
void cr_copy(CrParams *to, const CrParams *from); /* no C library on the unit */
#endif
