| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Analog Rytm MKI base: ev_render_out for the MKI, in place of core/render.s's core_render_out (irpina
| and Iced-Cream), which expects an a6 frame. The MKI's audio handler (vector 191, 0x40118984) keeps none: it saves
| d0-a6 at (sp) and leaves through `movem.l (sp),d0-a6 ; lea 156(sp),sp ; rte`. Site 0x4011a16c (those two, 8
| bytes; no branch lands inside them), after the EMAC state is restored, so handlers that use the EMAC save it as
| on the MKII. Every register is restored after the handlers.
        .section .run, "ax"
        .globl  core_render_out_mk1
core_render_out_mk1:
        lea     ev_render_out, %a2
1:      move.l  (%a2)+, %d0
        beq.s   2f
        movea.l %d0, %a0
        jsr     (%a0)
        bra.s   1b
2:      movem.l (%sp), %d0-%d7/%a0-%a6
        lea     156(%sp), %sp
        rte
