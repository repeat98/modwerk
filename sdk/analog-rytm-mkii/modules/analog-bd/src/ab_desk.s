| SPDX-License-Identifier: MIT
| Analog BD: the desk at SAT 0 with LOW and HIGH on one block in place, scheduled by
| hand for the EMAC. It is ab_dsp.c's desk_c, bit for bit: the same products, the same
| truncations and the same saturations. The lite desk: the input curve is left
| out; LOW and HIGH weight their bands (0.1.7); only the output's curve stays.
|
| void ab_desk(struct ab_voice *s, int32_t *io, const struct ab_desk_k *k, int32_t *scratch)
|
| s: the voice, its crossover's states lb and m2 at 4 and 8.
| k: gl2, gh (the bands' weights from the block's LOW and HIGH, the low one halved), D_TIN32,
| KB, KM, KMS2 (KMS halved), D_PAD, KSAT, and the model's output: a shift (with its
| saturation bounds) and a trim, 0 for none.
| scratch: 64 words, the crossover's low band [0..31] and its high band [32..63].
|
| The curve is v - KSAT v^5, worked out: v^2 and KSAT v, then v^4, then v^4 (KSAT v). A
| curve's input is held inside (-1, 1) (sshl_in), as -1 squared does not fit.
| The EMAC runs fractional (MACSR 0x20). A result read from an accumulator the instruction
| after its mac waits 3 cycles on the unit; independent curves share the four
| accumulators so their waits overlap.

        .text
        .globl  ab_desk

        .equ    K_GL2, 0
        .equ    K_GH, 4
        .equ    K_TIN, 8
        .equ    K_KB, 12
        .equ    K_KM, 16
        .equ    K_KMS2, 20
        .equ    K_PAD, 24
        .equ    K_KSAT, 28
        .equ    K_SH, 32                        | the output's own shift, its saturation bounds,
        .equ    K_TOP, 36                       | and a trim (0: none)
        .equ    K_BOT, 40
        .equ    K_TRIM, 44
        .equ    FRAMES, 32

        .equ    ARGS, 48                        | 11 saved registers and the return address
        .equ    A_V, ARGS
        .equ    A_IO, ARGS + 4
        .equ    A_K, ARGS + 8
        .equ    A_SCR, ARGS + 12
        .equ    V_LB, 4
        .equ    V_M2, 8

| sshl_in: x << n held inside (-1, 1), the rare saturation out of line
        .macro  SSHL_IN reg, n, top, hi, lo, back
        cmp.l   #\top, \reg
        bgt     \hi
        cmp.l   #-1-\top, \reg
        ble     \lo
        lsl.l   #\n, \reg
\back:
        .endm

| two curves at once: a and b in place, ksat in a register, t1-t4 free; ACC0-ACC3
        .macro  CURVE2 a, b, ksat, t1, t2, t3, t4
        mac.l   \a, \a, %acc0
        mac.l   \ksat, \a, %acc1
        mac.l   \b, \b, %acc2
        mac.l   \ksat, \b, %acc3
        movclr.l %acc0, \t1                     | a^2
        movclr.l %acc1, \t2                     | KSAT a
        movclr.l %acc2, \t3                     | b^2
        movclr.l %acc3, \t4                     | KSAT b
        mac.l   \t1, \t1, %acc0
        mac.l   \t3, \t3, %acc2
        movclr.l %acc0, \t1                     | a^4
        movclr.l %acc2, \t3                     | b^4
        mac.l   \t1, \t2, %acc0
        mac.l   \t3, \t4, %acc2
        movclr.l %acc0, \t1
        movclr.l %acc2, \t3
        sub.l   \t1, \a
        sub.l   \t3, \b
        .endm

