/* SY DRUM's step locks on the card: the companion files beside the project's banks.
 * Compiled by gen_locks_io.py into ../locks_io.inc.s (m68k-elf-gcc -mcpu=5475 -O2).
 * Every function but the RAM-only dirty predicate runs in the stock engine task (the
 * card I/O jobs); playback reads RAM only.
 *
 * The file family and format are the development line's (Octatrick 3.0, 8 Oct 2026), so a
 * project moves between it and this module with its locks:
 *   sylock01.work / .strd .. sylock16.work / .strd -- one pair a bank; version 2: a 32-byte
 *     big-endian header (SYLOCKS\0, version 2, header 32, bank, flags 0, payload 49152, the
 *     edit generation, CRC-32 of the payload, CRC-32 of the first 28 bytes), then 8,192 rows
 *     (pattern, track, step) of six controls (A..D = LSPD LDEP WAVE S&H on a SY DRUM track;
 *     E / F are a sidecar FM track's on the development line), 0..127, 255 = no lock.
 *     Version 1 (four controls a row, older development builds) is read and widened.
 *   sylkgjNN.work / .strd -- the development line's controls G..J (gjlocks_io.h): read,
 *     carried with the rows and written back as that line does; no control of this module
 *     uses them.
 *   syscenNN.work / .strd -- the development line's setup scenes: this module has no setup
 *     scenes and never reads them for playback; RELOAD restores them as that line does (a
 *     saved STRD becomes WORK again, a WORK without STRD is removed), EXPORT copies them,
 *     DELETE removes them (scenes_io.h).
 * WORK follows working edits, STRD an explicit SAVE PROJECT / SAVE BANK; RELOAD restores
 * STRD. WORK is written by the stock background save (the UI tick asks for it about once a
 * second while a bank is dirty, sl_io_background_request) and the card SYNC. Stock asks for
 * that save only while the sequencer is stopped: the current bank's own edits need no card
 * write, since stock keeps that bank in battery-backed memory (CS1) across a power-off. The
 * lock table has no such copy, so while the sequencer plays the same tick posts a job of its
 * own (sl_io_play_tick, at the stock save's cadence and with its checks) that writes only
 * the dirty WORK files; without it a power-off during playback, or within a second of STOP,
 * kept the stock locks and lost the step locks edited since the last write.
 *
 * Differences from the development line's I/O (the same files, the same reading):
 *   - a sylock file is written only for a bank that holds a lock, or whose sylock file
 *     already exists in the project (so removing the last lock is saved as an all-unlocked
 *     file): a project without SY DRUM locks gets no sylock file (the development line
 *     writes all sixteen pairs at every SAVE). SAVE TO NEW looks for the destination's
 *     existing sylock files first, so a stale one there is overwritten, never left behind.
 *   - RELOAD of a bank without a saved (STRD) file removes its WORK file instead of writing
 *     an all-unlocked one; both read as "no lock" on both lines.
 *   - no setup-scene state (above). Its RELOAD step for the syscen files is kept: without it a
 *     RELOAD on an emulated card whose files had been saved in place failed in the stock loader
 *     ('PARSE ERROR', 9 Oct 2026); with it, as on the development line, it does not (why that
 *     step matters to the stock loader was not established).
 */
typedef unsigned char u8;
typedef unsigned int u32;
typedef int s32;
/* A version 2 file's payload is 8192 rows of 6 (A..F); a version 1 file's 8192 rows of 4
 * (A..D). A RAM bank is 8192 rows of 16 bytes (A..F, G..J at +6..+9, padding). */
enum { RAM_BANK_BYTES=131072, ROWS=8192, BANK_BYTES=ROWS*6, FILE_BYTES=BANK_BYTES+32,
       V1_BANK_BYTES=ROWS*4, V1_FILE_BYTES=V1_BANK_BYTES+32, PATH_BYTES=260,
       ABSENT=1, CORRUPT=-60, FUTURE=-61, BUSY=-62, PATH_ERROR=-63 };
