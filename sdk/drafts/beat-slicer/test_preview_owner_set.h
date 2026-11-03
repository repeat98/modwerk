/* SPDX-License-Identifier: MIT */
/* Source publication follows the real set lifecycle over generated PCM. */
#ifdef MODWERK_RUNTIME_SETS
static int preview_owner_set_checks(void) {
    const struct mu_backend *loader=&modwerk_runtime_backend;
    struct fixture *sources[3]={&f,&companion_preview,&fresh_preview};
    struct bs_preview_options options={1,1,0};
    for(unsigned scenario=0;scenario<4;++scenario) {
        struct runtime_owner owners[3];struct bs_menu_owner_lease leases[3]={0};
        struct bs_menu_owner_backend registry={0};struct bs_menu_owner_action actions[3];
        uint32_t requests[3],copies_before[3],captures_before[3],lock,free_before=modwerk_runtime_free(0);
        CHECK(!transition_precheck && !transition_registry && !modwerk_runtime_active() && loader->enter(0));
        for(unsigned i=0;i<3;++i) {
            int line=transition_install(9002+i,(uint8_t)(0x41+i),&owners[i]);if(line)return line;
            lock=modwerk_machine_lock();CHECK(bs_menu_owner_bind_locked(&leases[i],&owners[i]));modwerk_machine_unlock(lock);
            actions[i]=(struct bs_menu_owner_action){&leases[i],17};
            line=owned_setup(sources[i],&owners[i]);if(line)return line;
            requests[i]=bs_async_request(&sources[i]->async,owners[i].module,owners[i].generation,&options);CHECK(requests[i]);
            preview_bindings[i]=(struct bs_preview_owner_binding){&leases[i],&sources[i]->async};
        }
        CHECK(owned_finish(sources[0])==BS_SESSION_READY);
        int line=owned_result(sources[0],requests[0]);if(line)return line;
        sources[1]->pending=1;CHECK(bs_async_service(&sources[1]->async,1)==BS_SESSION_WAITING);
        CHECK(bs_async_service(&sources[2]->async,1)==BS_SESSION_RUNNING);
        for(unsigned i=0;i<3;++i){copies_before[i]=sources[i]->copies;captures_before[i]=sources[i]->captures;}
        CHECK(loader->leave(0));lock=modwerk_machine_lock();
        CHECK(bs_menu_owner_backend_bind_locked(&registry,3,actions,receive,&dispatches));
        transition_registry=&registry;transition_precheck=preview_precheck;preview_binding_count=3;
        memset(owner_set_offer,0,sizeof owner_set_offer);
        owner_set_offer[0]='M';owner_set_offer[1]='W';owner_set_offer[2]='M';owner_set_offer[3]='S';
        owner_set_offer[5]=1;owner_set_offer[7]=2;
        CHECK(modwerk_runtime_journal_digest(owner_set_offer+48));modwerk_machine_unlock(lock);
        owner_set_bytes=80;make_package(9002,64,0x43);owner_set_append();make_package(9003,0,0);owner_set_append();
        struct mu_context upload;uint8_t base[32]={1},session[32]={2};struct mu_offer offer={0};
        offer.transaction=1;offer.length=owner_set_bytes;
        memcpy(offer.base,base,32);memcpy(offer.session,session,32);mu_sha256(owner_set_offer,owner_set_bytes,offer.digest);
        CHECK(mu_init(&upload,owner_set_stage,sizeof owner_set_stage,base,session,owner_set_offer+48,0,&modwerk_runtime_set_backend));
        CHECK(mu_enter(&upload)==MU_OK && mu_begin(&upload,&offer)==MU_OK);
        CHECK(mu_chunk(&upload,1,0,owner_set_offer,owner_set_bytes)==MU_OK && mu_verify(&upload,1)==MU_OK);
        CHECK(mu_accept(&upload,1)==MU_STATE);
        for(unsigned i=0;i<3;++i)CHECK(!sources[i]->async.revoked && leases[i].state==BS_MENU_OWNER_LIVE);
        unsigned cut=scenario<3?scenario:2;
        for(unsigned i=0;i<cut;++i)CHECK(mu_commit(&upload,1)==(i==1?MU_OK:MU_PROGRESS));
        if(scenario==3)CHECK(mu_accept(&upload,1)==MU_OK && mu_leave(&upload)==MU_OK);
        else {
            if(cut==2)CHECK(mu_leave(&upload)==MU_OK);
            enum mu_result result=mu_disconnect(&upload);
            for(unsigned retry=0;result!=MU_OK && retry<3;++retry)result=mu_disconnect(&upload);
            CHECK(result==MU_OK && upload.phase==MU_NORMAL && !upload.disconnecting);
            CHECK(upload.active_known && same_digest(upload.active,owner_set_offer+48));
        }
        CHECK(!modwerk_runtime_set_busy());
        /* Query only after complete publication/rollback, so polling cannot
         * supply the missing transition-time cancellation. */
        for(unsigned i=0;i<3;++i) {
            struct fixture *p=sources[i];
            CHECK(p->copies==copies_before[i] && p->captures==captures_before[i]);
            CHECK(p->async.revoked==(i<cut));
            CHECK(leases[i].state==(i<cut?BS_MENU_OWNER_RETIRED:BS_MENU_OWNER_LIVE));
            p->pending=0;
            if(i<cut) {
                struct bs_async_result result,before;clear(&result,sizeof result);result.request=0x11223344u;copy(&before,&result,sizeof before);
                CHECK(bs_async_state(&p->async,owners[i].module,owners[i].generation,requests[i])==BS_SESSION_CANCELLED);
                CHECK(!bs_async_result(&p->async,owners[i].module,owners[i].generation,requests[i],&result) && equal(&result,&before,sizeof before));
                CHECK(!bs_async_request(&p->async,owners[i].module,owners[i].generation,&options));
                CHECK(bs_async_service(&p->async,8)==BS_SESSION_CANCELLED);
                CHECK(p->copies==copies_before[i] && p->captures==captures_before[i]);
            } else {
                CHECK(owned_finish(p)==BS_SESSION_READY);line=owned_result(p,requests[i]);if(line)return line;
            }
        }
        CHECK(loader->enter(0));
        for(unsigned i=0;i<3;++i) {
            if(i==1 && scenario==3)continue;
            make_package(9002+i,0,0);
            CHECK(loader->prepare(0,package,package_bytes) && loader->publish(0)==MU_APPLIED && loader->retire(0));
        }
        for(unsigned i=0;i<3;++i)CHECK(sources[i]->async.revoked && sources[i]->locks==sources[i]->unlocks && !sources[i]->bad);
        transition_precheck=0;transition_registry=0;preview_binding_count=0;
        CHECK(loader->leave(0) && !modwerk_runtime_active() && modwerk_runtime_free(0)==free_before);
        CHECK(!lock_held && !mask_held && !machine_fault);
    }
    return 0;
}
#endif
