/* Peak-bounded equal-power grain balance. No floating point on ColdFire. */
#ifndef GRNYV1_PAN_H
#define GRNYV1_PAN_H
#include "grain.h"
#ifdef OG_NATIVE_STAGE_ONE
unsigned og_pan_root(unsigned);
#define pan_root og_pan_root
#else
static __attribute__((noinline)) unsigned pan_root(unsigned power) {
    /* Q8 gain, floor(sqrt(power)), including the exact unity endpoint.
     * Nine fixed iterations; no ROM curve, rejection or data-dependent loop. */
    unsigned result=0;
    for (unsigned bit=256;bit;bit>>=1) {
        unsigned candidate=result+bit;
        if (candidate*candidate<=power) result=candidate;
    }
    return result;
}
#endif
static __attribute__((noinline)) void pan_birth(OgGrain *s,OgHead *h,unsigned value) {
    h->left=h->right=256;
    if (!value) return;
    /* Independent stream: PAN edits cannot change SPRD positions. */
    uint32_t word=s->pan_seed;
    word^=word<<13;word^=word>>17;word^=word<<5;s->pan_seed=word;
    unsigned width=(value*128u+63u)/127u;
    int pan=(int)(((word>>16)*(2*width+1))>>16)-(int)width;
    /* Uniform power-pan position. Normalize by the largest permitted
     * channel gain at this width. Both coefficients stay <= 1.
     * For mono, L^2+R^2 is direction-independent within Q8 rounding.
     * Opening the width smoothly lowers total gain by at most 3 dB. */
    unsigned denominator=128+width;
    h->left=(uint16_t)pan_root(((unsigned)(128-pan)<<16)/denominator);
    h->right=(uint16_t)pan_root(((unsigned)(128+pan)<<16)/denominator);
}
#endif
