/* SPDX-License-Identifier: MIT */
#include "ownership.h"
static const uint8_t nv_tag[8]={'P','S','L','O','W','N',1,0};
static uint32_t nv_crc_byte(uint32_t crc,uint8_t value)
{
    crc^=value;
    for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^((0u-(crc&1u))&0xedb88320u);
    return crc;
}
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
int psl_nv_begin(volatile uint8_t *nv,const uint8_t identity[PSL_ID_BYTES])
{
    if(!nv || !identity)return 0;
    if(psl_nv_matches(nv,identity))return 1;
    unsigned empty=1,ours=1,partial=1;
    for(unsigned i=0;i<8;++i){if(nv[i]!=0 && nv[i]!=255)empty=0;if(nv[i]!=nv_tag[i])ours=0;if(nv[i]!=0 && nv[i]!=255 && nv[i]!=nv_tag[i])partial=0;}
    if(!empty && !ours && !partial)return 0;
    /* Header invalid first and valid last. No old bitmap is inherited. */
    nv[0]=0;
    for(unsigned i=8;i<PSL_NV_BYTES;++i)nv[i]=0;
    for(unsigned i=1;i<8;++i)nv[i]=nv_tag[i];
    for(unsigned i=0;i<PSL_ID_BYTES;++i)nv[8+i]=identity[i];
    nv[0]=nv_tag[0];
    nv_put32(nv+8+PSL_ID_BYTES,nv_header_crc(nv));
    return 1;
}
static unsigned nv_at(unsigned row,unsigned track)
{ return PSL_NV_HEADER+(row*8u+track)*12u; }
static uint32_t nv_record_crc(const volatile uint8_t *nv,unsigned row,unsigned track,const uint8_t *record)
{
    uint32_t crc=~0u;unsigned at=nv_at(row,track);
    crc=nv_crc_byte(crc,(uint8_t)(row>>8));crc=nv_crc_byte(crc,(uint8_t)row);
    crc=nv_crc_byte(crc,(uint8_t)track);
    for(unsigned i=0;i<8;++i)crc=nv_crc_byte(crc,nv[at+i]);
    for(unsigned i=0;i<8;++i)crc=nv_crc_byte(crc,record[i]);
    for(unsigned i=0;i<PSL_STEPS;++i)crc=nv_crc_byte(crc,record[PSL_LOCK_OFFSET+32u*i]);
    return ~crc;
}
void psl_nv_read(const volatile uint8_t *nv,unsigned row,unsigned track,const uint8_t *record,uint8_t owned[PSL_STEPS])
{
    if(!owned)return;
    for(unsigned i=0;i<PSL_STEPS;++i)owned[i]=0;
    if(!nv || !record || row>=256 || track>=8)return;
    unsigned at=nv_at(row,track);uint32_t crc=nv_get32(nv+at+8);
    if(!crc || crc!=nv_record_crc(nv,row,track,record))return;
    for(unsigned i=0;i<PSL_STEPS;++i)
        owned[i]=(uint8_t)((nv[at+i/8u]>>(i%8u))&1u);
}
void psl_nv_invalidate(volatile uint8_t *nv,unsigned row,unsigned track)
{ if(nv && row<256 && track<8)nv_put32(nv+nv_at(row,track)+8,0); }
void psl_nv_publish(volatile uint8_t *nv,unsigned row,unsigned track,const uint8_t *record,const uint8_t owned[PSL_STEPS])
{
    if(!nv || !record || !owned || row>=256 || track>=8)return;
    unsigned at=nv_at(row,track);psl_nv_invalidate(nv,row,track);
    for(unsigned b=0;b<8;++b){uint8_t bits=0;
        for(unsigned k=0;k<8;++k)if(owned[b*8u+k]==1 && record[PSL_LOCK_OFFSET+32u*(b*8u+k)]!=PSL_NO_LOCK)bits|=(uint8_t)(1u<<k);
        nv[at+b]=bits;
    }
    nv_put32(nv+at+8,nv_record_crc(nv,row,track,record));
}
