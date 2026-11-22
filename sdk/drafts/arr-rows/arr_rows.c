/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * ARR ROWS: select several rows in the Octatrack's arrangement editor and
 * copy, clear, paste or insert them together.
 *
 *   CUE + UP/DOWN      starts or extends a selection from the cursor. Stock
 *                      moves the cursor as it does for UP/DOWN alone; this
 *                      module only remembers where the selection began.
 *   FUNC + REC         copies the selected rows (stock: one row).
 *   FUNC + PLAY        clears them; again on the same rows undoes it.
 *   FUNC + STOP        replaces the selected rows, or with no selection the
 *                      cursor row, with the copied rows; the rows below move
 *                      up or down to fit. Again at the same place undoes it.
 *                      After a stock copy, stock's own one-row paste.
 *   CUE + LEFT/RIGHT   moves the selected rows, or the cursor row, up/down one.
 *   CUE + FUNC + STOP  inserts the copied rows at the cursor, moving the rows
 *                      below and the LOOP/JUMP targets that point past the
 *                      cursor down, as stock's FUNC + DOWN does for one row.
 *
 * Without a selection and without rows copied here, every key goes to stock.
 * The arrangement stays in stock's own layout in RAM (stock saves it), so the
 * file format does not change. Nothing is patched: the base's module_key,
 * module_draw and module_tick are the only entry points.
 *
 * OS 1.40C (Octabam docs/firmware/PANEL.md and this module's RESEARCH.md):
 * key codes DOWN 0x20, STOP 0x27, PLAY 0x28, REC 0x29, CUE 0x2a, FUNC 0x2d,
 * NO 0x32, UP 0x33. The working arrangement is behind 0x10000000: +0x10 its
 * changed flags, +0x12 its row count, rows of 22 bytes from +0x14; a row's
 * byte 0 is its type (1 = LOOP/JUMP/HALT: repeats in byte 2, 0 for HALT; target row in byte 3, a HALT's own).
 *
 * generate.py compiles this into arr_rows_core.s, the unit manifest.py links;
 * verify.py runs it on the host against simulated stock memory (ARR_HOST). */
#include <stdint.h>

#define K_DOWN 0x20
#define K_STOP 0x27
#define K_PLAY 0x28
#define K_REC 0x29
#define K_CUE 0x2a
#define K_FUNC 0x2d
#define K_NO 0x32
#define K_UP 0x33
#define K_LEFT 0x34
#define K_RIGHT 0x21

#define ROWS 256u
#define ROW_BYTES 22u
#define ROW_AT 0x14u
#define COUNT_AT 0x12u
#define FLAGS_AT 0x10u
#define TYPE_JUMP 1u

/* Stock state, OS 1.40C. */
#define ARR_PTR 0x10000000u        /* the working arrangement */
#define ARR_INDEX 0x100b14d1u      /* which of the eight it is (byte; 0x100b14ce is the bank) */
#define ARR_CHANGED 0x1001614cu    /* one bit an arrangement: changed since saved (byte) */
#define CURSOR 0x460d16e4u         /* the editor's cursor row */
#define TOP 0x460d1c64u            /* the first row the editor shows (its redraw adds it to each line's index) */
#define CUE_HELD 0x460d168cu       /* stock's CUE press sets it, its release clears it */
#define EDITOR 0x400c0b74u         /* the editor's window; 0 while closed */
#define STOCK_UNDO_ROW 0x400d816eu /* stock's one-row undo; -1 none */
#define KEYS 0x46c7d8deu           /* the routed press handler of each key code, 0x18 apart */
#define EDITOR_KEYS 0x40058f34u    /* the editor's UP/DOWN/LEFT/RIGHT/YES/NO handler */
#define EDITOR_FUNC_KEYS 0x40049f54u /* the editor's FUNC layer: insert, delete, copy, clear, paste */
#define MESSAGE_SHOWN 0x460d1e70u  /* a stock message box is up */
#define CUE_KEYS 0x40083dc4u       /* CUE's layer: what a track key does while CUE is held */
#define K_T1 0x10
/* Stock routines, called as stock's own key handlers call them. */
#define CLEAR_ROW 0x4009aff4u      /* clear_row(row) */
#define MESSAGE 0x4005a2b8u        /* message(text, 0x30) */
#define REDRAW 0x40049738u         /* the editor's redraw */
#define SET_CURSOR 0x400336bcu     /* set_cursor(row): stock's own cursor move, scrolling the editor with it (six rows shown) */
#define ROW_LIMIT_TEXT 0x400b94abu /* "ROW LIMIT REACHED" */

/* LCD rows of the list (measured on the 1.40C editor, RESEARCH.md): the first
 * row's text starts at y 19, a row takes 6, the cursor row 3 more on each side. */
#define LIST_Y 19
#define ROW_H 6
#define CURSOR_PAD 3
#define MARK_X0 1
#define MARK_X1 18

#ifdef ARR_HOST
uint8_t host_rd8(uint32_t a);
void host_wr8(uint32_t a, uint8_t v);
void host_clear_row(int row);
void host_message(const char *text);
void host_redraw(void);
void host_set_cursor(int row);
static uint32_t rd8(uint32_t a) { return host_rd8(a); }
static void wr8(uint32_t a, uint32_t v) { host_wr8(a, (uint8_t)v); }
static uint32_t rd16(uint32_t a) { return (rd8(a) << 8) | rd8(a + 1); }
static void wr16(uint32_t a, uint32_t v) { wr8(a, v >> 8); wr8(a + 1, v); }
static uint32_t rd32(uint32_t a) { return (rd16(a) << 16) | rd16(a + 2); }
static void wr32(uint32_t a, uint32_t v) { wr16(a, v >> 16); wr16(a + 2, v); }
static void clear_row(int row) { host_clear_row(row); }
static void message(const char *text) { host_message(text); }
static void redraw(void) { host_redraw(); }
static void set_cursor(int row) { host_set_cursor(row); }
static void row_limit(void) { host_message("ROW LIMIT REACHED"); }
#else
static uint32_t rd8(uint32_t a) { return *(volatile uint8_t *)a; }
static void wr8(uint32_t a, uint32_t v) { *(volatile uint8_t *)a = (uint8_t)v; }
static uint32_t rd16(uint32_t a) { return *(volatile uint16_t *)a; }
static void wr16(uint32_t a, uint32_t v) { *(volatile uint16_t *)a = (uint16_t)v; }
static uint32_t rd32(uint32_t a) { return *(volatile uint32_t *)a; }
static void wr32(uint32_t a, uint32_t v) { *(volatile uint32_t *)a = v; }
static void clear_row(int row) { ((void (*)(int))CLEAR_ROW)(row); }
static void message(const char *text) { ((void (*)(const char *, int))MESSAGE)(text, 0x30); }
static void redraw(void) { ((void (*)(void))REDRAW)(); }
static void set_cursor(int row) { ((void (*)(int))SET_CURSOR)(row); }
static void row_limit(void) { message((const char *)ROW_LIMIT_TEXT); }
#endif

enum { UNDO_NONE, UNDO_PASTE, UNDO_CLEAR, UNDO_INSERT };

#define MAGIC 0x41525231u /* "ARR1": card builds do not zero .bss (docs/BUILDER_MEMORY.md) */

struct arr_state {
    uint32_t magic;
    uint8_t cue, func;         /* held, as the key events said: only compared with stock's view, for the diagnostic word */
    uint8_t last;              /* the last thing done, for the diagnostic word (see arr_tick) */
    uint8_t disagreed;         /* key events after which the two views of CUE or FUNC differed */
    uint8_t taken;             /* key codes whose press we took, so their release is ours too: bit 0 REC, 1 PLAY, 2 STOP, 3 LEFT, 4 RIGHT */
    uint8_t from_here;         /* the clipboard holds rows copied here (else FUNC + STOP is stock's) */
    int16_t anchor;            /* the selection's first row, -1 none */
    uint16_t sel_count;        /* the row count when it began: a stock insert or delete ends it */
    uint32_t sel_arr;          /* the arrangement it belongs to */
    uint16_t clip_n;           /* rows on the clipboard */
    uint16_t clip_from;        /* the row the first of them was copied from: targets inside the block move with it */
    uint8_t undo, undo_index;  /* the last edit, and which arrangement it changed */
    uint16_t undo_at, undo_count;
    uint32_t undo_n;           /* the rows it wrote, and in the high half the rows it replaced */
    int32_t undo_cursor;       /* the cursor when it was made: pressing again there undoes it */
    uint32_t undo_sum;         /* the rows as that edit left them: any other change since forgets the undo */
    uint32_t halt_arr;         /* FUNC + DOWN on a HALT: the arrangement, */
    int16_t halt_row;          /* the HALT's row (-1 none), */
    uint16_t halt_count;       /* and the row count before stock's insert */
    char text[24];
    uint8_t clip[ROWS * ROW_BYTES];
    uint8_t snap[ROWS * ROW_BYTES]; /* the rows before the last edit */
};
static struct arr_state st;
/* Read once a call, so the state is addressed through a register (as Butter Fingers does). */
static struct arr_state *volatile st_at = &st;

static struct arr_state *ready(void)
{
    struct arr_state *s = st_at;
    if (s->magic == MAGIC) return s;
    uint8_t *p = (uint8_t *)s;
    for (unsigned i = 0; i < sizeof *s; ++i) p[i] = 0;
    s->magic = MAGIC;
    s->halt_row = -1;
    s->anchor = -1;
    return s;
}

static uint32_t arr(void) { return rd32(ARR_PTR); }
static uint32_t row_at(uint32_t a, unsigned r) { return a + ROW_AT + r * ROW_BYTES; }
static unsigned count(uint32_t a) { unsigned n = rd16(a + COUNT_AT); return n > ROWS ? ROWS : n; }
static int cursor(void) { return (int)rd32(CURSOR); }

/* The editor is open and its keys are the ones the panel reaches: no menu, list or name editor over it. */
static int editor_on_top(void)
{
    if (!rd32(EDITOR) || !arr()) return 0;
    uint32_t down = rd32(KEYS + K_DOWN * 0x18u);
    return down == EDITOR_KEYS || down == EDITOR_FUNC_KEYS;
}

/* What stock itself sees held, so the module never disagrees with it about a key (measured under ot_emu, all orders of
 * CUE and FUNC, RESEARCH.md). FUNC: STOP is routed to the editor's FUNC layer; with FUNC up it is the transport's STOP
 * (0x4004aca4) and must reach stock. CUE: its press sets CUE_HELD, but pressed after FUNC only its layer is pushed
 * (T1 routed to CUE_KEYS), so either one. */
static int func_held(void) { return rd32(KEYS + K_STOP * 0x18u) == EDITOR_FUNC_KEYS; }
static int cue_held(void) { return rd32(CUE_HELD) || rd32(KEYS + K_T1 * 0x18u) == CUE_KEYS; }

enum { DID_NOTHING, DID_COPY, DID_CLEAR, DID_PASTE, DID_INSERT, DID_REFUSE, DID_UNDO, DID_PASS, DID_MOVE, DID_HALT };

static void forget_selection(struct arr_state *s) { s->anchor = -1; }

/* The selected rows, or 0 when there is no selection. */
static int selection(struct arr_state *s, unsigned *lo, unsigned *hi)
{
    if (s->anchor < 0) return 0;
    uint32_t a = arr();
    unsigned n = count(a);
    if (a != s->sel_arr || n != s->sel_count || !n) { forget_selection(s); return 0; }
    int c = cursor(), b = s->anchor;
    int l = c < b ? c : b, h = c < b ? b : c;
    if (l < 0) l = 0;
    if (h > (int)n - 1) h = (int)n - 1;
    if (l > h) return 0;
    *lo = (unsigned)l; *hi = (unsigned)h;
    return 1;
}

static void copy_bytes(uint8_t *to, uint32_t from, unsigned n)
{
    for (unsigned i = 0; i < n; ++i) to[i] = (uint8_t)rd8(from + i);
}

static void put_bytes(uint32_t to, const uint8_t *from, unsigned n)
{
    for (unsigned i = 0; i < n; ++i) wr8(to + i, from[i]);
}

static void copy_row(uint32_t a, unsigned from, unsigned to)
{
    uint32_t src = row_at(a, from), dst = row_at(a, to);
    for (unsigned i = 0; i < ROW_BYTES; ++i) wr8(dst + i, rd8(src + i));
}

static uint32_t rows_sum(uint32_t a)
{
    uint32_t h = 2166136261u ^ count(a);
    for (unsigned i = 0; i < ROWS * ROW_BYTES; ++i) h = (h ^ rd8(a + ROW_AT + i)) * 16777619u;
    return h;
}

/* As stock's own edits: the arrangement and its bit in the changed mask, and stock's one-row undo forgotten. */
static void changed(uint32_t a)
{
    wr16(a + FLAGS_AT, rd16(a + FLAGS_AT) | 1u);
    wr8(ARR_CHANGED, rd8(ARR_CHANGED) | (1u << (rd8(ARR_INDEX) & 7u)));
    wr32(STOCK_UNDO_ROW, 0xffffffffu);
}

/* "<word> <n> ROW(S)" into s->text. */
static const char *say(struct arr_state *s, const char *word, unsigned n)
{
    char *t = s->text;
    while (*word) *t++ = *word++;
    *t++ = ' ';
    if (n >= 100) *t++ = (char)('0' + n / 100);
    if (n >= 10) *t++ = (char)('0' + n / 10 % 10);
    *t++ = (char)('0' + n % 10);
    const char *rows = n == 1 ? " ROW" : " ROWS";
    while (*rows) *t++ = *rows++;
    *t = 0;
    return s->text;
}

static int can_undo(struct arr_state *s, unsigned kind, unsigned at, unsigned n)
{
    uint32_t a = arr();
    return s->undo == kind && s->undo_at == at && s->undo_n == n && s->undo_index == (rd8(ARR_INDEX) & 7u)
        && rows_sum(a) == s->undo_sum;
}

static void snapshot(struct arr_state *s, unsigned kind, unsigned at, unsigned n)
{
    uint32_t a = arr();
    copy_bytes(s->snap, a + ROW_AT, ROWS * ROW_BYTES);
    s->undo_count = (uint16_t)count(a);
    s->undo = (uint8_t)kind; s->undo_at = (uint16_t)at; s->undo_n = n;
    s->undo_index = (uint8_t)(rd8(ARR_INDEX) & 7u);
}

static void done(struct arr_state *s, const char *text)
{
    uint32_t a = arr();
    changed(a);
    s->undo_sum = rows_sum(a);
    message(text);
    redraw();
}

static void restore(struct arr_state *s, const char *text)
{
    uint32_t a = arr();
    put_bytes(a + ROW_AT, s->snap, ROWS * ROW_BYTES);
    wr16(a + COUNT_AT, s->undo_count);
    if ((unsigned)cursor() > s->undo_count) set_cursor((int)s->undo_count);
    s->undo = UNDO_NONE;
    s->last = DID_UNDO;
    forget_selection(s);
    changed(a);
    message(text);
    redraw();
}

static void copy_rows(struct arr_state *s, unsigned lo, unsigned hi)
{
    unsigned n = hi - lo + 1;
    copy_bytes(s->clip, row_at(arr(), lo), n * ROW_BYTES);
    s->clip_n = (uint16_t)n;
    s->clip_from = (uint16_t)lo;
    s->from_here = 1;
    s->undo = UNDO_NONE;
    s->last = DID_COPY;
    message(say(s, "COPY", n));
    redraw();
}

static void clear_rows(struct arr_state *s, unsigned lo, unsigned hi)
{
    unsigned n = hi - lo + 1;
    if (can_undo(s, UNDO_CLEAR, lo, n)) { restore(s, say(s, "UNDO CLEAR", n)); return; }
    snapshot(s, UNDO_CLEAR, lo, n);
    for (unsigned r = lo; r <= hi; ++r) clear_row((int)r);
    s->last = DID_CLEAR;
    done(s, say(s, "CLEAR", n));
}

#define LOOP_MAX 64u /* stock's editor clamps a LOOP's count to 0-64 (0x40049ed6); 0 draws as infinite */

static unsigned byte_at_most(unsigned v) { return v > 255u ? 255u : v; }

/* A paste replaces `del` rows at `at` with the n copied rows; an insert is the same with del 0. Every row and every
 * LOOP/JUMP target is mapped straight from before to after, never through a delete and then an insert, which would
 * pass through the state where stock's delete turns a JUMP into a HALT (TESTING.md, #1668).
 *   A row above `at` stays; a row below the replaced ones moves by n - del.
 *   A target above `at` stays; a target on a replaced row, or at `at` for an insert, points at the first pasted row
 *   (as stock's insert leaves a target equal to the insertion row); a target below moves with its row.
 *   A HALT (a row whose target is itself: the draw code labels target < own LOOP, == own HALT, > own JUMP) follows
 *   its row, also one at `at` for an insert, which stock's insert leaves behind as an endless LOOP.
 * No other row can end up pointing at itself. Targets are unsigned bytes, as stock reads them (mvz.b). */
static unsigned row_after(unsigned r, unsigned at, unsigned del, unsigned n)
{
    return r < at ? r : byte_at_most(r - del + n);
}

static unsigned target_after(unsigned t, unsigned at, unsigned del, unsigned n)
{
    if (t < at) return t;
    if (t < at + (del ? del : 1u)) return at;
    return byte_at_most(t - del + n);
}

/* A pasted row's target: inside the copied block it keeps its place in the block (a copied LOOP or HALT stays one),
 * outside it is mapped as any other target. */
static unsigned pasted_target(struct arr_state *s, unsigned t, unsigned at, unsigned del)
{
    unsigned from = s->clip_from, n = s->clip_n;
    return t >= from && t < from + n ? at + (t - from) : target_after(t, at, del, n);
}

/* A copied LOOP or JUMP whose target would land on its own new row, which would make it a HALT. Its place k in the
 * block, or -1. The module refuses the paste then and says which row. */
static int halt_made(struct arr_state *s, unsigned at, unsigned del)
{
    for (unsigned k = 0; k < s->clip_n; ++k) {
        const uint8_t *row = &s->clip[k * ROW_BYTES];
        if (row[0] != TYPE_JUMP || row[3] == s->clip_from + k) continue;
        if (pasted_target(s, row[3], at, del) == at + k) return (int)k;
    }
    return -1;
}

/* "JUMP>HALT ROW 8" (or LOOP, as stock labels the copied row: target below its row LOOP, above JUMP) into s->text. */
static const char *would_halt(struct arr_state *s, unsigned k, unsigned at)
{
    const char *word = s->clip[k * ROW_BYTES + 3] < s->clip_from + k ? "LOOP>HALT ROW" : "JUMP>HALT ROW";
    char *t = s->text;
    while (*word) *t++ = *word++;
    unsigned r = at + k;
    *t++ = ' ';
    if (r >= 100) *t++ = (char)('0' + r / 100);
    if (r >= 10) *t++ = (char)('0' + r / 10 % 10);
    *t++ = (char)('0' + r % 10);
    *t = 0;
    return s->text;
}

/* Replace `del` rows at `at` with the copied rows (FUNC + STOP: the selection, or the cursor row), or insert them
 * (CUE + FUNC + STOP: del 0). Again in the same place undoes it. */
static void put_rows(struct arr_state *s, unsigned at, unsigned del, unsigned kind)
{
    uint32_t a = arr();
    unsigned n = s->clip_n, have = count(a), key = n | del << 16;
    const char *word = kind == UNDO_INSERT ? "INSERT" : "PASTE";
    /* Again in the same place undoes it: where the cursor was, also after replacing a selection the paste ended. */
    if (cursor() == s->undo_cursor && can_undo(s, kind, s->undo_at, s->undo_n)) {
        restore(s, say(s, kind == UNDO_INSERT ? "UNDO INSERT" : "UNDO PASTE", n));
        return;
    }
    if (at > have) at = have;
    if (at + del > have) del = have - at;                  /* the END row: nothing to replace */
    if (have - del + n > ROWS) { s->last = DID_REFUSE; row_limit(); return; }
    int halt = halt_made(s, at, del);
    if (halt >= 0) { s->last = DID_REFUSE; message(would_halt(s, (unsigned)halt, at)); return; }
    snapshot(s, kind, at, key);
    s->undo_cursor = cursor();
    for (unsigned r = 0; r < have; ++r) {                  /* the rows that stay: their targets */
        if (r >= at && r < at + del) continue;
        uint32_t row = row_at(a, r);
        if (rd8(row) != TYPE_JUMP) continue;
        unsigned t = rd8(row + 3);
        wr8(row + 3, t == r ? row_after(r, at, del, n) : target_after(t, at, del, n));
    }
    unsigned after = have - del + n;
    if (n > del)                                           /* the rows below move down, from the last */
        for (unsigned r = have; r-- > at + del;) copy_row(a, r, r + n - del);
    else if (n < del)                                      /* or up, from the first */
        for (unsigned r = at + del; r < have; ++r) copy_row(a, r, r - (del - n));
    put_bytes(row_at(a, at), s->clip, n * ROW_BYTES);
    for (unsigned k = 0; k < n; ++k) {                     /* the pasted rows: targets, and a count within stock's range */
        uint32_t row = row_at(a, at + k);
        if (rd8(row) != TYPE_JUMP) continue;
        wr8(row + 3, pasted_target(s, rd8(row + 3), at, del));
        if (rd8(row + 2) > LOOP_MAX) wr8(row + 2, LOOP_MAX);
    }
    for (unsigned r = after; r < have; ++r) clear_row((int)r);  /* rows left past the end, as stock's delete clears one */
    wr16(a + COUNT_AT, after);
    forget_selection(s);
    s->last = kind == UNDO_INSERT ? DID_INSERT : DID_PASTE;
    done(s, say(s, word, n));
}

/* CUE + LEFT/RIGHT: the selected rows, or the cursor row, one place up (dir -1) or down (+1); the row they pass goes to
 * the other side of them. Every LOOP/JUMP target follows the row it points at, so a HALT stays a HALT and no other row
 * can point at itself; a LOOP carried past its target becomes a JUMP and the other way round (the developer's choice).
 * The cursor and the selection move with the rows, so the next press moves them on. No message box: moving back undoes. */
static void move_rows(struct arr_state *s, unsigned lo, unsigned hi, int dir)
{
    uint32_t a = arr();
    unsigned have = count(a);
    if (hi >= have || (dir < 0 && lo == 0) || (dir > 0 && hi + 1 >= have)) return;
    unsigned passed = dir < 0 ? lo - 1 : hi + 1;           /* the row the block moves past */
    unsigned lands = dir < 0 ? hi : lo;                   /* where that row ends up */
    for (unsigned r = 0; r < have; ++r) {                  /* targets first, by the rows' old places */
        uint32_t row = row_at(a, r);
        if (rd8(row) != TYPE_JUMP) continue;
        unsigned t = rd8(row + 3);
        if (t == passed) wr8(row + 3, lands);
        else if (t >= lo && t <= hi) wr8(row + 3, (unsigned)((int)t + dir));
    }
    uint8_t keep[ROW_BYTES];
    copy_bytes(keep, row_at(a, passed), ROW_BYTES);
    if (dir < 0) for (unsigned r = lo; r <= hi; ++r) copy_row(a, r, r - 1);
    else for (unsigned r = hi + 1; r-- > lo;) copy_row(a, r, r + 1);
    put_bytes(row_at(a, lands), keep, ROW_BYTES);
    /* As stock moves the cursor, so the editor scrolls along (the developer's MKI). First to the row the block moves
     * towards (above it moving up, below it moving down, the END row at the bottom), then to the block's other end,
     * then to the cursor: stock scrolls only as far as each needs, so with up to five rows selected the next row and
     * the whole block stay on screen; a larger block keeps itself and the cursor first. */
    int to = cursor() + dir, nlo = (int)lo + dir, nhi = (int)hi + dir;
    int ahead = dir < 0 ? nlo - 1 : nhi + 1;
    if (ahead >= 0 && ahead <= (int)have) set_cursor(ahead);
    set_cursor(to == nhi ? nlo : nhi);
    set_cursor(to);
    if (s->anchor >= 0) s->anchor = (int16_t)(s->anchor + dir);
    s->undo = UNDO_NONE;
    s->last = DID_MOVE;
    changed(a);
    redraw();
}

/* FUNC + DOWN with the cursor on a HALT (#1668, the owner's OK): stock duplicates the row and leaves the original,
 * moved one down, pointing at the copy: an endless LOOP. The module lets stock insert, then on the next frame points
 * the moved HALT at its own row again, so both rows are HALTs. Only when stock really inserted there: one row more and
 * the moved row as it was. Every other FUNC + DOWN, and FUNC + UP, stays stock's. */
static void note_halt(struct arr_state *s)
{
    uint32_t a = arr();
    unsigned c = (unsigned)cursor(), have = count(a);
    s->halt_row = -1;
    if (c >= have) return;
    uint32_t row = row_at(a, c);
    if (rd8(row) != TYPE_JUMP || rd8(row + 3) != c) return;
    s->halt_arr = a;
    s->halt_row = (int16_t)c;
    s->halt_count = (uint16_t)have;
}

static void keep_halt(struct arr_state *s)
{
    if (s->halt_row < 0) return;
    unsigned p = (unsigned)s->halt_row;
    s->halt_row = -1;
    uint32_t a = arr();
    if (a != s->halt_arr || count(a) != s->halt_count + 1u || p + 1u >= ROWS) return;
    uint32_t copy = row_at(a, p), moved = row_at(a, p + 1);
    if (rd8(copy) != TYPE_JUMP || rd8(copy + 3) != p || rd8(moved) != TYPE_JUMP || rd8(moved + 3) != p) return;
    for (unsigned i = 0; i < ROW_BYTES; ++i) if (i != 3 && rd8(copy + i) != rd8(moved + i)) return;
    wr8(moved + 3, p + 1);
    s->last = DID_HALT;
    changed(a);
    redraw();
}

int arr_key(int code, int pressed)
{
    struct arr_state *s = ready();
    unsigned bit = code == K_REC ? 1u : code == K_PLAY ? 2u : code == K_STOP ? 4u : code == K_LEFT ? 8u : code == K_RIGHT ? 16u : 0u;
    if (code == K_CUE) s->cue = (uint8_t)!!pressed;
    if (code == K_FUNC) s->func = (uint8_t)!!pressed;
    if (!pressed) {
        if (bit & s->taken) { s->taken &= (uint8_t)~bit; return 1; }
        return 0;
    }
    if (!editor_on_top()) { forget_selection(s); return 0; }
    int cue = cue_held(), func = func_held();
    /* Not on CUE's or FUNC's own event: stock has not switched its layer yet when the module sees it. */
    if (code != K_CUE && code != K_FUNC && (cue != s->cue || func != s->func) && s->disagreed < 255u) ++s->disagreed;
    unsigned lo, hi;
    int selected = selection(s, &lo, &hi);
    if (code == K_UP || code == K_DOWN) {
        if (func) {                                        /* stock's insert and delete */
            forget_selection(s);
            if (code == K_DOWN) note_halt(s);              /* stock's insert on a HALT: fixed after it, in arr_tick */
            return 0;
        }
        if (cue) {
            if (s->anchor < 0) {
                uint32_t a = arr();
                s->anchor = (int16_t)cursor();
                s->sel_arr = a;
                s->sel_count = (uint16_t)count(a);
            }
        } else forget_selection(s);
        return 0;                                          /* stock moves the cursor either way */
    }
    if (code == K_NO) { forget_selection(s); return 0; }
    if (code == K_LEFT || code == K_RIGHT) {               /* CUE + LEFT/RIGHT move rows; without CUE stock's columns */
        if (!cue || func) return 0;
        unsigned c = (unsigned)cursor();
        if (selected) move_rows(s, lo, hi, code == K_LEFT ? -1 : 1);
        else if (c < count(arr())) move_rows(s, c, c, code == K_LEFT ? -1 : 1);
        s->taken |= (uint8_t)bit;
        return 1;
    }
    if (!bit) return 0;
    if (!func) { s->last = DID_PASS; return 0; }           /* REC, PLAY, STOP without FUNC: stock's, the transport's */
    if (code == K_REC) {
        if (!selected) { s->from_here = 0; s->last = DID_PASS; return 0; }  /* stock's copy now owns FUNC + STOP */
        copy_rows(s, lo, hi);
    } else if (code == K_PLAY) {
        if (!selected) { s->last = DID_PASS; return 0; }
        clear_rows(s, lo, hi);
    } else {
        if (!s->from_here || !s->clip_n) { s->last = DID_PASS; return 0; }
        if (cue) put_rows(s, (unsigned)cursor(), 0, UNDO_INSERT);
        else if (selected) put_rows(s, lo, hi - lo + 1, UNDO_PASTE);
        else put_rows(s, (unsigned)cursor(), 1, UNDO_PASTE);
    }
    s->taken |= (uint8_t)bit;
    return 1;
}

struct arr_api { volatile uint32_t value; }; /* modwerk_runtime_api: npm run device -- try prints it each second */

/* The selection ends when the editor closes or another window covers it. The diagnostic word, read with `try`:
 * bit 0 editor on top, 1 CUE and 2 FUNC as stock sees them, 3-6 the last thing done (1 copy, 2 clear, 3 paste,
 * 4 insert, 5 refused, 6 undo, 7 REC/PLAY/STOP left to stock, 8 move, 9 a HALT kept after stock's insert), 7 unused, 8-15 the key events after which the
 * module's own count of CUE and FUNC differed from stock's, 16-23 the cursor row, 24-31 the selection's first row (255: none). */
void arr_tick(void *api)
{
    struct arr_state *s = ready();
    keep_halt(s);
    int on_top = editor_on_top();
    if (s->anchor >= 0 && !on_top) forget_selection(s);
    if (!api) return;
    ((struct arr_api *)api)->value = (uint32_t)on_top | (uint32_t)(on_top && cue_held()) << 1 | (uint32_t)(on_top && func_held()) << 2
        | (uint32_t)(s->last & 15u) << 3 | (uint32_t)s->disagreed << 8
        | (uint32_t)(cursor() & 0xff) << 16 | (uint32_t)(s->anchor < 0 ? 0xffu : (unsigned)s->anchor & 0xffu) << 24;
}

#ifdef ARR_HOST
void host_invert(unsigned char *frame, int x, int y);
static void invert(unsigned char *frame, int x, int y) { host_invert(frame, x, y); }
#else
/* The frame is column-major: byte x * 8 + 7 - y / 8, bit y % 8 (Tiempos draws the same way). */
static void invert(unsigned char *frame, int x, int y) { frame[x * 8 + 7 - (y >> 3)] ^= (unsigned char)(1u << (y & 7)); }
#endif

/* Each selected row's number is drawn inverted. */
void arr_draw(unsigned char *frame)
{
    struct arr_state *s = ready();
    unsigned lo, hi;
    if (s->anchor < 0 || !editor_on_top() || rd32(MESSAGE_SHOWN) || !selection(s, &lo, &hi)) return;
    int top = (int)rd32(TOP), c = cursor();
    for (int r = (int)lo; r <= (int)hi; ++r) {
        if (r < top) continue;
        int y = LIST_Y + ROW_H * (r - top) + (r == c ? CURSOR_PAD : r > c ? 2 * CURSOR_PAD : 0);
        if (y + 5 > 63) break;
        for (int yy = y - 1; yy <= y + 4; ++yy)        /* the gap above and the text: rows tile without overlap */
            for (int x = MARK_X0; x <= MARK_X1; ++x) invert(frame, x, yy);
    }
}
