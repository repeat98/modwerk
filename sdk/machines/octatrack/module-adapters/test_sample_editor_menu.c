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
static uintptr_t entries[]={0x20000040u,0,0};
uintptr_t volatile *const modwerk_runtime_event_row[RUNTIME_SITE_EVENTS]={
    [MODWERK_OT_SAMPLE_EDITOR_ACTIONS-RUNTIME_EVENTS]=entries
};
static struct runtime_owner fixture_owner;
static struct mw_sample_capture source;
static unsigned held,bad,available,live,opens,prompts,writes,refreshes,menu_rows,menu_selected;
static unsigned stale_publish,grid_opens,grid_closes;
static unsigned analysis_reads,analysis_posts,analysis_failure;
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
{
    if(!live)return 0;
    if(at==entries[0]){*out=fixture_owner;return 1;}
    if(entries[1] && at==entries[1]){*out=fixture_owner;++out->module;
        out->owned_extent=0x21000000;return 1;}
    return 0;
}
int mw_sample_owner_current_locked(const struct runtime_owner *o)
{
    struct runtime_owner expected;
    if(!held || !live)return 0;
    for(unsigned i=0;i<2 && entries[i];++i)
        if(modwerk_runtime_owner_at(entries[i],&expected) && !memcmp(o,&expected,sizeof *o))return 1;
    return 0;
}
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
{if(!held || (at!=0x20000020u && at!=0x21000020u) || api!=&mw_sample_editor_api)bad=1;++opens;opened_token=token;}
void mw_sample_menu_host_close_grid(void)
{if(held || !stock_grid())bad=1;++grid_closes;menu_active=0;}
void mw_sample_menu_host_open_grid(void)
{if(held)bad=1;++grid_opens;menu_active=1;menu_names=0x400cec34u;menu_actions=0x400cec08u;}
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
static const struct mw_sample_backend backend={0,lock,unlock,ready,owner,capture,publish,0};
void mw_sample_editor_bootstrap(void)
{if(!mw_sample_editor.initialized && !mw_sample_editor_init(&mw_sample_editor,&backend))bad=1;}
static unsigned api_copy(uint32_t t,struct modwerk_sample_view *v){return mw_sample_editor_copy(&mw_sample_editor,t,v);}
static unsigned api_confirm(uint32_t t,const struct modwerk_sample_grid *g){return mw_sample_editor_confirm(&mw_sample_editor,t,g);}
static unsigned api_replace(uint32_t t,const struct modwerk_sample_grid *g){return mw_sample_editor_replace(&mw_sample_editor,t,g);}
static void api_cancel(uint32_t t){mw_sample_editor_cancel(&mw_sample_editor,t);}
const struct modwerk_sample_editor_api mw_sample_editor_api={MODWERK_SAMPLE_EDITOR_ABI,sizeof mw_sample_editor_api,
    api_copy,api_confirm,api_cancel,api_replace};
