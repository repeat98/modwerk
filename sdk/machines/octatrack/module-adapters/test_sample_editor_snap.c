/* SPDX-License-Identifier: MIT
 * Exercises the actual service and search state machine, with an authored
 * pair reader. Native reader/stock parity is qualified separately.
 */
#include "test_sample_editor_service.c"
#include <stdio.h>
static uint32_t reads,mode,change_on_read,fail_on_read;
static int pair(void *context,const struct mw_sample_capture *before,uint32_t at,
                int32_t *left,int32_t *right)
{
    if(context!=&editor || !held || before!=&editor.before || at+1u>=source.view.frames)bad=1;
    ++reads;
    if(change_on_read && reads==change_on_read)++source.controls[5];
    if(fail_on_read && reads==fail_on_read)return 0;
    for(unsigned j=0;j<2u;++j) {
        uint32_t frame=at+j;
        int32_t sample=mode==0?0:65536;
        if(mode==2)sample=((frame+3u)/200u)%2u?65536:-65536;
        if(mode==3)sample=frame<803u?65536:-65536;
        if(mode==4)sample=frame%200u==0u?0:65536;
        left[j]=sample;right[j]=sample;
        if(mode==5) {
            left[j]=((frame+196u)/200u)%2u?65536:-65536;
            right[j]=((frame+194u)/200u)%2u?65536:-65536;
        }
    }
    return 1;
}
static const struct mw_sample_backend snap_backend={&editor,lock,unlock,available,published,capture,publish,pair};
static void setup(uint32_t format,uint32_t signal)
{
    reset(1,0,0);editor.backend=&snap_backend;
    source.controls[0]=format;source.channels=3;
    source.view.frames=1024;source.view.trim_end=800;
    reads=change_on_read=fail_on_read=0;mode=signal;
}
static unsigned drain(void)
{
    unsigned result=MODWERK_SAMPLE_ANALYZING;
    for(unsigned step=0;result==MODWERK_SAMPLE_ANALYZING && step<4096u;++step) {
        uint32_t before=reads;result=mw_sample_editor_analyze_step(&editor);
        if(reads-before>MW_SNAP_STEP_PAIRS)bad=1;
    }
    return result;
}
static unsigned scenarios(void)
{
    struct modwerk_sample_grid grid={4,{0,200,400,600}};
    uint32_t token;
    for(unsigned format=0;format<4;++format)for(unsigned signal=0;signal<5;++signal) {
        setup(format,signal);struct mw_sample_capture before;bytes(&before,&source,sizeof before);
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_replace_options(&editor,token,&grid,MODWERK_SAMPLE_SNAP_ZERO)==MODWERK_SAMPLE_CONFIRMING);
        CHECK(!reads && !publishes && equal(&source,&before,sizeof before));
        CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_ANALYZING && !reads);
        CHECK(drain()==MODWERK_SAMPLE_APPLIED && publishes==1 && !bad && !held);
        uint32_t expected[5]={0,200,400,600,800};
        if(signal==0 || signal==4)for(unsigned i=1;i<5;++i)--expected[i];
        if(signal==2)for(unsigned i=1;i<5;++i)expected[i]-=4u;
        if(signal==3)expected[4]=802;
        for(unsigned i=0;i<4;++i)CHECK(source.view.records[i].start==expected[i] &&
            source.view.records[i].end==expected[i+1] && source.view.records[i].loop==UINT32_MAX);
        for(unsigned i=4;i<64;++i)CHECK(equal(&source.view.records[i],&before.view.records[i],12));
        CHECK(mw_sample_editor_analyze_step(&editor)==MODWERK_SAMPLE_STALE && publishes==1);
    }
    for(unsigned format=0;format<4;++format)for(unsigned channels=1;channels<=3;++channels) {
        setup(format,5);source.channels=channels;
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_replace_options(&editor,token,&grid,1)==MODWERK_SAMPLE_CONFIRMING);
        CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_ANALYZING);
        CHECK(drain()==MODWERK_SAMPLE_APPLIED && !bad);
        unsigned shift=(format&1u)&&channels==2u?5u:3u;
        CHECK(!source.view.records[0].start);
        for(unsigned i=0;i<4;++i)CHECK(source.view.records[i].end==200u*(i+1u)+shift);
    }
    setup(3,0);source.view.frames=320;source.view.trim_end=256;
    grid.starts[1]=64;grid.starts[2]=128;grid.starts[3]=192;
    CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
    CHECK(mw_sample_editor_replace_options(&editor,token,&grid,1)==MODWERK_SAMPLE_CONFIRMING);
    CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_ANALYZING);
    CHECK(drain()==MODWERK_SAMPLE_ANALYSIS_FAILED && !publishes && !bad);
    grid.starts[1]=200;grid.starts[2]=400;grid.starts[3]=600;
    /* No confirmation, NO, cancel, source mutation, retirement and transient
     * BUSY must not produce a scan/publication from the old intent. */
    for(unsigned action=0;action<7;++action) {
        setup(3,0);struct mw_sample_capture before;bytes(&before,&source,sizeof before);
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_replace_options(&editor,token,&grid,1)==MODWERK_SAMPLE_CONFIRMING);
        if(action==0)CHECK(mw_sample_editor_answer(&editor,token,0)==MODWERK_SAMPLE_NO_CHANGE);
        else {
            CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_ANALYZING);
            if(action==1)mw_sample_editor_cancel(&editor,token);
            if(action==2)change_on_read=2;
            if(action==3)owner_live=0;
            if(action==4)mw_sample_editor_retire_locked(&editor,&owner);
            if(action==5){ready=0;CHECK(mw_sample_editor_analyze_step(&editor)==MODWERK_SAMPLE_BUSY && !reads);mw_sample_editor_cancel(&editor,token);ready=1;}
            if(action==6){fail_on_read=2;CHECK(drain()==MODWERK_SAMPLE_ANALYSIS_FAILED);}
            else CHECK(drain()!=MODWERK_SAMPLE_APPLIED);
        }
        CHECK(!publishes && !bad && equal(source.view.records,before.view.records,sizeof source.view.records));
    }
    setup(1,1);source.view.frames=100000;source.view.trim_end=80000;
    grid.starts[1]=20000;grid.starts[2]=40000;grid.starts[3]=60000;
    CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
    CHECK(mw_sample_editor_replace_options(&editor,token,&grid,1)==MODWERK_SAMPLE_CONFIRMING);
    CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_ANALYZING);
    CHECK(drain()==MODWERK_SAMPLE_ANALYSIS_LIMIT && reads==MW_SNAP_READ_LIMIT && !publishes && !bad);
    mw_sample_editor_cancel(&editor,token);
    CHECK(editor.completion==MODWERK_SAMPLE_ANALYSIS_LIMIT && editor.state==MW_SAMPLE_CLOSED);
    return 0;
}
int main(void)
{
    unsigned line=scenarios();if(line){printf("FAIL line %u\n",line);return 1;}
    puts("PASS: bounded SNAP service, stock valid-grid expectations, errors/cancel/retirement, exact old rows");return 0;
}
