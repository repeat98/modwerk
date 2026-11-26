/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_DT2_MIXER_H
#define MODWERK_DT2_MIXER_H

#include <stdint.h>

enum {
    DT2_MIXER_EXTENSION_FIRST = 33,
    DT2_MIXER_EXTENSION_COUNT = 4,
    DT2_MIXER_PAGE_CAPACITY = 5 + DT2_MIXER_EXTENSION_COUNT,
};

/* The linker's collection index owns the page number. The table ends at
 * its first null entry. An incomplete entry is skipped. */
struct dt2_mixer_extension {
    const void *descriptor;
    void (*draw)(void *view, void *bitmap);
};

unsigned int dt2_mixer_page_list(
    uint32_t pages[DT2_MIXER_PAGE_CAPACITY],
    const struct dt2_mixer_extension *const extensions[DT2_MIXER_EXTENSION_COUNT]);

#endif
