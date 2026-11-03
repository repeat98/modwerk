/* SPDX-License-Identifier: GPL-3.0-or-later
 * Actual scoped control writes: one independent lease, no DSP submissions,
 * uploaded readiness, saved-file writes, retry or caller-owned IRQ authority.
 */
#include "controller_write_lease.h"
struct write_record {
    struct runtime_owner owner;
    struct mw_controller_binding binding;
    uintptr_t storage,cached_image,exec_image; /* binding alias; alias the module code runs from */
    uint32_t original_irq,ticket,epoch,bound; /* epoch, bound: the ledger and registry Begin decided under */
    unsigned hint;
    uint16_t policy;
    uint8_t active,slot;
};
static struct write_record writing;
static uint32_t last_write_ticket;
/* Features whose trusted controller asked to write, granted or not: the board takes and clears them each tick, as a
 * sign that a track uses the feature (controller_board.c use_tick). Analog BD's renderer asks every frame for each of
 * its tracks, so a refusal while its engine is parked brings the engine back. */
volatile uint8_t modwerk_controller_lease_seen;
/* Begin's resolution of one call site, (entry, return PC, feature): the intact owner, its bound slot and trusted
 * row, or that there is none. It runs on every frame a leased hook fires, so it is kept while nothing it read can
 * have changed: the loader's owner epoch (every install, discard, reclaim, publish, restore and journal switch; never
 * kept from an odd epoch, a change under way) and the registry's last bound generation (every bind). A reserve that
 * reuses the slot zeroes its generation; the policy rows are constant. Every call still checks the stack, the
 * slot's state and jobs, the backend's per-call facts and the owner's own header (modwerk_runtime_owner_held). */
#define DECIDED 8u
enum { DECIDED_EMPTY, DECIDED_REFUSED, DECIDED_RESOLVED };
struct decided {
    uintptr_t entry,pc,image,exec;
    uint32_t feature,epoch,bound;
    struct runtime_owner owner;
    unsigned hint;
    uint16_t policy;
    uint8_t kind,slot,owned; /* owned: the backend's owns_image held for this binding and ledger */
};
static struct decided decided[DECIDED];
static unsigned decided_next;
/* Set while a Begin reads or writes the lines. The frame interrupt can run a whole Begin and End inside a task's
 * Begin (the lock is level 4): that nested one keeps its decision to itself, so neither sees a line half written. */
static volatile uint8_t deciding;
static int equal(const uint8_t *a,const uint8_t *b,unsigned n) {
    while(n--) if(*a++!=*b++) return 0;
    return 1;
}
static int trusted(const struct mw_controller_write_policy *p,const struct mw_controller_binding *b) {
    const struct mw_controller_identity *a=&p->identity,*v=&b->identity;
    return p->version && p->image_bytes && p->image_bytes==b->image_bytes &&
        p->entry<p->image_bytes && p->begin_return<p->image_bytes && p->end_return<p->image_bytes &&
        !((p->entry|p->begin_return|p->end_return)&1u) && p->begin_return!=p->end_return &&
        a->module==v->module && a->feature==v->feature && a->required_cores==v->required_cores &&
        a->policy_revision==v->policy_revision && a->state_revision==v->state_revision && a->parameter_revision==v->parameter_revision &&
        equal(a->package_sha256,v->package_sha256,32) && equal(a->source_policy_sha256,v->source_policy_sha256,32);
}
static int owner_binding(const struct runtime_owner *o,uintptr_t image,const struct mw_controller_binding *b) {
    return o->generation==b->generation && o->module==b->identity.module && image>=o->image_offset &&
        image-o->image_offset==b->canonical_extent && o->extent_bytes==b->extent_bytes &&
        o->image_offset==b->image_offset && o->image_bytes==b->image_bytes &&
        equal(o->controller_sha256,b->identity.package_sha256,32);
}
static uint32_t word(unsigned at) {
    switch(at) {
    case 0:return 0x4d574c53u;
    case 1:return writing.ticket;
    case 2:return writing.owner.generation;
    case 3:return writing.owner.module;
    case 4:return (uint32_t)writing.cached_image+modwerk_controller_write_policies[writing.policy].entry;
    case 5:return writing.binding.identity.feature;
    case 6:return (uint32_t)writing.storage;
    default:return ~writing.ticket;
    }
}
/* entry: an address inside an intact owned image, in the alias its code runs
 * from. The canonical extent comes from the loader's pool geometry only. */
