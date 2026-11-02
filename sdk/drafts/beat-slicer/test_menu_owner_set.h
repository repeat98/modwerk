/* SPDX-License-Identifier: MIT */
/* Original whole-set owner scenario. Included only with the real SDK set backend.
 * Machine services and menu detachment remain synthetic; this is not USB IO. */
#ifdef MODWERK_RUNTIME_SETS
static uint8_t owner_set_offer[1024],owner_set_stage[1024];
static unsigned owner_set_bytes;
static void owner_set_append(void) {
    put32(owner_set_offer+owner_set_bytes,package_bytes);
    memcpy(owner_set_offer+owner_set_bytes+4,package,package_bytes);
    owner_set_bytes+=4+((package_bytes+3)&~3u);
    put32(owner_set_offer+8,owner_set_bytes);
}
static int owner_set_checks(void) {
    const struct mu_backend *single=&modwerk_runtime_backend;
    /* Disconnect before publication, after each row, and Keep a complete set. */
    for(unsigned scenario=0;scenario<4;++scenario) {
        struct runtime_owner owners[3],after;
        struct bs_menu_owner_lease leases[3]={0},reactivated={0};
        struct bs_menu_owner_backend registry={0},fresh={0};
        struct bs_menu_owner_action bindings[3];
        bs_menu_owner identities[3];
        uint32_t lock,free_before=modwerk_runtime_free(0);
        CHECK(modwerk_runtime_active()==0 && single->enter(0));
        for(unsigned i=0;i<3;++i) {
            make_package(9002+i,32,(uint8_t)(0x41+i));
            CHECK(single->prepare(0,package,package_bytes));
            lock=modwerk_machine_lock();
            CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image,&owners[i]));
            modwerk_machine_unlock(lock);
            CHECK(single->publish(0)==MU_APPLIED && single->retire(0));
            identities[i].module=owners[i].module;identities[i].generation=owners[i].generation;
            bindings[i].lease=&leases[i];bindings[i].action=17;
        }
        CHECK(single->leave(0));
        lock=modwerk_machine_lock();
        for(unsigned i=0;i<3;++i)CHECK(bs_menu_owner_bind_locked(&leases[i],&owners[i]));
        CHECK(bs_menu_owner_backend_bind_locked(&registry,3,bindings,receive,&dispatches));
        const bs_menu_backend *menu_backend=bs_menu_owner_backend_get_locked(&registry);
        CHECK(menu_backend);
        dispatches=0;
        for(unsigned i=0;i<3;++i)CHECK(menu_backend->invoke(menu_backend->context,&identities[i],17));
        CHECK(dispatches==3);
        memset(owner_set_offer,0,sizeof owner_set_offer);
        owner_set_offer[0]='M';owner_set_offer[1]='W';owner_set_offer[2]='M';owner_set_offer[3]='S';
        owner_set_offer[5]=1;owner_set_offer[7]=2;
        CHECK(modwerk_runtime_journal_digest(owner_set_offer+48));
        modwerk_machine_unlock(lock);
        owner_set_bytes=80;
        make_package(9002,64,0x43);owner_set_append();
        make_package(9003,0,0);owner_set_append();
        struct mu_context upload;
        uint8_t base[32]={1},session[32]={2};
        struct mu_offer offer={0};
        offer.transaction=1;offer.length=owner_set_bytes;
        memcpy(offer.base,base,32);memcpy(offer.session,session,32);
        mu_sha256(owner_set_offer,owner_set_bytes,offer.digest);
        CHECK(mu_init(&upload,owner_set_stage,sizeof owner_set_stage,base,session,
                      owner_set_offer+48,0,&modwerk_runtime_set_backend));
        CHECK(mu_enter(&upload)==MU_OK && mu_begin(&upload,&offer)==MU_OK);
        CHECK(mu_chunk(&upload,1,0,owner_set_offer,owner_set_bytes)==MU_OK);
        CHECK(mu_verify(&upload,1)==MU_OK);
        CHECK(mu_accept(&upload,1)==MU_STATE);
        /* Explicit base-side retirement is required before any transition;
         * the prototype does not wire this obligation into the loader. */
        lock=modwerk_machine_lock();
        bs_menu_owner_retire_locked(&leases[0]);bs_menu_owner_retire_locked(&leases[1]);
        modwerk_machine_unlock(lock);
        unsigned cut=scenario<3?scenario:2;
        for(unsigned i=0;i<cut;++i) {
            CHECK(mu_commit(&upload,1)==(i==1?MU_OK:MU_PROGRESS));
            lock=modwerk_machine_lock();
            CHECK(!menu_backend->invoke(menu_backend->context,&identities[0],17));
            CHECK(!menu_backend->invoke(menu_backend->context,&identities[1],17));
            CHECK(menu_backend->invoke(menu_backend->context,&identities[2],17));
            CHECK(last_module==9004 && leases[2].state==BS_MENU_OWNER_LIVE);
            CHECK(modwerk_runtime_owner_valid(&owners[0]) && modwerk_runtime_owner_valid(&owners[1]));
            CHECK(!bs_menu_owner_published_locked(&owners[0]));
            CHECK(bs_menu_owner_published_locked(&owners[1])==(i==0));
            CHECK(bs_menu_owner_published_locked(&owners[2]));
            modwerk_machine_unlock(lock);
            if(i==0)CHECK(mu_accept(&upload,1)==MU_STATE);
        }
        if(scenario==3) {
            CHECK(mu_accept(&upload,1)==MU_OK && !modwerk_runtime_set_busy());
            CHECK(mu_leave(&upload)==MU_OK);
        } else {
            if(cut==2)CHECK(mu_leave(&upload)==MU_OK);
            enum mu_result result=mu_disconnect(&upload);
            for(unsigned retry=0;result!=MU_OK && retry<3;++retry)result=mu_disconnect(&upload);
            CHECK(result==MU_OK && upload.phase==MU_NORMAL && !upload.disconnecting);
            CHECK(upload.active_known && same_digest(upload.active,owner_set_offer+48));
            CHECK(!modwerk_runtime_set_busy());
        }
        lock=modwerk_machine_lock();
        CHECK(!menu_backend->invoke(menu_backend->context,&identities[0],17));
        CHECK(!menu_backend->invoke(menu_backend->context,&identities[1],17));
        CHECK(menu_backend->invoke(menu_backend->context,&identities[2],17));
        CHECK(dispatches==4+cut && last_module==9004);
        CHECK(bs_menu_owner_published_locked(&owners[2]));
        CHECK(modwerk_runtime_owner_valid(&owners[0])==(scenario!=3));
        CHECK(modwerk_runtime_owner_valid(&owners[1])==(scenario!=3));
        if(scenario!=3) {
            CHECK(bs_menu_owner_published_locked(&owners[0]) && bs_menu_owner_published_locked(&owners[1]));
            after=owners[0];
        } else {
            const struct runtime_module *found=0;
            for(unsigned position=0;position<RUNTIME_MODULES;++position) {
                const struct runtime_module *current=modwerk_runtime_module(position);
                if(current && current->id==9002)found=current;
            }
            CHECK(found && modwerk_runtime_owner_snapshot(found->dsp.image,&after));
            CHECK(after.generation!=owners[0].generation && expected_identity(&after,2));
        }
        CHECK(bs_menu_owner_bind_locked(&reactivated,&after));
        bindings[0].lease=&reactivated;
        CHECK(bs_menu_owner_backend_bind_locked(&fresh,1,bindings,receive,&dispatches));
        const bs_menu_backend *fresh_backend=bs_menu_owner_backend_get_locked(&fresh);
        bs_menu_owner new_identity={after.module,after.generation};
        CHECK(fresh_backend && fresh_backend->invoke(fresh_backend->context,&new_identity,17));
        CHECK(dispatches==5+cut && last_module==9002);
        bs_menu_owner_retire_locked(&reactivated);bs_menu_owner_retire_locked(&leases[2]);
        modwerk_machine_unlock(lock);
        CHECK(single->enter(0));
        for(unsigned i=0;i<3;++i) {
            if(i==1 && scenario==3)continue;
            make_package(9002+i,0,0);
            CHECK(single->prepare(0,package,package_bytes) && single->publish(0)==MU_APPLIED && single->retire(0));
        }
        CHECK(single->leave(0));
        CHECK(modwerk_runtime_active()==0 && modwerk_runtime_free(0)==free_before);
        CHECK(!lock_held && !mask_held && !machine_fault);
    }
    return 0;
}
#endif
