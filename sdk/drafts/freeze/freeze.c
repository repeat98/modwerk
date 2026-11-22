/* Freeze engine: see freeze.h and README.md. Original Modwerk code (MIT).
 *
 * The idea in one paragraph: while Freeze is not holding, the track's dry
 * signal passes untouched and is written to the track's delay ring. GRAB, at
 * the track's next step, stops writing (the ring's own frames are written back
 * so history survives) and starts a tape head reading the held audio at SPIN
 * (0.25x..1.0x, slower and lower). Every N track steps the head goes back to
 * the start of the loop. The return is a crossfade from the running head into
 * a second head that has been reading the audio just before the loop start,
 * timed to arrive at the start exactly when the N-step cycle ends, so the
 * audible period is N track steps. Cycles restart on the track's own steps,
 * read from its sequencer tick, so they follow tempo, track speed and swing.
 * POSITION slews the read point back through the held audio like a scrubbed
 * tape; JTR adds a bounded, slow wander of the read point and a small drift of
 * each cycle's start. Neither changes the period. */
#include "freeze.h"

#define FZ_HALF 32768

static const uint16_t fz_spin[128] = {
    4096,4141,4186,4231,4277,4324,4371,4419,4467,4515,4565,4614,4664,4715,4767,4819,
    4871,4924,4978,5032,5087,5142,5198,5255,5312,5370,5428,5487,5547,5607,5668,5730,
    5793,5856,5919,5984,6049,6115,6182,6249,6317,6386,6455,6526,6597,6668,6741,6814,
    6889,6964,7039,7116,7194,7272,7351,7431,7512,7594,7677,7760,7845,7930,8016,8104,
    8192,8283,8374,8467,8561,8655,8751,8848,8946,9045,9145,9246,9348,9452,9556,9662,
    9769,9877,9986,10097,10208,10321,10435,10551,10668,10786,10905,11026,11148,11271,11396,11522,
    11649,11778,11908,12040,12173,12308,12444,12582,12721,12862,13004,13148,13293,13440,13589,13739,
    13891,14045,14200,14358,14516,14677,14839,15004,15170,15337,15507,15679,15852,16027,16205,16384,
};

uint32_t freeze_spin_q14(unsigned value) { return fz_spin[value > 127 ? 127 : value]; }

uint32_t freeze_step_q4(uint32_t tempo24, unsigned scale_index) {
    static const uint8_t scales[7] = {3, 4, 6, 8, 12, 24, 48};
    unsigned scale = scales[scale_index < 7 ? scale_index : 2];
    if (tempo24 < 720) tempo24 = 720;      /* 30 BPM */
    if (tempo24 > 7200) tempo24 = 7200;    /* 300 BPM */
    /* One 1x step is 44100 * 60 / (BPM * 4) = 2,646,000 * 6 / tempo24 samples;
     * x16 and the scale: at most 2,646,000 * 48 * 16 / 720 = 2,822,400. */
    return 2646000u * 16u / tempo24 * scale;
}

/* x * g / 32768 for 0 <= g <= 32768, exact for every 32-bit x, in 32-bit
 * multiplies only (no 64-bit runtime call on the ColdFire). */
static int32_t mulq15(int32_t x, int32_t g) {
    int32_t hi = (x >> 16) * g * 2;
    uint32_t lo = ((uint32_t)x & 0xffffu) * (uint32_t)g;
    return hi + (int32_t)(lo >> 15);
}

static int32_t clamp64(int64_t v) {
    if (v > 0x7fffffffLL) return 0x7fffffff;
    if (v < -0x7fffffffLL - 1) return (int32_t)0x80000000u;
    return (int32_t)v;
}

/* a + (b - a) * f / 2^14, the halving keeps b - a inside 32 bits. */
static int32_t lerp(int32_t a, int32_t b, uint32_t f14) {
    /* The true result lies between a and b, but 2 * m alone can pass the
     * int32 range (a = INT32_MIN, b = INT32_MAX): add in modulo-2^32
     * arithmetic, whose wrapped result is exactly the in-range value. */
    int32_t m = mulq15((b >> 1) - (a >> 1), (int32_t)(f14 << 1));
    return (int32_t)((uint32_t)a + ((uint32_t)m << 1));
}

