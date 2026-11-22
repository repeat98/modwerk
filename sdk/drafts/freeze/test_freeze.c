/* Host tests for the Freeze engine (freeze.c). Build and run:
 *   cc -std=c99 -O2 -Wall -Wextra -fsanitize=undefined,address -fno-sanitize-recover=all test_freeze.c -lm -o test_freeze && ./test_freeze [out.wav]
 * verify.py does exactly this. The harness models what the adapter will
 * hand the engine: a track ring written 16 frames a block like the stock DMA,
 * and a track sequencer whose tick byte reaches 1 once per track step (swing
 * delays that moment on the swung steps). Floating point is used here only,
 * for analysis; the engine has none. */
/* Included, not linked, so the tests reach the engine's static helpers. */
#include "freeze.c"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SR 44100.0
#define FS 2147483648.0
static int failures, checks;
#define CHECK(cond, ...) do { ++checks; if (!(cond)) { ++failures; printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

/* ---- a simulated track ------------------------------------------------- */
typedef struct {
    FzState st;
    FzParams p;
    int32_t *ring;
    uint32_t write;
    double bpm;
    unsigned scale;            /* index 0..6 */
    double swing;              /* 0..0.3 of a step: delay of odd (0-based) steps */
    unsigned running;
    double clock;              /* samples since PLAY */
    long steps_seen;           /* track steps whose tick 1 has happened */
} Track;

static const unsigned ticks_per_step[7] = {3, 4, 6, 8, 12, 24, 48};
static const double speed_mult[7] = {2.0, 1.5, 1.0, 0.75, 0.5, 0.25, 0.125};

static double step_samples(const Track *t) { return SR * 60.0 / (t->bpm * 4.0) / speed_mult[t->scale]; }

static void track_init(Track *t, double bpm, unsigned step_value) {
    memset(t, 0, sizeof *t);
    t->ring = calloc(2 * FZ_RING, sizeof(int32_t));
    t->bpm = bpm; t->scale = 2; t->running = 1;
    t->p.step = (uint8_t)step_value; t->p.spin = 64; t->p.jitter = 0; t->p.position = 0;
    t->p.grab = 0; t->p.mix = 127; t->p.fade = 20; t->p.seam = 64;
}

/* The track's tick byte at the start of the block beginning at `clock`. */
static uint8_t tick_at(const Track *t, double clock) {
    double step = step_samples(t);
    long n = (long)floor(clock / step);
    for (long k = n; k >= n - 1 && k >= 0; --k) {
        double start = k * step + ((k & 1) ? t->swing * step : 0.0);
        if (clock >= start) {
            double into = (clock - start) / (step / ticks_per_step[t->scale]);
            unsigned tk = (unsigned)into;
            if (tk >= ticks_per_step[t->scale]) tk = ticks_per_step[t->scale] - 1u; /* a swung step starts late: the last tick lasts */
            return (uint8_t)((tk + 1u) % ticks_per_step[t->scale]);  /* 1 right after the step */
        }
    }
    return 0;
}

/* One 16-frame block: audio is in/out. Returns 1 when a step's tick 1 began in this block. */
static int track_block(Track *t, int32_t *audio) {
    FzGrid g = {0};
    g.running = (uint8_t)t->running;
    g.tick = t->running ? tick_at(t, t->clock) : 0;
    g.step_q4 = freeze_step_q4((uint32_t)lround(t->bpm * 24.0), t->scale);
    int boundary = g.running && g.tick == 1 && t->st.prev_tick != 1;
    int32_t record[2 * FZ_FRAMES];
    freeze_process(&t->st, &t->p, &g, t->ring, t->write, audio, record);
    memcpy(&t->ring[2 * t->write], record, sizeof record);   /* the stock DMA write */
    t->write += FZ_FRAMES;
    if (t->write >= FZ_RING) t->write = 0;
    if (t->running) t->clock += FZ_FRAMES;
    return boundary;
}

/* ---- signals ------------------------------------------------------------ */
static uint32_t lcg = 12345;
static double noise(void) { lcg = lcg * 1664525u + 1013904223u; return ((int32_t)lcg) / FS; }
static int32_t q(double x) { if (x > 0.999) x = 0.999; if (x < -0.999) x = -0.999; return (int32_t)lrint(x * FS); }

