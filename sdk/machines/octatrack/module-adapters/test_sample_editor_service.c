/* SPDX-License-Identifier: MIT */
#include "sample_editor_service.h"
#define CHECK(x) do {if(!(x))return __LINE__;}while(0)
static struct mw_sample_editor editor;
static struct mw_sample_capture source;
static struct runtime_owner owner;
static uint32_t held,ready,owner_live,publishes,publish_reply,bad;
static int equal(const void *,const void *,uint32_t);
static uint32_t lock(void *context)
{if(context!=&editor || held)bad=1;held=1;return 123;}
static void unlock(void *context,uint32_t saved)
{if(context!=&editor || !held || saved!=123)bad=1;held=0;}
static int available(void *context)
{if(context!=&editor || !held)bad=1;return (int)ready;}
static int published(void *context,const struct runtime_owner *value)
{
    if(context!=&editor || !held)bad=1;
    return owner_live && value->generation==owner.generation && value->module==owner.module &&
        value->owned_extent==owner.owned_extent && value->extent_bytes==owner.extent_bytes &&
        value->image_offset==owner.image_offset && value->image_bytes==owner.image_bytes &&
        equal(value->package_sha256,owner.package_sha256,MU_DIGEST_BYTES) &&
        equal(value->controller_sha256,owner.controller_sha256,MU_DIGEST_BYTES);
}
static void bytes(void *out,const void *in,uint32_t n)
{uint8_t *a=out;const uint8_t *b=in;for(uint32_t i=0;i<n;++i)a[i]=b[i];}
static int equal(const void *left,const void *right,uint32_t n)
{const uint8_t *a=left,*b=right;for(uint32_t i=0;i<n;++i)if(a[i]!=b[i])return 0;return 1;}
static unsigned capture(void *context,struct mw_sample_capture *out)
{if(context!=&editor || !held)bad=1;bytes(out,&source,sizeof source);return MODWERK_SAMPLE_OK;}
static unsigned publish(void *context,const struct mw_sample_capture *before,const struct mw_sample_edit *edit)
{
    if(context!=&editor || !held || editor.state!=MW_SAMPLE_CLOSED ||
       !equal(before,&source,sizeof source))bad=1;
    ++publishes;
    if(publish_reply==MODWERK_SAMPLE_APPLIED) {
        source.view.count=edit->count;bytes(source.view.records,edit->records,sizeof edit->records);
    }
    return publish_reply;
}
static const struct mw_sample_backend backend={&editor,lock,unlock,available,published,capture,publish};
static void reset(uint32_t kind,uint32_t slot,uint32_t count)
{
    uint8_t *p=(uint8_t *)&editor;
    for(uint32_t i=0;i<sizeof editor;++i)p[i]=0;
    p=(uint8_t *)&source;for(uint32_t i=0;i<sizeof source;++i)p[i]=0;
    p=(uint8_t *)&owner;for(uint32_t i=0;i<sizeof owner;++i)p[i]=0;
    source.view.kind=kind;source.view.slot=slot;source.view.frames=88200;source.view.frame_rate=44100;
    source.view.trim_end=88200;source.view.sample_bpm24=2880;source.view.project_bpm24=2160;
    source.view.count=count;
    for(uint32_t i=0;i<64;++i) {
        source.view.records[i].start=i<count?22050*i:0xf0000000u+i;
        source.view.records[i].end=i<count?22050*(i+1):0xe0000000u+i;
        source.view.records[i].loop=i<count?UINT32_MAX:0xd0000000u+i;
    }
    for(uint32_t i=0;i<11;++i)source.controls[i]=i+123;
    owner.generation=7;owner.module=17;owner.owned_extent=0x48010000u;
    owner.extent_bytes=2048;owner.image_offset=128;owner.image_bytes=1024;
    owner.package_sha256[0]=33;owner.controller_sha256[0]=44;
    held=publishes=bad=0;ready=owner_live=1;publish_reply=MODWERK_SAMPLE_APPLIED;
    (void)mw_sample_editor_init(&editor,&backend);
}
uint32_t mw_sample_editor_service_test(void)
{
    static struct mw_sample_capture before;
    static struct modwerk_sample_view out,sentinel;
    static struct modwerk_sample_grid grid;
    uint32_t token,old,kind,slot;
    grid.count=4;for(uint32_t i=0;i<64;++i)grid.starts[i]=i<4?22050*i:0;
    for(kind=0;kind<2;++kind)for(slot=0;slot<128;slot+=127) {
        reset(kind,slot,0);CHECK(!mw_sample_editor_init(&editor,&backend));
        bytes(&before,&source,sizeof before);
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_copy(&editor,token,&out)==MODWERK_SAMPLE_OK);
        CHECK(equal(&out,&source.view,sizeof out));
        CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
        /* Confirmation itself never writes the source, and copies the plan. */
        CHECK(!publishes && equal(&source,&before,sizeof source));
        grid.starts[1]=123;
        CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_APPLIED);
        grid.starts[1]=22050;
        CHECK(publishes==1 && source.view.count==4 && source.view.records[1].start==22050);
        for(uint32_t i=4;i<64;++i)CHECK(equal(&source.view.records[i],&before.view.records[i],12));
        CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_STALE && publishes==1);
        CHECK(!held && !bad);
    }
    for(uint32_t mutation=0;mutation<11;++mutation) {
        reset(1,0,0);CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
        if(mutation==0)++source.controls[5];
        if(mutation==1)++source.view.trim_start;
        if(mutation==2)++source.view.project_bpm24;
        if(mutation==3)++source.view.records[63].loop;
        if(mutation==4)owner_live=0;
        if(mutation==5)ready=0;
        if(mutation==6)mw_sample_editor_changed_locked(&editor);
        if(mutation==7)mw_sample_editor_retire_locked(&editor,&owner);
        if(mutation==8)++owner.generation;
        if(mutation==9)++owner.package_sha256[MU_DIGEST_BYTES-1];
        if(mutation==10)++owner.controller_sha256[MU_DIGEST_BYTES-1];
        bytes(&before,&source,sizeof before);
        CHECK(mw_sample_editor_answer(&editor,token,1)!=MODWERK_SAMPLE_APPLIED);
        CHECK(!publishes && equal(&before,&source,sizeof source) && !bad && !held);
    }
    reset(0,127,0);CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
    bytes(&sentinel,&source.view,sizeof sentinel);
    CHECK(mw_sample_editor_copy(&editor,token+1,&out)==MODWERK_SAMPLE_STALE);
    mw_sample_editor_cancel(&editor,token+1);CHECK(editor.state==MW_SAMPLE_OPEN);
    CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
    CHECK(mw_sample_editor_answer(&editor,token,0)==MODWERK_SAMPLE_NO_CHANGE && !publishes);
    CHECK(equal(&sentinel,&source.view,sizeof sentinel));
    old=token;CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK && old!=token);
    bytes(&out,&sentinel,sizeof out);
    CHECK(mw_sample_editor_copy(&editor,old,&out)==MODWERK_SAMPLE_STALE);
    CHECK(equal(&out,&sentinel,sizeof out));
    /* Temporary work must leave both the caller buffer and token intact.
     * Completion can resume; a changed source can never resume that token. */
    ready=0;
    CHECK(mw_sample_editor_copy(&editor,token,&out)==MODWERK_SAMPLE_BUSY);
    CHECK(equal(&out,&sentinel,sizeof out) && editor.state==MW_SAMPLE_OPEN);
    CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_BUSY);
    ready=1;CHECK(mw_sample_editor_copy(&editor,token,&out)==MODWERK_SAMPLE_OK);
    ++source.controls[10];bytes(&sentinel,&out,sizeof out);
    CHECK(mw_sample_editor_copy(&editor,token,&out)==MODWERK_SAMPLE_STALE);
    CHECK(equal(&out,&sentinel,sizeof out) && editor.state==MW_SAMPLE_CLOSED);
    --source.controls[10];
    CHECK(mw_sample_editor_copy(&editor,token,&out)==MODWERK_SAMPLE_STALE);
    /* Retirement compares the complete identity, and ignores companions. */
    for(uint32_t digest=0;digest<2;++digest)for(uint32_t i=0;i<MU_DIGEST_BYTES;++i) {
        struct runtime_owner other;
        reset(1,0,0);CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        bytes(&other,&owner,sizeof other);
        if(digest)++other.controller_sha256[i];else ++other.package_sha256[i];
        mw_sample_editor_retire_locked(&editor,&other);
        CHECK(editor.state==MW_SAMPLE_OPEN);
        mw_sample_editor_retire_locked(&editor,&owner);
        CHECK(editor.state==MW_SAMPLE_CLOSED);
    }
    /* Exact pre-existing records and ordinals survive or the edit refuses. */
    reset(1,0,1);CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
    CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
    CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_APPLIED);
    CHECK(source.view.records[0].end==22050 && source.view.records[0].loop==UINT32_MAX);
    reset(1,0,1);source.view.records[0].start=1000;
    CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
    CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_PRESERVATION && !publishes);
    /* An accepted YES waits for transient work without consuming the prompt.
     * Every later attempt revalidates, including mutations while busy. */
    for(unsigned change=0;change<4;++change) {
        reset(1,0,0);CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
        ready=0;CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_BUSY);
        CHECK(editor.state==MW_SAMPLE_PROMPT && !publishes);
        if(change==1)++source.view.records[63].loop;
        if(change==2)mw_sample_editor_changed_locked(&editor);
        if(change==3)owner_live=0;
        ready=1;
        CHECK(mw_sample_editor_answer(&editor,token,1)==(change?MODWERK_SAMPLE_STALE:MODWERK_SAMPLE_APPLIED));
        CHECK(publishes==(change?0u:1u));
    }
    for(unsigned kind=0;kind<2;++kind) {
        reset(kind,127,4);bytes(&before,&source,sizeof before);
        grid.count=2;grid.starts[0]=0;grid.starts[1]=44100;
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_PRESERVATION);
        CHECK(mw_sample_editor_replace(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING && editor.replacing);
        CHECK(!publishes && equal(&before,&source,sizeof source));
        CHECK(mw_sample_editor_answer(&editor,token,0)==MODWERK_SAMPLE_NO_CHANGE);
        CHECK(equal(&before,&source,sizeof source));
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_replace(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
        CHECK(mw_sample_editor_answer(&editor,token,1)==MODWERK_SAMPLE_APPLIED && publishes==1);
        CHECK(source.view.count==2 && source.view.records[0].end==44100 && source.view.records[1].start==44100);
        CHECK(source.view.records[1].end==88200 && source.view.records[1].loop==UINT32_MAX);
        for(unsigned i=2;i<64;++i)CHECK(equal(&source.view.records[i],&before.view.records[i],12));
    }
    grid.count=4;for(unsigned i=0;i<4;++i)grid.starts[i]=22050*i;
    /* A failed publisher may report verified no-change; anything else poisons. */
    for(uint32_t fault=0;fault<2;++fault) {
        reset(1,0,0);bytes(&before,&source,sizeof before);
        publish_reply=fault?MODWERK_SAMPLE_INVALID:MODWERK_SAMPLE_NO_CHANGE;
        CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_OK);
        CHECK(mw_sample_editor_confirm(&editor,token,&grid)==MODWERK_SAMPLE_CONFIRMING);
        CHECK(mw_sample_editor_answer(&editor,token,1)==(fault?MODWERK_SAMPLE_FAULT:MODWERK_SAMPLE_NO_CHANGE));
        CHECK(equal(&before,&source,sizeof source) && publishes==1 && !bad && !held);
        if(fault)CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_UNSUPPORTED);
    }
    reset(1,0,0);editor.serial=UINT32_MAX;token=123;
    CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_UNSUPPORTED && token==123);
    reset(1,0,0);editor.revision=UINT32_MAX;mw_sample_editor_changed_locked(&editor);
    CHECK(mw_sample_editor_begin(&editor,&owner,&token)==MODWERK_SAMPLE_UNSUPPORTED);
    return 0;
}
#ifdef MW_SAMPLE_EDITOR_HOST_MAIN
#include <stdio.h>
int main(void){uint32_t line=mw_sample_editor_service_test();if(line){printf("FAIL line %u\n",line);return 1;}puts("PASS: shared sample editor capture/confirmation/publication and retirement");return 0;}
#endif
