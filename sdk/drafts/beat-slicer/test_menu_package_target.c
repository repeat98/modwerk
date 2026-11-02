/* SPDX-License-Identifier: MIT */
/* Real loader with synthetic machine services, as in the earlier owner tests.
 * Uploaded test code is original: moveq #42,d0; rts. It is not stock firmware.
 */
#define bs_owner_loader_target_selftest bs_owner_legacy_selftest
#include "test_menu_owner_loader_target.c"
#undef bs_owner_loader_target_selftest
#include "menu_package.h"
#include "menu_package_vectors.h"
enum { PACKAGE_IMAGE=112, RECORD=32, ACTION=73, KEY=51, CASES=30 };
static int same_bytes(const void *a,const void *b,unsigned n) {
    const uint8_t *x=a,*y=b;
    for(unsigned i=0;i<n;++i)if(x[i]!=y[i])return 0;
    return 1;
}
static void descriptor(uint8_t *image) {
    /* Preserve the loader-populated API preamble when resetting live fixtures. */
    for(unsigned i=8;i<PACKAGE_IMAGE;++i)image[i]=0;
    image[8]=0x70;image[9]=42;image[10]=0x4e;image[11]=0x75;
    uint8_t *p=image+RECORD;
    put32(p,1);put32(p+4,BS_MENU_PACKAGE_BYTES);put32(p+8,KEY);
    put32(p+12,ACTION);put32(p+16,8);
    const char label[]="BEAT GRID";
    for(unsigned i=0;i<sizeof label;++i)p[24+i]=(uint8_t)label[i];
}
static int package_receive(void *context,const struct runtime_owner *owner,uint32_t action) {
    struct bs_menu_package_action *binding=context;
    uintptr_t entry=0;
    GLUE(lock_held && !mask_held && owner->generation==binding->lease.owner.generation);
    if(!bs_menu_package_entry_locked(binding,action,&entry))return 0;
    GLUE(entry==owner->owned_extent+owner->image_offset+8);
#ifdef __m68k__
    /* Actual call into the image reconstructed/published by the real loader.
     * Cache, task and DSP services are still synthetic, not a USB/device test. */
    if(((int (*)(void))entry)()!=42)return 0;
#endif
    ++dispatches;return 1;
}
static int malformed_records(struct runtime_owner *owner) {
    uint8_t *image=(uint8_t *)(owner->owned_extent+owner->image_offset);
    for(unsigned k=0;k<CASES;++k) {
        descriptor(image);
        uint8_t *p=image+RECORD;
        uint32_t offset=RECORD;
        struct bs_menu_package_action binding,before;
        memset(&binding,0xa5,sizeof binding);binding.lease.state=BS_MENU_OWNER_EMPTY;
        memcpy(&before,&binding,sizeof before);
        switch(k) {
        case 0:put32(p,0);break;
        case 1:put32(p,2);break;
        case 2:put32(p+4,63);break;
        case 3:put32(p+4,65);break;
        case 4:put32(p+8,0);break;
        case 5:put32(p+12,0);break;
        case 6:put32(p+16,0);break;
        case 7:put32(p+16,6);break;
        case 8:put32(p+16,9);break;
        case 9:put32(p+16,PACKAGE_IMAGE);break;
        case 10:put32(p+16,PACKAGE_IMAGE-1);break;
        case 11:put32(p+16,UINT32_MAX);break;
        case 12:put32(p+16,RECORD);break;
        case 13:put32(p+16,RECORD+BS_MENU_PACKAGE_BYTES-2);break;
        case 14:put32(p+20,1);break;
        case 15:put32(p+56,1);break;
        case 16:put32(p+60,1);break;
        case 17:p[24]=0;break;
        case 18:p[24]=31;break;
        case 19:p[24]=127;break;
        case 20:p[24]=255;break;
        case 21:for(unsigned i=0;i<32;++i)p[24+i]='X';break;
        case 22:p[55]=1;break;
        case 23:offset=0;break;
        case 24:offset=RECORD+1;break;
        case 25:offset=PACKAGE_IMAGE;break;
        case 26:offset=PACKAGE_IMAGE+4;break;
        case 27:offset=UINT32_MAX;break;
        case 28:offset=PACKAGE_IMAGE-BS_MENU_PACKAGE_BYTES+4;break;
        case 29:offset=4;break;
        }
        CHECK(!bs_menu_package_bind_locked(&binding,owner,offset));
        CHECK(same_bytes(&binding,&before,sizeof binding));
    }
    descriptor(image);
    /* Complete owner validation must precede pointer arithmetic/dereferencing. */
    for(unsigned k=0;k<8;++k) {
        struct runtime_owner wrong=*owner;
        struct bs_menu_package_action binding={0},before={0};
        if(k==0)++wrong.generation;
        if(k==1)++wrong.module;
        if(k==2)wrong.owned_extent=UINTPTR_MAX-1u;
        if(k==3)wrong.extent_bytes=UINT32_MAX;
        if(k==4)wrong.image_offset=UINT32_MAX;
        if(k==5)wrong.image_bytes=UINT32_MAX;
        if(k==6)wrong.package_sha256[0]^=1;
        if(k==7)wrong.controller_sha256[0]^=1;
        CHECK(!bs_menu_package_bind_locked(&binding,&wrong,RECORD));
        CHECK(same_bytes(&binding,&before,sizeof binding));
    }
    const uint32_t entries[4]={8,RECORD-2,RECORD+BS_MENU_PACKAGE_BYTES,PACKAGE_IMAGE-2};
    for(unsigned k=0;k<4;++k) {
        struct bs_menu_package_action binding={0};
        bs_menu_action view={0};uintptr_t entry=0;
        uint8_t *p=image+RECORD;
        put32(p+16,entries[k]);put32(p+8,UINT32_MAX);put32(p+12,UINT32_MAX);
        for(unsigned i=0;i<31;++i)p[24+i]='X';
        p[55]=0;
        CHECK(bs_menu_package_bind_locked(&binding,owner,RECORD));
        CHECK(bs_menu_package_view_locked(&binding,&view));
        CHECK(view.key==UINT32_MAX && view.action==UINT32_MAX && view.label[30]=='X' && !view.label[31]);
        CHECK(bs_menu_package_entry_locked(&binding,UINT32_MAX,&entry));
        CHECK(entry==owner->owned_extent+owner->image_offset+entries[k]);
        bs_menu_owner_retire_locked(&binding.lease);
        bs_menu_action old_view=view;
        CHECK(!bs_menu_package_view_locked(&binding,&view));
        CHECK(same_bytes(&view,&old_view,sizeof view));
    }
    descriptor(image);
    return 0;
}
int bs_menu_package_target_selftest(void) {
    int line=bs_owner_legacy_selftest();if(line)return line;
    const struct mu_backend *backend=&modwerk_runtime_backend;
    for(unsigned rows=6;rows<=9;rows+=3) {
        uint32_t free_before=modwerk_runtime_free(0),lock,token;
        struct runtime_owner owner,replacement;
        struct bs_menu_package_action binding={0},staged={0},fresh={0};
        struct bs_menu_owner_backend registry={0};
        struct bs_menu_owner_action admitted={&binding.lease,ACTION};
        bs_menu_action view={0};
        bs_editor_menu menu={0};
        const char *labels[9]={"ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE"};
        const bs_menu_callback callbacks[9]={0};
        CHECK(backend->enter(0));
        make_package(9010,PACKAGE_IMAGE,0);
        descriptor(package+RUNTIME_HEADER_BYTES+4*RUNTIME_EVENTS);
        CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();
        CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&owner));
        CHECK(same_bytes(owner.package_sha256,bs_menu_expected_package,32));
        CHECK(same_bytes(owner.controller_sha256,bs_menu_expected_controller,32));
        CHECK(!bs_menu_package_bind_locked(&staged,&owner,RECORD));
        CHECK(staged.lease.state==BS_MENU_OWNER_EMPTY);
        modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED && backend->retire(0));
        lock=modwerk_machine_lock();
        line=malformed_records(&owner);if(line)return line;
        CHECK(bs_menu_package_bind_locked(&binding,&owner,RECORD));
        CHECK(!bs_menu_package_bind_locked(&binding,&owner,RECORD));
        CHECK(bs_menu_package_view_locked(&binding,&view));
        CHECK(view.label==binding.label && same_bytes(view.label,"BEAT GRID",10));
        CHECK(view.key==KEY && view.action==ACTION && view.owner.module==9010);
        uintptr_t entry=123;
        CHECK(!bs_menu_package_entry_locked(&binding,ACTION+1,&entry) && entry==123);
        /* Descriptor mutation after admission must not change label/action/code.
         * Loader identity is not a hash of live mutable data on every query. */
        memset((void *)(owner.owned_extent+owner.image_offset+RECORD),0xff,BS_MENU_PACKAGE_BYTES);
        CHECK(bs_menu_package_entry_locked(&binding,ACTION,&entry));
        CHECK(entry==owner.owned_extent+owner.image_offset+8 && binding.label[0]=='B');
        CHECK(bs_menu_owner_backend_bind_locked(&registry,1,&admitted,package_receive,&binding));
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,1,&view,trampoline,
            bs_menu_owner_backend_get_locked(&registry),&token)==BS_MENU_OK);
        unsigned before=dispatches;
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_OK && dispatches==before+1);
        CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
        bs_menu_owner_retire_locked(&binding.lease);
        modwerk_machine_unlock(lock);
        make_package(9010,PACKAGE_IMAGE,0);
        descriptor(package+RUNTIME_HEADER_BYTES+4*RUNTIME_EVENTS);
        CHECK(backend->prepare(0,package,package_bytes));
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&replacement));
        modwerk_machine_unlock(lock);
        CHECK(backend->publish(0)==MU_APPLIED && backend->restore(0));
        lock=modwerk_machine_lock();
        entry=123;
        CHECK(bs_menu_owner_published_locked(&owner));
        CHECK(!bs_menu_package_entry_locked(&binding,ACTION,&entry) && entry==123);
        /* New activation parses current bytes again; poisoned descriptor refuses. */
        CHECK(!bs_menu_package_bind_locked(&fresh,&owner,RECORD));
        descriptor((uint8_t *)(owner.owned_extent+owner.image_offset));
        CHECK(bs_menu_package_bind_locked(&fresh,&owner,RECORD));
        CHECK(bs_menu_package_entry_locked(&fresh,ACTION,&entry));
        bs_menu_owner_retire_locked(&fresh.lease);
        modwerk_machine_unlock(lock);
        make_package(9010,0,0);
        CHECK(backend->prepare(0,package,package_bytes) && backend->publish(0)==MU_APPLIED && backend->retire(0));
        CHECK(backend->leave(0) && modwerk_runtime_free(0)==free_before);
        CHECK(!machine_fault && !lock_held && !mask_held);
    }
    return 0;
}
