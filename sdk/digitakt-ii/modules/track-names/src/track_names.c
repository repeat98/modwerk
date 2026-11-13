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
    (void)ctrl;

    page = on_mixer(bmp);
#ifdef TN_DEBUG
    debug_line(bmp, page);
#endif
    if (!page || (kit = kit_on()) < 0)
        return;
    for (int c = 0; c < CELLS; c++) {
        int track = (page - 1) * CELLS + c, k = c & 3, row = c >> 2;
        const char *name = (const char *)(TN_KITS + (uint32_t)kit * TN_KIT_SIZE + TN_NAME + (uint32_t)track * TN_TRACK_STRIDE);
        char shown[SHOWN + 1];
        badge(bmp, k, row, track + 1);
        if (!name[0] || is_default(name))
            continue;
        short_name(name, shown);
        if (!shown[0])
            continue;
        tn_fillrect(bmp, 21 + COL_X(k), LABEL_Y(row), 46 + COL_X(k), LABEL_Y(row) + 4, 0);
        tn_textf(bmp, tn_font, FADER_MID + COL_X(k), LABEL_Y(row), 2, "%s", shown);
    }
}
