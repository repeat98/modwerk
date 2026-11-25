/* Perform mode, screen 11 pixels: the play screen and the SETUP lists and move pages.
 * A port of drawPlay() / list() / drawMove() in docs/dev/perform-ui-mockup.html (v14), drawn
 * straight into the LCD frame (page format, like pages.c) with the mockup's fonts; the
 * knob, fader, switch and tabs are the stock primitives (stock.h). Keys and the
 * navigation state: perform_keys.c. No libc, no RTS (no / % by variables), no B14. */
#include "perform.h"
#ifdef PERF_HOST
#include "perf_host.h"
#else
#include "stock.h"
#endif

#ifndef SVC
#define SVC(i) (*(volatile int *)(0xC00F3000u + 4 * (i)))   /* looper services block (docs/dev/looper-services.md) */
#endif
#define P ((volatile unsigned char *)LCD0)
/* fxid 497 as the patch stores it (effects pack extract_effect_db.py patch_id), gid bits masked */
#define PEND_MS(t) ((int)udiv((unsigned)(t) * 75000u, perf_grid.bpm_x10 > 0 ? perf_grid.bpm_x10 : 1200))   /* perf_pending() is in 1/8 beat */
#define SOFT_AWAY 0             /* 1: a cursor softkey is filled only while its target is away from default (the mockup's text); 0: always filled (its code) */

/* SETUP navigation state: owned by perform_keys.c. */
#define SC_TOP 0
#define SC_LOOP 1
#define SC_CTL 2
#define SC_PMOD 3
#define SC_PPAR 4
#define SC_GES 5
#define SC_MOVE 6
#define SC_MENU 7               /* perf_on == 0: ENTER / SETUP */
extern int pu_scr, pu_pos[8], pu_ctl, pu_ev, pu_ges, pu_mv, pu_mod, pu_t;

#include "../common/draw.h"

static unsigned char ink[11][16];                /* the status bar's text ink */

static int fontp(const char *s, int x, int y, int mark)   /* proportional, XORed; returns the width */
{
    int j, r, x0 = x;
    const unsigned char *g;
    for (; *s; s++) {
        if (*s == ' ') { x += 2; continue; }
        g = F7 + 7 * code(*s);
        for (j = 0; j < 7; j++)
            if (g[j]) {
                for (r = 0; r < 7; r++)
                    if (g[j] >> r & 1) {
                        if (mark) { px(x, y + r, 2); if (x < 128 && y + r < 11) ink[y + r][x >> 3] |= (unsigned char)(0x80 >> (x & 7)); }
                    }
                x++;
            }
        x++;
    }
    return x - 1 - x0;
}

static int widthp(const char *s) { return fontp(s, 0, 0, 0); }
static int nearink(int x, int y)
{
    int dx, dy, xx, yy;
    for (dx = -1; dx <= 1; dx++)
        for (dy = -1; dy <= 1; dy++) {
            xx = x + dx; yy = y + dy;
            if (xx >= 0 && xx < 128 && yy >= 0 && yy < 11 && (ink[yy][xx >> 3] & (0x80 >> (xx & 7)))) return 1;
        }
    return 0;
}

/* ---- targets: a CC (perform.h), its module, parameter, range and text ------------------- */
enum { FADER, KNOB, TOGGLE, TRIG };
typedef struct { const char *n; unsigned char cc, max, look, dcc, x; const char *const *opt; } NPar;
typedef struct { char nm[9]; unsigned short max; unsigned char look, dcc, x; const char *const *opt; int (*gs)(unsigned, char *); } Par;

static const char *const o_mode[] = { "Serl", "Paral", "Split", "MSerl" };
static const char *const o_out[] = { "Ster", "Mono", "Split" };
static const char *const o_curve[] = { "Smoth", "DJ", "Cut" };
static const char *const o_phase[] = { "Norm", "Inv" };
static const char *const o_off[] = { "Off", "On" };
static const char *const o_solo[] = { "Off", "A", "B" };

