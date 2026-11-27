/* SPDX-License-Identifier: GPL-2.0-or-later */
/* seq-events' device layer for the Digitakt mk1: what the shared part (../seq-events/seq.c) needs
 * to know of the firmware, as static inline functions so the one translation unit inlines them.
 * The pattern's layout and the fires are the same in 1.53 and 1.54; the pointers, the transport
 * and the re-arm come from mod.json's cflags (SQ_PATTERN_PP, SQ_NEXT_PP, SQ_TRANSPORT, SQ_REARM),
 * one set per OS. */
#ifndef SEQ_EVENTS_DEV_H
#define SEQ_EVENTS_DEV_H

#include "digitakt-mk1/seq.h"

/* a pattern buffer: SQ_TRACKS tracks, then its settings */
#define TRACK_STRIDE    911             /* a track's data (odd: every u16 read is unaligned) */
#define TR_STEPS        0x000           /* u16[64], big-endian: the step words */
#define TR_NOTE_LOCKS   0x280           /* s8[64] x 4: note locks 1-4 (-1: the track's default) */
#define TR_DEF_TRIGS    0x382           /* u16: the track's default SYN, FLTR, LFO trigs */
#define TR_NOTE         0x384           /* u8 NOTE (then 3 relative defaults for MIDI chords) */
#define TR_LENGTH       0x388           /* s16: the length in per-track mode */
#define SETTINGS        0x1ec40         /* the pattern's settings */
#define PS_LENGTH       0x14            /* s16 the master length; per-track mode: 1 is INF */
#define PS_MODE         0x19            /* s8 1: per-track lengths */
/* the step word */
#define WORD_TRIG       0x0001          /* the step fires (the firmware's only trig bit) */
#define WORD_SYN        0x0080          /* the SYN trig: the sample or the MIDI note starts */
#define WORD_SYN_SET    0x0800          /* WORD_SYN overrides the track's default on this step */
#define WORD_DEF_SYN    0x00100000u     /* ours, above the firmware's 16 bits: the track's default
                                         * SYN trig, ORed in by seq.s and dev_step_word so the trig
                                         * maps without the track; the sites write back 16 bits */
/* an event's lock list (the audio tracks' fire's, after its own locks: the Digitone's layout) */
#define LIST_COUNT      0x08            /* u32 entries */
#define LIST_PAIRS      0x14            /* {u16 slot, s16 value}, LIST_STRIDE apart */
#define LIST_STRIDE     8
#define LIST_MAX        53              /* the resolve's own bound: never more slots than these */

/* what seq.s's notes sites hand the device layer (src), on their stack */
struct dev_notes {
    const uint8_t *trk;                 /* +0 the track's data in the pattern the fire reads */
    int32_t *list;                      /* +4 a MIDI track's notes, absolute, as longs; 0: audio */
    int32_t n;                          /* +8 MIDI: how many (0-4); audio: the note */
};

#define DEV_IN_DDR(p) ((uint32_t)(p) >= 0x40000000u && (uint32_t)(p) < 0x48000000u)

/* the pattern each track's last fire read: the active one, or the next at a switch (the tick
 * fires a track from SQ_NEXT_PP once that track has switched). Written at interrupt level only. */
static const uint8_t *volatile dev_fire_pat[SQ_TRACKS];

static inline int32_t dev_u16(const uint8_t *p)    /* unaligned, big-endian */
{
    return (p[0] << 8) | p[1];
}

/* The pattern sq_track_info and sq_stored read, or 0: the active one */
static inline const uint8_t *dev_pattern(void)
{
    const uint8_t *pat = *(const uint8_t *const volatile *)SQ_PATTERN_PP;
    return DEV_IN_DDR(pat) ? pat : 0;
}

/* The fire's step load, before any handler: pat, the pattern this fire reads (the site's a3 or a2) */
static inline void dev_fire_begin(int32_t track, const uint8_t *pat)
{
    dev_fire_pat[track] = pat;
}

/* the pattern track plays: pat, or the next one when track's last fire read it (a switch the
 * active pointer has not caught up with) */
static inline const uint8_t *dev_track_pat(const uint8_t *pat, int32_t track)
{
    const uint8_t *fired = dev_fire_pat[track];
    if (fired != pat && DEV_IN_DDR(fired) && fired == *(const uint8_t *const volatile *)SQ_NEXT_PP)
        return fired;
    return pat;
}

static inline int32_t dev_track_len(const uint8_t *pat, int32_t track, int32_t *master)
{
    const uint8_t *ps;
    int32_t per_track, all, len;
    pat = dev_track_pat(pat, track);
    ps = pat + SETTINGS;
    per_track = ps[PS_MODE] == 1;
    all = (int16_t)dev_u16(ps + PS_LENGTH);
    len = per_track ? (int16_t)dev_u16(pat + TRACK_STRIDE * track + TR_LENGTH) : all;
    *master = !per_track ? all : all == 1 ? 0 : all;
    return len >= 1 && len <= SQ_STEPS ? len : -1;
}

