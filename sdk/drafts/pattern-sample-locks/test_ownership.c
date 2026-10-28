/* SPDX-License-Identifier: MIT */
#include "ownership.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static uint8_t guarded[PSL_NV_BYTES+32],record[PSL_TRACK_BYTES],identity[PSL_ID_BYTES],owned[64],readback[64];
int main(void)
{
    uint8_t *nv=guarded+16;memset(guarded,0x5a,sizeof guarded);memset(nv,0,PSL_NV_BYTES);
    /* Independent bitwise CRC oracle exercises the persisted header, without
     * exposing implementation helpers or changing its on-battery format. */
    for(unsigned value=0;value<256;++value){
        memset(identity,(int)value,sizeof identity);assert(psl_nv_begin(nv,identity));
        uint32_t crc=~0u;
        for(unsigned i=0;i<8u+PSL_ID_BYTES;++i){crc^=nv[i];
            for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^((0u-(crc&1u))&0xedb88320u);}
        crc=~crc;
        for(unsigned i=0;i<4;++i)assert(nv[8u+PSL_ID_BYTES+i]==(uint8_t)(crc>>(24u-8u*i)));
    }
    memset(identity,0,sizeof identity);
    memcpy(identity,"BEATLAB/PROJECT",16);memset(record,255,sizeof record);memset(record,0,8);
    assert(PSL_NV_BASE>=0x100f8f06u && PSL_NV_BASE+PSL_NV_BYTES<=0x100fc000u);assert(psl_nv_begin(nv,identity));
    for(unsigned step=0;step<64;++step){record[PSL_LOCK_OFFSET+32*step]=(uint8_t)(step+1);owned[step]=(uint8_t)(step%3==0);}
    psl_nv_publish(nv,255,7,record,owned);
    /* A fresh reader has no session state: only battery bytes and native data. */
    memset(readback,0x5a,64);assert(psl_nv_matches(nv,identity));psl_nv_read(nv,255,7,record,readback);assert(!memcmp(owned,readback,64));
    assert(psl_nv_boot(nv,99,10,0));assert(psl_nv_boot_matches(nv,99,10));
    assert(psl_nv_boot(nv,99,11,1));assert(psl_nv_matches(nv,identity));
    psl_nv_read(nv,255,7,record,readback);assert(!memcmp(owned,readback,64));
    assert(!psl_nv_boot(nv,99,13,1));assert(!psl_nv_matches(nv,identity)); /* skipped/absent boot */
    assert(psl_nv_begin(nv,identity));psl_nv_publish(nv,255,7,record,owned);
    assert(psl_nv_boot(nv,99,14,0));psl_nv_forget(nv);assert(!psl_nv_matches(nv,identity));
    assert(psl_nv_begin(nv,identity));psl_nv_publish(nv,255,7,record,owned);
    /* A reset during a native edit must lose trust before the first write. */
    psl_nv_invalidate(nv,255,7);psl_nv_read(nv,255,7,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);
    psl_nv_publish(nv,255,7,record,owned);record[PSL_LOCK_OFFSET]^=1;
    psl_nv_read(nv,255,7,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);record[PSL_LOCK_OFFSET]^=1;
    /* Same-value manual edit explicitly retires origin, preserving the rest. */
    owned[0]=0;psl_nv_invalidate(nv,255,7);psl_nv_publish(nv,255,7,record,owned);
    psl_nv_read(nv,255,7,record,readback);assert(!readback[0] && readback[3]);
    nv[PSL_NV_HEADER+4]^=1;psl_nv_read(nv,255,7,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);
    psl_nv_publish(nv,255,7,record,owned);
    psl_nv_forget_scope(nv,1u<<15,1u<<15,1u<<7);
    psl_nv_read(nv,255,7,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);
    identity[100]=1;assert(!psl_nv_matches(nv,identity));assert(psl_nv_begin(nv,identity));
    psl_nv_read(nv,255,7,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);
    /* A power cut while first allocating our own header is recoverable. */
    nv[0]=0;assert(psl_nv_begin(nv,identity));assert(psl_nv_matches(nv,identity));
    for(unsigned key=0;key<PSL_NV_ENTRIES;++key)assert(psl_nv_reserve(nv,key/8u,1u<<(key%8u)));
    static uint8_t saved[PSL_NV_BYTES];memcpy(saved,nv,PSL_NV_BYTES);
    assert(!psl_nv_reserve(nv,255,255));assert(!memcmp(saved,nv,PSL_NV_BYTES));
    memset(owned,0,64);psl_nv_publish(nv,0,0,record,owned);assert(psl_nv_reserve(nv,255,128));
    psl_nv_read(nv,0,0,record,readback);for(unsigned i=0;i<64;++i)assert(!readback[i]);
    nv[0]='X';memcpy(saved,nv,PSL_NV_BYTES);
    psl_nv_forget(nv);psl_nv_forget_scope(nv,65535,65535,255);
    assert(!psl_nv_boot(nv,99,15,0));assert(!psl_nv_boot(nv,99,15,1));
    assert(!psl_nv_begin(nv,identity));assert(!memcmp(saved,nv,PSL_NV_BYTES));
    for(unsigned i=0;i<16;++i)assert(guarded[i]==0x5a && guarded[16+PSL_NV_BYTES+i]==0x5a);
    puts("PASS ownership: fresh-reader persistence, torn edit, corruption, same-value manual edit, project identity, foreign storage, bounded capacity, reuse, base-memory separation, bounds");
}
