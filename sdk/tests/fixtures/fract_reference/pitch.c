/* Bounded engine helpers: the Hann table, the PAN root and, for host builds,
 * the run mixer's C twin (ColdFire builds run kernel.s). (The pitched path
 * and its source-edge reader left with PTCH in 0.10.0; the file keeps its
 * name and its place in the units.) */
#include "source.h"
#define OG_WINDOW_STORAGE
#include "window.h"
#ifdef OG_NATIVE_STAGE_ONE
#include "kernel.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif

unsigned og_pan_root(unsigned power) {
    /* Q8 gain, floor(sqrt(power)), including the exact unity endpoint.
     * Nine fixed iterations; no ROM curve, rejection or data-dependent loop. */
    unsigned result=0;
    for (unsigned bit=256;bit;bit>>=1) {
        unsigned candidate=result+bit;
        if (candidate*candidate<=power) result=candidate;
    }
    return result;
}

#if !defined(__mcoldfire__)
/* og_mix_span's and og_mix_span_reverse's C twin (kernel.h), for host
 * builds; ColdFire builds run kernel.s. The span splits where the window's
 * segment ends (the attack's next entry, the release's previous one, the
 * switch itself as a one-frame segment at the peak), as kernel.s does; each frame of a
 * segment: its linear envelope at the mirrored phase, the native decoder's
 * PCM, 0.9.6's in-place PAN scaling, then pcm*env added to (or, first,
 * stored in) the accumulator; the frames run upwards from pcm, or
 * downwards for REV. */
static void mix(const OgSpan *r,int reverse) {
    static const unsigned bytes[5]={3,6,2,4,4};
    uintptr_t a=r->pcm;
    int32_t *acc=r->acc;
    uint32_t phase=r->phase,step=r->step;
    unsigned scaled=r->gain_l!=256 || r->gain_r!=256,frames=r->frames;
    intptr_t bpf=reverse?-(intptr_t)bytes[r->format]:(intptr_t)bytes[r->format];
    while (frames) {
        unsigned rising=phase<r->half;
        uint32_t p=rising?phase:(1u<<31)-phase;
        const uint16_t *t=rising?r->attack:r->release;
        unsigned i=p>>24,k,left,delta;
        if (phase==r->half) {k=1;left=r->attack[r->half>>24];delta=0;}
        else {
            if (rising) k=(((i+1u)<<24)-p+step-1u)/step;
            else k=(p-(i<<24))/step+1u;
            left=t[i];delta=(uint16_t)(t[i+1]-t[i]);
        }
        if (k>frames) k=frames;
        frames-=k;phase+=k*step;
        for (;k;--k,a+=(uintptr_t)bpf,acc+=2,p+=rising?step:-step) {
            int32_t env=(int32_t)(left+((unsigned)delta*(uint16_t)(p>>8)>>16));
            int32_t l,rr;
            if (r->format==4) {const int16_t *pair=(const int16_t *)a;l=pair[0];rr=pair[1];}
            else if (r->format==3) {uint32_t pair=U32(a);l=(int16_t)(pair>>16);rr=(int16_t)pair;}
            else if (r->format==2) l=rr=(int16_t)U16(a);
            else {
                l=(int16_t)((U8(a)<<8)|U8(a+1));
                rr=r->format==1?(int16_t)((U8(a+3)<<8)|U8(a+4)):l;
            }
            if (scaled) {
                l=(int16_t)((l*(int32_t)r->gain_l)>>8);
                rr=(int16_t)((rr*(int32_t)r->gain_r)>>8);
            }
            if (r->first) {acc[0]=l*env;acc[1]=rr*env;}
            else {acc[0]+=l*env;acc[1]+=rr*env;}
        }
    }
}
void og_mix_span(const OgSpan *r) {mix(r,0);}
void og_mix_span_reverse(const OgSpan *r) {mix(r,1);}
#endif

#endif
