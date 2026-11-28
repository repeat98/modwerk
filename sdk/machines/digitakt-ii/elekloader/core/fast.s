| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk hook bus: copies modules' .fast code into SRAM on the first ev_tick.
| core_fast entries are {DDR source, SRAM destination, bytes (a multiple of 4), 0},
| ended by an entry whose first word is 0. core-dt2's mod.json subscribes core_fastcopy
| to ev_tick at order 0, so the copy is done before any other tick handler runs.

        .section .run, "ax"
        .globl core_fastcopy
core_fastcopy:
        tst.l .Lcopied
        bne.s .Ldone
        move.l %a2, -(%sp)
        lea core_fast, %a2
.Lentry:
        move.l (%a2), %d0
        beq.s .Lend
        movea.l %d0, %a0
        movea.l 4(%a2), %a1
        move.l 8(%a2), %d1
        lsr.l #2, %d1
        beq.s .Lskip
.Lword:
        move.l (%a0)+, (%a1)+
        subq.l #1, %d1
        bne.s .Lword
.Lskip:
        lea 16(%a2), %a2
        bra.s .Lentry
.Lend:
        moveq #1, %d0
        move.l %d0, .Lcopied
        movea.l (%sp)+, %a2
.Ldone:
        rts

        .section .bss, "aw", @nobits
        .balign 4
.Lcopied:
        .space 4
