/* Mixer Mode M3b: the Effect Chain screen (stock screen 3) model, keys and
 * hooks. Design: docs/dev/mixer-ui-mockup.html v20 (knob(), cursor handlers),
 * addresses: docs/dev/mixer-mode-m3-research.md "M3b". Entry points (chain_vec.asm
 * at the section start): chain_key, chain_draw_h, chain_poll, s33_keys.
 *
 * Slots stay sorted by zone (PRE, A, B, POST), so a zone's effects are
 * consecutive slots and every move is adjacent swaps through mixer.S mv_swap
 * (the bus byte goes along) plus at most one LAYOUT flip.
 * ponytail: a patch whose buses were set unsorted on the M3a BUS pages shows
 * by zone here but plays Serial in slot order; move its effects once to sort it. */
#include "chain.h"
#include "stock.h"

#define EV_KNOB2_LONG 225   /* key event chain_poll posts (stock: footswitch hold timer 1, play mode only) */
#define LONG_POLLS 38       /* 16 ms polls: about 0.6 s, the mockup's long press */
#define EV_IDLE 240         /* chain_poll posts it after the IDLE KALEIDO time; no stock handler */
#define KEY_CLASS FN(0xC00D13B4, int, (int ev))          /* 0 = a key event, -1 = not */
#define VIEW_KNOBS (*(volatile int *)0xC009D398)         /* play mode showing an effect's knob pages */

static int held;            /* polls knob 2 has been down since its press here (chain_poll) */
static int down;            /* 1: knob 2's press (64) came on this screen, its release (65) not yet */
/* ponytail: a knob 2 release that lands off screen 3 leaves down = 1; harmless (the poll
 * also needs the switch down, and the next 64 / 65 resets it); add a SW_STATE check if not. */
static int skip65;          /* the release of a hold that went long is not EXIT */
static int idle;            /* 16 ms polls with no key on the play screen */
static int fdown;           /* the footswitch is down (its 32 came, its 33 not yet) */
static const unsigned short idle_polls[5] = {0, 625, 1875, 3750, 7500};   /* OFF, 10 S, 30 S, 1, 2 MIN */

#define FX(it) ((it) < 6)
#define ZONE(s) (LAYOUT[s] & 3)
#define OTHER(b) ((b) == BUS_A ? BUS_B : BUS_A)
#define PAR(c) ((c)->mode == 1 || (c)->mode == 2)   /* Parallel or Split: buses, [MIX] */

void chain_build(Chain *c)
{
    int s, b, n = COUNT;
    if (n > 6) n = 6;
    if (n < 0) n = 0;
    c->n = n;
    c->mode = eff_mode();
    c->stereo = PEDAL;
    c->out = LIVE[S_OUT] > 2 ? 0 : LIVE[S_OUT];
    for (b = 0; b < 2; b++)             /* Solo overrides Mute; Serial has no [MIX] */
        c->mute[b] = !PAR(c) ? 0 : LIVE[S_SOLO] ? LIVE[S_SOLO] != b + 1 : LIVE[S_MUTEA + b] != 0;
    c->silent = mix_silent();
    for (b = 0; b < 4; b++) c->nz[b] = 0;
    for (s = 0; s < 6; s++) { c->name[s] = 0; c->on[s] = 0; c->full[s] = 0; }
    for (s = 0; s < n; s++) {
        b = ZONE(s);
        c->z[b][c->nz[b]++] = s;
        c->name[s] = FX_NAME(s, 1);
        c->full[s] = DSP_OFF >> s & 1;
        c->on[s] = FX_REC(s)[0] != 0 && !c->full[s];
    }
    c->cur = UI[UI_CUR];
    c->sel = UI[UI_SEL];
    c->busrow = UI[UI_BUSROW];
    c->delp = UI[UI_DELP];
    c->limit = HOLD != 0;
    /* keep the UI state valid for what the patch is now */
    if (FX(c->cur) ? c->cur >= n : c->cur < IT_ROUTE || c->cur > IT_OUT) c->cur = n ? n - 1 : IT_IN;
    if (c->cur == IT_MIX && !PAR(c)) c->cur = IT_ROUTE;
    if (c->cur == IT_IN || c->cur == IT_OUT) c->sel = 0;
    if (c->busrow != BUS_A && c->busrow != BUS_B) c->busrow = BUS_A;
}

