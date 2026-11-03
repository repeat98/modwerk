// SPDX-License-Identifier: MIT
// Original stock pointer/selection refresh fixtures. Isolated synthetic state;
// viewport callback mocked, no concurrent reader, scheduler, audio or device.
#include <array>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iterator>
#include <map>
#include <stdexcept>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
namespace {
constexpr uint32_t stack=0x47100000, stop=0x47300000, scratch=0x47200000;
constexpr uint32_t kindAt=0x46c8d1a0, slotAt=0x46c8d19c;
constexpr uint32_t stride=0x448, flex=0x100b14f0, stat=0x100d5b30;
constexpr std::array<m68k_register_t,11> saved{M68K_REG_D2,M68K_REG_D3,M68K_REG_D4,M68K_REG_D5,M68K_REG_D6,M68K_REG_D7,M68K_REG_A2,M68K_REG_A3,M68K_REG_A4,M68K_REG_A5,M68K_REG_A6};
void require(bool ok,const char* why) { if (!ok) throw std::runtime_error(why); }
struct Probe {
    ot::Machine m;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {}
    uint32_t arg(unsigned i) { return m.read32(reg(M68K_REG_SP)+4+4*i); }
    void ret(uint32_t v) { auto sp=reg(M68K_REG_SP); reg(M68K_REG_D0,v); reg(M68K_REG_PC,m.read32(sp)); reg(M68K_REG_SP,sp+4); }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t run(uint32_t entry, std::initializer_list<uint32_t> args,
                 uint32_t sr = 0x2700, const std::function<void()>& observe = {}) {
        reg(M68K_REG_SR, sr); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        for (unsigned i = 0; i < saved.size(); ++i) reg(saved[i], 0x12340000+i);
        unsigned i = 0;
        for (auto a : args) m.write32(stack+4+4*i++, a);
        reg(M68K_REG_PC, entry);
        unsigned steps = 0;
        while (m.pc() != stop && ++steps < 2000000) {
            auto mock=mocks.find(m.pc());
            if (mock != mocks.end()) { ret(mock->second()); continue; }
            if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
            if (observe) observe();
        }
        require(m.pc() == stop && reg(M68K_REG_SP) == stack+4, "return/budget differs");
        require(reg(M68K_REG_SR) >> 8 == sr >> 8, "interrupt mask not restored");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000+n, "callee-saved register changed");
        return reg(M68K_REG_D0);
    }
    std::vector<uint8_t> bytes(uint32_t at, unsigned size) {
        std::vector<uint8_t> v(size);
        for (unsigned i = 0; i < size; ++i) v[i] = m.read8(at+i);
        return v;
    }
    uint32_t setup(unsigned kind,unsigned slot,unsigned oldCount) {
        m.write32(kindAt,kind); m.write32(slotAt,slot); m.write32(0x460e5e5c,2);
        m.write32(0x46105408,1);
        auto control=(kind?0x46c922c4u:0x46c90a78u)+44*slot;
        m.write32(control+8,0); m.write32(control+16,20000);
        auto base=(kind?flex:stat)+stride*slot;
        for(unsigned i=0;i<stride;++i) m.write8(base+i,uint8_t(i*17+3));
        m.write32(base+300,128); m.write32(base+304,16512); m.write32(base+308,128);
        m.write32(base+1092,oldCount);
        for(unsigned i=0;i<oldCount;++i) {
            m.write32(base+312+12*i,256+400*i);
            m.write32(base+316+12*i,456+400*i);
            m.write32(base+320+12*i,300+400*i);
        }
        m.write32(0x400ceb3c,0xffffffff); m.write32(0x400ceb40,scratch);
        m.write32(scratch,128); m.write32(0x460e5e64,0);
        m.write32(0x400ceb30,slot); m.write32(0x400ceb34,kind);
        for(auto a:{0x40013a08u,0x4005a2b8u,0x40056becu}) mocks[a]=[]{return 0u;};
        return base;
    }
};
void shrink(const std::vector<uint8_t>& image) {
    unsigned unsafe=0,safe=0;
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u})
    for(unsigned oldCount:{4u,64u}) for(unsigned count:{0u,1u})
    for(unsigned reset:{0u,1u}) {
        Probe p(image); auto base=p.setup(kind,slot,oldCount);
        auto before=p.bytes(base,stride);
        p.m.write32(0x400ceb3c,oldCount-1);
        p.m.write32(scratch,256+400*(oldCount-1)+10);
        p.run(0x40070cbc,{},0x2000);
        // Model only the table-count reduction that an Undo could request.
        // There is no module or stock Undo action installed in this fixture.
        p.m.write32(base+1092,count);
        unsigned nullReads=0,viewport=0;
        p.m.addReadWatch(0,3,[&](uint32_t,uint8_t,uint32_t,uint32_t){++nullReads;});
        p.mocks[0x4007409c]=[&]{++viewport;return 0u;};
        if(reset)p.m.write32(0x400ceb3c,0xffffffffu);
        p.run(0x40070cbc,{},0x2000);
        p.run(0x400718f8,{},0x2000);
        p.run(0x4006dbdc,{},0x2000);
        if(reset) {
            require(!nullReads && !viewport,"reset selection still dereferenced a retired row");
            ++safe;
        } else {
            require(nullReads && viewport,"stale selection did not reproduce retired-row dereference");
            ++unsafe;
        }
        require(p.m.read32(0x400ceb3c)==0xffffffffu,"cursor outside remaining slices stayed selected");
        require(p.m.read32(0x460e5e64)==1,"redraw not notified");
        auto after=p.bytes(base,stride);
        for(unsigned i=0;i<1092;++i)require(before[i]==after[i],"refresh changed a settings byte");
        for(unsigned i=0;i<64;++i) {
            auto expected=i<count?base+312+12*i:0u;
            require(p.m.read32(0x460e5fe4+14*i)==expected,"start binding not rebuilt");
            require(p.m.read32(0x460e6372+14*i)==(expected?expected+4:0),"end binding not rebuilt");
            require(p.m.read32(0x460e6700+14*i)==(expected?expected+8:0),"loop binding not rebuilt");
        }
    }
    require(unsafe==16 && safe==16,"shrink matrix incomplete");
    std::puts("PASS: 16 retired-row dereferences reproduced; 16 reset-before-refresh reductions avoid them");
}
void restore(const std::vector<uint8_t>& image) {
    unsigned cases=0;
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u})
    for(unsigned oldCount:{0u,1u,4u,64u}) for(unsigned cursor:{266u,30000u}) {
        Probe p(image);auto base=p.setup(kind,slot,oldCount);
        auto before=p.bytes(base,stride),other=p.bytes((kind?stat:flex),stride);
        p.m.write32(scratch,cursor);
        unsigned nullReads=0,viewport=0;
        p.m.addReadWatch(0,3,[&](uint32_t,uint8_t,uint32_t,uint32_t){++nullReads;});
        p.mocks[0x4007409c]=[&]{++viewport;return 0u;};
        for(unsigned pass=0;pass<2;++pass) {
            p.m.write32(0x400ceb3c,0xffffffffu);
            p.run(0x40070cbc,{},0x2000);
            p.run(0x400718f8,{},0x2000);
            p.run(0x4006dbdc,{},0x2000);
            require(p.m.read32(0x400ceb3c)==(oldCount && cursor==266?0u:0xffffffffu),
                    "restored selection differs from cursor containment");
            require(!nullReads && !viewport,"safe refresh called viewport or read retired row");
            require(p.bytes(base,stride)==before && p.bytes((kind?stat:flex),stride)==other,
                    "refresh changed sample settings");
        }
        ++cases;
    }
    require(cases==32,"restoration matrix incomplete");
    std::puts("PASS: 32 empty/populated refreshes preserve complete settings and select only a containing row");
}
}
int main(int argc,char** argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try { shrink(image);restore(image); }
    catch(const std::exception& e){std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
