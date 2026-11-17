/* Control helpers and immutable SIZE data in the SDK-audited code cave. */
#include "grain.h"
#include "sizes.h"
uint32_t og_size(unsigned value) {
    /* Native callers use the kernel's clamped params or clamped widgets. */
    return og_length(value>>1);
}

#ifdef OG_NATIVE_STAGE_ONE
/* UI-only counters occupy the remaining declared control-cave storage. */
uint32_t og_ui_wait=0,og_cached_track=8;
uint32_t og_ui_identity=0,og_ui_scanned=0,og_ui_frames=0;
#endif
