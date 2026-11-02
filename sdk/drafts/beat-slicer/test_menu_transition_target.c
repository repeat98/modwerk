/* SPDX-License-Identifier: MIT */
/* Actual loader callback ordering with synthetic machine services. No native
 * menu detachment, source lifetime or production board integration is claimed. */
#define MODWERK_RUNTIME_METADATA_EXTERNAL
#define bs_owner_loader_target_selftest bs_transition_legacy_selftest
#include "test_menu_owner_loader_target.c"
#undef bs_owner_loader_target_selftest
static struct bs_menu_owner_backend *transition_registry;
static unsigned transition_prepares,transition_switches,transition_retired;
static unsigned transition_refuse_after;
static int (*transition_precheck)(const struct runtime_dsp *,const struct runtime_dsp *,enum runtime_metadata_operation);
int modwerk_machine_metadata_admit(const struct runtime_dsp *from,struct runtime_dsp *to,
    const struct runtime_context *context,enum runtime_metadata_operation operation) {
    (void)context;GLUE(lock_held && !mask_held);
    /* Preserve the fixture's ordinary-module-only policy. */
    to->foreign_roots=0;
    if((from->flags|to->flags)&RUNTIME_GROUP_METADATA)return RUNTIME_MALFORMED;
    if(transition_precheck){int why=transition_precheck(from,to,operation);if(why)return why;}
    if(transition_registry) {
        unsigned before=0,after=0;
        for(unsigned i=0;i<transition_registry->count;++i)
            before+=transition_registry->actions[i].lease->state==BS_MENU_OWNER_RETIRED;
        int why=bs_menu_owner_backend_transition_locked(transition_registry,from,to,operation);
        if(why)return why;
        for(unsigned i=0;i<transition_registry->count;++i)
            after+=transition_registry->actions[i].lease->state==BS_MENU_OWNER_RETIRED;
        if(operation==RUNTIME_METADATA_PREPARE){++transition_prepares;GLUE(before==after);}
        else {
            ++transition_switches;transition_retired+=after-before;
            if(from->image) {
                struct runtime_owner owner;
                GLUE(modwerk_runtime_owner_snapshot(from->image,&owner));
                GLUE(bs_menu_owner_published_locked(&owner)); /* before unpublication */
            }
            if(transition_refuse_after)return RUNTIME_BUSY;
        }
    }
    return RUNTIME_OK;
}
static int transition_install(uint32_t id,uint8_t pattern,struct runtime_owner *owner) {
    make_package(id,32,pattern);
    CHECK(modwerk_runtime_backend.prepare(0,package,package_bytes));
    uint32_t lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,owner));
    modwerk_machine_unlock(lock);
    CHECK(modwerk_runtime_backend.publish(0)==MU_APPLIED && modwerk_runtime_backend.retire(0));
    return 0;
}
static int transition_refusals(struct bs_menu_owner_backend *b,const struct runtime_owner *owner) {
    struct runtime_dsp from={0},to={0};struct bs_menu_owner_backend empty={0};
    from.image=(uint8_t *)(owner->owned_extent+owner->image_offset);
    CHECK(bs_menu_owner_backend_transition_locked(0,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_menu_owner_backend_transition_locked(&empty,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_menu_owner_backend_transition_locked(b,0,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,0,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,(enum runtime_metadata_operation)0)==RUNTIME_MALFORMED);
    uint32_t count=b->count;b->count=BS_MENU_ACTIONS+1;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);b->count=count;
    struct bs_menu_owner_lease *last=b->actions[count-1].lease;b->actions[count-1].lease=0;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);b->actions[count-1].lease=last;
    uintptr_t extent=b->actions[0].lease->owner.owned_extent;++b->actions[0].lease->owner.owned_extent;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_BUSY);b->actions[0].lease->owner.owned_extent=extent;
    from.image=(uint8_t *)(uintptr_t)1;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_BUSY);
    from.image=(uint8_t *)(owner->owned_extent+owner->image_offset);to.image=from.image;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_OK);
    to.image=0;
    CHECK(bs_menu_owner_backend_transition_locked(b,&from,&to,RUNTIME_METADATA_PREPARE)==RUNTIME_OK);
    for(unsigned i=0;i<count;++i)CHECK(b->actions[i].lease->state==BS_MENU_OWNER_LIVE);
    return 0;
}
static int transition_single(unsigned rows,unsigned failed) {
    const struct mu_backend *b=&modwerk_runtime_backend;
    const char *labels[9]={"ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE"};
    const bs_menu_callback callbacks[9]={0};
    struct runtime_owner owners[2];
    struct bs_menu_owner_lease leases[2]={0},fresh={0};
    struct bs_menu_owner_backend registry={0},replacement={0};
    struct bs_menu_owner_action bindings[3]={{&leases[0],17},{&leases[0],29},{&leases[1],17}};
    bs_menu_action actions[2]={{10,17,{0,0},"FIRST"},{20,17,{0,0},"COMPANION"}};
    bs_editor_menu menu={0};uint32_t token=0,lock,free_before=modwerk_runtime_free(0);
    CHECK(!transition_registry && !modwerk_runtime_active() && b->enter(0));
    int line=transition_install(9002,0x41,&owners[0]);if(line)return line;
    line=transition_install(9003,0x42,&owners[1]);if(line)return line;
    lock=modwerk_machine_lock();
    for(unsigned i=0;i<2;++i) {
        CHECK(bs_menu_owner_bind_locked(&leases[i],&owners[i]));
        actions[i].owner.module=owners[i].module;actions[i].owner.generation=owners[i].generation;
    }
    CHECK(bs_menu_owner_backend_bind_locked(&registry,3,bindings,receive,&dispatches));
    const bs_menu_backend *backend=bs_menu_owner_backend_get_locked(&registry);
    CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,2,actions,trampoline,backend,&token)==BS_MENU_OK);
    line=transition_refusals(&registry,&owners[0]);if(line)return line;
    transition_registry=&registry;transition_refuse_after=0;
    unsigned preparations=transition_prepares,switches=transition_switches,retired=transition_retired;
    modwerk_machine_unlock(lock);
    make_package(9002,64,0x43);CHECK(b->prepare(0,package,package_bytes));
    CHECK(transition_prepares==preparations+1 && leases[0].state==BS_MENU_OWNER_LIVE && leases[1].state==BS_MENU_OWNER_LIVE);
    transition_refuse_after=failed;
    CHECK(b->publish(0)==(failed?MU_UNCHANGED:MU_APPLIED));
    transition_refuse_after=0;
    /* No menu/lease query between replacement and restoration. */
    if(failed)CHECK(b->discard(0));else CHECK(b->restore(0));
    CHECK(transition_switches==switches+(failed?1u:2u));
    CHECK(transition_retired==retired+2); /* two actions share one retired lease */
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&owners[0]));
    CHECK(leases[0].state==BS_MENU_OWNER_RETIRED && leases[1].state==BS_MENU_OWNER_LIVE);
    dispatches=0;
    CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_STALE && !dispatches);
    CHECK(!backend->invoke(backend->context,&actions[0].owner,17) && !dispatches);
    CHECK(backend->invoke(backend->context,&actions[1].owner,17) && dispatches==1);
    CHECK(bs_menu_owner_bind_locked(&fresh,&owners[0]));bindings[0].lease=&fresh;
    CHECK(bs_menu_owner_backend_bind_locked(&replacement,1,bindings,receive,&dispatches));
    const bs_menu_backend *fresh_backend=bs_menu_owner_backend_get_locked(&replacement);
    CHECK(fresh_backend->invoke(fresh_backend->context,&actions[0].owner,17) && dispatches==2);
    /* Registry handoff is synthetic and safe only because no native callback
     * retains it in this test. Production storage/reference retirement absent. */
    transition_registry=&replacement;
    modwerk_machine_unlock(lock);
    make_package(9002,0,0);CHECK(b->prepare(0,package,package_bytes) && b->publish(0)==MU_APPLIED);
    CHECK(fresh.state==BS_MENU_OWNER_RETIRED);
    CHECK(b->retire(0));
    lock=modwerk_machine_lock();
    CHECK(!modwerk_runtime_owner_valid(&owners[0]));
    CHECK(!fresh_backend->invoke(fresh_backend->context,&actions[0].owner,17));
    transition_registry=&registry;modwerk_machine_unlock(lock);
    make_package(9003,0,0);CHECK(b->prepare(0,package,package_bytes) && b->publish(0)==MU_APPLIED);
    CHECK(leases[1].state==BS_MENU_OWNER_RETIRED && b->retire(0));
    transition_registry=0;
    CHECK(b->leave(0) && !modwerk_runtime_active() && modwerk_runtime_free(0)==free_before);
    CHECK(!lock_held && !mask_held && !machine_fault);
    return 0;
}
#include "test_menu_transition_set.h"
int bs_menu_transition_target_selftest(void) {
    int line=bs_transition_legacy_selftest();if(line)return line;
    for(unsigned rows=6;rows<=9;rows+=3)
        for(unsigned failed=0;failed<2;++failed) {
            line=transition_single(rows,failed);if(line)return line;
        }
#ifdef MODWERK_RUNTIME_SETS
    line=transition_set_checks();if(line)return line;
#endif
    CHECK(transition_prepares && transition_switches && transition_retired && !machine_fault);
    return 0;
}
