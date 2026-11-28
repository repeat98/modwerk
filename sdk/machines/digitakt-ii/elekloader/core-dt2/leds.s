| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: ev_key_leds, the key-LED frame between the clear and the stock views.

        .section .run, "ax"

| core_key_leds(mgr): reached by jsr in place of "jsr LEDS_CLEAR; move.l d2,-(sp)", mgr at 4(sp).
| Clears the LEDs, runs every ev_key_leds handler as f(mgr), then returns with d2 pushed over the
| return slot, as the second displaced instruction left the stack. d2 and a2 are kept.
        .globl core_key_leds
core_key_leds:
        move.l %a2, -(%sp)
        move.l 8(%sp), -(%sp)
        jsr LEDS_CLEAR
        addq.l #4, %sp
        lea ev_key_leds, %a2
.Lnext:
        move.l (%a2)+, %d0
        beq.s .Ldone
        movea.l %d0, %a0
        move.l 8(%sp), -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        bra.s .Lnext
.Ldone:
        movea.l (%sp)+, %a2
        movea.l (%sp), %a0
        move.l %d2, (%sp)
        jmp (%a0)
