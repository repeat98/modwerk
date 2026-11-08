// SPDX-License-Identifier: MIT
// Original recorder-stop/queued-worker fixture. Private stock stays external.
// Host guard observations and optional compiled worker observer are distinct.
#define main bs_prior_recorder_probe_main
#include "recorder_probe.cpp"
#undef main
#include <map>
#include <sstream>
namespace {
using Symbols=std::map<std::string,uint32_t>;
constexpr uint32_t engineQueue=0x460d17ce,uiQueue=0x460d17ae;
constexpr uint32_t workerEntry=0x4008445c,workerLoop=0x4008484e,eventWait=0x40000818;
constexpr uint32_t workerStack=0x47110000;
std::vector<uint8_t> bytes(Probe& p,uint32_t address,unsigned count) {
    std::vector<uint8_t> out(count);
    for(unsigned i=0;i<count;++i)out[i]=p.m.read8(address+i);
    return out;
}
void installObserver(Probe& p,const std::vector<uint8_t>& binary,const Symbols& symbols) {
    auto base=symbols.at("bs_guard_init");
    require(base==0x47040000 && !binary.empty() && binary.size()<0x10000,"observer extent differs");
    for(unsigned i=0;i<binary.size();++i)p.m.write8(base+i,binary[i]);
    p.reg(M68K_REG_SR,0x2000);p.reg(M68K_REG_SP,stack);p.m.write32(stack,stop);
    p.reg(M68K_REG_PC,symbols.at("bs_worker_test_init"));
    unsigned steps=0;
    while(p.m.pc()!=stop && ++steps<100000)require(p.m.step(),"observer init stopped");
    require(p.m.pc()==stop && p.reg(M68K_REG_SP)==stack+4 && p.reg(M68K_REG_D0)==0,"observer init failed");
    require(p.m.read16(0x40084854)==0x4eb9 && p.m.read32(0x40084856)==0x40000d00,"stock receive call differs");
    p.m.write32(0x40084856,symbols.at("bs_worker_test_entry"));
}
void followup(const std::vector<uint8_t>& image,unsigned track,unsigned format,unsigned bank,unsigned mode,
              const std::vector<uint8_t>& binary,const Symbols& symbols) {
    Probe p(image);p.setup(track,format,bank,mode<2);
    p.m.write32(0x46105408,1);p.m.write32(0x80006914,pageList);p.m.write32(0x80006918,0x46c2e580);
    if(mode==0)p.m.write32(0x80006920,10);
    else if(mode==1)p.m.write8(0x80000052,0);
    else {
        p.m.write32(p.state(track)+32,p.edge-(mode==3?2:0));
        // Keep the one synthetic free page distinct from both preallocated pages.
        auto setupTicket=bs_guard_writer_begin(&p.guard);require(setupTicket,"setup exclusion refused");
        p.m.write16(pageList+20,5);p.m.write16(pageList+2*(14602+10),5);
        require(bs_guard_writer_end(&p.guard,setupTicket) && p.mapWrites==2,"setup map observations differ");
        p.mapWrites=0; // Count the recorder/worker scenario separately from fixture construction.
    }
    const unsigned pages=mode<2?1:2,tailStores=14602-pages;
    const unsigned published=mode==3?p.edge-2:p.edge;
    const unsigned recordStores=mode<2?0:(mode==3?2:4)*(format==1?2:1);
    require(p.run(track,0,8)==(mode<2?0:published),"recorder stop result differs");
    require(p.m.read32(engineQueue+4)==1 && p.m.read32(uiQueue+4)==(mode<2?1u:0u),"stop notifications differ");
    auto record=p.m.read32(scratch+0x2000);
    require(record==0x46104d52+8*track && p.m.read8(record)==34 &&
            p.m.read16(record+2)==track,"queued stop identity differs");
    require(p.m.read8(p.state(track)+2)==0 && p.m.read32(p.state(track)+24)==0 &&
            p.m.read32(0x46c802c8+4*track)==published,"stopped recorder state differs");
    require(p.pcmWrites==recordStores && !p.mapWrites && !p.dirtyStores && !p.counterStores,"recorder stop writes differ");
    const auto pcmBefore=bytes(p,pool,8*pageBytes),mapsBefore=bytes(p,pageList,2*14602*10);
    const auto controlsBefore=bytes(p,0x46c922c4,44*136),countsBefore=bytes(p,0x46c75e88,2*136);
    const auto stateBefore=bytes(p,0x80004f1c,84*8*2),freeBefore=bytes(p,0x8000691c,8);
    bool dispatching=false;unsigned mapStores=0,initialStores=0,controlStores=0;
    const bool native=!binary.empty();
    auto guardWord=[&](unsigned word){return p.m.read32(symbols.at("bs_worker_test_guard")+4*word);};
    auto nativeTicket=[&](){return p.m.read32(symbols.at("bs_worker_test_boundary")+20);};
    if(native)installObserver(p,binary,symbols);
    p.m.addWriteWatch(pageList,pageList+2*14602*10-1,[&](uint32_t addr,uint8_t size,uint32_t value,uint32_t pc){
        if(!dispatching){++initialStores;return;}
        require(addr>=p.row(track,pages) && addr<=p.row(track,14601) && !(addr&1) && size==2 && value==0,
                "follow-up changed another map or wrote unexpected data");
        require(pc==0x40095afc,"follow-up map-store instruction differs");
        require(!p.m.read32(engineQueue+4),"queued command still counted during map stores");
        if(native)require(nativeTicket() && guardWord(4)==nativeTicket() && guardWord(0)!=1 &&
                          guardWord(2) && !guardWord(3),"compiled observer admitted a map store");
        ++mapStores;
    });
    p.m.addWriteWatch(0x46c922c4,0x46c922c4+44*136-1,[&](uint32_t,uint8_t,uint32_t,uint32_t){++controlStores;});
    bs_preview_token old{};require(bs_guard_acquire(&p.guard,&old),"pre-worker token refused");
    auto ticket=bs_guard_writer_begin(&p.guard);require(ticket && !bs_guard_valid(&p.guard,&old),"host observer did not retire token");
    p.reg(M68K_REG_SR,0x2000);p.reg(M68K_REG_SP,workerStack);p.m.write32(workerStack,stop);
    p.reg(M68K_REG_PC,workerEntry);
    unsigned steps=0;uint32_t loopSp=0,loopFp=0;
    while(++steps<2000000) {
        if(p.m.pc()==workerLoop) {
            if(dispatching)break;
            dispatching=true;loopSp=p.reg(M68K_REG_SP);loopFp=p.reg(M68K_REG_A6);
        }
        if(!p.m.step())throw std::runtime_error("CPU stopped: "+p.m.why());
    }
    require(dispatching && p.m.pc()==workerLoop && p.reg(M68K_REG_SP)==loopSp &&
            p.reg(M68K_REG_A6)==loopFp && p.reg(M68K_REG_SR)>>8==0x20,"worker return/stack/mask differs");
    require(!initialStores && mapStores==tailStores && p.mapWrites==tailStores,"startup and follow-up map stores differ");
    require(!controlStores && p.pcmWrites==recordStores && !p.dirtyStores && !p.counterStores,"follow-up wrote PCM or controls");
    require(bytes(p,pool,8*pageBytes)==pcmBefore && bytes(p,pageList,2*14602*10)==mapsBefore &&
            bytes(p,0x46c922c4,44*136)==controlsBefore && bytes(p,0x46c75e88,2*136)==countsBefore &&
            bytes(p,0x80004f1c,84*8*2)==stateBefore && bytes(p,0x8000691c,8)==freeBefore,
            "follow-up changed a preserved region");
    require(!p.m.read32(engineQueue+4) && p.m.read32(uiQueue+4)==(mode<2?1u:0u),"follow-up queue consumption differs");
    if(native) {
        require(nativeTicket() && guardWord(4)==nativeTicket(),"observer retired before next receive");
        require(!p.m.read32(symbols.at("bs_worker_test_boundary")+28),"observer faulted");
        unsigned waiting=0;
        do{require(p.m.step(),"CPU stopped before wait");}while(p.m.pc()!=eventWait && ++waiting<10000);
        require(p.m.pc()==eventWait && !nativeTicket() && !guardWord(4) && guardWord(2) && !guardWord(3),
                "observer did not retire before empty-queue wait");
        require((p.reg(M68K_REG_SR)&0x700)!=0x700 && p.m.read32(p.reg(M68K_REG_SP)+4)==engineQueue+8,
                "observer waited masked or on the wrong event");
    }
    require(bs_guard_writer_end(&p.guard,ticket) && !bs_guard_valid(&p.guard,&old),"host token revived");
    bs_preview_token fresh{};require(bs_guard_acquire(&p.guard,&fresh) && fresh.operation>old.operation,"fresh token refused");
}
// Two complete recorder calls enqueue distinct per-track records before the
// worker runs. This is serialized synthetic setup, not simultaneous audio ISR.
void pairedFollowups(const std::vector<uint8_t>& image,unsigned format,unsigned bank,
                     const std::vector<uint8_t>& binary,const Symbols& symbols) {
    Probe p(image);p.setup(0,format,bank,true);
    auto setup=bs_guard_writer_begin(&p.guard);require(setup,"paired setup exclusion refused");
    p.m.write32(0x46105408,1);p.m.write32(0x80006914,pageList);p.m.write32(0x80006918,0x46c2e580);
    p.m.write32(0x80004f18,bank?0x81:0);p.m.write32(0x80006920,10);
    p.m.write32(0x46c922c4+44*135,format);p.m.write32(0x46c922c4+44*135+20,41);
    p.m.write8(p.state(7)+2,2);p.m.write32(p.state(7)+24,p.edge-4);p.m.write32(p.state(7)+32,3*p.edge);
    p.m.write16(p.row(7,0),4);p.m.write16(p.row(7,1),0);
    p.m.write16(0x46c75e88+2*135,1);p.m.write32(0x461053a8+4*7,1);
    require(bs_guard_writer_end(&p.guard,setup) && p.mapWrites==2,"paired setup observations differ");
    p.mapWrites=0;
    require(p.run(0,0,8)==0 && p.run(7,0,8)==0,"paired recorder shortage differs");
    require(p.m.read32(engineQueue+4)==2 && p.m.read32(uiQueue+4)==2,"paired stop queues differ");
    for(unsigned i=0;i<2;++i) {
        unsigned track=i?7:0;auto record=p.m.read32(scratch+0x2000+4*i);
        require(record==0x46104d52+8*track && p.m.read8(record)==34 && p.m.read16(record+2)==track,
                "paired queued identity was replaced or reordered");
        require(!p.m.read8(p.state(track)+2) && !p.m.read32(p.state(track)+24) &&
                p.m.read32(0x46c802c8+4*track)==p.edge,"paired stop publication differs");
    }
    require(!p.pcmWrites && !p.mapWrites && !p.dirtyStores && !p.counterStores,"paired shortage changed source bytes");
    const auto pcmBefore=bytes(p,pool,8*pageBytes),mapsBefore=bytes(p,pageList,2*14602*10);
    const auto controlsBefore=bytes(p,0x46c922c4,44*136),countsBefore=bytes(p,0x46c75e88,2*136);
    const auto stateBefore=bytes(p,0x80004f1c,84*8*2),freeBefore=bytes(p,0x8000691c,8);
    const bool native=!binary.empty();if(native)installObserver(p,binary,symbols);
    auto guardWord=[&](unsigned word){return p.m.read32(symbols.at("bs_worker_test_guard")+4*word);};
    auto nativeTicket=[&](){return p.m.read32(symbols.at("bs_worker_test_boundary")+20);};
    unsigned current=2,mapStores[2]={0,0},initialStores=0,controlStores=0;
    uint32_t firstTicket=0,firstRevision=0;
    p.m.addWriteWatch(pageList,pageList+2*14602*10-1,[&](uint32_t addr,uint8_t size,uint32_t value,uint32_t pc){
        if(current==2){++initialStores;return;}
        unsigned track=current?7:0;
        require(addr>=p.row(track,1) && addr<=p.row(track,14601) && !(addr&1) && size==2 && value==0 &&
                pc==0x40095afc,"paired command wrote another recorder or unexpected data");
        require(p.m.read32(engineQueue+4)==1-current,"paired command queue count differs during stores");
        if(native) {
            require(nativeTicket() && guardWord(4)==nativeTicket() && guardWord(2) && !guardWord(3),
                    "native paired command admitted a store");
            if(current)require(nativeTicket()>firstTicket && guardWord(0)>firstRevision,"paired command reused guard identity");
        }
        ++mapStores[current];
    });
    p.m.addWriteWatch(0x46c922c4,0x46c922c4+44*136-1,[&](uint32_t,uint8_t,uint32_t,uint32_t){++controlStores;});
    bs_preview_token old{};require(bs_guard_acquire(&p.guard,&old),"paired pre-worker token refused");
    auto ticket=bs_guard_writer_begin(&p.guard);require(ticket,"paired worker exclusion refused");
    p.reg(M68K_REG_SR,0x2000);p.reg(M68K_REG_SP,workerStack);p.m.write32(workerStack,stop);p.reg(M68K_REG_PC,workerEntry);
    unsigned steps=0;
    while(p.m.pc()!=workerLoop && ++steps<2000000)require(p.m.step(),"paired worker startup stopped");
    require(p.m.pc()==workerLoop && !initialStores,"paired startup map writes differ");
    const auto loopSp=p.reg(M68K_REG_SP),loopFp=p.reg(M68K_REG_A6);
    for(current=0;current<2;++current) {
        steps=0;do{require(p.m.step(),"paired worker stopped");}while(p.m.pc()!=workerLoop && ++steps<2000000);
        require(p.m.pc()==workerLoop && p.reg(M68K_REG_SP)==loopSp && p.reg(M68K_REG_A6)==loopFp &&
                p.reg(M68K_REG_SR)>>8==0x20,"paired loop stack/frame/mask differs");
        require(mapStores[current]==14601 && p.m.read32(engineQueue+4)==1-current,"paired map/queue result differs");
        if(!current)require(!mapStores[1] && p.m.read16(p.row(7,0))==4,"first command touched companion");
        if(native) {
            require(nativeTicket() && guardWord(4)==nativeTicket() && !p.m.read32(symbols.at("bs_worker_test_boundary")+28),
                    "paired native observer retired early or faulted");
            if(!current){firstTicket=nativeTicket();firstRevision=guardWord(0);}
        }
    }
    require(p.mapWrites==29202 && !controlStores && !p.pcmWrites && !p.dirtyStores && !p.counterStores,
            "paired follow-up mutation counts differ");
    require(bytes(p,pool,8*pageBytes)==pcmBefore && bytes(p,pageList,2*14602*10)==mapsBefore &&
            bytes(p,0x46c922c4,44*136)==controlsBefore && bytes(p,0x46c75e88,2*136)==countsBefore &&
            bytes(p,0x80004f1c,84*8*2)==stateBefore && bytes(p,0x8000691c,8)==freeBefore,
            "paired follow-ups changed a preserved region");
    require(!p.m.read32(engineQueue+4) && p.m.read32(uiQueue+4)==2,"paired UI queue differs");
    if(native) {
        steps=0;do{require(p.m.step(),"paired wait stopped");}while(p.m.pc()!=eventWait && ++steps<10000);
        require(p.m.pc()==eventWait && !nativeTicket() && !guardWord(4) && guardWord(2) && !guardWord(3) &&
                (p.reg(M68K_REG_SR)&0x700)!=0x700,"paired observer did not retire before unmasked wait");
        require(p.m.read32(p.reg(M68K_REG_SP)+4)==engineQueue+8,"paired observer waited on another event");
    }
    require(bs_guard_writer_end(&p.guard,ticket) && !bs_guard_valid(&p.guard,&old),"paired old token revived");
    bs_preview_token fresh{};require(bs_guard_acquire(&p.guard,&fresh) && fresh.operation>old.operation,"paired new token refused");
}
}
int main(int argc,char **argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2 && argc!=4)return 2;
    std::ifstream in(argv[1],std::ios::binary);std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try {
        std::vector<uint8_t> binary;Symbols symbols;
        if(argc==4) {
            std::ifstream code(argv[2],std::ios::binary),names(argv[3]);binary.assign(std::istreambuf_iterator<char>(code),{});
            std::string line,address,type,name;
            while(std::getline(names,line)){std::istringstream row(line);if(row>>address>>type>>name)symbols[name]=uint32_t(std::stoul(address,nullptr,16));}
            require(!binary.empty(),"missing observer binary");
        }
        // Positive controls for the inherited PCM/map watches, including actual
        // nonzero page-allocation stores, remain the original 16 recorder cases.
        boundary(image,false);boundary(image,true);
        unsigned cases=0;
        for(unsigned track:{0u,7u})for(unsigned format:{1u,3u})for(unsigned bank:{0u,1u})for(unsigned mode:{0u,1u,2u,3u}) {
            followup(image,track,format,bank,mode,binary,symbols);++cases;
        }
        for(unsigned format:{1u,3u})for(unsigned bank:{0u,1u})pairedFollowups(image,format,bank,binary,symbols);
        std::puts("PASS: four paired-recorder FIFO cases; tracks 1/8 keep distinct pending records and map extents; post-stop PCM, controls and allocation state preserved");
        std::printf("PASS: %u recorder follow-ups; 16/24-bit, tracks 1/8, both banks; exhausted/disabled allocation and two length-limited stops; 14601/14600 zero tail-map stores; post-stop PCM/controls/counts/state/free cursors unchanged\n",cases);
        std::puts(argc==4?"PASS: compiled worker observer covers every follow-up map store and retires before unmasked queue wait":"PASS: host observer covers complete follow-up dispatch; startup writes distinguished; original recorder positive controls pass");
    } catch(const std::exception& e){std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
