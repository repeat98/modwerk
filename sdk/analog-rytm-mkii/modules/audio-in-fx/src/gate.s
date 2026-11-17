| SPDX-License-Identifier: GPL-3.0-or-later
| The delay's entry (8 bytes, called once a block): stock has just mixed both
| sends. The block adds AUDIO IN, then stock's two displaced instructions run.
| d0-d1/a0-a1 are free at this entry, as the C code expects.
        .text
        .globl  audio_in_fx_gate
        .extern audio_in_fx_block
audio_in_fx_gate:
        jsr     audio_in_fx_block
        lea     -68(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     audio_in_fx_resume
