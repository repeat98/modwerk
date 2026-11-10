/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "stock_hook_resources.h"
#include "dsp_ledger.h"
#include "buffers.h"
#include <assert.h>
#include <string.h>
static struct mw_stock_hooks leases;
static struct mw_hook_buffer_claim claims[MODWERK_FX_IDS];
int modwerk_dsp_buffer_permitted(unsigned c,unsigned k,unsigned b,unsigned id) {
    return id<MODWERK_FX_IDS && mw_hook_buffer_permitted(&leases,c,k,b,&claims[id]);
}
static void start(struct dl_buffers *b,unsigned map,uint8_t running[16],uint8_t ids[16],uint8_t reads[MODWERK_FX_IDS]) {
    mw_stock_hooks_init(&leases); dl_buffers_init(b,map);
    memset(running,0,16); memset(ids,0,16); memset(reads,0,MODWERK_FX_IDS);
    memset(claims,0,sizeof claims);
    claims[32]=(struct mw_hook_buffer_claim){16384u,1,0}; reads[32]=1; /* exact full-ring claim, no head shadow */
    claims[33]=(struct mw_hook_buffer_claim){16384u,1,1}; reads[33]=1; /* independently proved head shadow */
}
static void commit(struct dl_buffers *b) {
    uint32_t value; int index;
    while((index=dl_buffers_next(b,&value))>=0) dl_buffers_written(b,(unsigned)index);
    dl_buffers_retire(b);
}
static int no_start(unsigned c,unsigned a,unsigned b) { (void)c;(void)a;(void)b;return 0; }
static int no_status(unsigned c) { (void)c;return -2; }
static void no_release(unsigned c) { (void)c; }
int main(void) {
    struct dl_buffers b; uint8_t running[16],ids[16],reads[MODWERK_FX_IDS];
    for(unsigned core=0;core<2;++core) for(unsigned map=0;map<2;++map) {
        start(&b,map,running,ids,reads); unsigned first=core ? 8u : 12u,capacity=map ? 2u : 3u;
        for(unsigned n=0;n<capacity;++n) ids[first+n]=32;
        assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_OK);
        for(unsigned n=0;n<capacity;++n) assert(b.target[first+n]!=2 && (!map || b.target[first+n]!=1));
        commit(&b); memcpy(running,ids,16);
        ids[first+capacity]=32;
        assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_MEMORY && !b.open);
        /* Removing an outgoing instance does not free its ring before ACKed retirement. */
        ids[first]=0;
        assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_MEMORY && !b.open);
        ids[first+capacity]=0;
        assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_OK); commit(&b); memcpy(running,ids,16);
        ids[first+capacity]=32;
        assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_OK); commit(&b);
    }
    start(&b,0,running,ids,reads);
    for(unsigned i=8;i<16;++i) ids[i]=33;
    assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_OK); commit(&b); memcpy(running,ids,16);
    assert(b.live[10]==2 && b.live[14]==2);
    assert(mw_stock_hooks_reset_begin(&leases,1,17,23)==MW_HOOK_PENDING);
    assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_MEMORY && !b.open); /* retained blocks are checked too */
    assert(mw_stock_hooks_reset_done(&leases,0,1)==MW_HOOK_PENDING);
    assert(mw_stock_hooks_reset_done(&leases,1,1)==MW_HOOK_OK);
    assert(mw_stock_hooks_begin(&leases,1,17,23,0)==MW_HOOK_PENDING);
    const struct mw_hook_transport t={no_start,no_status,no_release};
    assert(mw_stock_hooks_tick(&leases,&t)==MW_HOOK_OK);
    assert(!leases.active[0] && !leases.active[1]);
    assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_MEMORY); /* ACK alone does not relinquish ownership */
    assert(mw_stock_hooks_retire(&leases,1,17,23,0)==MW_HOOK_STATE);
    assert(mw_stock_hooks_retire(&leases,1,17,24,1)==MW_HOOK_OWNER);
    assert(mw_stock_hooks_retire(&leases,1,17,23,1)==MW_HOOK_OK);
    assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_OK); dl_buffers_cancel(&b);
    claims[33].complete=0;
    assert(dl_buffers_prepare(&b,running,ids,reads)==DL_BUF_MEMORY);
    /* Whole-block claims (no exact declaration) against an explicit held mask: leases | board controllers. */
    const struct mw_hook_buffer_claim fx1w={3072u,1,0},fx2w={16384u,1,0},fx2head={16384u,1,1};
    for(unsigned c=0;c<2;++c) for(unsigned k=0;k<4;++k) {
        assert(mw_hook_buffer_permitted_held(0,c,0,k,&fx1w));
        assert(mw_hook_buffer_permitted_held(0,c,1,k,&fx2w)==(k!=2)); /* FX2 block 2 needs a head proof */
        assert(mw_hook_buffer_permitted_held(MW_HOOK_MATRIX|MW_HOOK_ANALOG_BD,c,0,k,&fx1w)); /* Y below 0x1000; AB is X */
    }
    assert(mw_hook_buffer_permitted_held(0,0,1,2,&fx2head));
    assert(!mw_hook_buffer_permitted_held(MW_HOOK_SIDECHAIN,0,1,2,&fx2head)); /* SC's shared Y at 0x33dfe */
    assert(!mw_hook_buffer_permitted_held(MW_HOOK_SIDECHAIN,1,1,2,&fx2head)); /* and its alias seen from core 1 */
    assert(mw_hook_buffer_permitted_held(MW_HOOK_SIDECHAIN,0,1,3,&fx2w)); /* 0x34000 starts where SC's span ends */
    assert(!mw_hook_buffer_permitted_held(16u,0,0,0,&fx1w)); /* an unknown held bit refuses */
    /* The key bus (dsp_ledger.h): the window both cores see, and Y $800..$9ff on each core; Sidechain holds it too. */
    assert(!mw_hook_buffer_permitted_held(MW_DSP_KEYBUS,0,1,2,&fx2head) && !mw_hook_buffer_permitted_held(MW_DSP_KEYBUS,1,1,2,&fx2head));
    assert(mw_hook_buffer_permitted_held(MW_DSP_KEYBUS,0,1,3,&fx2w) && mw_hook_buffer_permitted_held(MW_DSP_KEYBUS,1,0,0,&fx1w));
    { const struct mw_hook_buffer_claim stock=mw_hook_default_claim(1,1); /* stock stops before the window, as with SC */
      assert(mw_hook_buffer_permitted_held(MW_DSP_KEYBUS,0,1,2,&stock)); }
    assert(!mw_hook_buffer_permitted_held(0,0,0,0,&fx2w)); /* larger than an FX1 block */
    assert(!mw_hook_buffer_permitted(0,0,0,0,&fx1w));
    struct mw_hook_span span={0x33dfe,1,1,MW_HOOK_X};
    assert(!mw_hook_ranges_idle(1,&span,1,0,0,3)); /* shared alias, other core and memory space */
    assert(!mw_hook_ranges_idle(1,0,0,&span,1,3)); /* pending init is equally held */
    span=(struct mw_hook_span){0x3bdfe,1,0,MW_HOOK_P}; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3));
    span=(struct mw_hook_span){0xff0,1,1,MW_HOOK_Y}; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3));
    span=(struct mw_hook_span){0xff0,0x10,1,MW_HOOK_Y}; assert(mw_hook_ranges_idle(8,&span,1,0,0,3)); /* MON: Sidechain's, not the bus's */
    span=(struct mw_hook_span){0x7fff,1,0,MW_HOOK_Y}; assert(!mw_hook_ranges_idle(8,&span,1,0,0,3) && !mw_hook_ranges_idle(1,&span,1,0,0,3));
    span=(struct mw_hook_span){0x7e00,1,1,MW_HOOK_Y}; assert(!mw_hook_ranges_idle(8,&span,1,0,0,3) && !mw_hook_ranges_idle(1,&span,1,0,0,3));
    span=(struct mw_hook_span){0x7a5,0x84b,1,MW_HOOK_Y}; /* Y $7a5..$fef, a DSP machine's voice: no feature's since the move */
    for(unsigned f=1;f<=8;f<<=1) assert(mw_hook_ranges_idle(f,&span,1,0,0,3));
    span.core=0; assert(mw_hook_ranges_idle(1,&span,1,0,0,3) && mw_hook_ranges_idle(8,&span,1,0,0,3));
    assert(!mw_hook_ranges_idle(2,&span,1,0,0,3)); /* Output Matrix's Y $c00+$c1 on core A */
    span=(struct mw_hook_span){0x3bdfe,1,0,MW_HOOK_Y}; assert(!mw_hook_ranges_idle(8,&span,1,0,0,3));
    span=(struct mw_hook_span){0xa00,1,0,MW_HOOK_Y}; assert(mw_hook_ranges_idle(8,&span,1,0,0,3));
    assert(!mw_hook_ranges_idle(16,0,0,0,0,3) && !mw_hook_ranges_idle(9,0,0,0,0,3)); /* one known feature at a time */
    span=(struct mw_hook_span){0xc00,0xc1,1,MW_HOOK_Y}; assert(mw_hook_ranges_idle(2,&span,1,0,0,3));
    span.core=0; assert(!mw_hook_ranges_idle(2,&span,1,0,0,3));
    span=(struct mw_hook_span){0x2840,0xec0,0,MW_HOOK_Y}; assert(mw_hook_ranges_idle(4,&span,1,0,0,3));
    span.space=MW_HOOK_X; assert(!mw_hook_ranges_idle(4,&span,1,0,0,3));
    span.core=1; assert(!mw_hook_ranges_idle(4,&span,1,0,0,3));
    span=(struct mw_hook_span){0x4000,0x3dfe,0,MW_HOOK_Y}; assert(mw_hook_ranges_idle(1,&span,1,0,0,3)); /* a +$3DFD ring */
    assert(mw_hook_ranges_idle(8,&span,1,0,0,3));
    assert(!mw_hook_ranges_idle(1,&span,1,0,0,1)); /* incomplete second-core ledger */
    span.words=16384; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3) && !mw_hook_ranges_idle(8,&span,1,0,0,3)); /* reaches the bus */
    span.words=0x3e00; assert(mw_hook_ranges_idle(8,&span,1,0,0,3)); span.words=0x3e01; assert(!mw_hook_ranges_idle(8,&span,1,0,0,3));
    span=(struct mw_hook_span){0x8000,16384,1,MW_HOOK_Y}; assert(mw_hook_ranges_idle(1,&span,1,0,0,3)); /* the second slot is whole */
    span.address=0x3ffff; span.words=2; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3));
    span.address=0x2ffff; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3));
    assert(!mw_hook_ranges_idle(3,0,0,0,0,3));
    /* Default claims: stock's own effect stops at +0x3DA2 and shares the head as stock does; anything else is whole. */
    const struct mw_hook_buffer_claim stock2=mw_hook_default_claim(1,1),other2=mw_hook_default_claim(1,0),stock1=mw_hook_default_claim(0,1);
    assert(stock2.words==0x3da3u && stock2.complete==1 && stock2.head_safe==1);
    assert(other2.words==16384u && other2.complete==1 && !other2.head_safe && stock1.words==3072u);
    assert(mw_hook_buffer_permitted_held(MW_HOOK_SIDECHAIN|MW_HOOK_MATRIX|MW_HOOK_ANALOG_BD,0,1,2,&stock2));
    assert(mw_hook_buffer_permitted_held(MW_HOOK_SIDECHAIN,1,1,2,&stock2));
    assert(!mw_hook_buffer_permitted_held(0,0,1,2,&other2) && mw_hook_buffer_permitted_held(0,0,1,3,&other2));
    for(unsigned c=0;c<2;++c) {
        span=(struct mw_hook_span){c ? 0x38000u : 0x30000u,stock2.words,(uint8_t)c,MW_HOOK_Y};
        assert(mw_hook_ranges_idle(1,&span,1,&span,1,3));
        span.words=0x3dffu; assert(!mw_hook_ranges_idle(1,&span,1,0,0,3)); /* one word into the key window */
    }
    /* ABI 9 claims: reads wholly inside a feature the package requires; nothing else of a base feature, held or not. */
    span=(struct mw_hook_span){0x7e00,0x200,0,MW_HOOK_Y};
    assert(mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0) && !mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,1));
    assert(!mw_hook_claim_permitted(0,&span,0) && !mw_hook_claim_permitted(MW_DSP_MATRIX,&span,0));
    assert(mw_hook_claim_permitted(MW_DSP_SIDECHAIN,&span,0)); /* Sidechain implies the bus */
    span=(struct mw_hook_span){0xff0,0x10,1,MW_HOOK_Y}; assert(!mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0)); /* MON words */
    span=(struct mw_hook_span){0x800,0x200,1,MW_HOOK_Y}; assert(mw_hook_claim_permitted(0,&span,1)); /* the old bus: no feature's */
    span=(struct mw_hook_span){0x3bdfe,0x202,1,MW_HOOK_Y}; assert(mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0));
    span.core=0; span.space=MW_HOOK_X; assert(mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0)); /* one window, any view */
    span=(struct mw_hook_span){0x3bdfd,2,1,MW_HOOK_Y}; assert(!mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0)); /* past it */
    span=(struct mw_hook_span){0x2840,4,1,MW_HOOK_X}; assert(!mw_hook_claim_permitted(MW_DSP_KEYBUS,&span,0));
    span.space=MW_HOOK_Y; assert(mw_hook_claim_permitted(0,&span,1)); /* Y $2840 is no feature's */
    span=(struct mw_hook_span){0x7a0,0x10,0,MW_HOOK_Y}; assert(mw_hook_claim_permitted(0,&span,1));
    span.space=MW_HOOK_P; assert(!mw_hook_claim_permitted(0,&span,0));
    span=(struct mw_hook_span){0x2fff0,0x20,0,MW_HOOK_Y}; assert(!mw_hook_claim_permitted(0,&span,0));
    span=(struct mw_hook_span){0x7a0,0x10,0,MW_HOOK_Y}; assert(!mw_hook_claim_permitted(16u,&span,0) && !mw_hook_claim_permitted(0,&span,2));
    /* Buffers keep clear of live claims: FX1 block 0 is Y $1000 on each core, FX2 block 2 core 0 holds $33dfe. */
    struct mw_hook_span live2[2]={{0x1000,1,1,MW_HOOK_Y},{0x33e00,4,1,MW_HOOK_Y}};
    assert(!mw_hook_buffer_clear_of(1,0,0,&fx1w,live2,2) && mw_hook_buffer_clear_of(0,0,0,&fx1w,live2,2));
    assert(!mw_hook_buffer_clear_of(0,1,2,&fx2head,live2,2) && mw_hook_buffer_clear_of(1,1,2,&fx2head,live2,2));
    assert(mw_hook_buffer_clear_of(0,1,2,&stock2,live2,2) && mw_hook_buffer_clear_of(1,0,1,&fx1w,live2,2));
    assert(!mw_hook_buffer_clear_of(2,0,0,&fx1w,live2,0) && mw_hook_buffer_clear_of(0,0,0,&fx1w,0,0));
    return 0;
}
