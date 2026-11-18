/* SPDX-License-Identifier: MIT
 * The Part Edit menu (events.json ot_part_menu). Stock's three Part Edit openers call the popup 0x4006d94c with
 * four rows (RENAME, RELOAD, SAVE, SAVE ALL); the base opens it as stock does. With a contribution installed it draws
 * the window as two columns over the popup: the parents on the left (PART, then one row per contribution, in table
 * order) and the highlighted parent's actions on the right. PART's actions are stock's own rows: YES there is stock's,
 * with the popup's cursor moved to the row. YES on a contribution's action closes the popup, then calls its choose.
 * With none installed nothing changes. UI task only (the opener, ev_key, ev_enc, ev_tick, ev_draw). Stock addresses:
 * OS 1.40C (the popup's state at 0x460e5e28-0x460e5e40, as Pattern Sample Locks and the sample editor menu read it). */
#include <stdint.h>
#include "modwerk_events.h"
#ifndef PM_HOST /* test_part_menu.c maps these onto a model of the unit */
#include "loader.h"
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define PM_TABLE (MODWERK_OT_PART_MENU - RUNTIME_EVENTS)
#define PM_POPUP(n, row, out, names, cbs) \
    ((void (*)(uint32_t, uint32_t, uint32_t *, const char *const *, const void *))0x4006d94cu)(n, row, out, names, cbs)
#define PM_CLOSE() ((void (*)(void))0x4006d754u)()
#define PM_TEXT(x, top, t) ((void (*)(uint32_t, void *, int, int, int, const char *))0x40012bd8u)(0x400ba876u, pm_surface, (int)(x), 59 - (int)(top), -1, t)
#define PM_WIDTH(t) ((int (*)(uint32_t, int, const char *))0x40012f30u)(0x400ba876u, -1, t)
#define PM_MASK() modwerk_machine_mask()
#define PM_UNMASK(m) modwerk_machine_unmask(m)
#define PM_STOCK_NAME(names, row) ((names)[row])
#endif
#define PM_OPEN 0x460e5e30u      /* the popup's object: 0 while none is open */
#define PM_CBS 0x460e5e28u       /* its callbacks */
#define PM_NAMES 0x460e5e2cu     /* its labels */
#define PM_ROW 0x460e5e40u       /* its cursor */
#define PM_STOCK_CBS 0x400b9b04u /* Part Edit's: RENAME, RELOAD, SAVE, SAVE ALL */
#define PM_STOCK_NAMES 0x400b9b14u
#define PM_STOCK_OUT 0x460d101cu /* the row stock remembers */
#define PM_STOCK_ROWS 4u
#define PM_DIRTY 0x46c7c72cu
#define PM_ROOM 7u               /* the table's room (events.json) */
#define PM_ACTIONS 6u
#define PM_YES 0x31
#define PM_NO 0x32
#define PM_UP 0x33
#define PM_DOWN 0x20
#define PM_LEFT 0x34
#define PM_RIGHT 0x21
typedef struct modwerk_part_menu PmEntry;

#ifndef PM_HOST
/* As midi_generators.c's mg_generators(): masked, so a table change is never seen half-way. */
static unsigned pm_entries(const PmEntry **out)
{
    unsigned n = 0;
    uint32_t mask = PM_MASK();
    for (uintptr_t volatile *row = modwerk_runtime_event_row[PM_TABLE]; *row && n < PM_ROOM; ++row) {
        const PmEntry *e = (const PmEntry *)*row;
        if (e->abi == MODWERK_PART_MENU_ABI && e->label && e->actions && e->choose && e->count >= 1u && e->count <= PM_ACTIONS)
            out[n++] = e;
    }
    PM_UNMASK(mask);
    return n;
}
#endif

static unsigned pm_shown, pm_focus, pm_parent, pm_child;
/* What the window remembers, as PROJ's menu does: the parent it was on, the column, and each parent's action row,
 * kept as the cursor moves, so leaving with NO keeps them too. A parent is named by its record (PART: 1), so a module
 * removed and installed again starts afresh. Module RAM only: a restart forgets it. */
