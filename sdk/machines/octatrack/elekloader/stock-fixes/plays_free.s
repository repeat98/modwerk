| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Plays-Free trig: a stock OS 1.40C fix the base carries. Root cause and the MIDI stride and offset are
| Zac-Kyoti's (MIT, Zac-Kyoti/octatrack-kyoti-fw, patch_trigscale.s, MIDI_PLAYS_FREE_FIX); this entry is Modwerk's,
| on a different stock site, so that it never meets his copy in Direct Jump Kyoti.
|
| The bug: a Plays-Free MIDI track with trig quantize DIRECT and the pattern's scale PER TRACK stalls after its
| first step on a manual trig. The seed routine at 0x4009b5c8 copies each track's scale index into 0x8000663e[track]
| and, in PER TRACK mode, reads it with the audio track's stride and offset (0x91a, +0x51) for every track, MIDI tracks
| 8-15 too. A MIDI track gets a byte of its trig data (0xff in Zac's repro bank) and the step-length table read with it
| gives a step that never ends.
|
| Direct Jump Kyoti splices Zac's fix over 0x4009b6f2..0x4009b703, the read itself. The base hooks the next stock
| instruction after the store instead: 0x4009b708, `lea 0x46c775bc,%a0`, one six-byte instruction that no stock branch
| enters. There the store at 0x4009b704 has just been made; for a MIDI track in PER TRACK mode this entry stores the
| byte at the MIDI track's own place again (bank + pattern * 0x8ed8 + (track - 8) * 0x8b0 + 0x48f9, the byte the MIDI
| step loop reads), then replays the lea. With Direct Jump Kyoti installed, its splice has already stored that same
| byte and this store repeats it: the two never patch the same bytes and together do what either does alone.
|
| Registers at 0x4009b708, from the routine's own code: d1 = 0x400e21e0 + bank * 0x9b340, d2 = pattern * 0x8ed8,
| d3 = track (0-15), a1 = 0x8000663e. Only a0 changes (to the lea's value), as stock; d0 is saved; the condition codes
| differ from stock's, and the next stock instruction (a move.b) sets them.

        .text
        .globl  mw_fix_plays_free
mw_fix_plays_free:
        cmpi.l  #8,%d3
        blt.s   9f                      | an audio track (0-7): stock reads it right
        movea.l %d1,%a0
        adda.l  %d2,%a0
        adda.l  #0x8e55,%a0             | the pattern's SCALE mode, 0 NORMAL
        tst.b   (%a0)
        beq.s   9f                      | NORMAL: stock stored the master scale, right for every track
        move.l  %d0,-(%sp)
        move.l  %d3,%d0
        subq.l  #8,%d0
        mulu.w  #0x8b0,%d0              | (track - 8) * the MIDI track stride
        add.l   %d2,%d0
        addi.l  #0x48f9,%d0             | the MIDI track's scale byte
        movea.l %d1,%a0
        lea     (0,%a0,%d0.l),%a0
        move.b  (%a0),(0,%a1,%d3.l)
        move.l  (%sp)+,%d0
9:      lea     0x46c775bc,%a0          | the instruction this entry displaced
        rts
