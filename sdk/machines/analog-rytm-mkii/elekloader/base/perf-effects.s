        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base, the lean engine (Nathaniel Pavel), the effects: do not compute the send mixer, the delay
        | and the reverb where the result is known to be zero. Stock OS 1.74, audio interrupt, once a block of 32
        | frames. Stock runs all three in full in every block (the three measured 16.4 points of the block on
        | the author's MKII, CM02, 17 Nov 2026). With LE_QUIET = 0 nothing here changes a value stock would
        | have produced: each part acts only when what stock would compute is zero by its own arithmetic, tested
        | in that block. The release build sets LE_QUIET = 1: the delay and the reverb then also rest after use,
        | the one place where output words differ from stock's, by less than -114 dBFS (below).
        | LE_VERIFY = 1 and LE_COUNT = 1 are test builds: they need sites and symbols that base.json does not carry
        | (TESTING.md says how they were built).
        |
        | LE_MIX = 1. The send mixer (in 0x4010e6bc). For each of the 2 sends stock first computes, for its 8
        | voice slots, a ramp step (target - gain) >> 5 for the left and the right gain (0x4010e6f4, left as it
        | is), then for 32 frames adds gain * input word for all 8 slots in two accumulators and steps the gains
        | (0x4010e764..0x4010e7aa). A slot whose two gains and two steps are all zero adds exactly zero to both
        | sums and its gains stay zero. le_fxr_mix (from 0x4010e75e, in place of that loop) lists the slots that have
        | work and runs the same sum over those only, in the same order (so a saturation, if any, falls where it
        | does in stock); with none it writes the 64 zeros; with 6 or more it hands back to stock's loop, which is
        | then the shorter one. The accumulators are clear here: stock's ramp loop ends each pass with MOVCLR of
        | both.
        |
        | LE_DLY = 1. The delay (0x4010da24). Its set-up (0x4010da2c..0x4010db12) stores what it derives from the
        | FX parameters (0x8000e008..0x8000e018) and is left to run. le_fxr_delay (from 0x4010db14) then tests, in
        | this block: the filter state (0x8000e11c, 4 longs), the input gate's state (0x8000dff0, 6 longs), the
        | send buffer as it stands after any module added to it (0x80007a44, 64 longs; Audio In Routing adds at
        | the delay's entry, before this), both fetched windows whole (2 x 272 bytes at [0x8000ddb0]; the
        | crossfade's last pass adds window B's 65th word into ACC2, which the filter loop then starts from), and
        | accumulators 1 to 3 with their extensions (stock adds into them without clearing first; ACC0 was
        | cleared at 0x4010daf8). With all of that zero, stock's four loops up to 0x4010dd6c produce: scratch
        | 0x8000e01c zero, the window buffer zero (it goes back to the ring), the delay's output 0x80007c44
        | zero, filter and gate state zero, the send buffer unchanged (zero), all four accumulators clear.
        | So those loops are jumped: the 12 bytes the set-up pushed are dropped and stock goes on at 0x4010dd6e,
        | its last loop, which runs as ever on the zeros (it steps the four input gains at 0x8000ca00 and stores
        | them). The output buffer and the scratch are set to zero once, on the first rested block (only the
        | delay itself writes them: 0x4010da2c, 0x4010db1a are the only places that name them for writing,
        | and the delay's init 0x4010de92 clears the scratch).
        |
        | LE_REV = 1. The reverb (0x4010d434). Its set-up (to 0x4010d542: values derived from the parameters, the 8
        | allpass gains) is left to run, and so is its modulation step (0x4010d7ee..0x4010d840), which moves on
        | every block. le_fxr_rev1 (from 0x4010d544) tests: the input filter (0x8000cd08, 2 longs), the four tank
        | filter sets (0x8000ccbc, 16 longs), the buffer one block hands the next (0x8000cb10, 32 longs: loop E
        | reads it before it writes it), the input 0x80007b44 (64 longs, after stock added the delay's output)
        | and every byte the 17 fetched line windows can occupy (0x8000d1e0..0x8000dd0f). All accumulators are
        | clear at that place (the allpass-gain loop ends with MOVCLR of all four). With all of that zero every
        | product in the reverb's loops has a zero factor (the one constant put into an accumulator, -1.0 at
        | 0x4010d5d0, makes a coefficient that is then multiplied with line data), so the lines' new samples,
        | the output, the states and the hand-over buffer are zero. So the first six loops are jumped to
        | 0x4010d7ee, and le_fxr_rev2 (from 0x4010d842) jumps the other four to the function's end 0x4010da1a.
        | The windows are written back to the rings by stock's transfer as fetched: zero.
        | Not testing the windows: every ring is written 128 bytes a block at a pointer that advances 128 bytes
        | (0x4010e83c, 0x4010e870), the longest ring is 64 KiB, and the transfers wrap inside each ring (their
        | descriptors' modulo: fetches 0x4010e082, 0x4010e0c8; writes back 0x4010e14c, 0x4010e1a4). After 512 rested blocks in a row every ring holds only
        | zeros, so every later fetch brings zeros, for as long as the rests go on: from then the window test
        | is left out. One block that is not rested starts the count again. (The rings' only other writer is the
        | clear at 0x4010dfd8.) The loops' scratch (0x8000ca10..0x8000cb0f, 0x8000cb90..0x8000cc0f,
        | 0x8000cc38..0x8000ccbb) is set to zero on the first rested block, as stock would leave it.
        | While the windows are still tested, the test waits for the fetch chain's last transfer to be done
        | (TCD30's DONE bit, at most 127 looks; without it the block is not rested): stock itself only waits
        | until that transfer is loaded, and reads its line late in the function.
        |
        | LE_QUIET = 0: once sound has passed through the delay or the reverb, their state does not come back to
        | zero in stock (emulator, 18 Nov 2026: the truncating filters settle on values of a few hundred in
        | 2^31), so with LE_QUIET = 0 these two rest from power-on until their first use and not again, and no
        | output word differs from stock's.
        |
        | LE_QUIET = 1 (the default; the author, 19 Nov 2026: part of the base set). What is said above about
        | setting buffers to zero and about the 512 rested blocks is LE_QUIET = 0's (LE_QUIET = 1 sets only the
        | delay's output to zero, once for a run of rests); with LE_QUIET = 1 the delay and the reverb also rest
        | after use, as follows. This is the one place where output words differ from
        | stock's: by what stock itself leaves when idle, words of the size of QT (2^LE_QBITS of 2^31) at most.
        | For each of the two a count of quiet blocks in a row (fxr_dq, fxr_rq; 0 at power-on and after every
        | block that is not quiet), counted to the ring's length in blocks, DHOLD or RHOLD. (So after power-on
        | stock runs for that long on its zeros first: nothing is assumed about what the rings hold at boot.)
        | A block is quiet when the input is exactly zero (and for the delay the gate state and ACC1..3, as
        | before), and the filter states, the hand-over buffer and the fetched window words lie in
        | -QT..QT-1 (the reverb: every word the windows can occupy; the delay: the 65 of each window its first
        | loop reads). While the count runs, stock runs in full. What stock writes to a ring in a quiet block
        | is made of quiet words only, with a loop gain under 1 for the delay (tested, below: a written word
        | is then about 2 QT at most, the high-pass) and of 1 at most for the reverb as far as seen (its
        | coefficients are not read; at DEC 127 its tail held level without growing in the emulator, two
        | settings), and a ring is written through once in its length: when the count is full every word of every ring is small, wherever the taps
        | move to later. From then, for as long as the input stays exactly zero, the loops are jumped as above
        | and the output is zero. Nothing else is written: the states stay as they are, and stock's own
        | transfers go on writing the fetched windows back, so the rings keep what stock left, moved about but
        | never amplified (the delay's last loop takes 1 from a positive word in each pass). (A first version
        | set states and rings to zero. Stock can build a tone out of what it has left when the delay's
        | feedback is raised with no input; from zeros it cannot. Second review, R1.) A block with input ends
        | the rest: stock runs on what it left.
        | The delay's loop (read in the listing): crossfade weights that sum to [e008] (0.01 + 0.914 * drive)
        | while it is steady, three soft-clip stages of slope 2 at most each, the make-up gain [e00c], a shift
        | by 4, a low-pass of gain 2 at DC and a high-pass of at most 1, then -[e018] (feedback / 127). So
        | 256 * [e008] * [e00c] * |[e018]| is an upper bound of its gain: 1.96 x feedback with no drive, 1 at
        | FDBK 65 of 127 (the emulator agrees: 64 dies away, 90 does not). The delay counts and rests only
        | while that figure is under DGMAX / 256 = 0.9 and none of the three words changed since the last
        | tested block (a change, an LFO on feedback or drive too, starts the count again); otherwise stock runs as ever, at rest too. (So above FDBK 58 with no drive, down to FDBK 24
        | at full drive, the delay never rests; nor does the reverb then, if the delay feeds it.)
        | From power-on until the first input nothing differs from stock even so: all of it is zero.
        |
        | LE_VERIFY = 1 (needs LE_COUNT): nothing is skipped. Each part decides as above, stock runs in full, and what
        | stock produced is compared with what the skip would have left: the mixer's result and gains at
        | 0x4010e7b6 (le_fxr_mix_chk), the delay's at its end 0x4010de34 (le_fxr_dly_chk), the reverb's at its end
        | 0x4010da1a (le_fxr_rev_chk, in place of le_fxr_rev2's use of that address; le_fxr_rev2 passes through).
        |
        | LE_COUNT = 1: counters since boot in le_fxr_total (longs): +0 mixer passes with no slot, +4 with 1..5, +8
        | handed to stock, +12 delay blocks rested (LE_VERIFY: that would have been), +16 not, +20 reverb rested,
        | +24 not, +28 reverb rested without the window test; LE_VERIFY: +32 delay differences, +36 reverb
        | differences, +40 mixer differences (its check sits at the top of stock's wait loop, so one difference can count more than
        | once), +44 windows not zero in a block rested without the window test; +48 the last fetch was not done
        | within the wait; LE_QUIET: +52 the delay's count came full (a rest after use, or the first after
        | power-on), +56 the reverb's; +28 is not used then.
        |
        | ColdFire: a move from an accumulator, its extension or MACSR leaves the condition codes alone, so each
        | is followed by TST. MOVEA, LEA, ADDA and ADDQ to an address register leave them alone too.

        .ifndef LE_MIX
        .set    LE_MIX, 1
        .endif
        .ifndef LE_DLY
        .set    LE_DLY, 1
        .endif
        .ifndef LE_REV
        .set    LE_REV, 1
        .endif
        .ifndef LE_VERIFY
        .set    LE_VERIFY, 0
        .endif
        .ifndef LE_COUNT
        .set    LE_COUNT, 0
        .endif
        .ifndef LE_QUIET
        .set    LE_QUIET, 1
        .endif
        .ifndef LE_QBITS
        .set    LE_QBITS, 12                       | QT = 4096 of 2^31: 16 steps of a 24-bit word, -114 dB of full scale
        .endif
        .set    QT, 1 << LE_QBITS
        .set    DHOLD, 16384 + 64               | the delay's ring: 4 MiB, 256 bytes a block
        .set    RHOLD, 512 + 8                  | the reverb's longest ring: 64 KiB, 128 bytes a block
        .set    DGMAX, 230                      | the delay's loop gain bound, 0.9, in 256ths of 16 fraction bits
        .if     LE_QBITS > 28
        .error  "LE_QBITS: the threshold test needs 2 * QT well inside 32 bits"
        .endif
        .if     LE_VERIFY && LE_QUIET
        .error  "the self-check compares with stock, which the after-use rest leaves: build it with LE_QUIET=0"
        .endif
        .if     LE_VERIFY && !LE_COUNT
        .error  "the self-check build reports through its counters"
        .endif

        .macro  total off
        .if     LE_COUNT
        addq.l  #1,le_fxr_total+\off
        .endif
        .endm
        | 8 longs at (\reg)+ all zero? If not, go to \fail. Uses d0.
        .macro  scan8 reg, fail
        move.l  (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        or.l    (\reg)+,%d0
        bne     \fail
        .endm
        | \groups x 8 longs at (\reg)+ all zero? Uses d0, d1.
        .macro  scan reg, groups, fail
        moveq   #\groups,%d1
.Lsc\@: scan8  \reg, \fail
        subq.l  #1,%d1
        bne.s   .Lsc\@
        .endm
        | 8 longs at (\reg)+ all in -QT..QT-1? If not, go to \fail. Needs d4 = QT, d5 = -2 * QT. Uses d0, d3.
        | x + QT is in 0..2*QT-1 exactly for those x, and an OR of such words has no bit above them.
        .macro  quiet8 reg, fail
        move.l  (\reg)+,%d0
        add.l   %d4,%d0
        .rept   7
        move.l  (\reg)+,%d3
        add.l   %d4,%d3
        or.l    %d3,%d0
        .endr
        and.l   %d5,%d0
        bne     \fail
        .endm
        | \groups x 8 longs. Uses d0, d1, d3.
        .macro  quiet reg, groups, fail
        moveq   #\groups,%d1
.Lqu\@: quiet8 \reg, \fail
        subq.l  #1,%d1
        bne.s   .Lqu\@
        .endm
        | One long. Uses d0.
        .macro  quiet1 reg, fail
        move.l  (\reg)+,%d0
        add.l   %d4,%d0
        and.l   %d5,%d0
        bne     \fail
        .endm
        .macro  qconst
        move.l  #QT,%d4
        move.l  #-2*QT,%d5
        .endm
        | \groups x 8 longs at (\reg)+ set to zero. Uses d1.
        .macro  zero reg, groups
        moveq   #\groups,%d1
.Lze\@: clr.l  (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        clr.l   (\reg)+
        subq.l  #1,%d1
        bne.s   .Lze\@
        .endm

        .bss
        .balign 4
fxr_list: .space 64                             | the mixer's slots with work: gain pair address, input word offset
fxr_rz: .space 4                                | reverb: rested blocks in a row, counted to 512
fxr_dz: .space 1                                | delay: output and scratch were set to zero for this run of rests
fxr_rzd: .space 1                               | reverb: scratch was set to zero for this run of rests
fxr_rr: .space 1                                | reverb: this block is rested (le_fxr_rev2 reads it)
fxr_vd: .space 1                                | LE_VERIFY: the delay would have rested in this block
fxr_vr: .space 1                                | LE_VERIFY: the reverb would have rested in this block
fxr_vm: .space 2                                | LE_VERIFY: the mixer's own result for send 0, 1 is there to compare
        .balign 4
        .if     LE_QUIET
fxr_dp: .space 12                               | delay: the last block's [e008], [e00c], [e018]
fxr_dq: .space 4                                | delay: quiet blocks in a row, counted to DHOLD; at DHOLD it rests
fxr_rq: .space 4                                | reverb: the same, to RHOLD
        .endif
        .if     LE_COUNT
        .globl  le_fxr_total
le_fxr_total: .space 60
        .endif
        .if     LE_VERIFY
fxr_vg: .space 128                              | the mixer's own gains after the pass, 2 sends x 8 pairs
fxr_vo: .space 512                              | the mixer's own result, 2 sends x 32 frames
        .endif

        .text

        | ------------------------------------------------------------------------------------------------
        .if     LE_MIX
        | From 0x4010e75e (6 bytes: move.l d3,d1 / move.l d3,d0 / lsl.l #6,d1), once for each send.
        | In: d3 = send (0, 1), d7 = the 16 ramp steps (0x419c9f58), 56(sp) = stock's argument, the input
        | frames (12 longs each; the 8 slots' words are 2..9). Stock needs d3, d4, d7, a4, a5 kept; it loads
        | d0-d2, d5, d6, a0-a3 and fp again before it uses them. Leaves to 0x4010e7ac, or to stock's loop.
        .globl  le_fxr_mix
        .balign 16
le_fxr_mix:
        move.l  %d3,%d0
        lsl.l   #6,%d0
        add.l   #LE_GAINS,%d0
        movea.l %d0,%a1                         | this send's 8 gain pairs
        .if     LE_VERIFY
        lea     fxr_vm,%a0
        clr.b   (%a0,%d3.l)
        move.l  %d3,%d0
        lsl.l   #6,%d0
        add.l   #fxr_vg,%d0
        movea.l %d0,%a2
        moveq   #16,%d1
1:      move.l  (%a1)+,(%a2)+                   | work on a copy of the gains: stock's loop does the real ones
        subq.l  #1,%d1
        bne.s   1b
        movea.l %d0,%a1
        .endif
        move.l  %d7,%d6
        sub.l   %a1,%d6                         | from a slot's gain pair to its two steps
        movea.l %d7,%a0
        lea     fxr_list,%a2
        moveq   #8,%d1                          | the slot's input word in a frame: 8 + 4 * slot
        moveq   #0,%d2
1:      move.l  (%a1),%d0
        or.l    4(%a1),%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        beq.s   2f
        move.l  %a1,(%a2)+
        move.l  %d1,(%a2)+
        addq.l  #1,%d2
2:      addq.l  #8,%a1
        addq.l  #4,%d1
        moveq   #40,%d0
        cmp.l   %d1,%d0
        bne.s   1b
        .if     LE_VERIFY
        move.l  %d3,%d0
        lsl.l   #8,%d0
        add.l   #fxr_vo,%d0
        .else
        move.l  %d3,%d0
        lsl.l   #8,%d0
        add.l   #LE_SEND0,%d0
        .endif
        movea.l %d0,%a3                         | where the 32 frames go
        tst.l   %d2
        bne.s   3f
        total   0
        zero    %a3, 8
        bra.s   8f
3:      moveq   #5,%d1
        cmp.l   %d2,%d1
        bcs.s   9f                              | 6 or more: stock's loop
        total   4
        add.l   #256,%d0
        move.l  %d0,-(%sp)                      | where they end
        lsl.l   #3,%d2
        lea     fxr_list,%fp
        adda.l  %d2,%fp                         | the list's end
        movea.l 60(%sp),%a2
4:      lea     fxr_list,%a0
5:      movea.l (%a0)+,%a1
        move.l  (%a0)+,%d2
        movem.l (%a1),%d0-%d1
        move.l  (%a2,%d2.l),%d5
        mac.l   %d0,%d5,%acc0
        mac.l   %d1,%d5,%acc1
        add.l   (%a1,%d6.l),%d0
        add.l   4(%a1,%d6.l),%d1
        movem.l %d0-%d1,(%a1)
        cmpa.l  %fp,%a0
        bne.s   5b
        lea     48(%a2),%a2
        movclr.l %acc0,%d0
        move.l  %d0,(%a3)+
        movclr.l %acc1,%d0
        move.l  %d0,(%a3)+
        cmpa.l  (%sp),%a3
        bne.s   4b
        addq.l  #4,%sp
8:
        .if     LE_VERIFY
        lea     fxr_vm,%a0
        moveq   #1,%d0
        move.b  %d0,(%a0,%d3.l)
        bra.s   10f
        .else
        addq.l  #4,%sp
        jmp     LE_MIX_DONE
        .endif
9:      total   8
10:     addq.l  #4,%sp
        move.l  %d3,%d1                         | the three instructions the call replaced
        move.l  %d3,%d0
        lsl.l   #6,%d1
        jmp     LE_MIX_STOCK

        .if     LE_VERIFY
        | From 0x4010e7b6 (6 bytes: move.w 0xfc0453de,d0), after both sends were mixed by stock.
        | d0-d2, a0-a2 are free here.
        .globl  le_fxr_mix_chk
        .balign 16
le_fxr_mix_chk:
        moveq   #0,%d2
1:      lea     fxr_vm,%a0
        tst.b   (%a0,%d2.l)
        beq.s   4f
        move.l  %d2,%d0
        lsl.l   #8,%d0
        movea.l %d0,%a0
        movea.l %d0,%a1
        adda.l  #fxr_vo,%a0
        adda.l  #LE_SEND0,%a1
        moveq   #64,%d1
2:      move.l  (%a0)+,%d0
        cmp.l   (%a1)+,%d0
        bne.s   3f
        subq.l  #1,%d1
        bne.s   2b
        move.l  %d2,%d0
        lsl.l   #6,%d0
        movea.l %d0,%a0
        movea.l %d0,%a1
        adda.l  #fxr_vg,%a0
        adda.l  #LE_GAINS,%a1
        moveq   #16,%d1
2:      move.l  (%a0)+,%d0
        cmp.l   (%a1)+,%d0
        bne.s   3f
        subq.l  #1,%d1
        bne.s   2b
        bra.s   4f
3:      total   40
4:      addq.l  #1,%d2
        moveq   #2,%d0
        cmp.l   %d2,%d0
        bne.s   1b
        move.w  0xfc0453de,%d0                  | the instruction the call replaced
        rts
        .endif
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_DLY
        | From 0x4010db14 (6 bytes: movea.l 0x8000ddb0,a0), after the delay's set-up. On the stack: the return,
        | the 3 longs the set-up pushed, stock's frame. Stock holds d6, d7, a2, a5 here and loads every other
        | register again before it uses it.
        .globl  le_fxr_delay
        .balign 16
le_fxr_delay:
        .if     LE_QUIET
        | Exactly zero, or stock runs: the gate's state, ACC1..3 with their extensions, the input.
        lea     LE_DLY_GATE,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne     9f
        move.l  %acc1,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     9f
        move.l  %acc2,%d0
        tst.l   %d0
        bne     9f
        move.l  %acc3,%d0
        tst.l   %d0
        bne     9f
        move.l  %accext01,%d0
        tst.l   %d0
        bne     9f
        move.l  %accext23,%d0
        tst.l   %d0
        bne     9f
        lea     LE_SEND0,%a0
        scan    %a0, 8, 9f
        | The feedback loop's largest gain for a small signal, 256 * [e008] * [e00c] * |[e018]| (see the
        | header), must be under DGMAX / 256, in the block's own values, at rest too: above that stock can
        | build a tone out of what it has left, and must be left to.
        | The loops ramp from the last block's three values to this block's, and two of them move in opposite
        | directions with the drive, so a block in which one of them changed since the last block that came
        | this far is not quiet either (third review, R2). (The first counted block after input can still
        | ramp; its ring words are written again before the count is full, and what a tap reads is tested.)
        lea     LE_DLY_PAR,%a0                     | 0x8000e008: drive, 0x8000e00c: make-up, 0x8000e018: -feedback
        lea     fxr_dp,%a1
        move.l  (%a0),%d0
        move.l  4(%a0),%d1
        move.l  16(%a0),%d3
        cmp.l   (%a1),%d0
        bne.s   7f
        cmp.l   4(%a1),%d1
        bne.s   7f
        cmp.l   8(%a1),%d3
        beq.s   6f
7:      move.l  %d0,(%a1)+
        move.l  %d1,(%a1)+
        move.l  %d3,(%a1)
        bra     9f
6:      moveq   #15,%d1
        tst.l   %d0
        bmi     9f
        lsr.l   %d1,%d0                         | 16 fraction bits
        move.l  4(%a0),%d3
        bmi     9f
        lsr.l   %d1,%d3
        mulu.l  %d3,%d0                         | both under 2^16: no overflow
        clr.w   %d0
        swap    %d0
        move.l  16(%a0),%d3
        neg.l   %d3                             | -1.0 stays 0x80000000, read as unsigned below
        lsr.l   %d1,%d3                         | 0..65536; a positive [e018] reads as 65536 or more
        cmpi.l  #65536,%d3
        bhi     9f
        mulu.l  %d3,%d0
        clr.w   %d0
        swap    %d0
        cmpi.l  #DGMAX,%d0
        bcc     9f
        lea     fxr_dq,%a1
        move.l  (%a1),%d0
        cmpi.l  #DHOLD,%d0
        bcc     2f                              | at rest already
        | Not yet: is this block quiet? The filter's state and both windows within -QT..QT-1.
        qconst
        lea     LE_DLY_FLT,%a0
        move.l  (%a0)+,%d0
        add.l   %d4,%d0
        .rept   3
        move.l  (%a0)+,%d3
        add.l   %d4,%d3
        or.l    %d3,%d0
        .endr
        and.l   %d5,%d0
        bne     9f
        | The 65 longs of each window that stock's loops read (0x4010db20..0x4010dbaa); the last 3 of a window
        | are never read or written back, and its last 2 are not always fetched again (third review, N5).
        movea.l LE_DLY_PTR,%a0
        quiet   %a0, 8, 9f
        quiet1  %a0, 9f
        lea     12(%a0),%a0                     | window B, 272 bytes after A
        quiet   %a0, 8, 9f
        quiet1  %a0, 9f
        lea     fxr_dq,%a1
        addq.l  #1,(%a1)
        move.l  (%a1),%d0
        cmpi.l  #DHOLD,%d0
        bcs     8f                              | the ring is not written through yet: stock runs
        total   52
2:      total   12
        lea     fxr_dz,%a0
        tst.b   (%a0)
        bne.s   1f
        move.b  #1,(%a0)
        lea     LE_DLY_OUT,%a0
        zero    %a0, 8                          | the output: silent. Filter, windows and ring stay as they are
1:      lea     16(%sp),%sp                     | the return and the set-up's 3 longs
        jmp     LE_DLY_TAIL
9:      lea     fxr_dq,%a0
        clr.l   (%a0)
8:      total   16
        lea     fxr_dz,%a0
        clr.b   (%a0)
        movea.l LE_DLY_PTR,%a0                     | the instruction the call replaced
        rts
        .else
        lea     LE_DLY_FLT,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne     9f
        lea     LE_DLY_GATE,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne     9f
        move.l  %acc1,%d0
        tst.l   %d0                             | a move from an accumulator leaves the condition codes alone
        bne     9f
        move.l  %acc2,%d0
        tst.l   %d0
        bne     9f
        move.l  %acc3,%d0
        tst.l   %d0
        bne     9f
        move.l  %accext01,%d0
        tst.l   %d0
        bne     9f
        move.l  %accext23,%d0
        tst.l   %d0
        bne     9f
        lea     LE_SEND0,%a0
        scan    %a0, 8, 9f
        movea.l LE_DLY_PTR,%a0
        scan    %a0, 17, 9f                     | both windows, 2 x 272 bytes, one after the other
        total   12
        .if     LE_VERIFY
        lea     fxr_vd,%a0
        move.b  #1,(%a0)
        bra.s   10f
        .else
        lea     fxr_dz,%a0
        tst.b   (%a0)
        bne.s   1f
        move.b  #1,(%a0)
        lea     LE_DLY_OUT,%a0
        zero    %a0, 8
        lea     LE_DLY_TMP,%a0
        zero    %a0, 8
1:      lea     16(%sp),%sp                     | the return and the set-up's 3 longs
        jmp     LE_DLY_TAIL
        .endif
9:      total   16
        .if     !LE_VERIFY
        lea     fxr_dz,%a0
        clr.b   (%a0)
        .endif
10:     movea.l LE_DLY_PTR,%a0                     | the instruction the call replaced
        rts

        .endif

        .if     LE_VERIFY
        | From 0x4010de34 (8 bytes: movem.l (sp),d2-d7/a2-fp / lea 68(sp),sp), the delay's end; a jump.
        .globl  le_fxr_dly_chk
        .balign 16
le_fxr_dly_chk:
        lea     fxr_vd,%a0
        tst.b   (%a0)
        beq     2f
        clr.b   (%a0)
        lea     LE_DLY_OUT,%a0
        scan    %a0, 8, 1f
        lea     LE_DLY_TMP,%a0
        scan    %a0, 8, 1f
        lea     LE_SEND0,%a0
        scan    %a0, 8, 1f
        movea.l LE_DLY_PTR,%a0
        scan    %a0, 8, 1f                      | what goes back to the ring
        lea     LE_DLY_FLT,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne.s   1f
        lea     LE_DLY_GATE,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne.s   1f
        move.l  %acc0,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc1,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc2,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc3,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %accext01,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %accext23,%d0
        tst.l   %d0
        beq.s   2f
1:      total   32
2:      movem.l (%sp),%d2-%d7/%a2-%fp           | the two instructions the jump replaced, and stock's rts
        lea     68(%sp),%sp
        rts
        .endif
        .endif

        | ------------------------------------------------------------------------------------------------
        .if     LE_REV
        | Every byte the fetched line windows can occupy: 9 x 176 from 0x8000d1f0, 8 x 160 from 0x8000d820 (the
        | last 16 of the eighth hold other words, 0x8000dd10), and the 16 below the first (a fetch lands up to
        | 12 bytes below its buffer). 716 longs. Uses d0, d1, a0.
        .macro  lines fail
        lea     LE_REV_LINES,%a0
        scan    %a0, 89, \fail
        move.l  (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        or.l    (%a0)+,%d0
        bne     \fail
        .endm
        | The states and the input. Uses d0, d1, a0.
        .macro  revstate fail
        lea     LE_REV_FLT,%a0
        move.l  (%a0)+,%d0
        or.l    (%a0),%d0
        bne     \fail
        lea     LE_REV_ST,%a0
        scan    %a0, 2, \fail
        lea     LE_REV_IN,%a0
        scan    %a0, 8, \fail
        lea     LE_REV_FB,%a0
        scan    %a0, 4, \fail
        .endm

        | From 0x4010d544 (6 bytes: movea.l #0x8000d1f0,a5), after the reverb's set-up. Stock loads every
        | register again from here on before it uses it; the stack is the function's frame.
        .globl  le_fxr_rev1
        .balign 16
le_fxr_rev1:
        .if     LE_QUIET
        lea     LE_REV_IN,%a0
        scan    %a0, 8, 9f                      | the input: exactly zero, or stock runs
        lea     fxr_rq,%a1
        move.l  (%a1),%d0
        cmpi.l  #RHOLD,%d0
        bcc     2f                              | at rest already
        | Not yet: is this block quiet? States, hand-over buffer and every window word within -QT..QT-1.
        qconst
        lea     LE_REV_FLT,%a0
        move.l  (%a0)+,%d0
        add.l   %d4,%d0
        move.l  (%a0),%d3
        add.l   %d4,%d3
        or.l    %d3,%d0
        and.l   %d5,%d0
        bne     9f
        lea     LE_REV_ST,%a0
        quiet   %a0, 2, 9f
        lea     LE_REV_FB,%a0
        quiet   %a0, 4, 9f
        | The windows are fetched as one chain of transfers; stock (0x4010e7b6) waits only until the chain's
        | last one, line 8's, is loaded, and reads that line late. Here it is read at once, so wait for that
        | transfer's DONE bit (review R1); if it does not come soon the block was not tested, and the count
        | starts again (second review, D1).
        moveq   #127,%d1
4:      move.w  LE_DMA_CSR,%d0
        btst    #7,%d0
        bne.s   5f
        subq.l  #1,%d1
        bne.s   4b
        total   48
        bra     9f
5:      lea     LE_REV_LINES,%a0
        quiet   %a0, 89, 9f
        move.l  (%a0)+,%d0
        add.l   %d4,%d0
        .rept   3
        move.l  (%a0)+,%d3
        add.l   %d4,%d3
        or.l    %d3,%d0
        .endr
        and.l   %d5,%d0
        bne     9f
        addq.l  #1,(%a1)
        move.l  (%a1),%d0
        cmpi.l  #RHOLD,%d0
        bcs     8f                              | the rings are not written through yet: stock runs
        total   56
        | At rest: the output is the input buffer, which is zero. States, hand-over buffer, windows and rings
        | stay as they are.
2:      total   20
        lea     fxr_rr,%a0
        move.b  #1,(%a0)
        addq.l  #4,%sp
        jmp     LE_REV_LFO
9:      lea     fxr_rq,%a0
        clr.l   (%a0)
8:      total   24
        lea     fxr_rr,%a0
        clr.b   (%a0)
        movea.l #LE_REV_L0,%a5                     | the instruction the call replaced
        rts
        .else
        revstate 9f
        lea     fxr_rz,%a1
        move.l  (%a1),%d0
        cmpi.l  #512,%d0
        bcc     1f
        | The windows are fetched as one chain of transfers; stock (0x4010e7b6) waits only until the chain's
        | last one, line 8's, is loaded, and reads that line late. Here it is read at once, so wait for that
        | transfer's DONE bit (review R1); if it does not come soon, do not rest.
        moveq   #127,%d1
4:      move.w  LE_DMA_CSR,%d0
        btst    #7,%d0
        bne.s   5f
        subq.l  #1,%d1
        bne.s   4b
        total   48
        bra     9f
5:      lines   9f
        addq.l  #1,(%a1)
        bra     2f
1:      total   28
        .if     LE_VERIFY
        lines   7f
        bra.s   2f
7:      total   44
        .endif
2:      total   20
        .if     LE_VERIFY
        lea     fxr_vr,%a0
        move.b  #1,(%a0)
        bra.s   10f
        .else
        lea     fxr_rr,%a0
        move.b  #1,(%a0)
        lea     fxr_rzd,%a0
        tst.b   (%a0)
        bne.s   3f
        move.b  #1,(%a0)
        lea     LE_REV_TMP,%a0
        zero    %a0, 8                          | 0x8000ca10..0x8000cb0f
        lea     128(%a0),%a0                    | over the hand-over buffer, which is zero
        zero    %a0, 4                          | 0x8000cb90..0x8000cc0f
        lea     LE_REV_TMP2-4,%a0
        clr.l   (%a0)+                          | 0x8000cc38: stock's allpass loop stores a zero there (0x4010d5f2)
        zero    %a0, 4                          | 0x8000cc3c..0x8000ccbb
3:      addq.l  #4,%sp
        jmp     LE_REV_LFO
        .endif
9:      total   24
        lea     fxr_rz,%a0
        clr.l   (%a0)
        .if     !LE_VERIFY
        lea     fxr_rzd,%a0
        clr.b   (%a0)
        lea     fxr_rr,%a0
        clr.b   (%a0)
        .endif
10:     movea.l #LE_REV_L0,%a5                     | the instruction the call replaced
        rts

        .endif

        | From 0x4010d842 (6 bytes: movea.l #0x8000d560,a0), after the modulation step. Stock holds d7 here.
        .globl  le_fxr_rev2
        .balign 16
le_fxr_rev2:
        .if     !LE_VERIFY
        lea     fxr_rr,%a0
        tst.b   (%a0)
        beq.s   1f
        addq.l  #4,%sp
        jmp     LE_REV_END
        .endif
1:      movea.l #LE_REV_L5,%a0                     | the instruction the call replaced
        rts

        .if     LE_VERIFY
        | From 0x4010da1a (8 bytes: movem.l (sp),d2-d7/a2-fp / lea 60(sp),sp), the reverb's end; a jump.
        .globl  le_fxr_rev_chk
        .balign 16
le_fxr_rev_chk:
        lea     fxr_vr,%a0
        tst.b   (%a0)
        beq     2f
        clr.b   (%a0)
        revstate 1f
        lines   1f
        lea     LE_REV_TMP,%a0
        scan    %a0, 16, 1f                     | 0x8000ca10..0x8000cc0f
        lea     LE_REV_TMP2-4,%a0
        tst.l   (%a0)+
        bne     1f
        scan    %a0, 4, 1f
        move.l  %acc0,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc1,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc2,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %acc3,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %accext01,%d0
        tst.l   %d0
        bne.s   1f
        move.l  %accext23,%d0
        tst.l   %d0
        beq.s   2f
1:      total   36
2:      movem.l (%sp),%d2-%d7/%a2-%fp           | the two instructions the jump replaced, and stock's rts
        lea     60(%sp),%sp
        rts
        .endif
        .endif
