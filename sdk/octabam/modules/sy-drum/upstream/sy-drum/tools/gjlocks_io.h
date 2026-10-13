/* The development line's controls G..J (its GRANULAR machine's FX page), file family
 * sylkgjNN.work / .strd beside sylock. No control of this module writes G..J; a project
 * from the development line keeps them: they are read into the lock rows, travel with the
 * rows (copy, paste, shift, clear) and are written back by the rules below, which are
 * that line's. Included by locks_io.c after scenes_io.h; shares sl_io_file / sl_io_path /
 * sl_io_object, SC_FS(x) (the file calls) and sc_crc / sc_get32 / sc_put32. The RAM rows
 * are the lock table's (sl_work_table, 16-byte rows): G..J are bytes +6..+9 of each row;
 * the sylock file (version 2, rows of A..F) never carries them.
 * File: 32-byte header (magic "SYLOCKGJ", version 1, header 32, bank, flags 0, payload
 * 32768, generation, CRC-32 of the payload, CRC-32 of the first 28 bytes; big-endian),
 * then 8192 rows of 4 bytes (G H I J; 0..127, 255 = no lock), the row order of sylock.
 * A bank's file is written only when its G..J payload holds a lock or its file already
 * exists in this project (so clearing the last lock is saved too): a project with no
 * G..J lock has no sylkgj file. Missing = no G..J locks. Rules as sylock's: WORK; a
 * WORK that fails its checks -> STRD (toast 'recovered', the bank is protected from the
 * background flush until an explicit SAVE); a later version (FUTURE) is preserved,
 * never overwritten, and that bank's G..J stay unlocked and unwritable (sg_blocked_mask).
 * A missing WORK skips the STRD lookup (SAVE and RELOAD write WORK with STRD). */
