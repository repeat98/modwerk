/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitakt mk1 base: the SRC machines modules add through core_machines (ids 4-127).
 * machines.s's site entries call these; the stock OS lists, names, sets, loads and renders an added
 * machine as the stock machine its descriptor stands in for.
 */
#include "base.h"

mw_u8 core_track_machine[8];
mw_u8 mw_samp_table[128];

static const struct mw_machine *find(mw_u32 id)
{
    if (id < 4) return 0;
    for (const struct mw_machine *const *next = core_machines; *next; ++next)
        if ((*next)->id == id) return *next;
    return 0;
}

/* The first descriptor with this id (4 and up), or 0. */
mw_addr mw_find(mw_u32 id) { return (mw_addr)find(id); }

/* A descriptor's field by its offset, as the site entries name it: name 4, short 8, params 16, render 20. */
static mw_addr field(const struct mw_machine *m, mw_u32 offset)
{
    switch (offset) {
    case 4: return (mw_addr)m->name;
    case 8: return (mw_addr)m->short_name;
    case 16: return m->params;
    case 20: return m->render;
    }
    return 0;
}

/* A registered machine's field, or 0. */
mw_addr mw_field(mw_u32 id, mw_u32 offset)
{
    const struct mw_machine *m = find(id);
    return m ? field(m, offset) : 0;
}

/* params (16) or render (20) for a registered id, the id itself otherwise. */
mw_u32 mw_as(mw_u32 id, mw_u32 offset)
{
    const struct mw_machine *m = find(id);
    return m ? (mw_u32)field(m, offset) : id;
}

/* The machine menu's next added id: the smallest registered id at or above `from`, or 0. */
mw_u32 mw_next_id(mw_u32 from)
{
    mw_u32 best = 0;
    for (const struct mw_machine *const *next = core_machines; *next; ++next) {
        mw_u32 id = (*next)->id;
        if (id >= from && id >= 4 && id <= 127 && (!best || id < best)) best = id;
    }
    return best;
}

/* An added machine's menu icon, drawn as stock draws a row's icon: nonzero when drawn. */
int mw_icon(void *item, void *bmp, int x, int y)
{
    const struct mw_machine *m = find((mw_u32)mw_fw_item_id(item));
    const void *icon = m ? m->icon : 0;
    if (!icon) return 0;
    mw_fw_blit(bmp, icon, x + 2, y - 1, 0);
    return 1;
}

mw_addr mw_machine_ui(mw_u32 id)
{
    const struct mw_machine_ui *found = (const struct mw_machine_ui *)find(id);
    return found && found->tag == MW_UI_TAG ? (mw_addr)found->ui : 0;
}

/* Once at boot, after the copy: core_machines is fixed at link time. Knob D's parameter id per machine:
 * the stock four, then each added machine's stand-in's, 0 for an id nobody added. */
void mw_base_init(void)
{
    for (unsigned i = 0; i < 4; ++i) mw_samp_table[i] = mw_fw_sample_knobs[i];
    for (const struct mw_machine *const *next = core_machines; *next; ++next) {
        mw_u32 id = (*next)->id, params = (*next)->params;
        if (id >= 4 && id <= 127 && params <= 3 && !mw_samp_table[id]) mw_samp_table[id] = mw_fw_sample_knobs[params];
    }
    mw_pages_init();
}
