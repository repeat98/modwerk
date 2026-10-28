/* SPDX-License-Identifier: MIT */
/* Private 1.40C table contract. No firmware bytes or tables are carried here.
 * Canonical owners, source/layout revisions and exact encoded package hashes
 * are independently reviewed board inputs. Empty declarations stay closed. */
#include "table_admission.h"
#include <stddef.h>
static uint32_t be16(const uint8_t *p) { return (uint32_t)p[0]<<8 | p[1]; }
static uint32_t be32(const uint8_t *p) { return be16(p)<<16 | be16(p+2); }
static int equal(const uint8_t *a,const uint8_t *b,unsigned n)
{ for(unsigned i=0;i<n;i++) if(a[i]!=b[i]) return 0;return 1; }
static int nonzero(const uint8_t *p,unsigned n)
{ for(unsigned i=0;i<n;i++) if(p[i]) return 1;return 0; }
static uint32_t physical(uint32_t p)
{ return p>=0x48000400u && p<0x4ff00000u?p-0x08000000u:p; }
struct family_shape { uint32_t stock[3],consumer_lo,consumer_hi;uint8_t count,insert,added,index; };
static const struct family_shape families[]={
    {{0,0,0},0,0,0,0,0,0},
    {{0x400b27d0u,0x400b27dcu,0x400b282cu},0x40065b14u,0x40065d92u,3,3,3,4},
    {{0x400b2a34u,0x400b2a74u,0x400b2ac0u},0x40068e00u,0x4006907cu,16,2,1,12}
};
static int valid(const uint8_t *table);
unsigned table_metadata_family(const uint8_t table[TABLE_DECLARATION_BYTES],const struct runtime_dsp *d)
{
    if(!d || !d->present) return TABLE_NONE;
    /* Scale Quantizer's runtime package contributes its rows to the base's ot_sequencer_rows table instead of
     * relocating the SEQUENCER tables: no table family. */
    if(d->module==0x7e9d5687u) return d->contributes?TABLE_NONE:TABLE_QUANTIZER; /* SHA256("quantizer")[:4] */
    /* Mute Modes contributes its row to the base's ot_personalize_rows table instead of relocating the PERSONALIZE
     * tables: no table family, so no record in the base names its package. */
    if(d->module==0x73bab3b1u) return d->contributes?TABLE_NONE:TABLE_MUTES; /* SHA256("mute-modes")[:4] */
    if(d->flags&RUNTIME_GROUP_METADATA && d->image && d->image_bytes>=16u &&
       equal(d->image,(const uint8_t *)"MWMG",4) && d->image[4]==1 && (d->image[5]&4u)) return TABLE_QUANTIZER;
    if(d->flags&RUNTIME_GROUP_METADATA) {
        if(!valid(table)) return TABLE_INVALID;
        for(unsigned i=0;i<table[5];i++) {
            const uint8_t *r=table+TABLE_DECLARATION_HEADER+i*TABLE_DECLARATION_RECORD;
            if(equal(r,d->package_sha256,32) && be32(r+32)==d->module) return r[40];
        }
    }
    return TABLE_NONE;
}
int table_machine_association(const uint8_t machine[MACHINE_DECLARATION_BYTES],
    const uint8_t table[TABLE_DECLARATION_BYTES],const struct runtime_dsp *d)
{
    if(!d || !d->present || !(d->flags&RUNTIME_GROUP_METADATA)) return RUNTIME_OK;
    int optional=machine_metadata_optional_quantizer(machine,d);
    if(optional<0) return RUNTIME_MALFORMED;
    unsigned expected=(d->image[5]&4u)||optional?TABLE_QUANTIZER:TABLE_NONE;
    unsigned actual=table_metadata_family(table,d);
    if(expected!=actual) return RUNTIME_MALFORMED;
    /* Mandatory FM tables still need their exact independently trusted SHA,
     * even though their canonical family can be recognized before lookup. */
    if(expected) {
        if(!valid(table)) return RUNTIME_MALFORMED;
        for(unsigned i=0;i<table[5];i++) {
            const uint8_t *r=table+TABLE_DECLARATION_HEADER+i*TABLE_DECLARATION_RECORD;
            if(equal(r,d->package_sha256,32) && be32(r+32)==d->module && r[40]==expected && be16(r+38)==d->layout) return RUNTIME_OK;
        }
        return RUNTIME_MALFORMED;
    }
    return RUNTIME_OK;
}
/* The board calls this helper only after authenticating both exact MWMD
 * records. A canonical group may gain/drop its bundled Quantizer tables;
 * an unrelated module must never impersonate that ownership transition. */
