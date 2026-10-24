/* SPDX-License-Identifier: GPL-3.0-or-later
 * Authored synthetic pages, actual catalogue/map/page publication, immutable
 * owner ledger and a single-use board receipt. No firmware donor is included. */
#define MODWERK_JOURNAL_FACT_EXTERNAL
#include "sha256.c"
volatile uint32_t modwerk_flash_refusal; /* flash.c, not linked here */
#include "dsp.c"
int modwerk_runtime_restoring(void) { return 0; } /* loader.c's: no restore here */
volatile uint32_t dl_residency_words[2]; /* manager.c: each core's resident code words (dsp.c's budget box) */
#include "fxmap.c"
#include "fxpage.c"
#include <stdio.h>
#include <string.h>
static unsigned failures,consumes,authority,invalidations;
#define CHECK(x) do { if(!(x)) { ++failures;fprintf(stderr,"%d: %s\n",__LINE__,#x); } } while(0)
const fx_set modwerk_fx_modules={{(1u<<26)|(1u<<27)}};
const struct fx_legacy modwerk_fx_legacy[]={{0,0,""}};
const uint32_t modwerk_fx_legacy_count=0;
struct dl_package dl_catalog[MODWERK_FX_IDS];struct code dl_codes[2][MODWERK_FX_IDS];
const uint16_t modwerk_dsp_arena[2]={2320,2300};
int dl_publication_idle(void) { return 1; }
uint32_t dl_slot_cycles(unsigned i) { (void)i; return 0; } /* manager.c; the source stage is test_dsp.c's */
uint8_t modwerk_test_memory[0x40000] __attribute__((aligned(16)));
uint32_t modwerk_fx1_list[MODWERK_LIST_ROWS]={0x1000},modwerk_fx2_list[MODWERK_LIST_ROWS]={0x1000};
const uint32_t modwerk_fx_rows[2]={1,1};
void modwerk_machine_invalidate_code(void) { ++invalidations; }
static struct runtime_owner ledger[2];static const struct runtime_module *live_module;
static struct runtime_journal_progress progress;
static struct modwerk_journal_commit_fact board_fact;
int modwerk_runtime_owner_valid(const struct runtime_owner *o)
{ return same_owner(o,&ledger[0]) || same_owner(o,&ledger[1]); }
int modwerk_runtime_owner_canonical(const struct runtime_owner *o,uintptr_t *out)
{ if(!modwerk_runtime_owner_valid(o)) return 0;*out=o->owned_extent;return 1; }
int modwerk_runtime_owner_snapshot(const uint8_t *p,struct runtime_owner *out)
{ for(unsigned i=0;i<2u;++i) if((uintptr_t)p==ledger[i].owned_extent+ledger[i].image_offset) { *out=ledger[i];return 1; }return 0; }
const struct runtime_module *modwerk_runtime_module(unsigned p) { return p==3u?live_module:0; }
void modwerk_runtime_journal_snapshot(struct runtime_journal_progress *out) { *out=progress; }
int modwerk_machine_journal_commit_ready(const struct runtime_journal_view *r,int reverse,struct modwerk_journal_commit_fact *out)
{ if(!authority || !same_row(r,&board_fact.row) || reverse!=board_fact.reverse) return 0;*out=board_fact;return 1; }
int modwerk_machine_journal_commit_consume(const struct modwerk_journal_commit_fact *f)
{ if(!authority || !same_fact(f,&board_fact)) return 0;authority=0;++consumes;return 1; }
static struct runtime_module *make_module(unsigned index,unsigned generation,int code)
{
    struct runtime_module *m=(struct runtime_module *)(void *)(modwerk_test_memory+0x22000u+0x2000u*index);
    memset(m,0,1024);m->id=70;m->size=1024;
    unsigned head=(sizeof *m+15u)&~15u;uint8_t *p=(uint8_t *)m+head;
    m->dsp=(struct runtime_dsp){.image=p,.image_bytes=256,.present=1,.module=70,.layout=1,.name="Synthetic FX"};
    if(code) {
        m->dsp.words=(uint32_t *)(void *)(p+256);m->dsp.relocations=(uint16_t *)(void *)(p+272);
        m->dsp.count=3;m->dsp.relocation_count=1;m->dsp.init=1;m->dsp.proc=2;m->dsp.cycles=244;
        m->dsp.id=26;m->dsp.slots=2;m->dsp.kind=RUNTIME_MODELED;m->dsp.state=70;m->dsp.page=p;m->dsp.page_bytes=256;
        uint32_t *words=(uint32_t *)(void *)(p+256);words[0]=0;words[1]=2;words[2]=3;
        memcpy(p,"MWPG",4);put32(p+4,0x100);mu_sha256(modwerk_test_memory+0x100,PAGE,p+8);
        p[42]=1;p[44]=1;p[52]=0;p[53]=94;p[54]=1;put32(p+56,77+index);
        p[60]=8;p[61]=1;p[62]=1;put32(p+64,ADDR(p+128));p[68]=0;p[69]=16;p[72]=0;p[73]=8;put32(p+136,0x16);
    }
    memset(m->dsp.package_sha256,generation,MU_DIGEST_BYTES);
    ledger[index]=(struct runtime_owner){.generation=generation,.module=m->id,.owned_extent=(uintptr_t)m,.extent_bytes=m->size,.image_offset=head,.image_bytes=256};
    memcpy(ledger[index].package_sha256,m->dsp.package_sha256,MU_DIGEST_BYTES);return m;
}
static void reset(void)
{
    (void)rebind_tick;
    memset(modwerk_test_memory,0,sizeof modwerk_test_memory);memset(owner,0,sizeof owner);memset(catalogue_generation,0,sizeof catalogue_generation);
    memset(owner_page,0,sizeof owner_page);memset(owner_pinned,0,sizeof owner_pinned);memset(owner_cycles,0,sizeof owner_cycles);memset(owner_measured,0,sizeof owner_measured);
    memset(dl_codes,0,sizeof dl_codes);memset(serves,0,sizeof serves);memset(checked_recipe,0,sizeof checked_recipe);memset(wide,0,sizeof wide);
    for(unsigned k=0;k<MODWERK_FX_IDS;++k) dl_catalog[k]=(struct dl_package)STOCK;
    memset(&modwerk_test_map,0,sizeof modwerk_test_map);seeded();rows();nudge=rebinding=checked_preflight_ready=0;consumes=authority=invalidations=0;
}
static struct runtime_journal_view prepare(int code)
{
    reset();struct runtime_module *before=make_module(0,1,code),*after=make_module(1,2,code);static const struct runtime_dsp empty;
    modwerk_machine_dsp_switch(&empty,&before->dsp);nudge=0;live_module=before;
    struct runtime_journal_view r={.before=ledger[0],.after=ledger[1],.from=&before->dsp,.to=&after->dsp,.module=70,.position=3};
    memcpy(r.package_sha256,r.after.package_sha256,MU_DIGEST_BYTES);
    progress=(struct runtime_journal_progress){.generation=7,.phase=RJ_PUBLISHING,.required=code?3:0,.touched=code?3:0,.confirmed=code?3:0};
    board_fact=(struct modwerk_journal_commit_fact){.row=r,.catalogue_handle=code?26:255,.ticket=9,.generation=7,.map_generation=modwerk_fxmap_checked_generation(),.required=code?3:0,.touched=code?3:0,.confirmed=code?3:0,.released=code?3:0};
    if(code) for(unsigned c=0;c<2u;++c) { board_fact.job_ticket[c]=10+c;board_fact.job_generation[c]=11+c;board_fact.first_sequence[c]=1;board_fact.last_sequence[c]=3;board_fact.acknowledged_sequence[c]=3;board_fact.pool_base[c]=64;board_fact.pool_words[c]=2300;board_fact.code_offset[c]=64;board_fact.code_words[c]=3; }
    authority=1;return r;
}
static void publish(const struct runtime_journal_view *r)
{ live_module=(const struct runtime_module *)r->after.owned_extent; }
int main(void)
{
    struct runtime_journal_view r=prepare(1);CHECK(modwerk_machine_journal_switch_safe(&r,0));CHECK(!consumes && owner[26]==70 && catalogue_generation[26]==1);
    publish(&r);CHECK(modwerk_machine_journal_committed(&r,0));CHECK(consumes==1 && catalogue_generation[26]==2 && !nudge && checked_catalogue(&r.after,r.to,r.module));
    CHECK(!modwerk_machine_journal_committed(&r,0));CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    /* Post-publication integrity inspects real descriptors, formatters and routing. */
    pages[26][3]^=1;CHECK(!checked_catalogue(&r.after,r.to,r.module));pages[26][3]^=1;
    TABLE(3)[26]^=1;CHECK(!checked_catalogue(&r.after,r.to,r.module));TABLE(3)[26]^=1;
    ((uint8_t *)(uintptr_t)r.to->page)[128]^=1;CHECK(!checked_catalogue(&r.after,r.to,r.module));
    r=prepare(1);authority=0;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);board_fact.row.before.generation++;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);board_fact.row.package_sha256[0]^=1;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);board_fact.released=1;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);board_fact.acknowledged_sequence[1]=2;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);board_fact.code_offset[1]=0x1fffu;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);catalogue_generation[26]++;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);((uint32_t *)(uintptr_t)r.from->words)[1]^=1;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(1);modwerk_test_map.sum^=1;CHECK(!modwerk_machine_journal_switch_safe(&r,0));CHECK(modwerk_test_map.sum!=checksum());
    /* Entire invalid recipe is refused before any page, routing or fixup write. */
    r=prepare(1);uint8_t before_page[PAGE];memcpy(before_page,pages[26],PAGE);unsigned before_invalidate=invalidations;
    ((uint8_t *)(uintptr_t)r.to->page)[73]=14;CHECK(!modwerk_machine_journal_switch_safe(&r,0));CHECK(!memcmp(before_page,pages[26],PAGE) && invalidations==before_invalidate && !consumes);
    /* The second ready fact must be exactly the preflight fact. */
    r=prepare(1);CHECK(modwerk_machine_journal_switch_safe(&r,0));publish(&r);board_fact.ticket++;CHECK(!modwerk_machine_journal_committed(&r,0));CHECK(!consumes && catalogue_generation[26]==1);
    r=prepare(1);CHECK(modwerk_machine_journal_switch_safe(&r,0));CHECK(!modwerk_machine_journal_committed(&r,0));CHECK(!consumes);
    /* Reverse reconstructs the old owned page/catalogue, without legacy nudge. */
    r=prepare(1);CHECK(modwerk_machine_journal_switch_safe(&r,0));publish(&r);CHECK(modwerk_machine_journal_committed(&r,0));
    authority=1;board_fact.ticket++;board_fact.reverse=1;board_fact.map_generation=modwerk_fxmap_checked_generation();progress.phase=RJ_ROLLBACK;
    CHECK(modwerk_machine_journal_switch_safe(&r,1));live_module=(const struct runtime_module *)r.before.owned_extent;CHECK(modwerk_machine_journal_committed(&r,1));CHECK(catalogue_generation[26]==1 && !nudge);
    /* Reverse of an unpublished row checks the already-published target side. */
    r=prepare(1);board_fact.reverse=1;board_fact.catalogue_target=1;progress.phase=RJ_ROLLBACK;CHECK(modwerk_machine_journal_switch_safe(&r,1));CHECK(modwerk_machine_journal_committed(&r,1));
    /* Authenticated removal and a fresh install use real empty live sides. */
    static const struct runtime_dsp empty;
    r=prepare(1);r.after=(struct runtime_owner){0};r.to=&empty;memset(r.package_sha256,0xa5,MU_DIGEST_BYTES);board_fact.row=r;board_fact.catalogue_handle=255;
    for(unsigned c=0;c<2u;++c) board_fact.code_offset[c]=board_fact.code_words[c]=0;
    CHECK(modwerk_machine_journal_switch_safe(&r,0));live_module=0;CHECK(modwerk_machine_journal_committed(&r,0));CHECK(!owner[26] && empty_catalogue(26) && consumes==1);
    r=prepare(1);release(26);live_module=0;r.before=(struct runtime_owner){0};r.from=&empty;board_fact.row=r;
    CHECK(modwerk_machine_journal_switch_safe(&r,0));publish(&r);CHECK(modwerk_machine_journal_committed(&r,0));CHECK(catalogue_generation[26]==2);
    /* CF-only rows still require real owner/live/position and exact no-job proof. */
    r=prepare(0);CHECK(modwerk_machine_journal_switch_safe(&r,0));publish(&r);CHECK(modwerk_machine_journal_committed(&r,0));CHECK(consumes==1 && !owner[26]);
    r=prepare(0);board_fact.job_ticket[0]=1;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    r=prepare(0);r.position=4;board_fact.row=r;CHECK(!modwerk_machine_journal_switch_safe(&r,0));
    if(failures) return 1;
    puts("Checked journal DSP: actual catalogue/page/map commit, reverse, exact owners/jobs, corruption and single-use receipts passed.");return 0;
}
