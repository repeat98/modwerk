| SPDX-License-Identifier: GPL-2.0-or-later
| Mute Latch, Digitakt II OS 1.17: the key-LED frame site (jsr of the LED clear plus the push after it,
| 6 bytes). Same shape as core-dt2 1.1's key-LED hook: clear every LED, let mlk_leds set the parked tracks'
| TRIG LEDs, then replay the push the site displaced. ColdFire V4; assemble with -mcpu=54455.
        .text
        .globl  mlk_leds_site
mlk_leds_site:
        move.l  4(%sp), -(%sp)          | mgr
        jsr     0x4003098e              | the LED clear the site displaced
        addq.l  #4, %sp
        move.l  4(%sp), -(%sp)          | mgr again, for the handler
        jsr     mlk_leds
        addq.l  #4, %sp
        movea.l (%sp)+, %a0             | the return
        move.l  %d2, -(%sp)             | the push the site displaced
        jmp     (%a0)
