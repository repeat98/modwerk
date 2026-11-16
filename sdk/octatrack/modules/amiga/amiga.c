/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Jannik Aßfalg
 *
 * AMIGA: a track machine that plays the track's Flex sample the way a home
 * computer's 8-bit sound chip and its tracker software did. Stock's FLEX reader
 * fetches the sample (PTCH, STRT, LEN, RATE, slices, loops as stock). Before the
 * DSP repitches it, this reworks the source PCM in the frame packet: held at a
 * lower storage rate (SRR), in a word of 4 to 16 bits (BITS), through a fixed
 * two-pole lowpass (LED). And it stretches in cycles, as the samplers of that time
 * did: every cycle (GRN) it restarts the reader where the sample would be at speed
 * SPD, whatever PTCH is, the way stock's own retrig restarts it, and the last grain
 * goes on under the new one for half a cycle, fading out, read from the sample
 * itself, as Amigo's grains overlap. A sliced note stretches inside its slice. So pitch
 * and time come apart, with that flutter.
 *
 * SPD and GRN sit on SRC slots 4 and 5, where FLEX has RTRG and RTIM; slot 3 stays
 * stock's RATE (forwards, backwards, slower), which the stretch follows. LED, SRR, STR and BITS are SRC SETUP's last four bytes (LEN, RATE, TSTR,
 * TSNS). Stock must never read ours as its own: START and render show stock a
 * plain FLEX for the call and put the bytes back (the base's NATIVE_FLEX
 * contract, sdk/machines/octatrack/HOOKS.md ot_machines / ot_machine_starts).
 *
 * No stock code is patched and no stock bytes are stored: the page is cloned
 * from stock's FLEX page at run time, as the other source machines do.
 * generate.py compiles this into amiga_core.s; verify.py runs the engine on the
 * host. The frame interrupt pays for every instruction and every line of memory
 * here, so the common cases are short. */
#include <stdint.h>

typedef struct {
    /* What a note at rest touches first, in one cache line. */
    uint32_t rest;          /* 1: the note plays at its own speed and pitch, in step, nothing fading (amiga_rest takes the call); 2: it is not stretched at all */
    uint32_t left;          /* output samples until a note at rest reaches its end */
    uint32_t rem;           /* the place's remainder below a Q6 frame while RATE slows the note (in 1/0x3f00) */
    uint32_t back;          /* the reader runs backwards (RATE below 0): every frame here is then counted from the note's end, so the reader still counts up */
    int32_t l, r;           /* the stored sample being held */
    uint32_t phase;         /* Q16 position within a stored sample */
    int32_t al, ar;         /* the input since the last stored sample, summed (>> 4) */
    uint32_t count;
    int32_t ic[2][2];       /* the output filter: channel, two integrators (Q8) */
    uint32_t pos;           /* the stretch: where the sample should be by now, Q6 frames from the note's start */
    uint32_t window;        /* the note's length in frames (STRT to its end); 0: this note is not stretched */
    uint32_t grain, played; /* where the reader last started, and the frames it has read since */
    uint32_t since, got;    /* output samples since the last cycle, and the frames read in them */
    uint32_t first, length; /* the note's start within the sample, and the sample's length, in frames */
    uint32_t sample, flags; /* the trig's START arguments, for the restarts */
    uint32_t origin, end;   /* the note's first and last frame as stock counts them: a restart moves one of them, and the reader needs it back */
    int32_t last[2], off[2]; /* the last frame read, and the step a restart left (>> 9), which runs out over `fade` frames */
    uint32_t fade, jump;
    /* The crossfade after a restart: the last grain goes on from sample frame `tail` (downwards when `down`), read from
     * the sample itself, and fades out under the new one over `xlen` frames, as Amigo's grains overlap. */
    uint32_t tail, down, xk, xlen, xstep, xnext;
    uintptr_t page;         /* the sample page read last: its address, first frame and frames */
    uint32_t pfirst, pcount;
    uint32_t slice, strt;   /* a sliced note: its slice + 1 (0: not sliced), and the STRT that picked it */
} AmigaVoice;
#define ONE 0x10000u /* Q16: one stored sample */
#define KEEP (-1)
#define OVER (-2)
#define NONE 0xffffffffu
#define FADE 32u

/* Where the crossfade reads the last grain: the track's sample. `locate` gives the page that holds `frame` (its
 * address, first frame and frame count), 0 when there is none; without `locate`, `ctx` holds all `frames` in one run.
 * Big-endian words of `bytes` (2 or 3; the top two are read) for `channels` (1 or 2) a frame. */
typedef struct {
    uintptr_t (*locate)(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count);
    const void *ctx;
    uint32_t frames, bytes, channels;
} AmigaSample;

/* The lowpass: two poles, Butterworth, about 3.3 kHz for a 44.1 kHz sample. tan(pi fc / 44100) and 1/Q in Q13. */
#define LED_TAN 1962
#define LED_G (LED_TAN << 18)
#define LED_A1 (((1 << 26) / (8192 + ((LED_TAN * (LED_TAN + 11585)) >> 13))) << 18) /* Q31 */

/* x * c for a Q31 c. The ColdFire has no 64-bit product in C, and two 32-bit ones a multiply are dear in the
 * frame interrupt (S950's filter, MKII, 10 November 2026), so the target uses its multiply-accumulate unit:
 * fractional mode, as stock leaves it, the product's top bits read and cleared in one move. */
