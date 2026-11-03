/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "stock_hook_resources.h"
#include "dsp_ledger.h"
static const uint32_t fx1[4]={0x1000u,0x1c00u,0x2800u,0x3400u};
static const uint32_t fx2[2][4]={{0x4000u,0x8000u,0x30000u,0x34000u},
                                {0x4000u,0x8000u,0x38000u,0x3c000u}};
unsigned mw_stock_hooks_held(const struct mw_stock_hooks *s) {
    if(!s || s->known!=3u || s->phase>3u) return 7u;
    unsigned held=0;
    for(unsigned k=0;k<3;++k) {
        if(!!s->owners[k].module!=!!s->owners[k].generation) return 7u; /* corrupt token stays reserved */
        if(s->owners[k].module) held|=1u<<k;
    }
    return held;
}
struct mw_hook_buffer_claim mw_hook_default_claim(unsigned kind,unsigned stock) {
    struct mw_hook_buffer_claim claim={kind ? 16384u : 3072u,1,0};
    if(stock) { claim.head_safe=1; if(kind) claim.words=MW_HOOK_STOCK_FX2_WORDS; }
    return claim;
}
static int valid(const struct mw_hook_span *r) {
    if(r->core>1 || r->space>2 || !r->words || r->address>=0x40000u || r->words>0x40000u-r->address) return 0;
    /* A span cannot straddle private memory and the physical shared aliases. */
    return !(r->address<0x30000u && r->address+r->words>0x30000u);
}
static int intersects(const struct mw_hook_span *a,const struct mw_hook_span *b) {
    int shared=a->address>=0x30000u && b->address>=0x30000u;
    int core=a->core==b->core || a->core==2u || b->core==2u; /* ABI 10: an engine's claim on both cores */
    return (shared || (core && a->space==b->space)) &&
           a->address<b->address+b->words && b->address<a->address+a->words;
}
/* Words a held feature owns: the generated ledger (dsp-sites.json, dsp_ledger.h). A held feature also holds what it
 * implies: Sidechain holds the key bus. */
static int meets(unsigned feature,const struct mw_hook_span *r) {
    unsigned held=MW_DSP_IMPLIED(feature);
    for(unsigned n=0;n<MW_DSP_REGIONS;++n) {
        const struct mw_dsp_region *g=&mw_dsp_regions[n];
        struct mw_hook_span owned={g->address,g->words,g->core,g->space==1u ? MW_HOOK_X : MW_HOOK_Y};
        if((held&g->feature) && intersects(r,&owned)) return 1;
    }
    return 0;
}
int mw_hook_buffer_permitted(const struct mw_stock_hooks *s,unsigned core,unsigned kind,unsigned block,
                             const struct mw_hook_buffer_claim *claim) {
    return s && mw_hook_buffer_permitted_held(mw_stock_hooks_held(s),core,kind,block,claim);
}
int mw_hook_buffer_permitted_held(unsigned held,unsigned core,unsigned kind,unsigned block,
                                  const struct mw_hook_buffer_claim *claim) {
    if((held&~MW_DSP_FEATURES) || core>1 || kind>1 || block>3 || !claim || claim->complete!=1 || claim->head_safe>1 ||
       !claim->words || claim->words>(kind ? 16384u : 3072u)) return 0;
    struct mw_hook_span span={kind ? fx2[core][block] : fx1[block],claim->words,(uint8_t)core,MW_HOOK_Y};
    /* T7's staging / T3's mailbox are live stock tenants even with no hook.
     * A source-proved shadow or excluded-prefix footprint is required. */
    if(kind && block==2 && !claim->head_safe) return 0;
    /* The reservation begins before reset, survives disable ACK, and ends
     * only when the exact generation's foreign-root retirement succeeded. */
    return !meets(held,&span);
}
int mw_hook_ranges_idle(unsigned feature,const struct mw_hook_span *live,unsigned live_count,
                        const struct mw_hook_span *target,unsigned target_count,unsigned complete_cores) {
    if(!feature || (feature&(feature-1u)) || (feature&~MW_DSP_FEATURES) || complete_cores!=3u ||
       live_count>128u || target_count>128u || (!live && live_count) || (!target && target_count)) return 0;
    for(unsigned n=0;n<live_count;++n) if(!valid(&live[n]) || meets(feature,&live[n])) return 0;
    for(unsigned n=0;n<target_count;++n) if(!valid(&target[n]) || meets(feature,&target[n])) return 0;
    return 1;
}
/* ABI 9 claims (loader.h): a package's DSP words outside its slot. A base feature's words are the base's: a claim may
 * only read them, lying wholly inside a region of a feature the package requires (or one that implies), and may meet
 * no other feature's words at all, held or not, so no later feature ever finds them taken. */
int mw_hook_claim_permitted(unsigned requires,const struct mw_hook_span *claim,unsigned writes) {
    if(!claim || writes>1u || (claim->space!=MW_HOOK_X && claim->space!=MW_HOOK_Y) || !valid(claim) ||
       (requires&~MW_DSP_FEATURES)) return 0;
    unsigned held=MW_DSP_IMPLIED(requires),inside=0,met=0;
    for(unsigned n=0;n<MW_DSP_REGIONS;++n) {
        const struct mw_dsp_region *g=&mw_dsp_regions[n];
        struct mw_hook_span owned={g->address,g->words,g->core,g->space==1u ? MW_HOOK_X : MW_HOOK_Y};
        if(!intersects(claim,&owned)) continue;
        met=1;
        int shared=claim->address>=0x30000u && owned.address>=0x30000u;
        if((held&g->feature) && (shared || (claim->core==owned.core && claim->space==owned.space)) &&
           claim->address>=owned.address && claim->address+claim->words<=owned.address+owned.words) inside=1;
    }
    return !met || (inside && !writes);
}
/* Does any of these spans meet the Y block a slot's buffer would take (as mw_hook_buffer_permitted_held places it)? */
int mw_hook_buffer_clear_of(unsigned core,unsigned kind,unsigned block,const struct mw_hook_buffer_claim *claim,
                            const struct mw_hook_span *spans,unsigned n) {
    if(core>1 || kind>1 || block>3 || !claim || !claim->words || (!spans && n)) return 0;
    struct mw_hook_span span={kind ? fx2[core][block] : fx1[block],claim->words,(uint8_t)core,MW_HOOK_Y};
    for(unsigned i=0;i<n;++i) if(intersects(&span,&spans[i])) return 0;
    return 1;
}
