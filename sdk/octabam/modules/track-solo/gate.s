| SPDX-License-Identifier: MIT
| Copyright (c) 2026 twwwy
        .text
        .balign 4
        .global ts_frame_enter, ts_frame_leave, ts_scope_begin, ts_scope_end
        .global ts_frame_active, ts_frame_saved, ts_get, ts_rows

| Only the normal audio-frame path reaches these two sites. Entry is after
| the timer/DMA setup and before track processing; leave is at the frame
| counter read, after the last track work and before the instruction Tuner
| patches, USB Audio's producer and the base's register restore. UI/save/MIDI
| tasks and runtime publication cannot run within this interrupt scope.
| Give every stock/companion reader the same temporary view, including trig
| gates, then restore it before returning to any task. No battery write.
| The same macros drive the direct-call probes and production wrappers.
| No helper calls on the frame path. OFF uses only a test and branch per
| site, with no stack or state write. Active uses one saved register.
| The replayed stock MOVE supplies CCR; no instruction here changes X.
        .macro TS_BEGIN
        tst.l ts_overlay
        beq 8f
        move.l %d0,-(%sp)
        move.l 0x80000008,%d0
        move.l %d0,ts_frame_saved
        andi.l #0xffff0000,%d0
        or.l ts_overlay,%d0
        move.l %d0,ts_frame_active
        move.l %d0,0x80000008
        move.l (%sp)+,%d0
8:
        .endm

        .macro TS_END
        tst.l ts_frame_active
        beq 9f
        move.l %d0,-(%sp)
        move.l ts_frame_saved,%d0
        move.l %d0,0x80000008
        clr.l ts_frame_active
        move.l (%sp)+,%d0
9:
        .endm

ts_frame_enter:
        TS_BEGIN
        move.l 0x46104cf0,%d4
        jmp 0x4000aee6

ts_frame_leave:
        TS_END
        move.l 0x80004800,%d0
        jmp 0x4000d994

ts_scope_begin:
        TS_BEGIN
        rts

ts_scope_end:
        TS_END
        rts

        .balign 4
ts_frame_active:
        .long 0
ts_frame_saved:
        .long 0

ts_get:
        jmp ts_label

        .balign 4
ts_rows:
        .long 1
        .long .Lts_row_label,ts_get,ts_set
.Lts_row_label:
        .asciz "TRACK SOLO"
