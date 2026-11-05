/* FM setup migration. Include after the lock-file flush/store helpers.
 * The checkpoint is persisted before native fields are changed. Until all
 * affected native banks have been saved, a load repeats the native rewrite
 * from the captured defaults and never reinterprets restored LFO defaults.
 * The project comment is committed last. A project without FM is not written.
 */
enum { FM_MIG_TEXT_MAX=262144, FM_PART=0x8ed80, FM_PART_SIZE=6322,
       FM_BANK_SIZE=0x9b340, FM_PATTERN_SIZE=0x8ed8, FM_TRACK_SIZE=2330 };
extern u8 fl_migration_text[];
static u32 fl_mig_pending,fl_mig_active,fl_mig_pristine;
/* Runtime provenance already decided by load/restore's existing project marker.
 * These masks are not persisted and do not complete any bank or owner. */
static u32 fl_mig_known_mask,fl_mig_capture_mask;
static const char fl_mig_line[]="#SYNTH_VC_SETUP=1\r\n";

static s32 fl_mig_path(const char *base,u32 stored) {
    const char *tail=stored?"/project.strd":"/project.work";u32 n=0,j=0;
    while(base[n]){if(n>=PATH_BYTES-15)return PATH_ERROR;fl_io_path[n]=base[n];++n;}
    while(tail[j])fl_io_path[n++]=tail[j++];
    fl_io_path[n]=0;return 0;
}
/* Read project text before opening a write handle. An oversized file fails closed. */
static s32 fl_mig_text_read(const char *base,u32 stored,u32 *length,u32 *has) {
    s32 r,c,size;u32 i,j;
    *length=0;*has=0;r=fl_mig_path(base,stored);if(r<0)return r;
    r=fl_io_fs_open(&fl_io_object,fl_io_path,"r",fl_io_sector,512);
    if(r<0)return r==-12?ABSENT:r;
    size=fl_io_fs_size(fl_io_object.word[0]);
    if(size<0)r=size;
    else if((u32)size>FM_MIG_TEXT_MAX-sizeof(fl_mig_line)-2)r=PATH_ERROR;
    else {r=fl_io_fs_read(&fl_io_object,fl_migration_text,(u32)size);r=r==1?0:r<0?r:CORRUPT;}
    c=fl_io_fs_close(&fl_io_object);if(r>=0&&c<0)r=c;if(r<0)return r;
    *length=(u32)size;
    for(i=0;i<(u32)size;++i)if(i==0||fl_migration_text[i-1]=='\n') {
        for(j=0;fl_mig_line[j]!='\r'&&i+j<(u32)size&&fl_migration_text[i+j]==(u8)fl_mig_line[j];++j){}
        if(fl_mig_line[j]=='\r'&&(i+j==(u32)size||fl_migration_text[i+j]=='\r'||fl_migration_text[i+j]=='\n')){*has=1;break;}
    }
    return 0;
}
static s32 fl_mig_comment(const char *base,u32 stored) {
    s32 r,c;u32 n,has,i;r=fl_mig_text_read(base,stored,&n,&has);
    if(r!=0)return r;
    if(has)return 0;
    if(n&&fl_migration_text[n-1]!='\n')fl_migration_text[n++]='\n';
    for(i=0;fl_mig_line[i];++i)fl_migration_text[n++]=(u8)fl_mig_line[i];
    r=fl_mig_path(base,stored);if(r<0)return r;
    r=fl_io_fs_open(&fl_io_object,fl_io_path,"w",fl_io_sector,512);if(r<0)return r;
    r=fl_io_fs_write(&fl_io_object,fl_migration_text,n);r=r==1?0:r<0?r:CORRUPT;
    c=fl_io_fs_close(&fl_io_object);if(r>=0&&c<0)r=c;return r;
}
static volatile u8 *fl_mig_bank(u32 bank) {
    volatile u8 *p=(volatile u8 *)(0x400e21e0u+bank*FM_BANK_SIZE);
    if(bank==*(volatile u8 *)0x100b14ce) {
        u32 q=*(volatile u32 *)0x46c82456;
        if(q>=0x40000000u&&q<0x48000000u)p=(volatile u8 *)q;
    }
    return p;
}
static u32 fl_mig_fm(volatile u8 *part,u32 track) {
    volatile u8 *s=part+0x3c+track*30;
    return part[0x22+track]==1&&s[0]=='F'&&s[1]=='M'&&s[2]==1;
}
static u8 fl_mig_voice(u8 v) {return v>=1&&v<=4?v:1;}
static void fl_mig_dirty(u32 bank) {
    u32 sr=fl_io_irq_lock();fl_dirty_mask|=1u<<bank;++fl_generation[bank];fl_io_irq_restore(sr);
}
/* Capture sources once. Native data stays untouched until the checkpoint file is durable. */
static u32 fl_mig_capture(u32 bank) {
    volatile u8 *blob=fl_mig_bank(bank),*part,*old,*row;
    u8 *cp=fl_migration_table+bank*MIGRATION_BYTES,*dst=fl_io_core_bank(bank),*sc=fl_scene_table+bank*SCENE_BYTES;
    u32 p,t,s,n,k,any=0;
    if(cp[3]>=1){for(p=0;p<8;++p)any|=cp[4+p];return any!=0;}
    for(p=0;p<8;++p) {
        part=blob+FM_PART+p*FM_PART_SIZE;cp[4+p]=0;
        for(t=0;t<8;++t)if(fl_mig_fm(part,t)) {
            cp[4+p]|=(u8)(1u<<t);any=1;old=part+0x11a+t*24;
            cp[12+p*16+t*2]=fl_mig_voice(old[2]);cp[13+p*16+t*2]=old[5]&127;
            for(s=0;s<16;++s) {
                row=part+0x662+(s*8+t)*32;k=(p*128+s*8+t)*2;
                if(row[8]!=255)sc[k]=fl_mig_voice(row[8]);
                if(row[11]!=255)sc[k+1]=row[11]&127;
            }
        }
    }
    if(!any)return 0;
    for(n=0;n<16;++n) {
        p=blob[n*FM_PATTERN_SIZE+0x8e57];if(p>=4)continue;
        for(t=0;t<8;++t)if(cp[4+p]&(1u<<t))for(s=0;s<64;++s) {
            row=blob+n*FM_PATTERN_SIZE+t*FM_TRACK_SIZE+0x59+s*32;
            k=((n*8+t)*64+s)*16;
            if(row[8]!=255)dst[k]=fl_mig_voice(row[8]);
            if(row[11]!=255)dst[k+1]=row[11]&127;
        }
    }
    cp[0]=cp[1]=cp[2]=0;cp[3]=1;fl_mig_dirty(bank);return 1;
}
/* An ordinary default edit or accepted machine assignment owns only this
 * working Part/track. Capture legacy owners before native bytes change, then
 * retire this target. Persistence remains the existing asynchronous WORK flush;
 * an early cut or recovery from an older stored companion can lose retirement.
 * No filesystem work, saved-Part change or native-edit rejection occurs here. */
