/* The experimental base dispatches this through ot_machine_starts. The legacy
 * grain-only prototype leaves it unregistered. Never patch FLEX's START table. */
#include "render.h"
#include "base_binding.h"
#include "native_source.h"
#ifndef OG_FLEX_START
#define OG_FLEX_START(t,s,f) \
    ((int (*)(unsigned,unsigned,unsigned))(uintptr_t)0x4000f450u)(t,s,f)
#endif

int og_machine_start(unsigned track, unsigned sample, unsigned flags) {
    if (!og_machine_base_ready()) return 0;
    if (track >= 8) return 0;
    if (!OG_MACHINE_OWNS(track)) return OG_FLEX_START(track, sample, flags);
    unsigned ping = U32(0x800000e0u);
    if (ping > 1 || U32(0x800062a8u) != 0x80000510u + ping * 384u + track * 48u)
        return 0;
    OgNativeView view;
    if (!og_native_open(track, &view)) return 0;
    int result = OG_FLEX_START(track, sample, flags);
    og_native_close(track, &view);
    return result;
}
