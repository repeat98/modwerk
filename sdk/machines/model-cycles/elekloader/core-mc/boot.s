| SPDX-License-Identifier: GPL-2.0-or-later
| core-mc 0.3 (Model:Cycles 1.13): ev_boot, a mod's work once at boot, before
| the OS starts. core.s's .boot (BOOT_INIT) calls core_boot_init after it has
| copied the mods' RAM image, cleared their .bss, and invalidated the
| instruction and branch caches (BOOT_CACR), which the bootstrap leaves on.
|
| Handlers: void f(void), in order. The OS has not started: no firmware
| routine may be called. Its own .bss is cleared right after this, so a
| handler writes only the mods' RAM. Supervisor mode, interrupts off, the
| data cache off. Here the companion of added machines fills the tables the
| OS reads while it starts.

        .section .run, "ax"
        .globl  core_boot_init
core_boot_init:
        move.l  %a2, -(%sp)
        lea     ev_boot, %a2
1:      move.l  (%a2)+, %d0
        beq.s   2f
        movea.l %d0, %a0
        jsr     (%a0)
        bra.s   1b
2:      movea.l (%sp)+, %a2
        rts
