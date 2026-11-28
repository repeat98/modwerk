/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <string.h>
#include "../settings-api.c"

static unsigned allocation_calls, construction_calls, append_calls;
static int allocation_fails;
static char storage[84], menu;
static struct mw_menu_function saved[4];
static void callback(void) {}

void *mw_stock_allocate(mw_u32 bytes) {
    assert(bytes == sizeof storage);
    allocation_calls++;
    return allocation_fails ? 0 : storage;
}
int mw_stock_function_manager(void *destination, const void *source, int operation) {
    assert(operation == 2);
    *(void **)destination = *(void *const *)source;
    return 0;
}
void mw_stock_item_construct(void *item, const struct mw_menu_function *label,
    const struct mw_menu_function *select, const struct mw_menu_function *draw,
    const struct mw_menu_function *change, int id, int step) {
    assert(item == storage && id == -1 && step == 8);
    const struct mw_menu_function *inputs[] = {label, select, draw, change};
    for (unsigned i = 0; i < 4; i++) {
        saved[i] = *inputs[i];
        if (inputs[i]->manager) {
            void *copied = 0;
            inputs[i]->manager(&copied, inputs[i], 2);
            assert(copied == (inputs[i] == select || inputs[i] == change ? &menu : 0));
        }
    }
    construction_calls++;
}
void mw_stock_menu_append(void *target, void *item) {
    assert(target == &menu && item == storage && construction_calls > 0);
    append_calls++;
}
int main(void) {
    void (*row[4])(void) = {callback, callback, callback, callback};
    core_additem(0, row); core_additem(&menu, 0);
    assert(!allocation_calls && !construction_calls && !append_calls);
    allocation_fails = 1;
    core_additem(&menu, row);
    assert(allocation_calls == 1 && !construction_calls && !append_calls);
    allocation_fails = 0;
    for (unsigned missing = 0; missing <= 4; missing++) {
        for (unsigned i = 0; i < 4; i++) row[i] = i == missing ? 0 : callback;
        core_additem(&menu, row);
        for (unsigned i = 0; i < 4; i++) {
            assert(saved[i].payload == (i == 1 || i == 3 ? &menu : 0) && !saved[i].reserved);
            assert(saved[i].invoke == row[i]);
            assert(saved[i].manager == (row[i] ? mw_stock_function_manager : 0));
        }
    }
    assert(allocation_calls == 6 && construction_calls == 5 && append_calls == 5);
    return 0;
}
