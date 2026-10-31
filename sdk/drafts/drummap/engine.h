/* SPDX-License-Identifier: GPL-3.0-or-later
 * DRUMMAP engine: Mutable Instruments Grids' pattern generator (Émilie Gillet, GPL-3.0) as the Phazerville DrumMap
 * applet reads it (Benjamin Rosenbach, MIT; djphazer/O_C-Phazerville 92740448), written as a sample track's trigs
 * and VOL locks. Firmware-free; integers only. */
#ifndef DRUMMAP_ENGINE_H
#define DRUMMAP_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define DM_STEPS 64u
#define DM_GRID 32u
#define DM_NO_LOCK 255u
enum { DM_BD = 0, DM_SD = 1, DM_HH = 2 };

typedef struct {
    uint8_t part;   /* 0-2: BD, SD, HH */
    uint8_t x, y;   /* 0-127: the map position (Grids' 0-255, halved) */
    uint8_t fill;   /* 0-127: density (Grids' fill, halved): 0 nothing, 127 every step with a level */
    uint8_t chaos;  /* 0-127: per-pass random lift of the levels (Grids' chaos, halved) */
    uint8_t avel;   /* 0-31: plain hits sit 4 x this below the Part's VOL; accents keep it; 0 writes no VOL locks */
    uint8_t seed;   /* 0-127: the chaos variation; YES advances it */
} DmParams;
typedef struct { uint8_t hit, accent; } DmStep;
typedef struct { DmStep steps[DM_STEPS]; uint8_t length; } DmPattern;

extern const DmParams dm_defaults;
extern const char *const dm_part_names[3];

/* DrumMap's ReadDrumMap: the level (0-255) of `part` at `step` (0-31) of the map at x, y (0-255), bilinear between
 * the four nearest nodes. */
unsigned dm_level(unsigned step, unsigned part, unsigned x, unsigned y);
/* The track's hits over `length` steps (1-64): Grids' 32 steps repeated, each 32-step pass with its own chaos lift
 * (DrumMap's randomness, drawn per pass from the seed). A hit when the level clears 255 - fill; an accent when it
 * clears 192. 0 on a bad argument. */
int dm_generate(DmPattern *out, const DmParams *p, unsigned length);
unsigned dm_next_seed(unsigned seed);

/* The audio track record, as TB-3PO's (0x91a bytes; masks at +0, length at +0x50, 32 locks a step at +0x59, trig
 * words at +0x89a; VOL is lock slot 15). */
#define DM_TRACK_BYTES 0x91au
#define DM_LOCKS 0x59u
#define DM_TIMING 0x89au
#define DM_LOCK_VOL 15u
int dm_track_empty(const uint8_t *record);
/* The hits into the record in place, only the bytes that change, mirrored into `mirror` when not NULL: trigs, VOL
 * locks of plain hits (base_vol - 4 avel), straight trig words for old and new hits, the lock-only mask; other locks,
 * swing and steps past the length stay. `locked` gets whether each step keeps a lock. Returns the number of hits. */
unsigned dm_write(uint8_t *record, uint8_t *mirror, const DmPattern *pattern, unsigned avel, unsigned base_vol,
                  uint8_t locked[DM_STEPS]);
/* Nine seven-bit bytes, as the Part's spare NEIGHBOR slots keep them: PART 2, X 7, Y 7, FILL 7, CHAO 7, AVEL 5, SEED 7. */
#define DM_PACKED 9u
void dm_pack(uint8_t out[DM_PACKED], const DmParams *p);
void dm_unpack(DmParams *p, const uint8_t in[DM_PACKED]);
#endif
