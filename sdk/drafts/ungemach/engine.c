/* SPDX-License-Identifier: MIT
 * UNGEMACH's engine: an original design.
 *
 * The drone: sixteen oscillators, eight a side, in three groups on a root (PTCH): the root itself and the two ratios
 * DISS sets, from octave and fifth into fourteen stations of dissonance; and four subs an
 * octave under the root. They play one waveform: WAVE crossfades through thirty-two of UNGEMACH's own, soft, harsh and
 * sung, each band-limited for the pitch it plays. Within a group the voices sit a few cents apart, and each drifts on
 * its own, so they beat against each other all the time. A sine at the third ratio, and the drone's own last sample,
 * push every voice's phase (FM, by DIRT). The oscillators run at half the rate (ten interpolated, six read at the
 * nearest sample); a half-band interpolator draws the full rate. SPRD sets how wide the two sides stand. A little dark noise; one
 * resonant low-pass a side (TONE, its resonance by DIRT); saturation (by DIRT; at 0 it stays clean). A slow random
 * drift moves pitch and cutoff, and the movement runs at full: freely at a RATE up to 63, on three curves of their
 * own, or as a pulse on the track's steps above it.
 *
 * No hits of its own: the track's AMP envelope, filter and LFOs shape it on the DSP as they do a sample, and an LFO on
 * DIRT in a trig mode makes a hit from the drone itself.
 * Laws and constants: gen_tables.py. */
#include "engine.h"
#include "tables.h"

static int32_t clamp(int32_t v, int32_t lo, int32_t hi) { return v < lo ? lo : v > hi ? hi : v; }

static uint32_t next(Ungemach *k)
{
    uint32_t x = k->rng;
    x ^= x << 13, x ^= x >> 17, x ^= x << 5;
    return k->rng = x;
}
static int32_t noise(Ungemach *k) { return (int32_t)next(k) >> 16; }
/* a waveform read between its samples */
static inline __attribute__((always_inline)) int32_t look(const int16_t *t, uint32_t ph)
{
    unsigned i = ph >> 24;
    int32_t a = t[i], b = t[i + 1];
    return a + (((b - a) * (int32_t)((ph >> 9) & 0x7fffu)) >> 15);
}
/* the richest mip whose top harmonic stays clear of aliasing at this increment */
static unsigned mip_of(uint32_t inc)
{
    unsigned m = 0;
    while (m < UG_MIPS - 1u && inc > ug_mip_inc[m]) ++m;
    return m;
}
/* one slice of a group's waveform: the two waves around pos (0..(UG_WAVES - 1) << 8) crossfaded at one mip. A call
 * makes UG_SLICE samples, the same work every call, so the cost never jumps when WAVE moves or the pitch crosses a mip. */
