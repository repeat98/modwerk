| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: the MIDI tracks' LFO as a destination (OS 1.54).
|
| The MIDI tracks' task runs a track's LFO with 0x400ed438(params, track, mask):
|     400ed438  lea -56(%sp),%sp
|     400ed43c  movem.l %d2-%d7/%a2-%a6,(%sp)
| An 8-byte jmp site over those two comes to me_midi_lfo_entry, which calls
| me_midi_lfo_pre(params, track) (expr.c: the live routes into the LFO's
| words), then the function itself with the same arguments (the two
| instructions, on at 0x400ed440), then me_midi_lfo_post(params, track)
| (the words back), and returns to the caller. The function returns nothing.
        .equ    MLFO_REST, 0x400ed440

        .section .run, "ax"
        .balign 2
        .globl  me_midi_lfo_entry
me_midi_lfo_entry:                      | (sp) return, 4 params, 8 track, 12 mask
        move.l  8(%sp), -(%sp)          | track
        move.l  8(%sp), -(%sp)          | params
        jsr     me_midi_lfo_pre
        addq.l  #8, %sp
        move.l  12(%sp), -(%sp)         | mask
        move.l  12(%sp), -(%sp)         | track
        move.l  12(%sp), -(%sp)         | params
        jsr     me_midi_lfo_body
        lea     12(%sp), %sp
        move.l  8(%sp), -(%sp)
        move.l  8(%sp), -(%sp)
        jsr     me_midi_lfo_post
        addq.l  #8, %sp
        rts

me_midi_lfo_body:
        lea     -56(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        jmp     MLFO_REST
