/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "digitakt-mk2/core.h"

extern const uint32_t core_store_layout[];
extern const uint32_t core_startup_kitdata_layout[4];
extern const core_kitdata_t *const core_kitdata[];
extern void core_kitdata_save(uint8_t *record, const uint8_t *kit);

#define KITS (core_store_layout[0])
#define KIT_STRIDE (core_store_layout[1])
#define KIT_PAD (core_store_layout[2])

static uint32_t read_word(const uint8_t *bytes)
{
    return (uint32_t)bytes[0] << 24 | (uint32_t)bytes[1] << 16
         | (uint32_t)bytes[2] << 8 | bytes[3];
}

/* Keep the active startup container current on stock partial saves. */
void core_startup_kitdata_refresh(uint8_t *file, const void *project)
{
    if ((uint32_t)file != core_startup_kitdata_layout[0] || (uint32_t)project != core_startup_kitdata_layout[1]
        || !core_kitdata[0] || read_word(file) != 0xbeefbaceu || read_word(file + 4) != 5)
        return;

    for (int kit = 0; kit < CORE_KITS; ++kit) {
        uint8_t *record = file + core_startup_kitdata_layout[2] + (uint32_t)kit * core_startup_kitdata_layout[3];
        if (read_word(record + KIT_PAD - 4) == 0xbacef00cu)
            core_kitdata_save(record, (const uint8_t *)(KITS + (uint32_t)kit * KIT_STRIDE));
    }
}
