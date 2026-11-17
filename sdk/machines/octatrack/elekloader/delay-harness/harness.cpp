// SPDX-License-Identifier: GPL-3.0-or-later
// A/B: the complete stock delay routine (0x400031a0) on the stock image against another image (a built base).
// Same inputs every frame; compares audio blocks, state records, scratch pointers, the bytes each ring gets, and
// the whole rings now and then. usage: harness STOCK.raw OTHER.raw MODULE.bin FRAMES; MODULE.bin is the seam test double (mod.s), put into both
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>
#include "machine.h"
#include "periph.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
static std::vector<uint8_t> rd(const char* p){ std::ifstream f(p,std::ios::binary); return {std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>()}; }
static constexpr uint32_t stack=0x47100000,endpc=0x47200000,LOAD=0x40000400,SITE=0x4000362a,STUB=0x400c45b0,RING=0x4f502c10,STRIDE=1411328,RINGB=1411200;
static uint64_t rs=88172645463325252ull; static uint32_t rnd(){ rs^=rs<<13; rs^=rs>>7; rs^=rs<<17; return uint32_t(rs>>16); }
static unsigned run(ot::Machine& m,uint32_t pc,uint32_t until,unsigned max){
    m68k_set_reg(m.getCpuState(),M68K_REG_PC,pc); unsigned n=0;
    while(m.pc()!=until && n++<max) if(!m.step()) break;
    if(m.pc()!=until){ std::fprintf(stderr,"stopped at %08x after %u\n",m.pc(),n); std::exit(1);} return n; }
static uint64_t g_xfer[2]; static ot::Machine* g_first;
static uint32_t g_clock;   // DTCN3: 47,890 counts a frame
static void dma_model(ot::Machine& m,ot::Edma& dma){
    m.setPeripheralHandlers([&](uint32_t a,uint8_t n,uint32_t& v){ if(a==0xfc07c00c){ v=g_clock; return true; } if(a<ot::Edma::g_base||a>=ot::Edma::g_tcd+512) return false; v=dma.read(a,n); return true; },
        [&](uint32_t a,uint8_t n,uint32_t v){ if(a>=ot::Edma::g_base&&a<ot::Edma::g_tcd+512) dma.write(a,n,v,false); });
    dma.setDataHooks({},[&](uint32_t ch){ ++g_xfer[&m==g_first?0:1]; auto src=dma.tcdField(ch,0,4),dst=dma.tcdField(ch,16,4); auto size=dma.tcdField(ch,8,4)*dma.minorLoops(ch);
        if(size>144){ std::fprintf(stderr,"bad DMA size %u\n",size); std::exit(1);} std::vector<uint8_t> b(size);
        for(unsigned i=0;i<size;++i) b[i]=m.read8(src+i); for(unsigned i=0;i<size;++i) m.write8(dst+i,b[i]); }); }