static int machine_without_table(const uint8_t *table,const struct runtime_dsp *d)
{
    return d->present && d->flags==RUNTIME_GROUP_METADATA && d->module==0xdb769930u &&
        d->image && d->image_bytes>=16u && equal(d->image,(const uint8_t *)"MWMG",4) &&
        d->image[4]==1 && d->image[5] && !(d->image[5]&~3u) && !nonzero(d->image+6,10) &&
        table_metadata_family(table,d)==TABLE_NONE;
}
static int valid(const uint8_t *table)
{
    if(!table || !equal(table,(const uint8_t *)"MWTD",4) || table[4]!=1 ||
       table[5]>TABLE_DECLARATION_CAPACITY || table[6]!=TABLE_DECLARATION_CAPACITY || nonzero(table+7,9)) return 0;
    for(unsigned i=0;i<TABLE_DECLARATION_CAPACITY;i++) {
        const uint8_t *r=table+TABLE_DECLARATION_HEADER+i*TABLE_DECLARATION_RECORD;
        if(i>=table[5]) {if(nonzero(r,TABLE_DECLARATION_RECORD)) return 0;continue;}
        if(!nonzero(r,32) || !be32(r+32) || !be16(r+36) || !be16(r+38) ||
           !r[40] || r[40]>TABLE_MUTES || nonzero(r+56,4)) return 0;
        uint32_t module=be32(r+32);
        if((r[40]==TABLE_QUANTIZER && module!=0x7e9d5687u && module!=0xdb769930u) ||
           (r[40]==TABLE_MUTES && module!=0x73bab3b1u)) return 0;
        const struct family_shape *s=&families[r[40]];
        if(r[41]!=s->count || r[42]!=s->insert || r[43]!=s->added) return 0;
        for(unsigned j=0;j<i;j++) if(equal(r,table+TABLE_DECLARATION_HEADER+j*TABLE_DECLARATION_RECORD,32)) return 0;
    }
    return 1;
}
static const uint8_t *declared(const uint8_t *table,const struct runtime_dsp *d,unsigned family)
{
    if(!d->present || d->count || !d->image || !d->layout || !d->image_bytes ||
       d->image_bytes>RUNTIME_IMAGE_BYTES || (d->flags && d->flags!=RUNTIME_GROUP_METADATA)) return 0;
    for(unsigned i=0;i<table[5];i++) {
        const uint8_t *r=table+TABLE_DECLARATION_HEADER+i*TABLE_DECLARATION_RECORD;
        if(!equal(r,d->package_sha256,32) || be32(r+32)!=d->module || r[40]!=family || be16(r+38)!=d->layout) continue;
        uint32_t bytes=4u*(r[41]+r[43]);
        for(unsigned j=0;j<3;j++) {
            uint32_t at=be32(r+44+4*j);
            if((at&3u) || bytes>d->image_bytes || at>d->image_bytes-bytes) return 0;
            for(unsigned k=0;k<j;k++) {uint32_t other=be32(r+44+4*k);if(at<other+bytes && other<at+bytes) return 0;}
        }
        return r;
    }
    return 0;
}
static int arrays(const uint8_t *r,const struct runtime_dsp *d,unsigned encoded,machine_memory_read read,void *context)
{
    const struct family_shape *s=&families[r[40]];uintptr_t base=(uintptr_t)d->image;
    if(!encoded && (base>UINT32_MAX || d->image_bytes>UINT32_MAX-(uint32_t)base)) return 0;
    uint32_t lo=physical((uint32_t)base),hi=lo+d->image_bytes;
    for(unsigned table=0;table<3;table++) {
        uint32_t offset=be32(r+44+4*table);
        for(unsigned row=0;row<s->count+s->added;row++) {
            uint8_t value[4],stock[4];uint32_t word;
            if(encoded) word=be32(d->image+offset+4*row);
            else {if(!read(context,(uint32_t)base+offset+4*row,value,4)) return 0;word=be32(value);}
            if(row>=s->insert && row<s->insert+s->added) {
                if(encoded) {if(word>=d->image_bytes) return 0;}
                else {uint32_t p=physical(word);if(p<lo || p>=hi) return 0;}
            } else {
                if(encoded) {if(word) return 0;}
                else {
                    unsigned old=row<s->insert?row:row-s->added;
                    if(!read(context,s->stock[table]+4*old,stock,4) || word!=be32(stock)) return 0;
                }
            }
        }
    }
    return 1;
}
static int held(uint32_t p,const struct family_shape *s,const struct runtime_dsp *old)
{
    p=physical(p);
    for(unsigned i=0;i<3;i++) if(p>=s->stock[i] && p<s->stock[i]+4*s->count) return 1;
    if(p>=s->consumer_lo && p<s->consumer_hi) return 1;
    /* A paused shared dispatcher may not have materialized its selected
     * table pointer yet. Fence the entire reviewed dispatch/close region. */
    if(p>=0x40064bc0u && p<0x40065138u) return 1;
    if(old && old->present) {
        uintptr_t base=(uintptr_t)old->image;
        if(base>UINT32_MAX || old->image_bytes>UINT32_MAX-(uint32_t)base) return 1;
        uint32_t lo=physical((uint32_t)base);
        if(p>=lo && p<lo+old->image_bytes) return 1;
    }
    return 0;
}
static int consumers(unsigned family,const struct runtime_dsp *old,machine_memory_read read,void *context,
    const struct runtime_span *span,unsigned count)
{
    if(!read || !span || count>RUNTIME_PAUSED) return 0;
    const struct family_shape *s=&families[family];uint8_t value[4];
    if(!read(context,0x400cbf4cu,value,4)) return 0;
    if(nonzero(value,4)) {
        if(!read(context,0x400cbf40u,value,4)) return 0;
        uint32_t index=be32(value);
        if(index==s->index || index>31u) return 0;
    }
    if(machine_ui_lifetime(read,context,s->consumer_lo,s->consumer_hi)!=MACHINE_CLEAR) return 0;
    for(unsigned i=0;i<3;i++)
        if(machine_ui_lifetime(read,context,s->stock[i],s->stock[i]+4*s->count)!=MACHINE_CLEAR) return 0;
    if(old && old->present) {
        uintptr_t lo=(uintptr_t)old->image;
        if(lo>UINT32_MAX || old->image_bytes>UINT32_MAX-(uint32_t)lo ||
           machine_ui_lifetime(read,context,(uint32_t)lo,(uint32_t)lo+old->image_bytes)!=MACHINE_CLEAR) return 0;
    }
    for(unsigned i=0;i<count;i++) {
        if((uintptr_t)span[i].from>(uintptr_t)span[i].to ||
           (uintptr_t)span[i].to-(uintptr_t)span[i].from>0x10000u) return 0;
        for(const uint8_t *p=span[i].from;p+4<=span[i].to;p+=2) if(held(be32(p),s,old)) return 0;
    }
    return 1;
}
int table_metadata_admission(const uint8_t table[TABLE_DECLARATION_BYTES],const struct runtime_dsp *from,
    const struct runtime_dsp *to,unsigned operation,machine_memory_read read,void *context,const struct runtime_span *span,unsigned count)
{
    if(!from || !to || (operation!=TABLE_PREPARE && operation!=TABLE_SWITCH)) return RUNTIME_MALFORMED;
    unsigned old_family=table_metadata_family(table,from),next_family=table_metadata_family(table,to);
    if(old_family>TABLE_MUTES || next_family>TABLE_MUTES) return RUNTIME_MALFORMED;
    if(!old_family && !next_family) return RUNTIME_OK;
    if(!valid(table)) return RUNTIME_MALFORMED;
    const uint8_t *old=old_family?declared(table,from,old_family):0,*next=next_family?declared(table,to,next_family):0;
    if((old_family&&!old) || (next_family&&!next) ||
       (old_family&&to->present&&!next_family&&!(old_family==TABLE_QUANTIZER &&
           from->flags==RUNTIME_GROUP_METADATA && from->module==0xdb769930u && machine_without_table(table,to))) ||
       (next_family&&from->present&&!old_family&&!(next_family==TABLE_QUANTIZER &&
           to->flags==RUNTIME_GROUP_METADATA && to->module==0xdb769930u && machine_without_table(table,from)))) return RUNTIME_MALFORMED;
    if(old && next && (old_family!=next_family || from->module!=to->module ||
       be16(old+36)!=be16(next+36) || be16(old+38)!=be16(next+38))) return RUNTIME_CONFLICT;
    if(!read || (old&&!arrays(old,from,0,read,context)) ||
       (next&&!arrays(next,to,operation==TABLE_PREPARE,read,context))) return RUNTIME_STOCK;
    unsigned family=old_family?old_family:next_family;
    if(!consumers(family,old?from:0,read,context,span,count)) return RUNTIME_IN_USE;
    return RUNTIME_OK;
}
