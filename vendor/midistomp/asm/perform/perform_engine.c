/* Perform mode engine (perform.h): the grid, the moves (VALUE / NEXT / LAG,
 * Follow), the targets, the footswitch LED, the press routing, S_CYCLE and the
 * loop events. perf_block runs at the top of engine_run, once per audio block
 * with interrupts off; the UI-side entries (gestures, turns, loop events,
 * reset, load) turn interrupts off around their slot writes. Effect parameters
 * are written by the 16 ms poll, as the MIDI CC path does (an effect's edit
 * callback is not safe from the audio block: it froze the pedal).
 * Design: docs/dev/v2.0-brief.md Phase 3, docs/dev/perform-mode-p0-research.md Q2/Q3.
 * No RTS: no division, no struct copies, no libc. */
#include "perform.h"
#include "chain.h"
#include "stock.h"
#include "knob_step.h"

/* ---- Tunables ----------------------------------------------------------- */
#define DU_BPM 2.4187211e-5f    /* grid units (1/8 beat) per 8-sample block per BPM */
#define BLK_MS 5.5125f          /* blocks per ms */
#define DEFAULT_POLLS 8         /* polls after a load that aim a default footswitch at the looper */

/* ---- Firmware addresses ------------------------------------------------- */
#define SV ((volatile unsigned *)0xC00F3000u)   /* looper services (asm/looper/services.inc), words */
#define SV_OK (SV[0] == 0x5A4C5301u)
#define W_SLOT 10
#define W_PRESS 11
#define W_LEDON 13
#define W_LEDOFF 14
#define W_LEDMASK 15
#define W_LEVEL 16
#define W_CYCLE 21
#define W_STATE 20              /* GRDLOOP: st | pend << 8 (was 22, which the firmware writes: v2.0.1) */
#define W_PASS 23               /* GRDLOOP: +1 per loop pass */
#define ZT ((volatile const unsigned *)0x1181FF00u)   /* MIDI transport block (zmt.h) */
#define LED_WANT (*(volatile unsigned *)0xC00EEB08u)  /* LED task: bit 0 wanted */
#define LED_DONE (*(volatile unsigned *)0xC00EEB10u)  /* bit 0 written last */
#define CUR_PATCH BV(324)
#define LOADING BV(392)                               /* a patch load / effect swap runs */
#define SEM_FX BV(764)                                /* the effect-edit semaphore */
#define SEM_PEND FN(0xC00C7EE0, int, (int sem, int timeout))
#define SEM_POST FN(0xC00D6B00, void, (int sem))
#define FX_TABLE ((void *volatile *)0xC00EE930u)
#define FX_MUTE ((void *)0xC00E0784u)
#define FX_SET_PARAM FN(0xC00BB600, int, (int slot, int param, int value, int b6, int a8))
#define FX_DESC FN(0xC00B056C, const int *, (int slot, int param))
#define MAXES ((const volatile unsigned char *)(MIXER_BASE + 296))

extern __cregister volatile unsigned int CSR;
#define DINT unsigned csr_ = CSR; CSR = csr_ & ~1u
#define RINT CSR = csr_

PerfPatch perf_patch;
PerfGrid perf_grid;
volatile int perf_on;
void chain_poll(void);

/* ---- Grid: units of 1/8 beat from bar 1 (looper.c lp_block, zmt.h) ------- */
static struct {
    unsigned clk, starts;
    float sub, bpm, gf, du;
    int wraps, run, gu, anchor, was_on, patch;
} g = { 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, -1 };

static int imod(int u, int m)   /* u mod m, u >= 0, by shifted subtraction */
{
    unsigned r = u, mk;
    int k;
    for (k = 24; k-- > 0;) {
        mk = (unsigned)m << k;
        if (mk >> k == (unsigned)m && r >= mk) r -= mk;
    }
    return r;
}

static int line(int m)          /* the next line of grid m, counted from bar 1 */
{
    int r;
    if (g.gu < 0) return 0;
    r = imod(g.gu, m);
    return r == 0 && g.gf == 0.0f ? g.gu : g.gu - r + m;
}

