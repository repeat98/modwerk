/* Opt-in private measurement only. No base/Part/control writes. */
#ifndef FRACT_CPU_PROFILE_H
#define FRACT_CPU_PROFILE_H
#include <stdint.h>
#ifdef OG_MACHINE_CPU_PROFILE
struct modwerk_runtime_api;
enum {
    OG_CPU_GRAIN_CONTROL = 0,
    OG_CPU_GRAIN_BIRTH = 1,
    OG_CPU_GRAIN_MIX = 2,
    OG_CPU_GRAIN_OUTPUT = 3
};
uint32_t og_cpu_clock(void);
uint32_t og_cpu_render_begin(unsigned outputs);
void og_cpu_render_end(uint32_t at);
void og_cpu_flex_end(uint32_t at);
void og_cpu_grain_end(uint32_t at,unsigned frames);
void og_cpu_context(unsigned track,unsigned pitch,unsigned size,unsigned shape,unsigned format);
void og_cpu_ui_end(uint32_t at);
void og_cpu_draw_end(uint32_t at);
void og_cpu_grain_phase_end(unsigned phase,uint32_t at);
void og_cpu_publish(struct modwerk_runtime_api *api);
#endif
#endif
