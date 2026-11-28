/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host test of the base's C parts (machines.c, pages.c) on synthetic descriptors and firmware stand-ins.
 * cc -std=c11 -Wall -Wextra -Werror -I sdk/elemod/core -I sdk/machines/digitakt/base \
 *   sdk/machines/digitakt/base/tests/base-test.c -o base-test && ./base-test
 */
#include <assert.h>
#include <string.h>
#include "../machines.c"
#include "../pages.c"

/* Firmware stand-ins. */
mw_u8 *volatile mw_fw_kit;
volatile mw_u32 mw_fw_active_track;
const mw_u8 mw_fw_sample_knobs[4] = {0x6f, 0x77, 0x7f, 0x87};
const mw_u8 mw_fw_src_param_vt[4], mw_fw_sound_ref_vt[4];
static mw_u32 stock_layouts[4][11];
static int blits, blit_x, blit_y;
static const void *blit_icon;
mw_addr mw_stock_layout(mw_u32 machine) { assert(machine <= 3); return (mw_addr)stock_layouts[machine]; }
int mw_fw_item_id(void *item) { return *(int *)item; }
void mw_fw_blit(void *bmp, const void *icon, int x, int y, int mode) { (void)bmp; assert(!mode); blits++; blit_icon = icon; blit_x = x; blit_y = y; }

/* Pages: STRING-like (v31, SLICE layout, knob D hidden, a drawn knob), RAM-like (v3, look and range). */
static int fmt_calls;
static int fmt(char *buf, int value, int ctx, int machine) { fmt_calls++; assert(machine == 120); if (value < 0) return 0; buf[0] = 'v'; buf[1] = (char)('0' + ctx); for (int i = 2; i < 16; ++i) buf[i] = 'x'; return 1; }
static int drawn_value;
static int draw(void *bmp, int x, int y, int value, int flag) { (void)bmp; (void)x; (void)y; (void)flag; drawn_value = value; return value != 7; }
static int gfx(int value) { return value * 2; }
static int switches, switch_track, switch_from;
static void on_switch(int track, int from, mw_u8 *sound) { (void)sound; switches++; switch_track = track; switch_from = from; }
static const struct mw_ui string_ui = { .abi = cm_ui_v31, .page_from = 3, .group = "STRG",
    .knob = { [0] = { .name = "EXC", .lname = "EXCITER", .lfo = "XC", .flags = MW_DRAW, .draw = draw },
              [3] = { .flags = MW_HIDDEN | MW_NOT_SAMPLE } } };
static const struct mw_ui ram_ui = { .abi = cm_ui_v3, .page_from = 0, .on_switch = on_switch,
    .knob = { [1] = { .name = "LEN", .look = 0x10, .flags = MW_RANGE | MW_DEFAULT, .min = 1, .max = 9, .def = 5, .fmt = fmt, .gfx = gfx },
              [2] = { .flags = MW_DRAW, .draw = draw } } };
static const struct mw_ui stray_ui = { .abi = "other", .page_from = 0 };
static const struct mw_machine_ui string = { { 8, "STRING", "STR", "icon8", 3, 8 }, MW_UI_TAG, &string_ui };
static const struct mw_machine_ui ram = { { 120, "RAM-R1", "RR1", 0, 0, 120 }, MW_UI_TAG, &ram_ui };
static const struct mw_machine_ui looper = { { 122, "LOOPER", "LOOP", "icon122", 0, 0 }, 0, &stray_ui };
static const struct mw_machine_ui stray = { { 121, "RAM-P1", "RP1", 0, 2, 0 }, MW_UI_TAG, &stray_ui };
static const struct mw_machine_ui shadow = { { 8, "SHADOW", "SH", 0, 1, 1 }, 0, 0 };
static const struct mw_machine_ui toobig = { { 200, "BIG", "B", 0, 0, 0 }, 0, 0 };
const struct mw_machine *const core_machines[] = { &ram.machine, &string.machine, &looper.machine, &stray.machine, &shadow.machine, &toobig.machine, 0 };