static int len(int n)           /* NEXT in units; 0 = NOW */
{
    if (n <= 0 || n == NX_UNUSED) return 0;
    if (n < NX_BAR) return 8 << (n - NX_BEAT);
    return 32 << ((n < NX_N ? n : NX_N - 1) - NX_BAR);   /* a v2.0 CYC value: 32 bars */
}

static void grid(void)
{
    volatile const unsigned *w = ZT;
    unsigned t, q, ok = 0, rn = 0, starts = 0, clocks = 0, r, mk, k;
    float bpm = 120.0f, d, beats, err;
    int start, h;
    if (w[0] == 0x5A4D5401u)
        for (t = 0; t < 4 && !ok; t++) {
            q = w[1];
            if (q & 1) continue;
            rn = w[2]; starts = w[3]; clocks = w[4];
            bpm = (float)(int)w[5] * 0.01f;
            if (w[1] == q) ok = 1;
        }
    if (!ok) { rn = 0; bpm = 120.0f; }
    if (!(bpm >= 30.0f)) bpm = 30.0f;
    if (bpm > 300.0f) bpm = 300.0f;
    d = bpm - g.bpm;
    if (d >= 0.3f || d <= -0.3f) g.bpm = bpm;
    start = ok && starts != g.starts;
    if (ok) g.starts = starts;
    if (g.run && !(ok && rn)) perf_reset();             /* MIDI Stop */
    g.run = ok && rn;
    g.du = g.bpm * DU_BPM;
    if (start) {                                        /* MIDI Start: the downbeat is bar 1 */
        perf_reset();
        g.wraps = 0; g.gu = -1; g.gf = 0.999f; g.anchor = 0;
    }
    if (g.run) {
        if (clocks == 0) { g.clk = 0; g.sub = 0.0f; g.du = 0.0f; g.gf = 0.999f; }  /* waiting for clock 1 */
        else {
            if (clocks != g.clk || start) g.sub = 0.0f;
            else if ((g.sub += g.bpm * 7.2562358e-5f) > 0.999f) g.sub = 0.999f;
            g.clk = clocks;
            r = clocks - 1;             /* r = that mod 2304, wraps = the 96-beat turns: right after the grid sat out */
            for (k = 20, g.wraps = 0; k-- > 0;)
                for (mk = 2304u << k; r >= mk; g.wraps += 1 << k) r -= mk;
            beats = ((float)(int)r + g.sub) * 0.041666668f;
            err = beats * 8.0f - ((float)(g.gu - 768 * g.wraps) + g.gf);
            if (err >= 4.0f || err <= -4.0f) {          /* entered mid-song, a jump */
                h = (int)(beats * 8.0f);
                g.gu = h + 768 * g.wraps;
                g.gf = beats * 8.0f - (float)h;
            } else g.gf += err;
        }
    } else g.clk = clocks;
    if (perf_on && !g.was_on && !g.run) {               /* no clock: bar 1 = entering Perform, */
        g.gu = 0; g.gf = 0.0f; g.anchor = 1;            /* then the first footswitch press */
    }
    g.was_on = perf_on != 0;
    g.gf += g.du;
    while (g.gf >= 1.0f) { g.gf -= 1.0f; g.gu++; }
    perf_grid.beat = g.gu < 0 ? -1 : g.gu >> 3;
    perf_grid.frac = g.gu < 0 ? 0 : (int)(((float)(g.gu & 7) + g.gf) * 8191.875f);
    perf_grid.running = g.run || (perf_on && !g.anchor);   /* no clock: tap tempo drives the grid, the first FOOTSW press (bar 1) starts it */
    perf_grid.bpm_x10 = (int)(g.bpm * 10.0f);
}

/* ---- Targets ------------------------------------------------------------ */
#define K_NONE 0
#define K_MIX 1                 /* a = setting */
#define K_FX 2                  /* a = slot, b = param (0 on / off, 2-10) */
#define K_FTSW 3                /* a = slot */

static const unsigned char cc_map[17] = {      /* mixer.S cc_map: CC 85-101 */
    S_SEND, S_XF, S_MASTER, S_IN, S_RA, S_RB, S_MA, S_MB, S_MODE, S_CURVE, S_PHASE,
    S_INR, S_MR, S_OUT, S_MUTEA, S_MUTEB, S_SOLO
};

typedef struct { int k, a, b, max; } Tgt;

