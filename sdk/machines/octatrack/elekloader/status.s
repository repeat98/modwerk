| SPDX-License-Identifier: GPL-3.0-or-later
| The ColdFire's idle time (status.c): main runs the init list, then spins at 0x4001fc9c for good, and that
| spin is the idle task (Octabam's KERNEL.md: the lowest priority, run when nothing else wants the CPU).
        .text
        .global mw_idle, mw_ts_gate, mw_delay_idle, mw_delay_read0, mw_delay_read, mw_rec_update, mw_boot_restore

| 0x4001fb78, main's init: the power-up's battery restore of the current bank (diag.c modwerk_boot_restore, which
| calls stock's 0x40025770 itself). Displaced: jsr 0x40025770; stock goes on to 0x4001fb7e (bra 0x4001fb9e) whatever
| it returns. A C call keeps d2-d7/a2-a6, as stock's own routine does.
mw_boot_restore:
        jsr     modwerk_boot_restore
        jmp     0x4001fb7e

| 0x4001fc96, main's last init call. Displaced: jsr 0x40098a2c; this spin never returns to stock's (0x4001fc9c,
| left in place: ot_emu parks main there again after a bench call, its detoured-park convention).
| The spin adds up, in counts of the frame timer DTIM3, each pass nothing broke: a pass is far shorter than
| modwerk_idle_gap, so a longer gap is an interrupt or a task, busy time. DTIM3 runs free over all 32 bits
| (its reference reads 0xffffffff on the unit), so a difference is right across its wrap. d0-d2 are main's own.
mw_idle:
        jsr     0x40098a2c
        move.l  0xfc07c00c,%d2                  | DTCN3
1:      move.l  0xfc07c00c,%d0
        move.l  %d0,%d1
        sub.l   %d2,%d1
        move.l  %d0,%d2
        cmp.l   modwerk_idle_gap,%d1
        bhi.s   1b
        add.l   %d1,modwerk_idle_counts
        bra.s   1b

| 0x40098b2c, the time-stretch helper task (0x40098a5c, prio 1), per track right after it copied the voice
| to 44(sp). The frame posts it every frame, and for each playing track it runs the splice search 0x4009871c
| (each trig bumps voice +144) and the transient detector 0x400985ac, whatever the track's TSTR. The renderer
| reads the splice result only with time-stretch on and the markers only in BEAT, so a track whose resolved
| TSTR (voice +24 = 68(sp)) is OFF skips both. The trig's reset requests stay pending, so the first pass after
| TSTR is back on catches up as stock does after a jump. Found by Bryan T, mapped by Zac Kyoti.
| Displaced: movea.l (%a3),%a0 ; cmpa.l 188(%sp),%a0 ; beq.s 0x40098b5e.
mw_ts_gate:
        tst.b   68(%sp)
        beq.s   1f
        movea.l (%a3),%a0
        cmpa.l  188(%sp),%a0
        beq.s   2f
        jmp     0x40098b34
2:      jmp     0x40098b5e
1:      jmp     0x40098cc8                      | the next track

| The delay routine (0x400031a0, called once a frame from the frame transfer) reads two taps of every track's ring
| over the eDMA, filters them, mixes them with the track's audio and writes 128 bytes back to the ring, for all
| eight tracks every frame, whatever their FX2 and however silent the ring. On a unit that is 45 µs a frame, 43 of
| them the transfers (owner's MKII, 16 November 2026). A track whose ring and filter are silent and whose send is
| shut needs none of it: the taps would read silence, the filter would stay where it is, the ring would be written
| with silence, and only the dry gain reaches the audio. Three sites leave those transfers and loops out; mw_delay (status.c) holds
| [0] the routine's call count, [1 + track] the call that last passed the seam, [9 + track] the quiet frames,
| [17 + track] whether this frame's read was left out.
|
| Quiet frames: the seam counts a frame whose read brought silence in both taps (16 stereo samples each, in the
| scratch buffer and 160 bytes on) into a filter whose four state words are silent, with the send's gain zero at the
| frame's start and target: such a frame writes silence to the ring. DELAY_QUIET of them in a row (11,025 write the
| whole ring once) make the ring all silence, and nothing writes it after that but this routine's own path through
| the seam, or a module that takes the track at stock's seam before it (0x4000361a, Tape Echo, which reads the ring
| itself): a call that did not pass the seam starts the count again, so does any frame that is not quiet.
|
| Silence is every word within DELAY_FLOOR of zero, not zero itself: stock's filter never comes back to rest once a
| delay has been sent to. Its state sticks at a few hundred counts (-1,404 on a unit's default DELAY and in the A/B
| harness) and, with feedback, the ring keeps about one 24-bit step for good, which stock adds to the track at its wet
| level. 2,048 is -120.4 dBFS of the 32-bit sample words (8 steps of 24 bits; owner's call, 17 November 2026, after
| 680 left that -1,404 on stock's path). Leaving a quiet track out drops at most that much from its audio, and a send
| that opens on it starts from zero taps where stock would have read that much: not bit-identical, never audible. A
| filter stuck further out keeps stock's path.
        .equ    DELAY_QUIET, 16384
        .equ    DELAY_FLOOR, 2048
| a0 = words, d2 = how many. Answers equal when every word lies within DELAY_FLOOR of zero. Uses d1, d2, a0.
mw_delay_silent:
        move.l  (%a0)+,%d1
        addi.l  #DELAY_FLOOR,%d1
        cmpi.l  #2*DELAY_FLOOR,%d1
        bhi.s   9f                              | above the floor: not-equal (bhi: carry and zero clear)
        subq.l  #1,%d2
        bne.s   mw_delay_silent
9:      rts
| d1 = the track whose read is due. Marks it and answers not-equal when the read can be left out. Uses d0, a0.
mw_delay_quiet:
        lea     mw_delay,%a0
        lea     (%a0,%d1.l*4),%a0
        clr.l   68(%a0)
        move.l  mw_delay,%d0
        subq.l  #1,%d0
        cmp.l   4(%a0),%d0                      | it passed the seam on the last call
        bne.s   9f
        move.l  36(%a0),%d0
        cmpi.l  #DELAY_QUIET,%d0
        bcs.s   9f
        moveq   #1,%d0
        move.l  %d0,68(%a0)
        rts
9:      moveq   #0,%d0
        rts
| 0x4000332a, the first loop, track 0 only: the start of track 0's read, once a call.
| Displaced: move.l 0x80005f90,%d0. Kept: d2 (the second tap's address), a1.
mw_delay_read0:
        addq.l  #1,mw_delay
        moveq   #0,%d1
        bsr.s   mw_delay_quiet
        bne.s   1f
        .globl modwerk_stock_4000332a_6
modwerk_stock_4000332a_6:
        .space 6
        jmp     0x40003330
1:      jmp     0x40003382
| 0x400035ba, each track's pass but the last: the start of the next track's read.
| Displaced: movea.l 80(%sp),%a0 ; move.l 116(%a0),%d0.
mw_delay_read:
        move.l  112(%sp),%d1
        addq.l  #1,%d1
        bsr.s   mw_delay_quiet
        bne.s   1f
        .globl modwerk_stock_400035ba_8
modwerk_stock_400035ba_8:
        .space 8
        jmp     0x400035c2
1:      jmp     0x4000361a
| 0x4000362a, the seam: per track after the wait for its read and the next track's, before the filter.
| Free here: d1, d2, a0-a4 (stock loads them next), and on the short path d6, d7 too (the mix would use them up;
| the loop reloads them per track). Kept on the way to stock: d0, the scratch buffer stock is about to store.
| The accumulators are empty here, as stock's own filter needs them. Displaced: movea.l 0x80006180,%a4.
mw_delay_idle:
        move.l  112(%sp),%d1
        lea     mw_delay,%a1
        lea     (%a1,%d1.l*4),%a1               | +4 the seam's last call, +36 quiet frames, +68 no read
        move.l  mw_delay,%d1
        move.l  4(%a1),%d2
        move.l  %d1,4(%a1)
        addq.l  #1,%d2
        cmp.l   %d1,%d2
        beq.s   1f
        clr.l   36(%a1)                         | a call went by without this track
1:      tst.l   %d6                             | the send's gain, this frame's target
        bne.w   6f
        tst.l   60(%sp)                         | and where the last frame left it
        bne.w   6f
        tst.l   68(%a1)
        bne.w   2f
        movea.l 0x80006180,%a0                  | the track's filter record: state at +28..+40
        lea     28(%a0),%a0
        moveq   #4,%d2
        bsr.w   mw_delay_silent
        bne.w   7f
        movea.l %d0,%a0                         | the two taps
        moveq   #32,%d2
        bsr.w   mw_delay_silent
        bne.w   7f
        lea     32(%a0),%a0
        moveq   #32,%d2
        bsr.w   mw_delay_silent
        bne.w   7f
        move.l  36(%a1),%d1
        cmpi.l  #DELAY_QUIET,%d1
        bcc.w   8f
        addq.l  #1,%d1
        move.l  %d1,36(%a1)
        bra.w   8f
| The send opens on a frame whose read was left out: hand stock the zeros the read would have brought, once the
| ring write of the pass before has let go of this buffer (START or ACTIVE of either of its channels).
6:      tst.l   68(%a1)
        beq.w   7f
5:      move.w  0xfc04509e,%d1
        andi.l  #0x41,%d1
        bne.s   5b
        move.w  0xfc0450be,%d1
        andi.l  #0x41,%d1
        bne.s   5b
        movea.l %d0,%a0
        .rept 32
        clr.l   (%a0)+
        .endr
        lea     32(%a0),%a0
        .rept 32
        clr.l   (%a0)+
        .endr
7:      clr.l   36(%a1)
8:
        .globl modwerk_stock_4000362a_6
modwerk_stock_4000362a_6:
        .space 6
        jmp     0x40003630
| No read, the send shut: the dry gain on the track's own audio, ramped as stock ramps it, in the routine's own
| EMAC mode, and no ring write.
2:      move.l  %d0,0x800000e8                  | the scratch buffers swap, as in stock
        movea.l 0x80006180,%a0                  | and the filter record pointer steps to the next track
        lea     68(%a0),%a0
        move.l  %a0,0x80006180
        movea.l 96(%sp),%a1                     | the track's 16 stereo samples
        move.l  56(%sp),%d2                     | the dry gain where the last frame left it,
        sub.l   %d2,%d7                         | and a sixteenth of the way to its target a sample
        asr.l   #4,%d7
        moveq   #4,%d6
3:
        .rept 4
        move.l  (%a1),%d1
        mac.l   %d2,%d1,%acc0
        movclr.l %acc0,%d1
        move.l  %d1,(%a1)+
        move.l  (%a1),%d1
        mac.l   %d2,%d1,%acc0
        movclr.l %acc0,%d1
        move.l  %d1,(%a1)+
        add.l   %d7,%d2
        .endr
        subq.l  #1,%d6
        bne.s   3b
        jmp     0x400037e0                      | past stock's ring write, to its loop's tail

| 0x4000432c, the recorder's control-record update, called by the record write path about 1.5 times a recording
| track a frame (and by the arm task with interrupts off). It keeps the clamped length in the track's 44-byte record,
| then, for a length and with its flag clear, reads [r+300] and [r+308] of the track's record in CS1
| (0x100d38f0 + 1096 × id) and writes six fields. CS1 takes about half a microsecond an access on a MKII, and in
| steady recording [r+300] and [r+308] already hold the values the routine computes. This is stock's routine with
| the same arithmetic and every other write, but those two are stored only when they change: compared with the values
| it has just read, which it reads under stock's own interrupt mask (stock reads them just before), so what CS1 holds
| afterwards is what stock leaves, whatever interrupts. The scratch registers end as stock leaves them too.
| Idea and measurements: Bryan T (the stock routine cost 48 µs a frame at seven recording tracks on his MKII).
mw_rec_update:
        lea     -20(%sp),%sp
        movem.l %d2-%d5/%a2,(%sp)
        move.l  24(%sp),%d1                     | the recorder id
        movea.l 28(%sp),%a1                     | the length: 1-63 and negative become 64
        tst.l   %a1
        beq.s   1f
        moveq   #64,%d0
        cmp.l   %a1,%d0
        ble.s   1f
        movea.w #64,%a1
1:      moveq   #44,%d0
        muls.l  %d1,%d0
        lea     0x46c938c4,%a0
        move.l  %a1,16(%a0,%d0.l)
        tst.l   32(%sp)
        bne.w   9f
        tst.l   %a1
        beq.w   9f
        move.l  #1096,%d0
        muls.l  %d1,%d0
        movea.l %d0,%a0
        adda.l  #0x100d38f0,%a0
        move.l  %a1,%d2
        bge.s   2f
        clr.l   %d2
2:      move.w  %sr,%d4
        move.w  #0x2700,%sr
        move.l  300(%a0),%d5                    | what [r+300] holds
        move.l  %d5,%d1
        move.l  %d1,%d0
        not.l   %d0
        add.l   %d0,%d0
        subx.l  %d0,%d0
        and.l   %d0,%d1
        move.l  %d2,%d3
        cmp.l   %d2,%d1
        bge.s   3f
        move.l  %d1,%d3
3:      move.l  %d3,%d1
        cmpa.l  %d3,%a1
        ble.s   4f
        move.l  %a1,%d1
4:      cmp.l   %d1,%d2
        bge.s   5f
        move.l  %d2,%d1
5:      movea.l 308(%a0),%a2                    | what [r+308] holds
        movea.l %a2,%a1
        move.l  %d3,%d0
        cmpa.l  %d3,%a1
        ble.s   6f
        move.l  %a1,%d0
6:      movea.l %d1,%a1
        cmp.l   %d1,%d0
        bge.s   7f
        movea.l %d0,%a1
7:      cmp.l   %d5,%d3
        beq.s   8f
        move.l  %d3,300(%a0)
8:      move.l  %d1,304(%a0)
        cmpa.l  %a2,%a1
        beq.s   8f
        move.l  %a1,308(%a0)
8:      move.w  %d4,%sr
        clr.b   %d1
        move.b  %d1,296(%a0)
        move.w  %sr,%d0
        move.w  #0x2700,%sr
        lea     0x8000181c,%a1
        move.l  (%a1),276(%a0)
        move.l  0x80001820,%d1
        neg.l   %d1
        move.l  %d1,280(%a0)
        move.w  %d0,%sr
9:      movem.l (%sp),%d2-%d5/%a2
        lea     20(%sp),%sp
        rts
