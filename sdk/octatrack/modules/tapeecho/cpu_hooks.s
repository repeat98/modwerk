| Enter after the stock DMA read wait and next-track prefetch, before its
| filter/mix. sp is still the stock routine's 148-byte frame. Stock's own
| EMAC save/restore and ring DMA commit surround this adapter.
        .text
        .balign 4
        .global te_cpu_hook, te_cpu_reset, te_states, te_guard, te_keys
| One track's block, 40 µs of DTIM3 (132 MHz). An estimate, not a bound: the first instance raised the
| longest frame by 9.4 % of 363 µs (34 µs, 1,800 emulator instructions on the default page) on the owner's
| MKII (evidence/frame-cost.json, 22 Nov 2026). The emulator's worst block, 2,926, scales that to about 55 µs;
| the base's deadline keeps a 20 µs margin, which covers the 15 µs the estimate can fall short.
        .set    TE_BLOCK_COUNTS, 5280
| d0 = gain(MIX knob) as te_block forms it: min(knob, 127) * 16909320.
        .macro  TE_KNOB_MIX
        movea.l 72+72(%sp),%a1
        mvz.b   10(%a1),%d0
        moveq   #127,%d1
        cmp.l   %d1,%d0
        bls.s   .Lknob\@
        move.l  %d1,%d0
.Lknob\@:
        move.l  #16909320,%d1
        mulu.l  %d1,%d0
        .endm
te_cpu_reset:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        lea     te_keys,%a0
        move.l  #437,%d1                | te_keys, te_guard and te_states: 438 longs
        moveq   #0,%d0
te_clear_loop:
        move.l  %d0,(%a0)+
        subq.l  #1,%d1
        bpl.s   te_clear_loop
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        lea     -16(%sp),%sp
        movem.l %d2-%d5,(%sp)
        jmp     0x40002f4c
| Every track's seam comes here. Another effect's track (or a track whose
| byte at 108(sp) is 7) goes straight back to stock, in a5 and d0 only: the
| stock replay below reloads both. Its Tape Echo state is cleared on the
| first such frame (te_guard's live mask says which tracks may hold any).
| Stock's code from 0x4000377a reads neither a5 nor d0 before writing it.
te_cpu_hook:
        move.l  76(%sp),%a5
        mvz.b   7(%a5),%d0
        cmpi.l  #0x0f,%d0               | TE_ID
        bne     te_decline
        move.l  108(%sp),%a5
        mvz.b   (%a5),%d0
        subq.l  #7,%d0
        beq     te_decline
| A Tape Echo track. Frame: 0..31 TapeParams p, 32..71 saved d1-d5/a0-a4,
| the stock routine's frame at 72(sp): 48 ring write address, 72 knob
| words, 96 audio, 112 track. Registers: d2 track, then steady; d3 ring
| base; d4 write index; d5 tempo; a2 the state; a3 the record buffer; a4
| the steady key.
        lea     -72(%sp),%sp
        movem.l %d1-%d5/%a0-%a4,32(%sp)
        move.l  72+112(%sp),%d2
        moveq   #8,%d0
        cmp.l   %d0,%d2
        bcc     te_track_stock
        move.l  #1411328,%d3            | TE_STRIDE
        mulu.l  %d2,%d3
        add.l   #0x4f502c10,%d3         | this track's ring, uncached
        move.l  72+48(%sp),%d4
        sub.l   %d3,%d4
        lsr.l   #3,%d4
        move.l  %d2,%d0
        mulu.w  #200,%d0
        lea     te_states,%a2
        adda.l  %d0,%a2
        cmp.l   #176384,%d4             | TE_RING - TE_FRAMES
        bhi     te_track_far
| Stock 0x40003624 toggles these two scratch buffers after prefetching the
| NEXT track into the other one; skipping that toggle would overwrite an
| in-flight DMA read. Its immediate is 0x800039a0 ^ 0x80003ae0, written only
| by stock's delay reset (0x40002fae, under te_cpu_reset).
        move.l  0x800000e8,%d0
        eori.l  #0x340,%d0
        move.l  %d0,0x800000e8
        movea.l %d0,%a3
        moveq   #68,%d0
        add.l   %d0,0x80006180          | stock filter's per-track state iterator
        tst.l   te_rest                 | ev_frame_deadline's rest (cpu.c): the base rests Tape Echo
        bne     te_rested
        tst.l   (%a2)                   | an active state already has its live bit
        bne.s   1f
        lea     te_guard+23,%a1
        bset    %d2,(%a1)
| Overload hold (TapeGuard: 0 call, 4 last, 8 hold, 12 holds, 16 late). The
| stock delay routine runs once a frame at IPL 5; a call that begins more
| than a quarter frame later than the last one's (stock's free-running
| DTIM3, 132 MHz) holds every instance for that block. A count that stands
| still, or a gap of two frames or more, never holds.
1:      lea     te_guard,%a1
        move.l  0xfc07c00c,%d0
        move.l  %d0,%d1
        sub.l   4(%a1),%d1
        cmp.l   #23945,%d1              | TE_FRAME_COUNTS / 2: this call's first block
        bls.s   3f
        move.l  %d0,%d1
        sub.l   (%a1),%d1
        move.l  %d0,(%a1)
        clr.l   8(%a1)
        cmp.l   #95782,%d1              | 2 * TE_FRAME_COUNTS
        bcc.s   3f
        cmp.l   16(%a1),%d1
        bls.s   2f
        move.l  %d1,16(%a1)
