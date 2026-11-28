| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: the PERSONALIZE menu event ev_personalize.

        .section .run, "ax"

| core_personalize: reached by jmp from the PERSONALIZE builder's epilogue, after its last row, menu in a4.
| Runs every ev_personalize handler as f(menu), then the builder's own epilogue: restore d2-d6/a2-a6 from
| 0x18(sp), drop its 0x80-byte frame and return to its caller. The restore makes every register free here.
        .globl core_personalize
core_personalize:
        lea ev_personalize, %a2
.Lnext:
        move.l (%a2)+, %d0
        beq.s .Ldone
        movea.l %d0, %a0
        move.l %a4, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        bra.s .Lnext
.Ldone:
        movem.l 0x18(%sp), %d2-%d6/%a2-%a6
        lea 0x80(%sp), %sp
        rts
