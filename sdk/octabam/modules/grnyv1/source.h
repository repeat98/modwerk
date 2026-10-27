#ifndef GRNYV1_SOURCE_H
#define GRNYV1_SOURCE_H
#include "grain.h"
typedef struct {
    uint32_t slot,frames,identity;
    uint8_t bytes,channels,little,join_mode;
    int16_t join[2];
    void (*read)(void *,uint32_t,int32_t *);
} OgSource;
/* Three per-head audio streams, local to one audio fetch. This caches
 * page addresses; the shared source caches one endpoint (four PCM bytes).
 * No page pointer or endpoint survives the audio fetch. */
typedef struct {
    OgSource *source;
    uint32_t frame,remaining;
    uintptr_t cursor;
} OgStream;
typedef struct { OgStream head[OG_MAX_GRAINS]; } OgReader;
#if UINTPTR_MAX == 0xffffffffu
_Static_assert(sizeof(OgSource)==24,"Bounded endpoint metadata and callback");
_Static_assert(sizeof(OgStream)==16 && sizeof(OgReader)==48,"Bounded per-head address cursors");
#endif
static inline void og_reader_init(OgReader *r,OgSource *s) {
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) {r->head[g].source=s;r->head[g].remaining=0;}
}
int og_describe(unsigned,OgSource *);
int og_source(unsigned,OgSource *);
#ifdef OG_UNCACHED_FIXTURE
void og_pcm(void *,uint32_t,int32_t *);
#endif
/* Cached physical spans permit repeated/strided pitched reads. PCM output
 * must not overlap the stream or its source metadata. */
void og_stream_pcm(void *,uint32_t,int32_t *restrict);
/* Checked selection used by reader fixtures. Native audio and overview
 * callers already own a stream, so they do not need this wrapper in ROM. */
static inline void og_cached_pcm(void *context,uint32_t frame,int32_t *pcm,unsigned head) {
    if (head>=OG_MAX_GRAINS) {pcm[0]=pcm[1]=0;return;}
    og_stream_pcm(((OgReader *)context)->head+head,frame,pcm);
}
/* The arena address of `frame`, and in *remaining the frames from it to its
 * page's or the source's end; 0 (and 0) for an unmapped or invalid frame. */
uintptr_t og_locate(const OgSource *,uint32_t,uint32_t *);
/* The native engine (grain.c): `count` output frames of the owner's grains. */
void og_engine(OgGrain *,const OgSource *,const uint8_t *,int32_t *,unsigned);
extern uint32_t og_owner;
void og_release_check(void);
int og_fetch_wants(unsigned,unsigned); /* host models only */
#endif
