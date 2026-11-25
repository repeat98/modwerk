/* SPDX-License-Identifier: MIT
 * Analog BD's engine (drum.h). The models and their fit are 0.1.7's (fit909.json, tools/tables.ts); 0.2.0 runs them
 * on the ColdFire, block by block, and opens the 909's body after the lead-in its recordings show. */
#if defined(__GNUC__) && !defined(__clang__)
#pragma GCC optimize("O2")      /* the sample loops: -Os spills their ramps to the stack */
#endif
#include "drum.h"
#include "tables.h"

const uint8_t ab_defaults[AB_PARAMS] = {64, 80, 80, 64, 64, 0, 0, 0, 64, 64, 64, 127};

#define BLOCK 16u
#define ONE 0x7fffffffu                 /* 1.0 in Q31, a hair under */
#define REST_M (1u << 15)               /* the 909's envelope under -96 dB: its hit is over */
#define QUIET (1u << 17)                /* a tail (Q31) under -84 dB is left out */
#define QUIET_N (1u << 22)              /* the noise burst under -54 dB of its start: masked by the body, left out */
#define REF_ACNT 72u                    /* the accent the recordings were matched at */
#define INLINE static inline __attribute__((always_inline))

/* x * k / 2^16 for a Q31 state x and a factor k under 2^16: two 16 x 16 products */
INLINE uint32_t mul16(uint16_t a, uint16_t b) { return (uint32_t)a * b; }   /* mulu.w */
INLINE uint32_t mulk(uint32_t x, uint32_t k) { return mul16((uint16_t)(x >> 16), (uint16_t)k) + (mul16((uint16_t)x, (uint16_t)k) >> 16); }
INLINE int32_t smulk(int32_t x, uint32_t k) { return x < 0 ? -(int32_t)mulk((uint32_t)-x, k) : (int32_t)mulk((uint32_t)x, k); }
/* a Q23 gain times a Q31 envelope */
INLINE int32_t tail(int32_t g, uint32_t e) { return smulk(g, e >> 15); }
/* the next random word, and a Q31 amount times it (-amount..amount) */
INLINE int32_t jitter(AbVoice *v, int32_t amount)
{
    v->lcg = v->lcg * 1664525u + 1013904223u;
    return (amount >> 15) * ((int32_t)v->lcg >> 16) >> 1;
}
INLINE int32_t clamp24(int32_t y) { return y > 0x7fffff ? 0x7fffff : y < -0x800000 ? -0x800000 : y; }

void ab_reset(AbVoice *v)
{
    uint8_t *p = (uint8_t *)v;
    for (unsigned i = 0; i < sizeof *v; ++i) p[i] = 0;
    v->lcg = 0x5a5a5bu, v->pp = AB_CLICK_N, v->tp = AB_T808_N, v->kc = 0xffffffffu;
}

/* ---- the 909 ----------------------------------------------------------------------------------------------------- */

static void b9_trig(AbVoice *v, const uint8_t *k)
{
    unsigned atk = k[AB_ATK], fixd = k[AB_FIXD] == 1;   /* FIXD is ON only at its stored 1 (0.1.5 kept ACCNT there) */
    v->fixd = (uint8_t)fixd, v->state = AB_LEAD, v->lead = 0;
    v->ep0 = (uint32_t)(AB9_KEBASE + (fixd ? 0 : jitter(v, AB9_KEJIT)));
    /* the lead-in: its level by Attack, and by accent as the click's (the recordings are ACNT 72's) */
    int32_t gl = 2 * (AB9_LEAD0 + (AB9_LEAD1 - AB9_LEAD0) * (int32_t)atk / 127);
    gl = gl * ab9_va[k[AB_ACNT]] / ab9_va[REF_ACNT];
    if (!fixd) gl += gl * (jitter(v, AB9_LJIT) >> 16) >> 15;
    v->gl = gl;
}

/* The click fires a block after the body opens, as on the recordings: the trigger pulse's response by Attack and
 * accent, its slow discharge's tail, and the noise burst. */
