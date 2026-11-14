/* SPDX-License-Identifier: MIT */
/* Analog BD's voices in Q31. Each line follows dsp909.Voice.block or
 * dsp808.Voice.block (repeat98's float references, which bd909.asm and
 * bd808.asm implement on the Octatrack's DSP); the comments name the step.
 *
 * On the unit each per-sample pass runs from ab_*.s, scheduled by hand for the EMAC; the C
 * passes here are their reference, bit for bit, and what the host build (MW_DSP_HOST) runs.
 * A pass reads the voice's state and one shared record of the block's settings and the
 * model's constants in place, so nothing is copied in or out around it. */
#include <stddef.h>
#include "ab_dsp.h"
#include "modwerk/dsp.h"
#include "tables.h"

#define QMAX MW_QMAX
/* A voice's samples since its hit stop here, a block short of INT32_MAX, so that a pass
 * counting through its block (cnt + 31) never wraps. */
#define CNT_MAX (0x7fffffff - AB_FRAMES)
#ifdef MW_DSP_HOST
#define OFFSET(type, field, at) _Static_assert(1, "the host's pointers differ")
#else
#define OFFSET(type, field, at) _Static_assert(offsetof(type, field) == (at), #field " moved: fix ab_*.s")
#endif

/* The Mackie curve, v - KSAT v^5, for v inside (-1, 1): v^2 and KSAT v, then v^4, then
 * v^4 (KSAT v), as ab_desk.s works it out. */
static inline __attribute__((always_inline)) int32_t curve(int32_t v)
{
    int32_t v2 = qmul(v, v), kv = qmul(KSAT, v);
    return v - qmul(qmul(v2, v2), kv);
}

/* x << n held inside (-1, 1), a curve's input: -1 squared does not fit Q31. */
static inline int32_t sshl_in(int32_t x, int n)
{
    if (x > (QMAX >> n))
        return QMAX;
    if (x <= (MW_QMIN >> n))
        return MW_QMIN + 1;
    return (int32_t)((uint32_t)x << n);
}

/* Scratch for one block: each render hands its 32 samples from pass to pass through these. */
static int32_t sec[2][AB_FRAMES];   /* one block; the desk takes both as its crossover's bands */
#define sec_a sec[0]
#define sec_b sec[1]

OFFSET(struct ab_voice, cnt, 0);
OFFSET(struct ab_voice, lb, 4);
OFFSET(struct ab_voice, m2, 8);
OFFSET(struct ab_voice, v.a.ep, 12);
OFFSET(struct ab_voice, v.a.th, 28);
OFFSET(struct ab_voice, v.a.aincb, 32);
OFFSET(struct ab_voice, v.a.ngdc, 60);
OFFSET(struct ab_voice, v.a.g1, 64);
OFFSET(struct ab_voice, v.a.pp, 88);
OFFSET(struct ab_voice, v.a.env, 92);
OFFSET(struct ab_voice, v.a.lcg, 116);
OFFSET(struct ab_voice, v.b.ep, 12);
OFFSET(struct ab_voice, v.b.u, 20);

/* ---- the desk ---- */

/* The desk's settings: the block's LOW and HIGH, its constants, and the model's output (a
 * shift and a trim, 0 for none). ab_desk.s reads it by these offsets. */
struct ab_desk_k {
    int32_t gl2, gh, tin, kb, km, kms2, pad, ksat;
    int32_t sh, top, bot, trim;
};
OFFSET(struct ab_desk_k, ksat, 28);
OFFSET(struct ab_desk_k, trim, 44);

#define DESK_K(shift, t) { 0, 0, D_TIN32, KB, KM, KMS2, D_PAD, KSAT, \
                           (shift), QMAX >> (shift), MW_QMIN >> (shift), (t) }
/* the 909's: the desk's 1, then its own shift */
static struct ab_desk_k desk909_k = DESK_K(1 + OUT909_SHIFT, 0);
static struct ab_desk_k desk808_k = DESK_K(1, TRIM808);

/* The desk at SAT 0 with LOW and HIGH (dsp909.Voice.desk), on a block in place: the input
 * trim, then the crossover's two one-poles, the bands' weights (0.1.7: LOW and HIGH weight
 * their bands; the low band's weight is halved here and the sum doubled in the curve's
 * input), and the output's curve.
 * The lite desk: the model's input curve is left out (at SAT 0 its input stays
 * under 0.3, where v - KSAT v^5 is within 0.05 % of v). */