static Tgt tgt(int t)
{
    Tgt r = { K_NONE, 0, 0, 0 };
    const int *d;
    if (t == T_NONE) return r;
    if (IS_FTSW(t)) { r.k = K_FTSW; r.a = t & 7; return r; }
    if (t >= 85 && t <= 101) {
        r.k = K_MIX; r.a = cc_map[t - 85];
        r.max = r.a == S_MODE && !PEDAL ? 1 : MAXES[r.a];
        return r;
    }
    if (t >= 14 && t <= 73) {                   /* CC 10n + 4 + k: slot n - 1, k 0 on / off, 1-9 param k + 1 */
        t -= 4;
        while (t >= 10) { t -= 10; r.a++; }
        r.a--;
        r.b = t ? t + 1 : 0;
        if (r.a >= COUNT) return r;
        d = r.b ? FX_DESC(r.a, r.b) : 0;
        if (r.b && !d) return r;
        r.k = K_FX;
        r.max = r.b ? d[3] : 1;
    }
    return r;                                   /* ponytail: other CCs are no target yet */
}

static int now(const Tgt *t)
{
    if (t->k == K_MIX) return LIVE[t->a];
    if (t->k == K_FX) return FX_REC(t->a)[t->b];
    return 0;
}

static short fxw[6][11];        /* effect value waiting for the poll, -1 none */
static int dirty;               /* redraw at the next poll */

static void put(const Tgt *t, int v)
{
    if (v < 0) v = 0;
    if (v > t->max) v = t->max;
    if (t->k == K_MIX) {
        if (LIVE[t->a] != v) dirty = 1;
        LIVE[t->a] = v;                         /* mirrors as mixer.S cc */
        if (t->a == S_IN && eff_mode() != 2) LIVE[S_INR] = v;
        if (t->a == S_MASTER && LIVE[S_OUT] != 2) LIVE[S_MR] = v;
    } else if (t->k == K_FX && FX_REC(t->a)[t->b] != v)
        fxw[t->a][t->b] = v;
}

/* The waiting effect writes, from the 16 ms poll with interrupts on, under the
 * effect-edit lock as midi_cc handler.S. A load or swap running: next poll. */
static void fx_flush(void)
{
    int s, p, v;
    for (s = 0; s < 6; s++)
        for (p = 0; p < 11; p++) {
            if ((v = fxw[s][p]) < 0) continue;
            if (p == 1 || s >= COUNT || FX_REC(s)[p] == v) { fxw[s][p] = -1; continue; }   /* never the effect type */
            if (LOADING || FX_TABLE[s] == FX_MUTE) continue;
            SEM_PEND(SEM_FX, -1);
            FX_SET_PARAM(s, p, v, 0, 1);
            SEM_POST(SEM_FX);
            dirty = 1;
            {
                DINT;
                if (fxw[s][p] == v) fxw[s][p] = -1;   /* a newer value waits for the next poll */
                RINT;
            }
        }
}

/* ---- Moves -------------------------------------------------------------- */
#define F_FREE 0
#define F_WAIT 1                /* lands at due */
#define F_LAG 2                 /* ramps from -> to */

typedef struct {
    unsigned char st, ctl, t, lag, tf;   /* tf: a Turn's Follow */
    unsigned mv, fol;           /* fol: the Follow scheduled when this lands */
    int due;
    Tgt x;                      /* the target, from land: no descriptor call a block while it lags */
    float from, to, pos;
} Slot;

static Slot sl[NSLOT];
static volatile int busy;       /* a move waits or lags (wait sets it, tick clears it) */

static const float LAGK[LG_N] = {           /* per block: 1 / blocks (ms), 1 / units (beats, bars) */
    0, 1 / (5 * BLK_MS), 1 / (50 * BLK_MS), 1 / (100 * BLK_MS), 1 / (500 * BLK_MS), 1 / (1000 * BLK_MS),
    1 / 8.0f, 1 / 16.0f, 1 / 32.0f, 1 / 64.0f,
    1 / 32.0f, 1 / 64.0f, 1 / 128.0f, 1 / 256.0f, 1 / 512.0f, 1 / 1024.0f
};

