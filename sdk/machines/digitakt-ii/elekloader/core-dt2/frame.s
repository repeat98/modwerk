| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: ev_frame_params, each frame's per-track values before the stock modulators.

        .section .run, "ax"

| core_frame(block): reached by jsr in the frame interrupt in place of jsr MODS_STOCK, block at 4(sp).
| Runs every ev_frame_params handler as f(block + 0x22, FRAME_STRIDE), then MODS_STOCK on the stack the
| stock call had, so it returns to the site. With no handler: one test and the jump.
        .globl core_frame
core_frame:
        tst.l ev_frame_params
        beq.s .Lstock
        lea -8(%sp), %sp
        movem.l %a2-%a3, (%sp)
        movea.l 12(%sp), %a3
        lea 0x22(%a3), %a3
        lea ev_frame_params, %a2
.Lnext:
        move.l (%a2)+, %d0
        beq.s .Ldone
        movea.l %d0, %a0
        pea FRAME_STRIDE
        move.l %a3, -(%sp)
        jsr (%a0)
        addq.l #8, %sp
        bra.s .Lnext
.Ldone:
        movem.l (%sp), %a2-%a3
        lea 8(%sp), %sp
.Lstock:
        jmp MODS_STOCK
