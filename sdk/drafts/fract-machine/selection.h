/* FR/1 selection shared by the guarded renderer and UI lifecycle. */
#ifndef FRACT_MACHINE_SELECTION_H
#define FRACT_MACHINE_SELECTION_H
#include <stdint.h>
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
#ifndef OG_MACHINE_OWNS
static int og_machine_owns(unsigned track) {
    uintptr_t bank = U32(0x46c82456u);
    if (track >= 8 || bank < 0x40000000u || bank >= 0x47f00000u) return 0;
    uintptr_t part = bank + 0x8ed80u + (U8(0x100b14cfu) & 3u) * 6322u;
    uintptr_t sig = part + 60u + 30u * track;
    return U8(part + 0x22u + track) == 1 && U8(sig) == 'F' &&
        U8(sig + 1) == 'R' && U8(sig + 2) == 1;
}
#define OG_MACHINE_OWNS(t) og_machine_owns(t)
#endif
#ifdef OG_MACHINE_GRAIN_ONLY
#include "control_layout.h"
#ifndef OG_MACHINE_LAYOUT_CURRENT
static inline int og_machine_layout_current(unsigned track) {
    uintptr_t bank = U32(0x46c82456u);
    if (track >= 8 || bank < 0x40000000u || bank >= 0x47f00000u) return 0;
    uintptr_t part = bank + 0x8ed80u + (U8(0x100b14cfu) & 3u) * 6322u;
    return U8(part + og_control_offset(track, 11)) == OG_GRAIN_LAYOUT_MARKER;
}
#define OG_MACHINE_LAYOUT_CURRENT(t) og_machine_layout_current(t)
#endif
#endif
#endif