/* Fills a block from a generator over absolute sample index n. */
typedef double (*Gen)(long n, int ch);
static double gen_sine1k(long n, int ch) { (void)ch; return 0.25 * sin(2 * M_PI * 1000.0 * n / SR); }
static double gen_sine110(long n, int ch) { (void)ch; return 0.25 * sin(2 * M_PI * 110.0 * n / SR); }
static double gen_noise(long n, int ch) { (void)n; (void)ch; return 0.25 * noise(); }
/* Noise through a two-pole low-pass near 1.5 kHz: musical bandwidth, so a
 * repeat read at a different fractional position still matches. */
static double lp1, lp2;
static double gen_lpnoise(long n, int ch) {
    (void)n; if (ch) return lp2;
    lp1 += 0.19 * (noise() - lp1); lp2 += 0.19 * (lp1 - lp2); return lp2 * 2.0;
}
static double gen_time(long n, int ch) { (void)ch; return 0.9 * (double)(n % 400000) / 400000.0; } /* level = time */

static void fill(int32_t *a, long n0, Gen gen) {
    for (unsigned i = 0; i < FZ_FRAMES; ++i) { a[2 * i] = q(gen(n0 + i, 0)); a[2 * i + 1] = q(gen(n0 + i, 1)); }
}

/* Output index of the first cycle start inside the last captured run. */
static long first_cycle_at;

/* Runs `blocks` blocks, capturing the left output into out (may be NULL). */
static void run(Track *t, long *n, long blocks, Gen gen, double *out) {
    int32_t a[2 * FZ_FRAMES];
    if (out) first_cycle_at = -1;
    for (long b = 0; b < blocks; ++b) {
        fill(a, *n, gen);
        uint32_t c = t->st.cycles;
        track_block(t, a);
        if (out && first_cycle_at < 0 && t->st.cycles != c) first_cycle_at = b * FZ_FRAMES;
        if (out) for (unsigned i = 0; i < FZ_FRAMES; ++i) out[b * FZ_FRAMES + i] = a[2 * i] / FS;
        *n += FZ_FRAMES;
    }
}


static double seg_corr(const double *x, long a, long b, long n) {
    double xy = 0, xx = 0, yy = 0;
    for (long i = 0; i < n; ++i) { xy += x[a + i] * x[b + i]; xx += x[a + i] * x[a + i]; yy += x[b + i] * x[b + i]; }
    return xx > 0 && yy > 0 ? xy / sqrt(xx * yy) : 0;
}

/* Mean over cycles of the best match between the middle half of one cycle
 * and the same stretch `lag` later, each pair aligned on its own within +-w
 * samples (each cycle starts on the block where the track's tick reaches 1). */
static double cycle_corr(const double *x, long len, long period, long lag, long w) {
    double sum = 0; int count = 0;
    for (long a = first_cycle_at + period / 4; a + lag + period / 2 + w < len; a += period) {
        double best = -1;
        for (long d = -w; d <= w; ++d) { double c = seg_corr(x, a, a + lag + d, period / 2); if (c > best) best = c; }
        sum += best; ++count;
    }
    return count ? sum / count : 0;
}

static double zero_cross_hz(const double *x, long len) {
    long z = 0;
    for (long i = 1; i < len; ++i) if ((x[i - 1] < 0) != (x[i] < 0)) ++z;
    return z / 2.0 / (len / SR);
}

static long blocks_for(double samples) { return (long)ceil(samples / FZ_FRAMES); }

/* ---- tests -------------------------------------------------------------- */
static void test_dry_exact(void) {
    Track t; track_init(&t, 120, 4);
    int32_t a[2 * FZ_FRAMES], in[2 * FZ_FRAMES];
    long n = 0; int exact = 1, rec = 1;
    for (long b = 0; b < 20000; ++b) {
        fill(a, n, gen_noise); memcpy(in, a, sizeof a);
        uint32_t w = t.write;
        track_block(&t, a);
        if (memcmp(a, in, sizeof a)) exact = 0;
        if (memcmp(&t.ring[2 * w], in, sizeof in)) rec = 0;
        n += FZ_FRAMES;
    }
    CHECK(exact, "GRAB OFF must be bit-exact dry");
    CHECK(rec, "GRAB OFF must record the dry input to the ring");
}

