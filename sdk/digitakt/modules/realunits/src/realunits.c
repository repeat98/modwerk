/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Real Units for the Digitakt mk1 (OS 1.54): knob values in hertz, milliseconds and note lengths.
 * It takes over from Filter Hz 0.1. 0.2 joins the firmware a little later in the same two routines,
 * so it can sit in one build with machine-pages.
 *
 *   FLTR  FREQ            the cutoff in Hz           (table 0x40193cd8, as Filter Hz)
 *   FLTR  ATK DEC REL     the filter envelope in ms  (table 0x4018f944; DEC/REL 127 = INF)
 *   FLTR  env DEL         its delay in ms            (table 0x4018f544)
 *   AMP   ATK HOLD DEC    the amp envelope in ms     (table 0x4018ed44; HOLD/DEC 127 = INF)
 *   LFO   SPD, MULT       the pop-up adds the LFO's cycle length: bars, a note value or steps when it
 *                         runs with the tempo, Hz when free-running (audio tracks)
 * Delay TIME is left alone: the stock pop-up already names the note values (1/16, 1/8. ...).
 *
 * Where the numbers come from (OS 1.54, read from its code, nothing guessed):
 *   - amp envelope, 0x400716c0, runs once a sample (48 kHz). HOLD counts samples up to
 *     0x4018ed44[v]. DEC multiplies the level by 0x4018ef44[v] each sample: the time that takes to
 *     fall to a tenth is, entry for entry, the HOLD table's (64 -> 1838 ms in both), so that is the
 *     time shown. ATK adds 0x4018f144[v] a sample up to full: a tenth of the same table (127 = 1 s).
 *   - filter envelope, 0x40073304, runs once a block of 32 samples (1500 a second). ATK adds
 *     0x4018f944[v] a block up to 2^31: 2^31 / step blocks (127 = 10.0 s). DEC and REL multiply by
 *     0x4018f744[v]: again the time to a tenth equals the ATK table's entry. DEL counts samples to
 *     0x4018f544[v].
 *   - LFO, 0x400ed766, 1500 times a second: the phase goes round every 1382400000, and moves by
 *     SPD x MULT x base / 4 a call, base 14400 free-running (the tempo's otherwise, 14400 at 120 BPM).
 *     So one cycle is 2048 / (SPD x MULT) sixteenth steps, or SPD x MULT / 256 Hz free-running.
 *     LFO+'s slow MULT values (/2 /4 /8 /16) are counted in. */
#include <stdint.h>
#include "digitakt-mk1/core3.h"

#define T32(a) ((const int32_t *)(a))
#define CUTOFF  T32(0x40193cd8)
#define F_ATK   T32(0x4018f944)
#define F_DEL   T32(0x4018f544)
#define A_HOLD  T32(0x4018ed44)

enum { ID_FREQ = 30, ID_FATK = 34, ID_FDEC = 35, ID_FREL = 37, ID_FDEL = 39,
       ID_AATK = 44, ID_AHOLD = 45, ID_ADEC = 46,
       ID_SPD1 = 52, ID_MULT1 = 53, ID_SPD2 = 61, ID_MULT2 = 62 };

/* the stock pop-up text: what 0x400657ee does past our hook, the id's formatter (its UI record's
 * std::function at 0x4197e30c + 84 id) into the stock buffer */
typedef void (*fmt_call_fn)(uint32_t functor, int32_t value, char *buf);
static const char *ru_stock_pop(int32_t id, int32_t value)
{
    char *buf = (char *)0x4197de98;
    if (id < 0 || id >= 164)
        return 0;
    ((fmt_call_fn)0x40151eea)(0x4197e30cu + 84u * (uint32_t)id, value, buf);
    return buf;
}

static char *put_uint(char *p, uint32_t n)
{
    char tmp[10];
    int k = 0;
    do { tmp[k++] = (char)('0' + n % 10); n /= 10; } while (n);
    while (k) *p++ = tmp[--k];
    return p;
}

static char *put_str(char *p, const char *s)
{
    while (*s) *p++ = *s++;
    return p;
}

/* n in hundredths -> "12.34", "5.07" */
static char *put_2dec(char *p, uint32_t n)
{
    p = put_uint(p, n / 100);
    *p++ = '.';
    *p++ = (char)('0' + (n / 10) % 10);
    *p++ = (char)('0' + n % 10);
    return p;
}

static int32_t index7(int32_t value)
{
    int32_t i = value >> 8;
    return i < 0 ? 0 : i > 127 ? 127 : i;
}

/* ---- hertz (the filter) ------------------------------------------------------------------------------ */
static uint32_t freq_tenths(int32_t value)
{
    uint32_t t;
    if (value < 0) value = 0;
    if (value > 0x7f00) value = 0x7f00;
    t = (uint32_t)CUTOFF[value >> 5];
    return (((t >> 16) * 1875u + 64u) >> 7) + (((t & 0xffffu) * 1875u) >> 23);
}

static char *put_hz(char *p, uint32_t f10, int32_t wide)
{
    uint32_t hz = (f10 + 5) / 10;
    if (f10 < 1000) {
        p = put_uint(p, f10 / 10);
        *p++ = '.';
        *p++ = (char)('0' + f10 % 10);
    } else if (wide || hz < 1000) {
        p = put_uint(p, hz);
    } else if (hz < 10000) {
        p = put_2dec(p, (hz + 5) / 10);
        *p++ = 'k';
    } else {
        uint32_t d = (hz + 50) / 100;
        p = put_uint(p, d / 10);
        *p++ = '.';
        *p++ = (char)('0' + d % 10);
        *p++ = 'k';
    }
    if (wide) p = put_str(p, " Hz");
    return p;
}

/* ---- milliseconds (the envelopes) -------------------------------------------------------------------- */
#define INF 0xffffffffu

/* the time in microseconds, or INF, or 0 with *ok = 0 when id is not an envelope time */
static uint32_t env_us(int32_t id, int32_t value, int32_t *ok)
{
    int32_t i = index7(value);
    uint32_t n;
    *ok = 1;
    switch (id) {
    case ID_AATK:  return (uint32_t)A_HOLD[i] * 25u / 12u;              /* samples / 10 */
    case ID_AHOLD:
    case ID_ADEC:  return i == 127 ? INF : (uint32_t)A_HOLD[i] / 6u * 125u;    /* samples */
    case ID_FDEC:
    case ID_FREL:  if (i == 127) return INF;                            /* and as ATK: */
        /* fall through */
    case ID_FATK:
        n = (uint32_t)(-(uint32_t)F_ATK[i]);                            /* the step, a block */
        if (!n) return INF;
        n = 0x80000000u / n;                                            /* blocks, 1 .. 15001 */
        return n * 2000u / 3u;
    case ID_FDEL:  return (uint32_t)F_DEL[i] / 6u * 125u;
    }
    *ok = 0;
    return 0;
}

static char *put_time(char *p, uint32_t us, int32_t wide)
{
    if (us == INF)
        return put_str(p, "INF");
    if (us < 10000) {                           /* 0.02 .. 9.99 ms */
        p = put_2dec(p, (us + 5) / 10);
        if (wide) p = put_str(p, " ms");
    } else if (us < 100000) {                   /* 10.0 .. 99.9 ms */
        uint32_t d = (us + 50) / 100;
        p = put_uint(p, d / 10);
        *p++ = '.';
        *p++ = (char)('0' + d % 10);
        if (wide) p = put_str(p, " ms");
    } else if (us < 999500) {                   /* 100 .. 999 ms */
        p = put_uint(p, (us + 500) / 1000);
        if (wide) p = put_str(p, " ms");
    } else if (us < 9995000) {                  /* 1.00 .. 9.99 s */
        p = put_2dec(p, (us + 5000) / 10000);
        p = put_str(p, wide ? " s" : "s");
    } else {                                    /* 10.0 s and up */
        uint32_t d = (us + 50000) / 100000;
        p = put_uint(p, d / 10);
        *p++ = '.';
        *p++ = (char)('0' + d % 10);
        p = put_str(p, wide ? " s" : "s");
    }
    return p;
}

/* ---- the LFO's cycle ---------------------------------------------------------------------------------- */
/* MULT's value 0..31 -> mult = 2^shift (shift may be negative), and whether it free-runs */
static int32_t mult_shift(int32_t m, int32_t *free_run)
{
    if (m < 0) m = 0;
    if (m > 31) m = 31;
    if (m < 12) { *free_run = 0; return m; }
    if (m < 24) { *free_run = 1; return m - 12; }
    if (m < 28) { *free_run = 0; return 23 - m; }      /* LFO+: /2 /4 /8 /16 */
    *free_run = 1;
    return 27 - m;
}

/* spd: the SPD word (0x4000 = 0); writes " 1/4", " 2bar", " 6.40st", " 2.50Hz" or nothing */
static char *put_cycle(char *p, int32_t spd, int32_t mult)
{
    int32_t free_run, sh = mult_shift(mult, &free_run);
    uint32_t s = (uint32_t)(spd >= 0x4000 ? spd - 0x4000 : 0x4000 - spd);  /* |SPD| x 256 */
    uint32_t prod;                              /* |SPD| x MULT x 256 x 16 (the 16 for the slow ones) */
    if (!s)
        return put_str(p, " STOP");
    prod = sh >= 0 ? (s << sh) << 4 : (s << 4) >> -sh;
    if (!prod)
        return p;
    *p++ = ' ';
    if (free_run) {                             /* Hz = SPD x MULT / 256 */
        uint32_t h = prod >> 20;                /* whole Hz: prod / (256 x 256 x 16) */
        if (h >= 100) {
            p = put_uint(p, h);
        } else {
            p = put_2dec(p, prod < 0x4000000u ? (prod * 25u) >> 18 : (prod >> 18) * 25u);  /* x 100 >> 20 */
        }
        return put_str(p, "Hz");
    }
    /* with the tempo: SPD x MULT = 128 is one bar; prod = 128 x 4096 then */
    {
        const uint32_t bar = 128u * 4096u;
        uint32_t k;
        for (k = 1; k <= 64; k <<= 1)           /* 1, 2, 4 .. 64 bars */
            if (prod == bar / k) {
                p = put_uint(p, k);
                return put_str(p, "bar");
            }
        for (k = 2; k <= 128; k <<= 1)          /* 1/2 .. 1/128 */
            if (prod == bar * k) {
                p = put_str(p, "1/");
                return put_uint(p, k);
            }
        for (k = 2; k <= 64; k <<= 1)           /* dotted: one and a half times 1/k */
            if (prod * 3u == bar * k * 2u) {
                p = put_str(p, "1/");
                p = put_uint(p, k);
                *p++ = '.';
                return p;
            }
        /* otherwise in steps: 16 x bar / prod, in hundredths */
        {
            uint32_t q = prod >> 4, st;
            if (!q)
                return p - 1;
            st = bar * 100u / q;                /* 16 x 100 x bar / prod */
            if (st % 1600u == 0) {              /* whole bars */
                p = put_uint(p, st / 1600u);
                return put_str(p, "bar");
            }
            if (st >= 100000u) {
                p = put_uint(p, st / 100u);
            } else {
                p = put_2dec(p, st);
            }
            return put_str(p, "st");
        }
    }
}

/* the sound's other LFO value: the kit's sound of the active audio track, slot's word at 0x14 + 2 slot */
static int32_t sound_word(int32_t slot, int32_t *ok)
{
    uint32_t t = fw_active_track;
    const uint8_t *kit = fw_kit;
    const uint8_t *w;
    *ok = 0;
    if (t >= 8 || !kit)
        return 0;
    w = kit + 0x20 + 0xa2 * t + 0x14 + 2 * slot;
    *ok = 1;
    return (int32_t)((w[0] << 8) | w[1]);
}

/* ---- the two hooks ------------------------------------------------------------------------------------ */
/* the text under a turning knob (about 5 characters): nonzero when buf holds it */
int32_t ru_value_text(int32_t id, int32_t value, char *buf)
{
    int32_t ok;
    uint32_t us;
    if (id == ID_FREQ) {
        *put_hz(buf, freq_tenths(value), 0) = 0;
        return 1;
    }
    us = env_us(id, value, &ok);
    if (!ok)
        return 0;
    *put_time(buf, us, 0) = 0;
    return 1;
}

/* the pop-up's value: our buffer, or 0 for the stock text */
static char pop_buf[40];
const char *ru_pop_text(int32_t id, int32_t value)
{
    int32_t ok, other;
    uint32_t us;
    char *p = pop_buf;
    if (id == ID_FREQ) {
        *put_hz(p, freq_tenths(value), 1) = 0;
        return pop_buf;
    }
    us = env_us(id, value, &ok);
    if (ok) {
        *put_time(p, us, 1) = 0;
        return pop_buf;
    }
    if (id == ID_SPD1 || id == ID_SPD2 || id == ID_MULT1 || id == ID_MULT2) {
        int32_t is_spd = id == ID_SPD1 || id == ID_SPD2;
        int32_t base = id == ID_SPD1 || id == ID_MULT1 ? 1 : 9;        /* the LFO's SPD slot; MULT the next */
        const char *stock;
        other = sound_word(is_spd ? base + 1 : base, &ok);
        if (!ok)
            return 0;
        stock = ru_stock_pop(id, value);
        if (!stock)
            return 0;
        {
            int32_t n = 0;
            while (stock[n] && n < 20) { *p++ = stock[n]; n++; }
        }
        p = is_spd ? put_cycle(p, value, other >> 8) : put_cycle(p, other, value >> 8);
        *p = 0;
        return pop_buf;
    }
    return 0;
}
