/* SPDX-License-Identifier: MIT */
#include "table_admission.h"
#include <assert.h>
#include <string.h>
#define BASE 0x47080000u
static uint8_t encoded[512],running[512],declarations[TABLE_DECLARATION_BYTES],paused[64];
static uint32_t window_open,menu_index;static int unreadable;
static void put32(uint8_t *p,uint32_t n)
{ for(unsigned i=0;i<4;i++) p[i]=(uint8_t)(n>>(24-8*i)); }
static uint32_t stock(unsigned table,unsigned row) { return 0x40001000u+0x100u*table+4*row; }
static int read_memory(void *context,uint32_t at,void *out,uint32_t n)
{
    (void)context;uint8_t *p=out;if(unreadable) return 0;
    if(at>=BASE+0x08000000u && at<BASE+0x08000000u+sizeof running) at-=0x08000000u;
    if(at>=BASE && at+n<=BASE+sizeof running) {memcpy(out,running+(at-BASE),n);return 1;}
    if(at==0x400cbf4cu && n==4) {put32(out,window_open);return 1;}
    if(at==0x400cbf40u && n==4) {put32(out,menu_index);return 1;}
    static const uint32_t roots[2][3]={{0x400b27d0u,0x400b27dcu,0x400b282cu},{0x400b2a34u,0x400b2a74u,0x400b2ac0u}};
    for(unsigned f=0;f<2;f++) for(unsigned t=0;t<3;t++)
        if(at>=roots[f][t] && at+n<=roots[f][t]+(f?64u:12u) && n==4) {put32(out,stock(t,(at-roots[f][t])/4));return 1;}
    if(at<0x40000400u || at>0x47f00000u-n) return 0;
    memset(p,0,n);return 1;
}
static struct runtime_dsp package(unsigned family,int owned)
{
    struct runtime_dsp d={0};d.present=1;d.module=family==TABLE_QUANTIZER?0x7e9d5687u:0x73bab3b1u;
    d.image=owned?(const uint8_t *)(uintptr_t)BASE:encoded;d.image_bytes=sizeof encoded;d.layout=1;
    memset(d.package_sha256,(int)family,32);return d;
}
static void setup(unsigned family)
{
    memset(encoded,0,sizeof encoded);memset(running,0,sizeof running);memset(paused,0,sizeof paused);
    memcpy(declarations,modwerk_table_declarations,sizeof declarations);declarations[5]=1;
    uint8_t *r=declarations+16;memset(r,(int)family,32);put32(r+32,family==TABLE_QUANTIZER?0x7e9d5687u:0x73bab3b1u);
    r[36]=r[38]=0;r[37]=r[39]=1;r[40]=(uint8_t)family;r[41]=family==TABLE_QUANTIZER?3:16;
    r[42]=family==TABLE_QUANTIZER?3:2;r[43]=family==TABLE_QUANTIZER?3:1;
    for(unsigned t=0;t<3;t++) {
        unsigned at=80+80*t;put32(r+44+4*t,at);
        for(unsigned row=0;row<r[41]+r[43];row++) {
            if(row>=r[42] && row<r[42]+r[43]) {put32(encoded+at+4*row,400+4*row);put32(running+at+4*row,BASE+400+4*row);}
            else put32(running+at+4*row,stock(t,row<r[42]?row:row-r[43]));
        }
    }
    window_open=menu_index=0;unreadable=0;
}
static int admit(const struct runtime_dsp *from,const struct runtime_dsp *to,unsigned operation,unsigned count)
{
    struct runtime_span span={paused,paused+sizeof paused};
    return table_metadata_admission(declarations,from,to,operation,read_memory,0,&span,count);
}
int main(void)
{
    struct runtime_dsp empty={0};
    for(unsigned f=TABLE_QUANTIZER;f<=TABLE_MUTES;f++) {
        setup(f);struct runtime_dsp staged=package(f,0),owned=package(f,1);
        assert(table_metadata_family(declarations,&staged)==f);
        assert(table_metadata_admission(modwerk_table_declarations,&empty,&staged,TABLE_PREPARE,read_memory,0,0,0)==RUNTIME_MALFORMED);
        assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_OK);
        uint8_t group_image[32]={ 'M','W','M','G',1,2 };
        struct runtime_dsp group={0};group.present=1;group.flags=RUNTIME_GROUP_METADATA;
        group.module=0xdb769930u;group.image=group_image;group.image_bytes=sizeof group_image;
        /* Canonical table owners cannot be replaced by an unrelated group;
         * only the same MWMD-authenticated FM group may gain/drop its table. */
        assert(admit(&group,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);
        assert(admit(&empty,&owned,TABLE_SWITCH,1)==RUNTIME_OK);
        assert(admit(&owned,&empty,TABLE_SWITCH,1)==RUNTIME_OK);
        staged.package_sha256[0]^=1;assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);staged.package_sha256[0]^=1;
        declarations[16+39]=2;assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);declarations[16+39]=1;
        declarations[16+42]^=1;assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);declarations[16+42]^=1;
        declarations[16+56]=1;assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);declarations[16+56]=0;
        put32(declarations+16+48,80);assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);put32(declarations+16+48,160);
        encoded[80]=1;assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_STOCK);encoded[80]=0;
        running[80]^=1;assert(admit(&empty,&owned,TABLE_SWITCH,1)==RUNTIME_STOCK);running[80]^=1;
        window_open=0x460d0000;menu_index=f==TABLE_QUANTIZER?4:12;
        assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_IN_USE);
        assert(admit(&owned,&empty,TABLE_SWITCH,1)==RUNTIME_IN_USE);window_open=0;
        static const uint32_t held[2][4]={{0x400b27d0u,0x400b27e4u,0x40065b14u,0x40064e20u},
                                       {0x400b2a34u,0x400b2aafu,0x40068e00u,0x40065120u}};
        for(unsigned k=0;k<4;k++) for(unsigned alias=0;alias<2;alias++) {
            put32(paused+2,held[f-1][k]+alias*0x08000000u);
            assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_IN_USE);memset(paused,0,sizeof paused);
        }
        put32(paused+2,BASE+8);assert(admit(&owned,&empty,TABLE_SWITCH,1)==RUNTIME_IN_USE);memset(paused,0,sizeof paused);
        assert(admit(&empty,&staged,TABLE_PREPARE,RUNTIME_PAUSED+1)==RUNTIME_IN_USE);
        unreadable=1;assert(admit(&owned,&empty,TABLE_SWITCH,1)==RUNTIME_STOCK);unreadable=0;
        assert(admit(&owned,&empty,TABLE_SWITCH,1)==RUNTIME_OK);
        if(f==TABLE_QUANTIZER) {
            staged.module=0xdb769930u;staged.flags=RUNTIME_GROUP_METADATA;
            memcpy(encoded,"MWMG",4);encoded[4]=1;encoded[5]=4;put32(declarations+16+32,staged.module);
            assert(admit(&group,&staged,TABLE_PREPARE,1)==RUNTIME_OK);
            group.module^=1;assert(admit(&group,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);group.module^=1;
            group_image[6]=1;assert(admit(&group,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);group_image[6]=0;
        }
    }
    /* Every canonical P/V/FM mask with and without the optional QZ bit. Only the
     * exact independent MD record, plus exactly one TD SEQUENCER record when QZ
     * is owned (FM bundles it, or the optional bit), admits. Synthetic trust. */
    for(unsigned mask=1;mask<=7;mask++) for(unsigned optional=0;optional<2;optional++) {
        setup(TABLE_QUANTIZER);
        uint8_t machines[MACHINE_DECLARATION_BYTES];
        memcpy(machines,modwerk_machine_declarations,sizeof machines);machines[5]=1;
        struct runtime_dsp staged=package(TABLE_QUANTIZER,0);
        staged.module=0xdb769930u;staged.flags=RUNTIME_GROUP_METADATA;
        memcpy(encoded,"MWMG",4);encoded[4]=1;encoded[5]=(uint8_t)mask;
        put32(declarations+16+32,staged.module);
        uint8_t *r=machines+16;memcpy(r,staged.package_sha256,32);put32(r+32,staged.module);
        r[36]=(uint8_t)mask;r[37]=(uint8_t)optional;r[39]=r[41]=1;
        unsigned owns=(mask&4)||optional;
        if((mask&4)&&optional) { /* FM already bundles QZ: a second QZ participant is invalid trust. */
            assert(machine_metadata_optional_quantizer(machines,&staged)==-1);
            assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_MALFORMED);
            assert(table_machine_association(machines,declarations,&staged)==RUNTIME_MALFORMED);
            continue;
        }
        assert(machine_metadata_optional_quantizer(machines,&staged)==(int)optional);
        assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_OK);
        assert(table_machine_association(machines,declarations,&staged)==(owns?RUNTIME_OK:RUNTIME_MALFORMED));
        assert(table_machine_association(machines,modwerk_table_declarations,&staged)==(owns?RUNTIME_MALFORMED:RUNTIME_OK));
        assert(table_machine_association(modwerk_machine_declarations,declarations,&staged)==RUNTIME_MALFORMED);
        assert(machine_metadata_admission(modwerk_machine_declarations,&empty,&staged,0,0,0)==RUNTIME_MALFORMED);
        /* The participant bit alone never grants QZ; AB stays closed with or without it. */
        if(optional) {r[37]=0;assert(table_machine_association(machines,declarations,&staged)==RUNTIME_MALFORMED);}
        r[37]=(uint8_t)(optional|MACHINE_ANALOG_BD);
        assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_CONFLICT);r[37]=(uint8_t)optional;
        staged.package_sha256[0]^=1;
        assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_MALFORMED);
        assert(table_machine_association(machines,declarations,&staged)==RUNTIME_MALFORMED);staged.package_sha256[0]^=1;
        /* Uploaded membership must equal the record: another mask, none, or an unknown bit refuses. */
        for(unsigned drift=0;drift<9;drift++) if(drift!=mask) {
            encoded[5]=(uint8_t)drift;assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_MALFORMED);
        }
        encoded[5]=(uint8_t)mask;
        machines[5]=2;memcpy(r+44,r,44);
        assert(machine_metadata_admission(machines,&empty,&staged,0,0,0)==RUNTIME_MALFORMED);
        machines[5]=1;memset(r+44,0,44);
        declarations[5]=2;memcpy(declarations+76,declarations+16,60);
        assert(table_machine_association(machines,declarations,&staged)==RUNTIME_MALFORMED);
    }
    /* SEQUENCER and PERSONALIZE ownership is exclusive by canonical identity:
     * neither owner, nor an unrelated module, can hold the other's record. */
    for(unsigned f=TABLE_QUANTIZER;f<=TABLE_MUTES;f++) {
        setup(f);struct runtime_dsp staged=package(f,0);
        put32(declarations+16+32,f==TABLE_QUANTIZER?0x73bab3b1u:0x7e9d5687u);
        assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);
        put32(declarations+16+32,0x5c49f0f0u); /* Repitch */
        assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);
        setup(f);declarations[16+40]=(uint8_t)(f==TABLE_QUANTIZER?TABLE_MUTES:TABLE_QUANTIZER);
        assert(admit(&empty,&staged,TABLE_PREPARE,1)==RUNTIME_MALFORMED);
        setup(f);staged.module=0x5c49f0f0u;assert(table_metadata_family(declarations,&staged)==TABLE_NONE);
    }
    /* A Mute Modes package that contributes its row to the base's ot_personalize_rows table owns no table: an empty
     * base admits it, and an update in place needs no record (a new package hash changes nothing here). */
    setup(TABLE_MUTES);
    {
        struct runtime_dsp row=package(TABLE_MUTES,0),next=package(TABLE_MUTES,0);row.contributes=next.contributes=1;
        memset(next.package_sha256,0x5a,32);
        assert(table_metadata_family(modwerk_table_declarations,&row)==TABLE_NONE);
        assert(table_metadata_admission(modwerk_table_declarations,&empty,&row,TABLE_PREPARE,read_memory,0,0,0)==RUNTIME_OK);
        assert(table_metadata_admission(modwerk_table_declarations,&row,&next,TABLE_SWITCH,read_memory,0,0,0)==RUNTIME_OK);
        assert(table_metadata_admission(modwerk_table_declarations,&row,&empty,TABLE_SWITCH,read_memory,0,0,0)==RUNTIME_OK);
    }
    return 0;
}