static void __attribute__((unused)) desk_c(struct ab_voice *s, int32_t *io, const struct ab_desk_k *k)
{
    int32_t lb = s->lb, m2 = s->m2;
    for (int i = 0; i < AB_FRAMES; i++)
        io[i] = qmul(D_TIN32, io[i]);
    for (int i = 0; i < AB_FRAMES; i++) {
        int32_t x = io[i], rest2;
        lb += qmul(KB, x - lb);
        rest2 = (x - lb) >> 1;
        m2 += qmul(KM, rest2 - m2);
        sec_a[i] = lb;
        sec_b[i] = rest2 - m2;
        io[i] = m2;
    }
    for (int i = 0; i < AB_FRAMES; i++) {
        int32_t acc = qsum3(k->gl2, sec_a[i], k->gh, sec_b[i], KMS2, io[i]);
        io[i] = sshl(qmul(D_PAD, curve(sshl_in(acc, 5))), k->sh);
        if (k->trim)
            io[i] = qmul(io[i], k->trim);
    }
    s->lb = lb;
    s->m2 = m2;
}

/* ---- the 909's passes ----
 * Each runs 16 samples (H), the Octatrack's block: the control between them is worked out
 * in render909. Their sum stays under 0.72 of full scale (the model's peak at 48 kHz over
 * every knob at its ends, ACNT 1 and 127, retrigs and pitch ratios 0.25 to 4), so they add
 * without saturating. */

#define H 16

/* The 909's constants (ab_body.s, ab_click.s and ab_noise.s read them by these offsets). */
struct ab_k909 {
    int32_t ka, kth, kpr, ahp, anh, bnh2, kl1, kl2;
    uint32_t lcg_m, lcg_c;
    const int32_t *body, *clk;
};
OFFSET(struct ab_k909, anh, 16);
OFFSET(struct ab_k909, lcg_m, 32);
OFFSET(struct ab_k909, body, 40);
OFFSET(struct ab_k909, clk, 44);

const struct ab_k909 ab_k909 = { KA, KTH, KPR, AHP, ANH, BNH2, KL1, KL2, LCG_M, LCG_C, BODY909, CCLK };
_Static_assert(CLK_N == 128 && CLK_N % H == 0, "ab_click.s reads CLK_N rows, 16 at a time");

/* 1. the body: pitch, the recorded cycle and its fundamental, the VCA and the thump */
static void __attribute__((unused)) body909_c(struct ab_voice *s, int32_t *out)
{
    const struct ab_k909 *k = &ab_k909;
    int32_t ep = s->v.a.ep, o = s->v.a.o, m = s->v.a.m, th = s->v.a.th;
    uint32_t u = s->v.a.u;
    for (int i = 0; i < H; i++) {
        int32_t inc = s->v.a.aincb + qmul(s->v.a.asinca, ep), f, td, fu, s8, g;
        const int32_t *b;
        ep -= qmul(ep, s->v.a.dkp);
        u += (uint32_t)inc;                         /* wraps at +-1 */
        /* the tables at u = -1 + 2k/128: row k = u's top 7 bits from -1, and the rest */
        b = &k->body[2 * ((u ^ 0x80000000u) >> 25)];
        f = (int32_t)((u << 6) & 0x7fffffffu);
        td = b[0] + qmul(b[2] - b[0], f);
        fu = b[1] + qmul(b[3] - b[1], f);
        /* S/8 = CTD lR/2 + CF (1/2 + KKF ep), with the body's level in both scales */
        s8 = qsum2(td, s->v.a.glr, s->v.a.gh + qmul(s->v.a.gk, ep), fu);
        /* the VCA: open with KA, droop through the hold, then DECAY */
        o += qmul(k->ka, QMAX - o);
        m -= qmul(m, s->v.a.dkm);
        g = qmul(o, m);
        th += qmul(k->kth, g - th);
        out[i] = 2 * qsum2(g, s8, s->v.a.ngdc, th);
    }
    s->v.a.ep = ep; s->v.a.o = o; s->v.a.m = m; s->v.a.th = th; s->v.a.u = u;
}

