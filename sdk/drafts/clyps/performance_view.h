/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "native_view.h"

/* SETUP (D33): a native popup over the Panorama, Design System v1 primitives only.
 * Rows live in RAM: nothing here writes the card. */
static void setup_draw(unsigned char *f)
{
    static const char *const item[3] = {"CAPTURE ROW", "CELL SOURCE", "RESTORE ALL"};
    panorama_draw(f);
    ui_fill(f, 14, 7, 100, 44, 0); ui_rect(f, 14, 7, 100, 44);
    ui_plate(f, 16, 9, 96, 8);
    char where[8] = {'R', 0, 0, ' ', 'T', (char)('1' + track), 0, 0};
    ui_two(where + 1, slot + 1); where[3] = ' ';
    ui_text(f, "SETUP", 18, 10, &UI_K5, 0);
    ui_text_r(f, where, 109, 10, &UI_K5, 0);
    unsigned run = RUNNING;
    for (unsigned i = 0; i < 3; ++i) {
        int y = 20 + 10 * (int)i, on = i == operation, off = i == RESTORE_HOME && run;
        char val[4] = {0};
        if (i == CAPTURE) { val[0] = 'R'; val[1] = 'A'; val[2] = 'M'; }
        if (i == CELL) { val[0] = 'A'; ui_two(val + 1, draft + 1); }
        if (i == RESTORE_HOME) { val[0] = 'A'; val[1] = '0'; val[2] = '1'; }
        if (on && !off) ui_plate(f, 16, y - 1, 96, 9);
        else if (on) ui_dotted(f, 16, y - 1, 96, 9);
        ui_text(f, item[i], 19, y + 1, &UI_K5, !(on && !off));
        if (off) ui_text_r(f, "STOP", 109, y + 1, &UI_K5, 1);
        else ui_text_r(f, val, 109, y + 1, &UI_K5, !on);
    }
    const char *hint = refused ? (operation == RESTORE_HOME ? "STOP FIRST" : "SOURCE NOT GRID") :
                       missing ? "CAPTURE ROW FIRST" :
                       operation == CAPTURE ? "YES STORE PLAYING" :
                       operation == CELL ? (slot_state(track, draft) == SLOT_EMPTY ? "EMPTY: TRIG OR A" :
                                            slot_state(track, draft) == SLOT_FOREIGN ? "SOURCE NOT GRID" :
                                            "TRIG OR A YES SET") :
                       run ? "STOP FIRST" : "YES ALL HOME PATH";
    ui_bar(f, 0, 74, hint, -1, 0, 0);
}

/* Selective Edit Lock (D33): the stock page stays live. The pattern line says why trig edits are
 * held, and a refused gesture names the way out in the page bar until the next free control. */
static void lock_draw(unsigned char *f)
{
    /* SEQ LOCK (D37.05, proposed for the artist): the sequences are held, the sound is free. */
    static const char label[] = "SEQ LOCK";
    ui_plate(f, 10, 49, ui_width(&UI_M3, label) + 8, 7);
    ui_text(f, label, 14, 50, &UI_M3, 0);
    if (lock_note) ui_bar(f, 10, 78, RUNNING ? "LOCK: ARR>CLYPS" : "LOCK: YES>HOME", -1, 0, 0);
}

static void performance_draw(unsigned char *frame)
{
    /* Design System v1 (D31): Panorama Full Grid and Clip View Native Frame. */
    if (view == ROW) panorama_draw(frame);
    else if (view == CLIP) clip_native_draw(frame);
    else if (view == SETUP) setup_draw(frame);
}