/* The mixer nodes' CCs 85-101 (patches/mixer-m2.yaml); levels 0-150, 100 = unity = CC 85. dcc: the default's CC. */
static const NPar NP[15] = {
    { "InLvl", 88, 150, FADER, 85, 0, 0 },
    { "XFade", 85, 100, KNOB, 64, 1, 0 }, { "Mode", 93, 3, KNOB, 0, 0, o_mode }, { "BusA", 89, 150, FADER, 85, 0, 0 }, { "BusB", 90, 150, FADER, 85, 0, 0 },
    { "XFade", 86, 100, FADER, 0, 1, 0 }, { "Outpt", 98, 2, KNOB, 0, 0, o_out }, { "Curve", 94, 2, KNOB, 0, 0, o_curve },
    { "MixA", 91, 150, FADER, 85, 0, 0 }, { "MixB", 92, 150, FADER, 85, 0, 0 }, { "PhasB", 95, 1, TOGGLE, 0, 0, o_phase },
    { "MuteA", 99, 1, TOGGLE, 0, 0, o_off }, { "MuteB", 100, 1, TOGGLE, 0, 0, o_off }, { "Solo", 101, 2, KNOB, 0, 0, o_solo },
    { "Mastr", 87, 150, FADER, 85, 0, 0 },
};
static const unsigned char NFIRST[4] = { 0, 1, 5, 14 }, NCNT[4] = { 1, 4, 9, 1 };
static const char *const NMID[4] = { "IN", "ROUTE", "MIX", "OUT" }, *const NFX[4] = { "INPUT", "ROUTE", "MIX", "OUTPUT" };

static int t_slot(int t)                      /* the FX slot of a target, -1 none */
{
    if (IS_FTSW(t)) return t & 7;
    return t >= 14 && t <= 73 ? (int)udiv(t - 14, 10) : -1;
}

static int t_node(int t)                      /* the mixer node 0-3 and the NP index, or -1 */
{
    int n, i;
    if (t < 85 || t > 101) return -1;
    for (n = 0; n < 4; n++)
        for (i = NFIRST[n]; i < NFIRST[n] + NCNT[n]; i++) if (NP[i].cc == t) return n | i << 4;
    return -1;
}

static const int *fx_par(int s, int k)      /* the descriptor of effect parameter k (1-9, param k + 1), 0 past its last */
{
    const int *d = 0;
    int p;
    if (s < 0 || s >= COUNT) return 0;
    for (p = 2; p <= k + 1; p++) {
        if (d && d[11] & 4) return 0;            /* the last entry flag */
        if (!(d = (const int *)FX_NAME(s, p))) return 0;
    }
    return d;
}

static void pinfo(int t, Par *p)
{
    int n = t_node(t), k, i;
    const NPar *q;
    const int *d;
    p->nm[0] = 0; p->max = 127; p->look = KNOB; p->dcc = 255; p->x = 0; p->opt = 0; p->gs = 0;
    if (t == T_NONE) return;
    if (IS_FTSW(t)) { scat(p->nm, "Footsw"); p->max = 1; p->look = TRIG; return; }
    if (n >= 0) {
        q = &NP[n >> 4];
        scat(p->nm, q->n); p->max = q->max; p->look = q->look; p->dcc = q->dcc; p->x = q->x; p->opt = q->opt;
    } else if (t_slot(t) >= 0) {
        k = umod(t - 14, 10);
        if (!k) { scat(p->nm, "Footsw"); p->max = 1; p->look = TOGGLE; p->dcc = 127; p->opt = o_off; }
        else if ((d = fx_par(t_slot(t), k)) != 0) {   /* the effect's own name and range */
            for (i = 0; i < 8 && ((const char *)d)[i]; i++) p->nm[i] = ((const char *)d)[i];
            p->nm[i] = 0;
            p->max = d[3] < 1 ? 1 : d[3] > 9999 ? 9999 : d[3];
            if (p->max == 1) { p->look = TOGGLE; p->opt = o_off; }
            p->gs = (int (*)(unsigned, char *))d[9];   /* +0x24: the effect's own value text, as the stock screen (A4 value, B4 out, returns the length) */
        } else ncat(scat(p->nm, "Knob"), k);
    }
}

static int disp(const Par *p, int v)            /* a default's CC -> the target's range, as mixer.S */
{
    int d = ((v * p->max + 63) * 259) >> 15;
    return d > p->max ? p->max : d;
}

int knob_step(int ev, int steps, int range);     /* pages.c: a fast turn steps more, as stock */