#define UG_SLICE 32u
#define UG_SLICES (UG_WAVE_LEN / UG_SLICE)
#define UG_GLIDE 2                  /* WAVE glides 2/256 of a waveform a block: a knob step in about 15 blocks (3 ms), 0 to 127 in 0.35 s */
static void make(Ungemach *k, unsigned g, unsigned mip, uint32_t pos, unsigned from)
{
    unsigned a = pos >> 8, b = a + 1u < UG_WAVES ? a + 1u : a, sh = ug_mip_shift[mip];
    int32_t w = (int32_t)(pos & 255u);
    const int16_t *A = ug_waves + a * UG_WAVE_STRIDE + ug_mip_off[mip], *B = ug_waves + b * UG_WAVE_STRIDE + ug_mip_off[mip];
    int16_t *o = k->work[g];
    if (!sh) {
        for (unsigned i = from; i < from + UG_SLICE; ++i) o[i] = (int16_t)(A[i] + (((B[i] - A[i]) * w) >> 8));
    } else {
        /* a mip kept shorter is drawn out to the full length through a cubic (Catmull-Rom), which adds far less
         * above its harmonics than a straight line would. Each of its samples is crossfaded once, then slides
         * through the four the cubic reads. */
        unsigned lm = (UG_WAVE_LEN >> sh) - 1u, per = 1u << sh, j0 = from >> sh, jn = (from + UG_SLICE) >> sh;
#define UG_XF(q) (A[(q) & lm] + (((B[(q) & lm] - A[(q) & lm]) * w) >> 8))
        int32_t y0 = UG_XF(j0 - 1u), y1 = UG_XF(j0), y2 = UG_XF(j0 + 1u);
        int16_t *out = o + from;
        for (unsigned j = j0; j < jn; ++j) {
            int32_t y3 = UG_XF(j + 2u);
            *out++ = (int16_t)y1;
            for (unsigned t = 1; t < per; ++t) {
                const int16_t *h = ug_herm[t << (2u - sh)];
                *out++ = (int16_t)clamp((h[0] * y0 + h[1] * y1 + h[2] * y2 + h[3] * y3) >> 12, -32767, 32767);
            }
            y0 = y1, y1 = y2, y2 = y3;
        }
#undef UG_XF
    }
    if (!from) o[UG_WAVE_LEN] = o[0];
}
static int32_t sine(uint32_t ph) { return ug_sine[ph >> 22]; }
/* 1.5 x - 0.5 x^3, flat beyond +-1 (Q15) */
static int32_t smoothstep(int32_t x)
{
    x = clamp(x, -32767, 32767);
    int32_t x2 = (x * x) >> 15, x3 = (x2 * x) >> 15;
    return (3 * x - x3) >> 1;
}
/* above 0.75 of full scale the level bends towards it instead of clipping */
static inline __attribute__((always_inline)) int32_t bend(int32_t o)
{
    const int32_t soft = 24575;
    int32_t over = (o < 0 ? -o : o) - soft;
    if (over <= 0) return o;
    if (over >= 1 << 17) over = (1 << 17) - 1;
    unsigned j = (unsigned)over >> 7;
    int32_t bent = ug_bend[j] + (((ug_bend[j + 1] - ug_bend[j]) * (over & 127)) >> 7);   /* soft + over room / (over + room) */
    return o < 0 ? -bent : bent;
}

void ug_reset(Ungemach *k)
{
    uint8_t *p = (uint8_t *)k;
    for (unsigned i = 0; i < sizeof *k; ++i) p[i] = 0;
    k->rng = 0x6d2b79f5u;
    for (unsigned v = 0; v < UG_NVOICES; ++v) k->ph[v] = next(k);   /* free phases: no click of all voices at once */
    for (unsigned v = 0; v < UG_NSUBS; ++v) k->phs[v] = next(k);
    k->pos = -1;                        /* the first block takes WAVE as it is; the drone fades in while the waveforms fill */
    k->r2q = -1;                        /* the first block takes DISS as it is */
    for (unsigned g = 0; g < UG_GROUPS; ++g) k->wkey[g] = 0xffffffffu;
}

static uint32_t root_inc(uint16_t ptch)
{
    unsigned raw = ptch >> 8, frac = ptch & 255u;
    if (raw < 4u) raw = 4u, frac = 0;
    if (raw >= 124u) raw = 124u, frac = 0;
    uint32_t a = ug_root_inc[raw - 4u], b = raw < 124u ? ug_root_inc[raw - 3u] : a;
    return a + (((b - a) * frac) >> 8);
}

#define UG_FRAME 16u
/* PNCH: two falling envelopes from a trig. The body falls with a time constant of 35 ms at a low PNCH, growing fast
 * to 55 ms at its top (ug_punch_fall, a frame, Q15); at its height it throws the filter open,
 * takes DIRT up and lifts the level (+12 dB for a full punch). The crack, about 3 ms (exp(-0.3628 / 3)), lifts it twice
 * again (+6 dB) at the onset. The output's soft bend takes what goes past full scale: a hit, pressed, never clipped.
 * PNCH works straight, so it is heard from the lower half on; its top is what 110 was in v65, a little over half a full
 * punch (22 November 2026, the user: 127 too loud, up to 50 too subtle). */
#define UG_CRACK_FALL 29030
#define UG_PUNCH_CUT16 144
#define UG_PUNCH_DIRT 127
#define UG_PUNCH_LIFT 12288 /* Q12 */
#define UG_CRACK_LIFT 8192  /* Q12 */
void ug_punch(Ungemach *k) { k->pk = 32767, k->pc = 32767; }
/* once a frame: everything that moves at the frame rate, into k->fr */
static void ug_levels(Ungemach *k, const UgControls *c);
/* the waveforms are made again a slice a frame, the groups in turn, only while one is still to make: WAVE's place and
 * the groups' mips move only with the slow figures, which mark the groups whose waveform moved (ug_frame), so a frame
 * with nothing to make costs a test. A turn of WAVE is heard as soon as it was before the slow figures went to every 8th
 * frame (21 November 2026, the user: WAVE answered late). */
