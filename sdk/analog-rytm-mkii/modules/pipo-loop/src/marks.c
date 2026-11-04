// SPDX-License-Identifier: GPL-3.0-or-later
// Pipo Loop: S and E labels on the SMPL WAVEFORM view. Stock draws STA and
// END as dotted lines; this adds a boxed S at the bottom of STA's line and a
// boxed E at the top of END's, so the two can be told apart (and found when
// they share a column, where stock draws one line).
//
// Stock's waveform widget (its draw routine is the only caller) keeps the
// lines' columns at +4 (STA) and +8 (END), from x0 at +28; its area starts at
// y0 (+32, y counts up from the bottom of the screen) and is +40 high; the
// lines run from y0 + 1 to y0 + height - 2. audio.s calls this as the routine
// ends, after the lines and the playheads.

typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int colour);
#define FILLRECT ((fillrect_t)FILLRECT_AT)

#define W_STA 4
#define W_END 8
#define W_X0 28
#define W_Y0 32
#define W_H 40
#define BOX_W 7                 // a 3 x 5 letter, a black pixel round it, a white one round that
#define BOX_H 9
#define SCREEN_W 128

// 3 x 5 letters, row 0 at the top, 3 bits a row (original glyphs).
#define GLYPH_S 0x79cf          // ### / #.. / ### / ..# / ###
#define GLYPH_E 0x79e7          // ### / #.. / ### / #.. / ###

static void box(void *bmp, int x, int bottom, unsigned glyph)
{
    int left = x - BOX_W / 2, r, c;
    if (left < 0)
        left = 0;
    if (left > SCREEN_W - BOX_W)
        left = SCREEN_W - BOX_W;
    FILLRECT(bmp, left, bottom, left + BOX_W - 1, bottom + BOX_H - 1, 1);
    FILLRECT(bmp, left + 1, bottom + 1, left + BOX_W - 2, bottom + BOX_H - 2, 0);
    for (r = 0; r < 5; r++)
        for (c = 0; c < 3; c++)
            if (glyph >> (14 - r * 3 - c) & 1)
                FILLRECT(bmp, left + 2 + c, bottom + 6 - r, left + 2 + c, bottom + 6 - r, 1);
}

void pipo_loop_marks(void *bmp, char *w)
{
    int x0 = *(int *)(w + W_X0), y0 = *(int *)(w + W_Y0), h = *(int *)(w + W_H);
    if (!bmp || h < 2 * BOX_H)
        return;
    box(bmp, x0 + *(int *)(w + W_STA), y0 + 1, GLYPH_S);
    box(bmp, x0 + *(int *)(w + W_END), y0 + h - 1 - BOX_H, GLYPH_E);
}