typedef struct { u32 word[6]; } File;
extern volatile u32 sl_ready_mask, sl_dirty_mask, sl_blocked_mask;
extern volatile u32 sl_generation[16];
extern void sl_reset(void);
extern void sl_clip_reset(void);
extern void sl_seq_reset(void);
extern u8 *sl_io_core_bank(u32);
extern s32 sl_io_core_validate(u32,const u8 *,u32,u32 *);
extern s32 sl_io_core_pack(u32,u32,const u8 *,u8 *);
extern s32 sl_io_core_publish(u32,u32,const u8 *);
extern s32 sl_io_core_seal(u32,u32,u8 *);
extern s32 sl_io_fs_open(File *,const char *,const char *,u8 *,u32);
extern s32 sl_io_fs_read(File *,void *,u32);
extern s32 sl_io_fs_write(File *,const void *,u32);
extern s32 sl_io_fs_close(File *);
extern s32 sl_io_fs_size(u32);
extern s32 sl_io_fs_copy(const char *,const char *,u32);
extern s32 sl_io_fs_remove(const char *);
extern const char *sl_io_stock_directory(const char *,const char *);
extern void sl_io_post(void (*)(s32),s32);
extern void sl_io_toast(const char *,u32);
extern s32 sl_io_stock_banks_load(void *,u32,void *,void *);
extern s32 sl_io_stock_banks_save(void *,u32,void *,void *);
extern s32 sl_io_stock_card_sync(void *,void *,void *);
extern s32 sl_io_stock_project_store(void *,void *,void *);
extern s32 sl_io_stock_project_restore(void *,void *,void *);
extern s32 sl_io_stock_bank_store(void *,u32,void *,void *);
extern s32 sl_io_stock_bank_restore(void *,u32,void *,void *);
extern s32 sl_io_stock_export(void *,const char *,const char *,void *,void *);
extern s32 sl_io_stock_delete(const char *,const char *);
extern void sl_io_stock_clear(void);
extern u32 sl_io_irq_lock(void);
extern s32 sl_io_stock_card_ready(void);
extern void sl_io_queue_post(void *,void *);
extern void sl_io_irq_restore(u32);

static char sl_io_base[PATH_BYTES],sl_io_path[PATH_BYTES];
static u8 sl_io_file[FILE_BYTES] __attribute__((aligned(4)));
static u8 sl_io_sector[512] __attribute__((aligned(4)));
static File sl_io_object;
volatile s32 sl_io_last_error;
volatile u32 sl_io_protected_mask;
static u32 sl_io_loaded,sl_io_job_kind,sl_io_job_mask;
static s32 sl_io_warning;
static u32 sl_present_mask;              /* a sylock file of this bank exists in sl_io_base */
/* The flush posted while the sequencer plays: a job kind the stock dispatcher does not
 * know (it drops kinds above 45 after sl_io_before_job has run), one descriptor, at most
 * one in the queue. */
enum { FLUSH_KIND=0x80, PLAY_TICKS=60 };
static u8 sl_io_flush_job[16] __attribute__((aligned(4)));
static volatile u32 sl_io_flush_pending;
static u32 sl_io_play_ticks;

