/* SPDX-License-Identifier: MIT
 * Host check of the Part Edit menu (part_menu.c, events.json ot_part_menu) over a model of the popup's state: with no
 * contribution the window is stock's and no key is taken; with two, the parents and actions move as the contract says,
 * PART's YES is stock's on the chosen row, a contribution's YES closes the popup and calls choose once with its action,
 * the press and its release are taken together, the window opens on the parent chosen last, LEVEL scrolls, a closed
 * popup hides the window, a bad record is skipped, and a record of abi 2 leaves its own row or PART out as it
 * answers, and PART left out with one row shown draws stock's popup with that row's actions. No stock byte is used. */
#define PM_HOST
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "modwerk_events.h"
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

static uint32_t popup_open, popup_cbs, popup_names, popup_row, dirty, stock_out;
static unsigned popups, closes, texts;
static char drawn[16][24];
static volatile uint32_t *host_word(uint32_t a)
{
    static uint32_t other;
    if (a == 0x460e5e30u) return &popup_open;
    if (a == 0x460e5e28u) return &popup_cbs;
    if (a == 0x460e5e2cu) return &popup_names;
    if (a == 0x460e5e40u) return &popup_row;
    if (a == 0x46c7c72cu) return &dirty;
    return &other;
}
#define U32(a) (*host_word(a))
static void host_popup(uint32_t n, uint32_t row, uint32_t *out, const char *const *names, const void *cbs)
{
    (void)n; (void)out; ++popups;
    popup_open = 1; popup_row = row; popup_cbs = (uint32_t)(uintptr_t)cbs; popup_names = (uint32_t)(uintptr_t)names;
}
#define PM_POPUP(n, row, out, names, cbs) host_popup(n, row, out, names, cbs)
#define PM_CLOSE() (++closes, popup_open = 0)
static const unsigned char *bound; /* the frame the text surface points at: text drawn before it is bound is lost */
#define PM_BIND(frame) (bound = (frame))
#define PM_TEXT(x, top, t) (texts < 16u ? (void)strncpy(drawn[texts++], bound ? (t) : "UNBOUND", 23) : (void)0)
#define PM_WIDTH(t) ((int)strlen(t) * 5)
#define PM_MASK() 0u
#define PM_UNMASK(m) ((void)(m))
static const char *const stock_names[4] = {"RENAME", "RELOAD", "SAVE", "SAVE ALL"};
#define PM_STOCK_NAME(names, row) ((void)(names), stock_names[row])

static const struct modwerk_part_menu *table[8];
static unsigned pm_entries(const struct modwerk_part_menu **out)
{
    unsigned n = 0;
    for (unsigned k = 0; table[k] && n < 7u; ++k) {
        const struct modwerk_part_menu *e = table[k];
        if ((e->abi == MODWERK_PART_MENU_ABI || e->abi == MODWERK_PART_MENU_ABI_ASK) && e->label && e->actions && e->choose && e->count >= 1u && e->count <= 6u)
            out[n++] = e;
    }
    return n;
}
#include "part_menu.c"

