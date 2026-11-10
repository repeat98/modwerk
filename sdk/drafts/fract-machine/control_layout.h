/* The grain-only layout keeps FR:1 projects readable while moving SHPE/PAN.
 * Its marker is in a disabled reserved SETUP slot, never an audio control. */
#ifndef FRACT_CONTROL_LAYOUT_H
#define FRACT_CONTROL_LAYOUT_H
#include <stdint.h>
enum { OG_GRAIN_LAYOUT_MARKER = 168 };
static inline unsigned og_control_offset(unsigned t, unsigned k) {
    return (k < 6 ? 0x2au : 0x1dau) + 30u * t + 6u + k % 6u;
}
static inline int og_grain_layout_upgrade(volatile uint8_t *part,
                                         volatile uint8_t *mirror, unsigned t) {
    if (!part || !mirror || t >= 8 ||
        part[og_control_offset(t, 11)] == OG_GRAIN_LAYOUT_MARKER) return 0;
    unsigned previous = part[og_control_offset(t, 11)];
    unsigned shape = part[og_control_offset(t, previous == 167 ? 4 : 5)];
    unsigned pan = part[og_control_offset(t, previous == 167 ? 5 : 6)];
    part[og_control_offset(t, 4)] = mirror[og_control_offset(t, 4)] = shape > 127 ? 127 : shape;
    part[og_control_offset(t, 5)] = mirror[og_control_offset(t, 5)] = 64;
    part[og_control_offset(t, 6)] = mirror[og_control_offset(t, 6)] = pan > 127 ? 127 : pan;
    part[og_control_offset(t, 11)] = mirror[og_control_offset(t, 11)] = OG_GRAIN_LAYOUT_MARKER;
    return 1;
}
#endif