static void save(const Chain *c)
{
    UI[UI_CUR] = c->cur;
    UI[UI_SEL] = c->sel;
    UI[UI_BUSROW] = c->busrow;
    UI[UI_DELP] = c->delp;
}

/* A fresh entry (the menu's SET_SCREEN(3, 0) leaves ROW >= -1) resets the UI;
 * our own returns use row -2 (SET_SCREEN keeps rows below 4 as they are). */
static void enter(void)
{
    if (ROW == -2) return;
    UI[UI_CUR] = COUNT > 0 ? 0 : IT_IN;
    UI[UI_SEL] = 0;
    UI[UI_BUSROW] = BUS_A;
    UI[UI_DELP] = 0;
    UI[UI_ADDBUS] = 0xFF;
    UI[UI_FROMCHAIN] = 0;
    UI[UI_PFIRST] = 0;
    UI[UI_PLAST] = PG_N - 1;
    down = skip65 = 0;
    ROW = -2;
}

static int zone_add(const Chain *c, unsigned char *l, int k, int b)
{
    int i;
    for (i = 0; i < c->nz[b]; i++) l[k++] = c->z[b][i];
    return k;
}

/* The items in signal order; bus < 0: every effect (mockup order()), else
 * only that bus row between [ROUTE] and [MIX] (browsing in Parallel). */
static int list(const Chain *c, unsigned char *l, int bus)
{
    int k = 0;
    l[k++] = IT_IN;
    k = zone_add(c, l, k, PRE);
    l[k++] = IT_ROUTE;
    if (bus < 0 || !PAR(c)) { k = zone_add(c, l, k, BUS_A); k = zone_add(c, l, k, BUS_B); }
    else k = zone_add(c, l, k, bus);
    if (PAR(c)) l[k++] = IT_MIX;
    k = zone_add(c, l, k, POST);
    l[k++] = IT_OUT;
    return k;
}

static int find(const unsigned char *l, int k, int it)
{
    while (k--) if (l[k] == it) return k;
    return -1;
}

static int on_bus(const Chain *c, int it) { return FX(it) && (ZONE(it) == BUS_A || ZONE(it) == BUS_B); }

static int index_in_zone(const Chain *c, int s) { return find(c->z[ZONE(s)], c->nz[ZONE(s)], s); }

static void step(Chain *c, int dir)          /* +1 = right on screen = earlier in the signal */
{
    unsigned char l[10];
    int b, k, i;
    if (on_bus(c, c->cur)) c->busrow = ZONE(c->cur);
    b = c->nz[c->busrow] ? c->busrow : OTHER(c->busrow);
    k = list(c, l, b);
    i = find(l, k, c->cur) - dir;
    if (i < 0) i = 0;
    if (i > k - 1) i = k - 1;
    c->cur = l[i];
    if (on_bus(c, c->cur)) c->busrow = ZONE(c->cur);
}

static void other_bus(Chain *c)              /* same column, else the nearest effect */
{
    int z, o, i;
    if (!PAR(c) || !on_bus(c, c->cur)) return;
    z = ZONE(c->cur);
    o = OTHER(z);
    if (!c->nz[o]) return;
    i = index_in_zone(c, c->cur);
    if (i > c->nz[o] - 1) i = c->nz[o] - 1;
    c->cur = c->z[o][i];
    c->busrow = o;
}

/* Slot s to slot t by adjacent swaps (rows: row = n - 1 - slot), then its bus. */
static int move_to(const Chain *c, int s, int t, int bus)
{
    int n = c->n;
    for (; s < t; s++) MV_SWAP(n - 1 - s, n - 2 - s);
    for (; s > t; s--) MV_SWAP(n - 1 - s, n - s);
    LAYOUT[t] = bus;
    return t;
}

static void move_effect(Chain *c, int dir)   /* mockup moveEffect */
{
    int s = c->cur, z = ZONE(s), i = index_in_zone(c, s);
    if (dir < 0) {
        if (i < c->nz[z] - 1) c->cur = move_to(c, s, s + 1, z);
        else if (z == PRE) move_to(c, s, s, BUS_A);
        else if (z == BUS_A) c->cur = move_to(c, s, s + c->nz[BUS_B], POST);
        else if (z == BUS_B) move_to(c, s, s, POST);
    } else {
        if (i > 0) c->cur = move_to(c, s, s - 1, z);
        else if (z == POST) c->cur = move_to(c, s, s - c->nz[BUS_B], BUS_A);
        else if (z == BUS_A) move_to(c, s, s, PRE);
        else if (z == BUS_B) c->cur = move_to(c, s, s - c->nz[BUS_A], PRE);
    }
}