/* Output of one held track at a steady state, for analysis. */
static double *held_render(Track *t, Gen gen, double settle_steps, double steps, long *len) {
    long n = 0;
    run(t, &n, blocks_for(SR * 3.0), gen, NULL);          /* three seconds of history */
    t->p.grab = 1;
    run(t, &n, blocks_for(step_samples(t) * settle_steps), gen, NULL);
    *len = blocks_for(step_samples(t) * steps) * FZ_FRAMES;
    double *out = malloc(sizeof(double) * (size_t)*len);
    run(t, &n, *len / FZ_FRAMES, gen, out);
    return out;
}

static void test_period(unsigned steps, double bpm, unsigned scale, double spin_ratio_expect) {
    Track t; track_init(&t, bpm, steps - 1); t.scale = scale;
    long len;
    double *out = held_render(&t, gen_lpnoise, 2.0 * steps + 1, 4.0 * steps, &len);
    long P = lround(step_samples(&t) * steps);
    double cp = cycle_corr(out, len, P, P, 24), ch = cycle_corr(out, len, P, P / 2, 24), c1 = cycle_corr(out, len, P, lround(step_samples(&t)), 24);
    printf("  N=%u %.0f BPM speed %.3gx: corr(P)=%.3f corr(P/2)=%.3f corr(1 step)=%.3f spin cap=%.3f\n",
           steps, bpm, speed_mult[scale], cp, ch, c1, t.st.spin_cap / 16384.0);
    CHECK(cp > 0.99, "N=%u: output must repeat every N track steps (corr %.3f)", steps, cp);
    if (steps > 1) CHECK(fabs(ch) < 0.5, "N=%u: output must not repeat at half the period (corr %.3f)", steps, ch);
    CHECK(fabs(t.st.spin / 16384.0 - spin_ratio_expect) < 0.01, "spin %.3f, expected %.3f", t.st.spin / 16384.0, spin_ratio_expect);
    free(out); free(t.ring);
}

static void test_two_instances(void) {
    /* Tracks 5 and 7 steps at once, each with its own state and ring: after 35
     * steps they have done 7 and 5 cycles, and they line up again only there. */
    Track a, b; track_init(&a, 120, 4); track_init(&b, 120, 6);
    long na = 0, nb = 0;
    run(&a, &na, blocks_for(SR * 3), gen_noise, NULL);
    run(&b, &nb, blocks_for(SR * 3), gen_sine110, NULL);
    a.p.grab = b.p.grab = 1;
    double step = step_samples(&a);
    /* Advance to just after the grab step (one step), then 35 steps more. */
    long blocks = blocks_for(step * 36.5);
    int32_t buf[2 * FZ_FRAMES];
    for (long k = 0; k < blocks; ++k) {
        fill(buf, na, gen_noise); track_block(&a, buf); na += FZ_FRAMES;
        fill(buf, nb, gen_sine110); track_block(&b, buf); nb += FZ_FRAMES;
    }
    printf("  5-step and 7-step tracks over 35 steps: %u and %u cycles\n", a.st.cycles, b.st.cycles);
    CHECK(a.st.cycles == 7, "5-step instance: %u cycles in 35 steps, expected 7", a.st.cycles);
    CHECK(b.st.cycles == 5, "7-step instance: %u cycles in 35 steps, expected 5", b.st.cycles);
    CHECK(a.st.t == b.st.t, "after 35 steps both cycles restart together (t %u vs %u)", a.st.t, b.st.t);
    free(a.ring); free(b.ring);
}

