// SPDX-License-Identifier: MIT
// Compare actual stock selection ABI with private resident wrappers. Closed
// popup only: this isolates argument/return/register/SR semantics, not UI lifetime.
#include <array>
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
static std::vector<uint8_t> read(const char *path) {
    std::ifstream file(path,std::ios::binary);
    return {std::istreambuf_iterator<char>(file),{}};
}
struct Outcome {
    std::array<uint32_t,17> registers{};
    std::array<uint32_t,6> caller{};
    uint32_t selected=0;
    bool operator==(const Outcome &other)const {
        return registers==other.registers && caller==other.caller && selected==other.selected;
    }
};
int main(int argc,char **argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=5)return 2;
    try {
        auto stock=read(argv[1]),binary=read(argv[2]),callback=read(argv[4]);
        if(stock.size()!=1112560 || binary.empty() || binary.size()>49152 || callback.empty() || callback.size()>256)
            throw std::runtime_error("invalid private input sizes");
        std::ifstream names(argv[3]);std::map<std::string,uint32_t> symbols;
        std::string line,address,kind,name;
        while(std::getline(names,line)){
            std::istringstream row(line);
            if(row>>address>>kind>>name)symbols[name]=uint32_t(std::stoul(address,nullptr,16));
        }
        constexpr uint32_t base=0x46019df0,code=0x47040000,table=0x47050000,selected=0x47050040;
        constexpr uint32_t stack=0x47100000,stop=0x47200000,entry=0x4006d8f4,tail=0x4006d91c;
        auto execute=[&](bool wrapped,uint32_t sr,uint32_t row,bool selection,bool action,bool nested){
            ot::Machine m(stock);
            for(unsigned i=0;i<binary.size();++i)m.write8(base+i,binary[i]);
            for(unsigned i=0;i<callback.size();++i)m.write8(code+i,callback[i]);
            auto get=[&](m68k_register_t r){return m68k_get_reg(m.getCpuState(),r);};
            auto set=[&](m68k_register_t r,uint32_t v){m68k_set_reg(m.getCpuState(),r,v);};
            if(wrapped){
                m.write16(entry,0x4ef9);m.write32(entry+2,symbols.at("bs_selection_entry"));
                m.write16(tail,0x4ef9);m.write32(tail+2,symbols.at("bs_selection_tail"));
            }
            m.write32(0x460e5e30,0);m.write32(0x460e5e34,selection?selected:0);
            m.write32(0x460e5e28,table);m.write32(0x460e5e40,row);m.write32(0x800068fc,0x460d59d4);
            for(unsigned i=0;i<3;++i)m.write32(table+4*i,action?code:0);
            m.write32(selected,0xabcdef01);
            for(unsigned i=0;i<6;++i)m.write32(stack+4*i,0xface0000+i);
            m.write32(stack,stop);set(M68K_REG_SR,sr);set(M68K_REG_SP,stack);
            for(unsigned r=M68K_REG_D0;r<=M68K_REG_A6;++r)set(m68k_register_t(r),0x12340000+r);
            if(nested)m.write32(symbols.at("bs_selection_active"),1);
            set(M68K_REG_PC,entry);uint32_t steps=0,seenEntry=0,seenTail=0,seenPost=0;
            while(m.pc()!=stop && ++steps<1000000){
                if(m.pc()==symbols.at("bs_selection_entry"))++seenEntry;
                if(m.pc()==symbols.at("bs_selection_tail"))++seenTail;
                if(m.pc()==symbols.at("bs_selection_return"))++seenPost;
                if(!m.step())throw std::runtime_error("CPU stop: "+m.why());
            }
            if(m.pc()!=stop || get(M68K_REG_SP)!=stack+4)throw std::runtime_error("return/stack failure");
            Outcome out;unsigned at=0;
            for(unsigned r=M68K_REG_D0;r<=M68K_REG_A6;++r)out.registers[at++]=get(m68k_register_t(r));
            out.registers[at++]=get(M68K_REG_SP);out.registers[at++]=get(M68K_REG_SR);
            for(unsigned i=0;i<6;++i)out.caller[i]=m.read32(stack+4*i);
            out.selected=m.read32(selected);
            if(nested){
                if(seenEntry!=1 || seenTail || seenPost || get(M68K_REG_D0) ||
                   m.read32(symbols.at("bs_selection_nested"))!=1 ||
                   m.read32(symbols.at("bs_selection_active"))!=1 ||
                   m.read32(stack+4)!=0xface0001 || out.selected!=0xabcdef01)
                    throw std::runtime_error("nested refusal touched stock/outer frame");
                for(unsigned r=M68K_REG_D1;r<=M68K_REG_A6;++r)
                    if(get(m68k_register_t(r))!=0x12340000+r)throw std::runtime_error("nested refusal register mismatch");
                if(get(M68K_REG_SR)!=((sr&0xfff0)|4))throw std::runtime_error("nested refusal SR mismatch");
            }else{
                if(out.caller[0]!=stop || out.caller[1]!=(action?code:0) ||
                   out.selected!=(selection?row:0xabcdef01) || get(M68K_REG_D0)!=(action?1u:0u))
                    throw std::runtime_error("stock side effect positive control differs");
                for(unsigned i=2;i<6;++i)if(out.caller[i]!=0xface0000+i)throw std::runtime_error("caller argument clobber");
                if(action && (get(M68K_REG_D7)!=0x76540007 || get(M68K_REG_A6)!=0x7654000e || !(get(M68K_REG_SR)&16)))
                    throw std::runtime_error("callback clobber positive control failed");
                if(wrapped && (seenEntry!=1 || seenTail!=1 || seenPost!=1 ||
                   m.read32(symbols.at("bs_selection_entries"))!=1 || m.read32(symbols.at("bs_selection_exits"))!=1 ||
                   m.read32(symbols.at("bs_selection_active")) || m.read32(symbols.at("bs_selection_faults"))))
                    throw std::runtime_error("wrapper execution counters differ");
            }
            return out;
        };
        unsigned cases=0;
        for(uint32_t sr:{0x2000u,0x201fu,0x2504u,0x2700u})for(uint32_t row:{0u,1u,2u})
        for(bool selection:{false,true})for(bool action:{false,true}){
            auto original=execute(false,sr,row,selection,action,false);
            auto wrapped=execute(true,sr,row,selection,action,false);
            if(!(original==wrapped))throw std::runtime_error("stock/wrapped ABI differs");
            ++cases;
        }
        for(uint32_t sr:{0x2000u,0x201fu,0x2504u,0x2700u})execute(true,sr,1,true,true,true);
        std::printf("PASS: %u paired stock/wrapped cases preserve D0-D7/A0-A6, SP, SR, return slot and caller-visible argument/selection writes; four nested refusals preserve outer state\n",cases);
        return 0;
    }catch(const std::exception &e){std::printf("FAIL: %s\n",e.what());return 1;}
}