void fl_mig_retire_current(u32 track,u32 current_fm) {
    u32 bank,part,bit,sr,ptr;u8 *cp;
    if(track>=8||!fl_io_loaded)return;
    bank=*(volatile u8 *)0x100b14ce;part=*(volatile u8 *)0x100b14cf;
    ptr=*(volatile u32 *)0x46c82456;
    if(bank>=16||part>=4||ptr<0x40000000u||ptr>=0x48000000u)return;
    bit=1u<<bank;
    if(!(fl_ready_mask&bit)||(fl_blocked_mask&bit))return;
    cp=fl_migration_table+bank*MIGRATION_BYTES;
    if(cp[3]>=2)return;
    if(!cp[3]) {
        /* Unknown/failed load provenance cannot safely classify other owners.
         * A marked current-format bank must not reinterpret real LFO3 values. */
        if(!(fl_mig_known_mask&bit))return;
        if(fl_mig_capture_mask&bit)fl_mig_capture(bank);
        /* SY/stock transactions retire existing ownership only. Do not create
         * an FM checkpoint in a project with no legacy targets and no new FM. */
        if(!cp[3]&&!current_fm)return;
    }
    sr=fl_io_irq_lock();
    if(cp[3]<2) {
        /* Even no legacy targets needs a frozen empty state-1 checkpoint:
         * otherwise a newly assigned FM would be captured on the next load. */
        if(!cp[3]){cp[0]=cp[1]=cp[2]=0;cp[3]=1;}
        cp[4+part]&=(u8)~(1u<<track);
        /* Mark every valid state-1 transaction, including an already retired
         * owner, so its final ordinary edit has an observable later flush. */
        fl_dirty_mask|=bit;++fl_generation[bank];
    }
    fl_io_irq_restore(sr);
}
static void fl_mig_apply_to(u32 bank,volatile u8 *blob,u32 shadow) {
    u8 *cp=fl_migration_table+bank*MIGRATION_BYTES;volatile u8 *part,*old,*row;
    u32 p,t,s,n;
    /* Defaults are read from the user's OS descriptor at runtime, never copied into source. */
    u8 spd=*(volatile u8 *)(0x400d37f6u+0x5e + 2),dep=*(volatile u8 *)(0x400d37f6u+0x5e + 5);
    for(p=0;p<8;++p) {
        part=shadow?(volatile u8 *)(0x100a4eceu+p*FM_PART_SIZE):blob+FM_PART+p*FM_PART_SIZE;
        for(t=0;t<8;++t)if((cp[4+p]&(1u<<t))&&fl_mig_fm(part,t)) {
            part[0x1e0+t*30]=cp[12+p*16+t*2];part[0x1e1+t*30]=cp[13+p*16+t*2];
            old=part+0x11a+t*24;old[2]=spd;old[5]=dep;
            for(s=0;s<16;++s){row=part+0x662+(s*8+t)*32;row[8]=255;row[11]=255;}
        }
    }
    for(n=0;n<16;++n) {
        p=blob[n*FM_PATTERN_SIZE+0x8e57];if(p>=4)continue;
        for(t=0;t<8;++t)if((cp[4+p]&(1u<<t))&&fl_mig_fm(blob+FM_PART+p*FM_PART_SIZE,t))for(s=0;s<64;++s) {
            row=(shadow?(volatile u8 *)0x1001614e:blob)+n*FM_PATTERN_SIZE+t*FM_TRACK_SIZE+0x59+s*32;
            row[8]=255;row[11]=255;
        }
    }
}
/* Replay only selected banks. A marked project may still contain a pending
 * checkpoint after reloading an old saved bank; the bank checkpoint wins. */
