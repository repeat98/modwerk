/* SPDX-License-Identifier: MIT
 * Actual independent controller and grid engine against the shared service.
 * Authored source metadata only; not a stock-menu or hardware qualification.
 */
#include "sample_editor_service.h"
#include "modwerk_module.h"
#include <stdio.h>
#include <string.h>
#include <limits.h>
#define CHECK(x) do {if(!(x)){printf("FAIL line %u\n",(unsigned)__LINE__);return 1;}}while(0)
void bs_device_open(uint32_t,const struct modwerk_sample_editor_api *);
void module_tick(struct modwerk_runtime_api *);
void module_draw(unsigned char *);
int module_key(int,int);
int module_enc(int,int);
static struct mw_sample_editor service;
static struct mw_sample_capture source;
static struct runtime_owner owner;
static unsigned ready=1,held,bad,confirms,cancels,publishes,block_confirm,copies;
static uint32_t lock(void *p){(void)p;if(held)bad=1;held=1;return 7;}
static void unlock(void *p,uint32_t saved){(void)p;if(!held || saved!=7)bad=1;held=0;}
static int available(void *p){(void)p;return ready;}
static int published(void *p,const struct runtime_owner *o){(void)p;return o->generation==owner.generation;}
static unsigned capture(void *p,struct mw_sample_capture *out){(void)p;*out=source;return MODWERK_SAMPLE_OK;}
static unsigned publish(void *p,const struct mw_sample_capture *before,const struct mw_sample_edit *edit)
{
    (void)p;if(!held || memcmp(before,&source,sizeof source))bad=1;
    if(source.view.count==edit->count &&
       !memcmp(source.view.records,edit->records,sizeof edit->records))
        return MODWERK_SAMPLE_NO_CHANGE;
    ++publishes;source.view.count=edit->count;
    memcpy(source.view.records,edit->records,sizeof edit->records);return MODWERK_SAMPLE_APPLIED;
}
static unsigned copy(uint32_t token,struct modwerk_sample_view *out)
{++copies;return mw_sample_editor_copy(&service,token,out);}
static unsigned confirm(uint32_t token,const struct modwerk_sample_grid *grid)
{
    ++confirms;
    if(block_confirm){ready=0;block_confirm=0;}
    return mw_sample_editor_replace(&service,token,grid);
}
static void cancel(uint32_t token){++cancels;mw_sample_editor_cancel(&service,token);}
static const struct mw_sample_backend backend={0,lock,unlock,available,published,capture,publish};
static const struct modwerk_sample_editor_api api={MODWERK_SAMPLE_EDITOR_ABI,sizeof api,copy,confirm,cancel,confirm};
static void draw(unsigned char *frame)
{memset(frame,0x5a,1024);module_draw(frame);}
static int active(void)
{struct modwerk_runtime_api runtime={0};module_tick(&runtime);return !!(runtime.value&0x100);}
static int tap(int code)
{return module_key(code,1) && module_key(code,0);}
static int select_spacing(unsigned index)
{return module_enc(1,-127) && (!index || module_enc(1,(int)index*4));}
int main(void)
{
    uint32_t token;
    CHECK(mw_sample_editor_init(&service,&backend));owner.generation=1;
    source.view.frames=source.view.trim_end=88200;source.view.frame_rate=44100;
    source.view.sample_bpm24=2880;source.view.project_bpm24=2160;
    for(unsigned source_index=0;source_index<4;++source_index) {
        unsigned kind=source_index?1u:0u;
        source.view.slot=source_index<2?0u:source_index==2?128u:135u;
        source.view.kind=kind;source.view.count=0;
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(active());
        unsigned char guarded[1026];memset(guarded,0xa5,sizeof guarded);
        draw(guarded+1);
        CHECK(guarded[1]==0x5a && guarded[1024]==0x5a);
        CHECK(guarded[0]==0xa5 && guarded[1025]==0xa5);
        CHECK(memcmp(guarded+1,guarded+2,1023)!=0 && !publishes);
        for(unsigned x=0;x<128;++x)for(unsigned y=0;y<64;++y)
            if(x<3 || x>=125 || y<1 || y>=63) {
                unsigned bit=1u<<(y%8u);
                CHECK((guarded[1+x*8u+7u-y/8u]&bit)==(0x5au&bit));
            }
        unsigned previous=confirms;
        CHECK(tap(0x31) && confirms==previous+1 && !active());
        CHECK(service.state==MW_SAMPLE_PROMPT && !publishes);
        CHECK(!module_key(0x31,1)); /* package no longer owns stock YES */
        CHECK(mw_sample_editor_answer(&service,token,0)==MODWERK_SAMPLE_NO_CHANGE);
        CHECK(source.view.count==0 && !publishes);
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(tap(0x31));
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
        CHECK(source.view.count==4 && source.view.records[1].start==22050);
        /* Existing exact records are accepted with unchanged ordinals. */
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(tap(0x32) && !active() && service.state==MW_SAMPLE_CLOSED);
        publishes=0;
    }
    source.view.slot=0;source.view.count=0;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);
    unsigned copied=copies;
    unsigned char initial_frame[1024],idle_frame[1024];draw(initial_frame);
    ready=0;
    for(unsigned tick=0;tick<120;++tick)CHECK(active());
    draw(idle_frame);
    CHECK(copies==copied && !memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(module_enc(1,4) && module_enc(1,-4));
    CHECK(module_enc(0,4) && module_enc(0,-4));
    CHECK(copies==copied); /* settings use the opening snapshot too */
    for(int encoder=2;encoder<6;++encoder)CHECK(module_enc(encoder,4) && active());
    draw(idle_frame);CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    /* Fine encoder pulses accumulate; a complete step or arrow changes once. */
    CHECK(module_enc(1,1) && module_enc(1,1) && module_enc(1,1));
    draw(idle_frame);CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(module_enc(1,1));draw(idle_frame);
    CHECK(memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(module_enc(1,-4));draw(idle_frame);
    CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(tap(0x33));draw(idle_frame);
    CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(tap(0x20));draw(idle_frame);
    CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(module_enc(0,INT_MAX) && module_enc(0,INT_MIN));
    CHECK(module_enc(1,INT_MAX) && module_enc(1,INT_MIN));
    draw(idle_frame);
    CHECK(!memcmp(initial_frame,idle_frame,sizeof initial_frame));
    CHECK(copies==copied);
    ready=1;CHECK(tap(0x32));
    source.view.count=0;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    ready=0;bs_device_open(token,&api);CHECK(active());
    unsigned previous=confirms;
    CHECK(tap(0x31) && confirms==previous && active() && !publishes);
    /* YES waits for a genuinely ready source instead of requiring a second
     * button press at an unknowable gap between display-reader jobs. */
    ready=1;CHECK(!active() && service.state==MW_SAMPLE_PROMPT);
    CHECK(confirms==previous+1 && !publishes);
    mw_sample_editor_answer(&service,token,0);
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);CHECK(active());previous=confirms;
    CHECK(module_enc(1,4) && module_enc(1,-4));
    CHECK(module_enc(0,4) && module_enc(0,-4));
    CHECK(tap(0x31) && confirms==previous+1 && service.state==MW_SAMPLE_PROMPT);
    mw_sample_editor_answer(&service,token,0);
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);++source.controls[5];
    CHECK(active()); /* snapshot stays visible; explicit YES must reject it */
    CHECK(tap(0x31) && !active() && service.state==MW_SAMPLE_CLOSED && !publishes);
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);previous=cancels;
    CHECK(!module_key(0x30,1) && !active() && cancels==previous+1);
    CHECK(!module_enc(0,4) && !module_key(0x30,0));
    CHECK(!held && !bad && !publishes);
    /* A job can start between copy and confirm. Only a fresh copy on a later
     * tick may retry; cancellation, edits and stale source retire that intent. */
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);block_confirm=1;previous=confirms;
    CHECK(tap(0x31) && active() && confirms==previous+1);
    ready=1;CHECK(!active() && service.state==MW_SAMPLE_PROMPT && confirms==previous+2);
    mw_sample_editor_answer(&service,token,0);
    for(unsigned reason=0;reason<3;++reason) {
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);ready=0;previous=confirms;
        CHECK(tap(0x31) && active() && confirms==previous);
        if(reason==0)CHECK(tap(0x32));
        if(reason==1)CHECK(module_enc(1,4));
        if(reason==2)++source.controls[5];
        ready=1;
        if(reason==1) {
            CHECK(active() && service.state==MW_SAMPLE_OPEN);
            CHECK(module_enc(1,-4) && tap(0x32));
        } else CHECK(!active() && service.state==MW_SAMPLE_CLOSED);
        CHECK(confirms==previous && !publishes);
    }
    /* Independent rational values at 122 BPM, four beats per boundary.
     * The 49th mathematical start is 4,164,197: a tiny file tail must not
     * create a new stock-invalid slice or masquerade as an old-slice clash. */
    for(unsigned kind=0;kind<2;++kind)for(uint32_t tail=1;tail<=64;tail+=(tail==1?62:1)) {
        source.view.kind=kind;source.view.count=0;
        source.view.sample_bpm24=2928;
        source.view.frames=source.view.trim_end=4164197u+tail;
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);
        if(kind==0 && tail==1)CHECK(select_spacing(2));
        CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT);
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
        uint32_t n=tail<64?48:49;
        CHECK(source.view.count==n && source.view.records[1].start==86754u);
        CHECK(source.view.records[n-1u].end==4164197u+tail);
        if(tail<64)CHECK(source.view.records[n-1u].start==4077443u);
    }
    /* A rejected 65th start near the end must not hide a valid 64-slice grid. */
    source.view.count=0;source.view.frames=source.view.trim_end=5552264u;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT);
    CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
    CHECK(source.view.count==64 && source.view.records[63].end==5552264u);
    /* Four bars is sixteen quarter-note beats: the same 49-point tail case. */
    source.view.count=0;source.view.frames=source.view.trim_end=16656797u;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);CHECK(select_spacing(3));
    CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT);
    CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
    CHECK(source.view.count==48 && source.view.records[1].start==347016u);
    CHECK(source.view.records[47].start==16309770u && source.view.records[47].end==16656797u);
    /* Existing short-tail markers may be replaced only after stock YES. */
    source.view.count=1;source.view.records[0].start=source.view.trim_end-1u;
    source.view.records[0].end=source.view.trim_end;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);previous=confirms;
    CHECK(tap(0x31) && !active() && service.state==MW_SAMPLE_PROMPT && confirms==previous+1);
    CHECK(mw_sample_editor_answer(&service,token,0)==MODWERK_SAMPLE_NO_CHANGE);
    CHECK(source.view.count==1 && source.view.records[0].start==source.view.trim_end-1u);
    source.view.count=0;source.view.frames=100;source.view.trim_start=90;source.view.trim_end=100;
    CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
    bs_device_open(token,&api);previous=confirms;
    CHECK(tap(0x31) && active() && confirms==previous && tap(0x32));
    for(uint32_t frames=1;frames<=32;frames+=31) {
        source.view.count=0;source.view.frames=source.view.trim_end=frames;source.view.trim_start=0;
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT);
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
        CHECK(source.view.count==1 && source.view.records[0].start==0 && source.view.records[0].end==frames);
    }
    /* Repeat clearing/replacement at every supported step on both source
     * kinds. Inject busy AFTER stock confirmation, then release or cancel. */
    for(unsigned kind=0;kind<2;++kind)for(unsigned run=0;run<50;++run) {
        source.view.kind=kind;source.view.frames=source.view.trim_end=88200;
        source.view.trim_start=0;source.view.sample_bpm24=2880;
        if(run%2==0)source.view.count=0; /* stock DELETE ALL SLICES */
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(active());CHECK(select_spacing(run%6));
        unsigned before_count=source.view.count,before_writes=publishes;
        CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT && service.replacing);
        ready=0;
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_BUSY);
        CHECK(service.state==MW_SAMPLE_PROMPT && publishes==before_writes && source.view.count==before_count);
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_BUSY);
        ready=1;
        if(run%3==0) {
            CHECK(mw_sample_editor_answer(&service,token,0)==MODWERK_SAMPLE_NO_CHANGE);
            CHECK(publishes==before_writes && source.view.count==before_count);
        } else {
            unsigned changed=source.view.count!=service.edit.count ||
                memcmp(source.view.records,service.edit.records,sizeof service.edit.records);
            CHECK(mw_sample_editor_answer(&service,token,1)==
                (changed?MODWERK_SAMPLE_APPLIED:MODWERK_SAMPLE_NO_CHANGE));
            CHECK(source.view.count>=1 && source.view.count<=4 && publishes==before_writes+!!changed);
        }
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_STALE);
    }
    /* Long 122-BPM material: change 48 -> 24 -> 12 slices, then refuse
     * the three grids exceeding 64. Repeat after stock clearing and replacement. */
    for(unsigned kind=0;kind<2;++kind)for(unsigned run=0;run<20;++run) {
        source.view.kind=kind;
        source.view.frames=source.view.trim_end=16656797u;
        source.view.sample_bpm24=2928;
        if(run%2==0)source.view.count=0;
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(select_spacing((run%6+3)%6));
        unsigned before_writes=publishes;
        CHECK(tap(0x31));
        if(run%6<3) {
            CHECK(service.state==MW_SAMPLE_PROMPT && !active());
            ready=0;CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_BUSY);
            ready=1;CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
            CHECK(source.view.count==(48u>>(run%6)) && publishes==before_writes+1);
        } else {
            CHECK(active() && service.state==MW_SAMPLE_OPEN && publishes==before_writes);
            CHECK(tap(0x32));
        }
    }
    for(unsigned slot=128;slot<136;++slot)for(unsigned placeholders=0;placeholders<=8;placeholders+=8) {
        source.view.kind=MODWERK_SAMPLE_FLEX;source.view.slot=slot;
        source.view.frames=source.view.trim_start=source.view.trim_end=source.view.count=0;
        source.view.count=placeholders;
        for(unsigned i=0;i<placeholders;++i) {
            source.view.records[i].start=source.view.records[i].end=0;
            source.view.records[i].loop=UINT32_MAX;
        }
        struct modwerk_slice_record before[64];memcpy(before,source.view.records,sizeof before);
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(active());
        unsigned previous=confirms;
        unsigned previous_writes=publishes;
        CHECK(tap(0x31));
        if(!placeholders) {
            CHECK(confirms==previous && active());
            struct modwerk_runtime_api runtime={0};module_tick(&runtime);
            CHECK(!(runtime.value&0x200));
            CHECK(service.state==MW_SAMPLE_OPEN && publishes==previous_writes);
            CHECK(tap(0x32));
        } else {
            CHECK(confirms==previous+1 && !active());
            CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
            CHECK(publishes==previous_writes+1);
        }
        CHECK(!source.view.count && !memcmp(before,source.view.records,sizeof before));
    }
    /* Encoder B visits 1 -> 2 -> 4 and back to 2. Confirm independent
     * two-beat deadlines for both tempo sources and all supported kinds. */
    for(unsigned source_index=0;source_index<4;++source_index)for(unsigned project=0;project<2;++project) {
        source.view.kind=source_index?MODWERK_SAMPLE_FLEX:MODWERK_SAMPLE_STATIC;
        source.view.slot=source_index<2?0u:source_index==2?128u:135u;
        source.view.count=source.view.trim_start=0;
        source.view.frames=source.view.trim_end=176400;
        source.view.sample_bpm24=2880;source.view.project_bpm24=2160;
        CHECK(mw_sample_editor_begin(&service,&owner,&token)==MODWERK_SAMPLE_OK);
        bs_device_open(token,&api);CHECK(select_spacing(0));
        CHECK(module_enc(1,4) && module_enc(1,4) && module_enc(1,-4));
        CHECK(module_enc(0,-127));if(project)CHECK(module_enc(0,4));
        CHECK(tap(0x31) && service.state==MW_SAMPLE_PROMPT);
        CHECK(mw_sample_editor_answer(&service,token,1)==MODWERK_SAMPLE_APPLIED);
        uint32_t interval=project?58800u:44100u,count=project?3u:4u;
        CHECK(source.view.count==count);
        for(uint32_t i=0;i<count;++i) {
            CHECK(source.view.records[i].start==i*interval);
            CHECK(source.view.records[i].end==(i+1u<count?(i+1u)*interval:176400u));
            CHECK(source.view.records[i].loop==UINT32_MAX);
        }
    }
    /* Once confirmation closes the popup, manual slice keys and encoder
     * input must pass through. Idle callbacks must not recapture or mutate
     * the completed recorder's first slice (or any other source metadata). */
    struct mw_sample_capture idle_source=source;
    unsigned idle_copies=copies,idle_confirms=confirms,idle_cancels=cancels,idle_publishes=publishes;
    unsigned char closed_frame[1024],closed_before[1024];
    memset(closed_frame,0x5a,sizeof closed_frame);memcpy(closed_before,closed_frame,sizeof closed_frame);
    CHECK(!active() && source.view.slot==135 && source.view.records[0].start==0 &&
          source.view.records[0].end==58800);
    ready=0;
    for(unsigned tick=0;tick<32;++tick){CHECK(!active());module_draw(closed_frame);}
    for(int code=0;code<64;++code)CHECK(!module_key(code,1) && !module_key(code,0));
    for(int encoder=0;encoder<6;++encoder)CHECK(!module_enc(encoder,4));
    ready=1;
    CHECK(!memcmp(&idle_source,&source,sizeof source) &&
          !memcmp(closed_before,closed_frame,sizeof closed_frame));
    CHECK(copies==idle_copies && confirms==idle_confirms && cancels==idle_cancels && publishes==idle_publishes);
    CHECK(!held && !bad);
    puts("PASS: actual controller/grid, frame bounds and shared confirmation for Flex/Static/recorders");return 0;
}
