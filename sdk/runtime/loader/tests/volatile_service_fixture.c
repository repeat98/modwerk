/* SPDX-License-Identifier: GPL-3.0-or-later
 * Appended to the real loader host suite and saved_set_fixture.c, with real
 * service.c, modset.c and the saved-set reader separately compiled. Only board
 * authority, asynchronous observations and the card are synthetic. */
#include "volatile_service.h"
#include "saved_set_export.h"
static int association_allow=1,trial_allow=1,trial_running;
static unsigned associations,trial_changes;
int modwerk_machine_journal_association(uint32_t module,const uint8_t digest[32],const uint32_t *ids,unsigned count)
{
    CHECK(locked && digest && count==1 && ids[0]==module);
    ++associations;return association_allow;
}
int modwerk_machine_journal_trial(int running)
{ CHECK(locked);++trial_changes;if(trial_allow) trial_running=running;return trial_allow; }
static struct mvs_service svc;
static uint8_t stage[16384],base[32]={1},session[32]={2},whole[4096],baseline_digest[32],offer_digest[32];
static uint32_t whole_bytes,seq=1;
/* first 111 replaces the live 111; first 110 makes the set two fresh installs. */
static void make_bundle_from(uint32_t first)
{
    memset(whole,0,sizeof whole);memcpy(whole,"MWBT",4);
    whole[5]=whole[7]=1;whole[9]=88;whole[11]=whole[13]=2;
    memcpy(whole+24,base,32);memcpy(whole+56,baseline_digest,32);
    put32(whole+88,first);put32(whole+92,113);uint32_t at=96;
    for(unsigned i=0;i<2;++i) {
        id=i?113:first;begin(64,0,0,0,0,1,(uint8_t)(0x51+i));site(STOCK+(i?96:first==111?32:128),6);
        put32(whole+at,id);put32(whole+at+4,n);mu_sha256(p,n,whole+at+8);
        put32(whole+at+40,1u<<i);at+=48;memcpy(whole+at,p,n);at+=(n+3u)&~3u;
    }
    whole_bytes=at;put32(whole+16,at);mu_sha256(whole,at,offer_digest);
}
static void make_bundle(void) { make_bundle_from(111); }
static int send(unsigned command,const uint8_t *body,uint32_t length,uint32_t now)
{
    uint8_t f[4096]={0};memcpy(f,"MWVB",4);f[4]=1;f[5]=(uint8_t)command;
    put32(f+8,seq++);put32(f+12,command==1?0:svc.transaction);
    put32(f+16,command==1?0:svc.generation);put32(f+20,length);
    memcpy(f+24,base,32);memcpy(f+56,session,32);if(length) memcpy(f+96,body,length);
    int accepted=modwerk_volatile_queue(&svc,f,96+length);
    if(accepted) modwerk_volatile_service(&svc,now);
    return accepted;
}
static void begin_offer(uint32_t now)
{
    uint8_t body[72]={0};memcpy(body,baseline_digest,32);memcpy(body+32,offer_digest,32);
    put32(body+64,whole_bytes);CHECK(send(1,body,sizeof body,now));
    if(journal_enabled==1) CHECK(svc.phase==MVS_RECEIVING && svc.result==MVS_OK && svc.transaction && svc.generation);
}
static void upload_verify(uint32_t now)
{
    uint8_t body[4096];put32(body,0);memcpy(body+4,whole,whole_bytes);
    CHECK(send(2,body,whole_bytes+4,now));CHECK(svc.received==whole_bytes);
    CHECK(send(3,0,0,now));
    for(unsigned i=0;i<4 && svc.verifying;++i) modwerk_volatile_service(&svc,now);
}
/* Synthetic READY publication of the whole offer into the stopped trial. */
static void publish_trial(uint32_t now)
{
    begin_offer(now);upload_verify(now+1);CHECK(svc.phase==MVS_VERIFIED && send(4,0,0,now+2));
    for(unsigned i=0;i<4 && svc.phase==MVS_PUBLISHING;++i) modwerk_volatile_service(&svc,now+3);
    CHECK(svc.phase==MVS_STOPPED_TRIAL && svc.result==MVS_OK && journal.progress.published==2 && memcmp(svc.current,baseline_digest,32));
}
/* A boot from a card file the previous run left: the expected result, count and whole-set identity. */
static const char *card_dir;
static unsigned card_snaps;
static void card_save(unsigned result, unsigned count, const uint8_t digest[32])
{
    char path[512]; snprintf(path, sizeof path, "%s/card-%03u.bin", card_dir, card_snaps++);
    FILE *f = fopen(path, "wb"); uint32_t head[5] = {card_length[0], card_length[1], card_present[0] | card_present[1] << 1, result, count};
    CHECK(f && fwrite(head, sizeof head, 1, f) == 1 && fwrite(digest, 32, 1, f) == 1);
    for (unsigned i = 0; f && i < 2; ++i) CHECK(!card_length[i] || fwrite(card[i], card_length[i], 1, f) == 1);
    CHECK(f && !fclose(f));
}
static int card_boot(const char *path)
{
    uint32_t head[5]; uint8_t digest[32], live_digest[32];
    FILE *f = fopen(path, "rb");
    CHECK(f && fread(head, sizeof head, 1, f) == 1 && fread(digest, 32, 1, f) == 1 && head[0] <= CARD_BYTES && head[1] <= CARD_BYTES);
    for (unsigned i = 0; f && i < 2; ++i) {
        card_length[i] = head[i]; card_present[i] = head[2] >> i & 1u;
        CHECK(!card_length[i] || fread(card[i], card_length[i], 1, f) == 1);
    }
    if (f) fclose(f);
    for (unsigned i = 0; i < sizeof stock; ++i) stock[i] = (uint8_t)(0x40 + i);
    memcpy(original, stock, sizeof stock);
    modwerk_test_ticks = 200; modwerk_modset_service(); /* RAM gone, the card kept: the real restore and loader */
    uint32_t lock = modwerk_machine_lock(); CHECK(modwerk_runtime_journal_digest(live_digest)); modwerk_machine_unlock(lock);
    CHECK(modwerk_modset_result == head[3] && modwerk_runtime_active() == head[4] && !memcmp(live_digest, digest, 32));
    if (failures) { fprintf(stderr, "%s: %u boot checks failed\n", path, failures); return 1; }
    return 0;
}
/* The card a power loss before the next sector write would leave: the previous whole set. */
static uint8_t expect_digest[32];
static unsigned expect_count;
static void power_lost(void) { card_save(SET_RESTORED,expect_count,expect_digest); }
static struct msx_export exported;
/* The real reader's snapshot of one slot: generation, count and its packages' whole-set identity. */
static void export_slot(uint32_t which,uint32_t generation,unsigned count,const uint8_t digest[32])
{
    uint32_t ids[RUNTIME_JOURNAL_ROWS],at=84;uint8_t sha[32*RUNTIME_JOURNAL_ROWS],got[32];unsigned k=0;
    memset(&exported,0,sizeof exported);CHECK(msx_begin(&exported,which));
    msx_service(&exported,modwerk_saved_set_safe(),modwerk_saved_set_read,mu_sha256);
    const uint8_t *s=exported.snapshot;
    CHECK(exported.status==MSX_READY && !memcmp(s,"MWST",4) && be32(s+8)==generation && be32(s+12)==count);
    for(;exported.status==MSX_READY && at<be32(s+16) && k<RUNTIME_JOURNAL_ROWS;++k) {
        ids[k]=be32(s+at);mu_sha256(s+at+8,be32(s+at+4),sha+32*k);at+=8u+((be32(s+at+4)+3u)&~3u);
    }
    CHECK(k==count && runtime_journal_set_digest(ids,sha,k,got) && !memcmp(got,digest,32));
}
/* Another base's whole set (its configuration hash differs) in slot 0, holding a module linked to that base (Analog
 * BD's id, modset.c base_bound[]), which this base leaves out. */
