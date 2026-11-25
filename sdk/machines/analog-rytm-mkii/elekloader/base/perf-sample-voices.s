        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base, the lean engine (Nathaniel Pavel), the sample voices: skip the sample engine's interpolation and
        | decimation for a voice that has nothing to play.
        |
        | Stock OS 1.74's sample engine (0x4011c6b8, once an audio block) runs, for each of its 8 voices, a 6-tap
        | interpolation to 64 samples, a 2:1 decimation to 32 and a gain ramp, also for a voice that plays
        | nothing: such a voice is fed a window of zeros. On the author's MKII the whole routine measured 15.1
        | points of the block (CM02, 17 Nov 2026).
        |
        | A voice is skipped only when all of this holds, tested each block:
        |   - its active flag (record + 40) is clear;
        |   - its 12 filter state longs (record + 44 .. + 91) are zero;
        |   - every word the interpolation would read from its fetched window is zero;
        |   - the EMAC accumulators and their extensions hold zero, as stock always leaves them here, and as the
        |     lean engine's other skips leave them (each is taken only with them clear, or leaves them as found:
        |     set review, 20 Nov 2026) (review R1:
        |     the first interpolated value and the gain stage's first output add to what ACC0 and ACC2 hold).
        | Then the interpolation's 64 results are zero, the decimation's 32 results and its new state are zero,
        | and the only other thing the two loops leave behind is the play position, which is 64 steps of the
        | rate added to the phase. So: the phase is computed in closed form and stored by stock's own three
        | stores (0x4011ccb6), the decimation's 32 output longs are set to zero (0x8000e1d0), and stock's gain
        | stage (0x4011ce5e) runs as ever on those zeros: it stores the gain and writes the voice's 32 output
        | zeros itself. Nothing else that the two loops would have written is used later: their scratch at
        | 0x8000e260..0x8000e41f is written again before it is used (the next voice reads 0x8000e31c only to
        | store it straight back), and the record's state stays zero.
        |
        | Sites (base.json): 0x4011cc08 (8 B) -> le_dsk_interp, 0x4011cd46 (6 B) -> le_dsk_decim, and in the LE_VERIFY
        | build 0x4011cf5e (8 B) -> le_dsk_tail.
        |
        | LE_FETCH = 1 adds the second part (S1b): no transfer of zeros. While voice v is worked on, stock fetches
        | voice v + 1's window with two eDMA transfers (their descriptors at [0x80005820] and [0x80005824]:
        | source +0, 16 bytes a pass +8, destination +16, passes in the low 9 bits of the word +20) into an SRAM
        | buffer, and waits for each to finish. For a voice with nothing to play the source is the silence region
        | 0x4f9372e0 (0x160 bytes that stock clears once, at 0x4011c132, and that nothing else names; the sample
        | pool ends below it, 0x4009dc24). On the author's MKII the engine still measured 9.9 points with all 8
        | voices skipped by the first part: the handler waits for those transfers with nothing left to compute.
        | At the two places where stock starts a transfer (0x4011cbba for the first descriptor, 0x4011cd30 for
        | the second; voices 1 to 7: voice 0's are started elsewhere and left alone), a descriptor whose source
        | is exactly the silence region, with 16 bytes a pass and at most 22 passes (0x160 bytes), is not
        | started: its destination range is set to zero here, the "running" flag stays clear, so stock's own
        | wait is not entered, and the "programmed" flag is cleared as the start would. The decision reads the
        | descriptor as it stands, after any module has changed it (Improved SMPL points a turning loop's
        | transfer at its mirror buffer: that source is not the silence region, so it is fetched as ever).
        | Sites: 0x4011cbba (6 B) -> le_dsf_a, 0x4011cd30 (6 B) -> le_dsf_b.
        | Also required, so that the patch tests what it assumes about a descriptor: unit sizes and source step
        | as stock sets them once (+4: 0x0401, 16), destination step 2 (+22), and the count word's upper bits as
        | stock writes them every pass (0xC000 for the first, 0xBE00 for the second: the channel linked to itself).
        | The zeros are written as longs on a long boundary (a destination at 2 mod 4 gets a word first and last).
        | LE_VERIFY with LE_FETCH: every transfer is started as stock does, and what it wrote is checked to be zero
        | where stock leaves it in the window: the two destination ranges overlap, and stock saves the first
        | transfer's words of the overlap before it starts the second and puts them back after it (0x4011cd10,
        | 0x4011cbe4). So the first transfer's range is checked whole before the second starts (in le_dsf_b, or in
        | le_dsk_decim when no second one starts), and the second's from its start up to where the put-back begins
        | ([0x8000583c] words, read when it starts), in le_dsk_interp of the voice it was for.
        | Counters: [14] transfers not started (LE_VERIFY: that would not have been), [15] LE_VERIFY differences of
        | those ranges; since boot: le_dsk_total [2] the differences, [3] the transfers.
        |
        | LE_TRIM = 1 (needs LE_FETCH) adds the third part: write and test nothing that is known to be zero already,
        | and skip stock's gain loop for a skipped voice.
        |   Windows. The two window buffers (0x80005880, 0x800059e0, 176 words each) are fetched in turn. For
        |   a voice with nothing to play stock fetches words 0..71 with the second transfer and 72..143 with
        |   the first. dsz_bits keeps, within one block, "this half of this buffer holds zeros": set when such a
        |   half was zeroed here (the low half only when stock has nothing to put back into the window,
        |   [0x80005840] <= 0); all cleared when any transfer is really started, and at the end of the block
        |   (le_dsg, voice 7), so nothing written between blocks (voice 0's transfers, 0x4011c1e0) matters. A half
        |   that is known to hold zeros is not zeroed again. (Not testing such a window again in le_dsk_interp was
        |   tried and taken out: an idle voice's test reads a few longs, the shortcut cost more than it saved.)
        |   What stock writes into a window besides the transfers is its
        |   put-back (0x4011cbe4): the words it saved from the same places before the second transfer
        |   (0x4011cd10), so it cannot make a half nonzero that held zeros before that transfer.
        |   Gain. After a skipped voice the decimation's output would be 32 zeros, so stock's gain loop
        |   (0x4011cf32, 16 passes) writes 32 zeros to the voice's output (0x800067f8 + 128 * voice) whatever the
        |   gains are, provided ACC2 and ACC3 hold nothing, and leaves all four accumulators clear. The site
        |   0x4011cec6 (6 B: `mvz.w 6(a1),d0 ; swap d0`, after stock has stored the voice's new gain) -> le_dsg:
        |   for a skipped voice with ACC2, ACC3 and their extension clear, ACC0 and ACC1 are cleared, the 32
        |   output longs are zeroed unless dsz_out says they still are (set here, cleared whenever stock's loop
        |   runs for that voice; nothing else writes that buffer: its other user, the mixer 0x4010ea98, reads),
        |   and stock resumes after the loop (0x4011cf5e). The decimation's output is then not zeroed at all
        |   (its only reader is that loop); if the accumulators are not clear it is zeroed and the loop runs.
        |   LE_VERIFY with LE_TRIM: nothing is skipped; wherever the real build would rely on "still zero" (a
        |   window half, an output buffer) the bytes are tested at that moment and differences counted.
        |   le_dsk_total [4] window halves not zeroed, [5] unused, [6] gain loops skipped, [7] output
        |   buffers not zeroed (LE_VERIFY: that would not be), [8] LE_VERIFY differences of this part (also in [15]).
        |
        | 18 Nov 2026: until this date every accumulator test here was `move.l %accN,%d0 ; bne`, and a move from
        | an accumulator does not set the condition codes: the branch followed the flags of the instruction
        | before (never taken in the real builds, always taken in le_dsg's LE_VERIFY build, which is how the unit run
        | of SV05 showed it: 0 gain loops counted). So SK01 and SK03 ran without those tests; what they were
        | meant to enforce held anyway as far as anyone could see (stock clears all four accumulators at the
        | handler's entry and after every use). Each test now has its `tst.l`.
        | LE_VERIFY = 1: nothing is skipped. Stock runs all of it; for a voice that would have been skipped the
        | module checks what stock produced against what the skip assumes (phase, position, 64 interpolated
        | longs zero, state zero, 32 output longs zero) and counts every difference.
        | Counters (the telemetry base's mw_tl_diag, page 7, a second each): [8] voices skipped (LE_VERIFY: that
        | would have been), [9] inactive voices kept for nonzero state, [10] kept for a nonzero window,
        | [11] LE_VERIFY differences (must stay 0), [12] active voices, [13] kept for a nonzero accumulator.
        | le_dsk_total: [0] LE_VERIFY differences, [1] voices skipped, both since boot and never cleared (read them
        | over the link: the page's counters are cleared as they are sent and could lose a count).
        | LE_COUNT = 0 (the standalone build, for an image without the telemetry base): no counters at all, so
        | nothing of the measuring base is imported. Every instruction is the same as with LE_COUNT = 1 (the
        | default, and what the measured images SK06 / SV06 were built with) except the counters and four
        | branches that only jumped over a counter (review data/standalone-review.md: no defect).
        .ifndef LE_COUNT
        .set    LE_COUNT, 0
        .endif
        .if     LE_VERIFY && !LE_COUNT
        .error  "the self-check build reports through its counters"
        .endif
        .if     LE_COUNT
        .equ    DIAG, mw_tl_diag
        .extern mw_tl_diag
        .endif
        .macro  diag off
        .if     LE_COUNT
        addq.l  #1,DIAG+\off
        .endif
        .endm
        .macro  total off
        .if     LE_COUNT
        addq.l  #1,le_dsk_total+\off
        .endif
        .endm

        .bss
        .balign 4
dsk_pred: .space 12                             | LE_VERIFY: phase, samples advanced, position after
dsk_flag: .space 1                              | this voice is being skipped (LE_VERIFY: would have been)
        .balign 4
        .if     LE_COUNT
        .globl  le_dsk_total
le_dsk_total: .space 40
        .endif
        .if     LE_TRIM
dsz_bits: .space 1                              | bit 0, 1: 0x80005880's low and high half hold zeros; 2, 3: 0x800059e0's
dsz_out: .space 1                               | bit v: voice v's output buffer holds zeros
        .balign 4
        .endif
        .if     LE_VERIFY
dsf_a_pend: .space 8                            | first transfer's range, to check before the second starts: address, words
dsf_b_next: .space 8                            | second transfer's range for the next voice: address, words
dsf_b_cur: .space 8                             | ... for the voice now worked on
        .endif

        .text
        .globl  le_dsk_interp, le_dsk_decim
        .balign 16
| Site 0x4011cc08: `move.l 36(a3),d0 ; lea (a0,d0.l*2),a0`. a3 = the voice's record, a0 = its fetched window.
| Stock writes d0-d7, a1, a2, a4-a6 again before it reads them; a0 and a3 are kept here.
le_dsk_interp:
        .if     LE_VERIFY && LE_FETCH
        movea.l dsf_b_cur,%a1                   | this voice's second transfer was waited for at 0x4011cb40
        move.l  dsf_b_cur+4,%d0
        beq.s   22f
21:     tst.w   (%a1)+
        bne.s   23f
        subq.l  #1,%d0
        bne.s   21b
        bra.s   22f
23:     diag    60
        total   8
22:
        .endif
        tst.b   40(%a3)
        bne     5f                              | active
        lea     44(%a3),%a1
        move.l  (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        or.l    (%a1)+,%d0
        bne     6f                              | filter state not zero
        move.l  %acc0,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     4f
        move.l  %acc2,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     4f
        move.l  %accext01,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     4f
        move.l  %accext23,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     4f
        | Stock: d2 = rate >> 28 (whole step), d5 = rate << 4 (fraction step), d3 = phase (record + 28),
        | d1 = 0; one add before the loop, one in each of 64 passes, one taken back after: 64 steps of the
        | 64-bit (d2:d5) added to (d1:d3).
        move.l  12(%a3),%d5
        move.l  %d5,%d2
        moveq   #28,%d0
        asr.l   %d0,%d2
        lsl.l   #4,%d5
        move.l  28(%a3),%d3
        move.l  %d5,%d1
        moveq   #26,%d0
        lsr.l   %d0,%d1                         | high long of 64 * fraction step
        move.l  %d2,%d0
        lsl.l   #6,%d0
        add.l   %d0,%d1                         | + 64 * whole step
        move.l  %d5,%d0
        lsl.l   #6,%d0
        moveq   #0,%d4
        add.l   %d0,%d3                         | d3 = the phase after
        addx.l  %d4,%d1                         | d1 = samples advanced (signed)
        | The words the interpolation reads: 12 bytes at window + 2 * position for every position from 0 to
        | d1 (the position only moves one way within a block).
        move.l  36(%a3),%d0
        lea     (%a0,%d0.l*2),%a2
        tst.b   42(%a3)
        beq.s   1f
        lea     252(%a2),%a2
1:      move.l  %d1,%d0
        bpl.s   2f
        lea     (%a2,%d1.l*2),%a2
        neg.l   %d0
2:      cmpi.l  #512,%d0
        bhi     7f                              | not a step stock plays: leave it to stock
        addq.l  #7,%d0
        lsr.l   #1,%d0                          | longs: covers 2 * |d1| + 12 bytes (+ 14 when |d1| is odd)
3:      tst.l   (%a2)+
        bne     7f
        subq.l  #1,%d0
        bne.s   3b
        diag    32
        total   4
        .if     LE_VERIFY
        move.l  %d3,dsk_pred
        move.l  %d1,dsk_pred+4
        add.l   4(%a3),%d1
        move.l  %d1,dsk_pred+8
        moveq   #1,%d0
        move.b  %d0,dsk_flag
        bra.s   9f
        .else
        moveq   #1,%d0
        move.b  %d0,dsk_flag
        addq.l  #4,%sp                          | no return to the site
        jmp     LE_STORE_PHASE                     | stock: record + 28 = d3, + 32 = d1, + 4 += d1
        .endif
        .if     LE_COUNT
4:      diag    52
        bra.s   9f
5:      diag    48
        bra.s   9f
6:      diag    36
        bra.s   9f
7:      diag    40
        .else
4:
5:
6:
7:
        .endif
9:      move.l  36(%a3),%d0                     | the site's own two instructions
        lea     (%a0,%d0.l*2),%a0
        rts

        .balign 16
| Site 0x4011cd46: `lea 44(a3),a0 ; move.l a0,-(sp)`, the decimation's start. Stock loads d0 and a1 next.
le_dsk_decim:
        .if     LE_VERIFY && LE_FETCH
        bsr     dsf_check_a                     | no second transfer was started in this pass: check the first now
        move.l  dsf_b_next,%d0                  | what was fetched in this pass is the next voice's window
        move.l  %d0,dsf_b_cur
        move.l  dsf_b_next+4,%d0
        move.l  %d0,dsf_b_cur+4
        clr.l   dsf_b_next+4
        .endif
        tst.b   dsk_flag
        beq.s   8f
        .if     LE_VERIFY
        move.l  28(%a3),%d0
        cmp.l   dsk_pred,%d0
        bne.s   4f
        move.l  32(%a3),%d0
        cmp.l   dsk_pred+4,%d0
        bne.s   4f
        move.l  4(%a3),%d0
        cmp.l   dsk_pred+8,%d0
        bne.s   4f
        lea     LE_INTERP_OUT,%a0
        moveq   #64,%d0
1:      tst.l   (%a0)+
        bne.s   4f
        subq.l  #1,%d0
        bne.s   1b
        bra.s   8f
4:      diag    44
        total   0
        .else
        .if     !LE_TRIM
        clr.b   dsk_flag
        lea     LE_DECIM_OUT,%a0
        moveq   #32,%d0
1:      clr.l   (%a0)+
        subq.l  #1,%d0
        bne.s   1b
        .endif                                  | LE_TRIM: le_dsg takes the flag and decides
        addq.l  #4,%sp                          | no return to the site
        jmp     LE_GAIN_STAGE
        .endif
8:      movea.l (%sp)+,%a1                      | the site's own two instructions, then back
        lea     44(%a3),%a0
        move.l  %a0,-(%sp)
        jmp     (%a1)

        .if     LE_VERIFY
        .globl  le_dsk_tail
        .balign 16
| Site 0x4011cf5e: `moveq #92,d3 ; moveq #8,d4 ; addq.l #1,88(sp)`, after the gain stage; 88(sp) is the voice.
le_dsk_tail:
        tst.b   dsk_flag
        beq.s   8f
        clr.b   dsk_flag
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        lea     44(%a3),%a1
        moveq   #12,%d0
1:      tst.l   (%a1)+
        bne.s   4f
        subq.l  #1,%d0
        bne.s   1b
        move.l  16+4+88(%sp),%d0                | the voice, not yet counted on
        lsl.l   #7,%d0
        addi.l  #LE_VOICE_OUT,%d0
        movea.l %d0,%a1
        moveq   #32,%d0
2:      tst.l   (%a1)+
        bne.s   4f
        subq.l  #1,%d0
        bne.s   2b
        bra.s   5f
4:      diag    44
        total   0
5:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
8:      moveq   #92,%d3
        moveq   #8,%d4
        addq.l  #1,4+88(%sp)
        rts
        .endif

        .if     LE_FETCH
        .equ    SILENCE, 0x4f9372e0
        .if     LE_VERIFY
| The first transfer's range, whole, once it has been waited for (0x4011ccc2) and before the second one can
| write into the overlap. Uses d0 and a1.
dsf_check_a:
        move.l  dsf_a_pend+4,%d0
        beq.s   3f
        movea.l dsf_a_pend,%a1
        clr.l   dsf_a_pend+4
1:      tst.w   (%a1)+
        bne.s   2f
        subq.l  #1,%d0
        bne.s   1b
        rts
2:      diag    60
        total   8
3:      rts
        .endif
| A transfer's start: the site is `movea.l <descriptor pointer>,a0`, and stock then writes 1 to +30 (start),
| sets the running flag and clears the programmed flag. d0 and a1 are written again by stock before it reads
| them, on both ways out (0x4011cbc0 / 0x4011cbd0, 0x4011cd36 / 0x4011cd46); a0 too after the resume address.
| second = 0: the first descriptor (0x4011cbba); 1: the second (0x4011cd30).
        .macro  fetch name, tcdptr, progflag, resume, linkbits, second
        .globl  \name
        .balign 16
\name:
        .if     LE_VERIFY && \second
        bsr     dsf_check_a
        .endif
        movea.l \tcdptr,%a0                     | the site's own instruction
        movea.l (%a0),%a1
        cmpa.l  #SILENCE,%a1
        bne     9f                              | a real source
        moveq   #16,%d0
        cmp.l   8(%a0),%d0
        bne     9f                              | not 16 bytes a pass
        move.l  4(%a0),%d0
        cmpi.l  #0x04010010,%d0
        bne     9f                              | not 16-byte reads, 16-bit writes, source step 16
        move.l  20(%a0),%d0                     | count word, destination step
        subi.l  #\linkbits+2,%d0
        swap    %d0                             | = the passes, if the link bits and the step are stock's
        beq     9f
        cmpi.l  #22,%d0
        bhi     9f                              | past the 0x160 bytes stock keeps at zero, or other bits
        movea.l 16(%a0),%a1                     | the destination
        diag    56
        total   12
        .if     LE_TRIM
        cmpi.l  #9,%d0
        bne.s   47f                             | not an idle voice's 72 words
        move.l  %a1,%d0
        subi.l  #QBUF+144*(1-\second),%d0
        beq.s   41f
        subi.l  #PBUF-QBUF,%d0
        bne.s   46f                             | not a half of a buffer
        moveq   #3-\second,%d0                  | the bit: 0x800059e0's high half (first transfer) or low half
        bra.s   42f
41:     moveq   #1-\second,%d0                  | 0x80005880's
42:
        .if     LE_VERIFY
        lea     -12(%sp),%sp
        movem.l %d1/%a0/%a2,(%sp)
        lea     dsz_bits,%a0
        btst    %d0,(%a0)
        beq.s   44f
        total   16                 | the real build writes nothing here: it must hold zeros now
        movea.l %a1,%a2
        moveq   #36,%d1
43:     tst.l   (%a2)+
        bne.s   48f
        subq.l  #1,%d1
        bne.s   43b
        bra.s   45f
48:     diag    60
        total   32
        bra.s   45f
44:
        .if     \second
        tst.l   0x80005840
        bgt.s   45f                             | stock will put words back into this half: claim nothing
        .endif
        bset    %d0,(%a0)
45:     movem.l (%sp),%d1/%a0/%a2
        lea     12(%sp),%sp
        .else
        lea     dsz_bits,%a0
        btst    %d0,(%a0)
        bne.s   49f                             | holds zeros already: write nothing
        .if     \second
        tst.l   0x80005840
        bgt.s   46f                             | stock will put words back into this half: zero it, claim nothing
        .endif
        bset    %d0,(%a0)
        lea     144(%a1),%a0
43:     clr.l   (%a1)+                          | 36 longs; both halves start on a long boundary
        cmpa.l  %a0,%a1
        bcs.s   43b
        bra.s   2f
49:     total   16
        bra.s   2f
        .endif
46:     moveq   #9,%d0
47:
        .endif
        .if     LE_VERIFY
        lsl.l   #3,%d0                          | words
        .if     \second
        cmp.l   0x8000583c,%d0                  | stock puts the first transfer's saved words back from here on
        bls.s   1f
        move.l  0x8000583c,%d0
1:      move.l  %a1,dsf_b_next
        move.l  %d0,dsf_b_next+4
        .else
        move.l  %a1,dsf_a_pend
        move.l  %d0,dsf_a_pend+4
        .endif
        rts                                     | stock starts it
        .else
        lsl.l   #4,%d0                          | bytes
        lea     (%a1,%d0.l),%a0                 | the end
        move.l  %a1,%d0
        btst    #1,%d0
        beq.s   1f
        clr.w   (%a1)+                          | to a long boundary
        subq.l  #2,%a0
1:      clr.l   (%a1)+
        cmpa.l  %a0,%a1
        bcs.s   1b
        btst    #1,%d0
        beq.s   2f
        clr.w   (%a1)
2:      clr.b   \progflag                       | as the start does; the running flag stays clear: no wait
        addq.l  #4,%sp                          | no return to the site
        jmp     \resume
        .endif
9:
        .if     LE_TRIM
        clr.b   dsz_bits                        | a transfer is really started: nothing is known any more
        .endif
        rts
        .endm

        .equ    QBUF, 0x80005880
        .equ    PBUF, 0x800059e0
        fetch   le_dsf_a, 0x80005820, 0x80005828, 0x4011cbd0, 0xC0000000, 0
        fetch   le_dsf_b, 0x80005824, 0x8000582a, 0x4011cd46, 0xBE000000, 1
        .endif

        .if     LE_TRIM
        .globl  le_dsg
        .balign 16
| Site 0x4011cec6: `mvz.w 6(a1),d0 ; swap d0`, in the gain stage after the new gain is stored (0x4011ceb8).
| a5 = the voice, fp = its output buffer, a1 = its track's record. d0 and a0 are written again by stock
| before it reads them (a0 at 0x4011cf16); after 0x4011cf5e stock reads nothing the loop left.
le_dsg:
        moveq   #7,%d0
        cmp.l   %a5,%d0
        bne.s   1f
        clr.b   dsz_bits                        | the block's last voice: the windows are not known past here
1:      tst.b   dsk_flag
        beq.s   7f                              | not a skipped voice
        .if     !LE_VERIFY
        clr.b   dsk_flag
        .endif
        move.l  %acc2,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne.s   5f
        move.l  %acc3,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne.s   5f
        move.l  %accext23,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne.s   5f
        total   24
        .if     LE_VERIFY
        move.l  %a5,%d0
        lea     dsz_out,%a0
        bset    %d0,(%a0)
        beq.s   8f                              | the real build zeroes it now
        total   28                 | it writes nothing: the buffer must hold zeros now
        movea.l %fp,%a0
        moveq   #32,%d0
2:      tst.l   (%a0)+
        bne.s   3f
        subq.l  #1,%d0
        bne.s   2b
        bra.s   8f
3:      diag    60
        total   32
        bra.s   8f
5:
        .else
        movclr.l %acc0,%d0                      | stock's loop leaves all four clear
        movclr.l %acc1,%d0
        move.l  %a5,%d0
        lea     dsz_out,%a0
        bset    %d0,(%a0)
        .if     LE_COUNT
        bne.s   3f                              | still zeros from an earlier block
        .else
        bne.s   4f                              | still zeros from an earlier block
        .endif
        movea.l %fp,%a0
        moveq   #32,%d0
2:      clr.l   (%a0)+
        subq.l  #1,%d0
        bne.s   2b
        .if     LE_COUNT
        bra.s   4f
3:      total   28
        .endif
4:      addq.l  #4,%sp                          | no return to the site
        jmp     LE_TAIL
5:      lea     LE_DECIM_OUT,%a0                   | accumulators not clear: give stock's loop its zeros
        moveq   #32,%d0
6:      clr.l   (%a0)+
        subq.l  #1,%d0
        bne.s   6b
        .endif
7:      move.l  %a5,%d0                         | stock's loop writes this voice's output
        lea     dsz_out,%a0
        bclr    %d0,(%a0)
8:      mvz.w   6(%a1),%d0                      | the site's own two instructions
        swap    %d0
        rts
        .endif

