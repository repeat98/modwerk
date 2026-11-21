/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Filters for the Digitakt I, OS 1.54 on Core 2.1: two more filter TYPEs on the stock FLTR page.
 *
 * Stock TYPE is OFF, LP, HP or EQ:1..EQ:5 (0..7). This module adds, after EQ:5:
 *    8 DJ    one knob: FREQ below the middle is a low-pass sweeping down, above it a high-pass
 *            sweeping up, the middle is open; RESO a gentle DJ-mixer peak
 *    9 BP    band-pass, 12 dB/oct, unity at the centre; RESO narrows it
 * (The code below also has the band-reject, 24 dB and envelope-follower types of the first private
 * build, 10..15; TYPE's maximum stops at BP, so this release does not reach them.)
 * FREQ, RESO and ENV act as on the stock types, and like them are saved with the sound, p-lockable
 * and LFO-able; the filter envelope (ATK, DEC, SUS, REL, trig) moves the cutoff as stock.
 *
 * Where. The render calls the stock filter once per voice, f(params, block, note-on bit, voice), on
 * the voice's 32-frame Q31 block in place (0x40072844, loaded by the lea at 0x400780a4). glue.s's
 * flt_voice sends TYPE 8..15 here and the rest to stock. params is the voice's smoothed parameter
 * block (after p-locks and LFOs): +0 TYPE, +2 FREQ, +4 RESO, +6 ENV, +8 ATK, +10 DEC, +12 SUS, as
 * knob words (value << 8). The filter envelope's level is at 0x4199ef58 + 12 v, as stock reads it.
 *
 * The filters are zero-delay-feedback (TPT) state-variable filters in Q27, with the ColdFire's EMAC
 * in fractional mode; the coefficients glide across each block. Like the stock filter stage the output
 * is a quarter of the input (-12 dB; the stages after it make that up). A project saved with these
 * types loads on a build without the module as EQ:5 (stock clamps TYPE to 7). */

typedef unsigned long u32;
typedef long s32;
typedef short s16;
typedef unsigned short u16;
typedef signed char s8;
typedef unsigned char u8;
#define R32(a) (*(volatile u32 *)(a))
#include "filters_tables.h"

#define ENV_LEVEL(v) (*(volatile s32 *)(0x4199ef58 + 12 * (v)))
#define UI_ENVMOD(v) (*(volatile s32 *)(0x4399ead4 + 4 * (v)))   /* stock keeps ENV x level here for the page */

enum { T_DJ = 8, T_BP, T_BR, T_LP4, T_HP4, T_FLP, T_FBP, T_FHP };

typedef struct { s32 ic1, ic2, a1, a2, a3, g, k; } stage_t;   /* integrator states (Q27), coefficients (Q31), for g, k */
typedef struct { stage_t st[2]; s32 fol; s8 type, idle[2]; } voice_t;
static voice_t vs[8];

static inline s32 fmul(s32 a, s32 b)    /* Q31 x Q31 -> Q31 (fractional EMAC, truncating) */
{
    s32 r;
    __asm__ volatile ("mac.l %1, %2, %%acc0\n\tmovclr.l %%acc0, %0" : "=d" (r) : "r" (a), "r" (b));
    return r;
}
static inline s32 fmul2(s32 a, s32 b, s32 c, s32 d)    /* a b + c d */
{
    s32 r;
    __asm__ volatile ("mac.l %1, %2, %%acc0\n\tmac.l %3, %4, %%acc0\n\tmovclr.l %%acc0, %0"
                      : "=d" (r) : "r" (a), "r" (b), "r" (c), "r" (d));
    return r;
}
static inline s32 clamp30(s32 v) { return v > (1L << 30) ? (1L << 30) : v < -(1L << 30) ? -(1L << 30) : v; }
static inline s32 out29(s32 v)          /* Q27 -> a quarter of Q31, saturating */
{
    if (v > 0x1fffffffL) return 0x7fffffffL;
    if (v < -0x20000000L) return -0x7fffffffL - 1;
    return v << 2;
}
/* The cutoff (index 0..127 << 24, fraction below) to g = tan(pi fc / fs), Q16, interpolated. */
static s32 gcoef(s32 cut)
{
    s32 i, fr;
    if (cut < 0) cut = 0;
    if (cut > 0x7f000000L) cut = 0x7f000000L;
    i = cut >> 24; fr = cut & 0xffffff;
    return ft_g[i] + fmul(ft_g[i + 1] - ft_g[i], fr << 7);
}
/* a1 = 1 / (1 + g (g + k)), a2 = g a1, a3 = g a2 (Q31) for g (Q16) and k (Q30). */
static void coefs(s32 g, s32 k30, s32 *a1, s32 *a2, s32 *a3)
{
    s32 k = k30 >> 14, d = 65536 + fmul(g << 12, (g + k) << 3), q, r;
    q = 0x7fffffffL / d; r = 0x7fffffffL - q * d;
    q = (q << 16) + (((r << 10) / d) << 6);             /* 2^47 / d in two steps: about 26 bits */
    *a1 = q < 0 ? 0x7fffffffL : q;
    *a2 = fmul(*a1, g << 12) << 3;
    *a3 = fmul(*a2, g << 12) << 3;
}
/* One DJ stage over the voice's block, in place: Q31 in, a quarter of it out (as the stock filter
 * stage), Q27 inside. The coefficients are worked out again only when g or k changed, and glide across
 * the block when they did. */
enum { O_LOW, O_HIGH, O_BAND };
static void stage(s32 *x, stage_t *s, s32 g, s32 k, int out, s8 *was_idle)
{
    s32 a1, a2, a3, d1 = 0, d2 = 0, d3 = 0, ic1 = s->ic1, ic2 = s->ic2;
    int n;
    if (*was_idle || g != s->g || k != s->k) {
        coefs(g, k, &a1, &a2, &a3);
        if (*was_idle) { s->a1 = a1; s->a2 = a2; s->a3 = a3; *was_idle = 0; }
        d1 = (a1 - s->a1) >> 5; d2 = (a2 - s->a2) >> 5; d3 = (a3 - s->a3) >> 5;
        s->g = g; s->k = k;
    }
    a1 = s->a1; a2 = s->a2; a3 = s->a3;
    for (n = 0; n < 32; n++) {
        s32 in = x[n] >> 4, v3 = in - ic2, v1, v2;     /* Q31 -> Q27: 18 dB for resonance */
        a1 += d1; a2 += d2; a3 += d3;
        v1 = fmul2(a1, ic1, a2, v3);
        v2 = ic2 + fmul2(a2, ic1, a3, v3);
        ic1 = clamp30(2 * v1 - ic1); ic2 = clamp30(2 * v2 - ic2);
        x[n] = out29(out == O_HIGH ? in - (fmul(k, v1) << 1) - v2 : out == O_BAND ? fmul(k, v1) << 1 : v2);   /* band: k v1, unity at the centre */
    }
    s->ic1 = ic1; s->ic2 = ic2; s->a1 = a1; s->a2 = a2; s->a3 = a3;
}
/* A stage at rest: its state where a wide-open low-pass (the block's last input) or a closed-down
 * high-pass (0) would have it, so it can start again without a click. */
static void rest(const s32 *x, stage_t *s, int high, s8 *was_idle)
{
    s->ic1 = 0; s->ic2 = high ? 0 : x[31] >> 4; *was_idle = 1;
}

void flt_render(u8 *params, s32 *buf, u32 active, u32 v)
{
    voice_t *s = &vs[v & 7];
    s32 type = (s8)params[0], freq = *(s16 *)(params + 2), reso = *(s16 *)(params + 4) >> 8;
    s32 depth = ((s32)*(s16 *)(params + 6) - 16384) << 17, env, cut, macsr, n;
    (void)active;
    if (reso < 0) reso = 0;
    if (reso > 127) reso = 127;
    __asm__ volatile ("move.l %%macsr, %0\n\tmove.l #0x20, %%macsr\n\tmoveq #0, %%d0\n\tmove.l %%d0, %%acc0\n\tmove.l %%d0, %%accext01"
                      : "=d" (macsr) : : "d0");
    if (type != s->type) {              /* a new type starts from rest */
        for (n = 0; n < 2; n++) { s->st[n].ic1 = s->st[n].ic2 = 0; s->idle[n] = 1; }
        s->type = (s8)type;
    }
    env = ENV_LEVEL(v);
    UI_ENVMOD(v) = fmul(depth, env);
    cut = ((s32)freq << 16) + fmul(depth, env);
    if (type == T_BP) {                 /* band-pass, 12 dB/oct; RESO narrows it */
        rest(buf, &s->st[1], 1, &s->idle[1]);
        stage(buf, &s->st[0], gcoef(cut), ft_q[reso], O_BAND, &s->idle[0]);
    } else {                            /* DJ: low-pass into high-pass; the middle half step is open */
        s32 p = cut >> 16, c = 64 << 8;
        if (p < c - 64) {               /* 0 .. c-64 -> index 36 .. 127 (about 140 Hz .. 20 kHz) */
            s32 t = p < 0 ? 0 : p;
            rest(buf, &s->st[1], 1, &s->idle[1]);
            stage(buf, &s->st[0], gcoef((36L << 24) + (t * ((91L << 16) / (c - 64)) << 8)), ft_qdj[reso], 0, &s->idle[0]);
        } else if (p > c + 64) {        /* c+64 .. 127<<8 -> index 0 .. 104 (20 Hz .. 5.5 kHz) */
            s32 t = p > (127 << 8) ? (127 << 8) : p;
            rest(buf, &s->st[0], 0, &s->idle[0]);
            stage(buf, &s->st[1], gcoef((t - c - 64) * ((104L << 16) / ((127 << 8) - c - 64)) << 8), ft_qdj[reso], 1, &s->idle[1]);
        } else {
            rest(buf, &s->st[0], 0, &s->idle[0]);
            rest(buf, &s->st[1], 1, &s->idle[1]);
            for (n = 0; n < 32; n++) buf[n] = out29(buf[n] >> 4);
        }
    }
    __asm__ volatile ("move.l %0, %%macsr" : : "d" (macsr));
}

/* ---- the page ---------------------------------------------------------------------------------- */
static const char *const names[2] = { "DJ", "BP" };
s32 flt_name(u32 id, s32 value, char *buf)      /* TYPE's text for 8..15: the title and the label */
{
    s32 t = (value >> 8) - 8, n = 0;
    const char *s = t == 0 || t == 1 ? names[t] : "?";
    (void)id;
    while (s[n]) { buf[n] = s[n]; n++; }
    buf[n] = 0;
    return n;
}

/* TYPE's knob graphic. The page looks up a UI record per parameter (0x4197e2f8 + 84 id, built at
 * boot) and jumps through its draw routine at +48; TYPE (id 33) gets flt_gfx, which draws 8..15 and
 * hands 0..7 to the stock routine it replaced. */
#define FW_RECT 0x400c1bce              /* (canvas, x0, y0, x1, y1, colour) */
#define FW_TEXT 0x400c27e8              /* (canvas, font, x, y, mode, fmt, ...) */
#define FONT_LABEL 0x4208dc70
#define RECT(b, x0, y0, x1, y1, c) ((void (*)(void *, s32, s32, s32, s32, s32))FW_RECT)((b), (x0), (y0), (x1), (y1), (c))
#define TEXT(b, x, y, t) ((void (*)(void *, u32, s32, s32, s32, const char *, ...))FW_TEXT)((b), FONT_LABEL, (x), (y), 0, "%s", (t))
#define TYPE_REC (0x4197e2f8 + 84 * 33)
typedef void (*gfx_fn)(void *, s32, void *, s32, s32, u32);
static gfx_fn stock_gfx;
static void line(void *b, s32 x0, s32 y0, s32 x1, s32 y1)
{
    s32 dx = x1 - x0, dy = y1 - y0, n = dx < 0 ? -dx : dx, i;
    if ((dy < 0 ? -dy : dy) > n) n = dy < 0 ? -dy : dy;
    if (!n) { RECT(b, x0, y0, x0, y0, 1); return; }
    for (i = 0; i <= n; i++) { s32 x = x0 + (dx * i + (dx < 0 ? -n / 2 : n / 2)) / n, y = y0 + (dy * i + (dy < 0 ? -n / 2 : n / 2)) / n; RECT(b, x, y, x, y, 1); }
}
/* Responses on a 15 x 13 grid inside the frame, y up; -1 ends. */
static const s8 shape_dj[] = { 1, 6, 15, 6, -1 };     /* DJ: flat, with the two arrows drawn below */
static const s8 shape_bp[] = { 1, 1, 5, 3, 8, 11, 11, 3, 15, 1, -1 };
static void flt_gfx(void *rec, s32 value, void *bmp, s32 x, s32 y, u32 fl)
{
    s32 t = (value >> 8) - 8, k;
    const s8 *p;
    if (t != 0 && t != 1) { if (stock_gfx) stock_gfx(rec, value, bmp, x, y, fl); return; }
    RECT(bmp, x + 1, y, x + 17, y, 1); RECT(bmp, x + 1, y + 16, x + 17, y + 16, 1);   /* the frame */
    RECT(bmp, x + 1, y, x + 1, y + 16, 1); RECT(bmp, x + 17, y, x + 17, y + 16, 1);
    p = t ? shape_bp : shape_dj;
    for (k = 2; p[k] >= 0; k += 2) line(bmp, x + 1 + p[k - 2], y + 2 + p[k - 1], x + 1 + p[k], y + 2 + p[k + 1]);
    if (!t) {                           /* DJ: low-pass to the left, high-pass to the right */
        line(bmp, x + 3, y + 11, x + 6, y + 11); line(bmp, x + 3, y + 11, x + 4, y + 12); line(bmp, x + 3, y + 11, x + 4, y + 10);
        line(bmp, x + 12, y + 11, x + 15, y + 11); line(bmp, x + 15, y + 11, x + 14, y + 12); line(bmp, x + 15, y + 11, x + 14, y + 10);
    }
}
/* ---- DJ on the page: the box, and the catch in the middle ---------------------------------------- */
/* The box draws the stock LP or HP curve where the DJ filter's cutoff really is (the render's map:
 * left of the middle LP 36..127, right of it HP 0..104), and the flat OFF line in the open middle.
 * Near the middle both curves are flat, so a tick over the box marks the middle and a bar under its
 * top edge marks FREQ. */
#define FW_BOX 0x40031ef6               /* (view, canvas, 0, 1, FREQ, RESO, shape) */
#define BOX_X0 21                       /* the box's inside, x 21..70; its top edge at y 23 */
#define BOX_W  50
#define BOX_TOP 23
s32 flt_boxtype;                        /* TYPE of the box being drawn (glue.s) */
void flt_boxdj(s32 *a)                  /* a: view, canvas, 0, 1, FREQ, RESO, shape */
{
    s32 f = a[4], p = f, c = 64 << 8, x;
    void *b = (void *)a[1];
    if (p < c - 64) {
        if (p < 0) p = 0;
        a[4] = (36 << 8) + p * ((91 << 16) / (c - 64)) / 256; a[6] = 1;
    } else if (p > c + 64) {
        if (p > 127 << 8) p = 127 << 8;
        a[4] = (p - c - 64) * ((104 << 16) / ((127 << 8) - c - 64)) / 256; a[6] = 2;
    } else
        a[6] = 0;
    ((void (*)(s32, s32, s32, s32, s32, s32, s32))FW_BOX)(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
    x = BOX_X0 + (BOX_W - 1) / 2;
    RECT(b, x, BOX_TOP + 2, x + 1, BOX_TOP + 3, 1);           /* the middle, over the box */
    if (f < 0) f = 0;
    if (f > 127 << 8) f = 127 << 8;
    x = BOX_X0 + (f * (BOX_W - 2) + (127 << 7)) / (127 << 8);
    RECT(b, x, BOX_TOP - 3, x + 1, BOX_TOP - 1, 1);           /* FREQ, under the top edge */
}

/* FREQ on DJ, turned by knob E. Turned quickly across the middle it stops there for a quarter second;
 * then, or with a new turn (a pause first), it goes on to the other side. Turned slowly, a fraction of
 * a step at a time, it sweeps through. FUNC + turn jumps as stock's centred values do: to the middle,
 * then to the end it turns towards (stock would jump to FREQ's default, the top). */
#define FW_SLOT 0x40078d80              /* (id) -> the parameter's slot in the sound, or < 0 */
#define NEWTURN 8                       /* UI ticks (about 33 ms each) without a turn: a new turn */
#define SLOW    0x200                   /* a turn below two whole steps crosses the middle smoothly */
#define LOCK    8                       /* UI ticks held in the middle while still turning: about 0.25 s */
#define FW_KEY_HELD 0x400d399c          /* (key) -> held; FUNC is key 1 */
u32 flt_knob;                           /* knob E turned in this UI pass (flt_enc; cleared by flt_tick) */
static u32 ticks, last_t, park_t;
static s32 edir;                        /* knob E's last turn: < 0 down, > 0 up */
static s32 parked;                      /* held in the middle: -1 came from below, 1 from above, 0 free */
static s32 sound_get(u32 snd, s32 id)
{
    u32 o = R32(snd + 16), base;
    s32 slot;
    if (!o) return -1;
    base = ((u32 (*)(u32))R32(R32(o) + 40))(o);
    slot = ((s32 (*)(s32))FW_SLOT)(id);
    if (!base || slot < 0 || slot > 52) return -1;
    return *(volatile s16 *)(base + 0x14 + slot * 2);
}
s32 flt_freqset(u32 snd, s32 v)
{
    s32 c = 64 << 8, old = sound_get(snd, 30), d, gap = (s32)(ticks - last_t);
    last_t = ticks;
    if (old < 0 || sound_get(snd, 33) >> 8 != T_DJ) return v;
    if (((s32 (*)(s32))FW_KEY_HELD)(1)) {   /* FUNC + turn: the middle, then the end */
        parked = 0;
        if (edir < 0) return old > c ? c : 0;
        return old < c ? c : 127 << 8;
    }
    if (parked && (gap >= NEWTURN || ticks - park_t >= LOCK)) parked = 0;
    if (parked) {                       /* still the turn that stopped here: not across */
        if ((parked < 0 && v > c) || (parked > 0 && v < c)) return c;
        if (v != c) parked = 0;
        return v;
    }
    d = v - old;
    if (((old < c && v > c) || (old > c && v < c)) && (d < 0 ? -d : d) >= SLOW) {
        parked = old < c ? -1 : 1;
        park_t = ticks;
        return c;
    }
    return v;
}
s32 flt_enc(void *brain, void *ev)      /* ev_enc: note knob E's turns; the stock page handles them */
{
    (void)brain;
    if (*(s32 *)((u8 *)ev + 12) == 5) { flt_knob = 1; edir = *(s32 *)((u8 *)ev + 16); }
    return 0;
}

void flt_tick(u8 *ctrl)                 /* ev_tick: keep TYPE's draw routine pointing here */
{
    (void)ctrl;
    ticks++;
    flt_knob = 0;
    if (R32(TYPE_REC + 48) != (u32)flt_gfx) {
        stock_gfx = (gfx_fn)R32(TYPE_REC + 48);
        R32(TYPE_REC + 48) = (u32)flt_gfx;
    }
}
