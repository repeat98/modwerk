| SPDX-License-Identifier: MIT
| Analog BD: the 909's body on 16 samples (pitch, the recorded cycle and its fundamental,
| the VCA and the thump), scheduled by hand for the EMAC. It is ab_dsp.c's body909_c, bit
| for bit.
|
| void ab_body909(struct ab_voice *s, int32_t *out), with the controls for these 16 samples
| in the voice (render909 works them out) and the constants in ab_k909
|
| The EMAC runs fractional (MACSR 0x20). The four products that open a sample go to the
| four accumulators, and each later product is read back after other work where it can be.

        .text
        .globl  ab_body909

        .equ    K_KA, 0                         | ab_k909
        .equ    K_KTH, 4
        .equ    K_BODY, 40
        .equ    V_EP, 12                        | struct ab_voice: the body's state
        .equ    V_U, 16
        .equ    V_O, 20
        .equ    V_M, 24
        .equ    V_TH, 28
        .equ    V_AINCB, 32                     | and its controls
        .equ    V_ASINCA, 36
        .equ    V_DKP, 40
        .equ    V_DKM, 44
        .equ    V_GLR, 48
        .equ    V_GK, 52
        .equ    V_GH, 56
        .equ    V_NGDC, 60

        .equ    ARGS, 48                        | 11 saved registers and the return address

| d4 ep, d5 o, d6 m, d7 u; a1 the voice, a2 th, a4 out, a5 ab_k909, a6 the body table;
| d0-d3, a0 free. The loop ends at out + 16 samples, kept in out's argument.
ab_body909:
        lea     -44(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        move.l  ARGS(%sp), %a1
        move.l  ARGS+4(%sp), %a4
        lea     ab_k909, %a5
        lea     64(%a4), %a0
        move.l  %a0, ARGS+4(%sp)
        move.l  #0, %acc1
        move.l  #0, %acc2
        move.l  #0, %acc3
        move.l  #0, %accext23
        move.l  V_EP(%a1), %d4
        move.l  V_O(%a1), %d5
        move.l  V_M(%a1), %d6
        move.l  V_U(%a1), %d7
        move.l  V_TH(%a1), %a2
        move.l  K_BODY(%a5), %a6

1:      move.l  V_ASINCA(%a1), %d0
        mac.l   %d0, %d4, %acc0                 | asinca ep
        move.l  V_DKP(%a1), %d0
        mac.l   %d4, %d0, %acc1                 | ep dkp
        move.l  #0x7fffffff, %d1
        sub.l   %d5, %d1
        move.l  K_KA(%a5), %d0
        mac.l   %d0, %d1, %acc2                 | KA (QMAX - o)
        move.l  V_DKM(%a1), %d0
        mac.l   %d6, %d0, %acc3                 | m dkm
        movclr.l %acc0, %d0
        add.l   V_AINCB(%a1), %d0               | inc
        add.l   %d0, %d7                        | u, wrapping
        movclr.l %acc1, %d1
        sub.l   %d1, %d4                        | ep
        move.l  V_GK(%a1), %d0
        mac.l   %d0, %d4, %acc1                 | gk ep
        movclr.l %acc2, %d0
        add.l   %d0, %d5                        | o
        movclr.l %acc3, %d0
        sub.l   %d0, %d6                        | m
        mac.l   %d5, %d6, %acc2                 | g = o m
        move.l  %d7, %d0                        | the row: (u ^ 0x80000000) >> 25, 8 bytes a row
        bchg    #31, %d0
        moveq   #22, %d1
        lsr.l   %d1, %d0
        and.l   #0x3f8, %d0
        lea     (%a6,%d0.l), %a0
        move.l  %d7, %d1                        | f: the rest of u, Q31
        lsl.l   #6, %d1
        bclr    #31, %d1
        move.l  (%a0), %d2                      | CTD[k], CTD[k+1]
        move.l  8(%a0), %d3
        sub.l   %d2, %d3
        mac.l   %d3, %d1, %acc0                 | (CTD[k+1] - CTD[k]) f
        move.l  4(%a0), %d0                     | CF[k], CF[k+1]
        move.l  12(%a0), %d3
        sub.l   %d0, %d3
        mac.l   %d3, %d1, %acc3                 | (CF[k+1] - CF[k]) f
        movclr.l %acc1, %d1
        add.l   V_GH(%a1), %d1                  | lf = gh + gk ep
        movclr.l %acc0, %d3
        add.l   %d2, %d3                        | td
        movclr.l %acc3, %d2
        add.l   %d0, %d2                        | fu
        move.l  V_GLR(%a1), %d0
        mac.l   %d3, %d0, %acc0                 | td glr
        mac.l   %d1, %d2, %acc0                 |   + lf fu = s8
        movclr.l %acc2, %d0                     | g
        move.l  %d0, %d1
        sub.l   %a2, %d1
        move.l  K_KTH(%a5), %d2
        mac.l   %d2, %d1, %acc1                 | KTH (g - th)
        movclr.l %acc0, %d3                     | s8
        mac.l   %d0, %d3, %acc0                 | g s8
        movclr.l %acc1, %d1
        add.l   %d1, %a2                        | th
        move.l  V_NGDC(%a1), %d1
        mac.l   %d1, %a2, %acc0                 |   + ngdc th
        movclr.l %acc0, %d0
        add.l   %d0, %d0                        | twice
        move.l  %d0, (%a4)+
        cmpa.l  ARGS+4(%sp), %a4
        bne     1b

        move.l  %d4, V_EP(%a1)
        move.l  %d5, V_O(%a1)
        move.l  %d6, V_M(%a1)
        move.l  %d7, V_U(%a1)
        move.l  %a2, V_TH(%a1)
        movem.l (%sp), %d2-%d7/%a2-%a6
        lea     44(%sp), %sp
        rts
