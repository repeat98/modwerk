| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Analog Rytm MKI base: ev_settings for the MKI, in place of core/settings.s's core_settings (irpina and
| Iced-Cream), whose GLOBAL menu is in a2. The MKI's GLOBAL builder (0x400d4e66, run once at boot) keeps the menu
| in a3. Site 0x400d545e (was `movea.l (a3),a0 ; pea 2.w`), after the last row and before the selection is
| restored; every ev_settings handler gets the menu, as on the MKII.
        .section .run, "ax"
        .globl  core_settings_mk1
core_settings_mk1:
        move.l  %a2, -(%sp)
        lea     ev_settings, %a2
1:      move.l  (%a2)+, %d0
        beq.s   2f
        move.l  %a3, -(%sp)             | the menu
        movea.l %d0, %a0
        jsr     (%a0)
        addq.l  #4, %sp
        bra.s   1b
2:      movea.l (%sp)+, %a2
        movea.l (%a3), %a0              | the instructions this replaced
        pea     2.w
        jmp     SETTINGS_RET
