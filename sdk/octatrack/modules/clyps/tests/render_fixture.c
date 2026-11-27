/* SPDX-License-Identifier: GPL-3.0-or-later
 * Standalone caller for the production drawing routines. Inputs are synthetic. */
#include <limits.h>
#include <stdint.h>
#include "../meta_focus.h"

static uint32_t playing, requested, rows[16];
static unsigned track, slot, first_row, defined, last_row, pending_row, armed;
static unsigned editing, row_view, refused, missing, draft, zoom, src_cursor, RUNNING;
static unsigned critical(void) { return 0; }
static void restore(unsigned sr) { (void)sr; }
static int supported(void) { return 1; }
#include "../session_view.h"

void render_fixture(unsigned char *frame, unsigned mode)
{
    track = mode == 0 ? 0 : 1;
    src_cursor = 2;
    RUNNING = mode != 0;
    playing = mode == 1 ? 32 : 0;
    requested = mode == 0 ? 0 : 32;
    if (mode == 2) src_draw(frame);
    else session_draw(frame);
}

#ifndef CLYPS_COMPILE_ONLY
#include <assert.h>
#include <stdio.h>
int main(void)
{
    for (unsigned key = 0; key < 64; ++key)
        assert(clyps_meta_track_key(key) == (key >= 16 && key < 24));
    for (unsigned pos = 0; pos < 8; ++pos) {
        assert(clyps_focus_step(pos, INT_MIN, 7) == 0);
        assert(clyps_focus_step(pos, INT_MAX, 7) == 7);
        assert(clyps_focus_step(pos, 0, 7) == pos);
    }
    for (unsigned mode = 0; mode < 3; ++mode) {
        unsigned char frame[1024] = {0};
        render_fixture(frame, mode);
        /* The panel transfers one band across all columns at a time. */
        for (unsigned band = 0; band < 8; ++band)
            for (unsigned col = 0; col < 128; ++col)
                if (putchar(frame[8*col + band]) == EOF) return 1;
    }
    return 0;
}
#endif
