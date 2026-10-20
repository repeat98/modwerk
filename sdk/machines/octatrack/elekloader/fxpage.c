/* SPDX-License-Identifier: GPL-3.0-or-later
 * Module effects in the stock FX choosers, built when a module registers (build_core.py --dsp-loader).
 * A package carries its page as a recipe (sdk/runtime/loader/build.py page_section): the stock donor
 * descriptor it starts from, checked against its SHA-256 in the running firmware, the integer and text
 * patches, and its formatters' code. The base builds the 0x192-byte descriptor here, gives it the module's
 * handle as its effect id, and lists it in the choosers, which read the base's own lists (the build points
 * stock's references at them). Stock's own tables say which descriptor and row each id has: FX1_IDS and
 * FX2_IDS (id -> descriptor), FX1_ID2POS and ID2POS (id -> row). Nothing here writes stock code. */
#include <stdint.h>
#include "upload.h"
#include "fxids.h"
#include "fxpage.h"

#define PAGE 0x192u
extern uint32_t modwerk_fx1_list[MODWERK_LIST_ROWS], modwerk_fx2_list[MODWERK_LIST_ROWS]; /* identity.c: NONE and the stock rows, then 0 */
extern const uint32_t modwerk_fx_rows[2];                   /* the stock rows, NONE included: FX1, FX2 */
void modwerk_machine_invalidate_code(void);
#ifdef MODWERK_CACHED_MODULES /* build_core.py --cached-modules: the fixups land in the data cache (runtime.c) */
void modwerk_machine_flush_data(uint32_t address, uint32_t length);
#endif
#ifdef MODWERK_HOST
/* The host test's address space: a 32-bit address is an offset into it, as the unit's addresses are. */
extern uint8_t modwerk_test_memory[0x40000];
uint32_t modwerk_test_tables[4][MODWERK_FX_IDS];
#define TABLE(which) (modwerk_test_tables[which])
#define DONOR_LOW 0u
#define DONOR_HIGH 0x20000u
#define AT(address) (modwerk_test_memory + (address))
#define ADDR(pointer) ((uint32_t)((const uint8_t *)(pointer) - modwerk_test_memory))
static uint8_t (*const pages)[0x1a0] = (uint8_t (*)[0x1a0])(modwerk_test_memory + 0x10000);
#else
/* The base's copies of FX1_IDS, FX2_IDS, FX1_ID2POS and ID2POS, MODWERK_FX_IDS long (dsp_loader.py choosers: stock's
 * 18 lea operands name them instead of stock's own). */
extern uint32_t modwerk_fx1_ids[], modwerk_fx2_ids[], modwerk_fx1_id2pos[], modwerk_fx2_id2pos[];
static volatile uint32_t *const tables[4] = {modwerk_fx1_ids, modwerk_fx2_ids, modwerk_fx1_id2pos, modwerk_fx2_id2pos};
#define TABLE(which) (tables[which])
#define DONOR_LOW 0x40000400u  /* a donor is a stock descriptor in the OS image's RAM copy */
#define DONOR_HIGH 0x400de1e0u
#define AT(address) ((uint8_t *)(uintptr_t)(address))
#define ADDR(pointer) ((uint32_t)(uintptr_t)(pointer))
static uint8_t pages[MODWERK_FX_IDS][0x1a0] __attribute__((aligned(4)));
#endif
static uint8_t serves[MODWERK_FX_IDS]; /* the slots each id's page is listed in: 1 FX1, 2 FX2 */
static const uint8_t *checked_recipe[MODWERK_FX_IDS];
static uint32_t checked_bytes[MODWERK_FX_IDS];
static uint8_t checked_digest[MODWERK_FX_IDS][MU_DIGEST_BYTES];
static int page_stamp(unsigned,const uint8_t *,uint32_t,unsigned,uint8_t *);
static int recipe_end(unsigned,const uint8_t *,uint32_t,unsigned,uint32_t *);
#define WIDE 4u /* wide formatters a page may have (EUCLID 3) */
static uint32_t wide[MODWERK_FX_IDS][WIDE][2];  /* per id: a formatter that draws over the whole dial, and its maximum */
uint32_t modwerk_wide_table[2u * (MODWERK_FX_IDS * WIDE + 1u)]; /* fxpage.s: the listed pages' wide formatters, 0-ended */

