/* SPDX-License-Identifier: MIT */
/* Real loader lifecycle plus synthetic PCM and serialized source boundaries.
 * No stock addresses, source admission, native menu or USB execution. */
#include "test_menu_transition_target.c"
#undef CHECK
#include "test_preview_async.c"
#include "preview_owner.h"
static struct fixture companion_preview,fresh_preview,second_preview;
static struct bs_preview_owner_binding preview_bindings[3];
static unsigned preview_transition_calls,preview_binding_count;
static int preview_precheck(const struct runtime_dsp *from,const struct runtime_dsp *to,
    enum runtime_metadata_operation operation) {
    GLUE(lock_held && !mask_held);
    uint32_t captures=f.captures+companion_preview.captures+fresh_preview.captures+second_preview.captures;
    uint32_t copies=f.copies+companion_preview.copies+fresh_preview.copies+second_preview.copies;
    ++preview_transition_calls;
    int result=bs_preview_owner_transition_locked(preview_binding_count,preview_bindings,from,to,operation);
    GLUE(captures==f.captures+companion_preview.captures+fresh_preview.captures+second_preview.captures);
    GLUE(copies==f.copies+companion_preview.copies+fresh_preview.copies+second_preview.copies);
    return result;
}
static int owned_setup(struct fixture *p,const struct runtime_owner *owner) {
    clear(p,sizeof(*p));bs_guard_init(&p->guard);CHECK(bs_guard_enable(&p->guard));
    p->live.owner_id=owner->module;p->live.owner_generation=owner->generation;
    p->live.sample_id=9;p->live.sample_generation=10;p->live.editor_generation=11;p->live.playback_generation=12;
    p->live.kind=BS_SOURCE_FLEX;p->live.slot=3;p->live.frames=p->live.trim_end=4096;p->live.sample_rate=8000;
    p->live.loop=UINT32_MAX;p->live.format.bits=24;p->live.format.channels=2;
    p->live.sample_bpm24=2880;p->live.project_bpm24=2160;
    CHECK(bs_async_init(&p->async,&p->guard,&backend,p,owner->module,owner->generation));return 0;
}
static uint32_t owned_finish(struct fixture *p) {
    uint32_t state=BS_SESSION_RUNNING;
    for(unsigned i=0;i<20000 && (state==BS_SESSION_RUNNING || state==BS_SESSION_WAITING);++i)
        state=bs_async_service(&p->async,8);
    return state;
}
static int owned_result(struct fixture *p,uint32_t request) {
    struct bs_request input={8000,0,4096,2880,2160,1,0,0,0,1,read_oracle,p};
    struct bs_plan expected;struct bs_async_result result;
    CHECK(bs_preview(&input,&expected)==BS_OK);
    CHECK(bs_async_result(&p->async,p->async.owner,p->async.generation,request,&result));
    CHECK(result.request==request && equal(&result.plan,&expected,sizeof(expected)));
    return 0;
}
static int owned_refusals(const struct runtime_owner *owner) {
    struct runtime_dsp from={0},to={0};from.image=(uint8_t *)(owner->owned_extent+owner->image_offset);
    CHECK(bs_preview_owner_transition_locked(BS_PREVIEW_OWNER_BINDINGS+1,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_preview_owner_transition_locked(1,0,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,0,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,0,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,(enum runtime_metadata_operation)0)==RUNTIME_MALFORMED);
    struct bs_menu_owner_lease *lease=preview_bindings[0].lease;preview_bindings[0].lease=0;
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);preview_bindings[0].lease=lease;
    struct bs_preview_async *first=preview_bindings[0].preview;preview_bindings[0].preview=preview_bindings[1].preview;
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);preview_bindings[0].preview=first;
    struct bs_preview_owner_binding second=preview_bindings[1];preview_bindings[1]=preview_bindings[0];
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_MALFORMED);preview_bindings[1]=second;
    uintptr_t extent=lease->owner.owned_extent;++lease->owner.owned_extent;
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_BUSY);lease->owner.owned_extent=extent;
    CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_PREPARE)==RUNTIME_OK);
    to.image=from.image;CHECK(bs_preview_owner_transition_locked(2,preview_bindings,&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_OK);
    CHECK(!f.async.revoked && !companion_preview.async.revoked && !f.captures && !f.copies && !companion_preview.captures && !companion_preview.copies);
    return 0;
}
static int owned_case(unsigned state,unsigned removal,unsigned deny) {
    const struct mu_backend *loader=&modwerk_runtime_backend;
    struct runtime_owner owners[2];struct bs_menu_owner_lease leases[2]={0},fresh={0};
    struct bs_menu_owner_backend registry={0},fresh_registry={0};
    struct bs_menu_owner_action actions[2]={{&leases[0],17},{&leases[1],17}};
    struct bs_preview_options options={1,1,0};
    uint32_t free_before=modwerk_runtime_free(0),lock;
    CHECK(!transition_precheck && !transition_registry && !modwerk_runtime_active() && loader->enter(0));
    int line=transition_install(9002,0x41,&owners[0]);if(line)return line;
    line=transition_install(9003,0x42,&owners[1]);if(line)return line;
    lock=modwerk_machine_lock();
    for(unsigned i=0;i<2;++i)CHECK(bs_menu_owner_bind_locked(&leases[i],&owners[i]));
    CHECK(bs_menu_owner_backend_bind_locked(&registry,2,actions,receive,&dispatches));
    modwerk_machine_unlock(lock);
    line=owned_setup(&f,&owners[0]);if(line)return line;
    line=owned_setup(&companion_preview,&owners[1]);if(line)return line;
    preview_binding_count=2;
    preview_bindings[0]=(struct bs_preview_owner_binding){&leases[0],&f.async};
    preview_bindings[1]=(struct bs_preview_owner_binding){&leases[1],&companion_preview.async};
    lock=modwerk_machine_lock();line=owned_refusals(&owners[0]);if(line)return line;modwerk_machine_unlock(lock);
    uint32_t request=bs_async_request(&f.async,owners[0].module,owners[0].generation,&options);
    uint32_t companion_request=bs_async_request(&companion_preview.async,owners[1].module,owners[1].generation,&options);
    CHECK(request && companion_request);
    if(state==0) {
        uint32_t phase=BS_SESSION_RUNNING;
        for(unsigned i=0;i<16 && !f.copies;++i)phase=bs_async_service(&f.async,1);
        CHECK(f.copies && phase==BS_SESSION_RUNNING);
    } else if(state==1) {
        f.pending=1;CHECK(bs_async_service(&f.async,1)==BS_SESSION_WAITING && !f.copies);
    } else {
        CHECK(owned_finish(&f)==BS_SESSION_READY);line=owned_result(&f,request);if(line)return line;
    }
    if(deny==2) {
        line=owned_setup(&second_preview,&owners[0]);if(line)return line;
        CHECK(bs_async_request(&second_preview.async,owners[0].module,owners[0].generation,&options));
        preview_bindings[1]=(struct bs_preview_owner_binding){&leases[0],&second_preview.async};
    }
    transition_registry=&registry;transition_precheck=preview_precheck;
    uint32_t captures=f.captures,copies=f.copies,companion_copies=companion_preview.copies;
    make_package(9002,removal?0:64,0x43);CHECK(loader->prepare(0,package,package_bytes));
    CHECK(!f.async.revoked && leases[0].state==BS_MENU_OWNER_LIVE);
    if(deny) {
        if(deny==2)second_preview.denied=1;else f.denied=1;
        CHECK(loader->publish(0)==MU_UNCHANGED);
        CHECK(f.async.revoked==(deny==2) && leases[0].state==BS_MENU_OWNER_LIVE && !companion_preview.async.revoked);
        if(deny==2)CHECK(!second_preview.async.revoked && !second_preview.denied &&
            !bs_async_request(&f.async,owners[0].module,owners[0].generation,&options));
        CHECK(f.captures==captures && f.copies==copies && !f.denied);
        CHECK(loader->discard(0));
        make_package(9002,removal?0:64,0x43);CHECK(loader->prepare(0,package,package_bytes));
    }
    CHECK(loader->publish(0)==MU_APPLIED && loader->restore(0));
    /* No preview/lease query between publication and restoration. */
    CHECK(f.async.revoked && leases[0].state==BS_MENU_OWNER_RETIRED);
    if(deny==2)CHECK(second_preview.async.revoked && !bs_async_request(&second_preview.async,owners[0].module,owners[0].generation,&options));
    CHECK(!companion_preview.async.revoked && leases[1].state==BS_MENU_OWNER_LIVE);
    CHECK(f.captures==captures && f.copies==copies && companion_preview.copies==companion_copies);
    f.pending=0;
    CHECK(bs_async_state(&f.async,owners[0].module,owners[0].generation,request)==BS_SESSION_CANCELLED);
    struct bs_async_result untouched,before;clear(&untouched,sizeof untouched);untouched.request=0x12345678u;copy(&before,&untouched,sizeof before);
    CHECK(!bs_async_result(&f.async,owners[0].module,owners[0].generation,request,&untouched));
    CHECK(equal(&untouched,&before,sizeof before));
    CHECK(!bs_async_request(&f.async,owners[0].module,owners[0].generation,&options));
    CHECK(bs_async_service(&f.async,8)==BS_SESSION_CANCELLED && f.captures==captures && f.copies==copies);
    CHECK(owned_finish(&companion_preview)==BS_SESSION_READY);
    line=owned_result(&companion_preview,companion_request);if(line)return line;
    lock=modwerk_machine_lock();CHECK(bs_menu_owner_published_locked(&owners[0]));
    CHECK(bs_menu_owner_bind_locked(&fresh,&owners[0]));actions[0].lease=&fresh;
    CHECK(bs_menu_owner_backend_bind_locked(&fresh_registry,2,actions,receive,&dispatches));modwerk_machine_unlock(lock);
    line=owned_setup(&fresh_preview,&owners[0]);if(line)return line;
    /* Fresh base-owned storage; old activation/storage remain pinned and revoked. */
    preview_bindings[0]=(struct bs_preview_owner_binding){&fresh,&fresh_preview.async};
    preview_bindings[1]=(struct bs_preview_owner_binding){&leases[1],&companion_preview.async};transition_registry=&fresh_registry;
    uint32_t fresh_request=bs_async_request(&fresh_preview.async,owners[0].module,owners[0].generation,&options);
    CHECK(fresh_request && owned_finish(&fresh_preview)==BS_SESSION_READY);
    line=owned_result(&fresh_preview,fresh_request);if(line)return line;
    CHECK(f.async.revoked && !bs_async_request(&f.async,owners[0].module,owners[0].generation,&options));
    for(unsigned i=0;i<2;++i) {
        make_package(9002+i,0,0);
        CHECK(loader->prepare(0,package,package_bytes) && loader->publish(0)==MU_APPLIED && loader->retire(0));
    }
    CHECK(fresh_preview.async.revoked && companion_preview.async.revoked);
    transition_precheck=0;transition_registry=0;
    CHECK(loader->leave(0) && !modwerk_runtime_active() && modwerk_runtime_free(0)==free_before);
    CHECK(f.locks==f.unlocks && companion_preview.locks==companion_preview.unlocks && fresh_preview.locks==fresh_preview.unlocks);
    if(deny==2)CHECK(second_preview.locks==second_preview.unlocks && !second_preview.bad && !second_preview.copies);
    CHECK(!f.bad && !companion_preview.bad && !fresh_preview.bad && !machine_fault && !lock_held && !mask_held);
    return 0;
}
#include "test_preview_owner_set.h"
int bs_preview_owner_target_selftest(void) {
    int line=bs_menu_transition_target_selftest();if(line)return line;
    for(unsigned state=0;state<3;++state)for(unsigned removal=0;removal<2;++removal)for(unsigned deny=0;deny<3;++deny) {
        line=owned_case(state,removal,deny);if(line)return line;
    }
#ifdef MODWERK_RUNTIME_SETS
    line=preview_owner_set_checks();if(line)return line;
#endif
    CHECK(preview_transition_calls && !transition_precheck && !transition_registry);
    return 0;
}
