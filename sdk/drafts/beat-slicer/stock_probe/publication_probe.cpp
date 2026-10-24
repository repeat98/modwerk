// SPDX-License-Identifier: MIT
// Original synthetic editor-publication fixtures. Private stock runs in emulator.
// Explicit display/progress/zero-search mocks; no scheduler, device or persistence.
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
struct Trace {
    Probe& p; unsigned countStores=0,recordStores=0,refreshes=0,redraws=0;
    bool unmasked=true,zeroBeforeRecords=true;
    uint32_t base;
    Trace(Probe& probe,uint32_t target):p(probe),base(target) {
        p.m.addWriteWatch(base+1092,base+1095,[this](uint32_t,uint8_t,uint32_t,uint32_t){++countStores;});
        p.m.addWriteWatch(base+312,base+1079,[this](uint32_t,uint8_t,uint32_t,uint32_t){
            ++recordStores; zeroBeforeRecords &= p.m.read32(base+1092)==0;
            unmasked &= (p.reg(M68K_REG_SR)&0x700)==0;
        });
    }
    void observe() {
        if(p.m.pc()==0x40070cbc) ++refreshes;
        if(p.m.pc()==0x4006dbdc) ++redraws;
    }
};
void checkGrid(Probe& p,uint32_t base,unsigned count,const std::vector<uint8_t>& before) {
    require(p.m.read32(base+1092)==count,"grid count differs");
    for(unsigned i=0;i<count;++i) {
        require(p.m.read32(base+312+12*i)==128+16384*i/count,"grid start differs");
        require(p.m.read32(base+316+12*i)==128+16384*(i+1)/count,"grid end differs");
        require(p.m.read32(base+320+12*i)==0xffffffffu,"grid loop not disabled");
    }
    auto after=p.bytes(base,stride);
    for(unsigned i=0;i<stride;++i)
        if(i<312 || (i>=312+12*count && i<1092))
            require(after[i]==before[i],"grid changed trim, attributes or inactive records");
    for(unsigned i=0;i<64;++i) {
        auto expected=i<count?base+312+12*i:0u;
        require(p.m.read32(0x460e5fe4+14*i)==expected,"editor start pointers differ");
        require(p.m.read32(0x460e6372+14*i)==(expected?expected+4:0),"editor end pointers differ");
        require(p.m.read32(0x460e6700+14*i)==(expected?expected+8:0),"editor loop pointers differ");
    }
    require(p.m.read32(0x400ceb3c)==0 && p.m.read32(0x460e5e64)==1,"selection/redraw publication differs");
}
void immediate(const std::vector<uint8_t>& image) {
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u})
    for(unsigned count:{2u,8u,64u}) for(unsigned oldCount:{0u,3u}) {
        Probe p(image); auto base=p.setup(kind,slot,oldCount);
        auto before=p.bytes(base,stride),other=p.bytes((kind?stat:flex),stride);
        unsigned dialogs=0,closed=0;
        p.mocks[0x4006d57c]=[&]{++dialogs; require(p.arg(4)==0x40073a68,"grid dialog callback differs");return 0u;};
        p.mocks[0x40056bec]=[&]{++closed;return 0u;};
        p.run(0x40073984,{count},0x2000);
        require(dialogs==1 && p.bytes(base,stride)==before,"opening grid dialog mutated settings");
        Trace trace(p,base);
        p.run(0x40073a68,{1},0x2000,[&]{trace.observe();});
        checkGrid(p,base,count,before);
        require(trace.countStores==2 && trace.recordStores==3*count && trace.zeroBeforeRecords && trace.unmasked,
            "grid publication ordering/mask differs");
        require(trace.refreshes==1 && trace.redraws==1 && closed==1,"grid refresh/completion differs");
        require(p.bytes((kind?stat:flex),stride)==other,"grid touched other source arena");
    }
}
struct Request { uint32_t callback,position; };
void deferred(const std::vector<uint8_t>& image) {
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u}) {
        Probe p(image); auto base=p.setup(kind,slot,3); auto before=p.bytes(base,stride);
        std::vector<Request> requests; unsigned closed=0;
        p.mocks[0x40022978]=[&]{
            require(p.arg(0)==kind && p.arg(1)==slot,"zero-search source differs");
            requests.push_back({p.arg(6),p.arg(4)});return 0u;};
        p.mocks[0x40056bec]=[&]{++closed;return 0u;};
        p.m.write32(0x460e5fe0,4); Trace trace(p,base);
        p.run(0x40073a68,{0},0x2000,[&]{trace.observe();});
        require(requests.size()==1 && p.m.read32(base+1092)==0 && !trace.recordStores && !closed,
                "deferred grid did not clear count before pending search");
        for(unsigned i=312;i<1080;++i) require(p.m.read8(base+i)==before[i],"pending search changed old records");
        for(unsigned i=0;i<8;++i) {
            require(requests.size()==i+1,"unexpected zero-search continuation count");
            auto request=requests[i];
            require(request.callback==(i%2?0x40072f7cu:0x40072b98u),"zero-search callback order differs");
            p.run(request.callback,{request.position},0x2000,[&]{trace.observe();});
        }
        require(requests.size()==8 && closed==1,"deferred grid did not complete once");
        checkGrid(p,base,4,before);
        require(trace.countStores==2 && trace.recordStores==12 && trace.zeroBeforeRecords && trace.unmasked,
                "deferred publication ordering differs");
    }
}
void refused(const std::vector<uint8_t>& image) {
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u}) {
        Probe p(image);auto base=p.setup(kind,slot,3);auto before=p.bytes(base,stride);
        p.m.write32((kind?0x46c922c4u:0x46c90a78u)+44*slot+8,1);
        unsigned dialogs=0;
        p.mocks[0x4006d57c]=[&]{++dialogs;return 0u;};
        p.run(0x40073984,{8},0x2000);
        require(!dialogs && p.bytes(base,stride)==before,"busy source opened or changed grid");
    }
}
void redrawOnly(const std::vector<uint8_t>& image) {
    Probe p(image); auto base=p.setup(1,0,3); auto before=p.bytes(base,stride);
    p.run(0x4006dbdc,{},0x2000);
    require(p.m.read32(0x460e5e64)==1 && p.bytes(base,stride)==before,
            "redraw notification changed settings");
}
}
int main(int argc,char** argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try {
        immediate(image);std::puts("PASS: 24 real grid publications retain trim/inactive rows and refresh editor pointers");
        deferred(image);std::puts("PASS: four deferred grids clear count before eight search continuations and final publication");
        refused(image);std::puts("PASS: four busy-source grid dialogs refuse without marker changes");
        redrawOnly(image);std::puts("PASS: editor redraw notification changes no marker settings");
    }catch(const std::exception& e){std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
