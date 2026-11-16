| SPDX-License-Identifier: MIT
| Analog BD: the 808's TONE and velocity on one block, scheduled by hand for the EMAC. It is
| ab_dsp.c's tone808_c, bit for bit: tf += qmul(kt, y - tf); out = qmul(sshl(tf, 2), vel).
|
| void ab_tone808(struct ab_voice *s, int32_t *out, const int32_t *y), with kt and vel in
| ab_r808
|
| The EMAC runs fractional (MACSR 0x20). Each sample's velocity product (ACC1) is read
| after the next sample's filter product (ACC0) is under way.

        .text
        .globl  ab_tone808

        .equ    R_KT, 24                        | ab_r808
        .equ    R_VEL, 28
        .equ    V_TF, 36                        | struct ab_voice

        .equ    ARGS, 24                        | 5 saved registers and the return address

| sshl(tf, 2) into d2, the rare saturation out of line
        .macro  TF2 hi, lo, back
        move.l  %d1, %d2
        cmp.l   #0x1fffffff, %d2
        bgt     \hi
        cmp.l   #-0x20000000, %d2
        blt     \lo
        lsl.l   #2, %d2
\back:
        .endm

| d1 tf, d5 vel, d6 kt; a0 y, a1 out, a2 out's last word; d0, d2, d3 free
ab_tone808:
        lea     -20(%sp), %sp
        movem.l %d2-%d3/%d5-%d6/%a2, (%sp)
        lea     ab_r808, %a1
        move.l  R_KT(%a1), %d6
        move.l  R_VEL(%a1), %d5
        move.l  ARGS(%sp), %a0
        move.l  V_TF(%a0), %d1
        move.l  ARGS+8(%sp), %a0
        move.l  ARGS+4(%sp), %a1
        move.l  #0, %acc1
        move.l  (%a0)+, %d0                     | the first sample
        sub.l   %d1, %d0
        mac.l   %d6, %d0, %acc0
        movclr.l %acc0, %d0
        add.l   %d0, %d1
        TF2     15f, 16f, 7
        mac.l   %d2, %d5, %acc1
        lea     31*4(%a1), %a2
1:      move.l  (%a0)+, %d0                     | the next: its filter, then the last one's output
        sub.l   %d1, %d0
        mac.l   %d6, %d0, %acc0
        movclr.l %acc1, %d3
        move.l  %d3, (%a1)+
        movclr.l %acc0, %d0
        add.l   %d0, %d1
        TF2     17f, 18f, 8
        mac.l   %d2, %d5, %acc1
        cmpa.l  %a2, %a1
        bne     1b
        movclr.l %acc1, %d3
        move.l  %d3, (%a1)

        move.l  ARGS(%sp), %a0
        move.l  %d1, V_TF(%a0)
        movem.l (%sp), %d2-%d3/%d5-%d6/%a2
        lea     20(%sp), %sp
        rts

15:     move.l  #0x7fffffff, %d2
        bra     7b
16:     move.l  #-0x80000000, %d2
        bra     7b
17:     move.l  #0x7fffffff, %d2
        bra     8b
18:     move.l  #-0x80000000, %d2
        bra     8b
