/* FM SYNTH setup-lock I/O, copied from SY DRUM's established card lifecycle.
 * Step pairs, working/saved scene pairs and migration checkpoint share one bank file.
 * Playback is RAM only. Card writes run in engine jobs, including the playing flush.
 */

typedef unsigned char u8;
typedef unsigned int u32;
typedef int s32;

enum { RAM_BANK_BYTES=131072, ROWS=8192, SCENE_BYTES=2048, MIGRATION_BYTES=160,
       PAIR_BYTES=ROWS*2+SCENE_BYTES, BANK_BYTES=PAIR_BYTES+MIGRATION_BYTES, FILE_BYTES=BANK_BYTES+32, PATH_BYTES=260,
       ABSENT=1, CORRUPT=-60, FUTURE=-61, BUSY=-62, PATH_ERROR=-63 };
typedef struct { u32 word[6]; } File;
extern volatile u32 fl_ready_mask, fl_dirty_mask, fl_blocked_mask;
extern volatile u32 fl_generation[16];
extern void fl_reset(void);
extern void fl_clip_reset(void);
extern void fl_seq_reset(void);
extern u8 fl_scene_table[],fl_migration_table[];
extern u8 *fl_io_core_bank(u32);
extern s32 fl_io_core_validate(u32,const u8 *,u32,u32 *);
extern s32 fl_io_core_pack(u32,u32,const u8 *,u8 *);
extern s32 fl_io_core_publish(u32,u32,const u8 *);
extern s32 fl_io_core_seal(u32,u32,u8 *);
extern s32 fl_io_fs_open(File *,const char *,const char *,u8 *,u32);
extern s32 fl_io_fs_read(File *,void *,u32);
extern s32 fl_io_fs_write(File *,const void *,u32);
extern s32 fl_io_fs_close(File *);
extern s32 fl_io_fs_size(u32);
extern s32 fl_io_fs_copy(const char *,const char *,u32);
extern s32 fl_io_fs_remove(const char *);
extern const char *fl_io_stock_directory(const char *,const char *);
extern void fl_io_post(void (*)(s32),s32);
extern void fl_io_toast(const char *,u32);
extern s32 fl_io_stock_banks_load(void *,u32,void *,void *);
extern s32 fl_io_stock_banks_save(void *,u32,void *,void *);
extern s32 fl_io_stock_card_sync(void *,void *,void *);
extern s32 fl_io_stock_project_store(void *,void *,void *);
extern s32 fl_io_stock_project_restore(void *,void *,void *);
extern s32 fl_io_stock_bank_store(void *,u32,void *,void *);
extern s32 fl_io_stock_bank_restore(void *,u32,void *,void *);
extern s32 fl_io_stock_export(void *,const char *,const char *,void *,void *);
extern s32 fl_io_stock_delete(const char *,const char *);
extern void fl_io_stock_clear(void);
extern u32 fl_io_irq_lock(void);
extern s32 fl_io_stock_card_ready(void);
extern void fl_io_queue_post(void *,void *);
extern void fl_io_irq_restore(u32);

static char fl_io_base[PATH_BYTES],fl_io_path[PATH_BYTES];
static u8 fl_io_file[FILE_BYTES] __attribute__((aligned(4)));
static u8 fl_io_sector[512] __attribute__((aligned(4)));
static File fl_io_object;
volatile s32 fl_io_last_error;
volatile u32 fl_io_protected_mask;
static u32 fl_io_loaded,fl_io_job_kind,fl_io_job_mask;
static s32 fl_io_warning;
static u32 fl_present_mask;

enum { FLUSH_KIND=0x81, PLAY_TICKS=60 };
static u8 fl_io_flush_job[16] __attribute__((aligned(4)));
static volatile u32 fl_io_flush_pending;
static u32 fl_io_play_ticks;

static s32 text_copy(char *d,const char *s,u32 cap) {
    u32 i=0;
    while(i<cap) { char c=s[i];d[i++]=c;if(!c)return 0; }
    d[0]=0;return PATH_ERROR;
}
static u32 same_text(const char *a,const char *b) {
    while(*a && *a==*b){++a;++b;}return *a==*b;
}
static s32 current_base(char *d) {
    const char *s=fl_io_stock_directory((const char *)0,(const char *)0);
    return s ? text_copy(d,s,PATH_BYTES):PATH_ERROR;
}
static s32 path_for(char *dst,const char *base,u32 bank,u32 stored) {
    const char *s;u32 n=0;
    if(bank>=16)return PATH_ERROR;
    while(base[n]) {if(n>=PATH_BYTES-15)return PATH_ERROR;dst[n]=base[n];++n;}
    if(!n)return PATH_ERROR;
    dst[n++]='/';s="fmlock";while(*s)dst[n++]=*s++;
    ++bank;dst[n++]=(char)('0'+(bank>=10));dst[n++]=(char)('0'+(bank>=10?bank-10:bank));
    s=stored?".strd":".work";while(*s)dst[n++]=*s++;
    dst[n]=0;return 0;
}

