/* SPDX-License-Identifier: MIT */
/* OS 1.40C adapter. Experimental native edits; no implicit project save. */
#include "ui.h"
#include "font.h"
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u
#define PATTERN 0x100b14d0u
#define PART 0x100b14cfu
#define PART_OFFSET 0x8ed80u
/* Prepared outside the interrupt guard; fixed native destinations only. */
struct psl_native_write {volatile uint8_t *working,*mirror;uint8_t after;};
static struct psl_native_write edits[PSL_TRACKS];
static int bank_valid(uint32_t b)
{ return b>=0x400e21e0u && b<=0x400e21e0u+15u*0x9b340u && (b-0x400e21e0u)%0x9b340u==0; }
/* These are the shared machine-registry signatures and versions, not calls
 * into another module. They also exclude absent custom machines. */
static unsigned contributed(const volatile uint8_t *p,unsigned t)
{
    const volatile uint8_t *s=p+60u+30u*t;
    return (s[2]==1u && ((s[0]=='P' && s[1]=='L') || (s[0]=='A' && s[1]=='B') ||
                        (s[0]=='F' && s[1]=='M'))) ||
           ((s[2]==1u || s[2]==2u) && s[0]=='S' && s[1]=='2');
}
int psl_native_source(struct psl_source *s)
{
    uint32_t b=U32(BANK);unsigned pattern=U8(PATTERN),part=U8(PART);
    if(!s || !bank_valid(b) || pattern>=16 || part>=4)return 0;
    const volatile uint8_t *p=(const volatile uint8_t *)(uintptr_t)(b+PART_OFFSET+part*PSL_PART_BYTES);
    s->bank=b;s->pattern=(uint8_t)pattern;s->part=(uint8_t)part;s->eligible=0;
    for(unsigned t=0;t<8;++t) {

        unsigned kind=p[0x22u+t];s->machine[t]=(uint8_t)kind;
        s->sample[t]=kind<2?p[0x2cau+5u*t+kind]:PSL_NO_LOCK;
        s->track[t]=(const uint8_t *)(uintptr_t)(b+pattern*PSL_PATTERN_BYTES+t*PSL_TRACK_BYTES);
        if(kind<2 && !contributed(p,t))s->eligible|=(uint8_t)(1u<<t);
    }
    return b==U32(BANK) && pattern==U8(PATTERN) && part==U8(PART);
}
int psl_native_context(uint32_t bank,unsigned pattern,unsigned part)
{ return bank==U32(BANK) && pattern==U8(PATTERN) && part==U8(PART); }
int psl_native_popup(void)
{
    if(!U32(0x460e5e30u))return 0;
    return U32(0x460e5e28u)==0x400b9b04u && U32(0x460e5e2cu)==0x400b9b14u?1:2;
}
unsigned psl_native_cursor(void){return U32(0x460e5e40u);}
void psl_native_set_cursor(unsigned row){if(row<4u)U32(0x460e5e40u)=row;}
void psl_native_close_popup(void){((void (*)(void))0x4006d754u)();}
void psl_native_redraw(void){U32(0x46c7c72cu)=1;}
void psl_native_text(unsigned char *frame,unsigned x,unsigned top,const char *text)
{
    if(!frame || !text || x>=124u || top>59u)return;
    uint32_t surface[7];
    for(unsigned i=0;i<7u;++i)surface[i]=U32(0x400bf10au+4u*i);
    surface[3]=(uint32_t)(uintptr_t)frame;
    ((void (*)(uint32_t,void *,int,int,int,const char *))0x40012bd8u)
        (0x400ba876u,surface,(int)x,59-(int)top,-1,text);
}
/* Use the existing stock UI font directly; no glyph data is copied into the
 * module. The surface descriptor is local and never retained by stock UI. */
