/* SPDX-License-Identifier: MIT
 * The actual resident menu with authored metadata and firmware calls stubbed.
 * Admission decoding and the board have independent fixtures. No firmware.
 */
#include <stdio.h>
#include <string.h>
#include "sample_editor_menu.c"
#define CHECK(x) do {if(!(x)){printf("FAIL line %u\n",(unsigned)__LINE__);return 1;}}while(0)
struct mw_sample_editor mw_sample_editor;
volatile uint32_t modwerk_runtime_ticks;
static uintptr_t entries[]={0x20000040u,0};
uintptr_t volatile *const modwerk_runtime_event_row[RUNTIME_SITE_EVENTS]={
    [MODWERK_OT_SAMPLE_EDITOR_ACTIONS-RUNTIME_EVENTS]=entries
};
static struct runtime_owner fixture_owner;
static struct mw_sample_capture source;
static unsigned held,bad,available,live,opens,prompts,writes,refreshes,menu_rows,menu_selected;
static unsigned stale_publish;
static uint32_t menu_active,menu_names,menu_actions,cursor,window_flags,window_callback;
static uint32_t task,kind,slot,generation,opened_token;
static void (*native_answer)(uint32_t);
static char notice[32];
static const char *const stock_names[]={"STOCK ZERO","STOCK ONE","CREATE SLICE GRID",
    "STOCK THREE","STOCK FOUR","STOCK FIVE","STOCK SIX","STOCK SEVEN","STOCK EIGHT"};
static void stock_action(void){}
uint32_t modwerk_machine_lock(void){return held++;}
void modwerk_machine_unlock(uint32_t old){if(held!=old+1)bad=1;held=old;}
uint32_t modwerk_machine_mask(void){return modwerk_machine_lock();}
void modwerk_machine_unmask(uint32_t old){modwerk_machine_unlock(old);}
int modwerk_runtime_owner_at(uintptr_t at,struct runtime_owner *out)
{if(!live || at!=entries[0])return 0;*out=fixture_owner;return 1;}
int mw_sample_owner_current_locked(const struct runtime_owner *o)
{return held && live && !memcmp(o,&fixture_owner,sizeof *o);}
int mw_sample_action_decode(const uint8_t *p,uint32_t n,uint32_t at,uint32_t base,unsigned encoded,
                           struct mw_sample_action_view *out)
{
    (void)p;(void)n;(void)at;(void)base;(void)encoded;
    if(!held)bad=1;
    memset(out,0,sizeof *out);out->entry_offset=32;strcpy(out->label,"TEST GRID");return 1;
}
uint32_t mw_sample_menu_host_read(uint32_t at)
{
    switch(at) {
    case 0x800068fcu:return task;
    case 0x46c8d1a0u:return kind;
    case 0x46c8d19cu:return slot;
    case 0x46c922d8u:return generation;
    case 0x460e5e30u:return menu_active;
    case 0x460e5e28u:return menu_actions;
    case 0x460e5e2cu:return menu_names;
    case 0x460e5e40u:return cursor;
    case 0x460d1e34u:return window_flags;
    case 0x460d477cu:return window_callback;
    default:bad=1;return 0;
    }
}
const char *mw_sample_menu_host_name(uintptr_t p,unsigned row)
{
    if(p!=0x400ceb8cu && p!=0x400cebc8u)bad=1;
    if(p==0x400cebc8u && row==5)return "CREATE SLICE GRID";
    if(p==0x400cebc8u && row==2)return "STOCK TWO";
    return stock_names[row];
}
callback mw_sample_menu_host_callback(uintptr_t p,unsigned row)
{if(p!=0x400ceb74u && p!=0x400ceba4u)bad=1;return row? (callback)(uintptr_t)(0x1000u+4u*row):stock_action;}
void mw_sample_menu_host_say(const char *s){snprintf(notice,sizeof notice,"%s",s);}
void mw_sample_menu_host_open_stock(uint32_t n,uint32_t selected,int32_t *out,
                                   const char *const *names,const callback *actions)
{
    (void)out;if(held)bad=1;
    menu_rows=n;menu_selected=cursor=selected;menu_active=1;
    menu_names=(uint32_t)(uintptr_t)names;menu_actions=(uint32_t)(uintptr_t)actions;
}
void mw_sample_menu_host_question(const char *s,void (*cb)(uint32_t))
{
    if(strcmp(s,"CREATE SLICES?") && strcmp(s,"REPLACE SLICES?"))bad=1;
    ++prompts;native_answer=cb;window_flags=32;window_callback=(uint32_t)(uintptr_t)cb;
}
void mw_sample_menu_host_open_action(uintptr_t at,uint32_t token,const struct modwerk_sample_editor_api *api)
{if(!held || at!=0x20000020u || api!=&mw_sample_editor_api)bad=1;++opens;opened_token=token;}
void mw_sample_refresh_ui(void){++refreshes;}
static int ready(void *p){(void)p;return available;}
static int owner(void *p,const struct runtime_owner *o){(void)p;return mw_sample_owner_current_locked(o);}
static uint32_t lock(void *p){(void)p;return modwerk_machine_lock();}
static void unlock(void *p,uint32_t old){(void)p;modwerk_machine_unlock(old);}
static unsigned capture(void *p,struct mw_sample_capture *out){(void)p;*out=source;return MODWERK_SAMPLE_OK;}
static unsigned publish(void *p,const struct mw_sample_capture *before,const struct mw_sample_edit *edit)
{
    (void)p;if(!held || memcmp(before,&source,sizeof source))bad=1;
    if(stale_publish)return MODWERK_SAMPLE_STALE;
    if(edit->count==source.view.count && !memcmp(edit->records,source.view.records,sizeof edit->records))
        return MODWERK_SAMPLE_NO_CHANGE;
    ++writes;source.view.count=edit->count;memcpy(source.view.records,edit->records,sizeof edit->records);
    return MODWERK_SAMPLE_APPLIED;
}
static const struct mw_sample_backend backend={0,lock,unlock,ready,owner,capture,publish};
void mw_sample_editor_bootstrap(void)
{if(!mw_sample_editor.initialized && !mw_sample_editor_init(&mw_sample_editor,&backend))bad=1;}
static unsigned api_copy(uint32_t t,struct modwerk_sample_view *v){return mw_sample_editor_copy(&mw_sample_editor,t,v);}
static unsigned api_confirm(uint32_t t,const struct modwerk_sample_grid *g){return mw_sample_editor_confirm(&mw_sample_editor,t,g);}
static unsigned api_replace(uint32_t t,const struct modwerk_sample_grid *g){return mw_sample_editor_replace(&mw_sample_editor,t,g);}
static void api_cancel(uint32_t t){mw_sample_editor_cancel(&mw_sample_editor,t);}
const struct modwerk_sample_editor_api mw_sample_editor_api={MODWERK_SAMPLE_EDITOR_ABI,sizeof mw_sample_editor_api,
    api_copy,api_confirm,api_cancel,api_replace};