#ifdef AMIGA_HOST
static inline int32_t scale(int32_t x, int32_t c) { return (int32_t)(((int64_t)x * c) >> 31); }
#define MAC_ENTER() 0
#define MAC_LEAVE(saved) ((void)(saved))
#else
static inline int32_t scale(int32_t x, int32_t c)
{
    __asm__("mac.l %1,%0,%%acc0\n\tmovclr.l %%acc0,%0" : "+d"(x) : "d"(c));
    return x;
}
/* Fractional, unsaturated, truncating; accumulator 0 empty. Stock's own render leaves it empty too. */
static inline uint32_t mac_enter(void)
{
    uint32_t saved, mode = 0x20, drop;
    __asm__("move.l %%macsr,%0\n\tmove.l %2,%%macsr\n\tmovclr.l %%acc0,%1" : "=&d"(saved), "=&d"(drop) : "d"(mode));
    (void)drop;
    return saved;
}
#define MAC_ENTER() mac_enter()
#define MAC_LEAVE(saved) __asm__("move.l %0,%%macsr" : : "d"(saved))
#endif
/* A two-pole lowpass (a trapezoidal state-variable filter). The signal is 15 bits and 8 more below the point. */
static inline int32_t lowpass(int32_t *ic, int32_t in)
{
    int32_t v1 = scale(ic[0] + scale(in - ic[1], LED_G), LED_A1);
    int32_t v2 = ic[1] + scale(v1, LED_G);
    ic[0] = 2 * v1 - ic[0]; ic[1] = 2 * v2 - ic[1];
    v2 = (v2 + 128) >> 8;
    return (v2 > 16383 ? 16383 : v2 < -16384 ? -16384 : v2) * 131072;
}

/* A sample's top 16 bits. The target is big-endian: they are the long's first word. */
#ifdef AMIGA_HOST
static inline int16_t top(const int32_t *a) { return (int16_t)(*a >> 16); }
#else
typedef int16_t __attribute__((may_alias)) Top;
static inline int16_t top(const int32_t *a) { return *(const Top *)a; }
#endif
/* x rounded to the word `mask` keeps (half: half its last bit), full scale staying full scale. */
#ifdef AMIGA_HOST
static inline int32_t rounded(int32_t x, int32_t half, uint32_t mask) { return (int32_t)((uint32_t)(x > INT32_MAX - half ? x : x + half) & mask); }
#else
static inline int32_t rounded(int32_t x, int32_t half, uint32_t mask)
{
    __asm__("add.l %1,%0\n\tsats.l %0" : "+d"(x) : "d"(half)); /* an overflow saturates, which the mask then cuts to the top word */
    return (int32_t)((uint32_t)x & mask);
}
#endif

/* Frame `frame` of the sample, top 16 bits a channel (both the same for a mono sample); silence outside it. */
static inline void sample_frame(AmigaVoice *v, const AmigaSample *s, uint32_t frame, int32_t *o)
{
    o[0] = o[1] = 0;
    if (frame >= s->frames) return;
    if (frame - v->pfirst >= v->pcount) { /* another page */
        uint32_t first = 0, count = s->frames;
        uintptr_t page = s->locate ? s->locate(s->ctx, frame, &first, &count) : (uintptr_t)s->ctx;
        v->page = page; v->pfirst = first; v->pcount = page ? count : 0;
        if (!page) return;
    }
    const uint8_t *p = (const uint8_t *)v->page + (frame - v->pfirst) * s->bytes * s->channels;
    o[0] = (int16_t)(p[0] << 8 | p[1]);
    o[1] = s->channels > 1 ? (int16_t)(p[s->bytes] << 8 | p[s->bytes + 1]) : o[0];
}
/* After a restart, the last grain's continuation under the new one, fading out: the first frame is the last grain's
 * next, the new grain takes over in a straight line and is alone after `xlen` frames. First of the three. */
void amiga_cross(AmigaVoice *v, int32_t *a, unsigned n, const AmigaSample *s)
{
    uint32_t k = v->xk, len = v->xlen, step = v->xstep, w = k * step, frame = v->tail, dir = v->down ? 0xffffffffu : 1u;
    if (k >= len) { v->xlen = 0; return; }
    for (; n && k < len; --n, ++k, a += 2, w += step, frame += dir) {
        int32_t o[2];
        sample_frame(v, s, frame, o);
        int32_t q = (int32_t)(w >> 16), l = top(a), r = top(a + 1); /* Q15: the new grain's share */
        a[0] = (o[0] + (((l - o[0]) * q) >> 15)) * 65536;
        a[1] = (o[1] + (((r - o[1]) * q) >> 15)) * 65536;
    }
    v->xk = k; v->tail = frame;
    if (k >= len) v->xlen = 0;
}
/* The reader was restarted at `frame` of the note. `tail`: the sample frame the last grain would have read next, NONE
 * when the sample cannot be read; `down`: it read downwards. The grains then cross over half the last cycle's frames,
 * as Amigo's do. Without a tail, or when a restart cuts a crossfade short, the step left is faded out (amiga_declick). */
void amiga_seek(AmigaVoice *v, uint32_t frame, uint32_t tail, unsigned down)
{
    v->grain = frame; v->played = 0;
    if (tail == NONE || v->xlen) v->jump = 1;
    v->xlen = 0;
    if (tail == NONE) return;
    uint32_t len = v->xnext < 16u ? 16u : v->xnext;
    v->tail = tail; v->down = down != 0; v->xk = 0; v->xlen = len; v->xstep = 0x7fff0000u / len; v->pcount = 0;
}

/* A restart makes the sample step, which clicks. Carry the step as an offset that runs out over FADE
 * frames instead: the first frame after it continues where the last one was. After amiga_cross, before amiga_crunch. */
