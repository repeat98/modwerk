/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Modwerk's Rytm base: the FX track's lock words 38-41 (OS 1.74), first written as a draft for core-ar2
 * (26 October 2026).
 *
 * Stock's live lock table keeps 42 words a step for each track (live pattern
 * + 11921: 13 tracks of 64 steps x 88 bytes, each 42 u16 words, 0xFFFF for no
 * lock, then a u32 count of the step's locks; then 42 bytes, a fine flag per
 * word). On the FX track (12) no parameter uses words 38-41, and stock plays
 * them as its own: a lock trig carries them to the audio block, and the next
 * FX trig without them puts the kit's words back. A mod sets them with stock's
 * routines, so undo, copy, paste, clear and pattern changes carry them too.
 *
 * Stock cannot save them: its savers look a word's slot up in a map that has
 * 38 entries for the FX track (0x401c5b4c), so for words 38-41 they would read
 * its inverse and give the lock another FX parameter's slot. The base saves these
 * words itself, in lanes stock's loader skips, and loads them back:
 *
 *   a parameter's save (0x4000940c)  track 12, a word of 38-41: the base writes the
 *                                    word's two lanes; stock is not called
 *   every lock's save (0x40009216)   stock sees 0xFFFF in those words; core
 *                                    then writes their lanes after stock's
 *   the lock load (0x40008f98)       after stock, the lanes go back into the
 *                                    words, each counted in its step
 *
 * A word's lanes are {0x40 + 2 (w - 38), 12}, its high bytes, and
 * {0x41 + 2 (w - 38), 12}, its low bytes: 64 bytes each, a step's word 0xFFFF
 * when both are 0xFF. Stock's stored lanes (stored pattern + 8337) are 72 of 66
 * bytes, {slot, track, 64 x u8}, used from the first on: its parameter save
 * takes the first lane past the used ones. A word's lanes are kept only while
 * one of its steps holds a lock, packed among stock's; when no lane is free
 * they are dropped, as stock drops a lock past 72. Stock's loader skips any
 * lane whose slot is above 41 (0x40008f98), so a pattern saved with these
 * lanes opens on stock alone with its stock locks, and stock frees the lanes
 * at its next save.
 *
 * Stock's every-lock save scans the whole table in the UI task; for that pass
 * the four words read 0xFFFF, so an FX trig that fires within it plays them as
 * unlocked once.
 */
#include <stdint.h>

#define TRACK_FX 12
#define WORD_FIRST 38
#define WORDS 4
#define STEPS 64
#define STEP_BYTES 88
#define COUNT_AT 84             /* a step's u32 count of its locks */
#define TRACK_BYTES 5674
#define LANES 72
#define LANE_BYTES 66
#define TAG 0x40                /* word 38's high bytes; +1 its low, +2 word 39's high ... */
#define NONE 0xff

extern int lk_save_one_body(uint8_t *lanes, uint8_t *live, int a, int word, int track);
extern int lk_save_all_body(uint8_t *lanes, uint8_t *live, int a);
extern int lk_load_body(uint8_t *live, uint8_t *lanes);

static volatile uint16_t *word_at(uint8_t *live, int step, int w)
{
    return (volatile uint16_t *)(live + TRACK_BYTES * TRACK_FX + STEP_BYTES * step + 2 * w);
}

static volatile uint32_t *count_at(uint8_t *live, int step)
{
    return (volatile uint32_t *)(live + TRACK_BYTES * TRACK_FX + STEP_BYTES * step + COUNT_AT);
}

/* stock counts a lane used when neither its slot nor its track is 0xFF */
static int used(const uint8_t *l)
{
    return l[0] != NONE && l[1] != NONE;
}

static int lane_of(const uint8_t *lanes, int tag)
{
    int i;
    for (i = 0; i < LANES; i++)
        if (lanes[LANE_BYTES * i] == tag && lanes[LANE_BYTES * i + 1] == TRACK_FX)
            return i;
    return -1;
}

