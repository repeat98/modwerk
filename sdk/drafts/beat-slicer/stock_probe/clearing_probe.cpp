// SPDX-License-Identifier: MIT
// Original confirmed/cancelled stock slice-deletion fixtures. Synthetic state,
// host admission guard, formatting/display/viewport/task mocks; no device.
#include <array>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iterator>
#include <map>
#include <set>
#include <stdexcept>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
extern "C" {
#include "../preview_guard.h"
}
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
        m.write32(control+8,0); m.write32(control+16,32768);
        auto base=(kind?flex:stat)+stride*slot;
        for(unsigned i=0;i<stride;++i) m.write8(base+i,uint8_t(i*17+3));
        m.write32(base+300,128); m.write32(base+304,32768); m.write32(base+308,128);
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
void checkBindings(Probe& p, uint32_t base, unsigned count) {
    for (unsigned i=0;i<64;++i) {
        auto start=i<count?base+312+12*i:0u;
        require(p.m.read32(0x460e5fe4+14*i)==start,"start binding differs");
        require(p.m.read32(0x460e6372+14*i)==(start?start+4:0),"end binding differs");
        require(p.m.read32(0x460e6700+14*i)==(start?start+8:0),"loop binding differs");
    }
}
void deletion(const std::vector<uint8_t>& image, bool all) {
    unsigned cases=0, writes=0, retiredReads=0;
    for(unsigned kind:{0u,1u}) for(unsigned slot:{0u,127u})
    for(unsigned count:{0u,1u,4u,64u}) {
        if(!all && !count) continue; // Native menu does not offer DELETE SLICE here.
        std::set<unsigned> selections=count?std::set<unsigned>{0u,count/2,count-1}:std::set<unsigned>{0xffffffffu};
        if(all) selections.insert(0xffffffffu);
        for(auto selected:selections) for(unsigned confirmed:{0u,1u}) {
            Probe p(image); auto base=p.setup(kind,slot,count);
            auto before=p.bytes(base,stride),other=p.bytes((kind?stat:flex),stride);
            auto control=(kind?0x46c922c4u:0x46c90a78u)+44*slot;
            auto sourceBefore=p.bytes(control,44);
            p.m.write32(0x400ceb3c,selected);
            p.m.write32(scratch,selected<count?266+400*selected:30000);
            p.run(0x40070cbc,{},0x2000);
            p.mocks[0x4007409c]=[]{return 0u;}; // viewport follow-up
            p.mocks[0x40044920]=[]{return 0u;}; // task dispatch after single deletion
            bs_preview_guard guard{}; bs_preview_token old{}, fresh{};
            bs_guard_init(&guard); require(bs_guard_enable(&guard),"guard enable failed");
            require(bs_guard_acquire(&guard,&old),"initial admission failed");
            unsigned stores=0,countStores=0,refreshes=0,selects=0,nullReads=0;
            bool masked=true;
            p.m.addReadWatch(0,3,[&](uint32_t,uint8_t,uint32_t,uint32_t){++nullReads;});
            p.m.addWriteWatch(base+312,base+1095,[&](uint32_t at,uint8_t,uint32_t,uint32_t){
                ++stores; if(at==base+1092) ++countStores;
                masked &= (p.reg(M68K_REG_SR)&0x700)==0x700;
                require(confirmed && !bs_guard_revision(&guard) && !bs_guard_valid(&guard,&old),
                        "mutation escaped proposed admission lifetime");
            });
            // Proposed instrumentation only: the native entry/exit hooks and
            // serialization boundary are not installed by this host harness.
            auto ticket=confirmed?bs_guard_writer_begin(&guard):0;
            require(!confirmed || ticket,"writer admission failed");
            p.run(all?0x40071eb0:0x40073064,{confirmed},0x2000,[&]{
                if(p.m.pc()==0x40070cbc) ++refreshes;
                if(p.m.pc()==0x400718f8) ++selects;
                if(confirmed) require(!bs_guard_revision(&guard) && !bs_guard_valid(&guard,&old),
                                      "admission reopened before native callback returned");
            });
            auto expected=before;
            if(confirmed) {
                require(bs_guard_writer_end(&guard,ticket),"writer retirement failed");
                require(!bs_guard_valid(&guard,&old) && bs_guard_acquire(&guard,&fresh),"stale/fresh admission differs");
                unsigned after=all?0:count-1;
                for(unsigned byte=0;byte<4;++byte) expected[1092+byte]=uint8_t(after>>(24-8*byte));
                if(!all) {
                    for(unsigned i=selected;i+1<count;++i)
                        for(unsigned byte=0;byte<12;++byte) expected[312+12*i+byte]=before[312+12*(i+1)+byte];
                    for(unsigned byte=0;byte<12;++byte) expected[312+12*(count-1)+byte]=before[312+12*selected+byte];
                    expected[312+12*(count-1)]=0x7f;
                    for(unsigned byte=1;byte<4;++byte) expected[312+12*(count-1)+byte]=0xff;
                }
                require(countStores==1 && stores && masked,"count/record writes not masked as observed");
                require(refreshes==1 && selects==1,"refresh order/count differs");
                checkBindings(p,base,after);
            } else {
                require(!stores && !refreshes && !selects && bs_guard_valid(&guard,&old),"cancel mutated or invalidated source");
                checkBindings(p,base,count);
            }
            require(p.bytes(base,stride)==expected,"complete active/inactive table or attributes differ");
            require(p.bytes((kind?stat:flex),stride)==other && p.bytes(control,44)==sourceBefore,
                    "deletion changed other source/settings/control state");
            retiredReads += nullReads!=0; writes += stores; ++cases;
        }
    }
    require(cases==(all?88u:56u),"deletion matrix incomplete");
    std::printf("PASS: %u %s cases; exact complete settings, cancel isolation and host writer lifetime; %u stores, %u retired-row read cases\n",
                cases,all?"clear-all":"delete-one",writes,retiredReads);
}
}
int main(int argc,char** argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try { deletion(image,true); deletion(image,false); }
    catch(const std::exception& e) { std::fprintf(stderr,"FAIL: %s\n",e.what());return 1; }
    return 0;
}
