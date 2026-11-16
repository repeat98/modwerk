/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <mk2/mixer.h>
#include <assert.h>
#include <stddef.h>

const struct dt2_mixer_extension *const core_mixer_pages[DT2_MIXER_EXTENSION_COUNT] = {0};

static void draw(void *view, void *bitmap)
{
    (void)view;
    (void)bitmap;
}

int main(void)
{
    static const uint32_t descriptor;
    static const struct dt2_mixer_extension page = { &descriptor, draw };
    static const struct dt2_mixer_extension incomplete = { &descriptor, NULL };
    const struct dt2_mixer_extension *extensions[DT2_MIXER_EXTENSION_COUNT] = {0};
    uint32_t pages[DT2_MIXER_PAGE_CAPACITY];

    assert(dt2_mixer_page_list(pages, extensions) == 5);
    for (uint32_t i = 0; i < 5; ++i) {
        assert(pages[i] == 16 + i);
    }
    extensions[0] = &page;
    extensions[1] = &incomplete;
    extensions[2] = &page;
    assert(dt2_mixer_page_list(pages, extensions) == 7);
    assert(pages[0] == 16 && pages[1] == 33 && pages[2] == 35);
    for (uint32_t i = 0; i < 4; ++i) {
        assert(pages[i + 3] == 17 + i);
    }
    extensions[1] = &page;
    extensions[3] = &page;
    assert(dt2_mixer_page_list(pages, extensions) == DT2_MIXER_PAGE_CAPACITY);
    assert(pages[4] == 36 && pages[8] == 20);
}
