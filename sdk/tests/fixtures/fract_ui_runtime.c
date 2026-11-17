/* Render-only host fixtures: PE linkers can retain unused device functions.
 * Any unexpected runtime/source call fails rather than simulating success.
 * This file is never part of the machine package. */
#include <assert.h>
#include "source.h"

OgGrain og_state = {0};
uint32_t og_owner = 8;

int og_describe(unsigned slot, OgSource *source) {
    (void)slot; (void)source;
    assert(!"render-only fixture requested source metadata");
    return 0;
}
uint32_t og_size(unsigned value) {
    (void)value;
    assert(!"render-only fixture requested runtime grain size");
    return 0;
}
#ifndef FRACT_UI_HAS_LOCATE
uintptr_t og_locate(const OgSource *source, uint32_t frame, uint32_t *remaining) {
    (void)source; (void)frame; (void)remaining;
    assert(!"render-only fixture requested sample memory");
    return 0;
}
#endif
