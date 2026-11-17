/* Logical coordinates only; no physical address survives an audio fetch. */
#ifndef FRACT_PAGE_COORDINATES_H
#define FRACT_PAGE_COORDINATES_H
#include "source.h"
/* Requires an admitted native source and frame < frames (og_describe contract). */
static inline void og_page_coordinates(const OgSource *s, uint32_t frame,
        unsigned *bpf, unsigned *perpage, unsigned *index, unsigned *offset) {
    unsigned stereo=s->channels==2;
    *bpf=s->bytes*s->channels;
    if (s->bytes==3) {
        unsigned shift=stereo?10:11;
        *perpage=1u<<shift;*index=frame>>shift;
        *offset=frame&(*perpage-1u);
    } else {
        unsigned shift=stereo?9:10;
        /* floor(n/3)=(n*43691)>>17 for n<131072. Here n<=87617,
         * so the product fits uint32 and the quotient is exact. */
        *perpage=3u<<shift;
        *index=((frame>>shift)*43691u)>>17;
        *offset=frame-(*index)*(*perpage);
    }
}
#endif
