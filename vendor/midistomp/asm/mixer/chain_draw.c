/* Mixer Mode: draws the Effect Chain screen (stock screen 3) into a 128 x 64 frame buffer
 * (the node knob pages are drawn by stock code: pages.c). A port of drawChain() / columns() in
 * docs/dev/mixer-ui-mockup.html (v20): mono / stereo input, the four modes, the three Output
 * Modes, Mute (dotted lanes), the silent "!". No Smart Warning, no popup (M3c).
 * Pure: reads Chain, writes only fb. No libc, no floats, no RTS (no / % by variables).
 * fb: row-major, bit 7 of byte 0 = pixel (0,0), 1 = ink. */
#include "chain.h"

#define CW 38                   /* cover width / height, and the rows of the three line sets */
#define CH 19
#define YC 32                   /* the single line; YA / YB: the Bus A / Bus B rows */
#define YA 21
#define YB 43

#define K_IN 0                  /* column kinds, signal order IN ... OUT (right to left on screen) */
#define K_OUT 1
#define K_EFF 2
#define K_NODE 3
#define K_BUS 4

typedef struct { int kind, e, a, b, bi, jn; } Col;  /* e: slot or IT_*; a / b: the Bus A / Bus B slot or -1; bi: bus column index or -1; jn: last Serial column (its lines may join) */
typedef struct { int y, nt, t[4]; } Grp;               /* a fan group: line y forks into / joins from the nt lines t */
typedef struct { unsigned char (*fb)[16]; const Chain *c; int cur; } D;

