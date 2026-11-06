/* Exact overview peaks across source formats, pages, missing pages and seeks. */
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include "source.h"
static uint8_t pcm[18432];
static unsigned resolutions,missing;
static uint32_t read_pcm(uintptr_t at,unsigned n) {
    assert(at>=0x41000000u && at+n<=0x41000000u+sizeof pcm);
    uint32_t v=0;for(unsigned i=0;i<n;++i)v=(v<<8)|pcm[at-0x41000000u+i];return v;
}
#define U8(a) read_pcm((uintptr_t)(a),1)
#define U16(a) read_pcm((uintptr_t)(a),2)
#define U32(a) read_pcm((uintptr_t)(a),4)
#define OG_PUT32(a,v) ((void)(a),(void)(v),assert(!"unexpected UI write"))
#include "fract_ui.c"
uintptr_t og_locate(const OgSource *s,uint32_t frame,uint32_t *remaining) {
    ++resolutions;*remaining=0;
    if(frame>=s->frames)return 0;
    unsigned bpf=s->bytes*s->channels,perpage=6144u/bpf,page=frame/perpage;
    if(missing && page==1)return 0;
    *remaining=perpage-frame%perpage;
    if(*remaining>s->frames-frame)*remaining=s->frames-frame;
    return 0x41000000u+frame*bpf;
}
static unsigned reference(const OgSource *s,unsigned frame) {
    unsigned bpf=s->bytes*s->channels;
    if(frame>=s->frames || (missing && frame/(6144u/bpf)==1))return 0;
    unsigned best=0;
    for(unsigned c=0;c<s->channels;++c) {
        unsigned at=frame*bpf+c*s->bytes;
        int sample=(int16_t)((pcm[at]<<8)|pcm[at+1]);
        unsigned value=(unsigned)(sample<0?-sample:sample);
        if(value>best)best=value;
    }
    return best;
}
int main(void) {
    for(unsigned i=0;i<sizeof pcm;++i)pcm[i]=(uint8_t)(i*73u+19u);
    for(unsigned bytes=2;bytes<=3;++bytes)for(unsigned channels=1;channels<=2;++channels)
      for(missing=0;missing<=1;++missing) {
        OgSource s={.frames=3072,.bytes=(uint8_t)bytes,.channels=(uint8_t)channels};
        OgStream stream={.source=&s,.remaining=0};resolutions=0;
        for(unsigned f=0;f<256;++f)assert(ui_peak(&stream,f)==reference(&s,f));
        assert(resolutions==1); /* The previous helper resolved all256. */
        for(unsigned f=256;f<s.frames;++f)assert(ui_peak(&stream,f)==reference(&s,f));
        static const unsigned seeks[]={3072,0,3071,1024,2048,15,2047,UINT32_MAX};
        for(unsigned i=0;i<sizeof seeks/sizeof *seeks;++i)
            assert(ui_peak(&stream,seeks[i])==reference(&s,seeks[i]));
    }
    return 0;
}