static unsigned chosen_a = 99, chosen_b = 99, calls_a, calls_b;
static void choose_a(unsigned action) { chosen_a = action; ++calls_a; CHECK(!popup_open); }
static void choose_b(unsigned action) { chosen_b = action; ++calls_b; }
static const char *const actions_a[2] = {"LOCK SAMPLES", "CLEAR LOCKS"};
static const char *const actions_b[1] = {"SAVE KIT"};
static const uint32_t icon_a[9] = {0, 0x700, 0x880, 0x880, 0x1fc0, 0x1dc0, 0x1fc0, 0x1fc0, 0};
static const struct modwerk_part_menu a = {MODWERK_PART_MENU_ABI, "LOCKS", 2, actions_a, choose_a, icon_a};
static const struct modwerk_part_menu b = {MODWERK_PART_MENU_ABI, "KITS", 1, actions_b, choose_b, 0};
static const struct modwerk_part_menu bad = {MODWERK_PART_MENU_ABI, "BAD", 0, actions_b, choose_b, 0};
static uint32_t says; static unsigned asked;
static uint32_t ask(void) { ++asked; return says; }
static const char *const kit_actions[3] = {"SAVE KIT", "RELOAD KIT", "RENAME KIT"};
static const struct modwerk_part_menu_ask k = {{MODWERK_PART_MENU_ABI_ASK, "KITS", 3, kit_actions, choose_b, 0}, ask};
static const char *const other_actions[1] = {"OTHER"};
static const struct modwerk_part_menu_ask k2 = {{MODWERK_PART_MENU_ABI_ASK, "OTHER", 1, other_actions, choose_b, 0}, ask};
static const struct modwerk_part_menu_ask one_asks = {{MODWERK_PART_MENU_ABI, "OLD", 1, actions_b, choose_b, 0}, ask}; /* abi 1: never asked */

static void open_part_edit(void)
{
    popup_open = 0;
    mw_part_menu_open(4, stock_out, (uint32_t *)(uintptr_t)0x460d101cu, (const char *const *)(uintptr_t)0x400b9b14u,
                      (const void *)(uintptr_t)0x400b9b04u);
}
static int press(int code) { int took = mw_part_menu_key(code, 1); CHECK(mw_part_menu_key(code, 0) == took); return took; }
static unsigned char frame[1024];
static int pixel(unsigned x, unsigned y) { unsigned bit = 63u - y; return frame[x * 8u + (bit >> 3)] >> (7u - (bit & 7u)) & 1u; }