/* 2. the click: the table's row (while it lasts) and the two slow modes, added in */
static void __attribute__((unused)) click909_c(struct ab_voice *s, int32_t *y)
{
    const struct ab_k909 *k = &ab_k909;
    int32_t e1 = s->v.a.e1, e2 = s->v.a.e2;
    const int32_t *row = s->v.a.pp < CLK_N ? &k->clk[2 * s->v.a.pp] : 0;
    for (int i = 0; i < H; i++) {
        int32_t v = qsum2(s->v.a.g3, e1, s->v.a.g4, e2);
        if (row)
            v += qsum2(s->v.a.g1, row[2 * i], s->v.a.g2, row[2 * i + 1]);
        y[i] += v;
        e1 = qmul(e1, k->kpr);
        e2 = qmul(e2, k->ahp);
    }
    s->v.a.e1 = e1; s->v.a.e2 = e2;
}

/* 3. the shaped noise under its envelope, added in */
static void __attribute__((unused)) noise909_c(struct ab_voice *s, int32_t *y)
{
    const struct ab_k909 *k = &ab_k909;
    int32_t nh = s->v.a.nh, nprev = s->v.a.nprev, n1 = s->v.a.n1, n2 = s->v.a.n2, env = s->v.a.env;
    uint32_t lcg = s->v.a.lcg;
    for (int i = 0; i < H; i++) {
        int32_t wn;
        lcg = (lcg * k->lcg_m + k->lcg_c) & 0xffffff;
        wn = (int32_t)(lcg << 8);
        nh = qsum2(k->anh, nh, k->bnh2, (wn >> 1) - (nprev >> 1));
        n1 += qmul(k->kl1, nh - n1);
        n2 += qmul(k->kl2, n1 - n2);
        env += s->v.a.denv;
        y[i] += qmul(env, n2);
        nprev = wn;
    }
    s->v.a.nh = nh; s->v.a.nprev = nprev; s->v.a.n1 = n1; s->v.a.n2 = n2; s->v.a.env = env;
    s->v.a.lcg = lcg;
}

/* ---- the 808's ---- */

/* The block's settings and the 808's constants (ab_body808.s reads them by these offsets). */
struct ab_r808 {
    int32_t inc, bend, dp, de, gain;
    const int16_t *wave;
    int32_t kt, vel;
    int32_t pk, pd, dd, atk;    /* the trigger oscillator */
};
OFFSET(struct ab_r808, wave, 20);
OFFSET(struct ab_r808, vel, 28);
OFFSET(struct ab_r808, atk, 44);
OFFSET(struct ab_voice, v.b.pc, 24);
OFFSET(struct ab_voice, v.b.tf, 36);

struct ab_r808 ab_r808 = { 0, 0, 0, 0, 0, W808, 0, 0, PK, PD, DD, 0 };

/* 1. the body: phase, settling pitch, the wave (sine/2 and its small second harmonic, a
 * function of phase alone: W808) and its decay */
static void __attribute__((unused)) body808_c(struct ab_voice *s, int32_t *out)
{
    const struct ab_r808 *r = &ab_r808;
    int32_t ep = s->v.b.ep, e = s->v.b.e;
    uint32_t u = s->v.b.u;
    for (int i = 0; i < AB_FRAMES; i++) {
        u += (uint32_t)(r->inc + qmul(r->bend, ep));
        ep -= qmul(r->dp, ep);
        e -= qmul(r->de, e);
        out[i] = qmul(qmul(mw_wave(W808, W_BITS, u, W808_SHIFT), r->gain), e);
    }
    s->v.b.ep = ep; s->v.b.e = e; s->v.b.u = u;
}

/* 2. the damped trigger oscillator, added into the first n samples (until it retires) */
static void __attribute__((unused)) trig808_c(struct ab_voice *s, int32_t *y, int n)
{
    int32_t pc = s->v.b.pc, ps = s->v.b.ps, dc = s->v.b.dc;
    for (int i = 0; i < AB_FRAMES; i++) {
        int32_t pc1 = pc - qmul(PK, ps), ps1 = ps + qmul(PK, pc1);
        ps = ps1 - qmul(PD, ps1);
        pc = pc1 - qmul(PD, pc1);
        dc -= qmul(DD, dc);
        if (i < n)
            y[i] = sadd(sshl(qmul(pc + dc, ab_r808.atk), 1), y[i]);
    }
    s->v.b.pc = pc; s->v.b.ps = ps; s->v.b.dc = dc;
}

