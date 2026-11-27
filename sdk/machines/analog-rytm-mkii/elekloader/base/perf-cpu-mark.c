// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's Analog Rytm MKII base, the lean engine's CPU mark (Nathaniel Pavel): a word in the status bar while the
// audio interrupt is close to using its whole period (CPU), and another while it does (OVR).
//
// The core measures each audio block (32 frames, 1,500 a second) from its ev_render_in to its
// ev_render_out as a share of the time between two blocks: core_audio_load, 256 = the whole period
// (analog-rytm-mk2/load.h). ev_render_out here reads the last block's figure: it adds it to a sum and
// counts the high ones. ev_tick (about 20 a second) looks at them every CW_TICKS ticks:
//
//   over  (2)  the mean is CW_OVER_MEAN or more, or CW_OVER_BLOCKS blocks or more read 256 (the whole period)
//   near  (1)  the mean is CW_NEAR_MEAN or more, or CW_NEAR_BLOCKS blocks or more reached CW_NEAR_PEAK
//
// One block's figure alone is not trusted: the core divides by the time since the block before began, so a
// block that follows a late one reads high (an 85 % block can read 256). The mean does not have that fault.
// A level stays up for CW_HOLD looks after the last one that found it, so the mark does not flicker.
// ev_draw writes a word into the bottom status bar's lower right corner, in the bar's own font and on its text
// line: CPU for near, OVR for over. Both blink so they catch the eye: CPU comes and goes, OVR swaps between lit
// text in a dark box and dark text on the lit bar. The bar's right end is the word's: the base's voice type name and
// another module's mark there are painted over while it shows. On a screen without the bar (a menu, a list, a browser)
// nothing is drawn. A redraw is asked for when the level changes and, while a word shows, at each blink (about four a
// second): all of it on the UI side, nothing more in the audio interrupt. No stock site is patched; the draw calls
// stock's text routine.
//
// Why these figures (the author's MKII, 17 and 18 Nov 2026, a set of 18 modules): with the mean at
// 80 to 85 % the unit played normally and the UI had about a quarter of the time; with the mean at 92 %
// (blocks over 100 %) the UI got no idle time and its queue grew by the second. The interrupt's own
// entry and exit are outside the figure, so the real share is a little higher.
#include <stdint.h>
#include "analog-rytm-mk2/load.h"

#ifndef CW_NEAR_MEAN
#define CW_NEAR_MEAN 225            // 88 %: the mean of a look
#endif
#ifndef CW_OVER_MEAN
#define CW_OVER_MEAN 236            // 92 %
#endif
#ifndef CW_NEAR_PEAK
#define CW_NEAR_PEAK 248            // 97 %: one block ...
#endif
#ifndef CW_NEAR_BLOCKS
#define CW_NEAR_BLOCKS 8            // ... of which this many in a look (about 750 blocks) show near
#endif
#ifndef CW_OVER_BLOCKS
#define CW_OVER_BLOCKS 8            // blocks reading 256 in a look that show over
#endif
#define CW_TICKS 10                 // a look every half second
#define CW_HOLD 3                   // looks a level outlasts its cause
#define CW_BLINK 5                  // ticks a blink phase lasts (about a quarter second)
#define CTRL_REDRAW 0x20            // ev_tick's ctrl: asks for a redraw

#define CW_UI __attribute__((cold))

static volatile uint32_t sum, blocks, high, full;    // written by the audio interrupt, cleared by the tick
static volatile uint32_t peak;                       // the look's dearest block, for the link's LOAD and the log
void mw_load_look(uint32_t sum, uint32_t blocks, uint32_t peak);   // load.c, on the UI side
static uint8_t ticks, level, near_left, over_left;
static uint8_t blink_ticks, dim;    // dim: the blink's second phase (CPU hidden, OVR not inverted)
#ifdef CW_TEST_CYCLE
static uint32_t cycle;
#endif

// The audio interrupt: about a dozen instructions a block. The link's load and diagnostics log (load.c, diag.c) add
// nothing here but the look's dearest block: everything else of theirs runs on the UI side, from these sums.
void le_cpu_warning_out(void)
{
    uint32_t l = core_audio_load;
    sum += l;
    blocks++;
    if (l > peak)
        peak = l;
    if (l >= CW_NEAR_PEAK) {
        high++;
        if (l >= 256)
            full++;
    }
}

