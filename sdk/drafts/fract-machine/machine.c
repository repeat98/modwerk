/* Staged adapter for FRACT's existing grain core; not a separate module. */
#include "machine.h"
#include "base_binding.h"
#include "sizes.h"
#include "cpu_profile.h"
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
    if (track >= 8 || count - 1u >= 64) return OG_MACHINE_IGNORED;
    if (!source || source->frames - 1u >= 44860416u || source->slot >= 128 ||
        !source->identity || (source->bytes != 2 && source->bytes != 3) ||
        (source->channels != 1 && source->channels != 2) || source->little) {
        og_machine_leave(track);
        return OG_MACHINE_IGNORED;
    }
    if (!controls || !audio) return OG_MACHINE_IGNORED;
    if (og_owner < 8 && og_owner != track) return OG_MACHINE_BUSY;

    unsigned density = controls->density;
    unsigned forwards = controls->forwards;
    uint8_t params[OG_PARAMS] = {
        og_densities[density > 127 ? 127 : density],
        controls->size, controls->position, controls->scan, controls->spread,
        controls->pan, controls->shape,
        (uint8_t)(127 - (forwards > 127 ? 127 : forwards))
    };
    uint32_t identity = source->identity ^ (source->slot << 24);
    if (og_owner == 8 || og_state.identity != identity)
        og_reset(&og_state, identity);
    og_owner = track;
    og_state.pitch = 0;
    og_state.spread_mode = controls->local_spread == 1;

    /* The endpoint cache is local to this chunk, just as in source.c. */
    OgSource src = *source;
    src.join_mode = src.frames >= 2048;
#ifdef OG_MACHINE_CPU_PROFILE
    uint32_t at=og_cpu_clock();
#endif
    og_engine(&og_state, &src, params, audio, count);
#ifdef OG_MACHINE_CPU_PROFILE
    og_cpu_grain_end(at,count);
#endif
    return OG_MACHINE_RENDERED;
}