void fl_io_ui_warning(s32 value) {
    fl_io_toast(value==1?"FM LOCKS RECOVERED":"FM LOCK FILE ERROR",48);
}
static void note(s32 error,u32 recovered) {
    fl_io_last_error=error;
    if(!fl_io_warning){fl_io_warning=1;fl_io_post(fl_io_ui_warning,recovered?1:error);}
}

static s32 file_exists(const char *path) {
    s32 r=fl_io_fs_open(&fl_io_object,path,"r",fl_io_sector,512),c;
    if(r<0)return r==-12?0:r==-10?1:r;
    c=fl_io_fs_close(&fl_io_object);
    return c<0?c:1;
}

static s32 read_bank(const char *base,u32 bank,u32 stored,u32 *generation) {
    s32 r,c,size;u32 n=0,i,expect=FILE_BYTES;const char *magic="FMLOCKS";
    r=path_for(fl_io_path,base,bank,stored);if(r<0)return r;
    r=fl_io_fs_open(&fl_io_object,fl_io_path,"r",fl_io_sector,512);
    if(r<0)return r==-12?ABSENT:r==-10?CORRUPT:r;
    size=fl_io_fs_size(fl_io_object.word[0]);
    if(size<0)r=size;
    else {
        n=(u32)size<32?(u32)size:32;
        r=fl_io_fs_read(&fl_io_object,fl_io_file,n);
        if(r!=1)r=r<0?r:CORRUPT;
        else {
            for(i=0;i<8 && fl_io_file[i]==(u8)magic[i];++i){}

            if(n>=10 && i==8 && (fl_io_file[8]!=0||fl_io_file[9]!=1))r=FUTURE;
            else if(n>=16 && i==8 && (fl_io_file[10]!=0||fl_io_file[11]!=32||fl_io_file[14]||fl_io_file[15]))r=FUTURE;
            else if((u32)size!=(expect=FILE_BYTES))r=CORRUPT;
            else {r=fl_io_fs_read(&fl_io_object,fl_io_file+n,expect-n);r=r==1?0:r<0?r:CORRUPT;}
        }
    }
    c=fl_io_fs_close(&fl_io_object);if(r>=0 && c<0)r=c;
    if(r<0)return r;
    r=fl_io_core_validate(bank,fl_io_file,expect,generation);
    if(r==-2)return FUTURE;
    if(r<0)return CORRUPT;
    return 0;
}
static s32 write_buffer(const char *base,u32 bank,u32 stored) {
    s32 r,c;
    r=path_for(fl_io_path,base,bank,stored);if(r<0)return r;
    r=fl_io_fs_open(&fl_io_object,fl_io_path,"w",fl_io_sector,512);if(r<0)return r;
    r=fl_io_fs_write(&fl_io_object,fl_io_file,FILE_BYTES);
    if(r!=1)r=r<0?r:CORRUPT;else r=0;
    c=fl_io_fs_close(&fl_io_object);return r<0?r:c<0?c:0;
}

