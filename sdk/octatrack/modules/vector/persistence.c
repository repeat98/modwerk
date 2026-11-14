/* Original VECTOR persistence adapter. No firmware bytes or stock tables. */
#include "persistence.h"

int vector_signed_track(const volatile uint8_t *part, unsigned track) {
    if(track>=8 || part[0x22u+track]>1) return 0;
    const volatile uint8_t *signature=part+0x3cu+30u*track;
    return signature[0]=='S' && signature[1]=='2' &&
           (signature[2]==1 || signature[2]==2);
}

int vector_validate_part(uint8_t *part, int (*stock_validate)(uint8_t *)) {
    uint8_t saved[8][12]; unsigned mask=0;
    /* Stock checks all five machines' source slots, including the unused
     * NEIGHBOR slots which hold our marker/settings. Packed SPAN >= 8 has its
     * top bit set: stock interprets it as a negative parameter and rejects
     * the complete bank at startup. Present zero-valued unused slots only
     * for a signed VECTOR Flex/Static track, then restore every byte.
     * Selected-machine parameters and all other Part data remain checked. */
    for(unsigned t=0;t<8;++t) if(vector_signed_track(part,t)) {
        mask|=1u<<t;
        for(unsigned k=0;k<12;++k) {
            unsigned at=(k<6?0x3cu:0x1ecu)+30u*t+k%6;
            saved[t][k]=part[at]; part[at]=0;
        }
    }
    int result=stock_validate(part);
    for(unsigned t=0;t<8;++t) if(mask&(1u<<t))
        for(unsigned k=0;k<12;++k) {
            unsigned at=(k<6?0x3cu:0x1ecu)+30u*t+k%6;
            part[at]=saved[t][k];
        }
    return result;
}
