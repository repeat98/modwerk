// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II's diagnostics log: the Octatrack's (sdk/machines/octatrack/elekloader/diag.c), in its layout
// (diag.h, an exact copy of its header, so one layout serves both and the site reads either with device-log.ts), with what
// this unit offers. Development bases only, read over the link: `diag` gives the log's address and size, the host
// reads it with `mem`.
//
// What differs from the Octatrack's, and why:
// - The log is in the base's .bss, not battery RAM (none is known on this unit): it starts empty at every start, so
//   `boot` is 1 and an incident lasts until the unit restarts. A freeze that ends in a restart is lost with it.
// - No CPU or DSP meters (the base has no status.c here): load and incident meters are 0.
// - FREEZE as the Octatrack's: the frame interrupt (ev_frame_params) counts frames since the UI tick; past five seconds
//   of frames it keeps the moment, and the next tick adds it with how many frames the UI stood still.
// - Load windows of five minutes, by frames: `samples` the UI ticks in the window, `tick_gap` the longest run of frames
//   without a tick, `frame_gap` 0 (no free-running timer is used here).
// - Keys: the last 16 panel keys pressed (ev_key, takes none), in every incident. No machines, FX, screen or tempo.
#include <stdint.h>
#include "diag.h"                       // the Octatrack's, byte for byte (sdk/tests/test_dn2_link.py checks it)

#define FRAME_HZ FRAME_HZ_MEASURED          // frame interrupts a second (measured on a unit, base.json's cflags)
#define TICK_HZ TICK_HZ_MEASURED            // UI ticks a second (the same)
#define FREEZE_FRAMES (5u * FRAME_HZ)       // five seconds without a UI tick: longer than a project load
#define WINDOW_FRAMES (300u * FRAME_HZ)     // a load window: five minutes

static struct diag_log mw_diag_log;          // .bss: cleared at every start
static volatile uint8_t keys[16];
static volatile uint32_t key_count;
static volatile uint32_t frames, since_tick, window_ticks, window_gap, window_start;
static uint32_t ticks, started;

uint32_t mw_diag_frames(void) { return frames; }
const volatile void *mw_diag_log_at(void) { return &mw_diag_log; }
uint32_t mw_diag_log_bytes(void) { return sizeof mw_diag_log; }

// What the unit is doing, for an incident: here only the keys (the rest stays 0).
static void context(volatile struct diag_incident *r, unsigned kind)
{
    uint32_t k = key_count;
    r->kind = (uint16_t)kind;
    for (unsigned i = 0; i < 16u; ++i) r->keys[i] = k + i >= 16u ? keys[(k + i) % 16u] : 0xffu;
}
// The next incident: its seq is 0 while it is written and set last, so a reader never takes half of one.
static volatile struct diag_incident *slot(volatile struct diag_log *l)
{
    volatile struct diag_incident *r = &l->incident[l->incidents % DIAG_INCIDENTS];
    for (unsigned i = 0; i < sizeof *r; ++i) ((volatile uint8_t *)r)[i] = 0;
    return r;
}
static void push(volatile struct diag_log *l, volatile struct diag_incident *r)
{
    l->seq = l->seq + 1u;
    r->seq = l->seq;
    l->incidents = l->incidents + 1u;
}
static void add(volatile struct diag_log *l, unsigned kind, uint32_t a)
{
    volatile struct diag_incident *r = slot(l);
    context(r, kind);
    r->boot = l->boot, r->second = frames / FRAME_HZ, r->a = a;
    push(l, r);
}

// ev_frame_params, in the frame interrupt: counts, and keeps the moment a freeze began. Takes nothing.
void mw_diag_frame(int16_t *values, int stride)
{
    volatile struct diag_log *l = &mw_diag_log;
    uint32_t s = ++since_tick;
    (void)values;
    (void)stride;
    ++frames;
    if (s > window_gap) window_gap = s;
    if (s == FREEZE_FRAMES && l->magic == DIAG_MAGIC && !l->freeze_state) {
        volatile struct diag_incident *r = &l->freeze;
        for (unsigned i = 0; i < sizeof *r; ++i) ((volatile uint8_t *)r)[i] = 0;
        context(r, DIAG_FREEZE);
        r->boot = l->boot, r->second = frames / FRAME_HZ;
        l->freeze_state = 1;
    }
}

// ev_key: remembers presses, takes none.
int mw_diag_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    (void)brain;
    if (flags & 1) keys[key_count++ % 16u] = (uint8_t)key;
    return 0;
}

static void start(volatile struct diag_log *l)
{
    l->nonce = frames * 2654435761u ^ (uint32_t)(uintptr_t)l;
    l->version = DIAG_VERSION, l->magic = DIAG_MAGIC;
    l->boot = 1;
    add(l, DIAG_START, 0);
    window_start = frames;
}

// ev_tick: the incidents the frame interrupt kept, and a load record every five minutes.
void mw_diag_tick(void)
{
    volatile struct diag_log *l = &mw_diag_log;
    uint32_t stood = since_tick;
    since_tick = 0;
    ++ticks, ++window_ticks;
    if (!started) {
        started = 1;
        start(l);
        return;
    }
    if (l->freeze_state == 1) {                  // the UI moved again: the freeze, with how long it stood still
        volatile struct diag_incident *r = slot(l);
        const volatile uint8_t *from = (const volatile uint8_t *)&l->freeze;
        for (unsigned i = sizeof r->seq; i < sizeof *r; ++i) ((volatile uint8_t *)r)[i] = from[i];
        r->a = stood;
        push(l, r);
        l->freeze_state = 2;
    }
    if (frames - window_start >= WINDOW_FRAMES) {
        volatile struct diag_load *d = &l->load[l->loads % DIAG_LOADS];
        d->seq = 0;
        d->boot = l->boot, d->minute = frames / (60u * FRAME_HZ);
        d->cpu_mean = d->cpu_peak = d->dsp0_mean = d->dsp0_peak = d->dsp1_mean = d->dsp1_peak = 0;
        d->samples = (uint16_t)(window_ticks > 0xffffu ? 0xffffu : window_ticks);
        d->playing = 0, d->frame_gap = 0;
        d->tick_gap = (uint16_t)(window_gap > 0xffffu ? 0xffffu : window_gap);
        l->seq = l->seq + 1u;
        d->seq = l->seq;
        l->loads = l->loads + 1u;
        window_start = frames, window_ticks = 0, window_gap = 0;
    }
    if (l->freeze_state == 2 && stood < FREEZE_FRAMES) l->freeze_state = 0;
}
