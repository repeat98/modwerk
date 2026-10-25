/* SPDX-License-Identifier: GPL-3.0-or-later
 * Production saved-set transaction against the actual modset.c and a pretend
 * card. No firmware, hardware, USB stack or reboot-persistence qualification. */
#define MODWERK_RUNTIME_SETS
#define main legacy_modset_checks
#include "test_modset.c"
#undef main
static int set_busy;
int modwerk_runtime_set_busy(void) { return set_busy; }
static uint8_t offer[512];
static unsigned offer_bytes;
static void append(unsigned k,unsigned bytes)
{
    put32(offer+offer_bytes,bytes);memcpy(offer+offer_bytes+4,package[k],bytes);
    offer_bytes+=4u+((bytes+3u)&~3u);put32(offer+8,offer_bytes);
}
static uint8_t many[RUNTIME_JOURNAL_ROWS][48],big[80u+52u*RUNTIME_JOURNAL_ROWS];
/* An offer adding n fresh modules (ids 1000 on) to the saved set as it stands; its length. */
static unsigned offer_adding(unsigned n)
{
    uint32_t ids_held[RUNTIME_JOURNAL_ROWS];uint8_t sha_held[32u*RUNTIME_JOURNAL_ROWS];unsigned count=0,end=80;
    for(uint32_t at=HEADER;at<used();++count) {
        uint32_t bytes=be32(set+at+4);ids_held[count]=be32(set+at);
        mu_sha256(set+at+8,bytes,sha_held+32u*count);at+=8u+((bytes+3u)&~3u);
    }
    memset(big,0,sizeof big);memcpy(big,"MWMS",4);big[5]=1;big[7]=(uint8_t)n;
    memcpy(big+16,modwerk_base_digest,32);CHECK(runtime_journal_set_digest(ids_held,sha_held,count,big+48));
    for(unsigned i=0;i<n;++i) {
        memset(many[i],0,48);memcpy(many[i],"MWRM",4);many[i][5]=4;put32(many[i]+8,4);put32(many[i]+28,1000u+i);
        put32(big+end,48);memcpy(big+end+4,many[i],48);end+=52u;
    }
    put32(big+8,end);return end;
}
int main(void)
{
    CHECK(legacy_modset_checks()==0);
    boot();restored=1;memset(card_bytes,0,sizeof card_bytes);
    make(0,11,0);make(1,22,0);make(2,22,1);make(3,11,0);make(4,33,0);
    package[3][40]=0x73;package[4][40]=0x74;
    accept(0,48);accept(1,48);modwerk_modset_service();
    const uint8_t *old[]={package[0],package[1]};const uint32_t sizes[]={48,48};
    memset(offer,0,sizeof offer);memcpy(offer,"MWMS",4);offer[5]=1;offer[7]=3;offer_bytes=80;
    memcpy(offer+16,modwerk_base_digest,32);CHECK(identity(old,sizes,2,offer+48));
    append(3,48);append(2,32);append(4,48);
    uint32_t generation=modwerk_modset_generation;unsigned written=writes;
    uint8_t baseline[SET_BYTES];memcpy(baseline,set,sizeof set);
    CHECK(modwerk_modset_check_set(offer,offer_bytes));
    offer[48]^=1;CHECK(!modwerk_modset_check_set(offer,offer_bytes));offer[48]^=1;
    modwerk_modset_candidate(offer,offer_bytes);set_busy=1;
    CHECK(modwerk_modset_check_set(0,0));
    modwerk_modset_service();modwerk_modset_accepted();
    CHECK(writes==written && modwerk_modset_generation==generation && !memcmp(baseline,set,sizeof set));
    /* Undo/disconnect discards the candidate. Neither saved file nor the
     * accepted in-memory baseline contains a prefix of the proposed set. */
    modwerk_modset_candidate(0,0);set_busy=0;modwerk_modset_service();
    CHECK(writes==written && !memcmp(baseline,set,sizeof set));
    /* One explicit Keep seals all replacements/removals/additions together. */
    modwerk_modset_candidate(offer,offer_bytes);CHECK(modwerk_modset_check_set(0,0));
    modwerk_modset_accepted();
    CHECK(modwerk_modset_generation==generation+1u && modwerk_modset_count==2 && pending && writes==written);
    CHECK(!modwerk_modset_check_set(offer,offer_bytes) && noted==RUNTIME_BUSY); /* not on the card yet: the site retries */
    const uint8_t *want[]={package[3],package[4]};uint8_t expected[32],got[32];CHECK(identity(want,sizes,2,expected));
    uint32_t ids_now[2];uint8_t sha_now[64];unsigned count=0;
    for(uint32_t at=HEADER;at<used();++count) {
        uint32_t bytes=be32(set+at+4);CHECK(count<2);ids_now[count]=be32(set+at);
        mu_sha256(set+at+8,bytes,sha_now+32u*count);at+=8u+((bytes+3u)&~3u);
    }
    CHECK(runtime_journal_set_digest(ids_now,sha_now,count,got) && !memcmp(got,expected,32));
    /* A torn final write restores the previous complete set at next boot. */
    write_fail=1;modwerk_modset_service();CHECK(pending && modwerk_modset_result==SAVE_FAILED);
    CHECK(!modwerk_modset_check_set(offer,offer_bytes) && noted==RUNTIME_OK);   /* a failed save: no retry helps */
    write_fail=0;boot();modwerk_modset_service();
    CHECK(installed==2 && ids[0]==11 && ids[1]==22);
    /* A module refused at boot (beta finding 69): a sync from what runs is accepted, and the card keeps both. */
    refuse_id=22;written=writes;boot();modwerk_modset_service();refuse_id=0;
    CHECK(modwerk_modset_result==REFUSED && installed==1 && modwerk_modset_count==1 && !pending && writes==written);
    const uint8_t *runs[]={package[0]};
    memset(offer,0,sizeof offer);memcpy(offer,"MWMS",4);offer[5]=1;offer[7]=1;offer_bytes=80;
    memcpy(offer+16,modwerk_base_digest,32);CHECK(identity(runs,sizes,1,offer+48));
    append(4,48);CHECK(modwerk_modset_check_set(offer,offer_bytes));
    boot();modwerk_modset_service();CHECK(modwerk_modset_result==RESTORED && installed==2);
    /* As many installed modules as the loader holds (once 20): 26 pass; one past the rows is FULL, not a bare refusal. */
    unsigned bytes_now=offer_adding(24);CHECK(modwerk_modset_check_set(big,bytes_now));
    bytes_now=offer_adding(RUNTIME_JOURNAL_ROWS-1u);CHECK(!modwerk_modset_check_set(big,bytes_now) && noted==RUNTIME_FULL);
    if(failures) return 1;
    puts("Whole saved set: exact baseline, no intermediate saves, one Keep generation, torn-write fallback passed.");
    return 0;
}
