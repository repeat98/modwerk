/* SPDX-License-Identifier: GPL-3.0-or-later
 * BREAKCUT engine: the cut procedures of Livecut (Remy Muller, GPL-2.0-or-later; mdsp/Livecut 2695d386), after Nick
 * Collins' BBCut, laid on a sliced break on an Octatrack Flex track. A unit is one sequencer step (Livecut's subdiv
 * 16); a cut replays the slice its block starts on, as Livecut's live buffer replays the block's start; cuts shorter
 * than a step become retrigs, cuts starting off the grid get micro-timing (1/24 step). Integers only: the unit has no
 * float library. Firmware-free. */
#ifndef BREAKCUT_ENGINE_H
#define BREAKCUT_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define BC_STEPS 64u
#define BC_TICKS 24u          /* micro-timing units in one step */
#define BC_NO_LOCK 255u
enum { BC_CUT = 0, BC_WARP = 1, BC_SQP = 2, BC_MIX = 3 };

typedef struct {
    uint8_t algo;   /* 0-3: CutProc11, WarpCut, SQPusher, MIX (one of the three, drawn per phrase) */
    uint8_t slices; /* 1-64: slices in the break, one per step */
    uint8_t actv;   /* 0-127: CutProc11's repeats, WarpCut's 1 - straight chance, SQPusher's activity */
    uint8_t roll;   /* 0-127: CutProc11's stutter chance, WarpCut's accelerando share, SQPusher's fill chance */
    uint8_t ramp;   /* 0-24: a roll's pitch at its end, -12..+12 semitones (12 none) */
    uint8_t rev;    /* 0-127: the chance a block plays reversed */
    uint8_t seed;   /* 0-127 */
} BcParams;
typedef struct {
    uint8_t trig;   /* a trig on this step */
    uint8_t micro;  /* 0-23: its micro-timing */
    uint8_t slice;  /* the slice it plays */
    uint8_t retrigs;/* 0, or 1-15 retrigs after it */
    uint8_t period; /* the retrig period in ticks (1/24 step) when retrigs */
    int8_t semis;   /* pitch, -12..+12 */
    uint8_t rev;    /* plays reversed */
} BcStep;
typedef struct { BcStep steps[BC_STEPS]; uint8_t length; } BcLine;

extern const BcParams bc_defaults;
extern const char *const bc_algo_names[4];
int bc_generate(BcLine *out, const BcParams *p, unsigned length);
unsigned bc_next_seed(unsigned seed);

/* Calibration (TESTING.md): the STRT lock of slice n in slice mode is 2n, as ot-tools-io's octapy port writes it
 * (raw STRT = slice index x 2, 64 slices over 0..126); RATE's reverse lock, and RTIM's value for a retrig period of
 * `ticks` (1/24 step), remain to be read off the unit. RTIM is taken as 16 values an octave with 79 at one step
 * (stock's default 1/16, octabam ot_spec.py), so 95 is half a step. */
#define BC_STRT_PER_SLICE 2u
#define BC_RATE_REVERSE 0u
unsigned bc_rtim(unsigned ticks);

/* The audio track record, as TB-3PO's (0x91a bytes; masks at +0, length at +0x50, 32 locks a step at +0x59, trig
 * words at +0x89a). PLAYBACK slots: PTCH 0, STRT 1, RATE 3, RTRG 4, RTIM 5. */
#define BC_TRACK_BYTES 0x91au
#define BC_LOCKS 0x59u
#define BC_TIMING 0x89au
int bc_track_empty(const uint8_t *record);
/* The line into the record in place, only the bytes that change, mirrored when `mirror` is not NULL: it owns the trig
 * mask and the PTCH, STRT, RATE, RTRG and RTIM locks and trig words of the steps inside the length; LEN, AMP, LFO and
 * FX locks, swing and steps past the length stay. Returns the number of trigs. */
unsigned bc_write(uint8_t *record, uint8_t *mirror, const BcLine *line, uint8_t locked[BC_STEPS]);
#define BC_PACKED 9u
void bc_pack(uint8_t out[BC_PACKED], const BcParams *p);
void bc_unpack(BcParams *p, const uint8_t in[BC_PACKED]);
#endif
