/* SPDX-License-Identifier: MIT */
/* Exact private package through the unchanged real loader. Machine services
 * remain synthetic; this does not qualify USB or physical display/timing. */
#define bs_owner_loader_target_selftest bs_probe_unused_legacy_selftest
#include "test_menu_owner_loader_target.c"
#undef bs_owner_loader_target_selftest
extern const uint8_t bs_probe_package[];
extern const uint32_t bs_probe_package_bytes;
int bs_usb_probe_target_selftest(void) {
    const struct mu_backend *b=&modwerk_runtime_backend;
    struct runtime_owner companion;
    uint32_t free_before=modwerk_runtime_free(0),lock;
    CHECK(!modwerk_runtime_active() && b->enter(0));
    make_package(9003,32,0x42);CHECK(b->prepare(0,package,package_bytes));
    lock=modwerk_machine_lock();CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&companion));modwerk_machine_unlock(lock);
    CHECK(b->publish(0)==MU_APPLIED && b->retire(0));
    for(unsigned trial=0;trial<2;++trial) {
        CHECK(b->prepare(0,bs_probe_package,bs_probe_package_bytes));
        CHECK(candidate && candidate->sites==0 && candidate->dsp.count==0);
        CHECK(b->publish(0)==MU_APPLIED && modwerk_runtime_active()==2);
        const struct runtime_module *probe=0;
        for(unsigned i=0;i<RUNTIME_MODULES;++i) {
            const struct runtime_module *m=modwerk_runtime_module(i);
            if(m && m->id!=9003)probe=m;
        }
        CHECK(probe && probe->hook[0] && probe->hook[1] && !probe->hook[2] && !probe->hook[3]);
        struct modwerk_runtime_api api={0};
        for(unsigned tick=0;tick<20;++tick)((void (*)(struct modwerk_runtime_api *))probe->hook[0])(&api);
        CHECK(api.value==0x42534f4bu);
        uint8_t frame[1056];memset(frame,0xa5,sizeof frame);
        ((void (*)(unsigned char *))probe->hook[1])(frame+16);
        unsigned lit=0;
        for(unsigned i=0;i<16;++i)CHECK(frame[i]==0xa5 && frame[1040+i]==0xa5);
        for(unsigned i=16;i<1040;++i)lit+=frame[i]!=0;
        CHECK(lit && b->restore(0) && b->retire(0) && modwerk_runtime_active()==1);
        lock=modwerk_machine_lock();CHECK(bs_menu_owner_published_locked(&companion));modwerk_machine_unlock(lock);
    }
    make_package(9003,0,0);CHECK(b->prepare(0,package,package_bytes) && b->publish(0)==MU_APPLIED && b->retire(0));
    CHECK(b->leave(0) && !modwerk_runtime_active() && modwerk_runtime_free(0)==free_before);
    CHECK(!machine_fault && !lock_held && !mask_held);return 0;
}