static uint32_t be16(const uint8_t *p) { return (uint32_t)p[0] << 8 | p[1]; }
static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v; }

/* Both choosers: the stock rows, then each listed module page in id order; each id's descriptor and row. */
static void rows(void)
{
    for (unsigned slot = 0; slot < 2u; ++slot) {
        uint32_t *list = slot ? modwerk_fx2_list : modwerk_fx1_list, none = modwerk_fx1_list[0], n = modwerk_fx_rows[slot];
        for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) {
            if (!fx_in(modwerk_fx_modules, k)) continue;
            int listed = serves[k] >> slot & 1u && n + 1u < MODWERK_LIST_ROWS; /* the list keeps its closing 0 */
            TABLE(slot)[k] = listed ? ADDR(pages[k]) : none;
            TABLE(2 + slot)[k] = listed ? n : 0;
            if (listed) list[n++] = ADDR(pages[k]);
        }
        while (n < MODWERK_LIST_ROWS) list[n++] = 0;
    }
    unsigned n = 0;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k)
        for (unsigned w = 0; serves[k] && w < WIDE && wide[k][w][0]; ++w)
            modwerk_wide_table[n++] = wide[k][w][0], modwerk_wide_table[n++] = wide[k][w][1];
    modwerk_wide_table[n] = modwerk_wide_table[n + 1] = 0;
}

/* Builds id's page from `recipe` (the head of the module's `bytes`-long image, which the loader relocated)
 * and lists it in `slots`. 0, with nothing written, when the recipe is malformed, reaches past the image,
 * lets a fixup reach a record or another fixup, or names a donor that is not the stock descriptor it says. */
int modwerk_fxpage_build(unsigned id, uint8_t *recipe, uint32_t bytes, unsigned slots)
{
    if (!recipe_end(id, recipe, bytes, slots, 0)) return 0; /* the whole recipe, before any write */
    uint8_t *d = pages[id];
    const uint8_t *donor = AT(be32(recipe + 4));
    for (unsigned i = 0; i < PAGE; ++i) d[i] = ((const volatile uint8_t *)donor)[i];
    uint32_t enable[2] = {be32(d + 0x18e), be32(d + 0x18a)}, inherited = be16(recipe + 40); /* before the patches */
    const uint8_t *e = recipe + 52;
    for (unsigned i = 0; i < recipe[42]; ++i, e += 8) {
        uint32_t at = be16(e);
        if (e[2] == 1u) d[at] = (uint8_t)be32(e + 4);
        else put32(d + at, be32(e + 4));
    }
    for (unsigned slot = 0; slot < 12u; ++slot) {
        if (!(inherited >> slot & 1u)) continue;
        uint32_t at = slot < 8u ? 0x18eu : 0x18au, mask = 0xfu << (slot % 8u) * 4u;
        put32(d + at, (be32(d + at) & ~mask) | (enable[slot >= 8u] & mask));
    }
    for (unsigned i = 0; i < recipe[43]; ++i) {
        uint32_t at = be16(e), width = e[2], length = e[3];
        for (unsigned c = 0; c < width; ++c) d[at + c] = c < length ? e[4 + c] : 0;
        e += (4u + length + 3u) & ~3u;
    }
    d[3] = (uint8_t)id; /* the effect id: the handle, whatever the catalogue's was */
    uint32_t delta = ADDR(d) - be32(recipe + 48); /* the fixups held the last page's address */
    unsigned wides = 0;
    for (unsigned w = 0; w < WIDE; ++w) wide[id][w][0] = wide[id][w][1] = 0;
    for (unsigned i = 0; i < recipe[44]; ++i) {
        uint32_t slot = e[0], fixups = e[1], code = be32(e + 4);
        for (unsigned f = 0; f < fixups; ++f) {
            uint8_t *word = AT(code + be16(e + 12 + 2u * f));
            put32(word, be32(word) + delta);
        }
#ifdef MODWERK_CACHED_MODULES /* the formatter runs from the cached alias: its fixed words reach memory first */
        modwerk_machine_flush_data(code, be16(e + 8));
#endif
        put32(d + 0xca + 4u * slot, code);
        if (e[2]) put32(d + 0xfa + 4u * slot, 0); /* its own formatter draws it: no stock widget */
        if (e[3]) wide[id][wides][0] = code, wide[id][wides++][1] = e[3]; /* more than five labels */
        e += (12u + 2u * fixups + 3u) & ~3u;
    }
    put32(recipe + 48, ADDR(d));
    modwerk_machine_invalidate_code(); /* the fixups changed formatter code */
    serves[id] = (uint8_t)(slots & 3u);
    rows();
    checked_recipe[id] = recipe; checked_bytes[id] = bytes;
    if (!page_stamp(id, recipe, bytes, slots, checked_digest[id])) checked_recipe[id] = 0;
    return 1;
}
void modwerk_fxpage_drop(unsigned id)
{
    if (id >= MODWERK_FX_IDS || !serves[id]) return;
    serves[id] = 0;
    checked_recipe[id] = 0; checked_bytes[id] = 0;
    rows();
}

