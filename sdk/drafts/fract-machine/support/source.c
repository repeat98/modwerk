/* Native Flex adapter. Existing PCM/pages and renderer scratch remain owned
 * by stock. No card I/O, full sample copy or DSP transfer is added here. */
#include "source.h"
#include "sizes.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
/* Host fixtures read through functions, so they also supply the one store. */
#ifndef OG_PUT16
#define OG_PUT16(a,v) (U16(a)=(uint16_t)(v))
#endif
/* UI caches use only declared adapter-cave storage. */

#include "metadata.c"

uintptr_t og_locate(const OgSource *s,uint32_t frame,uint32_t *remaining) {
    *remaining=0;
    unsigned bpf=s->bytes*s->channels,perpage=6144u/bpf;
    uintptr_t bases=U32(0x80006918),map=U32(0x80006914);
    /* The literals are image constants, and og_describe admitted this
     * source only after og_arena_fits accepted them, so they still hold. */
    unsigned pages=U32(0x40096f82);
    /* Both tables lie in 0x46000000..0x48000000: one unsigned test. */
    if (frame>=s->frames ||
        ((bases-0x46000000u)|(map-0x46000000u))>=0x02000000u) return 0;
    unsigned index=U32(bases+4u*s->slot)+frame/perpage;
    if (index>pages) return 0;
    unsigned page=U16(map+2u*index);
    if (!page || page>pages) return 0;
    unsigned offset=frame%perpage;
    *remaining=perpage-offset;
    if (*remaining>s->frames-frame) *remaining=s->frames-frame;
    return U32(0x4000045e)+page*6144u+offset*bpf;
}
/* Keep this short decoder inside each reader. Out-of-line argument shuffling
 * and register saves otherwise occur for every grain sample. */
static inline __attribute__((always_inline)) void decode(const OgSource *s,uintptr_t p,int32_t *pcm) {
    if (!p) {pcm[0]=pcm[1]=0;return;}
    /* Native PCM16 pages and frame strides are aligned: stereo uses one
     * longword instead of four byte loads, mono one word instead of two.
     * PCM24 retains byte decoding because its second channel can be odd. */
    if (s->bytes==2) {
        if (s->channels==2) {
            uint32_t pair=U32(p);
            pcm[0]=(int16_t)(pair>>16);pcm[1]=(int16_t)pair;
        } else pcm[0]=pcm[1]=(int16_t)U16(p);
        return;
    }
    for (unsigned ch=0;ch<s->channels;++ch,p+=s->bytes) {
        unsigned hi=U8(p),lo=U8(p+1);
        pcm[ch]=(int16_t)((hi<<8)|lo);
    }
    if (s->channels==1) pcm[1]=pcm[0];
}
#ifdef OG_UNCACHED_FIXTURE
void og_pcm(void *context,uint32_t frame,int32_t *pcm) {
    const OgSource *s=context;uint32_t remaining;
    decode(s,og_locate(s,frame,&remaining),pcm);
}
#endif
/* Output is separate from source metadata and the cursor. This also lets
 * the compiler reuse format fields after decoding instead of loading them. */
void og_stream_pcm(void *context,uint32_t frame,int32_t *restrict pcm) {
    OgStream *r=context;const OgSource *s=r->source;
    if (!r->remaining || frame-r->frame>=r->remaining) {
        r->cursor=og_locate(s,frame,&r->remaining);r->frame=frame;
    }
    /* A failed locate returns zero and pins frame to the request, so its
     * displacement is also zero. Valid spans never cross the cached page. */
    decode(s,r->cursor+(frame-r->frame)*s->bytes*s->channels,pcm);
}