static void test_spin_pitch(void) {
    const unsigned values[3] = {0, 64, 127};
    const double expect[3] = {250, 500, 1000};
    for (int k = 0; k < 3; ++k) {
        Track t; track_init(&t, 120, 7);
        t.p.spin = (uint8_t)values[k]; t.p.seam = 0;
        long len;
        double *out = held_render(&t, gen_sine1k, 1.2, 3.0, &len);
        /* inside one cycle, away from the seam */
        double hz = zero_cross_hz(out, len / 2);
        printf("  SPIN %3u: %.1f Hz from a 1 kHz input\n", values[k], hz);
        CHECK(fabs(hz - expect[k]) < expect[k] * 0.02, "SPIN %u: %.1f Hz, expected %.0f", values[k], hz, expect[k]);
        free(out); free(t.ring);
    }
}

static void test_jitter(void) {
    Track t; track_init(&t, 120, 4);
    t.p.jitter = 127;
    long len;
    double *out = held_render(&t, gen_sine1k, 11, 40, &len);
    /* Pitch over 50 ms windows: bounded wander around 500 Hz. */
    long w = (long)(SR * 0.05);
    double lo = 1e9, hi = 0;
    for (long i = 0; i + w <= len; i += w) {
        double hz = zero_cross_hz(out + i, w);
        if (hz < lo) lo = hz;
        if (hz > hi) hi = hz;
    }
    printf("  JTR 127: pitch over 50 ms windows %.1f..%.1f Hz (nominal 500), cycles %u in 51 steps\n", lo, hi, t.st.cycles);
    CHECK(lo > 480 && hi < 520, "JTR wander must stay within 4 %% of the rate (%.1f..%.1f Hz)", lo, hi);
    CHECK(hi - lo > 1.0, "JTR 127 must move the pitch at all (%.1f..%.1f)", lo, hi);
    CHECK(t.st.cycles == 10, "JTR must not change the period: %u cycles in 51 steps, expected 10", t.st.cycles);
    free(out); free(t.ring);
}

static void test_position(void) {
    double level[2];
    for (int k = 0; k < 2; ++k) {
        Track t; track_init(&t, 120, 2);
        t.p.position = (uint8_t)(k ? 127 : 0);
        long len;
        double *out = held_render(&t, gen_time, 8, 3, &len);
        double sum = 0; for (long i = 0; i < len; ++i) sum += out[i];
        level[k] = sum / len;
        free(out); free(t.ring);
    }
    /* The input level rises with time, so older audio is lower. */
    double age_s = (level[0] - level[1]) / 0.9 * 400000.0 / SR;
    printf("  POSITION 127 reads %.2f s older audio than POSITION 0\n", age_s);
    CHECK(age_s > 1.0, "POSITION must reach well back into the held audio (%.2f s)", age_s);
}

static void test_preserve_and_release(void) {
    Track t; track_init(&t, 120, 4);
    long n = 0;
    run(&t, &n, blocks_for(SR * 3), gen_noise, NULL);
    t.p.grab = 1;
    run(&t, &n, blocks_for(step_samples(&t) * 1.5), gen_noise, NULL);
    CHECK(t.st.held, "GRAB must hold after the next step");
    int32_t *snap = malloc(2 * FZ_RING * sizeof(int32_t));
    memcpy(snap, t.ring, 2 * FZ_RING * sizeof(int32_t));
    run(&t, &n, blocks_for(SR * 10), gen_noise, NULL);   /* the write head laps the ring twice */
    CHECK(!memcmp(snap, t.ring, 2 * FZ_RING * sizeof(int32_t)), "a hold must leave the ring's history intact");
    t.p.grab = 0;
    run(&t, &n, blocks_for(step_samples(&t) * 1.2 + 256 + 3 * 20 * 20), gen_noise, NULL);
    CHECK(!t.st.held && !t.st.env, "release must fade back to dry within FADE");
    int32_t a[2 * FZ_FRAMES], in[2 * FZ_FRAMES];
    fill(a, n, gen_noise); memcpy(in, a, sizeof a); track_block(&t, a);
    CHECK(!memcmp(a, in, sizeof a), "after the release the track is bit-exact dry again");
    free(snap); free(t.ring);
}

