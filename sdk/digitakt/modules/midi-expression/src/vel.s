| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: velocity (OS 1.54). V.SNS applies to what plays, never to
| what is recorded, and VEL as a source follows every note a track plays.
|
| Audio tracks. The render takes each note message; its velocity (8.8) is
| stored to the voice's word at 0x80001f18 + 2 x voice (%d2), then
|     40077a60  move.l %d2,%d0
|     40077a62  addi.l #287,%d0
| An 8-byte jsr site there comes to me_voice_hook: me_voice_velocity (audio.c)
| reads the stored velocity and writes it back through V.SNS; then the two
| instructions. Only %d0 changes, as they change it.
|
| MIDI tracks. notes_append(len, bytes) 0x400e1002 collects the notes the MIDI
| tracks' task sends; its first instruction
|     400e1002  mvz.b 0x421b6620,%d1
| is a 6-byte jmp site to me_noteout_entry: me_note_out (expr.c) returns the
| bytes to send (a copy with V.SNS on a note's velocity, or the caller's);
| then the instruction, and on at 0x400e1008.
        .equ    NOTES_REST, 0x400e1008

        .section .run, "ax"
        .balign 2
        .globl  me_voice_hook
me_voice_hook:
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %d2, -(%sp)
        jsr     me_voice_velocity
        addq.l  #4, %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        move.l  %d2, %d0
        addi.l  #287, %d0
        rts

        .balign 2
        .globl  me_noteout_entry
me_noteout_entry:                       | (sp) return, 4 len, 8 bytes
        move.l  8(%sp), -(%sp)          | bytes
        move.l  8(%sp), -(%sp)          | len
        jsr     me_note_out
        addq.l  #8, %sp
        move.l  %d0, 8(%sp)             | the bytes to send
        mvz.b   0x421b6620, %d1
        jmp     NOTES_REST