static __attribute__((noinline)) void declick_fade(AmigaVoice *v, int32_t *a, unsigned n)
{
    if (v->jump) {
        v->jump = 0; v->fade = FADE;
        v->off[0] = (v->last[0] >> 9) - (a[0] >> 9); v->off[1] = (v->last[1] >> 9) - (a[1] >> 9);
    }
    if (v->fade > FADE) v->fade = 0; /* a state nobody set */
    for (unsigned i = 0; i < n && v->fade; ++i, --v->fade)
        for (unsigned c = 0; c < 2; ++c) {
            int32_t s = (a[2 * i + c] >> 2) + v->off[c] * (int32_t)(v->fade * 128u / FADE); /* off * fade / FADE, a quarter of it: no overflow */
            a[2 * i + c] = (s > 0x1fffffff ? 0x1fffffff : s < -0x20000000 ? -0x20000000 : s) * 4;
        }
}
void amiga_declick(AmigaVoice *v, int32_t *a, unsigned n)
{
    if (!n) return;
    if (v->jump || v->fade) declick_fade(v, a, n); /* rarely: most frames only note where the sample is */
    v->last[0] = a[2 * n - 2]; v->last[1] = a[2 * n - 1];
}

/* n stereo frames, L then R longs, the sample in the high bits: the input is averaged over each stored
 * sample, stored at a lower rate (srr 0-127: 16/(16+srr) of the source's) in a 4- to 16-bit word (bits
 * 0-12; 12 keeps the source's word) and held, then through the lowpass (led). All three off leaves the
 * PCM untouched. */
static __attribute__((noinline)) void crunch_stored(AmigaVoice *v, int32_t *a, unsigned n, unsigned srr, uint32_t mask, unsigned led)
{
    const uint32_t inc = (16u * ONE) / (16u + srr);
    const int32_t half = (int32_t)(~mask >> 1); /* round to nearest, not down */
    uint32_t mac = led ? MAC_ENTER() : 0;
    if (v->phase > 2u * ONE || v->count > 16u) v->phase = ONE, v->count = 0, v->al = v->ar = 0; /* a state nobody set */
    int same = v->l == v->r; /* a mono sample pays for one channel of filter */
    for (unsigned i = 0; same && i < n; ++i) same = a[2 * i] == a[2 * i + 1];
    uint32_t phase = v->phase, count = v->count; /* the state in registers for the loop: a store to the PCM could be any of it */
    int32_t al = v->al, ar = v->ar, hl = v->l, hr = v->r;
    int32_t f0[2] = {v->ic[0][0], v->ic[0][1]}, f1[2] = {v->ic[1][0], v->ic[1][1]};
    for (; n; --n, a += 2) {
        if (srr) al += a[0] >> 4, ar += a[1] >> 4, ++count;
        if (phase >= ONE) {
            phase -= ONE;
            int32_t l = a[0], r = a[1];
            if (count > 1) l = (al / (int32_t)count) << 4, r = (ar / (int32_t)count) << 4;
            al = ar = 0; count = 0;
            hl = rounded(l, half, mask); hr = rounded(r, half, mask);
        }
        phase += inc;
        if (led) {
            int32_t l = lowpass(f0, (hl >> 17) * 256);
            a[0] = l;
            if (same) f1[0] = f0[0], f1[1] = f0[1], a[1] = l;
            else a[1] = lowpass(f1, (hr >> 17) * 256);
        } else a[0] = hl, a[1] = hr;
    }
    v->phase = phase; v->count = count; v->al = al; v->ar = ar; v->l = hl; v->r = hr;
    if (led) {
        v->ic[0][0] = f0[0]; v->ic[0][1] = f0[1]; v->ic[1][0] = f1[0]; v->ic[1][1] = f1[1];
        MAC_LEAVE(mac);
    }
}
void amiga_crunch(AmigaVoice *v, int32_t *a, unsigned n, unsigned srr, unsigned bits, unsigned led)
{
    if (srr > 127) srr = 127;
    if (!srr && bits >= 12 && !led) return;
    uint32_t mask = bits >= 12 ? 0xffffffffu : 0xffffffffu << (28u - bits);
    if (srr || led || v->phase != ONE || v->count > 16u || !n) { crunch_stored(v, a, n, srr, mask, led); return; }
    /* Every sample kept and stored at once: only the word, in place. */
    const int32_t half = (int32_t)(~mask >> 1);
    for (int32_t *end = a + 2u * n; a != end; ++a) *a = rounded(*a, half, mask);
    v->l = a[-2]; v->r = a[-1]; v->count = 0; v->al = v->ar = 0;
}

/* A new note of `window` frames. */
void amiga_note(AmigaVoice *v, uint32_t window)
{
    v->rest = v->left = v->rem = v->back = 0;
    v->phase = ONE; /* it takes its first sample at once */
    v->count = 0; v->al = v->ar = 0;
    v->pos = v->grain = v->played = v->since = v->got = v->fade = v->jump = v->xlen = v->xnext = v->pcount = 0;
    v->window = window;
}
/* Which way the reader runs in this call. When it turns, the note goes on from where the reader is, counted from
 * the note's other end, without a crossfade: 1 then, else 0. */
int amiga_face(AmigaVoice *v, int back, unsigned loop)
{
    if (!v->window || (v->back != 0u) == (back != 0)) return 0;
    uint32_t reader = v->grain + v->played;
    if (loop) reader %= v->window;
    else if (reader > v->window) reader = v->window;
    v->back = back != 0;
    v->grain = v->window - reader; v->played = 0;
    v->pos = v->grain << 6; v->rem = 0; v->since = v->got = 0; v->xlen = 0; v->jump = 0; v->fade = 0; v->rest = 0;
    return 1;
}

/* One render call made `out` output samples from `src` source frames. Each cycle (96 samples to 94 ms,
 * grn 0-127) the sample should be spd/64 output samples a sample further on, whatever the pitch read.
 * Returns the frame, from the note's start, to restart the reader at (then call amiga_seek with the
 * frame it really started at); KEEP; or OVER at the note's end. A reader within 16 frames of the place
 * is left alone, so speed 1 at pitch 0 is plain playback. The crossfade after a restart lasts half the
 * frames the cycle read. */
