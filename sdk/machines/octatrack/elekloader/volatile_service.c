/* SPDX-License-Identifier: GPL-3.0-or-later
 * Fixed MWVB/MWVS volatile service. Keep (command 9) accepts a stopped trial
 * of fresh installs only when the board's saved set (modset.c) can become
 * exactly the kept set; the engine then saves it to the card as any accepted
 * install, and MWVS flags report it unsaved until the card confirms it. No raw
 * memory, package adoption or retry. All reconstruction/publication/Keep uses
 * the actual journal.
 * Production remains closed until the board adapter is independently ready. */
#include "volatile_service.h"
#include "context.h"
/* The ColdFire freestanding toolchain has no C library. These bounded byte
 * operations are authored here; no firmware/library implementation is copied. */
static void __attribute__((noinline)) mvs_copy(void *to,const void *from,unsigned n)
{ uint8_t *d=to;const uint8_t *s=from;for(unsigned i=0;i<n;++i) d[i]=s[i]; }
static void __attribute__((noinline)) mvs_fill(void *to,uint8_t value,unsigned n)
{ uint8_t *d=to;for(unsigned i=0;i<n;++i) d[i]=value; }
static int __attribute__((noinline)) mvs_different(const void *left,const void *right,unsigned n)
{ const uint8_t *a=left,*b=right;for(unsigned i=0;i<n;++i) if(a[i]!=b[i]) return 1;return 0; }

static uint32_t get16(const uint8_t *p) { return (uint32_t)p[0]<<8|p[1]; }
static uint32_t get32(const uint8_t *p) { return get16(p)<<16|get16(p+2); }
static void put16(uint8_t *p,uint32_t v) { p[0]=(uint8_t)(v>>8);p[1]=(uint8_t)v; }
static void put32(uint8_t *p,uint32_t v) { put16(p,v>>16);put16(p+2,v); }
static int nonzero(const uint8_t *p,unsigned n)
{ unsigned v=0;for(unsigned i=0;i<n;++i) v|=p[i];return v!=0; }
int modwerk_volatile_busy(const struct mvs_service *s)
{ return s && (s->queued || s->phase!=MVS_IDLE); }
static void cache(struct mvs_service *s)
{
    struct runtime_journal_progress p={0};
    modwerk_runtime_journal_snapshot(&p);
    uint32_t lock=modwerk_machine_lock();uint8_t *out=s->status;
    mvs_fill(out,0,MVS_STATUS_BYTES);mvs_copy(out,"MWVS",4);out[4]=1;
    out[5]=s->result;out[6]=s->phase;
    out[7]=(uint8_t)(s->baseline_known | s->current_known<<1 |
        (s->phase!=MVS_IDLE)<<2 | (modwerk_machine_journal_enabled()==1)<<3);
    put32(out+8,s->sequence);put32(out+12,s->transaction);put32(out+16,s->generation);
    put32(out+20,s->received);put32(out+24,s->total);
    /* Prepare is private receiving work. Only complete verify reports rows. */
    if(s->phase!=MVS_RECEIVING) { put16(out+28,p.records);put16(out+30,p.published); }
    mvs_copy(out+32,s->base,32);mvs_copy(out+64,s->session,32);
    if(s->baseline_known) mvs_copy(out+96,s->baseline,32);
    if(s->total) mvs_copy(out+128,s->offer,32);
    if(s->current_known) mvs_copy(out+160,s->current,32);
    out[192]=p.required;out[193]=p.touched;out[194]=p.confirmed;
    put32(out+196,s->capacity);put32(out+200,RUNTIME_POOL_BYTES);
    put16(out+204,RUNTIME_JOURNAL_ROWS);put16(out+206,RUNTIME_JOURNAL_ROWS);
    modwerk_machine_unlock(lock);
}
int modwerk_volatile_init(struct mvs_service *s,uint8_t *stage,uint32_t capacity,
    const uint8_t base[32],const uint8_t session[32])
{
    if(!s || !stage || capacity<MVS_FRAME_BYTES+140u || capacity>MU_MAX_BYTES || !base || !session ||
       !nonzero(base,32) || !nonzero(session,32)) return 0;
    mvs_fill(s,0,sizeof *s);s->stage=stage;s->capacity=capacity-MVS_FRAME_BYTES;
    /* The existing upload/boot staging reservation has one exclusive owner.
     * Keep an immutable command in its final 4 KiB, outside bundle capacity;
     * no extra MAIN/BSS arena or change to the RAM boot bound is needed. */
    s->frame=stage+s->capacity;
    mvs_copy(s->base,base,32);mvs_copy(s->session,session,32);
    uint32_t lock=modwerk_machine_lock();
    s->current_known=(uint8_t)modwerk_runtime_journal_digest(s->current);
    s->result=modwerk_machine_journal_enabled()==1 && s->current_known ? MVS_OK:MVS_UNSUPPORTED;
    modwerk_machine_unlock(lock);
    cache(s);return 1;
}
int modwerk_volatile_queue(struct mvs_service *s,const uint8_t *frame,uint32_t n)
{
    if(!s || !s->stage || s->queued || n<MVS_HEADER_BYTES || n>MVS_FRAME_BYTES || !(n%64u) ||
       !frame || get32(frame)!=0x4d575642u || frame[4]!=1 || frame[5]<1 || frame[5]>9 ||
       frame[6] || frame[7] || nonzero(frame+88,8) || get32(frame+20)!=n-MVS_HEADER_BYTES ||
       !get32(frame+8) || get32(frame+8)<=s->sequence ||
       (s->result==MVS_PENDING && frame[5]!=6 && frame[5]!=7)) return 0;
    mvs_copy(s->frame,frame,n);s->frame_bytes=n;s->queued=1;
    /* Reads can see queued but cannot observe an engine Begin as owned yet. */
    put32(s->status+8,get32(frame+8));s->status[5]=MVS_QUEUED;
    return 1;
}
unsigned modwerk_volatile_status(const struct mvs_service *s,uint8_t *out)
{
    if(!s || !s->stage || !out) return 0;
    /* The saved set is written outside this service, so its state is read live. */
    mvs_copy(out,s->status,MVS_STATUS_BYTES);out[7]|=(uint8_t)(modwerk_modset_unsaved()<<4);return MVS_STATUS_BYTES;
}
void modwerk_volatile_reset(struct mvs_service *s)
{ if(s && s->stage) { s->expired=1;s->queued=0;s->frame_bytes=0; } }
int modwerk_volatile_tick(struct mvs_service *s,uint32_t now)
{
    if(!s || !s->stage) return 0;
    if(s->phase!=MVS_IDLE && s->phase!=MVS_QUARANTINE && ((uint32_t)(now-s->heard)>=MVS_QUIET_TICKS ||
       (uint32_t)(now-s->began)>=MVS_ABSOLUTE_TICKS)) s->expired=1;
    return s->queued || s->expired || s->verifying || s->phase==MVS_PUBLISHING || s->phase==MVS_ROLLBACK;
}
/* Validate the entire immutable bundle before allocating its first image.
 * Hashes/masks in uploaded bytes never establish board source associations. */