static Slot *slot_new(void)
{
    int i;
    for (i = 0; i < NSLOT; i++)
        if (sl[i].st == F_FREE) return &sl[i];
    return 0;                   /* ponytail: 16 busy, the move is dropped */
}

static Slot *wait(int ctl, int t, unsigned mv, unsigned fol, int due)
{
    Slot *s;
    if (MV_NEXT(mv) == NX_UNUSED || !(s = slot_new())) return 0;
    s->st = F_WAIT; s->ctl = ctl; s->t = t; s->mv = mv; s->fol = fol; s->due = due; s->tf = 0;
    busy = 1;
    return s;
}

static int due_of(unsigned mv)  /* Action / Release: the next line of its NEXT */
{
    int m = len(MV_NEXT(mv));
    return m ? line(m) : g.gu;
}

static volatile unsigned ftsw_q;    /* Footsw presses on other effects, bit = slot: perf_poll16 toggles them */

static void ftsw(int s)         /* a Footsw press on slot s: the looper counts it, other effects toggle on / off */
{
    if (SV_OK && (int)SV[W_SLOT] == s) SV[W_PRESS]++;
    else ftsw_q ^= 1u << s;     /* the stock toggle takes the effect semaphore: not from the audio block */
}

static void follow(Slot *s, int at)  /* the Follow: exactly its NEXT after the action completed (v2.0.1: not on the press) */
{
    if (MV_NEXT(s->fol) != NX_UNUSED) wait(s->ctl, s->t, s->fol, MV_UNUSED, at + len(MV_NEXT(s->fol)));
}

static void land(Slot *s)
{
    Tgt t = tgt(s->t);
    int i, v;
    if (t.k == K_FTSW) {
        follow(s, s->due);
        ftsw(t.a);
        s->st = F_FREE;
        return;
    }
    for (i = 0; i < NSLOT; i++)                 /* newest wins */
        if (sl[i].st == F_LAG && sl[i].t == s->t) sl[i].st = F_FREE;
    v = MV_VALUE(s->mv);
    s->lag = MV_LAG(s->mv);
    if (t.k == K_NONE || s->lag == LG_OFF) { follow(s, s->due); put(&t, v); s->st = F_FREE; return; }
    s->x = t;
    s->st = F_LAG; s->from = (float)now(&t); s->to = (float)v; s->pos = 0.0f;
}

static void tick(void)
{
    int i, n, b = 0;
    Slot *s;
    for (i = 0; i < NSLOT; i++) {
        s = &sl[i];
        if (s->st == F_WAIT && g.gu >= s->due) land(s);
        if (s->st != F_LAG) continue;
        s->pos += s->lag < 6 ? LAGK[s->lag] : LAGK[s->lag] * g.du;
        if (s->pos >= 1.0f) s->pos = 1.0f;
        n = (int)(s->from + (s->to - s->from) * s->pos + 0.5f);
        put(&s->x, n);                          /* every block: Perform wins over a CC */
        if (s->pos >= 1.0f) { follow(s, g.gu); s->st = F_FREE; }   /* the lag done: the action completed */
    }
    for (i = 0; i < NSLOT; i++) b |= sl[i].st;  /* after the loop: a Follow may sit below i */
    busy = b;
}

static void cancel(int ctl)     /* a new gesture: the control's waiting moves go */
{
    int i;
    for (i = 0; i < NSLOT; i++)
        if (sl[i].st == F_WAIT && sl[i].ctl == ctl) sl[i].st = F_FREE;
}

void perf_reset(void)
{
    int i;
    DINT;
    for (i = 0; i < NSLOT; i++) sl[i].st = F_FREE;
    RINT;
}

void perf_gesture(int ctl, int gesture, int phase)
{
    int t = perf_patch.target[ctl];
    const unsigned *m = perf_patch.move[ctl];
    DINT;
    if (ctl == C_FTSW && phase == 0 && g.anchor && !g.run) {   /* no clock: this press is bar 1 */
        g.gu = 0; g.gf = 0.0f; g.anchor = 0;
    }
    if (t != T_NONE) {
        if (phase == 0) cancel(ctl);
        if (gesture == G_PRESS && phase == 0)
            wait(ctl, t, m[M_PRESS_A], m[M_PRESS_F], due_of(m[M_PRESS_A]));
        else if (gesture == G_HOLD && phase == 0)
            wait(ctl, t, m[M_HOLD_A], MV_UNUSED, due_of(m[M_HOLD_A]));
        else if (gesture == G_HOLD)
            wait(ctl, t, m[M_HOLD_R], m[M_HOLD_F], due_of(m[M_HOLD_R]));
    }
    RINT;
}

