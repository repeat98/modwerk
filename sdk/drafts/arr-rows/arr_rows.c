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
 *   FUNC + STOP        pastes the copied rows over the rows from the cursor
 *                      (from the selection's first row when there is one);
 *                      again at the same place undoes it. After a stock copy,
 *                      stock's own one-row paste.
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
static uint32_t rd8(uint32_t a) { return host_rd8(a); }
static void wr8(uint32_t a, uint32_t v) { host_wr8(a, (uint8_t)v); }
static uint32_t rd16(uint32_t a) { return (rd8(a) << 8) | rd8(a + 1); }
static void wr16(uint32_t a, uint32_t v) { wr8(a, v >> 8); wr8(a + 1, v); }
static uint32_t rd32(uint32_t a) { return (rd16(a) << 16) | rd16(a + 2); }
static void wr32(uint32_t a, uint32_t v) { wr16(a, v >> 16); wr16(a + 2, v); }
static void clear_row(int row) { host_clear_row(row); }
static void message(const char *text) { host_message(text); }
static void redraw(void) { host_redraw(); }
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
static void row_limit(void) { message((const char *)ROW_LIMIT_TEXT); }
#endif

enum { UNDO_NONE, UNDO_PASTE, UNDO_CLEAR, UNDO_INSERT };

#define MAGIC 0x41525231u /* "ARR1": card builds do not zero .bss (docs/BUILDER_MEMORY.md) */

struct arr_state {
    uint32_t magic;
    uint8_t cue, func;         /* held, as the key events said: only compared with stock's view, for the diagnostic word */
    uint8_t last;              /* the last thing done, for the diagnostic word (see arr_tick) */
    uint8_t disagreed;         /* key events after which the two views of CUE or FUNC differed */
    uint8_t taken;             /* key codes whose press we took, so their release is ours too: bit 0 REC, 1 PLAY, 2 STOP */
    uint8_t from_here;         /* the clipboard holds rows copied here (else FUNC + STOP is stock's) */
    int16_t anchor;            /* the selection's first row, -1 none */
    uint16_t sel_count;        /* the row count when it began: a stock insert or delete ends it */
    uint32_t sel_arr;          /* the arrangement it belongs to */
    uint16_t clip_n;           /* rows on the clipboard */
    uint16_t clip_from;        /* the row the first of them was copied from: targets inside the block move with it */
    uint8_t undo, undo_index;  /* the last edit, and which arrangement it changed */
    uint16_t undo_at, undo_n, undo_count;
    uint32_t undo_sum;         /* the rows as that edit left them: any other change since forgets the undo */
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

enum { DID_NOTHING, DID_COPY, DID_CLEAR, DID_PASTE, DID_INSERT, DID_REFUSE, DID_UNDO, DID_PASS };

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
    s->undo = (uint8_t)kind; s->undo_at = (uint16_t)at; s->undo_n = (uint16_t)n;
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
    if ((unsigned)cursor() > s->undo_count) wr32(CURSOR, s->undo_count);
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

/* Where a type-1 row's target goes when n rows are inserted at `at`, the row itself being at `own` before it.
 * Stock's insert (0x4009e4c8) moves a target past the insertion row by one and leaves the rest. A HALT is a row
 * whose target is its own row (the draw code labels target < own LOOP, == own HALT, > own JUMP), so it follows its
 * row: also a HALT sitting at `at`, which stock leaves behind as a LOOP to the new row. Targets are unsigned bytes,
 * as stock reads them everywhere (mvz.b: insert, delete, the labels, the playback resolver 0x4009aed0). */
static unsigned moved_target(unsigned target, unsigned own, unsigned at, unsigned n)
{
    if (target == own) return own >= at ? byte_at_most(own + n) : own;
    return target > at ? byte_at_most(target + n) : target;
}

/* Where a pasted row's target goes, the row being the k-th of the block copied from `from` and pasted at `at`: a
 * target inside the copied block keeps its place in the block, so a copied LOOP or HALT stays one; a target outside
 * it moves by `shift` when past `at` (an insert's rule; 0 for an overwrite, which moves no row). */
static unsigned pasted_target(unsigned target, unsigned at, unsigned n, unsigned from, unsigned shift)
{
    return target >= from && target < from + n ? at + (target - from) : (target > at ? byte_at_most(target + shift) : target);
}

/* A LOOP or JUMP that the paste would turn into a HALT: a target outside the block landing on the row's new index
 * (target == own row is what a HALT is). Its place k in the block, or -1. Stock's one-row delete does this silently
 * (TESTING.md, the developer's MKI); the module refuses the paste instead and says which row. */
static int halt_made(struct arr_state *s, unsigned at, unsigned shift)
{
    for (unsigned k = 0; k < s->clip_n; ++k) {
        const uint8_t *row = &s->clip[k * ROW_BYTES];
        if (row[0] != TYPE_JUMP || row[3] == s->clip_from + k) continue;
        if (pasted_target(row[3], at, s->clip_n, s->clip_from, shift) == at + k) return (int)k;
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

/* The rows just pasted: their targets (above) and a count past stock's range clamped, as stock's editor would. */
static void pasted(uint32_t a, unsigned at, unsigned n, unsigned from, unsigned shift)
{
    for (unsigned k = 0; k < n; ++k) {
        uint32_t row = row_at(a, at + k);
        if (rd8(row) != TYPE_JUMP) continue;
        wr8(row + 3, pasted_target(rd8(row + 3), at, n, from, shift));
        if (rd8(row + 2) > LOOP_MAX) wr8(row + 2, LOOP_MAX);
    }
}

static void paste_rows(struct arr_state *s, unsigned at)
{
    uint32_t a = arr();
    unsigned n = s->clip_n, have = count(a);
    if (can_undo(s, UNDO_PASTE, at, n)) { restore(s, say(s, "UNDO PASTE", n)); return; }
    if (at + n > ROWS) { s->last = DID_REFUSE; row_limit(); return; }
    int halt = halt_made(s, at, 0);
    if (halt >= 0) { s->last = DID_REFUSE; message(would_halt(s, (unsigned)halt, at)); return; }
    snapshot(s, UNDO_PASTE, at, n);
    put_bytes(row_at(a, at), s->clip, n * ROW_BYTES);
    pasted(a, at, n, s->clip_from, 0);
    if (at + n > have) wr16(a + COUNT_AT, at + n);
    s->last = DID_PASTE;
    done(s, say(s, "PASTE", n));
}

static void insert_rows(struct arr_state *s, unsigned at)
{
    uint32_t a = arr();
    unsigned n = s->clip_n, have = count(a), from = s->clip_from;
    if (can_undo(s, UNDO_INSERT, at, n)) { restore(s, say(s, "UNDO INSERT", n)); return; }
    if (at > have) at = have;
    if (have + n > ROWS) { s->last = DID_REFUSE; row_limit(); return; }
    int halt = halt_made(s, at, n);
    if (halt >= 0) { s->last = DID_REFUSE; message(would_halt(s, (unsigned)halt, at)); return; }
    snapshot(s, UNDO_INSERT, at, n);
    for (unsigned r = 0; r < have; ++r) {
        uint32_t row = row_at(a, r);
        if (rd8(row) == TYPE_JUMP) wr8(row + 3, moved_target(rd8(row + 3), r, at, n));
    }
    for (unsigned r = have; r-- > at;) {
        uint32_t src = row_at(a, r), to = row_at(a, r + n);
        for (unsigned i = 0; i < ROW_BYTES; ++i) wr8(to + i, rd8(src + i));
    }
    put_bytes(row_at(a, at), s->clip, n * ROW_BYTES);
    pasted(a, at, n, from, n);
    wr16(a + COUNT_AT, have + n);
    forget_selection(s);
    s->last = DID_INSERT;
    done(s, say(s, "INSERT", n));
}

int arr_key(int code, int pressed)
{
    struct arr_state *s = ready();
    unsigned bit = code == K_REC ? 1u : code == K_PLAY ? 2u : code == K_STOP ? 4u : 0u;
    if (code == K_CUE) s->cue = (uint8_t)!!pressed;
    if (code == K_FUNC) s->func = (uint8_t)!!pressed;
    if (!pressed) {
        if (bit & s->taken) { s->taken &= (uint8_t)~bit; return 1; }
        return 0;
    }
    if (!editor_on_top()) { forget_selection(s); return 0; }
    int cue = cue_held(), func = func_held();
    if ((cue != s->cue || func != s->func) && s->disagreed < 255u) ++s->disagreed;
    unsigned lo, hi;
    int selected = selection(s, &lo, &hi);
    if (code == K_UP || code == K_DOWN) {
        if (func) { forget_selection(s); return 0; }       /* stock's insert and delete */
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
        if (cue) insert_rows(s, (unsigned)cursor());
        else paste_rows(s, selected ? lo : (unsigned)cursor());
    }
    s->taken |= (uint8_t)bit;
    return 1;
}

struct arr_api { volatile uint32_t value; }; /* modwerk_runtime_api: npm run device -- try prints it each second */

/* The selection ends when the editor closes or another window covers it. The diagnostic word, read with `try`:
 * bit 0 editor on top, 1 CUE and 2 FUNC as stock sees them, 3 CUE and 4 FUNC as the key events said, 5-7 the last
 * thing done (1 copy, 2 clear, 3 paste, 4 insert, 5 refused, 6 undo, 7 REC/PLAY/STOP left to stock), 8-15 the key
 * events after which the two views differed, 16-23 the cursor row, 24-31 the selection's first row (255: none). */
void arr_tick(void *api)
{
    struct arr_state *s = ready();
    int on_top = editor_on_top();
    if (s->anchor >= 0 && !on_top) forget_selection(s);
    if (!api) return;
    ((struct arr_api *)api)->value = (uint32_t)on_top | (uint32_t)(on_top && cue_held()) << 1 | (uint32_t)(on_top && func_held()) << 2
        | (uint32_t)s->cue << 3 | (uint32_t)s->func << 4 | (uint32_t)(s->last & 7u) << 5 | (uint32_t)s->disagreed << 8
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