static void test_clicks(void) {
    /* A 110 Hz sine: its largest step between samples is 0.25*2*pi*110/44100
     * = 0.0039 FS. Grab, cycles, seams, a SPIN move, a POSITION move, STEP
     * changes and the release must never step more than a few times that. */
    Track t; track_init(&t, 120, 4);
    t.p.jitter = 64;
    long n = 0;
    run(&t, &n, blocks_for(SR * 3), gen_sine110, NULL);
    long total = blocks_for(SR * 12) * FZ_FRAMES;
    double *out = malloc(sizeof(double) * (size_t)total);
    long b = 0, blocks = total / FZ_FRAMES;
    int32_t a[2 * FZ_FRAMES];
    for (; b < blocks; ++b) {
        double s = b * FZ_FRAMES / SR;
        t.p.grab = s > 0.3 && s < 10.0;
        if (s > 3.0) t.p.spin = 100;
        if (s > 5.0) t.p.position = 127;
        if (s > 6.5) t.p.step = 2;
        if (s > 8.0) t.p.step = 6;
        fill(a, n, gen_sine110); track_block(&t, a); n += FZ_FRAMES;
        for (unsigned i = 0; i < FZ_FRAMES; ++i) out[b * FZ_FRAMES + i] = a[2 * i] / FS;
    }
    double worst = 0; long at = 0;
    for (long i = 1; i < total; ++i) { double d = fabs(out[i] - out[i - 1]); if (d > worst) { worst = d; at = i; } }
    printf("  largest sample step through grab, seams, SPIN/POSITION/STEP moves and release: %.4f FS at %.2f s (sine's own 0.0039)\n",
           worst, at / SR);
    CHECK(worst < 0.0039 * 3.0, "a click: %.4f FS at %.3f s", worst, at / SR);
    free(out); free(t.ring);
}

static void test_step_change(unsigned initial, unsigned next) {
    Track t; track_init(&t, 120, initial - 1);
    long n = 0;
    int32_t audio[2 * FZ_FRAMES];
    run(&t, &n, blocks_for(SR * 3), gen_sine110, NULL);
    t.p.grab = 1;
    for (long b = 0; b < blocks_for(step_samples(&t) * 2) && !t.st.held; ++b) {
        fill(audio, n, gen_sine110); track_block(&t, audio); n += FZ_FRAMES;
    }
    CHECK(t.st.held && t.st.cycle_steps == initial,
          "STEP %u -> %u: hold must start with %u steps", initial, next, initial);
    if (!t.st.held) { free(t.ring); return; }

    unsigned steps = 0, first = 0, second = 0;
    for (long b = 0; b < blocks_for(step_samples(&t) * (initial + next + 2)); ++b) {
        fill(audio, n, gen_sine110);
        int boundary = track_block(&t, audio);
        n += FZ_FRAMES;
        if (!boundary) continue;
        ++steps;
        if (steps == 1) {
            CHECK(t.st.steps_in_cycle == 1 && t.st.cycles == 0,
                  "STEP %u -> %u: first held step must stay in the first cycle", initial, next);
            t.p.step = (uint8_t)(next - 1);
        }
        if (t.st.cycles == 1 && !first) {
            first = steps;
            CHECK(t.st.cycle_steps == next,
                  "STEP %u -> %u: new length was not latched at the boundary", initial, next);
            CHECK(t.st.period == (freeze_step_q4((uint32_t)lround(t.bpm * 24.0), t.scale) >> 4) * next,
                  "STEP %u -> %u: new period was not planned", initial, next);
        }
        if (t.st.cycles == 2) { second = steps; break; }
    }
    printf("  STEP %u -> %u after first step: cycle boundaries at steps %u and %u\n",
           initial, next, first, second);
    CHECK(first == initial, "STEP %u -> %u: first cycle ended at %u, expected %u",
          initial, next, first, initial);
    CHECK(second == initial + next, "STEP %u -> %u: second cycle ended at %u, expected %u",
          initial, next, second, initial + next);
    free(t.ring);
}

