/* SPDX-License-Identifier: MIT */
#include "../profile.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
char names_store[8][16];
static char root[260],project[32]="TEMPLATE";
static unsigned bank,playing,fail_write;
extern int mm_template_destination_created(const char *source_directory);
extern unsigned mm_template_clone_count,mm_template_clone_failed;
#define CHECK(c) do {if(!(c)){fprintf(stderr,"line %d: %s\n",__LINE__,#c);return 1;}} while(0)
unsigned mm_profile_bank(void){return bank;}
int mm_profile_directory(char *out,unsigned size){return snprintf(out,size,"%s/%s",root,project)<(int)size;}
int mm_profile_gate(void){return !playing;}
void mm_profile_context(unsigned *b,unsigned *p,uint8_t out[8]){(void)b;(void)p;(void)out;abort();}
void mm_profile_apply(const uint8_t in[8]){(void)in;abort();}
int mm_profile_wake(void){return 1;}
void mm_profile_redraw(unsigned status){(void)status;}
int mm_profile_file(unsigned write,const char *path,uint8_t *data,unsigned size){
    if(write&&fail_write)return -1;
    FILE *f=fopen(path,write?"wb":"rb");if(!f)return write?-1:0;
    unsigned n=write?fwrite(data,1,size,f):fread(data,1,size,f);
    int end=fclose(f);return n==size&&!end?1:-1;
}
static void rename_track(const char *text){char *slot=mm_profile_edit(0);strcpy(slot,text);mm_profile_name_changed(slot);}
int main(int argc,char **argv){
    if(argc!=3)return 2;
    snprintf(root,sizeof root,"%s",argv[1]);
    if(!strcmp(argv[2],"create")){
        char source[300];snprintf(source,sizeof source,"%s/TEMPLATE",root);
        mm_profile_service();rename_track("BASS");mm_profile_service();
        CHECK(mm_template_destination_created(source)==0);CHECK(mm_template_clone_count==0);
        strcpy(project,"COPY");CHECK(mm_template_destination_created(0)==0);
        CHECK(mm_template_destination_created("/wrong-project")==0);
        CHECK(mm_template_destination_created(source)==1);CHECK(mm_template_clone_count==1);
        rename_track("COPYNAME");mm_profile_service();
        strcpy(project,"OTHER");mm_profile_service();CHECK(!mm_profile_name(0)[0]);
        strcpy(project,"TEMPLATE");mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"BASS"));
        strcpy(project,"COLLISION");CHECK(mm_template_destination_created(source)==-1);CHECK(mm_template_clone_failed==1);
        mm_profile_service();CHECK(!mm_profile_name(0)[0]);
        strcpy(project,"TEMPLATE");mm_profile_service();strcpy(project,"FAIL");fail_write=1;
        CHECK(mm_template_destination_created(source)==-1);CHECK(mm_profile_status()==3);
        fail_write=0;mm_profile_service();CHECK(mm_profile_status()==2);
    }else{
        strcpy(project,"COPY");mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"COPYNAME"));
        bank=15;playing=1;mm_profile_service();playing=0;mm_profile_service();
        strcpy(project,"TEMPLATE");mm_profile_service();bank=0;CHECK(!strcmp(mm_profile_name(0),"BASS"));
        strcpy(project,"FAIL");mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"BASS"));
    }
    return 0;
}