static int32_t stretch_step(AmigaVoice *v, unsigned out, unsigned src, uint32_t advance, unsigned grn, unsigned loop)
{
    if (!v->window) return KEEP;
    if (grn > 127) grn = 127;
    v->pos += advance; v->played += src; v->since += out; v->got += src;
    uint32_t cycle = 96u + grn * grn / 4u, reader = v->grain + v->played;
    if (v->since < cycle) return KEEP;
    uint32_t got = v->got;
    v->since = v->got = 0;
    uint32_t at = v->pos >> 6;
    if (at >= v->window) {
        if (!loop) { v->window = 0; v->xlen = 0; return OVER; }
        at %= v->window; v->pos = at << 6 | (v->pos & 63u);
    }
    if (loop && reader >= v->window) reader %= v->window; /* stock looped by itself */
    int32_t drift = (int32_t)(at - reader);
    if (drift >= -16 && drift <= 16) return KEEP;
    v->xnext = got / 2u;
    return (int32_t)at;
}

/* And it notes whether the next calls can rest: at speed 64, a frame read for every output sample, the reader where
 * the note should be and nothing fading, a cycle changes nothing but its own count. */
int32_t amiga_stretch(AmigaVoice *v, unsigned out, unsigned src, unsigned spd, unsigned grn, unsigned loop)
{
    if (spd > 127) spd = 127;
    int32_t at = stretch_step(v, out, src, spd * out, grn, loop);
    v->rest = 0;
    if (!v->window) { v->rest = 2; return at; }
    if (at != KEEP || spd != 64u || v->xlen || v->jump || v->fade || v->got != v->since || (v->pos & 63u)) return at;
    uint32_t place = v->pos >> 6, reader = v->grain + v->played;
    if (place < v->window && (reader == place || (loop && reader % v->window == place))) /* a looped note's reader counts on past the end */
        v->rest = 1, v->left = v->window - place;
    return at;
}
/* The same while RATE runs the reader at rate/full of its speed, either way: the place moves that much slower too, so
 * RATE changes speed and pitch together as on a FLEX track and SPD stretches on top. STR's SYNC puts the project's
 * tempo over the sample's into the same fraction, which may then be above one. `level`: SPD is 64 and the pitch
 * is the sample's own, so the place is simply where the reader is, whatever stock's exact rate. */
int32_t amiga_stretch_rate(AmigaVoice *v, unsigned out, unsigned src, unsigned spd, unsigned grn, unsigned loop, uint32_t rate, uint32_t full, int level)
{
    if (spd > 127) spd = 127;
    if (!full) full = 1;
    uint32_t advance = (uint32_t)src << 6;
    if (!level) {
        uint32_t sum = v->rem + spd * out * rate;
        advance = sum / full; v->rem = sum % full;
    }
    v->rest = 0;
    return stretch_step(v, out, src, advance, grn, loop);
}
/* Before the three, for a render call of `out` output samples that read `src` frames. 1: the note rests through it:
 * nothing is fading, so skip amiga_cross and amiga_declick, and call amiga_pass where amiga_stretch would be. 2: the
 * note is not stretched: skip both and the stretch. 0: go on as usual. */
int amiga_rest(AmigaVoice *v, unsigned out, unsigned src, unsigned spd)
{
    if (v->rest == 2u) return 2;
    if (v->rest && spd == 64u && src == out && out < v->left) return 1;
    v->rest = 0;
    return 0;
}
/* A call at rest counted as amiga_stretch would have counted it: the place, the frames read and the cycle. */
void amiga_pass(AmigaVoice *v, unsigned out, unsigned grn)
{
    if (grn > 127) grn = 127;
    uint32_t cycle = 96u + grn * grn / 4u;
    v->pos += 64u * out; v->played += out; v->since += out; v->got += out; v->left -= out;
    if (v->since >= cycle) v->since = v->got = 0;
}

/* STR's PCH: the stretch as a pitch shift. The PTCH offset for a length in percent, in SRC units (256 a
 * knob step, five steps a semitone), an octave either way at most: 200 is +12 semitones, 50 is -12. */
int amiga_shift(unsigned percent)
{
    static const uint8_t semitone[13] = {100, 106, 112, 119, 126, 133, 141, 150, 159, 168, 178, 189, 200};
    int down = percent < 100u;
    if (!percent) return 0;
    if (down) percent *= 2u;
    if (percent < 100u) percent = 100u;
    if (percent >= 200u) return down ? 0 : 15360;
    unsigned k = 0;
    while (semitone[k + 1] <= percent) ++k;
    return (int)(k * 1280u + (percent - semitone[k]) * 1280u / (semitone[k + 1] - semitone[k])) - (down ? 15360 : 0);
}

/* STRT (0-0x7fff: the fraction of a `length`-frame sample) that starts the reader at frame `at`. */
uint32_t amiga_strt(uint32_t at, uint32_t length)
{
    while (length >> 16) length >>= 1, at >>= 1;
    uint32_t f = length ? (at << 15) / length : 0;
    return f > 0x7fffu ? 0x7fffu : f;
}
/* And the frame that STRT starts at. */
uint32_t amiga_frame(uint32_t strt, uint32_t length) { return (length >> 15) * strt + (((length & 32767u) * strt) >> 15); }

#ifndef AMIGA_HOST
#include "modwerk_events.h"
#include "modwerk_page.h"

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define FLEX_RENDER ((int (*)(unsigned, unsigned, unsigned, unsigned))(uintptr_t)0x40004008u)
#define FLEX_START ((int (*)(unsigned, unsigned, unsigned))(uintptr_t)0x4000f450u)
#define FP_PTR 0x800062a8u     /* the track's live parameter lane this frame */
#define CURSOR 0x80001c80u     /* the frame packer's write position */
#define TEMPO24 0x8000181cu   /* the project's tempo, BPM x 24, as stock publishes it every frame */
#define VOICE 0x800049d8u      /* stock's voice records, 168 bytes a track: +0 sounding, +4 its slot's state, +8 its sample's record, +40/+44 the note's first and last frame, +68 the reader */
#define STOCK_RTRG 0x00004000u /* SRC words 4 and 5: RTRG 0, RTIM centre */