static void test_swing_and_tempo(void) {
    /* Swing delays the odd steps' ticks: cycles still count track steps. */
    Track t; track_init(&t, 120, 2);
    t.swing = 0.25;
    long n = 0;
    run(&t, &n, blocks_for(SR * 3), gen_noise, NULL);
    t.p.grab = 1;
    run(&t, &n, blocks_for(step_samples(&t) * (1.5 + 30)), gen_noise, NULL);
    printf("  swing 25 %% of a step, N=3: %u cycles in 30 steps\n", t.st.cycles);
    CHECK(t.st.cycles == 10, "swung 3-step cycles: %u in 30 steps, expected 10", t.st.cycles);

    /* A tempo change while holding: the next cycle takes the new length. */
    Track u; track_init(&u, 120, 4);
    long m = 0;
    run(&u, &m, blocks_for(SR * 3), gen_noise, NULL);
    u.p.grab = 1;
    run(&u, &m, blocks_for(step_samples(&u) * 11.5), gen_noise, NULL);
    u.bpm = 90; u.clock = 0;   /* restart the model's grid at the new tempo */
    run(&u, &m, blocks_for(step_samples(&u) * 11), gen_noise, NULL);
    double expect = 5 * SR * 60 / (90 * 4.0);
    printf("  tempo 120 -> 90 while holding: period %u samples (expected %.0f)\n", u.st.period, expect);
    CHECK(fabs(u.st.period - expect) < 2, "period after a tempo change: %u, expected %.0f", u.st.period, expect);
    free(t.ring); free(u.ring);
}

static void test_stop_and_short_history(void) {
    Track t; track_init(&t, 120, 4);
    long n = 0;
    t.p.grab = 1;                                  /* GRAB on from entry: too little audio yet */
    run(&t, &n, blocks_for(step_samples(&t) * 0.5), gen_noise, NULL);
    CHECK(!t.st.held, "GRAB must wait for 4096 frames of history");
    run(&t, &n, blocks_for(SR * 1.0), gen_noise, NULL);
    CHECK(t.st.held, "GRAB must hold once enough history exists");
    t.running = 0;
    run(&t, &n, blocks_for(256 + 3 * 20 * 20 + 64), gen_noise, NULL);
    CHECK(!t.st.held && !t.st.env, "STOP must fade back to dry");
    free(t.ring);
}

static double gen_dc(long n, int ch) { (void)n; (void)ch; return 0.1; }

static void test_dirty_entry(void) {
    Track t; track_init(&t, 120, 6);
    memset(&t.st, 0xa5, sizeof t.st);
    t.st.active = 0;                               /* effect entry */
    for (uint32_t i = 0; i < 2 * FZ_RING; ++i) t.ring[i] = (int32_t)(i * 2654435761u); /* a previous effect's garbage */
    long n = 0;
    t.p.jitter = 127; t.p.position = 127; t.p.spin = 127;
    run(&t, &n, blocks_for(SR * 0.5), gen_dc, NULL);   /* valid is only 0.5 s */
    t.p.grab = 1;
    double *out = malloc(sizeof(double) * (size_t)blocks_for(SR * 4) * FZ_FRAMES);
    run(&t, &n, blocks_for(SR * 4), gen_dc, out);
    double peak = 0; long len = blocks_for(SR * 4) * FZ_FRAMES;
    for (long i = 0; i < len; ++i) if (fabs(out[i]) > peak) peak = fabs(out[i]);
    printf("  dirty entry, 0.5 s of history, SPIN 1.0x, POSITION/JTR 127: peak %.3f FS, spin cap %.3f\n", peak, t.st.spin_cap / 16384.0);
    /* DC 0.1 in: two equal heads in a seam reach 0.1 * 2 * 0.6875 = 0.1375; the
     * previous effect's full-scale garbage would be far above that. */
    CHECK(peak < 0.14, "garbage outside the valid history must never be heard (peak %.3f)", peak);
    free(out); free(t.ring);
}