static void foreign_card(void)
{
    id=0xabdb1445u;begin(32,0,0,0,0,1,0x30);site(STOCK+192,6);
    uint8_t *c=card[0];uint32_t bytes=84u+8u+((n+3u)&~3u);memset(c,0,(bytes+511u)&~511u);
    memcpy(c,"MWST",4);put32(c+4,1);put32(c+8,9);put32(c+12,1);put32(c+16,bytes);
    memcpy(c+20,modwerk_base_digest,32);c[20]^=0x80u;
    put32(c+84,id);put32(c+88,n);memcpy(c+92,p,n);mu_sha256(c+84,bytes-84u,c+52);
    card_length[0]=(bytes+511u)&~511u;card_present[0]=1; /* written whole sectors, as modset.c writes */
}
static void finish_rollback(uint32_t now)
{
    journal_observed=RJ_READY;journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
    journal_roots=1;journal_commit=1;
    for(unsigned i=0;i<8 && svc.phase==MVS_ROLLBACK;++i) modwerk_volatile_service(&svc,now);
    CHECK(svc.phase==MVS_IDLE && svc.result==MVS_OK && svc.current_known);
    CHECK(!memcmp(svc.current,baseline_digest,32) && !modwerk_runtime_volatile_busy());
}
int main(int argc,char **argv)
{
    if(argc==3 && !strcmp(argv[1],"boot")) return card_boot(argv[2]);
    if(legacy_main()) return 1;
    CHECK(argc==2 || argc==3);card_dir=argc==3?argv[2]:0;
    if(!strcmp(argv[1],"keepforeign")) { /* a boot from only that set installs nothing: its one module is linked to its base */
        uint8_t none[32];foreign_card();CHECK(card_dir && runtime_journal_set_digest(0,0,0,none));card_save(SET_REFUSED,0,none);
    }
    seed_saved_set();journal_enabled=journal_begin_safe=journal_admitted=1;
    if(!strcmp(argv[1],"keeprefuse")) { /* the saved set holds another 112 than the live one: not the live baseline */
        id=112;begin(32,0,0,0,0,1,0x13);site(STOCK+64,6);modwerk_modset_candidate(p,n);modwerk_modset_accepted();
        modwerk_modset_service();CHECK(modwerk_modset_result==SET_SAVED && modwerk_modset_count==2);
    }
    journal_observed=RJ_READY;journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
    uint32_t lock=modwerk_machine_lock();CHECK(modwerk_runtime_journal_digest(baseline_digest));
    modwerk_machine_unlock(lock);CHECK(modwerk_volatile_init(&svc,stage,sizeof stage,base,session));
    make_bundle();uint32_t free_before=modwerk_runtime_free(0);uint8_t stock_before[256];
    memcpy(stock_before,stock,sizeof stock);const struct runtime_module *before0=live[0],*before1=live[1];
    if(!strcmp(argv[1],"wire")) {
        uint8_t frame[168]={0};memcpy(frame,"MWVB",4);frame[4]=frame[5]=1;
        put32(frame+8,seq++);put32(frame+20,72);memcpy(frame+24,base,32);memcpy(frame+56,session,32);
        memcpy(frame+96,baseline_digest,32);memcpy(frame+128,offer_digest,32);put32(frame+160,whole_bytes);
        CHECK(!modwerk_volatile_queue(&svc,frame,128)); /* full packet multiple */
        frame[88]=1;CHECK(!modwerk_volatile_queue(&svc,frame,sizeof frame));frame[88]=0;
        CHECK(modwerk_volatile_queue(&svc,frame,sizeof frame));
        CHECK(!modwerk_volatile_queue(&svc,frame,sizeof frame)); /* sole immutable owner */
        memset(frame,0,sizeof frame); /* caller mutation cannot alter accepted bytes */
        modwerk_volatile_service(&svc,100);CHECK(svc.phase==MVS_RECEIVING && svc.result==MVS_OK);
        memcpy(frame,"MWVB",4);frame[4]=1;frame[5]=7;put32(frame+8,svc.sequence);
        put32(frame+12,svc.transaction);put32(frame+16,svc.generation);memcpy(frame+24,base,32);memcpy(frame+56,session,32);
        CHECK(!modwerk_volatile_queue(&svc,frame,96)); /* no sequence replay */
        put32(frame+8,seq++);put32(frame+16,svc.generation+1);
        unsigned jobs=journal_jobs;
        CHECK(modwerk_volatile_queue(&svc,frame,96));modwerk_volatile_service(&svc,101);
        CHECK(svc.result==MVS_STALE && svc.phase==MVS_RECEIVING && journal_jobs==jobs);
        CHECK(send(7,0,0,102));finish_rollback(102);
        CHECK(svc.capacity==sizeof stage-MVS_FRAME_BYTES && svc.frame==stage+svc.capacity);
        CHECK(svc.status[7]==15u-4u && be32(svc.status+196)==svc.capacity);
    } else if(!strncmp(argv[1],"keep",4)) {
        /* Keep (9): a fresh-install set accepted as the new baseline and saved set; board answers synthetic. */
        const char *c=argv[1]+4;unsigned accepts=journal_accepts;
        make_bundle_from(!strcmp(c,"replace")?111:110);publish_trial(100);
        uint8_t trial[32],frame[160]={0};memcpy(trial,svc.current,32);
        if(!strcmp(c,"")) {
            memcpy(frame,"MWVB",4);frame[4]=1;frame[5]=9;put32(frame+8,seq++);put32(frame+12,svc.transaction+1);
            put32(frame+16,svc.generation);memcpy(frame+24,base,32);memcpy(frame+56,session,32);
            CHECK(modwerk_volatile_queue(&svc,frame,96));modwerk_volatile_service(&svc,104);
            CHECK(svc.result==MVS_STALE && svc.phase==MVS_STOPPED_TRIAL); /* another transaction */
            CHECK(send(9,frame,4,105) && svc.result==MVS_LENGTH && svc.phase==MVS_STOPPED_TRIAL);
            journal_accept=0;CHECK(send(9,0,0,106) && svc.result==MVS_REFUSED && svc.phase==MVS_STOPPED_TRIAL);
            CHECK(modwerk_modset_count==2 && !modwerk_modset_unsaved());
            CHECK(journal.progress.phase==RJ_TRIAL && journal_accepts==accepts+1);
            journal_accept=1;CHECK(send(9,0,0,107));
            CHECK(svc.phase==MVS_IDLE && svc.result==MVS_OK && journal_accepts==accepts+2 && !modwerk_volatile_busy(&svc));
            CHECK(!modwerk_runtime_volatile_busy() && !memcmp(svc.baseline,trial,32) && !memcmp(svc.current,trial,32));
            /* The refused attempt left the saved set alone; the kept one is the saved set, unsaved until the card has it. */
            uint8_t status[212];CHECK(modwerk_volatile_status(&svc,status)==212 && status[7]==(1u|2u|8u|16u));
            CHECK(modwerk_modset_count==4 && !modwerk_modset_export_idle());
            modwerk_modset_service();CHECK(modwerk_modset_result==SET_SAVED && modwerk_modset_export_idle());
            CHECK(modwerk_volatile_status(&svc,status)==212);
            CHECK(status[5]==MVS_OK && status[6]==MVS_IDLE && status[7]==(1u|2u|8u) && be32(status+8)==svc.sequence);
            CHECK(be32(status+12)==svc.transaction && be32(status+16)==svc.generation && !be32(status+20) && !be32(status+24));
            CHECK(!be32(status+28) && !memcmp(status+96,trial,32) && !memcmp(status+160,trial,32));
            for(unsigned i=128;i<160;++i) CHECK(!status[i]);
            /* Replay or a later Keep changes nothing: consumed once. */
            memcpy(frame,"MWVB",4);frame[5]=9;put32(frame+8,svc.sequence);put32(frame+12,svc.transaction);
            CHECK(!modwerk_volatile_queue(&svc,frame,96));
            CHECK(send(9,0,0,108) && svc.result==MVS_STALE && svc.phase==MVS_IDLE && journal_accepts==accepts+2);
            /* The kept set is ordinary live state: the legacy path is open and removes it. */
            for(id=110;id<=113;id+=3) {
                begin(0,0,RUNTIME_NONE,0,0,0,0);
                CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
            }
            modwerk_volatile_service(&svc,109);CHECK(!memcmp(svc.current,baseline_digest,32));
        } else if(!strcmp(c,"persist") || !strcmp(c,"foreign")) {
            /* Power lost before any sector of the Keep's save lands: a boot restores the previous set (never
             * a half set, never the foreign one's linked module). Complete: exactly the identity Keep reported, the export
             * reads it back, and a legacy install's save (overwriting in place) keeps the kept modules. */
            uint8_t status[212],kept[32],legacy[32];unsigned generation=modwerk_modset_generation;
            CHECK(card_dir!=0);
            if(*c=='f') card_save(SET_RESTORED,2,baseline_digest); /* the seed's set beside the foreign one */
            CHECK(send(9,0,0,104) && svc.phase==MVS_IDLE && svc.result==MVS_OK && journal_accepts==accepts+1);
            CHECK(modwerk_volatile_status(&svc,status)==212 && status[7]==(1u|2u|8u|16u));
            memcpy(kept,status+96,32);CHECK(!memcmp(kept,trial,32) && !memcmp(kept,status+160,32));
            CHECK(modwerk_modset_generation==generation+1 && modwerk_modset_count==4 && !modwerk_saved_set_safe());
            memcpy(expect_digest,baseline_digest,32);expect_count=2;card_power=power_lost;card_writes=0;
            modwerk_modset_service();card_power=0;
            CHECK(card_writes>=2 && modwerk_modset_result==SET_SAVED && modwerk_volatile_status(&svc,status)==212 && status[7]==(1u|2u|8u));
            card_save(SET_RESTORED,4,kept);export_slot(0,generation+1,4,kept);
            id=120;begin(32,0,0,0,0,1,0x20);site(STOCK+192,6);modwerk_modset_candidate(p,n);
            CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
            modwerk_modset_accepted();CHECK(modwerk_modset_count==5);
            uint32_t lock=modwerk_machine_lock();CHECK(modwerk_runtime_journal_digest(legacy));modwerk_machine_unlock(lock);
            memcpy(expect_digest,kept,32);expect_count=4;card_power=power_lost;card_keeps=1;
            modwerk_modset_service();card_power=0;card_keeps=0;
            CHECK(modwerk_modset_result==SET_SAVED && modwerk_volatile_status(&svc,status)==212 && !(status[7]&48u));
            card_save(SET_RESTORED,5,legacy);export_slot(1,generation+2,5,legacy);
            for(id=110;id<=120;id+=id==110?3:7) {
                begin(0,0,RUNTIME_NONE,0,0,0,0);
                CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
            }
        } else if(!strcmp(c,"fail")) {
            /* A changed read-back, a failed close, then each failed sector write: unsaved and failed, never
             * saved, retried after ten seconds. A complete file restores the kept set, a torn one the previous. */
            uint8_t status[212],kept[32];unsigned sectors=0;
            CHECK(card_dir && send(9,0,0,104) && svc.phase==MVS_IDLE && svc.result==MVS_OK);
            CHECK(modwerk_volatile_status(&svc,status)==212);memcpy(kept,status+96,32);
            for(unsigned k=0;k<2u+sectors;++k) {
                card_writes=0;card_bad_read=k==0;card_fail_close=k==1;card_fail_write=k<2?0:k-1;
                modwerk_test_ticks+=600;modwerk_modset_service();
                if(!k) sectors=card_writes;
                CHECK(modwerk_modset_result==SET_FAILED && modwerk_volatile_status(&svc,status)==212 && status[7]==(1u|2u|8u|16u|32u));
                CHECK(!modwerk_modset_export_idle() && card_writes==(k<2?sectors:k-1));
                card_save(SET_RESTORED,k<2?4:2,k<2?kept:baseline_digest);
                unsigned writes=card_writes;modwerk_modset_service();CHECK(card_writes==writes);
            }
            card_fail_close=card_fail_write=0;modwerk_test_ticks+=600;modwerk_modset_service();
            CHECK(sectors>=2 && modwerk_modset_result==SET_SAVED && modwerk_volatile_status(&svc,status)==212 && !(status[7]&48u));
            card_save(SET_RESTORED,4,kept);
            for(id=110;id<=113;id+=3) {
                begin(0,0,RUNTIME_NONE,0,0,0,0);
                CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
            }
        } else if(!strcmp(c,"refuse")) {
            /* The saved set is not the live baseline (see main): Keep is refused before the board, the trial,
             * the RAM set and the card unchanged; rollback still works. */
            unsigned generation=modwerk_modset_generation,writes=card_writes;
            CHECK(send(9,0,0,104) && svc.result==MVS_REFUSED && svc.phase==MVS_STOPPED_TRIAL && journal_accepts==accepts);
            CHECK(journal.progress.phase==RJ_TRIAL && modwerk_modset_generation==generation && modwerk_modset_count==2);
            modwerk_modset_service();CHECK(card_writes==writes && !modwerk_modset_unsaved());
            CHECK(send(6,0,0,105));finish_rollback(105);CHECK(modwerk_modset_export_idle());
        } else if(!strcmp(c,"replace")) {
            /* A replacement retires a predecessor: no roots proof, refused before the board. */
            CHECK(send(9,0,0,104) && svc.result==MVS_REFUSED && svc.phase==MVS_STOPPED_TRIAL && journal_accepts==accepts);
            CHECK(journal.progress.phase==RJ_TRIAL && live[0]!=before0 && !memcmp(svc.current,trial,32));
            CHECK(send(5,0,0,105) && svc.phase==MVS_RUNNING_TRIAL);
            CHECK(send(9,0,0,106) && svc.result==MVS_STATE && svc.phase==MVS_RUNNING_TRIAL && journal_accepts==accepts);
            CHECK(send(6,0,0,107));finish_rollback(107); /* reverse still works before Keep */
        } else if(!strcmp(c,"quiet") || !strcmp(c,"absolute")) {
            /* A late Keep is expiry: rollback, never accept. */
            int quiet=!strcmp(c,"quiet");
            if(!quiet) for(uint32_t t=200;t<7300;t+=500) CHECK(send(8,0,0,t) && svc.phase==MVS_STOPPED_TRIAL);
            CHECK(send(9,0,0,quiet?703:7300) && svc.phase==MVS_ROLLBACK && journal_accepts==accepts);
            finish_rollback(7301);
            /* Expiry seen by the tick wins over a queued Keep. */
            publish_trial(8000);CHECK(modwerk_volatile_tick(&svc,8603));
            CHECK(send(9,0,0,8603) && svc.phase==MVS_ROLLBACK && journal_accepts==accepts);finish_rollback(8604);
        } else {
            /* Unknown board answer: quarantine, held, never retried; only explicit host rollback recovers. */
            CHECK(!strcmp(c,"unknown"));journal_accept=-1;
            CHECK(send(9,0,0,104) && svc.phase==MVS_QUARANTINE && svc.result==MVS_QUARANTINED && !svc.current_known);
            CHECK(journal.progress.phase==RJ_QUARANTINE && journal_accepts==accepts+1);
            CHECK(modwerk_modset_count==2 && !modwerk_modset_unsaved()); /* unknown work is never the saved set */
            uint32_t held=modwerk_runtime_free(0);modwerk_volatile_tick(&svc,9000);modwerk_volatile_service(&svc,9000);
            CHECK(send(9,0,0,9001) && svc.phase==MVS_QUARANTINE && journal_accepts==accepts+1 && modwerk_runtime_free(0)==held);
            journal_accept=1;CHECK(send(6,0,0,9002));finish_rollback(9002);
        }
    } else if(!strcmp(argv[1],"closed")) {
        journal_enabled=0;begin_offer(100);
        CHECK(svc.phase==MVS_IDLE && svc.result==MVS_UNSUPPORTED && !modwerk_runtime_volatile_busy());
    } else if(!strcmp(argv[1],"malformed")) {
        /* A valid outer digest cannot hide a corrupt final record. Nothing is
         * allocated before the entire bundle and board declarations pass. */
        whole[whole_bytes-3]^=1;mu_sha256(whole,whole_bytes,offer_digest);
        begin_offer(100);upload_verify(101);
        CHECK(svc.result==MVS_HASH && !journal.progress.records && modwerk_runtime_free(0)==free_before);
        CHECK(send(7,0,0,102));finish_rollback(102);
        make_bundle();association_allow=0;begin_offer(200);upload_verify(201);
        CHECK(svc.result==MVS_REFUSED && !journal.progress.records && modwerk_runtime_free(0)==free_before);
        CHECK(send(7,0,0,202));finish_rollback(202);
    } else {
        begin_offer(100);upload_verify(101);CHECK(svc.phase==MVS_VERIFIED && journal.progress.records==2);
        CHECK(associations==2 && modwerk_runtime_free(0)<free_before);
        journal_observed=RJ_WAIT;journal_masks[0]=3;journal_masks[1]=1;journal_masks[2]=1;
        CHECK(send(4,0,0,102));CHECK(svc.phase==MVS_PUBLISHING && !svc.current_known);
        CHECK(!journal.progress.published && live[0]==before0 && live[1]==before1);
        if(!strcmp(argv[1],"unknown")) {
            journal_observed=RJ_UNKNOWN;modwerk_volatile_service(&svc,103);
            CHECK(svc.phase==MVS_QUARANTINE && !svc.current_known);
            uint32_t free_staged=modwerk_runtime_free(0);unsigned jobs=journal_jobs;
            modwerk_volatile_tick(&svc,8000);modwerk_volatile_service(&svc,8000);
            CHECK(journal_jobs==jobs && modwerk_runtime_free(0)==free_staged && reachable(before0));
            journal_observed=RJ_READY;journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
            CHECK(send(6,0,0,8001));finish_rollback(8001);
        } else {
            journal_observed=RJ_READY;journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
            for(unsigned i=0;i<4 && svc.phase==MVS_PUBLISHING;++i) modwerk_volatile_service(&svc,103);
            CHECK(svc.phase==MVS_STOPPED_TRIAL && svc.current_known && journal.progress.published==2);
            CHECK(memcmp(svc.current,baseline_digest,32) && reachable(before0));
            if(!strcmp(argv[1],"expiry")) {
                CHECK(send(5,0,0,104) && trial_running && svc.phase==MVS_RUNNING_TRIAL);
                CHECK(send(8,0,0,105) && svc.result==MVS_LIMIT && svc.heard==103);
                uint8_t status[212];for(unsigned i=0;i<100;++i) CHECK(modwerk_volatile_status(&svc,status)==212);
                CHECK(svc.heard==103);CHECK(modwerk_volatile_tick(&svc,703));
                modwerk_volatile_service(&svc,703);CHECK(!trial_running);finish_rollback(703);
                begin_offer(1000);upload_verify(1001);CHECK(send(4,0,0,1002));
                for(unsigned i=0;i<4 && svc.phase==MVS_PUBLISHING;++i) modwerk_volatile_service(&svc,1003);
                for(uint32_t t=1100;t<8200;t+=100) CHECK(send(8,0,0,t) && svc.phase==MVS_STOPPED_TRIAL);
                CHECK(modwerk_volatile_tick(&svc,8200));modwerk_volatile_service(&svc,8200);finish_rollback(8200);
            } else {
                CHECK(send(6,0,0,104));journal_roots=0;
                for(unsigned i=0;i<4;++i) modwerk_volatile_service(&svc,104);
                CHECK(svc.phase==MVS_ROLLBACK && modwerk_runtime_free(0)<free_before);
                finish_rollback(105);
            }
        }
    }
    CHECK(live[0]==before0 && live[1]==before1 && modwerk_runtime_free(0)==free_before);
    CHECK(!memcmp(stock,stock_before,sizeof stock) && !locked && !masked);
    uint8_t capabilities[12];modwerk_runtime_capabilities(capabilities);CHECK(!(be16(capabilities+6)&64u));
    if(failures) { fprintf(stderr,"%u volatile checks failed\n",failures);return 1; }
    return 0;
}
