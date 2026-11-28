// SPDX-License-Identifier: MIT
// In-memory USB controller exercised over process stdin/stdout. No sockets,
// physical USB API or network. Native models from Octabam (Sam Banks, MIT).
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <vector>
#include <string>
#include <memory>
#include "machine.h"
#include "rtos.h"
#include "card.h"
#include "usb.h"
#include "periph.h"
#include "dsp.h"
static std::vector<uint8_t> read(const char *p) {
 std::ifstream in(p,std::ios::binary);return {std::istreambuf_iterator<char>(in),{}};
}
static bool privateOutput(const std::string &path,const char *mainName) {
 if(path.find("/../")!=std::string::npos)return false;
 if(path.rfind("/tmp/supersaw-v031-",0)==0)return true;
 const std::string mainPath=mainName;
 const auto baseSlash=mainPath.find_last_of('/');
 if(baseSlash==std::string::npos||baseSlash==0)return false;
 const auto workSlash=mainPath.find_last_of('/',baseSlash-1);
 if(workSlash==std::string::npos)return false;
 const auto root=mainPath.substr(0,workSlash+1);
 return root.find("private-supersaw-v032/")!=std::string::npos&&path.rfind(root,0)==0;
}
int main(int argc,char **argv) {
 if(argc!=3&&argc!=4)return 2;setvbuf(stdout,nullptr,_IONBF,0);
 const bool frame=argc==4;
 auto image=read(argv[1]);ot::Machine m(image);uint8_t gpio=0;
 std::unique_ptr<ot::DspPair> dsp;
 if(argc==4&&std::string(argv[3])=="--dsp"){
  // Interpreter: the host's vendored memory has no MMU backing for the JIT
  // workers. This keeps both DSP cores, without relying on worker timing.
  dsp=std::make_unique<ot::DspPair>(ot::DspPair::g_dspIps/ot::DspPair::g_cfIps,ot::DspPair::g_dspIps,false);
  m.setCoprocessor(dsp.get());
 }
 m.addWriteWatch(0xfc0a403a,0xfc0a403a,[&](uint32_t,uint8_t,uint32_t v,uint32_t){gpio|=uint8_t(v);});
 m.addWriteWatch(0xfc0a4052,0xfc0a4052,[&](uint32_t,uint8_t,uint32_t v,uint32_t){gpio&=uint8_t(v);});
 m.setOverrideFn(0xfc0a403a,[&]()->uint32_t{return gpio&0x20?gpio|0x40:gpio&~0x40;});
 // The complete USB-audio base and interpreted DSP upload can exceed the
 // smaller profile's host instruction allowance. This only bounds the
 // harness boot; guest code, clocks and admission checks stay unchanged.
 const auto bootStop=m.run(150000000);
 if(bootStop!=ot::Machine::Stop::Handoff){
  std::fprintf(stderr,"boot failed: stop=%u pc=%08x reason=%s\n",unsigned(bootStop),m.getPC(),m.why().c_str());
  return 3;
 }
 ot::Rtos r(m);
 // A valid fixed RTC avoids stock's SET DATE/TIME modal swallowing panel
 // keys. The default loopback clock represents month/day zero.
 r.dspi().setRtcClock(ot::Dspi::RtcClock::Fixed,1794697200);
 ot::MkiiPanel panel(r.uartA(),image[0x400d81a4-ot::Machine::g_imageBase+3]);
 r.uartA().setFarEnd([&](uint8_t b){panel(b);});
 ot::AtaCard card(read(argv[2]));r.attachCard(card);
 ot::UsbDevice usb([&](uint32_t a){return m.read8(a);},[&](uint32_t a,uint8_t b){m.write8(a,b);});
 r.attachUsb(usb);r.install();
 if(dsp)r.setFrameFromDsp(true);
 if(r.run(3000)!=ot::Rtos::Stop::Gate)return 4;
 auto load=r.loadProjectLive("MODWERK","TEMPLATE",20000,3000,false);
 std::printf("project ready=%u posted=%u part=%08x stop=%u handled=%u ms=%.1f reason=%s\n",
  load.ready,load.posted,load.partPtr,unsigned(load.stop),unsigned(load.handlerEntered),load.ms,load.stopWhy.c_str());
 if(!load.ready||!load.posted||!load.handlerEntered||load.stop!=ot::Rtos::Stop::Gate)return 5;
 if(frame)r.setFrame(true);
 auto good=[](ot::Rtos::Stop s){return s==ot::Rtos::Stop::Gate||s==ot::Rtos::Stop::Time;};
 if(!good(r.run(1500,false)))return 6;
 std::puts("@ready");
 std::string line;
 while(std::getline(std::cin,line)) {
  std::istringstream in(line);std::string cmd;in>>cmd;std::string reply;
  if(cmd=="card-save"){
   std::string path;std::getline(in>>std::ws,path);
   // Private fixture export only, never a mounted device or user card path.
   if(!privateOutput(path,argv[1]))
    reply="err private fixture export path required";
   else{
    std::ofstream out(path,std::ios::binary);const auto &bytes=card.image();
    out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());
    reply=out.good()?"card "+std::to_string(bytes.size())+" "+std::to_string(card.sectorsWritten()):"err card export failed";
   }
  }else if(cmd=="panel-func-stop"){
   r.panelIn({0x25,0x20});r.run(80,false);
   r.panelIn({0x24,0x80});r.run(80,false);
   r.panelIn({0x24,0});r.run(80,false);
   r.panelIn({0x25,0});r.run(100,false);reply="ok";
  }else if(cmd=="panel-stop"||cmd=="panel-play"){
   // Native MKII panel UART: row 0x24, bit 7. The firmware itself
   // dispatches the key and posts its transport/all-off commands.
   uint8_t row=cmd=="panel-stop"?0x24:0x25;
   uint8_t mask=cmd=="panel-stop"?0x80:0x01;
   r.panelIn({row,mask});r.run(80,false);
   r.panelIn({row,0});r.run(100,false);reply="ok";
  }else if(cmd=="midi"){
   std::string hex;in>>hex;std::vector<uint8_t> bytes;
   for(size_t i=0;i+1<hex.size();i+=2)bytes.push_back(uint8_t(std::stoul(hex.substr(i,2),nullptr,16)));
   r.midiIn(bytes);reply="ok";
  }else if(cmd=="audio-start"){
   if(dsp){dsp->setAudioStream(ot::DspPair::StreamMode::Main);reply="ok";}else reply="err no DSP";
  }else if(cmd=="audio-save"){
   std::string path;std::getline(in>>std::ws,path);
   if(!dsp||!privateOutput(path,argv[1]))reply="err private DSP capture path required";
   else{
    std::vector<int16_t> pcm;dsp->takeAudioStream(pcm,ot::DspPair::g_streamCapFrames);
    unsigned peak=0,tail=0;
    for(size_t i=0;i<pcm.size();++i){unsigned a=unsigned(pcm[i]<0?-int(pcm[i]):int(pcm[i]));peak=std::max(peak,a);if(i+8820>=pcm.size())tail=std::max(tail,a);}
    std::ofstream wav(path,std::ios::binary);
    auto u16=[&](uint16_t v){wav.put(char(v));wav.put(char(v>>8));};
    auto u32=[&](uint32_t v){u16(uint16_t(v));u16(uint16_t(v>>16));};
    wav.write("RIFF",4);u32(uint32_t(36+2*pcm.size()));wav.write("WAVEfmt ",8);u32(16);u16(1);u16(2);u32(44100);u32(176400);u16(4);u16(16);wav.write("data",4);u32(uint32_t(2*pcm.size()));
    for(auto v:pcm)u16(uint16_t(v));
    reply=wav.good()?"audio "+std::to_string(pcm.size()/2)+" "+std::to_string(peak)+" "+std::to_string(tail):"err capture write failed";
   }
  }else if(cmd=="advance") {unsigned ms;in>>ms;reply=good(r.run(ms,false))?"ok":"err "+r.why();}
  else if(cmd=="peek") {
   std::string addr;unsigned n;in>>addr>>n;uint32_t at=uint32_t(std::stoul(addr,nullptr,0));
   if(n>4096||!m.mapped(at,n))reply="err invalid peek";
   else {reply="peek ";const char *hex="0123456789abcdef";for(unsigned i=0;i<n;++i){auto b=m.read8(at+i);reply+=hex[b>>4];reply+=hex[b&15];}}
  } else if(cmd=="call") {
   std::string addr,a;in>>addr;std::vector<uint32_t> args;
   while(in>>a)args.push_back(uint32_t(std::stoul(a,nullptr,0)));
   uint32_t result=0;bool ok=r.runToMainSpin()==ot::Rtos::Stop::Gate&&r.callAsMain(uint32_t(std::stoul(addr,nullptr,0)),args,result,200000000);
   reply=ok?"call "+std::to_string(result):"err "+r.why();
  } else {
   bool done=false;usb.command(line,[&](const std::string &v){reply=v;done=true;});
   if(!done)r.runUntil(60000,[&]{return done;});
   if(!done)reply="err emulated transfer did not complete: "+r.why();
  }
  while(!reply.empty()&&(reply.back()=='\n'||reply.back()=='\r'))reply.pop_back();
  std::printf("@reply %s\n",reply.c_str());
  if(!good(r.run(1,false)))return 7;
 }
 return 0;
}