static s32 snapshot(u32 bank,u32 *generation,u32 *locked) {
    u32 tries=3,g,i,any;const u8 *p;
    do {
        g=fl_generation[bank];
        if(fl_io_core_pack(bank,g,fl_io_core_bank(bank),fl_io_file)<0)return CORRUPT;
        if(g==fl_generation[bank]) {
            p=fl_io_file+32;any=0;
            for(i=0;i<PAIR_BYTES;++i)any|=(u32)(u8)~p[i];
            for(i=PAIR_BYTES;i<BANK_BYTES;++i)any|=p[i];
            *generation=g;*locked=any!=0;return 0;
        }
    }while(--tries);
    return BUSY;
}
static void clean_snapshot(u32 bank,u32 generation) {
    u32 sr=fl_io_irq_lock();
    if(generation==fl_generation[bank])fl_dirty_mask&=~(1u<<bank);
    fl_io_irq_restore(sr);
}
static s32 publish(u32 bank,u32 generation,const u8 *payload) {

    fl_blocked_mask|=1u<<bank;
    fl_ready_mask&=~(1u<<bank);
    return fl_io_core_publish(bank,generation,payload);
}
static void fresh_bank(u32 bank) {
    u8 *p=fl_io_core_bank(bank);u32 i,sr;
    for(i=0;i<RAM_BANK_BYTES;++i)p[i]=255;
    p=fl_scene_table+bank*SCENE_BYTES;for(i=0;i<SCENE_BYTES;++i)p[i]=255;
    p=fl_migration_table+bank*MIGRATION_BYTES;for(i=0;i<MIGRATION_BYTES;++i)p[i]=0;
    sr=fl_io_irq_lock();
    fl_generation[bank]=0;fl_ready_mask|=1u<<bank;
    fl_dirty_mask&=~(1u<<bank);fl_blocked_mask&=~(1u<<bank);
    fl_io_irq_restore(sr);
}

static u32 probe_present(const char *base) {
    u32 bank,stored,mask=0;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored)
        if(path_for(fl_io_path,base,bank,stored)>=0 && file_exists(fl_io_path)!=0)mask|=1u<<bank;
    return mask;
}

static s32 load_bank(u32 bank) {
    s32 w,s;u32 g=0,bit=1u<<bank;
    fl_present_mask&=~bit;
    w=read_bank(fl_io_base,bank,0,&g);
    if(w!=ABSENT)fl_present_mask|=bit;
    if(w==0) {
        if(publish(bank,g,fl_io_file+32)<0)return CORRUPT;
        s=read_bank(fl_io_base,bank,1,&g);
        if(s==FUTURE){fl_blocked_mask|=bit;fl_ready_mask&=~bit;note(s,0);}
        else if(s<0)note(s,0);
        return 0;
    }
    s=read_bank(fl_io_base,bank,1,&g);
    if(s!=ABSENT)fl_present_mask|=bit;
    if(s==0) {
        if(publish(bank,g,fl_io_file+32)<0)return CORRUPT;

        if(w==FUTURE){fl_blocked_mask|=bit;fl_ready_mask&=~bit;}
        fl_io_protected_mask|=bit;note(w<0?w:CORRUPT,1);return 0;
    }
    if(w==ABSENT && s==ABSENT){fresh_bank(bank);return 0;}
    fl_blocked_mask|=bit;fl_ready_mask&=~bit;
    note(w<0?w:s<0?s:CORRUPT,0);return CORRUPT;
}
static s32 load_project(void) {
    u32 bank;char base[PATH_BYTES];
    if(current_base(base)<0)return PATH_ERROR;
    fl_reset();fl_clip_reset();fl_seq_reset();fl_io_loaded=0;fl_io_protected_mask=0;fl_io_warning=0;fl_io_last_error=0;
    fl_present_mask=0;
    text_copy(fl_io_base,base,PATH_BYTES);
    for(bank=0;bank<16;++bank){load_bank(bank);}
    fl_io_loaded=1;return 0;
}

static void fl_migrate_new(void);
static void fresh_project(void) {
    fl_reset();fl_clip_reset();fl_seq_reset();fl_ready_mask=65535;fl_io_protected_mask=0;
    fl_present_mask=0;
    fl_io_loaded=1;fl_io_last_error=0;fl_io_warning=0;
    fl_migrate_new();
}
static s32 flush_ab(u32 mask,u32 force);
static s32 store_ab(u32 mask);

static s32 flush(u32 mask,u32 force) {
    if(!fl_io_loaded)return 0;
    return flush_ab(mask,force);
}
static s32 flush_ab(u32 mask,u32 force) {
    u32 bank,bit,g,locked; s32 r;
    if(force && (fl_blocked_mask&mask))return FUTURE;
    mask&=fl_dirty_mask|(force?fl_io_protected_mask:0);
    mask&=fl_ready_mask&~fl_blocked_mask;
    if(!force)mask&=~fl_io_protected_mask;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(fl_present_mask&bit)) {
            r=write_buffer(fl_io_base,bank,0);if(r<0)return r;
            fl_present_mask|=bit;
        }
        clean_snapshot(bank,g);
        fl_io_protected_mask&=~bit;
    }
    return 0;
}
static s32 store_mask(u32 mask) {
    if(!fl_io_loaded)return CORRUPT;
    return store_ab(mask);
}
static s32 store_ab(u32 mask) {
    u32 bank,bit,g,locked; s32 r;
    if((fl_blocked_mask&mask)||((fl_ready_mask&mask)!=mask))return FUTURE;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(fl_present_mask&bit)) {
            r=write_buffer(fl_io_base,bank,0);if(r<0)return r;
            r=write_buffer(fl_io_base,bank,1);if(r<0)return r;
            fl_present_mask|=bit;
        }
        clean_snapshot(bank,g);
        fl_io_protected_mask&=~bit;
    }
    return 0;
}