static s32 fl_mig_run(u32 requested,u32 capture) {
    u32 bank,mask=0; s32 r;
    requested&=65535;
    fl_mig_known_mask|=requested;
    fl_mig_capture_mask=(fl_mig_capture_mask&~requested)|(capture?requested:0);
    for(bank=0;bank<16;++bank)if(requested&(1u<<bank)) {
        volatile u8 *blob=fl_mig_bank(bank);u32 p,t,found=0;
        u8 state=fl_migration_table[bank*MIGRATION_BYTES+3];
        if(state==2)continue;
        if(state==1)found=1;
        else if(capture)for(p=0;p<8&&!found;++p)for(t=0;t<8;++t)
            if(fl_mig_fm(blob+FM_PART+p*FM_PART_SIZE,t)){found=1;break;}
        if(found) {
            if(!(fl_ready_mask&(1u<<bank))||(fl_blocked_mask&(1u<<bank))||(fl_io_protected_mask&(1u<<bank)))return FUTURE;
            mask|=1u<<bank;
        }
    }
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank))fl_mig_capture(bank);
    if(!mask)return 0;
    r=flush(mask,0);if(r<0)return r;
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank)) {
        volatile u8 *blob=fl_mig_bank(bank),*resident=(volatile u8 *)(0x400e21e0u+bank*FM_BANK_SIZE);
        fl_mig_apply_to(bank,blob,0);if(blob!=resident)fl_mig_apply_to(bank,resident,0);
        if(bank==*(volatile u8 *)0x100b14ce) {
            fl_mig_apply_to(bank,blob,1);*(volatile u32 *)0x100f8598=1;
        }
        *(volatile u32 *)(resident+0x9b332)=1;
    }
    fl_mig_pending|=mask;fl_mig_active=1;return 0;
}
static void fl_migrate_new(void) {
    fl_mig_pending=0;fl_mig_active=0;fl_mig_pristine=1;
    fl_mig_known_mask=65535;fl_mig_capture_mask=0;
}
static s32 fl_migrate_load(const char *base) {
    u32 n,marked,bank,completed=0; s32 r=fl_mig_text_read(base,0,&n,&marked);
    fl_mig_known_mask=0;fl_mig_capture_mask=0;
    fl_mig_pending=0;fl_mig_active=0;fl_mig_pristine=0;if(r!=0)return r;
    fl_mig_active=marked;
    for(bank=0;bank<16;++bank)if(fl_migration_table[bank*MIGRATION_BYTES+3]==2)completed=1;
    r=fl_mig_run(65535,!marked);if(r<0)return r;
    if(completed)fl_mig_active=1;
    if(!fl_mig_active)fl_mig_pristine=1;
    return 0;
}
/* After restoring the companion STRD for the same mask, use its checkpoint to
 * distinguish current-format banks from a legacy bank saved before migration.
 * project.strd supplies the fallback version when no companion existed.
 * A legacy bank becomes pending even when project.work already has the comment. */
