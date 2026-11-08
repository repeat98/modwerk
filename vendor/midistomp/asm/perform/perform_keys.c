/* Perform mode, screen 11 keys: the gesture recognizer (play) and the SETUP lists (setup).
 * Design: docs/dev/v2.0-brief.md Phase 3, docs/dev/perform-ui-mockup.html (v14: setupKey(), the
 * input section). Event numbers: docs/dev/perform-mode-p0-research.md Q1 (press / release
 * 64-75, footswitch 32 / 33, knob 1 push 34 / 35, turns 160-162 with the step count).
 * perf_key() runs in the UI task, perf_poll() every 16 ms in the switch task. The rows
 * and their text are perform_draw.c's (pd_*). No libc, no RTS. */
#include "perform.h"
#ifdef PERF_HOST
#include "perf_host.h"
#else
#include "stock.h"
#endif

/* ---- gesture thresholds: all of them, tuned by hand on the pedal ----------------------- */
#define POLL_MS 16              /* perf_poll() period */
#define CLICK_MIN_MS 30         /* a shorter click is bounce or a bump: ignored */
#define TURN_GUARD_MS 150       /* a click this soon after the knob turned is ignored */
#define HOLD_MS 400             /* held still this long: a hold */
#define FTSW_HOLD_MS 500        /* the footswitch: as HOLD FOR MOMENTARY (asm/tempo_hold/hold.inc HOLD_MS) */
#define DETENT 1                /* encoder counts per detent (probe) */
#define WOBBLE 1                /* detents ignored while a knob is held; one more cancels the press and counts as a turn */
#define REDRAW_POLLS 4          /* the play screen redraws every 4th poll (blink, countdown, values) */

extern void perf_leave(void);   /* integration: back to the patch screen */

#define SC_TOP 0                /* SETUP screens (see perform_draw.c) */
#define SC_LOOP 1
#define SC_CTL 2
#define SC_PMOD 3
#define SC_PPAR 4
#define SC_GES 5
#define SC_MOVE 6
#define SC_MENU 7               /* perf_on == 0: the ENTER / SETUP choice */
int pu_scr, pu_pos[8], pu_ctl, pu_ev = -1, pu_ges, pu_mv, pu_mod;   /* where SETUP is; pu_ev: the LOOPER row being edited or -1 */
int pu_t;                       /* ms since start, in polls */

extern int pd_nrows(void), pd_nmod(void), pd_mod_of(int t), pd_target(int mod, int p, int ev);
extern int pd_pidx(int t, int mod, int ev), pd_step(int t, int v, int a);
extern unsigned char *pd_tgt(void);
extern unsigned *pd_move(void);

static int seen = -1, polls;
static int st[NCTL];            /* 0 up, 1 down, 2 holding, 3 ignored until released, 4 MOMENTARY held */
static int td[NCTL], moved[NCTL], tt[3];

static int clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

static void sync(void)          /* screen 11 entered or left: start clean */
{
    int i;
    if (perf_on == seen) return;
    seen = perf_on;
    for (i = 0; i < NCTL; i++) st[i] = 0;
    for (i = 0; i < 3; i++) tt[i] = pu_t - 1000;
    for (i = 0; i < 8; i++) pu_pos[i] = 0;
    pu_scr = perf_on ? SC_TOP : SC_MENU; pu_ev = -1;
}

/* ---- play: knobs, cursor buttons and the footswitch -------------------------------------- */
static int ctl_of(int ev)       /* a press event (even) -> the control */
{
    switch (ev) {
    case 34: return C_K1;
    case 64: return C_K2;
    case 66: return C_K3;
    case 72: return C_LEFT;
    case 70: return C_DOWN;
    case 74: return C_RIGHT;
    case 32: return C_FTSW;
    }
    return -1;
}

static void turn(int k, int steps)
{
    int a = steps < 0 ? -steps : steps;
    tt[k] = pu_t;
    if (st[k] == 1 || st[k] == 2) {              /* pushed: a wobble is nothing, more is a turn */
        moved[k] += a;
        if (moved[k] <= WOBBLE * DETENT) return;
        if (st[k] == 2) perf_gesture(k, G_HOLD, 1);
        st[k] = 3;
    }
    perf_turn(k, steps);
}

/* A control works as the footswitch: the footswitch itself, or any control aimed at a Footsw target */
static int sw(int c) { return c == C_FTSW || IS_FTSW(perf_patch.target[c]); }