static s32 restore_preflight(u32 mask) {
    u32 bank,g; s32 r;
    if(fl_blocked_mask&mask)return FUTURE;
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank)) {
        r=read_bank(fl_io_base,bank,1,&g);
        if(r==ABSENT)continue;
        if(r<0)return r;
    }
    return 0;
}
static s32 restore_mask(u32 mask) {
    u32 bank,bit,g; s32 r;

    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=read_bank(fl_io_base,bank,1,&g);
        if(r==ABSENT) {

            if(path_for(fl_io_path,fl_io_base,bank,0)>=0) {
                r=fl_io_fs_remove(fl_io_path);
                if(r<0&&r!=-12)return r;
            }
            fresh_bank(bank);
            fl_present_mask&=~bit;
        } else {
            if(r<0)return r;
            r=write_buffer(fl_io_base,bank,0);if(r<0)return r;
            r=publish(bank,g,fl_io_file+32);if(r<0)return CORRUPT;
            fl_present_mask|=bit;
        }
        fl_io_protected_mask&=~bit;
    }
    return 0;
}

static u32 background_dirty(void) {
    u32 m=fl_dirty_mask&fl_ready_mask&~(fl_blocked_mask|fl_io_protected_mask);
    if(m)return m;
    return 0;
}

void fl_io_play_tick(void) {
    if(!fl_io_loaded||!background_dirty()){fl_io_play_ticks=0;return;}
    if(++fl_io_play_ticks<PLAY_TICKS)return;
    fl_io_play_ticks=0;
    if(fl_io_flush_pending)return;
    if(*(volatile u32 *)0x460d1de8||*(volatile s32 *)0x80000088==1||*(volatile u32 *)0x100f847c)return;
    if(!fl_io_stock_card_ready())return;
    fl_io_flush_pending=1;fl_io_flush_job[0]=FLUSH_KIND;
    fl_io_queue_post((void *)0x460d17ce,fl_io_flush_job);
}

s32 fl_io_before_job(const u8 *job) {
    s32 r=0;u32 kind=job[0];
    if(kind==FLUSH_KIND) {

        fl_io_flush_pending=0;r=flush(65535,0);
        if(r<0)note(r,0);
        return 0;
    }
    fl_io_job_kind=kind;fl_io_job_mask=((u32)job[2]<<8)|job[3];
    if(kind!=2)fl_io_warning=0;
    if(kind==2||kind==4||kind==7||kind==8||kind==9||kind==10||kind==11||kind==12||kind==17||kind==18)
        r=flush(65535,0);
    if((kind==8||kind==12) && fl_blocked_mask)r=FUTURE;
    if(r<0)note(r,0);
    return r;
}

void fl_io_reject_job(const u8 *job,s32 error) {
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
    if(fn)fl_io_post((void (*)(s32))fn,error);
}

#include "migration_io.h"

