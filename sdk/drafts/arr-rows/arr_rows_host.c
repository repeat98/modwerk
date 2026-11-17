/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * ARR ROWS on the host: arr_rows.c (built with -DARR_HOST) against simulated
 * OS 1.40C memory, big-endian as on the unit. Stock's cursor moves are
 * simulated where stock would make them (UP/DOWN reach stock). verify.py runs it. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int arr_key(int code, int pressed);
void arr_tick(void *api);
void arr_draw(unsigned char *frame);

#define DOWN 0x20
#define STOP 0x27
#define PLAY 0x28
#define REC 0x29
#define CUE 0x2a
#define FUNC 0x2d
#define NO 0x32
#define UP 0x33

#define ARR 0x20000000u      /* where the simulated working arrangement lives */
#define ROWB 22u

static uint8_t arrangement[0x14 + 256 * ROWB];
static uint8_t scalars[64][4]; /* one word each for the stock words the module reads */
static const uint32_t scalar_at[] = {0x10000000u, 0x100b14d0u, 0x1001614cu, 0x460d16e4u, 0x460d1c64u, 0x400c0b74u,
                                     0x400d816cu, 0x400d8170u, 0x46c7d8deu + DOWN * 0x18u, 0x460d1e70u,
                                     0x460d168cu, 0x46c7d8deu + 0x10u * 0x18u, 0x46c7d8deu + STOP * 0x18u};
static char last_message[32];
static int clears[256], cleared, redraws;
static int failures, checks;

static uint8_t *cell(uint32_t a)
{
    if (a >= ARR && a < ARR + sizeof arrangement) return &arrangement[a - ARR];
    for (unsigned i = 0; i < sizeof scalar_at / sizeof *scalar_at; ++i)
        if (a >= scalar_at[i] && a < scalar_at[i] + 4) return &scalars[i][a - scalar_at[i]];
    fprintf(stderr, "unexpected address 0x%08x\n", a);
    return &scalars[63][0];
}
uint8_t host_rd8(uint32_t a) { return *cell(a); }
void host_wr8(uint32_t a, uint8_t v) { *cell(a) = v; }
static uint32_t get32(uint32_t a) { return (uint32_t)host_rd8(a) << 24 | (uint32_t)host_rd8(a + 1) << 16 | (uint32_t)host_rd8(a + 2) << 8 | host_rd8(a + 3); }
static void set32(uint32_t a, uint32_t v) { for (int i = 0; i < 4; ++i) host_wr8(a + (uint32_t)i, (uint8_t)(v >> (24 - 8 * i))); }
static unsigned rows(void) { return (unsigned)arrangement[0x12] << 8 | arrangement[0x13]; }
static void set_rows(unsigned n) { arrangement[0x12] = (uint8_t)(n >> 8); arrangement[0x13] = (uint8_t)n; }
static uint8_t *row(unsigned r) { return &arrangement[0x14 + r * ROWB]; }

/* Stock's row clear, simplified: a pattern row with nothing set. */
void host_clear_row(int r) { memset(row((unsigned)r), 0, ROWB); clears[cleared++] = r; }
void host_message(const char *text) { snprintf(last_message, sizeof last_message, "%s", text); }
void host_redraw(void) { ++redraws; }
static unsigned char lcd[1024];
void host_invert(unsigned char *frame, int x, int y) { frame[x * 8 + 7 - (y >> 3)] ^= (unsigned char)(1u << (y & 7)); }
static int lit(int x, int y) { return lcd[x * 8 + 7 - (y >> 3)] >> (y & 7) & 1; }

static void check(const char *name, int ok)
{
    ++checks;
    if (!ok) { ++failures; printf("[FAIL] %s\n", name); }
    else printf("[PASS] %s\n", name);
}

static int cursor(void) { return (int)get32(0x460d16e4u); }
static void set_cursor(int c) { set32(0x460d16e4u, (uint32_t)c); }
static void route(void);
static void editor(int open) { set32(0x400c0b74u, open ? 0x46000000u : 0); if (open) route(); else set32(0x46c7d8deu + DOWN * 0x18u, 0x400491a0u); }

