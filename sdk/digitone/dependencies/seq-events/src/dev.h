/* SPDX-License-Identifier: GPL-2.0-or-later */
/* seq-events' device layer for the Digitone mk1: what the shared part (../seq-events/seq.c) needs
 * to know of the firmware, as static inline functions so the one translation unit inlines them.
 * The pattern's layout is the same in 1.43 and 1.44; its pointer, the transport and the re-arm come
 * from mod.json's cflags (SQ_PATTERN_PP, SQ_TRANSPORT, SQ_REARM), one set per OS. */
#ifndef SEQ_EVENTS_DEV_H
#define SEQ_EVENTS_DEV_H

#include "digitone-mk1/seq.h"

/* the active pattern buffer: SQ_TRACKS tracks, then its settings */
#define TRACK_STRIDE    976             /* a track's data */
#define TR_STEPS        0x000           /* u16[64], big-endian: WORD_TRIG, WORD_LOCK */
#define TR_NOTES        0x1c0           /* s8[64][TR_STEP_NOTES]: each step's notes */
#define TR_STEP_NOTES   8
#define TR_NOTE         0x3c0           /* u8 NOTE */
#define TR_LENGTH       0x3c5           /* u16, unaligned: the length in per-track mode */
#define TR_ROOT         0x3cb           /* u8 the keyboard's ROOT */
#define TR_SCALE        0x3ce           /* s8 the keyboard's SCALE, -1 chromatic */
#define SETTINGS        0x160f8         /* the pattern's settings */
#define PS_LENGTH       0x14            /* u16 the master length; per-track mode: 1 is INF */
#define PS_MODE         0x19            /* u8 1: per-track lengths */
#define WORD_TRIG       0x0001          /* a step word's note trig */
#define WORD_LOCK       0x0002          /* its lock trig */
/* an event's lock list (the audio tracks' fire's, after its own locks) */
#define LIST_COUNT      0x08            /* u32 entries */
#define LIST_PAIRS      0x14            /* {u16 slot, s16 value}, LIST_STRIDE apart */
#define LIST_STRIDE     8
#define LIST_MAX        79

/* the API's notes are the firmware's: copied as they are */
typedef char dev_notes_match[SQ_NOTES == TR_STEP_NOTES ? 1 : -1];

#define DEV_IN_DDR(p) ((uint32_t)(p) >= 0x40000000u && (uint32_t)(p) < 0x48000000u)

static inline int32_t dev_u16(const uint8_t *p)    /* unaligned, big-endian */
{
    return (p[0] << 8) | p[1];
}

/* The pattern sq_track_info and sq_stored read, or 0: the active one. A fire reads the same, at
 * a pattern switch too (the first step after one: README, "The pattern a fire reads"). */
static inline const uint8_t *dev_pattern(void)
{
    const uint8_t *pat = *(const uint8_t *const volatile *)SQ_PATTERN_PP;
    return DEV_IN_DDR(pat) ? pat : 0;
}

/* The fire's step load, before any handler: pat, the pattern this fire reads (the site's a3). The
 * Digitone's is dev_pattern()'s, so nothing to keep. */
static inline void dev_fire_begin(int32_t track, const uint8_t *pat)
{
    (void)track;
    (void)pat;
}

/* track's length in pattern pat, 1 to SQ_STEPS, or -1: not a pattern yet; *master as
 * struct sq_track's */
static inline int32_t dev_track_len(const uint8_t *pat, int32_t track, int32_t *master)
{
    const uint8_t *ps = pat + SETTINGS;
    int32_t per_track = ps[PS_MODE] == 1, all = dev_u16(ps + PS_LENGTH);
    int32_t len = per_track ? dev_u16(pat + TRACK_STRIDE * track + TR_LENGTH) : all;
    *master = !per_track ? all : all == 1 ? 0 : all;
    return len >= 1 && len <= SQ_STEPS ? len : -1;
}