static s32 text_copy(char *d,const char *s,u32 cap) {
    u32 i=0;
    while(i<cap) { char c=s[i];d[i++]=c;if(!c)return 0; }
    d[0]=0;return PATH_ERROR;
}
static u32 same_text(const char *a,const char *b) {
    while(*a && *a==*b){++a;++b;}return *a==*b;
}
static s32 current_base(char *d) {
    const char *s=sl_io_stock_directory((const char *)0,(const char *)0);
    return s ? text_copy(d,s,PATH_BYTES):PATH_ERROR;
}
static s32 path_for(char *dst,const char *base,u32 bank,u32 stored) {
    const char *s;u32 n=0;
    if(bank>=16)return PATH_ERROR;
    while(base[n]) {if(n>=PATH_BYTES-15)return PATH_ERROR;dst[n]=base[n];++n;}
    if(!n)return PATH_ERROR;
    dst[n++]='/';s="sylock";while(*s)dst[n++]=*s++;
    ++bank;dst[n++]=(char)('0'+(bank>=10));dst[n++]=(char)('0'+(bank>=10?bank-10:bank));
    s=stored?".strd":".work";while(*s)dst[n++]=*s++;
    dst[n]=0;return 0;
}
void sl_io_ui_warning(s32 value) {
    sl_io_toast(value==1?"LOCKS RECOVERED; SAVE TO REPAIR":"SY LOCK FILE ERROR",48);
}
static void note(s32 error,u32 recovered) {
    sl_io_last_error=error;
    if(!sl_io_warning){sl_io_warning=1;sl_io_post(sl_io_ui_warning,recovered?1:error);}
}
/* 1 when the file at path exists (opens for reading), 0 when it does not; an I/O error. */
static s32 file_exists(const char *path) {
    s32 r=sl_io_fs_open(&sl_io_object,path,"r",sl_io_sector,512),c;
    if(r<0)return r==-12?0:r==-10?1:r;
    c=sl_io_fs_close(&sl_io_object);
    return c<0?c:1;
}
/* -12 is stock lookup absence; -10 includes an existing empty file. */
static s32 read_bank(const char *base,u32 bank,u32 stored,u32 *generation) {
    s32 r,c,size;u32 n=0,i,expect=FILE_BYTES;const char *magic="SYLOCKS";
    r=path_for(sl_io_path,base,bank,stored);if(r<0)return r;
    r=sl_io_fs_open(&sl_io_object,sl_io_path,"r",sl_io_sector,512);
    if(r<0)return r==-12?ABSENT:r==-10?CORRUPT:r;
    size=sl_io_fs_size(sl_io_object.word[0]);
    if(size<0)r=size;
    else {
        n=(u32)size<32?(u32)size:32;
        r=sl_io_fs_read(&sl_io_object,sl_io_file,n);
        if(r!=1)r=r<0?r:CORRUPT;
        else {
            for(i=0;i<8 && sl_io_file[i]==(u8)magic[i];++i){}
            /* versions 1 and 2 are read; anything else is a future format. */
            if(n>=10 && i==8 && (sl_io_file[8]!=0||(sl_io_file[9]!=1&&sl_io_file[9]!=2)))r=FUTURE;
            else if(n>=16 && i==8 && (sl_io_file[10]!=0||sl_io_file[11]!=32||sl_io_file[14]||sl_io_file[15]))r=FUTURE;
            else if(size!=(expect=n>=10 && i==8 && sl_io_file[9]==1?V1_FILE_BYTES:FILE_BYTES))r=CORRUPT;
            else {r=sl_io_fs_read(&sl_io_object,sl_io_file+n,expect-n);r=r==1?0:r<0?r:CORRUPT;}
        }
    }
    c=sl_io_fs_close(&sl_io_object);if(r>=0 && c<0)r=c;
    if(r<0)return r;
    r=sl_io_core_validate(bank,sl_io_file,expect,generation);
    if(r==-2)return FUTURE;
    if(r<0)return CORRUPT;
    if(expect==V1_FILE_BYTES) {
        /* A version 1 file: its rows widen in place to six controls, E / F unlocked, and
         * the buffer is sealed as the version 2 file of the same bank and generation (only
         * a write of that buffer stores version 2). */
        u8 *p=sl_io_file+32;
        for(i=ROWS;i--;){p[i*6+5]=255;p[i*6+4]=255;p[i*6+3]=p[i*4+3];p[i*6+2]=p[i*4+2];p[i*6+1]=p[i*4+1];p[i*6]=p[i*4];}
        if(sl_io_core_seal(bank,*generation,sl_io_file)<0)return CORRUPT;
    }
    return 0;
}
static s32 write_buffer(const char *base,u32 bank,u32 stored) {
    s32 r,c;
    r=path_for(sl_io_path,base,bank,stored);if(r<0)return r;
    r=sl_io_fs_open(&sl_io_object,sl_io_path,"w",sl_io_sector,512);if(r<0)return r;
    r=sl_io_fs_write(&sl_io_object,sl_io_file,FILE_BYTES);
    if(r!=1)r=r<0?r:CORRUPT;else r=0;
    c=sl_io_fs_close(&sl_io_object);return r<0?r:c<0?c:0;
}
/* The RAM bank -> sl_io_file (a sealed version 2 file); *locked = 1 when it holds a lock. */
static s32 snapshot(u32 bank,u32 *generation,u32 *locked) {
    u32 tries=3,g,i,any;const u8 *p;
    do {
        g=sl_generation[bank];
        if(sl_io_core_pack(bank,g,sl_io_core_bank(bank),sl_io_file)<0)return CORRUPT;
        if(g==sl_generation[bank]) {
            p=sl_io_file+32;any=0;
            for(i=0;i<BANK_BYTES;++i)any|=(u32)(u8)~p[i];
            *generation=g;*locked=any!=0;return 0;
        }
    }while(--tries);
    return BUSY;
}
static void clean_snapshot(u32 bank,u32 generation) {
    u32 sr=sl_io_irq_lock();
    if(generation==sl_generation[bank])sl_dirty_mask&=~(1u<<bank);
    sl_io_irq_restore(sr);
}
static s32 publish(u32 bank,u32 generation,const u8 *payload) {
    /* Do not expose a partly copied bank to interrupt-time lock readers. */
    sl_blocked_mask|=1u<<bank;
    sl_ready_mask&=~(1u<<bank);
    return sl_io_core_publish(bank,generation,payload);
}
static void fresh_bank(u32 bank) {
    u8 *p=sl_io_core_bank(bank);u32 i,sr;
    for(i=0;i<RAM_BANK_BYTES;++i)p[i]=255;
    sr=sl_io_irq_lock();
    sl_generation[bank]=0;sl_ready_mask|=1u<<bank;
    sl_dirty_mask&=~(1u<<bank);sl_blocked_mask&=~(1u<<bank);
    sl_io_irq_restore(sr);
}
/* The banks of base with a sylock file (WORK or STRD). */
static u32 probe_present(const char *base) {
    u32 bank,stored,mask=0;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored)
        if(path_for(sl_io_path,base,bank,stored)>=0 && file_exists(sl_io_path)!=0)mask|=1u<<bank;
    return mask;
}
#define SC_FS(x) sl_io_fs_##x
#include "scenes_io.h"
#include "gjlocks_io.h"
static s32 load_bank(u32 bank) {
    s32 w,s;u32 g=0,bit=1u<<bank;
    sl_present_mask&=~bit;
    w=read_bank(sl_io_base,bank,0,&g);
    if(w!=ABSENT)sl_present_mask|=bit;
    if(w==0) {
        if(publish(bank,g,sl_io_file+32)<0)return CORRUPT;
        s=read_bank(sl_io_base,bank,1,&g);
        if(s==FUTURE){sl_blocked_mask|=bit;sl_ready_mask&=~bit;note(s,0);}
        else if(s<0)note(s,0);
        return 0;
    }
    s=read_bank(sl_io_base,bank,1,&g);
    if(s!=ABSENT)sl_present_mask|=bit;
    if(s==0) {
        if(publish(bank,g,sl_io_file+32)<0)return CORRUPT;
        /* A future format is never overwritten, even on explicit SAVE. */
        if(w==FUTURE){sl_blocked_mask|=bit;sl_ready_mask&=~bit;}
        sl_io_protected_mask|=bit;note(w<0?w:CORRUPT,1);return 0;
    }
    if(w==ABSENT && s==ABSENT){fresh_bank(bank);return 0;}
    sl_blocked_mask|=bit;sl_ready_mask&=~bit;
    note(w<0?w:s<0?s:CORRUPT,0);return CORRUPT;
}
static s32 load_project(void) {
    u32 bank;char base[PATH_BYTES];
    if(current_base(base)<0)return PATH_ERROR;
    sl_reset();sl_clip_reset();sl_seq_reset();sl_io_loaded=0;sl_io_protected_mask=0;sl_io_warning=0;sl_io_last_error=0;
    sl_present_mask=0;
    text_copy(sl_io_base,base,PATH_BYTES);
    for(bank=0;bank<16;++bank){load_bank(bank);sg_load_bank(bank);}
    sl_io_loaded=1;return 0;
}
/* A fresh project can edit in RAM immediately; card IO waits for engine jobs. */
static void fresh_project(void) {
    sl_reset();sl_clip_reset();sl_seq_reset();sl_ready_mask=65535;sl_io_protected_mask=0;
    sl_present_mask=0;sg_present_mask=0;sg_protected_mask=0;
    sl_io_loaded=1;sl_io_last_error=0;sl_io_warning=0;
}
static s32 flush_ab(u32 mask,u32 force);
static s32 store_ab(u32 mask);
/* force repairs recovered ordinary corruption only after an explicit SAVE. */
static s32 flush(u32 mask,u32 force) {
    s32 r,rg;
    if(!sl_io_loaded)return 0;
    r=flush_ab(mask,force);   /* A..F first; a G..J error never stops it, the first error is returned */
    rg=sg_flush(mask);
    return r<0?r:rg;
}
static s32 flush_ab(u32 mask,u32 force) {
    u32 bank,bit,g,locked; s32 r;
    if(force && (sl_blocked_mask&mask))return FUTURE;
    mask&=sl_dirty_mask|(force?sl_io_protected_mask:0);
    mask&=sl_ready_mask&~sl_blocked_mask;
    if(!force)mask&=~sl_io_protected_mask;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(sl_present_mask&bit)) {
            r=write_buffer(sl_io_base,bank,0);if(r<0)return r;
            sl_present_mask|=bit;
        }
        clean_snapshot(bank,g);
        sl_io_protected_mask&=~bit;
    }
    return 0;
}
static s32 store_mask(u32 mask) {
    s32 r,rg;
    if(!sl_io_loaded)return CORRUPT;
    r=store_ab(mask);   /* A..F first; a G..J error never stops it, the first error is returned */
    rg=sg_store(mask);
    return r<0?r:rg;
}
static s32 store_ab(u32 mask) {
    u32 bank,bit,g,locked; s32 r;
    if((sl_blocked_mask&mask)||((sl_ready_mask&mask)!=mask))return FUTURE;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(sl_present_mask&bit)) {
            r=write_buffer(sl_io_base,bank,0);if(r<0)return r;
            r=write_buffer(sl_io_base,bank,1);if(r<0)return r;
            sl_present_mask|=bit;
        }
        clean_snapshot(bank,g);
        sl_io_protected_mask&=~bit;
    }
    return 0;
}
/* First validate every requested source before replacing any WORK file. */
static s32 restore_preflight(u32 mask) {
    u32 bank,g; s32 r;
    if(sl_blocked_mask&mask)return FUTURE;
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank)) {
        r=read_bank(sl_io_base,bank,1,&g);
        if(r==ABSENT)continue;
        if(r<0)return r;
    }
    return sg_restore_preflight(mask);
}
static s32 restore_mask(u32 mask) {
    u32 bank,bit,g; s32 r;
    sc_restore_files(mask);
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=read_bank(sl_io_base,bank,1,&g);
        if(r==ABSENT) {
            /* An explicit RELOAD to a saved state without locks in this bank: no file. */
            if(path_for(sl_io_path,sl_io_base,bank,0)>=0) {
                r=sl_io_fs_remove(sl_io_path);
                if(r<0&&r!=-12)return r;
            }
            fresh_bank(bank);
            sl_present_mask&=~bit;
        } else {
            if(r<0)return r;
            r=write_buffer(sl_io_base,bank,0);if(r<0)return r;
            r=publish(bank,g,sl_io_file+32);if(r<0)return CORRUPT;
            sl_present_mask|=bit;
        }
        sl_io_protected_mask&=~bit;
        sg_restore(bit);   /* right after this bank's sylock publish (which clears G..J); per bank, so an early return leaves no published bank without its G..J */
    }
    return 0;
}
/* The banks the background save has to write: what sl_io_background_request tests. */
static u32 background_dirty(void) {
    u32 m=sl_dirty_mask&sl_ready_mask&~(sl_blocked_mask|sl_io_protected_mask);
    if(m)return m;
    return sg_dirty_mask&sl_ready_mask&~(sl_blocked_mask|sg_blocked_mask|sg_protected_mask);
}
/* The UI tick while the sequencer plays (stock skips its background save then): after
 * PLAY_TICKS ticks with a dirty bank, post the flush job, under the checks stock makes
 * before it posts its own (the tick's 0x460d1de8, then 0x80000088, 0x100f847c and the
 * card / project check 0x400255ec). No card I/O here. */
