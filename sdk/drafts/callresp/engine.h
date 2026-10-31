/* SPDX-License-Identifier: GPL-3.0-or-later
 * CALL & RESPONSE engine: the phrase generator of Nordl3's Call / Response Generator (MIT, Nordl3/Call-Response-Generator
 * dbd1f0c3, index.html: buildCall, buildResponse, applyEnding, mutatePhrase), in integers for the Octatrack's ColdFire.
 * A call is built from a motif of two to four steps repeated and varied along the phrase; a response is built from the
 * call by one of the generator's answer strategies, pulled toward the call by TGHT and closed by an ending. A track
 * plays both (ROLE C+R, the generator's "same output"), or two tracks share a pair (CALL and ANSn): the call track
 * writes the calls, an answer track rebuilds the same call from the call track's settings and writes the responses,
 * so each track writes only its own record. Firmware-free. */
#ifndef CALLRESP_ENGINE_H
#define CALLRESP_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define CR_STEPS 64u
#define CR_NO_LOCK 255u
#define CR_MOTIFS 16u
#define CR_SCALES 8u
#define CR_MODES 5u
#define CR_ANSWERS 31u
#define CR_ENDINGS 11u
/* PHRS: C|R halves; C R C' R', C C' C'' R and C C' R R' quarters (' varied by VAR on calls, MUT on responses); LAYR
 * call and response both over the whole length (two tracks; C|R on one). */
enum { CR_SPLIT = 0, CR_CRCR = 1, CR_CCCR = 2, CR_CCRR = 3, CR_LAYER = 4 };
enum { CR_SELF = 0, CR_CALL = 1, CR_ANSWER = 2 }; /* ROLE: C+R, CALL, ANS1-ANS8 (2-9) */
enum { CR_END_MORE = 8 };
#define CR_KNOB 31u /* DENS, REPT, TGHT, MUT and VAR run 0-31 */

typedef struct {
    /* the call, read from the call track */
    uint8_t motif;  /* 0-15: the motif type (rhythm and contour) */
    uint8_t dens;   /* 0-31: density */
    uint8_t rept;   /* 0-31: repetition of the motif along the phrase */
    uint8_t scale;  /* 0-7 */
    uint8_t phrs;   /* 0-4: CR_SPLIT .. CR_LAYER */
    uint8_t seed;   /* 0-127: the call's seed on a C+R or call track, the response's on an answer track */
    uint8_t role;   /* CR_SELF, CR_CALL, or CR_ANSWER + n: the answer to the call on track n + 1 */
    uint8_t var;    /* 0-31: variation of the repeated calls */
    /* the response: the answer track's, or the C+R track's own */
    uint8_t answ;   /* 0-30: the answer strategy */
    uint8_t tght;   /* 0-31: how close the response stays to the call */
    uint8_t end;    /* 0-10: the response's ending */
    uint8_t mut;    /* 0-31: mutation of the response (of the second one where there are two) */
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
/* The track's line of `length` (1-64) steps: the calls (CR_CALLS) and responses (CR_RESPONSES) PHRS lays out, from the
 * call's settings and the answer's (on a C+R track both are its own). PHRS's phrases share the length: halves for C|R,
 * quarters for CRCR, CCCR and CCRR (C|R below four steps), the whole length for LAYR (C|R when one track plays both). */
#define CR_CALLS 1u
#define CR_RESPONSES 2u
int cr_generate(CrLine *out, const CrParams *call, const CrParams *answer, unsigned length, unsigned parts);
/* The phrases a mode lays on a track of `length` steps: their kinds ('C' or 'R', in order) into `kinds`, their length
 * into *steps; returns how many (0 when nothing fits). `both` when one track plays call and response (LAYR is C|R). */
unsigned cr_layout(unsigned mode, unsigned length, unsigned both, char kinds[4], unsigned *steps);
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