static void b9_click(AbVoice *v, const uint8_t *k)
{
    int32_t va = ab9_va[k[AB_ACNT]], atp = ab9_atp[k[AB_ATK]];
    int32_t j = AB9_KPBASE + (v->fixd ? 0 : jitter(v, AB9_KPJIT));         /* Q31 */
    int32_t gp = va * atp >> 15;                                          /* Q15 */
    int32_t gs = (va * AB9_KGS >> 13) + (4 * gp * AB9_KFDR >> 15);         /* Q15 */
    int32_t j15 = j >> 16;
    v->g1 = -(j15 * gp >> 14);                                             /* -4 j gp, Q14 */
    v->g2 = -(j15 * gs >> 14);
    v->g3 = v->g1 * AB9_KA1 >> 9;                                          /* Q23 */
    v->g4 = (v->g1 * AB9_KB1 + v->g2 * AB9_KB2) >> 6;
    v->gn = 2 * (va * (AB9_KN0X + (4 * AB9_KN1Q * atp >> 15)) >> 15);      /* Q15 */
    v->e1 = v->n2 = v->n3 = ONE, v->e2 = 0;
    v->r += v->g3;                      /* the slow tail is whole at the click's first sample */
    v->pp = 0;
    v->np = v->fixd ? 0 : (uint16_t)((v->lcg >> 8) & (AB_NOISE_N - 1));
}

/* what the knobs ask for: computed again only when one of them moves */
static void b9_knobs(AbVoice *v, const uint8_t *k, uint32_t kc)
{
    unsigned pitch = k[AB_PTCH], tune = k[AB_TUNE], acnt = k[AB_ACNT];
    uint32_t exc = (((ab9_apx[pitch] >> 10) * (uint32_t)ab9_gt[tune] >> 15) * (uint32_t)ab9_gd[k[AB_TDEP]]) >> 5;
    uint32_t qi = (exc >> 16) * AB9_QK >> 16;
    int32_t vb = (int32_t)(acnt * acnt * 2u);                              /* (ACNT/128)^2, Q15 */
    v->kc = kc, v->exc = exc, v->incb = ab9_incb[pitch] + (uint32_t)ab9_tfb[tune];
    v->gdc = vb * ab9_ths[qi > 127u ? 127u : qi] >> 16;
    v->gq = vb * AB9_KBODY >> 15;
    v->loud = (uint8_t)(vb > AB9_LOUD);
}