// The tick reads and clears without masking the interrupt: a block that lands between the two is
// counted in the wrong look or lost, one in 750.
CW_UI void le_cpu_warning_tick(void *ctrl)
{
    uint32_t s, n, h, f, p, mean;
    uint8_t now;
    if (level && ++blink_ticks >= CW_BLINK) {
        blink_ticks = 0;
        dim ^= 1;
        ((char *)ctrl)[CTRL_REDRAW] = 1;
    }
    if (++ticks < CW_TICKS)
        return;
    ticks = 0;
    s = sum; n = blocks; h = high; f = full; p = peak;
    sum = 0; blocks = 0; high = 0; full = 0; peak = 0;
    mw_load_look(s, n, p);              // read and cleared with the others: a block during the call counts in the next look
    mean = n ? s / n : 0;               // no block in a look: the levels run out
    if (mean >= CW_OVER_MEAN || f >= CW_OVER_BLOCKS)
        over_left = CW_HOLD;
    else if (over_left)
        over_left--;
    if (mean >= CW_NEAR_MEAN || h >= CW_NEAR_BLOCKS)
        near_left = CW_HOLD;
    else if (near_left)
        near_left--;
    now = over_left ? 2 : near_left ? 1 : 0;
#ifdef CW_TEST_CYCLE
    now = (uint8_t)((++cycle / CW_TEST_CYCLE) % 3);   // test builds only: 0, 1, 2 in turn, to see the word clear
#endif
    if (now != level) {
        level = now;
        blink_ticks = 0;
        dim = 0;                        // a new word shows at once, in its first phase
        ((char *)ctrl)[CTRL_REDRAW] = 1;
    }
}

// The words, in the status bar's own font and on its text line: CPU while the load is near its limit, OVR while
// it is over. Stock's text routine and font (OS 1.74; the addresses come from base.json): x is the text's
// centre, y counts up from the bottom row to the text's bottom, the fifth argument centres, the sixth draws dark
// on a lit ground, the seventh is a string as wide as the widest text.
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int dark, const char *width,
                            const char *fmt, ...);
typedef uint32_t (*text_font_t)(void *ctx);   // stock returns the font in d0: declared as an integer, as the
                                              // base and Quick Mod Assign do (a pointer return reads a0)
#define MARK_Y 2
// The bar's lower right corner belongs to this word: whatever else stands there (another module's mark) is painted
// over while it shows. The text's right edge is in line with the transport icon's above.
#define CORNER_X 119                // the text's centre: columns 112 to 125, the bar's left margin mirrored
#define CORNER_FROM 96              // the columns painted as empty bar under the word: the bar's right end, where
                                    // the base writes a voice machine's type name (808, 909) and other modules their marks
#define CORNER_TO 127
#define BOX_FROM 110                // OVR's dark box: the word's columns 112 to 125 and two either side

// The bottom status bar is a lit band over rows 55..63 with a dark row above it, rows counted from the top here
// (the text routine's y counts up from the bottom row). A column's first word holds the bottom 32 rows, the
// bottom row in bit 31.
#define BAR_ROWS 0xff800000u        // rows 63..55
#define BAR_ABOVE 0x00400000u       // row 54
static const uint8_t bar_at[2] = { 1, 87 };   // the bar's left end, and the column after the pattern

// The bitmap: width at +4, height at +8, words a column at +12, the words at +16.
// Nothing is drawn where the bottom status bar is not on screen (a menu, a list, a browser).
CW_UI void le_cpu_warning_draw(void *bmp, void *ctrl)
{
    uint32_t *w;
    int stride, i, box;
    (void)ctrl;
    if (!level)
        return;
    if (*(int *)((char *)bmp + 4) < 128 || *(int *)((char *)bmp + 8) < 64)
        return;
    stride = *(int *)((char *)bmp + 12);
    w = *(uint32_t **)((char *)bmp + 16);
    for (i = 0; i < 2; i++)
        if ((w[bar_at[i] * stride] & (BAR_ROWS | BAR_ABOVE)) != BAR_ROWS)
            return;
    for (i = CORNER_FROM; i <= CORNER_TO; i++)
        w[i * stride] |= BAR_ROWS;
    if (level == 1 && dim)
        return;                         // CPU's off phase: the empty bar
    box = level == 2 && !dim;           // OVR's first phase: lit text in a dark box
    if (box)
        for (i = BOX_FROM; i <= CORNER_TO; i++)
            w[i * stride] &= ~BAR_ROWS;
    ((text_draw_t)LE_TEXT_DRAW_AT)(bmp, (void *)((text_font_t)LE_TEXT_FONT_AT)((void *)LE_TEXT_CTX_AT), CORNER_X, MARK_Y, 1, !box,
                                "XXX", "%s", level == 1 ? "CPU" : "OVR");
}