/* HOLD FOR MOMENTARY on a Footsw target: phase 0 the hold is seen, 1 the release. The hold
 * flips at its own Next (HOLD's Action, else the press's), not the press's (v2.0.1). */
void perf_momentary(int ctl, int phase)
{
    int t = perf_patch.target[ctl], i, w = 0;
    const unsigned *m = perf_patch.move[ctl];
    unsigned h = MV_NEXT(m[M_HOLD_A]) != NX_UNUSED ? m[M_HOLD_A] : m[M_PRESS_A];
    if (phase && MV_NEXT(m[M_HOLD_R]) != NX_UNUSED) h = m[M_HOLD_R];
    DINT;
    for (i = 0; i < NSLOT; i++)
        if (sl[i].st == F_WAIT && sl[i].ctl == ctl) {
            w = 1;
            if (phase) sl[i].st = F_FREE;       /* released before it flipped: nothing */
            else { sl[i].due = due_of(h); sl[i].fol = MV_UNUSED; }
        }
    if (phase && !w) wait(ctl, t, h, MV_UNUSED, due_of(h));   /* flips it back */
    RINT;
}

void perf_turn(int ctl, int steps)
{
    int t = perf_patch.target[ctl], i, n;
    unsigned f = perf_patch.move[ctl][M_TURN_F];
    Slot *s;
    Tgt x = tgt(t);
    if (x.k == K_FTSW) {                        /* a turn sets the effect's on / off (right on, left off); on the looper only a press counts */
        if (SV_OK && (int)SV[W_SLOT] == x.a) return;
        x = tgt(14 + 10 * x.a);
    }
    if (x.k != K_MIX && x.k != K_FX) return;
    steps = knob_step(160 + ctl, steps, x.max);  /* ctl 0-2 = knob 1-3 (perform_keys.c turn) */
    DINT;
    for (i = 0; i < NSLOT; i++)                 /* the last turn's Follow and a lag go; a queued press stays (v2.0.1) */
        if ((sl[i].st == F_WAIT && sl[i].ctl == ctl && sl[i].tf) || (sl[i].st == F_LAG && sl[i].t == t)) sl[i].st = F_FREE;
    put(&x, (x.k == K_FX && fxw[x.a][x.b] >= 0 ? fxw[x.a][x.b] : now(&x)) + steps);
    n = len(MV_NEXT(f));
    if ((s = wait(ctl, t, f, MV_UNUSED, n ? line(n) : g.gu))) s->tf = 1;   /* a Turn's Follow waits for the next line */
    RINT;
}

void perf_loop_event(int ev)
{
    DINT;
    if (perf_patch.loop_target[ev] != T_NONE)
        wait(0xFF, perf_patch.loop_target[ev], perf_patch.loop_move[ev], MV_UNUSED,
             due_of(perf_patch.loop_move[ev]));
    RINT;
}

int perf_native(int target)
{
    Tgt t = tgt(target);
    if (t.k != K_MIX && t.k != K_FX) return -1;
    return t.k == K_FX && fxw[t.a][t.b] >= 0 ? fxw[t.a][t.b] : now(&t);
}


int perf_pending(int ctl)
{
    int i, d = -1;
    for (i = 0; i < NSLOT; i++)
        if (sl[i].st == F_WAIT && sl[i].ctl == ctl && (d < 0 || sl[i].due - g.gu < d))
            d = sl[i].due - g.gu < 0 ? 0 : sl[i].due - g.gu;
    return d;                   /* grid units (1/8 beat) */
}

/* ---- Footswitch LED: its target owns it in Perform ----------------------- */
static int led_own, pwm;
volatile int perf_led = -1;     /* play screen: 0/1 while our move waits on the looper (the bar's blink), -1 its own level */
static Tgt led_x;               /* tgt(the footswitch's target), from the poll: no descriptor call a block */

