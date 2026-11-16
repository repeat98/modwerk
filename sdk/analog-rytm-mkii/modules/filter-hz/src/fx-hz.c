// SPDX-License-Identifier: GPL-2.0-only
// filter-hz 1.3.0: the FX track's DELAY HPF/LPF and REVERB FRQ/HPF/LPF in hertz.
// Written for Modwerk by Nathaniel Pavel (npp1993).
//
// Stock OS 1.74's delay (0x4010da24) and reverb (0x4010d434) run at 48 kHz, 32 frames a block.
// Read in that code:
//   - HPF and LPF are one-pole filters with coefficients from a Q31 table (STOCK_POLES), four
//     entries a value, the fine byte included: the high-pass's is at HPF >> 6 and the low-pass's
//     at (HPF + LPF) >> 6, so where the low-pass sits depends on HPF too (the page's own graph
//     draws it that way).
//       low-pass   y = c y[-1] + k (1 - c) x
//       high-pass  h = c h[-1] + (1 + c)/2 (y - y[-1])
//   - REVERB FRQ and GAI are a first-order high shelf, FRQ's coefficient from a second Q31 table
//     (STOCK_SHELF, whole values only): y = b0 x + b1 x[-1] - a1 y[-1], b0 = c + (1 - c) G,
//     b1 = c - (1 - c) G, a1 = 2c - 1. Gain 1 at DC and G (GAI / 128) at Nyquist.
// No table is copied: the coefficient the DSP uses is read from the running OS, and the
// frequency is worked out from it here.
//
// Each frequency is f = fs/pi * atan(t), t = tan(w/2) at the point shown:
//   high-pass  -3 dB        t = (1 - c) / (1 + c)
//   low-pass   -3 dB        t = (1 - c) / sqrt(4c - (1 - c)^2); none below Nyquist when
//                           4c <= (1 - c)^2 (c <= 0.17): shown as OPEN
//   shelf      its corner   t = c / (1 - c), the -3 dB point at GAI 0
// atan2 is a CORDIC on 32-bit integers (no FPU on the MCF54455, no libgcc in a module).

typedef unsigned int u32;
typedef int s32;

#define ID_DELAY_HPF 76
#define ID_DELAY_LPF 77
#define ID_REVERB_FRQ 84
#define ID_REVERB_HPF 86
#define ID_REVERB_LPF 87

#ifndef STOCK_POLES                            // a host test points these at its own arrays
#define STOCK_POLES ((const s32 *)0x4028ab18)  // HPF/LPF coefficients, (word >> 6), 0..1016 used
#define STOCK_SHELF ((const s32 *)0x4028a318)  // reverb FRQ shelf coefficients, whole value 0..127
#endif
#define WORD_MAX 0x7f00                        // 127.0 in 8.8

// The FX track's page view (DELAY, REVERB, ...): its class, and stock's value getter, which
// the page's HPF/LPF graph uses: the held trig's lock, else the parameter, plus modulation
// when the view shows it.
#define FX_PAGE_VTABLE 0x401e1590
#define PAGE_VALUE_AT 0x400398a4                // (view, id) -> 8.8
#define BRAIN_AT 0x419f28f8                     // *: the brain
#define BRAIN_VIEWS 32                          // brain + 32: the view manager
#define MANAGER_LIST 20                         // view manager + 20: its list's sentinel
#define MANAGER_LAST 24                         // view manager + 24: the top view's node
#define NODE_PREV 4
#define NODE_VIEW 8
#define MAX_VIEWS 32                            // a guard; the stack holds about a dozen

#define NOINLINE __attribute__((noinline))   // one copy each: these are on the UI path only
#define WORD(p, off) (*(volatile u32 *)((char *)(p) + (off)))

// atan(2^-i) in Q30, i = 0..27.
static const s32 atan_q30[28] = {
    843314857, 497837829, 263043837, 133525159, 67021687, 33543516, 16775851, 8388437,
    4194283, 2097149, 1048576, 524288, 262144, 131072, 65536, 32768,
    16384, 8192, 4096, 2048, 1024, 512, 256, 128,
    64, 32, 16, 8,
};

// (a * b) >> 32, unsigned, from 16-bit halves.
NOINLINE static u32 mulhi(u32 a, u32 b)
{
    u32 ah = a >> 16, al = a & 0xffff, bh = b >> 16, bl = b & 0xffff;
    u32 mid1 = ah * bl, mid2 = al * bh, low = al * bl;
    u32 carry = ((low >> 16) + (mid1 & 0xffff) + (mid2 & 0xffff)) >> 16;
    return ah * bh + (mid1 >> 16) + (mid2 >> 16) + carry;
}

NOINLINE static u32 isqrt(u32 n)
{
    u32 root = 0, bit = 1u << 30;
    while (bit > n)
        bit >>= 2;
    while (bit) {
        if (n >= root + bit) {
            n -= root + bit;
            root = (root >> 1) + bit;
        } else
            root >>= 1;
        bit >>= 2;
    }
    return root;
}

// atan2(y, x) in Q30 for x > 0, y >= 0 (Q29 inputs: x <= 2^30, y <= 2^29). The CORDIC gain
// (1.647) then keeps x under 2^31: 1.647 * sqrt(2^60 + 2^58) = 1.98e9.
NOINLINE static u32 atan2_q30(s32 y, s32 x)
{
    s32 z = 0;
    int i;
    for (i = 0; i < 28; i++) {
        s32 dx = y >> i, dy = x >> i;
        if (y > 0) {
            x += dx;
            y -= dy;
            z += atan_q30[i];
        } else {
            x -= dx;
            y += dy;
            z -= atan_q30[i];
        }
    }
    return z < 0 ? 0 : (u32)z;
}