/* A press and its release; returns what the module did with the press. Stock's cursor moves for UP/DOWN it passed. */
static int tap(int code)
{
    int taken = arr_key(code, 1);
    if (!taken && !get32(0x46c7d8deu + DOWN * 0x18u)) {}
    if (!taken && get32(0x46c7d8deu + DOWN * 0x18u) == 0x40058f34u && (code == DOWN || code == UP)) {
        int c = cursor() + (code == DOWN ? 1 : -1);
        if (c < 0) c = 0;
        if (c > (int)rows()) c = (int)rows();
        set_cursor(c);
    }
    int released = arr_key(code, 0);
    if (released != taken) { printf("[FAIL] release of 0x%02x not as its press\n", code); ++failures; }
    return taken;
}
/* Stock's routing in the editor, as measured under ot_emu for every order of CUE and FUNC (RESEARCH.md): the module
 * sees the key event first, then stock pushes or pops the layer. */
static int cue_down, func_down, cue_last;
static void route(void)
{
    set32(0x46c7d8deu + DOWN * 0x18u, func_down ? 0x40049f54u : 0x40058f34u);
    set32(0x46c7d8deu + STOP * 0x18u, func_down ? 0x40049f54u : 0x4004aca4u);
    set32(0x46c7d8deu + 0x10u * 0x18u, cue_down && (cue_last || !func_down) ? 0x40083dc4u : func_down ? 0x40083dfcu : 0x40040250u);
}
static void hold(int code, int down)
{
    arr_key(code, down);
    if (code == CUE) { cue_down = down; if (down) { cue_last = 1; if (!func_down) set32(0x460d168cu, 1); } else set32(0x460d168cu, 0); }
    if (code == FUNC) { func_down = down; if (down) cue_last = 0; }
    route();
}

static void fill(unsigned n)
{
    memset(arrangement, 0, sizeof arrangement);
    set32(0x10000000u, ARR);
    set_rows(n);
    for (unsigned r = 0; r < n; ++r) { row(r)[0] = 0; row(r)[1] = (uint8_t)(r + 1); row(r)[5] = (uint8_t)(0x40 + r); }
}
static int same(unsigned r, unsigned as) { return row(r)[1] == (uint8_t)(as + 1) && row(r)[5] == (uint8_t)(0x40 + as); }

