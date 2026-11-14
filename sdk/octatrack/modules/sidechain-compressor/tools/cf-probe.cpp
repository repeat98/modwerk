// SPDX-License-Identifier: MIT

#include <fstream>
#include <iterator>
#include <cstdio>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(){
 std::ifstream f("/work/out/mainos_bus.bin",std::ios::binary);
 std::vector<unsigned char> im{std::istreambuf_iterator<char>(f),{}};
 ot::Machine m(im);
 const unsigned startSP=0x47010000,buf=0x47001000,stop=0x47002000;
 unsigned entries[]={0x400d6d00,0x400d6d36};
 unsigned maxima[2]={},stacks[2]={};
 for(int fn=0;fn<2;fn++)for(int value=0;value<(fn?128:9);value++){
  m.setA7(startSP);
  m.poke32(startSP,stop);m.poke32(startSP+4,buf);m.poke32(startSP+8,value);
  m68k_set_reg(m.getCpuState(),M68K_REG_PC,entries[fn]);
  unsigned n=0,minsp=startSP;
  while(m.pc()!=stop && n<100000){
   if(m.getA7()<minsp)minsp=m.getA7();
   if(!m.step()){std::printf("failed %s\n",m.why().c_str());return 1;}
   n++;
  }
  if(m.pc()!=stop)return 2;
  if(n>maxima[fn])maxima[fn]=n;
  if(startSP-minsp>stacks[fn])stacks[fn]=startSP-minsp;
 }
 std::printf("KEY peak instructions %u stack bytes %u; KFLT peak instructions %u stack bytes %u\n",maxima[0],stacks[0],maxima[1],stacks[1]);
}
