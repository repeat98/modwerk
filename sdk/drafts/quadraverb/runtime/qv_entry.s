| SPDX-License-Identifier: GPL-3.0-or-later
| The program's number and name in stock's message box when PROG turns on Quadraverb's FX2 page, as Midiverb's entry.s
| names its own. The base's ev_knob_store take (runtime.json) asks qv_knob_claims at every knob turn's store; it takes
| only slot A of the page the base installed for this module (qv_page: the descriptor itself, not its slot name, so
| another module's PROG never shows these names). Only a knob turn stores there: locks, LFOs and scenes never pop a
| name up. Stock addresses: OS 1.40C. engine/qvcf.py asm appends this file to gen/qv_runtime.s.

        .text
        .equ    PAGE, 0x460d1684        | the page shown (long): 4 is FX2
        .equ    NOTIFY, 0x4005a2b8      | stock's message box: (text, duration in 1/60 s)

| claims(), C convention, at 0x40055170 with d5 (the slot) and a3 (the page descriptor) as at the site: 1 for PROG on
| our own FX2 page, else 0 and the turn goes on to the next taker or stock.
        .global qv_knob_claims
qv_knob_claims:
        moveq   #4,%d0
        cmp.l   PAGE,%d0
        bne.s   9f                      | not the FX2 page
        tst.l   %d5
        bne.s   9f                      | not slot A, PROG
        jsr     qv_page                 | our installed page, or 0 (qv_runtime.c)
        tst.l   %d0
        beq.s   9f
        cmpa.l  %d0,%a3
        bne.s   9f                      | another effect's page
        moveq   #1,%d0
        rts
9:      moveq   #0,%d0
        rts

| entry, jsr from 0x40055170 (the knob handler's store) once claims took it: d2 the clamped new value, a2/a5 the Part
| byte and its SRAM mirror. Only d1 is free; the three instructions the site held store d2 and load d1, and the flags
| they leave go back to stock.
        .global qv_knob_entry
qv_knob_entry:
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        moveq   #0,%d1
        move.b  %d2,%d1
        move.l  %d1,-(%sp)
        jsr     qv_name                 | the program this value picks (qv_runtime.c)
        addq.l  #4,%sp
        moveq   #72,%d1                 | 1.2 s
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     NOTIFY
        addq.l  #8,%sp
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
        move.b  %d2,(%a2)               | displaced: the Part byte
        move.b  %d2,(%a5)               | displaced: its mirror
        move.w  %fp,%d1                 | displaced
        rts

| The take record (struct modwerk_take {claims, entry}).
        .balign 4
        .global qv_take_knob
qv_take_knob:
        .long   qv_knob_claims, qv_knob_entry
