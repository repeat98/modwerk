/* SPDX-License-Identifier: MIT */
#include "ui.h"
#include "font.h"
#include "modwerk_module.h"
#define YES 0x31
#define NO 0x32
#define UP 0x33
#define DOWN 0x20
#define LEFT 0x34
#define RIGHT 0x21
enum { CLOSED, PART_MENU, TRACKS, CONFIRM, RESULT, STOPPING };
static unsigned stop_ticks,stop_requested;
static unsigned phase, cursor, selected, replace, action, eligible;
static struct psl_plan plan;
static struct psl_source captured;
static const char *message;
static uint32_t consumed[2];
static int encoder_residual;
static const char *const part_rows[] = {"RENAME", "RELOAD", "SAVE", "SAVE ALL",
    "LOCK SAMPLES TO PATTERN", "CLEAR SAMPLE LOCKS"};
static void close_view(void)
{ phase=CLOSED; plan.ready=0; encoder_residual=0; psl_native_redraw(); }
void psl_ui_retire(void){phase=CLOSED;plan.ready=0;selected=0;consumed[0]=consumed[1]=0;}
unsigned psl_ui_phase(void) { return phase; }
void psl_ui_open(void)
{
    phase=PART_MENU; cursor=psl_native_cursor();
    if(cursor>3)cursor=0;
    selected=replace=0;plan.ready=0;encoder_residual=0;psl_native_redraw();
}
/* Track numbers remain spatial: 1-4 left, 5-8 right. Disabled
 * tracks are visible but never become the cursor or selection target. */
