/* SPDX-License-Identifier: MIT
 * Real profile implementation, simulated filesystem/platform. Run each mode
 * in a fresh process so only the project files can preserve state.
 */
#include "profile.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
char names_store[8][16];
static char root[240],project[8]="A";
static unsigned bank,part,fail_write,playing;
unsigned mm_profile_bank(void) {return bank;}
static const char *name(unsigned t) {return mm_profile_name(t);}
static void rename_track(unsigned t,const char *text) {char *slot=mm_profile_edit(t);strcpy(slot,text);mm_profile_name_changed(slot);}
static uint8_t channels[8];
static unsigned failures,writes;
#define CHECK(c) do {if(!(c)){fprintf(stderr,"line %d: %s\n",__LINE__,#c);++failures;}} while(0)
int mm_profile_directory(char *out,unsigned size) {return snprintf(out,size,"%s/%s",root,project)<(int)size;}
int mm_profile_gate(void) {return !playing;}
void mm_profile_context(unsigned *b,unsigned *p,uint8_t out[8]) {*b=bank;*p=part;memcpy(out,channels,8);}
void mm_profile_apply(const uint8_t in[8]) {memcpy(channels,in,8);}
int mm_profile_wake(void) {return 1;}
void mm_profile_redraw(unsigned status) {(void)status;}
int mm_profile_file(unsigned write,const char *path,uint8_t *data,unsigned size) {
    if(write&&fail_write==1)return -1;
    FILE *f=fopen(path,write?"wb":"rb");if(!f)return write?-1:0;
    if(write&&fail_write==2){fwrite(data,1,16,f);fclose(f);return -1;}
    unsigned amount=size;
    if(!write){fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);if(n<8||n>(long)size){fclose(f);return -1;}amount=(unsigned)n;memset(data+amount,0,size-amount);}
    unsigned n=write?fwrite(data,1,size,f):fread(data,1,amount,f);int close=fclose(f);
    if(write)++writes;
    return n==amount&&!close?(amount<size?2:1):-1;
}
static void select_bank(unsigned b) {bank=b;memset(channels,0,8);mm_profile_service();}
int main(int argc,char **argv) {
    if(argc!=3)return 2;
    snprintf(root,sizeof root,"%s",argv[1]);
    if(!strcmp(argv[2],"create")) {
        for(unsigned t=0;t<8;t++)channels[t]=(uint8_t)(t+1);
        mm_profile_service();CHECK(mm_profile_ready());
        for(unsigned t=0;t<8;t++){char label[16];snprintf(label,16,"TRACK%u",t+1);rename_track(t,label);}
        mm_profile_changed();mm_profile_service();CHECK(mm_profile_status()==2);
        select_bank(1);for(unsigned t=0;t<8;t++)CHECK(channels[t]==t+1);
        channels[0]=12;channels[1]=0;rename_track(0,"BANKTWO");rename_track(1,"");mm_profile_service();
        CHECK(!strcmp(name(0),"BANKTWO"));CHECK(!name(1)[0]);
        strcpy(mm_profile_edit(3),"CANCELLED");CHECK(!strcmp(name(3),"TRACK4"));
        select_bank(0);CHECK(!strcmp(name(0),"TRACK1"));CHECK(!strcmp(name(1),"TRACK2"));rename_track(2,"NEW");mm_profile_service();CHECK(channels[0]==1);channels[0]=3;mm_profile_service();
        select_bank(1);CHECK(channels[0]==12&&channels[1]==0);CHECK(!strcmp(name(0),"BANKTWO"));CHECK(!name(1)[0]);CHECK(!strcmp(name(2),"NEW"));
        select_bank(2);CHECK(channels[0]==3&&channels[1]==2);
        part=1;memset(channels,0,8);mm_profile_service();CHECK(channels[0]==3);
        strcpy(project,"B");memset(channels,0,8);mm_profile_service();CHECK(!names_store[0][0]);
        rename_track(0,"OTHER");mm_profile_service();
        strcpy(project,"A");mm_profile_service();CHECK(!strcmp(names_store[0],"TRACK1"));
    } else if(!strcmp(argv[2],"restart")) {
        mm_profile_service();for(unsigned t=0;t<8;t++) {char want[16];snprintf(want,sizeof want,"TRACK%u",t+1);CHECK(!strcmp(name(t),t==2?"NEW":want));}
        CHECK(channels[0]==3);select_bank(1);CHECK(channels[0]==12&&channels[1]==0);CHECK(!strcmp(name(0),"BANKTWO"));CHECK(!name(1)[0]);CHECK(!strcmp(name(2),"NEW"));
        select_bank(0);rename_track(0,"UNSAVED");fail_write=1;mm_profile_service();CHECK(mm_profile_status()==3);
    } else if(!strcmp(argv[2],"fallback")) {
        mm_profile_service();CHECK(!strcmp(names_store[0],"TRACK1"));
        playing=1;rename_track(0,"PENDING");unsigned before=writes;mm_profile_service();CHECK(writes==before);
        playing=0;mm_profile_service();CHECK(mm_profile_status()==2);
    } else if(!strcmp(argv[2],"pending")) {
        mm_profile_service();CHECK(!strcmp(names_store[0],"PENDING"));
    } else if(!strcmp(argv[2],"shorten")) {
        mm_profile_service();rename_track(0,"S");mm_profile_service();CHECK(mm_profile_status()==2);
    } else if(!strcmp(argv[2],"shortened")) {
        mm_profile_service();CHECK(!strcmp(names_store[0],"S"));
    } else if(!strcmp(argv[2],"torn")) {
        mm_profile_service();rename_track(0,"BROKEN");fail_write=2;mm_profile_service();CHECK(mm_profile_status()==3);
    } else if(!strcmp(argv[2],"recovered")) {
        mm_profile_service();CHECK(!strcmp(names_store[0],"S"));
        rename_track(0,"REPAIRED");mm_profile_service();CHECK(mm_profile_status()==2);
    } else if(!strcmp(argv[2],"repaired")) {
        mm_profile_service();CHECK(!strcmp(names_store[0],"REPAIRED"));
    } else if(!strcmp(argv[2],"migration")) {
        mm_profile_service();CHECK(!strcmp(name(0),"LEGACY1"));
        select_bank(1);CHECK(channels[0]==12&&channels[1]==0);CHECK(!strcmp(name(0),"LEGACY1"));rename_track(0,"LOCAL");mm_profile_service();
        select_bank(0);CHECK(!strcmp(name(0),"LEGACY1"));
    } else if(!strcmp(argv[2],"migrated")) {
        mm_profile_service();CHECK(!strcmp(name(0),"LEGACY1"));select_bank(1);CHECK(!strcmp(name(0),"LOCAL"));
        part=1;mm_profile_service();CHECK(!strcmp(name(0),"LOCAL"));
    } else if(!strcmp(argv[2],"foreign")) {
        mm_profile_service();CHECK(mm_profile_status()==3);CHECK(writes==0);
    } else return 2;
    if(failures)return 1;
    puts(argv[2]);return 0;
}