const struct modwerk_sample_editor_api *mw_sample_editor_public_api(void){return &mw_sample_editor_api;}
void mw_sample_analysis_queue(void){++analysis_posts;}
static int read_pair(void *unused,const struct mw_sample_capture *before,uint32_t at,int32_t *left,int32_t *right)
{
    (void)unused;(void)before;(void)at;++analysis_reads;
    left[0]=left[1]=right[0]=right[1]=0;return !analysis_failure;
}
static const struct mw_sample_backend analysis_backend={0,lock,unlock,ready,owner,capture,publish,read_pair};
static void reset(void)
{
    memset(&mw_sample_editor,0,sizeof mw_sample_editor);memset(&source,0,sizeof source);
    memset(&fixture_owner,0,sizeof fixture_owner);memset(bindings,0,sizeof bindings);memset(&pending,0,sizeof pending);
    binding_count=stock_count=action_at=serial=root_task=root_kind=root_slot=0;
    pending_at=pending_kind=pending_slot=pending_generation=0;
    question_token=question_active=question_pending=yes_down=0;
    analysis_token=analysis_reads=analysis_posts=analysis_failure=0;
    memset(&shortcut_from,0,sizeof shortcut_from);
    shortcut_kind=shortcut_slot=shortcut_generation=shortcut_task=0;
    func_down=aed_down=aed_fresh=aed_taken=0;grid_opens=grid_closes=0;
    entries[0]=0x20000040u;entries[1]=entries[2]=0;
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
/* Model the real order: early observer, package key handler, late consumer,
 * then stock only when no hook took the key. Beat Slicer cancels on FUNC/AED. */
static int key(int code,int pressed)
{
    int took=mw_sample_ui_key(code,pressed);
    if(!took && pressed && (code==FUNC || code==AED) && mw_sample_editor.state==MW_SAMPLE_OPEN)
        api_cancel(opened_token);
    if(!took)took=mw_sample_ui_shortcut_key(code,pressed);
    if(!took && code==AED && pressed && func_down)mw_sample_menu_host_open_grid();
    return took;
}
static void chord(void)
{(void)key(FUNC,1);(void)key(AED,1);(void)key(AED,0);(void)key(FUNC,0);mw_sample_ui_tick();}
static int shortcuts(void)
{
    reset();chord();CHECK(grid_opens==1 && !grid_closes && !opens && stock_grid());
    chord();CHECK(grid_closes==1 && opens==1 && !menu_active && mw_sample_editor.state==MW_SAMPLE_OPEN);
    chord();CHECK(grid_opens==2 && stock_grid() && mw_sample_editor.state==MW_SAMPLE_CLOSED && !writes);
    chord();CHECK(opens==2 && mw_sample_editor.state==MW_SAMPLE_OPEN && !writes && !bad);
    /* Holding FUNC while re-tapping AED works too; duplicate down events do not toggle. */
    reset();(void)key(FUNC,1);CHECK(!key(AED,1) && stock_grid());(void)key(AED,0);
    CHECK(key(AED,1) && !menu_active);CHECK(key(AED,1) && !menu_active && pending.live);
    (void)key(AED,0);mw_sample_ui_tick();CHECK(opens==1 && mw_sample_editor.state==MW_SAMPLE_OPEN);
    CHECK(key(AED,1) && stock_grid());(void)key(AED,0);(void)key(FUNC,0);
    CHECK(!held && !bad && !writes);
    /* Bare AED, unrelated native lists and no subscribers keep their stock path. */
    reset();CHECK(!key(AED,1) && !opens && !grid_opens);(void)key(AED,0);
    reset();entries[0]=0;chord();chord();CHECK(grid_opens==2 && !grid_closes && !opens && !bad);
    reset();menu_active=1;menu_names=0x1234;menu_actions=0x5678;
    (void)mw_sample_ui_key(FUNC,1);(void)mw_sample_ui_key(AED,1);
    CHECK(!mw_sample_ui_shortcut_key(AED,1) && !grid_closes && menu_names==0x1234 && !bad);
    /* A busy source gets a bounded, cancelable fresh open, not a marker write. */
    reset();chord();available=0;chord();CHECK(pending.live && !opens);
    mw_sample_ui_key(0x32,1);available=1;mw_sample_ui_tick();CHECK(!pending.live && !opens && !writes && !bad);
    reset();chord();available=0;chord();modwerk_runtime_ticks=180;mw_sample_ui_tick();
    CHECK(!pending.live && !opens && !writes && !bad);
    /* Source/owner changes after an action closes cannot reuse its shortcut context. */
    for(unsigned why=0;why<3;++why) {
        reset();chord();chord();CHECK(opens==1);
        (void)key(FUNC,1);CHECK(shortcut_from.live && mw_sample_editor.state==MW_SAMPLE_CLOSED);
        if(why==0)++generation;else if(why==1)++task;else live=0;
        (void)mw_sample_ui_key(AED,1);CHECK(!mw_sample_ui_shortcut_key(AED,1));
        CHECK(grid_opens==1 && !pending.live && !writes && !bad);
    }
    /* A foreign dialog that appears after FUNC cancels the captured transition. */
    for(unsigned foreign=0;foreign<2;++foreign) {
        reset();chord();chord();(void)key(FUNC,1);CHECK(shortcut_from.live);
        if(foreign){window_flags=32;window_callback=0x12345678;}
        else {menu_active=1;menu_names=0x1234;menu_actions=0x5678;}
        (void)mw_sample_ui_key(AED,1);CHECK(!mw_sample_ui_shortcut_key(AED,1));
        CHECK(grid_opens==1 && !pending.live && !writes && !bad);
    }
    /* A final stock confirmation is never treated as an options dialog. */
    reset();open_menu(6);CHECK(!select_grid() && !prompt());
    (void)mw_sample_ui_key(FUNC,1);(void)mw_sample_ui_key(AED,1);
    CHECK(!mw_sample_ui_shortcut_key(AED,1) && question_active && !grid_opens && !writes && !bad);
    /* The shared cycle follows contribution order, then returns to stock. */
    reset();entries[1]=0x21000040u;chord();chord();CHECK(mw_sample_editor.owner.module==17);
    chord();CHECK(mw_sample_editor.owner.module==18 && opens==2 && !menu_active);
    chord();CHECK(stock_grid() && grid_opens==2 && !writes && !bad);
    return 0;
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
    for(unsigned action=0;action<10;++action) {
        reset();source.channels=3;open_menu(6);CHECK(!select_grid());
        mw_sample_editor.backend=&analysis_backend;
        struct modwerk_sample_grid grid={2,{0,22050}};
        CHECK(mw_sample_editor_replace_options(&mw_sample_editor,opened_token,&grid,1)==MODWERK_SAMPLE_CONFIRMING);
        mw_sample_ui_key(YES,1);mw_sample_ui_tick();CHECK(!question_active);
        mw_sample_ui_key(YES,0);mw_sample_ui_tick();CHECK(question_active && prompts==1);
        native_close(1);CHECK(analysis_token==opened_token && analysis_posts==1 && !analysis_reads && !writes);
        if(action==1)CHECK(mw_sample_ui_key(0x32,1)==1);
        if(action==2)CHECK(mw_sample_ui_enc(2,4)==0);
        if(action==3)CHECK(mw_sample_ui_key(0x10,1)==0);
        if(action==4){window_flags=32;window_callback=0x12345678;}
        if(action==5)mw_sample_editor_changed_locked(&mw_sample_editor);
        if(action==6)analysis_failure=1;
        if(action==7)mw_sample_editor.snap.reads=MW_SNAP_READ_LIMIT;
        if(action==8)CHECK(!key(FUNC,1));
        if(action==9)chord();
        if(!action || action==6 || action==7)(void)mw_sample_editor_analyze_step(&mw_sample_editor);
        mw_sample_ui_tick();CHECK(!analysis_token && !question_active && !bad && !held);
        if(!action)CHECK(writes==1 && refreshes==1 && analysis_reads==2 && mw_sample_editor.completion==MODWERK_SAMPLE_APPLIED);
        else CHECK(!writes && (action!=4 || (window_flags==32 && window_callback==0x12345678)));
        if(action==6)CHECK(!strcmp(notice,"SNAP FAILED") && mw_sample_editor.completion==MODWERK_SAMPLE_ANALYSIS_FAILED);
        if(action==7)CHECK(!strcmp(notice,"SNAP LIMIT") && mw_sample_editor.completion==MODWERK_SAMPLE_ANALYSIS_LIMIT);
        if(action>=8)CHECK(!analysis_reads && mw_sample_editor.completion==MODWERK_SAMPLE_NO_CHANGE &&
            grid_opens==(action==9) && !grid_closes);
    }
    CHECK(!shortcuts());
    puts("PASS: actual menu selection, prompt ownership, busy confirmation, cancellation, bounded analysis UI and orphan cleanup");
    return 0;
}
