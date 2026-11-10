/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Jannik Aßfalg
 *
 * AMIGA: a track machine that plays the track's Flex sample the way a home
 * computer's 8-bit sound chip and its tracker software did. Stock's FLEX reader
 * fetches the sample (PTCH, STRT, LEN, slices, loops as stock). Before the DSP
 * repitches it, this reworks the source PCM in the frame packet: held at a lower
 * storage rate (SRR), in a word of 4 to 16 bits (BITS), through
 * a fixed two-pole lowpass (LED). And it stretches in cycles, as the samplers of
 * that time did: every cycle (GRN) it restarts the reader where the sample would
 * be at speed SPD, whatever PTCH is, the way stock's own retrig restarts it, and
 * while a cycle ends it fades into the next one out of the frames it has already
 * read. So pitch and time come apart, with that flutter.
 *
 * SPD, GRN and SRR sit on SRC slots 3, 4 and 5, where FLEX has RATE, RTRG and
 * RTIM; LED, STR and BITS on SRC SETUP's last three bytes (RATE, TSTR, TSNS).
 * Stock must never read them as its own: START and render show stock a plain
 * forward FLEX for the call and put the bytes back (the base's NATIVE_FLEX
 * contract, sdk/machines/octatrack/HOOKS.md ot_machines / ot_machine_starts).
 *
 * No stock code is patched and no stock bytes are stored: the page is cloned
 * from stock's FLEX page at run time, as the other source machines do.
 * generate.py compiles this into amiga_core.s; verify.py runs amiga_crunch and
 * amiga_stretch on the host. */
#include <stdint.h>

typedef struct {
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
    int32_t last[2], off[2]; /* the last frame read, and the step a restart left (>> 9), which runs out over `fade` frames */
    uint32_t fade, jump;
    uint32_t hi, floor;     /* `hist` holds the frames read, from `floor` (or the last HIST) up to `hi`, counted from the note's start */
    uint32_t mix_from, mix_len, mix_wait, mix_k, mix_step, planned; /* the fade into the next grain, out of `hist` */
    int16_t hist[4096][2];
} AmigaVoice;
#define HIST 4096u
#define ONE 0x10000u /* Q16: one stored sample */
#define KEEP (-1)
#define OVER (-2)
#define FADE 32u

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

/* Remember the n frames read, and once a fade is planned (amiga_stretch) mix the next grain in from that
 * memory, so the restart at the cycle's end continues what is already sounding. First of the three. */
void amiga_blend(AmigaVoice *v, int32_t *a, unsigned n)
{
    uint32_t at = v->grain + v->played;
    for (; n; --n, ++at, a += 2) {
        int16_t *h = v->hist[at & (HIST - 1u)];
        h[0] = (int16_t)(a[0] >> 16); h[1] = (int16_t)(a[1] >> 16);
        if (at >= v->hi) v->hi = at + 1u;
        if (!v->mix_len) continue;
        if (v->mix_wait) { --v->mix_wait; continue; }
        uint32_t from = v->mix_from + v->mix_k;
        if (from >= at || from < v->floor || from + HIST <= v->hi) { v->mix_len = 0; v->jump = 1; continue; } /* not in the memory */
        const int16_t *g = v->hist[from & (HIST - 1u)];
        int32_t w = v->mix_k < v->mix_len ? (int32_t)(v->mix_k * v->mix_step >> 16) : 32767; /* Q15; past the fade, the next grain alone */
        a[0] = (h[0] + (((g[0] - h[0]) * w) >> 15)) * 65536;
        a[1] = (h[1] + (((g[1] - h[1]) * w) >> 15)) * 65536;
        ++v->mix_k;
    }
}
/* The reader was restarted at `frame` of the note. */
void amiga_seek(AmigaVoice *v, uint32_t frame)
{
    v->grain = frame; v->played = 0;
    if (frame > v->hi || frame + HIST < v->hi) v->floor = v->hi = frame; /* the memory holds nothing around it */
}

/* A restart makes the sample step, which clicks. Carry the step as an offset that runs out over FADE
 * frames instead: the first frame after it continues where the last one was. After amiga_blend, before amiga_crunch. */
