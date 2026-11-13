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
void mute(ot::Machine&m,string root){
 put(m,0x400d7400,bytes(root+"/mute-patch_softmute.s.raw"));put(m,0x400d7800,bytes(root+"/mute-patch_mutemode.s.raw"));m.mapRegion(0x100ff000,4096);
 uint32_t getter=0x400d783a,setter=0x400d7866;int ui[4]={0,2,3,1},gate[4]={0,3,1,2};const char*labels[4]={"OT","OTFX","OTFX-T","DT-T"};
 for(int v=-2;v<=6;v++)for(int delta=-1;delta<=1;delta++)for(int wrap=0;wrap<2;wrap++){
 start(m,setter);m.write32(0x800000dc,v);m.write32(SP+4,delta);m.write32(SP+8,wrap);run(m,"menu-set",{RET});int want=ui[v>=0&&v<=3?v:0]+delta;want=wrap?(want>3?0:want<0?3:want):min(3,max(0,want));check(m.read32(0x800000dc)==uint32_t(gate[want]),"menu mapping");check(m.read32(0x100fff6c)==uint32_t(gate[want]),"menu persistence shadow");
 start(m,getter);run(m,"menu-get",{RET});string label;for(int i=0;i<8&&m.read8(get(m,M68K_REG_D0)+i);i++)label.push_back(m.read8(get(m,M68K_REG_D0)+i));check(label==labels[want],"getter label");}
 // Dispatch and bind gates: every mute mask, selected solo edge cases, all tracks.
 vector<uint32_t>solo={0,1,2,0x80,0x55,0xaa,0xff};
 for(uint32_t mode=0;mode<4;mode++)for(uint32_t mask=0;mask<256;mask++)for(auto s:solo)for(uint32_t t=0;t<8;t++){
 bool silenced=(mode==1||mode==2)&&((mask>>t&1)||(s&&!(s>>t&1)));m.write32(0x800000dc,mode);m.write32(0x80000008,(mask<<8)|s);
 start(m,0x400d7400+370);reg(m,M68K_REG_D1,t);m.write32(SP,0x11223344);m.write32(SP+4,VOICE);m.write32(SP+8,RET);uint32_t pc=run(m,"mt-trig",{RET,0x4000684a});check(pc==(silenced?RET:0x4000684a),"trig suppression");check(get(m,M68K_REG_SP)==(silenced?SP+12:SP),"trig stack");
 start(m,0x400d7400+788);m.write32(SP+4,t);auto d3=get(m,M68K_REG_D3);pc=run(m,"fresh-bind",{0x40006888,0x40006828});check(pc==(silenced?0x40006888:0x40006828),"fresh bind gating");check(get(m,M68K_REG_D3)==d3,"fresh bind preserves caller d3");
 start(m,0x400d7400+910);reg(m,M68K_REG_D1,3);reg(m,M68K_REG_D4,t);pc=run(m,"trig-flag",{0x40004cb0,0x40004c78});check(pc==(silenced?0x40004cb0:0x40004c78),"DSP trig flag suppression");
 }
 // Rebind pointer writes and per-machine dispatch, using a counted synthetic handler.
 for(uint32_t mode=0;mode<4;mode++)for(uint32_t mask=0;mask<256;mask++)for(auto soloMask:solo)for(uint32_t t=0;t<8;t++){
 bool blocked=(mode==1||mode==2)&&((mask>>t&1)||(soloMask&&!(soloMask>>t&1)));m.write32(0x800000dc,mode);m.write32(0x80000008,(mask<<8)|soloMask);
 start(m,0x400d7400+460);reg(m,M68K_REG_A2,VOICE);reg(m,M68K_REG_A5,0x46030000);reg(m,M68K_REG_A4,0x46040000);m.write32(VOICE+4,1);m.write32(VOICE+8,2);m.write32(SP+0x40,t);run(m,"rebind",{0x4000f4e4});check(m.read32(VOICE+4)==(blocked?1u:0x46030000u)&&m.read32(VOICE+8)==(blocked?2u:0x46040000u),"rebind stores");
 start(m,0x400d7400+702);reg(m,M68K_REG_D3,t);reg(m,M68K_REG_A0,0x40002000);m.write16(0x40002000,0x4e75);int calls=0;fixture=[&calls](ot::Machine&cpu,uint32_t pc){if(pc==0x40002000){calls++;reg(cpu,M68K_REG_D0,77);}};run(m,"dispatch",{0x4000d49e});check(calls==int(!blocked),"dispatch suppression");check(get(m,M68K_REG_D0)==(blocked?0u:77u),"dispatch result");check(get(m,M68K_REG_SP)==SP-8,"dispatch argument stack");fixture=nullptr;
 }
 // Frame mode handling: all mute/solo masks, both stock SOLO_FLAG states.
 m.write16(0x40008f84,0x4e75);
 for(uint32_t mode=0;mode<4;mode++)for(uint32_t mask=0;mask<256;mask++)for(uint32_t s=0;s<256;s++)for(int flag=0;flag<2;flag++){
 m.write32(0x800000dc,mode);m.write32(0x80000008,0x005a0000|(mask<<8)|s);m.write8(0x80000037,flag);m.write16(1074624482,0xff00);m.write8(0x8000184a,0);for(int bank=0;bank<2;bank++)for(int t=0;t<8;t++){m.write16(0x80000110+bank*512+t*64+6,0x1234);m.write16(0x80000110+bank*512+t*64+10,0x5678);}start(m,0x400d7400);run(m,"frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(mode?0x005a0000u:(0x005a0000u|(mask<<8)|s)),"preserve cue and stock level mask");check(get(m,M68K_REG_SP)==SP,"frame stack");uint32_t silence=mask|(s?((~s)&255):0);for(int bank=0;bank<2;bank++)for(int t=0;t<8;t++){bool cut=mode==3&&(silence>>t&1);check(m.read16(0x80000110+bank*512+t*64+6)==(cut?0:0x1234)&&m.read16(0x80000110+bank*512+t*64+10)==(cut?0:0x5678),"dry gain mode handling");}for(int j=M68K_REG_D0;j<=M68K_REG_D3;j++)check(get(m,j)==0x12340000u+j,"frame preserves d0-d3");check(mode?m.read8(1074624482)==0xff:m.read16(1074624482)==0,"frame hold: OT clears UNHELD and SHADOW, a soft mode holds nothing new");
 }
 // OT-exit hold: OT holds every track (UNHELD = 0), so a track still muted when MUTE MODE leaves OT keeps the
 // post-FX cut (its D5 mute bit) while it stays muted; an unmuted track leaves the hold, a new mute follows MUTE MODE.
 for(uint32_t mode=1;mode<4;mode++)for(uint32_t mask=0;mask<256;mask++){
 uint32_t mixed=(mask&0x55)|(~mask&0xaa),kept=mask&0x55;m.write8(0x80000037,0);m.write8(0x8000184a,0);m.write16(1074624482,0xff5a);
 m.write32(0x800000dc,0);m.write32(0x80000008,0x005a0000|(mask<<8));start(m,0x400d7400);run(m,"hold-ot-frame",{0x40004dcc});check(get(m,M68K_REG_D5)==(0x005a0000u|(mask<<8)),"OT frame keeps stock's mute word");check(m.read16(1074624482)==0,"OT frame holds every track and clears SHADOW");
 m.write32(0x800000dc,mode);start(m,0x400d7400);run(m,"hold-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(0x005a0000u|(mask<<8)),"tracks muted at the OT exit keep the post-FX cut");check(m.read8(1074624482)==((~mask)&255),"hold = tracks muted at the OT exit");
 m.write32(0x80000008,0x005a0000|(mixed<<8));start(m,0x400d7400);run(m,"hold-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(0x005a0000u|(kept<<8)),"unmuted tracks leave the hold, new mutes follow MUTE MODE");check(m.read8(1074624482)==((~kept)&255),"hold keeps only still-muted held tracks");
 m.write32(0x80000008,0x005a0000);start(m,0x400d7400);run(m,"hold-release-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==0x005a0000u,"unmuting releases the post-FX cut");check(m.read8(1074624482)==0xff,"unmuting releases the hold");
 }
}

void sidechain(ot::Machine&m,string root){
 put(m,1074622036,bytes(root+"/mute-sidechain.raw"));m.write16(0x40008f84,0x4e75);
 for(uint32_t mode=0;mode<4;mode++)for(uint32_t mask=0;mask<256;mask++)for(uint32_t keyMask=0;keyMask<256;keyMask++){
 m.write32(0x800000dc,mode);m.write32(0x80000008,mask<<8);m.write8(0x80000037,0);m.write16(1074623138,0xff00);m.write8(0x8000184a,0);
 for(int t=0;t<8;t++){uint32_t lane=0x80000110+t*64;m.write8(lane+55,(keyMask>>t&1)?0x18:0);m.write8(lane+38,t+1);m.write8(lane+57,0);}
 start(m,1074622036);run(m,"sidechain-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(mode?((mask&keyMask)<<8):(mask<<8)),"sidechain keys keep stock mute word");if(mode){check(m.read8(1074623140)==keyMask,"sidechain key scan");check(m.read8(1074623138)==((~(mask&keyMask))&255),"sidechain key hold set");}else check(m.read16(1074623138)==0,"sidechain OT frame holds every track and clears SHADOW");
 for(uint32_t t=0;t<8;t++){start(m,1074622918);m.write32(SP+4,t);auto d3=get(m,M68K_REG_D3);auto pc=run(m,"sidechain-fresh-bind",{0x40006888,0x40006828});bool blocked=(mode==1||mode==2)&&(mask>>t&1)&&!(keyMask>>t&1);check(pc==(blocked?0x40006888:0x40006828),"sidechain key bind exception");check(get(m,M68K_REG_D3)==d3,"sidechain caller register preservation");}
 if(mode){for(int t=0;t<8;t++)m.write8(0x80000110+t*64+55,0);m.write32(0x80000008,mask<<8);start(m,1074622036);run(m,"sidechain-hold-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==((mask&keyMask)<<8),"sidechain held tracks keep the post-FX cut after KEY moves away");check(m.read8(1074623138)==((~(mask&keyMask))&255),"sidechain key hold kept while silenced");m.write32(0x80000008,0);start(m,1074622036);run(m,"sidechain-release-frame-mode-"+to_string(mode),{0x40004dcc});check(m.read8(1074623138)==0xff,"sidechain key hold released on unmute");
 // OT-exit hold, with KEY tracks: after an OT frame every track muted then stays cut; keys join the hold only while silenced.
 uint32_t mixed=(mask&0x55)|(~mask&0xaa),held=(mask&0x55)|(mixed&keyMask);for(int t=0;t<8;t++)m.write8(0x80000110+t*64+55,(keyMask>>t&1)?0x18:0);m.write16(1074623138,0xff5a);
 m.write32(0x800000dc,0);m.write32(0x80000008,mask<<8);start(m,1074622036);run(m,"sidechain-hold-ot-frame",{0x40004dcc});check(get(m,M68K_REG_D5)==(mask<<8),"sidechain OT frame keeps stock's mute word");check(m.read16(1074623138)==0,"sidechain OT frame holds every track and clears SHADOW");
 m.write32(0x800000dc,mode);start(m,1074622036);run(m,"sidechain-ot-exit-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(mask<<8),"sidechain tracks muted at the OT exit keep the post-FX cut");check(m.read8(1074623138)==((~mask)&255),"sidechain hold = tracks muted at the OT exit");
 m.write32(0x80000008,mixed<<8);start(m,1074622036);run(m,"sidechain-ot-exit-frame-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==(held<<8),"sidechain unmuted tracks leave the hold, new mutes follow MUTE MODE unless KEY");check(m.read8(1074623138)==((~held)&255),"sidechain hold keeps still-muted held tracks and silenced keys");
 m.write32(0x80000008,0);start(m,1074622036);run(m,"sidechain-ot-exit-release-mode-"+to_string(mode),{0x40004dcc});check(get(m,M68K_REG_D5)==0,"sidechain unmuting releases the post-FX cut");check(m.read8(1074623138)==0xff,"sidechain unmuting releases the hold");}
 }
 }
int main(int argc,char**argv){try{check(argc==2,"usage: probe authored-assembly-dir");ot::Machine m({});mute(m,argv[1]);sidechain(m,argv[1]);printf("{\"model\":\"MCF5206E core-cycle model, cache-hit zero-wait; not MCF54455 chip timing\",\"stockCallbacks\":\"synthetic fixtures; excluded from stock timing claims\",\"standardProbesPassed\":true,\"passed\":%s,\"paths\":{",lateMismatches?"false":"true");bool comma=false;for(auto&[k,s]:stats){printf("%s\"%s\":{\"cases\":%llu,\"maxInstructions\":%llu,\"maxModelCycles\":%llu,\"maxCoreCycleUpperBound\":%llu,\"maxAdditionalStackBytes\":%u}",comma?",":"",k.c_str(),(unsigned long long)s.cases,(unsigned long long)s.steps,(unsigned long long)s.cycles,(unsigned long long)s.bound,s.stack);comma=true;}printf("}");if(lateCases)printf(",\"lateArmComparison\":{\"cases\":%llu,\"idealGapMismatches\":%llu,\"passed\":%s,\"rlen16Cases\":%llu,\"rlen16Mismatches\":%llu,\"examples\":[%s]}",(unsigned long long)lateCases,(unsigned long long)lateMismatches,lateMismatches?"false":"true",(unsigned long long)lateRlen16Cases,(unsigned long long)lateRlen16Mismatches,lateExamples.c_str());printf("}\n");return lateMismatches?2:0;}catch(const exception&e){fprintf(stderr,"probe failed: %s\n",e.what());return 1;}}
