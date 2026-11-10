/* Mixer Mode engine: replaces the stock slot loop (mixer.S engine stub calls
 * engine_run, then goes on at the stock post mix). The stock loop calls slots
 * 0-5 in order on one shared stereo buffer F (16 floats, LLLLLLLL RRRRRRRR);
 * effects work in place. F is changed by content, never by pointer: two OS
 * slot functions hard-code it. Signal flow (docs/dev/v2.0-brief.md):
 *   IN       F x Input Level (Split: Input L on L, Input R on R)
 *   PRE      the PRE slots
 *   [ROUTE]  Serial: the other slots in order, no [MIX].
 *            Mono Serial: L = R = (L + R) / 2, then as Serial.
 *            Parallel: S = F, bus A gets SendA x BusA x S, bus B SendB x BusB x S.
 *            Split: bus A gets BusA x S left on both sides, bus B BusB x S right.
 *   [MIX]    Stereo / Mono: F = cA x A + cB x B (crossfade curve x Mix level,
 *            Mute / Solo, Phase B), Mono then sums L + R.
 *            Split: L = A summed, R = B summed, no crossfade.
 *   POST     the POST slots
 *   OUT      x Master (Output Split: Master L / Master R), then the limiter.
 * Gains are recomputed every block and smoothed (g += (target - g) / 4), so
 * knob and CC moves don't step. No RTS: no float division, no libc. */
#include "chain.h"

void perf_block(void);          /* asm/perform/perform_engine.c: the Perform moves land first */

/* DIAGNOSTICS (asm/diag/diag.h): cycles of perf_block and of each slot this block,
 * handed to diag_end with the block's start time when the diag section is loaded. */
extern __cregister volatile unsigned int TSCL;
#define DIAG_MAGIC (*(volatile unsigned *)0xC00F3128)
#define DIAG_END ((void (*)(unsigned, unsigned *))0xC00F3100)
#define MS_ON (*(volatile int *)0xC010A020)     /* MASTER screen open (asm/master/master_vec.asm) */
#define MS_TAP ((void (*)(unsigned))0xC010A000) /* copies this block for it (t0: the block's start, for its CPU) */
static unsigned dg_cyc[7];      /* [0] perf_block, [1 + s] slot s (diag_end clears them) */

#define F ((float *)0x11F03738)         /* ctx[5], the chain signal */
#define S ((float *)0x11F03B80)         /* split copy (free L1D, M0) */
#define A ((float *)0x11F03BC0)         /* bus A result */
#define FX_TABLE ((void (*const *)(void *))0xC00EE930)  /* audio function of each slot */
#define STATE0 0x11F03000u              /* slot state blocks, 212 B each */
#define SLOT_VAR (*(volatile int *)(0xC00EF748 + 576))  /* B14+576: slot being run */
#define LIMHIT (*(volatile unsigned char *)(MIXER_BASE + 77))
#define MASTER_G (*(float *)(MIXER_BASE + 72))
#define G ((float *)(MIXER_BASE + 144)) /* GAINS: In, SendA, SendB, cA, cB, limiter, InR, MasterR */
#define G_IN 0
#define G_A 1
#define G_B 2
#define G_CA 3
#define G_CB 4
#define G_LIM 5
#define G_INR 6
#define G_MR 7

static inline float pct(int s) { return LIVE[s] * 0.01f; }
static inline float min1(float x) { return x > 1.0f ? 1.0f : x; }
static inline float eqp(float t) { return t * (1.5f - 0.5f * t * t); }     /* about sin(pi t / 2) */
static inline void sm(float *g, float t) { *g += (t - *g) * 0.25f; }

/* Every slot whose bus is `bus` (all slots when mask is 0), in slot order. */
static void run(int bus, int mask)
{
    int s;
    for (s = 0; s < 6; s++)
        if ((LAYOUT[s] & mask) == bus) {
            unsigned t = TSCL;
            SLOT_VAR = s;
            FX_TABLE[s]((void *)(STATE0 + 212 * s));
            dg_cyc[1 + s] += TSCL - t;
        }
}

static void gain2(float *f, float l, float r)
{
    int i;
    for (i = 0; i < 8; i++) {
        f[i] *= l;
        f[i + 8] *= r;
    }
}

static void mono(float *f)
{
    int i;
    for (i = 0; i < 8; i++)
        f[i] = f[i + 8] = (f[i] + f[i + 8]) * 0.5f;
}

/* F = g x src, with Split taking one side of src onto both (side 0 L, 8 R). */
static void feed(const float *src, float g, int split, int side)
{
    int i;
    for (i = 0; i < 16; i++)
        F[i] = g * src[split ? side + (i & 7) : i];
}

