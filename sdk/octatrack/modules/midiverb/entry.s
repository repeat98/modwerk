| SPDX-License-Identifier: MIT
| Midiverb's program name in stock's message box when PROG turns, the bank's name when BANK does. The base's ev_knob_store take
| (runtime.json) hands Midiverb the knob handler's store while the FX2 page is shown; the entry names the
| program when the page's slot A is PROG (the page is known by its descriptor's slot name), then stores the
| byte as stock does. Only a knob turn stores there: locks, LFOs and scenes never pop a name up. Stock
| addresses: OS 1.40C.

        .text
        .equ    PAGE, 0x460d1684        | the page shown (long): 4 is FX2
        .equ    NOTIFY, 0x4005a2b8      | stock's message box: (text, duration in 1/60 s)
        .equ    PROG, 0x50524f47        | "PROG", slot A's name in our descriptor

| claims(arg), C: take the knob handler's store while the FX2 page is shown.
        .global mv_knob_claims
mv_knob_claims:
        moveq   #0,%d0
        moveq   #4,%d1
        cmp.l   PAGE,%d1
        bne.s   1f
        moveq   #1,%d0
1:      rts

| 0x40055170, the knob handler's store (jsr entry): d2 the clamped new value, d5 the slot, a3 the page
| descriptor (slot names at +0x16), a2/a5 the Part byte and its SRAM mirror; the Part keeps a page's six
| values together, so slot D's byte is slot A's + 3. Only d1 is free; the three instructions the site held
| store d2 and load d1, and the flags they leave go back to stock.
        .global mv_knob_entry
mv_knob_entry:
        move.l  0x16(%a3),%d1
        cmpi.l  #PROG,%d1
        bne.s   9f                      | not Midiverb's page: as stock
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        move.l  %a3,-(%sp)
        jsr     mv_stage                | PROG's and BANK's staging (stream.c)
        addq.l  #4,%sp
        tst.l   %d5
        beq.s   1f
        moveq   #3,%d1
        cmp.l   %d1,%d5
        bne.s   8f                      | another slot: no name
1:      moveq   #0,%d0                  | bank
        moveq   #0,%d1                  | prog
        tst.l   %d5
        bne.s   2f
        move.b  %d2,%d1                 | PROG turned: BANK from the Part
        move.b  3(%a2),%d0
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     mv_name
        addq.l  #8,%sp
        bra.s   3f
2:      move.b  %d2,%d0                 | BANK turned: its name
        move.l  %d0,-(%sp)
        jsr     mv_bank_name
        addq.l  #4,%sp
3:
        moveq   #72,%d1                 | 1.2 s
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     NOTIFY
        addq.l  #8,%sp
8:      movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
9:      move.b  %d2,(%a2)               | displaced: the Part byte
        move.b  %d2,(%a5)               | displaced: its mirror
        move.w  %fp,%d1                 | displaced
        rts

| 0x4000d568, the frame interrupt once stock's parameter builder, scenes and LFOs have written the eight records
| (Euclid's detour at 0x4000d562 returns here): stream each Midiverb track's program into its record, then the
| displaced instruction. a1 (the next code's pointer) and every other register go back as found.
        .global mv_frame_hook
mv_frame_hook:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr     mv_frame
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        move.l  #0x75180000,%d0         | displaced
        jmp     0x4000d56e

| The take record (struct modwerk_take {claims, entry}).
        .global mv_take_knob
mv_take_knob:
        .long   mv_knob_claims, mv_knob_entry
