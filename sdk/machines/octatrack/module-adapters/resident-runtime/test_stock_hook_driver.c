/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "stock_hook_driver.h"
#include <assert.h>
extern const struct mw_hook_boot_core modwerk_hook_boot[2];
static unsigned writes[2], mask[2], waiting[2], desired[2], cas[2], idle=1;
static int answer[2]={1,1};
static int start(unsigned core,unsigned expected,unsigned wanted) {
    assert(expected==mask[core] && !waiting[core]);
    waiting[core]=1; desired[core]=wanted; ++cas[core]; return 1;
}
static int status(unsigned core) { return waiting[core] ? answer[core] : -2; }
static void release(unsigned core) { if(answer[core]==1) mask[core]=desired[core]; waiting[core]=0; }
static int resources(unsigned feature) { (void)feature; return (int)idle; }
static int reset(unsigned core,unsigned feature,unsigned offset,unsigned count,const uint32_t *words) {
    assert(!waiting[core] && feature && count && count<=24 && offset<4096);
    for(unsigned n=0;n<count;++n) assert(words[n]==0); /* synthetic authored zero records */
    waiting[core]=1; desired[core]=mask[core]; ++writes[core]; return 1;
}
static const struct mw_hook_driver_transport transport={{start,status,release},reset,resources};
static void clear(void) {
    for(unsigned c=0;c<2;++c) writes[c]=mask[c]=waiting[c]=desired[c]=cas[c]=0,answer[c]=1;
    idle=1;
}
static void complete(struct mw_hook_driver *d) {
    for(unsigned n=0;n<500 && (d->resetting || mw_stock_hooks_busy(&d->leases));++n)
        assert(mw_hook_driver_tick(d,&transport)!=MW_HOOK_QUARANTINED);
    assert(!d->resetting && !mw_stock_hooks_busy(&d->leases));
}
int main(void) {
    struct mw_hook_driver d;
    clear(); mw_hook_driver_init(&d,modwerk_hook_boot);
    assert(mw_hook_driver_export_idle(&d));
    assert(mw_hook_driver_begin(&d,1,17,23,1)==MW_HOOK_PENDING);
    assert(!mw_hook_driver_export_idle(&d));
    assert(mw_hook_driver_retire(&d,1,17,23,1)==MW_HOOK_STATE);
    assert(mw_hook_driver_begin(&d,1,17,24,1)==MW_HOOK_BUSY);
    idle=0; for(unsigned n=0;n<5;++n) mw_hook_driver_tick(&d,&transport);
    assert(!writes[0] && !writes[1]); // actual resource reservation precedes every reset write
    idle=1; mw_hook_driver_tick(&d,&transport);
    assert(!writes[0] && !writes[1]); // 3776 skipped coefficients are bounded to 64 words per tick
    complete(&d);
    assert(writes[0]==45 && writes[1]==45 && cas[0]==1 && cas[1]==1); /* MON 16 (1), window 514 (22), bus 512 (22) */
    assert(d.leases.active[0]==1 && d.leases.active[1]==1);
    assert(mw_hook_driver_export_idle(&d));
    d.leases.inflight[0]=1; assert(!mw_hook_driver_export_idle(&d)); d.leases.inflight[0]=0;
    d.leases.known=1; assert(!mw_hook_driver_export_idle(&d)); d.leases.known=3;
    d.resetting=1; assert(!mw_hook_driver_export_idle(&d)); d.resetting=0;
    d.leases.owners[0].generation=0; assert(!mw_hook_driver_export_idle(&d)); d.leases.owners[0].generation=23;
    d.leases.active[1]=2; assert(!mw_hook_driver_export_idle(&d)); d.leases.active[1]=1;
    assert(mw_hook_driver_begin(&d,1,17,24,0)==MW_HOOK_OWNER);
    assert(mw_hook_driver_retire(&d,1,17,23,1)==MW_HOOK_STATE);
    assert(mw_hook_driver_begin(&d,1,17,23,0)==MW_HOOK_PENDING); complete(&d);
    assert(!d.leases.ready && mw_hook_driver_retire(&d,1,17,23,0)==MW_HOOK_STATE);
    assert(mw_hook_driver_retire(&d,1,17,23,1)==MW_HOOK_OK);
    assert(mw_hook_driver_begin(&d,2,31,41,1)==MW_HOOK_PENDING); complete(&d);
    assert(d.leases.active[0]==2 && d.leases.active[1]==0 && writes[1]==45);
    clear(); mw_hook_driver_init(&d,modwerk_hook_boot);
    assert(mw_hook_driver_begin(&d,4,51,61,1)==MW_HOOK_PENDING);
    mw_hook_driver_tick(&d,&transport); assert(waiting[0] && waiting[1]);
    answer[0]=-1; answer[1]=0;
    assert(mw_hook_driver_tick(&d,&transport)==MW_HOOK_QUARANTINED);
    assert(!mw_hook_driver_export_idle(&d));
    assert(mw_hook_driver_retire(&d,4,51,61,1)==MW_HOOK_STATE);
    assert(mw_stock_hooks_observed(&d.leases,1,0)==MW_HOOK_STATE);
    answer[1]=1; mw_hook_driver_tick(&d,&transport);
    assert(!waiting[1]);
    assert(mw_stock_hooks_observed(&d.leases,0,0)==MW_HOOK_OK);
    assert(mw_stock_hooks_observed(&d.leases,1,0)==MW_HOOK_STATE); /* its pending reset ACK already preserved the old inactive mask */
    assert(mw_hook_driver_retire(&d,4,51,61,1)==MW_HOOK_OK);
    return 0;
}
