| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk hook bus: the audio interrupt's ev_render_in and ev_render_out (Analog Rytm MKII).
| Handlers are void f(void) at interrupt level. The bus does not save EMAC: a handler
| that uses it saves and restores what it touches, MACSR included.

        .ifndef RENDER_FRAME
        .error "render.s: RENDER_FRAME is not defined for this machine"
        .endif

        .section .run, "ax"

| core_render_in: jsr from the handler's entry. Returns with d0 = 0x7fffffff (the displaced
| instruction) and d1, a0-a2 and every other register as at entry.
        .globl core_render_in
core_render_in:
        lea -16(%sp), %sp
        movem.l %d1/%a0-%a2, (%sp)
        lea ev_render_in, %a2
.Lin:
        move.l (%a2)+, %d0
        beq.s .Lindone
        movea.l %d0, %a0
        jsr (%a0)
        bra.s .Lin
.Lindone:
        movem.l (%sp), %d1/%a0-%a2
        lea 16(%sp), %sp
        move.l #0x7fffffff, %d0
        rts

| core_render_out: jsr from the handler's exit, a6 its frame. Runs every handler, then
| the displaced restore of d0-d7/a0-a5 from a6 - RENDER_FRAME.
        .globl core_render_out
core_render_out:
        lea ev_render_out, %a2
.Lout:
        move.l (%a2)+, %d0
        beq.s .Loutdone
        movea.l %d0, %a0
        jsr (%a0)
        bra.s .Lout
.Loutdone:
        movem.l -RENDER_FRAME(%a6), %d0-%d7/%a0-%a5
        rts
