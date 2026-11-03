/* DEJA VU -- random values with a looping memory, for an audio-track LFO.
 *
 * One state per LFO (8 tracks x 3): a loop of LEN slots (MULT: 1, 2, 4 .. 64)
 * holding remembered values. Each time a slot is visited it replays its value
 * or, with the chance DEJA (SPD) sets, takes a fresh one: DEJA 0 = always
 * fresh, 127 = locked. The LFO's TRIG setting says what moves through the loop:
 *
 *   FREE  every step of the track visits slot (pattern position mod LEN) and
 *         shows it: a random step sequencer, no trigs needed
 *   TRIG  a trig restarts the loop at slot 0; then one slot per step
 *   HOLD  every step visits slot (pattern position mod LEN); the LFO engine
 *         holds the output and takes it on a trig, so each step owns a value
 *         and adding or removing trigs moves nothing
 *   ONE   one slot per trig; PLAY restarts the loop at slot 0
 *   HALF  as TRIG, but one pass through the loop, then the last value holds
 *
 * Step timing (1.40C, emulator): the track's step counter (0x800064d0 + track:
 * 1..length-1, then 0 on the last step) moves one sequencer tick before the
 * step's trig fires; its tick
 * counter (0x800064f0 + track) reaches 1 just after. FREE/TRIG/HALF change on
 * tick 1, so they land with the trigs; HOLD prepares the value when the
 * counter moves, so it is ready when the engine samples it on the trig.
 * Values are 8-bit (signed), output as the LFO's signed 24-bit (+-0x800000).
 *
 * Three waves share the loop (one state per LFO, so switching keeps it):
 *   DJV (19)  the value, stepped
 *   DJQ (20)  on PTCH (PMTR 0): the root and fifth with their octaves (-12, -5,
 *             0, 7, 12 semitones), each value picking one of the notes in
 *             reach with equal odds, higher values higher notes; elsewhere
 *             whole knob steps. The engine adds (DEP_word << 8) * out >> 31 to
 *             the knob's word (EMAC fractional mode, 0x4000d060), one knob step
 *             being 256, so at DEP k (k = 128 for 127) the LFO spans +-k steps,
 *             and out = ceil(u << 23 / k) lands on exactly u steps. A PTCH
 *             step is 1/5 semitone (emulator: 54 steps = 10.8 st; the pitch
 *             clamps at +-12 st), so a note n semitones away is 5n steps and is
 *             in reach when 5|n| <= k: DEP 35 reaches the fifths, 60 the octaves
 *   DJC (21)  glides linearly to each new value over the time since the last
 *             change, arriving as the next one comes (hooks.s steps the glide)
 *
 * Freestanding C: compiled for the ColdFire (generate.py -> dejavu_core.s) and
 * for the host (tools/otbench tests, -DDV_HOST) from this one file.
 */
#include <stdint.h>

#define DV_NLFO 24
#define DV_MEM 64
#define DV_IDLE 0xFF                       /* pos: TRIG/HALF wait for a trig */

enum { DV_FREE, DV_TRIG, DV_HOLD, DV_ONE, DV_HALF };

typedef struct {
    uint32_t rng;                          /* xorshift32 state; 0 until first used */
    uint8_t step;                          /* ONE: the slot played last */
    uint8_t rewind;                        /* ONE: the next trig plays slot 0 */
    uint8_t pos;                           /* TRIG/HALF: the slot since the trig */
    uint8_t trig_ctr;                      /* TRIG/HALF: the step of that trig */
    int32_t rend;                          /* the output (hooks.s reads it, +8) */
    int8_t mem[DV_MEM];
    uint32_t valid[2];                     /* slots holding a value */
    uint32_t seen;                         /* wave << 24 | run << 16 | counter << 8 | tick at the last call (hooks.s, +84) */
    uint8_t lastnz;                        /* the last nonzero counter: the last step's position */
    uint8_t wave;                          /* the wave of the last call */
    uint8_t pad[2];
    int32_t delta;                         /* DJC: the glide's step a frame (hooks.s, +92) */
    uint32_t left;                         /* DJC: frames of glide left (hooks.s, +96) */
    uint32_t frames;                       /* DJC: frames since the last change (hooks.s counts, +100) */
    uint32_t dq;                           /* DJQ: PMTR << 16 | DEP word it was snapped for (hooks.s, +104) */
    int32_t raw;                           /* the loop's current value << 16 */
    uint32_t magic;                        /* DV_MAGIC once set up (hooks.s, +112): memory is
                                            * not zeroed before first use on every build */
} dv_lfo;                                  /* 116 bytes; 24 x 116 = 2,784 */

#define DV_MAGIC 0x444A5631u               /* "DJV1" */