static void led(void)
{
    int lit = -1;
    Tgt x;
    if (perf_on && SV_OK && SV[W_LEDON] && SV[W_LEDOFF]) {
        x = led_x;
        if (x.k == K_FTSW && (int)SV[W_SLOT] == x.a) {
            pwm = (pwm + 1) & 31;
            lit = perf_on == 1 && perf_led >= 0 ? perf_led : pwm < (int)SV[W_LEVEL];   /* the looper's level: countdown, pulse, on */
        } else if ((x.k == K_FTSW && x.a < COUNT) || (x.k == K_FX && x.b == 0))
            lit = FX_REC(x.a)[0] != 0;          /* Footsw or on / off: the effect's on state */
    }
    if (lit >= 0) {
        LED_DONE = (LED_DONE & ~1u) | (LED_WANT & 1u);  /* the LED task thinks it is done */
        *(volatile unsigned *)(lit ? SV[W_LEDON] : SV[W_LEDOFF]) = SV[W_LEDMASK];
        led_own = 1;
    } else if (led_own) {
        LED_DONE ^= 1u;                         /* back to the LED task */
        led_own = 0;
    }
}

/* ---- Audio block and poll ------------------------------------------------ */
static int need_load = 1;

void perf_block(void)
{
    int p = CUR_PATCH;
    if (p != g.patch) {                         /* patch change: cancel all, the poll loads */
        g.patch = p;
        perf_reset();
        need_load = 1;
    }
    if (!perf_on && !busy && !led_own) {        /* off screen, no move waiting or lagging: nothing a block */
        g.was_on = 0;
        return;
    }
    grid();
    tick();
    led();
}

extern unsigned r50_live_hash;  /* pages.c mix_get: the hash of the patch played */

void perf_poll16(void)
{
    static unsigned lst, lpass, lhash;
    unsigned st, pass;
    int s, p;
    chain_poll();
    if (*(volatile int *)0xC010A020)            /* MASTER open (asm/master/master_vec.asm): its 16 ms poll */
        ((void (*)(void))0xC010A008)();
    if (need_load || r50_live_hash != lhash) {
        need_load = 0;
        lhash = r50_live_hash;
        perf_reset();
        for (s = 0; s < 6; s++)                 /* no effect write waits (.bss starts at 0: a write of 0) */
            for (p = 0; p < 11; p++) fxw[s][p] = -1;
        perf_load(CUR_PATCH);
    }
    if (SV_OK) {
        SV[W_CYCLE] = perf_patch.loop_on ? perf_patch.cycle : 0;   /* PERFORM's looper off: the GRDLOOP keeps its own Cycle */
        st = SV[W_STATE] & 255;
        pass = SV[W_PASS];
        if (perf_on && perf_patch.loop_on) {
            if (lst == 0 && st == 1) perf_loop_event(L_REC_START);
            if (lst == 1 && st == 2) perf_loop_event(L_REC_END);
            if (lst == 3 && st == 2) perf_loop_event(L_PLAY);
            if (lst == 2 && st == 3) perf_loop_event(L_STOP);
            if (lst >= 2 && st == 0) perf_loop_event(L_DELETE);
            if (pass != lpass && st == 2) perf_loop_event(L_LOOP_START);
        }
        lst = st;
        lpass = pass;
    }
    {
        Tgt x = tgt(perf_patch.target[C_FTSW]);
        DINT;
        led_x = x;
        RINT;
    }
    fx_flush();
    if (ftsw_q) {               /* Footsw on a regular effect: the stock footswitch press, in this task */
        DINT;
        pass = ftsw_q;
        ftsw_q = 0;
        RINT;
        dirty = 1;                  /* the knob column shows the new state */
        for (s = 0; s < COUNT && s < 6; s++)
            if (pass >> s & 1 && !(DSP_OFF >> s & 1)) { FX_TOGGLE(s); FX_EDITED(); }
    }
    if (dirty) {
        dirty = 0;
        EVENT_POST(MAILBOX, 0x40);
    }
    if (SCREEN == 11 && MODE == 11) perf_poll();
    else perf_on = 0;
}

void perf_leave(void)           /* ▲, or EXIT on the SETUP top list: back to play mode */
{
    perf_on = 0;
    MODE = 0;
    EVENT_POST(MAILBOX, 0x40);
}

