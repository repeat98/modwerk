// SPDX-License-Identifier: MIT
// Exact executed-instruction accounting for an original synthetic provider.
// No stock image, tasks, cache cost, physical duration or audible qualification.
#include <algorithm>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(int argc,char **argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=3)return 2;
    try {
        std::ifstream in(argv[1],std::ios::binary),names(argv[2]);
        std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(in),{}};
        std::map<std::string,uint32_t> symbols;
        std::string line,address,kind,name;
        while(std::getline(names,line)){
            std::istringstream row(line);
            if(row>>address>>kind>>name)symbols[name]=uint32_t(std::stoul(address,nullptr,16));
        }
        constexpr uint32_t base=0x47040000,stack=0x47100000,stop=0x47200000;
        if(bytes.empty() || bytes.size()>0x10000)throw std::runtime_error("invalid code extent");
        for(uint32_t frames:{44100u,1323000u})for(uint32_t snap:{0u,1u})
        for(uint32_t beats:{1u,64u})for(uint32_t tempo:{0u,1u}){
            ot::Machine m{std::vector<uint8_t>(4)};
            for(unsigned i=0;i<bytes.size();++i)m.write8(base+i,bytes[i]);
            auto get=[&](m68k_register_t r){return m68k_get_reg(m.getCpuState(),r);};
            auto set=[&](m68k_register_t r,uint32_t v){m68k_set_reg(m.getCpuState(),r,v);};
            set(M68K_REG_SR,0x2700);set(M68K_REG_SP,stack);m.write32(stack,stop);
            for(unsigned r=M68K_REG_D2;r<=M68K_REG_A6;++r)
                if(r!=M68K_REG_A0 && r!=M68K_REG_A1)set(m68k_register_t(r),0x12340000+r);
            uint32_t input=symbols.at("bs_cost_input");
            m.write32(input,frames);m.write32(input+4,snap);m.write32(input+8,beats);m.write32(input+12,tempo);
            set(M68K_REG_PC,symbols.at("bs_cost_run"));
            uint64_t steps=0,serviceStart=0,serviceTotal=0,serviceMax=0,serviceCount=0;
            uint64_t lockStart=0,lockTotal=0,lockMax=0,lockCount=0,plannerLocked=0,plannerUnlocked=0;
            uint32_t serviceReturn=0,lockReturn=0;bool held=false;
            while(m.pc()!=stop && steps<2000000000ull){
                const auto pc=m.pc();
                if(pc==symbols.at("bs_async_service")){
                    if(serviceReturn)throw std::runtime_error("nested service");
                    serviceReturn=m.read32(get(M68K_REG_SP));serviceStart=steps;++serviceCount;
                }else if(serviceReturn && pc==serviceReturn){
                    const auto elapsed=steps-serviceStart;serviceTotal+=elapsed;serviceMax=std::max(serviceMax,elapsed);serviceReturn=0;
                }
                if(pc==symbols.at("bs_cost_lock")){
                    if(held || lockReturn)throw std::runtime_error("recursive lock");
                    lockReturn=m.read32(get(M68K_REG_SP));
                }else if(lockReturn && pc==lockReturn){
                    held=get(M68K_REG_D0)==1;lockReturn=0;lockStart=steps;if(held)++lockCount;
                }
                if(pc==symbols.at("bs_cost_unlock")){
                    if(!held)throw std::runtime_error("unbalanced unlock");
                    const auto elapsed=steps-lockStart;lockTotal+=elapsed;lockMax=std::max(lockMax,elapsed);held=false;
                }
                if(pc==symbols.at("bs_reader_begin") || pc==symbols.at("bs_reader_step") || pc==symbols.at("bs_reader_supply")){
                    if(held)++plannerLocked;else ++plannerUnlocked;
                }
                if(!m.step())throw std::runtime_error("CPU stop: "+m.why());
                ++steps;
            }
            if(m.pc()!=stop || get(M68K_REG_SP)!=stack+4 || serviceReturn || lockReturn || held)
                throw std::runtime_error("CPU budget, stack or ownership differs");
            for(unsigned r=M68K_REG_D2;r<=M68K_REG_A6;++r)
                if(r!=M68K_REG_A0 && r!=M68K_REG_A1 && get(m68k_register_t(r))!=0x12340000+r)
                    throw std::runtime_error("preserved register mismatch");
            if(get(M68K_REG_D0))throw std::runtime_error("selftest line "+std::to_string(get(M68K_REG_D0)));
            uint32_t output=symbols.at("bs_cost_output");
            if(serviceCount!=m.read32(output) || lockCount!=m.read32(output+20) || plannerLocked || !plannerUnlocked)
                throw std::runtime_error("counter positive control or planner ownership differs");
            std::printf("CASE {\"frames\":%u,\"snap\":%u,\"beats\":%u,\"tempoSource\":%u,\"serviceCalls\":%llu,\"serviceInstructions\":%llu,\"maxServiceInstructions\":%llu,\"lockSections\":%llu,\"lockedInstructions\":%llu,\"maxLockedInstructions\":%llu,\"explicitSteps\":%u,\"begins\":%u,\"captures\":%u,\"copies\":%u,\"markers\":%u,\"privateReaderCalls\":%llu,\"plannerCallsLocked\":%llu}\n",
                frames,snap,beats,tempo,(unsigned long long)serviceCount,(unsigned long long)serviceTotal,
                (unsigned long long)serviceMax,(unsigned long long)lockCount,(unsigned long long)lockTotal,
                (unsigned long long)lockMax,m.read32(output+4),m.read32(output+8),m.read32(output+12),
                m.read32(output+16),m.read32(output+24),(unsigned long long)plannerUnlocked,(unsigned long long)plannerLocked);
        }
        std::puts("PASS: 16 synthetic cost cases, complete plan equality, lock/service positive controls and preserved registers");
        return 0;
    }catch(const std::exception& e){std::printf("FAIL: %s\n",e.what());return 1;}
}
