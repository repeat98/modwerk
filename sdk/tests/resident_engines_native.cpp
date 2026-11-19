// SPDX-License-Identifier: GPL-3.0-or-later
// Run the private receiver's on-demand engine ops (PLACE, CAS) and the stubs
// they steer under the independent vendored DSP interpreter. The Python test
// (test_resident_engines.py) writes the memory image and a script of steps
// and checks every answer; nothing here knows the expected result.
// Inputs are fresh private assemblies only; no stock image is required.
//   P addr value          set a P word
//   X addr value          set an X word
//   Y addr value          set a Y word
//   R r|n|m index value   set an address register
//   ZERO                  clear a, b, x, y and the condition codes
//   FILL x|y lo hi seed   fill [lo, hi) with a fixed pseudo-random sequence
//   PKT entry w4 w5 w7    a packet (data words zero) through `entry`: prints "A 1" accepted, "A 0" refused
//   RP addr               prints "P addr value"
//   RUN addr steps        jsr addr, then prints "PC pc" after each interpreted instruction
//   GO addr limit low     jsr addr, run until it returns, jumps below `low` (into stock code, not loaded here) or
//                         `limit` instructions: prints "S steps how pc", how 1 returned, 2 left for stock, 0 the limit
//   HASH x|y lo hi        prints "H space lo hi fnv1a" of the words in [lo, hi)
//   REGS                  prints "G a b x y" (data ALU, raw) and "AR r0..r7 n0..n7 m0..m7"
//   SP                    prints "SP sp" (the system stack pointer: a balanced call leaves it as it found it)
//   CORE 0|1              later steps act on that core (each core its own P/X/Y and registers; core 0 at start)
//   SHARE x|y lo hi       [lo, hi) is one memory both cores see: after each GO, PKT or RUN on a core it is
//                         copied to the other (a two-core run interleaves whole calls, never instructions)
//   DUMP x|y lo hi        prints "D space lo w..." (the words in [lo, hi))
//   RAMP x|y lo hi first  sets [lo, hi) to first, first+1, ...
//   DIS lo hi             prints "I pc words text" for each instruction from P:lo up to P:hi (the vendored
//                         disassembler: what the assembler emitted, read back)
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <tuple>
#include <vector>
#include <string>
#include "dsp56kEmu/disasm.h"
#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/opcodes.h"
#include "dsp56kEmu/peripherals.h"
using namespace dsp56k;
struct Open : IMemoryValidator {
    bool memValidateAccess(EMemArea, TWord, bool) const override { return true; }
};
static EMemArea area(const std::string &s) {
    if(s=="x") return MemArea_X;
    if(s=="y") return MemArea_Y;
    throw std::runtime_error("unknown space "+s);
}
struct Core {
    Open validator;
    Memory memory{validator,0x080000,0x800000,0x200000};
    Peripherals56362 px;
    Peripherals56367 py;
    DSP dsp{memory,&px,&py};
    Core() { for(auto &m:dsp.regs().m) m.var=0xffffff; }
};
int main(int argc, char **argv) {
    if(argc!=2) return 2;
    std::ifstream script(argv[1]);
    std::unique_ptr<Core> cores[2];
    cores[0].reset(new Core);
    unsigned current=0;
    std::vector<std::tuple<EMemArea,TWord,TWord>> shared;
    const TWord packet=0x2000, stop=0x3f000;
    std::string op;
    while(script>>op) {
        Memory &memory=cores[current]->memory;
        DSP &dsp=cores[current]->dsp;
        Peripherals56362 &px=cores[current]->px;
        auto publish=[&]() {
            if(!cores[current^1]) return;
            for(const auto &[space,lo,hi]:shared)
                for(TWord a=lo;a<hi;++a) cores[current^1]->memory.set(space,a,memory.get(space,a));
        };
        if(op=="P" || op=="X" || op=="Y") {
            TWord address,value; script>>address>>value;
            memory.set(op=="P" ? MemArea_P : op=="X" ? MemArea_X : MemArea_Y,address,value&0xffffff);
        } else if(op=="R") {
            std::string kind; TWord index,value; script>>kind>>index>>value;
            if(index>7) throw std::runtime_error("register index");
            auto &bank=kind=="r" ? dsp.regs().r : kind=="n" ? dsp.regs().n : dsp.regs().m;
            if(kind!="r" && kind!="n" && kind!="m") throw std::runtime_error("register kind "+kind);
            bank[index].var=value&0xffffff;
        } else if(op=="ZERO") {
            // The data ALU and the condition codes as a stock caller would not leave them: the same in every run,
            // whatever packets the receiver handled before.
            auto &r=dsp.regs();
            r.a.var=0; r.b.var=0; r.x.var=0; r.y.var=0; r.sr.var&=~0xffu;
        } else if(op=="FILL") {
            std::string space; TWord lo,hi,seed; script>>space>>lo>>hi>>seed;
            uint32_t s=seed;
            for(TWord a=lo;a<hi;++a) { s=s*1664525u+1013904223u; memory.set(area(space),a,(s>>8)&0xffffff); }
        } else if(op=="PKT") {
            TWord entry,w4,w5,w7; script>>entry>>w4>>w5>>w7;
            for(TWord n=0;n<64;++n) memory.set(MemArea_X,packet+n,0);
            memory.set(MemArea_X,packet+4,w4); memory.set(MemArea_X,packet+5,w5); memory.set(MemArea_X,packet+7,w7);
            memory.set(MemArea_X,packet+63,0x1234);
            dsp.regs().r[0].var=packet;
            dsp.setPC(stop); dsp.jsr(entry);
            unsigned n=0;
            while(dsp.getPC().toWord()!=stop && ++n<100000) dsp.execInterpreter();
            if(n>=100000) throw std::runtime_error("receiver did not return");
            std::cout<<"A "<<((px.getHDI08().readControlRegister()&0x10)==0)<<"\n";
            publish();
        } else if(op=="RP") {
            TWord address; script>>address;
            std::cout<<"P "<<address<<" "<<memory.get(MemArea_P,address)<<"\n";
        } else if(op=="RUN") {
            TWord address,steps; script>>address>>steps;
            dsp.setPC(stop); dsp.jsr(address);
            for(TWord n=0;n<steps && dsp.getPC().toWord()!=stop;++n) {
                dsp.execInterpreter();
                std::cout<<"PC "<<dsp.getPC().toWord()<<"\n";
            }
            publish();
        } else if(op=="GO") {
            TWord address,limit,low; script>>address>>limit>>low;
            dsp.setPC(stop); dsp.jsr(address);
            TWord n=0,pc=address;
            while(n<limit && (pc=dsp.getPC().toWord())!=stop && pc>=low) { dsp.execInterpreter(); ++n; }
            pc=dsp.getPC().toWord();
            std::cout<<"S "<<n<<" "<<(pc==stop ? 1 : pc<low ? 2 : 0)<<" "<<pc<<"\n";
            publish();
        } else if(op=="HASH") {
            std::string space; TWord lo,hi; script>>space>>lo>>hi;
            uint64_t h=1469598103934665603ull;
            for(TWord a=lo;a<hi;++a) { h^=memory.get(area(space),a); h*=1099511628211ull; }
            std::cout<<"H "<<space<<" "<<lo<<" "<<hi<<" "<<h<<"\n";
        } else if(op=="REGS") {
            const auto &r=dsp.regs();
            std::cout<<"G "<<r.a.var<<" "<<r.b.var<<" "<<r.x.var<<" "<<r.y.var<<"\n";
            std::cout<<"AR";
            for(const auto &v:r.r) std::cout<<" "<<v.var;
            for(const auto &v:r.n) std::cout<<" "<<v.var;
            for(const auto &v:r.m) std::cout<<" "<<v.var;
            std::cout<<"\n";
        } else if(op=="SP") {
            std::cout<<"SP "<<dsp.regs().sp.var<<"\n";
        } else if(op=="CORE") {
            unsigned core; script>>core;
            if(core>1) throw std::runtime_error("core index");
            if(!cores[core]) cores[core].reset(new Core);
            current=core;
        } else if(op=="SHARE") {
            std::string space; TWord lo,hi; script>>space>>lo>>hi;
            shared.emplace_back(area(space),lo,hi);
        } else if(op=="DUMP") {
            std::string space; TWord lo,hi; script>>space>>lo>>hi;
            std::cout<<"D "<<space<<" "<<lo;
            for(TWord a=lo;a<hi;++a) std::cout<<" "<<memory.get(area(space),a);
            std::cout<<"\n";
        } else if(op=="RAMP") {
            std::string space; TWord lo,hi,first; script>>space>>lo>>hi>>first;
            for(TWord a=lo;a<hi;++a) memory.set(area(space),a,(first+a-lo)&0xffffff);
        } else if(op=="DIS") {
            TWord lo,hi; script>>lo>>hi;
            static Opcodes opcodes;
            static Disassembler disassembler(opcodes);
            for(TWord pc=lo;pc<hi;) {
                Disassembler::Line line;
                const TWord words=disassembler.disassemble(line,memory.get(MemArea_P,pc),memory.get(MemArea_P,pc+1),0,0,pc);
                std::cout<<"I "<<pc<<" "<<words<<" "<<Disassembler::formatLine(line,false)<<"\n";
                pc+=words ? words : 1;
            }
        } else throw std::runtime_error("unknown step "+op);
    }
    if(!script.eof()) return 3;
    return 0;
}