#define PM_PART_ID ((uintptr_t)1)
static uintptr_t pm_was, pm_rows_of[PM_ROOM + 1u];
static unsigned pm_was_focus;
static uint8_t pm_rows[PM_ROOM + 1u];
static const char *const *pm_names;       /* stock's four labels, as the opener passed them */
static uint32_t pm_consumed[2];
static int pm_residual;
#ifndef PM_HOST
static uint32_t pm_surface[7];
#endif

static unsigned pm_stock_open(void)
{
    return U32(PM_OPEN) && U32(PM_CBS) == PM_STOCK_CBS && U32(PM_NAMES) == PM_STOCK_NAMES;
}
static void pm_redraw(void) { U32(PM_DIRTY) = 1; }
static void pm_hide(void) { pm_shown = 0; pm_residual = 0; pm_redraw(); }
static unsigned pm_children(const PmEntry *const *e, unsigned n, unsigned parent)
{
    return parent == 0u ? PM_STOCK_ROWS : parent <= n ? e[parent - 1u]->count : 0u;
}
static uintptr_t pm_id(const PmEntry *const *e, unsigned parent) { return parent ? (uintptr_t)e[parent - 1u] : PM_PART_ID; }
static unsigned pm_recall(const PmEntry *const *e, unsigned n, unsigned parent)
{
    uintptr_t id = pm_id(e, parent);
    for (unsigned k = 0; k <= PM_ROOM; ++k)
        if (pm_rows_of[k] == id) return pm_rows[k] < pm_children(e, n, parent) ? pm_rows[k] : 0u;
    if (parent == 0u) { uint32_t row = U32(PM_ROW); return row < PM_STOCK_ROWS ? row : 0u; } /* stock's own memory */
    return 0u;
}
static void pm_remember(const PmEntry *const *e)
{
    uintptr_t id = pm_id(e, pm_parent);
    pm_was = id; pm_was_focus = pm_focus;
    if (!pm_focus) return;
    unsigned at = PM_ROOM + 1u;
    for (unsigned k = 0; k <= PM_ROOM && at > PM_ROOM; ++k) if (pm_rows_of[k] == id) at = k;
    for (unsigned k = 0; k <= PM_ROOM && at > PM_ROOM; ++k) if (!pm_rows_of[k]) at = k;
    if (at > PM_ROOM) at = 0; /* full of removed modules' rows: reuse the first */
    pm_rows_of[at] = id; pm_rows[at] = (uint8_t)pm_child;
}

void mw_part_menu_open(uint32_t count, uint32_t row, uint32_t *out, const char *const *names, const void *callbacks);
void mw_part_menu_open(uint32_t count, uint32_t row, uint32_t *out, const char *const *names, const void *callbacks)
{
    PM_POPUP(count, row, out, names, callbacks);
    const PmEntry *e[PM_ROOM];
    unsigned n = pm_entries(e);
    if (count != PM_STOCK_ROWS || (uintptr_t)out != PM_STOCK_OUT || (uintptr_t)names != PM_STOCK_NAMES ||
        (uintptr_t)callbacks != PM_STOCK_CBS || !n || !pm_stock_open())
        return;
    pm_names = names; pm_focus = 0; pm_parent = 0; pm_child = 0; pm_residual = 0;
    for (unsigned k = 0; k <= n; ++k)
        if (pm_id(e, k) == pm_was) { pm_parent = k; pm_focus = pm_was_focus; }
    pm_child = pm_recall(e, n, pm_parent);
    if (pm_focus && pm_parent == 0u) U32(PM_ROW) = pm_child;
    pm_shown = 1; pm_redraw();
}