int main(void)
{
    /* No contribution: stock's window, nothing taken or drawn. */
    open_part_edit();
    CHECK(popups == 1 && popup_open && !pm_shown);
    CHECK(!press(PM_DOWN) && !press(PM_YES));
    texts = 0; mw_part_menu_draw(frame); CHECK(texts == 0);

    /* Another popup (not Part Edit) is never taken over. */
    table[0] = &a; table[1] = &bad; table[2] = &b;
    mw_part_menu_open(3, 0, (uint32_t *)(uintptr_t)0x460d1000u, (const char *const *)(uintptr_t)0x400c0000u,
                      (const void *)(uintptr_t)0x400c0010u);
    CHECK(!pm_shown);

    /* Two contributions (the bad one skipped): the title, then PART, LOCKS, KITS on the left. */
    open_part_edit();
    CHECK(pm_shown && pm_parent == 0 && !pm_focus);
    texts = 0; mw_part_menu_draw(frame);
    CHECK(texts == 8 && !strcmp(drawn[0], "PART EDIT") && !strcmp(drawn[1], "PART") && !strcmp(drawn[2], "LOCKS"));
    CHECK(!strcmp(drawn[3], "KITS") && !strcmp(drawn[4], "RENAME") && !strcmp(drawn[7], "SAVE ALL"));
    /* PROJ's frame: the title bar filled, the rule at x 57, the shadow below from x 8; the strips outside untouched. */
    CHECK(!pixel(30, 0) && !pixel(30, 63) && pixel(10, 1) && pixel(57, 30) && pixel(121, 40) && pixel(8, 62) && !pixel(7, 62) && !pixel(3, 30) && !pixel(125, 30));
    /* PART highlighted with the left column focused: its row inverted (its icon's blank corner set). */
    CHECK(pixel(8, 11) && pixel(55, 19) && !pixel(58, 11));
    CHECK(press(PM_DOWN) && pm_parent == 1);
    texts = 0; mw_part_menu_draw(frame);
    CHECK(texts == 6 && !strcmp(drawn[4], "LOCK SAMPLES") && !strcmp(drawn[5], "CLEAR LOCKS"));
    CHECK(pixel(8, 21) && pixel(13, 22) && !pixel(16, 22) && !pixel(15, 23)); /* LOCKS inverted, its icon cut out of the bar */
    CHECK(press(PM_DOWN) && press(PM_DOWN) && pm_parent == 2);   /* stops on the last */
    CHECK(press(PM_UP) && pm_parent == 1);
    CHECK(press(PM_LEFT) && !pm_focus);                         /* nothing to the left */
    CHECK(press(PM_RIGHT) && pm_focus && pm_child == 0);
    CHECK(press(PM_DOWN) && pm_child == 1 && press(PM_DOWN) && pm_child == 1);
    CHECK(press(PM_LEFT) && !pm_focus && pm_shown && popup_open); /* LEFT goes back */
    CHECK(press(PM_YES) && pm_focus);                           /* YES on a parent enters it */
    CHECK(mw_part_menu_key(PM_NO, 1) == 0 && !pm_shown);        /* NO in the right column closes it, as PROJ */
    mw_part_menu_key(PM_NO, 0);
    open_part_edit();
    CHECK(pm_shown && pm_parent == 1 && pm_focus && pm_child == 1); /* and it reopens there */
    CHECK(!mw_part_menu_key(0x10, 1));                          /* another key is stock's */
    CHECK(press(PM_DOWN) && pm_child == 1);
    CHECK(press(PM_YES));
    CHECK(calls_a == 1 && chosen_a == 1 && closes == 1 && !pm_shown && !calls_b);
    CHECK(!press(PM_YES));                                      /* closed: nothing taken */

    /* It opens where it was left, as PROJ's menu does: LOCKS, in the right column, on CLEAR LOCKS. */
    open_part_edit();
    CHECK(pm_shown && pm_parent == 1 && pm_focus && pm_child == 1);
    /* PART's actions start on stock's remembered row; YES there is stock's, on the row chosen. */
    popup_row = 3;
    CHECK(press(PM_LEFT) && press(PM_UP) && pm_parent == 0 && press(PM_RIGHT) && pm_focus && pm_child == 3);
    CHECK(press(PM_UP) && popup_row == 2);
    CHECK(mw_part_menu_key(PM_YES, 1) == 0 && !pm_shown && popup_row == 2 && popup_open);
    CHECK(mw_part_menu_key(PM_YES, 0) == 0);
    CHECK(calls_a == 1 && closes == 1);
    /* PART's action row, remembered, then each module's own row as well, also when left with NO. */
    popup_row = 0;
    open_part_edit();
    CHECK(pm_parent == 0 && pm_focus && pm_child == 2 && popup_row == 2);
    CHECK(press(PM_LEFT) && press(PM_DOWN) && press(PM_RIGHT) && pm_parent == 1 && pm_child == 1); /* LOCKS kept CLEAR */
    CHECK(press(PM_LEFT) && press(PM_DOWN) && pm_parent == 2);
    CHECK(mw_part_menu_key(PM_NO, 1) == 0 && !pm_shown);          /* NO on a parent closes the window through stock */
    mw_part_menu_key(PM_NO, 0);
    open_part_edit();
    CHECK(pm_shown && pm_parent == 2 && !pm_focus);                /* KITS, left column, as left */

    /* LEVEL moves a row per detent (four steps), the other encoders are held. */
    CHECK(mw_part_menu_enc(6, -4) && pm_parent == 1);
    CHECK(mw_part_menu_enc(6, 2) && pm_parent == 1 && mw_part_menu_enc(6, 2) && pm_parent == 2);
    CHECK(mw_part_menu_enc(0, 4) && pm_parent == 2);

    /* Stock closed its popup: the window goes with it. */
    popup_open = 0; mw_part_menu_tick(); CHECK(!pm_shown);
    CHECK(!mw_part_menu_enc(6, 4));

    /* A contribution removed while open: the cursor stays on a row that exists. */
    open_part_edit();
    CHECK(press(PM_RIGHT) && pm_parent == 2 && pm_focus);
    table[2] = 0;
    CHECK(press(PM_DOWN) && pm_parent == 1 && !pm_focus);
    CHECK(press(PM_RIGHT) && pm_child == 1 && press(PM_UP) && press(PM_YES) && calls_a == 2 && chosen_a == 0);
    /* A module that is gone is not reopened on: the window starts on a row that exists. */
    table[0] = 0; table[0] = &b; table[1] = 0;
    open_part_edit();
    CHECK(pm_shown && pm_parent == 0 && !pm_focus);

    /* A record of abi 2 is asked when the window opens. LEAVE_PART: PART is left out, the window starts on the first row. */
    table[0] = &a; table[1] = &k.menu; table[2] = &one_asks.menu; table[3] = 0;
    pm_was = PM_PART_ID; pm_was_focus = 1; says = MODWERK_PART_MENU_LEAVE_PART; asked = 0;
    open_part_edit();
    CHECK(asked == 1 && pm_shown && !pm_list && pm_parent == 1 && !pm_focus); /* PART was chosen last: the first row instead */
    texts = 0; mw_part_menu_draw(frame);
    CHECK(!strcmp(drawn[1], "LOCKS") && !strcmp(drawn[2], "KITS") && !strcmp(drawn[3], "OLD") && !strcmp(drawn[4], "LOCK SAMPLES"));
    for (unsigned t = 0; t < texts; ++t) CHECK(strcmp(drawn[t], "PART") && strcmp(drawn[t], "RENAME"));
    CHECK(pixel(8, 11) && pixel(55, 19));                           /* LOCKS in PART's place, inverted */
    CHECK(press(PM_UP) && pm_parent == 1 && press(PM_DOWN) && pm_parent == 2);
    CHECK(mw_part_menu_enc(6, -8) && pm_parent == 1);               /* LEVEL stops at the first shown as well */
    CHECK(press(PM_DOWN) && press(PM_RIGHT) && press(PM_YES) && calls_b == 1 && chosen_b == 0 && !pm_shown);
    /* It answers 0: PART is back, and the window opens where it was left. */
    says = 0;
    open_part_edit();
    CHECK(asked == 2 && pm_parent == 2 && pm_focus);
    CHECK(press(PM_LEFT) && press(PM_UP) && press(PM_UP) && pm_parent == 0);
    mw_part_menu_key(PM_NO, 1); mw_part_menu_key(PM_NO, 0);
    /* LEAVE_ROW: its own row is left out, PART stays (a module that is inactive). */
    says = MODWERK_PART_MENU_LEAVE_ROW | MODWERK_PART_MENU_LEAVE_PART;
    open_part_edit();
    CHECK(asked == 3 && pm_shown && !pm_lo && !pm_list);
    texts = 0; mw_part_menu_draw(frame);
    CHECK(!strcmp(drawn[1], "PART") && !strcmp(drawn[2], "LOCKS") && !strcmp(drawn[3], "OLD") && strcmp(drawn[4], "KITS"));
    CHECK(press(PM_DOWN) && press(PM_DOWN) && pm_parent == 2 && press(PM_DOWN) && pm_parent == 2); /* KITS is not there */
    mw_part_menu_key(PM_NO, 1); mw_part_menu_key(PM_NO, 0);
    /* Every row left out: stock's window, nothing taken. */
    table[0] = &k.menu; table[1] = 0;
    open_part_edit();
    CHECK(asked == 4 && !pm_shown && popup_open && !press(PM_DOWN));
    /* PART left out and one row shown: stock's popup with that row's actions, the cursor in them. */
    says = MODWERK_PART_MENU_LEAVE_PART;
    open_part_edit();
    CHECK(asked == 5 && pm_shown && pm_list && pm_parent == 1 && pm_focus);
    memset(frame, 0, sizeof frame); texts = 0; bound = 0; mw_part_menu_draw(frame);
    CHECK(bound == frame);
    CHECK(texts == 3 && !strcmp(drawn[0], "SAVE KIT") && !strcmp(drawn[1], "RELOAD KIT") && !strcmp(drawn[2], "RENAME KIT"));
    /* The box fits the widest action (RENAME KIT, 50 pixels in this test's text): x 43-99, y 16-47, shadow to 101. */
    CHECK(pixel(43, 16) && pixel(43, 47) && pixel(99, 30) && pixel(101, 30) && pixel(45, 18 + 7 * pm_child) && !pixel(30, 30) && !pixel(103, 30));
    CHECK(press(PM_LEFT) && pm_focus && press(PM_RIGHT) && pm_focus);  /* no left column to go to */
    unsigned at = pm_child;
    CHECK(press(PM_DOWN) && pm_child == (at + 1u < 3u ? at + 1u : at));
    CHECK(press(PM_UP) && press(PM_UP) && press(PM_UP) && pm_child == 0);
    CHECK(press(PM_DOWN) && press(PM_YES) && calls_b == 2 && chosen_b == 1 && !pm_shown && !popup_open);
    open_part_edit();
    CHECK(pm_list && pm_child == 1);                                 /* it reopens on the row chosen */
    CHECK(mw_part_menu_key(PM_NO, 1) == 0 && !pm_shown);              /* NO: stock closes its popup */
    mw_part_menu_key(PM_NO, 0);
    /* The module removed while it is open: the window is stock's again and its keys are stock's. */
    open_part_edit();
    table[0] = 0;
    CHECK(!press(PM_DOWN) && !pm_shown);
    texts = 0; mw_part_menu_draw(frame); CHECK(texts == 0);
    table[0] = &k.menu; open_part_edit(); CHECK(pm_list); table[0] = 0;
    CHECK(mw_part_menu_enc(6, 4) == 0 && !pm_shown);                /* LEVEL too */
    table[0] = &k.menu; open_part_edit(); CHECK(pm_list); table[0] = 0;
    mw_part_menu_tick(); CHECK(!pm_shown);                           /* and the next tick, with no key pressed */
    CHECK(asked == 9);                                              /* once an opening; abi 1's field never asked */
    /* Kits hiding PART beside Locks, then only Kits removed while it is open: PART is back though Locks stays. */
    table[0] = &a; table[1] = &k.menu; table[2] = 0;
    open_part_edit();
    CHECK(asked == 10 && pm_shown && pm_lo && !pm_list && pm_parent >= 1);    /* on KITS, the row used last */
    table[1] = 0;
    CHECK(press(PM_UP) && !pm_lo && !pm_list && pm_parent == 0);
    texts = 0; mw_part_menu_draw(frame);
    CHECK(!strcmp(drawn[1], "PART") && !strcmp(drawn[2], "LOCKS"));
    CHECK(press(PM_RIGHT) && press(PM_UP) && press(PM_UP) && press(PM_UP) && press(PM_DOWN) && popup_row == 1 && mw_part_menu_key(PM_YES, 1) == 0 && !pm_shown); /* RELOAD: stock's */
    mw_part_menu_key(PM_YES, 0);
    /* Two records leaving PART out: it stays out until both are gone. */
    table[0] = &a; table[1] = &k.menu; table[2] = &k2.menu; table[3] = 0;
    open_part_edit();
    CHECK(asked == 12 && pm_lo);
    table[1] = &k2.menu; table[2] = 0;
    CHECK(press(PM_DOWN) && pm_lo && pm_parent >= 1);
    table[1] = 0;
    CHECK(press(PM_UP) && !pm_lo && pm_parent == 0);
    mw_part_menu_key(PM_NO, 1); mw_part_menu_key(PM_NO, 0);

    if (failures) { fprintf(stderr, "%u failed\n", failures); return 1; }
    puts("part menu: ok");
    return 0;
}
