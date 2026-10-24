/* SPDX-License-Identifier: MIT */
/* Original extension around the unchanged real loader host fixture. Its machine
 * glue remains synthetic; no module code, device USB or native menu runs here. */
#define main bs_upstream_loader_main
#include "../../runtime/loader/tests/host_test.c"
#undef main
#include "menu_owner.h"
static int owner_checks(void) {
    const struct mu_backend *b=&modwerk_runtime_backend;
    unsigned active_before=modwerk_runtime_active();uint32_t free_before=modwerk_runtime_free(0);
    struct runtime_owner first_owner,second_owner;
    struct bs_menu_owner_lease first_lease={0},second_lease={0},empty={0},restored_lease={0};
    uint32_t lock;
    CHECK(b->enter(0));id=9001;begin(32,16,0,0,0,0,0x71);
    CHECK(b->prepare(0,p,n));
    lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&first_owner));
    CHECK(modwerk_runtime_owner_valid(&first_owner) && !bs_menu_owner_published_locked(&first_owner));
    CHECK(!bs_menu_owner_bind_locked(&first_lease,&first_owner) && !memcmp(&first_lease,&empty,sizeof empty));
    modwerk_machine_unlock(lock);
    CHECK(b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&first_owner) && bs_menu_owner_bind_locked(&first_lease,&first_owner));
    CHECK(bs_menu_owner_current_locked(&first_lease) && !bs_menu_owner_bind_locked(&first_lease,&first_owner));
    /* Forging any full-record field cannot substitute an intact live owner. */
    for(unsigned changed=0;changed<8;++changed) {
        struct runtime_owner wrong=first_owner;
        if(changed==0)++wrong.generation;
        if(changed==1)++wrong.module;
        if(changed==2)++wrong.owned_extent;
        if(changed==3)++wrong.extent_bytes;
        if(changed==4)++wrong.image_offset;
        if(changed==5)++wrong.image_bytes;
        if(changed==6)wrong.package_sha256[0]^=1;
        if(changed==7)wrong.controller_sha256[0]^=1;
        CHECK(!bs_menu_owner_published_locked(&wrong));
    }
    modwerk_machine_unlock(lock);CHECK(b->retire(0));
    begin(64,16,0,0,0,0,0x72);CHECK(b->prepare(0,p,n));
    lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&second_owner));
    CHECK(second_owner.generation!=first_owner.generation);
    CHECK(bs_menu_owner_current_locked(&first_lease) && !bs_menu_owner_published_locked(&second_owner));
    modwerk_machine_unlock(lock);CHECK(b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_valid(&first_owner) && !bs_menu_owner_published_locked(&first_owner));
    CHECK(!bs_menu_owner_current_locked(&first_lease) && first_lease.state==BS_MENU_OWNER_RETIRED);
    CHECK(bs_menu_owner_bind_locked(&second_lease,&second_owner) && bs_menu_owner_current_locked(&second_lease));
    modwerk_machine_unlock(lock);CHECK(b->restore(0));
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&first_owner) && !bs_menu_owner_current_locked(&first_lease));
    CHECK(!bs_menu_owner_bind_locked(&first_lease,&first_owner));
    CHECK(!bs_menu_owner_current_locked(&second_lease));
    CHECK(bs_menu_owner_bind_locked(&restored_lease,&first_owner));
    /* Explicit pre-transition retirement is required even when a query misses
     * the interval in which the old image ceased to be current. */
    bs_menu_owner_retire_locked(&restored_lease);bs_menu_owner_retire_locked(&restored_lease);
    CHECK(!bs_menu_owner_current_locked(&restored_lease));
    modwerk_machine_unlock(lock);
    begin(64,16,0,0,0,0,0x73);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->restore(0));
    lock=modwerk_machine_lock();
    CHECK(bs_menu_owner_published_locked(&first_owner) && !bs_menu_owner_current_locked(&restored_lease));
    modwerk_machine_unlock(lock);
    begin(0,0,RUNTIME_NONE,0,0,0,0);CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED);
    lock=modwerk_machine_lock();
    CHECK(modwerk_runtime_owner_valid(&first_owner) && !bs_menu_owner_published_locked(&first_owner));
    modwerk_machine_unlock(lock);CHECK(b->retire(0) && b->leave(0));
    lock=modwerk_machine_lock();CHECK(!modwerk_runtime_owner_valid(&first_owner));modwerk_machine_unlock(lock);
    CHECK(modwerk_runtime_active()==active_before && modwerk_runtime_free(0)==free_before);
    CHECK(!masked && !locked);
    return failures?1:0;
}
int main(void) {
    if(bs_upstream_loader_main())return 1;
    if(owner_checks())return 1;
    puts("PASS: actual loader staged/live/retained/replaced/restored/removed owners; full-record mismatch refusal; permanent observed or explicit menu-lease retirement; no module execution or native/USB qualification");
    return 0;
}
