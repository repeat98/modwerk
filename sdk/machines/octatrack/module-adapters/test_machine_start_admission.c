/* SPDX-License-Identifier: MIT
 * Exercise the actual board entry, before its MMIO/Part reads. Malformed START-only/truncated packages used to
 * disappear into the ordinary-module fast path. All other admission helpers below are the actual host sources. */
#define MODWERK_HOST
#include "machine_contributors.h"
#include "modwerk_events.h"
#include <stdio.h>
#include <string.h>

unsigned modwerk_machine_paused(struct runtime_span *s, unsigned n, const struct runtime_context *c)
{ (void)s; (void)n; (void)c; return RUNTIME_PAUSED + 1u; }
#include "machine_admission_runtime.c"
static void word(uint8_t *p, uint32_t v)
{ for (unsigned i = 0; i < 4; ++i) p[i] = (uint8_t)(v >> (24u - 8u * i)); }
int main(void)
{
    uint8_t image[256] = {0};
    struct runtime_dsp none = {0}, d = {0};
    d.present = 1; d.image = image; d.image_bytes = sizeof image;
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) d.hook_offset[i] = RUNTIME_NONE;
    if (modwerk_machine_metadata_admit(&none, &d, 0, RUNTIME_METADATA_PREPARE) != RUNTIME_OK) return 1;
    d.hook_offset[MODWERK_OT_MACHINE_STARTS] = 160;
    if (modwerk_machine_metadata_admit(&none, &d, 0, RUNTIME_METADATA_PREPARE) != RUNTIME_MALFORMED) return 2;
    d.hook_offset[MODWERK_OT_MACHINES] = 64; d.image_bytes = 100;
    if (modwerk_machine_metadata_admit(&none, &d, 0, RUNTIME_METADATA_PREPARE) != RUNTIME_MALFORMED) return 3;
    d.image_bytes = sizeof image;
    word(image + 64, MODWERK_MACHINE_ABI); image[70] = image[71] = 1;
    word(image + 76, MODWERK_MACHINE_START);
    word(image + 160, MODWERK_MACHINE_START_ABI); word(image + 164, 16);
    word(image + 168, 64); word(image + 172, 16);
    /* PREPARE offsets are no longer pointers at SWITCH: missing relocation refuses before root/MMIO reads. */
    if (modwerk_machine_metadata_admit(&none, &d, 0, RUNTIME_METADATA_SWITCH) != RUNTIME_MALFORMED) return 4;
    if (modwerk_machine_image_validate(&d) != RUNTIME_MALFORMED) return 5;
    word(image + 168, (uint32_t)(uintptr_t)image + 64u);
    word(image + 172, (uint32_t)(uintptr_t)image + 16u);
    /* This pure check must accept without entering the board's actual MMIO/retirement path. */
    if (modwerk_machine_image_validate(&d) != RUNTIME_OK) return 6;
    puts("Board START admission: ordinary fast path, orphan/truncated records and missing relocations checked before MMIO.");
    return 0;
}
