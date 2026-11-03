/* SPDX-License-Identifier: MIT */
/* Original compiled fixture, isolated private stock calls; not an adapter. */
#include "editor_menu.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
#define VP(a) ((volatile uint32_t *)(uintptr_t)(a))
/* This mailbox is synthetic memory shared with the runner, never a stock ABI. */
#define MAIL VP(0x47210000)
static bs_editor_menu menu;
static uint32_t token, generation, calls, error;
static bs_menu_status dispatch_status;
static int owner_valid(void *context, const bs_menu_owner *owner) {
    (void)context;
    return owner->module == 17 && owner->generation == generation;
}
static int invoke(void *context, const bs_menu_owner *owner, uint32_t action) {
    (void)context;
    if (owner->module != 17 || action != 1 || menu.selection != (int32_t)menu.stock_count ||
        menu.state != BS_MENU_DISPATCHING) error = __LINE__;
    if (bs_menu_retire_locked(&menu, token) != BS_MENU_BUSY) error = __LINE__;
    ++calls;
    return 1;
}
static void dispatch(void) {
    dispatch_status = bs_menu_dispatch_locked(&menu, token, (uint32_t)menu.selection);
}
static void stock_call(uint32_t address) {
    /* The selection tail-dispatch rewrites its first incoming argument word.
     * Reserve it even though this fixture does not need a value. A void(void)
     * call lets stock overwrite the caller's saved register/local instead. */
    ((void (*)(uint32_t))(uintptr_t)address)(0);
}
int bs_menu_selftest(void);
int bs_menu_stock_selftest(void) {
    uint32_t variant, scenario, i;
    bs_menu_backend backend = {0, owner_valid, invoke};
    bs_menu_action action = {123, 1, {17, 7}, "BEAT GRID"};
    int result = bs_menu_selftest();
    if (result) return result;
    for (variant = 0; variant < 2; ++variant)
        for (scenario = 0; scenario < 4; ++scenario) {
            uint32_t old_serial = menu.serial;
            MAIL[0] = 0; MAIL[6] = 0;
            *VP(0x400ceb3c) = variant ? 0 : UINT32_MAX;
            stock_call(0x40072c10); /* Actual stock editor-menu variant selection. */
            CHECK(MAIL[1] == (variant ? 9u : 6u));
            generation = 7; calls = 0; error = 0; dispatch_status = BS_MENU_INVALID;
            CHECK(bs_menu_open_locked(&menu, MAIL[1], (const char *const *)(uintptr_t)MAIL[4],
                (const bs_menu_callback *)(uintptr_t)MAIL[5], 1, &action, dispatch, &backend, &token) == BS_MENU_OK);
            CHECK(token > old_serial);
            for (i = 0; i < menu.stock_count; ++i) {
                const char *original = ((const char *const *)(uintptr_t)MAIL[4])[i];
                uint32_t j = 0;
                while (original[j]) { CHECK(menu.labels[i][j] == original[j]); ++j; }
                CHECK(!menu.labels[i][j]);
                CHECK(menu.callbacks[i] == ((const bs_menu_callback *)(uintptr_t)MAIL[5])[i]);
            }
            MAIL[0] = 1;
            ((void (*)(uint32_t, uint32_t, int32_t *, const char *const *, const bs_menu_callback *))
                (uintptr_t)0x4006d94c)(menu.count, menu.stock_count, &menu.selection, menu.labels, menu.callbacks);
            CHECK(*VP(0x460e5e28) == (uint32_t)(uintptr_t)menu.callbacks);
            CHECK(*VP(0x460e5e2c) == (uint32_t)(uintptr_t)menu.labels);
            CHECK(*VP(0x460e5e34) == (uint32_t)(uintptr_t)&menu.selection);
            *VP(0x460e5e40) = scenario == 3 ? 0 : menu.stock_count;
            if (scenario == 1) ++generation; /* Removed/replaced owner at same module id. */
            if (scenario == 2) CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_OK);
            stock_call(0x4006d8f4); /* Real selection + close + indirect callback helper. */
            CHECK(!error);
            if (scenario == 0) CHECK(calls == 1 && dispatch_status == BS_MENU_OK);
            if (scenario == 1 || scenario == 2) CHECK(calls == 0 && dispatch_status == BS_MENU_STALE);
            if (scenario == 3) CHECK(calls == 0 && MAIL[6] == 1 && menu.selection == 0);
            /* Hiding stock's menu has NOT detached its retained pointer globals. */
            CHECK(*VP(0x460e5e28) == (uint32_t)(uintptr_t)menu.callbacks);
            CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_OK);
            CHECK(bs_menu_open_locked(&menu, MAIL[1], (const char *const *)(uintptr_t)MAIL[4],
                (const bs_menu_callback *)(uintptr_t)MAIL[5], 1, &action, dispatch, &backend, &token) == BS_MENU_BUSY);
            /* Synthetic quiescence, NOT a proven native detach mechanism. */
            *VP(0x460e5e28) = 0; *VP(0x460e5e2c) = 0; *VP(0x460e5e34) = 0;
            CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
        }
    return 0;
}