static s32 fl_migrate_restored(const char *base,u32 mask) {
    u32 n,marked; s32 r=fl_mig_text_read(base,1,&n,&marked);
    /* Do not reuse the pre-restore classification if the saved marker read fails. */
    fl_mig_known_mask&=~(mask&65535);fl_mig_capture_mask&=~(mask&65535);
    if(r!=0&&r!=ABSENT)return r;
    fl_mig_pending&=~(mask&65535);
    return fl_mig_run(mask,!marked);
}
/* Record a newly chosen FM machine from setup bytes, never from real LFO3.
 * Called only for banks the native save has just committed. */
static u32 fl_mig_new_bank(u32 bank) {
    volatile u8 *blob=fl_mig_bank(bank);u8 *cp=fl_migration_table+bank*MIGRATION_BYTES;u32 p,t,found=0;
    if(cp[3])return 0;
    for(p=0;p<8;++p)for(t=0;t<8;++t)if(fl_mig_fm(blob+FM_PART+p*FM_PART_SIZE,t)) {
        volatile u8 *part=blob+FM_PART+p*FM_PART_SIZE;
        cp[4+p]|=(u8)(1u<<t);cp[12+p*16+t*2]=fl_mig_voice(part[0x1e0+t*30]);
        cp[13+p*16+t*2]=part[0x1e1+t*30]&127;found=1;
    }
    if(found){cp[3]=2;fl_mig_dirty(bank);}return found;
}
/* Call only after native bank save and the companion flush both succeed.
 * Every stock project-text rewrite may remove the comment, so append it again.
 */
static s32 fl_migrate_saved(const char *base,u32 mask,u32 stored) {
    s32 r;u32 bank,changed=0;
    mask&=65535;
    if(fl_mig_active||fl_mig_pristine)for(bank=0;bank<16;++bank)
        if((mask&(1u<<bank))&&fl_mig_new_bank(bank)){fl_mig_active=1;changed|=1u<<bank;}
    for(bank=0;bank<16;++bank)if((mask&(1u<<bank))&&fl_migration_table[bank*MIGRATION_BYTES+3]==1) {
        fl_migration_table[bank*MIGRATION_BYTES+3]=2;fl_mig_dirty(bank);changed|=1u<<bank;
    }
    if(changed){r=stored?store_mask(changed):flush(changed,0);if(r<0)return r;}
    fl_mig_pending&=~mask;
    if(!fl_mig_active||fl_mig_pending)return 0;
    r=fl_mig_comment(base,0);if(r!=0)return r;
    return stored==1?fl_mig_comment(base,1):0;
}
