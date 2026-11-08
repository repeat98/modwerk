/* Experimental FRACT track-machine adapter for the paired private base.
 * The accepted FX package remains a separate, unchanged reference. */
#ifndef FRACT_MACHINE_H
#define FRACT_MACHINE_H
#include "source.h"

/* Logical, published controls. This deliberately does not choose SRC page
 * offsets: callers must supply the frame's scene/lock/LFO-resolved values. */
typedef struct {
    uint8_t density, size, position, scan, spread, pan, shape, forwards;
    uint8_t local_spread;
} OgMachineControls;

enum { OG_MACHINE_IGNORED, OG_MACHINE_BUSY, OG_MACHINE_RENDERED };

/* A valid, playing sample is described by og_describe before this call.
 * NULL source retires this track. Invalid chunk sizes/track IDs are no-ops.
 * audio contains the source's dry PCM for the existing entry crossfade;
 * it is unchanged unless this track owns the granulator and is rendered.
 * Rate/pitch conversion belongs to the packet adapter, as in the FX path;
 * this function renders unity-rate source frames, not an output-rate stream.
 * Call only from the registry's guarded render, never from a fetch detour. */
int og_machine_chunk(unsigned track, const OgSource *source,
                     const OgMachineControls *controls, int32_t *audio,
                     unsigned count);
void og_machine_leave(unsigned track);
#endif
