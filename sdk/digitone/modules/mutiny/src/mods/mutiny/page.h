/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's page: the stock-style TRIG page 2 drawing. A tiny canvas lets host tests render every
 * state into a 128x64 buffer. Geometry, fonts and labels follow the stock pages (Elekloader
 * fxkit-dn1, GPL-2.0-or-later). */
#ifndef MUTINY_PAGE_H
#define MUTINY_PAGE_H

#include "../../src/engine/engine.h"
#include "../../src/runtime/runtime.h" /* enum mu_play_source */
#include <stdint.h>

enum { MU_FONT_TITLE = 0, MU_FONT_LABEL = 1, MU_FONT_5 = 2 };

struct mu_canvas {
    void *ctx;
    void (*fill)(void *ctx, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour);
    void (*frame)(void *ctx, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour);
    void (*text)(void *ctx, uint8_t font, int32_t x, int32_t y, const char *s);
};

/* The page's state, gathered by the mod once per draw. */
struct mu_page_state {
    struct mu_track recipe;
    struct mu_preview preview;
    int32_t value[MU_KNOBS]; /* the values the cells show; MODEL as its index */
    uint32_t pages;          /* pages of 16 the ruler spans */
    uint16_t seed;           /* TB3P's 16-bit seed, shown as hex */
    int8_t scale;            /* the track's SCALE: -1 chromatic, from 0 the Digitone's */
    uint8_t visible;         /* the page is on screen */
    uint8_t play;            /* enum mu_play_source */
    uint8_t undo;            /* a commit can be undone with NO */
    uint8_t touched;         /* the knob showing its value, 0xff none */
    uint8_t shown;           /* the 4 s value display is active */
    uint8_t kept;            /* 0 none, 1 kept, 2 refused */
    uint8_t overload;        /* evolution is frozen after a scheduler overflow */
    uint8_t holding;         /* H's hold is active (TURI only) */
    uint8_t playing;         /* transport running */
    uint8_t page;            /* the pattern page the playhead is on, for the ring's needle */
    uint8_t key_page;        /* the page the sequencer keys edit */
    uint8_t kept_page;       /* the page last committed */
    uint8_t step;            /* the playing step within that page */
    uint8_t track_len;       /* the track's length in steps */
    int8_t roll;             /* TB3P's seed die is rolling while above 0 */
};

/* The title: source and NO action, or the transient Hold/Kept. */
const char *mu_page_title(const struct mu_page_state *st);
/* Trig key colours: 0 off, 1 dim, 2 hit, 3 accent, 4 the playing step, 5 a slid note. */
void mu_page_keys(const struct mu_page_state *st, uint8_t out[16]);
void mu_page_draw(const struct mu_canvas *cv, const struct mu_page_state *st);

#endif