enum { SG_BANK=ROWS*4, SG_FILE=SG_BANK+32, SG_AT=6, SG_ROW=16 };
extern volatile u32 sg_dirty_mask, sg_blocked_mask;
extern volatile u32 sg_generation[16];
volatile u32 sg_protected_mask;          /* recovered from STRD: no background flush */
static u32 sg_present_mask;              /* a sylkgj file of this bank exists in sl_io_base */
static s32 sg_path(char *dst,const char *base,u32 bank,u32 stored) {
    const char *s;u32 n=0;
    if(bank>=16)return PATH_ERROR;
    while(base[n]) {if(n>=PATH_BYTES-15)return PATH_ERROR;dst[n]=base[n];++n;}
    if(!n)return PATH_ERROR;
    dst[n++]='/';s="sylkgj";while(*s)dst[n++]=*s++;
    ++bank;dst[n++]=(char)('0'+(bank>=10));dst[n++]=(char)('0'+(bank>=10?bank-10:bank));
    s=stored?".strd":".work";while(*s)dst[n++]=*s++;
    dst[n]=0;return 0;
}
/* 0: the validated payload is at sl_io_file+32. ABSENT / FUTURE / CORRUPT / an I/O error. */
static s32 sg_read(const char *base,u32 bank,u32 stored,u32 *generation) {
    s32 r,c,size;u32 n=0,i;const char *magic="SYLOCKGJ";const u8 *f=sl_io_file;
    r=sg_path(sl_io_path,base,bank,stored);if(r<0)return r;
    r=SC_FS(open)(&sl_io_object,sl_io_path,"r",sl_io_sector,512);
    if(r<0)return r==-12?ABSENT:r==-10?CORRUPT:r;
    size=SC_FS(size)(sl_io_object.word[0]);
    if(size<0)r=size;
    else {
        n=(u32)size<32?(u32)size:32;
        r=SC_FS(read)(&sl_io_object,sl_io_file,n);
        if(r!=1)r=r<0?r:CORRUPT;
        else {
            for(i=0;i<8 && f[i]==(u8)magic[i];++i){}
            if(n>=10 && i==8 && (f[8]!=0||f[9]!=1))r=FUTURE;
            else if(n>=16 && i==8 && (f[10]!=0||f[11]!=32||f[14]||f[15]))r=FUTURE;
            else if(i!=8||size!=SG_FILE)r=CORRUPT;
            else {r=SC_FS(read)(&sl_io_object,sl_io_file+n,SG_FILE-n);r=r==1?0:r<0?r:CORRUPT;}
        }
    }
    c=SC_FS(close)(&sl_io_object);if(r>=0 && c<0)r=c;
    if(r<0)return r;
    if(f[12]!=0||f[13]!=bank||sc_get32(f+16)!=SG_BANK)return CORRUPT;
    if(sc_crc(f,28)!=sc_get32(f+28)||sc_crc(f+32,SG_BANK)!=sc_get32(f+24))return CORRUPT;
    for(i=0;i<SG_BANK;++i)if(f[32+i]>127 && f[32+i]!=255)return CORRUPT;
    *generation=sc_get32(f+20);return 0;
}
static void sg_header(u32 bank,u32 generation) {
    u8 *f=sl_io_file;const char *magic="SYLOCKGJ";u32 i;
    for(i=0;i<8;++i)f[i]=(u8)magic[i];
    f[8]=0;f[9]=1;f[10]=0;f[11]=32;f[12]=0;f[13]=(u8)bank;f[14]=0;f[15]=0;
    sc_put32(f+16,SG_BANK);sc_put32(f+20,generation);
    sc_put32(f+24,sc_crc(f+32,SG_BANK));sc_put32(f+28,sc_crc(f,28));
}
/* The RAM bank's G..J -> sl_io_file (header sealed); *locked = 1 when any byte is a lock. */
static s32 sg_snapshot(u32 bank,u32 *generation,u32 *locked) {
    u32 tries=3,g,i,any;const u8 *p=sl_io_core_bank(bank);u8 *d=sl_io_file+32;
    do {
        g=sg_generation[bank];any=0;
        for(i=0;i<ROWS;++i) {
            const u8 *q=p+i*SG_ROW+SG_AT;u8 *e=d+i*4;
            e[0]=q[0];e[1]=q[1];e[2]=q[2];e[3]=q[3];
            any|=(u32)(u8)~(q[0]&q[1]&q[2]&q[3]);
        }
        if(g==sg_generation[bank]){sg_header(bank,g);*generation=g;*locked=any!=0;return 0;}
    }while(--tries);
    return BUSY;
}
static s32 sg_write_file(const char *base,u32 bank,u32 stored) {
    s32 r,c;
    r=sg_path(sl_io_path,base,bank,stored);if(r<0)return r;
    r=SC_FS(open)(&sl_io_object,sl_io_path,"w",sl_io_sector,512);if(r<0)return r;
    r=SC_FS(write)(&sl_io_object,sl_io_file,SG_FILE);
    if(r!=1)r=r<0?r:CORRUPT;else r=0;
    c=SC_FS(close)(&sl_io_object);return r<0?r:c<0?c:0;
}
static void sg_clean(u32 bank,u32 generation) {
    u32 sr=sl_io_irq_lock();
    if(generation==sg_generation[bank])sg_dirty_mask&=~(1u<<bank);
    sl_io_irq_restore(sr);
}
/* payload = 0: no G..J locks. The bank's readers are closed while its rows change (the
 * interrupt-time readers check sl_ready_mask); its former readiness comes back after. */
