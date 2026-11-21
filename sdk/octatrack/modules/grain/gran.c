/* gran.c - el motor granular de Model-TG, muestra a muestra. Ver gran.h.
 *
 * Correspondencia con el original (para comprobar que no cambia ni una coma):
 *   gran_trigger  = el «spawn» con gr_trig de gran_fill (model_tg.s)
 *   gran_params   = sw_gran (model_tg.s) + gp_sync_int (gp.c v077)
 *   gran_render   = gran_fill (nacimiento de granos) + gp_render/gp_loop.S (v102: PAN mid/side)
 * Unico cambio: el bloque no es fijo de 32 muestras (la Octatrack pide hasta 16); el nacimiento de granos ya era exacto a
 * la muestra, asi que el resultado no depende del tamano del bloque. Y la salida pasa a L/R: L = mid + side,
 * R = mid - side, como el mezclador del original. */
#include "gran.h"
#include "gran_tables.h"

static const uint16_t *const gran_shapes[4] = { gran_hann, gran_tri, gran_perc, gran_sq };
static const uint8_t gran_div[11] = { 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64 };
#define BAR_44K_24 254016000u       /* 44100 * 60 * 4 * 24: un compas = esto / (BPM x 24) muestras */

/* Una muestra de 16 bits big-endian del sample: en el ColdFire (big-endian) se lee de una vez; en el PC, por octetos */
#if defined(__m68k__) || defined(__mcoldfire__)
#define GRAN_RD16(q) ((int32_t)*(const int16_t *)(const void *)(q))
#else
#define GRAN_RD16(q) ((int32_t)(int16_t)((q)[0] << 8 | (q)[1]))
#endif

#ifndef GRAN_UNIT_PATH
#define GRAN_UNIT_PATH 1
#endif

/* El azar de SPRAY y DIR empieza donde el original (model_tg.s: gran_seed .long 0x2545F491); el del paneo, en 0. Con los
 * dos en 0 (hasta la 0.3.13) daban los mismos numeros: el paneo de cada grano iba atado al lado de POS en que nacia
 * (detras del cursor a un lado, delante al otro; visto por el autor frente al original, 19/11). */
#ifndef GRAN_SEED0
#define GRAN_SEED0 0x2545F491u
#endif
#ifndef GRAN_PTR_PATH
#define GRAN_PTR_PATH 1   /* 0: el bucle con PTCH de antes (para comparar, prueba_estereo.sh) */
#endif

static inline uint32_t lcg(uint32_t *s) { return *s = *s * 1664525u + 1013904223u; }
static inline int32_t clamp16(int32_t x) { return x > 32767 ? 32767 : x < -32768 ? -32768 : x; }

/* (value * factor) >> shift, split before multiplying so the ColdFire only
 * needs 32-bit products. Here shift is 9 or 11 and factor fits in 16 bits. */
static inline uint32_t scaled_product(uint32_t value, uint32_t factor, unsigned shift)
{
    uint32_t remainder = value & ((1u << shift) - 1u);
    return (value >> shift) * factor + ((remainder * factor) >> shift);
}

static inline uint32_t gran_position(uint32_t count, uint32_t word)
{
    return scaled_product(count >> 6, word, 9);
}

void gran_init(GranEngine *e)
{
    uint8_t *p = (uint8_t *)e;
    for (unsigned i = 0; i < sizeof *e; ++i)
        p[i] = 0;
    e->seed = GRAN_SEED0;
}

void gran_trigger(GranEngine *e, unsigned track)
{
    if (track < GRAN_TRACKS)
        e->t[track].trig = 1;
}