int pd_step(int t, int v, int a)                 /* a move's VALUE (the target's own units, -1 unused) turned a steps */
{
    Par p;
    pinfo(t, &p);
    if (p.look == TRIG) return a > 0 ? 127 : -1;   /* a press: set or unused */
    if (v < 0) return a > 0 ? 0 : -1;
    if (v == 0 && a < 0) return -1;
    v += knob_step(160, a, p.max);               /* one value a click, more on a fast turn */
    return v < 0 ? 0 : v > p.max ? p.max : v;
}

static void nat_text(int t, int d, char *o)      /* d in the target's own units, -1 unused */
{
    Par p;
    pinfo(t, &p);
    if (d < 0) { scat(o, "-"); return; }
    if (p.look == TRIG) { scat(o, "TAP"); return; }
    if (d > p.max) d = p.max;
    if (p.gs) {
        char g[16];
        int n = p.gs(d, g);
        g[n < 0 ? 0 : n > 8 ? 8 : n] = 0;       /* the stock buffer is 8 bytes */
        scat(o, g);
    } else if (p.opt) scat(o, p.opt[d]);
    else if (p.x) {                              /* a crossfade reads like a pan */
        if (d == 50) scat(o, "AB");
        else ncat(scat(o, d < 50 ? "A" : "B"), 2 * (d < 50 ? 50 - d : d - 50));
    } else ncat(o, d);
}

static void mid_text(int t, char *o)             /* "FX2", "MIX" */
{
    int s = t_slot(t), n = t_node(t);
    o[0] = 0;
    if (s >= 0) ncat(scat(o, "FX"), s + 1);
    else if (n >= 0) scat(o, NMID[n & 15]);
}

static void fx_text(int t, char *o)              /* the effect in that slot, as the stock screens name it */
{
    int s = t_slot(t), n = t_node(t), i = 0;
    const char *nm;
    o[0] = 0;
    if (s >= 0 && s < COUNT) {
        nm = FX_NAME(s, 1);
        while (nm && nm[i] && i < 9) { o[i] = nm[i]; i++; }
        o[i] = 0;
    } else if (s >= 0) mid_text(t, o);
    else if (n >= 0) scat(o, NFX[n & 15]);
}

static void tgt_text(int t, char *o)             /* "FX3 Knob2", "MIX XFade", "OFF" */
{
    Par p;
    if (t == T_NONE) { scat(o, "OFF"); return; }
    pinfo(t, &p);
    mid_text(t, o);
    scat(scat(o + slen(o), " "), p.nm);
}

static void lab_text(int t, char *o)             /* the parameter's name */
{
    Par p;
    pinfo(t, &p);
    o[0] = 0;
    scat(o, p.nm);
}

/* module rows of the target pick: 0 OFF, 1..COUNT the FX slots, then IN ROUTE MIX OUT */
int pd_nmod(void) { return 1 + COUNT + 4; }
int pd_mod_of(int t)
{
    int s = t_slot(t), n = t_node(t);
    if (s >= 0 && s < COUNT) return 1 + s;
    return n >= 0 ? 1 + COUNT + (n & 15) : 0;
}

int pd_nparam(int mod, int ev)                   /* an effect: Footsw and its parameters */
{
    int k = 1;
    if (mod <= COUNT) { while (mod && k < 10 && fx_par(mod - 1, k)) k++; return mod ? k : 10; }
    return NCNT[mod - 1 - COUNT];
}

int pd_target(int mod, int p, int ev)
{
    int s = mod - 1;
    if (mod > COUNT) return NP[NFIRST[mod - 1 - COUNT] + p].cc;
    return p ? 14 + 10 * s + p : T_FTSW + s;
}

int pd_pidx(int t, int mod, int ev)              /* the target's row in its module, 0 if it is not there */
{
    int p, n = pd_nparam(mod, ev);
    for (p = 0; p < n; p++) if (pd_target(mod, p, ev) == t) return p;
    return 0;
}

unsigned char *pd_tgt(void) { return pu_ev >= 0 ? &perf_patch.loop_target[pu_ev] : &perf_patch.target[pu_ctl]; }
unsigned *pd_move(void) { return pu_ev >= 0 ? &perf_patch.loop_move[pu_ev] : &perf_patch.move[pu_ctl][pu_mv]; }

