// SPDX-License-Identifier: MIT
// Paired whole-routine stock/compiled-recorder calls with synthetic input and
// allocation. No scheduler, actual ISR, live source admission or device claim.
#define main bs_historical_recorder_native_main
#include "recorder_probe.cpp"
#undef main
#include <map>
#include <sstream>
namespace {
constexpr uint32_t nativeBase=0x47040000;
using Write=std::array<uint32_t,4>; // address, bytes, value, actual store PC
struct Outcome {
    std::array<uint32_t,17> registers{};
    std::array<uint32_t,24> caller{};
    std::array<std::array<uint32_t,17>,2> continuation{};
    std::vector<Write> writes;
    unsigned instructions=0, masked=0, stackBytes=0;
};
std::vector<uint8_t> readFile(const char *path) {
    std::ifstream in(path,std::ios::binary);return {std::istreambuf_iterator<char>(in),{}};
}
Outcome execute(const std::vector<uint8_t>& image,const std::vector<uint8_t>& binary,
                const std::map<std::string,uint32_t>& symbols,bool wrapped,unsigned track,
                unsigned format,unsigned bank,unsigned mode,uint32_t sr,bool fault,bool preparation=false) {
    Probe p(image);auto &m=p.m;
    const uint32_t entry=preparation?0x40005ff0u:0x400068e4u,leave=preparation?0x4000670au:0x40007954u;
    const char *enterSymbol=preparation?"bs_recorder_prepare_enter_entry":"bs_recorder_enter_entry";
    const char *leaveSymbol=preparation?"bs_recorder_prepare_leave_entry":"bs_recorder_leave_entry";
    const char *entriesSymbol=preparation?"bs_recorder_prepare_entries":"bs_recorder_test_entries";
    const char *exitsSymbol=preparation?"bs_recorder_prepare_exits":"bs_recorder_test_exits";
    const char *enterMasks=preparation?"bs_recorder_prepare_enter_masks":"bs_recorder_test_enter_masks";
    const char *leaveMasks=preparation?"bs_recorder_prepare_leave_masks":"bs_recorder_test_leave_masks";
    const auto end=symbols.at("_end"),g=symbols.at("bs_recorder_test_guard"),b=symbols.at("bs_recorder_test_boundary");
    require(end>nativeBase && end-nativeBase<65536 && binary.size()<=end-nativeBase,"native extent differs");
    for(uint32_t a=nativeBase-32;a<end+32;++a)m.write8(a,a<nativeBase||a>=end?0xa5:0);
    for(unsigned i=0;i<binary.size();++i)m.write8(nativeBase+i,binary[i]);
    for(uint32_t a=stack-4096;a<stack+128;++a)m.write8(a,0xa5);
    if(wrapped) {
        p.reg(M68K_REG_SR,0x2000);p.reg(M68K_REG_SP,stack);m.write32(stack,stop);
        p.reg(M68K_REG_PC,symbols.at("bs_recorder_test_init"));unsigned n=0;
        while(m.pc()!=stop && ++n<1000000)require(m.step(),"native init CPU stopped");
        require(m.pc()==stop && !p.reg(M68K_REG_D0),"compiled boundary selftest/init failed");
        auto patch=[&](uint32_t address,const char *symbol){m.write16(address,0x4ef9);m.write32(address+2,symbols.at(symbol));m.write16(address+6,0x4e71);};
        patch(0x400068e4,"bs_recorder_enter_entry");patch(0x40007954,"bs_recorder_leave_entry");
        if(symbols.count("bs_recorder_prepare_enter_entry")) {
            patch(0x40005ff0,"bs_recorder_prepare_enter_entry");patch(0x4000670a,"bs_recorder_prepare_leave_entry");
        }
        if(fault)m.write32(b+8,1); // terminal observer fault must not alter stock behavior
    }
    p.setup(track,format,bank,!preparation && (mode==6||mode==7||mode==8));
    auto setupTicket=bs_guard_writer_begin(&p.guard);require(setupTicket,"host setup guard refused");
    const auto selected=p.state(track),other=0x80004f1c+84*track+672*(1-bank);
    if(preparation) {
        m.write8(selected+2,mode==1?2:0);m.write32(selected+24,mode==1?97:0);
        m.write8(other+2,0);m.write32(other+24,0);
    } else if(mode<6) {
        m.write8(selected+2,mode>=4?2:0);m.write32(selected+24,mode>=4?p.edge-4:0);
        m.write8(other+2,mode==1?2:mode>=2?1:0);m.write32(other+16,mode==3||mode==4?16:mode==5?4:0);
        m.write32(other+24,mode==1?97:0);m.write32(other+32,3*p.edge);
        m.write16(pageList+20,5);m.write16(pageList+2*(14602+10),5);
    }
    if(!preparation && mode>=10) {
        m.write8(selected+2,mode==13?2:1);
        m.write8(other+2,mode==13?2:mode-10);
        m.write32(other+24,97);m.write32(other+32,3*p.edge);
    }
    if(mode==7)m.write32(0x80006920,10);
    if(mode==8)m.write8(0x80000052,0);
    require(bs_guard_writer_end(&p.guard,setupTicket),"host setup retirement failed");
    for(unsigned i=0;i<24;++i)m.write32(stack+4*i,0xface0000+i);
    m.write32(stack,stop);m.write32(stack+4,track);m.write32(stack+8,preparation?(mode==0?0x9010:mode==1?0x1010:0):0);m.write32(stack+12,0);m.write32(stack+16,preparation?UINT32_MAX:mode==9?0:8);
    p.reg(M68K_REG_SR,sr);p.reg(M68K_REG_SP,stack);
    for(unsigned r=M68K_REG_D0;r<=M68K_REG_A6;++r)p.reg(m68k_register_t(r),0x12340000+r);
    p.reg(M68K_REG_PC,entry);
    Outcome out;
    const auto hostTicket=bs_guard_writer_begin(&p.guard);require(hostTicket,"host positive-control guard refused");
    const bool writer=preparation || mode>=2;
    auto active=[&](){for(unsigned i=0;i<BS_GUARD_WRITERS;++i)if(m.read32(g+16+4*i))return true;return false;};
    m.addWriteWatch(0,UINT32_MAX,[&](uint32_t address,uint8_t bytes,uint32_t value,uint32_t pc){
        if(address>=nativeBase-32 && address<end+32)return;
        if(address>=stack-4096 && address<stack)return;
        out.writes.push_back({address,bytes,value,pc});
        if(wrapped) {
            if(fault)require(!m.read32(g+8),"faulted observer left admission enabled");
            else if (!writer) {
                // Inactive stock calls clear these two per-track voice flags.
                // Keep both in the paired write oracle; they are not PCM,
                // allocation, sample metadata or recorder-bank mutations.
                const uint32_t voice=0x800049d8+168*track;
                require(bytes==1 && value==0 && ((address==voice+1 && pc==0x40006b80) ||
                        (address==voice+2 && pc==0x40006b8e)) && !active(),"unexpected unguarded idle store");
            } else if (!(active() && m.read32(b+4)==1 && !m.read32(b+8))) {
                std::fprintf(stderr,"uncovered address=%08x bytes=%u value=%08x pc=%08x mode=%u depth=%u fault=%u active=%u\n",address,bytes,value,pc,mode,m.read32(b+4),m.read32(b+8),active());
                throw std::runtime_error("stock external store escaped native writer scope");
            }
        }
    });
    unsigned masked=0,seenEnter=0,seenLeave=0,continuations=0;
    while(m.pc()!=stop && ++out.instructions<200000) {
        if(p.reg(M68K_REG_SP)<stack)out.stackBytes=std::max(out.stackBytes,stack-p.reg(M68K_REG_SP));
        if(m.pc()==entry+8 || m.pc()==leave+8) {
            unsigned which=m.pc()==entry+8?0:1,at=0;
            require(!(continuations&(1u<<which)),"repeated continuation");continuations|=1u<<which;
            for(unsigned r=M68K_REG_D0;r<=M68K_REG_A6;++r)out.continuation[which][at++]=p.reg(m68k_register_t(r));
            out.continuation[which][at++]=p.reg(M68K_REG_SP);out.continuation[which][at++]=p.reg(M68K_REG_SR);
        }
        if(m.pc()==symbols.at(enterSymbol))++seenEnter;
        if(m.pc()==symbols.at(leaveSymbol))++seenLeave;
        if(m.pc()>=nativeBase && m.pc()<end && (p.reg(M68K_REG_SR)&0x700)==0x700)
            out.masked=std::max(out.masked,++masked);
        else masked=0;
        require(m.step(),"stock/observer CPU stopped");
    }
    require(continuations==3 && m.pc()==stop && p.reg(M68K_REG_SP)==stack+4,"return/stack budget differs");
    require(bs_guard_writer_end(&p.guard,hostTicket),"host positive-control retirement failed");
    unsigned at=0;
    for(unsigned r=M68K_REG_D0;r<=M68K_REG_A6;++r)out.registers[at++]=p.reg(m68k_register_t(r));
    out.registers[at++]=p.reg(M68K_REG_SP);out.registers[at++]=p.reg(M68K_REG_SR);
    for(unsigned i=0;i<24;++i)out.caller[i]=m.read32(stack+4*i);
    for(unsigned i=0;i<32;++i)require(m.read8(nativeBase-32+i)==0xa5 && m.read8(end+i)==0xa5 &&
                                    m.read8(stack-4096+i)==0xa5,"private/stack reservation canary changed");
    if(wrapped) {
        require(seenEnter==1 && seenLeave==1 && m.read32(symbols.at(entriesSymbol))==1 &&
                m.read32(symbols.at(exitsSymbol))==1,"entry/return coverage differs");
        require(m.read32(symbols.at(enterMasks))==(1u<<((sr>>8)&7)) &&
                m.read32(symbols.at(leaveMasks))==(1u<<((sr>>8)&7)),"saved caller SR mask observation differs");
        require(!active() && !m.read32(b+4),"observer leaked writer/depth");
        if(fault)require(m.read32(b+8) && !m.read32(g+8),"fault did not stay closed");
        else require(!m.read32(b+8) && m.read32(g+8) && m.read32(g)==(writer?3u:2u),"classification/revision differs");
    }
    if(preparation) {
        require(!p.pcmWrites && !p.mapWrites,"preparation changed PCM or page maps directly");
        if(mode<2) {
            require(p.reg(M68K_REG_D0)==UINT32_MAX && m.read8(other+2)==1 &&
                    m.read8(selected+2)==(mode==1?2:0) && m.read32(other+24)==0,
                    "normal start/retrigger pending state differs");
            require(m.read32(0x460d17ce + 4)==1 && m.read32(scratch+0x2000)==0x46104d52+8*track &&
                    m.read8(0x46104d52+8*track)==34 && m.read16(0x46104d54+8*track)==track &&
                    m.read32(0x46104d56+8*track)==1,"preparation cleanup record/queue differs");
        }
    }
    return out;
}
}
int main(int argc,char **argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=4)return 2;
    try {
        auto image=readFile(argv[1]),binary=readFile(argv[2]);require(image.size()==1112560,"private MAIN size differs");
        std::ifstream names(argv[3]);std::map<std::string,uint32_t> symbols;
        std::string line,address,type,name;
        while(std::getline(names,line)){std::istringstream row(line);if(row>>address>>type>>name)symbols[name]=uint32_t(std::stoul(address,nullptr,16));}
        unsigned cases=0,maxMasked=0,maxExtra=0,idleExtra=0,originalStack=0,wrappedStack=0;
        for(unsigned track:{0u,7u})for(unsigned format:{1u,3u})for(unsigned bank:{0u,1u})
        for(unsigned mode=0;mode<14;++mode)for(uint32_t sr:{0x2000u,0x201fu,0x2504u,0x2700u})for(bool fault:{false,true}) {
            auto original=execute(image,binary,symbols,false,track,format,bank,mode,sr,fault);
            auto wrapped=execute(image,binary,symbols,true,track,format,bank,mode,sr,fault);
            if(original.registers!=wrapped.registers || original.continuation!=wrapped.continuation || original.caller!=wrapped.caller || original.writes!=wrapped.writes) {
                std::fprintf(stderr,"mismatch track=%u format=%u bank=%u mode=%u sr=%x fault=%u writes=%zu/%zu\n",track,format,bank,mode,sr,fault,original.writes.size(),wrapped.writes.size());
                for(unsigned i=0;i<17;++i)if(original.registers[i]!=wrapped.registers[i])std::fprintf(stderr,"reg%u %08x/%08x\n",i,original.registers[i],wrapped.registers[i]);
                throw std::runtime_error("paired stock/guarded behavior differs");
            }
            require(wrapped.instructions>original.instructions,"observer instruction control failed");
            maxExtra=std::max(maxExtra,wrapped.instructions-original.instructions);
            originalStack=std::max(originalStack,original.stackBytes);wrappedStack=std::max(wrappedStack,wrapped.stackBytes);
            if(mode<2 && !fault)idleExtra=std::max(idleExtra,wrapped.instructions-original.instructions);
            if(sr!=0x2700)maxMasked=std::max(maxMasked,wrapped.masked);
            ++cases;
        }
        unsigned preparationCases=0,preparationExtra=0,preparationMasked=0,preparationStockStack=0,preparationWrappedStack=0;
        if(symbols.count("bs_recorder_prepare_enter_entry")) {
            for(unsigned track:{0u,7u})for(unsigned format:{1u,3u})for(unsigned bank:{0u,1u})
            for(unsigned mode=0;mode<3;++mode)for(uint32_t sr:{0x2000u,0x201fu,0x2504u,0x2700u})for(bool fault:{false,true}) {
                auto original=execute(image,binary,symbols,false,track,format,bank,mode,sr,fault,true);
                auto wrapped=execute(image,binary,symbols,true,track,format,bank,mode,sr,fault,true);
                require(original.registers==wrapped.registers && original.continuation==wrapped.continuation &&
                        original.caller==wrapped.caller && original.writes==wrapped.writes,"paired preparation ABI/stores differ");
                require(wrapped.instructions>original.instructions,"preparation instruction control failed");
                preparationExtra=std::max(preparationExtra,wrapped.instructions-original.instructions);
                if(sr!=0x2700)preparationMasked=std::max(preparationMasked,wrapped.masked);
                preparationStockStack=std::max(preparationStockStack,original.stackBytes);
                preparationWrappedStack=std::max(preparationWrappedStack,wrapped.stackBytes);++preparationCases;
            }
            std::printf("PASS: %u paired normal-start/retrigger/no-command preparation calls; whole-call ticket, two continuation/return register-SR states, caller arguments, complete external stores and pending/queue controls match, including observer faults\n",preparationCases);
            std::printf("OBSERVED preparation: maximum added %u instructions, masked run %u, peak stock/guarded stack %u/%u bytes; synthetic calls only, not physical timing\n",preparationExtra,preparationMasked,preparationStockStack,preparationWrappedStack);
        }
        std::printf("PASS: %u paired original/compiled-recorder calls; D0-D7/A0-A6/SP/SR at both continuations and return, caller arguments and every external store match, including terminal-fault cleanup\n",cases);
        std::printf("PASS: all observed source writes hold native guard tickets; two exact idle voice-flag clears remain in the paired oracle; inactive/retained calls avoid invalidation; entry/return and private/stack canaries pass\n");
        std::printf("OBSERVED: maximum added %u instructions, idle added %u, observer-only masked run %u instructions; not cycles, physical latency or ISR qualification\n",maxExtra,idleExtra,maxMasked);
        std::printf("OBSERVED: peak stack below original caller SP: stock %u bytes, guarded %u bytes; only these isolated calls, not complete ISR/task stack qualification\n",originalStack,wrappedStack);
    }catch(const std::exception&e){std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