void amiga_declick(AmigaVoice *v, int32_t *a, unsigned n)
{
    if (!n) return;
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
    v->last[0] = a[2 * n - 2]; v->last[1] = a[2 * n - 1];
}

/* n stereo frames, L then R longs, the sample in the high bits: the input is averaged over each stored
 * sample, stored at a lower rate (srr 0-127: 16/(16+srr) of the source's) in a 4- to 16-bit word (bits
 * 0-12; 12 keeps the source's word) and held, then through the lowpass (led). All three off leaves the
 * PCM untouched. */
void amiga_crunch(AmigaVoice *v, int32_t *a, unsigned n, unsigned srr, unsigned bits, unsigned led)
{
    if (srr > 127) srr = 127;
    if (!srr && bits >= 12 && !led) return;
    uint32_t inc = (16u * ONE) / (16u + srr);
    uint32_t mask = bits >= 12 ? 0xffffffffu : 0xffffffffu << (28u - bits);
    int32_t half = (int32_t)(~mask >> 1); /* round to nearest, not down */
    uint32_t mac = led ? MAC_ENTER() : 0;
    if (v->phase > 2u * ONE || v->count > 16u) v->phase = ONE, v->count = 0, v->al = v->ar = 0; /* a state nobody set */
    int same = v->l == v->r; /* a mono sample pays for one channel of filter */
    for (unsigned i = 0; same && i < n; ++i) same = a[2 * i] == a[2 * i + 1];
    for (; n; --n, a += 2) {
        if (srr) v->al += a[0] >> 4, v->ar += a[1] >> 4, ++v->count;
        if (v->phase >= ONE) {
            v->phase -= ONE;
            int32_t l = a[0], r = a[1];
            if (v->count > 1) l = (v->al / (int32_t)v->count) << 4, r = (v->ar / (int32_t)v->count) << 4;
            v->al = v->ar = 0; v->count = 0;
            v->l = (int32_t)((uint32_t)(l > INT32_MAX - half ? l : l + half) & mask);
            v->r = (int32_t)((uint32_t)(r > INT32_MAX - half ? r : r + half) & mask);
        }
        v->phase += inc;
        int32_t l = v->l, r = v->r;
        if (led) {
            l = lowpass(v->ic[0], (l >> 17) * 256);
            if (same) v->ic[1][0] = v->ic[0][0], v->ic[1][1] = v->ic[0][1], r = l;
            else r = lowpass(v->ic[1], (r >> 17) * 256);
        }
        a[0] = l; a[1] = r;
    }
    if (led) MAC_LEAVE(mac);
}

/* A new note of `window` frames. */
void amiga_note(AmigaVoice *v, uint32_t window)
{
    v->phase = ONE; /* it takes its first sample at once */
    v->count = 0; v->al = v->ar = 0;
    v->pos = v->grain = v->played = v->since = v->got = v->fade = v->jump = v->hi = v->floor = v->mix_len = v->planned = 0;
    v->window = window;
}

/* One render call made `out` output samples from `src` source frames. Each cycle (96 samples to 94 ms,
 * grn 0-127) the sample should be spd/64 output samples a sample further on, whatever the pitch read.
 * Returns the frame, from the note's start, to restart the reader at (then call amiga_seek with the
 * frame it really started at); KEEP; or OVER at the note's end. A reader within 16 frames of the place
 * is left alone, so speed 1 at pitch 0 is plain playback. A quarter into a cycle it plans the fade
 * into the next grain, when that lies behind the reader, where the memory will hold it. */