void sl_io_play_tick(void) {
    if(!sl_io_loaded||!background_dirty()){sl_io_play_ticks=0;return;}
    if(++sl_io_play_ticks<PLAY_TICKS)return;
    sl_io_play_ticks=0;
    if(sl_io_flush_pending)return;
    if(*(volatile u32 *)0x460d1de8||*(volatile s32 *)0x80000088==1||*(volatile u32 *)0x100f847c)return;
    if(!sl_io_stock_card_ready())return;
    sl_io_flush_pending=1;sl_io_flush_job[0]=FLUSH_KIND;
    sl_io_queue_post((void *)0x460d17ce,sl_io_flush_job);
}
/* Called from dispatcher before its switch. The job remains stock-owned. */
s32 sl_io_before_job(const u8 *job) {
    s32 r=0;u32 kind=job[0];
    if(kind==FLUSH_KIND) {
        /* Ours: the stock switch drops it after this. */
        sl_io_flush_pending=0;r=flush(65535,0);
        if(r<0)note(r,0);
        return 0;
    }
    sl_io_job_kind=kind;sl_io_job_mask=((u32)job[2]<<8)|job[3];
    if(kind!=2)sl_io_warning=0;
    if(kind==2||kind==4||kind==7||kind==8||kind==9||kind==10||kind==11||kind==12||kind==17||kind==18)
        r=flush(65535,0);
    if((kind==8||kind==12) && sl_blocked_mask)r=FUTURE;
    if(r<0)note(r,0);
    return r;
}
/* Stock completion ABI is callback(result), scheduled onto UI queue. */
void sl_io_reject_job(const u8 *job,s32 error) {
    u32 off,fn;
    switch(job[0]) {
      case 2: case 11:off=6;break;
      case 7:case 8:case 9:case 4:off=268;break;
      case 10:off=10;break;
      case 12:off=526;break;
      case 17:case 18:case 19:case 20:off=8;break;
      default:return;
    }
    fn=((u32)job[off]<<24)|((u32)job[off+1]<<16)|((u32)job[off+2]<<8)|job[off+3];
    if(fn)sl_io_post((void (*)(s32))fn,error);
}
/* The stock load returns the first error of any bank in its mask -- a missing bank file
 * (-12, that bank initialised empty), one it cannot open or read, one it rejects -- and still
 * activates the project. The lock files are read whatever it returned: at power-on its mask
 * is every bank but the current one, so one such bank file would otherwise leave every bank's
 * step locks unloaded while the current bank's stock locks come back from battery-backed RAM. */