/* ---- the stock controls ------------------------------------------------------------------ */
static void ctl(int t, int d, int x, int y)       /* d: the target's own units */
{
    Par p;
    int v = d;
    pinfo(t, &p);
    d = d < 0 ? 0 : d > p.max ? p.max : d;
    if (p.look == TRIG) KP_TOGGLE(0, v > 0, x, y);
    else if (p.look == TOGGLE) KP_TOGGLE(0, d >= 1, x, y);
    else if (p.look == FADER) KP_FADER(0, x, y, d, 0, p.max);
    else KP_KNOB(0, KP_DIVD(d, p.max), x, y);
}

/* ---- the play screen --------------------------------------------------------------------- */
static int beatms(void) { int b = perf_grid.bpm_x10; return udiv(600000, b > 0 ? b : 1200); }
static int gms(void)                             /* the grid clock in ms: every blink flips on the same beat line */
{
    int b = beatms();
    if (perf_grid.running && perf_grid.beat >= 0) return perf_grid.beat * b + (int)(((unsigned)perf_grid.frac * b) >> 16);
    return pu_t;
}

static int blinkon(int left)                     /* the looper's countdown blink (looper.c): period = time left / 4 as a power of 2 */
{
    int b = beatms(), p = b / 2 ? b / 2 : 1, per;
    while (p * 2 <= left / 4 && p < 8 * b) p *= 2;
    per = p / 2 ? p / 2 : 1;
    return (udiv(gms(), per) & 1) == 0;
}

static int shown(int c)                          /* a waiting move blinks like the loop bar */
{
    int p = perf_pending(c);
    return p < 0 || blinkon(PEND_MS(p));
}

static int fx_on(int s) { return (unsigned)s < (unsigned)COUNT && FX_REC(s)[0] && !(DSP_OFF >> s & 1); }

static int loop_live(void)                       /* the LOOPER row ON and its GRDLOOP there and on */
{
    return perf_patch.loop_on && SVC(0) == 0x5A4C5301 && SVC(8) && fx_on(SVC(10));
}

static int ftsw_on(int t)                        /* a Footsw target: its effect on; the GRDLOOP recording or playing */
{
    int s = t & 7, k = SVC(30) & 15;
    if (SVC(0) == 0x5A4C5301 && SVC(10) == s) return loop_live() && (k == 3 || (k >= 5 && k <= 7));
    return fx_on(s);
}

static int loop_pending(void)                   /* the soonest move waiting on a control aimed at the GRDLOOP's Footsw, -1 = none */
{
    int i, p, lp = -1;
    for (i = 0; i < NCTL; i++)
        if (IS_FTSW(perf_patch.target[i]) && (perf_patch.target[i] & 7) == SVC(10)) {
            p = perf_pending(i);
            if (p >= 0 && (lp < 0 || p < lp)) lp = p;
        }
    return lp;
}

static int left_text(char *o)                   /* the looper's left text (S_LEFT, lbox.c); a pending footswitch action counts down. Returns the S_LEFT kind */
{
    unsigned c = SVC(30), kind = c & 15, n = c >> 4 & 63;
    int i, lp, b = beatms(), ms, k;
    char *e = o;
    o[0] = 0;
    if (SVC(0) != 0x5A4C5301 || !SVC(8)) return 0;
    lp = loop_pending();
    if (lp >= 0 && kind >= 1 && kind != 2 && kind != 3 && kind != 4) {   /* our own countdown: what the press does now */
        ms = PEND_MS(lp);
        k = ms > 4 * b ? udiv(ms + 4 * b - 1, 4 * b) : udiv(ms + b - 1, b);
        e = ncat(scat(o, kind == 1 ? "REC IN " : kind == 7 ? "STOP IN " : "PLAY IN "), k);
        e = scat(e, ms > 4 * b ? " BAR" : " BEAT");
        if (k > 1) scat(e, "S");
        return kind;
    }
    if (kind == 0) {                             /* an older ZDL: its 8 status characters */
        volatile char *s = (volatile char *)&SVC(17);
        for (i = 0; i < 8; i++) o[i] = s[i];
        for (i = 8; i > 0 && (o[i - 1] == ' ' || !o[i - 1]); i--) ;
        o[i] = 0;
        return 0;
    }
    if (kind == 1) { scat(o, "EMPTY"); return kind; }
    if (kind == 8) { scat(o, "STOPPED"); return kind; }
    if (kind <= 4) {                             /* REC / STOP / PLAY IN n BARS */
        e = ncat(scat(o, kind == 2 ? "REC IN " : kind == 3 ? "STOP IN " : "PLAY IN "), n);
        e = scat(e, c >> 16 & 1 ? " BEAT" : " BAR");
    } else if (kind == 7) {
        e = scat(ncat(scat(o, "PLAY "), n), " BAR");
    } else {                                     /* 5 "REC 3", 6 "REC 3/8" */
        e = ncat(scat(o, "REC "), n);
        if (kind == 6) e = ncat(scat(e, "/"), c >> 10 & 63);
        if (c >> 17 & 1) scat(e, kind == 6 ? " M" : " MONO");   /* "REC 14/16 MONO" runs into the bar.beat */
        return kind;
    }
    if (n > 1) scat(e, "S");
    return kind;
}