static void press(int c)
{
    if (st[c]) return;                           /* already down: a second press event is not a new press */
    st[c] = c < 3 && pu_t - tt[c] < TURN_GUARD_MS ? 3 : 1;
    td[c] = pu_t;
    moved[c] = 0;
    if (st[c] == 1 && sw(c)) {                   /* acts on the press, as on the effect screen */
        if (c != C_FTSW) V_PDOWN = ZMT_FTSW = 1; /* down while held: an effect can claim the hold (word 6) */
        perf_gesture(c, G_PRESS, 0);
    }
}

static void release(int c)
{
    int s = st[c];
    st[c] = 0;
    if (c != C_FTSW && sw(c)) V_PDOWN = ZMT_FTSW = 0;
    if (s == 4) perf_momentary(c, 1);           /* MOMENTARY: the release flips it back */
    if (s == 2) perf_gesture(c, G_HOLD, 1);
    else if (s == 1 && !sw(c) && pu_t - td[c] >= CLICK_MIN_MS) perf_gesture(c, G_PRESS, 0);
}

/* ---- SETUP -------------------------------------------------------------------------------- */
static const unsigned char CYCV[7] = { 0, 1, 2, 4, 8, 16, 32 };

static void quit(void) { perf_leave(); }        /* Cursor up while playing; STORE saves (pages.c mix_put) */

static void move_key(int ev, int a)              /* a move's knob page: the three knobs edit Value, Next and Lag */
{
    unsigned *m = pd_move(), w = *m;
    int v = MV_VALUE(w), nx = MV_NEXT(w), lg = MV_LAG(w), un = nx == NX_UNUSED;
    if (ev == 65) { pu_scr = pu_ev >= 0 ? SC_CTL : SC_GES; return; }
    if (ev == 160) {
        v = pd_step(*pd_tgt(), un ? -1 : v, a);
        *m = v < 0 ? MV_UNUSED : MV(v, un ? NX_NOW : nx, un ? LG_OFF : lg);
    } else if (!un && ev == 161) *m = MV(v, clamp(nx + a, 0, NX_N - 1), lg);
    else if (!un && ev == 162) *m = MV(v, nx, clamp(lg + a, 0, LG_N - 1));
}

/* The same keys on every list: knob 1 turn scrolls, knob 1 press opens (perf_key passes it
 * as 67), knob 2 press (65) goes back, knob 3 turn changes a row that has a value. */
static void setup_key(int ev, int a)
{
    int open = ev == 67, back = ev == 65, n, i, g, *pos = &pu_pos[pu_scr];
    if (pu_scr == SC_MOVE) { move_key(ev, a); return; }
    if (ev == 160) { *pos = clamp(*pos + a, 0, pd_nrows() - 1); return; }
    switch (pu_scr) {
    case SC_TOP:
        n = 2;                                   /* CYCLE, LOOPER, then the controls */
        if (ev == 162 && !*pos) {
            for (i = 0; i < 6 && CYCV[i] < perf_patch.cycle; i++) ;
            perf_patch.cycle = CYCV[clamp(i + a, 0, 6)];
        } else if (open && *pos == 1) { pu_scr = SC_LOOP; pu_pos[SC_LOOP] = 0; }
        else if (open && *pos >= n) { pu_ctl = *pos - n; pu_ev = -1; pu_pos[SC_CTL] = 0; pu_scr = SC_CTL; }
        else if (back) { perf_on = 0; sync(); pu_pos[SC_MENU] = 1; }   /* back to ENTER / SETUP, on SETUP */
        break;
    case SC_LOOP:
        if (!*pos && (open || ev == 162)) perf_patch.loop_on = ev == 162 ? a > 0 : !perf_patch.loop_on;   /* LOOPER ON / OFF */
        else if (open) { pu_ev = *pos - 1; pu_pos[SC_CTL] = 0; pu_scr = SC_CTL; }
        else if (back) pu_scr = SC_TOP;
        break;
    case SC_CTL:
        n = *pd_tgt();
        if (open && !*pos) { pu_pos[SC_PMOD] = pd_mod_of(n); pu_scr = SC_PMOD; }
        else if (open && pu_ev >= 0) { pu_mv = 0; pu_scr = SC_MOVE; }
        else if (open) { pu_ges = pu_ctl < 3 ? *pos - 1 : *pos; pu_pos[SC_GES] = 0; pu_scr = SC_GES; }
        else if (back) pu_scr = pu_ev >= 0 ? SC_LOOP : SC_TOP;
        break;
    case SC_PMOD:
        if (open && !*pos) { *pd_tgt() = T_NONE; pu_scr = SC_CTL; }
        else if (open) {                         /* then the parameter, on the current one when it is in this module */
            n = *pd_tgt();
            pu_mod = *pos;
            pu_pos[SC_PPAR] = pd_mod_of(n) == pu_mod ? pd_pidx(n, pu_mod, pu_ev >= 0) : 0;
            pu_scr = SC_PPAR;
        } else if (back) pu_scr = SC_CTL;
        break;
    case SC_PPAR:
        if (open) {
            *pd_tgt() = (unsigned char)pd_target(pu_mod, *pos, pu_ev >= 0);
            if (IS_FTSW(*pd_tgt())) {                /* a new Footsw target presses on a click (and a hold) */
                unsigned *a = pu_ev >= 0 ? &perf_patch.loop_move[pu_ev] : &perf_patch.move[pu_ctl][M_PRESS_A];
                if (MV_NEXT(*a) == NX_UNUSED) *a = MV(127, NX_NOW, LG_OFF);
                if (pu_ev < 0 && MV_NEXT(perf_patch.move[pu_ctl][M_HOLD_A]) == NX_UNUSED) perf_patch.move[pu_ctl][M_HOLD_A] = MV(127, NX_NOW, LG_OFF);
            }
            pu_scr = SC_CTL;
        }
        else if (back) pu_scr = SC_PMOD;
        break;
    case SC_GES:
        g = pu_ges;
        if (open) { pu_mv = g == 0 ? M_TURN_F : (g == 1 ? M_PRESS_A : M_HOLD_A) + *pos; pu_scr = SC_MOVE; }
        else if (back) pu_scr = SC_CTL;
        break;
    }
}

