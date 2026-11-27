/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk ARR sketchpad with the scheduling rules of Zac Kyoti's CLYPS
 * and private rows.s (MIT, LICENSE.kyoti). Private OS 1.40C emulator gate.
 * A01 is the home pattern. A source reference changes a stock builder argument.
 * Neither the module nor an event slot holds a pointer to another module.
 */
#include <stdint.h>
#include "modwerk_module.h"

#ifdef CLYPS_HOST_TEST
#include "tests/platform.h"
#else
#define BYTE(a) (*(volatile const uint8_t *)(uintptr_t)(a))
#define LONG(a) (*(volatile const uint32_t *)(uintptr_t)(a))
#endif
#define RUNNING LONG(0x800065b8)
#define ARRANGER LONG(0x460d1aec)
#define GRID_REC LONG(0x460d1736)
#define LIVE_REC LONG(0x460d172a)
#define REC_HELD LONG(0x460d1726)
#define ARR 0x1f
#define PLAY 0x28
#define STOP 0x27
#define YES 0x31
#define NO 0x32
#define SRC 0x22
#include "meta_focus.h"
#define TRACKS 8
#define BANK_BASE 0x400e21e0u
#define PATTERN_BYTES 0x8ed8u

/* The eight four-bit references always publish as one aligned word. At STOP
 * requests apply immediately. During PLAY only the stock wrap commits them. */
static volatile uint32_t playing, requested;
static uint32_t rows[16];
static uint16_t defined;
static volatile unsigned bank_read_active;
static unsigned track, row_view, armed, visible, refused, slot;
static uint32_t consumed[2];
static unsigned locked;
static unsigned src_list, src_cursor;

/* Project controls have no track-machine descriptor. The base must also
 * arbitrate modal ownership before dispatching events to this adapter. */
static int stock_window(void)
{
    /* Stock message-window handle (OS 1.40C message routine), shared SETUP
     * window, sample browser, Grain popup and stock YES/NO dialog. */
    return LONG(0x460d1e70u) || LONG(0x460d175cu) ||
           LONG(0x460e70e0u) || LONG(0x460e5e30u) || LONG(0x460e5cd0u);
}

#ifndef CLYPS_PERFORMANCE
static int stock_src_available(void)
{
    return !BYTE(0x80000015u) && BYTE(0x46c7d8d8u) == 0 &&
           !stock_window() &&
           !(BYTE(0x46100b1bu) & 6u) && !GRID_REC && !LIVE_REC && !REC_HELD;
}

#endif

/* Row IDs are one-based. Zero means no complete row transaction. */
static volatile unsigned last_row, pending_row;
#ifdef CLYPS_PERFORMANCE
enum panel_view { NATIVE, ROW, CLIP, SETUP };
static enum panel_view view, last_view = CLIP;   /* Clip View first (D39.02) */
static unsigned mode, operation, end_of_path, lock_note, mem_track, seen_stock = TRACKS, was_window;
#endif
static unsigned first_row, zoom, editing, draft, missing;
#ifdef CLYPS_PERFORMANCE
/* Provenance (D33): one byte per lane, the one-based Row its source came from; 0 is unknown
 * (home, a Clip launch, or a cell edited after launch). Requested and playing stay distinct and
 * the stock wrap commits both words with the sources. */
static volatile uint32_t org_play[2], org_req[2];
static unsigned origin(const volatile uint32_t *o, unsigned lane)
{
    return (o[lane >> 2] >> (8 * (lane & 3))) & 255u;
}
static void set_origin(volatile uint32_t *o, unsigned lane, unsigned row)
{
    unsigned shift = 8 * (lane & 3);
    o[lane >> 2] = (o[lane >> 2] & ~(255u << shift)) | (row << shift);
}
#define ORIGIN_COMMIT() (org_play[0] = org_req[0], org_play[1] = org_req[1])
#define ORIGIN_CLEAR() (org_play[0] = org_play[1] = org_req[0] = org_req[1] = 0)
#else
#define ORIGIN_COMMIT() ((void)0)
#define ORIGIN_CLEAR() ((void)0)
#endif
static unsigned last_run, last_seen_row, last_seen_pending;
#ifdef CLYPS_PERFORMANCE
/* The performance adapter retains its only row namespace until stock can
 * certify a project incarnation and bank generation. The current hooks cannot. */
