/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: ev_hold and the Mod Menu (core_menu). Holding a track key on its own asks
 * the ev_hold handlers; when none takes it and a module listed an entry, the Mod Menu opens over the screen:
 * a plain list of the entries, picked with YES or a trig key, moved through with UP, DOWN or the data
 * encoders, closed with NO, a page key or another hold. event-bus.c runs these ahead of each event's handlers.
 */
#include "base.h"

enum { KEY_FUNC = 1, KEY_2 = 2, KEY_PLAY = 11, KEY_STOP = 12, KEY_YES = 13, KEY_NO = 14, KEY_UP = 15, KEY_DOWN = 16,
       KEY_PAGE = 20, KEY_PAGE_LAST = 25, KEY_TRIG = 26, KEY_TRIG_LAST = 41, KEY_TRACK = 42, KEY_TRACK_LAST = 45 };
#define MW_MENU_ROWS 5

static mw_u32 down[2];          /* key codes below 64 held down */
static mw_u32 held;             /* the track key held on its own, or 0 */
static mw_u8 turned, open;
static mw_i32 sel, track, acc;

static mw_i32 entries(void)
{
    mw_i32 n = 0;
    while (core_menu[n]) ++n;
    return n;
}
static int is_down(mw_u32 k) { return k < 64 && down[k >> 5] >> (k & 31) & 1; }
static int is_track(mw_u32 k) { return k >= KEY_TRACK && k <= KEY_TRACK_LAST; }

/* FUNC, key 2 or another track key held: the press is a combination, not a hold. */
static int other_down(mw_u32 k)
{
    if (is_down(KEY_FUNC) || is_down(KEY_2)) return 1;
    for (mw_u32 t = KEY_TRACK; t <= KEY_TRACK_LAST; ++t)
        if (t != k && is_down(t)) return 1;
    return 0;
}

static int pick(void *brain, void *event, mw_i32 i)
{
    open = 0;
    if (core_menu[i]->open) core_menu[i]->open(brain, event, track);
    return 1;
}

/* A key while the menu is open: 1 when the menu takes it. */
static int menu_key(void *brain, void *event, mw_u32 k, mw_u32 a)
{
    if (k == KEY_PLAY || k == KEY_STOP || k == KEY_FUNC || is_track(k)) return 0;
    if (k >= KEY_PAGE && k <= KEY_PAGE_LAST) {
        if (a == MW_PRESS) open = 0;
        return 0;
    }
    if (a != MW_PRESS) return 1;
    mw_i32 n = entries();
    if (k == KEY_NO) open = 0;
    else if (k == KEY_UP) { if (sel > 0) --sel; }
    else if (k == KEY_DOWN) { if (sel < n - 1) ++sel; }
    else if (k == KEY_YES) { if (sel < n) return pick(brain, event, sel); }
    else if (k >= KEY_TRIG && k <= KEY_TRIG_LAST && (mw_i32)(k - KEY_TRIG) < n) return pick(brain, event, (mw_i32)(k - KEY_TRIG));
    return 1;
}

int mw_menu_key(void *brain, void *event)
{
    const mw_u32 *ev = event;
    mw_u32 k = ev[3], a = ev[4];
    if (k < 64) {
        if (a & 1) down[k >> 5] |= 1u << (k & 31);
        else down[k >> 5] &= ~(1u << (k & 31));
    }
    if (open && menu_key(brain, event, k, a)) return 1;
    if (!is_track(k)) {
        if (a & 1) held = 0;
        return 0;
    }
    if (a == MW_PRESS) {
        turned = 0;
        held = other_down(k) ? 0 : k;
        return 0;
    }
    if (a != MW_HOLD) { held = 0; return 0; }
    if (k != held || turned) return 0;
    held = 0;
    if (open) { open = 0; return 1; }
    if (mw_dispatch_hold(brain, event, (int)(k - KEY_TRACK))) return 1;
    mw_i32 n = entries();
    if (!n) return 0;
    if (sel < 0 || sel >= n) sel = 0;
    track = (mw_i32)(k - KEY_TRACK);
    acc = 0;
    open = 1;
    return 1;
}

int mw_menu_enc(void *brain, void *event)
{
    (void)brain;
    if (held) turned = 1;
    if (!open) return 0;
    mw_i32 n = entries();
    acc += ((const mw_i32 *)event)[4];
    for (; acc >= 4; acc -= 4) if (sel < n - 1) ++sel;
    for (; acc <= -4; acc += 4) if (sel > 0) --sel;
    return 1;
}

void mw_menu_tick(void *ctrl)
{
    if (open) ((mw_u8 *)ctrl)[0x20] = 1;
}

/* The whole 128 x 64 frame: a title, five numbered rows around the selection, a hint (y grows upwards). */
void mw_menu_draw(void *bmp)
{
    if (!open) return;
    mw_i32 n = entries(), first = sel < MW_MENU_ROWS ? 0 : sel - MW_MENU_ROWS + 1;
    mw_fw_fillrect(bmp, 0, 0, 127, 63, 0);
    mw_fw_textf(bmp, mw_fw_font5, 2, 57, -1, "MOD MENU  T%d", (int)track + 1);
    for (mw_i32 r = 0; r < MW_MENU_ROWS && first + r < n; ++r) {
        mw_i32 i = first + r, y = 47 - 9 * r;
        mw_fw_textf(bmp, mw_fw_font5, 4, y, -1, "%d %s", (int)i + 1, core_menu[i]->name);
        if (i == sel) mw_fw_framerect(bmp, 1, y - 2, 126, y + 6, -1);
    }
    mw_fw_textf(bmp, mw_fw_font5, 2, 1, -1, "YES OPEN  NO CLOSE");
}