s32 fl_io_banks_load(void *p,u32 mask,void *a,void *b) {
    s32 r=fl_io_stock_banks_load(p,mask,a,b);char base[PATH_BYTES];
    if(current_base(base)==0 && (!fl_io_loaded||fl_io_job_kind==4||!same_text(base,fl_io_base))) {
        s32 e=load_project();if(e>=0)e=fl_migrate_load(fl_io_base);if(e<0)note(e,0);
    }
    return r;
}
s32 fl_io_banks_save(void *p,u32 mask,void *a,void *b) {
    s32 r=fl_io_stock_banks_save(p,mask,a,b),e;char base[PATH_BYTES];u32 changed=0,sr;
    if(fl_io_job_kind==8||fl_io_job_kind==9) {
        if(current_base(base)<0) {

            fl_io_loaded=0;fl_io_base[0]=0;note(PATH_ERROR,0);
            return r<0?r:PATH_ERROR;
        }
        if(!fl_io_loaded||!same_text(base,fl_io_base)) {

            if(fl_io_job_kind==9)fresh_project();
            text_copy(fl_io_base,base,PATH_BYTES);fl_io_loaded=1;
            fl_io_protected_mask=0;
            fl_present_mask=probe_present(fl_io_base);
            sr=fl_io_irq_lock();
            fl_dirty_mask|=fl_ready_mask&~fl_blocked_mask;
            fl_io_irq_restore(sr);
            changed=1;
        }
    }
    if(r<0){if(changed)note(r,0);return r;}
    e=changed?store_mask(65535):flush(mask&65535,0);
    if(e>=0)e=fl_migrate_saved(fl_io_base,changed?65535:mask&65535,changed);
    if(e<0){note(e,0);return e;}return r;
}
s32 fl_io_card_sync(void *p,void *a,void *b) {
    s32 e=flush(65535,0);if(e<0){note(e,0);return e;}
    e=fl_io_stock_card_sync(p,a,b);
    if(e>=0)e=fl_migrate_saved(fl_io_base,0,0);
    return e;
}
s32 fl_io_project_store(void *p,void *a,void *b) {
    s32 r=fl_io_stock_project_store(p,a,b),e;if(r<0)return r;
    e=store_mask(65535);if(e>=0)e=fl_migrate_saved(fl_io_base,65535,1);if(e<0){note(e,0);return e;}return r;
}
s32 fl_io_bank_store(void *p,u32 mask,void *a,void *b) {
    s32 r=fl_io_stock_bank_store(p,mask,a,b),e;if(r<0)return r;
    e=store_mask(mask&65535);if(e>=0)e=fl_migrate_saved(fl_io_base,mask&65535,2);if(e<0){note(e,0);return e;}return r;
}
s32 fl_io_project_restore(void *p,void *a,void *b) {
    s32 e=restore_preflight(65535),r;if(e<0){note(e,0);return e;}
    r=fl_io_stock_project_restore(p,a,b);if(r<0)return r;
    e=restore_mask(65535);if(e>=0)e=fl_migrate_restored(fl_io_base,65535);if(e<0){note(e,0);return e;}return r;
}
s32 fl_io_bank_restore(void *p,u32 mask,void *a,void *b) {
    s32 e=restore_preflight(mask&65535),r;if(e<0){note(e,0);return e;}
    r=fl_io_stock_bank_restore(p,mask,a,b);if(r<0)return r;
    e=restore_mask(mask&65535);if(e>=0)e=fl_migrate_restored(fl_io_base,mask&65535);if(e<0){note(e,0);return e;}return r;
}
void fl_io_clear(void) {
    fl_io_stock_clear();fl_reset();fl_clip_reset();fl_seq_reset();fl_io_loaded=0;fl_io_base[0]=0;
    fl_io_protected_mask=0;fl_io_warning=0;fl_io_last_error=0;
    fl_present_mask=0;
}
s32 fl_io_delete(const char *set,const char *project) {
    char base[PATH_BYTES];const char *path;u32 bank,stored;s32 r;

    path=fl_io_stock_directory(set,project);
    if(!path||text_copy(base,path,PATH_BYTES)<0){note(PATH_ERROR,0);return PATH_ERROR;}
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        r=path_for(fl_io_path,base,bank,stored);
        if(r>=0)r=fl_io_fs_remove(fl_io_path);
        if(r<0&&r!=-12){note(r,0);return r;}
    }

    r=fl_io_stock_delete(set,project);if(r<0)note(r,0);return r;
}
s32 fl_io_export(void *p,const char *set,const char *project,void *a,void *b) {
    char source[PATH_BYTES],dest[PATH_BYTES],from[PATH_BYTES],to[PATH_BYTES];
    u32 bank,stored,g;s32 r,e;
    if(text_copy(source,fl_io_base,PATH_BYTES)<0)return PATH_ERROR;
    if(text_copy(dest,fl_io_stock_directory(set,project),PATH_BYTES)<0)return PATH_ERROR;
    if(same_text(source,dest))return PATH_ERROR;
    r=fl_io_stock_export(p,set,project,a,b);if(r<0)return r;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        e=read_bank(source,bank,stored,&g);if(e==ABSENT)continue;
        if(e<0){note(e,0);return e;}
        if(path_for(from,source,bank,stored)<0||path_for(to,dest,bank,stored)<0)return PATH_ERROR;
        e=fl_io_fs_copy(to,from,0);if(e<0){note(e,0);return e;}
    }
    return r;
}
