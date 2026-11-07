/* Shared source metadata/PCM helpers; this machine resolves pages below.
 * No FX detour, SPACE engine or FX slot is part of the active runtime. */
#include "source.h"
#define og_locate og_division_locate
#include "../support/source.c"
#undef og_locate
#include "page_coordinates.h"

uintptr_t og_locate(const OgSource *s,uint32_t frame,uint32_t *remaining) {
    *remaining=0;
    uintptr_t bases=U32(0x80006918),map=U32(0x80006914);
    /* The literals are image constants, and og_describe admitted this
     * source only after og_arena_fits accepted them, so they still hold. */
    unsigned pages=U32(0x40096f82);
    /* Both tables lie in 0x46000000..0x48000000: one unsigned test. */
    if (frame>=s->frames ||
        ((bases-0x46000000u)|(map-0x46000000u))>=0x02000000u) return 0;
    unsigned bpf,perpage,index_in_source,offset;
    og_page_coordinates(s,frame,&bpf,&perpage,&index_in_source,&offset);
    unsigned index=U32(bases+4u*s->slot)+index_in_source;
    if (index>pages) return 0;
    unsigned page=U16(map+2u*index);
    if (!page || page>pages) return 0;
    *remaining=perpage-offset;
    if (*remaining>s->frames-frame) *remaining=s->frames-frame;
    return U32(0x4000045e)+page*6144u+offset*bpf;
}