/* Stock fonts from the mockup: 5x7 (bit 4 = left column) for covers and titles, 3x5 (bit 2) for softkeys, hints, tags. */
static const char K5[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 []-.!/";
static const unsigned char G5[][7] = {
    {14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},{28,18,17,17,17,18,28},{31,16,16,30,16,16,31},{31,16,16,30,16,16,16},
    {14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{14,4,4,4,4,4,14},{7,2,2,2,2,18,12},{17,18,20,24,20,18,17},{16,16,16,16,16,16,31},
    {17,27,21,21,17,17,17},{17,17,25,21,19,17,17},{14,17,17,17,17,17,14},{30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},
    {15,16,16,14,1,1,30},{31,4,4,4,4,4,4},{17,17,17,17,17,17,14},{17,17,17,17,17,10,4},{17,17,17,21,21,21,10},{17,17,10,4,10,17,17},
    {17,17,10,4,4,4,4},{31,1,2,4,8,16,31},{0,0,14,1,15,17,15},{16,16,22,25,17,17,30},{0,0,14,16,16,17,14},{1,1,13,19,17,17,15},
    {0,0,14,17,31,16,14},{6,9,8,28,8,8,8},{0,15,17,17,15,1,14},{16,16,22,25,17,17,17},{4,0,12,4,4,4,14},{2,0,6,2,2,18,12},
    {16,16,18,20,24,20,18},{12,4,4,4,4,4,14},{0,0,26,21,21,17,17},{0,0,22,25,17,17,17},{0,0,14,17,17,17,14},{0,0,30,17,30,16,16},
    {0,0,13,19,15,1,1},{0,0,22,25,16,16,16},{0,0,14,16,14,1,30},{8,8,28,8,8,9,6},{0,0,17,17,17,19,13},{0,0,17,17,17,10,4},
    {0,0,17,17,21,21,10},{0,0,17,10,4,10,17},{0,0,17,17,15,1,14},{0,0,31,2,4,8,31},{14,17,19,21,25,17,14},{4,12,4,4,4,4,14},
    {14,17,1,2,4,8,31},{31,2,4,2,1,17,14},{2,6,10,18,31,2,2},{31,16,30,1,1,17,14},{6,8,16,30,17,17,14},{31,1,2,4,8,8,8},
    {14,17,17,14,17,17,14},{14,17,17,15,1,2,12},{0,0,0,0,0,0,0},{14,8,8,8,8,8,14},{14,2,2,2,2,2,14},{0,0,0,31,0,0,0},
    {0,0,0,0,0,12,12},{4,4,4,4,4,0,4},{0,1,2,4,8,16,0},
};
static const char K3[] = "ABCDEGILMNOPRSTUX/F? !H{}";
static const unsigned char G3[][5] = {
    {2,5,7,5,5},{6,5,6,5,6},{3,4,4,4,3},{6,5,5,5,6},{7,4,6,4,7},{3,4,5,5,3},
    {7,2,2,2,7},{4,4,4,4,7},{5,7,7,5,5},{6,5,5,5,5},{2,5,5,5,2},{6,5,6,4,4},
    {6,5,6,5,5},{3,4,2,1,6},{7,2,2,2,2},{5,5,5,5,7},{5,5,2,5,5},{1,1,2,4,4},
    {7,4,6,4,4},{6,1,2,0,2},{0,0,0,0,0},{2,2,2,0,2},{5,5,7,5,5},{1,3,7,3,1},
    {4,6,7,6,4},
};

/* ---- pixels --------------------------------------------------------------------------- */
static void fill(const D *d, int x, int y, int w, int h, int ink)
{
    int i, j;
    for (j = y; j < y + h; j++) {
        if (j < 0 || j > 63) continue;
        for (i = x; i < x + w; i++) {
            if (i < 0 || i > 127) continue;
            if (ink) d->fb[j][i >> 3] |= (unsigned char)(0x80 >> (i & 7));
            else d->fb[j][i >> 3] &= (unsigned char)~(0x80 >> (i & 7));
        }
    }
}

static void invert(const D *d, int x, int y, int w, int h)
{
    int i, j;
    for (j = y; j < y + h; j++) {
        if (j < 0 || j > 63) continue;
        for (i = x; i < x + w; i++)
            if (i >= 0 && i < 128) d->fb[j][i >> 3] ^= (unsigned char)(0x80 >> (i & 7));
    }
}

static void sq(const D *d, int x, int y, int w, int h)  /* square 1-px frame */
{
    fill(d, x, y, w, 1, 1); fill(d, x, y + h - 1, w, 1, 1);
    fill(d, x, y + 1, 1, h - 2, 1); fill(d, x + w - 1, y + 1, 1, h - 2, 1);
}

static int slen(const char *s) { int n = 0; while (s[n]) n++; return n; }

static void text(const D *d, const char *keys, const unsigned char *g, int rows, int bits,
                 const char *s, int x, int y, int ink, int bold)
{
    int n, k, r, i;
    for (; *s; s++) {
        for (k = 0, n = -1; keys[k]; k++) if (keys[k] == *s) { n = k; break; }
        if (n < 0) for (k = 0; keys[k]; k++) if (keys[k] == ' ') { n = k; break; }
        for (r = 0; r < rows; r++)
            for (i = 0; i < bits; i++)
                if (g[n * rows + r] >> (bits - 1 - i) & 1) fill(d, x + i, y + r, bold ? 2 : 1, 1, ink);
        x += bits + 1 + (bold ? 1 : 0);
    }
}

static void t5(const D *d, const char *s, int x, int y, int ink, int bold) { text(d, K5, &G5[0][0], 7, 5, s, x, y, ink, bold); }
static void t3(const D *d, const char *s, int x, int y, int ink) { text(d, K3, &G3[0][0], 5, 3, s, x, y, ink, 0); }
static void t7(const D *d, const char *s, int x, int y) { t5(d, s, x, y, 1, 1); }   /* the stock cover font: 6 x 7 */
static int w5(const char *s, int bold) { return slen(s) * (bold ? 7 : 6) - 1; }
static int w3(const char *s) { return slen(s) * 4 - 1; }

/* Stock CHO: the item inverted inside a box 2 px larger; the cursor is only that box's outline.
 * clear() before drawing the item, mark() after. */
static void clear(const D *d, int x, int y, int w, int h, int cur)
{
    if (cur) fill(d, x - 2, y - 2, w + 4, h + 4, 0); else fill(d, x, y, w, h, 0);
}

static void mark(const D *d, int x, int y, int w, int h, int sel)
{
    if (sel) invert(d, x - 2, y - 2, w + 4, h + 4); else sq(d, x - 2, y - 2, w + 4, h + 4);
}

/* ---- covers --------------------------------------------------------------------------- */
/* The stock cover: top and bottom edges 2 rows (outer row 1 px shorter each end), 1-px sides, a dot
 * inside each corner. t = 1 for a selected cover (inverted: its outline becomes the 1-px gap). */
static void prect(const D *d, int l, int y, int dot, int x, int yy, int w, int h)
{
    int i, j;
    for (i = 0; i < w; i++)
        for (j = 0; j < h; j++)
            if (!dot || ((x + i + yy + j) & 1) == 0) fill(d, l + x + i, y + yy + j, 1, 1, 1);
}

static void pill(const D *d, int l, int y, int dot, int t)
{
    prect(d, l, y, dot, 1, 0, CW - 2, 1);
    prect(d, l, y, dot, 0, 1, CW, t - 1);
    prect(d, l, y, dot, 0, CH - t, CW, t - 1);
    prect(d, l, y, dot, 1, CH - 1, CW - 2, 1);
    prect(d, l, y, dot, 0, t, 1, CH - 2 * t);
    prect(d, l, y, dot, CW - 1, t, 1, CH - 2 * t);
    prect(d, l, y, dot, 1, t, 1, 1);
    prect(d, l, y, dot, CW - 2, t, 1, 1);
    prect(d, l, y, dot, 1, CH - 1 - t, 1, 1);
    prect(d, l, y, dot, CW - 2, CH - 1 - t, 1, 1);
}

static void part(const char *s, int off, char *o)       /* 5 chars of the name from off, NUL-safe */
{
    int i;
    for (i = 0; i < off; i++) if (!s[i]) { o[0] = 0; return; }
    for (i = 0; i < 5 && s[off + i]; i++) o[i] = s[off + i];
    o[i] = 0;
}

static void cover(const D *d, int slot, int l, int cy)
{
    int y = cy - 9, cur = d->cur == slot;
    char a[6], z[6];
    const char *nm = d->c->name[slot] ? d->c->name[slot] : "";
    clear(d, l, y, CW, CH, cur);
    pill(d, l, y, !d->c->on[slot], cur && d->c->sel ? 1 : 2);
    part(nm, 0, a); part(nm, 5, z);
    t7(d, a, l + 1 + (CW - 2 - w5(a, 1)) / 2, y + 2);
    if (d->c->full[slot]) part("     FULL", 5, z);      /* bypassed by DSP FULL: dotted (on = 0), FULL as line 2 */
    t7(d, z, l + 1 + (CW - 2 - w5(z, 1)) / 2, y + 10);
    if (cur) mark(d, l, y, CW, CH, d->c->sel);
}


/* ---- [ROUTE] / [MIX] nodes -------------------------------------------------------------- */
/* Mode icons: lines of [knot count, then x y per knot] x 0 (output) to 29 (input), rows 0-13; 0 ends. */
static const unsigned char IC_SERIAL[] = { 2, 0, 6, 29, 6, 0 };
static const unsigned char IC_SPLIT[] = { 2, 0, 2, 29, 2,  2, 0, 10, 29, 10, 0 };
static const unsigned char IC_PARAL[] = { 4, 0, 2, 11, 2, 19, 6, 29, 6,  4, 0, 10, 11, 10, 19, 6, 29, 6, 0 };
static const unsigned char IC_MONO[] = { 4, 0, 6, 10, 6, 18, 2, 29, 2,  4, 0, 6, 10, 6, 18, 10, 29, 10, 0 };
static const unsigned char IC_STEREO[] = { 6, 0, 2, 5, 2, 13, 6, 16, 6, 24, 2, 29, 2,
                                           6, 0, 10, 5, 10, 13, 6, 16, 6, 24, 10, 29, 10, 0 };
static const unsigned char *const IC_ROUTE[4] = { IC_SERIAL, IC_PARAL, IC_SPLIT, IC_MONO };
static const unsigned char *const IC_MIX[3] = { IC_STEREO, IC_MONO, IC_SPLIT };

static int udiv(int a, int b)   /* a >= 0, b > 0: no RTS on the pedal, so no / by a variable */
{
    int q = 0;
    while (a >= b) { a -= b; q++; }
    return q;
}

static void icon(const D *d, const unsigned char *p, int x, int y)
{
    int n, i, cx, x0, y0, x1, y1, dx, t;
    while (*p) {
        n = *p++;
        for (i = 1; i < n; i++) {
            x0 = p[2 * i - 2]; y0 = p[2 * i - 1]; x1 = p[2 * i]; y1 = p[2 * i + 1];
            dx = x1 - x0;
            for (cx = x0; cx <= x1; cx++)   /* y0 + (y1 - y0) * (cx - x0) / dx, rounded half up */
                fill(d, x + cx, y + udiv(2 * (y0 * dx + (y1 - y0) * (cx - x0)) + dx, 2 * dx), 1, 2, 1);
        }
        t = p[1];
        fill(d, x + 1, y + t - 1, 2, 4, 1); fill(d, x + 3, y + t - 2, 2, 6, 1);   /* arrowhead pointing left */
        p += 2 * n;
    }
}

static void node(const D *d, int n, int l)      /* stock EXIT box as wide as a cover, as tall as both bus rows */
{
    int top = YA - 9, h = YB - YA + CH, cur = d->cur == n;
    const char *name = n == IT_ROUTE ? "ROUTE" : "MIX";
    clear(d, l, top, CW, h, cur);
    sq(d, l, top, CW, h);
    t7(d, name, l + 1 + (CW - 2 - w5(name, 1)) / 2, top + 2);
    icon(d, n == IT_MIX ? IC_MIX[d->c->out % 3] : IC_ROUTE[d->c->mode & 3], l + 4, YC - 6);
    if (n == IT_MIX && d->c->silent) t7(d, "!", l + 16, top + 31);
    if (cur) mark(d, l, top, CW, h, d->c->sel);
}

/* ---- lanes ---------------------------------------------------------------------------- */
/* One line per channel: mono 1 line on row 32; stereo L on 31, R on 33 (bus rows 20 / 22 and 42 / 44).
 * Each helper writes the rows to o[] and returns how many. */
static int lane(int y, int st, int *o)
{
    if (st) { o[0] = y - 1; o[1] = y + 1; return 2; }
    o[0] = y;
    return 1;
}
static int is_par(const Chain *c) { return c->mode == 1 || c->mode == 2; }
static int lanes_m(const Chain *c, int *o) { return lane(YC, c->stereo, o); }                /* before [ROUTE] */
static int lanes_bus(const Chain *c, int y, int *o) { return lane(y, c->stereo && c->mode != 2, o); }   /* Split input: L alone on A, R on B */
static int lanes_ab(const Chain *c, int *o) { int n = lanes_bus(c, YA, o); return n + lanes_bus(c, YB, o + n); }
static int lanes_l(const Chain *c, int *o)      /* Serial: Mono Serial sums L and R before [ROUTE] */
{
    if (c->mode == 3) { o[0] = YC; return 1; }
    return lanes_m(c, o);
}
static int lanes_p(const Chain *c, int *o)      /* after [MIX]: Mono 1, Split 2 (A to L, B to R), Stereo as the input */
{
    if (c->out == 1 || c->mode == 3) { o[0] = YC; return 1; }
    if (c->out == 2 && is_par(c)) { o[0] = YC - 1; o[1] = YC + 1; return 2; }
    return lane(YC, c->stereo, o);
}

static int zone_of(const Chain *c, int slot)
{
    int b, i;
    for (b = 0; b < 4; b++)
        for (i = 0; i < c->nz[b]; i++) if (c->z[b][i] == slot) return b;
    return -1;
}

static int left_of(const Chain *c, const Col *col, int *o)     /* the rows the signal leaves a column on */
{
    int z;
    switch (col->kind) {
    case K_IN: return lanes_m(c, o);
    case K_OUT: return 0;
    case K_BUS: return lanes_ab(c, o);
    case K_NODE: return is_par(c) ? lanes_ab(c, o) : lanes_l(c, o);
    }
    z = zone_of(c, col->e);
    return z == PRE ? lanes_m(c, o) : z == POST ? lanes_p(c, o) : lanes_l(c, o);
}

static int plugs(const Chain *c, int out, int n, int *o)      /* Output Stereo: both jacks, even from one line */
{
    if (n > 1 || (out && c->out == 0)) { o[0] = YA; o[1] = YB; return 2; }
    o[0] = YC;
    return 1;
}

/* The fan in the gap between column j (right) and j + 1 (left): 1 split (before Parallel / Split [ROUTE]),
 * 2 sum (Mono Serial [ROUTE], L and R join before it), 3 join (after [MIX], or Serial with a mono Output). */
static int fan_kind(const Chain *c, const Col *cols, int nc, int j)
{
    int o[2];
    if (j < 0 || j + 1 >= nc) return 0;
    if (cols[j + 1].kind == K_NODE && cols[j + 1].e == IT_ROUTE) return is_par(c) ? 1 : c->mode == 3 && c->stereo ? 2 : 0;
    if (cols[j].kind == K_NODE && cols[j].e == IT_MIX) return 3;
    return cols[j].jn && lanes_p(c, o) < lanes_l(c, o) ? 3 : 0;
}

static int groups(const Chain *c, int kind, Grp *g)
{
    int m[2], p[2], l[2], b[2], nm = lanes_m(c, m), np, nl, nb, i, k, mm;
    if (kind == 1) {
        for (i = 0; i < nm; i++) {
            g[i].y = m[i];
            if (c->mode == 2) { g[i].nt = 1; g[i].t[0] = i ? YB : YA; }
            else { g[i].nt = 2; g[i].t[0] = m[i] - YC + YA; g[i].t[1] = m[i] - YC + YB; }
        }
        return nm;
    }
    if (kind == 2) {
        g[0].y = YC; g[0].nt = nm;
        for (i = 0; i < nm; i++) g[0].t[i] = m[i];
        return 1;
    }
    np = lanes_p(c, p);
    for (i = 0; i < np; i++) {
        g[i].y = p[i]; g[i].nt = 0;
        if (!is_par(c)) { nl = lanes_l(c, l); for (k = 0; k < nl; k++) g[i].t[g[i].nt++] = l[k]; continue; }
        for (mm = YA; mm <= YB; mm += YB - YA) {
            nb = lanes_bus(c, mm, b);
            for (k = 0; k < nb; k++)
                if (c->out == 2 ? mm == (p[i] < YC ? YA : YB) : np < 2 || nb < 2 || b[k] - mm == p[i] - YC)
                    g[i].t[g[i].nt++] = b[k];
        }
    }
    return np;
}

/* ---- wires, fans ----------------------------------------------------------------------- */
static void wires(const D *d, int nh, int h[][3], int nv, int v[][3])   /* a horizontal that crosses a vertical mid-way hops over it */
{
    int i, j, x0, x1;
    for (j = 0; j < nv; j++) fill(d, v[j][0], v[j][1], 1, v[j][2] - v[j][1] + 1, 1);
    for (i = 0; i < nh; i++) {
        x0 = h[i][1] < h[i][2] ? h[i][1] : h[i][2];
        x1 = h[i][1] < h[i][2] ? h[i][2] : h[i][1];
        for (j = 0; j < nv; j++)
            if (v[j][0] > x0 && v[j][0] < x1 && h[i][0] > v[j][1] && h[i][0] < v[j][2]) {
                fill(d, v[j][0], h[i][0] - 1, 1, 1, 0); fill(d, v[j][0], h[i][0] + 1, 1, 1, 0);
            }
        fill(d, x0, h[i][0], x1 - x0 + 1, 1, 1);
    }
}

static void fan(const D *d, int g, int w, const Grp *gr, int ng, int split)   /* one riser per group inside the gap g .. g+w-1 */
{
    int h[12][3], v[2][3], lo[2], hi[2], nh = 0, i, j, k, one = 1, dd, x;
    for (i = 0; i < ng; i++) {
        lo[i] = hi[i] = gr[i].y;
        for (k = 0; k < gr[i].nt; k++) {
            if (gr[i].t[k] < lo[i]) lo[i] = gr[i].t[k];
            if (gr[i].t[k] > hi[i]) hi[i] = gr[i].t[k];
        }
    }
    for (i = 0; i < ng; i++)
        for (j = 0; j < ng; j++)
            if (i != j && !(hi[i] < lo[j] || hi[j] < lo[i])) one = 0;     /* risers that do not overlap line up */
    for (i = 0; i < ng; i++) {
        dd = one ? 1 : 2 * i;
        x = split ? g + 2 + dd : g + w - 3 - dd;        /* risers in the middle 3 cols, clear of a cursor frame (2 px) */
        h[nh][0] = gr[i].y; h[nh][1] = split ? g + w - 1 : g; h[nh++][2] = x;
        for (k = 0; k < gr[i].nt; k++) { h[nh][0] = gr[i].t[k]; h[nh][1] = split ? g : g + w - 1; h[nh++][2] = x; }
        v[i][0] = x; v[i][1] = lo[i]; v[i][2] = hi[i];
    }
    wires(d, nh, h, ng, v);
}

static void hline(const D *d, int x, int y, int w, int dot)
{
    int i;
    if (!dot) { fill(d, x, y, w, 1, 1); return; }
    for (i = 0; i < w; i += 2) fill(d, x + i, y, 1, 1, 1);
}

/* A muted bus after its last effect is drawn dotted. */
static int dead(const Chain *c, const Col *col, int y)
{
    int k = y < YC ? BUS_A : BUS_B;
    return col->bi >= 0 && c->mute[k - 1] && col->bi >= c->nz[k] - 1;
}

/* ---- IN / OUT plugs -------------------------------------------------------------------- */
/* The stock IN plug, pixel for pixel (OUT is its mirror): x from the stub's left end, y from the top. */
static const unsigned char PLUG[15][4] = {
    {0,3,4,4}, {3,7,1,1}, {4,1,1,2}, {4,7,1,2},
    {5,0,13,1}, {5,9,13,1}, {18,0,1,10},
    {19,2,5,1}, {19,7,5,1}, {21,3,2,4},
    {24,3,1,1}, {24,6,1,1}, {25,2,2,1}, {25,7,2,1}, {27,3,1,4} };

static int px(int out, int l, int x, int w) { return out ? l + CW - 1 - (x - l) - (w - 1) : x; }

/* One plug per channel, L the upper one; ln[0..nl-1]: the rows the lines arrive on. */
static void jack(const D *d, int out, int l, int nl, const int *ln)
{
    int ys[2], lv[2], i, r, k, x, x0 = l + 5, top, n, h[4][3], v[2][3], a, b;
    n = plugs(d->c, out, nl, ys);
    for (i = 0; i < n; i++) lv[i] = i < nl ? ln[i] : ln[0];
    for (i = 0; i < n; i++) {
        top = ys[i] - 4;
        for (k = 0; k < 15; k++)
            fill(d, px(out, l, x0 + PLUG[k][0], PLUG[k][2]), top + PLUG[k][1], PLUG[k][2], PLUG[k][3], 1);
        for (r = 1; r <= 8; r++) {      /* the ridges */
            fill(d, px(out, l, x0 + 7 + (r % 2 ? 0 : 1), 1), top + r, 1, 1, 1);
            fill(d, px(out, l, x0 + 14 + (r % 2 ? 0 : 1), 1), top + r, 1, 1, 1);
        }
        x = px(out, l, l + 2, 1);       /* the risers share one vertical line */
        h[2 * i][0] = ys[i]; h[2 * i][1] = x; h[2 * i][2] = px(out, l, x0, 1);
        h[2 * i + 1][0] = lv[i]; h[2 * i + 1][1] = px(out, l, l, 1); h[2 * i + 1][2] = x;
        a = ys[i] < lv[i] ? ys[i] : lv[i]; b = ys[i] < lv[i] ? lv[i] : ys[i];
        v[i][0] = x; v[i][1] = a; v[i][2] = b;
    }
    wires(d, 2 * n, h, n, v);
    if (d->cur == (out ? IT_OUT : IT_IN)) mark(d, l, ys[0] - 4, CW, ys[n - 1] - ys[0] + 10, 0);
    if (out && d->c->limit) {           /* LIMIT tag between two plugs, else above the one */
        k = n > 1 ? YC - 3 : 12;
        fill(d, l + 9, k, w3("LIMIT") + 2, 7, 1);
        t3(d, "LIMIT", l + 10, k + 1, 0);
    }
}

/* A jack's lines; next to a node (tall enough for both) the cables go straight in at the plug rows. */
static int jack_lanes(const Chain *c, const Col *cols, int nc, int i, int *o)
{
    int out = cols[i].kind == K_OUT, nb = out ? i - 1 : i + 1, n;
    if (!out) n = lanes_m(c, o);
    else n = fan_kind(c, cols, nc, i - 1) ? lanes_p(c, o) : left_of(c, &cols[nb], o);
    return cols[nb].kind == K_NODE ? plugs(c, out, n, o) : n;
}

/* ---- the screen ----------------------------------------------------------------------- */
static void softkeys(const D *d, const char *lab[3], const char *hint[3])
{
    static const unsigned char XW[3][2] = { {2, 40}, {44, 40}, {86, 40} };   /* stock softkey 0xC009F8F0: x 42k+2..42k+41, y 57-63 */
    int i, w, x, h, r;
    for (i = 0; i < 3; i++) {
        x = XW[i][0]; w = XW[i][1];
        fill(d, x, 57, w, 7, 1);
        h = hint[i][0] ? (hint[i][0] == '^' ? 11 : w3(hint[i])) + 3 : 0;   /* a hint sits at the key's left end, the label centred in the rest */
        if (hint[i][0] == '^')                     /* "^v": the 5 x 3 up and down arrows, as Perform's */
            for (r = 0; r < 3; r++) { fill(d, x + 3 - r, 59 + r, 2 * r + 1, 1, 0); fill(d, x + 7 + r, 59 + r, 5 - 2 * r, 1, 0); }
        else if (h) t3(d, hint[i], x + 1, 58, 0);
        t3(d, lab[i], x + h + (w - h - w3(lab[i])) / 2, 58, 0);
    }
}

static void push(Col *cols, int *nc, int kind, int e, int a, int b, int bi)
{
    Col *k = &cols[(*nc)++];
    k->kind = kind; k->e = e; k->a = a; k->b = b; k->bi = bi; k->jn = 0;
}

void chain_draw(const Chain *c, unsigned char fb[64][16])
{
    D d;
    Col cols[16];
    Grp gr[2];
    int X[16], nc = 0, k, i, j, n, par = is_par(c), cur = c->cur, o[4], nl;
    int sel = c->sel, del = c->delp, onbus, fx, nm, ab, zn;
    const char *lab[3], *hint[3];
    static const char *const MODE[4] = { "SERIAL", "PARAL", "SPLIT", "MONOSER" };
    static const char *const OUTM[3] = { "STEREO", "MONO", "SPLIT" };

    for (j = 0; j < 64; j++) for (i = 0; i < 16; i++) fb[j][i] = 0;
    if (!par && cur == IT_MIX) cur = IT_ROUTE;      /* Serial has no [MIX] */
    d.fb = fb; d.c = c; d.cur = cur;

    push(cols, &nc, K_IN, IT_IN, -1, -1, -1);
    for (i = 0; i < c->nz[PRE]; i++) push(cols, &nc, K_EFF, c->z[PRE][i], -1, -1, -1);
    push(cols, &nc, K_NODE, IT_ROUTE, -1, -1, -1);
    if (par) {
        n = c->nz[BUS_A] > c->nz[BUS_B] ? c->nz[BUS_A] : c->nz[BUS_B];
        if (n < 1) n = 1;
        for (i = 0; i < n; i++)
            push(cols, &nc, K_BUS, -1, i < c->nz[BUS_A] ? c->z[BUS_A][i] : -1, i < c->nz[BUS_B] ? c->z[BUS_B][i] : -1, i);
        push(cols, &nc, K_NODE, IT_MIX, -1, -1, -1);
    } else {                                        /* zones A then B in a row */
        for (j = BUS_A; j <= BUS_B; j++)
            for (i = 0; i < c->nz[j]; i++) push(cols, &nc, K_EFF, c->z[j][i], -1, -1, -1);
        cols[nc - 1].jn = 1;
    }
    for (i = 0; i < c->nz[POST]; i++) push(cols, &nc, K_EFF, c->z[POST][i], -1, -1, -1);
    push(cols, &nc, K_OUT, IT_OUT, -1, -1, -1);

    for (k = 0, i = 0; i < nc; i++)
        if (cols[i].e == cur || cols[i].a == cur || cols[i].b == cur) { k = i; break; }

    X[k] = 45;                                      /* 3 columns at 3 / 45 / 87, the cursor's in the middle */
    for (i = k - 1; i >= 0 && i >= k - 2; i--) X[i] = X[i + 1] + CW + (fan_kind(c, cols, nc, i) ? 7 : 4);
    for (i = k + 1; i < nc && i <= k + 2; i++) X[i] = X[i - 1] - CW - (fan_kind(c, cols, nc, i - 1) ? 7 : 4);

    for (j = k - 2; j <= k + 1; j++) {              /* lines in the gap between column j and j + 1, out to the edges */
        int g, w, f, s = -1;
        if (j < 0 || j + 1 >= nc) continue;
        g = X[j + 1] + CW; w = X[j] - g; f = fan_kind(c, cols, nc, j);
        if (cols[j].kind <= K_OUT && cols[j + 1].kind == K_NODE) s = j;          /* a jack next to a node */
        else if (cols[j + 1].kind <= K_OUT && cols[j].kind == K_NODE) s = j + 1;
        if (s >= 0) {
            nl = jack_lanes(c, cols, nc, s, o);
            for (i = 0; i < nl; i++) hline(&d, g, o[i], w, 0);
        } else if (f) {
            fan(&d, g, w, gr, groups(c, f, gr), f == 1);
        } else {
            nl = left_of(c, &cols[j], o);
            for (i = 0; i < nl; i++) hline(&d, g, o[i], w, dead(c, &cols[j], o[i]));
        }
    }
    for (i = k - 1; i <= k + 1; i++) {
        int l;
        if (i < 0 || i >= nc) continue;
        l = X[i];
        if (cols[i].kind <= K_OUT) { nl = jack_lanes(c, cols, nc, i, o); jack(&d, cols[i].kind == K_OUT, l, nl, o); }
        else if (cols[i].kind == K_NODE) node(&d, cols[i].e, l);
        else if (cols[i].kind == K_EFF) cover(&d, cols[i].e, l, YC);
        else {
            if (cols[i].a >= 0) cover(&d, cols[i].a, l, YA);
            else { nl = lanes_bus(c, YA, o); for (n = 0; n < nl; n++) hline(&d, l, o[n], CW, c->mute[0]); }
            if (cols[i].b >= 0) cover(&d, cols[i].b, l, YB);
            else { nl = lanes_bus(c, YB, o); for (n = 0; n < nl; n++) hline(&d, l, o[n], CW, c->mute[1]); }
        }
    }

    /* title bar with the scroll arrows, then the softkeys with the knob hints */
    fill(&d, 0, 0, 128, 9, 1);
    t5(&d, "EFFECT CHAIN", 64 - w5("EFFECT CHAIN", 1) / 2, 1, 0, 1);
    if (k + 2 < nc) t3(&d, "{", 1, 2, 0);     /* the 3 x 5 side arrows */
    if (k - 2 >= 0) t3(&d, "}", 124, 2, 0);

    zn = cur >= 0 && cur < 6 ? zone_of(c, cur) : -1;
    onbus = zn == BUS_A || zn == BUS_B;
    fx = sel && cur >= 0 && cur < 6;
    nm = sel && (cur == IT_ROUTE || cur == IT_MIX);
    ab = (fx || (!sel && par && onbus && c->nz[zn == BUS_A ? BUS_B : BUS_A] > 0)) && !del && onbus && par;
    if (del) { lab[0] = ""; lab[1] = "DELETE?"; lab[2] = ""; }
    else if (sel) {
        lab[0] = "DROP"; lab[1] = fx ? "DELETE" : "";
        lab[2] = nm ? (cur == IT_MIX ? OUTM[c->out % 3] : MODE[c->mode & 3]) : ab ? "A/B" : "";
    } else { lab[0] = cur == IT_IN || cur == IT_OUT ? "" : "SELECT"; lab[1] = "EXIT"; lab[2] = "OPEN"; }
    hint[0] = "{}"; hint[1] = fx && !del ? "HOLD" : ""; hint[2] = nm ? "{}" : ab ? "^v" : "";
    softkeys(&d, lab, hint);
}
