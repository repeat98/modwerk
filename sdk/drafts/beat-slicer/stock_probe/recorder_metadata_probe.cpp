// SPDX-License-Identifier: MIT
// Authored metadata-write audit of complete private stock recorder calls.
// Synthetic fixtures, not a scheduler/IRQ or hardware qualification.
#define main bs_metadata_historical_main
#include "recorder_probe.cpp"
#undef main
#include <set>
namespace {
void audit(const std::vector<uint8_t>& image,unsigned track,unsigned format,
           unsigned bank,unsigned machine,unsigned mode,bool preparation) {
    Probe p(image);p.setup(track,format,bank,mode==2);
    auto &m=p.m;
    m.write8(scratch+0x10000+0x8eda2+track,machine);
    const auto settings=0x100b14f0u+1096u*(128u+track);
    m.write32(settings+300,0);m.write32(settings+304,88200);
    m.write32(settings+1092,3);
    for(unsigned i=0;i<64;++i) {
        m.write32(settings+312+12*i,22050*i);
        m.write32(settings+316+12*i,22050*(i+1));
        m.write32(settings+320+12*i,UINT32_MAX);
    }
    if(preparation) {
        m.write8(p.state(track)+2,mode==1?2:0);
        m.write8(0x80004f1c+84*track+672*(1-bank)+2,0);
    } else {
        if(mode==1)m.write32(p.state(track)+32,p.edge);
        if(mode==3)m.write32(0x80006920,10);
        if(mode>=4) {
            const auto other=0x80004f1c+84*track+672*(1-bank);
            m.write8(p.state(track)+2,mode==5?2:0);
            m.write8(other+2,mode==6?2:1);
            m.write32(other+16,mode==5?16:0);
            m.write32(other+24,mode==6?97:0);m.write32(other+32,3*p.edge);
        }
    }
    unsigned rows=0,counts=0,metadata=0;std::set<uint32_t> sites,fields;
    m.addWriteWatch(0x100b14f0u,0x100d5b2fu,
      [&](uint32_t address,uint8_t,uint32_t,uint32_t pc) {
        ++metadata;sites.insert(pc);
        const auto offset=(address-0x100b14f0u)%1096u;
        fields.insert(offset);
        if(offset>=312 && offset<1080)++rows;
        if(offset>=1092)++counts;
      });
    const auto ticket=bs_guard_writer_begin(&p.guard);
    require(ticket,"audit guard refused");
    p.reg(M68K_REG_SR,0x2500);p.reg(M68K_REG_SP,stack);
    m.write32(stack,stop);m.write32(stack+4,track);
    m.write32(stack+8,preparation?(mode==1?0x1010:0x9010):0);
    m.write32(stack+12,0);m.write32(stack+16,preparation?UINT32_MAX:8);
    p.reg(M68K_REG_PC,preparation?0x40005ff0:0x400068e4);
    unsigned steps=0;
    while(m.pc()!=stop && ++steps<200000)require(m.step(),"audit CPU stopped");
    if(m.pc()!=stop)std::fprintf(stderr,"budget pc=%08x machine=%u prep=%u\n",m.pc(),machine,preparation);
    require(m.pc()==stop,"audit stock call exceeded its bound");
    require(bs_guard_writer_end(&p.guard,ticket),"audit guard did not retire");
    std::printf("AUDIT track=%u format=%u bank=%u machine=%u mode=%u prep=%u metadata=%u rows=%u counts=%u pcm=%u sites=",
      track,format,bank,machine,mode,preparation,metadata,rows,counts,p.pcmWrites);
    for(auto pc:sites)std::printf("%08x,",pc);
    std::printf(" fields=");for(auto offset:fields)std::printf("%u,",offset);
    std::puts("");
    require(!rows && !counts,"stock recorder changed slice rows/count");
}
}
int main(int argc,char **argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try {
        unsigned cases=0;
        for(unsigned track:{0u,7u})for(unsigned format:{1u,3u})
        for(unsigned bank:{0u,1u})for(unsigned machine:{0u,1u,2u,3u,4u})
        for(unsigned mode=0;mode<7;++mode)for(bool prep:{false,true}) {
            audit(image,track,format,bank,machine,mode,prep);++cases;
        }
        std::printf("PASS: %u complete stock calls; no slice rows/count written in these synthetic cases\n",cases);
    } catch(const std::exception &e) {std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
