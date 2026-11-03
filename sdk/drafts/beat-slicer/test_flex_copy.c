/* SPDX-License-Identifier: MIT */
#include "test_flex_fixture.h"
static enum bs_provider_reply run(void) {
    return bs_flex_copy_locked(&f.binding,&f.source,&f.request,f.output+1,BS_SESSION_BYTES,&f.bytes);
}
static int copies(void) {
    for(uint32_t format=0;format<4;++format)for(uint32_t slot_index=0;slot_index<2;++slot_index)
    for(uint32_t position=0;position<6;++position)for(uint32_t amount=0;amount<2;++amount) {
        setup(format,slot_index?127:0);
        uint32_t width=f.source.format.bits/8*f.source.format.channels,edge=PAGE/width;
        uint32_t first=position==0?0:position==1?edge-1:position==2?edge:position==3?edge+1:position==4?2*edge-1:2*edge+9;
        f.request.first=first;f.request.count=amount?32:1;
        if(f.request.count>f.source.frames-first)f.request.count=f.source.frames-first;
        uint32_t count=f.request.count;
        if(count>edge-first%edge)count=edge-first%edge;
        CHECK(run()==BS_PROVIDER_READY && f.queries==1 && f.bytes==count*width);
        for(uint32_t i=0;i<f.bytes;++i)CHECK(f.output[i+1]==value(first+i/width,i%width));
        CHECK(f.output[0]==0xa5);
        for(uint32_t i=f.bytes+1;i<sizeof(f.output);++i)CHECK(f.output[i]==0xa5);
        CHECK(f.binding.controls[f.source.slot*11+5]==41);
    }
    return 0;
}
static int refusals(void) {
    for(uint32_t mode=0;mode<34;++mode) {
        setup(3,0);
        switch(mode) {
        case 0: put(f.binding.ready,0,0);break;
        case 1: put(f.binding.controls,2,1);break;
        case 2: put(f.binding.controls,4,f.source.frames+1);break;
        case 3: put(f.binding.controls,0,4);break;
        case 4: f.source.kind=BS_SOURCE_STATIC;break;
        case 5: f.source.slot=128;break;
        case 6: f.source.frames=0;break;
        case 7: f.source.format.bits=8;break;
        case 8: f.source.format.channels=0;break;
        case 9: f.source.format.little_endian=1;break;
        case 10: f.request.count=0;break;
        case 11: f.request.count=33;break;
        case 12: f.request.first=f.source.frames;break;
        case 13: f.request.first=f.source.frames-1;break;
        case 14: put(f.binding.formats,3*4+1,1);break;
        case 15: put(f.binding.formats,3*4+2,1);break;
        case 16: put(f.binding.used,0,0);break;
        case 17: put(f.binding.used,0,4);break;
        case 18: put16(f.binding.counts,0,0);break;
        case 19: put16(f.binding.counts,0,2);break;
        case 20: f.offsets[0]=4;break;
        case 21: f.offsets[0]=1;break;
        case 22: f.pages[0]=8;break;
        case 23: putptr(f.binding.pages_at,0);break;
        case 24: putptr(f.binding.offsets_at,0);break;
        case 25: putptr(f.binding.pages_at,(uintptr_t)f.pages+1);break;
        case 26: putptr(f.binding.offsets_at,(uintptr_t)f.offsets+1);break;
        case 27: f.binding.pages_region_bytes=5;break;
        case 28: f.binding.offsets_region_bytes=511;break;
        case 29: f.binding.pool_bytes=8*PAGE-1;break;
        case 30: f.binding.physical_pages=0xffffffffu;break;
        case 31: f.binding.lookup_entry=0;break;
        case 32: f.binding.query=0;break;
        default:f.source.format.channels=1;break;
        }
        CHECK(run()!=BS_PROVIDER_READY && !f.queries && f.bytes==0x12345678);
        for(uint32_t i=0;i<sizeof(f.output);++i)CHECK(f.output[i]==0xa5);
    }
    for(uint32_t error=1;error<=4;++error) {
        setup(3,0);f.reply_error=error;
        CHECK(run()==BS_PROVIDER_FAILED && f.queries==1 && f.bytes==0x12345678);
        for(uint32_t i=0;i<sizeof(f.output);++i)CHECK(f.output[i]==0xa5);
    }
    setup(3,0);
    CHECK(bs_flex_copy_locked(&f.binding,&f.source,&f.request,f.output+1,1,&f.bytes)==BS_PROVIDER_FAILED);
    CHECK(!f.queries && f.bytes==0x12345678);
    return 0;
}
static int remapped(void) {
    for(uint32_t format=0;format<4;++format) {
        setup(format,127);
        putptr(f.binding.pages_at,(uintptr_t)(f.pages+3));
        putptr(f.binding.offsets_at,(uintptr_t)(f.offsets+128));
        CHECK(run()==BS_PROVIDER_READY && f.queries==1);
        uint32_t width=f.source.format.bits/8*f.source.format.channels;
        for(uint32_t i=0;i<f.bytes;++i)CHECK(f.output[i+1]==value(i/width,i%width));
    }
    return 0;
}
int bs_flex_selftest(void) {
    int error=copies();if(error)return error;
    error=refusals();if(error)return error;
    return remapped();
}
