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
| ring read and the next track's prefetch. Stock filters the two ring taps and mixes all eight tracks every frame,
| whatever their FX2 and however silent the ring: a track without a delay runs at gains of dry 0x7fffffff and send,
| wet and feedback 0, a DELAY at its defaults at SEND 0. When the frame's two taps (16 stereo samples each, in the
| scratch buffer and 160 bytes on) and the filter's four state words are all zero, the filter gives zeros and
| leaves its state, so wet and feedback multiply zeros; with the send's gain at zero from the frame's start to its
| end the ring is written with the zeros the scratch buffer already holds. All that is left is the dry gain on the
| track's own audio, ramped as stock ramps it, in the routine's own EMAC mode: bit-identical, so no history is kept.
| A module that takes the track at stock's seam before this one (0x4000361a) never comes here.
| Free here: d1, d2, a0-a4 (stock loads them next), and on the short path d6, d7 too (the mix would use them up;
| the loop reloads them per track). Kept on the way to stock: d0, the scratch buffer stock is about to store.
| The accumulators are empty here, as stock's own filter needs them. Displaced: movea.l 0x80006180,%a4.
mw_delay_idle:
        tst.l   %d6                             | the send's gain, this frame's target
        bne.w   8f
        tst.l   60(%sp)                         | and where the last frame left it
        bne.w   8f
        movea.l 0x80006180,%a1                  | the track's filter record: state at +28..+40
        move.l  28(%a1),%d1
        or.l    32(%a1),%d1
        or.l    36(%a1),%d1
        or.l    40(%a1),%d1
        movea.l %d0,%a0
        .rept 32
        or.l    (%a0)+,%d1
        .endr
        lea     32(%a0),%a0
        .rept 32
        or.l    (%a0)+,%d1
        .endr
        beq.s   2f
8:
        .globl modwerk_stock_4000362a_6
modwerk_stock_4000362a_6:
        .space 6
        jmp     0x40003630
2:      move.l  %d0,0x800000e8                  | the scratch buffers swap, as in stock
        lea     68(%a1),%a1                     | and the filter record pointer steps to the next track
        move.l  %a1,0x80006180
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
        jmp     0x4000377a                      | stock's ring write
