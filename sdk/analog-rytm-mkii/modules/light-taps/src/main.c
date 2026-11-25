// SPDX-License-Identifier: GPL-3.0-or-later
// Light Taps for the Analog Rytm MKII, OS 1.74.
//
// The pads' panel posts a pad's key press (keys 0x90-0x9b are pads 0-11) and,
// for a firm hit, a strike with its velocity in the same millisecond. A light
// tap gets a press and a release but no strike, so stock plays nothing (mutes
// and pad selection, which use the press, still work). With LIGHT TAPS on,
// a pad press with no strike TAP_MS later gets one at TAP_VELOCITY: the
// record the panel driver builds, posted to the driver's queue, so the OS
// plays it as any hit. A strike can come just before its press, so a press
// within TAP_MS after its pad's strike waits for nothing.
//
// The switch is a row in the GLOBAL menu, saved with the project.

#ifndef LIGHT_TAPS_HOST
#include "analog-rytm-mk2/store.h"

STORE_FIELD(light_taps_enabled);
extern void core_additem(void *, const void *);
extern void light_taps_label(void);

#define QUEUE (*(void **)0x40285980)               // the panel driver's UI event queue
#define STRIKE_CODE(pad) ((*(int **)0x40285968)[pad])   // pad index -> a strike's code
#define NOW (*(volatile unsigned *)0x8000fe54)     // the time stamp the driver puts in an event
typedef void (*post_t)(void *queue, void *event);
#define POST ((post_t)0x400013b2)
#endif
// tests/tap_timing.c defines these four for the host and includes this file.

#define PADS 12
#define PAD_KEY 0x90
#define TAP_MS 3
#define TAP_VELOCITY 8                             // of 0-255, as the driver's strikes
#define TAPS 8

static volatile int on;                // the setting, cached for the panel task

// Time is this module's own millisecond count, one per panel task tick. The
// panel's counter (0x42f92114) wraps at 4096, so a stamp from it cannot tell a
// press 2 ms after a strike from one 4098 ms after it; this count wraps after
// 49 days, and unsigned subtraction measures across that wrap too.
static volatile unsigned ms;
static volatile unsigned char waiting[PADS];      // a press still waiting for its strike
static volatile unsigned pressed_at[PADS];
static volatile unsigned char recent[PADS];       // a strike in the last TAP_MS; light_taps_poll expires it
static volatile unsigned struck_at[PADS];
static volatile unsigned char held[PADS];          // pressed and not yet released
static volatile unsigned char releases_seen[PADS]; // this pad's releases reach us
// The driver's strike record: type 3, the pad's strike code, the velocity, a time stamp.
static struct { unsigned char type, unused[3]; int code; unsigned char velocity, unused2[3]; unsigned time; } taps[TAPS];
static unsigned next_tap;

#ifndef LIGHT_TAPS_HOST
static void read_setting(void)
{
    on = core_store_get(STORE(light_taps_enabled), 0, 0) != 0;
}
#endif

// Called from hooks.s for each event the panel driver posts.
void light_taps_event(char *ev)
{
    unsigned now = ms;
    int p;
    if (ev[0] == 0) {
        unsigned pad = (unsigned)*(int *)(ev + 4) - PAD_KEY;
        if (pad >= PADS)
            return;
        if (!(ev[11] & 1)) {            // a release
            held[pad] = 0;
            releases_seen[pad] = 1;
            return;
        }
        // A press while the pad is still held is a key repeat, not a new tap.
        // Only once a release has been seen on this pad, so that a panel which
        // posts no releases still plays every press.
        if (held[pad] && releases_seen[pad])
            return;
        held[pad] = 1;
        if (!(recent[pad] && now - struck_at[pad] <= TAP_MS)) {
            pressed_at[pad] = now;
            waiting[pad] = 1;
        }
    } else if (ev[0] == 3) {
        for (p = 0; p < PADS; p++)
            if (STRIKE_CODE(p) == *(int *)(ev + 4)) {
                waiting[p] = 0;
                struck_at[p] = now;
                recent[p] = 1;
            }
    }
}

// Called from hooks.s by the panel task, about every millisecond.
void light_taps_poll(void)
{
    unsigned now = ++ms;
    int p, code;
    for (p = 0; p < PADS; p++) {
        if (recent[p] && now - struck_at[p] > TAP_MS)
            recent[p] = 0;
        if (!waiting[p] || now - pressed_at[p] < TAP_MS)
            continue;
        waiting[p] = 0;
        code = STRIKE_CODE(p);
        if (!on || code < 0)
            continue;
        taps[next_tap].type = 3;
        taps[next_tap].code = code;
        taps[next_tap].velocity = TAP_VELOCITY;
        taps[next_tap].time = NOW;
        POST(QUEUE, &taps[next_tap]);
        next_tap = (next_tap + 1) % TAPS;
    }
}

#ifndef LIGHT_TAPS_HOST
// The GLOBAL menu row.
int light_taps_on(void)
{
    return core_store_get(STORE(light_taps_enabled), 0, 0) != 0;
}

static void toggle(void)
{
    core_store_set(STORE(light_taps_enabled), 0, 0, !light_taps_on());
    read_setting();
}

static int nothing(void) { return 0; }
static const void *const row[] = {light_taps_label, toggle, nothing, nothing};

// ev_settings: add the row after SYSTEM.
void light_taps_settings(void *menu)
{
    core_additem(menu, row);
}

// ev_tick: keep the cached setting current (a project load changes it).
void light_taps_tick(char *ctrl)
{
    (void)ctrl;
    read_setting();
}
#endif
