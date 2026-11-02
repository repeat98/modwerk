// SPDX-License-Identifier: MIT
// Original two-bank recorder fixtures, using the complete private stock entry.
// Pending bank state is synthetic; this is not panel, ISR or native admission.
#define main bs_prior_recorder_bank_main
#include "recorder_probe.cpp"
#undef main
namespace {
void banks(const std::vector<uint8_t>& image) {
    for(unsigned track:{0u,7u})for(unsigned format:{1u,3u})for(unsigned bank:{0u,1u})
    for(unsigned mode=0;mode<6;++mode) {
        Probe p(image);p.setup(track,format,bank,false);
        auto ticket=bs_guard_writer_begin(&p.guard);require(ticket,"setup ticket refused");
        const auto selected=p.state(track),other=0x80004f1c+84*track+672*(1-bank);
        p.m.write8(selected+2,mode>=4?2:0);
        p.m.write32(selected+24,mode>=4?p.edge-4:0);
        p.m.write8(other+2,mode==1?2:mode>=2?1:0);
        p.m.write32(other+16,mode==3||mode==4?16:mode==5?4:0);
        p.m.write32(other+24,mode==1?97:0);p.m.write32(other+32,3*p.edge);
        // Keep the free entry distinct from both allocated recorder pages.
        p.m.write16(pageList+20,5);p.m.write16(pageList+2*(14602+10),5);
        require(bs_guard_writer_end(&p.guard,ticket),"setup ticket retirement failed");
        p.mapWrites=0;
        unsigned pendingPositionStores=0;
        p.m.addWriteWatch(other+24,other+27,[&](uint32_t,uint8_t,uint32_t,uint32_t){
            ++pendingPositionStores;bs_preview_token token{};
            require(!bs_guard_acquire(&p.guard,&token),"pending-bank position admitted a reader");
        });
        const auto result=p.run(track,0,8);
        auto selectedNow=(p.m.read32(0x80004f18)>>track)&1;
        std::printf("TRACE track=%u format=%u bank=%u mode=%u result=%u selected=%u oldState=%u newState=%u oldPos=%u newPos=%u delay=%u pcm=%u maps=%u pendingStores=%u\n",
            track,format,bank,mode,result,selectedNow,p.m.read8(selected+2),p.m.read8(other+2),
            p.m.read32(selected+24),p.m.read32(other+24),p.m.read32(other+16),p.pcmWrites,p.mapWrites,pendingPositionStores);
        require(!p.mapWrites && !p.dirtyStores && !p.counterStores,"unexpected map/dirty/counter mutation");
        if(mode<2 || mode==3) {
            require(result==UINT32_MAX && !p.pcmWrites && selectedNow==bank,"inactive selected bank wrote PCM or switched");
            require(!pendingPositionStores && !p.m.read32(selected+24),"inactive position changed");
            require(p.m.read8(other+2)==(mode==1?2:mode==3?1:0),"inactive other-bank state changed");
            require(p.m.read32(other+24)==(mode==1?97u:0u),"retained bank position changed");
            require(p.m.read32(other+16)==(mode==3?8u:0u),"pending delay decrement differs");
            for(unsigned b=0;b<8*pageBytes;++b)require(p.m.read8(pool+b)==(b<pageBytes?0:0x5a),"inactive PCM changed");
        }
        if(mode==2) {
            require(result==8 && selectedNow==1-bank && p.m.read8(other+2)==2,"pending bank did not start");
            require(p.m.read32(other+24)==8 && !p.m.read32(selected+24) && pendingPositionStores,"pending positions differ");
            require(p.pcmWrites==8*(format==1?2u:1u),"pending write count differs");
            for(unsigned b=0;b<8*pageBytes;++b) {
                bool written=b>=3*pageBytes && b<3*pageBytes+8*p.width;
                require(p.m.read8(pool+b)==(b<pageBytes||written?0:0x5a),"pending PCM or untouched region differs");
            }
        }
        if(mode==4 || mode==5) {
            require(result==p.edge+4 && selectedNow==bank && p.m.read32(other+16)==(mode==4?8u:4u),"delayed start replaced active bank");
            require(p.m.read32(selected+24)==p.edge+4 && !p.m.read32(other+24) && !pendingPositionStores,"active/delayed positions differ");
            require(p.m.read8(other+2)==1 && p.pcmWrites==8*(format==1?2u:1u),"active/delayed state or stores differ");
            for(unsigned b=0;b<8*pageBytes;++b) {
                bool written=(b>=4*pageBytes-4*p.width && b<4*pageBytes) ||
                             (b>=7*pageBytes && b<7*pageBytes+4*p.width);
                require(p.m.read8(pool+b)==(b<pageBytes||written?0:0x5a),"active PCM or untouched region differs");
            }
        }
        if(mode==3) {
            require(p.run(track,0,8)==UINT32_MAX && p.m.read8(other+2)==1 && !p.m.read32(other+16) && !p.pcmWrites,
                    "pending delay did not reach zero without starting early");
            require(p.run(track,0,8)==8 && p.m.read8(other+2)==2 && p.m.read32(other+24)==8 &&
                    ((p.m.read32(0x80004f18)>>track)&1)==1-bank,"zero-delay follow-up did not start pending bank");
            require(p.pcmWrites==8*(format==1?2u:1u) && pendingPositionStores && !p.mapWrites,
                    "pending follow-up stores differ");
        }
    }
}
}
int main(int argc,char**argv) {
    std::printf("SOURCE_SHA256: %s\n",PROBE_SOURCE_SHA);
    if(argc!=2)return 2;
    std::ifstream in(argv[1],std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in),{}};
    if(image.size()!=1112560)return 2;
    try {banks(image);std::puts("PASS: two-bank recorder fixtures; retained inactive state and pending starts remain distinct");}
    catch(const std::exception&e){std::fprintf(stderr,"FAIL: %s\n",e.what());return 1;}
    return 0;
}