static void pm_move(const PmEntry *const *e, unsigned n, int down)
{
    if (!pm_focus) {
        if (down && pm_parent < n) ++pm_parent;
        if (!down && pm_parent) --pm_parent;
        return;
    }
    unsigned rows = pm_children(e, n, pm_parent);
    if (down && pm_child + 1u < rows) ++pm_child;
    if (!down && pm_child) --pm_child;
    if (pm_parent == 0u) U32(PM_ROW) = pm_child;
}
static void pm_enter(const PmEntry *const *e, unsigned n)
{
    pm_focus = 1;
    pm_child = pm_recall(e, n, pm_parent);
    if (pm_parent == 0u) U32(PM_ROW) = pm_child;
}
/* 1 takes the key (press and its release); 0 hands it on to the modules and stock. */
int mw_part_menu_key(int code, int pressed);
int mw_part_menu_key(int code, int pressed)
{
    if (code < 0 || code >= 64) return 0;
    unsigned group = (unsigned)code / 32u; uint32_t bit = 1u << ((unsigned)code % 32u);
    if (!pressed) { if (!(pm_consumed[group] & bit)) return 0; pm_consumed[group] &= ~bit; return 1; }
    if (pm_consumed[group] & bit) return 1;
    if (!pm_shown) return 0;
    if (!pm_stock_open()) { pm_hide(); return 0; }
    if (code != PM_YES && code != PM_NO && code != PM_UP && code != PM_DOWN && code != PM_LEFT && code != PM_RIGHT)
        return 0; /* stock's, with the window as it is */
    const PmEntry *e[PM_ROOM];
    unsigned n = pm_entries(e);
    if (pm_parent > n) { pm_parent = n; pm_focus = 0; }
    if (pm_focus && pm_child >= pm_children(e, n, pm_parent)) pm_child = 0;
    if (code == PM_NO) { pm_remember(e); pm_hide(); return 0; } /* from either column, as PROJ: stock closes its popup */
    if (pm_focus && code == PM_YES && pm_parent == 0u) { U32(PM_ROW) = pm_child; pm_remember(e); pm_hide(); return 0; } /* stock's row */
    pm_consumed[group] |= bit;
    if (code == PM_UP || code == PM_DOWN) pm_move(e, n, code == PM_DOWN);
    else if (!pm_focus && (code == PM_RIGHT || code == PM_YES)) pm_enter(e, n);
    else if (pm_focus && code == PM_LEFT) pm_focus = 0;
    else if (pm_focus && code == PM_YES) {
        const PmEntry *chosen = e[pm_parent - 1u];
        unsigned action = pm_child;
        pm_remember(e);
        pm_hide();
        PM_CLOSE();
        chosen->choose(action);
        return 1;
    }
    pm_remember(e);
    pm_redraw();
    return 1;
}
/* LEVEL moves the cursor a row per detent, as in stock's lists; the other encoders do nothing while it is open. */
int mw_part_menu_enc(int encoder, int delta);
int mw_part_menu_enc(int encoder, int delta)
{
    if (!pm_shown) return 0;
    if (!pm_stock_open()) { pm_hide(); return 0; }
    if (encoder != 6) return 1;
    const PmEntry *e[PM_ROOM];
    unsigned n = pm_entries(e);
    if ((pm_residual < 0 && delta > 0) || (pm_residual > 0 && delta < 0)) pm_residual = 0;
    pm_residual += delta;
    while (pm_residual >= 4) { pm_move(e, n, 1); pm_residual -= 4; }
    while (pm_residual <= -4) { pm_move(e, n, 0); pm_residual += 4; }
    pm_remember(e);
    pm_redraw();
    return 1;
}
void mw_part_menu_tick(void);
void mw_part_menu_tick(void)
{
    if (pm_shown && !pm_stock_open()) pm_hide();
}

