/* Staged adapter for FRACT's existing grain core; not a separate module. */
#include "machine.h"
#include "base_binding.h"
#include "sizes.h"
#include "cpu_profile.h"
#include "chunk.h"
#ifdef OG_MACHINE_SOURCE_STAGE
#include "source_stage.h"
#endif

void og_machine_leave(unsigned track) {
    if (!og_machine_base_ready()) return;
#ifdef OG_MACHINE_SOURCE_STAGE
    mw_source_stage_request_stop(track);
#endif
    if (track < 8 && og_owner == track) {
        og_stop(&og_state);
        og_owner = 8;
    }
}

int og_machine_chunk(unsigned track, const OgSource *source,
                     const OgMachineControls *controls, int32_t *audio,
                     unsigned count) {
    return og_machine_chunk_inline(track,source,controls,audio,count);
}