/* 3. TONE shapes edge and body together, before the clip; ACNT after it */
static void __attribute__((unused)) tone808_c(struct ab_voice *s, int32_t *out, const int32_t *y)
{
    int32_t tf = s->v.b.tf;
    for (int i = 0; i < AB_FRAMES; i++) {
        tf += qmul(ab_r808.kt, y[i] - tf);
        out[i] = qmul(sshl(tf, 2), ab_r808.vel);
    }
    s->v.b.tf = tf;
}

/* ---- each pass on the unit, or its reference ---- */

#ifdef MW_DSP_HOST
#define desk desk_c
#define body909 body909_c
#define click909 click909_c
#define noise909 noise909_c
#define body808 body808_c
#define tone808 tone808_c
#define trig808 trig808_c
#else
void ab_desk(struct ab_voice *s, int32_t *io, const struct ab_desk_k *k, int32_t *scratch);
void ab_body909(struct ab_voice *s, int32_t *out);
void ab_click909(struct ab_voice *s, int32_t *y);
void ab_noise909(struct ab_voice *s, int32_t *y);
void ab_body808(struct ab_voice *s, int32_t *out);
void ab_tone808(struct ab_voice *s, int32_t *out, const int32_t *y);
void ab_trig808(struct ab_voice *s, int32_t *y, int n);

#ifdef AB_CHECK
/* A check build (tools/asm_check.py): the pass AB_CHECK names (1 desk, 2 the bodies,
 * 3 the 909's click, 4 its noise) also runs its C reference on a copy of the voice and the
 * samples it writes, and every byte of the voice and word written that differs counts in
 * ab_check. */
volatile struct { uint32_t marker, checked, wrong; } ab_check = { 0xab0c4ec0, 0, 0 };
static struct ab_voice check_v;
static int32_t check_io[AB_FRAMES];

static void check_copy(void *to, const void *from, unsigned n)
{
    volatile const uint8_t *f = from;
    uint8_t *t = to;
    while (n--)
        *t++ = *f++;
}

static void check_count(const struct ab_voice *s, const int32_t *io, int w)
{
    volatile const uint8_t *a = (const uint8_t *)s, *b = (const uint8_t *)&check_v;
    volatile const int32_t *x = io;
    for (unsigned i = 0; i < sizeof *s; i++)
        ab_check.wrong += a[i] != b[i];
    for (int i = 0; i < w; i++)
        ab_check.wrong += x[i] != check_io[i];
    ab_check.checked++;
}

/* w: the words of the block the pass writes (the 909's passes run 16 samples) */
#define PASS(n, w, ref, run, s, io, ...) do {                      \
        if (AB_CHECK == (n)) {                                     \
            check_copy(&check_v, (s), sizeof *(s));                \
            check_copy(check_io, (io), 4 * (w));                   \
            ref(&check_v, check_io, ##__VA_ARGS__);                \
        }                                                          \
        run;                                                       \
        if (AB_CHECK == (n))                                       \
            check_count((s), (io), (w));                           \
    } while (0)
#else
#define PASS(n, w, ref, run, s, io, ...) run
#endif

#define desk(s, io, k) PASS(1, AB_FRAMES, desk_c, ab_desk(s, io, k, sec[0]), s, io, k)
#define body909(s, out) PASS(2, H, body909_c, ab_body909(s, out), s, out)
#define body808(s, out) PASS(2, AB_FRAMES, body808_c, ab_body808(s, out), s, out)
#define tone808(s, out, y) PASS(2, AB_FRAMES, tone808_c, ab_tone808(s, out, y), s, out, y)
#define trig808(s, y, n) PASS(2, AB_FRAMES, trig808_c, ab_trig808(s, y, n), s, y, n)
#define click909(s, y) PASS(3, H, click909_c, ab_click909(s, y), s, y)
#define noise909(s, y) PASS(4, H, noise909_c, ab_noise909(s, y), s, y)
#endif