static volatile unsigned bank_uncertain;
static unsigned last_live;
#endif
static uint32_t last_seen_sources;
#ifndef CLYPS_HOST_TEST
static unsigned critical(void)
{
    unsigned sr;
    __asm__ volatile ("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) :: "memory","cc");
    return sr;
}

static void restore(unsigned sr)
{
    __asm__ volatile ("move.w %0,%%sr" :: "d"(sr) : "memory","cc");
}

#endif

static void focus_row(unsigned r)
{
    slot = r;
#ifdef CLYPS_PERFORMANCE
    enum { WINDOW = 5 };            /* Panorama Full Grid shows five rows (D31) */
#else
    enum { WINDOW = 4 };
#endif
    if (r < first_row) first_row = r;
    if (r >= first_row+WINDOW) first_row = r-(WINDOW-1);
}

/* Physical row state also covers a modifier held before the module loaded. */
static int alone(unsigned code)
{
    for (unsigned row = 0; row < 8; ++row) {
        unsigned allowed = row == code / 8 ? 1u << (code % 8) : 0;
        if (BYTE(0x46100b18u + row) & ~allowed)
            return 0;
    }
    return 1;
}

static int grid(unsigned pattern)
{
    uintptr_t trailer = BANK_BASE + pattern * PATTERN_BYTES + 0x8e50u;
    return BYTE(trailer + 0) == 0 && BYTE(trailer + 1) == 16 && BYTE(trailer + 2) == 2 && BYTE(trailer + 3) == 16 && BYTE(trailer + 4) == 2 && BYTE(trailer + 5) == 0 &&
           BYTE(trailer + 7) == BYTE(BANK_BASE + 0x8e57u);
}

static int supported(void)
{
#ifdef CLYPS_PERFORMANCE
    if (bank_uncertain) return 0;
#endif
    return !bank_read_active && !BYTE(0x80000034u) && !ARRANGER && !LONG(0x80006546) && !(BYTE(0x80000028) & 1) &&
           BYTE(0x800065bd) == 0 && BYTE(0x800065be) == 0 &&
           BYTE(0x800065bf) == 0 && BYTE(0x800065c0) == 0 && grid(0);
}

static int valid(unsigned refs)
{
    if (!supported())
        return 0;
    for (unsigned t = 0; t < TRACKS; ++t, refs >>= 4)
        if (!grid(refs & 15u))
            return 0;
    return 1;
}

#ifdef CLYPS_PERFORMANCE
/* Sequence occupancy (D37.03, D38.02): one shared answer to "does this track of this pattern
 * hold a sequence?" for Clip View, the Panorama, Capture and Cell Source. A grid source plays
 * steps 1-16 only, so only that page counts: the trig, trigless and four recorder masks of the
 * audio track record (pattern + t * 0x91a; each 64-step mask keeps steps 1-16 in bytes 6-7).
 * Conditional, micro-timed and locked trigs set the trig or trigless bit, so they count; a
 * silent sequence is not an empty one. Locks without a trig play nothing and do not count.
 * The UI tick rescans one pattern per call (12 byte reads per track), never the audio path or
 * the frame, so a full refresh takes 16 ticks and edits show within a quarter second. */
#define TRACK_BYTES 0x91au
static const unsigned char occ_bytes[12] = {0x06, 0x07, 0x0e, 0x0f, 0x26, 0x27, 0x2e, 0x2f, 0x36, 0x37, 0x3e, 0x3f};
static uint16_t occ[TRACKS], usable;           /* occ[t] bit p: A(p+1) has a sequence on track t */
static unsigned occ_next, occ_known;            /* occ_known: patterns scanned since the reset */

static void occupancy_scan(unsigned p)
{
    uintptr_t base = BANK_BASE + p * PATTERN_BYTES;
    uint16_t bit = (uint16_t)(1u << p);
    if (grid(p)) usable |= bit; else usable &= (uint16_t)~bit;
    for (unsigned t = 0; t < TRACKS; ++t) {
        unsigned any = 0;
        for (unsigned i = 0; i < sizeof occ_bytes; ++i) any |= BYTE(base + t * TRACK_BYTES + occ_bytes[i]);
        if (any) occ[t] |= bit; else occ[t] &= (uint16_t)~bit;
    }
    occ_known |= bit;
}

static void occupancy_step(void)
{
    if (bank_read_active || BYTE(0x80000034u)) return;   /* never read a bank stock is replacing */
    occupancy_scan(occ_next);
    occ_next = (occ_next + 1) & 15u;
}

static void occupancy_all(void)
{
    if (bank_read_active || BYTE(0x80000034u)) return;
    for (unsigned p = 0; p < 16; ++p) occupancy_scan(p);
}

static void occupancy_reset(void)
{
    for (unsigned t = 0; t < TRACKS; ++t) occ[t] = 0;
    usable = 0;
    occ_next = occ_known = 0;
}

static uint32_t occupancy_sig(void)
{
    uint32_t s = (uint32_t)usable << 16 | occ_known;
    for (unsigned t = 0; t < TRACKS; ++t) s = (s << 3 | s >> 29) ^ occ[t];
    return s;
}

/* Until a pattern is scanned it counts as available: never hide material by default. */
enum { SLOT_EMPTY, SLOT_AVAILABLE, SLOT_FOREIGN };
static unsigned slot_state(unsigned t, unsigned p)
{
    if (!(occ_known >> p & 1u)) return SLOT_AVAILABLE;
    if (!(usable >> p & 1u)) return SLOT_FOREIGN;
    return occ[t & 7u] >> p & 1u ? SLOT_AVAILABLE : SLOT_EMPTY;
}
#endif

/* These notifications bracket the stock card task's serialized bank reader.
 * Only bank A is qualified. Never read its grid while stock replaces it. */
#ifdef CLYPS_PERFORMANCE
static void suspend_bank(void)
{
    bank_uncertain = 1;
    playing = requested = pending_row = last_row = 0;
    ORIGIN_CLEAR();
    view = NATIVE;
    mode = visible = locked = operation = row_view = 0;
}
#endif

void clyps_bank_load(unsigned mask, uint32_t caller)
{
    (void)caller;
    if (!(mask & 1u)) return;
    unsigned sr = critical();
    bank_read_active = 1;
#ifdef CLYPS_PERFORMANCE
    suspend_bank();
#endif
    restore(sr);
}

unsigned clyps_bank_loaded(void)
{
    bank_read_active = 0;
    return 0;
}

/* Stock initializes project state on change and reload as well as on NEW. */
void clyps_project_init(void)
{
    unsigned sr = critical();
#ifdef CLYPS_PERFORMANCE
    if (defined || playing || requested || pending_row || bank_read_active)
        suspend_bank();
    view = NATIVE;
    mode = operation = end_of_path = lock_note = was_window = 0;
    last_view = CLIP;
    seen_stock = TRACKS;
    occupancy_reset();
    ORIGIN_CLEAR();
#endif
    playing = requested = 0;
    src_list = src_cursor = 0;
#ifndef CLYPS_PERFORMANCE
    defined = 0;
#endif
    visible = locked = armed = row_view = refused = track = slot = 0;
    /* Held edges retain their original owner across the UI transition. */
    last_row = pending_row = first_row = zoom = editing = draft = missing = 0;
    restore(sr);
}

void clyps_wrap(void)
{
    unsigned refs = requested;
    if (bank_read_active || (!refs && !playing && !pending_row))
        return;
    if (valid(refs) && RUNNING && !GRID_REC && !LIVE_REC && !REC_HELD) {
        playing = refs;
        ORIGIN_COMMIT();
        if (pending_row) last_row = pending_row;
    } else {
        playing = requested = last_row = 0;
        ORIGIN_CLEAR();
    }
    pending_row = 0;
}

void clyps_audio_source(int *pattern, unsigned t, unsigned bank_word)
{
    unsigned refs = playing;
    if (!refs || t >= TRACKS || *pattern != 0 || (bank_word & 255u) || !supported())
        return;
    unsigned source = (refs >> (4 * t)) & 15u;
    if (grid(source))
        *pattern = (int)source;
}

#ifdef CLYPS_PERFORMANCE
/* lane TRACKS: every lane comes from `from`; otherwise only that lane does. */
static void submit_from(unsigned refs, unsigned row, unsigned lane, unsigned from)
#else
static void submit(unsigned refs, unsigned row)
#endif
{
    refused = !valid(refs) || (refs && (GRID_REC || LIVE_REC || REC_HELD));
    if (refused)
        return;
    unsigned sr = critical();
#ifdef CLYPS_PERFORMANCE
    if (bank_uncertain) {
        refused = 1;
        restore(sr);
        return;
    }
#endif
    pending_row = row;
    requested = refs;
#ifdef CLYPS_PERFORMANCE
    if (lane < TRACKS) set_origin(org_req, lane, from);
    else org_req[0] = org_req[1] = from * 0x01010101u;
#endif
    if (!RUNNING) {
        playing = refs;
        ORIGIN_COMMIT();
        if (row) last_row = row;
        pending_row = 0;
    }
    restore(sr);
}
#ifdef CLYPS_PERFORMANCE
static void submit(unsigned refs, unsigned row) { submit_from(refs, row, TRACKS, row); }
#endif

#ifndef CLYPS_HOST_TEST
static void redraw(void)
{
    ((void (*)(int))0x4004d948u)(-1);
}

#endif

static void submit_lane(unsigned lane, unsigned ref)
{
    unsigned shift = 4 * lane;
#ifdef CLYPS_PERFORMANCE
    submit_from((requested & ~(15u << shift)) | (ref << shift), 0, lane, 0);
#else
    submit((requested & ~(15u << shift)) | (ref << shift), 0);
#endif
}

#ifndef CLYPS_PERFORMANCE
/* Suspend a stale list before handling the next input or display frame. */
static void check_src_context(void)
{
    if ((visible && stock_window()) ||
        (src_list && (!stock_src_available() || BYTE(0x100b14ccu) != track))) {
        /* Only YES in Row Edit publishes draft to rows[]. */
        editing = draft = armed = missing = row_view = 0;
        src_list = visible = 0;
        locked = !!(playing || requested);
    }
}

#endif
#ifdef CLYPS_PERFORMANCE
#include "performance_controls.h"
#else
#include "session_controls.h"
#endif

void module_tick(struct modwerk_runtime_api *api)
{
#ifdef CLYPS_PERFORMANCE
    unsigned seen_track = track;
    performance_context();
    /* Beat markers and BPM are drawn by CLYPS in Clip: refresh them with the music. */
    unsigned live = (BYTE(0x800065b5u) >> 2 & 3u) | LONG(0x8000181cu) << 2;
    /* A stock popup (TEMPO, a toast) suspends CLYPS without leaving it: redraw when it closes. */
    unsigned window = !!stock_window();
    uint32_t seen_occ = occupancy_sig();
    if (mode) occupancy_step();
    if (visible && (track != seen_track || live != last_live || window != was_window ||
                    seen_occ != occupancy_sig())) redraw();
    last_live = live;
    was_window = window;
#else
    check_src_context();
#endif
    if (!bank_read_active && (playing || requested || pending_row || last_row) && !supported()) {
        playing = requested = last_row = pending_row = 0;
        ORIGIN_CLEAR();
        refused = 1;
    }
    if (visible && (playing != last_seen_sources || last_row != last_seen_row || pending_row != last_seen_pending || RUNNING != last_run)) {
        last_seen_sources = playing;
        last_seen_row = last_row;
        last_seen_pending = pending_row;
        last_run = RUNNING;
        redraw();
    }
    api->value = 0xc0000000u | (visible << 27) | (row_view << 26) |
                 (armed << 25) | (refused << 24) | ((requested & 0xfffu) << 12) | (playing & 0xfffu);
}

#include "session_view.h"
#ifdef CLYPS_PERFORMANCE
#include "performance_view.h"
#endif

void module_draw(unsigned char *frame)
{
#ifdef CLYPS_PERFORMANCE
    performance_context();
    if (frame && !stock_window()) {
        if (visible) performance_draw(frame);
        else if (locked) lock_draw(frame);   /* the stock page stays live under the edit lock */
    }
    return;
#else
    check_src_context();
#endif
    if (stock_window()) return;
    if ((!visible && !locked) || !frame)
        return;
    if (!locked) {
        if (src_list) src_draw(frame);
        else session_draw(frame);
        return;
    }
    uint32_t surface[7];
    const volatile uint32_t *stock = (const volatile uint32_t *)0x400bf10au;
    for (unsigned i = 0; i < 7; ++i)
        surface[i] = stock[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
    for (unsigned i = 0; i < 1024; ++i)
        frame[i] = 0;
    void (*text)(uint32_t, void *, int, int, int, const char *) =
        (void (*)(uint32_t, void *, int, int, int, const char *))0x40012bd8u;
    text(0x400ba876u, surface, 2, 52, -1, "NATIVE EDIT LOCKED");
    text(0x400ba876u, surface, 2, 36, -1, "ARR: BACK TO CLIPS");
    text(0x400ba876u, surface, 2, 20, -1, "STOP THEN YES");
    text(0x400ba876u, surface, 2, 4, -1, supported() ? "EDIT GLOBAL A01" : "CHECK BANK / CLOCK");
}
