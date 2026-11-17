| SPDX-License-Identifier: MIT
| Analog BD: the 808's damped trigger oscillator on one block, added into the body while it
| lives, scheduled by hand for the EMAC. It is ab_dsp.c's trig808_c, bit for bit:
|   pc1 = pc - qmul(PK, ps); ps1 = ps + qmul(PK, pc1);
|   ps = ps1 - qmul(PD, ps1); pc = pc1 - qmul(PD, pc1); dc -= qmul(DD, dc);
|   for the first n samples, y[i] = sadd(sshl(qmul(pc + dc, atk), 1), y[i])
|
| void ab_trig808(struct ab_voice *s, int32_t *y, int n), with PK, PD, DD and atk in ab_r808
|
| The EMAC runs fractional (MACSR 0x20). The oscillator's two products of pc1 and the
| decay of dc run beside each other on ACC1-ACC3.

        .text
        .globl  ab_trig808

        .equ    R_PK, 32                        | ab_r808
        .equ    R_PD, 36
        .equ    R_DD, 40
        .equ    R_ATK, 44
        .equ    V_PC, 24                        | struct ab_voice
        .equ    V_PS, 28
        .equ    V_DC, 32

        .equ    ARGS, 48                        | 11 saved registers and the return address

| d4 pc, d5 ps, d6 dc, d7 the samples still to add into; a2 PK, a3 PD, a4 DD, a6 atk;
| a0 y, a1 y's end; d0-d3 free
ab_trig808:
        lea     -44(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        lea     ab_r808, %a5
        move.l  R_PK(%a5), %a2
        move.l  R_PD(%a5), %a3
        move.l  R_DD(%a5), %a4
        move.l  R_ATK(%a5), %a6
        move.l  ARGS(%sp), %a5
        move.l  V_PC(%a5), %d4
        move.l  V_PS(%a5), %d5
        move.l  V_DC(%a5), %d6
        move.l  ARGS+4(%sp), %a0
        lea     128(%a0), %a1
        move.l  ARGS+8(%sp), %d7

1:      mac.l   %a2, %d5, %acc0                 | PK ps
        mac.l   %a4, %d6, %acc3                 | DD dc
        movclr.l %acc0, %d0
        move.l  %d4, %d1
        sub.l   %d0, %d1                        | pc1
        mac.l   %a2, %d1, %acc1                 | PK pc1
        mac.l   %a3, %d1, %acc2                 | PD pc1
        movclr.l %acc3, %d0
        sub.l   %d0, %d6                        | dc
        movclr.l %acc1, %d0
        move.l  %d5, %d2
        add.l   %d0, %d2                        | ps1
        mac.l   %a3, %d2, %acc0                 | PD ps1
        movclr.l %acc2, %d0
        sub.l   %d0, %d1
        move.l  %d1, %d4                        | pc
        add.l   %d6, %d1
        mac.l   %a6, %d1, %acc1                 | (pc + dc) atk
        movclr.l %acc0, %d0
        sub.l   %d0, %d2
        move.l  %d2, %d5                        | ps
        movclr.l %acc1, %d0
        tst.l   %d7
        beq     4f                              | retired: the states run on, nothing added
        subq.l  #1, %d7
        cmp.l   #0x3fffffff, %d0                | sshl(.., 1)
        bgt     5f
        cmp.l   #-0x40000000, %d0
        blt     6f
        add.l   %d0, %d0
3:      add.l   %d0, (%a0)                      | sadd into y
        bvs     7f
4:      addq.l  #4, %a0
        cmpa.l  %a1, %a0
        bne     1b

        move.l  ARGS(%sp), %a5
        move.l  %d4, V_PC(%a5)
        move.l  %d5, V_PS(%a5)
        move.l  %d6, V_DC(%a5)
        movem.l (%sp), %d2-%d7/%a2-%a6
        lea     44(%sp), %sp
        rts

5:      move.l  #0x7fffffff, %d0
        bra     3b
6:      move.l  #-0x80000000, %d0
        bra     3b
7:      move.l  (%a0), %d0                      | wrapped: full scale on the side it left
        bmi     8f
        move.l  #-0x80000000, (%a0)
        bra     4b
8:      move.l  #0x7fffffff, (%a0)
        bra     4b
