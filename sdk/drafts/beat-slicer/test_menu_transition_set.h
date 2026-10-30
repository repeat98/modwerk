/* SPDX-License-Identifier: MIT */
/* Real upload/set rollback invokes the proposed retirement adapter from the
 * machine callback. Synthetic task/cache/DSP services; no USB IO. */
#ifdef MODWERK_RUNTIME_SETS
static int transition_set_checks(void) {
    const struct mu_backend *single=&modwerk_runtime_backend;
    for(unsigned scenario=0;scenario<4;++scenario) {
        struct runtime_owner owners[3];
        struct bs_menu_owner_lease leases[3]={0};
        struct bs_menu_owner_backend registry={0};
        struct bs_menu_owner_action bindings[3];
        bs_menu_owner identities[3];
        uint32_t lock,free_before=modwerk_runtime_free(0);
        CHECK(!transition_registry && !modwerk_runtime_active() && single->enter(0));
        for(unsigned i=0;i<3;++i) {
            int line=transition_install(9002+i,(uint8_t)(0x41+i),&owners[i]);if(line)return line;
            identities[i].module=owners[i].module;identities[i].generation=owners[i].generation;
            bindings[i].lease=&leases[i];bindings[i].action=17;
        }
        CHECK(single->leave(0));lock=modwerk_machine_lock();
        for(unsigned i=0;i<3;++i)CHECK(bs_menu_owner_bind_locked(&leases[i],&owners[i]));
        CHECK(bs_menu_owner_backend_bind_locked(&registry,3,bindings,receive,&dispatches));
        const bs_menu_backend *backend=bs_menu_owner_backend_get_locked(&registry);CHECK(backend);
        transition_registry=&registry;
        memset(owner_set_offer,0,sizeof owner_set_offer);
        owner_set_offer[0]='M';owner_set_offer[1]='W';owner_set_offer[2]='M';owner_set_offer[3]='S';
        owner_set_offer[5]=1;owner_set_offer[7]=2;
        CHECK(modwerk_runtime_journal_digest(owner_set_offer+48));modwerk_machine_unlock(lock);
        owner_set_bytes=80;make_package(9002,64,0x43);owner_set_append();make_package(9003,0,0);owner_set_append();
        struct mu_context upload;uint8_t base[32]={1},session[32]={2};struct mu_offer offer={0};
        offer.transaction=1;offer.length=owner_set_bytes;
        memcpy(offer.base,base,32);memcpy(offer.session,session,32);
        mu_sha256(owner_set_offer,owner_set_bytes,offer.digest);
        CHECK(mu_init(&upload,owner_set_stage,sizeof owner_set_stage,base,session,owner_set_offer+48,0,&modwerk_runtime_set_backend));
        CHECK(mu_enter(&upload)==MU_OK && mu_begin(&upload,&offer)==MU_OK);
        CHECK(mu_chunk(&upload,1,0,owner_set_offer,owner_set_bytes)==MU_OK && mu_verify(&upload,1)==MU_OK);
        CHECK(mu_accept(&upload,1)==MU_STATE);
        CHECK(leases[0].state==BS_MENU_OWNER_LIVE && leases[1].state==BS_MENU_OWNER_LIVE && leases[2].state==BS_MENU_OWNER_LIVE);
        unsigned cut=scenario<3?scenario:2;
        for(unsigned i=0;i<cut;++i) {
            CHECK(mu_commit(&upload,1)==(i==1?MU_OK:MU_PROGRESS));
            CHECK(leases[0].state==BS_MENU_OWNER_RETIRED);
            CHECK(leases[1].state==(i?BS_MENU_OWNER_RETIRED:BS_MENU_OWNER_LIVE));
            CHECK(leases[2].state==BS_MENU_OWNER_LIVE);
        }
        /* No owner validity or menu dispatch query before rollback completes. */
        if(scenario==3) {
            CHECK(mu_accept(&upload,1)==MU_OK && !modwerk_runtime_set_busy() && mu_leave(&upload)==MU_OK);
        } else {
            if(cut==2)CHECK(mu_leave(&upload)==MU_OK);
            enum mu_result result=mu_disconnect(&upload);
            for(unsigned retry=0;result!=MU_OK && retry<3;++retry)result=mu_disconnect(&upload);
            CHECK(result==MU_OK && upload.phase==MU_NORMAL && !upload.disconnecting);
            CHECK(upload.active_known && same_digest(upload.active,owner_set_offer+48) && !modwerk_runtime_set_busy());
        }
        lock=modwerk_machine_lock();dispatches=0;
        for(unsigned i=0;i<3;++i) {
            int remains_live=i>=cut;
            CHECK(leases[i].state==(remains_live?BS_MENU_OWNER_LIVE:BS_MENU_OWNER_RETIRED));
            CHECK(backend->invoke(backend->context,&identities[i],17)==remains_live);
            CHECK(modwerk_runtime_owner_valid(&owners[i])==(scenario!=3 || i==2));
            if(scenario!=3 || i==2)CHECK(bs_menu_owner_published_locked(&owners[i]));
        }
        CHECK(dispatches==3-cut);modwerk_machine_unlock(lock);
        CHECK(single->enter(0));
        for(unsigned i=0;i<3;++i) {
            if(i==1 && scenario==3)continue;
            make_package(9002+i,0,0);
            CHECK(single->prepare(0,package,package_bytes) && single->publish(0)==MU_APPLIED && single->retire(0));
        }
        transition_registry=0;
        CHECK(single->leave(0) && !modwerk_runtime_active() && modwerk_runtime_free(0)==free_before);
        CHECK(!lock_held && !mask_held && !machine_fault);
    }
    return 0;
}
#endif
