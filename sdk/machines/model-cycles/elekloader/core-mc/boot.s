| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Model:Cycles core: ev_boot. core.s's boot calls core_boot_init once, after it
| has copied .run and cleared .bss, before the OS starts (supervisor, interrupts and data
| cache off): handlers may write module RAM only and call no firmware routine.
| Each ev_boot entry is a handler address, void f(void), the table ended by a zero entry.

        .section .run, "ax"
        .globl core_boot_init
core_boot_init:
        move.l %a2, -(%sp)
        lea ev_boot, %a2
1:      move.l (%a2)+, %d0
        beq.s 2f
        movea.l %d0, %a0
        jsr (%a0)
        bra.s 1b
2:      movea.l (%sp)+, %a2
        rts