static void ug_slice(Ungemach *k)
{
    for (unsigned t = 0; t < UG_GROUPS; ++t) {
        const unsigned gi = k->slice++ & 3u;
        if (!k->wleft[gi]) continue;
        const unsigned from = (UG_SLICES - k->wleft[gi]) * UG_SLICE;
        --k->wleft[gi];
        make(k, gi, k->gmip[gi], (uint32_t)k->pos, from);
        return;
    }
}
/* every 4th frame (UG_SLOW): everything that moves slowly, standing for the frames since, into k->fr */
static void ug_frame(Ungemach *k, const UgControls *c, unsigned mult)
{
    const unsigned n = UG_FRAME * mult;   /* the frames these figures stand for: time-scaled steps take them all */
    /* ---- once a block: pitch, ratios, cutoff, level ---- */
    k->drift_count += n;
    if (k->drift_count >= 1u << 17) {
        k->drift_count = 0;
        for (unsigned i = 0; i < 2; ++i) k->target[i] = noise(k);
    }
    for (unsigned i = 0; i < 2; ++i) k->drift[i] += (k->target[i] - k->drift[i]) >> 11;
    int32_t cents = (k->drift[0] * UG_DRIFT_CENTS) >> 15;
    int32_t cut = ug_tone16[c->tone & 127] + ((k->drift[1] * UG_DRIFT_CUT16) >> 15);
    int32_t level = 4096;                                              /* Q12 */
    const int32_t mv = c->move & 127;                                  /* MOVE, Q6: 64 as designed */
#define MVQ 6
    if ((c->rate & 127) < 64) {
        /* free: three smoothed random curves at full depth, pitch at 0.7 of RATE's pace, cutoff at it, level at 1.3,
         * so the three seldom peak together */
        static const uint16_t pace[3] = { 179, 256, 333 };            /* Q8 */
        int32_t l[3];
        for (unsigned j = 0; j < 3; ++j) {
            uint32_t before = k->lfo_phase[j];
            k->lfo_phase[j] += (((uint32_t)(int32_t)ug_free_inc[c->rate & 63u] >> 8) * pace[j]) * n;
            if (k->lfo_phase[j] < before) k->lfo_from[j] = k->lfo_to[j], k->lfo_to[j] = noise(k);
            int32_t p = (int32_t)(k->lfo_phase[j] >> 17);              /* Q15 */
            int32_t s = (((p * p) >> 15) * (98304 - 2 * p)) >> 15;     /* 3p^2 - 2p^3 */
            l[j] = k->lfo_from[j] + (((k->lfo_to[j] - k->lfo_from[j]) * (s >> 1)) >> 14);
        }
        for (unsigned j = 0; j < 3; ++j) l[j] = (l[j] * mv) >> MVQ;   /* MOVE: the curves' depth */
        cents += (l[0] * UG_MOVE_CENTS) >> 15;
        /* the cutoff's curve: +-25 % of TONE's travel (UG_MOVE_CUT16 is 30 %) at every free RATE */
        cut += (((l[1] * UG_MOVE_CUT16) >> 15) * 3413) >> 12;
        level -= (((l[2] < 0 ? -l[2] : l[2]) * UG_MOVE_LEVEL) >> 15) >> 1;
    } else {
        /* synced: a pulse at the start of each cycle that falls away, opening the filter and lifting the level */
        int32_t e = (int32_t)((((uint32_t)(65535u - c->sync_phase) * (65535u - c->sync_phase)) >> 17));   /* Q15 */
        /* its height: 25 % of TONE's travel at S16's first step (64), rising over S16 to 35 % at 74, then 35 % */
        const unsigned r = (c->rate & 127u) - 64u;
        const int32_t sdep = r >= 10u ? 4779 : 3413 + (int32_t)(r * 1366u) / 10;   /* Q12 of UG_MOVE_CUT16 */
        cut += (((((e * UG_MOVE_CUT16) >> 15) * mv) >> MVQ) * sdep) >> 12;
        level -= ((((32767 - e) * UG_MOVE_LEVEL) >> 15) * mv) >> MVQ;
    }
    if (level < 0) level = 0;
    k->fr.cut0 = cut, k->fr.level0 = level;   /* before PNCH, which ug_levels adds every frame */
    /* DISS: between its steps by the halfword's low byte, then gliding there (about 90 ms), so a step is a slide,
     * never a stair, and a turn of the knob or an LFO on DISS runs as one glissando */
    {
        unsigned dv = c->diss & 127, nx = dv < 127u ? dv + 1u : dv;
        int32_t fr = (int32_t)c->diss_frac;
        int32_t t2 = (int32_t)ug_ratio2[dv] + ((((int32_t)ug_ratio2[nx] - (int32_t)ug_ratio2[dv]) * fr) >> 8);
        int32_t t3 = (int32_t)ug_ratio3[dv] + ((((int32_t)ug_ratio3[nx] - (int32_t)ug_ratio3[dv]) * fr) >> 8);
        t2 <<= 4, t3 <<= 4;
        if (k->r2q < 0) k->r2q = t2, k->r3q = t3;
        else k->r2q += ((t2 - k->r2q) >> 12) * (int32_t)n, k->r3q += ((t3 - k->r3q) >> 12) * (int32_t)n;
    }

    uint32_t inc1 = root_inc(c->ptch);
    inc1 += (uint32_t)(((int32_t)(inc1 >> 10) * ((cents * UG_CENT) >> 8)) >> 6);
    uint32_t g[3] = { inc1, (inc1 >> 10) * ((uint32_t)k->r2q >> 10), (inc1 >> 10) * ((uint32_t)k->r3q >> 10) };
    /* each voice's own drift: one voice a block may pick a new target, every voice glides towards its own */
    unsigned turn = k->vturn++ % UG_NVOICES;
    if ((next(k) >> 24) == 0) k->vtarget[turn] = (noise(k) * UG_VOICE_DRIFT * 256) >> 15;
    /* the waveforms: WAVE's place among the sixteen, gliding there, at the mip each group's pitch allows at the
     * oscillators' half rate (its top harmonic under 16 kHz / 1.625, below their 11 kHz); the subs one mip softer.
     * ug_slice makes one slice of one group a frame: every waveform is new again within 32 frames (12 ms). */
    int32_t want = (int32_t)((uint32_t)c->wave * (UG_WAVES - 1u) / 127u);
    if (want > (UG_WAVES - 1) << 8) want = (UG_WAVES - 1) << 8;
    if (k->pos < 0) k->pos = want;
    else {
        int32_t d = want - k->pos;
        const int32_t gl = UG_GLIDE * (int32_t)mult;   /* by the frames these figures stand for: the glide keeps its pace */
        k->pos += d > gl ? gl : d < -gl ? -gl : d;
    }
    const unsigned osh = 1u;
    for (unsigned gi = 0; gi < 3; ++gi) k->gmip[gi] = (uint8_t)mip_of(g[gi] + (g[gi] >> 1) + (g[gi] >> 3));
    {
        uint32_t h = inc1 >> 1;
        unsigned smip = mip_of(h + (h >> 1) + (h >> 3)) + 1u;
        k->gmip[3] = (uint8_t)(smip < UG_MIPS ? smip : UG_MIPS - 1u);
    }
    for (unsigned gi = 0; gi < UG_GROUPS; ++gi) {
        const uint32_t key = (uint32_t)k->pos | (uint32_t)k->gmip[gi] << 16;
        if (key != k->wkey[gi]) k->wkey[gi] = key, k->wleft[gi] = UG_SLICES;   /* made again from its first slice */
    }
    uint32_t sinc[UG_NSUBS];
    for (unsigned v = 0; v < UG_NSUBS; ++v) {
        uint32_t h = inc1 >> 1;
        sinc[v] = (h + (uint32_t)(((int32_t)(h >> 10) * ((ug_sub_cents[v] * UG_CENT) >> 8)) >> 6)) << 1;   /* half rate */
    }
    uint32_t inc[UG_NVOICES];
    for (unsigned v = 0; v < UG_NVOICES; ++v) {
        k->vdrift[v] += (k->vtarget[v] - k->vdrift[v]) >> ug_vglide[v];   /* each at its own pace */
        int32_t delta = ((ug_spread[v] * 256 + k->vdrift[v]) * UG_CENT) >> 16;   /* Q16 */
        uint32_t gv = g[ug_vgroup[v]];
        inc[v] = (gv + (uint32_t)(((int32_t)(gv >> 10) * delta) >> 6)) << osh;   /* half (or quarter) rate */
    }
    uint32_t minc = g[2] << osh;
    int32_t width = ug_width[c->sprd & 3];

    for (unsigned v = 0; v < UG_NVOICES; ++v) k->fr.inc[v] = inc[v];
    for (unsigned v = 0; v < UG_NSUBS; ++v) k->fr.sinc[v] = sinc[v];
    k->fr.minc = minc;
    k->fr.width = width;
    /* the fade-in, to half: the level everything is set for */
    k->fade += ((16384 - k->fade) * (int32_t)n) >> 14;
    if (k->fade > 16384) k->fade = 16384;
}

