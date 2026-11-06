        | SPDX-License-Identifier: GPL-3.0-or-later
        | chromatic-aftertouch-fix - CHROMATIC pads send their MIDI poly
        | pressure on the note they played.
        |
        | On stock OS 1.74, ChromPadsView (a2 below) keeps two notes per pad:
        | the pad's place in the current layout at view + 404 + 4 * pad, which
        | UP and DOWN rewrite (-1 for a pad past the top), and the note a
        | press played at view + 308 + 4 * pad (stored at 0x400c63be, -1 once
        | released at 0x400c5a16). The note on and the note off go out 24
        | below the held note (0x400c5924, 0x400c59ca). The pressure handler
        | (0x400c6196) instead passes the layout note, unchanged, to the poly
        | pressure sender (0x400c628e). So a held CHROMATIC pad sends
        | `9n 24 vv`, then `An 3c pp`, and a receiver watching note 0x24 sees
        | no aftertouch; after UP or DOWN during the hold the pressure moves
        | again, and a pad pushed past the top sends note byte 0xff. The
        | pressure to the sound (0x4011f490, per track) takes no note.
        |
        | pressure_out replaces that one call (slot, channel, note, value):
        | the slot is the pad, and a2 still holds the view, so it sends the
        | held note less 24, exactly the note off's note. With no held note
        | (-1), or a note outside 0..127, it sends nothing, as the note on
        | sender (0x40085856) refuses such a note; the sender itself queues
        | the note's low byte unchecked (0x40085a8c). KeyboardView (pads
        | outside CHROMATIC) sends note on and pressure through one helper
        | (0x400c6eea) and is left alone.

        .equ    PRESSURE_OUT,   0x400850f4        | (slot, channel, note, value)
        .equ    HELD_NOTES,     308               | ChromPadsView: note held per pad
        .equ    CHRO_OFFSET,    24                | ChromPadsView's MIDI note offset

        .align  2
        .globl  chromatic_aftertouch_fix_pressure_out
chromatic_aftertouch_fix_pressure_out:
        move.l  4(%sp),%d0                        | the slot: the pad, 0..11
        moveq   #11,%d1
        cmp.l   %d0,%d1
        bcs.s   1f                                | as the sender: no such slot
        lea     HELD_NOTES(%a2),%a0
        move.l  (%a0,%d0.l*4),%d0                 | the note the press played
        moveq   #CHRO_OFFSET,%d1
        sub.l   %d1,%d0
        moveq   #127,%d1
        cmp.l   %d0,%d1
        bcs.s   1f                                | none held, or out of range
        move.l  %d0,12(%sp)                       | the note the note on sent
        jmp     PRESSURE_OUT
1:      moveq   #0,%d0                            | as the sender's refusal
        rts