static void move_node(Chain *c, int dir)     /* mockup moveNode: the effect next to it changes zone */
{
    int pre = c->nz[PRE], a = c->nz[BUS_A], b = c->nz[BUS_B];
    if (c->cur == IT_ROUTE && dir < 0 && a + b) LAYOUT[pre] = PRE;
    if (c->cur == IT_ROUTE && dir > 0 && pre) LAYOUT[pre - 1] = BUS_A;
    if (c->cur == IT_MIX && dir < 0 && c->nz[POST]) move_to(c, pre + a + b, pre + a, BUS_A);
    if (c->cur == IT_MIX && dir > 0) {
        if (a) move_to(c, pre + a - 1, pre + a - 1 + b, POST);
        else if (b) LAYOUT[pre + b - 1] = POST;
    }
}

static void swap_bus(Chain *c)               /* mockup swapBus: same index on the other bus */
{
    int s = c->cur, z = ZONE(s), o = OTHER(z), i = index_in_zone(c, s), t;
    if (i > c->nz[o]) i = c->nz[o];
    t = z == BUS_A ? c->nz[PRE] + c->nz[BUS_A] - 1 + i : c->nz[PRE] + i;
    c->cur = move_to(c, s, t, o);
    c->busrow = o;
}

static int play_cursor(int slot)             /* the play-mode cursor on that slot, -1 */
{
    int i;
    for (i = 0; i < 6; i++) if (SLOT_AT(i) == slot) return i;
    return -1;
}

static int add(Chain *c, int dir)            /* mockup addEffect, through stock screen 33 */
{
    int pre = c->nz[PRE], a = c->nz[BUS_A], b = c->nz[BUS_B], ins = -1, bus = PRE;
    if (c->n >= 6) { POPUP(0, MAX_FX_TEXT, 1000); return 1; }
    if (c->cur == IT_IN && dir < 0) { ins = 0; bus = PRE; }
    if (c->cur == IT_OUT && dir > 0) { ins = c->n; bus = POST; }
    if (c->cur == IT_ROUTE) { ins = pre; bus = dir < 0 ? BUS_A : PRE; }
    if (c->cur == IT_MIX) { ins = dir < 0 ? pre + a + b : pre + a; bus = dir < 0 ? POST : BUS_A; }
    if (FX(c->cur)) { ins = c->cur + (dir < 0); bus = ZONE(c->cur); }
    if (ins < 0) return 0;
    ANCHOR = ins ? ins - 1 : 0;              /* stock inserts at ANCHOR + SIDE */
    SIDE = ins ? 1 : 0;
    UI[UI_ADDBUS] = bus;                     /* mv_add gives it this bus and moves the cursor there */
    UI[UI_FROMCHAIN] = 2;                    /* s33_keys comes back here */
    c->sel = 0;
    save(c);
    SET_SCREEN(33, 0);
    return 1;
}

static void delete(Chain *c)                 /* mockup deleteEffect: the cursor goes on in the signal */
{
    unsigned char l[10];
    int s = c->cur, p = play_cursor(s), nx;
    if (p < 0) return;                       /* ponytail: only a slot the play view's cursor reaches */
    nx = l[find(l, list(c, l, -1), s) + 1];
    CURSOR = p;
    MV_DELETE();
    c->cur = FX(nx) ? nx - 1 : nx;
    c->sel = 0;
}

static int open(Chain *c)                    /* OPEN: an effect's knob pages, a node's knob pages */
{
    static const unsigned char first[4] = { PG_ROUTE, PG_MIX, PG_IN, PG_OUT };   /* ROUTE MIX IN OUT */
    static const unsigned char last[4] = { PG_MIX - 1, PG_OUT - 1, PG_IN, PG_OUT };
    int p;
    c->sel = 0;
    save(c);
    if (FX(c->cur)) {
        p = play_cursor(c->cur);
        if (p < 0) return 1;
        CURSOR = p;                          /* play view on it; EXIT is stock (patch list), Luca 2026-10-19 */
        MODE = 0;
        return 1;
    }
    UI[UI_PFIRST] = first[c->cur - IT_ROUTE];
    UI[UI_PLAST] = last[c->cur - IT_ROUTE];
    PAGE = UI[UI_PFIRST];
    SET_SCREEN(15, 0);
    UI[UI_FROMCHAIN] = 1;                    /* the MIXER EXIT comes back here */
    return 1;
}