int32_t amiga_stretch(AmigaVoice *v, unsigned out, unsigned src, unsigned spd, unsigned grn, unsigned loop)
{
    if (!v->window) return KEEP;
    if (grn > 127) grn = 127;
    if (spd > 127) spd = 127;
    v->pos += spd * out; v->played += src; v->since += out; v->got += src;
    uint32_t cycle = 96u + grn * grn / 4u, reader = v->grain + v->played;
    if (v->since < cycle) {
        if (!v->planned && v->since >= cycle / 4u) {
            v->planned = 1;
            uint32_t left = cycle - v->since, ahead = v->got * left / v->since; /* frames the reader has yet to read */
            uint32_t next = (v->pos + spd * left) >> 6, end = reader + ahead;
            if (next < v->window && next + 16u < end) {
                uint32_t low = end > HIST ? end - HIST : 0; /* what the memory still holds when the cycle ends */
                if (low < v->floor) low = v->floor;
                uint32_t len = next > low ? next - low : 0;
                if (len > ahead) len = ahead;
                if (len >= 32u)
                    v->mix_from = next - len, v->mix_len = len, v->mix_wait = ahead - len, v->mix_k = 0, v->mix_step = 0x7fff0000u / len;
            }
        }
        return KEEP;
    }
    v->since = v->got = 0; v->planned = 0;
    uint32_t at = v->pos >> 6;
    if (at >= v->window) {
        if (!loop) { v->window = 0; v->mix_len = 0; return OVER; }
        at %= v->window; v->pos = at << 6 | (v->pos & 63u);
    }
    if (v->mix_len) { /* continue the grain the fade brought in */
        at = v->mix_from + v->mix_k; v->mix_len = 0;
        if (at >= v->window) at = v->window - 1u;
    } else {
        if (loop && reader >= v->window) reader %= v->window; /* stock looped by itself */
        int32_t drift = (int32_t)(at - reader);
        if (drift >= -16 && drift <= 16) return KEEP;
    }
    v->jump = 1;
    return (int32_t)at;
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

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define FLEX_RENDER ((int (*)(unsigned, unsigned, unsigned, unsigned))(uintptr_t)0x40004008u)
#define FLEX_START ((int (*)(unsigned, unsigned, unsigned))(uintptr_t)0x4000f450u)
#define FP_PTR 0x800062a8u     /* the track's live parameter lane this frame */
#define CURSOR 0x80001c80u     /* the frame packer's write position */
#define VOICE 0x800049d8u      /* stock's voice records, 168 bytes a track: +0 sounding, +8 its sample's record, +40/+44 the note's first and last frame */
#define STOCK_RATE 0x7f00u     /* SRC word 3 as stock sees it: forward, full rate */
#define STOCK_RTRG 0x00004000u /* SRC words 4 and 5: RTRG 0, RTIM centre */

static AmigaVoice voices[8];

/* The lane of this track in either ping, or 0: never write through anything else. */
static uintptr_t lane(unsigned track)
{
    uintptr_t at = 0x80000510u + track * 48u, fp = U32(FP_PTR);
    return track < 8 && (fp == at || fp == at + 384u) ? fp : 0;
}

/* Our controls, taken out of the lane (locks, LFOs and scenes applied) while stock reads a plain FLEX there. */
typedef struct { uint16_t strt, spd; uint32_t tail; uint8_t led, str, bits; } View;
static void view_open(uintptr_t fp, View *w)
{
    w->strt = U16(fp + 2u); w->spd = U16(fp + 6u); w->tail = U32(fp + 8u);
    w->led = U8(fp + 27u); w->str = U8(fp + 28u); w->bits = U8(fp + 29u);
    U16(fp + 6u) = STOCK_RATE; U32(fp + 8u) = STOCK_RTRG;
    U8(fp + 27u) = 0; U8(fp + 28u) = 0; U8(fp + 29u) = U8(0x400d320cu + 11u); /* RATE by pitch, TSTR off, TSNS as FLEX starts */
}
static void view_close(uintptr_t fp, const View *w)
{
    U16(fp + 2u) = w->strt; U16(fp + 6u) = w->spd; U32(fp + 8u) = w->tail;
    U8(fp + 27u) = w->led; U8(fp + 28u) = w->str; U8(fp + 29u) = w->bits;
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
    uint32_t window = 0;
    /* shortcut: a sliced track (SLIC on) is not stretched, STRT picks a slice there; give slices their own restart when someone asks. */
    if (U8(voice) && !U8(fp + 25u) && record >> 20 == 0x100u) {
        uint32_t from = U32(record + 300u), to = U32(record + 304u), first = U32(voice + 40u), last = U32(voice + 44u);
        if (to > from && first >= from && last > first && last <= to) {
            v->first = first - from; v->length = to - from; window = last - first;
        }
    }
    amiga_note(v, window);
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
        unsigned sources = packet(track, fp, before, &pcm);
        int stretch = w.str && !U8(fp + 25u);
        if (pcm) {
            if (stretch) amiga_blend(v, pcm, sources);
            amiga_declick(v, pcm, sources);
            amiga_crunch(v, pcm, sources, w.tail >> 8 & 255u, w.bits, w.led);
        }
        if (stretch) {
            int32_t at = amiga_stretch(v, end - start, sources, w.spd >> 8, w.tail >> 24, U8(fp + 24u) == 1);
            if (at == OVER) U8(voice) = 0; /* stock's fetch writes silence until the next trig */
            else if (at >= 0) { /* as stock's retrig restarts a note, from our place */
                uint32_t strt = amiga_strt(v->first + (uint32_t)at, v->length), frame = amiga_frame(strt, v->length);
                U16(fp + 2u) = (uint16_t)strt;
                FLEX_START(track, v->sample, v->flags);
                amiga_seek(v, frame > v->first ? frame - v->first : 0);
            }
        }
    }
    view_close(fp, &w);
    return result;
}

