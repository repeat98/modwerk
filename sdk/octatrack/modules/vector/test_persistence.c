/* Firmware-free regression for #349; actual stock startup is tested separately. */
#include "persistence.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define PART_BYTES 6322
static unsigned expected_mask, calls;
static int stock_result;
static int validator(uint8_t *part) {
    ++calls;
    for(unsigned t=0;t<8;++t) for(unsigned k=0;k<12;++k) {
        unsigned at=(k<6?0x3cu:0x1ecu)+30u*t+k%6;
        if(expected_mask&(1u<<t)) assert(part[at]==0);
        else if(part[at]>127) return 1;
    }
    /* This selected-machine byte remains subject to stock validation. */
    if(part[0x2au+6]>127) return 1;
    part[0x20]=17; /* A real stock correction must survive the wrapper. */
    return stock_result;
}
int main(void) {
    uint8_t guarded[PART_BYTES+2], before[PART_BYTES];
    uint8_t *part=guarded+1;
    for(unsigned mask=0;mask<256;++mask) {
        memset(guarded,0,sizeof guarded); guarded[0]=guarded[PART_BYTES+1]=0xa5;
        for(unsigned t=0;t<8;++t) {
            part[0x22+t]=(uint8_t)(t&1);
            if(mask&(1u<<t)) {
                unsigned at=0x3c+30*t;
                part[at]='S'; part[at+1]='2'; part[at+2]=(uint8_t)(1+(t&1));
                part[at+3]=(uint8_t)t; part[at+4]=(uint8_t)(11+t);
                part[at+5]=(uint8_t)(0xc0+t); /* SPAN=12: old startup rejects it. */
                for(unsigned k=0;k<6;++k) part[0x1ec+30*t+k]=(uint8_t)(20+t+k);
            }
        }
        memcpy(before,part,sizeof before);
        expected_mask=mask; stock_result=23; calls=0;
        assert(vector_validate_part(part,validator)==23 && calls==1);
        before[0x20]=17;
        assert(!memcmp(before,part,sizeof before));
        assert(guarded[0]==0xa5 && guarded[PART_BYTES+1]==0xa5);
    }
    /* Unmarked, unsupported-version and non-sample tracks are never exempt. */
    for(unsigned kind=0;kind<6;++kind) for(unsigned version=0;version<4;++version) {
        memset(part,0,PART_BYTES); part[0x22]=(uint8_t)kind;
        part[0x3c]='S'; part[0x3d]='2'; part[0x3e]=(uint8_t)version; part[0x41]=192;
        int signed_track=kind<2 && (version==1 || version==2);
        assert(vector_signed_track(part,0)==signed_track);
        expected_mask=signed_track?1:0; stock_result=0;
        assert(vector_validate_part(part,validator)==(signed_track?0:1));
        assert(part[0x41]==192);
    }
    assert(!vector_signed_track(part,8));
    memset(part,0,PART_BYTES); part[0x3c]='S'; part[0x3d]='2'; part[0x3e]=2;
    part[0x41]=192; part[0x30]=255; expected_mask=1;
    assert(vector_validate_part(part,validator)==1 && part[0x41]==192);
    puts("PASS VECTOR Part validation: all 256 instance masks, old/new markers, exact restoration, stock corrections, unrelated rejection and canaries");
}