/* ---- a voice ---- */

/* The shape scale lR/2 = KL0 + KLE ep - KLM m, set every 16 samples from where the body is */
static int32_t shape_lr(const struct ab_voice *s)
{
    return KL0 + qmul(KLE, s->v.a.ep) - qmul(KLM, s->v.a.m);
}

#define MREST (1 << 15)         /* m below 2^-16: a 909 past NIDLE rests (dsp909.Voice.block) */

void ab_init(struct ab_voice *s, int model)
{
    uint8_t *p = (uint8_t *)s;
    for (unsigned i = 0; i < sizeof *s; i++)
        p[i] = 0;
    s->model = (uint8_t)model;
    s->cnt = CNT_MAX;       /* no hit yet: 808 trigger path retired, 909 at rest */
    if (model == AB_909) {
        s->v.a.lcg = SEED;
        s->v.a.pp = CLK_N;  /* no click table */
    }
}

void ab_trig(struct ab_voice *s)
{
    if (s->model == AB_909) {
        /* the model works the block's shape scale out before the hit, from where the last
         * one left the body; and after a rest the slews start at their targets */
        s->v.a.lr = shape_lr(s);
        if (s->cnt >= NIDLE && s->v.a.m < MREST)   /* at rest (render909 also clears it) */
            s->seeded = 0;
        s->v.a.lcg = SEED;          /* FIXD on: every hit opens identically */
        s->v.a.ep = KEBASE;
        s->v.a.o = 0;
        s->v.a.m = QMAX;
        s->v.a.u = (uint32_t)U0;    /* the phase held at the negative crest until NREL */
        s->v.a.aincb = s->v.a.asinca = 0;
        s->v.a.dkm = DKDROOP;
        s->noise_on = 1;
    } else {
        s->v.b.e = s->v.b.ep = QMAX;
        s->v.b.u = (uint32_t)U8;
        s->v.b.pc = PC0;
        s->v.b.ps = PS0;
        s->v.b.dc = DC0;
    }
    s->cnt = 0;
}

static int32_t ratio_mul(int32_t inc, int32_t ratio) { return sshl(qmul(inc, ratio), 3); }

#define QUIET_STATE (1 << 10)    /* -126 dB of full scale */
static inline int32_t mag(int32_t x) { return x < 0 ? -x : x; }

/* A voice's block settings are worked out again only when its knobs, velocity or pitch
 * change: most blocks reuse them, and skip the per-knob tables' cache refill. */
static int same_knobs(struct ab_voice *s, const struct ab_knobs *k)
{
    const struct ab_knobs *o = &s->set_k;
    if (s->set_ok && o->ptch == k->ptch && o->dcay == k->dcay && o->tone == k->tone && o->atk == k->atk
        && o->swep == k->swep && o->acnt == k->acnt && o->low == k->low && o->high == k->high
        && o->ratio == k->ratio)
        return 1;
    s->set_k.ptch = k->ptch; s->set_k.dcay = k->dcay; s->set_k.tone = k->tone; s->set_k.atk = k->atk;
    s->set_k.swep = k->swep; s->set_k.acnt = k->acnt; s->set_k.low = k->low; s->set_k.high = k->high;
    s->set_k.ratio = k->ratio;
    s->set_ok = 1;
    return 0;
}

enum { S_INCB, S_INCA, S_GDCH, S_GBODY, S_DKP, S_DKD, S_G1, S_G2, S_G3, S_G4, S_GN16 };
enum { S_INC = 0, S_BEND, S_DP, S_DE, S_GAIN, S_KT, S_VEL, S_ATK };
enum { S_GL2 = 14, S_GH = 15 };     /* both models: the desk's LOW and HIGH */

#define COLD __attribute__((noinline, cold))

