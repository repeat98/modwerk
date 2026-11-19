/* SPDX-License-Identifier: MIT */
#include "ui.h"
#include "font.h"
#include "modwerk_module.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static uint8_t record[8][PSL_TRACK_BYTES];
static unsigned popup,context_ok=1,commits,redraws;
static unsigned last_include,last_counts[8],last_action,last_selection;
static unsigned available=0xa5,transport;
static int commit_result=PSL_INVALID;
unsigned psl_native_transport(void){return transport;}
static uint32_t bank=0x400e21e0;
int psl_native_source(struct psl_source *s)
{
    s->bank=bank;s->part=0;s->pattern=0;s->eligible=(uint8_t)available;
    for(unsigned t=0;t<8;++t){s->machine[t]=(uint8_t)(t&1);s->sample[t]=12;s->track[t]=record[t];}
    return 1;
}
int psl_native_context(uint32_t b,unsigned p,unsigned part){return context_ok && b==bank && p==0 && part==0;}
int psl_native_popup(void){return (int)popup;}
void psl_native_redraw(void){++redraws;}
void psl_native_text(unsigned char *frame,unsigned x,unsigned top,const char *text)
{
    /* Host rendering stand-in; native-font rasters are checked in ot_emu. */
    psl_font_small_text(frame,x,top,text);
}
int psl_native_commit(struct psl_plan *p){assert(p->ready);last_include=p->replace;last_action=p->action;last_selection=p->selected;
for(unsigned t=0;t<8;++t){last_counts[t]=0;if(p->selected&(1u<<t))for(unsigned step=0;step<64;++step)last_counts[t]+=p->before[t][step]!=p->after[t][step];}
++commits;return commit_result;}
static int tap(int code){int answer=module_key(code,1);assert(module_key(code,0)==answer);return answer;}
static void open_action(unsigned clear)
{
    /* The base's Part Edit menu has closed stock's popup and calls choose(clear). */
    popup=0;psl_ui_start(clear);assert(psl_ui_phase()==2);
}
static void bounds(void)
{
    uint8_t guarded[1056];memset(guarded,0x5a,sizeof guarded);
    module_draw(guarded+16);
    for(unsigned i=0;i<16;++i)assert(guarded[i]==0x5a && guarded[1040+i]==0x5a);
    for(unsigned x=0;x<128;++x)for(unsigned y=0;y<64;++y) {
        if(x>=6 && x<122 && (psl_ui_phase()==2 || psl_ui_phase()==3 || (y>=3 && y<61)))continue;
        unsigned at=16+x*8+7-y/8,bit=1u<<(y%8);
        assert((guarded[at]&bit)==(0x5au&bit));
    }
}
int main(void)
{
    memset(record,255,sizeof record);
    for(unsigned t=0;t<8;++t){memset(record[t],0,8);record[t][7]=(uint8_t)((1u<<(t+1u))-1u);}
    struct modwerk_runtime_api api={0};
    /* Closed: no key, knob or drawing is taken. */
    assert(!tap(0x31) && !module_enc(6,4) && !psl_ui_phase());
    /* The record the base's Part Edit menu reads (ot_part_menu). */
    assert(psl_part_menu.abi==MODWERK_PART_MENU_ABI && !strcmp(psl_part_menu.label,"LOCKS") && psl_part_menu.icon && psl_part_menu.icon[4]==0x01fc0 && psl_part_menu.count==2);
    assert(!strcmp(psl_part_menu.actions[0],"LOCK SAMPLES") && !strcmp(psl_part_menu.actions[1],"CLEAR LOCKS"));
    psl_part_menu.choose(1);assert(psl_ui_phase()==2);tap(0x32);assert(!psl_ui_phase());
    open_action(0);bounds();
    uint8_t frame[1024]={0};module_draw(frame);
    /* Header background is white, its title glyphs are dark. */
    for(unsigned x=7;x<121;++x)assert(frame[x*8+7] & (1u<<4));
    assert(!(frame[10*8+7] & (1u<<5))); /* first letter L at (10,5) */
    /* Disabled tracks keep their text column alignment but have no bracket
     * pixels; this specifically catches the former disabled-checkbox UI. */
    for(unsigned t=0;t<8;++t)if(!(available&(1u<<t))) {
        unsigned x=10+56*(t/4),y=12+7*(t%4);
        for(unsigned a=x;a<x+16;++a)for(unsigned b=y;b<y+5;++b)
            assert(!(frame[a*8+7-b/8]&(1u<<(b%8))));
    }
    assert(module_enc(0,1));module_tick(&api);assert(((api.value>>16)&255)==0xa5);
    module_enc(0,-1);module_tick(&api);assert(((api.value>>16)&255)==0);
    tap(0x20); /* DOWN skips disabled T2 -> T3 */
    module_enc(1,1);module_tick(&api);assert(((api.value>>16)&255)==4);
    tap(0x21); /* RIGHT chooses nearest eligible in right column: T6 */
    module_enc(1,1);module_tick(&api);assert(((api.value>>16)&255)==0x24);
    tap(0x20); /* DOWN skips T7 -> T8 */
    module_enc(1,1);module_tick(&api);assert(((api.value>>16)&255)==0xa4);
    tap(0x34);module_enc(1,-1);module_tick(&api);assert(((api.value>>16)&255)==0xa0);
    tap(0x31);assert(psl_ui_phase()==3 && !commits);bounds();
    module_enc(0,1);module_tick(&api);assert(((api.value>>16)&255)==0xa0); /* confirmation inert */
    tap(0x32);assert(psl_ui_phase()==2 && !commits);
    tap(0x31);tap(0x31);assert(psl_ui_phase()==4 && commits==1);assert(last_counts[5]==6 && last_counts[7]==8 && last_counts[2]==0);bounds();tap(0x32);
    record[0][PSL_LOCK_OFFSET]=33;record[2][PSL_LOCK_OFFSET+63*32]=12;
    open_action(1);module_enc(0,1);tap(0x31);tap(0x31);
    assert(last_include==0 && last_counts[0]==1 && last_counts[2]==1);tap(0x32);
    open_action(1);module_enc(0,1);module_enc(2,-1);module_enc(2,1);tap(0x31);tap(0x31);assert(last_include==0 && last_counts[0]==1 && last_counts[2]==1);tap(0x32);
    open_action(1);module_enc(0,1);tap(0x31);tap(0x31);assert(last_include==0);tap(0x32);
    open_action(1);module_enc(0,1);tap(0x31);assert(psl_ui_phase()==3);
    tap(0x32);assert(psl_ui_phase()==2);tap(0x32);assert(!psl_ui_phase());
    open_action(1);assert(!tap(0x28) && !psl_ui_phase()); /* PLAY retires before passing */
    open_action(0);context_ok=0;module_tick(&api);assert(!psl_ui_phase());context_ok=1;
    open_action(0);popup=2;module_tick(&api);assert(!psl_ui_phase());
    available=0;open_action(0);bounds();
    tap(0x20);tap(0x21);module_enc(0,1);module_enc(1,1);module_tick(&api);
    assert(((api.value>>16)&255)==0);tap(0x31);assert(psl_ui_phase()==2);tap(0x32);
    available=0xa5;open_action(0);module_enc(0,2147483647);bounds();tap(0x32);
    /* Both stopped and playing calls apply directly, never modifying the
     * transport; active recording refuses before calling the writer. */
    for(unsigned playing=0;playing<2;++playing) {
        transport=playing;unsigned previous=commits;
        open_action(0);module_enc(0,1);tap(0x31);tap(0x31);
        assert(psl_ui_phase()==4 && commits==previous+1 && transport==playing);tap(0x32);
    }
    unsigned previous=commits;
    open_action(0);module_enc(0,1);tap(0x31);transport=2;tap(0x31);
    assert(psl_ui_phase()==4 && commits==previous && transport==2);tap(0x32);transport=0;
    commit_result=PSL_OK;
    for(unsigned clear=0;clear<2;++clear) {
        previous=commits;open_action(clear);module_enc(0,1);tap(0x31);transport=1;tap(0x31);
        assert(!psl_ui_phase() && commits==previous+1 && !popup && transport==1);
        uint8_t closed[1024],expected[1024];memset(closed,0x5a,sizeof closed);memcpy(expected,closed,sizeof closed);
        module_draw(closed);assert(!memcmp(closed,expected,sizeof closed));
        assert(!tap(0x31) && commits==previous+1);
    }
    transport=0;available=0x20;open_action(1);module_enc(0,1);tap(0x31);tap(0x31);
    assert(!psl_ui_phase() && last_counts[5]==0);
    /* Save Lock's ALL intent, replacement ON and cursor at T8. */
    available=0xa5;open_action(0);module_enc(0,1);module_enc(2,1);
    tap(0x21);tap(0x20);tap(0x20);tap(0x31);tap(0x31);
    assert(!psl_ui_phase() && last_action==PSL_LOCK && last_include==1 && last_selection==0xa5);
    /* Reopening Lock: ALL adapts to the new eligible set; B still targets
     * remembered T8. Cancel preserves prefs. */
    available=255;psl_ui_start(0);assert(psl_ui_phase()==2);
    module_tick(&api);assert(((api.value>>16)&255)==255);
    module_enc(1,-1);module_tick(&api);assert(((api.value>>16)&255)==127);tap(0x32);
    open_action(0);tap(0x31);tap(0x31);assert(last_include==1 && last_selection==255);
    /* Clear keeps its own custom T3 profile, independent of Lock. */
    available=0xa5;open_action(1);module_enc(0,-1);tap(0x34);for(unsigned i=0;i<4;++i)tap(0x33);tap(0x20);module_enc(1,1);
    tap(0x31);tap(0x31);assert(last_action==PSL_CLEAR && last_selection==4 && last_include==0);
    psl_ui_start(1);module_tick(&api);assert(((api.value>>16)&255)==4);
    module_enc(2,1);tap(0x31);tap(0x31);assert(last_action==PSL_CLEAR && last_include==0);
    /* Disabled saved tracks are filtered without selecting a substitute. */
    available=0xa1;open_action(1);module_tick(&api);assert(((api.value>>16)&255)==0);tap(0x32);
    available=0xa5;open_action(1);module_tick(&api);assert(((api.value>>16)&255)==4);tap(0x32);
    /* Refused/stale operations and drafts must not overwrite either profile
     * profile. */
    commit_result=PSL_STALE;open_action(0);module_enc(0,-1);module_enc(1,1);module_enc(2,-1);
    tap(0x31);tap(0x31);assert(psl_ui_phase()==4);bounds();tap(0x32);
    psl_ui_start(1);module_tick(&api);assert(((api.value>>16)&255)==4);tap(0x32);
    commit_result=PSL_OK;open_action(0);tap(0x31);tap(0x31);
    assert(last_action==PSL_LOCK && last_include==1 && last_selection==0xa5);
    assert(redraws>0);
    puts("PASS popup UI: playback unchanged, recording refusal, direct close, base Part Edit menu entry, successful-operation RAM profiles, eligible filtering and native-font layout");
}
