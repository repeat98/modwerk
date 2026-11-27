/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Track Solo for the Digitakt mk1 (OS 1.54), after the Octatrack mod: hear one track on its own.
 *
 *   Hold TRK, then hold UP   the active track plays alone while UP is held (TRK can be let go);
 *                            let go of UP and every track plays again.
 *   Hold TRK, press DOWN     latch: the active track plays alone until TRK + DOWN again. TRK + DOWN
 *                            on another track moves the solo there.
 * A small S and the track's number show in the top-right corner while a solo is on.
 *
 * How it works: seq-events' ev_fire_trig. While a solo is on, the other tracks' note trigs don't
 * fire (their lock trigs still do, so nothing else changes). Notes already sounding ring out, and the
 * stock mutes are never touched. The decision is made once per step at the trig test's read and
 * kept for the fire's second read, so both reads agree even if you let go in between. */
#include <stdint.h>
#include "digitakt-mk1/core3.h"
#include "digitakt-mk1/seq.h"

#define ACTIVE_TRACK (*(volatile int32_t *)ACTIVE_TRACK_AT)    /* 0-15, as ledcolors reads it */

#define E_KEY      12
#define E_FLAGS    16
#define F_REPEAT   0x08
#define F_RELEASE  0x10
#define F_DOWN     0x01                         /* the firmware's own "is it down" (0x400c33fc) */
#define IS_UP(f)   (!((f) & F_DOWN) || ((f) & F_RELEASE))
#define K_TRK      2
#define K_UP       14
#define K_DOWN     15

static volatile int32_t held = -1;              /* the track soloed while UP is held, or -1 */
static volatile int32_t latched = -1;           /* the latched solo, or -1 */
static int32_t trk_held, swallow_up, swallow_down;
static uint8_t silent[SQ_TRACKS];               /* this step's decision, from the first read */
static int32_t shown = -2, redraw;

static int32_t solo(void)
{
    return held >= 0 ? held : latched;
}

/* ---- the sequencer's fire, at interrupt level ------------------------------------------------------ */
void solo_trig(int32_t track, int32_t step, int32_t first, uint32_t *trig)
{
    (void)step;
    if (track < 0 || track >= SQ_TRACKS)
        return;
    if (first) {
        int32_t s = solo();
        silent[track] = (uint8_t)(s >= 0 && s != track);
    }
    if (silent[track])
        *trig &= ~SQ_TRIG;
}

/* ---- keys (UI task) -------------------------------------------------------------------------------- */
static int32_t active(void)
{
    int32_t t = ACTIVE_TRACK;
    return t >= 0 && t < SQ_TRACKS ? t : 0;
}

int32_t solo_key(void *brain, void *ev)
{
    int32_t key = *(int32_t *)((char *)ev + E_KEY);
    int32_t flags = *(int32_t *)((char *)ev + E_FLAGS);
    int32_t press = !IS_UP(flags) && !(flags & F_REPEAT);
    (void)brain;
    if (key == K_TRK)
        trk_held = !IS_UP(flags);
    if (key == K_UP && swallow_up) {            /* the UP we took: its repeats and its release */
        if (IS_UP(flags)) {
            swallow_up = 0;
            held = -1;
            redraw = 1;
        }
        return 1;
    }
    if (key == K_DOWN && swallow_down) {
        if (IS_UP(flags))
            swallow_down = 0;
        return 1;
    }
    if (!trk_held || !press)
        return 0;
    if (key == K_UP) {
        swallow_up = 1;
        held = active();
        redraw = 1;
        return 1;
    }
    if (key == K_DOWN) {
        int32_t t = active();
        swallow_down = 1;
        latched = latched == t ? -1 : t;
        redraw = 1;
        return 1;
    }
    return 0;
}

void solo_tick(void *ctrl)
{
    int32_t s = solo();
    if (s != shown || redraw) {
        shown = s;
        redraw = 0;
        *((uint8_t *)ctrl + 0x20) = 1;
    }
}

void solo_draw(void *bmp, void *ctrl)
{
    int32_t s = solo();
    (void)ctrl;
    if (s < 0)
        return;
    /* S and the track number (S1 .. S16), left of Ctrl All's ALL and Kit A/B's B */
    fw_fillrect(bmp, 87, 55, 101, 63, 0);
    fw_framerect(bmp, 87, 55, 101, 63, 1);
    fw_textf(bmp, fw_font5, 89, 57, 4, "S%d", s + 1);
}