static uint32_t rand32(FzState *s) {
    uint32_t x = s->rng;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return s->rng = x;
}

/* Equal-power-like crossfade curve (3x - x^3) / 2 on Q15; at 0.5 it gives
 * 0.6875, so two uncorrelated heads dip 0.24 dB in the middle of a seam. */
static int32_t seam_curve(uint32_t x) {
    if (x >= FZ_HALF) return FZ_HALF;
    uint32_t x3 = ((x * x) >> 15) * x >> 15;
    return (int32_t)((3u * x - x3) >> 1);
}

/* Parabolic sine of a 32-bit phase, Q15. */
static int32_t slow_sine(uint32_t phase) {
    uint32_t h = (phase >> 16) & 0x7fffu;            /* 0..32767 in the half */
    int32_t y = (int32_t)((h * (32768u - h)) >> 13);  /* 0..32768 */
    return (phase & 0x80000000u) ? -y : y;
}

static void read_frame(const volatile int32_t *ring, uint32_t anchor, uint32_t age,
                       int32_t *l, int32_t *r) {
    uint32_t i = age >> FZ_Q, f = age & (FZ_ONE - 1);
    uint32_t a = anchor + FZ_RING - 1u - i;           /* age i: the newer frame */
    if (a >= FZ_RING) a -= FZ_RING;
    uint32_t b = a ? a - 1u : FZ_RING - 1u;           /* age i + 1, older */
    *l = lerp(ring[2 * a], ring[2 * b], f);
    *r = lerp(ring[2 * a + 1], ring[2 * b + 1], f);
}

static uint32_t fade_samples(unsigned fade) { return 256u + 3u * fade * fade; }

/* JTR's largest wander, Q14 frames: 6.5 ms at 1.0x, scaled with the rate so
 * the pitch wander is the same fraction (about 1.2 %) at every SPIN. */
static uint32_t jitter_q14(unsigned jitter, uint32_t spin) {
    return (288u * jitter / 127u) * spin;
}

/* Plans a cycle: its period, seam, the most SPIN the held audio allows, and
 * where on the young edge a cycle may start. */
static void plan_cycle(FzState *s, const FzParams *p, const FzGrid *g, uint32_t want_spin) {
    unsigned steps = p->step < FZ_MAX_STEPS ? p->step + 1u : FZ_MAX_STEPS;
    uint32_t step = g->step_q4 >> 4;
    if (step < 64) step = 64;
    s->cycle_steps = (uint8_t)steps;
    s->period = step * steps;
    s->seam_len = s->period * (p->seam + 1u) >> 8;
    if (s->seam_len < 256) s->seam_len = 256;
    if (s->seam_len > s->period / 2) s->seam_len = s->period / 2;
    if (s->seam_len > 65536u) s->seam_len = 65536u;
    /* Everything a cycle consumes grows with the rate: the loop itself, a
     * step of slack for a late (swung) step, the seam's pre-roll and JTR's
     * start drift. JTR's wander and the two guards do not. */
    uint32_t jmax = 288u * p->jitter / 127u;
    uint32_t fixed = 2u * FZ_GUARD + 2u * jmax + 2u;
    uint32_t denom = s->period + step + s->seam_len + s->period / 4u * p->jitter / 127u;
    uint32_t cap = s->avail > fixed ? ((s->avail - fixed) << FZ_Q) / denom : 0;
    s->spin_cap = cap;
    uint32_t sp = want_spin > s->spin ? want_spin : s->spin;  /* a glide may still be faster */
    if (sp > cap) sp = cap;
    s->base_min = (FZ_GUARD << FZ_Q) + jitter_q14(p->jitter, sp) * 2u
                + sp * (s->period + step);
    s->reserve_old = (FZ_GUARD << FZ_Q) + jitter_q14(p->jitter, sp) * 2u
                   + sp * s->seam_len + sp * (s->period / 4u * p->jitter / 127u);
}

static uint32_t pos_range(const FzState *s) {
    uint32_t top = s->avail << FZ_Q;
    uint32_t used = s->base_min + s->reserve_old;
    return top > used ? top - used : 0;
}