/* Walk the entire recipe, including each padded record, before either path
 * writes a descriptor, formatter fixup or chooser entry. */
static int recipe_end(unsigned id,const uint8_t *p,uint32_t bytes,unsigned slots,uint32_t *records)
{
    if (!fx_in(modwerk_fx_modules,id) || !p || bytes<52u || !slots || slots>3u || be32(p)!=0x4d575047u) return 0;
    uint32_t donor=be32(p+4), low=ADDR(p), at=52u, wides=0;
    if (bytes>UINT32_MAX-low || donor-DONOR_LOW>DONOR_HIGH-PAGE-DONOR_LOW) return 0;
    uint8_t digest[MU_DIGEST_BYTES];mu_sha256(AT(donor),PAGE,digest);
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i) if(digest[i]!=p[8+i]) return 0;
    for(unsigned i=0;i<p[42];++i,at+=8u) {
        if(at>bytes || bytes-at<8u) return 0;
        uint32_t address=be16(p+at),width=p[at+2];
        if((width!=1u && width!=4u) || address>PAGE-width) return 0;
    }
    for(unsigned i=0;i<p[43];++i) {
        if(at>bytes || bytes-at<4u) return 0;
        uint32_t address=be16(p+at),width=p[at+2],length=p[at+3],n=(4u+length+3u)&~3u;
        if(!width || length>=width || address>PAGE-width || n>bytes-at) return 0;
        at+=n;
    }
    uint32_t record=at;
    for(unsigned i=0;i<p[44];++i) {
        if(at>bytes || bytes-at<12u) return 0;
        uint32_t n=(12u+2u*p[at+1]+3u)&~3u;
        if(n>bytes-at) return 0;
        at+=n;
    }
    /* Formatter code follows every record, ascending and disjoint, and its fixups ascend a word apart:
     * the builder's fixups then never reach a record, the head or another fixup while it walks them. */
    uint32_t next=at;
    for(unsigned i=0;i<p[44];++i) {
        const uint8_t *f=p+record;uint32_t code=be32(f+4),length=be16(f+8),last=0;
        if(f[0]>=12u || code<low || code-low<next || code-low>bytes || length>bytes-(code-low) ||
           code%2u || (f[3] && (f[3]<5u || f[3]>127u || ++wides>WIDE))) return 0;
        for(unsigned k=0;k<f[1];++k) {
            uint32_t o=be16(f+12u+2u*k);
            if(length<4u || o>length-4u || (k && o<last+4u)) return 0;
            last=o;
        }
        next=code-low+length;
        record+=(12u+2u*f[1]+3u)&~3u;
    }
    if(records) *records=at;
    return 1;
}
int modwerk_fxpage_validate(unsigned id,const uint8_t *p,uint32_t bytes,unsigned slots)
{ return recipe_end(id,p,bytes,slots,0); }

