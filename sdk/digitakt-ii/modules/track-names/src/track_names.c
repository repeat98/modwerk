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
extern uintptr_t tn_brain(void);                // the Brain, in d0

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

static int on_mixer(void)
{
    char *ctrl = (char *)tn_brain() + 0x40;   // the view controller: its stack's top view
    char *node = *(char **)(ctrl + 0x18), *page;
    uint32_t pages = U32(ctrl - 0x40 + TN_BRAIN_PAGES);
    if (node == ctrl + 0x14 || **(uint32_t **)(node + 8) != TN_VT_MAIN)
        return 0;                             // a menu or pop-up is on top
    if (!pages)
        return 0;                             // the pages are not built yet (start-up)
    page = *(char **)(pages + TN_PAGE_CURRENT);
    if (!page || U32(page) != TN_VT_FUNC_MOD)
        return 0;
    return U8(page + TN_SUBPAGE) == 1 ? 1 : U8(page + TN_SUBPAGE) == 2 ? 2 : 0;
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

void tn_draw(void *bmp, void *ctrl)
{
    int page = on_mixer(), kit;
    (void)ctrl;
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