/* The running head fades out; a new head starts `pre` samples before the
 * cycle's end at the matching distance before the new start, so it reaches
 * the start when the cycle ends. */
static void start_seam(FzState *s, const FzParams *p, uint32_t pre) {
    uint32_t sp = s->spin;
    uint32_t drift_max = sp * (s->period / 4u * p->jitter / 127u);
    uint32_t drift = (rand32(s) >> 16) * (drift_max >> 16);   /* 0..drift_max */
    uint32_t start = s->base_min + drift + sp * pre;
    uint32_t len = pre > 512 ? pre : 512;
    if (len > 65536u) len = 65536u;            /* keeps the gain ramp in 32 bits */
    FzHead *old = &s->head[s->main_head];
    FzHead *nu = &s->head[s->main_head ^ 1u];
    if (old->active) { old->fading_out = 1; old->fade_pos = 0; old->fade_len = len; }
    nu->active = 1; nu->fading_out = 0; nu->fade_pos = 0; nu->fade_len = len;
    nu->age = start; nu->gain = 0;
    s->main_head ^= 1u;
    s->seamed = 1;
}

static void begin_cycle(FzState *s, const FzParams *p, const FzGrid *g, uint32_t want) {
    plan_cycle(s, p, g, want);
    if (s->spin > s->spin_cap) s->spin = s->spin_cap;
    s->t = 0;
    s->steps_in_cycle = 0;
    s->seamed = 0;
}

static void clear(FzState *s, unsigned tick, unsigned running, uint32_t identity) {
    uint32_t *w = (uint32_t *)s;
    for (unsigned i = 0; i < sizeof(*s) / 4u; ++i) w[i] = 0;
    s->active = 1;
    s->rng = 0x6d2b79f5u ^ (0x9e3779b9u * (identity + 1u));
    s->lfo = identity * 0x20000000u;
    s->prev_tick = (uint8_t)tick;
    s->prev_running = (uint8_t)running;
}

static void start_hold(FzState *s, const FzParams *p, const FzGrid *g, uint32_t write, uint32_t want) {
    s->anchor = write;
    s->avail = s->valid;
    s->head[0].active = s->head[1].active = 0;
    s->spin = want;
    begin_cycle(s, p, g, want);
    s->pos_off = s->pos_target = (pos_range(s) / 127u) * p->position;
    /* The first head starts exactly at the cycle start: no seam to cross. */
    FzHead *h = &s->head[0];
    h->active = 1; h->fading_out = 0; h->fade_pos = h->fade_len = 0;
    h->gain = FZ_HALF; h->age = s->base_min;
    s->main_head = 0;
    s->seamed = 0;
    s->held = 1;
    s->armed_grab = 0;
    s->env_target = 1u << 30;
}

