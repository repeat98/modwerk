/* The development line's setup-scene files (syscenNN.work / .strd, 4,128 bytes, magic
 * SYSCENE\0, version 1): this module has no setup scenes, so it never reads them for
 * playback; RELOAD restores them as that line does (sc_restore_files), DELETE removes them
 * with the project (stock refuses to delete a folder that still holds files it does not
 * know) and EXPORT copies the ones that exist. Included by locks_io.c, sharing sl_io_file / sl_io_path / sl_io_object;
 * SC_FS(x) names the file call. sc_crc / sc_get32 / sc_put32 serve gjlocks_io.h too. */
enum { SC_BANK=4096, SC_FILE=4128 };
extern const u32 sl_crc_table[256];
static u32 sc_crc(const u8 *p,u32 n) {
    u32 c=~0u;
    while(n--)c=sl_crc_table[(c^*p++)&255]^(c>>8);
    return ~c;
}
static u32 sc_get32(const u8 *p) { return ((u32)p[0]<<24)|((u32)p[1]<<16)|((u32)p[2]<<8)|p[3]; }
static void sc_put32(u8 *p,u32 v) { p[0]=(u8)(v>>24);p[1]=(u8)(v>>16);p[2]=(u8)(v>>8);p[3]=(u8)v; }
static s32 sc_path(char *dst,const char *base,u32 bank,u32 stored) {
    const char *s;u32 n=0;
    if(bank>=16)return PATH_ERROR;
    while(base[n]) {if(n>=PATH_BYTES-15)return PATH_ERROR;dst[n]=base[n];++n;}
    if(!n)return PATH_ERROR;
    dst[n++]='/';s="syscen";while(*s)dst[n++]=*s++;
    ++bank;dst[n++]=(char)('0'+(bank>=10));dst[n++]=(char)('0'+(bank>=10?bank-10:bank));
    s=stored?".strd":".work";while(*s)dst[n++]=*s++;
    dst[n]=0;return 0;
}
/* 0: the validated payload is at sl_io_file+32. ABSENT / FUTURE / CORRUPT / an I/O error. */
static s32 sc_read(const char *base,u32 bank,u32 stored,u32 *generation) {
    s32 r,c,size;u32 n=0,i;const char *magic="SYSCENE";const u8 *f=sl_io_file;
    r=sc_path(sl_io_path,base,bank,stored);if(r<0)return r;
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
            else if(i!=8||size!=SC_FILE)r=CORRUPT;
            else {r=SC_FS(read)(&sl_io_object,sl_io_file+n,SC_FILE-n);r=r==1?0:r<0?r:CORRUPT;}
        }
    }
    c=SC_FS(close)(&sl_io_object);if(r>=0 && c<0)r=c;
    if(r<0)return r;
    if(f[12]!=0||f[13]!=bank||sc_get32(f+16)!=SC_BANK)return CORRUPT;
    if(sc_crc(f,28)!=sc_get32(f+28)||sc_crc(f+32,SC_BANK)!=sc_get32(f+24))return CORRUPT;
    for(i=0;i<SC_BANK;++i)if(f[32+i]>127 && f[32+i]!=255)return CORRUPT;
    *generation=sc_get32(f+20);return 0;
}
/* RELOAD (the development line's sc_restore for these files): a bank's saved STRD becomes its WORK
 * again (copied as it is); no STRD: the WORK is removed (that line's "no saved scene assignment"). */
static void sc_restore_files(u32 mask) {
    u32 bank,g;s32 r;
    for(bank=0;bank<16;++bank)if(mask&(1u<<bank)) {
        r=sc_read(sl_io_base,bank,1,&g);
        if(r==0) {
            r=sc_path(sl_io_path,sl_io_base,bank,0);
            if(r>=0) {
                r=SC_FS(open)(&sl_io_object,sl_io_path,"w",sl_io_sector,512);
                if(r>=0){s32 w=SC_FS(write)(&sl_io_object,sl_io_file,SC_FILE),c=SC_FS(close)(&sl_io_object);r=w!=1?(w<0?w:CORRUPT):c;}
            }
            if(r<0)note(r,0);
        } else if(r==ABSENT) {
            if(sc_path(sl_io_path,sl_io_base,bank,0)>=0)SC_FS(remove)(sl_io_path);
        } else if(r!=FUTURE)note(r,0);
    }
}
static s32 sc_delete(const char *base) {
    u32 bank,stored;s32 r;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        r=sc_path(sl_io_path,base,bank,stored);
        if(r>=0)r=SC_FS(remove)(sl_io_path);
        if(r<0&&r!=-12)return r;
    }
    return 0;
}
static s32 sc_export(const char *source,const char *dest,char *from,char *to) {
    u32 bank,stored,g;s32 e;
    for(bank=0;bank<16;++bank)for(stored=0;stored<2;++stored) {
        e=sc_read(source,bank,stored,&g);if(e==ABSENT)continue;
        if(sc_path(from,source,bank,stored)<0||sc_path(to,dest,bank,stored)<0)return PATH_ERROR;
        e=SC_FS(copy)(to,from,0);if(e<0)return e;
    }
    return 0;
}