ab_desk:
        lea     -44(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        move.l  A_K(%sp), %a5
        move.l  A_IO(%sp), %a2
        move.l  K_KSAT(%a5), %d7
        move.l  #0, %acc1
        move.l  #0, %acc2
        move.l  #0, %acc3
        move.l  #0, %accext23

| 1. the input trim, two samples a turn: io[i] = qmul(D_TIN32, io[i])
        move.l  K_TIN(%a5), %d6
        lea     FRAMES*4(%a2), %a4
1:      move.l  (%a2), %d0
        mac.l   %d6, %d0, %acc0
        move.l  4(%a2), %d1
        mac.l   %d6, %d1, %acc1
        movclr.l %acc0, %d0
        movclr.l %acc1, %d1
        move.l  %d0, (%a2)+
        move.l  %d1, (%a2)+
        cmp.l   %a4, %a2
        bne     1b

| 2. the crossover: lb += qmul(KB, x - lb); rest2 = (x - lb) >> 1; m2 += qmul(KM, rest2 - m2);
|    low[i] = lb, high[i] = rest2 - m2, io[i] = m2. Pipelined: the next sample's lb in ACC0
|    while this one's m2 is in ACC1. d1 lb, d2 m2, d3 rest2; a3 KB, a6 KM, a1 the loop's end.
        move.l  A_IO(%sp), %a2
        move.l  A_SCR(%sp), %a0
        move.l  A_V(%sp), %a1
        move.l  V_LB(%a1), %d1
        move.l  V_M2(%a1), %d2
        move.l  K_KB(%a5), %a3
        move.l  K_KM(%a5), %a6
        lea     FRAMES*4-4(%a2), %a1
        move.l  (%a2), %d0                      | sample 0's lb and rest2
        move.l  %d0, %d4
        sub.l   %d1, %d4
        mac.l   %a3, %d4, %acc0
        movclr.l %acc0, %d4
        add.l   %d4, %d1
        move.l  %d0, %d3
        sub.l   %d1, %d3
        asr.l   #1, %d3
2:      move.l  4(%a2), %d0                     | the next x
        move.l  %d0, %d4
        sub.l   %d1, %d4
        mac.l   %a3, %d4, %acc0                 | KB (x' - lb)
        move.l  %d3, %d5
        sub.l   %d2, %d5
        mac.l   %a6, %d5, %acc1                 | KM (rest2 - m2)
        move.l  %d1, (%a0)+                     | low
        movclr.l %acc0, %d4
        add.l   %d4, %d1                        | the next lb
        movclr.l %acc1, %d5
        add.l   %d5, %d2                        | m2
        sub.l   %d2, %d3
        move.l  %d3, FRAMES*4-4(%a0)            | high
        move.l  %d2, (%a2)+                     | m2
        move.l  %d0, %d3
        sub.l   %d1, %d3
        asr.l   #1, %d3                         | the next rest2
        cmpa.l  %a1, %a2
        bne     2b
        move.l  %d3, %d5                        | the last sample's m2
        sub.l   %d2, %d5
        mac.l   %a6, %d5, %acc1
        move.l  %d1, (%a0)+
        movclr.l %acc1, %d5
        add.l   %d5, %d2
        sub.l   %d2, %d3
        move.l  %d3, FRAMES*4-4(%a0)
        move.l  %d2, (%a2)+
        move.l  A_V(%sp), %a1
        move.l  %d1, V_LB(%a1)
        move.l  %d2, V_M2(%a1)

| 3. the bands: io[i] = gl2 low + gh high + KMS2 m2, truncated once (half the model's sum;
|    the curve's input below doubles it)
        move.l  A_IO(%sp), %a2
        move.l  A_SCR(%sp), %a0
        move.l  K_GL2(%a5), %d6
        move.l  K_GH(%a5), %d5
        move.l  K_KMS2(%a5), %d3
        lea     FRAMES*4(%a2), %a4
        move.l  %a4, A_SCR(%sp)                 | io's end, in scratch's argument
3:      move.l  (%a0)+, %d0
        mac.l   %d6, %d0, %acc0                 | gl2 low
        move.l  FRAMES*4-4(%a0), %d1
        mac.l   %d5, %d1, %acc0                 | gh high
        move.l  (%a2), %d2
        mac.l   %d3, %d2, %acc0                 | KMS2 m2
        movclr.l %acc0, %d0
        move.l  %d0, (%a2)+
        cmpa.l  A_SCR(%sp), %a2
        bne     3b

| 4. the output, two samples a turn: io[i] = sshl(qmul(D_PAD, curve(sshl_in(io[i], 5))), sh),
|    then trimmed
        move.l  A_IO(%sp), %a2
        move.l  K_PAD(%a5), %d6
        move.l  K_TRIM(%a5), %d5
4:      move.l  (%a2), %d0
        move.l  4(%a2), %d1
        SSHL_IN %d0, 5, 0x03ffffff, 16f, 17f, 18
        SSHL_IN %d1, 5, 0x03ffffff, 23f, 24f, 25
        CURVE2  %d0, %d1, %d7, %d2, %d3, %d4, %a3
        mac.l   %d6, %d0, %acc0                 | D_PAD
        mac.l   %d6, %d1, %acc1
        move.l  K_SH(%a5), %d2
        movclr.l %acc0, %d0
        movclr.l %acc1, %d1
        cmp.l   K_TOP(%a5), %d0                 | sshl(.., sh)
        bgt     19f
        cmp.l   K_BOT(%a5), %d0
        blt     20f
        lsl.l   %d2, %d0
21:     cmp.l   K_TOP(%a5), %d1
        bgt     26f
        cmp.l   K_BOT(%a5), %d1
        blt     27f
        lsl.l   %d2, %d1
28:     tst.l   %d5                             | the trim
        beq     22f
        mac.l   %d5, %d0, %acc0
        mac.l   %d5, %d1, %acc1
        movclr.l %acc0, %d0
        movclr.l %acc1, %d1
22:     move.l  %d0, (%a2)+
        move.l  %d1, (%a2)+
        cmpa.l  A_SCR(%sp), %a2
        bne     4b

        movem.l (%sp), %d2-%d7/%a2-%a6
        lea     44(%sp), %sp
        rts

| The saturations: each puts full scale (just inside it for a curve's input) in place and
| goes back.
16:     move.l  #0x7fffffff, %d0
        bra     18b
17:     move.l  #-0x7fffffff, %d0
        bra     18b
19:     move.l  #0x7fffffff, %d0
        bra     21b
20:     move.l  #-0x80000000, %d0
        bra     21b
23:     move.l  #0x7fffffff, %d1
        bra     25b
24:     move.l  #-0x7fffffff, %d1
        bra     25b
26:     move.l  #0x7fffffff, %d1
        bra     28b
27:     move.l  #-0x80000000, %d1
        bra     28b
