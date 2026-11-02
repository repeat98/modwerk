/* SPDX-License-Identifier: MIT */
/* UI work copies intent/results only; the engine owns source reads/planning. */
#include "preview_async.h"
extern struct bs_preview_async bs_async_fixture;
extern struct bs_preview_guard bs_worker_test_guard;
extern uint32_t bs_grid_ui_service(void), bs_boot_menu_revoke(void);
extern void bs_async_wake(void);
uint32_t bs_ui_tick_enabled,bs_ui_tick_calls,bs_ui_tick_steps,bs_ui_tick_max_steps,bs_ui_tick_reentry;
static uint32_t busy,blocked,retire_pending;
void bs_ui_tick(void) {
    ++bs_ui_tick_calls;
    if(retire_pending){
        if(bs_async_revoke(&bs_async_fixture,1,2)){retire_pending=0;bs_async_wake();}
        return;
    }
    if(!bs_ui_tick_enabled)return;
    if(busy){
        bs_ui_tick_reentry=1;bs_ui_tick_enabled=0;retire_pending=1;
        (void)bs_boot_menu_revoke();return;
    }
    busy=1;(void)bs_grid_ui_service();++bs_ui_tick_steps;bs_ui_tick_max_steps=1;busy=0;
}
uint32_t bs_ui_tick_enable(void) {
    if(busy || bs_ui_tick_enabled || bs_ui_tick_reentry)return 1;
    bs_ui_tick_enabled=1;return 0;
}
uint32_t bs_ui_block(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    if(!blocked)blocked=bs_guard_writer_begin(&bs_worker_test_guard);
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
    return blocked;
}
uint32_t bs_ui_unblock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    uint32_t ok=bs_guard_writer_end(&bs_worker_test_guard,blocked);blocked=0;
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
    if(ok)bs_async_wake();
    return !ok;
}
uint32_t bs_ui_main_sp(void) {
    uint32_t value;__asm__ __volatile__("move.l %%sp,%0" : "=d"(value));return value;
}