static void COLD settings909(int32_t *set, const struct ab_knobs *k)
{
    int32_t q = qmul(qmul(T_AP[k->ptch], T_GT[k->tone]), T_GD[k->swep]);
    int32_t vb = T_VB[k->acnt], va = T_VA[k->acnt], atp = T_ATP[k->atk], gp, gs;
    set[S_INCB] = ratio_mul(T_INCB[k->ptch] + KTFB0 + qmul(KTFB, T_GT[k->tone]), k->ratio);
    set[S_INCA] = ratio_mul(qmul(q, KA_INC), k->ratio);
    set[S_GDCH] = qmul(vb, T_THS[(uint32_t)q >> 24]) >> 1;
    set[S_GBODY] = qmul(vb, K_BODY);
    set[S_DKP] = T_DKP[k->tone];
    set[S_DKD] = T_DKD[k->dcay];
    /* the click's gains (dsp909.Voice.click, FIXD on: the base strength KPBASE) */
    gp = qmul(va, atp);
    gs = qmul(va, KGS) + sshl(qmul(gp, KFDR), 2);
    set[S_G1] = -sshl(qmul(KPBASE, gp), 2);
    set[S_G2] = -sshl(qmul(KPBASE, gs), 2);
    set[S_G3] = qmul(set[S_G1], KA1);
    set[S_G4] = qmul(set[S_G1], KB1) + qmul(set[S_G2], KB2);
    set[S_GN16] = qmul(va, KN0X + sshl(qmul(KN1Q, atp), 2));
    set[S_GL2] = T_GL2[k->low];
    set[S_GH] = T_GH[k->high];
}

static void COLD settings808(int32_t *set, const struct ab_knobs *k)
{
    set[S_INC] = ratio_mul(B_INC[k->ptch], k->ratio);
    set[S_BEND] = ratio_mul(sshl(qmul(B_BEND[k->dcay], k->swep << 24), 1), k->ratio);
    set[S_DE] = B_DE[k->dcay];
    set[S_DP] = B_DP[k->dcay];
    set[S_GAIN] = B_GAIN[k->dcay];
    set[S_KT] = B_TONE[k->tone];
    set[S_VEL] = B_VEL[k->acnt];
    set[S_ATK] = B_ATK[k->atk];
    set[S_GL2] = T_GL2[k->low];
    set[S_GH] = T_GH[k->high];
}

/* ENV2 = e2 - e3 16 samples on, with its gain, and the ramp that reaches it */
static void noise_ramp(struct ab_voice *s)
{
    s->v.a.e2n = qmul(s->v.a.e2n, K2B);
    s->v.a.e3n = qmul(s->v.a.e3n, K3B);
    s->v.a.denv = (qmul(s->v.a.gn16, s->v.a.e2n - s->v.a.e3n) - s->v.a.env) >> 4;
}

/* The 909's 16 samples from out: the control the model works out once a block (16 samples
 * on the Octatrack), then the body, the click and the noise. c: the samples since the hit. */
static void half909(struct ab_voice *s, const int32_t *set, int32_t c, int32_t *out)
{
    int32_t gbody = set[S_GBODY];
    if (!s->seeded) {
        s->v.a.sinca = set[S_INCA];
        s->v.a.sgdch = set[S_GDCH];
        s->seeded = 1;
    }
    /* TDEP's depth and the thump move a quarter of the way */
    s->v.a.sinca += (set[S_INCA] - s->v.a.sinca) >> 2;
    s->v.a.sgdch += (set[S_GDCH] - s->v.a.sgdch) >> 2;
    if (c != 0)                     /* at the hit, ab_trig worked it out */
        s->v.a.lr = shape_lr(s);
    if (c >= NREL) {                /* the phase released: the sweep runs */
        s->v.a.aincb = set[S_INCB];
        s->v.a.asinca = s->v.a.sinca;
    }
    if (c >= NHOLD)                 /* the hold over: DECAY */
        s->v.a.dkm = set[S_DKD];
    s->v.a.dkp = set[S_DKP];
    s->v.a.glr = qmul(gbody, s->v.a.lr);
    s->v.a.gk = qmul(gbody, KKF);
    s->v.a.gh = gbody >> 1;
    s->v.a.ngdc = -s->v.a.sgdch;
    noise_ramp(s);
    if (c == DCLK) {                /* the click and the noise gate fire */
        s->v.a.g1 = set[S_G1]; s->v.a.g2 = set[S_G2]; s->v.a.g3 = set[S_G3]; s->v.a.g4 = set[S_G4];
        s->v.a.gn16 = set[S_GN16];
        s->v.a.e1 = s->v.a.e2 = s->v.a.e2n = s->v.a.e3n = QMAX;
        s->v.a.pp = 0;
        s->tails_on = 1;
        noise_ramp(s);
    }
    body909(s, out);
    if (s->tails_on) {
        click909(s, out);
        if (s->v.a.pp < CLK_N)
            s->v.a.pp += H;
        /* the slow modes until they die out (-126 dB) */
        if (s->v.a.pp >= CLK_N && qmul(s->v.a.e1, mag(s->v.a.g3)) <= QUIET_STATE
            && qmul(s->v.a.e2, mag(s->v.a.g4)) <= QUIET_STATE) {
            s->v.a.e1 = s->v.a.e2 = 0;
            s->tails_on = 0;
        }
    }
    /* the noise from the hit until it dies out; the LCG steps on regardless, as FIXD
     * reseeds it at each hit (16 steps at once) */
    if (s->noise_on) {
        noise909(s, out);
        if (c > DCLK && s->v.a.e2n <= QUIET_STATE && mag(s->v.a.env) <= QUIET_STATE) {
            s->v.a.nh = s->v.a.n1 = s->v.a.n2 = s->v.a.env = s->v.a.denv = 0;
            s->v.a.e2n = s->v.a.e3n = 0;
            s->noise_on = 0;
        }
    } else {
        s->v.a.lcg = (s->v.a.lcg * LCG_M16 + LCG_C16) & 0xffffff;
        s->v.a.nprev = (int32_t)(s->v.a.lcg << 8);
    }
}

