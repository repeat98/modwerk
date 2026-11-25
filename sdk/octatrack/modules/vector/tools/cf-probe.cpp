// SPDX-License-Identifier: MIT
// Synthetic instruction/stack probe; not a hardware timing or audio test.
#include <fstream>
#include <iterator>
#include <cstdio>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(int argc, char** argv){
 if(argc != 3) return 64;
 std::ifstream f(argv[1],std::ios::binary);
 std::vector<unsigned char> im{std::istreambuf_iterator<char>(f),{}};
 ot::Machine m(im);
 std::ifstream rf(argv[2],std::ios::binary);
 std::vector<unsigned char> runtime{std::istreambuf_iterator<char>(rf),{}};
 for(unsigned i=0;i<runtime.size();i++)m.write8(0x40a955e0+i,runtime[i]);
 const unsigned sp=0x47010000,stop=0x47002000,params=0x47003000,phrase=0x47004000,track=0x47005000;
 unsigned maxGen=0,stackGen=0,maxWrite=0,stackWrite=0;
 auto call=[&](unsigned pc,std::vector<unsigned> args,unsigned& stack){
  m.setA7(sp); m.poke32(sp,stop);for(unsigned i=0;i<args.size();i++)m.poke32(sp+4+4*i,args[i]);
  m68k_set_reg(m.getCpuState(),M68K_REG_PC,pc);
  unsigned count=0,minsp=sp;
  while(m.pc()!=stop && count<2000000){if(m.getA7()<minsp)minsp=m.getA7();if(!m.step()){std::printf("fail %#x %s\n",m.pc(),m.why().c_str());return 0u;}count++;}
  if(m.pc()!=stop)return 0u;stack=std::max(stack,sp-minsp);return count;
 };
 unsigned cases=0;
 for(unsigned seed=0;seed<128;seed++)for(unsigned type:{0u,15u})for(unsigned scale=0;scale<5;scale++)for(unsigned length:{1u,16u,64u}){
  unsigned char p[]={static_cast<unsigned char>(type),16,11,static_cast<unsigned char>(scale),126,127,12,12,63,0,1};
  for(unsigned i=0;i<sizeof p;i++)m.write8(params+i,p[i]);
  unsigned n=call(0x40a96bf4,{phrase,params,length,127,seed},stackGen);if(!n)return 1;maxGen=std::max(maxGen,n);
  for(unsigned i=0;i<2330;i++)m.write8(track+i, i>=154&&i<2202?255:0);
  n=call(0x40a96ca6,{track,2330,phrase,1},stackWrite);if(!n)return 2;maxWrite=std::max(maxWrite,n);cases++;
 }
 unsigned maxNative=0,stackNative=0;
 const unsigned bank=0x47100000,part=bank+0x8ed80;
 m.poke32(0x46c82456,bank);m.write8(0x100b14cc,0);m.write8(0x100b14cf,0);m.write8(0x100b14d0,0);
 m.write8(bank+0x8e53,64);m.write8(bank+0x8e55,0);m.write8(part+0x22,0);m.write8(part+0x123,127);
 for(unsigned t=0;t<8;t++){
  m.write8(part+0x22+t,0);m.write8(part+0x123+24*t,127);
  m.write8(part+0x3c+30*t,'S');m.write8(part+0x3d+30*t,'2');m.write8(part+0x3e + 30*t,2);
  unsigned char packed[]={0x4f,16,0xcb,126,127,12,63,0,127};
  for(unsigned k=0;k<9;k++)m.write8(part+30*t+(k<3?0x3f+k:0x1ec+k-3),packed[k]);
  for(unsigned k=0;k<2330;k++)m.write8(bank+2330*t+k,k>=154&&k<2202?255:0);
  unsigned n=call(0x40a96e8e,{t,1,0},stackNative);if(!n){std::printf("native did not return on track %u\n",t);return 3;}maxNative=std::max(maxNative,n);
 }
 std::printf("native maximum instructions %u stack %u\n",maxNative,stackNative);
 std::printf("cases %u generate instructions %u stack %u; writer instructions %u stack %u\n",cases,maxGen,stackGen,maxWrite,stackWrite);
}
