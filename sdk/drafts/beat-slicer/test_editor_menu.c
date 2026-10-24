/* SPDX-License-Identifier: MIT */
#include "editor_menu.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static bs_editor_menu menu;
static uint32_t token, calls, received_action, received_owner, live_generation;
static int callback_ok, callback_checks;
static const char *labels[9] = {"ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"};
static void stock(void) { }
static void trampoline(void) { }
static bs_menu_callback callbacks[9] = {stock, stock, stock, stock, stock, stock, stock, stock, 0};
static int same(const void *a, const void *b, uint32_t n) {
    const unsigned char *p = a, *q = b;
    while (n--) if (*p++ != *q++) return 0;
    return 1;
}
static void copy(void *a, const void *b, uint32_t n) {
    unsigned char *p = a;
    const unsigned char *q = b;
    while (n--) *p++ = *q++;
}
static int valid(void *ctx, const bs_menu_owner *owner) {
    (void)ctx;
    return owner->module >= 1 && owner->module <= 4 && owner->generation == live_generation;
}
static int invoke(void *ctx, const bs_menu_owner *owner, uint32_t action) {
    (void)ctx;
    ++calls; received_action = action; received_owner = owner->module;
    callback_checks = menu.state == BS_MENU_DISPATCHING &&
        bs_menu_retire_locked(&menu, token) == BS_MENU_BUSY &&
        bs_menu_detached_locked(&menu, token) == BS_MENU_BUSY &&
        bs_menu_dispatch_locked(&menu, token, menu.stock_count) == BS_MENU_BUSY;
    return callback_ok;
}
static bs_menu_backend backend = {0, valid, invoke};
static bs_menu_action actions[4];
static char action_labels[4][32];
static void reset(void) {
    uint32_t i, j;
    unsigned char *p = (unsigned char *)&menu;
    for (i = 0; i < sizeof(menu); ++i) p[i] = 0;
    token = 0; calls = 0; live_generation = 7; callback_ok = 1; callback_checks = 0;
    for (i = 0; i < 4; ++i) {
        for (j = 0; j < 32; ++j) action_labels[i][j] = 0;
        action_labels[i][0] = (char)('A' + i);
        actions[i].key = 40 - 10 * i; actions[i].action = 100 + i;
        actions[i].owner.module = i + 1; actions[i].owner.generation = 7;
        actions[i].label = action_labels[i];
    }
}
static bs_menu_status open_menu(uint32_t n, uint32_t a) {
    return bs_menu_open_locked(&menu, n, labels, callbacks, a, actions, trampoline, &backend, &token);
}
static int successful_menus(void) {
    uint32_t stock_count, count, row, i;
    /* 2 stock variants x 1..4 contributions x every contributed selection. */
    for (stock_count = 6; stock_count <= 9; stock_count += 3)
        for (count = 1; count <= 4; ++count)
            for (row = 0; row < count; ++row) {
                reset(); CHECK(open_menu(stock_count, count) == BS_MENU_OK);
                CHECK(token == 1 && menu.count == stock_count + count && menu.selection == -1);
                for (i = 0; i < stock_count; ++i) {
                    CHECK(menu.callbacks[i] == callbacks[i]);
                    CHECK(same(menu.labels[i], labels[i], 2));
                    CHECK(menu.labels[i] == menu.text[i] && menu.labels[i] != labels[i]);
                }
                for (i = 0; i < count; ++i) {
                    CHECK(menu.actions[i].key == actions[count - 1 - i].key);
                    CHECK(menu.callbacks[stock_count + i] == trampoline);
                    CHECK(menu.labels[stock_count + i][0] == (char)('A' + count - 1 - i));
                }
                /* No source-owned label/metadata pointer survives composition. */
                action_labels[count - 1 - row][0] = 'Z';
                actions[count - 1 - row].owner.generation = 99;
                CHECK(menu.labels[stock_count + row][0] != 'Z');
                CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_BUSY);
                CHECK(open_menu(stock_count, count) == BS_MENU_BUSY);
                CHECK(bs_menu_dispatch_locked(&menu, token, stock_count + row) == BS_MENU_OK);
                CHECK(calls == 1 && callback_checks && received_action == 100 + count - 1 - row);
                CHECK(received_owner == count - row && menu.state == BS_MENU_RETIRING);
                CHECK(bs_menu_dispatch_locked(&menu, token, stock_count + row) == BS_MENU_STALE);
                CHECK(open_menu(stock_count, count) == BS_MENU_BUSY);
                CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
                CHECK(menu.state == BS_MENU_CLOSED);
            }
    return 0;
}
static int stale_and_retirement(void) {
    uint32_t old;
    reset(); CHECK(open_menu(6, 1) == BS_MENU_OK); old = token;
    CHECK(bs_menu_dispatch_locked(&menu, token + 1, 6) == BS_MENU_STALE);
    CHECK(bs_menu_dispatch_locked(&menu, token, 5) == BS_MENU_INVALID);
    CHECK(bs_menu_dispatch_locked(&menu, token, 7) == BS_MENU_INVALID);
    CHECK(menu.state == BS_MENU_OPEN && calls == 0);
    live_generation = 8;
    CHECK(bs_menu_dispatch_locked(&menu, token, 6) == BS_MENU_STALE);
    CHECK(calls == 0 && menu.state == BS_MENU_RETIRING);
    CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
    live_generation = 7; CHECK(open_menu(6, 1) == BS_MENU_OK); CHECK(token != old);
    CHECK(bs_menu_dispatch_locked(&menu, old, 6) == BS_MENU_STALE);
    CHECK(bs_menu_retire_locked(&menu, old) == BS_MENU_STALE);
    CHECK(bs_menu_detached_locked(&menu, old) == BS_MENU_BUSY);
    CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_OK);
    CHECK(bs_menu_dispatch_locked(&menu, token, 6) == BS_MENU_STALE);
    CHECK(bs_menu_detached_locked(&menu, old) == BS_MENU_STALE);
    CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_OK);
    CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
    CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_STALE);
    CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_STALE);
    CHECK(open_menu(9, 4) == BS_MENU_OK); callback_ok = 0;
    CHECK(bs_menu_dispatch_locked(&menu, token, 12) == BS_MENU_CALLBACK_FAILED);
    CHECK(calls == 1 && callback_checks && menu.state == BS_MENU_RETIRING);
    CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
    menu.serial = UINT32_MAX - 1; CHECK(open_menu(6, 1) == BS_MENU_OK);
    CHECK(token == UINT32_MAX); CHECK(bs_menu_retire_locked(&menu, token) == BS_MENU_OK);
    CHECK(bs_menu_detached_locked(&menu, token) == BS_MENU_OK);
    CHECK(open_menu(6, 1) == BS_MENU_EXHAUSTED && token == UINT32_MAX);
    return 0;
}
static int refusals(void) {
    bs_editor_menu before;
    bs_menu_backend broken;
    uint32_t i;
    reset(); copy(&before, &menu, sizeof(menu)); token = 123;
#define UNCHANGED() CHECK(same(&menu, &before, sizeof(menu)) && token == 123)
    CHECK(open_menu(5, 1) == BS_MENU_INVALID); UNCHANGED();
    CHECK(open_menu(10, 1) == BS_MENU_INVALID); UNCHANGED();
    CHECK(open_menu(6, 0) == BS_MENU_INVALID); UNCHANGED();
    CHECK(open_menu(6, 5) == BS_MENU_INVALID); UNCHANGED();
    actions[1].key = actions[0].key;
    CHECK(open_menu(6, 2) == BS_MENU_INVALID); UNCHANGED(); actions[1].key = 30;
    actions[0].owner.generation = 8;
    CHECK(open_menu(6, 1) == BS_MENU_STALE); UNCHANGED(); actions[0].owner.generation = 7;
    actions[0].owner.module = 0;
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); actions[0].owner.module = 1;
    actions[0].action = 0;
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); actions[0].action = 100;
    actions[0].key = 0;
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); actions[0].key = 40;
    actions[0].label = 0;
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); actions[0].label = action_labels[0];
    for (i = 0; i < 32; ++i) action_labels[0][i] = 'A';
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); action_labels[0][31] = 0;
    action_labels[0][0] = '\n';
    CHECK(open_menu(6, 1) == BS_MENU_INVALID); UNCHANGED(); action_labels[0][0] = 'A';
    copy(&broken, &backend, sizeof(backend)); broken.invoke = 0;
    CHECK(bs_menu_open_locked(&menu, 6, labels, callbacks, 1, actions, trampoline, &broken, &token) == BS_MENU_INVALID); UNCHANGED();
    CHECK(bs_menu_open_locked(&menu, 6, labels, callbacks, 1, actions, 0, &backend, &token) == BS_MENU_INVALID); UNCHANGED();
    CHECK(open_menu(6, 1) == BS_MENU_OK); CHECK(menu.text[6][30] == 'A' && menu.text[6][31] == 0);
    CHECK(bs_menu_dispatch_locked(0, 1, 6) == BS_MENU_INVALID);
    CHECK(bs_menu_retire_locked(0, 1) == BS_MENU_INVALID);
    CHECK(bs_menu_detached_locked(0, 1) == BS_MENU_INVALID);
    CHECK(bs_menu_dispatch_locked(&menu, 0, 6) == BS_MENU_INVALID);
    return 0;
}
int bs_menu_selftest(void) {
    int r = successful_menus(); if (r) return r;
    r = stale_and_retirement(); if (r) return r;
    return refusals();
}