static void type(const Chain *c, int dir)    /* cursor up / down: the next effect type, in place */
{
    int id, nx;
    if (!FX(c->cur)) return;
    id = FX_REC(c->cur)[1];
    nx = TYPE_NEXT(id, dir);
    if (nx >= 0 && nx != id) TYPE_SET(c->cur, nx);   /* ponytail: its return (a popup, stock 0xC00AB540) ignored */
}

/* Screen 3 key entry (chain_vec.asm keys stub): event, knob steps; 1 = redraw. */
int chain_key(int ev, int steps)
{
    Chain c;
    int sure, n, dir = steps < 0 ? -1 : 1, r = 1;
    enter();
    chain_build(&c);
    if (ev == 64) { down = 1; skip65 = 0; return 0; }       /* knob 2 press: chain_poll times the hold */
    if (ev == 65) {
        n = skip65;
        down = skip65 = 0;
        if (n) return 0;                     /* the release of a long press */
    }
    if (ev == 72 || ev == 73) TIMER6(ev == 72);      /* cursor hold: stock starts these only in play mode */
    if (ev == 74 || ev == 75) TIMER7(ev == 74);
    if (ev == 72 || ev == 74) return 0;
    if (ev == EV_KNOB2_LONG) {
        if (!down) return 0;                 /* only a hold that began with a knob 2 press here */
        skip65 = 1;
        if (c.sel && FX(c.cur)) c.delp = 1;
        save(&c);
        return 1;
    }
    sure = c.delp;                           /* DELETE? waits for one knob 2 press; anything else cancels */
    c.delp = 0;
    if (ev == 65) {
        if (sure) delete(&c);
        else if (!c.sel) { save(&c); SET_SCREEN(0, 1); return 1; }   /* EXIT, as stock */
        else r = 0;
    } else if (sure && (ev == 34 || ev == 67 || (ev >= 160 && ev <= 162))) {
        r = 1;                               /* a knob only cancels */
    } else if (ev == 34) {
        if (c.cur != IT_IN && c.cur != IT_OUT) c.sel = !c.sel;
    } else if (ev == 160) {
        for (n = steps < 0 ? -steps : steps; n--; ) {
            if (!c.sel) step(&c, dir);
            else if (FX(c.cur)) move_effect(&c, dir);
            else move_node(&c, dir);
            save(&c);
            chain_build(&c);
        }
    } else if (ev == 162) {
        if (c.sel && c.cur == IT_ROUTE) {    /* Mode, straight from the chain (Split, Mono Serial: STEREO) */
            n = c.mode + steps;
            LIVE[S_MODE] = n < 0 ? 0 : n > (PEDAL ? 3 : 1) ? (PEDAL ? 3 : 1) : n;
        } else if (c.sel && c.cur == IT_MIX) {   /* Output Mode: Stereo / Mono / Split */
            n = c.out + steps;
            LIVE[S_OUT] = n < 0 ? 0 : n > 2 ? 2 : n;
        } else if (c.sel && PAR(&c) && on_bus(&c, c.cur)) swap_bus(&c);
        else if (!c.sel) other_bus(&c);
        else r = 0;
    } else if (ev == 67) {
        return open(&c);
    } else if (ev == 230 || ev == 231) {
        if (ev == 230) TIMER6(0); else TIMER7(0);
        return add(&c, ev == 230 ? -1 : 1);  /* left hold: left of the cursor, later in the signal */
    } else if (ev == 69 || ev == 71) {
        type(&c, ev == 69 ? 1 : -1);
    } else if (ev == 32) {                   /* footswitch press: the effect ON / OFF, as in play mode */
        if (FX(c.cur) && !(DSP_OFF >> c.cur & 1)) { FX_TOGGLE(c.cur); FX_EDITED(); }
    } else if (ev != 73 && ev != 75 && ev != 161) {
        return 0;                            /* footswitch release and the rest: nothing here */
    }
    save(&c);
    return r;
}

