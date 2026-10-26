/* SPDX-License-Identifier: GPL-3.0-or-later
 * The boot stub's choice (stub.s calls it): the slot to start, with slots.c, the code the base and the host tests
 * run too. Runs from NOR before the OS, with no RAM of its own but the bootloader's stack: no statics. */
#include "slots.h"

extern const char stub_program[], stub_program_end[]; /* stub.s: one NOR word, run from SRAM */
/* Internal SRAM below the bootloader's stack (0x80008000 down) and above the variables and routines it keeps at
 * the bottom; stock's start sets SRAM up afresh after us. */
#define SRAM_CODE 0x80006000u

uint32_t stub_main(void);
uint32_t stub_main(void)
{
    struct slot_state s[2];
    int mark, k;
    slot_read(SLOT_A, s);
    slot_read(SLOT_B, s + 1);
    k = slot_pick(s, &mark);
    if (k < 0) return 0;
    if (mark) { /* one more try of the newest slot used: its lowest set bit cleared, from SRAM */
        uint32_t at = (slot_newest(s) ? SLOT_B : SLOT_A) + REC_TRIES;
        uint16_t word = *(volatile const uint16_t *)at;
        char *to = (char *)SRAM_CODE;
        for (const char *from = stub_program; from < stub_program_end; ) *to++ = *from++;
        ((int (*)(uint32_t, uint32_t))SRAM_CODE)(at, (uint16_t)(word & (word - 1u)));
    }
    return (k ? SLOT_B : SLOT_A) + SLOT_RECORD;
}
