| SPDX-License-Identifier: GPL-3.0-or-later
| Send FX: the FX returns' hook.
|
| The audio block calls one routine with the output slot in its argument; it
| runs the PRE return mixer (delay and reverb into the analog mixer, before
| distortion and the compressor), then the POST one, and ends with
| `movel #32,%macsr` (6 bytes), with d2 still holding the slot. The detour
| replaces that instruction: it sets the MAC mode as stock does, then runs the
| effect, which adds its stereo return to the PRE words the mixer has just
| written. d0, d1, a0 and a1 are free here (stock returns next); the C code
| keeps d2-d7/a2-a6. The addresses come from build.json for each OS release.

        .text
        .globl  send_fx_gate
        .extern send_fx_block

send_fx_gate:
        move.l  #32,%macsr                        | stock
        move.l  %d2,-(%sp)
        jsr     send_fx_block
        addq.l  #4,%sp
        jmp     send_fx_resume
