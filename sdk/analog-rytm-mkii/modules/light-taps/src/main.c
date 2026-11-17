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

#include "analog-rytm-mk2/store.h"

STORE_FIELD(light_taps_enabled);
extern void core_additem(void *, const void *);
extern void light_taps_label(void);

#define TICKS (*(volatile unsigned *)0x42f92114)   // the panel task's counter, kept below 4096
#define QUEUE (*(void **)0x40285980)               // the panel driver's UI event queue
#define STRIKE_CODES (*(int **)0x40285968)         // pad index -> a strike's code
#define NOW (*(volatile unsigned *)0x8000fe54)     // the time stamp the driver puts in an event
typedef void (*post_t)(void *queue, void *event);
#define POST ((post_t)0x400013b2)

#define PADS 12
#define PAD_KEY 0x90
#define TAP_MS 3
#define TAP_VELOCITY 8                             // of 0-255, as the driver's strikes
#define TAPS 8

static volatile int on;                // the setting, cached for the panel task
static volatile unsigned pending[PADS];   // 1 + the tick of a press still waiting for its strike, else 0
static volatile unsigned struck[PADS];    // 1 + the tick of the pad's last strike, else 0
// The driver's strike record: type 3, the pad's strike code, the velocity, a time stamp.
static struct { unsigned char type, unused[3]; int code; unsigned char velocity, unused2[3]; unsigned time; } taps[TAPS];
static unsigned next_tap;

static unsigned since(unsigned mark, unsigned now)
{
    return (now - (mark - 1)) & 0xfff;
}

static void read_setting(void)
{
    on = core_store_get(STORE(light_taps_enabled), 0, 0) != 0;
}

// Called from hooks.s for each event the panel driver posts.
void light_taps_event(char *ev)
{
    unsigned now = TICKS & 0xfff;
    int p;
    if (ev[0] == 0) {
        unsigned pad = (unsigned)*(int *)(ev + 4) - PAD_KEY;
        if (pad < PADS && (ev[11] & 1) && !(struck[pad] && since(struck[pad], now) <= TAP_MS))
            pending[pad] = 1 + now;
    } else if (ev[0] == 3) {
        for (p = 0; p < PADS; p++)
            if (STRIKE_CODES[p] == *(int *)(ev + 4)) {
                pending[p] = 0;
                struck[p] = 1 + now;
            }
    }
}

// Called from hooks.s by the panel task, about every millisecond.
void light_taps_poll(void)
{
    unsigned now = TICKS & 0xfff;
    int p, code;
    for (p = 0; p < PADS; p++) {
        if (!pending[p] || since(pending[p], now) < TAP_MS)
            continue;
        pending[p] = 0;
        code = STRIKE_CODES[p];
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