void psl_native_part_menu_draw(unsigned char *frame,unsigned count,unsigned cursor,const char *const *rows)
{
    if(!frame || !rows || count!=6u || cursor>=count)return;
    uint32_t surface[7];
    for(unsigned i=0;i<7u;++i)surface[i]=U32(0x400bf10au+4u*i);
    surface[3]=(uint32_t)(uintptr_t)frame;
    unsigned width=44u;
    for(unsigned i=0;i<count;++i) {
        int text=((int (*)(uint32_t,int,const char *))0x40012f30u)(0x400ba876u,-1,rows[i]);
        if(text>0 && (unsigned)text+6u>width)width=(unsigned)text+6u;
    }
    if(width>116u)width=116u;
    unsigned height=count*7u+4u,left=(128u-width)/2u,top=(64u-height)/2u;
    psl_font_clear(frame,left,top,width,height);
    psl_font_box(frame,left,top,width,height);
    for(unsigned i=0;i<count;++i) {
        unsigned y=top+3u+7u*i;
        ((void (*)(uint32_t,void *,int,int,int,const char *))0x40012bd8u)
            (0x400ba876u,surface,(int)left+3,59-(int)y,-1,rows[i]);
        if(i==cursor)psl_font_invert(frame,left+2u,y-1u,width-4u,7u);
    }
}
unsigned psl_native_transport(void)
{
    if(U32(0x460d172au))return 2;
    for(unsigned i=0;i<16;++i)if(U8(0x80004f1eu+i*84u))return 2;
    if(U32(0x800065b8u))return 1;
    for(unsigned i=0;i<16;++i)if(U8(0x80006500u+i))return 1;
    return 0;
}
/* Native bank/Part/UI edits and storage publication run in tasks. Level two
 * excludes the level-one scheduler while allowing the native sequencer (three),
 * USB (four), audio (five) and DMA/UART (six). No clock or transport is changed.
 * Live recording is refused before publication; MIDI input queues its pattern
 * writes to the system task. */
static uint16_t psl_task_lock(void)
{
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0":"=d"(sr)::"memory");
    if((sr&0x700u)<0x200u){uint16_t locked=(uint16_t)((sr&~0x700u)|0x200u);
        __asm__ volatile("move.w %0,%%sr"::"d"(locked):"memory");}
    return sr;
}
volatile uint32_t psl_guard_max,psl_guard_spans;
/* One step, at most eight SAMPLE/mirror pairs plus its lock-index byte.
 * A reader sees that step wholly before or wholly after publication. Interrupts
 * resume between steps, so the sequencer can consume other steps normally. */
