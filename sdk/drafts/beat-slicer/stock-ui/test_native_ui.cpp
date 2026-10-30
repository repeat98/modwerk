// Original private fixture: load the exact package and execute its real native
// UI calls. Synthetic opening state only; not a scheduler/hardware test.
#include <array>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
namespace {
constexpr uint32_t CODE=0x47400000,STACK=0x47100000,STOP=0x47300000,DEST=0x47210001;
void require(bool ok,const char *why){if(!ok)throw std::runtime_error(why);}
std::vector<uint8_t> bytes(const std::string&p){std::ifstream f(p,std::ios::binary);return {std::istreambuf_iterator<char>(f),{}};}
uint32_t be(const std::vector<uint8_t>&v,unsigned p){return uint32_t(v.at(p))<<24|uint32_t(v.at(p+1))<<16|uint32_t(v.at(p+2))<<8|v.at(p+3);}
std::vector<uint8_t> pgm(const std::string&p){auto v=bytes(p);unsigned nl=0,i=0;while(i<v.size()&&nl<3)if(v[i++]=='\n')++nl;return {v.begin()+i,v.end()};}
struct Probe {
 ot::Machine m;std::map<std::string,uint32_t>s;unsigned frames=0,text=0,stack=0,homeWrites=0,stockMaskWrites=0;bool watch=true;
 Probe(const std::vector<uint8_t>&stock,const std::vector<uint8_t>&pkg,const std::string&names):m(stock){
  std::ifstream n(names);std::string line,name;unsigned addr;
  while(std::getline(n,line)){std::istringstream r(line);if(r>>std::hex>>addr>>name)s[name]=CODE+addr;}
  const unsigned size=be(pkg,8),bss=be(pkg,12),relocs=be(pkg,16),hooks=be(pkg,20),at=76+hooks*4;
  for(unsigned i=0;i<size;i++)m.write8(CODE+i,pkg.at(at+i));
  for(unsigned i=0;i<bss;i++)m.write8(CODE+size+i,0);
  for(unsigned i=0;i<relocs;i++){unsigned off=be(pkg,at+size+4*i);m.write32(CODE+off,m.read32(CODE+off)+CODE);}
 }
 uint32_t sym(const char*n){return s.at(n);}
 uint32_t call(uint32_t entry,std::initializer_list<uint32_t>args){
  auto c=m.getCpuState();m68k_set_reg(c,M68K_REG_SR,0x2000);m68k_set_reg(c,M68K_REG_SP,STACK);m.write32(STACK,STOP);
  const std::array<m68k_register_t,11>saved{M68K_REG_D2,M68K_REG_D3,M68K_REG_D4,M68K_REG_D5,M68K_REG_D6,M68K_REG_D7,M68K_REG_A2,M68K_REG_A3,M68K_REG_A4,M68K_REG_A5,M68K_REG_A6};
  for(unsigned i=0;i<saved.size();i++)m68k_set_reg(c,saved[i],0x12560000+i);
  unsigned i=0;for(auto a:args)m.write32(STACK+4+4*i++,a);m68k_set_reg(c,M68K_REG_PC,entry);
  const auto before=m.unmappedCount();unsigned steps=0;
  while(m.pc()!=STOP&&steps++<2000000){
   if(m.pc()==0x400570b8)++frames;if(m.pc()==0x40012bd8)++text;
   auto sp=m68k_get_reg(c,M68K_REG_SP);if(sp<STACK&&STACK-sp>stack)stack=STACK-sp;
   require(m.step(),"CPU stopped in native UI");
  }
  require(m.pc()==STOP&&m.unmappedCount()==before&&m68k_get_reg(c,M68K_REG_SP)==STACK+4,"native return/unmapped/stack boundary");
  require((m68k_get_reg(c,M68K_REG_SR)&0xff00u)==0x2000u,"native UI changed interrupt mask");
  for(unsigned i=0;i<saved.size();i++)require(m68k_get_reg(c,saved[i])==0x12560000+i,"native UI changed callee-saved register");
  return m68k_get_reg(c,M68K_REG_D0);
 }
 std::vector<uint8_t> read(uint32_t at,unsigned n){std::vector<uint8_t>v(n);for(unsigned i=0;i<n;i++)v[i]=m.read8(at+i);return v;}
};
}
int main(int argc,char**argv){
 if(argc!=6)return 2;
 try {
  Probe p(bytes(argv[1]),bytes(std::string(argv[2])+"/beat-slicer.mwrm"),std::string(argv[2])+"/probe-symbols.txt");
  auto home=pgm(argv[3]),expected=pgm(argv[4]);require(home.size()==8192&&expected.size()==8192,"bad image inputs");
  const auto homeAt=p.m.read32(0x400bf116),maskAt=p.m.read32(0x400bf11a);
  for(unsigned i=0;i<1024;i++)p.m.write8(homeAt+i,0);
  for(unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++)if(home[y*128+x]>128){auto at=homeAt+x*8+7-y/8;p.m.write8(at,p.m.read8(at)|(1u<<(y%8)));}
  for(unsigned i=0;i<1024;i++)p.m.write8(maskAt+i,0xa5);
  p.m.addWriteWatch(homeAt,homeAt+1023,[&](uint32_t,uint8_t,uint32_t,uint32_t){if(p.watch)++p.homeWrites;});
  p.m.addWriteWatch(maskAt,maskAt+1023,[&](uint32_t,uint8_t,uint32_t,uint32_t){if(p.watch)++p.stockMaskWrites;});
  for(auto name:{"active","captured"})p.m.write32(p.sym(name),1);
  for(auto name:{"dirty","geometry","reply","tempo_source","popup_valid"})p.m.write32(p.sym(name),0);
  p.m.write32(p.sym("spacing"),5);p.m.write32(p.sym("plan"),21);
  p.m.write32(p.sym("view")+28,2880);p.m.write32(p.sym("view")+32,2880);p.m.write32(p.sym("view")+36,0);
  const auto source=p.read(p.sym("view"),808),homeBefore=p.read(homeAt,1024);
  for(unsigned i=0;i<1026;i++)p.m.write8(DEST-1+i,0x13);
  p.call(p.sym("module_draw"),{DEST});
  require(p.m.read8(DEST-1)==0x13&&p.m.read8(DEST+1024)==0x13,"draw escaped unaligned destination");
  auto actual=p.read(DEST,1024);unsigned differences=0;
  std::ofstream image(argv[5],std::ios::binary);image<<"P5\n128 64\n255\n";
  for(unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++){
   const auto v=(actual[x*8+7-y/8]&(1u<<(y%8)))?240:24;image.put(char(v));differences+=v!=expected[y*128+x];
  }
  std::printf("FIRST draw native_frames=%u native_text_calls=%u golden_pixel_differences=%u max_stack_bytes=%u\n",p.frames,p.text,differences,p.stack);
  require(!differences,"compiled module pixels differ from approved UI without SNAP");
  require(p.frames==1&&p.text>0,"native UI was not executed");
  const auto text=p.text,frames=p.frames;
  for(unsigned i=0;i<120;i++)p.call(p.sym("module_draw"),{DEST});
  require(p.text==text&&p.frames==frames&&p.read(DEST,1024)==actual,"idle rerendered or lost cached pixels");
  require(p.call(p.sym("module_enc"),{2,4})==1,"encoder C no longer inert");
  p.call(p.sym("module_draw"),{DEST});require(p.frames==frames&&p.read(DEST,1024)==actual,"encoder C altered current update UI");
  p.watch=false;for(unsigned i=0;i<1024;i++)p.m.write8(homeAt+i,homeBefore[i]^255);p.watch=true;
  p.call(p.sym("module_draw"),{DEST});auto fresh=p.read(DEST,1024),mask=p.read(p.sym("popup_mask"),1024);
  for(unsigned i=0;i<1024;i++)require(fresh[i]==uint8_t(((homeBefore[i]^255)&~mask[i])|(actual[i]&mask[i])),"live home pixels/cache opacity differ");
  require(p.frames==frames&&p.text==text,"home change rerendered popup");
  require(!p.homeWrites&&!p.stockMaskWrites&&p.read(p.sym("view"),808)==source,"UI mutated home planes or sample metadata");
  p.m.write32(p.sym("active"),0);p.call(p.sym("module_draw"),{DEST});require(p.read(DEST,1024)==fresh,"closed UI changed screen");
  std::puts("PASS exact package native UI: approved pixels, 120 cached draws, live home backdrop, inert C, isolated planes/metadata, stack/register/canary guards");
 }catch(const std::exception&e){std::fprintf(stderr,"FAIL %s\n",e.what());return 1;}
}
