/* SPDX-License-Identifier: MIT */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static uint8_t working[8][PSL_TRACK_BYTES],mirror[8][PSL_TRACK_BYTES],baseline[8][PSL_TRACK_BYTES];
static struct psl_source source;
static struct psl_plan plan;
static uint8_t *w[8],*m[8];
static void fixture(void)
{
    memset(&source,0,sizeof source);source.bank=0x400e21e0;source.pattern=2;source.part=1;source.eligible=0x81;
    for(unsigned t=0;t<8;++t) {
        for(unsigned k=0;k<PSL_TRACK_BYTES;++k)working[t][k]=(uint8_t)(k*7u+t);
        memset(working[t],0,8);working[t][7]=1;working[t][0]=128; /* sample steps 1,64 */
        for(unsigned s=0;s<64;++s)working[t][PSL_LOCK_OFFSET+32*s]=255;
        source.machine[t]=(uint8_t)(t&1u);source.sample[t]=(uint8_t)(t+9);
        source.track[t]=w[t]=working[t];m[t]=mirror[t];
    }
    working[7][PSL_LOCK_OFFSET]=42;
    memcpy(mirror,working,sizeof working);memcpy(baseline,working,sizeof working);
}
static void preserved(unsigned selected)
{
    for(unsigned t=0;t<8;++t)for(unsigned k=0;k<PSL_TRACK_BYTES;++k) {
        int owned=k>=PSL_LOCK_OFFSET && (k-PSL_LOCK_OFFSET)%32==0 && (k-PSL_LOCK_OFFSET)/32<64;
        if(!(selected&(1u<<t)) || !owned)assert(working[t][k]==baseline[t][k]);
        assert(mirror[t][k]==working[t][k]);
    }
}
int main(void)
{
    fixture();assert(psl_prepare(&plan,&source,0,PSL_LOCK,0)==PSL_NO_TRACKS);
    assert(psl_prepare(&plan,&source,2,PSL_LOCK,0)==PSL_INVALID);
    assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,0)==PSL_OK);
    assert(plan.changed==3 && plan.preserved==1);
    assert(!memcmp(baseline,working,sizeof working));
    assert(psl_apply(&plan,&source,w,m)==PSL_OK);
    assert(working[0][PSL_LOCK_OFFSET]==9 && working[0][PSL_LOCK_OFFSET+63*32]==9);
    assert(working[7][PSL_LOCK_OFFSET]==42 && working[7][PSL_LOCK_OFFSET+63*32]==16);
    preserved(0x81);assert(psl_apply(&plan,&source,w,m)==PSL_INVALID);
    fixture();assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,1)==PSL_OK && plan.changed==4);
    assert(psl_apply(&plan,&source,w,m)==PSL_OK && working[7][PSL_LOCK_OFFSET]==16);preserved(0x81);
    fixture();working[7][PSL_LOCK_OFFSET+32]=135;mirror[7][PSL_LOCK_OFFSET+32]=135;
    memcpy(baseline,working,sizeof working);
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,1)==PSL_OK && plan.changed==2);
    assert(psl_apply(&plan,&source,w,m)==PSL_OK);
    assert(working[7][PSL_LOCK_OFFSET]==255 && working[7][PSL_LOCK_OFFSET+32]==255);preserved(0x80);
    /* Equality with the Part default is not proof of module ownership. */
    fixture();working[7][PSL_LOCK_OFFSET]=source.sample[7];
    mirror[7][PSL_LOCK_OFFSET]=source.sample[7];
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK);
    assert(plan.changed==0 && plan.preserved==1);
    uint8_t ownership[64]={0};source.owned[7]=ownership;source.ownership_epoch=9;
    ownership[0]=1;
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK && plan.changed==1);
    /* A manual write of the SAME slot invalidates its ownership too. */
    ownership[0]=0;
    assert(psl_apply(&plan,&source,w,m)==PSL_STALE);
    assert(working[7][PSL_LOCK_OFFSET]==source.sample[7]);
    ownership[0]=1;
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK);
    ++source.ownership_epoch;assert(psl_apply(&plan,&source,w,m)==PSL_STALE);
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK);
    assert(psl_apply(&plan,&source,w,m)==PSL_OK && working[7][PSL_LOCK_OFFSET]==255);
    fixture();
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK && plan.changed==0 && plan.preserved==1);
    assert(psl_apply(&plan,&source,w,m)==PSL_OK);preserved(0x80);
    fixture();ownership[0]=1;source.owned[7]=ownership;source.ownership_epoch=1;
    working[7][PSL_LOCK_OFFSET+32]=mirror[7][PSL_LOCK_OFFSET+32]=42;
    assert(psl_prepare(&plan,&source,0x80,PSL_CLEAR,0)==PSL_OK && plan.changed==1 && plan.preserved==1);
    assert(psl_apply(&plan,&source,w,m)==PSL_OK);
    assert(working[7][PSL_LOCK_OFFSET]==255 && working[7][PSL_LOCK_OFFSET+32]==42);
    for(unsigned stale=0;stale<8;++stale) {
        fixture();assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,0)==PSL_OK);
        if(stale==0)++source.bank;
        if(stale==1)++source.pattern;
        if(stale==2)++source.part;
        if(stale==3)source.eligible=1;
        if(stale==4)source.machine[7]=0;
        if(stale==5)++source.sample[7];
        if(stale==6)working[7][0]^=1;
        if(stale==7)++working[7][PSL_LOCK_OFFSET+63*32];
        uint8_t before[sizeof working];memcpy(before,working,sizeof working);
        assert(psl_apply(&plan,&source,w,m)==PSL_STALE);
        assert(!memcmp(before,working,sizeof working));assert(!memcmp(baseline,mirror,sizeof mirror));
    }
    fixture();assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,0)==PSL_OK);
    ++mirror[7][PSL_LOCK_OFFSET+63*32];assert(psl_apply(&plan,&source,w,m)==PSL_STALE);
    assert(!memcmp(baseline,working,sizeof working));
    fixture();source.sample[7]=255;assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,0)==PSL_INVALID);
    assert(!memcmp(baseline,working,sizeof working));
    fixture();source.sample[7]=135;assert(psl_prepare(&plan,&source,0x80,PSL_LOCK,0)==PSL_OK);
    source.sample[7]=136;assert(psl_prepare(&plan,&source,0x80,PSL_LOCK,0)==PSL_INVALID);
    fixture();assert(psl_prepare(&plan,&source,0x81,PSL_LOCK,0)==PSL_OK);
    w[7]=w[0];assert(psl_apply(&plan,&source,w,m)==PSL_INVALID);assert(!memcmp(baseline,working,sizeof working));
    puts("PASS sample-lock planner: preservation, all 64 steps, replacement, clear, stale/mirror refusal, invalid selection and single-use confirmation");
}