/* every frame: PNCH's punch and what it moves (cutoff, DIRT and level), so a trig's punch is as sharp as before
 * however seldom the slow figures are worked out. The punch falls by the frames that passed, a skipped one too. */
static void ug_levels(Ungemach *k, const UgControls *c)
{
    {
        unsigned fr = c->frames ? c->frames : 1u;
        if (fr > 200u) k->pk = k->pc = 0;
        const int32_t fall = ug_punch_fall[c->pnch & 127u];
        for (; fr && (k->pk | k->pc); --fr) k->pk = (k->pk * fall) >> 15, k->pc = (k->pc * UG_CRACK_FALL) >> 15;
    }
    const int32_t amt = (int32_t)((c->pnch & 127u) * 71u) / 127;   /* PNCH straight, 0..71 */
    const int32_t pe = (k->pk * amt) >> 7, ce = (k->pc * amt) >> 7;            /* Q15 */
    int32_t cut = clamp(k->fr.cut0 + ((pe * UG_PUNCH_CUT16) >> 15), 0, UG_CUT_STEPS - 1);
    unsigned dirt = (c->dirt & 127) + (unsigned)((pe * UG_PUNCH_DIRT) >> 15);
    if (dirt > 127u) dirt = 127u;
    k->fr.f = ug_svf_f[cut];
    k->fr.q = (int32_t)ug_q[dirt], k->fr.sat = (int32_t)ug_sat[dirt];
    k->fr.fm = (int32_t)ug_fm[dirt], k->fr.fbk = (int32_t)ug_fb[dirt];
    k->fr.gain = (((UG_DRONE_GAIN * k->fr.level0) >> 12) * (int32_t)ug_sat_gain[dirt]) >> 12;   /* Q12 */
    k->fr.gfd = (k->fr.gain * (k->fade >> 3)) >> 12;
    k->fr.gfd += (k->fr.gfd * (((pe * (UG_PUNCH_LIFT >> 4)) >> 11) + ((ce * (UG_CRACK_LIFT >> 4)) >> 11))) >> 12;   /* PNCH lifts the level */
    {
        /* the trapezoidal low-pass: a1 = 1 / (1 + g (g + k)), a2 = g a1, a3 = g a2, k its damping (DIRT's q) */
        const int32_t gg = ug_tpt_g[cut], den = 4096 + ((gg * (gg + k->fr.q)) >> 12);
        k->fr.a1 = (4096 * 4096) / den, k->fr.a2 = (gg * k->fr.a1) >> 12, k->fr.a3 = (gg * k->fr.a2) >> 12;
    }
    k->fr.ready = 1;
}