static void reset(void)
{
    memset(&mw_sample_editor,0,sizeof mw_sample_editor);memset(&source,0,sizeof source);
    memset(&fixture_owner,0,sizeof fixture_owner);memset(bindings,0,sizeof bindings);memset(&pending,0,sizeof pending);
    binding_count=stock_count=action_at=serial=root_task=root_kind=root_slot=0;
    pending_at=pending_kind=pending_slot=pending_generation=0;
    question_token=question_active=question_pending=yes_down=0;
    select_active=select_armed=select_serial=select_row=select_task=select_sp=select_return=0;select_callback=0;
    held=bad=opens=prompts=writes=refreshes=stale_publish=0;available=live=1;
    menu_active=menu_names=menu_actions=cursor=window_flags=window_callback=0;
    task=0x12340000;kind=1;slot=0;generation=7;modwerk_runtime_ticks=0;notice[0]=0;
    fixture_owner.module=17;fixture_owner.generation=9;fixture_owner.owned_extent=0x20000000;
    fixture_owner.extent_bytes=2048;fixture_owner.image_bytes=1024;
    source.view.kind=1;source.view.frames=source.view.trim_end=44100;
    source.view.frame_rate=44100;source.view.sample_bpm24=source.view.project_bpm24=2880;
}
static int32_t remembered_row;
static void open_menu(unsigned count)
{
    menu_active=0;remembered_row=0;
    mw_sample_menu_open(count,0,&remembered_row,
        (const char *const *)(uintptr_t)(count==6?0x400ceb8cu:0x400cebc8u),
        (const callback *)(uintptr_t)(count==6?0x400ceb74u:0x400ceba4u));
}
static int select_grid(void)
{
    CHECK(binding_count==1);cursor=action_at;
    CHECK(mw_sample_selection_enter(0x12345678,0x9000)==1);
    menu_active=0;mw_sample_selection_arm(dispatch,0x9000);callbacks[action_at]();
    CHECK(mw_sample_selection_leave(0x9004)==0x12345678);
    mw_sample_ui_tick();return 0;
}
static int prompt(void)
{
    struct modwerk_sample_grid g={0};g.count=2;g.starts[1]=22050;
    CHECK(mw_sample_editor_replace(&mw_sample_editor,opened_token,&g)==MODWERK_SAMPLE_CONFIRMING);
    mw_sample_ui_key(YES,1);mw_sample_ui_tick();CHECK(!question_active);
    mw_sample_ui_key(YES,0);mw_sample_ui_tick();CHECK(question_active && prompts==1);return 0;
}
static void native_close(unsigned yes)
{native_answer(yes);window_flags=0;} /* stock calls back before unlinking its window */
static int closed(void)
{
    CHECK(!question_active && !question_pending && !question_token && !pending.live &&
          !select_active && !select_armed && !yes_down && !held && !bad);
    CHECK(mw_sample_editor.state==MW_SAMPLE_CLOSED);return 0;
}
int main(void)
{
    for(unsigned count=6;count<=9;count+=3)for(unsigned yes=0;yes<2;++yes) {
        reset();open_menu(count);CHECK(menu_rows==count+1 && !strcmp(labels[action_at],"TEST GRID"));
        CHECK(!strcmp(labels[action_at+1],"CREATE SLICE GRID"));
        for(unsigned i=0;i<count;++i) {
            unsigned target=i<action_at?i:i+1;
            CHECK(!strcmp(labels[target],mw_sample_menu_host_name(count==6?0x400ceb8cu:0x400cebc8u,i)));
            CHECK(callbacks[target]==mw_sample_menu_host_callback(count==6?0x400ceb74u:0x400ceba4u,i));
        }
        CHECK(!select_grid() && opens==1 && !prompt());native_close(yes);
        CHECK(!closed() && writes==yes && refreshes==yes);
        mw_sample_ui_tick();CHECK(writes==yes);open_menu(count);CHECK(menu_rows==count+1);
        cursor=count;CHECK(mw_sample_selection_enter(0x12345678,0x9000)==1);
        menu_active=0;mw_sample_selection_arm(callbacks[cursor],0x9000);
        CHECK(remembered_row==(int32_t)(count-1) && !pending.live);
        CHECK(mw_sample_selection_leave(0x9004)==0x12345678);
    }
    /* Busy YES survives the intentional stock-window close, but publishes once. */
    reset();open_menu(6);CHECK(!select_grid() && !prompt());stale_publish=1;native_close(1);
    CHECK(!closed() && !writes && !refreshes && !strcmp(notice,"SOURCE CHANGED") && !mw_sample_editor.poisoned);
    mw_sample_ui_tick();CHECK(!writes);stale_publish=0;open_menu(6);CHECK(menu_rows==7);
    reset();open_menu(6);CHECK(!select_grid() && !prompt());available=0;native_close(1);
    mw_sample_ui_tick();CHECK(question_pending && !writes);available=1;mw_sample_ui_tick();
    CHECK(!closed() && writes==1);mw_sample_ui_tick();CHECK(writes==1);
    for(unsigned key=0;key<2;++key) {
        reset();open_menu(6);CHECK(!select_grid() && !prompt());available=0;native_close(1);
        CHECK(mw_sample_ui_key(key?0x10:0x32,1)==(key?0:1));available=1;mw_sample_ui_tick();
        CHECK(!closed() && !writes);
    }
    reset();open_menu(6);CHECK(!select_grid() && !prompt());available=0;native_close(1);
    window_flags=32;window_callback=0x12345678;available=1;mw_sample_ui_tick();
    CHECK(!closed() && !writes && window_flags==32 && window_callback==0x12345678);
    /* Lost callback and replacement by another stock question retire only ours. */
    for(unsigned foreign=0;foreign<2;++foreign) {
        reset();open_menu(6);CHECK(!select_grid() && !prompt());
        window_flags=foreign?32:0;window_callback=foreign?0x12345678:window_callback;
        mw_sample_ui_tick();CHECK(!closed() && !writes);
        CHECK(window_flags==(foreign?32u:0u));native_answer(1);CHECK(!writes);
        open_menu(6);CHECK(menu_rows==7);
    }
    /* Owner/source retirement cancels an outstanding question, not a new owner. */
    reset();open_menu(6);CHECK(!select_grid() && !prompt());
    mw_sample_editor_changed_locked(&mw_sample_editor);mw_sample_ui_tick();CHECK(!closed() && !writes);
    /* Begin retries are bounded and can be cancelled before the popup exists. */
    for(unsigned cancel=0;cancel<2;++cancel) {
        reset();open_menu(6);available=0;CHECK(!select_grid() && pending.live && !opens);
        if(cancel)mw_sample_ui_key(0x32,1);else modwerk_runtime_ticks=180;
        mw_sample_ui_tick();CHECK(!pending.live && !opens);
        available=1;mw_sample_ui_tick();CHECK(!opens && !bad);
        open_menu(6);CHECK(menu_rows==7);
    }
    puts("PASS: actual menu selection, prompt ownership, busy confirmation, cancellation and orphan cleanup");
    return 0;
}
