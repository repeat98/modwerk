#include <assert.h>
#include <stdint.h>
#include <stdio.h>
static uint32_t timer;
#define OG_CPU_TIMER() timer
#include "cpu_profile.c"
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
static void add_phase(unsigned index,uint32_t ticks) {
    uint32_t at=timer;
    timer+=ticks;og_cpu_grain_phase_end(index,at);
}
#endif
int main(void) {
    struct modwerk_runtime_api api={0};
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    /* Each cumulative counter wraps during the first measured window. */
    for (unsigned k=0;k<4;++k) grain_phase[k]=UINT32_MAX-1023u;
#endif
    timer=0xffff0000u;og_cpu_publish(&api); /* baseline near timer wrap */
    uint32_t at=og_cpu_render_begin(16);
    timer+=100;uint32_t flex=timer;timer+=300;og_cpu_flex_end(flex);
    uint32_t grain=timer;timer+=600;og_cpu_grain_end(grain,32);
    uint32_t phase=timer;timer+=40;og_cpu_grain_phase_end(OG_CPU_GRAIN_MIX,phase);
    og_cpu_context(0,64,86,64,3);timer+=100;og_cpu_render_end(at);
    assert(sequence==2 && sums[TOTAL]==1140 && sums[FLEX]==300 && sums[GRAIN]==600);
    assert(sums[SOURCES]==32 && sums[OUTPUTS]==16 && sums[MAX_CHUNK]==32);
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    assert(grain_phase[OG_CPU_GRAIN_MIX]==UINT32_MAX-1023u+40u);
    for (unsigned k=0;k<4;++k) add_phase(k,(k+2u)*1024u);
#endif
    assert(sums[CONTEXT]==(64u<<7|86u) && sums[FORMAT]==(64u<<8|3u));
    timer=0xffff0000u+132000000u;
    sequence|=1u;og_cpu_publish(&api);assert(epoch==0); /* bounded: no spinning */
    ++sequence;og_cpu_publish(&api);assert(epoch==1);
    uint32_t captured[16]={0};unsigned seen=0;
    for (unsigned i=0;i<64;++i) {
        og_cpu_publish(&api);unsigned page=api.value>>28;
        if ((api.value>>20&255u)==1) {captured[page]=api.value&0xfffffu;seen|=1u<<page;}
    }
    assert(seen==65535 && captured[0]==0x46521 && captured[15]==0x454e4);
    assert(captured[1]==(132000000u>>10) && captured[2]==(1100u>>10));
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    assert(captured[7]==2 && captured[8]==3 && captured[9]==4 && captured[10]==5);
    assert((captured[14]&9u)==9u);
#else
    assert(captured[7]==1 && captured[8]==1 && captured[9]==32 && captured[10]==16);
#endif
    assert(captured[12]==(64u<<7|86u));
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    assert(captured[14]==9);
#else
    assert(captured[14]==1);
#endif
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    /* A rejected snapshot must preserve the last accepted phase baseline and
     * packet. The next complete window reports only its own phase deltas. */
    uint32_t saved_previous[4];
    for (unsigned k=0;k<4;++k) {
        saved_previous[k]=phase_previous[k];
        add_phase(k,(7u-k)*1024u);
    }
    timer=clock_previous+132000000u;
    sequence|=1u;og_cpu_publish(&api);
    assert(epoch==1 && pending[14]==9);
    for (unsigned k=0;k<4;++k) {
        assert(phase_previous[k]==saved_previous[k]);
        assert(pending[7+k]==k+2u);
    }
    ++sequence;og_cpu_publish(&api);assert(epoch==2);
    seen=0;
    for (unsigned i=0;i<64;++i) {
        og_cpu_publish(&api);unsigned page=api.value>>28;
        if ((api.value>>20&255u)==2) {captured[page]=api.value&0xfffffu;seen|=1u<<page;}
    }
    assert(seen==65535 && captured[14]==9);
    for (unsigned k=0;k<4;++k) assert(captured[7+k]==7u-k);
#endif
    /* Long/stalled UI windows remain explicitly invalid, never plausible CPU. */
    unsigned last_epoch=epoch;
    timer+=9u*132000000u;og_cpu_publish(&api);
    assert(epoch==last_epoch+1u && (pending[14]&2u));
    uint32_t flags=1;assert(bounded(0x100000u,&flags)==0xfffffu && flags==5);
    puts("timer wrap, exact sums, coherent16-page epochs, bounded snapshots and invalid-window flags OK");
}