// The frequency of angle atan(t) = z (Q30, under pi/2) in milli-Hz, truncated (put_hz does
// the one rounding): f = fs/pi * z / 2^30 * 1000 = z * 15278874.5 / 2^30 = mulhi(2z, 2 * that).
NOINLINE static u32 milli_hz(u32 z)
{
    return mulhi(z << 1, 30557749u);
}

// Q31 coefficient helpers: u = 1 - c in Q31, both as unsigned.
static u32 one_minus(s32 c)
{
    return 0x80000000u - (u32)c;
}

enum { HIGH_PASS, LOW_PASS, SHELF };

// The frequency in milli-Hz for coefficient c (Q31) of a filter of that kind; 0 for a low-pass
// with no -3 dB point below Nyquist. Inputs to atan2 in Q29.
NOINLINE static u32 fx_hz(int kind, s32 c)
{
    u32 u = one_minus(c);                       // 1 - c, Q31
    s32 y = (s32)(u >> 2), x;
    if (kind == HIGH_PASS)
        x = (s32)((0u - u) >> 2);               // 1 + c = 2 - u (2^32 - u31, unsigned)
    else if (kind == LOW_PASS) {
        // sqrt(4c - u^2). In Q29: 4c = c31, u^2 = (u31^2 >> 32) >> 1.
        s32 d29 = c - (s32)(mulhi(u, u) >> 1);
        if (c <= 0 || d29 <= 0)
            return 0;
        // sqrt(d) * 2^29 = isqrt(d * 2^30) << 14; d < 4, so d * 2^30 = d29 << 1 fits.
        x = (s32)(isqrt((u32)d29 << 1) << 14);
    } else {
        x = y;                                  // shelf: t = c / u
        y = c >> 2;
    }
    return milli_hz(atan2_q30(y, x));
}

static s32 clamp_word(s32 w)
{
    return w < 0 ? 0 : w > WORD_MAX ? WORD_MAX : w;
}

// The FX page view on the view stack, or 0.
static void *fx_page_view(void)
{
    char *brain = *(char **)BRAIN_AT, *views, *node, *sentinel;
    int n;
    if (!brain)
        return 0;
    views = (char *)WORD(brain, BRAIN_VIEWS);
    if (!views)
        return 0;
    sentinel = views + MANAGER_LIST;
    node = (char *)WORD(views, MANAGER_LAST);
    for (n = 0; node && node != sentinel && n < MAX_VIEWS; n++) {
        u32 view = WORD(node, NODE_VIEW);
        if (view && WORD(view, 0) == FX_PAGE_VTABLE)
            return (void *)view;
        node = (char *)WORD(node, NODE_PREV);
    }
    return 0;
}

// Three significant figures: 5.00Hz, 48.1Hz, 463Hz, 1.43kHz, 12.0kHz. f in milli-Hz, at
// least 1000 (1.00Hz; the lowest here is HPF 0, 5.00Hz).
NOINLINE static char *put_hz(char *out, u32 f)
{
    // n = f / 10^k rounded, 100..999 (a carry to 1000 moves up a k).
    // k = 1: x.xxHz, 2: xx.xHz, 3: xxxHz, 4: x.xxkHz, 5: xx.xkHz.
    u32 div = 1, n, digits[3];
    int lead, k = 0, i;
    for (;;) {
        n = (f + div / 2) / div;
        if (n < 1000)
            break;
        div *= 10;
        k++;
    }
    lead = k % 3 == 1 ? 1 : k % 3 == 2 ? 2 : 0;   // digits before the point, 0 = none
    digits[0] = n / 100;
    digits[1] = n / 10 % 10;
    digits[2] = n % 10;
    for (i = 0; i < 3; i++) {
        *out++ = (char)('0' + digits[i]);
        if (i + 1 == lead)
            *out++ = '.';
    }
    if (k >= 4)
        *out++ = 'k';
    *out++ = 'H';
    *out++ = 'z';
    return out;
}

static void put_text(char *out, const char *s)
{
    while ((*out++ = *s++))
        ;
}

// From filter_hz_gate in param_value_text, for ids 76..87. Returns 1 once buf holds the
// text, 0 to leave the value to stock.
int filter_hz_fx_text(int id, s32 value, char *buf)
{
    u32 f;
    int hpf;
    char *end;
    switch (id) {
    case ID_DELAY_HPF:
    case ID_REVERB_HPF:
        f = fx_hz(HIGH_PASS, STOCK_POLES[clamp_word(value) >> 6]);
        break;
    case ID_DELAY_LPF:
    case ID_REVERB_LPF: {
        void *view = fx_page_view();
        s32 h;
        if (!view)
            return 0;                           // no FX page: stock's number
        hpf = id == ID_DELAY_LPF ? ID_DELAY_HPF : ID_REVERB_HPF;
        h = ((s32 (*)(void *, int))PAGE_VALUE_AT)(view, hpf);
        f = fx_hz(LOW_PASS, STOCK_POLES[(clamp_word(h) + clamp_word(value)) >> 6]);
        if (!f) {
            put_text(buf, "OPEN");
            return 1;
        }
        break;
    }
    case ID_REVERB_FRQ:
        f = fx_hz(SHELF, STOCK_SHELF[clamp_word(value) >> 8]);
        break;
    default:
        return 0;
    }
    if (f < 1000)
        return 0;                               // under 1 Hz: not reached; stock's number
    end = put_hz(buf, f);
    *end = 0;
    return 1;
}
