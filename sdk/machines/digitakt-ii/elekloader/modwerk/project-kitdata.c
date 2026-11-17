/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "digitakt-mk2/core.h"

extern const core_kitdata_t *const core_kitdata[];

/* A replacement starts with empty kit data. Saved records fill it during load. */
void core_project_clear_kitdata(void)
{
    for (const core_kitdata_t *const *entry = core_kitdata; *entry; ++entry) {
        const core_kitdata_t *const data = *entry;
        uint8_t *block = data->data;
        for (int kit = 0; kit < CORE_KITS; ++kit, block += data->size) {
            for (uint32_t i = 0; i < data->size; ++i) {
                block[i] = 0;
            }
            if (data->changed) {
                data->changed(kit, 0);
            }
        }
    }
}
