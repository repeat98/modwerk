/* SPDX-License-Identifier: MIT */
/* Original adapter tests around the unchanged GPL runtime host fixture.
 * Machine glue and menu detachment are synthetic; no module code executes. */
#define main bs_upstream_loader_main
#include "../../runtime/loader/tests/host_test.c"
#undef main
#include "menu_owner_backend.h"
static unsigned dispatches;
static uint32_t dispatched_action,dispatched_generation,dispatched_module;
static int accept_dispatch=1;
static int dispatch(void *context,const struct runtime_owner *owner,uint32_t action) {
    CHECK(context==&dispatches && locked && !masked);
    CHECK(modwerk_runtime_owner_valid(owner) && bs_menu_owner_published_locked(owner));
    CHECK(action==17 || action==29);
    ++dispatches;dispatched_action=action;dispatched_generation=owner->generation;dispatched_module=owner->module;
    return accept_dispatch;
}
static void trampoline(void) {}
static int adapter_checks(void) {
    const struct mu_backend *b=&modwerk_runtime_backend;
    unsigned active_before=modwerk_runtime_active();uint32_t free_before=modwerk_runtime_free(0),token=0;
    struct runtime_owner first_owner,companion_owner;
    struct bs_menu_owner_lease first={0},duplicate={0},restored={0},companion={0};
    struct bs_menu_owner_backend registry={0},bad={0},empty={0},fresh={0};
    bs_editor_menu menu={0};
    const char *labels[6]={"ONE","TWO","THREE","FOUR","FIVE","SIX"};
    const bs_menu_callback callbacks[6]={0};
    struct bs_menu_owner_action entries[3]={{&first,17},{&first,29},{&companion,17}};
    bs_menu_action actions[3]={{20,17,{0,0},"FIRST"},{10,29,{0,0},"SECOND"},{30,17,{0,0},"COMPANION"}};
    CHECK(!bs_menu_owner_backend_get_locked(0));
    CHECK(!bs_menu_owner_backend_get_locked(&registry));
    CHECK(b->enter(0));id=9002;begin(32,16,0,0,0,0,0x74);
    CHECK(b->prepare(0,p,n));
    uint32_t lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&first_owner));
    modwerk_machine_unlock(lock);
    CHECK(b->publish(0)==MU_APPLIED && b->retire(0));
    lock=modwerk_machine_lock();
    CHECK(first_owner.module==9002 && bs_menu_owner_bind_locked(&first,&first_owner));
    modwerk_machine_unlock(lock);
    id=9003;begin(32,16,0,0,0,0,0x77);CHECK(b->prepare(0,p,n));
    lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&companion_owner));
    modwerk_machine_unlock(lock);CHECK(b->publish(0)==MU_APPLIED && b->retire(0));
    lock=modwerk_machine_lock();CHECK(bs_menu_owner_bind_locked(&companion,&companion_owner));
    id=9002;
    CHECK(bs_menu_owner_bind_locked(&duplicate,&first_owner));
    CHECK(!bs_menu_owner_backend_bind_locked(0,2,entries,dispatch,&dispatches));
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,0,entries,dispatch,&dispatches));
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,BS_MENU_ACTIONS+1,entries,dispatch,&dispatches));
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,0,dispatch,&dispatches));
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,entries,0,&dispatches));
    entries[1].action=17;
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,entries,dispatch,&dispatches));
    entries[1].action=29;entries[1].lease=&duplicate;
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,entries,dispatch,&dispatches));
    entries[1].lease=0;
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,entries,dispatch,&dispatches));
    entries[1].lease=&first;entries[1].action=0;
    CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,entries,dispatch,&dispatches));
    entries[1].action=29;CHECK(!memcmp(&bad,&empty,sizeof bad));
    CHECK(bs_menu_owner_backend_bind_locked(&registry,3,entries,dispatch,&dispatches));
    CHECK(!bs_menu_owner_backend_bind_locked(&registry,3,entries,dispatch,&dispatches));
    const bs_menu_backend *backend=bs_menu_owner_backend_get_locked(&registry);CHECK(backend);
    for(unsigned i=0;i<2;++i) {
        actions[i].owner.module=first_owner.module;actions[i].owner.generation=first_owner.generation;
    }
    actions[2].owner.module=companion_owner.module;actions[2].owner.generation=companion_owner.generation;
    bs_menu_owner wrong=actions[0].owner;wrong.generation++;
    CHECK(!backend->owner_valid(backend->context,&wrong));
    CHECK(!backend->owner_valid(backend->context,0));
    CHECK(!backend->invoke(backend->context,&actions[0].owner,999));
    CHECK(!backend->invoke(backend->context,&actions[0].owner,0));
    CHECK(!dispatches);
    /* Binding records are copied: changing the caller's array has no effect. */
    entries[0].action=999;entries[1].lease=0;
    CHECK(bs_menu_open_locked(&menu,6,labels,callbacks,3,actions,trampoline,backend,&token)==BS_MENU_OK);
    CHECK(!strcmp(menu.labels[6],"SECOND") && !strcmp(menu.labels[7],"FIRST"));
    CHECK(bs_menu_dispatch_locked(&menu,token,6)==BS_MENU_OK);
    CHECK(dispatches==1 && dispatched_action==29 && dispatched_generation==first_owner.generation && dispatched_module==9002);
    CHECK(bs_menu_dispatch_locked(&menu,token,7)==BS_MENU_STALE && dispatches==1);
    /* The host fixture has no native retained references; only this model may
     * acknowledge immediate detachment. This does not establish stock detach. */
    CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
    CHECK(bs_menu_open_locked(&menu,6,labels,callbacks,3,actions,trampoline,backend,&token)==BS_MENU_OK);
    accept_dispatch=0;CHECK(bs_menu_dispatch_locked(&menu,token,7)==BS_MENU_CALLBACK_FAILED);
    CHECK(dispatches==2 && dispatched_action==17);accept_dispatch=1;
    CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
    CHECK(bs_menu_open_locked(&menu,6,labels,callbacks,3,actions,trampoline,backend,&token)==BS_MENU_OK);
    modwerk_machine_unlock(lock);
    begin(64,16,0,0,0,0,0x75);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_valid(&first_owner));
    CHECK(bs_menu_dispatch_locked(&menu,token,6)==BS_MENU_STALE && dispatches==2);
    CHECK(first.state==BS_MENU_OWNER_RETIRED);
    CHECK(!backend->invoke(backend->context,&actions[0].owner,17) && dispatches==2);
    modwerk_machine_unlock(lock);CHECK(b->restore(0));
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&first_owner));
    CHECK(!backend->owner_valid(backend->context,&actions[0].owner));
    CHECK(!backend->invoke(backend->context,&actions[0].owner,29) && dispatches==2);
    CHECK(bs_menu_owner_bind_locked(&restored,&first_owner));
    entries[0].lease=&restored;entries[0].action=17;
    CHECK(bs_menu_owner_backend_bind_locked(&fresh,1,entries,dispatch,&dispatches));
    const bs_menu_backend *new_backend=bs_menu_owner_backend_get_locked(&fresh);
    CHECK(new_backend->invoke(new_backend->context,&actions[0].owner,17) && dispatches==3);
    bs_menu_owner_retire_locked(&restored);
    modwerk_machine_unlock(lock);
    begin(64,16,0,0,0,0,0x76);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->restore(0));
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&first_owner));
    CHECK(!new_backend->invoke(new_backend->context,&actions[0].owner,17) && dispatches==3);
    modwerk_machine_unlock(lock);
    begin(0,0,RUNTIME_NONE,0,0,0,0);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();
    CHECK(!new_backend->owner_valid(new_backend->context,&actions[0].owner));
    CHECK(!backend->invoke(backend->context,&actions[0].owner,29) && dispatches==3);
    CHECK(backend->owner_valid(backend->context,&actions[2].owner));
    CHECK(backend->invoke(backend->context,&actions[2].owner,17) && dispatches==4);
    CHECK(dispatched_module==9003 && dispatched_generation==companion_owner.generation && dispatched_action==17);
    modwerk_machine_unlock(lock);CHECK(b->retire(0));
    id=9003;begin(0,0,RUNTIME_NONE,0,0,0,0);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();CHECK(!backend->invoke(backend->context,&actions[2].owner,17) && dispatches==4);
    modwerk_machine_unlock(lock);CHECK(b->retire(0) && b->leave(0));
    CHECK(modwerk_runtime_active()==active_before && modwerk_runtime_free(0)==free_before);
    CHECK(!masked && !locked);
    return failures?1:0;
}
int main(void) {
    if(bs_upstream_loader_main())return 1;
    if(adapter_checks())return 1;
    puts("PASS: full-owner menu backend with real host loader; copied action allowlist, two coexisting owners sharing an action ID, sorted dispatch, callback refusal, replacement/restoration/removal and permanent retirement; no native menu/USB qualification");
    return 0;
}
