| SPDX-License-Identifier: MIT
| Analog BD: the 808's body on one block (phase, settling pitch, the wave and its decay),
| scheduled by hand for the EMAC. It is ab_dsp.c's body808_c, bit for bit.
|
| void ab_body808(struct ab_voice *s, int32_t *out), with the block's settings in ab_r808
|
| The EMAC runs fractional (MACSR 0x20). A sample's three products of the old states go
| to three accumulators, and the wave's lookup runs while they finish.

        .text
        .globl  ab_body808

        .equ    B_INC, 0                        | ab_r808: the block's settings
        .equ    B_BEND, 4
        .equ    B_DP, 8
        .equ    B_DE, 12
        .equ    B_GAIN, 16
        .equ    B_WAVE, 20                      | and the wave table
        .equ    V_EP, 12                        | struct ab_voice
        .equ    V_E, 16
        .equ    V_U, 20

        .equ    ARGS, 28                        | 6 saved registers and the return address

| d4 ep, d5 e, d7 u; a0 ab_r808, a1 out, a6 the wave table; d0-d3 free. The loop ends at
| out + 32, kept in its argument.
ab_body808:
        lea     -24(%sp), %sp
        movem.l %d2-%d5/%d7/%a6, (%sp)
        move.l  ARGS(%sp), %a0
        move.l  ARGS+4(%sp), %a1
        lea     128(%a1), %a6
        move.l  %a6, ARGS+4(%sp)
        move.l  #0, %acc1
        move.l  #0, %acc2
        move.l  #0, %accext23
        move.l  V_EP(%a0), %d4
        move.l  V_E(%a0), %d5
        move.l  V_U(%a0), %d7
        lea     ab_r808, %a0
        move.l  B_WAVE(%a0), %a6

1:      move.l  B_BEND(%a0), %d0
        mac.l   %d0, %d4, %acc0                 | bend ep
        move.l  B_DP(%a0), %d0
        mac.l   %d0, %d4, %acc1                 | dp ep
        move.l  B_DE(%a0), %d0
        mac.l   %d0, %d5, %acc2                 | de e
        movclr.l %acc0, %d0
        add.l   B_INC(%a0), %d0
        add.l   %d0, %d7                        | u, wrapping
        move.l  %d7, %d0                        | the wave at u: W808[u >> 22] and the next,
        moveq   #22, %d1                        | (u >> 7) & 0x7fff between them, times 2^16
        lsr.l   %d1, %d0
        move.l  %d7, %d1
        lsr.l   #7, %d1
        and.l   #0x7fff, %d1
        mvs.w   (%a6,%d0.l*2), %d2
        mvs.w   2(%a6,%d0.l*2), %d3
        sub.l   %d2, %d3
        muls.l  %d1, %d3
        and.l   #-0x8000, %d3
        add.l   %d3, %d3                        | (... >> 15) << 16
        swap    %d2
        clr.w   %d2                             | e0 << 16
        add.l   %d3, %d2                        | the wave
        movclr.l %acc1, %d1
        sub.l   %d1, %d4                        | ep
        move.l  B_GAIN(%a0), %d0
        mac.l   %d2, %d0, %acc0                 | wave gain
        movclr.l %acc2, %d1
        sub.l   %d1, %d5                        | e
        movclr.l %acc0, %d0
        mac.l   %d0, %d5, %acc0                 | (wave gain) e
        movclr.l %acc0, %d0
        move.l  %d0, (%a1)+
        cmpa.l  ARGS+4(%sp), %a1
        bne     1b

        move.l  ARGS(%sp), %a0
        move.l  %d4, V_EP(%a0)
        move.l  %d5, V_E(%a0)
        move.l  %d7, V_U(%a0)
        movem.l (%sp), %d2-%d5/%d7/%a6
        lea     24(%sp), %sp
        rts
