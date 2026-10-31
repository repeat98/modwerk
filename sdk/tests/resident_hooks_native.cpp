// SPDX-License-Identifier: GPL-3.0-or-later
// Execute authored receiver code under the independent vendored DSP interpreter.
// Inputs are fresh private assemblies and metadata; no stock image is required.
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <stdexcept>
#include <vector>
#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/peripherals.h"
using namespace dsp56k;
struct Open : IMemoryValidator {
    bool memValidateAccess(EMemArea, TWord, bool) const override { return true; }
};
struct Entry { TWord owner, operand, off, on; };
static void require(bool okay) { if(!okay) throw std::runtime_error("Resident receiver execution regression"); }
int main(int argc, char **argv) {
    require(argc==3);
    std::ifstream meta(argv[2]);
    TWord origin, control, reset, state, ready, allowed, shared, entries;
    meta >> origin >> control >> reset >> state >> ready >> allowed >> shared >> entries;
    std::vector<Entry> rows(entries);
    for(auto &row: rows) meta >> row.owner >> row.operand >> row.off >> row.on;
    require(meta.good());
    std::ifstream binary(argv[1],std::ios::binary);
    std::vector<uint8_t> code((std::istreambuf_iterator<char>(binary)),{});
    require(!code.empty() && code.size()%3==0);
    Open validator;
    Memory memory(validator,0x080000,0x800000,0x200000);
    Peripherals56362 px;
    Peripherals56367 py;
    DSP dsp(memory,&px,&py);
    for(size_t i=0;i<code.size();i+=3) memory.set(MemArea_P,origin+i/3,code[i]|code[i+1]<<8|code[i+2]<<16);
    for(auto row:rows) memory.set(MemArea_P,row.operand,row.off);
    for(auto &m:dsp.regs().m) m.var=0xffffff;
    const TWord packet=0x2000, stop=0x3f000;
    auto execute=[&](TWord address) {
        dsp.regs().r[0].var=packet;
        memory.set(MemArea_X,packet+63,0x1234);
        dsp.setPC(stop); dsp.jsr(address);
        unsigned n=0;
        while(dsp.getPC().toWord()!=stop && ++n<10000) dsp.execInterpreter();
        require(n<10000);
        return (px.getHDI08().readControlRegister()&0x10)==0;
    };
    auto cas=[&](TWord expected,TWord desired) {
        memory.set(MemArea_X,packet+4,expected);
        memory.set(MemArea_X,packet+5,desired);
        return execute(control);
    };
    auto chunk=[&](TWord feature,TWord offset,TWord count) {
        memory.set(MemArea_X,packet+4,count);
        memory.set(MemArea_X,packet+5,offset);
        memory.set(MemArea_X,packet+7,feature);
        for(TWord n=0;n<24;++n) {
            memory.set(MemArea_X,packet+8+2*n,0);
            memory.set(MemArea_X,packet+9+2*n,0);
        }
        return execute(reset);
    };
    auto complete=[&](TWord feature,TWord length,std::initializer_list<TWord> splits) {
        for(TWord offset=0;offset<length;) {
            TWord end=length;
            for(TWord split:splits) if(offset<split) { end=split; break; }
            TWord count=std::min<TWord>(24,end-offset);
            require(chunk(feature,offset,count)); offset+=count;
        }
    };
    require(memory.get(MemArea_P,state)==0 && memory.get(MemArea_P,ready)==0);
    require(!cas(0,1)); // no caller can manufacture an initialized state
    require(!chunk(1,0,25) && !chunk(1,7,1));
    memory.set(MemArea_Y,0xfef,0x5abc);
    memory.set(MemArea_Y,0x1000,0x5abc);
    memory.set(MemArea_Y,0x7dff,0x5abc);
    memory.set(MemArea_Y,0x8000,0x5abc);
    memory.set(MemArea_Y,0x7f0,0x5abc); // the old MON words and bus: a DSP machine's voice now
    memory.set(MemArea_Y,0x9ff,0x5abc);
    memory.set(MemArea_Y,shared-1,0x5abc);
    memory.set(MemArea_Y,shared+514,0x5abc);
    require(!chunk(1,0,17)); // one owned range per chunk: the MON words are 16
    require(chunk(1,0,16));
    require(!chunk(1,17,1)); // exact sequence, not arbitrary owned-memory writes
    require(!cas(0,1)); // a partial reset is still unavailable
    complete(1,1042,{16,530});
    require(memory.get(MemArea_P,ready)&1);
    require(memory.get(MemArea_Y,0xfef)==0x5abc && memory.get(MemArea_Y,0x1000)==0x5abc);
    require(memory.get(MemArea_Y,0x7dff)==0x5abc && memory.get(MemArea_Y,0x8000)==0x5abc);
    require(memory.get(MemArea_Y,0x7f0)==0x5abc && memory.get(MemArea_Y,0x9ff)==0x5abc);
    require(memory.get(MemArea_Y,shared-1)==0x5abc && memory.get(MemArea_Y,shared+514)==0x5abc);
    require(cas(0,1));
    for(auto row:rows) require(memory.get(MemArea_P,row.operand)==(row.owner==1 ? row.on:row.off));
    require(!chunk(1,0,1)); // active engine cannot be reinitialized
    require(!cas(0,0)); // stale expected ownership refuses before any branch changes
    require(memory.get(MemArea_P,state)==1);
    require(cas(1,0));
    require(!(memory.get(MemArea_P,ready)&1) && !cas(0,1));
    memory.set(MemArea_X,0x283f,0x5abc);
    memory.set(MemArea_X,0x3700,0x5abc);
    memory.set(MemArea_X,0x7fff,0x5abc); // relocated wait counter remains outside AB's range
    complete(4,3776,{});
    require(cas(0,4));
    require(memory.get(MemArea_X,0x283f)==0x5abc && memory.get(MemArea_X,0x3700)==0x5abc);
    require(memory.get(MemArea_X,0x7fff)==0x5abc);
    require(cas(4,0) && !cas(0,4));
    if(allowed&2) { complete(2,193,{}); require(cas(0,2)); require(cas(2,0)); }
    else require(!chunk(2,0,1) && !cas(0,2));
    require(!cas(0,0x80));
    return 0;
}