__attribute__((noinline)) static void psl_write_step(unsigned count,unsigned step,unsigned set,unsigned clear)
{
    uint16_t sr;uint32_t at,elapsed;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    at=U32(0xfc07c00cu);
    for(unsigned i=0;i<count;++i){*edits[i].working=edits[i].after;*edits[i].mirror=edits[i].after;}
    U8(0x46c7d48cu+step)=(uint8_t)((U8(0x46c7d48cu+step)|set)&~clear);
    elapsed=U32(0xfc07c00cu)-at;
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    ++psl_guard_spans;if(elapsed>psl_guard_max)psl_guard_max=elapsed;
}
static int psl_commit_locked(struct psl_plan *p,unsigned *published)
{
    struct psl_source now;uint8_t *working[8],*mirror[8];
    uint8_t index_set[64],index_clear[64];unsigned tracks_changed=0;
    if(!p || !p->ready || psl_native_transport()==2u || !psl_native_source(&now))return PSL_INVALID;
    int result=psl_validate(p,&now);if(result!=PSL_OK)return result;
    if(!p->changed){p->ready=0;return PSL_OK;}
    for(unsigned i=0;i<64;++i)index_set[i]=index_clear[i]=0;
    for(unsigned t=0;t<8;++t) {
        working[t]=(uint8_t *)(uintptr_t)now.track[t];
        mirror[t]=(uint8_t *)(uintptr_t)(0x1001614eu+p->pattern*PSL_PATTERN_BYTES+t*PSL_TRACK_BYTES);
        if(!(p->selected&(1u<<t)))continue;
        for(unsigned i=0;i<8;++i)if(mirror[t][i]!=p->trigs[t][i])return PSL_STALE;
        for(unsigned step=0;step<64;++step) {
            if(mirror[t][PSL_LOCK_OFFSET+32u*step]!=p->before[t][step])return PSL_STALE;
            if(p->before[t][step]==p->after[t][step])continue;
            tracks_changed|=1u<<t;
            unsigned locked=p->after[t][step]!=PSL_NO_LOCK;
            if(!locked)for(unsigned slot=0;slot<31;++slot)
                if(working[t][0x59u+32u*step+slot]!=PSL_NO_LOCK){locked=1;break;}
            if(locked)index_set[step]|=(uint8_t)(1u<<t);
            else index_clear[step]|=(uint8_t)(1u<<t);
        }
    }
    /* Validate the complete plan before the first write. The task guard keeps
     * the UI bank/pattern/Part and metadata writers stable; the sequencer and
     * frame readers may still run, with each step published atomically below. */
    if(psl_native_transport()==2u || !psl_native_context(p->bank,p->pattern,p->part))result=PSL_STALE;
    else {
        const volatile uint8_t *part=(const volatile uint8_t *)(uintptr_t)(p->bank+PART_OFFSET+p->part*PSL_PART_BYTES);
        for(unsigned t=0;t<8;++t)if(p->selected&(1u<<t)) {
            if(part[0x22u+t]!=p->machine[t] || part[0x2cau+5u*t+p->machine[t]]!=p->sample[t])result=PSL_STALE;
            for(unsigned i=0;i<8;++i)if(working[t][i]!=p->trigs[t][i] || mirror[t][i]!=p->trigs[t][i])result=PSL_STALE;
            for(unsigned i=0;i<64;++i)if(working[t][PSL_LOCK_OFFSET+32u*i]!=p->before[t][i] || mirror[t][PSL_LOCK_OFFSET+32u*i]!=p->before[t][i])result=PSL_STALE;
        }
        if(result==PSL_OK) {
            for(unsigned step=0;step<64;++step) {
                unsigned count=0;
                for(unsigned t=0;t<8;++t)if((p->selected&(1u<<t)) && p->before[t][step]!=p->after[t][step]) {
                    edits[count].working=working[t]+PSL_LOCK_OFFSET+32u*step;
                    edits[count].mirror=mirror[t]+PSL_LOCK_OFFSET+32u*step;
                    edits[count].after=p->after[t][step];++count;
                }
                if(count)psl_write_step(count,step,index_set[step],index_clear[step]);
            }
            U32(p->bank+0x9b332u)=1;U32(0x100f8598u)=1;p->ready=0;
        }
    }
    if(result!=PSL_OK)return result;
    *published=tracks_changed;
    return PSL_OK;
}
int psl_native_commit(struct psl_plan *p)
{
    unsigned published=0;uint16_t sr=psl_task_lock();
    int result=psl_commit_locked(p,&published);
    if(result==PSL_OK && published){
        ((void (*)(void))0x40027e00u)();
        for(unsigned t=0;t<8;++t)if(published&(1u<<t))((void (*)(unsigned))0x4009da20u)(t);
    }
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    return result;
}

void psl_open(unsigned count,unsigned selected,unsigned *cursor,
              const char *const *labels,void (*const *callbacks)(void))
{
    ((void (*)(unsigned,unsigned,unsigned *,const char *const *,void (*const *)(void)))0x4006d94cu)
        (count,selected,cursor,labels,callbacks);
    if(count==4 && (uintptr_t)cursor==0x460d101cu &&
       (uintptr_t)labels==0x400b9b14u && (uintptr_t)callbacks==0x400b9b04u && psl_native_popup()==1)
        psl_ui_open();
}
