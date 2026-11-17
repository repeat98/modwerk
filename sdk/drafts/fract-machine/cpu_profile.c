/* Private timing probe. DTCN3 is the paired base's free-running132MHz timer.
 * ISR-owned sums are copied with one bounded sequence check, never a mask or
 * spin. UI writes only its own sums. All arithmetic wraps as uint32_t.
 * api.value is the existing public read-only DIAG word, not project storage.
 */
#include "cpu_profile.h"
#include "modwerk_module.h"
#ifndef OG_MACHINE_CPU_PROFILE
#error "CPU probe requires explicit private opt-in"
#endif
#ifndef OG_CPU_TIMER
#define OG_CPU_TIMER() (*(volatile uint32_t *)0xfc07c00cu)
#endif
enum { TOTAL,FLEX,GRAIN,RENDERS,GRAINS,SOURCES,OUTPUTS,MAX_CHUNK,CONTEXT,FORMAT,COUNT };
static volatile uint32_t sequence, sums[COUNT];
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
static volatile uint32_t grain_phase[4];
static uint32_t phase_previous[4];
#endif
static uint32_t ui_sum,draw_sum,previous[COUNT],ui_previous,draw_previous,clock_previous;
static uint32_t pending[16],sending[16];
static unsigned initialized,epoch,sending_epoch,phase;

uint32_t og_cpu_clock(void) { return OG_CPU_TIMER(); }
uint32_t og_cpu_render_begin(unsigned outputs) {
    uint32_t at=og_cpu_clock();
    ++sequence;
    ++sums[RENDERS];sums[OUTPUTS]+=outputs;
    return at;
}
void og_cpu_render_end(uint32_t at) {
    sums[TOTAL]+=og_cpu_clock()-at;
    ++sequence;
}
void og_cpu_flex_end(uint32_t at) { sums[FLEX]+=og_cpu_clock()-at; }
void og_cpu_grain_end(uint32_t at,unsigned frames) {
    sums[GRAIN]+=og_cpu_clock()-at;
    ++sums[GRAINS];sums[SOURCES]+=frames;
    if (frames>sums[MAX_CHUNK]) sums[MAX_CHUNK]=frames;
}
void og_cpu_context(unsigned track,unsigned pitch,unsigned size,unsigned shape,unsigned format) {
    sums[CONTEXT]=(track&7u)<<14 | (pitch&127u)<<7 | (size&127u);
    sums[FORMAT]=(shape&127u)<<8 | (format&3u);
}
void og_cpu_ui_end(uint32_t at) { ui_sum+=og_cpu_clock()-at; }
void og_cpu_draw_end(uint32_t at) { draw_sum+=og_cpu_clock()-at; }
void og_cpu_grain_phase_end(unsigned phase,uint32_t at) {
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    if (phase<4) grain_phase[phase]+=og_cpu_clock()-at;
#else
    (void)phase;(void)at;
#endif
}

/* 16 tagged words, each with an8-bit epoch and20-bit payload. Time payloads
 * are132MHz ticks /1024, i.e.7.76us units; count payloads are unscaled.
 * Epoch is copied into every word so a reader cannot combine windows.
 * Flags:1 initialized,2 window too long,4 a payload saturated.
 * Markers0/15 identify this probe/version. Host must collect all16 tags.
 */
static uint32_t bounded(uint32_t value,uint32_t *flags) {
    if (value>0xfffffu) { *flags|=4u;return 0xfffffu; }
    return value;
}
void og_cpu_publish(struct modwerk_runtime_api *api) {
    uint32_t now=og_cpu_clock(),copy[COUNT],before=sequence;
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    uint32_t phase_copy[4];
#endif
    if (!(before&1u)) {
        for (unsigned k=0;k<COUNT;++k) copy[k]=sums[k];
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
        for (unsigned k=0;k<4;++k) phase_copy[k]=grain_phase[k];
#endif
        if (before==sequence) {
            uint32_t elapsed=now-clock_previous;
            if (initialized && elapsed>=132000000u) {
                uint32_t flags=1u;
                if (elapsed>8u*132000000u) flags|=2u;
                pending[0]=0x46521u;pending[15]=0x454e4u;
                pending[1]=bounded(elapsed>>10,&flags);
                for (unsigned k=0;k<3;++k)
                    pending[2+k]=bounded((copy[k]-previous[k])>>10,&flags);
                pending[5]=bounded((ui_sum-ui_previous)>>10,&flags);
                pending[6]=bounded((draw_sum-draw_previous)>>10,&flags);
                for (unsigned k=0;k<4;++k) {
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
                    pending[7+k]=bounded((phase_copy[k]-phase_previous[k])>>10,&flags);
#else
                    pending[7+k]=bounded(copy[RENDERS+k]-previous[RENDERS+k],&flags);
#endif
                }
                pending[11]=copy[MAX_CHUNK];pending[12]=copy[CONTEXT];pending[13]=copy[FORMAT];
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
                flags|=8u;
#endif
                pending[14]=flags;epoch=(epoch+1u)&255u;
            }
            if (!initialized || elapsed>=132000000u) {
                for (unsigned k=0;k<COUNT;++k) previous[k]=copy[k];
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
                for (unsigned k=0;k<4;++k) phase_previous[k]=phase_copy[k];
#endif
                ui_previous=ui_sum;draw_previous=draw_sum;clock_previous=now;initialized=1;
            }
        }
    }
    if (!phase) {
        for (unsigned k=0;k<16;++k) sending[k]=pending[k];
        sending_epoch=epoch;
    }
    unsigned page=phase>>1;
    api->value=(uint32_t)page<<28 | (uint32_t)sending_epoch<<20 | sending[page];
    phase=(phase+1u)&31u;
}
