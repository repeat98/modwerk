/* SPDX-License-Identifier: MIT
 * Actual C journal engine, real files, fresh processes and injected power cuts.
 */
#include "template.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
char names_store[8][16];
static char root[260],project[32]="A";
static uint8_t native[1024];
static unsigned bank,playing,apply_calls,persist_calls,cut,fail_persist,protected,reads,writes,reloads,modifier,confirm_keys;
#define CHECK(c) do{if(!(c)){fprintf(stderr,"line %d: %s\n",__LINE__,#c);return 1;}}while(0)
static void native_file(unsigned write,unsigned n){
    char path[320];snprintf(path,sizeof path,"%s/%s/channels.bin",root,project);
    FILE*f=fopen(path,write?"r+b":"rb");if(!f&&write)f=fopen(path,"wb");if(!f)abort();
    unsigned done=write?fwrite(native,1,n,f):fread(native,1,n,f);if(done!=n||fclose(f))abort();
}
unsigned mm_profile_bank(void){return bank;}
int mm_profile_directory(char*out,unsigned n){return snprintf(out,n,"%s/%s",root,project)<(int)n;}
int mm_profile_gate(void){return !playing;}
int mt_stopped(void){return !playing;}
int mt_writable(void){return !protected;}
int mt_cancel_held(void){return 0;}
unsigned mt_confirm_held(void){return confirm_keys;}
int mt_view_key(int code){return !modifier&&code>=0x22&&code<=0x26;}
int mt_channels(unsigned write,uint8_t values[1024]){if(write){memcpy(native,values,1024);++apply_calls;}else memcpy(values,native,1024);return 1;}
int mt_preflight_bank(const uint8_t values[1024],uint8_t hashes[128],uint8_t disk[2048],unsigned b){memset(hashes+b*8,0x53,8);memcpy(disk+b*64,values+b*64,64);memcpy(disk+1024+b*64,values+b*64,64);return 1;}
void mt_reload_project(void){++reloads;}
int mt_persist_bank(const uint8_t values[1024],const uint8_t hashes[128],unsigned b){
    (void)hashes;++persist_calls;if(fail_persist)return 0;
    char path[320];snprintf(path,sizeof path,"%s/%s/channels.bin",root,project);
    FILE*f=fopen(path,"r+b");if(!f)abort();
    if(fseek(f,(long)b*64,SEEK_SET))abort();
    unsigned n=cut==2?32:64;if(fwrite(values+b*64,1,n,f)!=n||fclose(f))abort();
    if(cut==2)exit(0);return 1;
}
int mt_restore_bank(const uint8_t disk[2048],const uint8_t hashes[128],unsigned b){return mt_persist_bank(disk,hashes,b);}
void mm_profile_context(unsigned*b,unsigned*p,uint8_t values[8]){(void)b;(void)p;(void)values;abort();}
void mm_profile_apply(const uint8_t values[8]){(void)values;abort();}
int mm_profile_wake(void){return 1;}
void mm_profile_redraw(unsigned value){(void)value;}
int mm_profile_file(unsigned write,const char*path,uint8_t*data,unsigned size){
    if(write)++writes;else ++reads;
    unsigned initialized=size==4096&&data[12]==0&&data[13]==0&&data[14]==0&&data[15]==1;
    unsigned metadata=strstr(path,"MIDI4_0.DAT")||strstr(path,"MIDI4_1.DAT");
    unsigned jfile=strstr(path,"MIDI4_J")!=0;
    if(write&&metadata&&initialized&&cut==3)exit(0);
    if(write&&jfile&&data[15]==2&&(cut==4||cut==5)){
        if(cut==5){FILE*f=fopen(path,"wb");if(!f)abort();fwrite(data,1,48,f);fclose(f);}exit(0);
    }
    FILE*f=fopen(path,write?"wb":"rb");if(!f)return write?-1:0;
    unsigned amount=size;
    if(!write){fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);if(n<8||n>(long)size){fclose(f);return -1;}amount=(unsigned)n;memset(data+amount,0,size-amount);}
    unsigned done=write?fwrite(data,1,amount,f):fread(data,1,amount,f);int end=fclose(f);
    if(done!=amount||end)return -1;
    if(write&&jfile&&data[15]==1&&cut==1)exit(0);
    if(write&&metadata&&initialized&&data[11]>=3&&cut==6)exit(0);
    return amount==size?1:2;
}
static void rename_track(const char*text){char*s=mm_profile_edit(0);if(!s)abort();memset(s,0,16);strcpy(s,text);mm_profile_name_changed(s);}
static void drain(void){for(unsigned i=0;i<100&&mt_busy();i++)mm_profile_service();if(!mt_busy())mm_profile_service();}
static void request(void){mt_request();mm_profile_service();drain();}
static void replacement_source(void){
    native[0]=9;native[1]=10;native[2]=0;native_file(1,1024);
    bank=1;char*s=mm_profile_edit(1);if(!s)abort();memset(s,0,16);strcpy(s,"OLD");mm_profile_name_changed(s);
    bank=0;rename_track("NEW");mm_profile_service();
}
int main(int argc,char**argv){
    if(argc<3)return 2;snprintf(root,sizeof root,"%s",argv[1]);native_file(0,1024);
    if(!strcmp(argv[2],"init")){
        mm_profile_service();CHECK(mm_profile_ready());
        strcpy(mt_command,"NO");mm_profile_name_changed(mt_command);CHECK(apply_calls==0);CHECK(mm_profile_status()==11);
        playing=1;request();CHECK(apply_calls==0);playing=0;
        if(argc>3)cut=(unsigned)atoi(argv[3]);
        request();CHECK(mt_initialized());CHECK(mm_profile_status()==7);CHECK(apply_calls==1);
        CHECK(native[0]==1&&native[64]==5&&native[65]==0&&native[128]==12&&native[192]==1);
        for(unsigned b=0;b<16;b++)for(unsigned p=0;p<4;p++)CHECK(!memcmp(native+b*64+p*8,native+b*64+(p+4)*8,8));
        unsigned before=apply_calls;mt_request();CHECK(apply_calls==before);CHECK(mm_profile_status()==18);
        CHECK(mt_runtime_key(0x32,1));CHECK(mm_profile_ready());CHECK(mm_profile_status()==11);
        rename_track("AEDIT");mm_profile_service();bank=2;CHECK(!strcmp(mm_profile_name(0),"BASS"));
    }else if(!strcmp(argv[2],"recover-old")){
        mm_profile_service();drain();CHECK(mm_profile_ready());CHECK(!mt_initialized());
        CHECK(native[0]==1&&native[64]==5&&native[65]==0&&native[128]==12&&native[192]==0);
        mm_profile_service();CHECK(apply_calls==1);CHECK(mm_profile_status()==8);CHECK(persist_calls<=16);CHECK(reloads==1);
        unsigned before=apply_calls;mm_profile_service();CHECK(apply_calls==before);
    }else if(!strcmp(argv[2],"recover-new")){
        mm_profile_service();CHECK(mm_profile_ready());CHECK(mt_initialized());CHECK(apply_calls==0);
        CHECK(native[192]==1);CHECK(apply_calls==0);
    }else if(!strcmp(argv[2],"replace")){
        mm_profile_service();CHECK(mm_profile_ready()&&mt_initialized());
        replacement_source();
        unsigned before=apply_calls;mt_request();CHECK(mt_busy()&&mm_profile_status()==18);
        /* A held YES from before the prompt must not accept it. */
        CHECK(mt_runtime_key(0x31,1));CHECK(apply_calls==before);CHECK(mm_profile_status()==18);
        confirm_keys=1;for(unsigned i=0;i<3;i++)mm_profile_tick(0);CHECK(mm_profile_status()==18);confirm_keys=0;
        mm_profile_tick(0);
        if(argc>3)cut=(unsigned)atoi(argv[3]);
        CHECK(mt_runtime_key(0x31,1));mm_profile_service();drain();
        CHECK(mm_profile_ready()&&mt_initialized());
        if(mm_profile_status()!=7)fprintf(stderr,"replace status=%u failure=%u\n",mm_profile_status(),mt_failure());
        CHECK(mm_profile_status()==7);
        for(unsigned b=0;b<16;b++)for(unsigned p=0;p<8;p++){
            CHECK(native[b*64+p*8]==9&&native[b*64+p*8+1]==10&&native[b*64+p*8+2]==0);
            bank=b;CHECK(!strcmp(mm_profile_name(0),"NEW"));CHECK(!mm_profile_name(1)[0]);
        }
    }else if(!strcmp(argv[2],"replace-recover-old")){
        mm_profile_service();drain();CHECK(mm_profile_ready()&&mt_initialized());
        CHECK(native[0]==9&&native[1]==10&&native[64]==5&&native[192]==1);
        bank=0;CHECK(!strcmp(mm_profile_name(0),"NEW"));bank=1;CHECK(!strcmp(mm_profile_name(0),"LEAD"));
        CHECK(!strcmp(mm_profile_name(1),"OLD"));
    }else if(!strcmp(argv[2],"replace-recover-new")){
        mm_profile_service();drain();CHECK(mm_profile_ready()&&mt_initialized());
        for(unsigned b=0;b<16;b++)for(unsigned p=0;p<8;p++){
            CHECK(native[b*64+p*8]==9&&native[b*64+p*8+1]==10&&native[b*64+p*8+2]==0);
            bank=b;CHECK(!strcmp(mm_profile_name(0),"NEW"));CHECK(!mm_profile_name(1)[0]);
        }
    }else if(!strcmp(argv[2],"replace-cancel")){
        mm_profile_service();CHECK(mt_initialized());replacement_source();mt_request();mm_profile_tick(0);
        CHECK(mt_runtime_key(0x31,1));
        for(unsigned i=0;i<40&&mt_progress()!=201;i++)mm_profile_service();
        CHECK(mt_progress()==201);CHECK(mt_runtime_key(0x32,1));drain();
        CHECK(mm_profile_ready()&&mt_initialized()&&reloads==0&&mm_profile_status()==11);
        native_file(0,1024);CHECK(native[0]==9&&native[64]==5&&native[192]==1);
        bank=1;CHECK(!strcmp(mm_profile_name(0),"LEAD"));
    }else if(!strcmp(argv[2],"restart")){
        mm_profile_service();CHECK(mm_profile_ready());CHECK(mt_initialized());CHECK(apply_calls==0);
        unsigned before_reads=reads,before_writes=writes;
        for(unsigned i=0;i<64;i++){bank=i%16;mm_profile_service();CHECK(mm_profile_ready());}
        CHECK(reads==before_reads&&writes==before_writes&&apply_calls==0);bank=0;
        CHECK(!strcmp(mm_profile_name(0),"AEDIT"));bank=2;CHECK(!strcmp(mm_profile_name(0),"BASS"));bank=0;
        mt_clone_begin();strcpy(project,"COPY");native_file(1,1024);mt_clone_finish();CHECK(mm_profile_status()==2);
        bank=1;rename_track("COPIED");mm_profile_service();
        strcpy(project,"A");mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"LEAD"));CHECK(mt_initialized());
        strcpy(project,"OTHER");native_file(0,1024);mm_profile_service();CHECK(!mm_profile_name(0)[0]);CHECK(!mt_initialized());CHECK(apply_calls==0);
    }else if(!strcmp(argv[2],"failed-save")){
        mm_profile_service();fail_persist=1;request();CHECK(!mm_profile_ready());CHECK(mt_busy());
        CHECK(mt_runtime_key(0x28,1));CHECK(mt_runtime_key(0x2f,1));CHECK(mt_runtime_key(0x2f,0));
        CHECK(!mt_runtime_key(0x27,1)&&!mt_runtime_key(0x27,0));CHECK(mt_runtime_enc(48,4));
        for(int key=0x22;key<=0x26;key++)CHECK(!mt_runtime_key(key,1)&&!mt_runtime_key(key,0));
        modifier=1;CHECK(mt_runtime_key(0x22,1));modifier=0;
        fail_persist=0;mm_profile_service();drain();CHECK(mm_profile_ready());CHECK(!mt_initialized());CHECK(native[192]==0);
        CHECK(!mt_runtime_key(0x2f,1)&&!mt_runtime_enc(48,4));
    }else if(!strcmp(argv[2],"cancel-before-write")){
        mm_profile_service();mt_request();mm_profile_service();CHECK(mt_busy());
        CHECK(mt_progress()==100);CHECK(mt_runtime_key(0x32,1));drain();
        CHECK(mm_profile_ready());CHECK(!mt_initialized());CHECK(persist_calls==0&&apply_calls==0&&reloads==0);
        CHECK(mm_profile_status()==11);
    }else if(!strcmp(argv[2],"cancel-after-bank")){
        mm_profile_service();mt_request();
        for(unsigned i=0;i<40&&mt_progress()!=201;i++)mm_profile_service();
        CHECK(mt_progress()==201);CHECK(mt_runtime_key(0x32,1));drain();
        CHECK(mm_profile_ready()&&!mt_initialized());CHECK(persist_calls==2&&reloads==0);
        CHECK(mm_profile_status()==11);native_file(0,1024);CHECK(native[192]==0);
    }else if(!strcmp(argv[2],"foreign")){
        mm_profile_service();request();CHECK(apply_calls==0);CHECK(!mm_profile_ready());
    }else if(!strcmp(argv[2],"protected-copy")){
        protected=1;mm_profile_service();CHECK(mm_profile_ready());
        rename_track("TEMPLATE");mm_profile_service();CHECK(writes==0);CHECK(mm_profile_status()==15);
        request();CHECK(apply_calls==0);CHECK(mm_profile_status()==15);
        mt_clone_begin();strcpy(project,"COPY");protected=0;mt_clone_finish();CHECK(mm_profile_status()==2);
        CHECK(!strcmp(mm_profile_name(0),"TEMPLATE"));CHECK(!mt_initialized());
        strcpy(project,"A");protected=1;mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"BASS"));
    }else return 2;
    return 0;
}