void gran_params(GranEngine *e, unsigned track, const GranParams *p, const GranSample *s, uint32_t tempo24)
{
    GranTrack *t = &e->t[track];
    uint32_t count = s ? s->count : 0, d;

    if (!count) {                   /* sin sample: largo 0, no nace nada */
        t->len = 0;
        return;
    }
    /* Position y Spray: la palabra del mando (dial << 8) escalada a todo el sample, sin division (sw_g_pos, sw_g_spr) */
    uint32_t pos_word = p->pos > 127 ? 127u << 8 : ((uint32_t)p->pos << 8) | p->posf;
    t->pos = gran_position(count, pos_word);
    t->spray = gran_position(count, (uint32_t)(p->spray > 127 ? 127 : p->spray) << 8);
    if (t->scan >= count) t->scan %= count;   /* a shorter sample may replace the playing sample */
    t->count = count;
    t->len = gran_size[p->size > 127 ? 127 : p->size];
    d = p->dens > 127 ? 127 : p->dens;
    if (p->sync && tempo24) {
        unsigned division = gran_div[d * 11 / 128];
        if (t->sync_tempo24 != tempo24 || t->sync_division != division) {
            uint32_t n = BAR_44K_24 / tempo24 / division;
            t->spacing = n ? n : 1;
            t->sync_tempo24 = tempo24;
            t->sync_division = division;
        }
    } else {
        t->sync_tempo24 = 0;
        t->spacing = (t->len * gran_dens[d]) >> 8;
        if (!t->spacing) t->spacing = 1;
    }
}

/* dir 0..127: probabilidad de que el grano vaya hacia atras. 0 y 127 no tiran el dado (FWD y REV del original); 64 lo tira
 * igual que el RND del original (bit alto del LCG). */
static uint32_t gran_dir(GranEngine *e, unsigned dir)
{
    uint32_t thr;

    if (dir == 0)
        return 0;
    if (dir >= 127)
        return 1;
    lcg(&e->seed);
    thr = dir == 64 ? 32768u : ((uint32_t)dir * 65536u + 63u) / 127u;
    return (e->seed >> 16) >= 65536u - thr;
}

static void gran_spawn(GranEngine *e, GranTrack *t, const GranParams *p, const GranSample *s, unsigned n)
{
    uint32_t d6 = t->cd;

    if (t->trig) {
        t->trig = 0;
        t->on = 1;
        d6 = 0;                     /* el primer grano, en la primera muestra de este bloque */
        t->fpos = t->pos;           /* Freeze: la POS que encontro la nota */
        t->scan = t->scanf = 0;     /* SCAN: el cabezal vuelve a POS con cada nota */
    }
    if (!t->on || !t->len) {
        t->cd = d6;
        return;
    }
    while (d6 < n) {
        GranGrain *g = 0;
        for (unsigned i = 0; i < GRAN_MAX; ++i)
            if (!t->g[i].left) { g = &t->g[i]; break; }
        if (g) {                    /* todos ocupados: el grano se pierde (techo de CPU, como el original) */
            int32_t at = (int32_t)(p->freeze ? t->fpos : t->pos);
            if (t->scan) {          /* SCAN: POS mas lo que ha corrido el cabezal, dando la vuelta al sample */
                uint32_t q = (uint32_t)at + t->scan;
                at = (int32_t)(q >= s->count ? q - s->count : q);
            }
            if (t->spray) {
                uint32_t r = lcg(&e->seed) >> 16;
                at += (int32_t)scaled_product(t->spray >> 5, r, 11);
                at -= (int32_t)(t->spray >> 1);
                if (at < 0)
                    at = 0;
            }
            if ((uint32_t)at >= s->count)
                at = (int32_t)s->count - 1;
            g->idx = (uint32_t)at;
            g->fr = 0;
            g->left = t->len;
            g->ph = 0;
            g->phs = 0x1000000u / t->len;
            g->start = d6;
            g->rev = gran_dir(e, p->dir);
            g->pan = 0;             /* v018: paneo al azar dentro de +-PAN/16 */
            if (p->pan) {           /* PAN 0..127: 127 da exactamente el PAN maximo del original */
                uint32_t amt = p->pan > 127 ? 127 : p->pan;
                lcg(&e->pseed);
                g->pan = ((int32_t)(e->pseed >> 16) - 32768) * (int32_t)amt / 127;
            }
        }
        d6 += t->spacing;
    }
    t->cd = d6 - n;
    if (p->scan && s->count) {      /* el cabezal corre n muestras a scan/32 de velocidad (Q16), y da la vuelta */
        int32_t step = (int32_t)p->scan * 2048 * (int32_t)n;   /* scan/32 * 65536 * n */
        uint32_t whole, f;
        if (step >= 0) {
            f = t->scanf + ((uint32_t)step & 0xffffu);
            whole = ((uint32_t)step >> 16) + (f >> 16);
            t->scanf = f & 0xffffu;
            if (whole >= s->count) whole %= s->count;
            t->scan += whole;
            if (t->scan >= s->count) t->scan -= s->count;
        } else {
            uint32_t back = (uint32_t)-step;
            whole = back >> 16;
            if ((back & 0xffffu) > t->scanf) { t->scanf += 0x10000u; whole++; }
            t->scanf -= back & 0xffffu;
            if (whole >= s->count) whole %= s->count;
            t->scan = t->scan >= whole ? t->scan - whole : t->scan + s->count - whole;
        }
    }
}