static AmigaVoice voices[8];

/* The track's Flex sample in stock's sample memory, for the crossfade: pages of 6144 bytes of big-endian PCM. The layout
 * and its checks are those FRACT's Flex adapter found (ex1010, MIT): the pages' base at 0x4000045e and count at
 * 0x40096f82, each slot's first page index in the table at *0x80006918 and the page numbers in the map at *0x80006914. */
typedef struct { uint32_t slot, perpage; } Pages;
static Pages pages[8];
static AmigaSample samples[8];
static uintptr_t flex_page(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    const Pages *p = ctx;
    uintptr_t bases = U32(0x80006918u), map = U32(0x80006914u);
    uint32_t total = U32(0x40096f82u), index, page;
    if (((bases - 0x46000000u) | (map - 0x46000000u)) >= 0x02000000u) return 0;
    index = U32(bases + 4u * p->slot) + frame / p->perpage;
    if (index > total || !(page = U16(map + 2u * index)) || page > total) return 0;
    *first = frame - frame % p->perpage; *count = p->perpage;
    return U32(0x4000045eu) + page * 6144u;
}
/* A recorder buffer's pages change while it records: read it only while its recorder is idle in both of stock's banks
 * (the state bytes the base's sample editor reads, module-adapters/sample_editor_board.c). */
static int recorder_idle(uint32_t slot)
{
    unsigned t = slot - 128u, sel = U32(0x80004f18u) >> t & 1u;
    return !U8(0x80004f1eu + 84u * (t + 8u * sel)) && (U8(0x80004f1eu + 84u * (t + 8u * (1u - sel))) | 2u) == 2u;
}
/* Describe the track's sample for flex_page: 1 when it is a Flex slot laid out as known, a file or an idle recorder
 * buffer. Otherwise a restart fades the step out instead. */
static int flex_sample(unsigned track, uintptr_t voice)
{
    uint32_t taken = 14602u - U32(0x40096f82u), m = U32(voice + 4u) - 0x46c922c4u, slot = m / 44u;
    if (taken >= 14602u || U32(0x4000045eu) - 0x40a955e0u > (taken & 0xffffu) * 6144u || m % 44u || slot >= 136u) return 0;
    if (slot >= 128u && !recorder_idle(slot)) return 0;
    uintptr_t at = 0x46c922c4u + m;
    uint32_t mode = U32(at), frames = U32(at + 16u), id = U32(at + 20u);
    if (mode > 3u || U32(at + 8u) || frames - 1u >= 44860416u || !id || id != U32(0x46c920a4u + 4u * slot)) return 0;
    AmigaSample *s = &samples[track];
    s->bytes = mode < 2u ? 3u : 2u; s->channels = (mode & 1u) + 1u; s->frames = frames; s->locate = flex_page; s->ctx = &pages[track];
    pages[track].slot = slot; pages[track].perpage = 6144u / (s->bytes * s->channels);
    return 1;
}

/* The lane of this track in either ping, or 0: never write through anything else. */
static uintptr_t lane(unsigned track)
{
    uintptr_t at = 0x80000510u + track * 48u, fp = U32(FP_PTR);
    return track < 8 && (fp == at || fp == at + 384u) ? fp : 0;
}

/* Our controls, taken out of the lane (locks, LFOs and scenes applied) while stock reads a plain FLEX there: no retrig
 * where SPD and GRN sit, and its own SETUP defaults. RATE stays in its own slot: stock reads it between our calls too,
 * and a note runs backwards only when stock sees it there all the time (MKII, 11 November 2026: with RATE shown to
 * stock only during START and render, a backward reader crawled). */
typedef struct { uint16_t ptch, strt, rate; uint32_t tail; uint8_t led, srr, str, bits; } View;
static void view_open(uintptr_t fp, View *w)
{
    w->ptch = U16(fp); w->strt = U16(fp + 2u); w->rate = U16(fp + 6u); w->tail = U32(fp + 8u);
    w->led = U8(fp + 26u); w->srr = U8(fp + 27u); w->str = U8(fp + 28u); w->bits = U8(fp + 29u);
    if (w->str == 2u) { /* PCH: stock reads the pitch with the stretch's shift on it, inside the knob's range */
        unsigned spd = w->tail >> 24;
        int ptch = (int)w->ptch + amiga_shift(spd ? 6400u / spd : 0u);
        U16(fp) = (uint16_t)(ptch < 0x0400 ? 0x0400 : ptch > 0x7c00 ? 0x7c00 : ptch);
    }
    U32(fp + 8u) = STOCK_RTRG;
    U8(fp + 26u) = U8(0x400d320cu + 8u); U8(fp + 27u) = 0; U8(fp + 28u) = 0; U8(fp + 29u) = U8(0x400d320cu + 11u); /* LEN as FLEX starts, RATE by pitch, TSTR off, TSNS as FLEX starts */
}
static void view_close(uintptr_t fp, const View *w)
{
    U16(fp) = w->ptch; U16(fp + 2u) = w->strt; U32(fp + 8u) = w->tail;
    U8(fp + 26u) = w->led; U8(fp + 27u) = w->srr; U8(fp + 28u) = w->str; U8(fp + 29u) = w->bits;
}