2:      cmp.l   #59863,%d1              | TE_FRAME_COUNTS + TE_FRAME_COUNTS / 4
        bls.s   3f
        moveq   #1,%d1
        move.l  %d1,8(%a1)
3:      move.l  %d0,4(%a1)
| The frame's deadline (cpu.c te_frame_deadline, base 0.8; 0 none): a block that
| would end past it is held, so the next frame interrupt never enters late.
| (int32_t)(now - deadline + TE_BLOCK_COUNTS) >= 0 holds: right across the
| counter's wrap while now is within 2^31 counts (16 s) of the deadline.
        move.l  te_deadline,%d1
        beq.s   6f
        sub.l   %d1,%d0
        add.l   #TE_BLOCK_COUNTS,%d0    | now + this block's cost - deadline
        bpl     te_hold
6:      tst.l   8(%a1)
        bne     te_hold
| The stock filter drains its accumulators on its first sample. It is
| bypassed, so establish the same empty accumulators first.
        move.l  #0,%acc0
        move.l  #0,%acc1
        move.l  #0,%acc2
        move.l  #0,%acc3
| Steady: the state says nothing ramps, glides or fades and the six stock
| knob halfwords and the tempo word are the last steady block's.
        move.l  72+72(%sp),%a0
        move.l  %d2,%d0
        lsl.l   #4,%d0
        lea     te_keys,%a4
        adda.l  %d0,%a4
        move.l  0x8000181c,%d5
        move.l  %d2,28(%sp)             | p.lane
        tst.l   100(%a2)                | s->steady
        beq.s   te_full
        tst.l   (%a2)                   | s->active
        beq.s   te_full
        cmp.l   12(%a4),%d5
        bne.s   te_full
        move.l  (%a0),%d0
        cmp.l   (%a4),%d0
        bne.s   te_full
        move.l  4(%a0),%d0
        cmp.l   4(%a4),%d0
        bne.s   te_full
        move.l  8(%a0),%d0
        cmp.l   8(%a4),%d0
        bne.s   te_full
        moveq   #1,%d2
        bra.s   te_call
| Each control is the high (first) byte of its staged halfword.
te_full:
        mvz.b   (%a0),%d0
        move.l  %d0,(%sp)               | time
        mvz.b   2(%a0),%d0
        move.l  %d0,4(%sp)              | feedback
        mvz.b   4(%a0),%d0
        move.l  %d0,8(%sp)              | wow
        mvz.b   8(%a0),%d0
        move.l  %d0,12(%sp)             | sync
        mvz.b   10(%a0),%d0
        move.l  %d0,16(%sp)             | mix
        mvz.b   6(%a0),%d0
        move.l  %d0,20(%sp)             | age
        move.l  %d5,24(%sp)             | tempo
        moveq   #0,%d2
te_call:
        move.l  %d2,-(%sp)              | te_block(s, &p, ring, write, audio, record, steady)
        move.l  %a3,-(%sp)
        move.l  80+96(%sp),-(%sp)
        move.l  %d4,-(%sp)
        move.l  %d3,-(%sp)
        pea     20(%sp)
        move.l  %a2,-(%sp)
        jsr     te_block
        lea     28(%sp),%sp
| A full block that leaves s->steady set keys the next steady ones.
        tst.l   %d2
        bne.s   te_track_done
        tst.l   100(%a2)
        beq.s   te_track_done
        move.l  72+72(%sp),%a0
        move.l  (%a0),(%a4)
        move.l  4(%a0),4(%a4)
        move.l  8(%a0),8(%a4)
        move.l  %d5,12(%a4)
te_track_done:
        movem.l 32(%sp),%d1-%d5/%a0-%a4
        lea     72(%sp),%sp
        jmp     0x4000377a
