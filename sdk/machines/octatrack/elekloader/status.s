| SPDX-License-Identifier: GPL-3.0-or-later
| The ColdFire's idle time (status.c): main runs the init list, then spins at 0x4001fc9c for good, and that
| spin is the idle task (Octabam's KERNEL.md: the lowest priority, run when nothing else wants the CPU).
        .text
        .global mw_idle, mw_ts_gate, mw_delay_idle

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

| 0x4000362a, the delay routine (0x400031a0, called once a frame from the frame transfer), per track after its
| ring read and the next track's prefetch. Stock filters and mixes all eight tracks every frame whatever their
| FX2: a track without a delay runs at gains of dry 0x7fffffff, send, wet and feedback 0, so its audio passes and
| its ring is written with zeros. Once those gains have been the frame's start and target for QUIET frames in a
| row, the whole ring is zeros (11,025 frames write it once) and the filter has settled on them, so the filter and
| the mix change nothing but one bit: the dry gain is not quite one and its product is truncated, so every positive
| sample leaves one lower (and 0x80000000 one higher). This path does that and no more; the ring transfers stay
| stock's, of zeros.
| A module that takes the track at stock's seam before this one (0x4000361a) never comes here, and may write the
| ring: a frame this hook did not see, by the ring position or by DTIM3, starts the count again.
| Free here: d1, d2, a0-a4 (stock loads them next, or its ring write and loop tail need none). Kept: d0, the scratch buffer stock is about to store.
| Displaced: movea.l 0x80006180,%a4.
        .equ    DELAY_QUIET, 16384
        .equ    DELAY_RING, 1411200
        .equ    DELAY_LATE, 0x23000             | three frames of DTIM3 counts
mw_delay_idle:
        cmpi.l  #0x7fffffff,%d7                 | this frame's targets: dry, send, wet, feedback
        bne.s   6f
        tst.l   %d6
        bne.s   6f
        move.l  %fp,%d1
        bne.s   6f
        tst.l   52(%sp)
        bne.s   6f
        cmp.l   56(%sp),%d7                     | and where the last frame left them
        bne.s   6f
        tst.l   60(%sp)
        bne.s   6f
        tst.l   64(%sp)
        bne.s   6f
        tst.l   68(%sp)
        bne.s   6f
        move.l  112(%sp),%d1                    | the track
        lea     mw_delay_quiet,%a1
        lea     (%a1,%d1.l*4),%a1               | [track] ring position, [8 + track] DTIM3, [16 + track] quiet frames
        movea.l 100(%sp),%a0
        move.l  (%a0),%d2                       | the ring position, already advanced
        move.l  %d2,%d1
        sub.l   (%a1),%d1
        move.l  %d2,(%a1)
        move.l  0xfc07c00c,%d2                  | DTCN3
        movea.l %d2,%a0
        sub.l   32(%a1),%d2
        move.l  %a0,32(%a1)
        cmpi.l  #DELAY_LATE,%d2
        bcc.s   7f
        cmpi.l  #128,%d1
        beq.s   1f
        cmpi.l  #128-DELAY_RING,%d1             | the ring wrapped
        bne.s   7f
1:      move.l  64(%a1),%d1
        cmpi.l  #DELAY_QUIET,%d1
        bcc.s   2f
        addq.l  #1,%d1
        move.l  %d1,64(%a1)
        bra.s   8f
6:      move.l  112(%sp),%d1
        lea     mw_delay_quiet,%a1
        lea     (%a1,%d1.l*4),%a1
7:      clr.l   64(%a1)
8:
        .globl modwerk_stock_4000362a_6
modwerk_stock_4000362a_6:
        .space 6
        jmp     0x40003630
2:      move.l  %d0,0x800000e8                  | the scratch buffers swap, as in stock
        movea.l 0x80006180,%a0                  | and the filter state pointer steps to the next track
        lea     68(%a0),%a0
        move.l  %a0,0x80006180
        movea.l 96(%sp),%a1                     | the track's 16 stereo samples
        moveq   #8,%d1
3:
        .rept 4
        move.l  (%a1)+,%d2
        bgt.s   4f
        subq.l  #1,%d2                          | only 0x80000000 overflows: it is the one sample that
        bvc.s   5f                              | leaves stock's gain one higher
        addq.l  #1,-4(%a1)
        bra.s   5f
4:      subq.l  #1,-4(%a1)
5:
        .endr
        subq.l  #1,%d1
        bne.s   3b
        jmp     0x4000377a                      | stock's ring write
