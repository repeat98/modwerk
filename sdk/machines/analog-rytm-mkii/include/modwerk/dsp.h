/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Fixed-point helpers for digital voices (modwerk/voice.h) on the Rytm's ColdFire, with a
 * host model for testing the same C off the unit (build with -DMW_DSP_HOST).
 *
 * Q31 throughout: full scale is +-1. The EMAC runs in fractional mode (MACSR 0x20, which
 * mw_voice_run sets) with ACC0-ACC3 clear: qmul and qsum2/3 leave ACC0 clear again. A sum of
 * products is truncated once; the accumulator keeps 8 bits below the result's LSB, which
 * the host model copies. Shifts of signed values go through unsigned or multiply, so the
 * same code passes -fsanitize=undefined on the host. */
#ifndef MODWERK_DSP_H
#define MODWERK_DSP_H

#include <stdint.h>

#define MW_QMAX 0x7fffffff
#define MW_QMIN (-0x7fffffff - 1)

#ifdef MW_DSP_HOST
static inline int32_t qmul(int32_t a, int32_t b) { return (int32_t)(((int64_t)a * b) >> 31); }
static inline int64_t mw_qp(int32_t a, int32_t b) { return ((int64_t)a * b) >> 23; }
static inline int32_t qsum2(int32_t a, int32_t b, int32_t c, int32_t d)
{
    return (int32_t)((mw_qp(a, b) + mw_qp(c, d)) >> 8);
}
static inline int32_t qsum3(int32_t a, int32_t b, int32_t c, int32_t d, int32_t e, int32_t f)
{
    return (int32_t)((mw_qp(a, b) + mw_qp(c, d) + mw_qp(e, f)) >> 8);
}
#else
/* (a * b) >> 31 */
static inline __attribute__((always_inline)) int32_t qmul(int32_t a, int32_t b)
{
    int32_t r;
    __asm__ volatile ("mac.l %1,%2,%%acc0\n\tmovclr.l %%acc0,%0" : "=d"(r) : "r"(a), "r"(b));
    return r;
}
/* (a * b + c * d) >> 31, truncated once */
static inline __attribute__((always_inline)) int32_t qsum2(int32_t a, int32_t b, int32_t c, int32_t d)
{
    int32_t r;
    __asm__ volatile ("mac.l %1,%2,%%acc0\n\tmac.l %3,%4,%%acc0\n\tmovclr.l %%acc0,%0"
                      : "=d"(r) : "r"(a), "r"(b), "r"(c), "r"(d));
    return r;
}
/* (a * b + c * d + e * f) >> 31, truncated once */
static inline __attribute__((always_inline)) int32_t qsum3(int32_t a, int32_t b, int32_t c, int32_t d,
                                                           int32_t e, int32_t f)
{
    int32_t r;
    __asm__ volatile ("mac.l %1,%2,%%acc0\n\tmac.l %3,%4,%%acc0\n\tmac.l %5,%6,%%acc0\n\tmovclr.l %%acc0,%0"
                      : "=d"(r) : "r"(a), "r"(b), "r"(c), "r"(d), "r"(e), "r"(f));
    return r;
}
#endif

/* a + b, held at full scale */
static inline int32_t sadd(int32_t a, int32_t b)
{
    int32_t s = (int32_t)((uint32_t)a + (uint32_t)b);
    if (((a ^ s) & (b ^ s)) < 0)
        s = a < 0 ? MW_QMIN : MW_QMAX;
    return s;
}

/* x << n, held at full scale */
static inline int32_t sshl(int32_t x, int n)
{
    if (x > (MW_QMAX >> n))
        return MW_QMAX;
    if (x < (MW_QMIN >> n))
        return MW_QMIN;
    return (int32_t)((uint32_t)x << n);
}

/* A periodic table of 2^bits + 1 int16 entries (the last repeats the first) at phase u
 * (the whole uint32 is one period), linearly interpolated, times 2^shift. */
static inline int32_t mw_wave(const int16_t *w, int bits, uint32_t u, int shift)
{
    const int16_t *e = &w[u >> (32 - bits)];
    int32_t f = (int32_t)((u >> (17 - bits)) & 0x7fff);
    return (e[0] + (((e[1] - e[0]) * f) >> 15)) * (1 << shift);
}

/* A function of v in [-1, 1) from a table of 2^bits + 1 Q31 entries over [-1, 1],
 * linearly interpolated. Indexed from the table's middle by v's own top bits. */
static inline int32_t mw_shape(const int32_t *t, int bits, int32_t v)
{
    const int32_t *c = &t[1 << (bits - 1)] + (v >> (32 - bits));
    return c[0] + qmul(c[1] - c[0], (int32_t)(((uint32_t)v << (bits - 1)) & 0x7fffffffu));
}

#endif
