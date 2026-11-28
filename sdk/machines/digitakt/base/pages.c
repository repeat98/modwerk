/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitakt mk1 base: SRC and LFO pages for the added machines that describe their own
 * (descriptor tail "UI30" + struct mw_ui), and the render's ev_render_voices. pages.s's site entries call
 * these. Every SRC-page answer is for the current page: the page of the machine the SRC page last asked a
 * layout for. Ranges follow the sound's own machine, LFO names the active track's.
 */
#include "base.h"

const char cm_ui_v3[] = "modwerk pages 3";
const char cm_ui_v31[] = "modwerk pages 3.1";

#define MW_PAGES 32
struct mw_page_slot {
    const struct mw_machine_ui *desc;
    mw_u8 copied;
    mw_u32 layout[11];
};
static struct mw_page_slot pages[MW_PAGES];
static unsigned page_count;
static struct mw_page_slot *current;

typedef void (*mw_voices_handler)(mw_i32 *blocks);
extern mw_voices_handler ev_render_voices[];

void mw_dispatch_render_voices(mw_i32 *blocks)
{
    for (mw_voices_handler *next = ev_render_voices; *next; ++next) (*next)(blocks);
}

/* At boot (core_machines is fixed): every added machine with a page this base reads, the first 32. */
void mw_pages_init(void)
{
    for (const struct mw_machine *const *next = core_machines; *next && page_count < MW_PAGES; ++next) {
        const struct mw_machine_ui *desc = (const struct mw_machine_ui *)*next;
        const struct mw_ui *ui = desc->machine.id > 3 && desc->tag == MW_UI_TAG ? desc->ui : 0;
        if (ui && (ui->abi == cm_ui_v3 || ui->abi == cm_ui_v31) && ui->page_from <= 3) pages[page_count++].desc = desc;
    }
}

static struct mw_page_slot *page_of(mw_u32 machine)
{
    if (machine < 4) return 0;
    for (unsigned i = 0; i < page_count; ++i)
        if (pages[i].desc->machine.id == machine) return &pages[i];
    return 0;
}

/* The knob (0-7) a parameter id is on: by the page it copies or by the machine it stands in for. */
static const struct mw_knob *knob_of(const struct mw_page_slot *slot, mw_u32 id)
{
    if (!slot) return 0;
    const struct mw_ui *ui = slot->desc->ui;
    mw_u32 k = id - (0x6c + 8 * ui->page_from);
    if (k > 7) k = id - (0x6c + 8 * slot->desc->machine.params);
    return k <= 7 ? &ui->knob[k] : 0;
}

/* Site 1: the SRC layout of a machine with a page (its stock page's, hidden knobs left out), or 0. */
mw_addr mw_page_layout(mw_u32 machine)
{
    struct mw_page_slot *slot = current = page_of(machine);
    if (!slot) return 0;
    if (!slot->copied) {
        const mw_u32 *stock = (const mw_u32 *)mw_stock_layout(slot->desc->ui->page_from);
        for (unsigned i = 0; i < 11; ++i) slot->layout[i] = stock[i];
        for (unsigned k = 0; k < 8; ++k)
            if (slot->desc->ui->knob[k].flags & MW_HIDDEN) slot->layout[2 + k] = 0;
        slot->copied = 1;
    }
    return (mw_addr)slot->layout;
}

/* Sites 2 and 3: a knob's label (which 0) or long name (1), or 0 for stock's. */
mw_addr mw_page_label(mw_u32 which, mw_u32 id)
{
    const struct mw_knob *knob = knob_of(current, id);
    return knob ? (mw_addr)(which ? knob->lname : knob->name) : 0;
}

/* Site 4: a knob's value under a turning knob; nonzero when the machine wrote buf. */
int mw_page_value_text(mw_u32 id, int value, char *buf)
{
    const struct mw_knob *knob = knob_of(current, id);
    return knob && knob->fmt && knob->fmt(buf, value, 0, (int)current->desc->machine.id);
}

/* Site 5, args = (obj, id, value, flag, -, bmp, x, y): nonzero when the machine drew the graphic itself;
 * otherwise the value and id stock draws with may change. */