static inline int gran_page(GranPage *pg, const GranSample *s, uint32_t idx)
{
    if (idx - pg->pfirst >= pg->pcount) {
        uint32_t first = 0, cnt = s->count;
        uintptr_t page = s->locate ? s->locate(s->ctx, idx, &first, &cnt) : (uintptr_t)s->ctx;
        pg->page = page; pg->pfirst = first; pg->pcount = page ? cnt : 0;
        if (!page || idx - first >= cnt) {
            pg->pcount = 0;
            return 0;
        }
    }
    return 1;
}

/* Read a frame as mid and side. An unmapped page contributes silence. */
static inline int gran_fetch(GranPage *pg, const GranSample *s, uint32_t idx, int32_t *m, int32_t *sd)
{
    if (!gran_page(pg, s, idx)) return 0;
    const uint8_t *q = (const uint8_t *)pg->page + (idx - pg->pfirst) * s->bytes * s->channels;
    int32_t l = (int16_t)(q[0] << 8 | q[1]);
    if (s->channels < 2) {
        *m = l;
        return 1;
    }
    int32_t r = (int16_t)(q[s->bytes] << 8 | q[s->bytes + 1]);
    *m = (l + r) >> 1;
    *sd = (l - r) >> 1;
    return 1;
}

typedef struct { int32_t mid, side; } StereoSum;

/* Stereo grains use complementary pan coefficients. Factoring out the unity term leaves one
 * signed product per sample. The two shifts for left pan retain the original floor rounding. */
static inline void mix_stereo(StereoSum *mix, int32_t l, int32_t r, int32_t window,
                              int32_t pan, int sign)
{
    int32_t sum = (l + r) >> 1;
    int32_t vm = (sum * window) >> 15;
    /* floor((l - r) / 2) equals floor((l + r) / 2) - r, including odd sums. */
    int32_t vs = ((sum - r) * window) >> 15;
    if (sign > 0) {
        int32_t change = (-(vm + vs) * pan) >> 15;
        vm += change;
        vs += change;
    } else if (sign < 0) {
        int32_t product = (vm - vs) * pan;
        vm += product >> 15;
        vs += -product >> 15;
    }
#if defined(__m68k__)
    __asm__("add.l %2,%0\n\tadd.l %3,%1" : "+m"(mix->mid), "+m"(mix->side) : "d"(vm), "d"(vs) : "cc");
#else
    mix->mid += vm;
    mix->side += vs;
#endif
}

static inline void advance_cursor(uint32_t *index, uint32_t *fraction, uint32_t whole, uint32_t frac)
{
#if defined(__m68k__) || defined(__mcoldfire__)
    __asm__("add.l %3,%1\n\taddx.l %2,%0"
            : "+&d"(*index), "+&d"(*fraction) : "d"(whole), "d"(frac) : "cc");
#else
    uint32_t next = *fraction + frac;
    *index += whole + (next < *fraction);
    *fraction = next;
#endif
}

/* A separate kernel keeps the six-voice inner loop's registers free of the scheduler and
 * page lookup state. The Q32.32 cursor carries into the sample index on the ColdFire. */
