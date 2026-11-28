/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host test of the Digitone base's C parts (params.c, pages.c, projdata.c, menu.c, audio.c and the shared
 * event bus) on synthetic records and firmware stand-ins.
 * cc -std=c11 -Wall -Wextra -Werror -DMODWERK_DIGITONE -I sdk/elemod/core -I sdk/machines/digitone/base \
 *   sdk/machines/digitone/base/tests/base-test.c -o base-test && ./base-test
 */
#include <assert.h>
#include <string.h>
#include "event-bus.c"
#include "../params.c"
#include "../pages.c"
#include "../projdata.c"
#include "../menu.c"
#include "../audio.c"

/* Firmware stand-ins. */
mw_u8 mw_fw_params[MW_SLOT_FIRST * MW_PARAM_BYTES + MW_SLOT_TABLE_BYTES];
mw_u8 mw_fw_uirecs[MW_SLOT_FIRST * MW_UIREC_BYTES];
mw_u32 mw_slot_table[MW_SLOT_TABLE_BYTES / 4];
mw_i32 mw_fw_usb_block[32 * 12];
volatile mw_u32 mw_fw_model_flags;
const mw_u8 mw_fw_font5[1];
static int fills, frames, texts;
void mw_fw_fillrect(void *b, int x0, int y0, int x1, int y1, int c) { (void)b; (void)x0; (void)y0; (void)x1; (void)y1; assert(!c); fills++; }
void mw_fw_framerect(void *b, int x0, int y0, int x1, int y1, int c) { (void)b; (void)x0; (void)x1; (void)c; assert(y1 > y0); frames++; }
void mw_fw_textf(void *b, const void *f, int x, int y, int n, const char *fmt, ...) { (void)b; (void)f; (void)x; (void)n; (void)fmt; assert(y >= 0 && y < 64); texts++; }
static mw_u8 view_a[0x100];
static int stock_keys, key_seen[16], act_seen[16];
int mw_stock_key(void *brain, void *event)
{
    (void)brain;
    const mw_u32 *ev = event;
    key_seen[stock_keys] = (int)ev[3];
    act_seen[stock_keys++] = (int)ev[4];
    if (ev[4] == MW_PRESS) (*(mw_u32 *)(view_a + 0x90))++;   /* each press moves the page view on */
    return 0;
}
static int masters;
void mw_stock_master(mw_i32 *out, mw_i32 *out2, const mw_i32 *in, void *state)
{
    (void)out2; (void)state; masters++;
    for (int i = 0; i < 64; ++i) out[i] = in[i] + 1;
}

