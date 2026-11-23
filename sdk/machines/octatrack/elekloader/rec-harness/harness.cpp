// SPDX-License-Identifier: GPL-3.0-or-later
// A/B: stock's recorder control-record update (0x4000432c) against the base's mw_rec_update (status.s), each on its
// own emulated machine, on the same random calls: ids 0-9, every kind of length, the flag, other writers storing into
// all six CS1 fields and the 44-byte records between calls, the two tempo words moving, and runs of repeated calls as
// in steady recording. After every call: every register, the CS1 records of ids 0-9, the 44-byte records and the
// stack must equal stock's, and SR but for its condition codes (no C caller reads them after a call). Prints the CS1 writes and reads a call of each.
// usage: harness MAIN.raw STATUS.bin LOAD ENTRY CALLS
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
static std::vector<uint8_t> rd(const char* p){ std::ifstream f(p,std::ios::binary); return {std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>()}; }
static constexpr uint32_t stack=0x47100000, endpc=0x47200000, SITE=0x4000432c, CS1=0x100d38f0, REC=0x46c938c4, IDS=10;
static uint64_t rs=88172645463325252ull; static uint32_t rnd(){ rs^=rs<<13; rs^=rs>>7; rs^=rs<<17; return uint32_t(rs>>16); }
static uint64_t writes[2], reads[2]; static bool counting;
int main(int argc,char** argv){
    if(argc<6){ std::fprintf(stderr,"usage: harness MAIN.raw STATUS.bin LOAD ENTRY CALLS\n"); return 2; }
    auto image=rd(argv[1]), blob=rd(argv[2]); uint32_t load=std::strtoul(argv[3],nullptr,16), entry=std::strtoul(argv[4],nullptr,16);
    unsigned calls=std::atoi(argv[5]);
    ot::Machine a(image), b(image); ot::Machine* m[2]={&a,&b};
    for(unsigned i=0;i<blob.size();++i) b.write8(load+i,blob[i]);
    const uint8_t j[8]={0x4e,0xf9,uint8_t(entry>>24),uint8_t(entry>>16),uint8_t(entry>>8),uint8_t(entry),0x4e,0x71};
    for(unsigned i=0;i<8;++i) b.write8(SITE+i,j[i]);
    for(int k=0;k<2;++k){ m[k]->endPeripheralWriteLog();
        for(uint32_t at=CS1; at<CS1+1096*IDS; ++at) m[k]->write8(at,0);   // CS1 as plain memory, as the unit's runs found it
        m[k]->addWriteWatch(CS1,CS1+1096*IDS,[k](uint32_t,uint8_t,uint32_t,uint32_t){ if(counting) ++writes[k]; });
        m[k]->addReadWatch(CS1,CS1+1096*IDS,[k](uint32_t,uint8_t,uint32_t,uint32_t){ if(counting) ++reads[k]; }); }
    static const unsigned fields[]={276,280,296,300,304,308};
    uint32_t id=0, len=0, flag=0, t0=0, t1=0;
    for(unsigned c=0;c<calls;++c){
        if(rnd()%4==0){   // a new call; otherwise the same one again, as a recording track's every frame
            id = rnd()%8 ? rnd()%8 : rnd()%IDS;
            switch(rnd()%6){ case 0: len=0; break; case 1: len=1+rnd()%63; break; case 2: len=uint32_t(-int32_t(1+rnd()%5000)); break;
                case 3: len=64+rnd()%64; break; default: len=rnd()%2 ? 64+rnd()%(1<<22) : rnd(); }
            flag = rnd()%10==0 ? (rnd()%2 ? 1 : rnd()) : 0; }
        if(rnd()%50==0){ t0=rnd(); t1=rnd(); }
        if(rnd()%20==0){ uint32_t who=rnd()%IDS, f=fields[rnd()%6], v=rnd()%3 ? rnd()%(1<<20) : rnd();   // another writer
            for(auto* x:m){ if(f==296) x->write8(CS1+1096*who+f,v); else x->write32(CS1+1096*who+f,v); } }
        if(rnd()%100==0){ uint32_t who=rnd()%IDS, v=rnd(); for(auto* x:m) x->write32(REC+44*who+16,v); }
        uint32_t regs[16]; for(auto& r:regs) r=rnd(); uint32_t sr = rnd()%3 ? 0x2700 : 0x2000|(rnd()%7)<<8|(rnd()&0x1f);
        for(auto* x:m){ auto& z=*x; z.write32(0x8000181c,t0); z.write32(0x80001820,t1);
            for(int r=0;r<15;++r) m68k_set_reg(z.getCpuState(),m68k_register_t(M68K_REG_D0+r),regs[r]);
            m68k_set_reg(z.getCpuState(),M68K_REG_SR,sr);
            m68k_set_reg(z.getCpuState(),M68K_REG_SP,stack-16); z.write32(stack-16,endpc); z.write32(stack-12,id); z.write32(stack-8,len); z.write32(stack-4,flag);
            m68k_set_reg(z.getCpuState(),M68K_REG_PC,SITE); unsigned n=0; counting=true;
            while(z.pc()!=endpc && n++<10000) if(!z.step()) break;
            counting=false;
            if(z.pc()!=endpc){ std::fprintf(stderr,"call %u: stopped at %08x\n",c,z.pc()); return 1; } }
        auto fail=[&](const char* what,uint32_t at,uint32_t x,uint32_t y){ std::fprintf(stderr,"MISMATCH call %u (id %u len %08x flag %u) %s %08x: stock %08x / base %08x\n",c,id,len,flag,what,at,x,y); std::exit(1); };
        for(int r=0;r<16;++r){ uint32_t x=m68k_get_reg(a.getCpuState(),m68k_register_t(M68K_REG_D0+r)), y=m68k_get_reg(b.getCpuState(),m68k_register_t(M68K_REG_D0+r)); if(r==0){ x&=~0x1fu; y&=~0x1fu; } if(x!=y) fail("register",r,x,y); }   // d0 ends holding SR, with its condition codes
        { uint32_t x=m68k_get_reg(a.getCpuState(),M68K_REG_SR)&0xff00, y=m68k_get_reg(b.getCpuState(),M68K_REG_SR)&0xff00; if(x!=y) fail("SR",0,x,y); }   // the condition codes are no caller's
        for(uint32_t at=CS1; at<CS1+1096*IDS; at+=4) if(a.read32(at)!=b.read32(at)) fail("CS1",at,a.read32(at),b.read32(at));
        for(uint32_t at=REC; at<REC+44*IDS; ++at) if(a.read8(at)!=b.read8(at)) fail("record",at,a.read8(at),b.read8(at));
        for(uint32_t at=stack-16; at<stack; at+=4) if(a.read32(at)!=b.read32(at)) fail("arguments",at,a.read32(at),b.read32(at));
    }
    std::printf("PASS %u calls: CS1 writes a call stock %.3f, base %.3f; reads %.3f / %.3f\n",calls,
        double(writes[0])/calls,double(writes[1])/calls,double(reads[0])/calls,double(reads[1])/calls);
    return 0;
}
