        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base, the lean engine (Nathaniel Pavel), the rest of the engine: four places of the audio interrupt
        | (stock OS 1.74, vector 191, once a block of 32 frames) where work is left out in the blocks in which
        | it would write what is there already. Nothing here changes a value stock would have produced.
        |
        | LE_NSC = 1. The host stream buffers. Two buffers of 32 frames x 12 longs (1,536 B) at LE_U0 and
        | LE_U0 + 1536; each block the stream reader 0x40005e9c fills one (index [0x8000fef4] ^ 1 by its caller,
        | 0x4011fda6) and the mixers read the other. With no stream it clears all 32 frames (0x40005f40, the
        | library clear 0x40097c40), every block. le_ns_gate (from 0x40005f2c, in place of the reader's lines up to
        | 0x40005f4a: the frame count test, the byte count and the call) keeps one byte a buffer: "all zero".
        | It is set after a clear of all 32 frames with no stream frames behind it (d3 = 0), and dropped
        | whenever the reader clears less (stream frames follow in the same call: 0x40005fc4, 0x40006108)
        | or the other path of the interrupt writes the buffers (0x4011fc6c.., its clear is le_ns_dirty).
        | With the byte set and a full clear due, the clear is left out. Writers of the buffers in OS 1.74,
        | by a search of the image for every address in them: the reader, the path at 0x4011fc54..0x4011fd8c;
        | readers 0x4010ea98, 0x4010eb92, 0x4010ec6a, 0x4013f738 (the last one takes a pointer and only loads
        | through it). No module in the library writes them (`voice-dac` and `comp-preview` name the voice mix's
        | stream loop in comments only: release review, 20 Nov 2026). The marks start at 0: the core's boot hook zeroes every mod's .bss, the base's included.
        |
        | LE_CMW = 1. The compressor's control words 0x4010e20c (call at 0x40121398; frame at 4(sp), 8 parameter
        | words at 8(sp)): from words +0, +10, +12, +14 and the upper bytes of +2, +4, +6, +8 it writes frame
        | words +2, +4, +6, +8, all 8 bits of byte +162 and bits 1 and 2 of byte +165; one call of the
        | exponent 0x40098a24 (a function of its argument, the MAC mode and a clear ACC0); a constant table
        | 0x401ef4a0; no other input (it adds into ACC0 without clearing it first, so ACC0 is one).
        | le_cw_memo keeps the 16 input bytes and the outputs of the last call. With the same 16 bytes, clear
        | accumulators and MACSR's mode bits at 0x20, it writes the kept outputs (every block, as stock
        | does) and does not call. Any other block calls stock and keeps its result.
        |
        | LE_SMO = 1. The parameter smoother 0x40120d1c..0x40120d4e: for 572 words, state = 0.03 x target +
        | 0.97 x state (state 32 bits at LE_STATE, target 16 bits at LE_TGT, coefficients d7 = 0x03d70000 and
        | d6 = 0x7c290000, MAC.W upper x upper plus MAC.L, fractional), word = upper half of state + 0x8000,
        | written to LE_PAR. le_sm_run does the same arithmetic in its own loop (sm_full; two words a pass, no
        | carry from one pass to the next, so a pass does not depend on its neighbours). The words are taken
        | in 14 groups: the 26 in front (always sm_full) and 42 for each of 13 tracks. A track's group gets a
        | mark "at rest" after a block in which sm_obs, the same arithmetic, found every one of its 42 states
        | unchanged by the update (one unmarked group a block is watched like this, in turn). A marked group
        | is not multiplied: for each two words, upper halves of state + 0x8000 are formed and compared with
        | the two target words. Equal: these are the words stock would write (the state is where it was when
        | the update last left it unchanged, or was set to target << 16 since, and for either the update is
        | the identity as long as the target is the one the state stands for), so they are written and the
        | state is left. Not equal: the mark is dropped and this and the group's later words go through
        | sm_full. Why "equal" means the target did not change: 0.03 and 0.97 are 983/32768 and 31785/32768,
        | their sum is 1, so a state the update leaves unchanged lies within 34 of target << 16 whatever the
        | rounding, and its upper half after + 0x8000 is the target. What a marked group needs of any other
        | writer of LE_STATE is that it stores values of the form X << 16 (the update is then the identity when
        | the target is X, in any rounding mode, and the compare sees any other target). Writers in OS 1.74,
        | by a search of the image for LE_STATE's addresses and for every use of the base LE_TGT with an index
        | (review, 20 Nov 2026): 0x40120d76 (one word a track, after the smoother), 0x4011db4e (a track's 42
        | words, with its targets), 0x4011f3ea and 0x4011f42c (one word, with its target), all word << 16, and
        | 0x4011faae (one word, 0x40000000). The target setter 0x4011f704 takes an index nobody checks: one of
        | 1156 or more would store half a state (its callers' ranges were not read). A writer of anything
        | else into a marked group would not be seen: none found.
        | The interrupt's second, short path (while [0x8000e578] is not 0: branch at 0x4011fe02, then the voice
        | mix from its other caller 0x4011fe22, the FX, the flag clear) runs neither the reader, the smoother nor
        | the compressor call: the marks describe what the buffers and states hold, nothing writes them there,
        | and a kit load in that time stores states of the form X << 16 (set review, 20 Nov 2026).
        | In the lean engine MACSR's condition flags can differ from stock's after any part's skip, not only
        | the two named next; the same holds for all of them.
        | MACSR's condition flags (not its mode) can differ from stock's after le_sm_run and after a kept LE_CMW
        | block; nothing on the interrupt's path reads them (each read masks 0xf0, the exit restores MACSR).
        | If MACSR's mode bits are not 0x20 at entry all marks are dropped and every group goes through
        | sm_full (same arithmetic as stock in any mode).
        |
        | LE_VDC = 1 (needs LE_NSC). The voice mix 0x4010ea98: for 8 voices x 32 frames, DAC word = (A2 + A3 - g x A0 +
        | 0.5 x U) >> 8, U the stream buffer [0x8000fef4] of the two above (saturating fractional mode, set
        | on entry, 0x20 again on exit; g ramps by (target - current) >> 5 a frame and is stored back).
        | le_vd_gate (from the routine's first two instructions) runs its own loop without the U term when that
        | buffer is marked all zero: the term is then a product with 0, and adding it leaves the accumulator
        | as it is in any mode. Any other block, a [0x8000fef4] above 1 or a negative byte in the table
        | 0x401bed40 (stock then takes another loop): stock's routine, from its third instruction.
        |
        | LE_VERIFY = 1: stock does all the work. LE_NSC: where the clear would be left out the buffer is tested
        | for zero first, then cleared as stock. LE_CMW: stock is always called; where the kept outputs would
        | have been used they are compared with what stock wrote. LE_VDC: where the own loop would run it runs first,
        | into a second DAC block, and the gains are put back; then stock runs and the 8 x 32 words and the 8
        | gains are compared. LE_SMO: stock's loop runs; le_smv_pre copies LE_STATE
        | before it, le_smv_post (from 0x40120d4e; 0x40120d54 is a branch target, so the site ends before it) runs sm_core on the copy into a second parameter array and compares both with
        | what stock left. Differences are counted. Two false counts are possible: the own voice loop and
        | sm_core's run on the copy start from the accumulators as they are then, stock from the entry's; if
        | ACC0 or ACC1 were not clear at entry (they are, as far as read) a difference would be counted that
        | the real build does not have, and for the voice mix stock's first word would change.
        |
        | Counters (LE_COUNT = 1; le_t2_total, longs): +0 clears left out, +4 full clears done, +8 buffer marked
        | written, +12 other path, +16 compressor words kept, +20 recomputed, +24 recomputed for the
        | accumulators or mode, +28 groups at rest, +32 groups through sm_full, +36 groups watched, +40 marks
        | dropped, +44 marks set, +48 smoother blocks in another MAC mode, +52 DIFF stream buffer not zero,
        | +56 DIFF compressor, +60 DIFF smoother state, +64 DIFF smoother words, +68 checks stream,
        | +72 checks compressor, +76 checks smoother, +80 voice mix own loop, +84 stock's, +88 DIFF voice mix,
        | +92 checks voice mix.

        .ifndef LE_NSC
        .equ    LE_NSC, 1
        .endif
        .ifndef LE_CMW
        .equ    LE_CMW, 1
        .endif
        .ifndef LE_SMO
        .equ    LE_SMO, 1
        .endif
        .ifndef LE_VDC
        .equ    LE_VDC, 1
        .endif
        .if     LE_VDC && !LE_NSC
        .error  "LE_VDC needs LE_NSC"
        .endif
        .ifndef LE_VERIFY
        .equ    LE_VERIFY, 0
        .endif
        .ifndef LE_COUNT
        .equ    LE_COUNT, 0
        .endif
        .if     LE_VERIFY && !LE_COUNT
        .error  "LE_VERIFY needs LE_COUNT"
        .endif

        .macro  total off
        .if     LE_COUNT
        addq.l  #1,le_t2_total+\off
        .endif
        .endm

        .bss
        .balign 4
        .if     LE_COUNT
        .globl  le_t2_total
le_t2_total: .space 96
        .endif
cw_in:  .space 16                               | the 8 parameter words of the last call
cw_out: .space 8                                | frame words +2, +4, +6, +8
        .space  1                               | frame byte +162
        .space  1                               | bits 1 and 2 of frame byte +165
cw_valid: .space 1
        .balign 2
ns_zero: .space 2                               | stream buffer 0, 1: all zero
ns_other: .space 1                              | stands in for a buffer that is neither: cleared before each test
        .balign 4
sm_conv: .space 13                              | a track's 42 words: at rest
sm_rr:  .space 1                                | the group watched this block, 13 (track 0) .. 1 (track 12)
        .balign 4
        .if     LE_VERIFY
smv_state: .space 2288
smv_par: .space 1144
vdv_blk: .space 2048                            | the own loop's DAC words
vdv_g:  .space 64                               | the 8 gain pairs as found
vdv_c:  .space 32                               | the own loop's 8 gains
cwv_el: .space 1
        .balign 4
        .endif

        .text

        | ------------------------------------------------------------------------------------------------
        .if     LE_NSC
        .globl  le_ns_gate, le_ns_dirty
        .balign 16
le_ns_gate:                                        | a4 buffer, d2 frames to clear, d3 frames asked for
        lea     ns_zero,%a0
        move.l  %a4,%d0
        sub.l   #LE_U0,%d0
        beq.s   1f
        addq.l  #1,%a0
        cmp.l   #1536,%d0
        beq.s   1f
        addq.l  #1,%a0                          | not one of the two buffers (no such caller): a byte
        clr.b   (%a0)                           |   that is cleared here, so the clear is always done
1:      tst.l   %d2
        ble.s   5f                              | nothing to clear: stream frames fill the buffer
        sub.l   %d2,%d3                         | as stock: frames left for the stream
        bne.s   3f                              | stream frames follow the cleared ones
        moveq   #32,%d0
        cmp.l   %d0,%d2
        bne.s   3f
        tst.b   (%a0)
        beq.s   6f
        .if     LE_VERIFY
        total   68
        move.l  %a4,%a0                         | the buffer must be zero where the clear would be left out
        move.l  #384,%d0
7:      tst.l   (%a0)+
        bne.s   8f
        subq.l  #1,%d0
        bne.s   7b
        bra.s   4f
8:      total   52
        bra.s   4f
        .else
        total   0
        jmp     LE_NS_RESUME                       | all zero already
        .endif
6:      moveq   #1,%d0
        move.b  %d0,(%a0)
        total   4
        bra.s   4f
3:      clr.b   (%a0)
        total   8
4:      move.l  %d2,%d1                         | 48 bytes a frame
        move.l  %d2,%d0
        lsl.l   #4,%d0
        lsl.l   #6,%d1
        sub.l   %d0,%d1
        move.l  %d1,-(%sp)
        move.l  %a4,-(%sp)
        jsr     LE_MEMSET
        addq.l  #8,%sp
        jmp     LE_NS_RESUME
5:      clr.l   %d2                             | as stock
        clr.b   (%a0)
        total   8
        jmp     LE_NS_RESUME

le_ns_dirty:                                       | the other path's clear (0x4011fc6c): it writes the buffers
        clr.w   ns_zero                         |   after it (0x4011fcf8, 0x4011fd02): both marks off
        total   12
        jmp     LE_MEMSET
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_VDC
        .globl  le_vd_gate
        .balign 16
le_vd_gate:                                        | 4(sp) the DAC block
        move.l  LE_FEF4,%d0
        moveq   #1,%d1
        cmp.l   %d1,%d0
        jbhi    vd_stock
        lea     ns_zero,%a0
        tst.b   (%a0,%d0.l)
        jbeq    vd_stock
        move.l  LE_VD_TAB,%d0
        or.l    LE_VD_TAB+4,%d0
        and.l   #0x80808080,%d0
        jbne    vd_stock
        .if     LE_VERIFY
        total   92
        lea     LE_G_PAIRS,%a0
        lea     vdv_g,%a1
        moveq   #16,%d0
1:      move.l  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne.s   1b
        pea     vdv_blk
        bsr     vd_own
        addq.l  #4,%sp
        lea     LE_G_PAIRS,%a0                     | keep the own loop's gains, put the found ones back
        lea     vdv_g,%a1
        moveq   #16,%d0
2:      move.l  (%a0),%d1
        move.l  (%a1),(%a0)+
        move.l  %d1,(%a1)+
        subq.l  #1,%d0
        bne.s   2b
        move.l  4(%sp),-(%sp)
        bsr     vd_stock
        addq.l  #4,%sp
        lea     LE_G_PAIRS,%a0
        lea     vdv_g,%a1
        moveq   #16,%d0
3:      move.l  (%a0)+,%d1
        cmp.l   (%a1)+,%d1
        bne.s   6f
        subq.l  #1,%d0
        bne.s   3b
        move.l  4(%sp),%a0
        lea     vdv_blk,%a1
        moveq   #32,%d0
4:      move.l  %d2,-(%sp)
        moveq   #8,%d2
5:      move.l  (%a0)+,%d1
        cmp.l   (%a1)+,%d1
        bne.s   7f
        subq.l  #1,%d2
        bne.s   5b
        move.l  (%sp)+,%d2
        lea     32(%a0),%a0
        lea     32(%a1),%a1
        subq.l  #1,%d0
        bne.s   4b
        rts
7:      move.l  (%sp)+,%d2
6:      total   88
        rts
        .else
        total   80
        .endif
vd_own: lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        move.l  48(%sp),%fp
        lea     LE_VD_A0,%a0
        lea     LE_G_PAIRS,%a1
        lea     LE_VD_A2,%a2
        lea     LE_VD_A3,%a3
        move.l  #0xa0,%macsr
        move.l  #0x80000000,%d1
        move.l  (%a2)+,%d7
        moveq   #8,%d2
1:      move.l  (%a1)+,%d6                      | gain: target, current
        move.l  (%a1),%d3
        sub.l   %d3,%d6
        asr.l   #5,%d6
        move.l  %fp,%a4
        moveq   #32,%d4
2:      msac.l  %d1,%d7,(%a3)+,%d7,%acc0        | + A2
        msac.l  %d1,%d7,(%a0)+,%d7,%acc0        | + A3
        msac.l  %d3,%d7,(%a2)+,%d7,%acc0        | - g x A0
        add.l   %d6,%d3
        movclr.l %acc0,%d5
        lsr.l   #8,%d5
        move.l  %d5,(%a4)
        lea     64(%a4),%a4
        subq.l  #1,%d4
        bne.s   2b
        move.l  %d3,(%a1)+
        addq.l  #4,%fp
        subq.l  #1,%d2
        bne.s   1b
        move.l  #0x20,%macsr
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     44(%sp),%sp
        rts
vd_stock:
        total   84
        lea     -68(%sp),%sp                    | the two instructions the site replaced
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     LE_VD_BODY
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_CMW
        .globl  le_cw_memo
        .balign 16
le_cw_memo:                                        | 4(sp) frame, 8(sp) the 8 parameter words
        move.l  %acc0,%d0
        move.l  %acc1,%d1
        or.l    %d1,%d0
        move.l  %accext01,%d1
        or.l    %d1,%d0
        jbne    cw_unclean
        move.l  %macsr,%d0
        and.l   #0xf0,%d0
        moveq   #0x20,%d1
        cmp.l   %d1,%d0
        jbne    cw_unclean
        move.l  8(%sp),%a0
        lea     cw_in,%a1
        .rept   4
        move.l  (%a0)+,%d0
        cmp.l   (%a1)+,%d0
        jbne    cw_slow
        .endr
        tst.b   10(%a1)                         | cw_valid
        jbeq    cw_slow
        .if     LE_VERIFY
        moveq   #1,%d0
        move.b  %d0,cwv_el
        jbra    cw_call
        .else
        move.l  4(%sp),%a0
        move.w  (%a1)+,2(%a0)
        move.w  (%a1)+,4(%a0)
        move.w  (%a1)+,6(%a0)
        move.w  (%a1)+,8(%a0)
        move.b  (%a1)+,162(%a0)
        mvz.b   165(%a0),%d0
        moveq   #-7,%d1
        and.l   %d1,%d0
        mvz.b   (%a1),%d1
        or.l    %d1,%d0
        move.b  %d0,165(%a0)
        total   16
        rts
        .endif
cw_slow:
        .if     LE_VERIFY
        clr.b   cwv_el
        .endif
        total   20
cw_call:
        move.l  8(%sp),%a0
        lea     cw_in,%a1
        move.l  (%a0)+,(%a1)+
        move.l  (%a0)+,(%a1)+
        move.l  (%a0)+,(%a1)+
        move.l  (%a0)+,(%a1)+
        move.l  8(%sp),-(%sp)
        move.l  8(%sp),-(%sp)
        jsr     LE_CW_STOCK
        addq.l  #8,%sp
        move.l  4(%sp),%a0
        lea     cw_out,%a1
        .if     LE_VERIFY
        tst.b   cwv_el
        beq.s   2f
        total   72
        mvz.b   165(%a0),%d0
        moveq   #6,%d1
        and.l   %d1,%d0
        mvz.b   9(%a1),%d1
        cmp.l   %d1,%d0
        bne.s   1f
        mvz.b   162(%a0),%d0
        mvz.b   8(%a1),%d1
        cmp.l   %d1,%d0
        bne.s   1f
        move.l  2(%a0),%d0
        cmp.l   (%a1),%d0
        bne.s   1f
        move.l  6(%a0),%d0
        cmp.l   4(%a1),%d0
        beq.s   2f
1:      total   56
2:
        .endif
        move.w  2(%a0),(%a1)+
        move.w  4(%a0),(%a1)+
        move.w  6(%a0),(%a1)+
        move.w  8(%a0),(%a1)+
        move.b  162(%a0),(%a1)+
        mvz.b   165(%a0),%d0
        moveq   #6,%d1
        and.l   %d1,%d0
        move.b  %d0,(%a1)+
        moveq   #1,%d0
        move.b  %d0,(%a1)
        rts
cw_unclean:
        clr.b   cw_valid
        total   24
        jmp     LE_CW_STOCK
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_SMO
        .balign 16
        | a1 targets, a2 states, a5 words out; d2 0x8000, d6 0.97, d7 0.03 (upper word). Uses d0, d1, d3, d4,
        | a1, a2, a5; ACC0 and ACC1 are added into and left clear, as stock.
sm_core:
        lea     -16(%sp),%sp
        movem.l %d5/%a3,8(%sp)
        lea     sm_conv,%a3
        mvz.b   13(%a3),%d0                     | the group watched in this block
        bne.s   2f
        moveq   #13,%d0
2:      move.l  %d0,(%sp)
        subq.l  #1,%d0
        move.b  %d0,13(%a3)
        move.l  %macsr,%d0
        and.l   #0xf0,%d0
        moveq   #0x20,%d1
        cmp.l   %d1,%d0
        beq.s   1f
        clr.l   (%a3)                           | another mode: no group counts as at rest,
        clr.l   4(%a3)
        clr.l   8(%a3)
        clr.b   12(%a3)
        clr.l   (%sp)                           |   and none is watched
        total   48
1:
        moveq   #13,%d3                         | the 26 words in front of the tracks
        bsr     sm_full
        moveq   #13,%d0
        move.l  %d0,4(%sp)
sm_group:
        tst.b   (%a3)+
        jbne    sm_fast
        moveq   #21,%d3
        move.l  4(%sp),%d0
        cmp.l   (%sp),%d0
        beq.s   sm_obs
        bsr     sm_full
        total   32
sm_next:
        subq.l  #1,4(%sp)
        bne.s   sm_group
        movem.l 8(%sp),%d5/%a3
        lea     16(%sp),%sp
        rts

sm_obs: clr.l   %d5                             | the update, and whether it changed a state
1:      move.l  (%a1)+,%d0
        mac.w   %d7u,%d0u,(%a2),%d1,%acc0
        mac.w   %d7u,%d0l,4(%a2),%d4,%acc1
        mac.l   %d6,%d1,%acc0
        mac.l   %d6,%d4,%acc1
        movclr.l %acc0,%d0
        sub.l   %d0,%d1
        or.l    %d1,%d5
        move.l  %d0,(%a2)+
        movclr.l %acc1,%d1
        sub.l   %d1,%d4
        or.l    %d4,%d5
        move.l  %d1,(%a2)+
        add.l   %d2,%d0
        add.l   %d2,%d1
        swap    %d1
        move.w  %d1,%d0
        move.l  %d0,(%a5)+
        subq.l  #1,%d3
        bne.s   1b
        total   36
        tst.l   %d5
        bne.s   sm_next
        moveq   #1,%d0
        move.b  %d0,-1(%a3)
        total   44
        bra.s   sm_next

sm_fast:
        moveq   #7,%d3
1:
        .irp    k,0,1,2
        move.l  (%a2)+,%d1
        add.l   %d2,%d1
        move.l  (%a2)+,%d4
        add.l   %d2,%d4
        swap    %d4
        move.w  %d4,%d1
        cmp.l   (%a1)+,%d1
        jbne    sm_miss\k
        move.l  %d1,(%a5)+
        .endr
        subq.l  #1,%d3
        bne.s   1b
        total   28
        jbra    sm_next
sm_miss2:
        moveq   #2,%d0
        bra.s   2f
sm_miss1:
        moveq   #1,%d0
        bra.s   2f
sm_miss0:
        clr.l   %d0
2:      move.l  %d3,%d1                         | words left in the group: 3 x passes left - place in the pass
        add.l   %d3,%d3
        add.l   %d1,%d3
        sub.l   %d0,%d3
        subq.l  #8,%a2
        subq.l  #4,%a1
        clr.b   -1(%a3)
        total   40
        bsr     sm_full
        jbra    sm_next

sm_full:                                        | d3 pairs of words
1:      move.l  (%a1)+,%d0
        mac.w   %d7u,%d0u,(%a2),%d1,%acc0
        mac.w   %d7u,%d0l,4(%a2),%d4,%acc1
        mac.l   %d6,%d1,%acc0
        mac.l   %d6,%d4,%acc1
        movclr.l %acc0,%d1
        movclr.l %acc1,%d4
        move.l  %d1,(%a2)+
        move.l  %d4,(%a2)+
        add.l   %d2,%d1
        add.l   %d2,%d4
        swap    %d4
        move.w  %d4,%d1
        move.l  %d1,(%a5)+
        subq.l  #1,%d3
        bne.s   1b
        rts

        .if     LE_VERIFY
        .globl  le_smv_pre, le_smv_post
le_smv_pre:                                        | from 0x40120d1c: keep the states as stock's loop finds them
        lea     LE_STATE,%a0
        lea     smv_state,%a1
        move.l  #572,%d3
1:      move.l  (%a0)+,(%a1)+
        subq.l  #1,%d3
        bne.s   1b
        lea     LE_TGT,%a0                         | as at the site
        move.l  %a0,%a1
        move.l  -(%a5),%d1                      | the two instructions the site replaced
        move.l  #572,%d3
        jmp     LE_SM_LOOP
le_smv_post:                                       | from 0x40120d4e: stock's loop is done but for its last store
        move.l  %d1,(%a5)+                      | the first of the three instructions the site replaced
        lea     -16(%sp),%sp
        movem.l %a0-%a2/%a5,(%sp)
        lea     LE_TGT,%a1
        lea     smv_state,%a2
        lea     smv_par,%a5
        bsr     sm_core
        total   76
        lea     LE_STATE,%a0
        lea     smv_state,%a1
        move.l  #572,%d3
1:      move.l  (%a0)+,%d0
        cmp.l   (%a1)+,%d0
        bne.s   2f
        subq.l  #1,%d3
        bne.s   1b
        bra.s   3f
2:      total   60
3:      lea     LE_PAR,%a0
        lea     smv_par,%a1
        move.l  #286,%d3
4:      move.l  (%a0)+,%d0
        cmp.l   (%a1)+,%d0
        bne.s   5f
        subq.l  #1,%d3
        bne.s   4b
        bra.s   6f
5:      total   64
6:      movem.l (%sp),%a0-%a2/%a5
        lea     16(%sp),%sp
        clr.l   %d3                             | as stock's loop leaves it
        moveq   #52,%d0                         | the other two
        addq.l  #4,%sp
        jmp     LE_SM_AFTER
        .else
        .globl  le_sm_run
le_sm_run:                                         | from 0x40120d1c: a1 = LE_TGT, a2 = LE_STATE, a5 = LE_PAR
        bsr     sm_core
        move.l  (%a1)+,%d0                      | d0 and a1 as stock's loop leaves them (it loads one
        clr.l   %d3                             |   long past the targets); d3 too
        jmp     LE_SM_END
        .endif
        .endif