int amiga_start(unsigned track, unsigned sample, unsigned flags)
{
    uintptr_t fp = lane(track);
    if (!fp) return 0;
    View w;
    view_open(fp, &w);
    int result = FLEX_START(track, sample, flags);
    view_close(fp, &w);
    AmigaVoice *v = &voices[track];
    v->sample = sample; v->flags = flags;
    /* Where stock put the note. Stretch it only when every figure makes sense. */
    uintptr_t voice = VOICE + track * 168u, record = U32(voice + 8u);
    uint32_t window = 0, slice = 0;
    if (U8(voice) && record >> 20 == 0x100u) {
        uint32_t from = U32(record + 300u), to = U32(record + 304u), first = U32(voice + 40u), last = U32(voice + 44u);
        if (U8(fp + 25u)) { /* SLIC on: the slice STRT picked (records of start, end and loop from +312), when the note is that slice */
            uint32_t count = U32(record + 0x444u);
            for (uint32_t i = 0; i < count && i < 64u && !slice; ++i)
                if (U32(record + 312u + 12u * i) == first && last > first && last <= U32(record + 316u + 12u * i)) slice = i + 1u;
            if (slice) window = last - first;
        } else if (to > from && first >= from && last > first && last <= to) {
            v->first = first - from; v->length = to - from; window = last - first;
        }
    }
    amiga_note(v, window);
    v->slice = slice; v->strt = w.strt;
    v->origin = U32(voice + 40u); v->end = U32(voice + 44u);
    v->back = w.rate < 0x4000u; /* RATE below 0: stock starts the note at its end, where a backward note counts from */
    return result;
}

/* The source frames of the packet stock just wrote, and where its PCM starts; 0 when it is not the
 * shape we know: a header long (low byte the source frames, then up to three output segment counts),
 * ring, rate and phase longs, the source PCM, and one phase long per further segment, all inside
 * this track's 336-byte frame record. */
static unsigned packet(unsigned track, uintptr_t fp, uintptr_t before, int32_t **pcm)
{
    uintptr_t after = U32(CURSOR), record = 0x80001c90u + (fp - (0x80000510u + track * 48u)) / 384u * 0xa80u + track * 336u;
    if (before < record || before - record > 320u || after < before + 16u || after > record + 336u) return 0;
    uint32_t header = U32(before);
    unsigned sources = header & 255u, segments = 0;
    for (uint32_t h = header >> 8; h; h >>= 8, ++segments)
        if (!(h & 255u)) return 0;
    if (!segments || after - before != 16u + 4u * (segments - 1u) + 8u * sources) return 0;
    *pcm = (int32_t *)(before + 16u);
    return sources;
}

/* Frame interrupt, twice a frame for each owned track: at most 16 output frames a call. */
int amiga_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    uintptr_t fp = lane(track);
    if (!fp || start > end || end > 16) return 0;
    View w;
    AmigaVoice *v = &voices[track];
    uintptr_t before = U32(CURSOR), voice = VOICE + track * 168u;
    view_open(fp, &w);
    int result = FLEX_RENDER(track, ping, start, end);
    if (U8(voice)) { /* a voice is sounding */
        int32_t *pcm = 0;
        unsigned sources = packet(track, fp, before, &pcm), out = end - start;
        unsigned spd = w.str == 2u ? 64u : w.tail >> 24, grn = w.tail >> 8 & 255u; /* PCH keeps the note's own length: the shifted pitch is all it undoes */
        unsigned rate = w.rate; /* RATE: 0x4000 stands still, 0x7f00 is full forward, 0 full backward */
        /* Whether stock loops this note: its own answer, as its renderer reads it (0 ends, 1 loops, 2 back and forth).
         * SETUP's LOOP alone does not say: on AUTO the sample's own loop setting decides (MKII, 14 November 2026: a
         * sample not set to loop, LOOP on AUTO, was restarted at its end as if looped, a flam before the next trig). */
        unsigned loop = U8(voice + 23u) == 1;
        int stretch = w.str != 0, back = rate < 0x4000u;
        /* SYNC: the note moves through the sample at the project's tempo over the sample's (BPM x 24, its ORIGINAL TEMPO
         * in the audio editor), each 30 to 300 BPM as stock keeps them; a sample without one plays as STR ON. */
        uint32_t record = U32(voice + 8u), tempo = U32(TEMPO24), bpm = w.str == 3u && record >> 20 == 0x100u ? U32(record + 0x114u) : 0;
        int sync = bpm - 720u <= 6480u && tempo - 720u <= 6480u && bpm != tempo, full = rate >= 0x7f00u && !sync;
        /* A reader that turns round runs back over the note's own start, which a restart had moved up to itself. */
        if (stretch && amiga_face(v, back, loop) && back) U32(voice + 40u) = U32(voice + 48u) = v->origin;
        int rest = !stretch ? 0 : full ? amiga_rest(v, out, sources, spd) : v->rest == 2u ? 2 : 0;
        if (pcm) {
            if (v->xlen) amiga_cross(v, pcm, sources, &samples[track]);
            if (!rest) amiga_declick(v, pcm, sources);
            amiga_crunch(v, pcm, sources, w.srr, w.bits, w.led);
        }
        if (rest == 1) amiga_pass(v, out, grn);
        else if (stretch && !rest) {
            uint32_t whole = back ? 0x4000u : 0x3f00u, part = back ? 0x4000u - rate : rate - 0x4000u;
            if (part > whole) part = whole;
            if (sync) part = (part >> 6) * tempo, whole = (whole >> 6) * bpm; /* 127 * 16 * 256 * 7200 fits a long */
            int32_t at = full ? amiga_stretch(v, out, sources, spd, grn, loop) :
                amiga_stretch_rate(v, out, sources, spd, grn, loop, part, whole, !sync && spd == 64u && U16(fp) == 0x4000u);
            if (at == OVER) U8(voice) = 0; /* stock's fetch writes silence until the next trig */
            else if (at >= 0) { /* as stock's retrig restarts a note, from our place */
                uint32_t window = v->window, rel = back ? window - (uint32_t)at : (uint32_t)at, place = v->origin + rel;
                uint32_t tail = flex_sample(track, voice) ? U32(voice + 68u) : NONE; /* where the last grain would go on */
                uintptr_t record = U32(voice + 8u), slice = v->slice && record >> 20 == 0x100u ? record + 300u + 12u * v->slice : 0; /* its start, end and loop */
                if (!back && slice) {
                    /* Sliced, STRT picks the slice: for this one START the slice starts at our frame. */
                    uint32_t start = U32(slice);
                    if (place + 64u < U32(slice + 4u)) {
                        U32(slice) = place; U16(fp + 2u) = (uint16_t)v->strt;
                        FLEX_START(track, v->sample, v->flags);
                        U32(slice) = start;
                        uint32_t reader = U32(voice + 40u) - v->origin;
                        amiga_seek(v, reader < window ? reader : rel, tail, 0);
                    }
                } else if (!back && !v->slice) {
                    uint32_t strt = amiga_strt(v->first + rel, v->length), frame = amiga_frame(strt, v->length);
                    U16(fp + 2u) = (uint16_t)strt;
                    FLEX_START(track, v->sample, v->flags);
                    amiga_seek(v, frame > v->first ? frame - v->first : 0, tail, 0);
                } else if (record >> 20 == 0x100u && (!slice || place > U32(slice) + 64u)) {
                    /* Backwards, stock starts a note at its end (its slice's, sliced), wherever STRT is. So for this one START
                     * that end is our frame; then the sample and the note have their own ends again, which a loop wraps to. */
                    uintptr_t ends = slice ? slice + 4u : record + 304u;
                    uint32_t to = U32(ends);
                    U32(ends) = place < to ? place : to;
                    if (slice) U16(fp + 2u) = (uint16_t)v->strt;
                    FLEX_START(track, v->sample, v->flags);
                    U32(ends) = to;
                    uint32_t reader = U32(voice + 68u); /* where it put the reader */
                    U32(voice + 44u) = v->end;
                    if (reader < v->origin || reader > v->end) reader = place;
                    amiga_seek(v, window > reader - v->origin ? window - (reader - v->origin) : 0, tail, 1);
                }
            }
        }
    }
    view_close(fp, &w);
    return result;
}