/* Drawing: the frame is a quarter turn round, a row of 8 bytes per x, pixel (x, y) at bit 63 - y (status.c). */
static void pm_fill(unsigned char *frame, unsigned x0, unsigned y0, unsigned x1, unsigned y1, int how) /* 0 clear, 1 set, 2 invert */
{
    for (unsigned x = x0; x <= x1 && x < 128u; ++x)
        for (unsigned y = y0; y <= y1 && y < 64u; ++y) {
            unsigned bit = 63u - y, at = x * 8u + (bit >> 3);
            unsigned char mask = (unsigned char)(0x80u >> (bit & 7u));
            frame[at] = how == 2 ? frame[at] ^ mask : how ? frame[at] | mask : frame[at] & (unsigned char)~mask;
        }
}
static void pm_outline(unsigned char *frame, unsigned x0, unsigned y0, unsigned x1, unsigned y1)
{
    pm_fill(frame, x0, y0, x1, y0, 1); pm_fill(frame, x0, y1, x1, y1, 1);
    pm_fill(frame, x0, y0, x0, y1, 1); pm_fill(frame, x1, y0, x1, y1, 1);
}
static const char *pm_label(const PmEntry *const *e, unsigned parent, unsigned row)
{
    return parent == 0u ? PM_STOCK_NAME(pm_names, row) : e[parent - 1u]->actions[row];
}
/* PART's icon, the base's own: three faders. 9 rows, bit 18 the leftmost of 19 columns (the record's icon format). */
static const uint32_t pm_part_icon[9] = {0x00000, 0x02108, 0x07108, 0x0711c, 0x0239c, 0x02388, 0x02108, 0x02108, 0x00000};
static void pm_icon(unsigned char *frame, unsigned x, unsigned y, const uint32_t *icon, int how)
{
    for (unsigned r = 0; r < 9u; ++r)
        for (unsigned c = 0; c < 19u; ++c)
            if (icon[r] >> (18u - c) & 1u) pm_fill(frame, x + c, y + r, x + c, y + r, how);
}
/* The window as PROJ's menu draws its categories (OS 1.40C, read from the unit's screen): x 6-121 blanked, so the
 * track strips either side stay; a frame over y 1-62 with a shadow right and below and a filled title bar (rows 1-9) whose text is cut out of it; the parents
 * on the left, ten pixels apart, each an icon (x 8-26) and its label at x 27, five at a time; a rule at x 57; the
 * highlighted parent's actions on the right from x 60, seven pixels apart. The highlighted parent is inverted while
 * the left column has the focus and framed while the right one has it; the action under the cursor is inverted only
 * while the right column has the focus. */
#define PM_SHOWN 5u
void mw_part_menu_draw(unsigned char *frame);
void mw_part_menu_draw(unsigned char *frame)
{
    if (!pm_shown || !frame || !pm_stock_open()) return;
    const PmEntry *e[PM_ROOM];
    unsigned n = pm_entries(e);
    if (!n) return;
    if (pm_parent > n) { pm_parent = n; pm_focus = 0; }
#ifndef PM_HOST
    for (unsigned i = 0; i < 7u; ++i) pm_surface[i] = ((const volatile uint32_t *)0x400bf10au)[i];
    pm_surface[3] = (uint32_t)(uintptr_t)frame;
#endif
    pm_fill(frame, 6u, 0u, 121u, 63u, 0);                 /* PROJ blanks its span top to bottom; the strips stay */
    PM_TEXT(8u, 3u, "PART EDIT");
    pm_fill(frame, 6u, 1u, 121u, 9u, 2);                 /* the title bar, its text cut out of it */
    pm_fill(frame, 6u, 10u, 6u, 61u, 1); pm_fill(frame, 120u, 10u, 121u, 62u, 1); /* the frame, the shadow right */
    pm_fill(frame, 6u, 61u, 121u, 61u, 1); pm_fill(frame, 8u, 62u, 121u, 62u, 1); /* and below */
    unsigned first = pm_parent >= PM_SHOWN ? pm_parent + 1u - PM_SHOWN : 0u;
    for (unsigned k = first; k <= n && k < first + PM_SHOWN; ++k) {
        unsigned top = 13u + 10u * (k - first);
        const uint32_t *icon = k ? e[k - 1u]->icon : pm_part_icon;
        if (icon) pm_icon(frame, 8u, top - 2u, icon, 1);
        PM_TEXT(27u, top, k ? e[k - 1u]->label : "PART");
        if (k == pm_parent) {
            if (pm_focus) pm_outline(frame, 8u, top - 2u, 55u, top + 6u);
            else pm_fill(frame, 8u, top - 2u, 55u, top + 6u, 2);
        }
    }
    pm_fill(frame, 56u, 11u, 56u, 60u, 0);                /* a long label stops short of the rule */
    pm_fill(frame, 57u, 11u, 57u, 60u, 1);
    unsigned c = pm_children(e, n, pm_parent);
    for (unsigned r = 0; r < c; ++r) {
        unsigned top = 12u + 7u * r;
        PM_TEXT(60u, top, pm_label(e, pm_parent, r));
        if (pm_focus && r == pm_child) pm_fill(frame, 59u, top - 1u, 118u, top + 5u, 2);
    }
}