/* Effect View knob pages (0xC00CAFA0), in place of its call of 0xC00BB92C after
 * the page tabs: an effect on a bus gets an A / B tag at the right of the tab
 * row in Parallel and Split, Pre / Post effects an R / M tag. tabs_end = x of the last tab's right edge. */
#define AB_X 114                             /* 14 px tag (7 * 1 + 7) at the right edge */
int ab_tag(int slot, int view, int tabs_end)
{
    int r = PARAMS_ANY(slot), m = eff_mode(), z;
    if ((m == 1 || m == 2) && slot >= 0 && slot < COUNT && tabs_end < AB_X) {
        z = ZONE(slot);           /* PRE..POST: R (before [ROUTE]), A, B, M (after [MIX]) */
        KP_TAB(view, AB_X, 0, 0, z == BUS_A ? "A" : z == BUS_B ? "B" : z == PRE ? "R" : "M");
    }
    return r;
}

/* Screen 3 draw entry: the whole screen from chain_draw, sent in the LCD's
 * page format (byte = 8 rows of one column, bit 0 on top). */
void chain_draw_h(void)
{
    static unsigned char fb[64][16];
    Chain c;
    enter();
    chain_build(&c);
    save(&c);
    chain_draw(&c, fb);
    blit_fb(fb);
    SHOWN = c.limit;
}

void blit_fb(unsigned char fb[64][16])
{
    static unsigned char pg[1024];
    int x, y;
    for (x = 0; x < 1024; x++) pg[x] = 0;
    for (y = 0; y < 64; y++)
        for (x = 0; x < 128; x++)
            if (fb[y][x >> 3] & 0x80 >> (x & 7)) pg[(y >> 3) * 128 + x] |= 1 << (y & 7);
    BLIT(0, 0, 0, 128, 64, pg);
}

/* Every 16 ms (mixer.S poll, the switch task): the IDLE KALEIDO timer, the knob 2
 * long press as a key event, and a display redraw (Event flag 0x40) when LIMIT changes. */
void chain_poll(void)
{
    int n = IDLE, ev = 0;
    if (!n || MODE || VIEW_KNOBS || fdown) idle = 0;
    else if (++idle == idle_polls[n]) ev = EV_IDLE;
    if (MODE != 11 || SCREEN != 11) IDLE_SHOWN = 0;
    if (MODE != 11 || SCREEN != 3) held = 0;
    else {
        if (!down || SW_STATE & SW_KNOB2) held = 0;
        else if (++held == LONG_POLLS) ev = EV_KNOB2_LONG;
        if ((HOLD != 0) != SHOWN) EVENT_POST(MAILBOX, 0x40);
    }
    if (ev) KEY_POST(ev);   /* one call site */
}

/* Every event, in the UI task before its dispatch (callp at 0xC00ACE08, in place of
 * stock KEY_CLASS): a key restarts the idle count, and the footswitch press leaves an
 * idle KALEIDO (then plays as in play mode); EV_IDLE opens KALEIDO from the play screen.
 * MODE changes here, so the stock mode-change handler runs after the dispatch. */
int idle_ev(int ev)
{
    int key = KEY_CLASS(ev);
    if (!key) {
        idle = 0;
        if (ev == 32 || ev == 33) fdown = ev == 32;
        if (ev == 32 && IDLE_SHOWN) {        /* set only on KALEIDO; every way out clears it */
            IDLE_SHOWN = 0;
            MODE = 0;
            EVENT_POST(MAILBOX, 0x40);
        }
    } else if (ev == EV_IDLE && !MODE && !VIEW_KNOBS && IDLE) {
        MENUSCR[7] = 6;                      /* KALEIDO, as menu_enter.S */
        MODE = 11;
        SET_SCREEN(11, 0);
        IDLE_SHOWN = 1;                      /* last: chain_poll clears it off screen 11 */
    }
    return key;
}

/* Screens 32 / 33 keys (callp at 0xC00A832C): stock, and when an add from the
 * chain is done or cancelled (stock goes to play mode), back to the chain. */
int s33_keys(long long ev)
{
    int r = S33_KEYS(ev);
    if (UI[UI_FROMCHAIN] == 2 && MODE == 0) {
        UI[UI_FROMCHAIN] = 0;
        UI[UI_ADDBUS] = 0xFF;
        MODE = 11;
        SET_SCREEN(3, -2);
        r = 1;
    }
    return r;
}
