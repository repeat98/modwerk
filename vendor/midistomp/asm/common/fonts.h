/* The pedal's own fonts, read from the stock MS-70CDR 2.10 OS at run time (as asm/looper/lbox.c reads
 * FONT7): no copy in our sections. Column bytes, bit 0 on top, ASCII 32 on, one glyph after the other.
 * Host builds (gcc, clang, cl) take the same tables from tests/host_fonts.h. */
#ifndef FONTS_H
#define FONTS_H

#ifdef _TMS320C6X
#define F7 ((const unsigned char *)0xC00E88B8)    /* FONT7, 7 columns per glyph (0xC00E87D8 + 32 x 7) */
#define OS6 ((const unsigned char *)0xC00E8DA8)   /* the OS font, 6 columns */
#define SOFT ((const unsigned char *)0xC00EA9B0)  /* the 5-px softkey font, 4 columns; scols() maps the characters */
#else
#include "../../tests/host_fonts.h"
#endif

/* Ours: wider M W N, and the "?" the softkey font lacks. */
static const unsigned char SW_M[] = { 0x3C, 2, 0x1C, 2, 0x3C, 0 }, SW_W[] = { 0x1E, 0x20, 0x1C, 0x20, 0x1E, 0 }, SW_N[] = { 0x3E, 4, 8, 0x3E, 0 }, SW_Q[] = { 2, 42, 4, 0 };

static const unsigned char *scols(char ch, int *n)   /* the 5-px softkey font; M W N wider */
{
    if (ch == '?') { *n = 4; return SW_Q; }
    int i = ch >= '0' && ch <= '9' ? ch - 47 : ch >= 'A' && ch <= 'Z' ? ch - 54 : ch == '/' ? 37 : ch == ':' ? 38 :
            ch == '-' ? 39 : ch == '!' ? 40 : ch == '\'' ? 41 : ch == '.' ? 42 : ch == '+' ? 43 : ch == '*' ? 44 :
            ch == '{' ? 46 : ch == '}' ? 47 : 0;   /* { } the left / right arrows */
    if (ch == 'M') { *n = 6; return SW_M; }
    if (ch == 'W') { *n = 6; return SW_W; }
    if (ch == 'N') { *n = 5; return SW_N; }
    *n = 4;
    return SOFT + 4 * i;
}

#endif