static void move(int code)
{
    if(phase==PART_MENU) {
        if(code==UP && cursor)--cursor;
        if(code==DOWN && cursor<5u)++cursor;
        psl_native_set_cursor(cursor<4u?cursor:3u);
    } else if(phase==TRACKS && eligible) {
        unsigned row=cursor%4u,col=cursor/4u;
        if(code==UP || code==DOWN) {
            int step=code==UP?-1:1;
            for(int r=(int)row+step;r>=0 && r<4;r+=step) {
                unsigned t=col*4u+(unsigned)r;
                if(eligible&(1u<<t)){cursor=t;break;}
            }
        } else if((code==LEFT && col) || (code==RIGHT && !col)) {
            unsigned other=1u-col;
            for(unsigned distance=0;distance<4u;++distance) {
                int choices[2]={(int)row-(int)distance,(int)row+(int)distance};
                unsigned found=0;
                for(unsigned k=0;k<2u;++k)if(choices[k]>=0 && choices[k]<4) {
                    unsigned t=other*4u+(unsigned)choices[k];
                    if(eligible&(1u<<t)){cursor=t;found=1;break;}
                }
                if(found)break;
            }
        }
    }
    psl_native_redraw();
}
static void start_action(void)
{
    action=cursor==4?PSL_LOCK:PSL_CLEAR;
    psl_native_close_popup();
    if(!psl_native_source(&captured)) {
        message="ACTIVE PATTERN ONLY";phase=RESULT;psl_native_redraw();return;
    }
    eligible=captured.eligible;
    selected=replace=cursor=0;phase=TRACKS;plan.ready=0;message=0;
    if(eligible)while(!(eligible&(1u<<cursor)))++cursor;
    psl_native_redraw();
}
static void choose(void)
{
        struct psl_source now;
        if(!psl_native_source(&now) || now.bank!=captured.bank ||
           now.pattern!=captured.pattern || now.part!=captured.part || now.eligible!=eligible) {
            message="SOURCE CHANGED - REOPEN";phase=RESULT;
        } else {
            int result=psl_prepare(&plan,&now,selected,(enum psl_action)action,replace);
            if(result==PSL_NO_TRACKS)message="SELECT TRACKS FIRST";
            else if(result!=PSL_OK)message="CHECK SAMPLE ASSIGNMENTS";
            else {
                captured.bank=now.bank;captured.pattern=now.pattern;captured.part=now.part;captured.eligible=now.eligible;
                for(unsigned t=0;t<8;++t) {
                    captured.machine[t]=now.machine[t];captured.sample[t]=now.sample[t];captured.track[t]=now.track[t];captured.owned[t]=now.owned[t];
                }
                captured.ownership_epoch=now.ownership_epoch;
                phase=CONFIRM;message=0;
            }
        }
    psl_native_redraw();
}
static void finish_action(void)
{
    int result=psl_native_commit(&plan);
    message=result==PSL_OK?"DONE - PROJECT NOT SAVED":result==PSL_STALE?"SOURCE CHANGED - REOPEN":result==PSL_FULL?"OWNERSHIP STORE FULL":"REFUSED - NO CHANGES";
    plan.ready=0;phase=RESULT;psl_native_redraw();
}
void module_tick(struct modwerk_runtime_api *api)
{
    if(phase==PART_MENU && psl_native_popup()!=1)close_view();
    if(phase>=TRACKS && phase!=RESULT &&
       (!psl_native_context(captured.bank,captured.pattern,captured.part) || psl_native_popup()))close_view();
    if(phase==STOPPING) {
        unsigned transport=psl_native_transport();
        if(!transport)finish_action();
        else if(transport==2 || ++stop_ticks>=120u) {
            message=transport==2?"RECORDER ACTIVE - REFUSED":"STOP TIMED OUT - REFUSED";
            plan.ready=0;phase=RESULT;psl_native_redraw();
        } else if(!stop_requested)stop_requested=(unsigned)psl_native_stop();
    }
    api->value=(uint32_t)phase<<24 | (uint32_t)selected<<16 | plan.changed;
}
int module_key(int code,int pressed)
{
    if(code<0 || code>=64)return 0;
    unsigned group=(unsigned)code/32u;uint32_t bit=1u<<((unsigned)code%32u);
    if(!pressed){if(!(consumed[group]&bit))return 0;consumed[group]&=~bit;return 1;}
    if(consumed[group]&bit)return 1;
    if(phase!=STOPPING)psl_native_observe_key(code,pressed);
    if(!phase)return 0;
    if(phase==STOPPING) {
        if(code==0x27)return 0; /* Let the native STOP report reach stock. */
        consumed[group]|=bit;
        if(code==NO)close_view();
        return 1; /* In particular, PLAY cannot restart a pending edit. */
    }
    /* Retire before letting transport, recorder and project gestures through.
     * No modal remains armed when those stock actions can change its source. */
    if(code!=YES && code!=NO && code!=UP && code!=DOWN && code!=LEFT && code!=RIGHT){close_view();return 0;}
    if(phase==PART_MENU && ((code==YES && cursor<4u) || code==NO)) {
        close_view();return 0; /* Original callback and cursor stay stock. */
    }
    consumed[group]|=bit;
    if(code==NO) {
        if(phase==CONFIRM){phase=TRACKS;plan.ready=0;message=0;psl_native_redraw();}
        else close_view();
    } else if(code==UP || code==DOWN || code==LEFT || code==RIGHT)move(code);
    else if(phase==PART_MENU)start_action();
    else if(phase==TRACKS){message=0;choose();}
    else if(phase==CONFIRM) {
        unsigned transport=psl_native_transport();
        if(transport==2){message="RECORDER ACTIVE - REFUSED";plan.ready=0;phase=RESULT;}
        else if(!transport)finish_action();
        else {phase=STOPPING;stop_ticks=0;stop_requested=(unsigned)psl_native_stop();}
        psl_native_redraw();
    } else close_view();
    return 1;
}
int module_enc(int encoder,int delta)
{
    if(!phase)return 0;
    if(phase==TRACKS) {
        if(delta && encoder==0)selected=delta>0?eligible:0;
        if(delta && encoder==1 && (eligible&(1u<<cursor))) {
            if(delta>0)selected|=1u<<cursor;else selected&=~(1u<<cursor);
        }
        if(delta && encoder==2)replace=action==PSL_CLEAR?(delta<0):(delta>0);
        message=0;psl_native_redraw();return 1;
    }
    if(phase!=PART_MENU || encoder!=6)return 1;
    if((encoder_residual<0 && delta>0)||(encoder_residual>0 && delta<0))encoder_residual=0;
    int steps=delta/4;
    encoder_residual+=delta%4;steps+=encoder_residual/4;encoder_residual%=4;
    if(steps>6)steps=6;
    if(steps<-6)steps=-6;
    while(steps>0){move(DOWN);--steps;}while(steps<0){move(UP);++steps;}
    return 1;
}
static char *number(char *out,unsigned value)
{
    if(value>=100)*out++=(char)('0'+value/100u%10u);
    if(value>=10)*out++=(char)('0'+value/10u%10u);
    *out++=(char)('0'+value%10u);*out=0;return out;
}
static void text(char *out,const char *s){while(*s)*out++=*s++;*out=0;}
static void track_label(char *out,unsigned t,unsigned confirmation)
{
    char *at=out;
    if(!confirmation){text(at,!(eligible&(1u<<t))?"    ":selected&(1u<<t)?"[X] ":"[ ] ");at+=4;}
    *at++='T';*at++=(char)('1'+t);*at++=' ';
    if(confirmation) {
        if(!(eligible&(1u<<t)) || !(selected&(1u<<t)))text(at,"-");
        else {
            unsigned n=0;
            for(unsigned step=0;step<PSL_STEPS;++step)n+=plan.before[t][step]!=plan.after[t][step];
            number(at,n);
        }
    } else {
        *at++=eligible&(1u<<t)?(captured.machine[t]?'F':'S'):'-';*at=0;
    }
}
static void dim(unsigned char *frame,unsigned x,unsigned y,unsigned w,unsigned h)
{
    /* Monochrome LCD grey: checkerboard the ink, preserving the background. */
    for(unsigned a=x;a<x+w;++a)for(unsigned b=y;b<y+h;++b)
        if((a+3u*b)%4u==0)frame[a*8u+7u-b/8u]&=(unsigned char)~(1u<<(b%8u));
}
void module_draw(unsigned char *frame)
{
    if(!phase || !frame)return;
    unsigned expanded=phase==TRACKS || phase==CONFIRM;
    unsigned top=expanded?0u:3u,height=expanded?64u:58u;
    psl_font_clear(frame,6,top,116,height);
    if(phase==PART_MENU) {
        /* Stock Part Edit is a plain list. Retain its four rows, append the
         * two actions, and use the former title space to show all six. */
        for(unsigned i=0;i<6u;++i) {
            psl_font_small_text(frame,10,top+5u+i*8u,part_rows[i]);
            if(i==cursor)psl_font_invert(frame,8,top+4u+i*8u,112,7);
        }
        psl_font_box(frame,6,3,116,58);return;
    }
    const char *title=action==PSL_LOCK?"LOCK SAMPLES TO PATTERN":"CLEAR SAMPLE LOCKS";
    /* Every text baseline uses the same eight-pixel row grid. */
    psl_font_small_text(frame,10,top+2u,title);
    psl_font_invert(frame,7,top+1u,114,7);
    if(phase==STOPPING){psl_font_small_text(frame,10,top+18u,"STOPPING PLAYBACK...");psl_font_small_text(frame,10,top+26u,"NO:CANCEL");psl_font_box(frame,6,3,116,58);return;}
    if(phase==RESULT){psl_font_small_text(frame,10,top+18u,message);psl_font_small_text(frame,10,top+26u,"YES/NO:CLOSE");psl_font_box(frame,6,3,116,58);return;}
    if(phase==CONFIRM) {
        char line[24];text(line,"PATTERN ");
        unsigned bank_number=(plan.bank-0x400e21e0u)/0x9b340u;
        line[8]=(char)('A'+bank_number);line[9]=(char)('0'+(plan.pattern+1u)/10u);
        line[10]=(char)('0'+(plan.pattern+1u)%10u);line[11]=0;
        psl_font_small_text(frame,10,10,line);
    }
    for(unsigned t=0;t<8;++t) {
        unsigned x=10u+56u*(t/4u),y=(phase==CONFIRM?18u:10u)+(t%4u)*8u;
        char label[24];track_label(label,t,phase==CONFIRM);psl_font_small_text(frame,x,y,label);
        if(!(eligible&(1u<<t)))dim(frame,x,y,48,5);
        else if(phase==TRACKS && cursor==t)psl_font_invert(frame,x-2u,y-1u,50,7);
    }
    if(phase==CONFIRM) {
        psl_font_small_text(frame,10,50,action==PSL_CLEAR?(replace?"INCLUDES MANUAL LOCKS":"MANUAL LOCKS: KEEP"):replace?"REPLACE EXISTING: YES":"EXISTING LOCKS: KEEP");
        psl_font_small_text(frame,10,58,"YES:APPLY NO:BACK");
    } else {
        psl_font_small_text(frame,10,42,message?message:action==PSL_CLEAR?(replace?"C:RETAIN MANUAL OFF":"C:RETAIN MANUAL ON"):replace?"C:REPLACE EXISTING ON":"C:REPLACE EXISTING OFF");
        psl_font_small_text(frame,10,50,"A:ALL B:TRACK");
        psl_font_small_text(frame,10,58,"YES:NEXT NO:CLOSE");
    }
    /* Last pixel is a completion marker for paused emulator captures. */
    psl_font_box(frame,6,top,116,height);
}