static void play(void)
{
    static const unsigned char AR[3][5] = { { 4, 14, 31 }, { 1, 3, 7, 3, 1 }, { 31, 14, 4 } };
    static const unsigned char ARN[3] = { 3, 5, 3 };
    char left[24], right[16], a[16], l[16], v[8], *o;
    int C = perf_patch.cycle, run = perf_grid.running && perf_grid.beat >= 0, w = 0, i, j, h, x, y, lp = -1, t, n, k, lk;
    Par p;

    left[0] = 0;
    lk = loop_live() ? left_text(left) : 0;
    if (lk) lp = loop_pending();
    for (i = 0; i < 11; i++) for (j = 0; j < 16; j++) ink[i][j] = 0;
    perf_led = lp >= 0 ? blinkon(PEND_MS(lp)) : -1;  /* our move waits on the looper: the LED blinks with the bar */
    if (lk >= 2 && lp < 0 && !(SVC(19) >> 30 & 1)) {   /* the looper's own bar (word 19, blink applied): the same block as its LED */
        n = SVC(19);
        w = udiv(126u * (n & 0xFFFF), 256);
        o = ncat(right, n >> 22 & 63);
        o = ncat(scat(o, "."), 1 + (n >> 28 & 3));
        if (n >> 16 & 63) ncat(scat(o, "/"), n >> 16 & 63);
    } else if (run) {                            /* the top bar is the cycle counter: it fills over the cycle */
        k = C ? C : 1;
        w = udiv(126u * (umod(perf_grid.beat, 4 * k) * 65536u + perf_grid.frac), 4u * k * 65536u);
        if (lp >= 0 && !perf_led) w = 0;         /* an action waits: the fill blinks faster as it comes */
        o = ncat(right, 1 + (C ? umod(perf_grid.beat >> 2, C) : perf_grid.beat >> 2));
        o = ncat(scat(o, "."), 1 + (perf_grid.beat & 3));
        if (C) ncat(scat(o, "/"), C);
    } else scat(right, "NO CLK");
    rect(0, 0, 127, 10, 1);
    if (w > 0) rect(1, 1, w, 9, 0);
    fontp(left, 3, 2, 1);
    fontp(right, 125 - widthp(right), 2, 1);
    for (i = 1; i < C; i++) {                    /* a gap in the top and bottom edge at each bar line, a dotted line across */
        x = udiv(i * 252 + C, 2 * C);
        px(x, 0, 2); px(x, 10, 2);
        for (y = 2; y <= 8; y += 2) if (!nearink(x, y)) px(x, y, 2);
    }

    for (i = 0; i < 3; i++) {                    /* knob columns: the effect, the parameter, its stock control, the value */
        t = perf_patch.target[i];
        if (t == T_NONE) { small("-", 42 * i + 22, 19); continue; }
        fx_text(t, a); upper(a);
        lab_text(t, l); upper(l);
        small(a, 42 * i + 22 - ((softw(a) - 1) >> 1), 13);
        small(l, 42 * i + 22 - ((softw(l) - 1) >> 1), 19);
        pinfo(t, &p);
        n = IS_FTSW(t) ? ftsw_on(t) : perf_native(t);   /* the live value in the effect's own steps; a Footsw target its effect's state */
        ctl(t, n, 42 * i + 7, p.look == FADER ? 25 : p.look == KNOB ? 27 : 24);
        nat_text(t, n, v); upper(v);
        small(v, 42 * i + 22 - ((softw(v) - 1) >> 1), 50);
        if (perf_pending(i) >= 0 && shown(i)) invert(42 * i + 2, 12, 42 * i + 41, 55);   /* a waiting move: the column fills when the loop bar fills */
    }
    for (i = 0; i < 3; i++) {                    /* the cursor buttons: their arrow over a stock menu softkey (42 px pitch) with the target's name */
        t = perf_patch.target[3 + i];
        a[0] = 0;
        if (t != T_NONE) fx_text(t, a);
        upper(a);
        while (softw(a) - 1 > 30) a[slen(a) - 1] = 0;
        softtext(a, 42 * i + 26 - ((softw(a) - 1) >> 1));
        pinfo(t, &p);
        if (IS_FTSW(t)) {                        /* a footswitch: a box when off, filled when on */
            if (perf_pending(3 + i) >= 0 ? shown(3 + i) : ftsw_on(t)) invert(42 * i + 2, 57, 42 * i + 41, 63);   /* waiting: it blinks */
            else rect(42 * i + 2, 57, 42 * i + 41, 63, 3);
        } else if (shown(3 + i) && (!SOFT_AWAY || (p.dcc != 255 && perf_native(t) != disp(&p, p.dcc)))) invert(42 * i + 2, 57, 42 * i + 41, 63);
        h = ARN[i] == 3 ? 5 : 3;
        for (j = 0; j < ARN[i]; j++) for (y = 0; y < h; y++) if (AR[i][j] >> y & 1) px(42 * i + 5 + j, 60 - (h >> 1) + y, 2);
    }
}

