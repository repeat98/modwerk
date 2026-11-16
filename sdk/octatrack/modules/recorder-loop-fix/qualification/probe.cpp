// SPDX-License-Identifier: GPL-3.0-or-later
// Original Modwerk qualification probe; synthetic callback fixtures are explicit.
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
#include <algorithm>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <cstdio>
using namespace std;
static const uint32_t SP=0x47001000, RET=0x40001000, VOICE=0x46010000, FP=0x47002000;
struct Stat {uint64_t cases=0, steps=0, cycles=0, bound=0; uint32_t stack=0;};
uint64_t lateCases=0, lateMismatches=0, lateRlen16Cases=0, lateRlen16Mismatches=0;string lateExamples;
map<string,Stat> stats;
function<void(ot::Machine&,uint32_t)> fixture;
vector<uint8_t> bytes(string path) {ifstream f(path,ios::binary);if(!f)throw runtime_error("missing authored input");return vector<uint8_t>(istreambuf_iterator<char>(f),{});}
void put(ot::Machine&m,uint32_t at,const vector<uint8_t>&v){for(size_t i=0;i<v.size();i++)m.write8(at+i,v[i]);}
void reg(ot::Machine&m,int r,uint32_t v){m68k_set_reg(m.getCpuState(),(m68k_register_t)r,v);}
uint32_t get(ot::Machine&m,int r){return m68k_get_reg(m.getCpuState(),(m68k_register_t)r);}
void start(ot::Machine&m,uint32_t at){reg(m,M68K_REG_SR,0x2700);reg(m,M68K_REG_SP,SP);for(int i=M68K_REG_D0;i<=M68K_REG_A6;i++)reg(m,i,0x12340000+i);m.write32(SP,RET);m.setPC(at);}
void check(bool ok,const char*msg){if(!ok)throw runtime_error(msg);}
uint32_t run(ot::Machine&m,const string&name,const vector<uint32_t>&ends){auto n=m.instructions(),c=m.getCycles();uint64_t bound=0;uint32_t low=SP;for(int i=0;i<2000;i++){uint32_t pc=m.pc();if(find(ends.begin(),ends.end(),pc)!=ends.end()){auto&s=stats[name];s.cases++;s.steps=max(s.steps,m.instructions()-n);s.cycles=max(s.cycles,m.getCycles()-c);s.bound=max(s.bound,bound);s.stack=max(s.stack,SP-low);return pc;}bound+=((m.read16(pc)&0xffc0)==0x4c40)?38:16;if(fixture)fixture(m,pc);check(m.stepFast(),"illegal opcode in probe");low=min(low,get(m,M68K_REG_SP));}throw runtime_error("probe exceeded instruction limit");}
void recorder(ot::Machine&m,string root){
 vector<string>names={"seekbind.s","seekbind_ctr.s","spacing_cave.s","hold_copy.s","hold_xfade_a.s","hold_xfade_b.s","hold_guard.s","hold_xguard.s"};
 map<string,uint32_t>at;uint32_t p=0x400d6b80;for(auto&n:names){p=(p+127)&~127u;at[n]=p;auto v=bytes(root+"/"+n+".raw");put(m,p,v);p+=v.size();}
 for(int same=0;same<2;same++){start(m,at["seekbind.s"]);m.write8(SP+59,same);auto pc=run(m,"seekbind",{0x4000f8ec,0x4000f8ea});check(pc==(same?0x4000f8ec:0x4000f8ea),"seek path");check(get(m,M68K_REG_SP)==SP+4,"seek stack");
 start(m,at["seekbind_ctr.s"]);m.write8(SP+59,same);reg(m,M68K_REG_A2,VOICE);reg(m,M68K_REG_A0,0x12345678);m.write32(VOICE+144,77);run(m,"seek-counter",{RET});check(m.read32(VOICE+144)==uint32_t(77+!same),"counter");check(m.read32(VOICE+152)==0x12345678,"counter store");}
 // Every integer BPM 30..300, all fixed RLEN values, eight tracks and 32 arm phases.
 for(uint32_t bpm=30;bpm<=300;bpm++)for(uint32_t len=1;len<=64;len++)for(uint32_t k=0;k<32;k++){
 uint32_t d=bpm*24;uint64_t numerator=uint64_t(len)*15876000,q=numerator/d,r=numerator%d;uint32_t arm=k*numerator/d;
 start(m,at["spacing_cave.s"]);reg(m,M68K_REG_D0,uint32_t(q*2-1));m.write32(0x80001814,d);m.write32(SP+140,k%8);m.write32(0x46c7fa84+(k%8)*4,arm);
 uint32_t expected=(uint64_t(k+1)*numerator/d)-arm;
 run(m,"spacing",{RET});check(get(m,M68K_REG_D4)==expected,"spacing length");check(get(m,M68K_REG_SP)==SP+4,"spacing stack");check(get(m,M68K_REG_D0)==q*2-1,"spacing d0 preservation");for(int j=M68K_REG_D1;j<=M68K_REG_D3;j++)check(get(m,j)==0x12340000u+j,"spacing d register preservation");for(int j=M68K_REG_A0;j<=M68K_REG_A1;j++)check(get(m,j)==0x12340000u+j,"spacing a register preservation");}
 // Independent ideal consecutive-arm oracle, extending to four elapsed hours.
 for(uint32_t bpm=30;bpm<=300;bpm++)for(uint32_t length:{1u,2u,4u,8u,16u,32u,64u})for(uint32_t sec:{30u,60u,300u,1800u,3600u,7200u,14400u}){
 uint32_t d=bpm*24;uint64_t n=uint64_t(length)*15876000,q=n/d,k=uint64_t(sec)*44100*d/n;uint32_t arm=k*n/d,want=(k+1)*n/d-arm;
 start(m,at["spacing_cave.s"]);reg(m,M68K_REG_D0,q*2-1);m.write32(0x80001814,d);m.write32(SP+140,0);m.write32(0x46c7fa84,arm);run(m,"spacing-late-arm",{RET});lateCases++;uint32_t got=get(m,M68K_REG_D4);if(length==16){lateRlen16Cases++;lateRlen16Mismatches+=(got!=want);}
 if(got!=want){if(lateMismatches<8){char line[256];snprintf(line,sizeof line,"%s{\"bpm\":%u,\"rlen\":%u,\"elapsedSeconds\":%u,\"arm\":%u,\"nativeLength\":%u,\"idealNextArmGap\":%u}",lateMismatches?",":"",bpm,length,sec,arm,got,want);lateExamples+=line;}lateMismatches++;}
 }
 // Every supported tempo24 tick, every RLEN, including phases immediately below uint32 arm overflow.
 for(uint32_t d=720;d<=7200;d++)for(uint32_t length=1;length<=64;length++){
 uint64_t n=uint64_t(length)*15876000,q=n/d,last=uint64_t(0xffffffffu)*d/n;
 for(uint64_t k:{uint64_t(1),last>0?last-1:0,last}){
 uint32_t arm=k*n/d,want=(k+1)*n/d-arm;
 start(m,at["spacing_cave.s"]);reg(m,M68K_REG_D0,q*2-1);m.write32(0x80001814,d);m.write32(SP+140,k%8);m.write32(0x46c7fa84+(k%8)*4,arm);
 run(m,"spacing-fractional-and-uint32",{RET});check(get(m,M68K_REG_D4)==want,"fractional/uint32 spacing");check(get(m,M68K_REG_SP)==SP+4,"fractional spacing stack");check(get(m,M68K_REG_D0)==q*2-1,"fractional spacing d0");for(int j=M68K_REG_D1;j<=M68K_REG_D3;j++)check(get(m,j)==0x12340000u+j,"fractional d register");for(int j=M68K_REG_A0;j<=M68K_REG_A1;j++)check(get(m,j)==0x12340000u+j,"fractional a register");
 }
 }
 // Unsupported tempos and RLEN keep the displaced stock length.
 for(uint32_t d:{0u,719u,7201u,0xffffffffu}){start(m,at["spacing_cave.s"]);reg(m,M68K_REG_D0,999);m.write32(0x80001814,d);run(m,"spacing-outside-supported",{RET});check(get(m,M68K_REG_D4)==500,"unsupported tempo retains stock");}
 for(uint32_t length:{0u,65u}){uint32_t q=uint64_t(length)*15876000/3072;start(m,at["spacing_cave.s"]);reg(m,M68K_REG_D0,q*2-1);m.write32(0x80001814,3072);run(m,"spacing-outside-supported",{RET});check(get(m,M68K_REG_D4)==q,"unsupported RLEN retains stock");}
 // A synthetic fetch callback returns a mapped sample or the empty pool marker.
 // It is explicitly a callback fixture, not a model of stock fetch timing.
 m.write16(0x40002000,0x4e75);m.write32(FP-68,0x40002000);
 for(int layout=0;layout<5;layout++)for(int empty=0;empty<2;empty++)for(int direction=-1;direction<=1;direction++)for(int recorder=0;recorder<2;recorder++)for(int index=99;index<=101;index++)for(int fallback=0;fallback<3;fallback++){
 string file=names[3+layout];start(m,at[file]);reg(m,M68K_REG_A2,VOICE);reg(m,M68K_REG_A6,FP);m.write32(SP+4,VOICE);m.write32(SP+8,index);m.write32(SP+12,VOICE);m.write32(SP+16,index);
 m.write8(VOICE+21,recorder?0x80:0);m.write8(VOICE+23,0);m.write32(VOICE+100,100);m.write32(VOICE+72,index);m.write32(VOICE+76,index);
 reg(m,M68K_REG_D0,empty?0x40a955e0:0x46030000);reg(m,M68K_REG_D1,direction*10);reg(m,M68K_REG_D2,10);reg(m,M68K_REG_D4,direction*10);reg(m,M68K_REG_D5,100);reg(m,M68K_REG_A1,100);
 if(layout>=3)reg(m,M68K_REG_D0,index);
 fixture=([fallback](ot::Machine&cpu,uint32_t pc){if(pc==0x40002000){reg(cpu,M68K_REG_D0,fallback==1?0x40a955e0:0x46020000);reg(cpu,M68K_REG_D1,fallback==2?0:1);}});
 run(m,file,{RET,0x4000871e,0x400085e0});
 bool held=direction>0&&index==100&&fallback==0&&(layout>=3||(empty&&recorder));
 if(layout==0){check(get(m,M68K_REG_D3)==(held?0x46020000u:(empty?0x40a955e0u:0x46030000u)),"hold copy address");check(get(m,M68K_REG_SP)==SP+12,"hold copy stack");}
 if(layout==1){check(get(m,M68K_REG_A3)==(held?0x46020000u:(empty?0x40a955e0u:0x46030000u)),"hold xfade A address");check(get(m,M68K_REG_SP)==SP,"hold xfade A stack");}
 if(layout==2){check(get(m,M68K_REG_D7)==(held?0x46020000u:(empty?0x40a955e0u:0x46030000u)),"hold xfade B address");check(get(m,M68K_REG_SP)==SP+20,"hold xfade B stack");}
 if(layout>=3){check(get(m,M68K_REG_SP)==SP+4,"hold guard stack");check(get(m,M68K_REG_D2)==(held?1u:uint32_t(min(10,100-index))),"hold guard count");}
 }
 fixture=nullptr;
}
int main(int argc,char**argv){try{check(argc==2,"usage: probe authored-assembly-dir");ot::Machine m({});recorder(m,argv[1]);printf("{\"model\":\"MCF5206E core-cycle model, cache-hit zero-wait; not MCF54455 chip timing\",\"stockCallbacks\":\"synthetic fixtures; excluded from stock timing claims\",\"standardProbesPassed\":true,\"passed\":%s,\"paths\":{",lateMismatches?"false":"true");bool comma=false;for(auto&[k,s]:stats){printf("%s\"%s\":{\"cases\":%llu,\"maxInstructions\":%llu,\"maxModelCycles\":%llu,\"maxCoreCycleUpperBound\":%llu,\"maxAdditionalStackBytes\":%u}",comma?",":"",k.c_str(),(unsigned long long)s.cases,(unsigned long long)s.steps,(unsigned long long)s.cycles,(unsigned long long)s.bound,s.stack);comma=true;}printf("}");if(lateCases)printf(",\"lateArmComparison\":{\"cases\":%llu,\"idealGapMismatches\":%llu,\"passed\":%s,\"rlen16Cases\":%llu,\"rlen16Mismatches\":%llu,\"examples\":[%s]}",(unsigned long long)lateCases,(unsigned long long)lateMismatches,lateMismatches?"false":"true",(unsigned long long)lateRlen16Cases,(unsigned long long)lateRlen16Mismatches,lateExamples.c_str());printf("}\n");return lateMismatches?2:0;}catch(const exception&e){fprintf(stderr,"probe failed: %s\n",e.what());return 1;}}