static void b9_block(AbVoice *v, const uint8_t *k)
{
    if (v->state == AB_LEAD && v->lead >= AB_LEAD_N) {    /* the body opens on the held crest */
        v->state = AB_PLAY, v->blocks = 0;
        v->o = 0, v->m = ONE, v->u = AB9_U0, v->ep = v->ep0;
        v->r += v->gl * ab9_lead[AB_LEAD_N - 1] >> 8;     /* where the lead-in ends (the fall has begun): ramped out */
    }
    unsigned bb = v->blocks, tune = k[AB_TUNE];
    if (v->state == AB_PLAY) {
        if (bb == 1) b9_click(v, k);
        if (v->pp == AB_CLICK_N && !v->e2 && bb > 1)        /* the rows are over: the HP mode's tail goes on from them */
            v->e2 = AB9_E2END, v->r += tail(v->g4, AB9_E2END);
    }
    uint32_t kc = k[AB_PTCH] | (uint32_t)tune << 8 | (uint32_t)k[AB_TDEP] << 16 | (uint32_t)k[AB_ACNT] << 24;
    if (kc != v->kc) b9_knobs(v, k, kc);
    /* the sweep's excursion and the thump it brings, slewed a quarter of the way a block */
    if (!v->warm) v->sinca = (int32_t)v->exc, v->sgdch = v->gdc, v->warm = 1;
    else v->sinca += ((int32_t)v->exc - v->sinca) >> 2, v->sgdch += (v->gdc - v->sgdch) >> 2;

    /* the envelopes a block on */
    uint32_t ep0 = v->ep, ep = mulk(ep0, ab9_kp16[tune]), o = v->o;
    if (o != ONE) o = ONE - mulk(ONE - o, AB9_KA16), o = ONE - o < 64u ? ONE : o;
    uint32_t m = mulk(v->m, bb >= AB9_NHOLDB ? ab9_kd16[k[AB_DCAY]] : AB9_DROOP16);
    uint32_t g = o == ONE ? m : mulk(m, o >> 15);
    uint32_t gm = (v->g >> 1) + (g >> 1);
    uint32_t th = gm + (uint32_t)smulk((int32_t)(v->th - gm), AB9_KTH16);
    v->ep = ep, v->o = o, v->m = m, v->g = g, v->th = th;

    /* the phase: held on the crest until the release, three blocks after the body opens (a retrig's lead-in leaves
     * the sounding body running until its own opens) */
    if (bb >= 3) {
        uint32_t s = (uint32_t)v->sinca >> 11, ie = v->incb + (mulk(ep, s) >> 4);   /* the excursion reaches 2^27 */
        if (bb == 3) v->inc = v->incb + (mulk(ep0, s) >> 4);   /* released: the sweep starts where ep stands */
        v->dinc = (int32_t)(ie - v->inc) >> 4;
    } else v->inc = 0, v->dinc = 0;
    /* the band-limited copy for this block's fastest point, its start: a sweep only falls */
    v->level = (uint16_t)(v->inc > AB9_LEVEL2 ? 2u * AB9_BODY_STRIDE : v->inc > AB9_LEVEL1 ? AB9_BODY_STRIDE : 0u);

    /* the body's gains on its two tables, 2 vb KBODY g lR / 8 and 2 vb KBODY g lF / 2 (Q17), from where the last
     * block left them */
    int32_t e = (int32_t)(ep >> 16), gq = v->gq;
    int32_t lr = AB9_KL0 + (AB9_KLE * e >> 15) - (AB9_KLM * (int32_t)(m >> 16) >> 15), lf = 16384 + (AB9_KKF * e >> 15);
    int32_t a1 = (int32_t)(mulk(g, (uint32_t)(gq * lr >> 15)) >> 15), a2 = (int32_t)(mulk(g, (uint32_t)(gq * lf >> 15)) >> 13);
    if (v->state == AB_LEAD) {          /* the last hit fades out across the lead-in: its phase restarts as the new body opens */
        int32_t left = (int32_t)(AB_LEAD_N - v->lead) / (int32_t)BLOCK;
        a1 = v->a1 / left * (left - 1), a2 = v->a2 / left * (left - 1);
    }
    v->da1 = (a1 - v->a1) >> 4, v->da2 = (a2 - v->a2) >> 4;

    /* thump (2 sgdch th) and the click's tails, Q23 */
    int32_t r = -(int32_t)(mulk(th, (uint32_t)v->sgdch) >> 6);
    if (v->e1 > QUIET) v->e1 = mulk(v->e1, AB9_KPR16), r += tail(v->g3, v->e1);
    if (v->e2 > QUIET) v->e2 = mulk(v->e2, AB9_AHP16), r += tail(v->g4, v->e2);
    if (v->state == AB_LEAD) r = v->r / ((int32_t)(AB_LEAD_N - v->lead) / (int32_t)BLOCK) * ((int32_t)(AB_LEAD_N - v->lead) / (int32_t)BLOCK - 1);
    v->dr = (r - v->r) >> 4;

    /* the noise burst's envelope, gn (e2 - e3), Q23 a block on */
    if (v->state == AB_LEAD)            /* ... and so does a noise burst still sounding */
        v->dne = -v->ne / (int32_t)(AB_LEAD_N - v->lead), v->n2 = v->ne ? v->n2 : 0;
    else if (v->n2 > QUIET_N) {
        v->n2 = mulk(v->n2, AB9_K2B), v->n3 = mulk(v->n3, AB9_K3B);
        v->dne = ((int32_t)(mulk(v->n2 - v->n3, (uint32_t)v->gn) >> 7) - v->ne) >> 4;
    } else v->ne = 0, v->dne = 0, v->n2 = 0;

    if (bb < 0xffffu) v->blocks = (uint16_t)(bb + 1);
    if (v->state == AB_PLAY && bb > AB9_NHOLDB && m < REST_M && !v->ne && v->pp >= AB_CLICK_N)
        v->state = AB_REST, v->warm = 0;
}

/* the body's two tables at phase u, linearly interpolated: CTD in h, CF in l (Q15 times their scales) */
#define TABLES(h, l)                                                                \
    do {                                                                            \
        uint32_t i_ = u >> (32 - AB_BODY_BITS);                                     \
        int32_t f_ = (int32_t)(u >> (17 - AB_BODY_BITS)) & 0x7fff;                  \
        int32_t w0_ = tab[i_], d_ = tab[i_ + 1] - w0_;  /* both halves' steps at once */     \
        h = (w0_ >> 16) + (((d_ >> 16) * f_) >> 15);   /* the low half's borrow: 1 LSB at most */ \
        l = (int16_t)w0_ + (((int16_t)d_ * f_) >> 15);                              \
    } while (0)