static int voices;
static mw_i32 *voices_at;
static void voice(mw_i32 *blocks) { voices++; voices_at = blocks; }
mw_voices_handler ev_render_voices[] = { voice, voice, 0 };

int main(void)
{
    for (unsigned m = 0; m < 4; ++m) for (unsigned i = 0; i < 11; ++i) stock_layouts[m][i] = 100 * m + i;
    mw_base_init();

    /* lookup and fields */
    assert(!mw_find(0) && !mw_find(3) && !mw_find(5) && !mw_find(0xffffffffu));
    assert(mw_find(8) == (mw_addr)&string && mw_find(122) == (mw_addr)&looper);
    assert(mw_field(8, 4) == (mw_addr)string.machine.name && mw_field(8, 8) == (mw_addr)string.machine.short_name);
    assert(mw_field(9, 4) == 0 && mw_as(8, 16) == 3 && mw_as(8, 20) == 8 && mw_as(2, 16) == 2 && mw_as(99, 20) == 99);
    assert(mw_machine_ui(120) == (mw_addr)&ram_ui && mw_machine_ui(122) == 0 && mw_machine_ui(3) == 0);

    /* the machine menu's order: 4.. ascending, ids above 127 never */
    mw_u32 order[8], n = 0;
    for (mw_u32 id = mw_next_id(4); id; id = mw_next_id(id + 1)) order[n++] = id;
    assert(n == 4 && order[0] == 8 && order[1] == 120 && order[2] == 121 && order[3] == 122);

    /* knob D's sample parameter: stock four, each added id by its stand-in, the first descriptor wins */
    assert(mw_samp_table[0] == 0x6f && mw_samp_table[3] == 0x87);
    assert(mw_samp_table[8] == 0x87 && mw_samp_table[120] == 0x6f && mw_samp_table[121] == 0x7f && mw_samp_table[122] == 0x6f);
    assert(mw_samp_table[4] == 0 && mw_samp_table[127] == 0);

    /* menu icons */
    int item = 8;
    assert(mw_icon(&item, 0, 10, 20) && blits == 1 && blit_icon == string.machine.icon && blit_x == 12 && blit_y == 19);
    item = 120; assert(!mw_icon(&item, 0, 0, 0));
    item = 2; assert(!mw_icon(&item, 0, 0, 0) && blits == 1);

    /* registry: STRING and RAM-R1 have pages; LOOPER lacks the tag, RAM-P1 a known abi */
    assert(page_count == 2);
    assert(mw_page_layout(122) == 0 && !current);
    const mw_u32 *layout = (const mw_u32 *)mw_page_layout(8);
    assert(layout && current && current->desc == &string);
    for (unsigned i = 0; i < 11; ++i) assert(layout[i] == (i == 5 ? 0 : 300 + i));   /* knob D (long 2 + 3) hidden */

    /* labels and value texts on STRING's page: ids by page_from (SLICE 0x84..) and by params (also SLICE) */
    assert(mw_page_label(0, 0x84) == (mw_addr)string_ui.knob[0].name);
    assert(mw_page_label(1, 0x84) == (mw_addr)string_ui.knob[0].lname && mw_page_label(0, 0x85) == 0 && mw_page_label(0, 0x6c) == 0);
    assert(mw_page_not_sample());
    mw_addr args[8] = { 0, 0x84, 9, 1, 0, 0, 3, 4 };
    assert(mw_page_knob_gfx(args) == 1 && drawn_value == 9);   /* v31 DRAW: the machine draws */
    args[2] = 7; assert(mw_page_knob_gfx(args) == 0 && args[1] == 0x84);
    assert(mw_page_look(0x84) == 0x84);

    /* RAM-R1's page: look, fmt, gfx and DRAW on a v3 page */
    assert(mw_page_layout(120) && current->desc == &ram && !mw_page_not_sample());
    char buf[16];
    fmt_calls = 0;
    assert(mw_page_value_text(0x6d, 3, buf) && buf[0] == 'v' && buf[1] == '0' && fmt_calls == 1);
    assert(!mw_page_value_text(0x6d, -1, buf) && !mw_page_value_text(0x6c, 3, buf));
    const char *pop = (const char *)mw_page_popup(0x6d, 3);
    assert(pop && pop[1] == '1' && pop[14] == 'x' && pop[15] == 0 && !mw_page_popup(0x6d, -1) && !mw_page_popup(0x6e, 1));
    assert(mw_page_look(0x6d) == 0x10 && mw_page_look(0x6c) == 0x6c);
    mw_addr g[8] = { 0, 0x6d, 4, 0, 0, 0, 0, 0 };
    assert(mw_page_knob_gfx(g) == 0 && g[2] == 8 && g[1] == 0x10);
    mw_addr d[8] = { 0, 0x6e, 4, 0, 0, 0, 0, 0 };
    drawn_value = -1; assert(mw_page_knob_gfx(d) == 0 && drawn_value == -1 && d[2] == 4);   /* v3: stock graphic */

    /* ranges follow the sound's own machine */
    mw_u8 sound[0xa2] = {0};
    sound[MW_SOUND_MACHINE] = 120;
    mw_addr ref[5] = { (mw_addr)mw_fw_sound_ref_vt, 0, 0, 0, (mw_addr)sound };
    mw_addr obj[5] = { (mw_addr)mw_fw_src_param_vt, 0, 0, 0, (mw_addr)ref };
    mw_i32 range[3] = { -1, -1, -1 };
    mw_page_layout(8);   /* the current page must not matter */
    mw_page_range(obj, 0x6d, range); assert(range[0] == 1 && range[1] == 9 && range[2] == 5);
    range[0] = range[1] = range[2] = -1;
    mw_page_range(obj, 0x6c, range); assert(range[0] == -1);
    obj[0] = 0; mw_page_range(obj, 0x6d, range); assert(range[0] == -1);

    /* LFO names: the active track's machine */
    static mw_u8 kit[0x20 + 0xa2 * 8];
    assert(mw_lfo_text(2, 52 * 0x84, 77) == 77);   /* no kit */
    mw_fw_kit = kit; mw_fw_active_track = 2;
    MW_SOUND(kit, 2)[MW_SOUND_MACHINE] = 8;
    assert(mw_lfo_text(0, 52 * 0x84, 77) == (mw_addr)string_ui.group);
    assert(mw_lfo_text(1, 52 * 0x84, 77) == (mw_addr)string_ui.knob[0].lname);
    assert(mw_lfo_text(2, 52 * 0x84, 77) == (mw_addr)string_ui.knob[0].lfo);
    assert(!strcmp((const char *)mw_lfo_text(1, 52 * 0x87, 77), "Unused") && !strcmp((const char *)mw_lfo_text(2, 52 * 0x87, 77), "-"));
    assert(mw_lfo_text(2, 52 * 0x85, 77) == 77 && mw_lfo_text(2, 52 * 0x84 + 1, 77) == 77 && mw_lfo_text(2, 52 * 0x6c, 77) == 77);
    MW_SOUND(kit, 2)[MW_SOUND_MACHINE] = 1;
    assert(mw_lfo_text(2, 52 * 0x84, 77) == 77);

    /* on_switch: a new kit is taken as it is; a track turning to RAM-R1 calls it with the machine before */
    mw_pages_tick(0); assert(!switches);
    MW_SOUND(kit, 5)[MW_SOUND_MACHINE] = 120;
    mw_pages_tick(0); assert(switches == 1 && switch_track == 5 && switch_from == 0);
    mw_pages_tick(0); assert(switches == 1);
    MW_SOUND(kit, 5)[MW_SOUND_MACHINE] = 8; mw_pages_tick(0); assert(switches == 1);

    /* render voices */
    mw_i32 blocks[8];
    mw_dispatch_render_voices(blocks); assert(voices == 2 && voices_at == blocks);
    return 0;
}
