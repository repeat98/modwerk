// SPDX-License-Identifier: MIT
// Private seeded ColdFire fixture. No RTOS, whole base, USB or DSP proof.
#include <cstdio>
#include <fstream>
#include <vector>
#include <cstdint>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
#include "usb_symbols.h"
constexpr uint32_t STACK=0x47100000, RET=0x47200000, BUF=0x47300000;
constexpr uint32_t FP=0x47400000, BANK=0x400e21e0, PART=BANK+0x8ed80;
static std::vector<uint8_t> bytes(const char *p) {
    std::ifstream f(p,std::ios::binary); return {std::istreambuf_iterator<char>(f),{}};
}
int main(int argc,char **argv) {
    if(argc!=3) return 2;
    auto stock=bytes(argv[1]), module=bytes(argv[2]); if(stock.empty()||module.empty()) return 2;
    ot::Machine m(stock); auto *cpu=m.getCpuState(); unsigned failed=0, calls=0;
    for(unsigned i=0;i<module.size();++i) m.write8(0x47800000+i,module[i]);
    auto check=[&](const char *name,bool good) {std::printf("%s %s\n",good?"PASS":"FAIL",name);if(!good)++failed;};
    auto reg=[&](m68k_register_t r,uint32_t v){m68k_set_reg(cpu,r,v);};
    auto invoke=[&](uint32_t entry,std::vector<uint32_t> args,uint32_t stop=RET,bool abi=true) {
        reg(M68K_REG_SR,0x2700); reg(M68K_REG_SP,STACK); m.write32(STACK,RET);
        for(unsigned i=0;i<args.size();++i) m.write32(STACK+4+4*i,args[i]);
        uint32_t saved[11];
        for(int i=0;i<6;++i) saved[i]=m68k_get_reg(cpu,m68k_register_t(M68K_REG_D2+i));
        for(int i=0;i<5;++i) saved[6+i]=m68k_get_reg(cpu,m68k_register_t(M68K_REG_A2+i));
        reg(M68K_REG_PC,entry); unsigned steps=0;
        while(m.pc()!=stop && steps++<1000000) if(!m.step()) break;
        bool good=m.pc()==stop && m68k_get_reg(cpu,M68K_REG_SP)==STACK+(stop==RET?4:0);
        if(abi) {
            for(int i=0;i<6;++i) good&=saved[i]==m68k_get_reg(cpu,m68k_register_t(M68K_REG_D2+i));
            for(int i=0;i<5;++i) good&=saved[6+i]==m68k_get_reg(cpu,m68k_register_t(M68K_REG_A2+i));
        }
        if(!good) std::printf("entry=%08x pc=%08x steps=%u %s\n",entry,m.pc(),steps,m.why().c_str());
        ++calls; if(!good) ++failed; return good;
    };
    m.write32(0x46c82456,BANK); m.write8(0x100b14cf,0); m.write8(0x8000004c,0);
    m.write8(PART+0x22,1);m.write8(PART+60,'S');m.write8(PART+61,'W');m.write8(PART+62,1);
    check("claim only SW/1 FLEX owner",invoke(SYM_sw_usb_claim,{0})&&m68k_get_reg(cpu,M68K_REG_D0)==1);
    check("neighbour sample not claimed",invoke(SYM_sw_usb_claim,{1})&&m68k_get_reg(cpu,M68K_REG_D0)==0);
    m.write32(0x46c82456,0x46000000);m.write8(0x4608ed80+0x22,1);
    m.write8(0x4608ed80+60,'S');m.write8(0x4608ed80+61,'W');m.write8(0x4608ed80+62,1);
    check("claim also accepts alternate SDRAM arena",invoke(SYM_sw_usb_claim,{0})&&m68k_get_reg(cpu,M68K_REG_D0)==1);
    m.write32(0x46c82456,0x47f00000);
    check("invalid bank rejected before read",invoke(SYM_sw_usb_claim,{0})&&m68k_get_reg(cpu,M68K_REG_D0)==0);
    m.write32(0x46c82456,BANK);
    bool claim_range=true;
    for(unsigned t=0;t<8;++t) {
        m.write8(PART+0x22+t,1); m.write8(PART+60+30*t,'S');m.write8(PART+61+30*t,'W');m.write8(PART+62+30*t,1);
        claim_range&=invoke(SYM_sw_usb_claim,{t})&&m68k_get_reg(cpu,M68K_REG_D0)==1;
        m.write8(PART+60+30*t,'X');
    }
    check("all eight track claims and CPU callee registers",claim_range);
    m.write8(PART+60,'S');
    reg(M68K_REG_D2,0);m.write8(0x8000004c,7);
    check("chromatic predicate uses event track, not selected track",invoke(SYM_sw_usb_claim_chromatic,{})&&m68k_get_reg(cpu,M68K_REG_D0)==1);
    // Native MIDI-on continuation writes the lock, held note and gate. Stop
    // before the RTOS live-recording notification, outside this fixture.
    constexpr uint32_t NOTE=0x47400100, HELD=0x47400200, MAIL=0x46c80354;
    m.write8(NOTE,84); m.write8(HELD,0xff); m.write8(0x46c7fb08,0);
    reg(M68K_REG_D2,0);reg(M68K_REG_A3,NOTE);reg(M68K_REG_A2,HELD);
    reg(M68K_REG_D4,FP);reg(M68K_REG_D5,1);reg(M68K_REG_A5,MAIL);
    bool midi=invoke(SYM_sw_usb_midi_on,{},0x4000e76c,false);
    check("MIDI 84 -> TUNE 64 with native held note/gate",midi&&m.read8(FP)==64&&m.read8(HELD)==84&&m.read32(MAIL)==29&&(m.read8(0x46c7fb08)&1));
    const unsigned knobs[6]={64,85,127,6,127,80};
    auto render=[&](unsigned start,unsigned end,unsigned ping=0) {
        m.write32(0x800062a8,FP);m.write32(0x80001c80,BUF);
        for(unsigned i=0;i<6;++i) m.write16(FP+2*i,knobs[i]*256);
        uint32_t a=0x80000110+ping*512;
        m.write16(a,0);m.write16(a+2,0x7f00);m.write16(a+4,0x1400);
        m.write32(BUF+16+8*(end-start),0x12345678);
        bool ok=invoke(SYM_sw_usb_render,{0,ping,start,end});
        ok&=m.read32(BUF)==end-start&&m.read32(BUF+4)==start&&m.read32(BUF+8)==0x4000000&&m.read32(BUF+12)==start<<26;
        ok&=m.read32(0x80001c80)==BUF+16+8*(end-start)&&m.read32(BUF+16+8*(end-start))==0x12345678;
        for(unsigned i=0;i<6;++i) ok&=m.read16(FP+2*i)==knobs[i]*256;
        if(end==16) ok&=m.read16(a)==0&&m.read16(a+2)==0x7f00&&m.read16(a+4)==0x7f00;
        if(!ok) ++failed; return ok;
    };
    m.write32(0x800065b8,1);
    invoke(SYM_sw_usb_start,{0,0,0});
    bool packets=true; uint64_t energy=0;
    for(unsigned f=0;f<100;++f) {
        packets&=render(0,16,f&1);
        for(unsigned i=0;i<32;++i) {int32_t x=int32_t(m.read32(BUF+16+4*i))/65536;energy+=int64_t(x)*x;}
    }
    check("native renderer outputs audio, headers/cursor/AMP and FP restoration",packets&&energy>1000000);
    auto off=[&](unsigned note) {
        m.write8(NOTE,note);reg(M68K_REG_D2,0);reg(M68K_REG_D3,1);
        reg(M68K_REG_A0,HELD);reg(M68K_REG_A3,NOTE);reg(M68K_REG_A2,MAIL);
        return invoke(SYM_sw_usb_midi_off,{},0x4000dff8,true);
    };
    check("old MIDI note-off does not clear held note",off(80)&&m.read8(HELD)==84);
    render(0,16); bool sounding=false;
    for(unsigned i=0;i<32;++i) sounding|=m.read32(BUF+16+4*i)!=0;
    check("old MIDI note-off leaves new voice sounding",sounding);
    check("matched MIDI-off keeps native mailbox/gate semantics",off(84)&&m.read8(HELD)==255&&m.read32(MAIL)==64&&!(m.read8(0x46c7fb08)&1));
    for(unsigned f=0;f<1024;++f) render(0,16);
    bool silent=true;for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("matching MIDI note-off finishes at exact source zero",silent);
    // Warm START after release, then all possible event split offsets.
    invoke(SYM_sw_usb_start,{0,0,0});
    bool splits=true;
    for(unsigned s=0;s<=16;++s) {splits&=render(0,s);if(s<16)splits&=render(s,16);}
    check("native packet split offsets 0 through 16",splits);
    auto chrom_off=[&](unsigned key,bool matches) {
        m.write8(0x460d171d,13);reg(M68K_REG_D2,0);
        reg(M68K_REG_A0,0x460d171d);reg(M68K_REG_A2,key);
        return invoke(SYM_sw_usb_chrom_release,{},matches?0x4004fbee:0x4004fd68,false);
    };
    check("old chromatic key release follows native mismatch path",chrom_off(11,false));
    render(0,16);sounding=false;
    for(unsigned i=0;i<32;++i) sounding|=m.read32(BUF+16+4*i)!=0;
    check("old chromatic key release preserves new voice",sounding);
    check("matching chromatic release follows native accepted path",chrom_off(12,true)&&m68k_get_reg(cpu,M68K_REG_D3)==0);
    for(unsigned f=0;f<1024;++f) render(0,16);
    silent=true;for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("matching chromatic release finishes at exact source zero",silent);
    invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    m.write32(0x800065b8,0);render(0,16);
    silent=true;for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("playing-to-stopped transport kills source",silent);
    invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    invoke(SYM_sw_usb_tail_kill,{0,0});render(0,16);
    silent=true;for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("STOP tail-kill callback kills manual source while transport already stopped",silent);
    invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    invoke(SYM_sw_usb_voice_reset,{0});render(0,16);
    silent=true;for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("native voice reset notification kills source with transport already zero",silent);
    invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    invoke(SYM_sw_usb_voice_reset,{0});invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    sounding=false;for(unsigned i=0;i<32;++i) sounding|=m.read32(BUF+16+4*i)!=0;
    check("new START after native voice reset sounds",sounding);
    m.write8(0x46100b1d,0x20);
    check("FUNC+STOP key notification passes through",invoke(SYM_sw_usb_key,{0x27,1})&&m68k_get_reg(cpu,M68K_REG_D0)==0);
    render(0,16);sounding=false;
    for(unsigned i=0;i<32;++i) sounding|=m.read32(BUF+16+4*i)!=0;
    check("FUNC+STOP leaves manual voice sounding",sounding);
    m.write8(0x46100b1d,0);
    check("STOP key notification passes through",invoke(SYM_sw_usb_key,{0x27,1})&&m68k_get_reg(cpu,M68K_REG_D0)==0);
    render(0,16);silent=true;
    for(unsigned i=0;i<32;++i) silent&=m.read32(BUF+16+4*i)==0;
    check("STOP key notification kills manual source with transport already zero",silent);
    invoke(SYM_sw_usb_start,{0,0,0});render(0,16);
    invoke(SYM_sw_usb_key,{0x27,0});render(0,16);sounding=false;
    for(unsigned i=0;i<32;++i) sounding|=m.read32(BUF+16+4*i)!=0;
    check("STOP key release does not kill a later note",sounding);
    reg(M68K_REG_A2,12); invoke(SYM_sw_usb_chrom_pitch,{},RET,false);
    check("chromatic key 12 -> raw 64",m68k_get_reg(cpu,M68K_REG_A2)==64);
    std::printf("RESULT failures=%u calls=%u; seeded ColdFire only; no RTOS/base/USB/DSP/hardware\n",failed,calls);
    return failed?1:0;
}
