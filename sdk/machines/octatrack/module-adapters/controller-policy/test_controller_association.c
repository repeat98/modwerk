/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "controller_association.h"
#include "stock_hook_resources.h"
#include <assert.h>
#include <limits.h>
#include <string.h>

/* Trusted synthetic backend events only. No real transport/ACK qualification. */
struct fixture {
    int blocked, resources, closed, published, roots, result, lost;
    unsigned starts, complete, live_count, target_count, unknown;
    struct mw_hook_span live[2], target[2];
};
static int owns(void *p,const struct mw_controller_binding *b) {
    if(((struct fixture *)p)->unknown&1u) return -1;
    return !((struct fixture *)p)->lost && b->canonical_extent>=0x40100000u && b->canonical_extent+b->extent_bytes<=0x40500000u;
}
static int resources(void *p,const struct mw_controller_binding *b) {
    struct fixture *f=p;
    if(f->unknown&2u) return -1;
    return f->resources && mw_hook_ranges_idle(b->identity.feature,f->live,f->live_count,f->target,f->target_count,f->complete);
}
static int blocked(void *p) { return ((struct fixture *)p)->blocked; }
static int start(void *p,const struct mw_controller_binding *b,const struct mw_controller_job *j) {
    (void)b;(void)j; struct fixture *f=p; ++f->starts; return f->result;
}
static int closed(void *p,const struct mw_controller_binding *b,const struct mw_controller_job *j) { (void)b;(void)j; struct fixture *f=p; return f->unknown&4u ? -1 : f->closed; }
static int published(void *p,const struct mw_controller_binding *b) { (void)b; struct fixture *f=p; return f->unknown&8u ? -1 : f->published; }
static int roots(void *p,const struct mw_controller_binding *b) { (void)b; struct fixture *f=p; return f->unknown&16u ? -1 : f->roots; }
static const struct mw_controller_backend backend={owns,resources,blocked,start,closed,published,roots};
static struct mw_controller_declaration declaration(unsigned feature,unsigned seed) {
    struct mw_controller_declaration d={0};
    memset(d.identity.package_sha256,(int)seed,32); memset(d.identity.source_policy_sha256,(int)(seed+16u),32);
    d.identity.required_cores=feature==2u ? 1u : 3u; d.identity.module=100u+seed; d.identity.feature=feature; d.identity.policy_revision=1;
    d.identity.state_revision=2; d.identity.parameter_revision=3;
    d.reset_words[0]=24; d.reset_words[1]=feature==2u ? 0 : 24; return d;
}
static struct mw_controller_binding reserve(struct mw_controller_registry *r,const struct mw_controller_declaration *d,
    unsigned generation,unsigned image,const struct mw_controller_binding *old,unsigned *slot) {
    assert(mw_controller_reserve(r,d,&d->identity,old,slot)==MW_CTL_OK);
    struct mw_controller_binding b={d->identity,generation,image,256,64,64};
    assert(mw_controller_bind(r,*slot,&b)==MW_CTL_OK); return b;
}
static struct mw_controller_job operation(struct mw_controller_registry *r,const struct mw_controller_binding *b,
    unsigned kind,unsigned core) {
    struct mw_controller_job j={0}; j.generation=b->generation; j.ticket=r->last_ticket+1u; j.wire_sequence=(uint16_t)(r->last_wire_sequence[core]+1u); j.core=(uint8_t)core; j.operation=(uint8_t)kind;
    if(kind==MW_CTL_RESET) j.count=24;
    else if(kind==MW_CTL_ENABLE) j.desired=b->identity.feature;
    else j.expected=b->identity.feature;
    return j;
}
static void finish(struct mw_controller_registry *r,const struct mw_controller_binding *b,unsigned kind,unsigned core) {
    struct mw_controller_job j=operation(r,b,kind,core);
    assert(mw_controller_start(r,b,&j)==MW_CTL_PENDING);
    assert(mw_controller_ack(r,b,&j,1)==MW_CTL_OK);
    assert(mw_controller_release_job(r,b,&j)==MW_CTL_OK);
}
static void initialize(struct mw_controller_registry *r,const struct mw_controller_binding *b,unsigned slot) {
    finish(r,b,MW_CTL_RESET,0);
    assert(r->slots[slot].state==(b->identity.feature==2u ? MW_CTL_READY : MW_CTL_INITIALIZING));
    if(b->identity.feature!=2u) finish(r,b,MW_CTL_RESET,1);
    assert(r->slots[slot].state==MW_CTL_READY);
}
static void activate(struct mw_controller_registry *r,const struct mw_controller_binding *b,unsigned slot) {
    initialize(r,b,slot); finish(r,b,MW_CTL_ENABLE,0);
    if(b->identity.feature!=2u) finish(r,b,MW_CTL_ENABLE,1);
    assert(r->slots[slot].state==MW_CTL_PUBLISHING);
    assert(mw_controller_publish(r,b)==MW_CTL_OK);
}
static void disable(struct mw_controller_registry *r,const struct mw_controller_binding *b,unsigned slot) {
    finish(r,b,MW_CTL_DISABLE,0);
    if(b->identity.feature!=2u) finish(r,b,MW_CTL_DISABLE,1);
    assert(r->slots[slot].state==MW_CTL_RETIRING);
}
static void two_origin_lifecycle(unsigned origin,unsigned feature) {
    struct fixture f={.resources=1,.closed=1,.published=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration d=declaration(feature,1); unsigned slot;
    struct mw_controller_binding b=reserve(&r,&d,1,origin,0,&slot);
    assert(mw_controller_holds(&r,&b)); assert(!mw_controller_control_write_allowed(&r,&b)); initialize(&r,&b,slot);
    assert(!mw_controller_control_write_allowed(&r,&b)); /* reset ACKs alone cannot write controls */
    struct mw_controller_job bad=operation(&r,&b,MW_CTL_ENABLE,0); bad.desired=7;
    assert(mw_controller_start(&r,&b,&bad)==MW_CTL_CLOSED);
    finish(&r,&b,MW_CTL_ENABLE,0); if(feature!=2u) finish(&r,&b,MW_CTL_ENABLE,1);
    assert(mw_controller_control_write_allowed(&r,&b)); /* exact acknowledged pending CF journal */
    struct mw_controller_binding wrong=b; ++wrong.image_offset;
    assert(!mw_controller_control_write_allowed(&r,&wrong));
    f.published=0; assert(mw_controller_publish(&r,&b)==MW_CTL_CLOSED);
    f.published=1; assert(mw_controller_publish(&r,&b)==MW_CTL_OK);
    disable(&r,&b,slot);
    assert(mw_controller_retire(&r,&b)==MW_CTL_CLOSED); assert(mw_controller_holds(&r,&b));
    f.roots=1; assert(mw_controller_retire(&r,&b)==MW_CTL_OK); assert(!mw_controller_holds(&r,&b));
    /* Same pool address, new exact package/source/generation: old ACK is stale. */
    struct mw_controller_declaration next=declaration(feature,2);
    struct mw_controller_binding new=reserve(&r,&next,2,origin,0,&slot);
    struct mw_controller_job late={.ticket=1,.core=0,.operation=MW_CTL_RESET,.count=24};
    assert(mw_controller_ack(&r,&b,&late,1)==MW_CTL_STALE); assert(mw_controller_holds(&r,&new));
    assert(mw_controller_cancel(&r,&new)==MW_CTL_OK); assert(!mw_controller_holds(&r,&new));
}
static void identity_and_submission_negatives(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_binding empty={0}; assert(mw_controller_holds(&r,&empty));
    struct mw_controller_declaration d=declaration(1,1); unsigned slot;
    assert(mw_controller_reserve(&r,0,&d.identity,0,&slot)==MW_CTL_CLOSED);
    struct mw_controller_identity changed=d.identity; changed.package_sha256[31]^=1;
    assert(mw_controller_reserve(&r,&d,&changed,0,&slot)==MW_CTL_CLOSED);
    changed=d.identity; changed.source_policy_sha256[0]^=1;
    assert(mw_controller_reserve(&r,&d,&changed,0,&slot)==MW_CTL_CLOSED);
    changed=d.identity; ++changed.parameter_revision;
    assert(mw_controller_reserve(&r,&d,&changed,0,&slot)==MW_CTL_CLOSED);
    assert(mw_controller_reserve(&r,&d,&d.identity,0,&slot)==MW_CTL_OK);
    struct mw_controller_binding b={d.identity,0,0x40100000u,256,64,64};
    assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
    b.generation=1; b.canonical_extent|=0x08000000u; assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
    b.canonical_extent=0x40000000u; assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED); /* staging/unowned */
    b.canonical_extent=0xfffffff0u; assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
    b.canonical_extent=0x40100000u; b.image_offset=255; assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
    b.image_offset=64; assert(mw_controller_bind(&r,slot,&b)==MW_CTL_OK);
    struct mw_controller_job j=operation(&r,&b,MW_CTL_RESET,0),bad=j;
    bad.offset=1; assert(mw_controller_start(&r,&b,&bad)==MW_CTL_CLOSED);
    bad=j;bad.count=25; assert(mw_controller_start(&r,&b,&bad)==MW_CTL_CLOSED);
    bad=j;bad.wire_sequence=0; assert(mw_controller_start(&r,&b,&bad)==MW_CTL_STALE);
    bad=j;++bad.generation; assert(mw_controller_start(&r,&b,&bad)==MW_CTL_STALE);
    f.blocked=1; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); assert(!f.starts);
    f.blocked=0;f.resources=0; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); assert(!f.starts);
    f.resources=1; f.complete=0; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); /* unknown ledger */
    f.complete=3; f.live[0]=(struct mw_hook_span){0xff0u,1,1,MW_HOOK_Y}; f.live_count=1;
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); /* kept / outgoing core-1 private Y */
    f.live_count=0; f.target[0]=(struct mw_hook_span){0x30000u,16384,0,MW_HOOK_Y}; f.target_count=1;
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); /* target / future whole ring includes SC tail */
    f.target_count=0; f.live[0]=(struct mw_hook_span){0x33fffu,1,1,MW_HOOK_X}; f.live_count=1;
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); /* physical shared alias across core and space */
    f.live_count=0; assert(!f.starts); assert(mw_controller_start(&r,&b,&j)==MW_CTL_PENDING);
    bad=j;++bad.ticket; assert(mw_controller_ack(&r,&b,&bad,1)==MW_CTL_STALE);
    struct mw_controller_binding wrong=b; ++wrong.generation; assert(mw_controller_ack(&r,&wrong,&j,1)==MW_CTL_STALE);
    f.blocked=1; assert(mw_controller_ack(&r,&b,&j,1)==MW_CTL_OK); /* owned housekeeping drains */
    f.closed=0; assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_CLOSED);
    f.closed=1; assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_OK);
    assert(mw_controller_cancel(&r,&b)==MW_CTL_PENDING); assert(mw_controller_holds(&r,&b));
    assert(mw_controller_retire(&r,&b)==MW_CTL_STALE);
    r.slots[slot].state=255; bad=operation(&r,&b,MW_CTL_DISABLE,0);
    assert(mw_controller_holds(&r,&b)); assert(mw_controller_start(&r,&b,&bad)==MW_CTL_CLOSED);
    mw_controller_registry_init(&r,0,0);assert(mw_controller_reserve(&r,&d,&d.identity,0,&slot)==MW_CTL_OK);
    assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
    mw_controller_registry_init(&r,&backend,&f);r.last_generation=UINT_MAX;
    assert(mw_controller_reserve(&r,&d,&d.identity,0,&slot)==MW_CTL_OK);assert(mw_controller_bind(&r,slot,&b)==MW_CTL_CLOSED);
}
static void partial_ack_quarantine(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration d=declaration(4,1),next=declaration(4,2); unsigned oldslot,newslot;
    struct mw_controller_binding old=reserve(&r,&d,1,0x40100000u,0,&oldslot); activate(&r,&old,oldslot);
    struct mw_controller_binding new=reserve(&r,&next,2,0x40200000u,&old,&newslot);
    struct mw_controller_job j=operation(&r,&new,MW_CTL_RESET,0);
    assert(mw_controller_start(&r,&new,&j)==MW_CTL_CLOSED); /* predecessor still active */
    disable(&r,&old,oldslot); finish(&r,&new,MW_CTL_RESET,0);
    j=operation(&r,&new,MW_CTL_RESET,1); assert(mw_controller_start(&r,&new,&j)==MW_CTL_PENDING);
    assert(mw_controller_ack(&r,&new,&j,MW_CTL_TIMEOUT)==MW_CTL_PENDING);
    assert(r.slots[oldslot].state==MW_CTL_QUARANTINED && r.slots[newslot].state==MW_CTL_QUARANTINED);
    assert(mw_controller_holds(&r,&old) && mw_controller_holds(&r,&new));
    f.closed=0; assert(mw_controller_release_job(&r,&new,&j)==MW_CTL_CLOSED);
    assert(mw_controller_ack(&r,&new,&j,1)==MW_CTL_STALE); /* unknown cannot become ready */
    f.closed=1; assert(mw_controller_release_job(&r,&new,&j)==MW_CTL_OK);
    disable(&r,&new,newslot); assert(mw_controller_retire(&r,&new)==MW_CTL_CLOSED);
    f.roots=1; assert(mw_controller_retire(&r,&new)==MW_CTL_OK); assert(mw_controller_holds(&r,&old));
    disable(&r,&old,oldslot); assert(mw_controller_retire(&r,&old)==MW_CTL_OK);
}
static void uncertain_start_and_nonce_exhaustion(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.result=-1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration d=declaration(1,1); unsigned slot;
    struct mw_controller_binding b=reserve(&r,&d,1,0x40100000u,0,&slot);
    struct mw_controller_job j=operation(&r,&b,MW_CTL_RESET,0);
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_PENDING);
    assert(r.slots[slot].state==MW_CTL_QUARANTINED && mw_controller_holds(&r,&b));
    assert(mw_controller_ack(&r,&b,&j,MW_CTL_ACK)==MW_CTL_STALE);
    assert(!mw_controller_control_write_allowed(&r,&b));
    assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_OK);
    f.result=1; disable(&r,&b,slot); f.roots=1; assert(mw_controller_retire(&r,&b)==MW_CTL_OK);
    b=reserve(&r,&d,2,0x40100000u,0,&slot); r.last_wire_sequence[0]=UINT16_MAX;
    j=operation(&r,&b,MW_CTL_RESET,0); assert(!j.wire_sequence);
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_STALE); j.wire_sequence=1;
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_STALE);
    assert(mw_controller_cancel(&r,&b)==MW_CTL_OK);
    b=reserve(&r,&d,3,0x40100000u,0,&slot); r.last_ticket=UINT32_MAX;
    j=operation(&r,&b,MW_CTL_RESET,1); assert(!j.ticket);
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_STALE);
}
static void retired_predecessor_slot_reuse(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.roots=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration first=declaration(1,1),next=declaration(1,2),other=declaration(2,3);
    unsigned oldslot,newslot,otherslot;
    struct mw_controller_binding old=reserve(&r,&first,1,0x40100000u,0,&oldslot); activate(&r,&old,oldslot);
    struct mw_controller_binding new=reserve(&r,&next,2,0x40200000u,&old,&newslot);
    disable(&r,&old,oldslot); assert(mw_controller_retire(&r,&old)==MW_CTL_CLOSED);
    assert(mw_controller_holds(&r,&old)); activate(&r,&new,newslot);
    assert(mw_controller_retire(&r,&old)==MW_CTL_OK);
    struct mw_controller_binding unrelated=reserve(&r,&other,3,0x40300000u,0,&otherslot);
    assert(otherslot==oldslot);
    assert(mw_controller_cancel(&r,&new)==MW_CTL_PENDING);
    assert(r.slots[otherslot].state==MW_CTL_BOUND && mw_controller_holds(&r,&unrelated));
}
static void lost_owner_unclosed_reset_and_corrupt_ack(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration d=declaration(2,1); unsigned slot;
    struct mw_controller_binding b=reserve(&r,&d,1,0x40100000u,0,&slot);
    struct mw_controller_job j=operation(&r,&b,MW_CTL_RESET,0);
    f.lost=1; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); assert(!f.starts);
    f.lost=0; assert(mw_controller_start(&r,&b,&j)==MW_CTL_PENDING);
    assert(mw_controller_ack(&r,&b,&j,MW_CTL_ACK)==MW_CTL_OK);
    struct mw_controller_job enable=operation(&r,&b,MW_CTL_ENABLE,0);
    assert(mw_controller_start(&r,&b,&enable)==MW_CTL_CLOSED); /* reset slot still owned */
    assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_OK);
    assert(mw_controller_start(&r,&b,&enable)==MW_CTL_PENDING);
    assert(mw_controller_ack(&r,&b,&enable,MW_CTL_ACK)==MW_CTL_OK);
    assert(mw_controller_release_job(&r,&b,&enable)==MW_CTL_OK);
    f.blocked=1; assert(mw_controller_publish(&r,&b)==MW_CTL_CLOSED);
    f.blocked=0; f.lost=1; assert(mw_controller_publish(&r,&b)==MW_CTL_CLOSED);
    f.lost=0; assert(mw_controller_publish(&r,&b)==MW_CTL_OK);
    disable(&r,&b,slot); f.roots=1; assert(mw_controller_retire(&r,&b)==MW_CTL_OK);
    b=reserve(&r,&d,2,0x40100000u,0,&slot); j=operation(&r,&b,MW_CTL_RESET,0);
    assert(mw_controller_start(&r,&b,&j)==MW_CTL_PENDING); r.slots[slot].state=255;
    assert(mw_controller_ack(&r,&b,&j,MW_CTL_ACK)==MW_CTL_PENDING);
    assert(r.slots[slot].state==MW_CTL_QUARANTINED && mw_controller_holds(&r,&b));
    assert(!mw_controller_control_write_allowed(&r,&b));
}
static void unknown_backend_proof_retains_generation(void) {
    struct fixture f={.resources=1,.closed=1,.published=1,.roots=1,.result=1,.complete=3};
    struct mw_controller_registry r; mw_controller_registry_init(&r,&backend,&f);
    struct mw_controller_declaration d=declaration(1,1); unsigned slot;
    struct mw_controller_binding b=reserve(&r,&d,1,0x40100000u,0,&slot);
    struct mw_controller_job j=operation(&r,&b,MW_CTL_RESET,0);
    f.unknown=1; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED);
    f.unknown=2; assert(mw_controller_start(&r,&b,&j)==MW_CTL_CLOSED); assert(!f.starts);
    f.unknown=0; assert(mw_controller_start(&r,&b,&j)==MW_CTL_PENDING);
    assert(mw_controller_ack(&r,&b,&j,MW_CTL_ACK)==MW_CTL_OK);
    f.unknown=4; assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_CLOSED);
    f.unknown=0; assert(mw_controller_release_job(&r,&b,&j)==MW_CTL_OK);
    finish(&r,&b,MW_CTL_RESET,1); finish(&r,&b,MW_CTL_ENABLE,0); finish(&r,&b,MW_CTL_ENABLE,1);
    f.unknown=1; assert(!mw_controller_control_write_allowed(&r,&b));
    f.unknown=2; assert(!mw_controller_control_write_allowed(&r,&b));
    f.unknown=8; assert(mw_controller_publish(&r,&b)==MW_CTL_PENDING);
    assert(r.slots[slot].state==MW_CTL_QUARANTINED && mw_controller_holds(&r,&b));
    f.unknown=0; disable(&r,&b,slot);
    f.unknown=16; assert(mw_controller_retire(&r,&b)==MW_CTL_CLOSED); assert(mw_controller_holds(&r,&b));
    f.unknown=0; assert(mw_controller_retire(&r,&b)==MW_CTL_OK);
}
int main(void) {
    for(unsigned feature=1;feature<=4;feature*=2) {
        two_origin_lifecycle(0x40100000u,feature); two_origin_lifecycle(0x40300000u,feature);
    }
    identity_and_submission_negatives(); partial_ack_quarantine();
    uncertain_start_and_nonce_exhaustion(); retired_predecessor_slot_reuse();
    lost_owner_unclosed_reset_and_corrupt_ack(); unknown_backend_proof_retains_generation(); return 0;
}