/* Tables. */
static void fmt(int value, char *buf) { (void)value; (void)buf; }
static struct mw_parameter p183 = { .id = 183, .group = 1, .slot = 9, .min = 0, .max = 127, .format = fmt, .look = 40 };
static struct mw_parameter p184 = { .id = 184, .group = 2, .look = 0 };
static struct mw_parameter p200 = { .id = 200, .group = 7 }, p181 = { .id = 181, .group = 7 };
struct mw_parameter *const core_params[] = { &p200, &p183, &p184, &p181, 0 };
static struct mw_page page27 = { .index = 27, .after = 9, .short_title = "MOD" }, page28 = { .index = 28, .after = 12 };
static struct mw_page page29 = { .index = 29, .after = 9 };
struct mw_page *const core_pages[] = { &page27, &page28, &page29, 0 };
static mw_u8 data_a[8], data_b[12];
static int loaded_a = -1, loaded_b = -1;
static void on_a(int found) { loaded_a = found; }
static void on_b(int found) { loaded_b = found; }
static struct mw_project_data pd_a = { 0x41414141, 8, data_a, on_a }, pd_b = { 0x42424242, 12, data_b, on_b };
struct mw_project_data *const core_projdata[] = { &pd_a, &pd_b, 0 };
static int opened, opened_track;
static void open_menu(void *brain, void *event, int track) { (void)brain; (void)event; opened++; opened_track = track; }
static const struct mw_menu_entry entry0 = { "FIRST", open_menu }, entry1 = { "SECOND", open_menu }, entry2 = { "THIRD", open_menu };
const struct mw_menu_entry *const core_menu[] = { &entry0, &entry1, &entry2, 0 };
static void render(mw_i32 *out, const mw_i32 *in) { for (int i = 0; i < 64; ++i) out[i] = in[i] * 2; }
static struct mw_audio audio_a = { 0, render, CORE_AUDIO_MUTE_VOICES }, audio_b = { 0, render, CORE_AUDIO_INSERT | CORE_AUDIO_MUTE_VOICES };
struct mw_audio *const core_audio[] = { &audio_a, &audio_b, 0 };
static int holds, hold_take, tick_calls, key_calls;
static int hold(void *brain, void *event, int track) { (void)brain; (void)event; (void)track; holds++; return hold_take; }
static int key_handler(void *brain, void *event) { (void)brain; (void)event; key_calls++; return 0; }
static void tick_handler(void *ctrl) { (void)ctrl; tick_calls++; }
static int cc_seen;
static int cc(int track, int c, int value, int flags) { cc_seen = track * 1000 + c * 10 + flags; (void)value; return c == 7; }
static int cc_late(int track, int c, int value, int flags) { (void)track; (void)value; (void)flags; assert(c != 7); return 0; }
static void *leds_mgr, *queued;
static void leds(void *mgr) { leds_mgr = mgr; }
static void queue(void *event, int time) { queued = event; assert(time == 5); }
mw_tick_handler ev_tick[] = { tick_handler, 0 };
mw_draw_handler ev_draw[] = { 0 };
mw_input_handler ev_key[] = { key_handler, 0 }, ev_enc[] = { 0 };
mw_settings_handler ev_settings[] = { 0 };
mw_render_handler ev_render_in[] = { 0 }, ev_render_out[] = { 0 };
mw_voice_handler ev_voice_on[] = { 0 };
mw_hold_handler ev_hold[] = { hold, 0 };
mw_cc_handler ev_midi_cc[] = { cc, cc_late, 0 };
mw_queue_handler ev_note_queue[] = { queue, 0 };
mw_leds_handler ev_key_leds[] = { leds, 0 };

static int key(mw_u32 k, mw_u32 a)
{
    mw_u32 ev[8] = { 0, 0, 0, k, a, 0, 0, 0 };
    return mw_dispatch_key(0, ev);
}
static int enc(mw_i32 delta)
{
    mw_i32 ev[8] = { 0, 0, 0, 0, delta, 0, 0, 0 };
    return mw_dispatch_enc(0, ev);
}
static void put32(mw_u8 *p, mw_u32 v) { wr(p, v); }

