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
static enum panel_view view;
static unsigned mode, operation, end_of_path;
#endif
static unsigned first_row, zoom, editing, draft, missing;
static unsigned last_run, last_seen_row, last_seen_pending;
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
    if (r < first_row) first_row = r;
    if (r >= first_row+4) first_row = r-3;
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

/* These notifications bracket the stock card task's serialized bank reader.
 * Only bank A is qualified. Never read its grid while stock replaces it. */
void clyps_bank_load(unsigned mask, uint32_t caller)
{
    (void)caller;
    bank_read_active = mask & 1u;
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
    view = NATIVE;
    mode = operation = end_of_path = 0;
#endif
    playing = requested = 0;
    src_list = src_cursor = 0;
    defined = visible = locked = armed = row_view = refused = track = slot = 0;
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
        if (pending_row) last_row = pending_row;
    } else {
        playing = requested = last_row = 0;
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

static void submit(unsigned refs, unsigned row)
{
    refused = !valid(refs) || (refs && (GRID_REC || LIVE_REC || REC_HELD));
    if (refused)
        return;
    unsigned sr = critical();
    pending_row = row;
    requested = refs;
    if (!RUNNING) {
        playing = refs;
        if (row) last_row = row;
        pending_row = 0;
    }
    restore(sr);
}

#ifndef CLYPS_HOST_TEST
static void redraw(void)
{
    ((void (*)(int))0x4004d948u)(-1);
}

#endif

static void submit_lane(unsigned lane, unsigned ref)
{
    unsigned shift = 4 * lane;
    submit((requested & ~(15u << shift)) | (ref << shift), 0);
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
    performance_context();
#else
    check_src_context();
#endif
    if (!bank_read_active && (playing || requested || pending_row || last_row) && !supported()) {
        playing = requested = last_row = pending_row = 0;
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
    if (visible && frame && !stock_window()) {
        performance_draw(frame);
        return;
    }
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
