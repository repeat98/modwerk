| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Model:Cycles base: ev_key_leds, the key-LED frame after the LEDs are
| cleared and before the stock views set theirs. The same event and prototype
| as the Digitakt II's (core-dt2 1.1, leds.s). ColdFire V4e; OS 1.13.
|
| The LED frame (0x40006a4a) runs while the view controller's byte +0x21 is set:
| it gets the LED manager (0x400cfaf4), clears every LED's owner slot
| (0x4000602a, the manager pushed before it), lets the views set theirs
| (0x40076ca2) and turns off what nobody set (0x40006044). The site is the
| manager's push and the clear's call (0x40006a6e, 6 bytes, move.l d0,-(sp)
| then jsr (pc)); the manager is in d0 there, and the code after it pops that
| push with the views' argument.
|
| Handlers: void f(void *mgr), on the UI task, C convention (d0-d1/a0-a1
| free). fw_led_set(mgr, led, state) lights an LED with state 2 and turns it off
| with 1; it refuses an LED whose slot is set, so what a handler sets stays over
| the views'. TRIG n is LED n. A handler whose LEDs change asks for a frame by
| setting ctrl + 0x21 to 1 in its ev_tick handler (ctrl is the view controller
| that frame reads).
        .section .run, "ax"
        .globl  core_key_leds
core_key_leds:
        move.l  %d0, -(%sp)             | mgr, the clear's argument
        jsr     LEDS_CLEAR
        move.l  %a2, -(%sp)             | stack: a2, mgr, return
        lea     ev_key_leds, %a2
1:      move.l  (%a2)+, %d0
        beq.s   2f
        move.l  4(%sp), -(%sp)          | mgr
        movea.l %d0, %a0
        jsr     (%a0)
        addq.l  #4, %sp
        bra.s   1b
2:      movea.l (%sp)+, %a2
        move.l  (%sp)+, %d0             | mgr
        movea.l (%sp)+, %a0             | the return
        move.l  %d0, -(%sp)             | the push the site displaced
        jmp     (%a0)

| fw_led_set(mgr, led, state): the OS's own setter (0x40005f86), for handlers.
        .globl  fw_led_set
        .set    fw_led_set, FW_LED_SET