static inline __attribute__((always_inline)) void stereo_loop(GranGrain *grain, const uint8_t *page,
        unsigned bytes, uint32_t first, uint32_t whole, uint32_t frac, const uint16_t *win,
        StereoSum *mix, unsigned n, int fixed_gain, int pan_sign)
{
    uint32_t index = grain->idx - first, fraction = grain->fr;
    uint32_t phase = grain->ph, phase_step = grain->phs;
    int32_t pan = grain->pan / 2;
    int32_t gain = win[(phase >> 16) & 255u];
    for (unsigned i = 0; i < n; ++i) {
        const uint8_t *q = page + index * (2u * bytes);
        int32_t l, r;
#if defined(__m68k__) || defined(__mcoldfire__)
        if (bytes == 2u) {
            uint32_t lr = *(const uint32_t *)(const void *)q;  /* one Flex RAM access for both channels */
            l = (int16_t)(lr >> 16);
            r = (int16_t)lr;
        } else {
            /* A packed stereo frame is six bytes. The two indexed loads add
             * 4*index to page+2*index without a multiply in the sample loop. */
            const uint8_t *base;
            __asm__("lea (%3,%4.l*2),%0\n\tmvs.w (%0,%4.l*4),%1\n\tmvs.w (3,%0,%4.l*4),%2"
                    : "=&a"(base), "=&d"(l), "=d"(r) : "a"(page), "d"(index) : "cc", "memory");
        }
#else
        {
            l = GRAN_RD16(q);
            r = GRAN_RD16(q + bytes);
        }
#endif
        if (!fixed_gain) gain = win[(phase >> 16) & 255u];
        mix_stereo(mix + i, l, r, gain, pan,
                   pan_sign == 2 ? (pan > 0) - (pan < 0) : pan_sign);
        if (__builtin_constant_p(frac) && frac == 0) {
            index += whole;
        } else {
            advance_cursor(&index, &fraction, whole, frac);
        }
        if (!fixed_gain) phase += phase_step;
    }
    grain->idx = first + index;
    grain->fr = fraction;
    grain->ph += n * phase_step;
}

#if defined(__m68k__)
/* Decode both signed PCM words, apply the Q15 window and signed pan, and accumulate in order.
 * The 24-bit stereo page holds 1024 packed six-byte frames. The caller bounds the run.
 * Keeping the Q32 cursor and its carry in registers avoids spilling it between samples.
 * Window and pan choices specialize at compile time. The C path uses the same rounding. */
