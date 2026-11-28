| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: the label invoker of core_addvalue's rows (rows.c builds the rows).

        .section .run, "ax"

| core_value_label(storage): the MenuItem's label callback. Returns a std::string through the hidden
| pointer in a0, built from the row's label with FW_STR_NEW(dst, cstr, alloc); the pointer is returned in d0
| (and a0). storage's first word is the row's cell {row, menu}, row's first word its label.
        .globl core_value_label
core_value_label:
        move.l %a2, -(%sp)
        movea.l %a0, %a2
        movea.l 8(%sp), %a1
        movea.l (%a1), %a1
        movea.l (%a1), %a1
        pea .Lalloc
        move.l (%a1), -(%sp)
        move.l %a2, -(%sp)
        jsr FW_STR_NEW
        lea 12(%sp), %sp
        move.l %a2, %d0
        movea.l %a2, %a0
        movea.l (%sp)+, %a2
        rts

        .section .bss, "aw", @nobits
.Lalloc:
        .space 4