void freeze_process(FzState *s, const FzParams *p, const FzGrid *g,
                    const volatile int32_t *ring, uint32_t write,
                    int32_t *audio, int32_t *record) {
    if (!s->active) clear(s, g->tick, g->running, write / FZ_FRAMES);
    if (write > FZ_RING - FZ_FRAMES) write = 0;
    uint32_t want = freeze_spin_q14(p->spin);
    unsigned mix = p->mix > 127 ? 127 : p->mix;
    int32_t mix_q15 = mix == 127 ? FZ_HALF : (int32_t)(mix * 258u);

    if (p->fade != s->fade_param || !s->env_step) {
        s->fade_param = p->fade;
        s->env_step = (1u << 30) / fade_samples(p->fade > 127 ? 127 : p->fade);
    }

    /* The track's step: its tick reaching 1, once per track step. */
    unsigned boundary = g->running && g->tick == 1 && s->prev_tick != 1;
    s->prev_tick = g->tick;
    s->prev_running = g->running;
    unsigned grab = p->grab != 0;

    if (!g->running) {
        /* STOP returns to dry: the hold ends and fades out. */
        s->held = 0; s->armed_grab = 0; s->env_target = 0;
    } else if (boundary) {
        if (grab && !s->held) {
            if (s->env) {                    /* still fading out: catch it again */
                s->held = 1; s->env_target = 1u << 30;
            } else if (s->valid >= 4096u) {
                start_hold(s, p, g, write, want);
                boundary = 0;                /* the grab step starts cycle one */
            } else {
                s->armed_grab = 1;           /* not enough audio yet: next step */
            }
        } else if (!grab && s->held) {
            s->held = 0; s->env_target = 0;
        }
    }
    unsigned playing = s->held || s->env;

    if (playing) {
        if (boundary) {
            ++s->steps_in_cycle;
            if (s->steps_in_cycle >= s->cycle_steps) {
                if (!s->seamed) start_seam(s, p, 0);
                ++s->cycles;
                begin_cycle(s, p, g, want);
            }
        } else if (s->t > s->period + (g->step_q4 >> 4)) {
            /* No step came for a step past the cycle's end (STOP while
             * fading out): keep the head inside the audio. */
            if (!s->seamed) start_seam(s, p, 0);
            begin_cycle(s, p, g, want);
        }
        /* Rate glide: a SPIN move slides the tape like a motor. */
        uint32_t target = want < s->spin_cap ? want : s->spin_cap;
        int32_t dsp = ((int32_t)target - (int32_t)s->spin) / 64;
        if (!dsp && target != s->spin) dsp = target > s->spin ? 1 : -1;
        s->spin = (uint32_t)((int32_t)s->spin + dsp);
        if (!s->seamed && s->t + FZ_FRAMES > s->period - s->seam_len) {
            uint32_t pre = s->period > s->t ? s->period - s->t : 0;
            start_seam(s, p, pre);
        }
    }

    /* Offsets shared by both heads: POSITION slews (a scrub, at most 1/8 of
     * the rate per sample) and JTR wanders slowly. */
    uint32_t off0 = s->pos_off + s->jit_off;
    if (playing) {
        uint32_t range = pos_range(s);
        uint32_t ptarget = (range / 127u) * (p->position > 127 ? 127 : p->position);
        /* Q14 ages reach 2.89e9: work in unsigned distances, never int32. */
        uint32_t lim = s->spin * 2u;               /* at most 32,768 a block */
        if (s->pos_off > range) s->pos_off = range;
        if (ptarget > s->pos_off) {
            uint32_t d = ptarget - s->pos_off, move = d / 32u;
            if (!move) move = 1;
            if (move > lim) move = lim;
            s->pos_off += move;
        } else if (ptarget < s->pos_off) {
            uint32_t d = s->pos_off - ptarget, move = d / 32u;
            if (!move) move = 1;
            if (move > lim) move = lim;
            s->pos_off -= move;
        }
        s->lfo += 483068u;                       /* 0.31 Hz in blocks */
        if (++s->cell_clock >= 2048u) {          /* a new random value every 0.74 s */
            s->cell_clock = 0;
            s->cell_from = s->cell_to;
            s->cell_to = (int32_t)(rand32(s) >> 17) - 16384;  /* Q15 -0.5..0.5 */
            s->cell_to *= 2;
        }
        uint32_t x = s->cell_clock << 4;                     /* Q15 */
        uint32_t ss = (x * x >> 15) * (3u * 32768u - 2u * x) >> 15;  /* smoothstep */
        int32_t rnd = s->cell_from + (((s->cell_to - s->cell_from) >> 1) * (int32_t)ss >> 14);
        int32_t v = (13107 * slow_sine(s->lfo) + 19661 * rnd) >> 15; /* -1..1 */
        uint32_t jmax = jitter_q14(p->jitter, s->spin);
        s->jit_off = ((jmax >> 8) * (uint32_t)(32768 + v)) >> 7;
    }
    uint32_t off1 = s->pos_off + s->jit_off;
    /* A block's offset change is bounded (POSITION 32,768 + JTR's slow
     * wander), so the signed per-sample step is small; the walk itself is
     * done modulo 2^32 and lands on off1. */
    uint32_t dabs = off1 >= off0 ? off1 - off0 : off0 - off1;
    uint32_t dstep = dabs / FZ_FRAMES;
    uint32_t doff = off1 >= off0 ? dstep : 0u - dstep;

    /* Record: the dry input, or while holding, the ring's own frames. */
    unsigned preserve = s->held || s->env;
    if (preserve) {
        for (unsigned i = 0; i < 2u * FZ_FRAMES; ++i) record[i] = ring[2u * write + i];
    } else {
        for (unsigned i = 0; i < 2u * FZ_FRAMES; ++i) record[i] = audio[i];
        s->valid += FZ_FRAMES;
        if (s->valid > FZ_RING - 2u * FZ_GUARD) s->valid = FZ_RING - 2u * FZ_GUARD;
    }

    if (!playing && !s->env_target) return;      /* exact dry */

    /* Head gains at this block's edges. */
    int32_t g0[2], gs[2];
    for (unsigned h = 0; h < 2; ++h) {
        FzHead *hd = &s->head[h];
        if (!hd->active) { g0[h] = gs[h] = 0; continue; }
        if (!hd->fade_len) { g0[h] = FZ_HALF; gs[h] = 0; continue; }
        uint32_t a = hd->fade_pos, b = a + FZ_FRAMES;
        if (b > hd->fade_len) b = hd->fade_len;
        uint32_t xa = a * 32768u / hd->fade_len;  /* fade_len <= 65536 */
        uint32_t xb = b * 32768u / hd->fade_len;
        int32_t ga = seam_curve(xa), gb = seam_curve(xb);
        if (hd->fading_out) { ga = seam_curve(FZ_HALF - xa); gb = seam_curve(FZ_HALF - xb); }
        g0[h] = ga; gs[h] = (gb - ga) / (int32_t)FZ_FRAMES;
    }

    uint32_t lo = FZ_GUARD << FZ_Q;
    uint32_t hi = s->avail > FZ_GUARD ? (s->avail - FZ_GUARD) << FZ_Q : lo;
    uint32_t off = off0;
    for (unsigned i = 0; i < FZ_FRAMES; ++i) {
        int64_t wl = 0, wr = 0;
        for (unsigned h = 0; h < 2; ++h) {
            FzHead *hd = &s->head[h];
            if (!hd->active) continue;
            uint32_t age = hd->age + off;
            if (age < hd->age) age = hi;            /* wrapped: past the old edge */
            if (age < lo) age = lo;
            if (age > hi) age = hi;
            int32_t l, r;
            read_frame(ring, s->anchor, age, &l, &r);
            int32_t gain = g0[h] + gs[h] * (int32_t)i;
            if (gain < 0) gain = 0;
            if (gain > FZ_HALF) gain = FZ_HALF;
            wl += mulq15(l, gain);
            wr += mulq15(r, gain);
            hd->age = hd->age > s->spin + lo ? hd->age - s->spin : lo;
        }
        off += doff;
        /* Wet envelope, per sample. */
        if (s->env < s->env_target) {
            s->env = s->env_target - s->env > s->env_step ? s->env + s->env_step : s->env_target;
        } else if (s->env > s->env_target) {
            s->env = s->env - s->env_target > s->env_step ? s->env - s->env_step : s->env_target;
        }
        int32_t w = mulq15((int32_t)(s->env >> 15), mix_q15);   /* Q15 wet amount */
        int32_t dl = audio[2 * i], dr = audio[2 * i + 1];
        audio[2 * i] = clamp64((int64_t)mulq15(dl, FZ_HALF - w) + mulq15(clamp64(wl), w));
        audio[2 * i + 1] = clamp64((int64_t)mulq15(dr, FZ_HALF - w) + mulq15(clamp64(wr), w));
    }
    for (unsigned h = 0; h < 2; ++h) {
        FzHead *hd = &s->head[h];
        if (!hd->active || !hd->fade_len) continue;
        hd->fade_pos += FZ_FRAMES;
        if (hd->fade_pos >= hd->fade_len) {
            if (hd->fading_out) hd->active = 0;
            else { hd->fade_len = 0; hd->gain = FZ_HALF; }
        }
    }
    s->t += FZ_FRAMES;
    if (!s->held && !s->env) {
        /* Release finished: drop the heads, record again from here. */
        s->head[0].active = s->head[1].active = 0;
        s->valid = 0;
    }
}