/* Safety limiter on F: the gain drops at once so the block peak stays at
 * 0.98, then climbs back by 0.001 per block (1 -> 0.5 -> 1 in about 90 ms).
 * ponytail: block-rate peak, no lookahead: a jump inside one block is cut a
 * block late (out_to_int still clips at +-1.0). */
static void limit(void)
{
    float peak = 0.0f, g = G[G_LIM], r;
    int i;
    for (i = 0; i < 16; i++) {
        float a = F[i] < 0.0f ? -F[i] : F[i];
        if (!(a <= 1e30f))              /* NaN or Inf (a stock delay reading stale arena data, pack #41): silence, not a stuck output */
            F[i] = a = 0.0f;
        if (a > peak)
            peak = a;
    }
    if (peak * g > 0.98f) {
        r = _rcpsp(peak);
        r = r * (2.0f - peak * r);      /* one Newton step */
        g = 0.98f * r;
        LIMHIT = 1;
    } else {
        g += 0.001f;
        if (g > 1.0f)
            g = 1.0f;
    }
    G[G_LIM] = g;
    for (i = 0; i < 16; i++)
        F[i] *= g;
}

void engine_run(void)
{
    int mode, par, out, i;
    float x, xa, xb, ma, mb;
    unsigned t0 = TSCL;

    perf_block();
    dg_cyc[0] = TSCL - t0;
    mode = eff_mode(); par = mode == 1 || mode == 2; out = LIVE[S_OUT];
    sm(&G[G_IN], pct(S_IN));
    sm(&G[G_INR], pct(mode == 2 ? S_INR : S_IN));
    gain2(F, G[G_IN], G[G_INR]);

    if (!par) {
        if (mode == 3) {
            run(PRE, 3);
            mono(F);
            run(BUS_A, 3);
            run(BUS_B, 3);
            run(POST, 3);
        } else
            run(PRE, 0);                /* Serial: every slot, in slot order */
    } else {
        /* [ROUTE] */
        x = pct(S_SEND);
        xa = mode == 2 ? 1.0f : min1(2.0f - 2.0f * x);
        xb = mode == 2 ? 1.0f : min1(2.0f * x);
        sm(&G[G_A], xa * pct(S_RA));
        sm(&G[G_B], xb * pct(S_RB));
        /* [MIX]: crossfade (Split output: none), Mix level, Mute / Solo, Phase B */
        x = pct(S_XF);
        if (out == 2)
            xa = xb = 1.0f;
        else if (LIVE[S_CURVE] == 2) {          /* Cut: a bus drops only at its far end */
            xa = LIVE[S_XF] == 100 ? 0.0f : 1.0f;
            xb = LIVE[S_XF] == 0 ? 0.0f : 1.0f;
        } else if (LIVE[S_CURVE] == 0) {        /* Smooth: equal power */
            xa = eqp(1.0f - x);
            xb = eqp(x);
        } else {                                /* DJ: both full at the centre */
            xa = min1(2.0f - 2.0f * x);
            xb = min1(2.0f * x);
        }
        if (LIVE[S_SOLO]) {                     /* Solo overrides Mute */
            ma = LIVE[S_SOLO] == 1;
            mb = LIVE[S_SOLO] == 2;
        } else {
            ma = !LIVE[S_MUTEA];
            mb = !LIVE[S_MUTEB];
        }
        sm(&G[G_CA], xa * ma * pct(S_MA));
        sm(&G[G_CB], (LIVE[S_PHASE] ? -xb : xb) * mb * pct(S_MB));

        run(PRE, 3);
        for (i = 0; i < 16; i++)
            S[i] = F[i];
        feed(S, G[G_A], mode == 2, 0);
        run(BUS_A, 3);
        for (i = 0; i < 16; i++)
            A[i] = F[i];
        feed(S, G[G_B], mode == 2, 8);
        run(BUS_B, 3);
        if (out == 2)                           /* Split: A -> L, B -> R */
            for (i = 0; i < 8; i++) {
                float b = F[i] + F[i + 8];
                F[i] = G[G_CA] * (A[i] + A[i + 8]) * 0.5f;
                F[i + 8] = G[G_CB] * b * 0.5f;
            }
        else {
            for (i = 0; i < 16; i++)
                F[i] = G[G_CA] * A[i] + G[G_CB] * F[i];
            if (out == 1)
                mono(F);
        }
        run(POST, 3);
    }

    sm(&MASTER_G, pct(S_MASTER));
    sm(&G[G_MR], pct(par && out == 2 ? S_MR : S_MASTER));
    gain2(F, MASTER_G, G[G_MR]);
    limit();
    if (MS_ON)
        MS_TAP(t0);
    if (DIAG_MAGIC == 0x47414944u)      /* "DIAG" */
        DIAG_END(t0, dg_cyc);
}