| Held: no head, filter or clock runs; the block costs about a quarter of a
| full one (emulator, seam to exit: 524 instructions at MIX 64 or below, 722
| above, against 1,907 for a full block). The audio gets the full path's dry gain
| (te_dry). record[], the scratch buffer stock's commit from 0x4000378a
| writes to the ring, gets the record path of te_tape_block without its
| feedback and hiss terms: the drive sum, the [1,6,1]/8 FIR on s->fir and
| the tape curve, so the tape holds the block's own input, shaped as always,
| and the FIR's history runs on into the next block. Only the repeat the
| feedback would have laid over it is missing for these 16 samples. Zeros
| played back later as a 0.36 ms gap, an unwritten block as 16 samples of
| tape from 4 s before, the input unshaped up to 1.6 dB too loud. An
| inactive state (its first block) records nothing it would keep: it
| starts with no history.
| x2 <- the shaped sample of the next input; record it through the curve.
        .macro  TE_HOLD_RECORD x1,x2
        move.l  (%a0)+,%d0
        move.l  (%a0)+,%d3
        mac.l   %d0,%a5,%acc0
        mac.l   %d3,%a5,%acc0
        movclr.l %acc0,%d4
        asr.l   #3,%d4
        add.l   %d4,\x2
        sub.l   \x1,\x2
        sub.l   \x1,\x2
        asr.l   #3,\x2
        add.l   \x1,\x2
        move.l  \x2,%d5
        swap    %d5
        ext.l   %d5
        and.l   #-4,%d5
        and.l   #262143,\x2
        lsl.l   #8,\x2
        lsl.l   #5,\x2
        move.l  (%a4,%d5.l),%d0
        move.l  4(%a4,%d5.l),%d3
        move.l  %d0,%acc1
        msac.l  %d0,\x2,%acc1
        mac.l   %d3,\x2,%acc1
        movclr.l %acc1,%d0
        move.l  %d0,(%a3)+
        move.l  %d0,(%a3)+
        move.l  %d4,\x2
        .endm
te_hold:
        addq.l  #1,12(%a1)
        movea.l 72+96(%sp),%a0          | the track's 16 stereo samples
        tst.l   (%a2)
        beq     7f
        lea     128(%a0),%a1
        lea     te_tape_curve+4096,%a4
        move.l  te_record_gain,%a5
        move.l  44(%a2),%d1             | s->fir
        move.l  48(%a2),%d2
4:      TE_HOLD_RECORD %d1,%d2
        TE_HOLD_RECORD %d2,%d1
        cmpa.l  %a1,%a0
        bne     4b
        move.l  %d1,44(%a2)
        move.l  %d2,48(%a2)
        moveq   #16,%d0
        add.l   4(%a2),%d0
        cmp.l   #176399,%d0             | TE_RING - 1
        bls.s   5f
        move.l  #176399,%d0
5:      move.l  %d0,4(%a2)
        move.l  24(%a2),%d0             | s->mix, ramped where the last block left it
        lea     -128(%a0),%a0
        bra.s   8f
7:      TE_KNOB_MIX
8:      bsr.s   te_dry
        bra     te_track_done
| Rested (rest nonzero, base 0.8): the audio gets the dry gain of the MIX
| knob (te_dry) and stock's ring write is skipped (0x400037e0, past it, as
| the base's own quiet path does), so no echo, no tape and no stock filter
| or mix run. Clearing the active word makes the first block after the rest
| start afresh in te_block, its MIX unramped at the same knob: every state
| word zero and valid 0, so the head reads no tape recorded before it
| (read_head and render_head give silence beyond valid).
te_rested:
        clr.l   (%a2)
        movea.l 72+96(%sp),%a0
        TE_KNOB_MIX
        bsr.s   te_dry
        movem.l 32(%sp),%d1-%d5/%a0-%a4
        lea     72(%sp),%sp
        jmp     0x400037e0
| The dry gain of te_tape_block's MIX law for d0 = s->mix (TE_TAPE_GAINS):
| unity up to the knee, as the full path leaves the dry unscaled there but
| for its 1-LSB TE_ONE; above it ((full - mix) >> 14) * 33028, applied as
| the kernel applies it, so a held or rested block meets the blocks around
| it at the same dry level. a0 the audio; uses d0-d2, a0 and acc0, cleared.
te_dry:
        cmp.l   #1082196480,%d0         | TE_MIX_KNEE
        bls.s   9f
        move.l  #2147483640,%d1         | TE_FULL_WET
        sub.l   %d0,%d1
        moveq   #14,%d2
        lsr.l   %d2,%d1
        mulu.w  #33028,%d1
        moveq   #31,%d2
1:      move.l  (%a0),%d0
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        move.l  %d0,(%a0)+
        subq.l  #1,%d2
        bpl.s   1b
9:      rts
| The write position leaves no room for a block: stock's path, and the
| instance starts afresh when it comes back.
te_track_far:
        clr.l   (%a2)
te_track_stock:
        movem.l 32(%sp),%d1-%d5/%a0-%a4
        lea     72(%sp),%sp
        bra.s   te_replay
te_decline:
        move.l  112(%sp),%d0
        cmpi.l  #8,%d0
        bcc.s   te_replay
        lea     te_guard+23,%a5
        btst    %d0,(%a5)
        beq.s   te_replay
        bclr    %d0,(%a5)
        mulu.w  #200,%d0
        lea     te_states,%a5
        clr.l   (%a5,%d0.l)             | its active word
te_replay:
        move.l  92(%sp),%a5
        move.l  0x800000e8,%d0
        jmp     0x40003624
        .balign 16
te_keys:
        .zero   128
te_guard:
        .zero   24
te_states:
        .zero   1600
