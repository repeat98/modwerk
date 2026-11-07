| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: the audio render, after the LFO stage (OS 1.54).
|
| A 6-byte jsr site at 0x40077eea replaces the call to 0x400ece8e, the
| first call after the LFO stage that takes the parameter words (its first
| stack argument, the render's a2). me_render_hook runs me_render(words),
| then goes on into 0x400ece8e with the stack as the call left it, so that
| function returns to the render as stock.

        .equ NEXT, 0x400ece8e

        .section .run, "ax"
        .balign 2
        .globl  me_render_hook
me_render_hook:
        move.l  4(%sp), -(%sp)          | the parameter words
        jsr     me_render
        addq.l  #4, %sp
        jmp     NEXT
