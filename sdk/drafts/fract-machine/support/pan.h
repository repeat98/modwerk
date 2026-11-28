/* Peak-bounded equal-power grain balance. No floating point on ColdFire. */
#ifndef GRNYV1_PAN_H
#define GRNYV1_PAN_H
#include "grain.h"
#ifdef OG_NATIVE_STAGE_ONE
unsigned og_pan_root(unsigned);
#define pan_root og_pan_root
#ifdef OG_NATIVE_PAN_TABLE
#include "pan_gains.h"
#endif
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
#if defined(OG_NATIVE_STAGE_ONE) && defined(OG_NATIVE_PAN_TABLE)
    /* value+(value>=64) is exactly (value*128+63)/127 for 0..127.
     * The table stores the same floored roots as the scalar path below;
     * only the unity endpoint needs its ninth bit restored. */
    unsigned width=value+(value>=64u),last=2u*width;
    unsigned position=(unsigned)(uint16_t)(word>>16)*(uint16_t)(last+1u)>>16;
    unsigned base=(unsigned)(uint16_t)width*(uint16_t)width;
    h->left=position?og_pan_gains[base+position]:256;
    h->right=position==last?256:og_pan_gains[base+last-position];
#else
    unsigned width=(value*128u+63u)/127u;
    int pan=(int)(((word>>16)*(2*width+1))>>16)-(int)width;
    /* Uniform power-pan position. Normalize by the largest permitted
     * channel gain at this width. Both coefficients stay <= 1.
     * For mono, L^2+R^2 is direction-independent within Q8 rounding.
     * Opening the width smoothly lowers total gain by at most 3 dB. */
    unsigned denominator=128+width;
    h->left=(uint16_t)pan_root(((unsigned)(128-pan)<<16)/denominator);
    h->right=(uint16_t)pan_root(((unsigned)(128+pan)<<16)/denominator);
#endif
}
#endif
