/* Pixel and font helpers shared by perform_draw.c and asm/master/master.c: draw straight into the
 * LCD frame P (page format: byte = 8 rows of one column, bit 0 on top) with the pedal's own fonts (fonts.h).
 * The includer defines P first. No libc, no RTS. */
#ifndef DRAW_H
#define DRAW_H

#include "fonts.h"

/* ---- numbers and text ------------------------------------------------------------------ */
static unsigned udiv(unsigned a, unsigned b)
{
    unsigned q = 0, r = 0;
    int i;
    if (!b) return 0;
    for (i = 31; i >= 0; i--) {
        r = r << 1 | (a >> i & 1);
        if (r >= b) { r -= b; q |= 1u << i; }
    }
    return q;
}

static unsigned umod(unsigned a, unsigned b) { return a - b * udiv(a, b); }
static char *scat(char *o, const char *s) { while (*s) *o++ = *s++; *o = 0; return o; }

static char *ncat(char *o, int n)
{
    char t[12];
    int i = 0;
    do { t[i++] = (char)('0' + umod(n, 10)); n = udiv(n, 10); } while (n);
    while (i) *o++ = t[--i];
    *o = 0;
    return o;
}

static void upper(char *s) { for (; *s; s++) if (*s >= 'a' && *s <= 'z') *s -= 32; }

/* ---- pixels (page format: byte = 8 rows of one column, bit 0 on top) --------------------- */
static void px(int x, int y, int op)           /* 0 clear, 1 set, 2 xor */
{
    volatile unsigned char *b;
    if ((unsigned)x > 127 || (unsigned)y > 63) return;
    b = P + (y >> 3) * 128 + x;
    if (op == 2) *b ^= (unsigned char)(1 << (y & 7));
    else if (op) *b |= (unsigned char)(1 << (y & 7));
    else *b &= (unsigned char)~(1 << (y & 7));
}

static void invert(int x0, int y0, int x1, int y1)
{
    int x, y;
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) px(x, y, 2);
}

static void rect(int x0, int y0, int x1, int y1, int mode)   /* 0 fill, 1 outline + clear inside, 2 clear, 3 outline */
{
    int x, y, edge;
    for (y = y0; y <= y1; y++)
        for (x = x0; x <= x1; x++) {
            edge = x == x0 || x == x1 || y == y0 || y == y1;
            if (mode == 0) px(x, y, 1);
            else if (mode == 2) px(x, y, 0);
            else if (edge) px(x, y, 1);
            else if (mode == 1) px(x, y, 0);
        }
}

static void blit(int x, int y, int w, int h, const unsigned char *b, int ored)   /* column bytes, bit 0 on top */
{
    int r, c, v;
    for (r = 0; r < h; r++)
        for (c = 0; c < w; c++) {
            v = b[(r >> 3) * w + c] >> (r & 7) & 1;
            if (!ored || v) px(x + c, y + r, v);
        }
}

static int code(char ch) { return (ch < 32 ? 32 : ch > 126 ? 126 : ch) - 32; }
static int slen(const char *s) { int n = 0; while (s[n]) n++; return n; }

static void font7(const char *s, int x, int y) { for (; *s; s++, x += 7) blit(x, y, 7, 8, F7 + 7 * code(*s), 0); }
static void font7r(const char *s, int right, int y) { font7(s, right - 7 * slen(s), y); }
static void font7c(const char *s, int cx, int y) { font7(s, cx - 7 * slen(s) / 2, y); }
static void os6(const char *s, int x, int y) { for (; *s; s++, x += 6) blit(x, y, 6, 8, OS6 + 6 * code(*s), 0); }

static int softw(const char *s) { int n, t = 0; for (; *s; s++) { scols(*s, &n); t += n; } return t; }

static void small(const char *s, int x, int y)   /* ink rows y .. y + 4 */
{
    int n, j, r;
    const unsigned char *c;
    for (; *s; s++, x += n) {
        c = scols(*s, &n);
        for (j = 0; j < n; j++) for (r = 0; r < 8; r++) if (c[j] >> r & 1) px(x + j, y + r - 1, 1);
    }
}

static void softtext(const char *s, int x)       /* page 7, shifted down 1 (0xC009F6F0) */
{
    int n, j;
    const unsigned char *c;
    for (; *s; s++, x += n) {
        c = scols(*s, &n);
        for (j = 0; j < n; j++) if ((unsigned)(x + j) < 128u) P[7 * 128 + x + j] = (unsigned char)(c[j] << 1);
    }
}

#endif
