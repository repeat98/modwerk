/* SPDX-License-Identifier: MIT */
#include "sample_editor_service.h"

/* Byte copies avoid implicit aggregate memcpy and work for host/native owner
 * layouts. No copied object contains a pointer to sample memory. */
static void copy(void *out,const void *in,uint32_t n)
{
    uint8_t *d=out;const uint8_t *s=in;
    for(uint32_t i=0;i<n;++i)d[i]=s[i];
}
static int equal(const void *left,const void *right,uint32_t n)
{
    const uint8_t *a=left,*b=right;
    for(uint32_t i=0;i<n;++i)if(a[i]!=b[i])return 0;
    return 1;
}
static void records_copy(struct modwerk_slice_record *to,const struct modwerk_slice_record *from)
{
    for(uint32_t i=0;i<MODWERK_SAMPLE_EDITOR_SLICES;++i) {
        to[i].start=from[i].start;to[i].end=from[i].end;to[i].loop=from[i].loop;
    }
}
static void view_copy(struct modwerk_sample_view *to,const struct modwerk_sample_view *from)
{
#define FIELD(f) to->f=from->f
    FIELD(kind);FIELD(slot);FIELD(frames);FIELD(frame_rate);FIELD(trim_start);
    FIELD(trim_end);FIELD(loop);FIELD(sample_bpm24);FIELD(project_bpm24);FIELD(count);
#undef FIELD
    records_copy(to->records,from->records);
}
static int capture_equal(const struct mw_sample_capture *a,const struct mw_sample_capture *b)
{
    const struct modwerk_sample_view *x=&a->view,*y=&b->view;
    if(x->kind!=y->kind || x->slot!=y->slot || x->frames!=y->frames || x->frame_rate!=y->frame_rate ||
       x->trim_start!=y->trim_start || x->trim_end!=y->trim_end || x->loop!=y->loop ||
       x->sample_bpm24!=y->sample_bpm24 || x->project_bpm24!=y->project_bpm24 || x->count!=y->count)return 0;
    for(uint32_t i=0;i<MODWERK_SAMPLE_EDITOR_SLICES;++i)
        if(x->records[i].start!=y->records[i].start || x->records[i].end!=y->records[i].end ||
           x->records[i].loop!=y->records[i].loop)return 0;
    for(unsigned i=0;i<11u;++i)if(a->controls[i]!=b->controls[i])return 0;
    return 1;
}
static int binding(const struct mw_sample_editor *e)
{
    return e && e->initialized && e->backend && !e->poisoned;
}
static void owner_copy(struct runtime_owner *to,const struct runtime_owner *from)
{
    to->generation=from->generation;to->module=from->module;
    to->owned_extent=from->owned_extent;to->extent_bytes=from->extent_bytes;
    to->image_offset=from->image_offset;to->image_bytes=from->image_bytes;
    copy(to->package_sha256,from->package_sha256,MU_DIGEST_BYTES);
    copy(to->controller_sha256,from->controller_sha256,MU_DIGEST_BYTES);
}
static int owner_equal(const struct runtime_owner *a,const struct runtime_owner *b)
{
    return a->generation==b->generation && a->module==b->module &&
        a->owned_extent==b->owned_extent && a->extent_bytes==b->extent_bytes &&
        a->image_offset==b->image_offset && a->image_bytes==b->image_bytes &&
        equal(a->package_sha256,b->package_sha256,MU_DIGEST_BYTES) &&
        equal(a->controller_sha256,b->controller_sha256,MU_DIGEST_BYTES);
}
static int view_valid(const struct modwerk_sample_view *v)
{
    unsigned recorder=v->kind==MODWERK_SAMPLE_FLEX && v->slot>=MW_SAMPLE_FILE_SLOTS;
    uint32_t slots=MW_SAMPLE_FILE_SLOTS+(v->kind==MODWERK_SAMPLE_FLEX?MW_SAMPLE_RECORDER_COUNT:0u);
    if(v->kind>MODWERK_SAMPLE_FLEX || v->slot>=slots ||
       v->frames>0x7fffffffu || v->frame_rate<8000u || v->frame_rate>192000u ||
       v->count>MODWERK_SAMPLE_EDITOR_SLICES)return 0;
    /* An actually empty recorder may be opened without inventing a length
     * from reserved capacity. Its explicit grid result stays empty. */
    if(!v->frames) {
        if(!recorder || v->trim_start || v->trim_end)return 0;
        for(uint32_t i=0;i<v->count;++i)
            if(v->records[i].start || v->records[i].end)return 0;
        return 1;
    }
    if(v->trim_start>=v->trim_end || v->trim_end>v->frames)return 0;
    for(uint32_t i=0;i<v->count;++i)
        if(v->records[i].start<v->trim_start || v->records[i].start>=v->trim_end ||
           (i && (v->records[i-1].start>v->records[i].start ||
                  (!recorder && v->records[i-1].start==v->records[i].start))))return 0;
    /* Stock's shorter-recording cleanup can clamp several old starts onto
     * the same final boundary. Capture those rows unchanged for NO/replacement;
     * proposals still require strictly increasing starts. */
    return 1;
}
int mw_sample_editor_init(struct mw_sample_editor *e,const struct mw_sample_backend *b)
{
    if(!e || e->initialized || !b || !b->lock || !b->unlock || !b->ready ||
       !b->owner || !b->capture || !b->publish)return 0;
    e->backend=b;e->revision=1;e->serial=0;e->state=MW_SAMPLE_CLOSED;
    e->poisoned=0;e->initialized=1;return 1;
}
void mw_sample_editor_changed_locked(struct mw_sample_editor *e)
{
    if(!e || !e->initialized)return;
    e->state=MW_SAMPLE_CLOSED;
    if(e->revision==UINT32_MAX)e->poisoned=1;
    else ++e->revision;
}
void mw_sample_editor_retire_locked(struct mw_sample_editor *e,const struct runtime_owner *owner)
{
    if(binding(e) && owner && e->state!=MW_SAMPLE_CLOSED &&
       owner_equal(&e->owner,owner))e->state=MW_SAMPLE_CLOSED;
}
static unsigned current(struct mw_sample_editor *e,uint32_t token)
{
    const struct mw_sample_backend *b=e->backend;
    if(e->poisoned || !token || token!=e->serial || e->state==MW_SAMPLE_CLOSED ||
       e->opened_revision!=e->revision)return MODWERK_SAMPLE_STALE;
    if(!b->owner(b->context,&e->owner))return MODWERK_SAMPLE_STALE;
    if(!b->ready(b->context))return MODWERK_SAMPLE_BUSY;
    unsigned why=b->capture(b->context,&e->observed);
    if(why!=MODWERK_SAMPLE_OK)return why;
    return capture_equal(&e->before,&e->observed)?MODWERK_SAMPLE_OK:MODWERK_SAMPLE_STALE;
}
unsigned mw_sample_editor_begin(struct mw_sample_editor *e,const struct runtime_owner *owner,uint32_t *token)
{
    if(!binding(e) || !owner || !token)return MODWERK_SAMPLE_UNSUPPORTED;
    const struct mw_sample_backend *b=e->backend;
    uint32_t saved=b->lock(b->context);
    /* Beginning another action retires every older token, even if admission
     * then refuses. No observed/retired activation can revive on USB Undo. */
    e->state=MW_SAMPLE_CLOSED;
    unsigned why=MODWERK_SAMPLE_BUSY;
    if(e->poisoned || e->serial==UINT32_MAX){e->poisoned=1;why=MODWERK_SAMPLE_UNSUPPORTED;}
    else if(!b->owner(b->context,owner))why=MODWERK_SAMPLE_STALE;
    else if(b->ready(b->context)) {
        why=b->capture(b->context,&e->observed);
        if(why==MODWERK_SAMPLE_OK && !view_valid(&e->observed.view))why=MODWERK_SAMPLE_UNSUPPORTED;
        if(why==MODWERK_SAMPLE_OK) {
            owner_copy(&e->owner,owner);view_copy(&e->before.view,&e->observed.view);
            for(unsigned i=0;i<11u;++i)e->before.controls[i]=e->observed.controls[i];
            e->opened_revision=e->revision;++e->serial;e->state=MW_SAMPLE_OPEN;*token=e->serial;
        }
    }
    b->unlock(b->context,saved);return why;
}
unsigned mw_sample_editor_copy(struct mw_sample_editor *e,uint32_t token,struct modwerk_sample_view *out)
{
    if(!binding(e) || !out)return MODWERK_SAMPLE_INVALID;
    const struct mw_sample_backend *b=e->backend;uint32_t saved=b->lock(b->context);
    unsigned why=current(e,token);
    if(why==MODWERK_SAMPLE_OK)view_copy(out,&e->before.view);
    else if(token==e->serial && why!=MODWERK_SAMPLE_BUSY)e->state=MW_SAMPLE_CLOSED;
    b->unlock(b->context,saved);return why;
}
static unsigned prepare(struct mw_sample_editor *e,const struct modwerk_sample_grid *g,unsigned replacing)
{
    const struct modwerk_sample_view *v=&e->before.view;
    uint32_t minimum=v->frames<64u?v->frames:64u;
    if(!g || g->count>MODWERK_SAMPLE_EDITOR_SLICES)return MODWERK_SAMPLE_INVALID;
    if(!v->frames) {
        if(g->count)return MODWERK_SAMPLE_INVALID;
        if(v->count && !replacing)return MODWERK_SAMPLE_PRESERVATION;
        e->edit.count=0;records_copy(e->edit.records,v->records);
        return MODWERK_SAMPLE_OK;
    }
    if(!g->count)return MODWERK_SAMPLE_INVALID;
    uint32_t retained=replacing?0:v->count;
    if(g->count<retained)return MODWERK_SAMPLE_PRESERVATION;
    for(uint32_t i=0;i<g->count;++i)
        if(g->starts[i]<v->trim_start || g->starts[i]>=v->trim_end ||
           (i && g->starts[i-1]>=g->starts[i]))return MODWERK_SAMPLE_INVALID;
    for(uint32_t i=0;i<retained;++i) {
        const struct modwerk_slice_record *r=&v->records[i];
        if(g->starts[i]!=r->start || r->end<=r->start || r->end>v->trim_end ||
           r->end-r->start<minimum || (i && v->records[i-1].end>r->start) ||
           (r->loop!=UINT32_MAX && (r->loop<r->start || r->loop>r->end-minimum)))
            return MODWERK_SAMPLE_PRESERVATION;
    }
    for(uint32_t i=retained;i<g->count;++i) {
        uint32_t end=i+1u<g->count?g->starts[i+1u]:v->trim_end;
        if(end-g->starts[i]<minimum || (i==retained && i && v->records[i-1].end>g->starts[i]))
            return MODWERK_SAMPLE_PRESERVATION;
    }
    /* Preserve every inactive row too, except the exact newly occupied rows.
     * Every refusal above precedes any write to the pending edit. */
    e->edit.count=g->count;records_copy(e->edit.records,v->records);
    for(uint32_t i=retained;i<g->count;++i) {
        e->edit.records[i].start=g->starts[i];
        e->edit.records[i].end=i+1u<g->count?g->starts[i+1u]:v->trim_end;
        e->edit.records[i].loop=UINT32_MAX;
    }
    return MODWERK_SAMPLE_OK;
}
static unsigned confirm(struct mw_sample_editor *e,uint32_t token,const struct modwerk_sample_grid *g,unsigned replacing)
{
    if(!binding(e) || !g)return MODWERK_SAMPLE_INVALID;
    const struct mw_sample_backend *b=e->backend;uint32_t saved=b->lock(b->context);
    unsigned why=current(e,token);
    if(why==MODWERK_SAMPLE_OK && e->state!=MW_SAMPLE_OPEN)why=MODWERK_SAMPLE_BUSY;
    if(why==MODWERK_SAMPLE_OK) {
        why=prepare(e,g,replacing);
        if(why==MODWERK_SAMPLE_OK){e->replacing=replacing;e->state=MW_SAMPLE_PROMPT;why=MODWERK_SAMPLE_CONFIRMING;}
    } else if(token==e->serial && why!=MODWERK_SAMPLE_BUSY)e->state=MW_SAMPLE_CLOSED;
    b->unlock(b->context,saved);return why;
}
unsigned mw_sample_editor_confirm(struct mw_sample_editor *e,uint32_t token,const struct modwerk_sample_grid *g)
{return confirm(e,token,g,0);}
unsigned mw_sample_editor_replace(struct mw_sample_editor *e,uint32_t token,const struct modwerk_sample_grid *g)
{return confirm(e,token,g,1);}
unsigned mw_sample_editor_answer(struct mw_sample_editor *e,uint32_t token,unsigned yes)
{
    if(!binding(e))return MODWERK_SAMPLE_UNSUPPORTED;
    const struct mw_sample_backend *b=e->backend;uint32_t saved=b->lock(b->context);
    unsigned why=MODWERK_SAMPLE_STALE;
    if(token && token==e->serial && e->state==MW_SAMPLE_PROMPT) {
        why=yes?current(e,token):MODWERK_SAMPLE_NO_CHANGE;
        /* No write has begun. A transient reader/job must not consume YES or
         * masquerade as source mutation. Recheck the entire capture later. */
        if(why==MODWERK_SAMPLE_BUSY){b->unlock(b->context,saved);return why;}
        /* Consume before calling the publisher. No duplicate YES/reentrant
         * prompt, uncertain retry or later owner restoration can apply twice. */
        e->state=MW_SAMPLE_CLOSED;
        if(why==MODWERK_SAMPLE_OK) {
            why=b->publish(b->context,&e->before,&e->edit);
            if(why!=MODWERK_SAMPLE_APPLIED && why!=MODWERK_SAMPLE_NO_CHANGE && why!=MODWERK_SAMPLE_STALE) {
                why=MODWERK_SAMPLE_FAULT;e->poisoned=1;
            }
            if(e->revision==UINT32_MAX)e->poisoned=1;else ++e->revision;
        }
    }
    b->unlock(b->context,saved);return why;
}
void mw_sample_editor_cancel(struct mw_sample_editor *e,uint32_t token)
{
    if(!binding(e))return;
    const struct mw_sample_backend *b=e->backend;uint32_t saved=b->lock(b->context);
    if(token && token==e->serial)e->state=MW_SAMPLE_CLOSED;
    b->unlock(b->context,saved);
}
