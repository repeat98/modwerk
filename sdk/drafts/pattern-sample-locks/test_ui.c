/* SPDX-License-Identifier: MIT */
#include "ui.h"
#include "modwerk_module.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static uint8_t record[8][PSL_TRACK_BYTES];
static unsigned native_cursor,popup=1,context_ok=1,commits,redraws;
static unsigned native_menu_draws;
static unsigned last_include,last_counts[8];
static unsigned available=0xa5,transport,stop_requests,stop_safe=1;
static int commit_result=PSL_INVALID;
unsigned psl_native_transport(void){return transport;}
int psl_native_stop(void){++stop_requests;return (int)stop_safe;}
static uint32_t bank=0x400e21e0;
int psl_native_source(struct psl_source *s)
{
    s->bank=bank;s->part=0;s->pattern=0;s->eligible=(uint8_t)available;
    for(unsigned t=0;t<8;++t){s->machine[t]=(uint8_t)(t&1);s->sample[t]=12;s->track[t]=record[t];}
    return 1;
}
int psl_native_context(uint32_t b,unsigned p,unsigned part){return context_ok && b==bank && p==0 && part==0;}
int psl_native_popup(void){return (int)popup;}
unsigned psl_native_cursor(void){return native_cursor;}
void psl_native_set_cursor(unsigned row){assert(row<4);native_cursor=row;}
void psl_native_close_popup(void){popup=0;}
void psl_native_redraw(void){++redraws;}
void psl_native_part_menu_draw(unsigned char *frame,unsigned count,unsigned cursor,const char *const *rows)
{
    assert(frame && count==6 && cursor<count);
    assert(!strcmp(rows[0],"RENAME") && !strcmp(rows[3],"SAVE ALL"));
    assert(!strcmp(rows[4],"LOCK SAMPLES TO PATTERN") && !strcmp(rows[5],"CLEAR SAMPLE LOCKS"));
    ++native_menu_draws;
}
int psl_native_commit(struct psl_plan *p){assert(p->ready);last_include=p->replace;
for(unsigned t=0;t<8;++t){last_counts[t]=0;if(p->selected&(1u<<t))for(unsigned step=0;step<64;++step)last_counts[t]+=p->before[t][step]!=p->after[t][step];}
++commits;return commit_result;}
static int tap(int code){int answer=module_key(code,1);assert(module_key(code,0)==answer);return answer;}
static void open_action(unsigned clear)
{
    popup=1;native_cursor=0;psl_ui_open();
    for(unsigned i=0;i<4+clear;++i)assert(tap(0x20));
    assert(tap(0x31));assert(psl_ui_phase()==2 && !popup);
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
    psl_ui_open();
    uint8_t menu_frame[1024]={0};module_draw(menu_frame);
    assert(native_menu_draws==1); /* level one delegates to the stock-font adapter */
    /* Level 1 has no title bar; its first item starts below this plain band. */
    for(unsigned x=7;x<121;++x)assert(!(menu_frame[x*8+7]&(1u<<4)));
    assert(!tap(0x31) && !psl_ui_phase()); /* native RENAME */
    popup=1;native_cursor=0;psl_ui_open();assert(!tap(0x32) && !psl_ui_phase());
    open_action(0);bounds();
    uint8_t frame[1024]={0};module_draw(frame);
    /* Header background is white, its title glyphs are dark. */
    for(unsigned x=7;x<121;++x)assert(frame[x*8+7] & 2u);
    assert(!(frame[10*8+7] & (1u<<2))); /* first letter L at (10,2) */
    /* Disabled tracks keep their text column alignment but have no bracket
     * pixels; this specifically catches the former disabled-checkbox UI. */
    for(unsigned t=0;t<8;++t)if(!(available&(1u<<t))) {
        unsigned x=10+56*(t/4),y=10+8*(t%4);
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
    popup=1;native_cursor=0;psl_ui_open();popup=2;module_tick(&api);assert(!psl_ui_phase());
    available=0;open_action(0);bounds();
    tap(0x20);tap(0x21);module_enc(0,1);module_enc(1,1);module_tick(&api);
    assert(((api.value>>16)&255)==0);tap(0x31);assert(psl_ui_phase()==2);tap(0x32);
    available=0xa5;open_action(0);module_enc(0,2147483647);bounds();tap(0x32);
    /* Running transport is stopped asynchronously, never committed early. */
    open_action(0);module_enc(0,1);tap(0x31);transport=1;
    unsigned previous=commits;tap(0x31);assert(psl_ui_phase()==5 && stop_requests && commits==previous);bounds();
    assert(tap(0x28));assert(psl_ui_phase()==5 && commits==previous); /* PLAY swallowed */
    assert(!tap(0x27)); /* native STOP passed through */
    transport=0;module_tick(&api);assert(psl_ui_phase()==4 && commits==previous+1);tap(0x32);
    open_action(0);module_enc(0,1);tap(0x31);transport=1;tap(0x31);tap(0x32);transport=0;
    module_tick(&api);assert(!psl_ui_phase() && commits==previous+1); /* cancel */
    open_action(0);module_enc(0,1);tap(0x31);transport=2;tap(0x31);assert(psl_ui_phase()==4 && commits==previous+1);tap(0x32);
    transport=0;open_action(0);module_enc(0,1);tap(0x31);transport=1;tap(0x31);
    for(unsigned i=0;i<120;++i)module_tick(&api);
    assert(psl_ui_phase()==4 && commits==previous+1);tap(0x32);transport=0;
    /* Successful Apply closes directly, including an unchanged pattern. No
     * acknowledgement press or leftover drawing may intercept stock UI. */
    commit_result=PSL_OK;
    for(unsigned clear=0;clear<2;++clear) {
        previous=commits;open_action(clear);module_enc(0,1);tap(0x31);tap(0x31);
        assert(!psl_ui_phase() && commits==previous+1 && !popup);
        uint8_t closed[1024],expected[1024];memset(closed,0x5a,sizeof closed);memcpy(expected,closed,sizeof closed);
        module_draw(closed);assert(!memcmp(closed,expected,sizeof closed));
        assert(!tap(0x31) && commits==previous+1);
    }
    available=0x20;open_action(1);module_enc(0,1);tap(0x31);tap(0x31);
    assert(!psl_ui_phase() && last_counts[5]==0);
    available=0xa5;previous=commits;
    open_action(0);module_enc(0,1);tap(0x31);transport=1;tap(0x31);
    assert(psl_ui_phase()==5 && commits==previous);
    transport=0;module_tick(&api);assert(!psl_ui_phase() && commits==previous+1);
    commit_result=PSL_STALE;open_action(0);module_enc(0,1);tap(0x31);tap(0x31);
    assert(psl_ui_phase()==4);bounds();tap(0x32);
    assert(redraws>0);
    puts("PASS popup UI: native pass-through, eligible-only selection, explicit confirmation, cancellation, changed context, foreign popup and framebuffer bounds");
}