/* track's facts in pattern pat into *out (every field), or -1: not a pattern yet */
static inline int32_t dev_track_info(const uint8_t *pat, int32_t track, struct sq_track *out)
{
    const uint8_t *tr = pat + TRACK_STRIDE * track;
    if ((out->len = dev_track_len(pat, track, &out->master)) < 0)
        return -1;
    out->note = tr[TR_NOTE];
    out->root = tr[TR_ROOT];
    out->scale = (int8_t)tr[TR_SCALE];
    out->pad = 0;
    return 0;
}

/* the stored step word of track's step in pattern pat */
static inline uint32_t dev_step_word(const uint8_t *pat, int32_t track, int32_t step)
{
    return (uint32_t)dev_u16(pat + TRACK_STRIDE * track + TR_STEPS + 2 * step);
}

/* a step word's trig bits as seq-events' SQ_TRIG, SQ_LOCK; and back into the word */
static inline uint32_t dev_trig_in(uint32_t word)
{
    return (word & WORD_TRIG ? SQ_TRIG : 0) | (word & WORD_LOCK ? SQ_LOCK : 0);
}

static inline uint32_t dev_trig_out(uint32_t word, uint32_t trig)
{
    return (word & ~(uint32_t)(WORD_TRIG | WORD_LOCK)) | (trig & SQ_TRIG ? WORD_TRIG : 0) |
           (trig & SQ_LOCK ? WORD_LOCK : 0);
}

/* The notes stage. src: what the site gives (the Digitone: the track's data in the pattern the
 * fire reads). dev_generated: the step fires with no stored note trig. dev_notes_in: the notes it
 * plays so far into notes, the stored ones or NOTE for a generated trig. dev_notes_out: what the
 * site gets for notes after the handlers: 0 for the stored notes as they are */
static inline int32_t dev_generated(int32_t track, int32_t step, const void *src)
{
    (void)track;
    return !(((const uint8_t *)src)[TR_STEPS + 2 * step + 1] & WORD_TRIG);
}

static inline void dev_notes_in(int32_t track, int32_t step, const void *src, int32_t generated,
                                int8_t notes[SQ_NOTES])
{
    const uint8_t *trk = (const uint8_t *)src;
    const int8_t *own = (const int8_t *)trk + TR_NOTES + TR_STEP_NOTES * step;
    int32_t i;
    (void)track;
    for (i = 0; i < SQ_NOTES; i++)      /* a generated trig: NOTE, as a stock single-note trig */
        notes[i] = generated ? (i ? 0 : (int8_t)trk[TR_NOTE]) : own[i];
}

static inline const void *dev_notes_out(int32_t track, int32_t step, const void *src,
                                        int32_t generated, const int8_t notes[SQ_NOTES])
{
    const int8_t *own = (const int8_t *)src + TR_NOTES + TR_STEP_NOTES * step;
    int32_t i;
    (void)track;
    if (generated)
        return notes;
    for (i = 0; i < SQ_NOTES && notes[i] == own[i]; i++)
        ;
    return i == SQ_NOTES ? 0 : notes;
}

/* A lock into the fire's lock list: the slot's entry if it has one, else a new one */
static inline void dev_lock_set(void *list, uint32_t slot, int32_t value)
{
    uint8_t *l = (uint8_t *)list, *e;
    uint32_t *count = (uint32_t *)(l + LIST_COUNT);
    uint32_t i, n = *count < LIST_MAX ? *count : LIST_MAX;
    for (i = 0; i < n; i++) {
        e = l + LIST_PAIRS + LIST_STRIDE * i;
        if (*(uint16_t *)e == slot) {
            *(int16_t *)(e + 2) = (int16_t)value;
            return;
        }
    }
    if (n >= LIST_MAX)
        return;
    e = l + LIST_PAIRS + LIST_STRIDE * n;
    *(uint16_t *)e = (uint16_t)slot;
    *(int16_t *)(e + 2) = (int16_t)value;
    *count = n + 1;
}

static inline int32_t dev_list_ok(const void *list)
{
    return DEV_IN_DDR(list);
}

/* the transport plays; and the sequencer's re-arm of a stopped track (UI task) */
static inline int32_t dev_playing(void)
{
    return *(volatile uint32_t *)SQ_TRANSPORT == 1;
}

static inline void dev_rearm(int32_t track)
{
    ((void (*)(int32_t))SQ_REARM)(track);
}

#endif
