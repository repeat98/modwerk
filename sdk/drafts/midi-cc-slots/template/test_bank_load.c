/* SPDX-License-Identifier: MIT
 * Real profile engine and event adapter; reuse the real-file platform fixture.
 * Inspect the entire cached state, not a reimplementation of its transitions.
 */
#define main original_profile_fixture_main
#define mm_profile_gate original_profile_fixture_gate
#define mm_profile_wake original_profile_fixture_wake
#include "test_profile.c"
#undef mm_profile_gate
#undef mm_profile_wake
#undef main
static unsigned card_pending,wake_calls;
int mm_profile_wake(void){++wake_calls;return 1;}
int mm_profile_gate(void){return !playing&&!card_pending;}
#include "profile.c"
#include "bank_load.c"

static uint32_t hash_bytes(uint32_t h,const void *p,unsigned n){
    const unsigned char *b=p;while(n--){h^=*b++;h*=16777619u;}return h;
}
static uint32_t cached_state(void){
    unsigned flags[]={generation,jsequence,loaded,dirty,pending_wake,redraw,status,ticks,revision,
        peer,jpeer,busy,requested,recovery,damaged,clone_ready,finishing,step,cursor,cancelled,
        rollback_reload,failure,confirming,confirm_armed,replacing};
    uint32_t h=2166136261u;
    h=hash_bytes(h,&state,sizeof state);h=hash_bytes(h,names_store,sizeof names_store);
    h=hash_bytes(h,journal,sizeof journal);h=hash_bytes(h,desired,sizeof desired);
    h=hash_bytes(h,directory,sizeof directory);h=hash_bytes(h,requested_directory,sizeof requested_directory);
    h=hash_bytes(h,clone_directory,sizeof clone_directory);
    return hash_bytes(h,flags,sizeof flags);
}
static int seed_profiles(void){
    mm_profile_service();CHECK(mm_profile_ready());rename_track("BASS");mm_profile_service();
    strcpy(project,"B");native_file(0,1024);mm_profile_service();
    CHECK(mm_profile_ready());rename_track("LEAD");mm_profile_service();
    strcpy(project,"A");native_file(0,1024);mm_profile_service();
    CHECK(mm_profile_ready()&&!strcmp(mm_profile_name(0),"BASS"));
    mt_clone_begin();CHECK(clone_ready);return 0;
}
int main(int argc,char **argv){
    if(argc!=3)return 2;
    snprintf(root,sizeof root,"%s",argv[1]);native_file(0,1024);CHECK(!seed_profiles());
    unsigned mask;uint32_t caller;
    if(!strcmp(argv[2],"failed")||!strcmp(argv[2],"dirty-failed")){
        if(!strcmp(argv[2],"dirty-failed"))rename_track("UNSAVED");
        const char *name=dirty?"UNSAVED":"BASS";
        uint32_t before=cached_state();unsigned r=reads,w=writes;
        /* Target path may be visible while stock is working. Neither event
         * receives a success result. Model a failed attempt that rolls the path
         * back before the engine command gate opens again. */
        strcpy(project,"B");mt_bank_load(0xffff,0x400853deu);
        mm_profile_service();CHECK(cached_state()==before&&reads==r&&writes==w);
        CHECK(mt_bank_loaded()==0);CHECK(cached_state()==before);
        card_pending=1;mm_profile_service();CHECK(cached_state()==before&&reads==r&&writes==w);
        strcpy(project,"A");card_pending=0;mm_profile_service();
        CHECK(!strcmp(mm_profile_name(0),name)&&clone_ready&&mm_profile_ready());
        if(!strcmp(argv[2],"failed"))CHECK(cached_state()==before&&reads==r&&writes==w);
        else CHECK(!dirty&&writes>w); /* Normal dirty autosave resumes to A. */
    }else if(!strcmp(argv[2],"same-project")){
        uint32_t before=cached_state();unsigned r=reads,w=writes;
        mt_bank_load(0xffff,0x400853deu);CHECK(mt_bank_loaded()==0);mm_profile_service();
        CHECK(cached_state()==before&&reads==r&&writes==w);
    }else if(!strcmp(argv[2],"changed-project")){
        unsigned r=reads,w=writes,a=apply_calls;
        mt_bank_load(0xffff,0x400853deu);strcpy(project,"B");
        mm_profile_service();CHECK(!strcmp(mm_profile_name(0),"BASS")&&reads==r&&writes==w);
        CHECK(mt_bank_loaded()==0);CHECK(!strcmp(mm_profile_name(0),"BASS"));
        card_pending=1;mm_profile_service();CHECK(reads==r&&writes==w);card_pending=0;
        native_file(0,1024);mm_profile_service();
        CHECK(mm_profile_ready()&&!strcmp(mm_profile_name(0),"LEAD")&&!clone_ready);
        CHECK(reads>r&&writes==w&&apply_calls==a);r=reads;
        mm_profile_service();CHECK(reads==r); /* Exactly one profile load. */
    }else if(!strcmp(argv[2],"failed-recovery")){
        fail_persist=1;request();CHECK(recovery&&busy&&!mm_profile_ready());
        uint32_t before=cached_state();unsigned r=reads,w=writes;
        unsigned old_step=step,old_cursor=cursor,old_sequence=jsequence;
        mt_bank_load(0xffff,0x400853deu);strcpy(project,"B");mm_profile_service();
        CHECK(cached_state()==before&&reads==r&&writes==w);
        CHECK(mt_bank_loaded()==0);CHECK(cached_state()==before);
        strcpy(project,"A");mm_profile_service();
        CHECK(recovery&&busy&&step==old_step&&cursor==old_cursor&&jsequence==old_sequence);
        CHECK(!strcmp(mm_profile_name(0),"BASS")&&writes==w&&clone_ready);
        fail_persist=0;drain();CHECK(mm_profile_ready()&&!mt_initialized());
        CHECK(!strcmp(mm_profile_name(0),"BASS")); /* Recovery can still finish. */
    }else if(!strcmp(argv[2],"queued-change")){
        unsigned r=reads,w=writes;wake_calls=0;
        mt_bank_load(0xffff,0x400853deu);strcpy(project,"B");
        CHECK(mt_bank_loaded()==0&&mt_bank_load_pending());
        mm_profile_tick(0);CHECK(wake_calls==1&&pending_wake);
        mm_profile_tick(0);CHECK(wake_calls==1); /* No duplicate queue entry. */
        card_pending=1;mm_profile_service();
        CHECK(reads==r&&writes==w&&!strcmp(mm_profile_name(0),"BASS"));
        mm_profile_tick(0);CHECK(wake_calls==2&&pending_wake);
        card_pending=0;mm_profile_service();
        CHECK(!mt_bank_load_pending()&&mm_profile_ready());
        CHECK(!strcmp(mm_profile_name(0),"LEAD")&&reads>r&&writes==w);
        mm_profile_tick(0);CHECK(wake_calls==2);
    }else if(!strcmp(argv[2],"caller-context")){
        uint32_t before=cached_state();
        mt_bank_load(0xa55a,0x400853deu);mt_bank_load(2,0x40085458u);
        CHECK(mt_bank_loaded()==0&&mt_bank_load_active());
        CHECK(!mt_bank_take_completed(&mask,&caller));
        mm_profile_service();CHECK(cached_state()==before);
        CHECK(mt_bank_loaded()==0&&!mt_bank_load_active());
        CHECK(mt_bank_take_completed(&mask,&caller)&&mask==0xa55a&&caller==0x400853deu);
        CHECK(!mt_bank_take_completed(&mask,&caller));
        mt_bank_load(4,0x40085458u);CHECK(mt_bank_loaded()==0);
        CHECK(!mt_bank_take_completed(&mask,&caller));
        CHECK(mt_bank_loaded()==0);CHECK(!mt_bank_take_completed(&mask,&caller));
        mm_profile_service();CHECK(cached_state()==before);
    }else if(!strcmp(argv[2],"overflow")){
        uint32_t before=cached_state();
        mt_bank_load(0x1234,0x400853deu);
        for(unsigned i=0;i<8;i++)mt_bank_load(1u<<i,0x40085458u);
        for(unsigned i=0;i<8;i++){
            CHECK(mt_bank_loaded()==0&&mt_bank_load_active());
            CHECK(!mt_bank_take_completed(&mask,&caller));
        }
        CHECK(mt_bank_loaded()==0&&!mt_bank_load_active());
        CHECK(mt_bank_take_completed(&mask,&caller)&&mask==0x1234&&caller==0x400853deu);
        CHECK(cached_state()==before);
    }else return 2;
    return 0;
}
