/* SPDX-License-Identifier: MIT
 * Resident AED menu and stock confirmation adapter. All arrays, strings and
 * callbacks retained by stock live in the base; package entries are resolved
 * only from a fresh full published owner under the stable loader lock.
 */
#include "sample_editor_board.h"
#include "modwerk_events.h"
#define ACTIONS 4u
#define STOCK_ROWS 9u
#define ROWS (STOCK_ROWS+ACTIONS)
#define YES 0x31
typedef void (*callback)(void);
struct binding {struct runtime_owner owner;struct mw_sample_action_view action;uint32_t live;};
static struct binding bindings[ACTIONS],pending;
static uint32_t binding_count,stock_count,serial,root_task,root_kind,root_slot;
static uint32_t pending_at,pending_kind,pending_slot,pending_generation;
static uint32_t question_token,question_active,question_pending,yes_down;
static uint32_t initial;
static int32_t *remembered;
static char text[ROWS][32];
static const char *labels[ROWS];
static callback callbacks[ROWS];
/* Captured native selection authority, before popup destruction and before
 * its direct-dispatch tail. An old callback address is never sufficient. */
static uint32_t select_active,select_armed,select_serial,select_row,select_task,select_sp,select_return;
static callback select_callback;
static uint32_t read32(uint32_t at)
{return *(volatile uint32_t *)(uintptr_t)at;}
static void copy(void *out,const void *in,uint32_t n)
{uint8_t *a=out;const uint8_t *b=in;for(uint32_t i=0;i<n;++i)a[i]=b[i];}
static void say(const char *message)
{((void (*)(const char *,unsigned))0x4005a2b8u)(message,0xa0);}
static void open_stock(uint32_t n,uint32_t selected,int32_t *out,const char *const *names,const callback *actions)
{((void (*)(uint32_t,uint32_t,int32_t *,const char *const *,const callback *))0x4006d94cu)(n,selected,out,names,actions);}
static int label_copy(char *out,const char *in)
{
    for(unsigned i=0;i<32u;++i){out[i]=in[i];if(!in[i])return i!=0;}
    return 0;
}
static int image(const struct runtime_owner *o,uintptr_t *base)
{
    if(o->owned_extent>UINTPTR_MAX-o->extent_bytes || o->image_offset>o->extent_bytes ||
       o->image_bytes>o->extent_bytes-o->image_offset)return 0;
    *base=o->owned_extent+o->image_offset;return 1;
}
static int bind(uintptr_t record,struct binding *out)
{
    struct runtime_owner owner;
    uintptr_t base;
    if(!modwerk_runtime_owner_at(record,&owner) || !mw_sample_owner_current_locked(&owner) ||
       !image(&owner,&base) || record<base || record-base>UINT32_MAX || base>UINT32_MAX)return 0;
    uint32_t masked=modwerk_machine_mask();
    int ok=mw_sample_action_decode((const uint8_t *)base,owner.image_bytes,(uint32_t)(record-base),
                                  (uint32_t)base,0,&out->action);
    modwerk_machine_unmask(masked);
    if(!ok)return 0;
    copy(&out->owner,&owner,sizeof owner);out->live=1;return 1;
}
static void dispatch(void)
{
    uint32_t saved=modwerk_machine_lock();
    if(!select_active || !select_armed || select_callback!=dispatch || select_serial!=serial ||
       select_task!=read32(0x800068fcu) || select_row<stock_count || select_row>=stock_count+binding_count) {
        modwerk_machine_unlock(saved);return;
    }
    select_armed=0; /* one use, including refusal */
    if(remembered)*remembered=(int32_t)initial;
    struct binding *b=&bindings[select_row-stock_count];
    if(b->live && mw_sample_owner_current_locked(&b->owner) &&
       read32(0x46c8d1a0u)==root_kind && read32(0x46c8d19cu)==root_slot) {
        copy(&pending,b,sizeof pending);pending_at=modwerk_runtime_ticks;
        pending_kind=root_kind;pending_slot=root_slot;
        uint32_t control=(root_kind?0x46c922c4u:0x46c90a78u)+44u*root_slot;
        pending_generation=read32(control+20u);
    }
    modwerk_machine_unlock(saved);
}
void mw_sample_menu_open(uint32_t count,uint32_t selected,int32_t *out,
    const char *const *names,const callback *actions)
{
    uint32_t saved=modwerk_machine_lock();
    mw_sample_editor_bootstrap();
    uint32_t kind=read32(0x46c8d1a0u),slot=read32(0x46c8d19cu);
    int known=(count==6u && (uintptr_t)names==0x400ceb8cu && (uintptr_t)actions==0x400ceb74u) ||
              (count==9u && (uintptr_t)names==0x400cebc8u && (uintptr_t)actions==0x400ceba4u);
    int admissible=known && out && !select_active && !read32(0x460e5e30u) &&
        !question_active && !pending.live && serial!=UINT32_MAX && kind<=1u && slot<128u;
    uint32_t added=0;
    if(admissible) {
        const volatile uintptr_t *row=modwerk_runtime_event_row[MODWERK_OT_SAMPLE_EDITOR_ACTIONS-RUNTIME_EVENTS];
        for(unsigned i=0;i<ACTIONS && row[i];++i) {
            if(!bind(row[i],&bindings[added])){added=0;admissible=0;break;}
            ++added;
        }
        for(unsigned i=0;admissible && added && i<count;++i) {
            if(!label_copy(text[i],names[i])){admissible=0;break;}
            labels[i]=text[i];callbacks[i]=actions[i];
        }
    }
    if(admissible && added) {
        for(unsigned i=0;i<added;++i) {
            copy(text[count+i],bindings[i].action.label,32);
            labels[count+i]=text[count+i];callbacks[count+i]=dispatch;
        }
        stock_count=count;binding_count=added;++serial;
        root_task=read32(0x800068fcu);root_kind=kind;root_slot=slot;
        initial=selected<count?selected:0;remembered=out;
        modwerk_machine_unlock(saved);
        open_stock(count+added,initial,out,labels,callbacks);return;
    }
    modwerk_machine_unlock(saved);
    open_stock(count,selected<count?selected:0,out,names,actions);
}
uint32_t mw_sample_selection_enter(uint32_t returned,uint32_t sp)
{
    /* Ordinary stock menus, including legitimate nested stock dispatch, take
     * their original stack/return path and do not borrow our outer authority. */
    if(!read32(0x460e5e30u) || read32(0x460e5e28u)!=(uint32_t)(uintptr_t)callbacks ||
       read32(0x460e5e2cu)!=(uint32_t)(uintptr_t)labels)return 2;
    if(select_active)return 0; /* reject nested dispatcher before stock runs */
    select_active=1;select_armed=0;select_serial=0;select_sp=sp;select_return=returned;
    select_callback=0;
    uint32_t row=read32(0x460e5e40u);
    if(read32(0x460e5e30u) && read32(0x460e5e28u)==(uint32_t)(uintptr_t)callbacks &&
       read32(0x460e5e2cu)==(uint32_t)(uintptr_t)labels && read32(0x800068fcu)==root_task &&
       row<stock_count+binding_count) {
        select_serial=serial;select_row=row;select_task=root_task;select_callback=callbacks[row];
    }
    return 1;
}
void mw_sample_selection_arm(callback chosen,uint32_t sp)
{
    if(select_active && select_serial==serial && select_serial && sp==select_sp &&
       !read32(0x460e5e30u) && read32(0x460e5e28u)==(uint32_t)(uintptr_t)callbacks &&
       read32(0x460e5e2cu)==(uint32_t)(uintptr_t)labels &&
       read32(0x460e5e40u)==select_row && read32(0x800068fcu)==select_task && chosen==select_callback)
        select_armed=1;
}
uint32_t mw_sample_selection_leave(uint32_t sp)
{
    uint32_t returned=select_return;
    if(!select_active || sp!=select_sp+4u) {
        /* A broken wrapper cannot authorize any package action. */
        pending.live=0;serial=UINT32_MAX;
    }
    select_active=select_armed=select_serial=select_sp=select_return=0;select_callback=0;
    return returned;
}
static int owned_by(const struct binding *b,const struct runtime_dsp *d)
{
    uintptr_t base;
    return b->live && d && d->present && image(&b->owner,&base) &&
        b->owner.module==d->module && base==(uintptr_t)d->image;
}
void mw_sample_menu_retire_locked(const struct runtime_dsp *from)
{
    for(unsigned i=0;i<binding_count;++i)if(owned_by(&bindings[i],from))bindings[i].live=0;
    if(owned_by(&pending,from))pending.live=0;
}
static void answer(uint32_t yes)
{
    if(!question_active)return;
    uint32_t token=question_token;
    unsigned why=mw_sample_editor_answer(&mw_sample_editor,token,yes!=0);
    if(why==MODWERK_SAMPLE_BUSY) {
        if(!question_pending)say("WAITING FOR SOURCE");
        question_pending=1;return;
    }
    question_active=question_pending=question_token=0;
    if(why==MODWERK_SAMPLE_APPLIED)mw_sample_refresh_ui();
    else if(yes && why!=MODWERK_SAMPLE_NO_CHANGE)say("SOURCE CHANGED");
}
int mw_sample_ui_key(int code,int pressed)
{
    if(code==YES)yes_down=pressed!=0;
    if(question_pending && pressed && code!=YES) {
        answer(0); /* cancel before passing another stock gesture */
        if(code==0x32)return 1;
    }
    return 0;
}
void mw_sample_ui_tick(void)
{
    mw_sample_editor_bootstrap();
    if(question_pending)answer(1);
    if(pending.live && !select_active && !question_active && !read32(0x460e5e30u)) {
        uint32_t saved=modwerk_machine_lock(),token=0;
        uint32_t control=(pending_kind?0x46c922c4u:0x46c90a78u)+44u*pending_slot;
        unsigned why=MODWERK_SAMPLE_STALE;
        if(read32(0x46c8d1a0u)==pending_kind && read32(0x46c8d19cu)==pending_slot &&
           read32(control+20u)==pending_generation)
            why=mw_sample_editor_begin(&mw_sample_editor,&pending.owner,&token);
        if(why==MODWERK_SAMPLE_BUSY && (uint32_t)(modwerk_runtime_ticks-pending_at)<180u) {
            modwerk_machine_unlock(saved);return;
        }
        pending.live=0;
        uintptr_t base;
        if(why==MODWERK_SAMPLE_OK && image(&pending.owner,&base) && mw_sample_owner_current_locked(&pending.owner)) {
            void (*open)(uint32_t,const struct modwerk_sample_editor_api *)=
                (void (*)(uint32_t,const struct modwerk_sample_editor_api *))(base+pending.action.entry_offset);
            open(token,&mw_sample_editor_api);
            modwerk_machine_unlock(saved);return;
        }
        modwerk_machine_unlock(saved);
        say(why==MODWERK_SAMPLE_BUSY?"STOP PLAY / RECORD":"EDIT NOT AVAILABLE");
    }
    if(mw_sample_editor.state==MW_SAMPLE_PROMPT && !question_active && !yes_down &&
       !select_active && !read32(0x460e5e30u)) {
        /* Wait for the originating YES to be released before showing the same
         * native question primitive stock slice deletion uses. Its retained
         * string/callback are base-owned. No Apply occurs merely by showing it. */
        question_token=mw_sample_editor.serial;question_active=1;
        const char *prompt=mw_sample_editor.replacing && mw_sample_editor.before.view.count?
            "REPLACE SLICES?":"CREATE SLICES?";
        ((void (*)(const char *,void (*)(uint32_t)))0x400581c4u)(prompt,answer);
    }
}