/* SRC D, E, F and SRC SETUP D, E, F. */
static const struct { uint8_t slot, start, count; char name[6]; } knobs[6] = {
    {3, 64, 128, "SPD"}, {4, 64, 128, "GRN"}, {5, 0, 128, "SRR"}, {9, 0, 2, "LED"}, {10, 1, 2, "STR"}, {11, 4, 13, "BITS"}};
static uint8_t defaults[12];
static uint8_t page[0x1ca] __attribute__((aligned(4)));
static uint32_t page_built;
#define BUILT 0x414d4947u /* a garbage word is not a built page */

static void put32(unsigned at, uint32_t v)
{
    for (unsigned i = 0; i < 4; ++i) page[at + i] = (uint8_t)(v >> (24 - 8 * i));
}
static void bits_text(char *out, int value)
{
    unsigned n = 4u + (unsigned)(value < 0 ? 0 : value > 12 ? 12 : value);
    if (n >= 10) *out++ = '1';
    *out++ = (char)('0' + n % 10u); *out = 0;
}
static uint32_t amiga_page(const volatile uint8_t *slot)
{
    (void)slot;
    if (page_built != BUILT) {
        static const char title[5] = "A500", kind[13] = "8 BIT"; /* the title field holds four letters */
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = U8(0x400d3176u + i); /* stock's FLEX page */
        for (unsigned i = 0; i < 5; ++i) page[0x3c + i] = (uint8_t)title[i];
        for (unsigned i = 0; i < 13; ++i) page[0x41 + i] = (uint8_t)kind[i];
        for (unsigned k = 0; k < 6; ++k) {
            unsigned s = knobs[k].slot, sw = knobs[k].count == 2;
            for (unsigned i = 0; i < 6; ++i) page[0x4e + 6 * s + i] = (uint8_t)knobs[k].name[i];
            page[0x96 + s] = knobs[k].start;
            put32(0xa2 + 4 * s, 0);
            put32(0xd2 + 4 * s, knobs[k].count);
            /* A switch is stock's own, as AMP SETUP's SYNC: its OFF/ON words and widget (docs/module-guides/machines.md). */
            put32(0x102 + 4 * s, sw ? 0x4003c14cu : s == 11 ? (uint32_t)(uintptr_t)bits_text : 0);
            put32(0x132 + 4 * s, sw ? 0x40046f10u : 0); /* or stock's ordinary knob */
            put32(0x162 + 4 * s, 0);                    /* and bounded editor */
        }
        page_built = BUILT;
    }
    return (uint32_t)(uintptr_t)(page + 0x38);
}
/* SRC SETUP on an AMIGA track shows our page, so its last three knobs read LED, STR and BITS; stock edits the bytes. */
static uint32_t amiga_setup_page(uint32_t stock) { (void)stock; return amiga_page(0); }
/* Called before the base copies defaults: stock's FLEX defaults, then ours. */
static unsigned amiga_admit(const volatile uint8_t *part, unsigned track)
{
    (void)part; (void)track;
    for (unsigned k = 0; k < 12; ++k) defaults[k] = U8(0x400d320cu + k);
    for (unsigned k = 0; k < 6; ++k) defaults[knobs[k].slot] = knobs[k].start;
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