/* ---- SETUP -------------------------------------------------------------------------------- */
static const char *const WHEN[NX_N] = { "NOW", "1BEAT", "2BEAT", "4BEAT", "8BEAT", "1BAR", "2BAR", "4BAR", "8BAR", "16BAR", "32BAR" };
static const char *const LAG[LG_N] = { "OFF", "MICRO", "50MS", "100MS", "500MS", "1S", "1BEAT", "2BEAT", "4BEAT", "8BEAT",
                                       "1BAR", "2BAR", "4BAR", "8BAR", "16BAR", "32BAR" };
static const char *const CN[NCTL] = { "KNOB 1", "KNOB 2", "KNOB 3", "LEFT BTN", "DOWN BTN", "RIGHT BTN", "FOOTSW" };
static const char *const CID[NCTL] = { "K1", "K2", "K3", "LB", "DB", "RB", "FS" };
static const char *const LN[NLOOP] = { "REC START", "REC END", "PLAY", "STOP", "DELETE", "LOOP START" };
static const char *const GN[3] = { "TURN", "PRESS", "HOLD" };
static const char *const MN[NMOVE_CTL] = { "FOLLOW", "ACTION", "FOLLOW", "ACTION", "RELEASE", "FOLLOW" };

static void mv_text(int t, unsigned m, char *o)    /* "80 1BAR", "-" */
{
    if (MV_NEXT(m) == NX_UNUSED) { scat(o, "-"); return; }
    nat_text(t, MV_VALUE(m), o);
    scat(scat(o + slen(o), " "), WHEN[MV_NEXT(m) < NX_N ? MV_NEXT(m) : NX_N - 1]);
}

static void ges_text(int c, int g, char *o)              /* a gesture's moves: 80>30 */
{
    int first = g == 0 ? 0 : g == 1 ? M_PRESS_A : M_HOLD_A, n = g == 0 ? 1 : g == 1 ? 2 : 3, i, any = 0, t = perf_patch.target[c];
    unsigned m;
    o[0] = 0;
    for (i = 0; i < n; i++) {
        m = perf_patch.move[c][first + i];
        if (MV_NEXT(m) == NX_UNUSED) continue;
        if (any) o = scat(o, ">");
        nat_text(t, MV_VALUE(m), o);
        while (*o) o++;
        any = 1;
    }
    if (!any) scat(o, "-");
}

int pd_nrows(void)
{
    switch (pu_scr) {
    case SC_TOP: return 2 + NCTL;
    case SC_LOOP: return perf_patch.loop_on ? 1 + NLOOP : 1;
    case SC_MENU: return 2;
    case SC_CTL: return pu_ev >= 0 ? 2 : pu_ctl < 3 ? 4 : 3;
    case SC_PMOD: return pd_nmod();
    case SC_PPAR: return pd_nparam(pu_mod, pu_ev >= 0);
    }
    return pu_ges == 0 ? 1 : pu_ges == 1 ? 2 : 3;
}

