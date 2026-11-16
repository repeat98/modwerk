| SPDX-License-Identifier: MIT
| Analog BD: the 909's click on 16 samples, added in: the table's row while it lasts and
| the two slow modes, scheduled by hand for the EMAC. It is ab_dsp.c's click909_c, bit for
| bit.
|
| void ab_click909(struct ab_voice *s, int32_t *y), with the constants in ab_k909
|
| The EMAC runs fractional (MACSR 0x20). The slow modes' sum goes to ACC0, the row's to
| ACC1, and the two decays to ACC2 and ACC3, none read back before all four are under way.

        .text
        .globl  ab_click909

        .equ    CLK_N, 128                      | the table's rows (ab_dsp.c checks it)
        .equ    K_KPR, 8                        | ab_k909
        .equ    K_AHP, 12
        .equ    K_CLK, 44
        .equ    V_G1, 64                        | struct ab_voice
        .equ    V_G2, 68
        .equ    V_G3, 72
        .equ    V_G4, 76
        .equ    V_E1, 80
        .equ    V_E2, 84
        .equ    V_PP, 88

        .equ    ARGS, 48                        | 11 saved registers and the return address

| d2 g1, d3 g2, d4 g3, d5 g4, d6 e1, d7 e2; a0 the row, a2 KPR, a3 AHP, a4 y, a5 ab_k909,
| a6 the voice; d0-d1 free. The loop ends at y + 16 samples, kept in y's argument.
ab_click909:
        lea     -44(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        move.l  ARGS(%sp), %a6
        move.l  ARGS+4(%sp), %a4
        lea     ab_k909, %a5
        lea     64(%a4), %a0
        move.l  %a0, ARGS+4(%sp)
        move.l  #0, %acc1
        move.l  #0, %acc2
        move.l  #0, %acc3
        move.l  #0, %accext23
        move.l  V_G3(%a6), %d4
        move.l  V_G4(%a6), %d5
        move.l  V_E1(%a6), %d6
        move.l  V_E2(%a6), %d7
        move.l  K_KPR(%a5), %a2
        move.l  K_AHP(%a5), %a3
        move.l  V_PP(%a6), %d0
        cmp.l   #CLK_N, %d0
        bge     3f
        move.l  V_G1(%a6), %d2
        move.l  V_G2(%a6), %d3
        lsl.l   #3, %d0                         | 8 bytes a row
        move.l  K_CLK(%a5), %a0
        add.l   %d0, %a0

| the table's row and the slow modes
1:      mac.l   %d4, %d6, %acc0                 | g3 e1
        mac.l   %d5, %d7, %acc0                 |   + g4 e2
        move.l  (%a0)+, %d0
        mac.l   %d2, %d0, %acc1                 | g1 row
        move.l  (%a0)+, %d1
        mac.l   %d3, %d1, %acc1                 |   + g2 row'
        mac.l   %d6, %a2, %acc2                 | e1 KPR
        mac.l   %d7, %a3, %acc3                 | e2 AHP
        movclr.l %acc0, %d0
        movclr.l %acc1, %d1
        add.l   %d1, %d0
        add.l   %d0, (%a4)+
        movclr.l %acc2, %d6
        movclr.l %acc3, %d7
        cmpa.l  ARGS+4(%sp), %a4
        bne     1b
        bra     4f

| the slow modes alone
3:      mac.l   %d4, %d6, %acc0                 | g3 e1
        mac.l   %d5, %d7, %acc0                 |   + g4 e2
        mac.l   %d6, %a2, %acc2                 | e1 KPR
        mac.l   %d7, %a3, %acc3                 | e2 AHP
        movclr.l %acc0, %d0
        add.l   %d0, (%a4)+
        movclr.l %acc2, %d6
        movclr.l %acc3, %d7
        cmpa.l  ARGS+4(%sp), %a4
        bne     3b

4:      move.l  %d6, V_E1(%a6)
        move.l  %d7, V_E2(%a6)
        movem.l (%sp), %d2-%d7/%a2-%a6
        lea     44(%sp), %sp
        rts
