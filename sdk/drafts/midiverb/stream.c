/* SPDX-License-Identifier: MIT
 * Midiverb's ColdFire half. Every frame (the base's ev_frame_record, after stock's parameter builder, scenes and
 * LFOs) it streams each Midiverb track's program, chosen by PROG and BANK, to the DSP through FX2's page 2: one
 * chunk a frame, round and round (engine.asm takes a program from its chunk 0 to its checksum, then plays it).
 * mv_name and mv_bank_name give entry.s what stock's message box shows when PROG or BANK turns. */
#include "stream.h"

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
#define U32(a) (*(volatile u32 *)(a))
#define IMAGE __attribute__((section(".data"))) /* loader-owned data in the image, not bss */

extern const u8 __image_start[];
static const volatile u8 *mv_page IMAGE;
static u8 mv_k[8] IMAGE;       /* per track: the chunk sent next */
static u8 mv_g[8] IMAGE;       /* per track: the program being sent, plus one (0: none) */

/* shortcut: finds the module's effect id through its page recipe, which the builder puts before this code (its
 * 'MWPG' head at the module's start) and in which the base keeps the page it installed (fxpage.c: recipe + 48;
 * the page's byte 3 is the id); upgrade when the loader hands a module its handle (dsp.c's note). */
static int mv_id(void)
{
    if (!mv_page) {
        const volatile u8 *p = __image_start - 4;
        for (unsigned n = 0; n < 16384u && !mv_page; n += 4u, p -= 4)
            if (p[0] == 'M' && p[1] == 'W' && p[2] == 'P' && p[3] == 'G') mv_page = p;
        if (!mv_page) return -1;
    }
    u32 d = (u32)mv_page[48] << 24 | (u32)mv_page[49] << 16 | (u32)mv_page[50] << 8 | mv_page[51];
    if (d < 0x40000000u || d >= 0x48000000u) return -1; /* no page installed yet */
    return ((const volatile u8 *)d)[3];
}

static unsigned mv_program(unsigned bank, unsigned prog)
{
    if (bank > 2u) bank = 2u;
    unsigned n = mv_bank_count[bank];
    if (!n) return 0;
    if (prog >= n) prog = n - 1u;
    return mv_bank_first[bank] + prog;
}

const char *mv_name(unsigned bank, unsigned prog)
{
    return mv_names[mv_program(bank, prog)];
}

const char *mv_bank_name(unsigned bank)
{
    static const char names[3][12] = {"MIDIVERB", "MIDIVERB II", "MIDIFEX"};
    return names[bank > 2u ? 2u : bank];
}

void mv_frame(void)
{
    int id = mv_id();
    if (id < 0) return;
    volatile u8 *r = (volatile u8 *)(0x80000110u + (U32(0x800000e0u) & 1u) * 512u);
    for (unsigned t = 0; t < 8u; ++t, r += 64) {
        if (r[56] != 0 || r[57] != (u8)id) { mv_g[t] = 0; continue; } /* FX2's id, halfword +56 */
        unsigned g = mv_program(r[30], r[24]);                     /* BANK is slot D, PROG slot A */
        if (mv_g[t] != g + 1u) mv_g[t] = (u8)(g + 1u), mv_k[t] = 0;
        const u16 *w = mv_words + mv_start[g];
        unsigned words = (w[0] & 0x7fffu) + 1u, k = mv_k[t], i = 2u * k;
        u16 a = w[i], b = i + 1u < words ? w[i + 1u] : 0;
        r[48] = (u8)k, r[49] = (u8)g;                              /* page 2: slots 6 and 7 */
        r[50] = (u8)(a >> 8), r[51] = (u8)a;
        r[52] = (u8)(b >> 8), r[53] = (u8)b;
        mv_k[t] = (u8)(i + 2u < words ? k + 1u : 0);
    }
}