static void row(int i, char *l, char *v)
{
    int t, s, c0, n;
    l[0] = v[0] = 0;
    switch (pu_scr) {
    case SC_TOP:
        c0 = 2;
        if (!i) { scat(l, "CYCLE"); if (perf_patch.cycle) scat(ncat(v, perf_patch.cycle), perf_patch.cycle > 1 ? " BARS" : " BAR"); else scat(v, "OFF"); }
        else if (i < c0) scat(l, "LOOPER");
        else { scat(l, CN[i - c0]); tgt_text(perf_patch.target[i - c0], v); }
        break;
    case SC_MENU:
        scat(l, i ? "SETUP" : "ENTER");
        if (!i) scat(v, "(  TO EXIT)");             /* list() draws the up arrow in the gap */
        break;
    case SC_LOOP:                                /* LOOPER ON / OFF, then the 6 events when ON */
        if (!i) { scat(l, "LOOPER"); scat(v, perf_patch.loop_on ? "ON" : "OFF"); break; }
        scat(l, LN[--i]);
        if (perf_patch.loop_target[i] == T_NONE) scat(v, "-"); else tgt_text(perf_patch.loop_target[i], v);
        break;
    case SC_CTL:
        t = *pd_tgt();
        if (!i) { scat(l, "TARGET"); tgt_text(t, v); }
        else if (pu_ev >= 0) { scat(l, "ACTION"); mv_text(t, perf_patch.loop_move[pu_ev], v); }
        else { n = pu_ctl < 3 ? i - 1 : i; scat(l, GN[n]); ges_text(pu_ctl, n, v); }
        break;
    case SC_PMOD:
        t = *pd_tgt();
        s = pd_mod_of(t);
        if (!i) { scat(l, "OFF"); if (t == T_NONE) scat(v, "*"); break; }
        if (i <= COUNT) { ncat(scat(l, "FX"), i); fx_text(14 + 10 * (i - 1), v); }
        else { scat(l, NMID[i - 1 - COUNT]); scat(v, NFX[i - 1 - COUNT]); }
        if (i == s) scat(v + slen(v), " *");
        break;
    case SC_PPAR:
        t = pd_target(pu_mod, i, pu_ev >= 0);
        { Par p; pinfo(t, &p); scat(l, p.nm); }
        if (t == *pd_tgt()) scat(v, "*");
        break;
    default:
        n = (pu_ges == 0 ? 0 : pu_ges == 1 ? M_PRESS_A : M_HOLD_A) + i;
        scat(l, MN[n]);
        mv_text(perf_patch.target[pu_ctl], perf_patch.move[pu_ctl][n], v);
    }
}

static int lt;                                   /* first visible list row */

static void list(const char *name, int n, int cur, int turn3)   /* stock list: title, 4 OS-font rows, cursor, scroll bar; knob 1 ENTER, knob 2 EXIT */
{
    static const unsigned char UP[5] = { 4, 6, 7, 6, 4 }, DN[5] = { 1, 3, 7, 3, 1 };
    char l[24], v[28];
    int bar = n > 4, i, k, top, s, e;
    lt = lt > n - 4 ? n - 4 : lt;
    lt = lt > cur ? cur : lt < 0 ? 0 : lt;
    if (cur > lt + 3) lt = cur - 3;
    top = lt;
    font7c(name, 64, 1);
    invert(0, 0, 127, 8);
    for (i = 0; i < 4 && top + i < n; i++) {
        row(top + i, l, v);
        os6(l, 1, 12 + 9 * i);
        os6(v, (bar ? 121 : 127) - 6 * slen(v), 12 + 9 * i);
        if (pu_scr == SC_MENU && top + i == 0) blit(127 - 6 * 10, 14 + 9 * i, 5, 3, UP, 1);   /* the softkey up arrow */
    }
    invert(0, 11 + 9 * (cur - top), bar ? 121 : 127, 19 + 9 * (cur - top));
    if (bar) {                                   /* 0xC009EB90: the scroll bar */
        rect(122, 11, 127, 54, 2);
        rect(123, 16, 127, 41, 1);
        s = udiv(top * 24, n);
        e = top + 4 > n ? 23 : udiv(4 * 24, n) + s;
        rect(124, 17 + s, 126, 17 + e, 0);
        blit(123, 43, 5, 8, DN, 1); blit(123, 12, 5, 8, UP, 1);
    }
    for (k = 0; k < 3; k += 2) {                 /* turn arrows under knob 1, and knob 3 when its turn edits the row */
        if (k && !turn3) continue;
        blit(24 + 40 * k - 7, 53, 5, 3, UP, 0); blit(24 + 40 * k + 2, 53, 5, 3, DN, 0);
    }
    softtext("ENTER", 2 + 20 - 10); invert(2, 57, 41, 63);   /* softkey42: ENTER, EXIT, nothing */
    softtext("EXIT", 42 + 22 - 8); invert(44, 57, 83, 63);
    invert(86, 57, 125, 63);
}

