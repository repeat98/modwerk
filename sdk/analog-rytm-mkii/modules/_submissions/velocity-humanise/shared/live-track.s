        | SPDX-License-Identifier: GPL-2.0-only
        | live-track.s - a live track pointer as core-ar2 0.2's (item, index).
        |
        | For inclusion in a mod that keeps a "track" field in core's mod storage,
        | after the include of ar2-1.7x.inc:
        |
        |         .include "../shared/live-track.s"
        |
        | core_store_get/set take a track field as (live pattern, track 0..12). The
        | UI paths hold the live track itself (what the TrackPattern accessor's
        | vtable[0x28] returns), so this turns that pointer back into the pair:
        |
        |   live project      0x407c89cb (the same on OS 1.73 and 1.74)
        |   live pattern k    0x407c89e3 + 85760 * k, k = 0..128 (0 the working
        |                     pattern, 1 + n pattern n)
        |   live track t      live pattern + 917 * t, t = 0..12
        |
        | A pointer that is not exactly one of those tracks fails, and the caller
        | then reads and writes nothing. The label is local to the including unit.

        .equ    LIVE_PAT0,     0x407c89e3         | 0x407c89cb + 24
        .equ    LIVE_PAT_SIZE, 85760
        .equ    LIVE_PATS,     129
        .equ    LIVE_TRK_SIZE, 917
        .equ    LIVE_TRKS,     13

        .text

        | ------------------------------------------------------------------
        | track_item(%a0 = live track) -> %a0 = live pattern, %d0 = track 0..12,
        |                                 flags from d0 (N clear)
        |                              or %d0 = -1 (N set), a0 undefined
        | Clobbers d1 only.
        | ------------------------------------------------------------------
        .align  2
track_item:
        move.l  %a0,%d0
        sub.l   #LIVE_PAT0,%d0                    | offset into the live patterns
        cmp.l   #LIVE_PATS*LIVE_PAT_SIZE,%d0
        bcc.s   9f                                | unsigned: below them or past them
        move.l  #LIVE_PAT_SIZE,%d1
        divu.l  %d1,%d0                           | d0 = k
        mulu.l  %d0,%d1                           | d1 = 85760 * k
        add.l   #LIVE_PAT0,%d1                    | d1 = live pattern k
        move.l  %a0,%d0
        sub.l   %d1,%d0                           | offset in the pattern, < 85760
        move.l  %d1,%a0
        divu.w  #LIVE_TRK_SIZE,%d0                | low word t, high word remainder
        move.l  %d0,%d1
        swap    %d1
        tst.w   %d1
        bne.s   9f                                | not on a track's first byte
        andi.l  #0xffff,%d0
        moveq   #LIVE_TRKS,%d1
        cmp.l   %d1,%d0
        bcc.s   9f                                | past track 12: the pattern's tail
        tst.l   %d0
        rts
9:      moveq   #-1,%d0
        rts