/* the body alone, straight to the output: the common case, with an accent that cannot reach full scale */
static void b9_plain(AbVoice *v, uint32_t *lr, unsigned n)
{
    uint32_t u = v->u, inc = v->inc, r = (uint32_t)v->r << 10, dr = (uint32_t)v->dr << 10;
    const int32_t *tab = ab9_body + v->level;
    int32_t dinc = v->dinc, a1 = v->a1, a2 = v->a2, da1 = v->da1, da2 = v->da2;
    for (unsigned i = n; i; --i) {
        int32_t h, l;
        u += inc, inc += (uint32_t)dinc;
        TABLES(h, l);
        uint32_t y = ((uint32_t)(h * a1 + l * a2) << 1) + r;   /* (Q23 << 2) << 8 */
        a1 += da1, a2 += da2, r += dr;
        *lr++ = y, *lr++ = y;
    }
    v->u = u, v->inc = inc, v->a1 = a1, v->a2 = a2, v->r += v->dr * (int32_t)n;
}

/* one sample of the body: the phase, its two tables, the ramps (Q23 in y) */
#define BODY(y)                                                                     \
    u += inc, inc += (uint32_t)dinc;                                                \
    TABLES(bh, bl);                                                                 \
    y = ((bh * a1 + bl * a2) >> 9) + r;                                             \
    a1 += da1, a2 += da2, r += dr
#define OUT(y) s = (uint32_t)clamp24((y) * 4) << 8, *lr++ = s, *lr++ = s

/* with the lead-in, the click or the noise playing, or a loud accent: one pass each, clamped */
static void b9_full(AbVoice *v, uint32_t *lr, unsigned n)
{
    uint32_t u = v->u, inc = v->inc, s;
    const int32_t *tab = ab9_body + v->level;
    int32_t dinc = v->dinc, a1 = v->a1, a2 = v->a2, da1 = v->da1, da2 = v->da2, r = v->r, dr = v->dr, bh, bl, y;
    int32_t ne = v->ne, dne = v->dne;
    unsigned np = v->np;
    if (v->state == AB_LEAD) {                          /* the lead-in, and a body still sounding from the last hit */
        const int16_t *l = ab9_lead + v->lead;
        int32_t gl = v->gl;
        for (unsigned i = 0; i < n; ++i) {
            BODY(y);
            y += (gl * l[i] >> 8) + ((ne >> 8) * ab9_noise[np] >> 9);   /* the lead-in was fitted at the output's x4 */
            ne += dne, np = (np + 1) & (AB_NOISE_N - 1);
            OUT(y);
        }
        v->lead = (uint16_t)(v->lead + n);
    } else if (v->pp < AB_CLICK_N) {                    /* the click and the noise burst */
        const int16_t *c = ab9_click + 2 * v->pp;
        int32_t g1 = v->g1, g2 = v->g2;
        for (; n; --n, c += 2) {
            BODY(y);
            y += ((g1 * c[0] + g2 * c[1]) >> 7) + ((ne >> 8) * ab9_noise[np] >> 9);
            ne += dne, np = (np + 1) & (AB_NOISE_N - 1);
            OUT(y);
        }
        v->pp = (uint16_t)(c - ab9_click) / 2;
    } else if (ne || dne) {                             /* the noise burst's end */
        for (; n; --n) {
            BODY(y);
            y += (ne >> 8) * ab9_noise[np] >> 9;
            ne += dne, np = (np + 1) & (AB_NOISE_N - 1);
            OUT(y);
        }
    } else                                              /* a loud accent */
        for (; n; --n) { BODY(y); OUT(y); }
    v->u = u, v->inc = inc, v->a1 = a1, v->a2 = a2, v->r = r, v->ne = ne, v->np = (uint16_t)np;
}

/* ---- the 808 ----------------------------------------------------------------------------------------------------- */

static void b8_trig(AbVoice *v, const uint8_t *k)
{
    v->fixd = k[AB_FIXD] == 1, v->kc = 0xffffffffu;     /* loud is the 808's now: a 909 hit computes its knobs again */
    v->state = AB_PLAY, v->blocks = 0, v->tp = 0;
    v->m = ONE, v->ep = ONE, v->u = AB8_U0;
    int32_t tg = (int32_t)k[AB_ATK] * 32768 / 127;                          /* ATK / 127, Q15 */
    if (!v->fixd) tg += tg * (jitter(v, AB8_KVJ << 16) >> 16) >> 15;         /* 1 +- 4 % a hit */
    v->tg = tg;
}

