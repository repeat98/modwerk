/* SPDX-License-Identifier: MIT */
/* OS 1.40C adapter. Experimental native edits; no implicit project save. */
#include "ui.h"
#include "ownership.h"
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u
#define PATTERN 0x100b14d0u
#define PART 0x100b14cfu
#define PART_OFFSET 0x8ed80u
#define NV ((volatile uint8_t *)(uintptr_t)PSL_NV_BASE)
static uint8_t identity[PSL_ID_BYTES],origin[8][64];
static uint32_t origin_epoch;
static unsigned source_row;
/* Prepared outside the interrupt guard; fixed native destinations only. */
struct psl_native_write {volatile uint8_t *working,*mirror;uint8_t before,after;};
static struct psl_native_write edits[PSL_TRACKS*PSL_STEPS];
static int project_identity(void)
{
    const uint32_t paths[2]={0x100f8480u,0x100f8378u};
    for(unsigned path=0;path<2;++path){unsigned ended=0;
        for(unsigned i=0;i<256;++i){uint8_t c=ended?0:U8(paths[path]+i);identity[path*256u+i]=c;if(!c)ended=1;}
        if(!ended)return 0;
    }
    return identity[0] && identity[256];
}

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
    s->bank=b;s->pattern=(uint8_t)pattern;s->part=(uint8_t)part;s->eligible=0;s->ownership_epoch=origin_epoch;
    source_row=((b-0x400e21e0u)/0x9b340u)*16u+pattern;
    unsigned trusted=project_identity() && psl_nv_matches(NV,identity);
    for(unsigned t=0;t<8;++t) {

        unsigned kind=p[0x22u+t];s->machine[t]=(uint8_t)kind;
        s->sample[t]=kind<2?p[0x2cau+5u*t+kind]:PSL_NO_LOCK;
        s->track[t]=(const uint8_t *)(uintptr_t)(b+pattern*PSL_PATTERN_BYTES+t*PSL_TRACK_BYTES);
        if(trusted)psl_nv_read(NV,source_row,t,s->track[t],origin[t]);
        else for(unsigned i=0;i<64;++i)origin[t][i]=0;
        s->owned[t]=origin[t];
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
unsigned psl_native_transport(void)
{
    for(unsigned i=0;i<16;++i)if(U8(0x80004f1eu+i*84u))return 2;
    if(U32(0x800065b8u))return 1;
    for(unsigned i=0;i<16;++i)if(U8(0x80006500u+i))return 1;
    return 0;
}
int psl_native_stop(void)
{
    /* A held FUNC/trig turns STOP into paste. Wait for their release.
     * Feed actual panel reports, never fabricated OS event records. */
    if(U8(0x46100b18u+5u)&32u || U16(0x460d174au))return 0;
    void (*ring)(uint32_t)=(void (*)(uint32_t))0x40092254u;
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    uint8_t held=U8(0x46100b18u+4u);
    ring(0x24);ring(held|128u);ring(0x24);ring(held&127u);
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    return 1;
}
void psl_native_observe_key(int code,int pressed)
{
    /* Copy/paste/clear from the native clipboard becomes unknown, including
     * a same-value paste. Do not discard origins for ordinary transport STOP. */
    if(!pressed || (code!=0x27 && code!=0x28))return;
    if(!(U16(0x460d174au) || (U8(0x46100b18u+5u)&32u)))return;
    uint32_t bank=U32(BANK);unsigned pattern=U8(PATTERN);
    if(!bank_valid(bank) || pattern>=16 || !project_identity() || !psl_nv_matches(NV,identity))return;
    unsigned row=((bank-0x400e21e0u)/0x9b340u)*16u+pattern;
    for(unsigned t=0;t<8;++t)psl_nv_invalidate(NV,row,t);
    ++origin_epoch;
}
/* Dedicated stock SAMPLE editor, including same-value manual writes. */
void psl_stock_sample_write(unsigned sample);
void psl_manual_sample(unsigned sample)
{
    struct psl_source s;unsigned track=U8(0x100b14ccu),row=0,page=U32(0x460d174cu);
    uint16_t held=U16(0x460d174au);unsigned valid=0;
    uint8_t previous[64];
    if(track<8 && page<=48 && !(page%16u) && psl_native_source(&s) && project_identity() && psl_nv_matches(NV,identity)) {
        row=source_row;valid=1;
        for(unsigned i=0;i<64;++i)previous[i]=origin[track][i];
        for(unsigned i=0;i<16;++i)if(held&(1u<<i))previous[page+i]=0;
        psl_nv_invalidate(NV,row,track);++origin_epoch;
    }
    psl_stock_sample_write(sample);
    if(valid && psl_native_context(s.bank,s.pattern,s.part))psl_nv_publish(NV,row,track,s.track[track],previous);
}
/* Replay the guarded entry, not a call back into the detour. */
__asm__(".globl psl_stock_sample_write\n"
        "psl_stock_sample_write:\n\tlea -32(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a3,(%sp)\n\tjmp 0x40040ee8\n");
int psl_native_commit(struct psl_plan *p)
{
    struct psl_source now;uint8_t *working[8],*mirror[8];
    uint8_t index_before[64],index_after[64];unsigned tracks_changed=0,edit_count=0;
    if(!p || !p->ready || psl_native_transport() || !psl_native_source(&now))return PSL_INVALID;
    int result=psl_validate(p,&now);if(result!=PSL_OK)return result;
    if(!p->changed){p->ready=0;return PSL_OK;}
    if(!project_identity() || !psl_nv_begin(NV,identity))return PSL_INVALID;
    for(unsigned i=0;i<64;++i)index_before[i]=index_after[i]=U8(0x46c7d48cu+i);
    for(unsigned t=0;t<8;++t) {
        working[t]=(uint8_t *)(uintptr_t)now.track[t];
        mirror[t]=(uint8_t *)(uintptr_t)(0x1001614eu+p->pattern*PSL_PATTERN_BYTES+t*PSL_TRACK_BYTES);
        if(!(p->selected&(1u<<t)))continue;
        for(unsigned i=0;i<8;++i)if(mirror[t][i]!=p->trigs[t][i])return PSL_STALE;
        for(unsigned step=0;step<64;++step) {
            if(mirror[t][PSL_LOCK_OFFSET+32u*step]!=p->before[t][step])return PSL_STALE;
            if(p->before[t][step]==p->after[t][step])continue;
            edits[edit_count].working=working[t]+PSL_LOCK_OFFSET+32u*step;
            edits[edit_count].mirror=mirror[t]+PSL_LOCK_OFFSET+32u*step;
            edits[edit_count].before=p->before[t][step];edits[edit_count].after=p->after[t][step];++edit_count;
            tracks_changed|=1u<<t;
            unsigned locked=p->after[t][step]!=PSL_NO_LOCK;
            if(!locked)for(unsigned slot=0;slot<31;++slot)
                if(working[t][0x59u+32u*step+slot]!=PSL_NO_LOCK){locked=1;break;}
            if(locked)index_after[step]|=(uint8_t)(1u<<t);
            else index_after[step]&=(uint8_t)~(1u<<t);
        }
    }
    if(p->action==PSL_LOCK && !psl_nv_reserve(NV,source_row,tracks_changed))return PSL_FULL;
    /* All hashing/scanning is outside the bounded publication guard. Native
     * STOP/record state and exact source are rechecked before the first store.
     * Maximum guard duration is still a hardware qualification requirement. */
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    if(psl_native_transport() || !psl_native_context(p->bank,p->pattern,p->part) || origin_epoch!=p->ownership_epoch)result=PSL_STALE;
    else {
        for(unsigned i=0;i<64;++i)if(U8(0x46c7d48cu+i)!=index_before[i])result=PSL_STALE;
        const volatile uint8_t *part=(const volatile uint8_t *)(uintptr_t)(p->bank+PART_OFFSET+p->part*PSL_PART_BYTES);
        for(unsigned t=0;t<8;++t)if(p->selected&(1u<<t)) {
            if(part[0x22u+t]!=p->machine[t] || part[0x2cau+5u*t+p->machine[t]]!=p->sample[t])result=PSL_STALE;
            for(unsigned i=0;i<8;++i)if(working[t][i]!=p->trigs[t][i] || mirror[t][i]!=p->trigs[t][i])result=PSL_STALE;
            for(unsigned i=0;i<64;++i)if(working[t][PSL_LOCK_OFFSET+32u*i]!=p->before[t][i] || mirror[t][PSL_LOCK_OFFSET+32u*i]!=p->before[t][i])result=PSL_STALE;
        }
        if(result==PSL_OK) {
            /* A power loss at any later store can only lose ownership. */
            for(unsigned t=0;t<8;++t)if(tracks_changed&(1u<<t))psl_nv_invalidate(NV,source_row,t);
            for(unsigned i=0;i<edit_count;++i){*edits[i].working=edits[i].after;*edits[i].mirror=edits[i].after;}
            for(unsigned i=0;i<64;++i)if(index_before[i]!=index_after[i])U8(0x46c7d48cu+i)=index_after[i];
            U32(p->bank+0x9b332u)=1;U32(0x100f8598u)=1;p->ready=0;
        }
    }
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    if(result!=PSL_OK)return result;
    for(unsigned t=0;t<8;++t)if(tracks_changed&(1u<<t)) {
        for(unsigned step=0;step<64;++step)
            if(p->before[t][step]!=p->after[t][step])origin[t][step]=(uint8_t)(p->after[t][step]!=PSL_NO_LOCK);
        psl_nv_publish(NV,source_row,t,now.track[t],origin[t]);
    }
    ++origin_epoch;
    ((void (*)(void))0x40027e00u)();
    for(unsigned t=0;t<8;++t)if(tracks_changed&(1u<<t))((void (*)(unsigned))0x4009da20u)(t);
    return PSL_OK;
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
