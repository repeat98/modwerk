// SPDX-License-Identifier: MIT
// Original isolated Flex waveform fixtures. Stock input stays private. No
// scheduler, Static/recorder renderer, hardware or production admission proof.
#define main bs_historical_worker_main
#include "worker_probe.cpp"
#undef main
#include <algorithm>
namespace {
constexpr uint32_t waveform = 0x4008e3d8, bins = 0x46949080;
bool inside(uint32_t at, unsigned size, uint32_t first, uint32_t end) {
    return at >= first && at < end && size <= end-at;
}
void sourceWatches(Probe& p, unsigned& stores) {
    const std::pair<uint32_t,uint32_t> ranges[] = {
        {pool, pool+14603*pageBytes}, {controls, controls+136*44},
        {0x100b14f0,0x100d5b30}, {0x100d5b30,0x100d5b30+128*1096},
        {dirty,dirty+136}, {pageList,pageList+14602*2},
        {offsets,offsets+128*4}, {0x46c75e88,0x46c75e88+136*2},
        {0x80006914,0x80006924}, {0x80003c20,0x80003c60},
    };
    for (auto [first,end] : ranges)
        p.m.addWriteWatch(first,end-1,[&stores](uint32_t,uint8_t,uint32_t,uint32_t){++stores;});
}
void setupSlot(Probe& p, unsigned format, unsigned slot) {
    p.setup(format);
    if (slot) {
        for (unsigned i=0;i<44;i+=4) p.m.write32(controls+slot*44+i,p.m.read32(controls+i));
        p.m.write32(offsets+4*slot,0); p.m.write16(0x46c75e88+2*slot,2);
    }
    unsigned length=p.m.read32(controls+16), width=format&2?2:3;
    for (unsigned f=0;f<length;++f) {
        for (unsigned ch=0;ch<(format&1?2u:1u);++ch) {
            int32_t value=int32_t((f*(ch?53u:37u))%10000)-5000;
            if (width==3) value=value*256+int32_t(f*17%255);
            for (unsigned b=0;b<width;++b)
                p.m.write8(p.address(format,f)+ch*width+b,uint32_t(value)>>(8*(width-1-b)));
        }
    }
}
void render(const std::vector<uint8_t>& image, unsigned format, unsigned slot, unsigned size) {
    Probe p(image); setupSlot(p,format,slot);
    unsigned edge=pageBytes/p.width(format), first=edge-(size==17?10:2);
    unsigned length=p.m.read32(controls+16), sourceStores=0, lookups=0, outputStores=0;
    sourceWatches(p,sourceStores);
    p.m.addReadWatch(pool,pool+14603*pageBytes-1,
        [&lookups](uint32_t,uint8_t,uint32_t,uint32_t){++lookups;});
    p.m.addWriteWatch(0,UINT32_MAX,[&outputStores](uint32_t at,uint8_t width,uint32_t,uint32_t){
        bool allowed=inside(at,width,callStack-0x10000,callStack+0x100) ||
            inside(at,width,0x46036840,0x46037640) || inside(at,width,bins,bins+0xe00) ||
            inside(at,width,0x46036830,0x46036834) || inside(at,width,0x400d16a0,0x400d16a4);
        require(allowed,"Flex renderer wrote outside its observed stack/display/progress regions");
        if(inside(at,width,bins,bins+0xe00))++outputStores;
    });
    require(p.run(waveform,{slot,first,size})==1,"Flex waveform return differs");
    require(lookups && outputStores && !sourceStores,"renderer did not read, render, or preserve source");
    for(unsigned bin=0;bin<102;++bin) {
        unsigned start=first+bin*size;
        int32_t low[2]={INT32_MAX,INT32_MAX},high[2]={INT32_MIN,INT32_MIN};
        if(start>=length || size>length-start) low[0]=low[1]=high[0]=high[1]=0;
        else for(unsigned f=start;f<start+size;++f) for(unsigned ch=0;ch<2;++ch) {
            int32_t value=p.sample(format,f,(format&1)?ch:0);
            low[ch]=std::min(low[ch],value); high[ch]=std::max(high[ch],value);
        }
        require(int32_t(p.m.read32(bins+28*bin))==high[0] &&
                int32_t(p.m.read32(bins+28*bin+4))==low[0] &&
                int32_t(p.m.read32(bins+28*bin+8))==high[1] &&
                int32_t(p.m.read32(bins+28*bin+12))==low[1] &&
                p.m.read32(bins+28*bin+16)==start+size &&
                p.m.read32(bins+28*bin+20)==start && p.m.read32(bins+28*bin+24)==1,
                "independent waveform extrema/extent oracle differs");
    }
    lookups=0;
    require(p.run(waveform,{slot,first,size})==1 && !lookups && !sourceStores,
            "matching display cache did not reuse bins or changed source");
    require(!p.displayCalls,"renderer used the inherited display mock");
}
void pending(const std::vector<uint8_t>& image, bool ready) {
    Probe p(image); setupSlot(p,3,0);
    if(ready)p.m.write32(controls+8,1); else p.m.write32(0x46105408,0);
    unsigned sourceStores=0; sourceWatches(p,sourceStores);
    require(p.run(waveform,{0,0,4})==1 && !sourceStores,"pending source waveform mutated source");
    for(unsigned i=0;i<102;++i) for(unsigned ch=0;ch<2;++ch) {
        int32_t low=0,high=0;
        if(ready) {
            low=INT32_MAX;high=INT32_MIN;
            for(unsigned f=i*4;f<i*4+4;++f) {
                int32_t value=p.sample(3,f,ch);
                low=std::min(low,value);high=std::max(high,value);
            }
        }
        require(int32_t(p.m.read32(bins+28*i+8*ch))==high &&
                int32_t(p.m.read32(bins+28*i+8*ch+4))==low,
                "unready/busy waveform extrema differ from independent oracle");
    }
    require(!p.displayCalls,"pending source used the inherited display mock");
}
void dispatchRead(const std::vector<uint8_t>& image) {
    Probe p(image); setupSlot(p,3,0);
    const uint32_t record=scratch+0x300;
    for(unsigned i=0;i<28;++i)p.m.write8(record+i,0);
    p.m.write8(record,16);p.m.write32(record+2,1);p.m.write32(record+6,0);
    p.m.write32(record+10,1534);p.m.write32(record+14,4);p.m.write32(record+22,callback);
    p.run(post,{engineQ,record});p.start();
    unsigned sourceStores=0;sourceWatches(p,sourceStores);
    p.step();p.until(loop);p.checkLoop();
    require(!sourceStores && p.m.read32(uiQ+4)==1,"waveform dispatch changed source or lost completion");
    p.checkCompletion(0,1);
    require(!p.displayCalls,"waveform dispatch used the inherited display mock");
}
}
int main(int argc,char** argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try {
        for(unsigned format=0;format<4;++format)for(unsigned slot:{0u,127u})for(unsigned width:{1u,4u,17u})
            render(image,format,slot,width);
        pending(image,false);pending(image,true);dispatchRead(image);
        std::puts("PASS: 48 fresh/cached Flex waveform calls, four formats, slots 0/127, page/end boundaries, two pending sources and worker dispatch; no source writes");
        return 0;
    } catch(const std::exception& e) {std::printf("FAIL: %s\n",e.what());return 1;}
}
