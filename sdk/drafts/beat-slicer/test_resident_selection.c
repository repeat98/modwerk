/* SPDX-License-Identifier: MIT */
/* Private pinned-storage native dispatcher experiment. No production hook or
 * loader lease. Nested selection is refused before stock dispatch; qualify
 * legitimate nesting and complete reference retirement before any base ABI. */
#include "selection_context.h"
extern bs_editor_menu *bs_boot_menu_current;
extern uint32_t bs_boot_menu_token,bs_boot_menu_generation;
extern int bs_ui_selection_binding(struct bs_selection_binding *);
struct bs_selection_context bs_native_selection;
uint32_t bs_selection_entries,bs_selection_exits,bs_selection_nested,bs_selection_faults;
uint32_t bs_selection_captured,bs_selection_armed,bs_selection_taken,bs_selection_refused;
uint32_t bs_selection_active,bs_selection_ticket;
static uint32_t original_return,entry_sp;
static uint32_t word(uint32_t address) { return *(volatile uint32_t *)(uintptr_t)address; }
static uint32_t task(void) { return word(0x800068fc); }
uint32_t bs_native_selection_enter(uint32_t returned,uint32_t sp) {
    if(bs_selection_active){++bs_selection_nested;return 0;}
    bs_selection_active=1;original_return=returned;entry_sp=sp;++bs_selection_entries;
    bs_selection_ticket=0;
    struct bs_selection_binding b;
    uint32_t window=word(0x460e5e30),row=word(0x460e5e40);
    const bs_menu_callback *table=(const bs_menu_callback *)(uintptr_t)word(0x460e5e28);
    if(window && bs_boot_menu_current && table==bs_boot_menu_current->callbacks &&
       word(0x460e5e2c)==(uint32_t)(uintptr_t)bs_boot_menu_current->labels &&
       bs_boot_menu_current->state==BS_MENU_OPEN && row>=bs_boot_menu_current->stock_count &&
       row<bs_boot_menu_current->count){
        b.owner.module=17;b.owner.generation=bs_boot_menu_generation;
        b.domain=1;b.epoch=bs_boot_menu_token;b.count=bs_boot_menu_current->count;
    } else if(!bs_ui_selection_binding(&b))return 1;
    b.window=window;b.task=task();b.table=table;b.row=row;b.callback=table[row];
    if(bs_selection_capture_locked(&bs_native_selection,&b,&bs_selection_ticket)==BS_MENU_OK)
        ++bs_selection_captured;
    else ++bs_selection_faults;
    return 1;
}
void bs_native_selection_arm(bs_menu_callback callback,uint32_t sp) {
    if(!bs_selection_active || sp!=entry_sp){++bs_selection_faults;return;}
    if(!bs_selection_ticket)return;
    if(word(0x460e5e30)) {++bs_selection_faults;return;}
    if(bs_selection_arm_locked(&bs_native_selection,bs_selection_ticket,task(),
       (const bs_menu_callback *)(uintptr_t)word(0x460e5e28),word(0x460e5e40),callback)==BS_MENU_OK)
        ++bs_selection_armed;
    else ++bs_selection_faults;
}
uint32_t bs_native_selection_leave(uint32_t sp) {
    if(!bs_selection_active || sp!=entry_sp+4)++bs_selection_faults;
    if(bs_selection_ticket && bs_selection_end_locked(&bs_native_selection,bs_selection_ticket)!=BS_MENU_OK)
        ++bs_selection_faults;
    uint32_t returned=original_return;
    bs_selection_ticket=0;bs_selection_active=0;original_return=entry_sp=0;++bs_selection_exits;
    return returned;
}
int bs_native_selection_take(bs_menu_callback callback,uint32_t domain,uint32_t epoch,uint32_t *row) {
    bs_menu_owner owner={17,bs_boot_menu_generation};
    if(bs_selection_active && bs_selection_take_locked(&bs_native_selection,task(),callback,domain,owner,epoch,row)){
        ++bs_selection_taken;return 1;
    }
    ++bs_selection_refused;return 0;
}
