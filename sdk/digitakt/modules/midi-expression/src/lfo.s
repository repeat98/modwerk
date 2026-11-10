| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: the LFO stage's entry (OS 1.54). The render calls the LFO
| stage 0x400ed766(words, ...) once a block, after the words are built and
| before anything else reads them; the LFO slots (1-16) are read only there.
| An 8-byte jmp site over its first two instructions comes here:
|     400ed766  lea -64(%sp),%sp
|     400ed76a  movem.l %d2-%d7/%a2-%a6,(%sp)
| me_render_lfo (audio.c) adds the live routes to the LFO slots; then the two
| instructions run here and the stage goes on at 0x400ed76e.
        .equ    LFO_REST, 0x400ed76e

        .section .run, "ax"
        .balign 2
        .globl  me_lfo_entry
me_lfo_entry:                           | (sp) return, 4 words
        move.l  4(%sp), -(%sp)
        jsr     me_render_lfo
        addq.l  #4, %sp
        lea     -64(%sp), %sp
        movem.l %d2-%d7/%a2-%a6, (%sp)
        jmp     LFO_REST