enum { DV_DJV, DV_DJQ, DV_DJC };
#define DV_GLIDE_MAX 8192u                 /* frames (3 s): longer gaps jump */

dv_lfo dv_state[DV_NLFO];

/* MULT is a shift count, 0..6 (shown 1 .. 64): LEN = 1 << MULT. */
#define DV_LEN(mult) (1u << ((mult) > 6 ? 6 : (mult)))

static uint32_t dv_next(uint32_t *s)
{
    uint32_t x = *s;                       /* xorshift32: period 2^32-1, never 0 */
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *s = x;
    return x;
}

/* The chance (of 65,536) that a slot takes a fresh value: (127 - DEJA)/127,
 * linear, so DEJA 64 is about even (DEJA 0 = 65,536 = always, 127 = never). */
static uint32_t dv_fresh(unsigned deja)
{
    uint32_t r = deja >= 127 ? 0 : 127 - deja;
    return (r << 16) / 127u;
}

/* Visit a slot: keep its value or take a fresh one; returns the output. */
static int32_t dv_visit(dv_lfo *s, unsigned slot, unsigned deja)
{
    uint32_t r = dv_next(&s->rng), bit = 1u << (slot & 31);
    uint32_t *v = &s->valid[slot >> 5];
    if (!(*v & bit) || (r & 0xFFFFu) < dv_fresh(deja)) {
        s->mem[slot] = (int8_t)(r >> 24);
        *v |= bit;
    }
    return (int32_t)s->mem[slot] << 16;
}

/* DJQ on PTCH: the root and fifth, an octave each way (semitones). */
static const int8_t dv_notes[5] = { -12, -5, 0, 7, 12 };

/* DJQ: a value << 16 snapped for dq = PMTR << 16 | DEP word. */
static int32_t dv_quant(int32_t raw, uint32_t dq)
{
    unsigned depw = dq & 0xFFFFu, pmtr = (dq >> 16) & 0xFFu;
    unsigned k = (depw + (depw == 0x7F00u ? 0x100u : 0u)) >> 8;   /* stock: full DEP counts 128 */
    int32_t v = raw >> 16, u;
    if (!k)
        return 0;
    if (pmtr == 0) {                                               /* PTCH: a semitone is 5 knob steps */
        unsigned lo = 0, hi = 4, n;
        while (5 * -dv_notes[lo] > (int)k)                         /* the notes in reach */
            lo++;
        while (5 * dv_notes[hi] > (int)k)
            hi--;
        n = lo + (((unsigned)(v + 128) * (hi - lo + 1)) >> 8);     /* equal odds, in order */
        u = 5 * dv_notes[n];
    } else {
        int32_t n = (v * (int32_t)k + (v >= 0 ? 64 : -64)) / 128;  /* nearest whole knob step */
        u = n;
    }
    if (u >= 0)
        return (int32_t)((((uint32_t)u << 23) + k - 1u) / k);
    return -(int32_t)(((uint32_t)-u << 23) / k);
}

/* s: the LFO's state; trig: nonzero on a trig of its track; deja: 0..127;
 * mult: 0..6; mode: the TRIG setting; snap: wave << 24 | run << 16 | step
 * counter << 8 | tick, the track's sequencer now; wave: DJV, DJQ or DJC; dq: the LFO's
 * PMTR << 16 | DEP word (DJQ). Returns the output. */
