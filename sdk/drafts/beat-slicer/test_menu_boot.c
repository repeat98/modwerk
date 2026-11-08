/* SPDX-License-Identifier: MIT */
/* Private 1.40C emulator fixture only. One contribution per boot; stable
 * reserved storage is never detached/reused. No loader ABI, native ownership
 * proof, production hook, Apply, package removal or hardware qualification. */
#include "editor_menu.h"
#include "preview_session.h"
extern uint32_t bs_boot_begin(uint32_t, uint32_t, uint32_t);
bs_editor_menu bs_boot_menu;
uint32_t bs_boot_menu_token, bs_boot_menu_calls, bs_boot_menu_status;
uint32_t bs_boot_menu_opens, bs_boot_menu_generation;
uint32_t bs_boot_menu_pending;
static int32_t *stock_selection;
static uint32_t stock_initial;
static uint32_t lock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
uint32_t bs_boot_menu_prepare(void) {
    if (bs_boot_menu_generation) return 1;
    bs_boot_menu_generation = 7;
    return 0;
}
static int owner_valid(void *context, const bs_menu_owner *owner) {
    (void)context;
    return owner->module == 17 && owner->generation == bs_boot_menu_generation;
}
static int invoke(void *context, const bs_menu_owner *owner, uint32_t action) {
    (void)context;
    if (!owner_valid(0, owner) || action != 1) return 0;
    ++bs_boot_menu_calls;
    bs_boot_menu_pending = 1;
    return 1;
}
static void dispatch(void) {
    uint32_t saved = lock();
    /* Keep the native remembered action within its original stock row range.
     * The next ordinary stock open must never inherit the appended row index. */
    bs_boot_menu.selection = *stock_selection;
    *stock_selection = (int32_t)stock_initial;
    bs_boot_menu_status = bs_menu_dispatch_locked(&bs_boot_menu, bs_boot_menu_token,
                                                  (uint32_t)bs_boot_menu.selection);
    unlock(saved);
}
void bs_boot_menu_open(uint32_t count, uint32_t initial, int32_t *selection,
        const char *const *labels, const bs_menu_callback *callbacks) {
    void (*open)(uint32_t, uint32_t, int32_t *, const char *const *, const bs_menu_callback *) =
        (void (*)(uint32_t, uint32_t, int32_t *, const char *const *, const bs_menu_callback *))0x4006d94cu;
    uint32_t saved = lock();
    if (!bs_boot_menu_opens) {
        bs_menu_action action = {123, 1, {17, 7}, "BEAT GRID"};
        bs_menu_backend backend = {0, owner_valid, invoke};
        bs_boot_menu_status = bs_menu_open_locked(&bs_boot_menu, count, labels, callbacks,
                                    1, &action, dispatch, &backend, &bs_boot_menu_token);
        if (bs_boot_menu_status == BS_MENU_OK) {
            stock_selection = selection;
            stock_initial = initial < count ? initial : 0;
            ++bs_boot_menu_opens;
            unlock(saved);
            open(bs_boot_menu.count, stock_initial, selection, bs_boot_menu.labels, bs_boot_menu.callbacks);
            return;
        }
    } else {
        /* A later stock opener supersedes this one-shot fixture. Keep every
         * old array pinned, and retire dispatch rather than claiming detach. */
        (void)bs_menu_retire_locked(&bs_boot_menu, bs_boot_menu_token);
    }
    unlock(saved);
    open(count, initial, selection, labels, callbacks);
}
uint32_t bs_boot_menu_revoke(void) {
    uint32_t saved = lock();
    ++bs_boot_menu_generation;
    unlock(saved);
    return 0;
}
/* Driver-borrowed main call, NOT an installed background service. The menu
 * callback only publishes intent; planner initialization stays outside it. */
uint32_t bs_boot_menu_service(void) {
    uint32_t saved = lock(), pending = bs_boot_menu_pending;
    bs_boot_menu_pending = 0;
    if (bs_boot_menu_generation != 7) {
        unlock(saved);
        return BS_SESSION_STALE;
    }
    unlock(saved);
    return pending ? bs_boot_begin(BS_SAMPLE_BPM, 1, 1) : BS_SESSION_IDLE;
}
