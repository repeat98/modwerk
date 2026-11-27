/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <mk2/mixer.h>

unsigned int dt2_mixer_page_list(
    uint32_t pages[DT2_MIXER_PAGE_CAPACITY],
    const struct dt2_mixer_extension *const extensions[DT2_MIXER_EXTENSION_COUNT])
{
    unsigned int next = 0;
    pages[next++] = 16;
    for (unsigned int slot = 0; slot < DT2_MIXER_EXTENSION_COUNT && extensions[slot]; ++slot) {
        if (extensions[slot]->descriptor && extensions[slot]->draw) {
            pages[next++] = DT2_MIXER_EXTENSION_FIRST + slot;
        }
    }
    for (uint32_t page = 17; page <= 20; ++page) {
        pages[next++] = page;
    }
    return next;
}

extern const struct dt2_mixer_extension *const core_mixer_pages[DT2_MIXER_EXTENSION_COUNT];
uint32_t core_mixer_page_ids[DT2_MIXER_PAGE_CAPACITY];

unsigned int core_mixer_prepare(void)
{
    return dt2_mixer_page_list(core_mixer_page_ids, core_mixer_pages);
}

static const struct dt2_mixer_extension *extension(uint32_t page)
{
    uint32_t slot = page - DT2_MIXER_EXTENSION_FIRST;
    if (slot >= DT2_MIXER_EXTENSION_COUNT) {
        return 0;
    }
    for (uint32_t i = 0; i <= slot; ++i) {
        if (!core_mixer_pages[i]) {
            return 0;
        }
    }
    const struct dt2_mixer_extension *entry = core_mixer_pages[slot];
    return entry && entry->descriptor && entry->draw ? entry : 0;
}

const void *core_mixer_descriptor(uint32_t page)
{
    const struct dt2_mixer_extension *entry = extension(page);
    return entry ? entry->descriptor : 0;
}

int core_mixer_draw(void *view, void *bitmap)
{
    typedef uint32_t (*page_id_fn)(const void *);
    const struct dt2_mixer_extension *entry = extension(((page_id_fn)0x40069214)(view));
    if (!entry) {
        return 0;
    }
    entry->draw(view, bitmap);
    return 1;
}