static inline __attribute__((always_inline)) void mix_page24(GranGrain *g,
        const uint8_t *page, uint32_t first, uint32_t whole, uint32_t frac, const uint16_t *window,
        StereoSum *mix, unsigned n, int32_t pan, int sign, int fixed_gain)
{
    uint32_t index = g->idx - first, fraction = g->fr;
    uint32_t phase = g->ph, phase_step = g->phs;
    int32_t gain = fixed_gain ? window[(phase >> 16) & 255u] : 0;
    if (sign > 0) pan = -pan;
    const StereoSum *end = mix + n;
    const uint8_t *address;
    int32_t mid, side, correction;
    __asm__ volatile (
        "1:\n\t"
        ".if %c[variable]\n\t"
        "move.l %[phase],%[gain]\n\t"
        "swap %[gain]\n\t"
        "mvz.b %[gain],%[gain]\n\t"
        "mvz.w (%[window],%[gain].l*2),%[gain]\n\t"
        "adda.l %[phase_step],%[phase]\n\t"
        ".endif\n\t"
        "lea (%[page],%[idx].l*2),%[address]\n\t"
        "mvs.w (%[address],%[idx].l*4),%[mid]\n\t"
        "mvs.w (3,%[address],%[idx].l*4),%[side]\n\t"
        "add.l %[side],%[mid]\n\t"
        "asr.l #1,%[mid]\n\t"
        "neg.l %[side]\n\t"
        "add.l %[mid],%[side]\n\t"
        "muls.l %[gain],%[mid]\n\t"
        "muls.l %[gain],%[side]\n\t"
        "asr.l %[shift],%[mid]\n\t"
        "asr.l %[shift],%[side]\n\t"
        ".if %c[sign] > 0\n\t"
        "move.l %[mid],%[adjust]\n\t"
        "add.l %[side],%[adjust]\n\t"
        "muls.l %[pan],%[adjust]\n\t"
        "asr.l %[shift],%[adjust]\n\t"
        "add.l %[adjust],%[mid]\n\t"
        "add.l %[adjust],%[side]\n\t"
        ".elseif %c[sign] < 0\n\t"
        "move.l %[mid],%[adjust]\n\t"
        "sub.l %[side],%[adjust]\n\t"
        "muls.l %[pan],%[adjust]\n\t"
        "move.l %[adjust],%[address]\n\t"
        "asr.l %[shift],%[adjust]\n\t"
        "add.l %[adjust],%[mid]\n\t"
        "move.l %[address],%[adjust]\n\t"
        "neg.l %[adjust]\n\t"
        "asr.l %[shift],%[adjust]\n\t"
        "add.l %[adjust],%[side]\n\t"
        ".endif\n\t"
        "add.l %[mid],(%[dst])+\n\t"
        "add.l %[side],(%[dst])+\n\t"
        "add.l %[frac],%[sub]\n\t"
        "addx.l %[whole],%[idx]\n\t"
        "cmpa.l %[end],%[dst]\n\t"
        "bne.b 1b"
        : [idx] "+&d"(index), [sub] "+&d"(fraction), [dst] "+&a"(mix),
          [phase] "+&a"(phase), [gain] "+&d"(gain), [address] "=&a"(address), [mid] "=&d"(mid), [side] "=&d"(side), [adjust] "=&d"(correction)
        : [page] "a"(page), [end] "a"(end), [frac] "a"(frac), [whole] "d"(whole),
          [pan] "m"(pan), [window] "ai"(fixed_gain ? 0 : (uintptr_t)window), [phase_step] "m"(phase_step),
          [variable] "i"(!fixed_gain), [shift] "d"(15), [sign] "i"(sign)
        : "cc", "memory");
    g->idx = first + index;
    g->fr = fraction;
    g->ph = fixed_gain ? phase + n * phase_step : phase;
}
#endif

static __attribute__((noinline)) void stereo_page(GranGrain *g, const uint8_t *page, unsigned bytes,
        uint32_t first, uint32_t whole, uint32_t frac, const uint16_t *win, StereoSum *mix, unsigned n)
{
    unsigned begin = g->ph >> 16, end = (g->ph + (n - 1u) * g->phs) >> 16;
    int constant = begin == end || (win == gran_sq && begin >= 8 && end < 248);
    if (bytes == 2 && constant) {
        if (!frac)
            stereo_loop(g, page, 2, first, whole, 0, win, mix, n, 1, 2);
        else
            stereo_loop(g, page, 2, first, whole, frac, win, mix, n, 1, 2);
    } else if (bytes == 2)
        stereo_loop(g, page, 2, first, whole, frac, win, mix, n, 0, 2);
    else if (constant) {
        /* A grain's pan is fixed until its next trigger. Keep that choice outside the sample loop. */
        int sign = g->pan / 2;
#if defined(__m68k__)
        if (sign > 0)
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, 1, 1);
        else if (sign < 0)
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, -1, 1);
        else
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, 0, 1);
#else
        if (sign > 0)
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 1, 1);
        else if (sign < 0)
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 1, -1);
        else
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 1, 0);
#endif
    } else {
        int sign = g->pan / 2;
#if defined(__m68k__)
        if (sign > 0)
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, 1, 0);
        else if (sign < 0)
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, -1, 0);
        else
            mix_page24(g, page, first, whole, frac, win, mix, n, sign, 0, 0);
#else
        if (sign > 0)
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 0, 1);
        else if (sign < 0)
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 0, -1);
        else
            stereo_loop(g, page, 3, first, whole, frac, win, mix, n, 0, 0);
#endif
    }
}

/* Keep the stereo kernel on both sides of a page boundary. A run may end at
 * the sample boundary even if its last physical page has unused frames. */