int modwerk_controller_write_resolve(uintptr_t entry,struct runtime_owner *owner,uintptr_t *cached_image) {
    uintptr_t canonical;
    if(!owner || !cached_image || modwerk_runtime_owner_at(entry,owner)!=1 ||
        modwerk_runtime_owner_canonical(owner,&canonical)!=1) return 0;
    *cached_image=canonical+owner->image_offset;return 1;
}
/* The lease lies wholly in the running task's own stack, at or above the
 * caller's arguments [sp, sp+frame): the caller's storage, not ours. */
int modwerk_controller_write_stack(uintptr_t sp,uintptr_t lease,unsigned frame) {
    uintptr_t lo,hi;
    return modwerk_machine_stack(&lo,&hi)==1 && sp>=lo && sp<=hi && hi-sp>=frame+sizeof(struct mw_controller_write_lease) &&
        !(lease&3u) && lease>=sp+frame && lease<=hi-sizeof(struct mw_controller_write_lease);
}
/* shared: this Begin may use the lines; otherwise, as from an odd epoch, it decides into `local` alone. */
static struct decided *decide(uintptr_t entry,uint32_t feature,uintptr_t pc,struct decided *local,int shared) {
    const struct mw_controller_registry *r=&modwerk_controller_registry;
    uint32_t epoch=modwerk_runtime_owner_epoch(),bound=r->last_generation;
    struct decided *d=0;
    for(unsigned k=0;shared && k<DECIDED;++k) {
        struct decided *c=&decided[k];
        if(c->kind==DECIDED_EMPTY || c->entry!=entry || c->pc!=pc || c->feature!=feature) continue;
        if(c->epoch==epoch && c->bound==bound && (c->kind==DECIDED_REFUSED ||
            (r->slots[c->slot].state!=MW_CTL_EMPTY && r->slots[c->slot].binding.generation==c->owner.generation))) return c;
        d=c; break; /* stale: decide this site again in its own line */
    }
    if(!shared || (epoch&1u)) d=local;
    else if(!d) {
        for(unsigned k=0;!d && k<DECIDED;++k) if(decided[k].kind==DECIDED_EMPTY) d=&decided[k];
        if(!d) d=&decided[decided_next++%DECIDED];
    }
    *d=(struct decided){.entry=entry,.pc=pc,.feature=feature,.epoch=epoch,.bound=bound,.kind=DECIDED_REFUSED,.hint=0};
    struct runtime_owner owner;uintptr_t image;
    if(modwerk_controller_write_resolve(entry,&owner,&image)!=1 || modwerk_runtime_owner_held(&owner,&d->hint)!=1) return d;
    uintptr_t exec=owner.owned_extent+owner.image_offset;
    for(unsigned at=0;at<MW_CONTROLLER_SLOTS;++at) {
        const struct mw_controller_binding *b=&r->slots[at].binding;
        if(!owner_binding(&owner,image,b)) continue;
        for(unsigned n=0;n<modwerk_controller_write_policy_count;++n) {
            const struct mw_controller_write_policy *p=&modwerk_controller_write_policies[n];
            if(feature!=p->identity.feature || !trusted(p,b) || entry!=exec+p->entry || pc!=exec+p->begin_return) continue;
            d->owner=owner;d->image=image;d->exec=exec;d->policy=(uint16_t)n;d->slot=(uint8_t)at;d->kind=DECIDED_RESOLVED;
            return d; /* generations are unique: no other slot binds this owner */
        }
    }
    return d;
}
/* The assembly entry captures the real return PC/SP. These internal functions
 * are not module imports; native fixtures substitute captured facts only. */
static int begin_impl(uintptr_t entry,uint32_t feature,struct mw_controller_write_lease *lease,uintptr_t pc,uintptr_t sp)
    __attribute__((used,noinline));
