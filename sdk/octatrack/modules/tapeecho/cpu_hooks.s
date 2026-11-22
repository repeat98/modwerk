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
| Held: the track's audio at 96(frame) is left as stock handed it, the dry
| input at unity (stock's mix, 0x40003704, is skipped as on the full path),
| and record[], the scratch buffer stock's commit from 0x4000378a writes to
| the ring, is 32 zero words: this block's 16 frames of tape are silence. The
| head, filters and clocks stand still; valid counts the 16 silent frames,
| so the echo later plays a 16-sample gap, never stale tape.
te_hold:
        addq.l  #1,12(%a1)
        moveq   #31,%d0
4:      clr.l   (%a3)+
        subq.l  #1,%d0
        bpl.s   4b
        tst.l   (%a2)
        beq.s   te_track_done
        moveq   #16,%d0
        add.l   4(%a2),%d0
        cmp.l   #176399,%d0             | TE_RING - 1
        bls.s   5f
        move.l  #176399,%d0
5:      move.l  %d0,4(%a2)
        bra.s   te_track_done
| Rested (rest nonzero, base 0.8): the audio stays the dry input at unity and
| stock's ring write is skipped (0x400037e0, past it, as the base's own quiet
| path does), so no echo, no tape and no stock filter or mix run. Clearing
| the active word makes the first block after the rest start afresh in
| te_block: every state word zero and valid 0, so the head reads no tape
| recorded before it (read_head and render_head give silence beyond valid).
te_rested:
        clr.l   (%a2)
        movem.l 32(%sp),%d1-%d5/%a0-%a4
        lea     72(%sp),%sp
        jmp     0x400037e0
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
