| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm core (Modwerk): the velocity routes' low bytes, sound field bytes 3..6 (store.c).
|
| A live sound's four velocity routes (+0x70) are an amount word, its high byte the amount, and a destination
| byte. Stock only ever writes the low byte as 0 and saves only the high byte, so the core keeps sound fields
| there. These hooks hide the low byte from stock's two readers (the engine copy and the menu) and keep it through
| stock's three writers (the menu's amount, setRoute for velocity and for aftertouch) and the menu's reset.

        .irp name, VEL_PUSH_RET, VEL_GET_RET, VEL_SET_RET, VEL_ROUTE_RET, AT_ROUTE_RET, SOUND_CHANGED, ROUTE_DEFAULTS
        .ifndef \name
        .error "route.s: \name is not defined for this machine"
        .endif
        .endr

        .section .run, "ax"

| st_vel_push: stock copies the amount word at 112(a1) to the engine's copy at 1216(a0). The copy gets it without
| its low byte. d3 is free here: stock sets it again right after.
        .globl st_vel_push
st_vel_push:
        move.w 112(%a1), %d3
        andi.l #0xff00, %d3
        move.w %d3, 1216(%a0)
        jmp VEL_PUSH_RET

| st_vel_get: the menu's getAmount, from here to its exit, reads the word without its low byte.
        .globl st_vel_get
st_vel_get:
        lea 0(%a3,%a3.l*2), %a0
        addq.l #4, %sp
        mvs.w 0(%a0,%d0.l), %d0
        andi.l #0xffffff00, %d0
        jmp VEL_GET_RET

| st_vel_set: the menu's setAmount stores d1 at (a0, d0). The low byte already there stays, read and written with
| interrupts masked. Leaves d0 = SOUND_CHANGED with the condition codes of that move, as stock does.
        .globl st_vel_set
st_vel_set:
        lea -12(%sp), %sp
        movem.l %d2-%d4, (%sp)
        move.w %sr, %d4
        move.w #0x2700, %sr
        mvz.b 1(%a0,%d0.l), %d3
        move.l %d1, %d2
        andi.l #0xff00, %d2
        or.l %d3, %d2
        move.w %d2, 0(%a0,%d0.l)
        move.w %d4, %sr
        movem.l (%sp), %d2-%d4
        lea 12(%sp), %sp
        move.l #SOUND_CHANGED, %d0
        jmp VEL_SET_RET

| st_vel_route, st_at_route: setRoute copies the amount word from (a1) to (a0, d0); only its high byte goes, so
| the low byte stays. The aftertouch routes are no field bytes: theirs stays 0 as stock has it.
        .macro set_route name, resume
        .globl \name
\name:
        move.b (%a1), 0(%a0,%d0.l)
        lea 19(%fp), %a1
        jmp \resume
        .endm

        set_route st_vel_route, VEL_ROUTE_RET
        set_route st_at_route, AT_ROUTE_RET

| st_vel_defaults(routes): the menu's reset calls stock's route defaults on the sound's routes (+0x70); the four
| low bytes are put back after it, with interrupts masked around both.
        .globl st_vel_defaults
st_vel_defaults:
        move.l 4(%sp), %d0
        bne.s 1f
        jmp ROUTE_DEFAULTS
1:      lea -16(%sp), %sp
        movem.l %d2-%d4/%a2, (%sp)
        movea.l %d0, %a2
        move.w %sr, %d4
        move.w #0x2700, %sr
        moveq #0, %d2
        move.b 1(%a2), %d2
        lsl.l #8, %d2
        move.b 4(%a2), %d2
        lsl.l #8, %d2
        move.b 7(%a2), %d2
        lsl.l #8, %d2
        move.b 10(%a2), %d2
        move.l %a2, -(%sp)
        jsr ROUTE_DEFAULTS
        addq.l #4, %sp
        move.l %d0, %d3
        move.b %d2, 10(%a2)
        lsr.l #8, %d2
        move.b %d2, 7(%a2)
        lsr.l #8, %d2
        move.b %d2, 4(%a2)
        lsr.l #8, %d2
        move.b %d2, 1(%a2)
        move.w %d4, %sr
        move.l %d3, %d0
        movem.l (%sp), %d2-%d4/%a2
        lea 16(%sp), %sp
        rts