static enum mvs_result bundle(struct mvs_service *s)
{
    const uint8_t *b=s->stage;uint8_t got[32];
    if(s->received!=s->total) return MVS_LENGTH;
    mu_sha256(b,s->total,got);if(mvs_different(got,s->offer,32)) return MVS_HASH;
    if(s->total<88u || get32(b)!=0x4d574254u || get16(b+4)!=1 || get16(b+6)!=1 ||
       get16(b+8)!=88u || get16(b+14) || get32(b+16)!=s->total || get32(b+20) ||
       mvs_different(b+24,s->base,32) || mvs_different(b+56,s->baseline,32)) return MVS_IDENTITY;
    unsigned count=get16(b+10),participants=get16(b+12);
    /* Participants are bits of a record's 32-bit mask: at most 32, whatever the row count. */
    if(!count || count>RUNTIME_JOURNAL_ROWS || !participants || participants>RUNTIME_JOURNAL_ROWS || participants>32u ||
       4u*participants>s->total-88u) return MVS_LIMIT;
    uint32_t at=88u,used=0;
    for(unsigned i=0;i<participants;++i,at+=4u) {
        s->participants[i]=get32(b+at);
        if(!s->participants[i] || (i && s->participants[i]<=s->participants[i-1])) return MVS_CONFLICT;
    }
    for(unsigned i=0;i<count;++i) {
        if(s->total-at<48u) return MVS_LENGTH;
        struct mvs_record *r=&s->records[i];
        r->module=get32(b+at);r->length=get32(b+at+4);r->mask=get32(b+at+40);
        mvs_copy(r->digest,b+at+8,32);
        if(!r->module || !r->mask || r->mask>>participants || (used&r->mask) || get32(b+at+44)) return MVS_CONFLICT;
        used|=r->mask;at+=48u;r->offset=at;
        if(r->length<32u || r->length>s->total-at) return MVS_LENGTH;
        const uint8_t *p=b+at;
        if(get32(p)!=0x4d57524du || get16(p+4)<4u || get16(p+4)>RUNTIME_ABI ||
           get32(p+28)!=r->module) return MVS_IDENTITY;
        mu_sha256(p,r->length,got);if(mvs_different(got,r->digest,32)) return MVS_HASH;
        for(unsigned k=0;k<i;++k) if(s->records[k].module==r->module ||
            !mvs_different(s->records[k].digest,r->digest,32)) return MVS_CONFLICT;
        static uint32_t ids[RUNTIME_JOURNAL_ROWS];unsigned n=0; /* static: engine task only, rows outgrow its stack */
        for(unsigned k=0;k<participants;++k) if(r->mask&(1u<<k)) ids[n++]=s->participants[k];
        if(modwerk_machine_journal_association(r->module,r->digest,ids,n)!=1) return MVS_REFUSED;
        at+=r->length;unsigned padding=(4u-r->length%4u)%4u;
        if(padding>s->total-at || nonzero(b+at,padding)) return MVS_LENGTH;
        at+=padding;
    }
    if(at!=s->total || used!=(1u<<participants)-1u) return MVS_LENGTH;
    s->count=(uint16_t)count;s->participant_count=(uint16_t)participants;return MVS_OK;
}
static void __attribute__((noinline)) quarantine(struct mvs_service *s)
{ s->phase=MVS_QUARANTINE;s->result=MVS_QUARANTINED;s->current_known=0;s->verifying=0; }
static void __attribute__((noinline)) settle(struct mvs_service *s)
{ s->phase=MVS_IDLE;s->result=MVS_OK;s->received=s->total=0;s->count=s->prepare_at=0; }
static void rollback(struct mvs_service *s)
{
    s->verifying=0;
    /* This board gate must positively regain its actual transport latch. */
    if(modwerk_machine_journal_trial(0)!=1) { quarantine(s);return; }
    s->trial_running=0;
    if(modwerk_runtime_journal_abort()!=RJ_PENDING) { quarantine(s);return; }
    s->phase=MVS_ROLLBACK;s->result=MVS_PENDING;s->current_known=0;
}
static void request(struct mvs_service *s,uint32_t now)
{
    const uint8_t *f=s->frame,*body=f+MVS_HEADER_BYTES;uint32_t n=get32(f+20);
    unsigned cmd=f[5];s->sequence=get32(f+8);s->result=MVS_STATE;
    if(mvs_different(f+24,s->base,32) || mvs_different(f+56,s->session,32)) { s->result=MVS_IDENTITY;return; }
    if(modwerk_machine_journal_enabled()!=1) { s->result=MVS_UNSUPPORTED;return; }
    if(cmd==1) {
        if(s->phase!=MVS_IDLE || get32(f+12) || get32(f+16) || n!=72u || get32(body+68) ||
           !nonzero(body,32) || !nonzero(body+32,32)) return;
        uint32_t total=get32(body+64);
        if(total<140u || total>s->capacity || s->transaction==UINT32_MAX) { s->result=MVS_LIMIT;return; }
        uint32_t lock=modwerk_machine_lock();uint8_t digest[32];
        int known=modwerk_runtime_journal_digest(digest);
        enum runtime_journal_result r=known && !mvs_different(digest,body,32) ? modwerk_runtime_journal_begin():RJ_REFUSED;
        struct runtime_journal_progress p;modwerk_runtime_journal_snapshot(&p);
        modwerk_machine_unlock(lock);
        if(!known || mvs_different(digest,body,32)) { s->result=MVS_IDENTITY;return; }
        if(r!=RJ_OK) { s->result=MVS_BUSY;return; }
        ++s->transaction;s->generation=p.generation;s->total=total;s->received=0;
        s->count=s->prepare_at=0;s->baseline_known=s->current_known=1;
        mvs_copy(s->baseline,digest,32);mvs_copy(s->current,digest,32);mvs_copy(s->offer,body+32,32);
        s->began=s->heard=s->touched=now;s->expired=0;s->phase=MVS_RECEIVING;s->result=MVS_OK;return;
    }
    if(s->phase==MVS_IDLE || get32(f+12)!=s->transaction || get32(f+16)!=s->generation) { s->result=MVS_STALE;return; }
    if(cmd==2) {
        if(s->phase!=MVS_RECEIVING || s->verifying || n<=4u || n>4000u || get32(body)!=s->received ||
           n-4u>s->total-s->received) { s->result=MVS_LENGTH;return; }
        mvs_copy(s->stage+s->received,body+4,n-4u);s->received+=n-4u;s->heard=now;s->result=MVS_OK;return;
    }
    if(n) { s->result=MVS_LENGTH;return; }
    if(cmd==3 && s->phase==MVS_RECEIVING && !s->verifying) {
        s->result=bundle(s);
        if(s->result==MVS_OK) { s->verifying=1;s->prepare_at=0;s->result=MVS_PENDING;s->heard=now; }
    } else if(cmd==4 && s->phase==MVS_VERIFIED) {
        if(modwerk_runtime_journal_activate()==RJ_PENDING) { s->phase=MVS_PUBLISHING;s->result=MVS_PENDING;s->heard=now;s->current_known=0; }
    } else if(cmd==5 && s->phase==MVS_STOPPED_TRIAL) {
        if(modwerk_machine_journal_trial(1)==1) { s->phase=MVS_RUNNING_TRIAL;s->trial_running=1;s->result=MVS_OK; }
        else s->result=MVS_REFUSED;
    } else if(cmd==6 || (cmd==7 && (s->phase==MVS_RECEIVING || s->phase==MVS_VERIFIED))) rollback(s);
    else if(cmd==8 && (s->phase==MVS_STOPPED_TRIAL || s->phase==MVS_RUNNING_TRIAL)) {
        if((uint32_t)(now-s->touched)<60u) s->result=MVS_LIMIT;
        else if((uint32_t)(now-s->began)>=MVS_ABSOLUTE_TICKS) rollback(s);
        else { s->heard=s->touched=now;s->result=MVS_OK; }
    } else if(cmd==9 && s->phase==MVS_STOPPED_TRIAL) {
        /* shortcut: Keep needs the held latch; from a running trial it waits for the board trial latch. */
        if((uint32_t)(now-s->heard)>=MVS_QUIET_TICKS || (uint32_t)(now-s->began)>=MVS_ABSOLUTE_TICKS) { rollback(s);return; }
        /* A set the card cannot restore exactly is not kept: refused, the trial unchanged. */
        static const uint8_t *kept[RUNTIME_JOURNAL_ROWS];static uint32_t bytes[RUNTIME_JOURNAL_ROWS];
        for(unsigned i=0;i<s->count;++i) kept[i]=s->stage+s->records[i].offset,bytes[i]=s->records[i].length;
        if(!modwerk_modset_keep(kept,bytes,s->count,s->current)) { s->result=MVS_REFUSED;return; }
        enum runtime_journal_result r=modwerk_runtime_journal_accept();uint8_t digest[32];
        /* The kept whole set is exactly the published trial set, now the baseline and the saved set. */
        if(r==RJ_REFUSED) s->result=MVS_REFUSED;
        else if(r!=RJ_OK || !modwerk_runtime_journal_digest(digest) || mvs_different(digest,s->current,32)) quarantine(s);
        else { mvs_copy(s->baseline,digest,32);settle(s);modwerk_modset_kept(); }
    }
}
static void __attribute__((used)) service_context(struct mvs_service *s,uint32_t now,const struct runtime_context *context)
{
    if(!s || !s->stage) return;
    uint32_t lock=modwerk_machine_lock();
    if(s->expired) {
        s->expired=s->queued=0;
        if(s->phase!=MVS_IDLE && s->phase!=MVS_ROLLBACK && s->phase!=MVS_QUARANTINE) rollback(s);
    } else if(s->queued) { s->queued=0;request(s,now); }
    if(s->verifying) {
        if(s->prepare_at<s->count) {
            const struct mvs_record *r=&s->records[s->prepare_at];
            enum runtime_journal_result result=modwerk_runtime_journal_prepare(s->stage+r->offset,r->length,context);
            if(result==RJ_OK) ++s->prepare_at;
            else { s->verifying=0;if(result==RJ_UNCERTAIN) quarantine(s);else s->result=MVS_REFUSED; }
        } else {
            s->verifying=0;
            if(modwerk_runtime_journal_verify()==RJ_OK) { s->phase=MVS_VERIFIED;s->result=MVS_OK; }
            else s->result=MVS_REFUSED;
        }
    }
    if(s->phase==MVS_PUBLISHING || s->phase==MVS_ROLLBACK) {
        int reverse=s->phase==MVS_ROLLBACK;
        enum runtime_journal_result r=modwerk_runtime_journal_step(context);
        if(r==RJ_UNCERTAIN) quarantine(s);
        else if(r==RJ_REFUSED) { s->result=MVS_REFUSED;rollback(s); }
        else if(r==RJ_OK) {
            uint8_t digest[32];int known=modwerk_runtime_journal_digest(digest);
            if(!known || (reverse && mvs_different(digest,s->baseline,32))) quarantine(s);
            else {
                mvs_copy(s->current,digest,32);s->current_known=1;s->result=MVS_OK;
                if(reverse) settle(s);
                else { s->phase=MVS_STOPPED_TRIAL;s->heard=s->touched=now; }
            }
        }
    }
    if(s->phase==MVS_IDLE) s->current_known=(uint8_t)modwerk_runtime_journal_digest(s->current);
    cache(s);modwerk_machine_unlock(lock);
}
#ifdef __m68k__
/* Capture this engine service entry before its C prologue reuses registers;
 * caller frames remain part of the loader's conservative root scan. */
RUNTIME_CONTEXT_WRAPPER(modwerk_volatile_service,service_context,
    "move.l %sp@(76),%sp@-\nmove.l %sp@(76),%sp@-\n",76);
#else
void modwerk_volatile_service(struct mvs_service *s,uint32_t now) { service_context(s,now,0); }
#endif
