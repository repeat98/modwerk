/* Firmware-free regression for the actual shared validation entry. */
#define _GNU_SOURCE
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>

extern int mr_validate(volatile uint8_t *);
static unsigned mask, calls;
static uint8_t original[6322];
/* Weak presence probes. Unrelated UI/audio sections are discarded at link. */
unsigned ab_type(unsigned type, const volatile uint8_t *part) { (void)part; return type; }
unsigned fm_type(unsigned type, const volatile uint8_t *part) { (void)part; return type; }
static unsigned kind(unsigned track) { return track % 3; }
static unsigned protected_offset(unsigned track, unsigned k) {
    unsigned vector=kind(track)==2;
    return (k<6?(vector?0x3c:0x30):(vector?0x1ec:0x1e0))+30*track+k%6;
}
int mr_stock_validate(uint8_t *part) {
    ++calls;
    uint8_t expected[6322]; memcpy(expected,original,sizeof expected);
    for(unsigned t=0;t<8;++t) if(mask&(1u<<t))
        for(unsigned k=0;k<12;++k) expected[protected_offset(t,k)]=0;
    assert(memcmp(part,expected,sizeof expected)==0);
    part[5]=42; /* A real stock correction outside protected source slots. */
    return 23;
}
int main(void) {
    /* Synthetic zero defaults at the descriptor address; no firmware input. */
    void *defaults=mmap((void *)0x400d3000,4096,PROT_READ|PROT_WRITE,
                       MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED,-1,0);
    assert(defaults==(void *)0x400d3000);
    for(mask=0;mask<256;++mask) {
        uint8_t part[6322]; memset(part,0,sizeof part);
        for(unsigned t=0;t<8;++t) {
            part[0x22+t]=t&1; /* Flex and Static. */
            for(unsigned k=0;k<12;++k) part[protected_offset(t,k)]=(uint8_t)(128+7*t+k);
            unsigned at=0x3c+30*t;
            part[at]=kind(t)==0?'A':kind(t)==1?'F':'S';
            part[at+1]=kind(t)==0?'B':kind(t)==1?'M':'2';
            part[at+2]=kind(t)==2?(uint8_t)(1+(t&1)):1;
            if(!(mask&(1u<<t))) part[at]='X';
        }
        memcpy(original,part,sizeof part); calls=0;
        assert(mr_validate(part)==23 && calls==1);
        original[5]=42;
        assert(memcmp(part,original,sizeof part)==0);
    }
    assert(munmap(defaults,4096)==0);
    puts("PASS: 256 mixed AB/FM/VECTOR signature masks; packed settings restored, stock result and unrelated corrections retained");
}
