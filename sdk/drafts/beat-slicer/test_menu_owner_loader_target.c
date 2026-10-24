/* SPDX-License-Identifier: MIT */
/* Original synthetic machine services and menu scenarios around the unchanged
 * GPL loader/SHA sources. Runs on host or ColdFire; uploaded code never runs. */
#include <stddef.h>
#ifdef __m68k__
void *memcpy(void *to,const void *from,size_t n) {
    unsigned char *d=to;const unsigned char *s=from;
    for(size_t i=0;i<n;++i)d[i]=s[i];
    return to;
}
void *memset(void *to,int value,size_t n) {
    unsigned char *d=to;for(size_t i=0;i<n;++i)d[i]=(unsigned char)value;return to;
}
#else
#include <string.h>
#endif
#include "../../runtime/loader/loader.c"
#include "../../runtime/upload/sha256.c"
#include "menu_owner_backend.h"
#include "owner_package_vectors.h"
#define CHECK(x) do { if(!(x))return __LINE__; } while(0)
static unsigned machine_fault,lock_held,mask_held,locks,masks,contexts,flushes;
#define GLUE(x) do { if(!(x) && !machine_fault)machine_fault=__LINE__; } while(0)
int modwerk_machine_stopped(void) {return 1;}
void *modwerk_machine_uncached(void *p) {return p;}
void modwerk_machine_invalidate_code(void) {}
int modwerk_machine_patchable(uint32_t a,uint32_t n) {(void)a;(void)n;return 0;}
uint8_t *modwerk_machine_code(uint32_t a) {
    static uint8_t unexpected[32];(void)a;GLUE(0);return unexpected;
}
void modwerk_machine_flush_data(uint32_t a,uint32_t n) {(void)a;(void)n;++flushes;}
uint32_t modwerk_machine_mask(void) {GLUE(lock_held && !mask_held);mask_held=1;++masks;return 7;}
void modwerk_machine_unmask(uint32_t sr) {GLUE(lock_held && mask_held && sr==7);mask_held=0;}
uint32_t modwerk_machine_lock(void) {GLUE(!lock_held && !mask_held);lock_held=1;++locks;return 4;}
void modwerk_machine_unlock(uint32_t sr) {GLUE(lock_held && !mask_held && sr==4);lock_held=0;}
unsigned modwerk_machine_paused(struct runtime_span *spans,unsigned max,const struct runtime_context *context) {
    (void)spans;(void)max;GLUE(lock_held);
#ifdef __m68k__
    GLUE(context && context->registers[15]);if(context)++contexts;
#else
    (void)context;
#endif
    /* Synthetic machine has no tasks or consumers in uploaded module memory.
     * This is NOT a native Octatrack reachability/retirement implementation. */
    return 0;
}
int modwerk_machine_dsp_admit(const struct runtime_dsp *from,struct runtime_dsp *to) {
    GLUE(lock_held && !mask_held);GLUE(!from->count && !to->count);return 0;
}
void modwerk_machine_dsp_switch(const struct runtime_dsp *from,const struct runtime_dsp *to) {
    GLUE(lock_held && !mask_held && !from->count && !to->count);
}
static uint8_t package[256];
static uint32_t package_bytes;
static void make_package(uint32_t id,uint32_t image,uint8_t pattern) {
    for(unsigned i=0;i<sizeof package;++i)package[i]=0;
    package[0]='M';package[1]='W';package[2]='R';package[3]='M';package[5]=10;
    put32(package+8,image);put32(package+12,image?16:0);
    put32(package+20,RUNTIME_EVENTS);put32(package+28,id);
    for(unsigned i=0;i<RUNTIME_EVENTS;++i)put32(package+RUNTIME_HEADER_BYTES+4*i,RUNTIME_NONE);
    package_bytes=RUNTIME_HEADER_BYTES+4*RUNTIME_EVENTS+image;
    for(unsigned i=RUNTIME_HEADER_BYTES+4*RUNTIME_EVENTS;i<package_bytes;++i)package[i]=pattern;
}
static int expected_identity(const struct runtime_owner *owner,unsigned which) {
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i)
        if(owner->package_sha256[i]!=bs_expected_packages[which][i] ||
           owner->controller_sha256[i]!=bs_expected_controllers[which][i])return 0;
    return 1;
}
static unsigned dispatches;
static uint32_t last_module,last_action;
static int receive(void *context,const struct runtime_owner *owner,uint32_t action) {
    GLUE(context==&dispatches && lock_held && !mask_held);
    GLUE(bs_menu_owner_published_locked(owner) && (action==17 || action==29));
    ++dispatches;last_module=owner->module;last_action=action;return 1;
}
static void trampoline(void) {}
#include "test_menu_owner_set.h"
int bs_owner_loader_target_selftest(void) {
    (void)contexts;
    const struct mu_backend *backend=&modwerk_runtime_backend;
    for(unsigned rows=6;rows<=9;rows+=3) {
        uint32_t free_before=modwerk_runtime_free(0),token=0,lock;
        struct runtime_owner old_owner,other_owner,new_owner;
        struct bs_menu_owner_lease old={0},other={0},fresh={0};
        struct bs_menu_owner_backend registry={0},new_registry={0};
        struct bs_menu_owner_action bindings[3]={{&old,17},{&old,29},{&other,17}};
        bs_menu_action actions[3]={{20,17,{0,0},"FIRST"},{10,29,{0,0},"SECOND"},{30,17,{0,0},"COMPANION"}};
        bs_editor_menu menu={0};
        const char *labels[9]={"ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE"};
        const bs_menu_callback callbacks[9]={0};
        CHECK(modwerk_runtime_active()==0 && backend->enter(0));
        make_package(9002,32,0x41);CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&old_owner));
        CHECK(expected_identity(&old_owner,0));
        CHECK(modwerk_runtime_owner_valid(&old_owner) && !bs_menu_owner_published_locked(&old_owner));
        CHECK(!bs_menu_owner_bind_locked(&old,&old_owner));modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED && backend->retire(0));
        make_package(9003,32,0x42);CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&other_owner));CHECK(expected_identity(&other_owner,1));modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED && backend->retire(0));
        lock=modwerk_machine_lock();CHECK(bs_menu_owner_bind_locked(&old,&old_owner));
        CHECK(bs_menu_owner_bind_locked(&other,&other_owner));
        for(unsigned field=0;field<8;++field) {
            struct runtime_owner wrong=old_owner;
            if(field==0)++wrong.generation;
            if(field==1)++wrong.module;
            if(field==2)++wrong.owned_extent;
            if(field==3)++wrong.extent_bytes;
            if(field==4)++wrong.image_offset;
            if(field==5)++wrong.image_bytes;
            if(field==6)wrong.package_sha256[0]^=1;
            if(field==7)wrong.controller_sha256[0]^=1;
            CHECK(!bs_menu_owner_published_locked(&wrong));
        }
        for(unsigned i=0;i<3;++i) {
            const struct runtime_owner *o=i==2?&other_owner:&old_owner;
            actions[i].owner.module=o->module;actions[i].owner.generation=o->generation;
        }
        CHECK(bs_menu_owner_backend_bind_locked(&registry,3,bindings,receive,&dispatches));
        const bs_menu_backend *menu_backend=bs_menu_owner_backend_get_locked(&registry);CHECK(menu_backend);
        dispatches=0;
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,3,actions,trampoline,menu_backend,&token)==BS_MENU_OK);
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_OK);
        CHECK(dispatches==1 && last_action==29 && last_module==9002);
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_STALE && dispatches==1);
        /* Only this synthetic menu model has no retained stock references. */
        CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,3,actions,trampoline,menu_backend,&token)==BS_MENU_OK);
        modwerk_machine_unlock(lock);
        make_package(9002,64,0x43);CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&new_owner));CHECK(expected_identity(&new_owner,2));
        CHECK(new_owner.generation!=old_owner.generation && !bs_menu_owner_published_locked(&new_owner));modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED);
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_valid(&old_owner));
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_STALE && dispatches==1);
        CHECK(old.state==BS_MENU_OWNER_RETIRED);
        modwerk_machine_unlock(lock);CHECK(backend->restore(0));
        lock=modwerk_machine_lock();CHECK(bs_menu_owner_published_locked(&old_owner));
        CHECK(!menu_backend->invoke(menu_backend->context,&actions[0].owner,17) && dispatches==1);
        CHECK(bs_menu_owner_bind_locked(&fresh,&old_owner));bindings[0].lease=&fresh;
        CHECK(bs_menu_owner_backend_bind_locked(&new_registry,1,bindings,receive,&dispatches));
        const bs_menu_backend *new_backend=bs_menu_owner_backend_get_locked(&new_registry);
        CHECK(new_backend->invoke(new_backend->context,&actions[0].owner,17) && dispatches==2);
        bs_menu_owner_retire_locked(&fresh);modwerk_machine_unlock(lock);
        make_package(9002,64,0x44);CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&new_owner));
        CHECK(expected_identity(&new_owner,3));modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED && backend->restore(0));
        lock=modwerk_machine_lock();CHECK(bs_menu_owner_published_locked(&old_owner));
        CHECK(!new_backend->invoke(new_backend->context,&actions[0].owner,17) && dispatches==2);modwerk_machine_unlock(lock);
        make_package(9002,0,0);CHECK(backend->prepare(0,package,package_bytes) && backend->publish(0)==MU_APPLIED);
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_valid(&old_owner) && !bs_menu_owner_published_locked(&old_owner));
        CHECK(menu_backend->invoke(menu_backend->context,&actions[2].owner,17) && dispatches==3);
        CHECK(last_module==9003 && last_action==17);modwerk_machine_unlock(lock);
        CHECK(backend->retire(0));
        lock=modwerk_machine_lock();CHECK(!modwerk_runtime_owner_valid(&old_owner));modwerk_machine_unlock(lock);
        make_package(9003,0,0);CHECK(backend->prepare(0,package,package_bytes) && backend->publish(0)==MU_APPLIED);
        lock=modwerk_machine_lock();CHECK(!menu_backend->invoke(menu_backend->context,&actions[2].owner,17) && dispatches==3);modwerk_machine_unlock(lock);
        CHECK(backend->retire(0) && backend->leave(0));
        CHECK(modwerk_runtime_active()==0 && modwerk_runtime_free(0)==free_before);
        CHECK(!lock_held && !mask_held && locks && masks);
        if(machine_fault)return (int)machine_fault;
    }
#ifdef __m68k__
    CHECK(contexts);
#endif
#ifdef MODWERK_RUNTIME_SETS
    {int line=owner_set_checks();if(line)return line;}
#endif
    return 0;
}