/* SRC E and F, SRC SETUP C to F, and the words their values show as. SRC D stays stock's own RATE. */
static void number(char *out, unsigned n)
{
    char digit[6]; unsigned k = 0;
    do digit[k++] = (char)('0' + n % 10u); while (n /= 10u);
    while (k) *out++ = digit[--k];
    *out = 0;
}
static void word(char *out, const char *text) { while ((*out++ = *text++)) {} }
static void str_text(char *out, int value) { word(out, value <= 0 ? "OFF" : value == 1 ? "ON" : value == 2 ? "PCH" : "SYNC"); }
static void bits_text(char *out, int value) { number(out, 4u + (unsigned)(value < 0 ? 0 : value > 12 ? 12 : value)); }
#define KNOBS 6u
static const struct { uint8_t slot, start, count; char name[6]; void (*text)(char *, int); } knobs[KNOBS] = {
    {4, 64, 128, "SPD", 0}, {5, 64, 128, "GRN", 0},
    {8, 0, 2, "LED", 0}, {9, 0, 128, "SRR", 0}, {10, 3, 4, "STR", str_text}, {11, 4, 13, "BITS", bits_text}};
static uint8_t defaults[12];
static uint8_t page[0x1ca] __attribute__((aligned(4)));
static uint32_t page_built;
#define BUILT 0x414d4947u /* a garbage word is not a built page */

static uint32_t amiga_page(const volatile uint8_t *slot)
{
    (void)slot;
    if (page_built != BUILT) {
        static const char title[5] = "A500", kind[13] = "8 BIT"; /* the title field holds four letters */
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = U8(0x400d3176u + i); /* stock's FLEX page */
        for (unsigned i = 0; i < 5; ++i) page[0x3c + i] = (uint8_t)title[i];
        for (unsigned i = 0; i < 13; ++i) page[0x41 + i] = (uint8_t)kind[i];
        /* A control with few values is stock's own switch, picked by modwerk_page_control() (modwerk_page.h). */
        for (unsigned k = 0; k < KNOBS; ++k)
            modwerk_page_control(page, knobs[k].slot, knobs[k].name, knobs[k].start, knobs[k].count, knobs[k].text);
        page_built = BUILT;
    }
    return (uint32_t)(uintptr_t)(page + 0x38);
}
/* SRC SETUP on an AMIGA track shows our page, so its last four knobs read LED, SRR, STR and BITS; stock edits the bytes. */
static uint32_t amiga_setup_page(uint32_t stock) { (void)stock; return amiga_page(0); }
/* Called before the base copies defaults: stock's FLEX defaults, then ours. */
static unsigned amiga_admit(const volatile uint8_t *part, unsigned track)
{
    (void)part; (void)track;
    for (unsigned k = 0; k < 12; ++k) defaults[k] = U8(0x400d320cu + k);
    for (unsigned k = 0; k < KNOBS; ++k) defaults[knobs[k].slot] = knobs[k].start;
    return 1;
}

/* The sample pool: stock's own Flex slot list, opened on an AMIGA track. Only the browser sees the track
 * as FLEX (chooser_type) and its YES keeps the track ours (assign); the machine list still shows AMIGA.
 * The same glue as the S950 draft, after FRACT's sample_pool.h and POLY8's browser convention (MIT,
 * ex1010, Sam Banks / repeat98). */
#define BANK 0x46c82456u
#define POOL_WINDOW 0x460e70e0u
static uint32_t pool_bank, publish_bank;
static uint8_t pool_part, pool_track, pool_direct, publish_part, publish_tracks;

/* Stock's pool open past the base's site at 0x400791e4, entered as VECTOR's st_stock_pool_open does. */
__asm__(".text\n\t.even\namiga_stock_pool:\n\tmove.l %a2,-(%sp)\n\ttst.l 0x460e70e0\n\tjmp 0x400791ec\n");
extern void amiga_stock_pool(void);

