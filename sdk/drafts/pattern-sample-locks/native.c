/* SPDX-License-Identifier: MIT */
/* OS 1.40C adapter. Experimental native edits; no implicit project save. */
#include "ui.h"
#include "ownership.h"
#include "modwerk_lifecycle.h"
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u
#define PATTERN 0x100b14d0u
#define PART 0x100b14cfu
#define PART_OFFSET 0x8ed80u
#define NV ((volatile uint8_t *)(uintptr_t)PSL_NV_BASE)
static uint8_t identity[PSL_ID_BYTES],origin[8][64];
static volatile uint32_t origin_epoch,writer_depth;
static uint32_t base_nonce,base_boot;
static unsigned source_row;
/* Prepared outside the interrupt guard; fixed native destinations only. */
struct psl_native_write {volatile uint8_t *working,*mirror;uint8_t before,after;};
static struct psl_native_write edits[PSL_TRACKS*PSL_STEPS+PSL_STEPS];
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
    if(writer_depth || !s || !bank_valid(b) || pattern>=16 || part>=4)return 0;
    const volatile uint8_t *p=(const volatile uint8_t *)(uintptr_t)(b+PART_OFFSET+part*PSL_PART_BYTES);
    s->bank=b;s->pattern=(uint8_t)pattern;s->part=(uint8_t)part;s->eligible=0;s->ownership_epoch=origin_epoch;
    source_row=((b-0x400e21e0u)/0x9b340u)*16u+pattern;
    unsigned trusted=project_identity() && psl_nv_matches(NV,identity) && psl_nv_boot_matches(NV,base_nonce,base_boot);
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
{ return !writer_depth && bank==U32(BANK) && pattern==U8(PATTERN) && part==U8(PART); }
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
static void psl_foreign_begin(unsigned patterns,unsigned tracks,unsigned banks);
static void psl_foreign_end(void);
void psl_manual_sample(unsigned sample)
{
    unsigned track=U8(0x100b14ccu),pattern=U8(PATTERN);
    /* Retire the entire target track before entering firmware. A nested or
     * preempting writer must never have its unknown history re-published by
     * this wrapper when it returns, including a same-value manual write. */
    psl_foreign_begin(pattern<16?1u<<pattern:0,track<8?1u<<track:0,0);
    psl_stock_sample_write(sample);psl_foreign_end();
}
/* Replay the guarded entry, not a call back into the detour. */
__asm__(".globl psl_stock_sample_write\n"
        "psl_stock_sample_write:\n\tlea -32(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a3,(%sp)\n\tjmp 0x40040ee8\n");
/* Serialize with stock UI/storage writers at level four. DSP/frame interrupts
 * (five/six) remain enabled during validation, checksums and metadata writes.
 * No firmware entry is called while this task lock is held. */
static uint16_t psl_task_lock(void)
{
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0":"=d"(sr)::"memory");
    if((sr&0x700u)<0x400u){uint16_t locked=(uint16_t)((sr&~0x700u)|0x400u);
        __asm__ volatile("move.w %0,%%sr"::"d"(locked):"memory");}
    return sr;
}
volatile uint32_t psl_guard_max,psl_guard_spans;
/* At most sixteen changed entries per full interrupt guard, independent of
 * the number of selected tracks. The index entries have no mirror pointer. */
