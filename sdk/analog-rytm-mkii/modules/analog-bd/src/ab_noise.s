| SPDX-License-Identifier: MIT
| Analog BD: the 909's shaped noise on 16 samples while it sounds, under its envelope's
| ramp, added in, scheduled by hand for the EMAC. It is ab_dsp.c's noise909_c, bit for bit.
|
| void ab_noise909(struct ab_voice *s, int32_t *y), with the constants in ab_k909
|
| The EMAC runs fractional (MACSR 0x20). The filter chain runs in ACC0, one stage after
| the other; the envelope's product goes to ACC1.

        .text
        .globl  ab_noise909

        .equ    K_ANH, 16                       | ab_k909
        .equ    K_BNH2, 20
        .equ    K_KL1, 24
        .equ    K_KL2, 28
        .equ    K_LCGM, 32
        .equ    K_LCGC, 36
        .equ    V_ENV, 92                       | struct ab_voice
        .equ    V_DENV, 96
        .equ    V_NH, 100
        .equ    V_NPREV, 104
        .equ    V_N1, 108
        .equ    V_N2, 112
        .equ    V_LCG, 116

        .equ    ARGS, 48                        | 11 saved registers and the return address

| d3 n2, d4 n1, d5 nh, d6 nprev, d7 lcg; a2 env, a3 denv, a4 y, a5 ab_k909, a6 the voice;
| d0-d2 free. The loop ends at y + 16 samples, kept in y's argument.
ab_noise909:
        lea     -44(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        move.l  ARGS(%sp), %a6
        move.l  ARGS+4(%sp), %a4
        lea     ab_k909, %a5
        lea     64(%a4), %a2
        move.l  %a2, ARGS+4(%sp)
        move.l  #0, %acc1
        move.l  #0, %acc2
        move.l  #0, %acc3
        move.l  #0, %accext23
        move.l  V_N2(%a6), %d3
        move.l  V_N1(%a6), %d4
        move.l  V_NH(%a6), %d5
        move.l  V_NPREV(%a6), %d6
        move.l  V_LCG(%a6), %d7
        move.l  V_ENV(%a6), %a2
        move.l  V_DENV(%a6), %a3

1:      move.l  K_LCGM(%a5), %d0                | lcg = (lcg M + C) & 0xffffff; wn = lcg << 8
        mulu.l  %d0, %d7
        add.l   K_LCGC(%a5), %d7
        and.l   #0xffffff, %d7
        move.l  %d7, %d0
        lsl.l   #8, %d0
        move.l  %d0, %d1                        | (wn >> 1) - (nprev >> 1)
        asr.l   #1, %d1
        move.l  %d6, %d2
        asr.l   #1, %d2
        sub.l   %d2, %d1
        move.l  %d0, %d6                        | nprev = wn
        move.l  K_ANH(%a5), %d2
        mac.l   %d2, %d5, %acc0
        move.l  K_BNH2(%a5), %d2
        mac.l   %d2, %d1, %acc0
        add.l   %a3, %a2                        | env += denv, meanwhile
        move.l  K_KL1(%a5), %d2
        movclr.l %acc0, %d5                     | nh
        move.l  %d5, %d1                        | n1 += KL1 (nh - n1)
        sub.l   %d4, %d1
        mac.l   %d2, %d1, %acc0
        move.l  K_KL2(%a5), %d2
        movclr.l %acc0, %d1
        add.l   %d1, %d4                        | n1
        move.l  %d4, %d1                        | n2 += KL2 (n1 - n2)
        sub.l   %d3, %d1
        mac.l   %d2, %d1, %acc0
        movclr.l %acc0, %d1
        add.l   %d1, %d3                        | n2
        mac.l   %a2, %d3, %acc1                 | env n2
        movclr.l %acc1, %d0
        add.l   %d0, (%a4)+
        cmpa.l  ARGS+4(%sp), %a4
        bne     1b

        move.l  %d3, V_N2(%a6)
        move.l  %d4, V_N1(%a6)
        move.l  %d5, V_NH(%a6)
        move.l  %d6, V_NPREV(%a6)
        move.l  %d7, V_LCG(%a6)
        move.l  %a2, V_ENV(%a6)
        movem.l (%sp), %d2-%d7/%a2-%a6
        lea     44(%sp), %sp
        rts