s32 sl_io_banks_load(void *p,u32 mask,void *a,void *b) {
    s32 r=sl_io_stock_banks_load(p,mask,a,b);char base[PATH_BYTES];
    if(current_base(base)==0 && (!sl_io_loaded||sl_io_job_kind==4||!same_text(base,sl_io_base))) {
        s32 e=load_project();if(e<0)note(e,0);
    }
    return r; /* A broken extension must not prevent stock project activation. */
}
s32 sl_io_banks_save(void *p,u32 mask,void *a,void *b) {
    s32 r=sl_io_stock_banks_save(p,mask,a,b),e;char base[PATH_BYTES];u32 changed=0,sr;
    if(sl_io_job_kind==8||sl_io_job_kind==9) {
        if(current_base(base)<0) {
            /* Never keep writing the old project if the new owner is unknown. */
            sl_io_loaded=0;sl_io_base[0]=0;note(PATH_ERROR,0);
            return r<0?r:PATH_ERROR;
        }
        if(!sl_io_loaded||!same_text(base,sl_io_base)) {
            /* Stock commits the new name before this call, with no rollback on
             * error. Adopt it even if stock saving failed. The new files have
             * no clean snapshots yet, including banks not reached on failure. */
            if(sl_io_job_kind==9)fresh_project();
            text_copy(sl_io_base,base,PATH_BYTES);sl_io_loaded=1;
            sl_io_protected_mask=0;sg_present_mask=0;sg_protected_mask=0;
            sl_present_mask=probe_present(sl_io_base);   /* a sylock file already there is replaced */
            sr=sl_io_irq_lock();
            sl_dirty_mask|=sl_ready_mask&~sl_blocked_mask;
            sl_io_irq_restore(sr);
            changed=1;
        }
    }
    if(r<0){if(changed)note(r,0);return r;}
    e=changed?store_mask(65535):flush(mask&65535,0);
    if(e<0){note(e,0);return e;}return r;
}
s32 sl_io_card_sync(void *p,void *a,void *b) {
    s32 e=flush(65535,0);if(e<0){note(e,0);return e;}
    return sl_io_stock_card_sync(p,a,b);
}
s32 sl_io_project_store(void *p,void *a,void *b) {
    s32 r=sl_io_stock_project_store(p,a,b),e;if(r<0)return r;
    e=store_mask(65535);if(e<0){note(e,0);return e;}return r;
}
s32 sl_io_bank_store(void *p,u32 mask,void *a,void *b) {
    s32 r=sl_io_stock_bank_store(p,mask,a,b),e;if(r<0)return r;
    e=store_mask(mask&65535);if(e<0){note(e,0);return e;}return r;
}
s32 sl_io_project_restore(void *p,void *a,void *b) {
    s32 e=restore_preflight(65535),r;if(e<0){note(e,0);return e;}
    r=sl_io_stock_project_restore(p,a,b);if(r<0)return r;
    e=restore_mask(65535);if(e<0){note(e,0);return e;}return r;
}
s32 sl_io_bank_restore(void *p,u32 mask,void *a,void *b) {
    s32 e=restore_preflight(mask&65535),r;if(e<0){note(e,0);return e;}
    r=sl_io_stock_bank_restore(p,mask,a,b);if(r<0)return r;
    e=restore_mask(mask&65535);if(e<0){note(e,0);return e;}return r;
}
void sl_io_clear(void) {
    sl_io_stock_clear();sl_reset();sl_clip_reset();sl_seq_reset();sl_io_loaded=0;sl_io_base[0]=0;
    sl_io_protected_mask=0;sl_io_warning=0;sl_io_last_error=0;
    sl_present_mask=0;sg_present_mask=0;sg_protected_mask=0;
}
s32 sl_io_delete(const char *set,const char *project) {
    char base[PATH_BYTES];const char *path;u32 bank,stored;s32 r;
    /* The explicit DELETE caller already clears runtime if this is active.
     * Stock removes only its known files, then requires an empty directory. */
    path=sl_io_stock_directory(set,project);
    if(!path||text_copy(base,path,PATH_BYTES)<0){note(PATH_ERROR,0);return PATH_ERROR;}
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        r=path_for(sl_io_path,base,bank,stored);
        if(r>=0)r=sl_io_fs_remove(sl_io_path);
        if(r<0&&r!=-12){note(r,0);return r;}
    }
    r=sc_delete(base);if(r<0){note(r,0);return r;}
    r=sg_delete(base);if(r<0){note(r,0);return r;}
    /* Never recurse or enumerate unknown files; stock reports nonempty/error. */
    r=sl_io_stock_delete(set,project);if(r<0)note(r,0);return r;
}
s32 sl_io_export(void *p,const char *set,const char *project,void *a,void *b) {
    char source[PATH_BYTES],dest[PATH_BYTES],from[PATH_BYTES],to[PATH_BYTES];
    u32 bank,stored,g;s32 r,e;
    if(text_copy(source,sl_io_base,PATH_BYTES)<0)return PATH_ERROR;
    if(text_copy(dest,sl_io_stock_directory(set,project),PATH_BYTES)<0)return PATH_ERROR;
    if(same_text(source,dest))return PATH_ERROR;
    r=sl_io_stock_export(p,set,project,a,b);if(r<0)return r;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        e=read_bank(source,bank,stored,&g);if(e==ABSENT)continue;
        if(e<0){note(e,0);return e;}
        if(path_for(from,source,bank,stored)<0||path_for(to,dest,bank,stored)<0)return PATH_ERROR;
        e=sl_io_fs_copy(to,from,0);if(e<0){note(e,0);return e;}
    }
    e=sc_export(source,dest,from,to);if(e<0){note(e,0);return e;}
    e=sg_export(source,dest,from,to);if(e<0){note(e,0);return e;}
    return r;
}