__attribute__((noinline)) static void psl_write_batch(unsigned from,unsigned end)
{
    uint16_t sr;uint32_t at,elapsed;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    at=U32(0xfc07c00cu);
    for(unsigned i=from;i<end;++i){*edits[i].working=edits[i].after;
        if(edits[i].mirror)*edits[i].mirror=edits[i].after;}
    elapsed=U32(0xfc07c00cu)-at;
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    ++psl_guard_spans;if(elapsed>psl_guard_max)psl_guard_max=elapsed;
}
static int psl_commit_locked(struct psl_plan *p,unsigned *published)
{
    struct psl_source now;uint8_t *working[8],*mirror[8];
    uint8_t index_before[64],index_after[64];unsigned tracks_changed=0,edit_count=0;
    if(!p || !p->ready || psl_native_transport() || !psl_native_source(&now))return PSL_INVALID;
    int result=psl_validate(p,&now);if(result!=PSL_OK)return result;
    if(!p->changed){p->ready=0;return PSL_OK;}
    if(!psl_nv_boot_matches(NV,base_nonce,base_boot))psl_nv_forget(NV);
    if(!base_boot || !project_identity() || !psl_nv_begin(NV,identity) || !psl_nv_boot(NV,base_nonce,base_boot,0))return PSL_INVALID;
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
    /* All source validation precedes publication under the task lock. The
     * stopped sequencer cannot consume a partially published lock index. */
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
            ++writer_depth;
            for(unsigned i=0;i<64;++i)if(index_before[i]!=index_after[i]){
                edits[edit_count].working=(volatile uint8_t *)(uintptr_t)(0x46c7d48cu+i);
                edits[edit_count].mirror=0;edits[edit_count].after=index_after[i];++edit_count;
            }
            for(unsigned i=0;i<edit_count;i+=16u)psl_write_batch(i,i+16u<edit_count?i+16u:edit_count);
            U32(p->bank+0x9b332u)=1;U32(0x100f8598u)=1;p->ready=0;
        }
    }
    if(result!=PSL_OK)return result;
    for(unsigned t=0;t<8;++t)if(tracks_changed&(1u<<t)) {
        for(unsigned step=0;step<64;++step)
            if(p->before[t][step]!=p->after[t][step])origin[t][step]=(uint8_t)(p->after[t][step]!=PSL_NO_LOCK);
        psl_nv_publish(NV,source_row,t,now.track[t],origin[t]);
    }
    ++origin_epoch;--writer_depth;*published=tracks_changed;
    return PSL_OK;
}
int psl_native_commit(struct psl_plan *p)
{
    unsigned published=0;uint16_t sr=psl_task_lock();
    int result=psl_commit_locked(p,&published);
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    if(result==PSL_OK && published){
        ((void (*)(void))0x40027e00u)();
        for(unsigned t=0;t<8;++t)if(published&(1u<<t))((void (*)(unsigned))0x4009da20u)(t);
    }
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

void psl_lifecycle_notify(const struct modwerk_lifecycle_context *c)
{
    psl_ui_retire();++origin_epoch;
    if(!c){psl_nv_forget(NV);base_nonce=base_boot=0;return;}
    base_nonce=c->boot_nonce;base_boot=c->boot;
    if(c->reason==MODWERK_LIFECYCLE_BOOT && base_boot)(void)psl_nv_boot(NV,base_nonce,base_boot,1);
    else psl_nv_forget(NV);
}
const struct modwerk_lifecycle psl_lifecycle __attribute__((aligned(4)))={psl_lifecycle_notify};
/* Scope is retired before the native writer can block or be preempted. A
 * nested writer never reopens access until its outermost owner returns. */
static void psl_foreign_begin(unsigned patterns,unsigned tracks,unsigned banks)
{
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    ++writer_depth;++origin_epoch;
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
    uint32_t b=U32(BANK);
    if(!banks && bank_valid(b))banks=1u<<((b-0x400e21e0u)/0x9b340u);
    psl_nv_forget_scope(NV,banks,patterns,tracks);
}
static void psl_foreign_end(void)
{
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");
    ++origin_epoch;--writer_depth;
    __asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");
}
int psl_stock_trig_paste(uintptr_t,unsigned,unsigned,unsigned,unsigned);
int psl_trig_paste(uintptr_t clip,unsigned pattern,unsigned track,unsigned page,unsigned mask)
{
    psl_foreign_begin(pattern<16?1u<<pattern:0,track<8?1u<<track:0,0);
    int r=psl_stock_trig_paste(clip,pattern,track,page,mask);psl_foreign_end();return r;
}
int psl_stock_track_paste(uintptr_t,unsigned,unsigned);
int psl_track_paste(uintptr_t clip,unsigned pattern,unsigned track)
{
    psl_foreign_begin(pattern<16?1u<<pattern:0,track<8?1u<<track:0,0);
    int r=psl_stock_track_paste(clip,pattern,track);psl_foreign_end();return r;
}
int psl_stock_pattern_paste(uintptr_t,unsigned);
int psl_pattern_paste(uintptr_t clip,unsigned pattern)
{
    psl_foreign_begin(pattern<16?1u<<pattern:0,255,0);
    int r=psl_stock_pattern_paste(clip,pattern);psl_foreign_end();return r;
}
int psl_stock_undo(uintptr_t,unsigned,unsigned);
int psl_undo(uintptr_t clip,unsigned pattern,unsigned track)
{
    psl_foreign_begin(65535,255,0);
    int r=psl_stock_undo(clip,pattern,track);psl_foreign_end();return r;
}
int psl_stock_track_clear(unsigned,unsigned,unsigned);
int psl_track_clear(unsigned pattern,unsigned track,unsigned flags)
{
    psl_foreign_begin(pattern<16?1u<<pattern:0,(flags&1u) && track<8?1u<<track:0,0);
    int r=psl_stock_track_clear(pattern,track,flags);psl_foreign_end();return r;
}
int psl_stock_banks_load(uintptr_t,unsigned,uintptr_t,uintptr_t);
int psl_banks_load(uintptr_t state,unsigned banks,uintptr_t a,uintptr_t b)
{
    psl_foreign_begin((banks&65535u)?65535:0,255,banks&65535u);
    int r=psl_stock_banks_load(state,banks,a,b);psl_foreign_end();return r;
}
__asm__(".globl psl_stock_trig_paste\npsl_stock_trig_paste:\n\tlea -92(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a6,(%sp)\n\tjmp 0x4002c8a4\n"
        /* Euclid copies bytes from the prologue. Hook after it, unwind only
         * the untouched save frame, then enter the ordinary C wrapper. Its
         * stock trampoline replays both displaced argument loads. */
        ".globl psl_track_paste_entry\npsl_track_paste_entry:\n\tmovem.l (%sp),%d2-%d7/%a2-%a6\n\tlea 68(%sp),%sp\n\tjmp psl_track_paste\n"
        ".globl psl_stock_track_paste\npsl_stock_track_paste:\n\tlea -68(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a6,(%sp)\n\tmove.l 72(%sp),%a3\n\tmove.l 80(%sp),%d5\n\tjmp 0x4002b664\n"
        ".globl psl_stock_pattern_paste\npsl_stock_pattern_paste:\n\tlea -16(%sp),%sp\n\tmovem.l %d2-%d4/%a2,(%sp)\n\tjmp 0x4002b9b8\n"
        ".globl psl_stock_undo\npsl_stock_undo:\n\tlea -16(%sp),%sp\n\tmovem.l %d2-%d4/%a2,(%sp)\n\tjmp 0x4002b3bc\n"
        ".globl psl_stock_track_clear\npsl_stock_track_clear:\n\tlea -60(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a6,(%sp)\n\tjmp 0x40039dfc\n"
        ".globl psl_stock_banks_load\npsl_stock_banks_load:\n\tlea -328(%sp),%sp\n\tmovem.l %d2-%d7/%a2-%a6,(%sp)\n\tjmp 0x400905dc\n");

int psl_stock_bank_read(uintptr_t,uintptr_t,unsigned);
int psl_bank_read(uintptr_t file,uintptr_t target,unsigned probe)
{
    /* Stock's nonzero third argument validates only the file header. Startup
     * probes have target==NULL and must not retire the battery-backed bank.
     * Actual deserialization initializes the complete destination bank. */
    if(probe)return psl_stock_bank_read(file,target,probe);
    uint32_t address=(uint32_t)target;
    if(address>=0x480e21e0u && address<=0x480e21e0u+15u*0x9b340u)address-=0x08000000u;
    unsigned banks=bank_valid(address)?1u<<((address-0x400e21e0u)/0x9b340u):65535u;
    psl_foreign_begin(65535,255,banks);
    int r=psl_stock_bank_read(file,target,probe);psl_foreign_end();return r;
}
__asm__(".globl psl_stock_bank_read\npsl_stock_bank_read:\n\tlink.w %a6,#-60\n\tmovem.l %d2-%d7/%a2-%a5,(%sp)\n\tjmp 0x4008ded8\n");