/* Include only the bounded recipe and declared formatter code, rather than
 * mutable module data. Retain the stamp in board memory outside the image. */
static int page_stamp(unsigned id,const uint8_t *p,uint32_t bytes,unsigned slots,uint8_t *out)
{
    uint32_t end;
    if(!recipe_end(id,p,bytes,slots,&end)) return 0;
    uint8_t chain[2u*MU_DIGEST_BYTES];mu_sha256(p,end,chain);mu_sha256(pages[id],PAGE,chain+MU_DIGEST_BYTES);
    mu_sha256(chain,sizeof chain,out);
    uint32_t at=52u+8u*p[42];
    for(unsigned i=0;i<p[43];++i) at+=(4u+p[at+3]+3u)&~3u;
    for(unsigned i=0;i<p[44];++i) {
        const uint8_t *f=p+at;
        for(unsigned k=0;k<MU_DIGEST_BYTES;++k) chain[k]=out[k];
        mu_sha256(AT(be32(f+4)),be16(f+8),chain+MU_DIGEST_BYTES);mu_sha256(chain,sizeof chain,out);
        at+=(12u+2u*f[1]+3u)&~3u;
    }
    return 1;
}
static int routing_current(void)
{
    for(unsigned slot=0;slot<2u;++slot) {
        const uint32_t *list=slot?modwerk_fx2_list:modwerk_fx1_list;
        unsigned n=modwerk_fx_rows[slot];
        for(unsigned k=0;k<MODWERK_FX_IDS;++k) if(fx_in(modwerk_fx_modules,k)) {
            unsigned yes=(serves[k]>>slot&1u) && n+1u<MODWERK_LIST_ROWS;
            if(TABLE(slot)[k]!=(yes?ADDR(pages[k]):modwerk_fx1_list[0]) || TABLE(2u+slot)[k]!=(yes?n:0u)) return 0;
            if(yes && list[n++]!=ADDR(pages[k])) return 0;
        }
        while(n<MODWERK_LIST_ROWS) if(list[n++]) return 0;
    }
    unsigned n=0;
    for(unsigned k=0;k<MODWERK_FX_IDS;++k) for(unsigned w=0;serves[k] && w<WIDE && wide[k][w][0];++w) {
        if(modwerk_wide_table[n++]!=wide[k][w][0] || modwerk_wide_table[n++]!=wide[k][w][1]) return 0;
    }
    return !modwerk_wide_table[n] && !modwerk_wide_table[n+1u];
}
int modwerk_fxpage_current(unsigned id,const uint8_t *p,uint32_t bytes,unsigned slots)
{
    if(!fx_in(modwerk_fx_modules,id) || !routing_current()) return 0;
    if(!p) return !serves[id] && !checked_recipe[id];
    if(checked_recipe[id]!=p || checked_bytes[id]!=bytes || serves[id]!=slots) return 0;
    uint8_t digest[MU_DIGEST_BYTES];
    if(!page_stamp(id,p,bytes,slots,digest)) return 0;
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i) if(digest[i]!=checked_digest[id][i]) return 0;
    return 1;
}
int modwerk_fxpage_commit_checked(unsigned id,uint8_t *p,uint32_t bytes,unsigned slots)
{
    if(!p) modwerk_fxpage_drop(id);
    else if(!modwerk_fxpage_build(id,p,bytes,slots)) return 0;
    return modwerk_fxpage_current(id,p,bytes,slots);
}
