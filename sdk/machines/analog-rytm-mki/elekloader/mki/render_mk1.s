| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm MKI core (Modwerk): the audio interrupt's ev_render_out, in place of the bus's core_render_out.
|
| The MKI's audio handler keeps no frame pointer: it saved d0-a6 at (sp) and leaves by restoring them, dropping its
| RENDER_FRAME bytes and returning from the exception. core_render_out_mk1 is reached by jmp there, after stock
| has restored EMAC (a handler that uses EMAC saves it itself): it runs every ev_render_out handler (void f(void))
| and then leaves as stock does.

        .ifndef RENDER_FRAME
        .error "render_mk1.s: RENDER_FRAME is not defined for this machine"
        .endif

        .section .run, "ax"

        .globl core_render_out_mk1
core_render_out_mk1:
        lea ev_render_out, %a2
1:      move.l (%a2)+, %d0
        beq.s 2f
        movea.l %d0, %a0
        jsr (%a0)
        bra.s 1b
2:      movem.l (%sp), %d0-%d7/%a0-%a6
        lea RENDER_FRAME(%sp), %sp
        rte