/* frees a lane and moves the ones after it down, so the used lanes stay first */
static void drop(uint8_t *lanes, int i)
{
    int k;
    for (; i < LANES - 1; i++)
        for (k = 0; k < LANE_BYTES; k++)
            lanes[LANE_BYTES * i + k] = lanes[LANE_BYTES * (i + 1) + k];
    lanes[LANE_BYTES * i] = NONE;
    lanes[LANE_BYTES * i + 1] = NONE;
}

/* the lane for tag, or a new one after the used lanes; -1 when none is free */
static int lane_for(uint8_t *lanes, int tag)
{
    int i = lane_of(lanes, tag);
    if (i >= 0)
        return i;
    for (i = 0; i < LANES; i++)
        if (!used(lanes + LANE_BYTES * i)) {
            lanes[LANE_BYTES * i] = (uint8_t)tag;
            lanes[LANE_BYTES * i + 1] = TRACK_FX;
            return i;
        }
    return -1;
}

static void save_word(uint8_t *lanes, uint8_t *live, int w)
{
    int s, hi, lo, any = 0, tag = TAG + 2 * (w - WORD_FIRST);
    for (s = 0; s < STEPS; s++)
        if (*word_at(live, s, w) != 0xffff)
            any = 1;
    if (!any) {
        if ((hi = lane_of(lanes, tag)) >= 0)
            drop(lanes, hi);
        if ((lo = lane_of(lanes, tag + 1)) >= 0)
            drop(lanes, lo);
        return;
    }
    hi = lane_for(lanes, tag);
    lo = hi < 0 ? -1 : lane_for(lanes, tag + 1);
    if (lo < 0) {                               /* no room: drop the word, as stock drops a lock past 72 */
        if (hi >= 0)
            drop(lanes, hi);
        return;
    }
    for (s = 0; s < STEPS; s++) {
        uint16_t v = *word_at(live, s, w);
        lanes[LANE_BYTES * hi + 2 + s] = (uint8_t)(v >> 8);
        lanes[LANE_BYTES * lo + 2 + s] = (uint8_t)v;
    }
}

int core_lk_save_one(uint8_t *lanes, uint8_t *live, int a, int word, int track)
{
    if (track == TRACK_FX && word >= WORD_FIRST && word < WORD_FIRST + WORDS && lanes && live) {
        save_word(lanes, live, word);
        return 1;
    }
    return lk_save_one_body(lanes, live, a, word, track);
}

int core_lk_save_all(uint8_t *lanes, uint8_t *live, int a)
{
    static uint16_t keep[STEPS][WORDS];
    int s, w, r;
    if (!lanes || !live)
        return lk_save_all_body(lanes, live, a);
    for (s = 0; s < STEPS; s++)
        for (w = 0; w < WORDS; w++) {
            keep[s][w] = *word_at(live, s, WORD_FIRST + w);
            *word_at(live, s, WORD_FIRST + w) = 0xffff;
        }
    r = lk_save_all_body(lanes, live, a);
    for (s = 0; s < STEPS; s++)
        for (w = 0; w < WORDS; w++)
            *word_at(live, s, WORD_FIRST + w) = keep[s][w];
    if (r & 0xff)
        for (w = 0; w < WORDS; w++)
            save_word(lanes, live, WORD_FIRST + w);
    return r;
}

int core_lk_load(uint8_t *live, uint8_t *lanes)
{
    int r = lk_load_body(live, lanes), w, s;
    if (!(r & 0xff))
        return r;
    for (w = 0; w < WORDS; w++) {
        int tag = TAG + 2 * w, hi = lane_of(lanes, tag), lo = lane_of(lanes, tag + 1);
        if (hi < 0 || lo < 0)
            continue;
        for (s = 0; s < STEPS; s++) {
            uint8_t h = lanes[LANE_BYTES * hi + 2 + s], l = lanes[LANE_BYTES * lo + 2 + s];
            if (h == NONE && l == NONE)
                continue;
            *word_at(live, s, WORD_FIRST + w) = (uint16_t)(h << 8 | l);
            ++*count_at(live, s);
        }
    }
    return r;
}
