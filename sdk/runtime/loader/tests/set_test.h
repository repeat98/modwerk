/* SPDX-License-Identifier: GPL-3.0-or-later
 * Included in the real loader's host fixture. No module code or hardware. */
#ifdef MODWERK_RUNTIME_SETS
static uint8_t set_offer[4096];
static unsigned set_bytes;
static void set_start(void)
{
    memset(set_offer,0,sizeof set_offer);memcpy(set_offer,"MWMS",4);set_offer[5]=1;set_offer[7]=3;
    uint32_t lock=modwerk_machine_lock();CHECK(modwerk_runtime_journal_digest(set_offer+48));modwerk_machine_unlock(lock);
    set_bytes=80;
}
static void set_append(void)
{
    put32(set_offer+set_bytes,n);memcpy(set_offer+set_bytes+4,p,n);set_bytes+=4u+((n+3u)&~3u);put32(set_offer+8,set_bytes);
}
/* MWMS v2: `n` frame cost entries after the packages (set_package.h); the machine's copy, as loader.c hands it over. */
static unsigned costs_seen=~0u;static uint8_t costs_copy[24];
void modwerk_machine_frame_costs(const uint8_t *table,unsigned n) { costs_seen=n;if(n<=2u) memcpy(costs_copy,table,12u*n); }
static void set_costs(unsigned n,const uint8_t *entries)
{
    set_offer[5]=2;put32(set_offer+set_bytes,n);memcpy(set_offer+set_bytes+4,entries,12u*n);set_bytes+=4u+12u*n;put32(set_offer+8,set_bytes);
}
static void set_make(void)
{
    set_start();
    id=111;begin(64,0,0,0,0,1,0x71);site(STOCK+32,6);set_append();
    id=112;begin(0,0,RUNTIME_NONE,0,0,0,0);set_append();
    id=117;begin(64,0,0,0,0,1,0x77);site(STOCK+192,6);set_append();
}
static void set_checks(void)
{
    const struct mu_backend *s=&modwerk_runtime_set_backend;
    struct runtime_module *old0=live[0],*old1=live[1];
    uint8_t before[sizeof stock];memcpy(before,stock,sizeof stock);
    uint32_t free_before=modwerk_runtime_free(0);
    for(unsigned cut=0;cut<=3;++cut) {
        set_make();CHECK(s->enter(0));CHECK(s->prepare(0,set_offer,set_bytes));
        CHECK(change_set.count==3 && change_set.published==0 && live[0]==old0 && live[1]==old1);
        uint32_t lock=modwerk_machine_lock();CHECK(reachable(old0) && reachable(old1));modwerk_machine_unlock(lock);
        CHECK(!s->retire(0)); /* Keep is impossible until every row is published */
        for(unsigned i=0;i<cut;++i) CHECK(s->publish(0)==(i==2?MU_APPLIED:MU_PUBLISHING_MORE));
        CHECK(change_set.published==cut && s->discard(0)==(cut==0));
        if(!cut) { CHECK(!change_set.count && s->leave(0)); }
        else {
            CHECK(s->leave(0));stopped=0;CHECK(!s->enter(0) && !s->restore(0));stopped=1;
            CHECK(s->enter(0));
            /* A busy DSP delays rollback without releasing either generation. */
            dsp_why=RUNTIME_BUSY;CHECK(!s->restore(0) && change_set.published==cut);
            dsp_why=0;
            for(unsigned i=cut;i>0;--i) CHECK(s->restore(0)==(i==1));
            CHECK(s->leave(0));
        }
        CHECK(!modwerk_runtime_set_busy() && live[0]==old0 && live[1]==old1 && modwerk_runtime_active()==2);
        CHECK(modwerk_runtime_free(0)==free_before && !memcmp(stock,before,sizeof stock));
    }
    /* ABI 9 readers retain their feature admission inside a whole-set offer.
     * A missing bus refuses the complete set; an admitted reader can publish
     * with the other rows and still restore the exact baseline. */
    unsigned saved_features=base_features;
    set_start();id=111;begin9(8,8);claim9(2,0,RUNTIME_CLAIM_READ,0x700,16);dsp_words9(8);set_append();
    id=112;begin(0,0,RUNTIME_NONE,0,0,0,0);set_append();
    id=117;begin(64,0,0,0,0,1,0x77);site(STOCK+192,6);set_append();
    base_features=0;
    CHECK(s->enter(0) && !s->prepare(0,set_offer,set_bytes));
    CHECK(modwerk_runtime_refusal()==RUNTIME_CONFLICT && s->discard(0));
    CHECK(modwerk_runtime_free(0)==free_before && live[0]==old0 && live[1]==old1);
    base_features=8;
    CHECK(s->prepare(0,set_offer,set_bytes) && change_set.row[0].after->dsp.requires==8);
    CHECK(s->publish(0)==MU_PUBLISHING_MORE && s->publish(0)==MU_PUBLISHING_MORE && s->publish(0)==MU_APPLIED);
    CHECK(!s->restore(0) && !s->restore(0) && s->restore(0) && s->leave(0));
    CHECK(modwerk_runtime_free(0)==free_before && live[0]==old0 && live[1]==old1 && !memcmp(stock,before,sizeof stock));
    base_features=saved_features;
    /* Bad framing, a repeated module and a stale baseline allocate nothing. */
    set_make();CHECK(s->enter(0));set_offer[48]^=1;CHECK(!s->prepare(0,set_offer,set_bytes));CHECK(s->discard(0));
    set_make();set_offer[set_bytes-1]=1;CHECK(!s->prepare(0,set_offer,set_bytes));CHECK(s->discard(0));
    set_make();set_offer[89]=RUNTIME_ABI+1u;CHECK(!s->prepare(0,set_offer,set_bytes));CHECK(s->discard(0));
    CHECK(s->leave(0) && modwerk_runtime_free(0)==free_before && !memcmp(stock,before,sizeof stock));
    /* v2: the frame cost table reaches the machine once the baseline matches, whether or not the set is kept; a bad
     * entry, an unsorted table or a stale baseline leaves the machine's table as it was, and allocates nothing. */
    { static const uint8_t two[24]={0,0,0,5, 0,77,0,4, 0,15,0,0, 0x9f,0x48,0x2b,0xb9, 0,114,0,0, 0,0,0,0};
      static const uint8_t bad[6][12]={{0,0,0,5,0x10,0,0,0},{0,0,0,5,0x07,0xd1,0,0},{0,0,0,0,0,1,0,0},{0,0,0,5,0,0,0x07,0xd1},
                                       {0,0,0,5,0,0,0,0,0x07,0xd1},{0,0,0,5,0,0,0,0,0,0,0,1}}; /* ... rest past 2000, padding not 0 */
      uint8_t down[24];memcpy(down,two+12,12);memcpy(down+12,two,12);
      CHECK(s->enter(0));
      set_make();set_costs(2,two);CHECK(s->prepare(0,set_offer,set_bytes) && costs_seen==2u && !memcmp(costs_copy,two,24) && s->discard(0));
      for(unsigned k=0;k<7u;++k) {
          costs_seen=~0u;set_make();set_costs(k<6u?1u:2u,k<6u?bad[k]:down);
          CHECK(!s->prepare(0,set_offer,set_bytes) && modwerk_runtime_refusal()==RUNTIME_MALFORMED && costs_seen==~0u && s->discard(0));
      }
      costs_seen=~0u;set_make();set_costs(2,two);set_offer[48]^=1;CHECK(!s->prepare(0,set_offer,set_bytes) && costs_seen==~0u && s->discard(0));
      costs_seen=~0u;set_make();set_costs(2,two);set_bytes-=4;put32(set_offer+8,set_bytes);CHECK(!s->prepare(0,set_offer,set_bytes) && costs_seen==~0u && s->discard(0));
      costs_seen=~0u;set_make();set_costs(0,two);CHECK(s->prepare(0,set_offer,set_bytes) && !costs_seen && s->discard(0)); /* empty: none kept */
      costs_seen=~0u;set_make();CHECK(s->prepare(0,set_offer,set_bytes) && costs_seen==~0u && s->discard(0));              /* v1: as it was */
      CHECK(s->leave(0) && modwerk_runtime_free(0)==free_before && !memcmp(stock,before,sizeof stock)); }
    /* A later invalid package discards all earlier candidates, leaving live
     * dispatch and every predecessor byte intact. */
    set_make();set_offer[80+4+((be32(set_offer+80)+3u)&~3u)+4+8]=0xff;
    CHECK(s->enter(0) && !s->prepare(0,set_offer,set_bytes) && s->discard(0) && s->leave(0));
    CHECK(modwerk_runtime_free(0)==free_before && live[0]==old0 && live[1]==old1);
    /* The actual upload controller owns one transaction across all rows.
     * Disconnect at every publication boundary restores the original set. */
    for(unsigned cut=0;cut<=3;++cut) {
        struct mu_context upload;uint8_t stage[sizeof set_offer],base[32]={1},session[32]={2};
        set_make();
        CHECK(mu_init(&upload,stage,sizeof stage,base,session,set_offer+48,0,s));
        struct mu_offer offer={0};offer.transaction=1;offer.length=set_bytes;
        memcpy(offer.base,base,32);memcpy(offer.session,session,32);mu_sha256(set_offer,set_bytes,offer.digest);
        CHECK(mu_enter(&upload)==MU_OK && mu_begin(&upload,&offer)==MU_OK);
        CHECK(mu_chunk(&upload,1,0,set_offer,set_bytes)==MU_OK && mu_verify(&upload,1)==MU_OK);
        for(unsigned i=0;i<cut;++i) CHECK(mu_commit(&upload,1)==(i==2?MU_OK:MU_PROGRESS));
        CHECK(upload.generation==(cut==3) && live[0]==(cut?change_set.row[0].after:old0));
        if(cut && cut<3) CHECK(!upload.active_known && mu_accept(&upload,1)==MU_STATE);
        if(cut==3) CHECK(mu_leave(&upload)==MU_OK); /* disconnect during the running trial */
        enum mu_result result=mu_disconnect(&upload);
        for(unsigned retry=0;result!=MU_OK && retry<3;++retry) result=mu_disconnect(&upload);
        CHECK(result==MU_OK && upload.phase==MU_NORMAL && !upload.disconnecting);
        CHECK(upload.active_known && !memcmp(upload.active,set_offer+48,32));
        CHECK(live[0]==old0 && live[1]==old1 && !modwerk_runtime_set_busy());
        CHECK(modwerk_runtime_free(0)==free_before && !memcmp(stock,before,sizeof stock));
    }
    /* Keep ends one complete transaction, and no row remains rollback-owned. */
    set_make();CHECK(s->enter(0) && s->prepare(0,set_offer,set_bytes));
    CHECK(s->publish(0)==MU_PUBLISHING_MORE && s->publish(0)==MU_PUBLISHING_MORE && s->publish(0)==MU_APPLIED);
    CHECK(s->leave(0) && s->enter(0) && s->retire(0) && !modwerk_runtime_set_busy() && s->leave(0));
    CHECK(modwerk_runtime_active()==2 && live[0]!=old0 && !live[1] && live[2] && live[2]->id==117);
    /* The kept set is ordinary runtime state and the legacy path still works. */
    id=117;begin(0,0,RUNTIME_NONE,0,0,0,0);
    CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
    id=112;begin(64,0,0,0,0,1,0x62);site(STOCK+64,6);
    CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
}
#endif
