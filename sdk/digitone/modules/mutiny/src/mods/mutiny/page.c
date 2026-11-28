/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "page.h"

/* The stock page's geometry */
static const int32_t col_x[4] = {33, 59, 86, 112};
#define ROW_Y(r) ((r) ? 15 : 42) /* a graphic's centre */
#define LBL_Y(r) ((r) ? 0 : 27)  /* its label */

static void px(const struct mu_canvas *cv, int32_t x, int32_t y, int32_t c) {
    cv->fill(cv->ctx, x, y, x, y, c);
}

static void rect(const struct mu_canvas *cv, int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    cv->fill(cv->ctx, x0, y0, x1, y1, 1);
}

static void rframe(const struct mu_canvas *cv, int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    cv->frame(cv->ctx, x0, y0, x1, y1, 1);
    px(cv, x0, y0, 0);
    px(cv, x1, y0, 0);
    px(cv, x0, y1, 0);
    px(cv, x1, y1, 0);
}

static void line(const struct mu_canvas *cv, int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    int32_t dx = x1 > x0 ? x1 - x0 : x0 - x1, sx = x0 < x1 ? 1 : -1;
    int32_t dy = y1 > y0 ? y0 - y1 : y1 - y0, sy = y0 < y1 ? 1 : -1;
    int32_t err = dx + dy, e2;
    for (;;) {
        px(cv, x0, y0, 1);
        if (x0 == x1 && y0 == y1)
            break;
        e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
}

static int32_t slen(const char *s) {
    int32_t n = 0;
    while (s[n])
        n++;
    return n;
}

static void text(const struct mu_canvas *cv, uint8_t font, int32_t x, int32_t y, const char *s) {
    cv->text(cv->ctx, font, x, y, s);
}

static void boxed(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t w, const char *s) {
    rframe(cv, cx - w, cy - 8, cx + w, cy + 8);
    text(cv, MU_FONT_5, cx - (4 * slen(s) - 1) / 2, cy - 2, s);
}

static const char *hex4(char *b, uint32_t v) {
    int32_t i;
    for (i = 0; i < 4; i++)
        b[i] = "0123456789ABCDEF"[v >> (12 - 4 * i) & 15u];
    b[4] = 0;
    return b;
}

static void num(char *b, int32_t v) { /* 0-999, the core exports no sprintf */
    char *p = b;
    if (v >= 100)
        *p++ = (char)('0' + v / 100);
    if (v >= 10)
        *p++ = (char)('0' + v / 10 % 10);
    *p++ = (char)('0' + v % 10);
    *p = 0;
}

static const char *signed_num(char *b, int32_t v) { /* -9..+9 */
    b[0] = v < 0 ? '-' : v > 0 ? '+' : ' ';
    b[1] = (char)('0' + (v < 0 ? -v : v) % 10);
    b[2] = 0;
    return v ? b : b + 1;
}

/* The pictures */
static const int8_t cos7[64] = {7,  7,  7,  7,  7,  7,  6,  6,  5,  5,  4,  3,  3,  2,  1,  1,
                                0,  -1, -1, -2, -3, -3, -4, -5, -5, -6, -6, -7, -7, -7, -7, -7,
                                -7, -7, -7, -7, -7, -7, -6, -6, -5, -5, -4, -3, -3, -2, -1, -1,
                                0,  1,  1,  2,  3,  3,  4,  5,  5,  6,  6,  7,  7,  7,  7,  7};
static const int8_t cos4[64] = {4,  4,  4,  4,  4,  4,  3,  3,  3,  3,  2,  2,  2,  1,  1,  0,
                                0,  0,  -1, -1, -2, -2, -2, -3, -3, -3, -3, -4, -4, -4, -4, -4,
                                -4, -4, -4, -4, -4, -4, -3, -3, -3, -3, -2, -2, -2, -1, -1, 0,
                                0,  0,  1,  1,  2,  2,  2,  3,  3,  3,  3,  4,  4,  4,  4,  4};

static void small_num(const struct mu_canvas *cv, int32_t cx, int32_t y, int32_t v) {
    char b[4];
    num(b, v);
    text(cv, MU_FONT_5, cx - (4 * slen(b) - 1) / 2, y, b);
}

/* STEP, LOOP, LEN: a ruler as long as the pattern's pages, filled to the loop's effective length.
 */
static void ruler(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v, int32_t pages) {
    int32_t i, full, x;
    if (pages < 1)
        pages = 1;
    full = 16 * pages;
    if (v > full)
        v = full;
    x = cx - 10 + v * 20 / full;
    for (i = cx - 10; i <= cx + 10; i += 2)
        px(cv, i, cy - 4, 1);
    for (i = 1; i < pages && i < 8; i++)
        rect(cv, cx - 10 + i * 20 / pages, cy - 7, cx - 10 + i * 20 / pages, cy - 6);
    rect(cv, cx - 10, cy - 5, x, cy - 3);
    rect(cv, x, cy - 7, x, cy);
    px(cv, x - 1, cy, 1);
    px(cv, x - 1, cy - 7, 1);
}

/* A ring of n (2-16) positions: a hit is a block, a rest a dot; needle points at a position. */
static void ring(const struct mu_canvas *cv, int32_t cx, int32_t cy, uint32_t n, uint32_t hits,
                 int32_t needle) {
    uint32_t i, k;
    if (n < 2)
        n = 2;
    if (n > 16)
        n = 16;
    for (i = 0; i < n; i++) {
        int32_t x, y;
        k = (48u + i * 64u / n) & 63u;
        x = cx + cos7[k];
        y = cy - cos7[(k + 48u) & 63u];
        if (hits & (1u << i))
            rect(cv, x - 1, y, x, y + 1);
        else
            px(cv, x, y, 1);
    }
    if (needle >= 0 && (uint32_t)needle < n) {
        k = (48u + (uint32_t)needle * 64u / n) & 63u;
        line(cv, cx, cy, cx + cos4[k], cy - cos4[(k + 48u) & 63u]);
        rect(cv, cx - 1, cy + 9, cx + 1, cy + 9);
    }
}

static void ladder(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v, int32_t hi) {
    int32_t k, y = cy - 7 + v * 14 / hi;
    for (k = 0; k <= 7; k++)
        rect(cv, cx - 6, cy - 7 + 2 * k, cx - 3, cy - 7 + 2 * k);
    rect(cv, cx - 9, y - 1, cx - 9, y + 1);
    px(cv, cx - 8, y, 1);
}

static void accents(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v, uint32_t beats) {
    int32_t i;
    for (i = 0; i < 7; i++) {
        int32_t x = cx - 10 + 3 * i, h = (beats >> i & 1u) ? 4 + v * 10 / 100 : 4;
        rect(cv, x, cy - 8, x + 1, cy - 9 + h);
    }
}

static void fill_pic(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    static const uint8_t order[8] = {0, 2, 4, 0, 3, 1, 0, 5};
    int32_t i, n = (v * 5 + 50) / 100;
    for (i = 0; i < 8; i++) {
        int32_t x = cx - 10 + 3 * i;
        if (!order[i])
            rect(cv, x, cy - 8, x + 1, cy + 2);
        else if (order[i] <= n)
            rect(cv, x, cy - 8, x + 1, cy - 5);
        else
            px(cv, x, cy - 8, 1);
    }
}

static void dens(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    int32_t k, n = (v * 24 + 50) / 100;
    for (k = 0; k < 24; k++) {
        int32_t x = cx - 9 + 4 * (k % 6), y = cy + 6 - 4 * (k / 6);
        if ((13 * k + 11) % 24 < n)
            rect(cv, x, y - 1, x + 1, y);
        else
            px(cv, x, y, 1);
    }
}

static void octaves(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    int32_t i;
    for (i = 0; i < 3; i++) {
        if (i < v)
            rect(cv, cx - 8, cy - 7 + 6 * i, cx + 8, cy - 4 + 6 * i);
        else
            cv->frame(cv->ctx, cx - 8, cy - 7 + 6 * i, cx + 8, cy - 4 + 6 * i, 1);
    }
}

static void padlock(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    int32_t x0 = cx - 11, x1 = cx - 2, lift = v >= 100 ? 0 : (119 - v) / 20, h = (v * 6 + 50) / 100;
    rframe(cv, x0, cy - 7, x1, cy);
    if (h > 0)
        rect(cv, x0 + 1, cy - 6, x1 - 1, cy - 7 + h);
    rect(cv, x0 + 2, cy + 1, x0 + 2, cy + 4 + lift);
    rect(cv, x0 + 3, cy + 5 + lift, x1 - 3, cy + 5 + lift);
    rect(cv, x1 - 2, cy + 1 + lift, x1 - 2, cy + 4 + lift);
}

static void pitches(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    int32_t i;
    for (i = 0; i < 8; i++) {
        int32_t x = cx - 11 + 3 * i, y = cy - 7 + 2 * i;
        if (i < v)
            rect(cv, x, y - 1, x + 1, y);
        else
            px(cv, x, y, 1);
    }
}

static void glides(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    static const int8_t ny[4] = {-6, 2, -3, 6};
    int32_t i, run = v ? 1 + v * 3 / 100 : 0;
    for (i = 0; i < 4; i++) {
        int32_t x = cx - 12 + 6 * i, y = cy + ny[i];
        int32_t joined = v && (i == 2 || (i == 1 && v > 66) || (i == 3 && v > 83));
        rect(cv, x, y, x + 1, y + 1);
        if (joined) {
            line(cv, x - 5, cy + ny[i - 1] + 1, x - run, y);
            rect(cv, x - run, y, x - 1, y);
        }
    }
}

static void shift_pic(const struct mu_canvas *cv, int32_t cx, int32_t cy, int32_t v) {
    int32_t y = cy - 1 + v * 6 / 7;
    rect(cv, cx - 11, cy - 1, cx - 6, cy - 1);
    rect(cv, cx - 10, y - 1, cx - 7, y + 1);
}

static void seed_hex(const struct mu_canvas *cv, int32_t cx, int32_t cy, uint32_t s, int32_t roll) {
    static const uint16_t pips[6] = {0x010, 0x101, 0x111, 0x145, 0x155, 0x16d};
    char b[5];
    int32_t x0 = cx - 14, y0 = cy - 4, k, face = roll > 0 ? (roll / 3) % 6 : (int32_t)(s % 6u);
    uint32_t m = pips[face];
    rframe(cv, x0, y0, x0 + 8, y0 + 8);
    for (k = 0; k < 9; k++)
        if (m >> k & 1u)
            px(cv, x0 + 2 + 2 * (k % 3), y0 + 2 + 2 * (k / 3), 1);
    text(cv, MU_FONT_5, cx - 3, cy - 2, hex4(b, s));
}

/* RIFF's fretboard: the loop's hits as blocks on the string of the note they play. */
static void riff_notes(const struct mu_canvas *cv, int32_t cx, int32_t cy,
                       const struct mu_page_state *st) {
    const uint8_t *p = st->recipe.p[MU_EUCL];
    uint8_t ivs[12], walk[MU_SRC];
    uint32_t n = mu_scale_notes(st->scale, ivs);
    uint32_t riff = p[6], len = st->preview.len;
    int32_t span = n > 1 ? (int32_t)n - 1 : 1, low = cy - 5, top = low + 12;
    int32_t j, x, y;
    uint32_t s;
    mu_riff_degrees(&st->recipe, n, walk);
    for (j = 0; j < 4; j++)
        for (x = cx - 9; x <= cx + 10; x += 3)
            px(cv, x, low + 4 * j, 1);
    for (y = low; y <= top; y++)
        px(cv, cx - 11, y, 1); /* the nut */
    for (s = 0; s < st->preview.cells && s < 16; s++) {
        uint32_t si;
        if (!(st->preview.play >> s & 1u))
            continue;
        si = mu_loop_pos(MU_EUCL, len, p[2], s) % MU_SRC;
        x = cx - 9 + (int32_t)(s * 19u / (st->preview.cells ? st->preview.cells : 16));
        y = low + 4 * (mu_below(st->recipe.src.a[si], riff) ? (int32_t)walk[si] * 3 / span : 0);
        rect(cv, x, y, x + 1, y + 1);
    }
}

/* The page */
static int32_t knob_max(uint8_t m, uint8_t k) { return mu_knob_max(m, k); }

static void picture(const struct mu_canvas *cv, const struct mu_page_state *st, int32_t k,
                    int32_t cx, int32_t cy) {
    uint8_t m = st->recipe.model;
    int32_t v = st->value[k];
    if (m == MU_TB3P) {
        switch (k) {
        case 1:
            ruler(cv, cx, cy, st->preview.len, (int32_t)st->pages);
            break;
        case 2:
            dens(cv, cx, cy, 10 + 14 * v > 100 ? 100 : 10 + 14 * v);
            break;
        case 3: {
            uint8_t ivs[12];
            uint32_t n = mu_scale_notes(st->scale, ivs);
            pitches(cv, cx, cy, (int32_t)mu_acid_range((uint32_t)v, n) + 1);
            break;
        }
        case 4:
            glides(cv, cx, cy, v);
            break;
        case 5:
            accents(cv, cx, cy, v, 0x4au);
            break;
        case 6:
            shift_pic(cv, cx, cy, v - 7);
            break;
        default:
            seed_hex(cv, cx, cy, st->seed, st->roll);
            break;
        }
        return;
    }
    if (m == MU_EUCL) {
        switch (k) {
        case 1:
            ruler(cv, cx, cy, st->preview.len, (int32_t)st->pages);
            break;
        case 2: { /* the ring shows the effective count, never the stored dead zone */
            uint32_t i, shown = 0, cells = st->preview.cells;
            for (i = 0; i < cells; i++)
                shown += st->preview.gates >> i & 1u;
            ring(cv, cx, cy, cells, st->preview.gates, -1);
            small_num(cv, cx, cy - 2, (int32_t)shown);
            break;
        }
        case 3:
            ring(cv, cx, cy, st->preview.cells, st->preview.gates, (int32_t)st->preview.start);
            break;
        case 4:
            ladder(cv, cx, cy, v, 14);
            break;
        case 5:
            accents(cv, cx, cy, v, 0x11u);
            break;
        case 6:
            fill_pic(cv, cx, cy, v);
            break;
        default:
            riff_notes(cv, cx, cy, st);
            break;
        }
    } else {
        switch (k) {
        case 1:
            ruler(cv, cx, cy, st->preview.len, (int32_t)st->pages);
            break;
        case 2:
            dens(cv, cx, cy, v);
            break;
        case 3:
            octaves(cv, cx, cy, v);
            break;
        case 4:
            accents(cv, cx, cy, v, 0x4au);
            break;
        case 5:
            ring(cv, cx, cy, st->preview.cells, st->preview.gates, (int32_t)st->preview.start);
            break;
        case 6:
            ladder(cv, cx, cy, v, 14);
            break;
        default:
            padlock(cv, cx, cy, v);
            break;
        }
    }
}

const char *mu_page_title(const struct mu_page_state *st) {
    static char buf[20];
    const char *base;
    uint32_t i, page;
    if (st->overload)
        return "Mutiny: Overload";
    if (st->kept == 2)
        return "Mutiny: Not kept";
    if (st->kept == 1)
        base = "Mutiny: Kept";
    else if (st->holding)
        base = "Mutiny: Hold";
    else if (st->play == MU_PLAY_GENERATED)
        base = "Mutiny: Live";
    else if (st->undo)
        base = "Mutiny: Undo";
    else
        base = "Mutiny: Native";
    /* Which page YES writes, once a track has more than one: a page commit is a different
     * operation from a whole-track one, and this is the only place that says which. */
    page = st->kept == 1 ? st->kept_page : st->key_page;
    if (st->pages < 2 || page > 3)
        return base;
    for (i = 0; base[i]; i++)
        buf[i] = base[i];
    buf[i++] = ' ';
    buf[i++] = 'P';
    buf[i++] = (char)('1' + page);
    buf[i] = 0;
    return buf;
}

void mu_page_keys(const struct mu_page_state *st, uint8_t out[16]) {
    uint32_t i, base = (uint32_t)st->page * 16u;
    for (i = 0; i < 16; i++) {
        uint32_t s = base + i;
        if (s >= st->track_len || s >= MU_STEPS)
            out[i] = 0;
        else if (st->playing && s == base + st->step)
            out[i] = 4;
        else if (!(st->preview.play >> s & 1u))
            out[i] = 0;
        else if (st->preview.slide >> s & 1u)
            out[i] = 5;
        else if (st->preview.accent >> s & 1u)
            out[i] = 3;
        else
            out[i] = 2;
    }
}

void mu_page_draw(const struct mu_canvas *cv, const struct mu_page_state *st) {
    uint8_t m = st->recipe.model;
    int32_t k;
    char b[5];
    if (!st->visible)
        return;
    cv->fill(cv->ctx, 15, 0, 127, 63, 0); /* the stock pattern box and left column stay */
    text(cv, MU_FONT_TITLE, 19, 56, mu_page_title(st));
    cv->fill(cv->ctx, 17, 54, 127, 63, -1); /* the title bar, inverted, its corners round */
    px(cv, 17, 54, 0);
    px(cv, 17, 63, 0);
    px(cv, 127, 54, 0);
    px(cv, 127, 63, 0);
    for (k = 0; k < 8; k++) {
        int32_t cx = col_x[k & 3], r = k >> 2, cy = ROW_Y(r), v;
        const char *l;
        if (k && !m)
            continue; /* OFF has only MODEL */
        v = k ? st->value[k] : 0;
        if (k)
            num(b, v);
        if (k == 1 && v == knob_max(m, 1))
            b[0] = 'T', b[1] = 'R', b[2] = 'K', b[3] = 0;
        if (m == MU_TB3P && k == 4 && !v)
            b[0] = 'O', b[1] = 'F', b[2] = 'F', b[3] = 0;
        else if (m == MU_TB3P && k == 6)
            signed_num(b, v - 7);
        else if (m == MU_TB3P && k == 7)
            hex4(b, st->seed);
        if (!k)
            boxed(cv, cx, cy, 10, mu_model_name(m));
        else
            picture(cv, st, k, cx, cy);
        l = mu_knob_label(m, (uint8_t)k);
        if (st->shown && st->touched == k && !(m == MU_EUCL && k == 2) && !(m == MU_TB3P && k == 7))
            l = k ? b : mu_model_name(m);
        text(cv, MU_FONT_LABEL, cx - (5 * slen(l) - 1) / 2, LBL_Y(r), l);
    }
}
