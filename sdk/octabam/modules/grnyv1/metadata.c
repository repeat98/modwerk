/* Validated native Flex metadata, packed with the adapter. */
#include "source.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
/* Whether the boot literals describe a sample arena this adapter can
 * read: the base at 0x4000045e and the page count at 0x40096f82.
 * Reservations (octabam arena.py, Elekloader's reserve) move the base up
 * past whole pages and lower the count; the stock end 0x40a955e0+14603*6144
 * never moves. Literals outside that geometry describe no source, so no
 * page is read through arithmetic that does not fit. */
static inline __attribute__((always_inline)) int og_arena_fits(void) {
    /* Pages the reservations took; 14602 or more is an empty or
     * impossible count. One register holds the stock count for both tests. */
    uint32_t stock=14602u;
    __asm__("" : "+r"(stock));
    uint32_t taken=stock-U32(0x40096f82);
    return taken<stock && U32(0x4000045e)-0x40a955e0u<=(uint16_t)taken*6144u;
}
int og_describe(unsigned slot,OgSource *s) {
    if (!og_arena_fits()) return 0;
    if (slot>=128) return 0; /* Recorder pages can change during a read. */
    uintptr_t m=0x46c922c4+slot*44u;
    unsigned mode=U32(m);
    if (mode>3 || U32(m+8)) return 0;
    uint32_t frames=U32(m+16),identity=U32(m+20);
    if (frames-1u>=44860416u || !identity ||
        identity!=U32(0x46c920a4+4u*slot)) return 0;
    s->slot=slot;s->frames=frames;s->identity=identity;
    /* Flex loading normalizes PCM into big-endian heap pages. The input
     * file's endian flag at meta+5 does not describe those pages. */
    s->bytes=mode<2?3:2;s->channels=(mode&1)+1;s->little=0;s->join_mode=0;
    return 1;
}