static void move(void)                           /* a stock knob page: frame, tabs, Value in the target's own control, Next, Lag */
{
    unsigned m = *pd_move();
    int t = *pd_tgt(), un = MV_NEXT(m) == NX_UNUSED, x = 0, k;
    char a[24], b[24];
    Par p;
    KP_BOX(0, 0, 11, 128, 53);
    if (pu_ev >= 0) { scat(a, LN[pu_ev]); scat(b, "ACTION"); }
    else { scat(scat(scat(a, CID[pu_ctl]), " "), GN[pu_ges]); scat(b, MN[pu_mv]); }
    x += KP_TAB(0, x, 0, 2, a) - 1;
    KP_TAB(0, x, 0, 0, b);
    pinfo(t, &p);
    if (t == T_NONE) font7("Value", 8, 16); else { lab_text(t, a); font7(a, 8, 16); }
    ctl(t, un ? 0 : MV_VALUE(m), 8, 24);
    a[0] = 0; nat_text(t, un ? -1 : (int)MV_VALUE(m), a);
    font7r(a, 8 + 30, 48);
    k = un ? 0 : MV_NEXT(m) < NX_N ? MV_NEXT(m) : NX_N - 1;
    font7("Next", 48, 16); KP_KNOB(0, KP_DIVD(k, NX_N - 1), 48, 24); font7r(WHEN[k], 48 + 30, 48);
    k = un ? 0 : MV_LAG(m);
    font7("Lag", 88, 16); KP_KNOB(0, KP_DIVD(k, LG_N - 1), 88, 24); font7r(LAG[k], 88 + 30, 48);
    invert(5, 57, 41, 63);                       /* softkey40: nothing, EXIT, nothing */
    softtext("EXIT", 45 + 18 - 8); invert(45, 57, 81, 63);
    invert(85, 57, 121, 63);
}

static void setup(void)
{
    char a[24], b[24];
    int c = pu_pos[pu_scr], n = pd_nrows(), j;
    if (pu_scr == SC_MOVE) { move(); return; }
    switch (pu_scr) {
    case SC_TOP: list("PERFORM SETUP", n, c, c == 0); break;
    case SC_LOOP: list("LOOPER", n, c, c == 0); break;
    case SC_MENU: list("PERFORM MODE", n, c, 0); break;
    case SC_CTL: if (pu_ev >= 0) scat(scat(a, "ON "), LN[pu_ev]); else scat(a, CN[pu_ctl]); list(a, n, c, 0); break;
    case SC_PMOD: scat(scat(a, pu_ev >= 0 ? LN[pu_ev] : CID[pu_ctl]), " TARGET"); list(a, n, c, 0); break;
    case SC_PPAR:
        mid_text(pd_target(pu_mod, 0, 1), a);
        fx_text(pd_target(pu_mod, 0, 1), b);
        for (j = 0; a[j] && a[j] == b[j]; j++) ;
        if (a[j] || b[j]) scat(scat(a + slen(a), " "), b);   /* IN INPUT, FX1 DELAY; ROUTE and MIX alone */
        list(a, n, c, 0);
        break;
    default: scat(scat(scat(a, CID[pu_ctl]), " "), GN[pu_ges]); list(a, n, c, 0);
    }
}

void perf_draw(void)
{
    int i;
    for (i = 0; i < 256; i++) LCD0[i] = 0;
    if (!perf_on) pu_scr = SC_MENU;
    if (perf_on != 1) setup(); else play();
    LCD_DIRTY(0);
}