static int bank_ok(void) { uint32_t b = U32(BANK); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *part_at(unsigned i) { return (volatile uint8_t *)(uintptr_t)(U32(BANK) + 0x8ed80u + i * 6322u); }
static int ours(const volatile uint8_t *p, unsigned t)
{
    const volatile uint8_t *s = p + 60u + 30u * t;
    return t < 8 && p[0x22u + t] == 1 && s[0] == 'A' && s[1] == 'M' && s[2] == 1;
}
/* The pool is still the one we opened: same bank, Part and track, still ours. */
static int pool_ours(void)
{
    return pool_direct && bank_ok() && U32(BANK) == pool_bank && (U8(0x100b14cfu) & 3u) == pool_part &&
        U8(0x100b14ccu) == pool_track && !U8(0x80000015u) && ours(part_at(pool_part), pool_track);
}
static unsigned amiga_chooser(unsigned type, const volatile uint8_t *slot)
{
    return pool_ours() && slot == part_at(pool_part) + 0x22u + pool_track ? type : 5;
}
static void put12(volatile uint8_t *part, volatile uint8_t *mirror, unsigned t, const volatile uint8_t *from)
{
    for (unsigned k = 0; k < 12; ++k) {
        unsigned at = (k < 6 ? 0x30u : 0x1e0u) + 30u * t + k % 6u;
        part[at] = mirror[at] = from[k];
    }
}
static unsigned amiga_assign(volatile uint8_t *part, unsigned t, unsigned on)
{
    unsigned index = 0;
    if (!bank_ok() || t >= 8) return (unsigned)-1;
    while (index < 4 && part != part_at(index)) ++index;
    if (index == 4) return (unsigned)-1;
    volatile uint8_t *mirror = (volatile uint8_t *)(uintptr_t)(0x100a4eceu + index * 6322u), *sig = part + 60u + 30u * t;
    int was = ours(part, t), keep = pool_ours() && part == part_at(pool_part) && t == pool_track; /* the browser's YES */
    if (!on && !keep && !was) return 1;
    if ((on || keep) && !was) put12(part, mirror, t, defaults);
    if (!on && !keep) put12(part, mirror, t, (const volatile uint8_t *)(uintptr_t)0x400d320cu); /* a stock machine: FLEX's defaults */
    for (unsigned k = 0; k < 3; ++k) {
        uint8_t v = on || keep ? (uint8_t)"AM\1"[k] : 0;
        sig[k] = v; mirror[60u + 30u * t + k] = v;
    }
    if (!was || (!on && !keep)) { /* the 12 bytes changed: the live lanes follow at the next tick */
        if (publish_bank != U32(BANK) || publish_part != index) publish_tracks = 0;
        publish_bank = U32(BANK); publish_part = (uint8_t)index; publish_tracks |= (uint8_t)(1u << t);
    }
    return 1;
}
static void amiga_pool_open(void)
{
    if (!bank_ok() || U8(0x80000015u) || U32(0x460e5e30u) || U32(POOL_WINDOW)) return;
    unsigned part = U8(0x100b14cfu) & 3u, t = U8(0x100b14ccu);
    if (!ours(part_at(part), t)) return;
    pool_bank = U32(BANK); pool_part = (uint8_t)part; pool_track = (uint8_t)t; pool_direct = 1;
    amiga_stock_pool();
    if (!U32(POOL_WINDOW)) pool_direct = 0;
    ((void (*)(int))(uintptr_t)0x4004d948u)(-1); /* redraw */
}
static void amiga_pool_left(unsigned key, unsigned edge)
{
    pool_direct = 0;
    ((void (*)(unsigned, unsigned))(uintptr_t)0x4007893cu)(key, edge);
}
static void amiga_ui_tick(void)
{
    if (pool_direct && (!U32(POOL_WINDOW) || !pool_ours())) pool_direct = 0;
    unsigned tracks = publish_tracks;
    publish_tracks = 0;
    if (!tracks || !bank_ok() || U32(BANK) != publish_bank || (U8(0x100b14cfu) & 3u) != publish_part || U8(0x80000015u)) return;
    volatile uint8_t *part = part_at(publish_part);
    for (unsigned t = 0; t < 8; ++t)
        if (tracks >> t & 1u)
            for (unsigned k = 0; k < 6; ++k) {
                ((int (*)(unsigned, unsigned, unsigned))(uintptr_t)0x40054cd8u)(t, k, part[0x30u + 30u * t + k]); /* stock's SRC writer */
                U8(0x80000830u + 72u * t + k) = part[0x1e0u + 30u * t + k]; /* SRC SETUP's live bytes */
            }
}

const struct modwerk_machine_setup amiga_machine = {.machine = {
    .abi = MODWERK_MACHINE_ABI, .sig = {'A', 'M'}, .sig_lo = 1, .sig_hi = 1, .label = "AMIGA",
    .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL | MODWERK_MACHINE_START | MODWERK_MACHINE_NATIVE_FLEX |
        MODWERK_MACHINE_SETUP_ALL | MODWERK_MACHINE_SETUP_PAGE,
    .defaults = defaults, .admit_track = amiga_admit, .assign = amiga_assign, .chooser_type = amiga_chooser,
    .track_page = amiga_page, .ui_tick = amiga_ui_tick, .pool_open = amiga_pool_open, .pool_left = amiga_pool_left,
    .render = amiga_render,
}, .page = amiga_setup_page};
const struct modwerk_machine_start amiga_machine_start = {
    .abi = MODWERK_MACHINE_START_ABI, .bytes = sizeof(struct modwerk_machine_start),
    .machine = &amiga_machine.machine, .start = amiga_start,
};
#endif