int main(void)
{
    /* parameter slots: the stock table moved, unused slots = record 0, ids outside 182-184 ignored, look 0 -> 24 */
    for (unsigned i = 0; i < sizeof mw_fw_params; ++i) mw_fw_params[i] = (mw_u8)(i * 7 + 3);
    mw_u8 table[MW_SLOT_TABLE_BYTES];
    memcpy(table, mw_fw_params + MW_SLOT_FIRST * MW_PARAM_BYTES, sizeof table);
    mw_base_init();
    assert(!memcmp(mw_slot_table, table, sizeof table));
    mw_u8 *s = mw_fw_params + MW_SLOT_FIRST * MW_PARAM_BYTES;
    assert(!memcmp(s, mw_fw_params, MW_PARAM_BYTES));                                   /* 182 unused */
    assert(!memcmp(s + MW_PARAM_BYTES, &p183.group, MW_PARAM_BYTES));                  /* 183 */
    assert(!memcmp(s + 2 * MW_PARAM_BYTES, &p184.group, MW_PARAM_BYTES));              /* 184 */
    assert(slot_look[0] == 24 && slot_look[1] == 40 && slot_look[2] == 24);
    assert(mw_fw_params[181 * MW_PARAM_BYTES + 4] != 7);                                /* 181 stays stock */

    /* UI records: stock below 182, built once from the look for a slot with its formatter at +0x14, record 0 above */
    for (unsigned i = 0; i < sizeof mw_fw_uirecs; ++i) mw_fw_uirecs[i] = (mw_u8)(i + 1);
    assert(mw_uirec(0) == (mw_addr)mw_fw_uirecs && mw_uirec(181) == (mw_addr)(mw_fw_uirecs + 181 * 84));
    assert(mw_uirec(185) == (mw_addr)mw_fw_uirecs && mw_uirec(0xffffffffu) == (mw_addr)mw_fw_uirecs);
    mw_u32 *rec = (mw_u32 *)mw_uirec(183);
    assert(rec == slot_ui[1] && !memcmp((mw_u8 *)rec + 0x18, mw_fw_uirecs + 40 * 84 + 0x18, 84 - 0x18));
    assert(!memcmp((mw_u8 *)rec + 0x14, s + MW_PARAM_BYTES + 0x34, 4));
    rec[0] = 0x1234; assert(mw_uirec(183) == (mw_addr)rec && rec[0] == 0x1234);           /* built once */
    assert(!memcmp((mw_u8 *)mw_uirec(184) + 0x18, mw_fw_uirecs + 24 * 84 + 0x18, 84 - 0x18));   /* look 0: PTIM */

    /* page lookup and list */
    assert(mw_page_find(26) == 0 && mw_page_find(30) == 0 && mw_page_find(27) == (mw_addr)&page27.short_title);
    mw_u32 stock[30] = { 9, 10, 11, 12 }, *list[3] = { stock, stock + 4, stock + 4 }, *vec[3];
    assert(mw_page_list(view_a, list, vec));
    assert(vec[1] - vec[0] == 7 && vec[2] == vec[1]);
    mw_u32 want[7] = { 9, 27, 29, 10, 11, 12, 28 };
    assert(!memcmp(vec[0], want, sizeof want));
    assert(page27.view == view_a && page27.position == 1 && page29.position == 2 && page28.position == 6);
    list[1] = stock + 29; assert(!mw_page_list(view_a, list, vec));                         /* longer than 28: stock */
    for (int i = 0; i < 28; ++i) stock[i] = 9;
    list[1] = stock + 28; assert(mw_page_list(view_a, list, vec) && vec[1] - vec[0] == 32);  /* bounded */
    list[1] = stock + 4;

    /* core_page_open: press/release until the view shows the page; core_page_shown */
    page28.view = view_a; page28.position = 3; *(mw_u32 *)(view_a + 0x90) = 0;
    mw_u32 kev[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
    assert(core_page_open(0, kev, 22, &page28) == 1 && stock_keys == 6 && key_seen[0] == 22 && act_seen[0] == 1 && act_seen[1] == 16);
    assert(kev[3] == 4);   /* the caller's event is untouched */
    struct mw_page none = { .index = 30 };
    assert(!core_page_open(0, kev, 22, &none) && stock_keys == 6);
    static mw_u8 brain[0x100], shown[0x20], screen[0x100];
    mw_addr sh = (mw_addr)shown, sc = (mw_addr)screen; void *va = view_a;
    memcpy(brain + 0x54, &sh, sizeof sh); memcpy(brain + 0x5c, &sh, sizeof sh);
    memcpy(shown + 8, &sc, sizeof sc); memcpy(screen + 0xc0, &va, sizeof va);
    assert(core_page_shown(brain, &page28));
    *(mw_u32 *)(view_a + 0x90) = 4; assert(!core_page_shown(brain, &page28));
    *(mw_u32 *)(view_a + 0x90) = 3; memset(brain + 0x5c, 0, sizeof sh); assert(!core_page_shown(brain, &page28));

    /* project data: an empty gap gets a list; foreign records kept; legacy 0x20 lists read and moved */
    static mw_u8 file[0x200];
    memset(data_a, 0xa1, 8); memset(data_b, 0xb2, 12);
    mw_pd_save(file, 0);
    assert(rd(file + 0x1c) == MW_PD_MAGIC && rd(file + 0x20) == pd_a.tag && rd(file + 0x24) == 8 && file[0x28] == 0xa1);
    assert(rd(file + 0x30) == pd_b.tag && rd(file + 0x34) == 12 && rd(file + 0x44) == 0);
    memset(data_a, 0, 8); memset(data_b, 0, 12);
    mw_pd_load(file, 0x100); assert(loaded_a == -1);                  /* the stock load failed: nothing */
    mw_pd_load(file, 1); assert(loaded_a == 1 && loaded_b == 1 && data_a[7] == 0xa1 && data_b[11] == 0xb2);
    /* a KitBank-style list: KBLK first, ours after; ours rewritten, KBLK kept */
    memset(file, 0, sizeof file);
    put32(file + 0x1c, MW_PD_MAGIC); put32(file + 0x20, 0x4b424c4b); put32(file + 0x24, 4); put32(file + 0x28, 0xdeadbeef);
    put32(file + 0x2c, pd_b.tag); put32(file + 0x30, 4); put32(file + 0x34, 0x11111111); put32(file + 0x38, 0);
    mw_pd_save(file, 0);
    assert(rd(file + 0x20) == 0x4b424c4b && rd(file + 0x28) == 0xdeadbeef);
    assert(rd(file + 0x2c) == pd_a.tag && rd(file + 0x3c) == pd_b.tag && rd(file + 0x40) == 12 && rd(file + 0x50) == 0);
    /* a short stored record: min(size, stored), the rest zero */
    put32(file + 0x40, 4); put32(file + 0x48, 0);
    memset(data_b, 0xee, 12); mw_pd_load(file, 1); assert(data_b[0] == 0xb2 && data_b[4] == 0 && loaded_b == 1);
    /* legacy list at 0x20 */
    memset(file, 0, sizeof file);
    put32(file + 0x20, MW_PD_MAGIC); put32(file + 0x24, 0x43434343); put32(file + 0x28, 4); put32(file + 0x2c, 7);
    put32(file + 0x30, pd_a.tag); put32(file + 0x34, 8); put32(file + 0x38, 0x01020304); put32(file + 0x3c, 0x05060708); put32(file + 0x40, 0);
    mw_pd_load(file, 1); assert(loaded_a == 1 && data_a[0] == 1 && data_a[7] == 8 && loaded_b == 0);
    mw_pd_save(file, 0);
    assert(rd(file + 0x1c) == MW_PD_MAGIC && rd(file + 0x20) == 0x43434343 && rd(file + 0x28) == 7 && rd(file + 0x2c) == pd_a.tag);
    /* another tool's data or a broken list: left alone */
    memset(file, 0, sizeof file); put32(file + 0x1c, 0x12345678);
    mw_pd_save(file, 0); assert(rd(file + 0x20) == 0);
    mw_pd_load(file, 1); assert(loaded_a == 0 && loaded_b == 0);
    memset(file, 0, sizeof file); put32(file + 0x1c, MW_PD_MAGIC); put32(file + 0x20, 0x44444444); put32(file + 0x24, 0x1000);
    mw_pd_save(file, 0); assert(rd(file + 0x24) == 0x1000);
    /* a list near full: ours skipped when it does not fit, the end tag kept */
    memset(file, 0, sizeof file); put32(file + 0x1c, MW_PD_MAGIC); put32(file + 0x20, 0x45454545); put32(file + 0x24, 0x200 - 0x28 - 4 - 16);
    mw_pd_save(file, 0);
    mw_u8 *after = file + 0x28 + 0x200 - 0x28 - 4 - 16;
    assert(rd(after) == pd_a.tag && rd(after + 16) == 0);                       /* A (16) fits, B (20) does not */
    /* new project */
    memset(data_a, 9, 8); mw_pd_new(0, 0); assert(!data_a[0] && loaded_a == 0 && loaded_b == 0);

    /* Mod Menu and ev_hold */
    static mw_u8 ctrl[0x40];
    key(42, MW_PRESS); assert(key_calls == 1);                    /* the press passes on */
    hold_take = 1; assert(key(42, MW_HOLD) == 1 && holds == 1 && !open);   /* a hold handler took it */
    hold_take = 0;
    key(42, MW_RELEASE); key(42, MW_PRESS);
    enc(1); assert(key(42, MW_HOLD) == 0 && !open);              /* a turn during the hold cancels it */
    key(42, MW_RELEASE);
    key(1, MW_PRESS); key(43, MW_PRESS); assert(key(43, MW_HOLD) == 0 && !open);   /* FUNC held: a combination */
    key(1, MW_RELEASE); key(43, MW_RELEASE);
    key(30, MW_PRESS); key(43, MW_PRESS); assert(key(43, MW_HOLD) == 1 && open && track == 1);   /* a trig held is fine */
    key(30, MW_RELEASE);
    mw_dispatch_tick(ctrl); assert(ctrl[0x20] == 1 && tick_calls == 1);
    mw_dispatch_draw(0, ctrl); assert(fills == 1 && frames == 1 && texts == 5);
    int before = key_calls;
    assert(key(16, MW_PRESS) == 1 && sel == 1 && key(16, MW_RELEASE) == 1 && key_calls == before);
    assert(key(16, MW_PRESS) == 1 && key(16, MW_PRESS) == 1 && sel == 2);   /* no wrap */
    assert(enc(-3) == 1 && sel == 2 && enc(-1) == 1 && sel == 1 && enc(-9) == 1 && sel == 0);
    assert(key(11, MW_PRESS) == 0 && open);                        /* PLAY passes, the menu stays */
    assert(key(13, MW_PRESS) == 1 && opened == 1 && opened_track == 1 && !open);   /* YES picks */
    key(43, MW_RELEASE); key(44, MW_PRESS); key(44, MW_HOLD); assert(open && sel == 0 && track == 2);
    assert(key(27, MW_PRESS) == 1 && opened == 2 && !open);         /* trig 2 picks entry 1 */
    key(44, MW_RELEASE); key(44, MW_PRESS); key(44, MW_HOLD);
    assert(key(40, MW_PRESS) == 1 && open && opened == 2);          /* trig 15: no such entry */
    assert(key(21, MW_PRESS) == 0 && !open);                        /* a page key closes and passes on */
    key(44, MW_RELEASE); key(44, MW_PRESS); key(44, MW_HOLD); assert(open);
    assert(key(14, MW_PRESS) == 1 && !open);                        /* NO closes */
    key(44, MW_RELEASE); key(44, MW_PRESS); key(44, MW_HOLD); assert(open);
    key(44, MW_RELEASE); key(44, MW_PRESS); assert(key(44, MW_HOLD) == 1 && !open);   /* another hold closes */
    mw_dispatch_tick(ctrl); assert(tick_calls == 2);
    fills = 0; mw_dispatch_draw(0, ctrl); assert(!fills);

    /* MIDI CC, note queue, key LEDs */
    assert(mw_dispatch_midi_cc(2, 7, 64, 1) == 1 && cc_seen == 2071);
    assert(mw_dispatch_midi_cc(3, 8, 64, 0) == 0 && cc_seen == 3080);
    int mgr, ev;
    mw_dispatch_key_leds(&mgr); assert(leds_mgr == &mgr);
    mw_dispatch_note_queue(&ev, 5); assert(queued == &ev);

    /* core_audio: pick the first owner that is on; mute only an exclusive muting one */
    static mw_i32 out[64], out2[256], in[64];
    for (int i = 0; i < 64; ++i) in[i] = i - 32;
    assert(!mw_audio_pick() && !owner);
    mw_audio_master(out, out2, in, 0); assert(masters == 1 && out[0] == -31);
    audio_b.on = 1; assert(!mw_audio_pick() && owner == &audio_b);   /* insert: never mutes */
    mw_audio_master(out, out2, in, 0);
    assert(masters == 2 && out[0] == -62 && mw_fw_usb_block[0] == (mw_i32)((mw_u32)-62 << 8) && mw_fw_usb_block[2] == 0);
    audio_a.on = 1; assert(mw_audio_pick() && owner == &audio_a);
    out2[7] = 5; mw_audio_master(out, out2, in, 0);
    assert(masters == 2 && out[0] == -64 && out[1] == -62 && mw_fw_usb_block[12] == (mw_i32)((mw_u32)-60 << 8));
    assert(mw_fw_usb_block[10] == (mw_i32)((mw_u32)-32 << 8) && mw_fw_usb_block[11] == (mw_i32)((mw_u32)-31 << 8) && out2[7] == 5);
    mw_fw_model_flags = 1u << 19; mw_audio_master(out, out2, in, 0);
    assert(out[0] == -62 && out[1] == -64 && out2[7] == 0);         /* a Keys: the pair swapped, out2 cleared */
    audio_a.flags = 0; assert(!mw_audio_pick());
    return 0;
}
