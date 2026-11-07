| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: the entry of the MIDI tracks' send(track, channel, id,
| value, force) at 0x400e0ddc, OS 1.54.
|
| An 8-byte jmp site replaces its first two instructions (link and the
| register save). me_send_entry asks me_filter(track, channel, id, value,
| force) first: a returned 0x80000000 means this mod sends the combined value
| itself, and the call returns to its caller as stock does when it has
| nothing to send; any other result is the value stock goes on to send. Then
| it replays the two replaced instructions and continues at 0x400e0de4.

        .equ SEND_REST, 0x400e0de4

        .section .run, "ax"
        .balign 2
        .globl  me_send_entry
me_send_entry:
        move.l  20(%sp), -(%sp)         | force
        move.l  20(%sp), -(%sp)         | value
        move.l  20(%sp), -(%sp)         | id
        move.l  20(%sp), -(%sp)         | channel
        move.l  20(%sp), -(%sp)         | track
        jsr     me_filter
        lea     20(%sp), %sp
        cmpi.l  #0x80000000, %d0
        beq.s   9f
        move.l  %d0, 16(%sp)            | the value stock sends
        link    %a6, #-452              | the two replaced instructions
        movem.l %d2-%d6/%a2, (%sp)
        jmp     SEND_REST
9:      rts