static void test_lerp_extremes(void) {
    const int32_t v[] = {INT32_MIN, INT32_MIN + 1, -1, 0, 1, INT32_MAX - 1, INT32_MAX};
    const uint32_t f[] = {0, 1, 8191, 8192, 16382, 16383};
    int bad = 0;
    for (unsigned i = 0; i < 7; ++i) for (unsigned j = 0; j < 7; ++j) for (unsigned k = 0; k < 6; ++k) {
        double exact = (double)v[i] + ((double)v[j] - (double)v[i]) * f[k] / 16384.0;
        double got = lerp(v[i], v[j], f[k]);
        if (fabs(got - exact) > 4.0) { if (!bad) printf("  lerp(%d, %d, %u) = %.0f, exact %.1f\n", v[i], v[j], f[k], got, exact); ++bad; }
    }
    CHECK(!bad, "lerp is off by more than 4 LSB in %d of 294 extreme cases", bad);
    const int32_t g[] = {0, 1, 16384, 32767, 32768};
    for (unsigned i = 0; i < 7; ++i) for (unsigned k = 0; k < 5; ++k) {
        double exact = (double)v[i] * g[k] / 32768.0, got = mulq15(v[i], g[k]);
        if (fabs(got - exact) > 1.0) ++bad;
    }
    CHECK(!bad, "mulq15 is off by more than 1 LSB at an extreme");
}

static void test_full_ring_position(void) {
    /* A full four-second history (Q14 ages near 2.89e9), slow tempo so the
     * loop is long, POSITION swept from 0 to 127 and back while held. */
    Track t; track_init(&t, 30, 7);
    t.p.spin = 0; t.p.jitter = 127;
    long n = 0;
    run(&t, &n, blocks_for(SR * 5), gen_time, NULL);
    CHECK(t.st.valid == FZ_RING - 2 * FZ_GUARD, "history full before the grab (%u)", t.st.valid);
    t.p.grab = 1;
    double step = step_samples(&t);
    run(&t, &n, blocks_for(step * 1.2), gen_time, NULL);
    CHECK(t.st.held, "held with a full ring");
    double maxage = 0, lo = 1e9, hi = -1e9;
    long blocks = blocks_for(SR * 12);
    int32_t a[2 * FZ_FRAMES];
    for (long b = 0; b < blocks; ++b) {
        double s = b * FZ_FRAMES / SR;
        t.p.position = (uint8_t)(s < 4 ? 127 * s / 4 : s < 8 ? 127 : 127 * (12 - s) / 4);
        fill(a, n, gen_time); track_block(&t, a); n += FZ_FRAMES;
        for (int h = 0; h < 2; ++h) if (t.st.head[h].active) {
            double age = ((double)t.st.head[h].age + t.st.pos_off + t.st.jit_off) / 16384.0;
            if (age > maxage) maxage = age;
        }
        double y = a[0] / FS; if (y < lo) lo = y; if (y > hi) hi = y;
    }
    printf("  full ring, 30 BPM, 8 steps: avail %u frames, deepest read %.0f frames (%.2f s), pos range %.2f s, output %.3f..%.3f\n",
           t.st.avail, maxage, maxage / SR, pos_range(&t.st) / 16384.0 / SR, lo, hi);
    CHECK(maxage <= t.st.avail - FZ_GUARD + 1, "a head read past the held history (%.0f > %u)", maxage, t.st.avail - FZ_GUARD);
    CHECK(pos_range(&t.st) / 16384.0 / SR > 0.5, "POSITION must still reach back at least 0.5 s on a full ring");
    CHECK(lo >= -0.001 && hi <= 0.91, "only held input levels may be heard (%.3f..%.3f)", lo, hi);
    free(t.ring);
}

/* ---- audition ----------------------------------------------------------- */
static double pad(long n, int ch) {
    /* An original synthetic pad: a slow minor-seventh chord, detuned per channel. */
    static const double f[4] = {110.0, 130.81, 164.81, 196.0};
    double t = n / SR, y = 0;
    for (int k = 0; k < 4; ++k) {
        double det = 1.0 + (ch ? 0.0021 : -0.0017) * (k + 1);
        double ph = fmod(f[k] * det * t, 1.0);
        y += (2.0 * ph - 1.0) * 0.5 + sin(2 * M_PI * f[k] * det * t) * 0.5;
    }
    double swell = 0.6 + 0.4 * sin(2 * M_PI * 0.07 * t);
    double chord = (n / (long)(SR * 2.0)) % 2 ? 1.0 : 1.12246;   /* moves a tone every 2 s */
    (void)chord;
    return 0.06 * y * swell;
}