static void b8_block(AbVoice *v, const uint8_t *k)
{
    unsigned d = k[AB_DCAY];
    uint32_t bend = ((ab8_bend[d] >> 7) * k[AB_TDEP]) >> 6;
    uint32_t ep0 = v->ep, ep1 = mulk(ep0, ab8_dp16[d]);
    uint32_t i0 = ab8_inc[k[AB_PTCH]] + (mulk(ep0, bend) >> 9), i1 = ab8_inc[k[AB_PTCH]] + (mulk(ep1, bend) >> 9);
    uint32_t e0 = v->m, e1 = mulk(e0, ab8_de16[d]);
    uint32_t gain = (uint32_t)ab8_gain[d];                                    /* gain / 2, Q15 */
    int32_t a0 = (int32_t)(mulk(e0, gain) >> 13), a1 = (int32_t)(mulk(e1, gain) >> 13);   /* e gain, Q17 */
    if (!v->blocks) v->inc = i0, v->a1 = a0;   /* a hit starts at full level, as stock's 808 does; later blocks ramp on */
    v->dinc = (int32_t)(i1 - v->inc) >> 4, v->da1 = (a1 - v->a1) >> 4;
    v->ep = ep1, v->m = e1;
    /* the body alone stays under full scale once 4 e gain (1.03 its peak) is under 1 */
    v->loud = (uint8_t)(v->tp < AB_T808_N || a0 > (1 << 17) / 5 || v->tf > (1 << 21) || v->tf < -(1 << 21));
    if (v->blocks < 0xffffu) ++v->blocks;
    if (e1 < REST_M && v->tp >= AB_T808_N && v->tf < 256 && v->tf > -256) v->state = AB_REST;
}

/* the 808's body at phase u, linearly interpolated, Q15 */
INLINE int32_t body8(uint32_t u)
{
    const int16_t *p = ab8_body + (u >> (32 - AB_BODY_BITS));
    return p[0] + (((p[1] - p[0]) * ((int32_t)(u >> (17 - AB_BODY_BITS)) & 0x7fff)) >> 15);
}

static void b8_run(AbVoice *v, const uint8_t *k, uint32_t *lr, unsigned n)
{
    uint32_t u = v->u, inc = v->inc;
    int32_t dinc = v->dinc, a = v->a1, da = v->da1, tf = v->tf;
    int32_t kt = ab8_tone[k[AB_TUNE]];
    int32_t vt = (int32_t)(k[AB_ACNT] ? k[AB_ACNT] : 1) * 258 * AB8_TRIM >> 15;    /* ACNT / 127 * trim, Q15 */
    if (v->loud) {
        unsigned tp = v->tp;
        for (; n; --n) {
            u += inc, inc += (uint32_t)dinc;
            int32_t y = body8(u) * a >> 8;
            a += da;
            if (tp < AB_T808_N) y += v->tg * ab8_t808[tp++] >> 6;
            tf += kt * ((y - tf) >> 8) >> 7;
            uint32_t s = (uint32_t)((clamp24(tf * 4) >> 8) * vt) << 1;
            *lr++ = s, *lr++ = s;
        }
        v->tp = (uint16_t)tp;
    } else
        for (; n; --n) {
            u += inc, inc += (uint32_t)dinc;
            int32_t y = body8(u) * a >> 8;
            a += da;
            tf += kt * ((y - tf) >> 8) >> 7;
            uint32_t s = (uint32_t)((tf >> 6) * vt) << 1;
            *lr++ = s, *lr++ = s;
        }
    v->u = u, v->inc = inc, v->a1 = a, v->tf = tf;
}

/* ---- both ---------------------------------------------------------------------------------------------------------- */

void ab_render(AbVoice *v, const uint8_t *k, int trig, uint32_t *lr, unsigned n)
{
    if (trig) {
        v->model = k[AB_TYPE] != 0;     /* the hit plays its model to its end; TYPE takes effect at the next */
        if (v->model) b9_trig(v, k);
        else b8_trig(v, k);
        v->left = 0;                    /* the voice's blocks start at its trig */
    }
    while (n) {
        if (v->state == AB_REST) {
            for (n *= 2; n; --n) *lr++ = 0;
            return;
        }
        if (!v->left) {
            if (v->model) b9_block(v, k);
            else b8_block(v, k);
            v->left = BLOCK;
        }
        unsigned run = n < v->left ? n : v->left;
        if (!v->model) b8_run(v, k, lr, run);
        else if (v->state == AB_LEAD || v->pp < AB_CLICK_N || v->ne || v->loud) b9_full(v, lr, run);
        else b9_plain(v, lr, run);
        v->left = (uint16_t)(v->left - run), n -= run, lr += 2 * run;
    }
}
