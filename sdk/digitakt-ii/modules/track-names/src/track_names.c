// SPDX-License-Identifier: GPL-3.0-or-later
// Track Names for the Digitakt II: the Internal Mixer (FUNC + MOD, pages 2 and 3) shows each track's
// name from SETUP > RENAME in place of TRK1..TRK16, its first 5 characters, and the track's number
// in an inverted box at the top left of its fader. A track that still has its default name
// (PRESET n) keeps the stock label. The names live in the pattern's kit, so each pattern has its own.
// Read-only: the module draws over the composed frame and changes no stock data.
#include <stdint.h>

extern void tn_fillrect(void *bmp, int x0, int y0, int x1, int y1, int colour);
extern int tn_textf(void *bmp, const void *font, int x, int y, unsigned flags, const char *fmt, ...);
extern const char tn_font[], tn_font_narrow[];

// OS-specific RAM layout and view identities: build.json's per-release cflags.
#define U32(a) (*(volatile const uint32_t *)(uintptr_t)(a))
#define U8(a)  (*(volatile const uint8_t *)(uintptr_t)(a))

#define CELLS 8
#define NAME_MAX 16
#define SHOWN 5

// The bitmap's y counts from the bottom (63 is the top row).
#define COL_X(k)     (26 * (k))               // a cell's offset from the first
#define FADER_MID    33                       // centre of the first fader (x 30..36)
#define LABEL_Y(row) ((row) ? 0 : 27)         // labels' bottom row: screen rows 59..63 and 32..36
#define BADGE_TOP(r) ((r) ? 24 : 51)          // the badge's top row, beside the fader's first tick

// The page the main view shows: main view + TN_VIEW_UI -> + TN_UI_PAGES (the page set, vtable
// TN_VT_PAGES) -> + TN_PAGE_CURRENT. 0 when any link is missing or not what OS 1.17 has there.
// The Internal Mixer is recognised by what the stock OS has just drawn, which is the same on the unit
// and in the emulator: the MIX box at the left (columns 0..15, screen rows 13..36) and the page
// marker on the scroll bar (column 125, rows 10..61). The frame is 128 x 64, 1 bit per pixel, stored
// by column: 8 bytes per column, bottom row first, the lowest row of each byte in its top bit.
// Each column is compared as two 32-bit words: bottom rows 0..31, then 32..63.
static const uint32_t mix_box[16][2] = {
    {0x0000000f, 0xffffc000}, {0x00000010, 0x00002000}, {0x00000010, 0x0fc02000}, {0x00000010, 0x00802000},
    {0x00000010, 0x0fc02000}, {0x00000010, 0x00002000}, {0x00000010, 0x08402000}, {0x00000010, 0x0fc02000},
    {0x00000010, 0x08402000}, {0x00000010, 0x00002000}, {0x00000010, 0x0cc02000}, {0x00000010, 0x03002000},
    {0x00000010, 0x0cc02000}, {0x00000010, 0x00002000}, {0x0000000f, 0xffffc000}, {0x00000000, 0x00000000},
};
#define MIX_MASK_HI 0x0000001fu
#define MIX_MASK_LO 0xffffe000u
#define BAR_X 125
#define BAR_MASK_HI 0x3fffffffu
#define BAR_MASK_LO 0xfffffc00u
static const uint32_t bar[2][2] = {
    {0x00000000, 0xe0000000},                 // Internal Mixer 2/5: tracks 1-8
    {0x00000070, 0x00000000},                 // Internal Mixer 3/5: tracks 9-16
};

static const uint8_t *frame_data(void *bmp)
{
    const char *b = (const char *)bmp;
    if (U32(b + 4) != 128 || U32(b + 8) != 64)
        return 0;
    return *(const uint8_t *const *)(b + 0x10);
}

static uint32_t word(const uint8_t *col)
{
    return (uint32_t)col[0] << 24 | (uint32_t)col[1] << 16 | (uint32_t)col[2] << 8 | col[3];
}

// 1: Internal Mixer tracks 1-8, 2: tracks 9-16, 0: anything else.
static int on_mixer(void *bmp)
{
    const uint8_t *d = frame_data(bmp);
    uint32_t hi, lo;
    if (!d)
        return 0;
    for (int x = 0; x < 16; x++)
        if ((word(d + 8 * x) & MIX_MASK_HI) != mix_box[x][0] || (word(d + 8 * x + 4) & MIX_MASK_LO) != mix_box[x][1])
            return 0;
    hi = word(d + 8 * BAR_X) & BAR_MASK_HI;
    lo = word(d + 8 * BAR_X + 4) & BAR_MASK_LO;
    for (int p = 0; p < 2; p++)
        if (hi == bar[p][0] && lo == bar[p][1])
            return p + 1;
    return 0;
}