static void render909(struct ab_voice *s, const struct ab_knobs *k, int32_t *restrict out)
{
    int32_t *set = s->set;
    /* At rest (dsp909.Voice.block): a hit this old whose VCA has closed plays nothing and
     * runs nothing. In Q31 m stops decaying where m dkm truncates to 0 (about 1.3e-5 at
     * DEC 127), above the base's quiet level at a loud hit: without the rest such a hit
     * would never end. The stalled m is always below MREST (2^-16), so the rest comes. */
    if (s->cnt >= NIDLE && s->v.a.m < MREST) {
        for (int i = 0; i < AB_FRAMES; i++)
            out[i] = 0;
        s->seeded = 0;              /* the next hit's slews start at their targets */
        return;
    }
    if (!same_knobs(s, k))
        settings909(set, k);
    desk909_k.gl2 = set[S_GL2]; desk909_k.gh = set[S_GH];
    half909(s, set, s->cnt, out);
    half909(s, set, s->cnt + H, out + H);
    desk(s, out, &desk909_k);
    s->cnt = s->cnt > CNT_MAX - AB_FRAMES ? CNT_MAX : s->cnt + AB_FRAMES;
}

static void render808(struct ab_voice *s, const struct ab_knobs *k, int32_t *restrict out)
{
    struct ab_r808 *r = &ab_r808;
    int32_t *set = s->set;
    int32_t *restrict y = sec_a;
    int32_t cnt = s->cnt;
    if (!same_knobs(s, k))
        settings808(set, k);
    r->inc = set[S_INC]; r->bend = set[S_BEND]; r->dp = set[S_DP]; r->de = set[S_DE]; r->gain = set[S_GAIN];
    r->kt = set[S_KT]; r->vel = set[S_VEL]; r->atk = set[S_ATK];
    desk808_k.gl2 = set[S_GL2]; desk808_k.gh = set[S_GH];
    body808(s, y);
    /* 2. the damped trigger oscillator, until it retires: its sample cnt + i + 1 adds in
     * while it is below RETIRE808 */
    if (cnt < RETIRE808)
        trig808(s, y, RETIRE808 - 1 - cnt < AB_FRAMES ? RETIRE808 - 1 - cnt : AB_FRAMES);
    /* 3. TONE shapes edge and body together, before the clip; ACNT after it; the desk */
    tone808(s, out, y);
    desk(s, out, &desk808_k);
    s->cnt = cnt > CNT_MAX - AB_FRAMES ? CNT_MAX : cnt + AB_FRAMES;
}

void ab_render(struct ab_voice *s, const struct ab_knobs *k, int32_t *out)
{
    if (s->model == AB_909)
        render909(s, k, out);
    else
        render808(s, k, out);
}