static int begin_impl(uintptr_t entry,uint32_t feature,struct mw_controller_write_lease *lease,uintptr_t pc,uintptr_t sp) {
    uint32_t irq=modwerk_machine_lock();
    int ok=0;
    if(writing.active || !lease || last_write_ticket==UINT32_MAX || !modwerk_controller_write_policy_count ||
        modwerk_controller_write_policy_count>MW_CONTROLLER_WRITE_POLICY_CAPACITY ||
        modwerk_controller_write_stack(sp,(uintptr_t)lease,16u)!=1) goto out;
    struct mw_controller_registry *r=&modwerk_controller_registry;
    struct decided local;
    int shared=!deciding;
    deciding=1;__asm__ __volatile__("" ::: "memory");
    struct decided *d=decide(entry,feature,pc,&local,shared);
    if(d->kind==DECIDED_RESOLVED) modwerk_controller_lease_seen|=(uint8_t)feature;
    const struct mw_controller_binding *b=&r->slots[d->slot].binding;
    /* The slot's state first: a controller not yet (or no longer) writing costs no owner check. */
    ok=d->kind==DECIDED_RESOLVED && mw_controller_slot_write_allowed(r,d->slot)==1 &&
        modwerk_runtime_owner_held(&d->owner,&d->hint)==1 && (d->owned || r->backend->owns_image(r->context,b)==1);
    if(ok) {
        d->owned=1;
        writing=(struct write_record){.owner=d->owner,.binding=*b,.storage=(uintptr_t)lease,.cached_image=d->image,.exec_image=d->exec,
            .original_irq=irq,.ticket=++last_write_ticket,.epoch=d->epoch,.bound=d->bound,.hint=d->hint,.policy=d->policy,
            .active=1,.slot=d->slot};
        for(unsigned k=0;k<8u;++k) lease->opaque[k]=word(k);
    }
    __asm__ __volatile__("" ::: "memory");
    if(shared) deciding=0;
    if(ok) return 1; /* actual stable lock remains held across controller writes */
out:
    modwerk_machine_unlock(irq);return ok;
}
/* Begin's decision still stands for the held record: unchanged ledger, registry and slot binding (Begin proved
 * owns_image under them), the owner intact, and the slot still writing. Otherwise the full query. */
static int still_allowed(void) {
    struct mw_controller_registry *r=&modwerk_controller_registry;
    const struct mw_controller_slot *s=&r->slots[writing.slot];
    if(modwerk_runtime_owner_held(&writing.owner,&writing.hint)!=1) return 0;
    if(!(writing.epoch&1u) && writing.epoch==modwerk_runtime_owner_epoch() && writing.bound==r->last_generation &&
        s->state!=MW_CTL_EMPTY && s->binding.generation==writing.binding.generation)
        return mw_controller_slot_write_allowed(r,writing.slot)==1;
    return mw_controller_control_write_allowed(r,&writing.binding)==1;
}
static int end_impl(struct mw_controller_write_lease *lease,uintptr_t pc,uintptr_t sp)
    __attribute__((used,noinline));
static int end_impl(struct mw_controller_write_lease *lease,uintptr_t pc,uintptr_t sp) {
    if(!writing.active) return 0;
    /* Recover this record's original IRQ state even if caller storage, PC,
     * generation or opaque words are corrupt. Never dereference unproved RAM. */
    uint32_t irq=writing.original_irq;
    int ok=lease && (uintptr_t)lease==writing.storage &&
        modwerk_controller_write_stack(sp,(uintptr_t)lease,8u)==1 &&
        pc==writing.exec_image+modwerk_controller_write_policies[writing.policy].end_return && still_allowed();
    for(unsigned k=0;ok && k<8u;++k) ok=lease->opaque[k]==word(k);
    if(!ok) (void)mw_controller_cancel(&modwerk_controller_registry,&writing.binding); /* quarantines predecessor too */
    writing.active=0;writing.storage=0;
    modwerk_machine_unlock(irq);return ok;
}
#ifndef MODWERK_HOST
/* ColdFire C ABI, D0=result. Caller cannot pass its return PC, SP or saved SR.
 * Scratch A0 is caller-saved. No full SR restore occurs inside module code. */
__asm__(".globl modwerk_controller_write_begin\n"
"modwerk_controller_write_begin:\n"
"move.l %sp,%a0\nmove.l %a0,-(%sp)\nmove.l (%a0),-(%sp)\n"
"move.l 12(%a0),-(%sp)\nmove.l 8(%a0),-(%sp)\nmove.l 4(%a0),-(%sp)\n"
"jsr begin_impl\nlea 20(%sp),%sp\nrts\n"
".globl modwerk_controller_write_end\n"
"modwerk_controller_write_end:\n"
"move.l %sp,%a0\nmove.l %a0,-(%sp)\nmove.l (%a0),-(%sp)\nmove.l 4(%a0),-(%sp)\n"
"jsr end_impl\nlea 12(%sp),%sp\nrts\n");
#endif
