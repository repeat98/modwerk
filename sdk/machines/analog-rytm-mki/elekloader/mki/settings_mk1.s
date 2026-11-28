| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm MKI core (Modwerk): the GLOBAL menu event ev_settings, in place of the bus's core_settings.
|
| The MKI's GLOBAL builder keeps its menu in a3, not a2. core_settings_mk1 is reached by jmp after the menu's last
| row: it runs every ev_settings handler as f(menu), then redoes the two instructions its site replaced (a0 = the
| menu's vtable, push 2) and goes on in the builder at SETTINGS_RET.

        .ifndef SETTINGS_RET
        .error "settings_mk1.s: SETTINGS_RET is not defined for this machine"
        .endif

        .section .run, "ax"

        .globl core_settings_mk1
core_settings_mk1:
        move.l %a2, -(%sp)
        lea ev_settings, %a2
1:      move.l (%a2)+, %d0
        beq.s 2f
        movea.l %d0, %a0
        move.l %a3, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        bra.s 1b
2:      movea.l (%sp)+, %a2
        movea.l (%a3), %a0
        pea 2.w
        jmp SETTINGS_RET
