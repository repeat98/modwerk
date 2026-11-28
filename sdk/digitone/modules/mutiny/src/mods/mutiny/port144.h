/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's port to the Digitone mk1, stock OS 1.44 (SHA256
 * d4f200d04484333d82822db7744e6484d0def8f2db8ddf55ee2b780cc13c9659). This header and port144.c
 * hold the firmware addresses, the native buffer layout and the raw event fields. A few OS 1.44
 * values live next to their only user: the lock slots in playback.c, the key codes in input.h, the
 * LED modes in mutiny.c and the track length offset in len.s. None of it is portable to another OS
 * or device. mu_port_buffer_guard() guards a buffer address; it does not identify a pattern.
 *
 * Sources: seq-events-dn1/dev.h (TRACK_STRIDE, TR_*, WORD_*), core3.h and seq-events.h (fw_* and
 * sq_*), the measured track layout, the hook bus's raw event fields (ev+12/ev+16), and the measured
 * OS 1.44 screen fields (brain +0x54/+0x5c, ctrl +0x20, LED setter 0x40016e62, sound slots 55/72).
 */
#ifndef MUTINY_PORT144_H
#define MUTINY_PORT144_H

#include <stddef.h>
#include <stdint.h>

#define MU_PORT_TRACKS 4u

/* The native pattern (one track plus its lock area) */
/* A track's data, and the eight track blocks that precede the pattern's lock table. */
#define MU_PORT_TRACK_STRIDE 976u
#define MU_PORT_LOCK_BASE 0x1e80u   /* 8 * 976: after the four synth and four MIDI tracks */
#define MU_PORT_TRACK_LOCKS 0x284fu /* a track's lock area: 64 blocks of 0xa0 + 79 used flags */

/* One track's data. */
#define MU_PORT_TR_VEL 0x80u         /* u8[64]: velocity, 0xff the track's */
#define MU_PORT_TR_LEN 0xc0u         /* u8[64]: step LEN, 0xff the track's */
#define MU_PORT_TR_COND 0x140u       /* u8[64]: PROB/condition, 0xff none */
#define MU_PORT_TR_NOTES 0x1c0u      /* u8[64][8]: note then chord intervals */
#define MU_PORT_TR_NOTE 0x3c0u       /* u8: the track's NOTE */
#define MU_PORT_TR_LEN_OFFSET 0x3c2u /* s8: the track's LEN */
#define MU_PORT_WORD_TRIG 0x01u

/* One step's lock block. */
#define MU_PORT_LK_STEP 0xa0u /* a step's 79 pairs, then its count at +0x9f */
#define MU_PORT_LK_SLOTS 79u
#define MU_PORT_LK_COUNT 0x9fu
#define MU_PORT_LK_USED 0x2800u /* after the 64 blocks: a slot is locked on some step */

#define MU_PORT_NATIVE_BYTES (MU_PORT_TRACK_STRIDE + MU_PORT_TRACK_LOCKS)

/* The firmware's DDR window: the pattern/project buffers live there; anything else is not one. */
#define MU_PORT_DDR_LO 0x40000000u
#define MU_PORT_DDR_HI 0x48000000u

/* The hook bus's raw event fields (not a C struct: core's constructors write them) */
#define MU_PORT_EV_CODE_OFFSET 12u  /* ev_key: key id; ev_enc: encoder 1-8 */
#define MU_PORT_EV_VALUE_OFFSET 16u /* ev_key: flags; ev_enc: signed delta */

/* The UI task's screen state, measured on OS 1.44. */
#define MU_PORT_BRAIN_VIEW_OFFSET 0x54u
#define MU_PORT_BRAIN_OVERLAY_OFFSET 0x5cu
#define MU_PORT_CTRL_REDRAW_OFFSET 0x20u

/* The key-LED setter and the sound slots MUTINY's accent reads. */
/* OS 1.44: sequencer key page, measured as a big-endian u32. */
#define MU_PORT_PAGE_AT 0x41368ce8u
#define MU_PORT_LED_SET_AT 0x40016e62u
#define MU_PORT_SOUND_FREQ_SLOT 55
#define MU_PORT_SOUND_VOL_SLOT 72

/* The LEN site: six stock bytes replaced by the jsr to mut_site_len. The entry is assembly and is
 * not C-callable; see port144.h's ABI note below. */
#define MU_PORT_LEN_SITE 0x40094688u
#define MU_PORT_LEN_SITE_STOCK "7f2900c0b287"

/* Compile-time layout checks. A failure is a target/header mismatch, not a runtime condition. */
#define MU_PORT_STATIC_ASSERT(id, cond) typedef char mu_port_assert_##id[(cond) ? 1 : -1]

