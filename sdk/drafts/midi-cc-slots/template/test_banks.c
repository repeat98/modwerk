/* SPDX-License-Identifier: MIT
 * Actual bank-sector algorithm with real files and torn-sector injection.
 */
#define _POSIX_C_SOURCE 200809L
#include "template.h"
#include "banks.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
uint8_t mt_work[4096];
static char directory[260],fault_suffix[16];
static unsigned writes,injected;
static struct {FILE*f;unsigned write;char path[320];} handles[8];
#define CHECK(c) do{if(!(c)){fprintf(stderr,"line %d: %s\n",__LINE__,#c);return 1;}}while(0)
int mm_profile_directory(char*out,unsigned n){return snprintf(out,n,"%s",directory)<(int)n;}
int mt_stopped(void){return 1;}
int mt_bank_open(struct mt_bank_file*object,const char*path,unsigned write){
    for(unsigned i=1;i<8;i++)if(handles[i].f&&!strcmp(handles[i].path,path))abort();
    for(unsigned i=1;i<8;i++)if(!handles[i].f){
        FILE*f=fopen(path,write?"r+b":"rb");if(!f&&write)f=fopen(path,"w+b");if(!f)return 0;
        memset(object,0,sizeof *object);object->word[0]=i;handles[i].f=f;handles[i].write=write;
        snprintf(handles[i].path,sizeof handles[i].path,"%s",path);return 1;
    }return 0;
}
int mt_bank_close(struct mt_bank_file*object){
    unsigned i=object->word[0];int valid=1;
    if(handles[i].write){if(fflush(handles[i].f)||ftruncate(fileno(handles[i].f),object->word[4]))valid=0;}
    if(fclose(handles[i].f))valid=0;handles[i].f=0;return valid;
}
int mt_bank_seek(struct mt_bank_file*object,unsigned at){
    unsigned i=object->word[0];if(handles[i].write)object->word[4]=at;
    return fseek(handles[i].f,(long)at,SEEK_SET)==0;
}
int mt_bank_read(struct mt_bank_file*object,uint8_t*p,unsigned n){return fread(p,1,n,handles[object->word[0]].f)==n;}
int mt_bank_write(struct mt_bank_file*object,const uint8_t*p,unsigned n){
    unsigned i=object->word[0];++writes;object->word[3]=0;object->word[4]=636113;
    if(!injected&&fault_suffix[0]&&strstr(handles[i].path,fault_suffix)){
        long at=ftell(handles[i].f);uint8_t broken[512];memset(broken,0xa5,sizeof broken);
        if(n!=512)abort();if(fwrite(broken,1,512,handles[i].f)!=512)abort();
        if(fseek(handles[i].f,at,SEEK_SET)||fwrite(p,1,87,handles[i].f)!=87||fflush(handles[i].f))abort();
        injected=1;return 0;
    }
    return fwrite(p,1,n,handles[i].f)==n;
}
int mt_bank_size(struct mt_bank_file*object){FILE*f=handles[object->word[0]].f;long at=ftell(f);if(fseek(f,0,SEEK_END))return -1;long n=ftell(f);if(fseek(f,at,SEEK_SET))return -1;return (int)n;}
static void corrupt(const char*suffix,unsigned offset){
    char path[320];snprintf(path,sizeof path,"%s/bank01.%s",directory,suffix);FILE*f=fopen(path,"r+b");if(!f)abort();
    if(fseek(f,offset,SEEK_SET)||fputc(0xa5,f)==EOF||fclose(f))abort();
}
int main(int argc,char**argv){
    if(argc!=3)return 2;snprintf(directory,sizeof directory,"%s",argv[1]);
    uint8_t old[1024],desired[1024],hashes[128],disk[2048];
    for(unsigned b=0;b<16;b++)for(unsigned p=0;p<8;p++)for(unsigned t=0;t<8;t++){
        old[b*64+p*8+t]=(uint8_t)((b+p+t)%17);desired[b*64+p*8+t]=(uint8_t)(t+1);
    }
    if(!strcmp(argv[2],"newedit"))old[0]=16;
    if(!strcmp(argv[2],"unsaved")||!strcmp(argv[2],"missing")||!strcmp(argv[2],"newedit")){
        CHECK(!mt_preflight(old,hashes));CHECK(writes==0);return 0;
    }
    for(unsigned b=0;b<16;b++)CHECK(mt_preflight_bank(old,hashes,disk,b));CHECK(writes==0);
    if(!strncmp(argv[2],"split",5)){
        CHECK(disk[1024+2]!=disk[2]);
        if(!strcmp(argv[2],"split-apply")){CHECK(mt_persist(desired,hashes));return 0;}
        if(!strcmp(argv[2],"split-work")||!strcmp(argv[2],"split-strd")){
            snprintf(fault_suffix,sizeof fault_suffix,".%s",argv[2]+6);
            CHECK(!mt_persist(desired,hashes));CHECK(injected);fault_suffix[0]=0;
        }else CHECK(mt_persist(desired,hashes));
        for(unsigned b=0;b<16;b++)CHECK(mt_restore_bank(disk,hashes,b));return 0;
    }
    if(!strcmp(argv[2],"apply")){CHECK(mt_persist(desired,hashes));return 0;}
    if(!strcmp(argv[2],"both-bad")){
        corrupt("work",42);corrupt("strd",42);CHECK(!mt_persist(old,hashes));CHECK(writes==0);return 0;
    }
    if(!strcmp(argv[2],"checksum")){corrupt("work",636111);CHECK(mt_persist(old,hashes));return 0;}
    snprintf(fault_suffix,sizeof fault_suffix,".%s",argv[2]);
    CHECK(!mt_persist(desired,hashes));CHECK(injected);fault_suffix[0]=0;
    CHECK(mt_persist(old,hashes));return 0;
}
