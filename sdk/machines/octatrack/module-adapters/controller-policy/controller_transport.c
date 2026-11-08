/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "controller_transport.h"
#include "loader.h"
typedef char mw_controller_reset_chunk_is_the_transports[MW_CONTROLLER_RESET_CHUNK == DL_RESET_DATA ? 1 : -1];

static int locked(void) {
#ifdef MW_CONTROLLER_TRANSPORT_TEST
    extern unsigned mw_controller_transport_test_sr(void);
    unsigned sr=mw_controller_transport_test_sr();
#else
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0" : "=d"(sr));
#endif
    return (sr&0x0700u)>=0x0400u;
}
static int same(const struct mw_controller_binding *a,const struct mw_controller_binding *b) {
    const struct mw_controller_identity *x=&a->identity,*y=&b->identity;
    for(unsigned i=0;i<32;i++) if(x->package_sha256[i]!=y->package_sha256[i] ||
        x->source_policy_sha256[i]!=y->source_policy_sha256[i]) return 0;
    return x->module==y->module && x->feature==y->feature && x->required_cores==y->required_cores &&
        x->policy_revision==y->policy_revision && x->state_revision==y->state_revision &&
        x->parameter_revision==y->parameter_revision && a->generation==b->generation &&
        a->canonical_extent==b->canonical_extent && a->extent_bytes==b->extent_bytes &&
        a->image_offset==b->image_offset && a->image_bytes==b->image_bytes;
}
static unsigned find(struct mw_controller_transport *t,const struct mw_controller_binding *b) {
    if(!t || !t->registry || !t->policy || !b) return MW_CONTROLLER_SLOTS;
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;i++) if(t->registry->slots[i].state!=MW_CTL_EMPTY &&
        same(&t->registry->slots[i].binding,b)) return i;
    return MW_CONTROLLER_SLOTS;
}
static int exact(struct mw_controller_transport *t,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    if(!locked() || !t || !t->registry || !j || j->core>1 || !t->held[j->core] ||
       t->slot[j->core]>=MW_CONTROLLER_SLOTS || b!=&t->registry->slots[t->slot[j->core]].binding) return 0;
    const struct mw_controller_job *v=&t->jobs[j->core];
    return j->generation==v->generation && j->ticket==v->ticket && j->wire_sequence==v->wire_sequence &&
        j->core==v->core && j->operation==v->operation && j->offset==v->offset && j->count==v->count &&
        j->expected==v->expected && j->desired==v->desired;
}
static int owns(void *context,const struct mw_controller_binding *b) {
    struct mw_controller_transport *t=context;
    return locked() && t && t->policy && t->policy->owns_image(t->context,b)==1;
}
static int resources(void *context,const struct mw_controller_binding *b) {
    struct mw_controller_transport *t=context;
    return locked() && t && t->policy && t->policy->resources_idle(t->context,b)==1;
}
static int blocked(void *context) {
    struct mw_controller_transport *t=context;
    return !locked() || !t || !t->policy || t->policy->writes_blocked(t->context)!=0;
}
static int committed(void *context,const struct mw_controller_binding *b) {
    struct mw_controller_transport *t=context;
    return locked() && t && t->policy ? t->policy->publication_confirmed(t->context,b) : 0;
}
static int roots(void *context,const struct mw_controller_binding *b) {
    struct mw_controller_transport *t=context;
    return locked() && t && t->policy && t->policy->roots_clear(t->context,b)==1;
}
static int submit(void *context,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    struct mw_controller_transport *t=context;
    if(!exact(t,b,j) || t->closed[j->core] || blocked(t)) return 0;
    return dl_owned_submit(&t->receipts[j->core]);
}
static int storage_closed(void *context,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    struct mw_controller_transport *t=context;
    return exact(t,b,j) && t->released[j->core]==1;
}
static const struct mw_controller_backend backend={owns,resources,blocked,submit,storage_closed,committed,roots};
int mw_controller_transport_init(struct mw_controller_transport *t,struct mw_controller_registry *r,
        const struct mw_controller_transport_policy *p,void *context) {
    if(!t || !r || t->registry || !p || !p->owns_image || !p->resources_idle || !p->writes_blocked ||
       !p->publication_confirmed || !p->roots_clear || !p->reset_source || !p->receiver_mask) return 0;
    uint32_t irq=modwerk_machine_lock();
    int ok=locked();
    for(unsigned i=0;i<MW_CONTROLLER_SLOTS;i++) if(r->slots[i].state!=MW_CTL_EMPTY) ok=0;
    if(ok) { *t=(struct mw_controller_transport){0};t->registry=r;t->policy=p;t->context=context;
        mw_controller_registry_init(r,&backend,t); }
    modwerk_machine_unlock(irq);return ok;
}
int mw_controller_transport_begin(struct mw_controller_transport *t,const struct mw_controller_binding *b,unsigned c,unsigned op) {
    if(c>1) return MW_CTL_CLOSED;
    uint32_t irq=modwerk_machine_lock();
    unsigned at=find(t,b);
    int result=MW_CTL_CLOSED;
    if(!locked() || at>=MW_CONTROLLER_SLOTS || t->held[c] || t->closed[c] || blocked(t)) goto out;
    struct mw_controller_slot *s=&t->registry->slots[at];
    b=&s->binding;
    if(!(b->identity.required_cores>>c&1u) || !owns(t,b) || !resources(t,b)) goto out;
    struct dl_owned_job receipt;
    if(op==MW_CTL_RESET) {
        uint32_t offset=s->acknowledged_words[c];const uint32_t *words=0;unsigned count=0;
        if(offset>=s->reset_words[c] || t->policy->reset_source(t->context,b,c,offset,&words,&count)!=1 ||
           !count || count>MW_CONTROLLER_RESET_CHUNK || count>s->reset_words[c]-offset ||
           !dl_owned_reset_reserve(c,b->generation,b->identity.feature,offset,count,words,&receipt)) goto out;
    } else if(op==MW_CTL_ENABLE || op==MW_CTL_DISABLE) {
        uint32_t mask=0;
        if(t->policy->receiver_mask(t->context,b,c,&mask)!=1 || mask&~(c ? 13u:15u)) goto out; /* 8: the key bus (controller_board.c) */
        uint32_t desired=op==MW_CTL_ENABLE ? mask|b->identity.feature : mask&~b->identity.feature;
        if(!dl_owned_command_reserve(c,b->generation,10u,mask,desired,0,&receipt)) goto out;
    } else goto out;
    t->receipts[c]=receipt;t->slot[c]=(uint8_t)at;t->held[c]=1;t->released[c]=t->observed[c]=0;
    t->jobs[c]=(struct mw_controller_job){b->generation,receipt.ticket,receipt.offset,receipt.count,
        op==MW_CTL_RESET ? 0u:receipt.id,op==MW_CTL_RESET ? 0u:receipt.init,
        receipt.first_sequence,(uint8_t)c,(uint8_t)op};
    result=mw_controller_start(t->registry,b,&t->jobs[c]);
    if(result!=MW_CTL_PENDING) {
        if(dl_owned_cancel(&t->receipts[c])==1) t->held[c]=0;
        else { t->closed[c]=1;dl_owned_fail_closed(c);mw_controller_cancel(t->registry,b);result=MW_CTL_PENDING; }
    }
out:
    modwerk_machine_unlock(irq);return result;
}
int mw_controller_transport_poll(struct mw_controller_transport *t,const struct mw_controller_binding *b,unsigned c) {
    if(c>1) return MW_CTL_CLOSED;
    uint32_t irq=modwerk_machine_lock();
    unsigned at=find(t,b);int result=MW_CTL_STALE;
    if(!locked() || at>=MW_CONTROLLER_SLOTS || !t->held[c] || t->slot[c]!=at) goto out;
    b=&t->registry->slots[at].binding;
    if(!t->observed[c]) {
        struct dl_owned_progress progress;
        int state=dl_owned_job_poll(&t->receipts[c],&progress);
        if(!state) { result=MW_CTL_PENDING;goto out; }
        int observation=state==1 && progress.sent_sequence==t->receipts[c].last_sequence &&
            progress.acknowledged_sequence==t->receipts[c].last_sequence ? MW_CTL_ACK:MW_CTL_UNKNOWN;
        if(observation!=MW_CTL_ACK) { t->closed[c]=1;dl_owned_fail_closed(c); }
        result=mw_controller_ack(t->registry,b,&t->jobs[c],observation);
        t->observed[c]=1;
        if(result==MW_CTL_STALE) { t->closed[c]=1;dl_owned_fail_closed(c);mw_controller_cancel(t->registry,b);goto out; }
    }
    if(!t->released[c]) {
        if(dl_owned_job_release(&t->receipts[c])!=1) { t->closed[c]=1;dl_owned_fail_closed(c);mw_controller_cancel(t->registry,b);result=MW_CTL_PENDING;goto out; }
        t->released[c]=1;
    }
    result=mw_controller_release_job(t->registry,b,&t->jobs[c]);
    if(result==MW_CTL_OK) { t->held[c]=0;if(t->closed[c]) result=MW_CTL_PENDING; }
out:
    modwerk_machine_unlock(irq);return result;
}
