/* SPDX-License-Identifier: MIT */
#include "ownership.h"
static const uint8_t nv_tag[8]={'P','S','L','O','W','N',2,0};
#define NV_NONE 0xffffu
#define NV_AMBIGUOUS 0xfffeu
/* Rebuilt once from battery material; no project scanning on idle ticks.
 * Persistent trust always comes from the actual keyed record and its CRC. */
static uint16_t nv_index[256u*8u];
static const volatile uint8_t *nv_index_store;
static uint32_t nv_index_identity;
static uint32_t nv_crc_byte(uint32_t crc,uint8_t value)
{
    crc^=value;
    for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^((0u-(crc&1u))&0xedb88320u);
    return crc;
}
static unsigned nv_get16(const volatile uint8_t *p){return (unsigned)p[0]<<8|p[1];}
static void nv_put16(volatile uint8_t *p,unsigned n){p[0]=(uint8_t)(n>>8);p[1]=(uint8_t)n;}
static uint32_t nv_get32(const volatile uint8_t *p)
{ return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3]; }
static void nv_put32(volatile uint8_t *p,uint32_t n)
{ p[0]=(uint8_t)(n>>24);p[1]=(uint8_t)(n>>16);p[2]=(uint8_t)(n>>8);p[3]=(uint8_t)n; }
static uint32_t nv_header_crc(const volatile uint8_t *nv)
{
    uint32_t crc=~0u;
    for(unsigned i=0;i<8u+PSL_ID_BYTES;++i)crc=nv_crc_byte(crc,nv[i]);
    return ~crc;
}
int psl_nv_matches(const volatile uint8_t *nv,const uint8_t identity[PSL_ID_BYTES])
{
    if(!nv || !identity)return 0;
    for(unsigned i=0;i<8;++i)if(nv[i]!=nv_tag[i])return 0;
    for(unsigned i=0;i<PSL_ID_BYTES;++i)if(nv[8+i]!=identity[i])return 0;
    return nv_get32(nv+8+PSL_ID_BYTES)==nv_header_crc(nv);
}
static unsigned nv_entry_at(unsigned slot){return PSL_NV_HEADER+slot*16u;}
static unsigned nv_entry_key(const volatile uint8_t *nv,unsigned slot)
{
    unsigned at=nv_entry_at(slot),key=nv_get16(nv+at);
    return key<2048u && (key^nv_get16(nv+at+2))==0xffffu?key:NV_NONE;
}
static void nv_cache(const volatile uint8_t *nv)
{
    uint32_t identity=nv_get32(nv+8+PSL_ID_BYTES);
    if(nv_index_store==nv && nv_index_identity==identity)return;
    for(unsigned i=0;i<2048u;++i)nv_index[i]=NV_NONE;
    for(unsigned slot=0;slot<PSL_NV_ENTRIES;++slot){unsigned key=nv_entry_key(nv,slot);
        if(key!=NV_NONE)nv_index[key]=(uint16_t)(nv_index[key]==NV_NONE?slot:NV_AMBIGUOUS);
    }
    nv_index_store=nv;nv_index_identity=identity;
}
static unsigned nv_find(const volatile uint8_t *nv,unsigned key)
{
    nv_cache(nv);unsigned slot=nv_index[key];
    return slot<PSL_NV_ENTRIES && nv_entry_key(nv,slot)==key?slot:NV_NONE;
}
int psl_nv_begin(volatile uint8_t *nv,const uint8_t identity[PSL_ID_BYTES])
{
    if(!nv || !identity)return 0;
    if(psl_nv_matches(nv,identity))return 1;
    unsigned empty=1,ours=1,partial=1;
    for(unsigned i=0;i<8;++i){if(nv[i]!=0 && nv[i]!=255)empty=0;if(nv[i]!=nv_tag[i])ours=0;
        if(nv[i]!=0 && nv[i]!=255 && nv[i]!=nv_tag[i])partial=0;}
    if(!empty && !ours && !partial)return 0;
    nv_index_store=0;nv[0]=0; /* Invalid before any allocation/reset write. */
    for(unsigned i=8;i<PSL_NV_BYTES;++i)nv[i]=0;
    for(unsigned slot=0;slot<PSL_NV_ENTRIES;++slot)nv_put16(nv+nv_entry_at(slot),NV_NONE);
    for(unsigned i=1;i<8;++i)nv[i]=nv_tag[i];
    for(unsigned i=0;i<PSL_ID_BYTES;++i)nv[8+i]=identity[i];
    nv[0]=nv_tag[0];nv_put32(nv+8+PSL_ID_BYTES,nv_header_crc(nv));
    return 1;
}
int psl_nv_reserve(volatile uint8_t *nv,unsigned row,unsigned tracks)
{
    if(!nv || row>=256 || tracks>255)return 0;
    nv_cache(nv);unsigned need=0,free=0;
    for(unsigned t=0;t<8;++t)if(tracks&(1u<<t)) {
        if(nv_index[row*8u+t]==NV_AMBIGUOUS)return 0;
        if(nv_find(nv,row*8u+t)==NV_NONE)++need;
    }
    for(unsigned slot=0;slot<PSL_NV_ENTRIES && free<need;++slot)free+=nv_entry_key(nv,slot)==NV_NONE;
    if(free<need)return 0; /* Capacity refusal must not evict or partially reserve. */
    for(unsigned t=0;t<8;++t)if((tracks&(1u<<t)) && nv_find(nv,row*8u+t)==NV_NONE) {
        for(unsigned slot=0;slot<PSL_NV_ENTRIES;++slot)if(nv_entry_key(nv,slot)==NV_NONE) {
            unsigned at=nv_entry_at(slot),key=row*8u+t;
            nv_put32(nv+at+12,0); /* No trust until publication completes. */
            for(unsigned b=0;b<8;++b)nv[at+4+b]=0;
            nv_put16(nv+at+2,key^0xffffu);nv_put16(nv+at,key);
            nv_index[key]=(uint16_t)slot;break;
        }
    }
    return 1;
}
static uint32_t nv_record_crc(const volatile uint8_t *nv,unsigned slot,const uint8_t *record)
{
    uint32_t crc=~0u;unsigned at=nv_entry_at(slot);
    for(unsigned i=0;i<4;++i)crc=nv_crc_byte(crc,nv[8+PSL_ID_BYTES+i]);
    for(unsigned i=0;i<12;++i)crc=nv_crc_byte(crc,nv[at+i]);
    for(unsigned i=0;i<8;++i)crc=nv_crc_byte(crc,record[i]);
    for(unsigned i=0;i<PSL_STEPS;++i)crc=nv_crc_byte(crc,record[PSL_LOCK_OFFSET+32u*i]);
    return ~crc;
}
void psl_nv_read(const volatile uint8_t *nv,unsigned row,unsigned track,const uint8_t *record,uint8_t owned[PSL_STEPS])
{
    if(!owned)return;
    for(unsigned i=0;i<PSL_STEPS;++i)owned[i]=0;
    if(!nv || !record || row>=256 || track>=8)return;
    unsigned slot=nv_find(nv,row*8u+track);if(slot==NV_NONE)return;
    unsigned at=nv_entry_at(slot);uint32_t crc=nv_get32(nv+at+12);
    if(!crc || crc!=nv_record_crc(nv,slot,record))return;
    for(unsigned i=0;i<PSL_STEPS;++i)owned[i]=(uint8_t)((nv[at+4+i/8u]>>(i%8u))&1u);
}
void psl_nv_invalidate(volatile uint8_t *nv,unsigned row,unsigned track)
{
    if(!nv || row>=256 || track>=8)return;
    unsigned slot=nv_find(nv,row*8u+track);
    if(slot!=NV_NONE)nv_put32(nv+nv_entry_at(slot)+12,0);
}
void psl_nv_publish(volatile uint8_t *nv,unsigned row,unsigned track,const uint8_t *record,const uint8_t owned[PSL_STEPS])
{
    if(!nv || !record || !owned || row>=256 || track>=8)return;
    unsigned any=0,key=row*8u+track;
    for(unsigned i=0;i<64;++i)any|=owned[i]==1 && record[PSL_LOCK_OFFSET+32u*i]!=PSL_NO_LOCK;
    unsigned slot=nv_find(nv,key);
    if(!any) {
        if(slot!=NV_NONE){unsigned at=nv_entry_at(slot);nv_put32(nv+at+12,0);nv_put16(nv+at,NV_NONE);nv_put16(nv+at+2,0);nv_index[key]=NV_NONE;}
        return;
    }
    if(slot==NV_NONE){if(!psl_nv_reserve(nv,row,1u<<track))return;slot=nv_find(nv,key);}
    unsigned at=nv_entry_at(slot);nv_put32(nv+at+12,0);
    for(unsigned b=0;b<8;++b){uint8_t bits=0;
        for(unsigned k=0;k<8;++k)if(owned[b*8u+k]==1 && record[PSL_LOCK_OFFSET+32u*(b*8u+k)]!=PSL_NO_LOCK)bits|=(uint8_t)(1u<<k);
        nv[at+4+b]=bits;
    }
    nv_put32(nv+at+12,nv_record_crc(nv,slot,record));
}
