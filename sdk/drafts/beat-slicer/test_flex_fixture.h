#ifndef BEAT_SLICER_TEST_FLEX_FIXTURE_H
#define BEAT_SLICER_TEST_FLEX_FIXTURE_H
/* SPDX-License-Identifier: MIT */
#include "flex_copy.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
#define PAGE 6144u
#define VP(type, address) ((volatile type *)(uintptr_t)(address))
struct fixture {
    struct bs_flex_binding binding;
    struct bs_source_snapshot source;
    struct bs_pcm_read request;
    uint32_t ready, controls[128*11], formats[16], offsets[256], used;
    uint16_t counts[128], pages[6];
    uintptr_t pages_at, offsets_at;
#ifndef BS_FLEX_STOCK
    uint8_t pool[8*PAGE];
#endif
    uint8_t output[BS_SESSION_BYTES+2];
    uint32_t queries, reply_error, bytes;
};
static struct fixture f;
static void clear(void *p, uint32_t n) {
    for (uint32_t i=0;i<n;++i) ((uint8_t *)p)[i]=0;
}
static void put(const volatile uint32_t *p, uint32_t i, uint32_t value) {
    ((volatile uint32_t *)(uintptr_t)p)[i]=value;
}
static void put16(const volatile uint16_t *p, uint32_t i, uint16_t value) {
    ((volatile uint16_t *)(uintptr_t)p)[i]=value;
}
static void putptr(const volatile uintptr_t *p, uintptr_t value) {
    *(volatile uintptr_t *)(uintptr_t)p=value;
}
static uint8_t value(uint32_t frame,uint32_t byte) { return (uint8_t)(frame*19+byte*31+7); }
static void query(uint32_t entry,uint32_t slot,uint32_t frame,struct bs_pool_span *out) {
    ++f.queries;
#ifdef BS_FLEX_STOCK
    bs_flex_stock_query(entry,slot,frame,out);
#else
    (void)entry;
    uint32_t format=f.binding.controls[slot*11], width=(format&2?2u:3u)*(format&1?2u:1u);
    uint32_t per_page=PAGE/width, page=frame/per_page;
    const uint16_t *pages=(const uint16_t *)*f.binding.pages_at;
    const uint32_t *offsets=(const uint32_t *)*f.binding.offsets_at;
    out->data=f.binding.pool+pages[offsets[slot]+page]*PAGE+(frame%per_page)*width;
    out->frames=per_page-frame%per_page;
    if (out->frames>f.binding.controls[slot*11+4]-frame) out->frames=f.binding.controls[slot*11+4]-frame;
#endif
    if(f.reply_error==1) ++out->data;
    if(f.reply_error==2) ++out->frames;
    if(f.reply_error==3) out->frames=0;
    if(f.reply_error==4) out->data=0;
}
static void setup(uint32_t format,uint32_t slot) {
    clear(&f,sizeof(f));
    f.binding.query=query;f.binding.lookup_entry=0x4009499c;
    f.binding.page_bytes=PAGE;f.binding.physical_pages=8;f.binding.pool_bytes=8*PAGE;
    f.binding.map_capacity=3;
    f.binding.pages_region=(const uint8_t *)f.pages;f.binding.pages_region_bytes=sizeof(f.pages);
    f.binding.offsets_region=(const uint8_t *)f.offsets;f.binding.offsets_region_bytes=sizeof(f.offsets);
#ifdef BS_FLEX_STOCK
    f.binding.ready=VP(uint32_t,0x46105408);
    f.binding.controls=VP(uint32_t,0x46c922c4);
    f.binding.formats=VP(uint32_t,0x80003c20);
    f.binding.pages_at=VP(uintptr_t,0x80006914);f.binding.offsets_at=VP(uintptr_t,0x80006918);
    f.binding.counts=VP(uint16_t,0x46c75e88);f.binding.used=VP(uint32_t,0x8000691c);
    f.binding.pool=(const uint8_t *)(uintptr_t)0x40a955e0;
#else
    f.binding.ready=&f.ready;f.binding.controls=f.controls;f.binding.formats=f.formats;
    f.binding.pages_at=&f.pages_at;f.binding.offsets_at=&f.offsets_at;
    f.binding.counts=f.counts;f.binding.used=&f.used;f.binding.pool=f.pool;
#endif
    put(f.binding.ready,0,1);put(f.binding.used,0,3);
    putptr(f.binding.pages_at,(uintptr_t)f.pages);putptr(f.binding.offsets_at,(uintptr_t)f.offsets);
    f.pages[0]=f.pages[3]=3;f.pages[1]=f.pages[4]=7;f.pages[2]=f.pages[5]=2;
    f.source.kind=BS_SOURCE_FLEX;f.source.slot=slot;
    f.source.format.bits=format&2?16:24;f.source.format.channels=format&1?2:1;
    uint32_t width=f.source.format.bits/8*f.source.format.channels,per_page=PAGE/width;
    f.source.frames=2*per_page+17;
    put(f.binding.controls,slot*11,format);put(f.binding.controls,slot*11+2,0);
    put(f.binding.controls,slot*11+4,f.source.frames);put(f.binding.controls,slot*11+5,41);
    put(f.binding.formats,format*4+1,per_page);put(f.binding.formats,format*4+2,width);
    put16(f.binding.counts,slot,3);
    for(uint32_t frame=0;frame<f.source.frames;++frame)
        for(uint32_t b=0;b<width;++b)
            ((uint8_t *)(uintptr_t)f.binding.pool)[f.pages[frame/per_page]*PAGE+(frame%per_page)*width+b]=value(frame,b);
    f.request.count=32;f.request.operation=1;f.request.revision=1;
    for(uint32_t i=0;i<sizeof(f.output);++i)f.output[i]=0xa5;
    f.bytes=0x12345678;
}

#endif
