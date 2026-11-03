        | SPDX-License-Identifier: GPL-3.0-or-later
        | chromatic-aftertouch-fix - CHROMATIC pads send their MIDI poly
        | pressure on the note they played.
        |
        | On stock OS 1.74, ChromPadsView sends a pad's note on and note off
        | 24 semitones below the note it keeps for the pad (0x400c5924 and
        | 0x400c59ca), but its pressure handler (0x400c6196) passes that kept
        | note to the poly pressure sender unchanged (0x400c628e). So a held
        | CHROMATIC pad sends `9n 24 vv`, then `An 3c pp`, and a receiver
        | watching note 0x24 sees no aftertouch. The pressure to the sound
        | (0x4011f490, per track) takes no note and is right.
        |
        | pressure_out replaces that one call: it takes 24 off the note and
        | calls the sender, or sends nothing when the note leaves 0..127, as
        | the note on sender (0x40085856) refuses such a note. The sender
        | queues one message per pad and writes the note's low byte unchecked
        | (0x40085a8c), so the range test keeps a bad byte off the wire.
        | KeyboardView (pads outside CHROMATIC) sends note on and pressure
        | through one helper (0x400c6eea) and is left alone.

        .equ    PRESSURE_OUT,   0x400850f4        | (slot, channel, note, value)
        .equ    CHRO_OFFSET,    24                | ChromPadsView's MIDI note offset

        .align  2
        .globl  chromatic_aftertouch_fix_pressure_out
chromatic_aftertouch_fix_pressure_out:
        move.l  12(%sp),%d0                       | the kept note
        moveq   #CHRO_OFFSET,%d1
        sub.l   %d1,%d0
        moveq   #127,%d1
        cmp.l   %d0,%d1
        bcs.s   1f                                | below 0 or above 127: drop
        move.l  %d0,12(%sp)                       | the note the note on sent
        jmp     PRESSURE_OUT
1:      moveq   #0,%d0                            | as the sender's refusal
        rts