int mw_page_knob_gfx(mw_addr *args)
{
    const struct mw_knob *knob = knob_of(current, (mw_u32)args[1]);
    if (!knob) return 0;
    if (knob->flags & MW_DRAW) {
        if (current->desc->ui->abi == cm_ui_v31 && knob->draw) {
            int drawn = knob->draw((void *)args[5], (int)args[6], (int)args[7], (int)args[2], (int)args[3]);
            if (drawn) return drawn;
        }
    } else if (knob->gfx) args[2] = (mw_addr)knob->gfx((int)args[2]);
    if (knob->look) args[1] = knob->look;
    return 0;
}

/* Site 6: the parameter id whose UI record a knob borrows. */
mw_u32 mw_page_look(mw_u32 id)
{
    const struct mw_knob *knob = knob_of(current, id);
    return knob && knob->look ? knob->look : id;
}

/* Site 7: a knob's value in the pop-up, or 0 for stock's. */
mw_addr mw_page_popup(mw_u32 id, int value)
{
    static char text[16];
    const struct mw_knob *knob = knob_of(current, id);
    if (!knob || !knob->fmt) return 0;
    for (unsigned i = 0; i < sizeof text; ++i) text[i] = 0;
    if (!knob->fmt(text, value, 1, (int)current->desc->machine.id)) return 0;
    text[15] = 0;
    return (mw_addr)text;
}

/* Sites 8-11: a parameter's range {min, max, default} for the machine of the sound it belongs to. */
void mw_page_range(const mw_addr *obj, mw_u32 id, mw_i32 *range)
{
    if (!obj || obj[0] != (mw_addr)mw_fw_src_param_vt) return;
    const mw_addr *ref = (const mw_addr *)obj[4];
    if (!ref || ref[0] != (mw_addr)mw_fw_sound_ref_vt || !ref[4]) return;
    const struct mw_knob *knob = knob_of(page_of(((const mw_u8 *)ref[4])[MW_SOUND_MACHINE]), id);
    if (!knob) return;
    if (knob->flags & MW_RANGE) range[0] = knob->min, range[1] = knob->max;
    if (knob->flags & MW_DEFAULT) range[2] = knob->def;
}

/* Sites 13-17: the active track's machine's name for an LFO destination (kind 0 group, 1 long, 2 short);
 * `offset` is the destination's byte offset in the parameter table (52 per id). Otherwise `stock`. */
mw_addr mw_lfo_text(mw_u32 kind, mw_u32 offset, mw_addr stock)
{
    const mw_u8 *kit = mw_fw_kit;
    mw_u32 track = mw_fw_active_track;
    if (!kit || track > 7 || offset % 52) return stock;
    struct mw_page_slot *slot = page_of(MW_SOUND(kit, track)[MW_SOUND_MACHINE]);
    mw_u32 k = offset / 52 - (0x6c + 8 * (slot ? slot->desc->machine.params : 0));
    if (!slot || k > 7) return stock;
    const struct mw_knob *knob = &slot->desc->ui->knob[k];
    const char *text = kind == 0 ? slot->desc->ui->group
        : kind == 1 ? (knob->lfo_long ? knob->lfo_long : knob->lname)
        : (knob->lfo ? knob->lfo : knob->name);
    if (!text && kind && (knob->flags & MW_HIDDEN) && !knob->name) text = kind == 1 ? "Unused" : "-";
    return text ? (mw_addr)text : stock;
}

/* Sites 18 and 19: nonzero when the current page's knob D is no sample slot. */
int mw_page_not_sample(void)
{
    return current && (current->desc->ui->knob[3].flags & MW_NOT_SAMPLE);
}

/* ev_tick, order 20: a track that turns to a machine with a page calls its on_switch. A new kit is taken as it is. */
void mw_pages_tick(void *ctrl)
{
    static const mw_u8 *seen;
    static mw_u8 last[8];
    (void)ctrl;
    const mw_u8 *kit = mw_fw_kit;
    if (!kit) return;
    for (unsigned t = 0; t < 8; ++t) {
        mw_u8 *sound = (mw_u8 *)MW_SOUND(kit, t), machine = sound[MW_SOUND_MACHINE];
        if (kit == seen && machine != last[t]) {
            struct mw_page_slot *slot = page_of(machine);
            if (slot && slot->desc->ui->on_switch) slot->desc->ui->on_switch((int)t, last[t], sound);
        }
        last[t] = machine;
    }
    seen = kit;
}