int main(void)
{
    /* the editor closed: every key is stock's */
    fill(10);
    editor(0);
    check("editor closed: CUE + DOWN goes to stock", (hold(CUE, 1), tap(DOWN) == 0));
    hold(CUE, 0);
    hold(FUNC, 0);
    check("editor closed: FUNC + STOP goes to stock", (arr_key(FUNC, 1), tap(STOP) == 0));
    arr_key(FUNC, 0);

    editor(1);
    set_cursor(2);
    check("no selection: FUNC + REC is stock's copy", (hold(FUNC, 1), tap(REC) == 0));
    check("no selection: FUNC + PLAY is stock's clear", tap(PLAY) == 0);
    check("nothing copied here: FUNC + STOP is stock's paste", tap(STOP) == 0);
    hold(FUNC, 0);

    hold(CUE, 1);
    check("CUE + DOWN reaches stock (it moves the cursor)", tap(DOWN) == 0 && cursor() == 3);
    tap(DOWN);
    hold(CUE, 0);
    check("the cursor moved on to row 4", cursor() == 4);

    memset(lcd, 0, sizeof lcd);
    set32(0x460d1c64u, 0);
    arr_draw(lcd);
    /* rows 2 and 3 above the cursor at y 31 and 37, the cursor row 4 at 43 + 3 */
    check("rows 2, 3 and the cursor row 4 are drawn inverted", lit(5, 31) && lit(5, 35) && lit(5, 37) && lit(5, 46) && lit(18, 50));
    check("row 1 and row 5 are not", !lit(5, 25) && !lit(5, 29) && !lit(5, 55));
    check("nothing right of the row numbers", !lit(19, 31) && !lit(40, 46));
    set32(0x460d1e70u, 1);
    memset(lcd, 0, sizeof lcd);
    arr_draw(lcd);
    check("no marks while a stock message box is up", !lit(5, 31));
    set32(0x460d1e70u, 0);

    hold(FUNC, 1);
    check("FUNC + REC with a selection is taken", tap(REC) == 1);
    hold(FUNC, 0);
    check("it says COPY 3 ROWS", !strcmp(last_message, "COPY 3 ROWS"));

    check("DOWN without CUE ends the selection", tap(DOWN) == 0 && cursor() == 5);
    memset(lcd, 0, sizeof lcd);
    arr_draw(lcd);
    check("and nothing is marked", !lit(5, 31) && !lit(5, 46));

    set_cursor(7);
    set32(0x400d816cu, 0x00000005u); /* stock's undo row word (0x400d816e) = 5 */
    arrangement[0x10] = arrangement[0x11] = 0;
    set32(0x100b14d0u, 0x00030000u); /* arrangement 3 (byte 0x100b14d1) */
    set32(0x1001614cu, 0);
    hold(FUNC, 1);
    check("FUNC + STOP pastes the copied rows over rows 7-9", tap(STOP) == 1 && same(7, 2) && same(8, 3) && same(9, 4) && rows() == 10);
    hold(FUNC, 0);
    check("it says PASTE 3 ROWS", !strcmp(last_message, "PASTE 3 ROWS"));
    check("the arrangement is marked changed, as stock marks it", (arrangement[0x11] & 1) && host_rd8(0x1001614cu) == 1u << 3);
    check("stock's one-row undo is forgotten", host_rd8(0x400d816eu) == 0xff && host_rd8(0x400d816fu) == 0xff);
    hold(FUNC, 1);
    check("FUNC + STOP again at the same row undoes the paste", tap(STOP) == 1 && same(7, 7) && same(8, 8) && same(9, 9));
    hold(FUNC, 0);
    check("it says UNDO PASTE 3 ROWS", !strcmp(last_message, "UNDO PASTE 3 ROWS"));

    set_cursor(8);
    hold(FUNC, 1);
    tap(STOP);
    hold(FUNC, 0);
    check("a paste past the end adds rows", rows() == 11 && same(8, 2) && same(10, 4));
    row(9)[5] = 0x77; /* the musician edits a pasted row */
    hold(FUNC, 1);
    tap(STOP);
    hold(FUNC, 0);
    check("after an edit, FUNC + STOP pastes again instead of undoing", row(9)[5] == 0x40 + 3 && rows() == 11);

    /* insert: CUE + FUNC + STOP at row 1, with JUMPs to rows 6 and 1 */
    fill(10);
    row(5)[0] = 1; row(5)[3] = 6;
    row(6)[0] = 1; row(6)[3] = 1;
    row(7)[0] = 1; row(7)[2] = 0; row(7)[3] = 7;   /* HALT: its own row */
    row(8)[0] = 1; row(8)[2] = 2; row(8)[3] = 254; /* a JUMP far past the end */
    set_cursor(1);
    hold(CUE, 1);
    hold(FUNC, 1);
    check("CUE + FUNC + STOP inserts the copied rows", tap(STOP) == 1 && rows() == 13);
    hold(FUNC, 0);
    hold(CUE, 0);
    check("they sit at rows 1-3 and the rest moved down", same(0, 0) && same(1, 2) && same(2, 3) && same(3, 4) && same(4, 1) && same(12, 9));
    check("a JUMP to a row past the cursor follows its row", row(8)[0] == 1 && row(8)[3] == 9);
    check("a JUMP to the cursor row stays, as stock's insert leaves it", row(9)[0] == 1 && row(9)[3] == 1);
    check("a HALT still points at its own row after it moved", row(10)[0] == 1 && row(10)[3] == 10);
    check("a far JUMP target stops at 255 instead of wrapping", row(11)[3] == 255);
    check("it says INSERT 3 ROWS", !strcmp(last_message, "INSERT 3 ROWS"));
    hold(CUE, 1);
    hold(FUNC, 1);
    tap(STOP);
    hold(FUNC, 0);
    hold(CUE, 0);
    check("again at the same row undoes the insert", rows() == 10 && same(1, 1) && same(9, 9) && row(5)[3] == 6);

    /* the insert rule (owner's decision of 17 November 2026) */
    fill(10);
    row(1)[0] = 1; row(1)[3] = 1;                  /* a HALT at the insertion row */
    row(4)[0] = 1; row(4)[3] = 0;                  /* a LOOP to row 0, before the insertion row */
    set_cursor(1);
    hold(CUE, 1); hold(FUNC, 1); tap(STOP); hold(FUNC, 0); hold(CUE, 0);
    check("a HALT at the insertion row stays a HALT (stock leaves a LOOP to the new row)", row(4)[0] == 1 && row(4)[3] == 4);
    check("a target before the insertion row stays", row(7)[0] == 1 && row(7)[3] == 0);

    /* a copied block with a LOOP inside it and a JUMP out of it, inserted elsewhere */
    fill(12);
    row(2)[0] = 1; row(2)[2] = 3; row(2)[3] = 1;   /* LOOP x3 back to row 1, inside the block 1-3 */
    row(3)[0] = 1; row(3)[2] = 100; row(3)[3] = 9; /* JUMP to row 9, outside the block; a count past stock's 64 */
    set_cursor(1);
    hold(CUE, 1); tap(DOWN); tap(DOWN); hold(CUE, 0); /* rows 1-3 */
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    set_cursor(6);
    hold(CUE, 1); hold(FUNC, 1); tap(STOP); hold(FUNC, 0); hold(CUE, 0);
    check("a target inside the copied block keeps its place in the block", row(7)[0] == 1 && row(7)[2] == 3 && row(7)[3] == 6);
    check("a target outside it past the insertion row moves by the block", row(8)[0] == 1 && row(8)[3] == 12);
    check("a count past 64 is clamped to 64, as stock's editor clamps it", row(8)[2] == 64);
    check("the original JUMP to row 9 moved with its row too", row(3)[3] == 12 && row(2)[3] == 1);

    /* the same block pasted over rows 6-8 (FUNC + STOP): inside targets follow the block, outside ones stay */
    fill(12);
    row(1)[0] = 1; row(1)[3] = 1;                  /* HALT on its own row, inside the block 1-3 */
    row(2)[0] = 1; row(2)[2] = 3; row(2)[3] = 1;   /* LOOP x3 back to row 1, inside */
    row(3)[0] = 1; row(3)[2] = 100; row(3)[3] = 9; /* JUMP to row 9, outside; a count past 64 */
    set_cursor(1);
    hold(CUE, 1); tap(DOWN); tap(DOWN); hold(CUE, 0);
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    tap(DOWN); tap(DOWN); tap(DOWN);               /* cursor 6; ends the selection */
    hold(FUNC, 1); tap(STOP); hold(FUNC, 0);
    check("overwrite: a pasted HALT stays a HALT on its new row", row(6)[0] == 1 && row(6)[3] == 6);
    check("overwrite: a pasted LOOP inside the block points into the pasted block", row(7)[3] == 6 && row(7)[2] == 3);
    check("overwrite: a target outside the block is kept, as no row moved", row(8)[3] == 9 && row(8)[2] == 64);
    check("overwrite: the rows copied from are untouched", row(1)[3] == 1 && row(2)[3] == 1 && row(3)[3] == 9 && row(3)[2] == 100);
    check("overwrite: the count is unchanged", rows() == 12);

    /* inserting at the end changes no target */
    fill(6);
    row(2)[0] = 1; row(2)[3] = 5;
    set_cursor(6);
    hold(CUE, 1); hold(FUNC, 1); tap(STOP); hold(FUNC, 0); hold(CUE, 0);
    check("an insert at the end (P == count) changes no target", rows() == 9 && row(2)[3] == 5);

    /* a target past row 127 moves like any other (stock reads targets unsigned) */
    fill(210);
    row(205)[0] = 1; row(205)[3] = 200;
    set_cursor(5);
    hold(CUE, 1); hold(FUNC, 1); tap(STOP); hold(FUNC, 0); hold(CUE, 0);
    check("a LOOP to row 200 moves to 203", row(208)[0] == 1 && row(208)[3] == 203);

    /* clear a selection of rows 5-6 (selected upwards) */
    fill(10);
    set_cursor(6);
    hold(CUE, 1);
    tap(UP);
    hold(CUE, 0);
    cleared = 0;
    hold(FUNC, 1);
    check("FUNC + PLAY clears the selection", tap(PLAY) == 1 && cleared == 2 && clears[0] == 5 && clears[1] == 6);
    check("it says CLEAR 2 ROWS", !strcmp(last_message, "CLEAR 2 ROWS"));
    check("and again undoes it", tap(PLAY) == 1 && same(5, 5) && same(6, 6));
    hold(FUNC, 0);

    /* the row limit */
    fill(255);
    set_cursor(3);
    hold(CUE, 1);
    hold(FUNC, 1);
    tap(STOP);
    hold(FUNC, 0);
    hold(CUE, 0);
    check("an insert past 256 rows is refused", rows() == 255 && !strcmp(last_message, "ROW LIMIT REACHED"));
    set_cursor(254);
    hold(FUNC, 1);
    tap(STOP);
    hold(FUNC, 0);
    check("a paste past row 255 is refused", rows() == 255 && same(254, 254));

    /* a stock copy takes FUNC + STOP back */
    fill(10);
    set_cursor(4);
    hold(FUNC, 1);
    check("a stock copy (no selection) goes to stock", tap(REC) == 0);
    check("after it, FUNC + STOP is stock's paste again", tap(STOP) == 0);
    hold(FUNC, 0);

    /* a stock insert or delete, or the editor closing, ends a selection */
    hold(CUE, 1);
    tap(DOWN);
    hold(CUE, 0);
    set_rows(11);
    hold(FUNC, 1);
    check("after the row count changed, FUNC + PLAY is stock's again", tap(PLAY) == 0);
    hold(FUNC, 0);
    hold(CUE, 1);
    tap(DOWN);
    hold(CUE, 0);
    editor(0);
    arr_tick(0);
    editor(1);
    hold(FUNC, 1);
    check("after the editor closed, FUNC + PLAY is stock's again", tap(PLAY) == 0);
    hold(FUNC, 0);
    hold(CUE, 1);
    tap(DOWN);
    hold(CUE, 0);
    tap(NO);
    hold(FUNC, 1);
    check("NO ends a selection", tap(PLAY) == 0);
    check("FUNC + UP (stock's delete) goes to stock", tap(UP) == 0);
    hold(FUNC, 0);

    /* never a silent HALT: a pasted LOOP or JUMP whose target would be its own new row */
    fill(12);
    row(5)[0] = 1; row(5)[2] = 2; row(5)[3] = 8;   /* JUMP to row 8 */
    set_cursor(5);
    hold(CUE, 1); tap(UP); tap(DOWN); hold(CUE, 0); /* select row 5 alone */
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    tap(DOWN); tap(DOWN); tap(DOWN);               /* to row 8: UP/DOWN end the selection */
    hold(FUNC, 1);
    check("pasting JUMP 8 over row 8 is refused", tap(STOP) == 1 && same(8, 8) && rows() == 12);
    hold(FUNC, 0);
    check("it says JUMP>HALT ROW 8", !strcmp(last_message, "JUMP>HALT ROW 8"));
    tap(DOWN);
    hold(FUNC, 1); tap(STOP); hold(FUNC, 0);
    check("one row further it pastes, still a JUMP to 8", row(9)[0] == 1 && row(9)[3] == 8);
    fill(12);
    row(5)[0] = 1; row(5)[3] = 2;                  /* LOOP back to row 2 */
    set_cursor(5);
    hold(CUE, 1); tap(UP); tap(DOWN); hold(CUE, 0);
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    tap(UP); tap(UP); tap(UP);
    hold(CUE, 1); hold(FUNC, 1); tap(STOP); hold(FUNC, 0); hold(CUE, 0);
    check("inserting LOOP 2 at row 2 is refused", rows() == 12 && !strcmp(last_message, "LOOP>HALT ROW 2"));
    fill(12);
    row(5)[0] = 1; row(5)[3] = 5;                  /* a HALT */
    set_cursor(5);
    hold(CUE, 1); tap(UP); tap(DOWN); hold(CUE, 0);
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    tap(DOWN); tap(DOWN); tap(DOWN); tap(DOWN);
    hold(FUNC, 1); tap(STOP); hold(FUNC, 0);
    check("a copied HALT pastes as a HALT on its new row", row(9)[0] == 1 && row(9)[3] == 9);

    /* stock's view of the held keys decides, not the module's own count of events */
    fill(10);
    set_cursor(2);
    hold(CUE, 1); tap(DOWN); hold(CUE, 0);
    hold(FUNC, 1); tap(REC); hold(FUNC, 0);
    arr_key(CUE, 1);                               /* a CUE press the module saw, its release it missed */
    tap(DOWN); tap(DOWN); tap(DOWN);               /* to row 6 */
    hold(FUNC, 1); tap(STOP); hold(FUNC, 0);
    check("a missed CUE release does not turn FUNC + STOP into an insert", rows() == 10 && !strcmp(last_message, "PASTE 2 ROWS"));
    check("and plain DOWN still ended the selection (it pasted at the cursor)", same(6, 2) && same(7, 3));
    arr_key(CUE, 0);
    arr_key(FUNC, 1);                              /* the module saw FUNC go down, stock never did */
    check("STOP without stock's FUNC layer is the transport's: never taken", arr_key(STOP, 1) == 0 && arr_key(STOP, 0) == 0);
    arr_key(FUNC, 0);
    /* FUNC down first, then CUE: stock pushes CUE's layer without setting its flag */
    tap(UP);
    hold(FUNC, 1); hold(CUE, 1);
    check("FUNC then CUE, then STOP: an insert", tap(STOP) == 1 && rows() == 12 && !strcmp(last_message, "INSERT 2 ROWS"));
    hold(CUE, 0); hold(FUNC, 0);
    /* the selection drawn after the list has scrolled */
    fill(14);
    set_cursor(3);
    hold(CUE, 1); tap(DOWN); tap(DOWN); tap(DOWN); tap(DOWN); tap(DOWN); hold(CUE, 0);  /* rows 3-8, cursor 8 */
    set32(0x460d1c64u, 3);                         /* the editor shows row 3 first */
    memset(lcd, 0, sizeof lcd);
    arr_draw(lcd);
    check("scrolled: the first row shown (3) is marked at the top", lit(5, 19) && lit(5, 23));
    check("scrolled: the cursor row 8 is marked in the cursor's place", lit(5, 19 + 6 * 5 + 3));
    /* the diagnostic word */
    struct { volatile uint32_t value; } api = {0};
    hold(CUE, 1);
    arr_tick((void *)&api);
    check("the diagnostic word: editor, CUE seen by stock and by the events, cursor 8, selection from 3",
          (api.value & 0x1f) == 0x0b && (api.value >> 16 & 0xff) == 8 && (api.value >> 24) == 3);
    hold(CUE, 0);
    arr_tick((void *)&api);
    check("the diagnostic word counts the two disagreements above", (api.value >> 8 & 0xff) >= 2);

    printf("%d checks, %d failed\n", checks, failures);
    return failures != 0;
}
