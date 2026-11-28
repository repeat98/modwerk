/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Modwerk's Digitakt II core: menu rows for ev_personalize and ev_settings handlers (core_addrow, core_addvalue).
 * A row is a stock MenuItem with four std::function callbacks: label, select (YES), draw and change (LEFT/RIGHT).
 * A std::function is {two words of functor storage, the manager FN_MGR, the invoker}; the MenuItem calls an
 * invoker with a pointer to its storage first. */
#include <stdint.h>
#include "digitakt-mk2/core.h"

struct function {
    void *storage[2];
    uintptr_t manager;
    const void *invoker;
};

/* A value row's payload: one per menu build, never freed. */
struct cell {
    const core_value_t *row;
    void *menu;
};

extern uintptr_t OP_NEW(uint32_t bytes);
extern void ITEM_CTOR(void *item, struct function *label, struct function *select, struct function *draw,
                      struct function *change, int a, int b);
extern void MENU_ADD(void *menu, void *item);
extern const char FN_MGR[];
extern int fw_textbox(void *bitmap, const void *font, int x, int y, int align, int deco, const void *pattern,
                      const char *format, ...);
extern const char fw_font_menu[];
extern void fw_invalidate(void *view);
extern void core_value_label(void); /* rows.s: returns the label through a0 */

void core_addrow(void *menu, const void *const invokers[4], void *payload)
{
    struct function f[4];
    for (int i = 0; i < 4; ++i) {
        f[i].storage[0] = payload;
        f[i].storage[1] = 0;
        f[i].manager = (uintptr_t)FN_MGR;
        f[i].invoker = invokers[i];
    }
    const uintptr_t item = OP_NEW(0x54);
    if (!item)
        return; /* no memory: no row, rather than one built at address 0 */
    ITEM_CTOR((void *)item, &f[0], &f[1], &f[2], &f[3], -1, 8);
    MENU_ADD(menu, (void *)item);
}

static void value_select(void *storage)
{
    (void)storage;
}

static void value_draw(void *storage, void *item, void *bitmap, int x, int y)
{
    const struct cell *const cell = *(struct cell *const *)storage;
    const uint32_t v = cell->row->get();
    (void)item;
    if (v < cell->row->count)
        fw_textbox(bitmap, fw_font_menu, x + 19, y + 2, 2, 0, 0, cell->row->values[v]);
}

static void value_change(void *storage, void *item, int delta)
{
    const struct cell *const cell = *(struct cell *const *)storage;
    const core_value_t *const row = cell->row;
    const uint32_t now = row->get();
    int32_t v = (int32_t)now + delta;
    (void)item;
    if (v < 0)
        v = 0;
    if ((uint32_t)v > row->count - 1)
        v = (int32_t)(row->count - 1);
    if ((uint32_t)v != now)
        row->set((uint32_t)v);
    fw_invalidate((uint8_t *)cell->menu + 0x38);
}

void core_addvalue(void *menu, const core_value_t *row)
{
    static const void *const invokers[4] = {
        (const void *)core_value_label, (const void *)value_select, (const void *)value_draw, (const void *)value_change,
    };
    if (!row->count)
        return;
    struct cell *const cell = (struct cell *)OP_NEW(sizeof *cell);
    if (!cell)
        return;
    cell->row = row;
    cell->menu = menu;
    core_addrow(menu, invokers, cell);
}