int32_t dv_call(dv_lfo *s, int trig, unsigned deja, unsigned mult, unsigned mode, uint32_t snap,
                unsigned wave, uint32_t dq)
{
    int32_t before;
    unsigned len = DV_LEN(mult);
    unsigned run = (snap >> 16) & 1, ctr = (snap >> 8) & 0xFF, tick = snap & 0xFF;
    unsigned was_run, was_ctr, was_tick, stepped, shown, slot;
    if (s->magic != DV_MAGIC) {                          /* first use: whatever memory held */
        unsigned i = (unsigned)(s - dv_state), k;
        uint8_t *b = (uint8_t *)s;
        for (k = 0; k < sizeof *s; k++)
            b[k] = 0;
        s->rng = 0x9E3779B9u ^ (uint32_t)(i * 0x85EBCA6Bu);
        if (!s->rng)
            s->rng = 1;
        s->rewind = 1;
        s->pos = DV_IDLE;
        s->frames = DV_GLIDE_MAX + 1u;
        s->magic = DV_MAGIC;
    }
    was_run = (s->seen >> 16) & 1;
    was_ctr = (s->seen >> 8) & 0xFF;
    was_tick = s->seen & 0xFF;
    /* a step is due: PLAY, the counter moving, or (a 1-step track only shows
     * it) the tick returning to 0 */
    stepped = (run && !was_run) || ctr != was_ctr || (tick == 0 && was_tick != 0);
    shown = tick == 1 && was_tick != 1;                  /* the step's audible start */
    if (run && !was_run) {                               /* transport start, before the step below */
        s->rewind = 1;
        s->pos = DV_IDLE;
        s->lastnz = 0;
        s->frames = DV_GLIDE_MAX + 1u;                   /* the first change jumps */
    }
    if (stepped && ctr)
        s->lastnz = (uint8_t)ctr;
    /* pattern position mod LEN: the counter shows 0 on the track's last step,
     * whose position is the counter before it (length - 1) */
    slot = (ctr ? ctr - 1u : (unsigned)s->lastnz) & (len - 1u);
    before = s->raw;
    s->raw = 0x7FFFFFFF;                                 /* marks no change this call */
    switch (mode) {
    case DV_FREE:
        if (run && shown)
            s->raw = dv_visit(s, slot, deja);
        break;
    case DV_HOLD:
        if (run && stepped)
            s->raw = dv_visit(s, slot, deja);
        break;
    case DV_TRIG:
    case DV_HALF:
        if (trig) {
            s->pos = 0;
            s->trig_ctr = (uint8_t)ctr;
            s->raw = dv_visit(s, 0, deja);
        } else if (run && shown && s->pos != DV_IDLE && ctr != s->trig_ctr) {
            s->trig_ctr = DV_IDLE;                       /* only the trig's own step is skipped */
            if (mode == DV_TRIG || s->pos + 1u < len) {
                s->pos = (uint8_t)((s->pos + 1u) & (len - 1u));
                s->raw = dv_visit(s, s->pos, deja);
            }
        }
        break;
    default:                                             /* ONE (and any later mode) */
        if (trig) {
            unsigned step = s->rewind ? 0 : (s->step + 1u) & (len - 1u);
            s->rewind = 0;
            s->step = (uint8_t)step;
            s->raw = dv_visit(s, step, deja);
        }
        break;
    }
    s->seen = snap;
    if (s->raw == 0x7FFFFFFF) {                          /* no new value */
        s->raw = before;
        if (wave == DV_DJC && s->left) {                 /* the frame hooks.s did not step */
            s->rend += s->delta;
            s->left--;
        }
        if (wave == DV_DJQ && (dq != s->dq || s->wave != DV_DJQ))
            s->rend = dv_quant(s->raw, dq);
        if (wave == DV_DJV)
            s->rend = s->raw;                            /* a DJC glide stops where it is */
    } else if (wave == DV_DJC) {
        uint32_t t = s->frames;
        if (!t || t > DV_GLIDE_MAX) {
            s->rend = s->raw;
            s->left = 0;
        } else {
            s->delta = (s->raw - s->rend) / (int32_t)t;
            s->left = t;
        }
        s->frames = 0;
    } else {
        s->rend = wave == DV_DJQ ? dv_quant(s->raw, dq) : s->raw;
    }
    s->dq = dq;
    s->wave = (uint8_t)wave;
    return s->rend;
}

#ifdef DV_HOST
/* Host tests: by LFO index. */
int32_t dv_host(unsigned i, int trig, unsigned deja, unsigned mult, unsigned mode,
                unsigned run, unsigned ctr, unsigned tick)
{
    return i < DV_NLFO ? dv_call(&dv_state[i], trig, deja, mult, mode, (run ? 1u << 16 : 0) | (ctr << 8) | tick, DV_DJV, 0x4000) : 0;
}

/* One frame of any wave as hooks.s runs it: the fast path when nothing changed. */
int32_t dv_frame(unsigned i, int trig, unsigned deja, unsigned mult, unsigned mode,
                 unsigned run, unsigned ctr, unsigned tick, unsigned wave, uint32_t dq)
{
    dv_lfo *s;
    uint32_t snap = wave << 24 | (run ? 1u << 16 : 0) | (ctr << 8) | tick;
    if (i >= DV_NLFO)
        return 0;
    s = &dv_state[i];
    if (wave == DV_DJC)
        s->frames++;
    if (!trig && snap == s->seen && s->magic == DV_MAGIC && (wave != DV_DJQ || dq == s->dq)) {   /* hooks.s's fast path */
        if (wave == DV_DJC && s->left) {
            s->rend += s->delta;
            s->left--;
        }
        return s->rend;
    }
    return dv_call(s, trig, deja, mult, mode, snap, wave, dq);
}

int32_t dv_quant_of(int32_t raw, uint32_t dq) { return dv_quant(raw, dq); }

uint32_t dv_fresh_of(unsigned deja) { return dv_fresh(deja); }
#endif