static void write_wav(const char *path, const float *lr, long frames) {
    FILE *fp = fopen(path, "wb");
    if (!fp) { printf("cannot write %s\n", path); return; }
    uint32_t data = (uint32_t)frames * 4u, riff = 36u + data, rate = 44100, brate = rate * 4u, fmt = 16;
    uint16_t pcm = 1, chn = 2, align = 4, bits = 16;
    fwrite("RIFF", 1, 4, fp); fwrite(&riff, 4, 1, fp); fwrite("WAVEfmt ", 1, 8, fp);
    fwrite(&fmt, 4, 1, fp); fwrite(&pcm, 2, 1, fp); fwrite(&chn, 2, 1, fp); fwrite(&rate, 4, 1, fp);
    fwrite(&brate, 4, 1, fp); fwrite(&align, 2, 1, fp); fwrite(&bits, 2, 1, fp);
    fwrite("data", 1, 4, fp); fwrite(&data, 4, 1, fp);
    for (long i = 0; i < 2 * frames; ++i) { double v = lr[i]; if (v > 1) v = 1; if (v < -1) v = -1; int16_t s = (int16_t)lrint(v * 32767); fwrite(&s, 2, 1, fp); }
    fclose(fp);
}

static void audition(const char *path) {
    /* 16 s at 120 BPM: two tracks of the same pad, Freeze 5 steps and 7 steps,
     * SPIN 0.5x, JTR 40; grab at 4 s (bar 3), release at 13 s. */
    Track a, b; track_init(&a, 120, 4); track_init(&b, 120, 6);
    a.p.jitter = b.p.jitter = 40; a.p.fade = b.p.fade = 40;
    long frames = blocks_for(SR * 16) * FZ_FRAMES;
    float *lr = calloc((size_t)frames * 2, sizeof(float));
    int32_t ba[2 * FZ_FRAMES], bb[2 * FZ_FRAMES];
    for (long blk = 0; blk < frames / FZ_FRAMES; ++blk) {
        long n = blk * FZ_FRAMES; double s = n / SR;
        a.p.grab = b.p.grab = s > 4.0 && s < 13.0;
        fill(ba, n, pad); fill(bb, n, pad);
        track_block(&a, ba); track_block(&b, bb);
        for (unsigned i = 0; i < FZ_FRAMES; ++i) {
            lr[2 * (n + i)] = (float)((ba[2 * i] / FS) * 0.9 + (bb[2 * i] / FS) * 0.5);
            lr[2 * (n + i) + 1] = (float)((ba[2 * i + 1] / FS) * 0.5 + (bb[2 * i + 1] / FS) * 0.9);
        }
    }
    write_wav(path, lr, frames);
    printf("  wrote %s (16 s: 5-step left, 7-step right, SPIN 0.5x, JTR 40, grab 4 s, release 13 s)\n", path);
    free(lr); free(a.ring); free(b.ring);
}

int main(int argc, char **argv) {
    printf("Freeze host tests\n");
    printf("arithmetic:\n");
    test_lerp_extremes();
    test_dry_exact();
    printf("period lock (low-passed noise input, SPIN 0.5x):\n");
    test_period(3, 120, 2, 0.5);
    test_period(5, 120, 2, 0.5);
    test_period(7, 120, 2, 0.5);
    test_period(8, 120, 2, 0.5);
    test_period(1, 120, 2, 0.5);
    test_period(5, 90, 2, 0.5);
    test_period(5, 120, 0, 0.5);   /* 2x track speed */
    test_period(3, 120, 4, 0.5);   /* 1/2x track speed */
    printf("independent instances:\n");
    test_two_instances();
    printf("SPIN:\n");
    test_spin_pitch();
    printf("JTR:\n");
    test_jitter();
    printf("POSITION:\n");
    test_position();
    printf("STEP changes:\n");
    test_step_change(5, 2);
    test_step_change(2, 5);
    printf("swing and tempo:\n");
    test_swing_and_tempo();
    printf("hold, release, STOP, entry:\n");
    test_preserve_and_release();
    test_stop_and_short_history();
    test_dirty_entry();
    test_full_ring_position();
    printf("clicks:\n");
    test_clicks();
    if (argc > 1) audition(argv[1]);
    printf("%d of %d checks passed\n", checks - failures, checks);
    return failures ? 1 : 0;
}
