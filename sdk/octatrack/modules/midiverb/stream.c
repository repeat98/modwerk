/* SPDX-License-Identifier: MIT
 * Midiverb's ColdFire half. Every frame (entry.s's detour at 0x4000d568, after stock's parameter builder, scenes and
 * LFOs) it streams each Midiverb track's program, chosen by PROG and BANK, to the DSP through FX2's page 2: one
 * chunk a frame, round and round (engine.asm takes a program from its chunk 0 to its checksum, then plays it).
 * While STOP's tail kill holds a track (ev_tail_kill) it sends the kill instead: the DSP silences the reverb and
 * clears its ring, the program kept. mv_name and mv_bank_name give entry.s what stock's message box shows when
 * PROG or BANK turns. */
#include "stream.h"

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
#define U32(a) (*(volatile u32 *)(a))
#define IMAGE __attribute__((section(".data"))) /* loader-owned data in the image, not bss */
#define CUR_TRACK (*(const volatile u8 *)0x100b14ccu) /* the active track 0..7 (Play Modes reads it too) */

extern const u8 __image_start[];
static const volatile u8 *mv_page IMAGE;
static u8 mv_k[8] IMAGE;       /* per track: the chunk sent next */
static u8 mv_g[8] IMAGE;       /* per track: the program being sent, plus one (0: none) */
static u8 mv_kill IMAGE;       /* the tracks STOP's tail kill holds this frame, bit t */

/* shortcut: finds the module's effect id through its page recipe, which the builder puts before this code (its
 * 'MWPG' head at the module's start) and in which the base keeps the page it installed (fxpage.c: recipe + 48;
 * the page's byte 3 is the id); upgrade when the loader hands a module its handle (dsp.c's note). */
static u32 mv_installed(void);
static int mv_id(void)
{
    u32 d = mv_installed();
    return d ? ((const volatile u8 *)d)[3] : -1;
}

/* The page the base installed, or 0. */
static u32 mv_installed(void)
{
    if (!mv_page) {
        const volatile u8 *p = __image_start - 4;
        for (unsigned n = 0; n < 16384u && !mv_page; n += 4u, p -= 4)
            if (p[0] == 'M' && p[1] == 'W' && p[2] == 'P' && p[3] == 'G') mv_page = p;
        if (!mv_page) return 0;
    }
    u32 d = (u32)mv_page[48] << 24 | (u32)mv_page[49] << 16 | (u32)mv_page[50] << 8 | mv_page[51];
    return d < 0x40000000u || d >= 0x48000000u ? 0 : d; /* 0: no page installed yet */
}

/* PROG's values a bank uses: up to its last program (Midiverb and Midifex 63, Midiverb II 102). Past it the value map
 * holds the last program, so the knob would turn with nothing changing (the owner's MKII, 27 November 2026). */
static unsigned mv_count(unsigned bank)
{
    unsigned n = MV_VALUES;
    while (n > 1u && mv_value[bank][n - 2u] == mv_value[bank][MV_VALUES - 1u]) --n;
    return n;
}

/* PROG's value to the program: 0.1.0's values keep their programs (generate.mjs valueMap). */
static unsigned mv_program(unsigned bank, unsigned prog)
{
    if (bank > 2u) bank = 2u;
    if (prog >= MV_VALUES) prog = MV_VALUES - 1u;
    return mv_value[bank][prog];
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

/* entry.s, on every knob turn of Midiverb's page (desc: the page's descriptor): PROG's and BANK's staging in the page's
 * input layer, as stock stages a page it enters. Picked on FX SETUP, the page kept the effect before it's staging there
 * (every stock main page is 0..127), and the panel copies it into the knob's record before each turn, so a slow turn
 * lost its remainder at every detent and PROG did not move until FX2 was entered again (the owner's MKII, base 0.8.1).
 * shortcut: base 0.8.2 stages it itself (fxpage.s mw_knob_step); drop this once that is the oldest base it supports. */
void mv_stage(const u8 *desc)
{
    const u8 *layer = *(const u8 *const volatile *)0x460d165cu; /* the input layer: +8 its knob definitions */
    if (!layer) return;
    volatile u8 *defs = *(u8 *const volatile *)(layer + 8);
    if (!defs) return;
    for (unsigned slot = 0; slot < 6u; slot += 3u) {           /* A PROG, D BANK */
        u32 count = *(const volatile u32 *)(desc + 0x9a + 4u * slot);
        volatile u8 *d = defs + 22u * slot;                     /* the slot, a 0, then the knob's record */
        if (d[0] != slot || *(volatile u32 *)(d + 2) != 0x40055008u) continue; /* a scene's or a window's: not ours */
        *(volatile u32 *)(d + 10) = 32768u / (count > 40u ? count : 40u);   /* the step, as stock's stager works it out */
        *(volatile u32 *)(d + 18) = count;
    }
}

/* ev_tail_kill: STOP, STOP, STOP holds this track (the frame's record builder, before ev_frame_record runs). */
void mv_tail_kill(u8 *record, unsigned track)
{
    (void)record;
    if (track < 8u) mv_kill |= (u8)(1u << track);
}

void mv_frame(void)
{
    u8 kill = mv_kill;
    mv_kill = 0;
    int id = mv_id();
    if (id < 0) return;
    volatile u8 *r = (volatile u8 *)(0x80000110u + (U32(0x800000e0u) & 1u) * 512u);
    /* PROG's count follows the active track's BANK, so a whole turn of the knob runs from the bank's first program to its
     * last on every bank (the step is 32768 / count). The stager reads it from the page (fxpage.s mw_knob_step). */
    unsigned shown = CUR_TRACK;
    volatile u8 *page = (volatile u8 *)mv_installed();
    if (shown < 8u && r[64u * shown + 56u] == 0 && r[64u * shown + 57u] == (u8)id
        && page[0x16] == 'P' && page[0x17] == 'R' && page[0x18] == 'O' && page[0x19] == 'G')
        *(volatile u32 *)(page + 0x9a) = mv_count(r[64u * shown + 30u] > 2u ? 2u : r[64u * shown + 30u]);
    for (unsigned t = 0; t < 8u; ++t, r += 64) {
        if (r[56] != 0 || r[57] != (u8)id) { mv_g[t] = 0; continue; } /* FX2's id, halfword +56 */
        unsigned g = mv_program(r[30], r[24]);                     /* BANK is slot D, PROG slot A */
        if (kill >> t & 1u) {                                      /* the kill: chunk $ff, the stream waits */
            r[48] = 0xff, r[49] = (u8)g, r[50] = r[51] = r[52] = r[53] = 0;
            continue;
        }
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