static inline int32_t dev_track_info(const uint8_t *pat, int32_t track, struct sq_track *out)
{
    if ((out->len = dev_track_len(pat, track, &out->master)) < 0)
        return -1;
    out->note = dev_track_pat(pat, track)[TRACK_STRIDE * track + TR_NOTE];
    out->root = SQ_ROOT_NONE;           /* no keyboard key on the Digitakt */
    out->scale = SQ_SCALE_NONE;
    out->pad = 0;
    return 0;
}

/* the track's default SYN trig as WORD_DEF_SYN */
static inline uint32_t dev_def_syn(const uint8_t *trk)
{
    return trk[TR_DEF_TRIGS + 1] & WORD_SYN ? WORD_DEF_SYN : 0;
}

static inline uint32_t dev_step_word(const uint8_t *pat, int32_t track, int32_t step)
{
    const uint8_t *trk = dev_track_pat(pat, track) + TRACK_STRIDE * track;
    return (uint32_t)dev_u16(trk + TR_STEPS + 2 * step) | dev_def_syn(trk);
}

/* the SYN trig as the step plays it: its own where it overrides, else the track's */
static inline int32_t dev_syn(uint32_t word)
{
    return (word & WORD_SYN_SET) ? (word & WORD_SYN) != 0 : (word & WORD_DEF_SYN) != 0;
}

/* a step word's trig as SQ_TRIG (it fires with the SYN trig) or SQ_LOCK (without: what FUNC + trig
 * stores, 0x6801); and back: only bit 0, and the SYN trig with its override when the answer turned
 * one into the other. The FLTR and LFO trigs and every other bit stay as they are. */
static inline uint32_t dev_trig_in(uint32_t word)
{
    return !(word & WORD_TRIG) ? 0 : dev_syn(word) ? SQ_TRIG : SQ_LOCK;
}

static inline uint32_t dev_trig_out(uint32_t word, uint32_t trig)
{
    if (trig == dev_trig_in(word))
        return word;
    if (!trig)
        return word & ~(uint32_t)WORD_TRIG;
    word |= WORD_TRIG;
    if (((trig & SQ_TRIG) != 0) != dev_syn(word)) {         /* SQ_TRIG wins over SQ_LOCK */
        word |= WORD_SYN_SET;
        word = (trig & SQ_TRIG) ? word | WORD_SYN : word & ~(uint32_t)WORD_SYN;
    }
    return word;
}

/* The notes stage. src: struct dev_notes. A generated trig plays NOTE alone, as the API says: an
 * empty step's note locks are stale (60 seen), never read. An audio track plays notes[0] only. */
static inline int32_t dev_generated(int32_t track, int32_t step, const void *src)
{
    (void)track;
    return !(((const struct dev_notes *)src)->trk[TR_STEPS + 2 * step + 1] & WORD_TRIG);
}

static inline void dev_notes_in(int32_t track, int32_t step, const void *src, int32_t generated,
                                int8_t notes[SQ_NOTES])
{
    const struct dev_notes *s = (const struct dev_notes *)src;
    int32_t i;
    (void)step;
    for (i = 0; i < SQ_NOTES; i++)
        notes[i] = 0;
    if (generated)
        notes[0] = (int8_t)(s->trk[TR_NOTE] & 127);
    else if (track < SQ_AUDIO)
        notes[0] = (int8_t)s->n;
    else if (s->n < 1)
        notes[0] = -1;
    else
        for (i = 0; i < s->n && i < SQ_NOTES; i++)          /* intervals from the first */
            notes[i] = (int8_t)(i ? s->list[i] - s->list[0] : s->list[0]);
}

/* -> src with what the fire gets written into it, or 0: the stock notes as they are */
static inline const void *dev_notes_out(int32_t track, int32_t step, const void *src,
                                        int32_t generated, const int8_t notes[SQ_NOTES])
{
    struct dev_notes *s = (struct dev_notes *)src;  /* the site's own, on its stack */
    int8_t was[SQ_NOTES];
    int32_t i, n, v;
    if (!generated) {
        dev_notes_in(track, step, src, 0, was);
        for (i = 0; i < SQ_NOTES && notes[i] == was[i]; i++)
            ;
        if (i == SQ_NOTES)
            return 0;
    }
    if (track < SQ_AUDIO) {
        if (notes[0] < 0)
            return 0;                   /* an audio track always plays its note */
        s->n = notes[0];
        return s;
    }
    n = 0;
    if (notes[0] >= 0) {
        s->list[n++] = notes[0];
        for (i = 1; i < SQ_NOTES; i++)
            if (notes[i] && (v = notes[0] + notes[i]) >= 0 && v <= 127)
                s->list[n++] = v;       /* outside 0..127: dropped, as the stock drops it */
    }
    s->n = n;
    return s;
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

static inline int32_t dev_playing(void)
{
    return *(volatile uint32_t *)SQ_TRANSPORT == 1;
}

static inline void dev_rearm(int32_t track)
{
    ((void (*)(int32_t))SQ_REARM)(track);
}

#endif