#define LABEL_X0 21                           // a cell's label columns: 21..46 (+ 26 per cell)
#define LABEL_W 26
// Stock TRK1..TRK16 as the Internal Mixer draws them: per track, columns 21..46 of its cell, a byte per
// column with the label's top row in bit 4 and its bottom row in bit 0 (measured in the emulator).
static const uint8_t stock_label[16][LABEL_W] = {
    {0x00, 0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x13, 0x15, 0x15, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x11, 0x15, 0x15, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x1c, 0x04, 0x04, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x1d, 0x15, 0x15, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x0e, 0x15, 0x15, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x10, 0x13, 0x14, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x0a, 0x15, 0x15, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x08, 0x15, 0x15, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x0e, 0x11, 0x11, 0x0e, 0x00, 0x00, 0x00},
    {0x00, 0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x13, 0x15, 0x15, 0x09, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x11, 0x15, 0x15, 0x0a, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x1c, 0x04, 0x04, 0x1f, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x1d, 0x15, 0x15, 0x12, 0x00, 0x00, 0x00},
    {0x00, 0x10, 0x1f, 0x10, 0x00, 0x1f, 0x14, 0x14, 0x0b, 0x00, 0x1f, 0x04, 0x04, 0x1b, 0x00, 0x09, 0x1f, 0x01, 0x00, 0x0e, 0x15, 0x15, 0x12, 0x00, 0x00, 0x00},
};

static int pixel(const uint8_t *d, int x, int top_row)     // top_row counts from the top, 0..63
{
    int yb = 63 - top_row;
    return (d[8 * x + (yb >> 3)] >> (7 - (yb & 7))) & 1;
}

// A pop-up the OS drew over the page (pattern select, for example) is a framed box: its top and bottom
// edges are the only long horizontal lines below the mixer's header. Found here as a rectangle in
// screen rows (counted from the top); names and badges are clipped to stay outside it.
typedef struct {
    int x0, y0, x1, y1, on;
} box_t;

#define POPUP_MARGIN 2
#define EDGE_MIN 20                            // the mixer itself has no lit run this long below row 10

static void find_popup(const uint8_t *d, box_t *b)
{
    b->on = 0;
    for (int y = 10; y < 64; y++) {
        int x = 0;
        while (x < 128) {
            int s;
            if (!pixel(d, x, y)) {
                x++;
                continue;
            }
            for (s = x; x < 128 && pixel(d, x, y); x++)
                ;
            if (x - s < EDGE_MIN)
                continue;
            if (!b->on)
                b->on = 1, b->x0 = s, b->x1 = x - 1, b->y0 = b->y1 = y;
            else {
                if (s < b->x0)
                    b->x0 = s;
                if (x - 1 > b->x1)
                    b->x1 = x - 1;
                b->y1 = y;
            }
        }
    }
    if (b->on && b->y1 == b->y0)
        b->y1 = 63;                            // only its top edge is on the screen
    if (b->on)                                 // the OS clears a pixel around the frame: keep 2 clear
        b->x0 -= POPUP_MARGIN, b->x1 += POPUP_MARGIN, b->y0 -= POPUP_MARGIN, b->y1 += POPUP_MARGIN;
}

static int in_box(const box_t *b, int x, int y)
{
    return b->on && x >= b->x0 && x <= b->x1 && y >= b->y0 && y <= b->y1;
}

static void set_pixel(uint8_t *d, int x, int top_row, int v)
{
    int yb = 63 - top_row;
    uint8_t m = (uint8_t)(0x80 >> (yb & 7));
    if (v)
        d[8 * x + (yb >> 3)] |= m;
    else
        d[8 * x + (yb >> 3)] &= (uint8_t)~m;
}

// Region x0..x1, rows y0..y0+h-1: saved before drawing, and put back where the pop-up is.
#define SAVE_MAX (LABEL_W * 7)
static uint8_t saved[SAVE_MAX];

static void save_region(const uint8_t *d, int x0, int x1, int y0, int h)
{
    int n = 0;
    for (int x = x0; x <= x1; x++)
        for (int r = 0; r < h && n < SAVE_MAX; r++)
            saved[n++] = (uint8_t)pixel(d, x, y0 + r);
}

static void restore_under_box(uint8_t *d, const box_t *b, int x0, int x1, int y0, int h)
{
    int n = 0;
    if (!b->on)
        return;
    for (int x = x0; x <= x1; x++)
        for (int r = 0; r < h && n < SAVE_MAX; r++, n++)
            if (in_box(b, x, y0 + r))
                set_pixel(d, x, y0 + r, saved[n]);
}

// Is this cell's label the stock TRKn wherever the pop-up does not cover it, and is any of it in view?
static int label_is_stock(const uint8_t *d, const box_t *b, int track, int k, int row)
{
    int y0 = row ? 59 : 32, seen = 0;
    for (int i = 0; i < LABEL_W; i++) {
        int x = LABEL_X0 + COL_X(k) + i, v = 0, covered = 0;
        for (int r = 0; r < 5; r++) {
            covered |= in_box(b, x, y0 + r);
            v = v << 1 | pixel(d, x, y0 + r);
        }
        if (covered)
            continue;
        if (v != stock_label[track][i])
            return 0;
        seen = 1;
    }
    return seen;
}

