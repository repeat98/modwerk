// SPDX-License-Identifier: MIT
// Execute the linked ColdFire helper, compare with equal temperament.
#include <fstream>
#include <iterator>
#include <cstdio>
#include <vector>
#include <cmath>
#include <algorithm>
#include <string>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(int argc,char**argv){
 if(argc!=5)return 64;
 std::ifstream f(argv[1],std::ios::binary),r(argv[2],std::ios::binary);
 std::vector<unsigned char>im{std::istreambuf_iterator<char>(f),{}},rt{std::istreambuf_iterator<char>(r),{}};
 ot::Machine m(im); unsigned base=std::stoul(argv[3],nullptr,0),fn=std::stoul(argv[4],nullptr,0);
 for(unsigned i=0;i<rt.size();i++)m.write8(base+i,rt[i]);
 unsigned count=0,maxInstructions=0,maxStack=0;double maxCents=0;
 for(unsigned tuning:{0u,0x1000000u,0x2000000u,0x4000000u,0x6061e00u,0x8000000u}) {
  unsigned previous=0;
  for(int note=0;note<128;note++){
   const unsigned sp=0x47010000,stop=0x47002000;
   m.setA7(sp);m.poke32(sp,stop);
   m68k_set_reg(m.getCpuState(),M68K_REG_PC,fn);
   m68k_set_reg(m.getCpuState(),M68K_REG_D0,tuning);
   m68k_set_reg(m.getCpuState(),M68K_REG_D1,static_cast<unsigned>(note-84));
   m68k_set_reg(m.getCpuState(),M68K_REG_D2,0x12345678);
   unsigned n=0,minsp=sp;
   while(m.pc()!=stop && n<1000){minsp=std::min(minsp,m.getA7());if(!m.step())return 2;n++;}
   if(m.pc()!=stop)return 3;
   unsigned actual=m68k_get_reg(m.getCpuState(),M68K_REG_D0);
   double expected=std::min(2147483647.0,tuning*std::exp2((note-84)/12.0));
   if(actual<previous || (tuning==0 && actual!=0))return 4;
   if(expected){ double cents=std::abs(1200*std::log2(actual/expected));maxCents=std::max(cents,maxCents);if(cents>.07){std::printf("bad tuning %u note %d got %u expected %.0f cents %.5f\n",tuning,note,actual,expected,cents);return 5;}}
   if(m68k_get_reg(m.getCpuState(),M68K_REG_D2)!=0x12345678 || m.getA7()!=sp+4)return 6;
   previous=actual;maxInstructions=std::max(maxInstructions,n);maxStack=std::max(maxStack,sp-minsp);count++;
  }
 }
 std::printf("{\"cases\":%u,\"maximum_cents_error\":%.6f,\"maximum_instructions\":%u,\"maximum_stack\":%u}\n",count,maxCents,maxInstructions,maxStack);
}