/* The voices, a waveform a run: left root 3, second 3, third 2; right root 3, second 2, third 3 (gen_tables.py's
 * runs), each read at the nearest sample of its group's waveform */
#define UG_NR(W, V) (ph[V] += inc[V], (int32_t)(W)[(ph[V] + pm) >> 24])

/* The drone, a frame's call at a time. CORE is inlined twice: into ug_render_part (int16 arrays, the host tests) and
 * into ug_render_out (straight into the packer's buffer, machine.c), so the sample loop has no branch for it. */
/* The per-sample state sits in registers for the call and the soft bend runs at the half rate (A/B on the live set,
 * 21 November 2026, with the per-call state out of bss: 43-45 µs a frame down to 37-38, the same sound) */
static inline __attribute__((always_inline)) void ug_core(Ungemach *k, const UgControls *c, int16_t *left, int16_t *right,
                                                          volatile uint32_t *dst, unsigned n, int fresh)
{
    /* the slow figures every 8th frame (UG_SLOW, standing for the frames since); PNCH's figures with them, and every
     * frame while a punch runs (A/B on the live set, 20 November 2026: 5 µs a frame less, heard as the same) */
    const unsigned slow = UG_SLOW;
    const int32_t a1 = k->fr.a1, a2 = k->fr.a2, a3 = k->fr.a3;   /* the trapezoidal low-pass, Q12 */
    if (!k->fr.ready) ug_frame(k, c, 1u), ug_levels(k, c), ug_slice(k), k->vskip = (uint8_t)(slow - 1u);
    else if (fresh) {
        if (k->vskip || 0) {
            if (k->vskip) --k->vskip;
            if ((k->pk | k->pc) && (c->pnch & 127u)) ug_levels(k, c);
        } else ug_frame(k, c, slow), ug_levels(k, c), k->vskip = (uint8_t)(slow - 1u);
        if (k->wleft[0] | k->wleft[1] | k->wleft[2] | k->wleft[3]) ug_slice(k);
    }
    const uint32_t *inc = k->fr.inc, *sinc = k->fr.sinc;
    const uint32_t minc = k->fr.minc;
    const int32_t sat = k->fr.sat, fm = k->fr.fm, fbk = k->fr.fbk, width = k->fr.width;
    const int16_t *st = k->work[3], *w0 = k->work[0], *w1 = k->work[1], *w2 = k->work[2];
    int32_t lowl = k->lowl, bandl = k->bandl, lowr = k->lowr, bandr = k->bandr;
    int32_t dcl = k->dcl, dcr = k->dcr, fb = k->fb;
    const int32_t gfd = k->fr.gfd;
    /* the state each sample touches, in registers for the call */
    unsigned half = k->half, subq = k->subq;
    int32_t xl1 = k->xl1, xr1 = k->xr1, nlp = k->noise_lp, subl = k->subl, subr = k->subr, subl0 = k->subl0, subr0 = k->subr0;
    uint32_t phm = k->phm, rng = k->rng;
    for (unsigned i = 0; i < n; ++i) {
        int32_t xl, xr;
        if ((half ^= 1u) != 0) {
            /* ---- the drone, every other sample: the voices, the subs and the noise, then the low-pass (twice a step,
             * the step's input held, so TONE and DIRT keep the tone they have at the full rate), the saturation, the DC
             * blocker, a side each; a half-band interpolator draws the full rate from them ---- */
            uint32_t *ph = k->ph;
            int32_t sl, sr;
            phm += minc;
            /* a sine at the third ratio and the drone's own last sample push every voice's phase (DIRT) */
            const uint32_t pm = 0 ? 0u : (uint32_t)(sine(phm) * fm + clamp(fb, -32767, 32767) * fbk) << 1;
            {
            /* all sixteen read at the nearest sample: their density for little (measured 5 µs a frame under ten read
             * between samples and six at the nearest, 20 November 2026, and heard as all but the same) */
            sl = UG_NR(w0, 0) + UG_NR(w0, 1) + UG_NR(w0, 2) + UG_NR(w1, 3) + UG_NR(w1, 4) + UG_NR(w1, 5) + UG_NR(w2, 6) + UG_NR(w2, 7);
            sr = UG_NR(w0, 8) + UG_NR(w0, 9) + UG_NR(w0, 10) + UG_NR(w1, 11) + UG_NR(w1, 12) + UG_NR(w2, 13) + UG_NR(w2, 14) + UG_NR(w2, 15);
            }
            /* the dark noise, every other oscillator step (A/B on the live set, 20 November 2026: heard as the same) */
            if (!(subq & 1u)) { rng ^= rng << 13, rng ^= rng >> 17, rng ^= rng << 5; nlp += (((int32_t)rng >> 16) - nlp) >> 2; }
            const int32_t nz = (nlp * UG_NOISE) >> 12;
            {
                /* the subs, an octave under the root and a mip softer: every 4th oscillator step (an eighth of the rate),
                 * a straight line from their last to their newest between */
                const unsigned q4 = subq = (subq + 1u) & 3u;
                if (!q4) {
                    k->phs[0] += sinc[0] << 2, k->phs[1] += sinc[1] << 2, k->phs[2] += sinc[2] << 2, k->phs[3] += sinc[3] << 2;
                    subl0 = subl, subr0 = subr;
                    subl = ((look(st, k->phs[0]) + look(st, k->phs[1])) * UG_SUB_LEVEL) >> 12;
                    subr = ((look(st, k->phs[2]) + look(st, k->phs[3])) * UG_SUB_LEVEL) >> 12;
                }
                sl += subl0 + (((subl - subl0) * (int32_t)(q4 + 1u)) >> 2);
                sr += subr0 + (((subr - subr0) * (int32_t)(q4 + 1u)) >> 2);
            }
            int32_t ol, or_;
            {
              {
                const int32_t mid = (sl + sr) >> 3, side = (((sl - sr) >> 3) * width) >> 12;
                const int32_t il = mid + side + nz, ir = mid - side + nz;
                /* the low-pass: trapezoidal (Zavalishin's state-variable filter in Simper's form), once a step at the
                 * oscillators' half rate, without the peak near the top a Chamberlin filter has there (it let the
                 * nearest-sample reads' hiss through); band and low hold its two states, to 2^18. A/B on the live set,
                 * 20 November 2026: 1-2 µs a frame under a Chamberlin filter run twice a step, and heard as better. */
                int32_t yl = il, yr = ir;
                if (!0) {
                    int32_t v3 = il - lowl, v1 = (a1 * bandl + a2 * v3) >> 12;
                    yl = lowl + ((a2 * bandl + a3 * v3) >> 12);
                    bandl = clamp(2 * v1 - bandl, -(1 << 18), 1 << 18), lowl = clamp(2 * yl - lowl, -(1 << 18), 1 << 18);
                    v3 = ir - lowr, v1 = (a1 * bandr + a2 * v3) >> 12;
                    yr = lowr + ((a2 * bandr + a3 * v3) >> 12);
                    bandr = clamp(2 * v1 - bandr, -(1 << 18), 1 << 18), lowr = clamp(2 * yr - lowr, -(1 << 18), 1 << 18);
                }
                if (0) { ol = (yl * gfd) >> 12, or_ = (yr * gfd) >> 12, fb = ol; } else {
                ol = (smoothstep((yl * sat) >> 4) * gfd) >> 12, or_ = (smoothstep((yr * sat) >> 4) * gfd) >> 12;
                fb = ol;
                /* a DC blocker near 14 Hz, a shift at the half rate: PNCH and DIRT push the drone off centre */
                dcl += ((ol * 256) - dcl) >> 8, dcr += ((or_ * 256) - dcr) >> 8;
                ol -= dcl >> 8, or_ -= dcr >> 8;
                }
              }
            }
            {
                /* the full rate: halfway between the last two, then the newest (A/B on the live set, 20 November 2026:
                 * heard as the same as a four-point half-band) */
                /* the soft bend at the half rate, before the line between: half the calls, nearly the same */
                ol = bend(ol), or_ = bend(or_);
                xl = (xl1 + ol) >> 1, xr = (xr1 + or_) >> 1;
                xl1 = ol, xr1 = or_;
            }
        } else xl = xl1, xr = xr1;
        const int32_t yl = xl, yr = xr;
        if (dst) dst[2u * i] = (uint32_t)(uint16_t)yl << 16, dst[2u * i + 1u] = (uint32_t)(uint16_t)yr << 16;
        else left[i] = (int16_t)yl, right[i] = (int16_t)yr;
    }
    k->half = (uint8_t)half, k->subq = (uint8_t)subq, k->xl1 = xl1, k->xr1 = xr1, k->noise_lp = nlp;
    k->subl = subl, k->subr = subr, k->subl0 = subl0, k->subr0 = subr0, k->phm = phm, k->rng = rng;
    k->lowl = lowl, k->bandl = bandl, k->lowr = lowr, k->bandr = bandr;
    k->dcl = dcl, k->dcr = dcr, k->fb = fb;
}
void ug_render_part(Ungemach *k, const UgControls *c, int16_t *left, int16_t *right, unsigned n, int fresh)
{
    ug_core(k, c, left, right, 0, n, fresh);
}
void ug_render_out(Ungemach *k, const UgControls *c, volatile uint32_t *dst, unsigned n, int fresh)
{
    ug_core(k, c, 0, 0, dst, n, fresh);
}
#undef UG_NR

void ug_render(Ungemach *k, const UgControls *c, int16_t *left, int16_t *right, unsigned n)
{
    ug_render_part(k, c, left, right, n, 1);
}