/* ---- entry points ------------------------------------------------------------------------- */
void perf_key(int ev, int steps)
{
    int c;
    sync();
    if ((ev | 1) == 33) V_PDOWN = ZMT_FTSW = !(ev & 1);   /* footswitch down: RISER's word 6, the poll keeps it on this screen */
    if ((ev | 1) == 69) { if (ev == 69 && perf_on == 1) quit(); return; }   /* Cursor up leaves the play screen only, on release: the press would reach the effect screen */
    if (perf_on != 1) {                          /* lists: knob 1 press opens, as stock; knob 3 press does nothing */
        if (ev == 67 || ev == 35) return;
        if (ev == 34) ev = 67;
    }
    if (!perf_on) {                              /* screen 11 just opened: ENTER or SETUP */
        if (ev == 160) pu_pos[SC_MENU] = clamp(pu_pos[SC_MENU] + steps, 0, 1);
        else if (ev == 67) { perf_on = pu_pos[SC_MENU] + 1; sync(); }
        else if (ev == 65) SET_SCREEN(0, 2);       /* EXIT: MENU, on PERFORM MODE */
        EVENT_POST(MAILBOX, 0x40);
        return;
    }
    if (perf_on == 2) {
        if (ev == 65 || ev == 67 || (ev >= 160 && ev <= 162)) { setup_key(ev, steps); EVENT_POST(MAILBOX, 0x40); }
        return;
    }
    if (perf_on != 1) return;
    if (ev >= 160 && ev <= 162) { turn(ev - 160, steps); return; }
    c = ctl_of(ev & ~1);
    if (c < 0) return;
    if (ev & 1) release(c); else press(c);
}

/* A hold of the footswitch, or of a control aimed at a Footsw target (not the looper), works as HOLD FOR MOMENTARY on the effect
 * screen, whatever HOLD FOR is (never TAP or the tuner): the release flips it back. Nothing while
 * the effect claims the hold (transport word 7, written within the last 16 ms: looper.S clears it
 * after this poll). Else the hold gesture. */
static int ftsw_hold(int c)
{
    int t = perf_patch.target[c], s = t & 7;
    if (!IS_FTSW(t) || s == LOOPER_SLOT) return 2;
    if (ZMT_CLAIM && ZMT_CLAIM == SLOT_PARAMS(s)) return 3;
    return 4;
}

void perf_poll(void)
{
    int c;
    pu_t += POLL_MS;
    sync();
    if (perf_on != 1) return;
    for (c = 0; c < NCTL; c++)
        if (st[c] == 1 && pu_t - td[c] >= (c == C_FTSW ? FTSW_HOLD_MS : HOLD_MS)) {
            st[c] = ftsw_hold(c);
            if (st[c] == 2) perf_gesture(c, G_HOLD, 0);
            if (st[c] == 4) perf_momentary(c, 0);
        }
    if (++polls >= REDRAW_POLLS) { polls = 0; EVENT_POST(MAILBOX, 0x40); }
}
