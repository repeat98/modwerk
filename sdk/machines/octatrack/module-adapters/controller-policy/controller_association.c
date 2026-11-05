/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "controller_association.h"

enum { JOB_NONE, JOB_SUBMITTED, JOB_ACKED, JOB_UNKNOWN };
static void zero(void *out,unsigned size) { uint8_t *p=out; while(size--) *p++=0; }
static int same_digest(const uint8_t *a,const uint8_t *b) {
    for(unsigned i=0;i<32;++i) if(a[i]!=b[i]) return 0;
    return 1;
}
static unsigned cores(unsigned feature) { return feature==2u ? 1u : feature==1u || feature==4u ? 3u : 0u; }
static int digest(const uint8_t d[32]) { unsigned v=0; for(unsigned i=0;i<32;++i) v|=d[i]; return v!=0; }
static int identity(const struct mw_controller_identity *a,const struct mw_controller_identity *b) {
    return same_digest(a->package_sha256,b->package_sha256) && same_digest(a->source_policy_sha256,b->source_policy_sha256) &&
        a->module==b->module && a->feature==b->feature && a->required_cores==b->required_cores && a->policy_revision==b->policy_revision &&
        a->state_revision==b->state_revision && a->parameter_revision==b->parameter_revision;
}
static int binding(const struct mw_controller_binding *a,const struct mw_controller_binding *b) {
    return identity(&a->identity,&b->identity) && a->generation==b->generation && a->canonical_extent==b->canonical_extent && a->extent_bytes==b->extent_bytes && a->image_offset==b->image_offset && a->image_bytes==b->image_bytes;
}
static int job(const struct mw_controller_job *a,const struct mw_controller_job *b) {
    return a->generation==b->generation && a->ticket==b->ticket && a->wire_sequence==b->wire_sequence && a->core==b->core && a->operation==b->operation && a->offset==b->offset &&
        a->count==b->count && a->expected==b->expected && a->desired==b->desired;
}
static int held(const struct mw_controller_slot *s) { return s->state!=MW_CTL_EMPTY && s->state!=MW_CTL_RELEASED; }
static int jobs(const struct mw_controller_slot *s) { return s->job_state[0] || s->job_state[1]; }
static struct mw_controller_slot *previous(struct mw_controller_registry *r,const struct mw_controller_slot *s) {
    if(s->previous>=MW_CONTROLLER_SLOTS) return 0;
    struct mw_controller_slot *old=&r->slots[s->previous];
    return old->binding.generation==s->previous_generation ? old : 0;
}
static struct mw_controller_slot *find(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    if(!b) return 0;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) if(r->slots[i].state!=MW_CTL_EMPTY && binding(&r->slots[i].binding,b)) return &r->slots[i];
    return 0;
}
static void quarantine(struct mw_controller_registry *r,struct mw_controller_slot *s) {
    s->state=MW_CTL_QUARANTINED;
    struct mw_controller_slot *old=previous(r,s);
    if(old && held(old)) old->state=MW_CTL_QUARANTINED;
}
void mw_controller_registry_init(struct mw_controller_registry *r,const struct mw_controller_backend *backend,void *context) {
    zero(r,sizeof *r); r->backend=backend; r->context=context;
}
int mw_controller_reserve(struct mw_controller_registry *r,const struct mw_controller_declaration *d,
    const struct mw_controller_identity *request,const struct mw_controller_binding *previous,unsigned *slot) {
    if(!d || !request || !slot || !identity(&d->identity,request) || !digest(request->package_sha256) ||
       !digest(request->source_policy_sha256) || !request->module || !request->policy_revision || !request->state_revision ||
       !request->parameter_revision || !cores(request->feature) || request->required_cores!=cores(request->feature)) return MW_CTL_CLOSED;
    for(unsigned c=0;c<2;++c) if((cores(request->feature)>>c&1u) ? !d->reset_words[c] || d->reset_words[c]>8192u : d->reset_words[c]!=0) return MW_CTL_CLOSED;
    struct mw_controller_slot *old=previous ? find(r,previous) : 0;
    if(previous && (!old || !held(old) || previous->identity.feature!=request->feature)) return MW_CTL_STALE;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) {
        const struct mw_controller_slot *s=&r->slots[i];
        if(held(s) && s->binding.identity.feature==request->feature && s!=old) return MW_CTL_CONFLICT;
        if(s==old && s->state!=MW_CTL_ACTIVE && s->state!=MW_CTL_RETIRING) return MW_CTL_CONFLICT;
    }
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) if(!held(&r->slots[i])) {
        struct mw_controller_slot *s=&r->slots[i]; zero(s,sizeof *s); s->binding.identity=*request;
        s->reset_words[0]=d->reset_words[0]; s->reset_words[1]=d->reset_words[1]; s->state=MW_CTL_RESERVED;
        s->previous=old ? (uint8_t)(old-r->slots) : MW_CONTROLLER_SLOTS;
        s->previous_generation=old ? old->binding.generation : 0; *slot=i; return MW_CTL_OK;
    }
    return MW_CTL_CONFLICT;
}
int mw_controller_bind(struct mw_controller_registry *r,unsigned at,const struct mw_controller_binding *b) {
    if(at>=MW_CONTROLLER_SLOTS || !b) return MW_CTL_STALE;
    struct mw_controller_slot *s=&r->slots[at];
    if(s->state!=MW_CTL_RESERVED || !identity(&s->binding.identity,&b->identity) || !b->generation ||
       b->generation<=r->last_generation || !b->canonical_extent || (b->canonical_extent&15u) ||
       (b->canonical_extent>=0x48000400u && b->canonical_extent<0x4ff00000u) ||
       !b->extent_bytes || b->canonical_extent+b->extent_bytes<=b->canonical_extent || !b->image_bytes ||
       b->image_offset>b->extent_bytes || b->image_bytes>b->extent_bytes-b->image_offset || !r->backend || !r->backend->owns_image ||
       r->backend->owns_image(r->context,b)!=1) return MW_CTL_CLOSED;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) {
        const struct mw_controller_slot *other=&r->slots[i];
        if(held(other) && other->binding.extent_bytes && b->canonical_extent<other->binding.canonical_extent+other->binding.extent_bytes &&
           other->binding.canonical_extent<b->canonical_extent+b->extent_bytes) return MW_CTL_CONFLICT;
    }
    s->binding=*b; s->state=MW_CTL_BOUND; r->last_generation=b->generation; return MW_CTL_OK;
}
int mw_controller_start(struct mw_controller_registry *r,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || !j || j->core>1u || !j->ticket || j->ticket<=r->last_ticket || j->generation!=b->generation ||
       !j->wire_sequence || j->wire_sequence<=r->last_wire_sequence[j->core] || !(cores(b->identity.feature)>>j->core&1u)) return MW_CTL_STALE;
    if(!r->backend || !r->backend->start || !r->backend->job_closed || !r->backend->owns_image ||
       r->backend->owns_image(r->context,b)!=1 || !r->backend->writes_blocked || r->backend->writes_blocked(r->context) ||
       s->job_state[j->core]) return MW_CTL_CLOSED;
    unsigned next=s->state,feature=b->identity.feature,c=j->core;
    if(j->operation==MW_CTL_RESET) {
        if((s->state!=MW_CTL_BOUND && s->state!=MW_CTL_INITIALIZING) || j->offset!=s->acknowledged_words[c] ||
           !j->count || j->count>MW_CONTROLLER_RESET_CHUNK || j->offset>s->reset_words[c] || j->count>s->reset_words[c]-j->offset ||
           j->expected || j->desired || !r->backend->resources_idle || r->backend->resources_idle(r->context,b)!=1) return MW_CTL_CLOSED;
        struct mw_controller_slot *old=previous(r,s);
        if(old && old->state!=MW_CTL_RETIRING && old->state!=MW_CTL_RELEASED) return MW_CTL_CLOSED;
        next=MW_CTL_INITIALIZING;
    } else if(j->operation==MW_CTL_ENABLE) {
        if((s->state!=MW_CTL_READY && s->state!=MW_CTL_PUBLISHING) || (s->state==MW_CTL_READY && jobs(s)) ||
           s->enable_acks>>c&1u || j->offset || j->count ||
           (j->expected&~(c ? 13u : 15u)) || j->desired!=(j->expected|feature) ||
           !r->backend->resources_idle || r->backend->resources_idle(r->context,b)!=1) return MW_CTL_CLOSED;
        next=MW_CTL_PUBLISHING;
    } else if(j->operation==MW_CTL_DISABLE) {
        /* A restored generation is touched before its first reset ACK: its
         * feature is already off, so this disable is the exact no-op CAS. */
        if((s->state<MW_CTL_INITIALIZING && !(s->state==MW_CTL_BOUND && s->touched)) || s->state>MW_CTL_QUARANTINED || j->offset || j->count ||
           (j->expected&~(c ? 13u : 15u)) || j->desired!=(j->expected&~feature)) return MW_CTL_CLOSED;
        if(s->state!=MW_CTL_DISABLING) {
            if(jobs(s)) return MW_CTL_CLOSED;
            s->disable_acks=0;
        } else if(s->disable_acks>>c&1u) return MW_CTL_CLOSED;
        next=MW_CTL_DISABLING;
    } else return MW_CTL_CLOSED;
    s->jobs[c]=*j; s->job_state[c]=JOB_SUBMITTED; r->last_ticket=j->ticket; r->last_wire_sequence[c]=j->wire_sequence;
    int submitted=r->backend->start(r->context,b,j);
    if(submitted==0) { s->job_state[c]=JOB_NONE; return MW_CTL_CLOSED; }
    s->touched=1;
    if(submitted!=1) { s->job_state[c]=JOB_UNKNOWN; quarantine(r,s); return MW_CTL_PENDING; }
    s->state=(uint8_t)next; return MW_CTL_PENDING;
}
int mw_controller_ack(struct mw_controller_registry *r,const struct mw_controller_binding *b,const struct mw_controller_job *j,int okay) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || !j || j->core>1u || s->job_state[j->core]!=JOB_SUBMITTED || !job(&s->jobs[j->core],j)) return MW_CTL_STALE;
    unsigned c=j->core; s->job_state[c]=okay==1 ? JOB_ACKED : JOB_UNKNOWN;
    if(okay!=1) { quarantine(r,s); return MW_CTL_PENDING; }
    if(s->state==MW_CTL_QUARANTINED) return MW_CTL_PENDING; /* late ACK drains; never promotes */
    if((j->operation==MW_CTL_RESET && s->state!=MW_CTL_INITIALIZING) ||
       (j->operation==MW_CTL_ENABLE && s->state!=MW_CTL_PUBLISHING) ||
       (j->operation==MW_CTL_DISABLE && s->state!=MW_CTL_DISABLING)) {
        quarantine(r,s); return MW_CTL_PENDING;
    }
    if(j->operation==MW_CTL_RESET) {
        s->acknowledged_words[c]+=j->count;
        if(s->acknowledged_words[0]==s->reset_words[0] && s->acknowledged_words[1]==s->reset_words[1]) s->state=MW_CTL_READY;
    } else if(j->operation==MW_CTL_ENABLE) s->enable_acks|=(uint8_t)(1u<<c);
    else s->disable_acks|=(uint8_t)(1u<<c);
    return MW_CTL_OK;
}
int mw_controller_release_job(struct mw_controller_registry *r,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || !j || j->core>1u || (s->job_state[j->core]!=JOB_ACKED && s->job_state[j->core]!=JOB_UNKNOWN) || !job(&s->jobs[j->core],j)) return MW_CTL_STALE;
    if(!r->backend || !r->backend->job_closed || r->backend->job_closed(r->context,b,j)!=1) return MW_CTL_CLOSED;
    s->job_state[j->core]=JOB_NONE;
    if(s->state==MW_CTL_DISABLING && s->disable_acks==cores(b->identity.feature) && !jobs(s)) s->state=MW_CTL_RETIRING;
    return MW_CTL_OK;
}
int mw_controller_publish(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || s->state!=MW_CTL_PUBLISHING || s->enable_acks!=cores(b->identity.feature) || jobs(s)) return MW_CTL_STALE;
    if(!mw_controller_control_write_allowed(r,b) || !r->backend->publication_confirmed) return MW_CTL_CLOSED;
    int confirmed=r->backend->publication_confirmed(r->context,b);
    if(confirmed==0) return MW_CTL_CLOSED;
    if(confirmed!=1) { quarantine(r,s); return MW_CTL_PENDING; }
    s->state=MW_CTL_ACTIVE; return MW_CTL_OK;
}
int mw_controller_slot_write_allowed(struct mw_controller_registry *r,unsigned at) {
    if(at>=MW_CONTROLLER_SLOTS) return 0;
    const struct mw_controller_slot *s=&r->slots[at];
    if((s->state!=MW_CTL_PUBLISHING && s->state!=MW_CTL_ACTIVE) || s->enable_acks!=cores(s->binding.identity.feature) || jobs(s)) return 0;
    const struct mw_controller_backend *t=r->backend;
    return t && t->owns_image && t->resources_idle && t->writes_blocked && !t->writes_blocked(r->context) &&
        t->resources_idle(r->context,&s->binding)==1;
}
int mw_controller_control_write_allowed(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    struct mw_controller_slot *s=find(r,b);
    return s && mw_controller_slot_write_allowed(r,(unsigned)(s-r->slots))==1 && r->backend->owns_image(r->context,b)==1;
}
int mw_controller_cancel(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || !held(s)) return MW_CTL_STALE;
    if(!s->touched && !jobs(s) && (s->state==MW_CTL_RESERVED || s->state==MW_CTL_BOUND)) { s->state=MW_CTL_RELEASED; return MW_CTL_OK; }
    quarantine(r,s); return MW_CTL_PENDING;
}
int mw_controller_restore(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || s->state!=MW_CTL_RETIRING || jobs(s)) return MW_CTL_STALE;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) {
        const struct mw_controller_slot *o=&r->slots[i];
        if(o!=s && held(o) && o->binding.identity.feature==b->identity.feature && o->state!=MW_CTL_RETIRING &&
           !((o->state==MW_CTL_RESERVED || o->state==MW_CTL_BOUND) && !o->touched)) return MW_CTL_CONFLICT;
    }
    if(!r->backend || !r->backend->owns_image || r->backend->owns_image(r->context,b)!=1) return MW_CTL_CLOSED;
    s->acknowledged_words[0]=s->acknowledged_words[1]=0; s->enable_acks=s->disable_acks=0;
    s->state=MW_CTL_BOUND; return MW_CTL_OK;
}
int mw_controller_retire(struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    struct mw_controller_slot *s=find(r,b);
    if(!s || s->state!=MW_CTL_RETIRING || jobs(s)) return MW_CTL_STALE;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) {
        const struct mw_controller_slot *incoming=&r->slots[i];
        if(held(incoming) && incoming->previous==(unsigned)(s-r->slots) &&
           incoming->previous_generation==b->generation && incoming->state!=MW_CTL_ACTIVE) return MW_CTL_CLOSED;
    }
    if(!r->backend || !r->backend->roots_clear || r->backend->roots_clear(r->context,b)!=1) return MW_CTL_CLOSED;
    s->state=MW_CTL_RELEASED; return MW_CTL_OK;
}
int mw_controller_holds(const struct mw_controller_registry *r,const struct mw_controller_binding *b) {
    if(!b) return 1;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;++i) if(r->slots[i].state!=MW_CTL_EMPTY && binding(&r->slots[i].binding,b)) return held(&r->slots[i]);
    return 1; /* unknown identity cannot establish safe reclamation */
}
