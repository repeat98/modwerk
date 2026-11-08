/* SPDX-License-Identifier: MIT */
/* Private fixed-owner resident menu experiment. Two immutable layouts stay
 * pinned forever. No mutable detachment, loader reclamation or hardware proof. */
#include "resident_menu.h"
#include "preview_session.h"
extern struct bs_selection_context bs_native_selection;
extern uint32_t bs_selection_active,bs_selection_taken,bs_selection_refused;
extern uint32_t bs_boot_begin(uint32_t,uint32_t,uint32_t);
struct bs_resident_menu bs_resident_six,bs_resident_nine;
bs_editor_menu *bs_boot_menu_current;
uint32_t bs_boot_menu_token,bs_boot_menu_calls,bs_boot_menu_status;
uint32_t bs_boot_menu_opens,bs_boot_menu_generation,bs_boot_menu_pending;
static struct bs_resident_menu *current;
static int32_t *stock_selection;
static uint32_t stock_initial;
static uint32_t lock(void){uint32_t saved;__asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(saved)::"memory");return saved;}
static void unlock(uint32_t saved){__asm__ __volatile__("move.w %0,%%sr"::"d"(saved):"memory");}
static uint32_t word(uint32_t address){return *(volatile uint32_t *)(uintptr_t)address;}
static int owner_valid(void *context,const bs_menu_owner *owner){(void)context;return owner->module==17 && owner->generation==bs_boot_menu_generation;}
static int invoke(void *context,const bs_menu_owner *owner,uint32_t action){
    (void)context;if(!owner_valid(0,owner) || action!=1)return 0;
    ++bs_boot_menu_calls;bs_boot_menu_pending=1;return 1;
}
static int same_label(const char *a,const char *b){
    for(uint32_t i=0;i<BS_MENU_LABEL_BYTES;++i){if(a[i]!=b[i])return 0;if(!a[i])return 1;}return 0;
}
static int same_layout(const bs_editor_menu *m,uint32_t count,const char *const *labels,const bs_menu_callback *callbacks){
    if(m->stock_count!=count || m->count!=count+1)return 0;
    for(uint32_t i=0;i<count;++i)if(m->callbacks[i]!=callbacks[i] || !same_label(m->labels[i],labels[i]))return 0;
    return 1;
}
static void dispatch(void){
    uint32_t saved=lock();
    if(!current || !bs_selection_active){++bs_selection_refused;unlock(saved);return;}
    uint32_t before=bs_native_selection.state;
    /* Native selection cleanup is independent of whether its owner is still
     * valid. Restore the remembered stock index only for this exact dispatch. */
    const struct bs_selection_binding *binding=&bs_native_selection.binding;
    if(before==BS_SELECTION_ARMED && binding->table==current->menu.callbacks &&
       binding->callback==dispatch && binding->task==word(0x800068fc) && binding->domain==1 &&
       binding->epoch==current->menu.serial && binding->row>=current->menu.stock_count &&
       binding->row<current->menu.count && word(0x460e5e34)==(uint32_t)(uintptr_t)stock_selection)
        *stock_selection=(int32_t)stock_initial;
    bs_boot_menu_status=bs_resident_menu_dispatch_locked(current,&bs_native_selection,word(0x800068fc));
    if(before==BS_SELECTION_ARMED && bs_native_selection.state==BS_SELECTION_CONSUMED){
        ++bs_selection_taken;
    }else ++bs_selection_refused;
    unlock(saved);
}
uint32_t bs_boot_menu_prepare(void){if(bs_boot_menu_generation)return 1;bs_boot_menu_generation=7;return 0;}
void bs_boot_menu_open(uint32_t count,uint32_t initial,int32_t *selection,
    const char *const *labels,const bs_menu_callback *callbacks){
    void (*open)(uint32_t,uint32_t,int32_t *,const char *const *,const bs_menu_callback *)=
        (void (*)(uint32_t,uint32_t,int32_t *,const char *const *,const bs_menu_callback *))0x4006d94cu;
    uint32_t saved=lock();
    int idle=!bs_selection_active && !word(0x460e5e30);
    if(idle && bs_native_selection.state==BS_SELECTION_IDLE && bs_native_selection.serial!=UINT32_MAX &&
       bs_boot_menu_generation==7 && (count==6 || count==9)){
        if(current && current->menu.state==BS_MENU_OPEN)
            (void)bs_resident_menu_retire_locked(current,current->menu.serial);
        struct bs_resident_menu *next=count==6?&bs_resident_six:&bs_resident_nine;
        if(!next->enrolled){
            bs_menu_action action={123,1,{17,7},"BEAT GRID"};bs_menu_backend backend={0,owner_valid,invoke};
            bs_boot_menu_status=bs_resident_menu_materialize_locked(next,count,labels,callbacks,1,&action,dispatch,&backend,1,1,&bs_boot_menu_token);
        }else if(!same_layout(&next->menu,count,labels,callbacks))bs_boot_menu_status=BS_MENU_STALE;
        else bs_boot_menu_status=bs_resident_menu_reopen_locked(next,&bs_native_selection,idle,1,&bs_boot_menu_token);
        if(bs_boot_menu_status==BS_MENU_OK){
            current=next;bs_boot_menu_current=&next->menu;stock_selection=selection;
            stock_initial=initial<count?initial:0;++bs_boot_menu_opens;
            unlock(saved);open(next->menu.count,stock_initial,selection,next->menu.labels,next->menu.callbacks);return;
        }
    }
    unlock(saved);open(count,initial<count?initial:0,selection,labels,callbacks);
}
uint32_t bs_boot_menu_revoke(void){uint32_t saved=lock();++bs_boot_menu_generation;unlock(saved);return 0;}
/* Only called by the UI task after owner retirement. Ordinary closed UI state
 * must not dismiss the root menu while it is awaiting the player's selection. */
void bs_resident_close_owned(void){
    if(bs_boot_menu_generation==7 || bs_selection_active || !current)return;
    if(word(0x460e5e30) && word(0x460e5e28)==(uint32_t)(uintptr_t)current->menu.callbacks &&
       word(0x460e5e2c)==(uint32_t)(uintptr_t)current->menu.labels)
        ((void (*)(void))0x4006d754u)();
    uint32_t saved=lock();
    (void)bs_resident_menu_retire_locked(current,current->menu.serial);
    unlock(saved);
}
uint32_t bs_selection_late_menu(void){uint32_t before=bs_boot_menu_calls;dispatch();return bs_boot_menu_calls-before;}
uint32_t bs_boot_menu_service(void){
    uint32_t saved=lock(),pending=bs_boot_menu_pending;bs_boot_menu_pending=0;
    if(bs_boot_menu_generation!=7){unlock(saved);return BS_SESSION_STALE;}
    unlock(saved);return pending?bs_boot_begin(BS_SAMPLE_BPM,1,1):BS_SESSION_IDLE;
}