static void sg_publish(u32 bank,u32 generation,const u8 *payload) {
    u8 *p=sl_io_core_bank(bank);u32 i,sr,bit=1u<<bank,was;
    sr=sl_io_irq_lock();was=sl_ready_mask&bit;sl_ready_mask&=~bit;sl_io_irq_restore(sr);
    for(i=0;i<ROWS;++i) {
        u8 *q=p+i*SG_ROW+SG_AT;
        if(payload){const u8 *e=payload+i*4;q[0]=e[0];q[1]=e[1];q[2]=e[2];q[3]=e[3];}
        else q[0]=q[1]=q[2]=q[3]=255;
    }
    sr=sl_io_irq_lock();
    sg_generation[bank]=generation;sg_dirty_mask&=~bit;sg_blocked_mask&=~bit;
    sg_protected_mask&=~bit;sl_ready_mask|=was;
    sl_io_irq_restore(sr);
}
static void sg_block(u32 bank) {
    u32 sr;
    sg_publish(bank,0,(const u8 *)0);
    sr=sl_io_irq_lock();sg_blocked_mask|=1u<<bank;sl_io_irq_restore(sr);
}
/* After the bank's sylock publish (which writes 255 into G..J). */
static void sg_load_bank(u32 bank) {
    s32 w,s;u32 g=0,bit=1u<<bank;
    sg_present_mask&=~bit;
    w=sg_read(sl_io_base,bank,0,&g);
    if(w==0){sg_publish(bank,g,sl_io_file+32);sg_present_mask|=bit;return;}
    if(w==ABSENT){sg_publish(bank,0,(const u8 *)0);return;}
    s=sg_read(sl_io_base,bank,1,&g);
    if(w==FUTURE||s==FUTURE){sg_block(bank);sg_present_mask|=bit;note(FUTURE,0);return;}
    if(s==0) {
        sg_publish(bank,g,sl_io_file+32);sg_present_mask|=bit;
        sg_protected_mask|=bit;note(w<0?w:CORRUPT,1);return;
    }
    sg_block(bank);sg_present_mask|=bit;note(w<0?w:s<0?s:CORRUPT,0);
}
/* The banks whose G..J may be written: their table is published and unblocked. */
static u32 sg_writable(u32 mask) {
    return mask&sl_ready_mask&~sl_blocked_mask&~sg_blocked_mask;
}
static s32 sg_flush(u32 mask) {
    u32 bank,bit,g,locked;s32 r;
    mask=sg_writable(mask&sg_dirty_mask)&~sg_protected_mask;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=sg_snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(sg_present_mask&bit)) {
            r=sg_write_file(sl_io_base,bank,0);if(r<0)return r;
            sg_present_mask|=bit;
        }
        sg_clean(bank,g);
    }
    return 0;
}
static s32 sg_store(u32 mask) {
    u32 bank,bit,g,locked;s32 r;
    mask=sg_writable(mask);
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=sg_snapshot(bank,&g,&locked);if(r<0)return r;
        if(locked||(sg_present_mask&bit)) {
            r=sg_write_file(sl_io_base,bank,0);if(r<0)return r;
            r=sg_write_file(sl_io_base,bank,1);if(r<0)return r;
            sg_present_mask|=bit;
        }
        sg_clean(bank,g);
        sg_protected_mask&=~bit;
    }
    return 0;
}
/* RELOAD preflight: a STRD that exists must read (as sylock's); FUTURE is left to sg_restore. */
static s32 sg_restore_preflight(u32 mask) {
    u32 bank,g;s32 r;
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank)) {
        r=sg_read(sl_io_base,bank,1,&g);
        if(r==ABSENT||r==FUTURE)continue;
        if(r<0)return r;
    }
    return 0;
}
/* RELOAD, after the sylock banks are published: STRD becomes WORK and RAM; no STRD =
 * the saved project had no G..J locks (WORK removed). */
static void sg_restore(u32 mask) {
    u32 bank,g,bit;s32 r;
    for(bank=0;bank<16;++bank)if(mask&(bit=1u<<bank)) {
        r=sg_read(sl_io_base,bank,1,&g);
        if(r==0) {
            r=sg_write_file(sl_io_base,bank,0);
            sg_publish(bank,g,sl_io_file+32);sg_present_mask|=bit;
            if(r<0)note(r,0);
        } else if(r==ABSENT) {
            /* a blocked bank's WORK, or a later version's, is never removed (the bank stays blocked) */
            if((sg_blocked_mask&bit)||sg_read(sl_io_base,bank,0,&g)==FUTURE){sg_block(bank);sg_present_mask|=bit;}
            else {
                if(sg_path(sl_io_path,sl_io_base,bank,0)>=0)SC_FS(remove)(sl_io_path);
                sg_publish(bank,0,(const u8 *)0);sg_present_mask&=~bit;
            }
        } else if(r==FUTURE){sg_block(bank);sg_present_mask|=bit;}
        else {sg_block(bank);sg_present_mask|=bit;note(r,0);}
    }
}
static s32 sg_delete(const char *base) {
    u32 bank,stored;s32 r;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        r=sg_path(sl_io_path,base,bank,stored);
        if(r>=0)r=SC_FS(remove)(sl_io_path);
        if(r<0&&r!=-12)return r;
    }
    return 0;
}
static s32 sg_export(const char *source,const char *dest,char *from,char *to) {
    u32 bank,stored,g;s32 e;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        e=sg_read(source,bank,stored,&g);if(e==ABSENT)continue;
        if(e<0 && e!=FUTURE)return e;   /* a later version is copied as it is */
        if(sg_path(from,source,bank,stored)<0||sg_path(to,dest,bank,stored)<0)return PATH_ERROR;
        e=SC_FS(copy)(to,from,0);if(e<0)return e;
    }
    return 0;
}