static void init(ot::Machine& m){ m68k_set_reg(m.getCpuState(),M68K_REG_SR,0x2700); m68k_set_reg(m.getCpuState(),M68K_REG_SP,stack); m.write32(stack,endpc); run(m,0x40002f44,endpc,50000000); }
int main(int argc,char** argv){
    auto image=rd(argv[1]), patched=rd(argv[2]), mod=rd(argv[3]); unsigned frames=std::atoi(argv[4]);
    ot::Machine a(image),b(patched); g_first=&a; ot::Edma da,db; dma_model(a,da); dma_model(b,db); init(a); init(b);
    a.endPeripheralWriteLog(); b.endPeripheralWriteLog();   // the emulator logs every peripheral write until told not to: 2 KB a frame
    if(argc>5){ auto blob=rd(argv[5]); uint32_t at=std::strtoul(argv[6],nullptr,16);   // the base's stubs, assembled from its source; then SITE:ENTRY pairs
        for(unsigned i=0;i<blob.size();++i) b.write8(at+i,blob[i]);
        for(int n=7;n<argc;++n){ uint32_t site=std::strtoul(argv[n],nullptr,16), entry=std::strtoul(std::strchr(argv[n],':')+1,nullptr,16);
            const uint8_t j[6]={0x4e,0xf9,uint8_t(entry>>24),uint8_t(entry>>16),uint8_t(entry>>8),uint8_t(entry)}; for(unsigned i=0;i<6;++i) b.write8(site+i,j[i]); } }
    for(auto* mp:{&a,&b}){ const uint8_t jmp[6]={0x4e,0xf9,0x47,0x30,0,0}; for(unsigned i=0;i<6;++i) mp->write8(0x4000361a+i,jmp[i]); for(unsigned i=0;i<mod.size();++i) mp->write8(0x47300000+i,mod[i]); }
    // per-track plan: the FX2 id and its settings change every `hold` frames
    uint8_t setup[8][8]={}; uint16_t knobs[8][6]={}; uint8_t gate[8]={}; unsigned hold[8]={};
    uint64_t insA=0,insB=0; unsigned warm=std::getenv("NODELAY")?20000:0; unsigned skippedFrames=0, lsb=0;
    const uint32_t tol=std::getenv("TOL")?std::strtoul(std::getenv("TOL"),nullptr,0):0; uint32_t nearMax[4]={}; uint64_t nearCount[4]={};
    for(unsigned f=0;f<frames;++f){
        unsigned slot=f&3,ping=f&1; g_clock=f*47890u+(rnd()%2000);
        for(unsigned t=0;t<8;++t) if(!hold[t]--){
            unsigned r=rnd()%10; bool delay = std::getenv("NODELAY") ? false : t==7 ? true : t==0 ? false : r<3;       // T8 always DELAY, T1 never
            hold[t]= delay ? 500+rnd()%6000 : (rnd()%3 ? 20000+rnd()%20000 : 100+rnd()%9000);
            for(auto& x:setup[t]) x=rnd()%4==0?rnd()%128:0; setup[t][7]=delay?8:(rnd()%2?9:0);
            if(!delay && t>=4 && rnd()%3==0){ setup[t][7]=0x15; hold[t]= rnd()%2 ? 11025*(1+rnd()%3)-1 : 300+rnd()%30000; }   // the seam module, often for whole ring turns
            for(auto& k:knobs[t]) k=(rnd()%128)<<8; gate[t]=rnd()%8==0?7:1;
            if(rnd()%2) knobs[t][5]=0;   // SEND 0, a DELAY's default
            if(rnd()%4==0) setup[t][2]=127;
        }
        uint32_t tempo=(30+(f/8)%271)*24, audio[8][32];
        for(auto& tr:audio) for(auto& x:tr) x= f%7000<3000 ? rnd()<<8 : rnd()%5==0 ? 0 : rnd();   // 24-bit left-justified, then full 32-bit with zeros
        for(auto* mp:{&a,&b}){ auto& m=*mp;
            m.write32(0x800000e0,ping); m.write32(0x80004804,slot); m.write32(0x8000181c,tempo);
            for(unsigned t=0;t<8;++t){
                for(unsigned i=0;i<8;++i) m.write8(0x80001b80+slot*64+t*8+i,setup[t][i]);
                for(unsigned i=0;i<6;++i) m.write16(0x80001a00+slot*96+t*12+2*i,knobs[t][i]);
                m.write8(0x80000eb4+ping*8+t,gate[t]);
                for(unsigned i=0;i<32;++i) m.write32(0x80003190+ping*1024+t*128+4*i,audio[t][i]);
            }
            m68k_set_reg(m.getCpuState(),M68K_REG_SP,stack); m.write32(stack,endpc);
            { unsigned n=run(m,0x400031a0,endpc,250000); if(f>=warm) (mp==&a?insA:insB)+=n; }
        }
        auto fail=[&](const char* what,unsigned t,uint32_t x,uint32_t y){ std::fprintf(stderr,"MISMATCH %s frame %u track %u: stock %08x / skip %08x\n",what,f,t,x,y); std::exit(1); };
        // TOL=n: audio, filter state and ring words may differ by up to n (the floor that counts as silence); the rest stays exact
        auto near=[&](const char* what,unsigned k,unsigned t,uint32_t x,uint32_t y){ if(x==y) return; uint32_t d=uint32_t(std::abs(int64_t(int32_t(y))-int64_t(int32_t(x))));
            if(d>tol) fail(what,t,x,y); ++nearCount[k]; if(d>nearMax[k]) nearMax[k]=d; };
        for(unsigned t=0;t<8;++t){
            for(unsigned i=0;i<32;++i){ auto ad=0x80003190+ping*1024+t*128+4*i; uint32_t x=a.read32(ad),y=b.read32(ad);
                if(x!=y){ if(std::getenv("LSB_OK") && y-x==1 && y==audio[t][i]){ ++lsb; continue; } near("audio",0,t,x,y);} }
            for(unsigned j=0;j<68;j+=4){ auto ad=0x80005f60+t*68+j; if(a.read32(ad)!=b.read32(ad)){ if(j==28||j==32||j==36||j==40) near("filter state",1,t*100+j,a.read32(ad),b.read32(ad)); else fail("state",t*100+j,a.read32(ad),b.read32(ad)); } }
            uint32_t pos=(a.read32(0x80005f9c+t*68)+RINGB-128)%RINGB;      // where this frame's 128 bytes went
            for(unsigned i=0;i<32;++i){ auto ad=RING+t*STRIDE+pos+4*i; near("ring write",2,t,a.read32(ad),b.read32(ad)); }
        }
        for(uint32_t ad:{0x800000e8u,0x80006180u,0x80004804u}) if(a.read32(ad)!=b.read32(ad)) fail("pointer",ad&0xffff,a.read32(ad),b.read32(ad));
        if(f%20000==19999||f+1==frames) for(unsigned t=0;t<8;++t) for(uint32_t o=0;o<RINGB;o+=4){ auto ad=RING+t*STRIDE+o; near("whole ring",3,t,a.read32(ad),b.read32(ad)); }
    }
    std::printf("PASS %u frames: audio, state records, scratch pointers and rings equal%s\n",frames,tol?" (audio, filter state and rings within TOL)":lsb?" (audio within the allowed 1 LSB)":"");
    std::printf("instructions per frame: stock %.0f, with the skip %.0f (%.1f %% fewer over this mix of tracks)\n",double(insA)/(frames-warm),double(insB)/(frames-warm),100.0*(double(insA)-double(insB))/double(insA));
    std::printf("eDMA transfers per frame: stock %.1f, with the skip %.1f\n",double(g_xfer[0])/frames,double(g_xfer[1])/frames);
    if(lsb) std::printf("1-LSB audio differences: %u\n",lsb);
    if(tol){ const char* names[4]={"audio","filter state","ring write","whole ring"};
        for(unsigned k=0;k<4;++k) std::printf("%s: %llu words differ, largest %u (%.1f dBFS)\n",names[k],(unsigned long long)nearCount[k],nearMax[k],nearMax[k]?20*std::log10(nearMax[k]/2147483648.0):-999.0); }
}
