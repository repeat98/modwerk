        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base, the lean engine (Nathaniel Pavel), the modulation: do not run three modulation passes of the
        | audio interrupt in the blocks where they change nothing, and clear 56 flags with a shorter loop.
        | Stock OS 1.74, vector 191, once a block of 32 frames. Nothing here changes a value stock would have
        | produced: each skip is taken only when, by stock's own arithmetic, the pass writes back what it read,
        | and that is tested in the block itself. No stock loop is copied: the tests stand in front of stock's
        | code and either jump it or hand over to it.
        |
        | The parameter words: 572 unsigned 16-bit words at LE_PAR (0x8000f774), written new every block by the
        | smoother (0x40120d26; in the lean engine by le_sm_run of engine.s, which writes the same words) and then
        | changed in place by the passes below.
        | Set review, 20 Nov 2026: the accumulators' extension word is not tested here; every EMAC user in front
        | of these sites ends with MOVCLR (the handler's entry, the smoother, the coef loop 0x40120e2a), which
        | clears it with the accumulator. The interrupt has a second, short path (taken while [0x8000e578] is
        | not 0, branch at 0x4011fe02) that runs none of these three passes and ends in the flag clear.
        |
        | LE_SLD = 1. The per-track pass 0x40120e56..0x40120e9c: for 13 tracks x 42 words,
        | word = word - coef_t x depth (two MSAC.W on each half: -(coef's upper word x depth) and
        | -(0x8000 x word), fractional mode, MACSR 0x20 set at 0x4011fbfe; the result's upper half is stored).
        | With a coef whose upper word is 0 the first product is 0 and the second gives back the word (for the
        | word 0x8000 too: 2^31 or the saturated 0x7fffffff, negated, both have the upper half 0x8000). The
        | coefs are 13 longs at LE_COEF (0x8000e438), computed just before (0x40120e14). le_ms_slide (from 0x40120e56,
        | in place of `lea 0x8000f7a8,a0`) tests the 13 upper words, that ACC0 and ACC1 are clear (stock adds
        | into them without clearing first, and leaves them clear) and that MACSR's mode bits are 0x20 (in
        | integer mode the pass would store half of each word): then the pass is jumped (0x40120e9e). The pass
        | writes 274 longs from LE_PAR + 0x30: the long before the 13 x 42 words comes back as read too.
        | All 13 or none: a block in which one track's coef is not 0 runs stock's pass whole.
        |
        | LE_LST = 1. The list routine 0x4011de2a (26 calls a block: 2 lists for each of 12 tracks, 2 more):
        | for 4 entries (depth in the upper word, word index in the lower, signed),
        | acc = -(value's lower word x depth); x = (word << 16) - 2^30 - acc; x = sat(x); x = sat(2x) >> 1;
        | word = (x + 2^30) >> 16. With acc = 0 the subtraction cannot overflow, and for a word below 0x8000
        | x lies in -2^30 .. 2^30 - 65536, so doubling does not saturate and the word comes back as it was. (A word
        | of 0x8000 or more would come back as 0x7fff or 0: so each of the 4 words is tested.) acc is 0 when the
        | value's lower word is 0 or the entry's depth is 0, given ACC0 clear at entry, which is tested. le_ms_list
        | (from the routine's first 6 bytes) returns at once when all 4 entries are so, else runs the two
        | instructions it replaced and goes on in stock at 0x4011de30. All 4 or none.
        |
        | LE_MTX = 1. The 48-slot matrix 0x40120fc8..0x40121012 (run when [0x8000ed74] is 0): for each slot,
        | acc = source word x depth, where the source is the parameter word whose index is the slot's byte at
        | LE_MX_SRC, and the entry at LE_MX_ENT is depth (upper word) and destination index (lower, unsigned); then
        | the same clamp arithmetic as above on the destination word. le_ms_matrix (from 0x40120fc0, in place of
        | `tst.l 0x8000ed74`, returning the flags stock's `bne` then reads) answers "skip" when: parameter words
        | 0..11 are all 0, every source byte is under 12 (so every source word is one of those), and all 48
        | destination words are below 0x8000. ACC0 is clear here: the last list call before it either ran
        | stock (MOVCLR) or was skipped after testing it. All 48 or none.
        |
        | LE_CLR = 1. 0x401214d8..0x401214f6 clears the byte at 0x8000646c + 8 i, i = 0..55, with 9 instructions
        | for each. le_ms_clr (from 0x401214da) writes the same 56 zero bytes with 7 instructions for each 4 and
        | goes on at 0x401214f8. Stock loads d0-d3 and a0 again before it reads them.
        |
        | Registers. le_ms_slide uses d0, d1, a0: stock loads d0-d4, d6, d7, a0, a1, a5 again before it reads
        | them, from 0x40120e56 on and from 0x40120e9e on (d5 is not touched by the pass or by this).
        | le_ms_list: stock's routine uses d0, d1, a0, a1 freely and keeps the rest; so does this. le_ms_matrix uses
        | d0-d3, a0, a1, a4: read in the listing from 0x40121014 on, each is written before it is read on
        | every path (also with the matrix off, where only d0 is changed here).
        | A skip jumps stock code: a module that later takes a site inside 0x40120e5c..e9d, 0x4011de30..de7a,
        | 0x40120fc8..0x40121013 or 0x401214e0..f7 would not run in skipped blocks. None does today.
        |
        | LE_VERIFY = 1 (self-check): nothing is skipped. Where a skip would be taken, the words are copied,
        | stock runs, and the words are compared afterwards (two more sites: 0x40120e9e and 0x40121014).
        | LE_CLR is left to stock. Differences are counted. It tests the claim "stock gives the words back"
        | on the unit's own data; it does not run the real build's leaving paths (the twin run in the
        | emulator does), it compares the 572 words only, and its accumulator tests after stock's pass can
        | only read 0 (stock's MOVCLR).
        |
        | LE_COUNT = 1: counters since boot in le_ms_total (15 longs): +0 slide pass skipped, +4 run, +8 lists
        | skipped, +12 lists run, +16 matrix skipped, +20 matrix run, +24 matrix off (stock's own flag),
        | +28 not skipped for an accumulator, +32 not skipped for a word of 0x8000 or more, +36/+40/+44
        | LE_VERIFY: differences slide / lists / matrix, +48/+52/+56 LE_VERIFY: comparisons made.

        .ifndef LE_SLD
        .set    LE_SLD, 1
        .endif
        .ifndef LE_LST
        .set    LE_LST, 1
        .endif
        .ifndef LE_MTX
        .set    LE_MTX, 1
        .endif
        .ifndef LE_CLR
        .set    LE_CLR, 1
        .endif
        .ifndef LE_VERIFY
        .set    LE_VERIFY, 0
        .endif
        .ifndef LE_COUNT
        .set    LE_COUNT, 0
        .endif
        .if     LE_VERIFY && !LE_COUNT
        .error  "the self-check build reports through its counters"
        .endif

        .macro  total off
        .if     LE_COUNT
        addq.l  #1,le_ms_total+\off
        .endif
        .endm

        .bss
        .balign 4
        .if     LE_COUNT
        .globl  le_ms_total
le_ms_total: .space 60
        .endif
        .if     LE_VERIFY
ms_vs:  .space 1096                             | the slide pass's 274 longs from LE_PAR + 0x30
ms_vm:  .space 1144                             | the 572 parameter words
ms_vw:  .space 16                               | a list's 4 words, as longs
ms_vfs: .space 1                                | the slide pass would have been skipped in this block
ms_vfm: .space 1                                | the matrix would have been skipped in this block
        .balign 4
        .endif

        .text

        | ------------------------------------------------------------------------------------------------
        .if     LE_SLD
        | jsr from 0x40120e56 (6 bytes: lea 0x8000f7a8,a0).
        .globl  le_ms_slide
        .balign 16
le_ms_slide:
        lea     LE_COEF,%a0
        move.l  (%a0)+,%d0
        .rept   12
        or.l    (%a0)+,%d0
        .endr
        swap    %d0
        tst.w   %d0                             | the 13 upper words
        jbne    9f
        move.l  %acc0,%d0                       | a move from an accumulator does not set the flags
        move.l  %acc1,%d1
        or.l    %d1,%d0
        bne.s   8f
        move.l  %macsr,%d0                      | fractional, signed, no saturation, truncating: 0x20 in bits 7..4
        and.l   #0xf0,%d0                       | (the overflow flags above them are sticky: not part of the mode)
        moveq   #0x20,%d1
        cmp.l   %d1,%d0
        bne.s   8f
        total   0
        .if     LE_VERIFY
        moveq   #1,%d0
        move.b  %d0,ms_vfs
        lea     LE_PAR+0x30,%a0
        lea     ms_vs,%a1
        move.l  #274,%d0
1:      move.l  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne.s   1b
        bra.s   7f
        .else
        addq.l  #4,%sp
        jmp     LE_SLIDE_END
        .endif
9:      total   4
7:      lea     LE_PAR+0x34,%a0                    | the instruction the site replaced
        rts
8:      total   28
        bra.s   7b

        .if     LE_VERIFY
        | jsr from 0x40120e9e (6 bytes: tst.l 0x8000fce8; stock's beq reads the flags).
        .globl  le_msv_slide
le_msv_slide:
        tst.b   ms_vfs
        beq.s   3f
        clr.b   ms_vfs
        total   48
        lea     LE_PAR+0x30,%a0
        lea     ms_vs,%a1
        move.l  #274,%d0
1:      move.l  (%a0)+,%d1
        cmp.l   (%a1)+,%d1
        bne.s   2f
        subq.l  #1,%d0
        bne.s   1b
        move.l  %acc0,%d0
        move.l  %acc1,%d1
        or.l    %d1,%d0
        beq.s   3f
2:      total   36
3:      tst.l   LE_FCE8
        rts
        .endif
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_LST
        | jmp from 0x4011de2a (6 bytes: lea -16(sp),sp / moveq #4,d0). 4(sp) = value, 8(sp) = list.
        .globl  le_ms_list
        .balign 16
le_ms_list:
        move.l  8(%sp),%a1
        tst.w   6(%sp)                          | the value's lower word: the factor stock uses
        beq.s   1f
        tst.w   (%a1)                           | the 4 depths
        jbne    9f
        tst.w   4(%a1)
        jbne    9f
        tst.w   8(%a1)
        jbne    9f
        tst.w   12(%a1)
        jbne    9f
1:      move.l  %acc0,%d0
        tst.l   %d0
        bne.s   8f
        lea     LE_PAR,%a0
        mvs.w   2(%a1),%d0                      | the 4 words: below 0x8000?
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvs.w   6(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvs.w   10(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvs.w   14(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        total   8
        .if     LE_VERIFY
        bra.s   ms_list_chk
        .else
        rts
        .endif
        .if     LE_COUNT
7:      total   32
        bra.s   ms_list_stock
8:      total   28
        bra.s   ms_list_stock
9:      total   12
        .else
7:
8:
9:
        .endif
ms_list_stock:
        lea     -16(%sp),%sp
        moveq   #4,%d0
        jmp     LE_LIST_BODY

        .if     LE_VERIFY
        | a1 = list, a0 = LE_PAR. Keep the 4 words, run stock on the same arguments, compare.
ms_list_chk:
        .irp    k, 0, 1, 2, 3
        mvs.w   2+4*\k(%a1),%d0
        mvz.w   (%a0,%d0.l*2),%d1
        move.l  %d1,ms_vw+4*\k
        .endr
        move.l  8(%sp),-(%sp)                   | list
        move.l  8(%sp),-(%sp)                   | value (4(sp) before the push above)
        bsr.s   ms_list_stock
        addq.l  #8,%sp
        total   52
        move.l  8(%sp),%a1
        lea     LE_PAR,%a0
        .irp    k, 0, 1, 2, 3
        mvs.w   2+4*\k(%a1),%d0
        mvz.w   (%a0,%d0.l*2),%d1
        cmp.l   ms_vw+4*\k,%d1
        bne.s   2f
        .endr
        move.l  %acc0,%d0
        tst.l   %d0
        beq.s   3f
2:      total   40
3:      rts
        .endif
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_MTX
        | jsr from 0x40120fc0 (6 bytes: tst.l 0x8000ed74). Returns NE for "no matrix pass", EQ for stock's loop.
        .globl  le_ms_matrix
        .balign 16
le_ms_matrix:
        tst.l   LE_MX_OFF
        jbne    8f
        lea     LE_PAR,%a0
        move.l  (%a0),%d0                       | parameter words 0..11
        or.l    4(%a0),%d0
        or.l    8(%a0),%d0
        or.l    12(%a0),%d0
        or.l    16(%a0),%d0
        or.l    20(%a0),%d0
        jbne    9f
        | Every source byte under 12? d2 collects the bytes, d3 the bytes + 4: with no byte of 16 or more
        | (d2's upper nibbles clear) no addition carries into the next byte, and a byte + 4 has an upper
        | nibble exactly when the byte is 12..15.
        lea     LE_MX_SRC,%a1
        lea     48(%a1),%a4
        moveq   #0,%d2
        moveq   #0,%d3
        move.l  #0x04040404,%d1
1:      move.l  (%a1)+,%d0
        or.l    %d0,%d2
        add.l   %d1,%d0
        or.l    %d0,%d3
        cmpa.l  %a4,%a1
        bne.s   1b
        or.l    %d3,%d2
        and.l   #0xf0f0f0f0,%d2
        jbne    9f
        lea     LE_MX_ENT,%a1                      | the 48 destination words: below 0x8000?
        lea     192(%a1),%a4
2:      mvz.w   2(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvz.w   6(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvz.w   10(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        mvz.w   14(%a1),%d0
        tst.w   (%a0,%d0.l*2)
        jbmi    7f
        lea     16(%a1),%a1
        cmpa.l  %a4,%a1
        bne.s   2b
        total   16
        .if     LE_VERIFY
        moveq   #1,%d0
        move.b  %d0,ms_vfm
        lea     ms_vm,%a1
        move.l  #286,%d0
3:      move.l  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne.s   3b
        moveq   #0,%d0                          | EQ: stock's loop runs, le_msv_matrix compares
        rts
        .else
        moveq   #1,%d0                          | NE
        rts
        .endif
        .if     LE_COUNT
7:      total   32
        bra.s   6f
9:      total   20
        .else
7:
9:
        .endif
6:      moveq   #0,%d0                          | EQ
        rts
8:      total   24
        moveq   #1,%d0                          | NE, as stock's test gave
        rts

        .if     LE_VERIFY
        | jsr from 0x40121014 (6 bytes: move.l 0x40287ffc,-(sp)).
        .globl  le_msv_matrix
le_msv_matrix:
        tst.b   ms_vfm
        beq.s   3f
        clr.b   ms_vfm
        total   56
        lea     LE_PAR,%a0
        lea     ms_vm,%a1
        move.l  #286,%d0
1:      move.l  (%a0)+,%d1
        cmp.l   (%a1)+,%d1
        bne.s   2f
        subq.l  #1,%d0
        bne.s   1b
        move.l  %acc0,%d0
        tst.l   %d0
        beq.s   3f
2:      total   44
3:      move.l  LE_FRAMES,%d0
        move.l  (%sp),-(%sp)                    | the return address moves down, the argument goes above it
        move.l  %d0,4(%sp)
        rts
        .endif
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_CLR && !LE_VERIFY
        | jmp from 0x401214da (6 bytes: lea 0x800063c0,a0).
        .globl  le_ms_clr
        .balign 16
le_ms_clr:
        lea     LE_FLAGS,%a0
        moveq   #14,%d0
1:      clr.b   (%a0)
        clr.b   8(%a0)
        clr.b   16(%a0)
        clr.b   24(%a0)
        lea     32(%a0),%a0
        subq.l  #1,%d0
        bne.s   1b
        jmp     LE_CLR_END
        .endif