/* The pattern's eight track blocks end exactly where its lock table starts. */
MU_PORT_STATIC_ASSERT(lock_base, MU_PORT_LOCK_BASE == 8u * MU_PORT_TRACK_STRIDE);
/* A track's step words, note field and LEN default lie inside its 976 bytes and do not overlap. */
MU_PORT_STATIC_ASSERT(notes_end, MU_PORT_TR_NOTES + 64u * 8u == MU_PORT_TR_NOTE);
MU_PORT_STATIC_ASSERT(note_before_len, MU_PORT_TR_NOTE < MU_PORT_TR_LEN_OFFSET);
MU_PORT_STATIC_ASSERT(len_in_track, MU_PORT_TR_LEN_OFFSET < MU_PORT_TRACK_STRIDE);
/* A lock area is 64 blocks of 0xa0, then one 79-byte used-flag row. */
MU_PORT_STATIC_ASSERT(lock_blocks, MU_PORT_LK_STEP * 64u == MU_PORT_LK_USED);
MU_PORT_STATIC_ASSERT(lock_count, MU_PORT_LK_COUNT == MU_PORT_LK_STEP - 1u);
MU_PORT_STATIC_ASSERT(lock_pairs, MU_PORT_LK_SLOTS * 2u <= MU_PORT_LK_COUNT);
MU_PORT_STATIC_ASSERT(lock_track, MU_PORT_LK_USED + MU_PORT_LK_SLOTS == MU_PORT_TRACK_LOCKS);

/* The raw event fields are 32-bit words at +12 and +16. */
struct mu_port_event_fields {
    uint8_t before_code[MU_PORT_EV_CODE_OFFSET];
    uint32_t code;
    uint32_t value;
};
MU_PORT_STATIC_ASSERT(ev_code_offset,
                      offsetof(struct mu_port_event_fields, code) == MU_PORT_EV_CODE_OFFSET);
MU_PORT_STATIC_ASSERT(ev_value_offset,
                      offsetof(struct mu_port_event_fields, value) == MU_PORT_EV_VALUE_OFFSET);
MU_PORT_STATIC_ASSERT(ev_size, sizeof(struct mu_port_event_fields) == MU_PORT_EV_VALUE_OFFSET + 4u);

/* The event fields as the hook bus constructs them. Read-only: the dispatcher owns the event. */
static inline uint32_t mu_port_ev_code(const void *ev) {
    return *(const uint32_t *)((const uint8_t *)ev + MU_PORT_EV_CODE_OFFSET);
}

static inline uint32_t mu_port_ev_flags(const void *ev) {
    return *(const uint32_t *)((const uint8_t *)ev + MU_PORT_EV_VALUE_OFFSET);
}

static inline int32_t mu_port_ev_delta(const void *ev) {
    return *(const int32_t *)((const uint8_t *)ev + MU_PORT_EV_VALUE_OFFSET);
}

/* A native byte's offset in the pattern buffer: 0..975 the track's data, then its lock area.
 * The caller bounds track (0-3) and off (0..MU_PORT_NATIVE_BYTES-1); this is the measured layout,
 * not a bounds check. Host-tested without firmware. */
static inline uint32_t mu_port_native_offset(uint32_t track, uint32_t off) {
    if (off < MU_PORT_TRACK_STRIDE)
        return MU_PORT_TRACK_STRIDE * track + off;
    return MU_PORT_LOCK_BASE + MU_PORT_TRACK_LOCKS * track + (off - MU_PORT_TRACK_STRIDE);
}

/* The firmware reads (UI task unless noted) */
void *mu_port_pattern(void);
void *mu_port_project(void);
int mu_port_playing(void);
uint32_t mu_port_page(void);
uint32_t mu_port_clock_last(uint32_t track);
uint32_t mu_port_clock_parity(uint32_t track);
int mu_port_synth_track_active(void);

/* A stock menu/browser overlay is over the pages. brain: the key dispatcher's object. */
int mu_port_overlay_open(const void *brain);
/* Ask the UI for a redraw on its next frame. ctrl: the ev_tick control object. */
void mu_port_request_redraw(void *ctrl);

/* The key-LED setter. mgr: the LedManager; led 1-16; mode 1 off or 2 lit; colour is a stock palette
 * index. The first setter of an LED in a frame wins. UI task. */
void mu_port_led_set(void *mgr, int32_t led, int32_t mode, int32_t colour);

/* A device view of `track` in the live pattern, for commit.c's planner. The caller owns the context
 * for one operation; the port retains no pointer. ready() returns 0 and leaves *dev untouched when
 * fw_pattern is not in the DDR window. */
struct mu_port_native {
    uint8_t *pattern; /* the live pattern the offsets refer to, bound for one operation */
    uint32_t track;
};
struct mu_device;
void mu_port_native_device(struct mu_port_native *ctx, struct mu_device *dev, uint32_t track);
int mu_port_native_ready(struct mu_port_native *ctx, struct mu_device *dev, uint32_t track);

/* A pointer-derived guard for the live pattern/project buffers: pattern ^ (project >> 4). It is not
 * collision-free and not a semantic identity; a same-address replacement, a reload and A->B->A are
 * indistinguishable to it. */
uint32_t mu_port_buffer_guard(void);

/* Assembly ABI: the LEN site.
 * mut_site_len (len.s) is a hook entry, not C: no prototype and it must not be called as one.
 * Entry: d4 = track, d3 = step, a1 = a0 + step, d0 arbitrary, d1 = -1 (the stock operand). It calls
 * mut_on_len(track, step, length, track_data), returns the LEN in d7 and leaves the condition codes
 * of the stock `cmp.l d7,d1` for the stock `beq`. It preserves d0-d1/a0-a1, does not use d2 and
 * clobbers only d7 and the flags. Stock site 0x40094688, six bytes 7f2900c0b287. */

#endif
