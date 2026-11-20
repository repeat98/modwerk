/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_SETTING_PRESETS_H
#define MODWERK_SETTING_PRESETS_H
/* Panel edits to an imported preset are keyed by both module and preset. Merely
 * trying or rolling back a different set never writes the battery store. */
#define PRESET_ROOM 32u
#define PRESET_MAGIC 0x4d575031u /* MWP1 */
#ifndef ST_PRESETS
#define ST_PRESETS ((volatile uint32_t *)0x100f9044u)
#endif
static uint32_t st_preset_choice(uint32_t key, uint32_t preset, uint32_t legacy)
{
    volatile uint32_t *p = ST_PRESETS;
    if (p[0] == PRESET_MAGIC)
        for (unsigned i = 0; i < PRESET_ROOM; ++i) {
            volatile uint32_t *row = p + 1u + 3u * i;
            if (row[0] == key && row[1] == preset) return row[2];
        }
    return legacy < MODWERK_SETTING_OPTIONS ? legacy : 0u;
}
static void st_save_preset(uint32_t key, uint32_t preset, uint32_t choice)
{
    volatile uint32_t *p = ST_PRESETS;
    if (p[0] != PRESET_MAGIC) {
        for (unsigned i = 0; i < PRESET_ROOM; ++i) p[1u + 3u * i] = 0;
        p[0] = PRESET_MAGIC;
    }
    unsigned at = PRESET_ROOM;
    for (unsigned i = 0; i < PRESET_ROOM; ++i) {
        volatile uint32_t *row = p + 1u + 3u * i;
        if (row[0] == key && row[1] == preset) { row[2] = choice; return; }
        if (!row[0] && at == PRESET_ROOM) at = i;
    }
    if (at == PRESET_ROOM) at = ((key ^ preset) * 2654435761u) >> 27;
    volatile uint32_t *row = p + 1u + 3u * at;
    row[0] = 0; row[1] = preset; row[2] = choice; row[0] = key;
}
#endif
