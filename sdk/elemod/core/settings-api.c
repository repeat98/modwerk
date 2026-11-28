/* SPDX-License-Identifier: GPL-3.0-or-later
 * Original adapter for the public core_additem(menu, four-callback row) ABI.
 * The verified stock constructor copies these non-owning function records.
 * The stock invoker hands a callback its record's payload: select and change
 * read the menu from it, label and draw get none.
 */
#include "core-api.h"

struct mw_menu_function {
    void *payload;
    mw_u32 reserved;
    int (*manager)(void *destination, const void *source, int operation);
    void (*invoke)(void);
};

extern void *mw_stock_allocate(mw_u32 bytes);
extern int mw_stock_function_manager(void *, const void *, int);
extern void mw_stock_item_construct(void *item,
    const struct mw_menu_function *label, const struct mw_menu_function *select,
    const struct mw_menu_function *draw, const struct mw_menu_function *change,
    int id, int step);
extern void mw_stock_menu_append(void *menu, void *item);

#ifdef __m68k__
_Static_assert(sizeof(struct mw_menu_function) == 16, "Stock function ABI");
_Static_assert(__builtin_offsetof(struct mw_menu_function, manager) == 8, "Stock manager ABI");
_Static_assert(__builtin_offsetof(struct mw_menu_function, invoke) == 12, "Stock invoker ABI");
#endif

void core_additem(void *menu, const void *row)
{
    if (!menu || !row) return;
    void (*const *callbacks)(void) = row;
    struct mw_menu_function functions[4];
    for (unsigned i = 0; i < 4; ++i) {
        functions[i].payload = i == 1 || i == 3 ? menu : 0;
        functions[i].reserved = 0;
        functions[i].manager = callbacks[i] ? mw_stock_function_manager : 0;
        functions[i].invoke = callbacks[i];
    }
    void *item = mw_stock_allocate(84);
    if (!item) return;
    mw_stock_item_construct(item, &functions[0], &functions[1], &functions[2], &functions[3], -1, 8);
    mw_stock_menu_append(menu, item);
}