static void stereo_paged(GranGrain *g, GranPage *pg, const GranSample *s, int32_t whole,
                         uint32_t frac, const uint16_t *win, StereoSum *mix, unsigned n)
{
    unsigned done = 0;
    while (done < n) {
        uint32_t idx = g->idx;
        if (idx >= s->count || !gran_page(pg, s, idx)) {
            advance_cursor(&g->idx, &g->fr, (uint32_t)whole, frac);
            g->ph += g->phs;
            ++done;
            continue;
        }
        uint32_t size = s->count - pg->pfirst;
        if (pg->pcount < size) size = pg->pcount;
        uint32_t offset = idx - pg->pfirst;
        unsigned run = n - done;
        uint32_t room = whole < 0 ? offset : size - 1u - offset;
        uint32_t step = whole < 0 ? 0u - (uint32_t)whole : (uint32_t)whole + (frac != 0);
        /* For the usual pitch range this product fits. Only walk the cursor
         * when the conservative last-frame bound reaches a page edge. */
        if (step > 65535u || (run - 1u) * step > room) {
            uint32_t probe = offset, sub = g->fr;
            unsigned i = 1;
            for (; i < run; ++i) {
                advance_cursor(&probe, &sub, (uint32_t)whole, frac);
                if (probe >= size) break;
            }
            run = i;
        }
        stereo_page(g, (const uint8_t *)pg->page, s->bytes, pg->pfirst, (uint32_t)whole, frac,
                    win, mix + done, run);
        done += run;
    }
}