// Is the badge's place (columns 20..29, rows 12..18 or 39..45) as stock draws it wherever the pop-up does
// not cover it: blank but for the fader scale's two left ticks at columns 26 and 27, rows 13 and 17
// (40 and 44)? And is any of it in view?
static int badge_place_is_stock(const uint8_t *d, const box_t *b, int k, int row)
{
    int y0 = row ? 39 : 12, seen = 0;
    for (int x = 20; x <= 29; x++)
        for (int r = 0; r < 7; r++) {
            int tick = (x == 26 || x == 27) && (r == 1 || r == 5);
            if (in_box(b, x + COL_X(k), y0 + r))
                continue;
            if (pixel(d, x + COL_X(k), y0 + r) != tick)
                return 0;
            seen = 1;
        }
    return seen;
}

static int kit_on(void)
{
    uint32_t o = U32(TN_PATTERN_OBJ), n;
    if (!o)
        return -1;
    n = U32(o + 0x138);
    return n < 128 ? (int)n : -1;
}

// "PRESET n" (any n) is the stock default: that track keeps TRKn.
static int is_default(const char *s)
{
    static const char d[] = "PRESET ";
    int i = 0;
    for (; d[i]; i++)
        if (s[i] != d[i])
            return 0;
    if (s[i] < '0' || s[i] > '9')
        return 0;
    while (i < NAME_MAX && s[i] >= '0' && s[i] <= '9')
        i++;
    return i == NAME_MAX || !s[i];
}

static void short_name(const char *s, char *out)
{
    int n = 0;
    while (n < SHOWN && n < NAME_MAX && s[n])
        out[n] = s[n], n++;
    while (n && out[n - 1] == ' ')
        n--;
    out[n] = 0;
}

static void badge(void *bmp, int k, int row, int track)
{
    int x2 = 28 + COL_X(k), w = track >= 10 ? 7 : 3, x1 = x2 - w - 1, top = BADGE_TOP(row);
    tn_fillrect(bmp, x1, top - 6, x2, top, 0);
    tn_textf(bmp, tn_font_narrow, x1 + 1, top - 5, 0, "%d", track);
    tn_fillrect(bmp, x1, top - 6, x2, top, -1);   // invert: dark digits on a lit box
}

#ifdef TN_DEBUG
static char *hx(char *o, uint32_t v, int n)
{
    static const char d[] = "0123456789ABCDEF";
    for (int s = (n - 1) * 4; s >= 0; s -= 4)
        *o++ = d[(v >> s) & 15];
    return o;
}

// Diagnostics on every screen, over the header: TN3, the mixer page found (0, 1, 2), the kit on,
// and column 0's and the scroll bar's bottom words as drawn.
static void debug_line(void *bmp, int page)
{
    char t[40], *o = t;
    const uint8_t *d = frame_data(bmp);
    *o++ = 'T', *o++ = 'N', *o++ = '3', *o++ = ' ', *o++ = (char)('0' + page), *o++ = ' ';
    o = hx(o, (uint32_t)kit_on() & 0xff, 2);
    *o++ = ' ';
    o = hx(o, d ? word(d + 4) : 0, 8);
    *o++ = ' ';
    o = hx(o, d ? word(d + 8 * BAR_X + 4) : 0, 8);
    *o = 0;
    tn_fillrect(bmp, 0, 55, 127, 63, 0);
    tn_textf(bmp, tn_font_narrow, 1, 57, 0, "%s", t);
}
#endif


void tn_draw(void *bmp, void *ctrl)
{
    int page, kit;
    uint8_t *d;
    box_t box;
    (void)ctrl;

    page = on_mixer(bmp);
#ifdef TN_DEBUG
    debug_line(bmp, page);
#endif
    d = (uint8_t *)frame_data(bmp);
    if (!page || !d || (kit = kit_on()) < 0)
        return;
    find_popup(d, &box);
    for (int c = 0; c < CELLS; c++) {
        int track = (page - 1) * CELLS + c, k = c & 3, row = c >> 2;
        int lx0 = LABEL_X0 + COL_X(k), lx1 = lx0 + LABEL_W - 1, ly0 = row ? 59 : 32;
        int bx0 = 20 + COL_X(k), bx1 = 29 + COL_X(k), by0 = row ? 39 : 12;
        const char *name = (const char *)(TN_KITS + (uint32_t)kit * TN_KIT_SIZE + TN_NAME + (uint32_t)track * TN_TRACK_STRIDE);
        char shown[SHOWN + 1];
        if (badge_place_is_stock(d, &box, k, row)) {
            save_region(d, bx0, bx1, by0, 7);
            badge(bmp, k, row, track + 1);
            restore_under_box(d, &box, bx0, bx1, by0, 7);
        }
        if (!name[0] || is_default(name) || !label_is_stock(d, &box, track, k, row))
            continue;
        short_name(name, shown);
        if (!shown[0])
            continue;
        save_region(d, lx0, lx1, ly0, 5);
        tn_fillrect(bmp, lx0, LABEL_Y(row), lx1, LABEL_Y(row) + 4, 0);
        tn_textf(bmp, tn_font, FADER_MID + COL_X(k), LABEL_Y(row), 2, "%s", shown);
        restore_under_box(d, &box, lx0, lx1, ly0, 5);
    }
}