void gran_render(GranEngine *e, unsigned track, const GranParams *p, const GranSample *s, int32_t whole, uint32_t frac,
                 int32_t *out, unsigned n)
{
    GranTrack *t = &e->t[track];
    StereoSum mix[32];
    const uint16_t *win = gran_shapes[p->shape > 3 ? 0 : p->shape];
    uint32_t count = s && (s->locate || s->ctx) ? s->count : 0;
    int stereo = s && s->channels > 1;

    if (n > 32)
        n = 32;
    for (unsigned i = 0; i < n; ++i)
        mix[i].mid = mix[i].side = 0;
    if (count)
        gran_spawn(e, t, p, s, n);
    for (unsigned k = 0; k < GRAN_MAX && count; ++k) {
        GranGrain *g = &t->g[k];
        uint32_t left = g->left, start, m, idx, fr, f = frac, ph, phs;
        int32_t w = whole, cm, cs;

        if (!left)
            continue;
        start = g->start;
        g->start = 0;
        if (start >= n) {           /* nace mas alla de este bloque (no pasa con el bucle de arriba) */
            g->start = start - n;
            continue;
        }
        m = n - start;
        if (m > left)
            m = left;
        g->left = left - m;
        idx = g->idx; fr = g->fr; ph = g->ph; phs = g->phs;
        if (g->rev) {               /* el paso negado en 64 bits */
            w = -w - (f != 0);
            f = 0u - f;
        }
        /* Spray and reverse can leave a grain outside the sample for its remaining
         * lifetime. Advance its two cursors once when no frame can reach PCM.
         * Keep the scalar path if the unsigned index could wrap back into range. */
        if (idx >= count && w >= -4 && w <= 4 &&
            (w < 0 ? idx - count >= m * (uint32_t)-w : UINT32_MAX - idx >= m * ((uint32_t)w + 1u))) {
            uint32_t low = (fr & 65535u) + m * (f & 65535u);
            uint32_t high = (fr >> 16) + m * (f >> 16) + (low >> 16);
            g->fr = (high << 16) | (low & 65535u);
            g->idx = idx + m * (uint32_t)w + (high >> 16);
            g->ph = ph + m * phs;
            continue;
        }
        if (GRAN_PTR_PATH && stereo && s->bytes == 3u) {
            stereo_paged(g, &t->pg, s, w, f, win, mix + start, m);
            continue;
        }
        cs = -g->pan / 2;
        cm = 32768 - (g->pan < 0 ? -g->pan : g->pan) / 2;
        /* Via rapida (mismo resultado bit a bit): si todo el tramo del grano cae dentro de una sola pagina del sample,
         * se lee directamente de ella, sin comprobar pagina ni limites en cada muestra. Hacia delante el indice avanza
         * como mucho w + 1 por muestra; hacia atras retrocede como mucho |w|. */
        {
            uint32_t lo, hi, aw = w >= 0 ? (uint32_t)w : (uint32_t)-w;
            int fast = 0;
            if (idx < count && aw < 0x10000u && gran_page(&t->pg, s, idx)) {
                if (w >= 0) { lo = idx; hi = idx + m * (aw + 1u); fast = hi < count; }
                else { hi = idx; lo = idx - m * aw; fast = m * aw <= idx; }
                fast = fast && lo - t->pg.pfirst < t->pg.pcount && hi - t->pg.pfirst < t->pg.pcount;
            }
            /* Via mas rapida aun (mismo resultado bit a bit), el caso comun: pitch 0 (paso de una muestra exacta, adelante o
             * atras) y muestras de 16 bits. Se avanza el puntero en lugar de recalcular la direccion y el acarreo, la
             * palabra se lee de una vez (el ColdFire es big-endian, como el sample) y, sin paneo (cm = 32768, cs = 0), las
             * multiplicaciones del paneo dan vm y vs exactos y se quitan. Menos trabajo en la interrupcion de frame: menos
             * renders que la guardia de la base convierte en silencio (los clics). */
            if (GRAN_PTR_PATH && fast && stereo && (g->pan || f || s->bytes != 2u)) {
                stereo_page(g, (const uint8_t *)t->pg.page, s->bytes, t->pg.pfirst, (uint32_t)w, f,
                            win, mix + start, m);
                continue;
            }
            if (GRAN_UNIT_PATH && fast && f == 0u && (w == 1 || w == -1) && s->bytes == 2u) {
                const uint8_t *q = (const uint8_t *)t->pg.page + (idx - t->pg.pfirst) * 2u * s->channels;
                int32_t dq = w * 2 * (int32_t)s->channels;
                const unsigned end = start + m;
                if (stereo && !g->pan) {
                    for (unsigned i = start; i < end; ++i, q += dq) {
#if defined(__m68k__) || defined(__mcoldfire__)
                        uint32_t lr = *(const uint32_t *)(const void *)q;     /* L y R de una vez */
                        int32_t l = (int16_t)(lr >> 16), r = (int16_t)lr, wv = win[(ph >> 16) & 0xff];
#else
                        int32_t l = GRAN_RD16(q), r = GRAN_RD16(q + 2), wv = win[(ph >> 16) & 0xff];
#endif
                        mix[i].mid += (((l + r) >> 1) * wv) >> 15;
                        mix[i].side += (((l - r) >> 1) * wv) >> 15;
                        ph += phs;
                    }
                } else if (!stereo && !g->pan) {
                    for (unsigned i = start; i < end; ++i, q += dq) {
                        mix[i].mid += (GRAN_RD16(q) * win[(ph >> 16) & 0xff]) >> 15;
                        ph += phs;
                    }
                } else {
                    for (unsigned i = start; i < end; ++i, q += dq) {
                        int32_t l = GRAN_RD16(q), wv = win[(ph >> 16) & 0xff];
                        if (stereo) {
                            int32_t r = GRAN_RD16(q + 2);
                            int32_t vm = (((l + r) >> 1) * wv) >> 15, vs = (((l - r) >> 1) * wv) >> 15;
                            mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((int32_t)((uint32_t)(vm * cm) + (uint32_t)(vs * cs)) >> 15));
                            mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((int32_t)((uint32_t)(vm * cs) + (uint32_t)(vs * cm)) >> 15));
                        } else {
                            int32_t vm = (l * wv) >> 15;
                            mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((vm * cm) >> 15));
                            mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((vm * cs) >> 15));
                        }
                        ph += phs;
                    }
                }
                g->idx = idx + (uint32_t)(w * (int32_t)m); g->ph = ph;   /* fr no cambia: f es 0 */
                continue;
            }
            if (GRAN_PTR_PATH && fast) {
                /* con PTCH: el puntero avanza el paso entero y, con el acarreo de la fraccion, un frame mas (sin multiplicar
                 * en cada muestra); la palabra alta de la muestra (16 o 24 bits) se lee de una vez */
                uint32_t fs = (uint32_t)s->bytes * s->channels, rb = s->bytes;
                const uint8_t *q = (const uint8_t *)t->pg.page + (idx - t->pg.pfirst) * fs;
                int32_t dq = w * (int32_t)fs;
                for (unsigned i = start; i < start + m; ++i) {
                    int32_t l = GRAN_RD16(q), wv = win[(ph >> 16) & 0xff];
                    if (stereo) {
                        int32_t r = GRAN_RD16(q + rb);
                        int32_t vm = (((l + r) >> 1) * wv) >> 15, vs = (((l - r) >> 1) * wv) >> 15;
                        mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((int32_t)((uint32_t)(vm * cm) + (uint32_t)(vs * cs)) >> 15));
                        mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((int32_t)((uint32_t)(vm * cs) + (uint32_t)(vs * cm)) >> 15));
                    } else {
                        int32_t vm = (l * wv) >> 15;
                        mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((vm * cm) >> 15));
                        mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((vm * cs) >> 15));
                    }
                    ph += phs;
                    { uint32_t nf = fr + f, cy = nf < fr; idx += (uint32_t)w + cy; fr = nf; q += dq + (cy ? (int32_t)fs : 0); }
                }
                g->idx = idx; g->fr = fr; g->ph = ph;
                continue;
            }
            if (fast) {                 /* el bucle de antes (GRAN_PTR_PATH 0), igual bit a bit */
                const uint8_t *pg0 = (const uint8_t *)t->pg.page;
                uint32_t pf = t->pg.pfirst, fs = (uint32_t)s->bytes * s->channels, rb = s->bytes;
                for (unsigned i = start; i < start + m; ++i) {
                    const uint8_t *q = pg0 + (idx - pf) * fs;
                    int32_t l = (int16_t)(q[0] << 8 | q[1]), wv = win[(ph >> 16) & 0xff];
                    if (stereo) {
                        int32_t r = (int16_t)(q[rb] << 8 | q[rb + 1]);
                        int32_t vm = (((l + r) >> 1) * wv) >> 15, vs = (((l - r) >> 1) * wv) >> 15;
                        mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((int32_t)((uint32_t)(vm * cm) + (uint32_t)(vs * cs)) >> 15));
                        mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((int32_t)((uint32_t)(vm * cs) + (uint32_t)(vs * cm)) >> 15));
                    } else {
                        int32_t vm = (l * wv) >> 15;
                        mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((vm * cm) >> 15));
                        mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((vm * cs) >> 15));
                    }
                    ph += phs;
                    { uint32_t nf = fr + f; idx += (uint32_t)w + (nf < fr); fr = nf; }
                }
                g->idx = idx; g->fr = fr; g->ph = ph;
                continue;
            }
        }
        for (unsigned i = start; i < start + m; ++i) {
            int32_t sm, ss = 0;
            if (idx < count && gran_fetch(&t->pg, s, idx, &sm, &ss)) {
                int32_t wv = win[(ph >> 16) & 0xff];
                int32_t vm = (sm * wv) >> 15;
                if (stereo) {
                    int32_t vs = (ss * wv) >> 15;
                    /* sumas de 32 bits que dan la vuelta igual que en el ColdFire */
                    mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((int32_t)((uint32_t)(vm * cm) + (uint32_t)(vs * cs)) >> 15));
                    mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((int32_t)((uint32_t)(vm * cs) + (uint32_t)(vs * cm)) >> 15));
                } else {
                    mix[i].mid = (int32_t)((uint32_t)mix[i].mid + (uint32_t)((vm * cm) >> 15));
                    mix[i].side = (int32_t)((uint32_t)mix[i].side + (uint32_t)((vm * cs) >> 15));
                }
            }
            ph += phs;
            {                       /* {idx, fr} += {w, f} con acarreo */
                uint32_t nf = fr + f;
                idx += (uint32_t)w + (nf < fr);
                fr = nf;
            }
        }
        g->idx = idx; g->fr = fr; g->ph = ph;
    }
    for (unsigned i = 0; i < n; ++i) {
        int32_t a = clamp16(mix[i].mid), b = clamp16(mix[i].side);
        out[2 * i] = clamp16(a + b) * 65536;
        out[2 * i + 1] = clamp16(a - b) * 65536;
    }
}
