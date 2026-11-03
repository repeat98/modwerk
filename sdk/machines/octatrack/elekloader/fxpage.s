| SPDX-License-Identifier: GPL-3.0-or-later
| The shared wide dial (build_core.py --dsp-loader): a labelled control with more than five values draws
| its value over the plain dial's whole arc. Octabam's tools/build/wide_dial.py, with its table in base
| RAM: fxpage.c lists each listed module page's wide formatters and their maxima there, 0-ended.
        .text
        .global mw_wide_dial

| 0x40047a3c, the dial draw: a2 = the slot's formatter, d2 = its value. Displaced: moveq #2,%d6 ;
| and.l %d5,%d6 ; beq.s 0x40047a8a.
mw_wide_dial:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        lea     modwerk_wide_table,%a0
1:      move.l  (%a0)+,%a1
        tst.l   %a1
        beq.s   3f
        cmpa.l  %a2,%a1
        beq.s   2f
        addq.l  #4,%a0
        bra.s   1b
2:      move.l  (%a0),%d1                       | value * 127 / maximum, rounded, the value at most the maximum
        move.l  %d2,%d0
        cmp.l   %d1,%d0
        bls.s   4f
        move.l  %d1,%d0
4:      move.l  %d1,%a1
        moveq   #127,%d1
        mulu.l  %d1,%d0
        move.l  %a1,%d1
        lsr.l   #1,%d1
        add.l   %d1,%d0
        move.l  %a1,%d1
        divu.l  %d1,%d0
        move.l  %d0,%d2
3:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        moveq   #2,%d6
        and.l   %d5,%d6
        beq.s   5f
        jmp     0x40047a42
5:      jmp     0x40047a8a

| A module page's knob step (build_core.py --dsp-loader, KNOB_STEP). The panel works out each knob's step when it
| stages a page: a step every 32768 / max(count, 40) of the knob's accumulator, 256 added a detent, so a select takes
| about 3.2 detents a value and a 0..127 knob one. A module page chosen on SETUP and entered at once still has the
| previous page's staging (every stock effect's main page is 0..127 throughout), so a select on it moved a value a
| detent until the page was entered again (RINGMOD SC's KEY, ot_emu 13 Oct 2026; MKII 21 Oct 2026). The knob routine
| of an audio track's main pages (0x40055008: SRC, AMP, LFO, FX1, FX2) names the default stepper by an lea for a live
| turn; the base names this instead. On a descriptor that is not stock's own (outside the OS image's RAM copy: a page
| the base or a module built) it stages the turned knob's step and count from that descriptor, as stock's stager
| would, then goes on into the stepper; on stock's pages it goes straight on, untouched. The routine's MIDI-track
| branch and turns with a trig held do not reach it.
        .global mw_knob_step
        .equ    MW_STEPPER, 0x4003240c                  | the default stepper: (slot, detents, value) -> value
        .equ    MW_KNOB_REC, 0x46c7dede                 | 20 B a knob: +8 the step threshold, +16 the count
        .equ    MW_KNOB_RUN, 0x46c7d244                 | 20 B a knob: +0 the running remainder (the stepper's)
        .equ    MW_P_COUNT, 0x9a                        | descriptor: count, 4 B a slot
        .equ    MW_STOCK_END, 0x400de1e0                | the end of the OS image's descriptors (fxpage.c DONOR_HIGH)

mw_knob_step:
        cmpa.l  #MW_STOCK_END,%a3                       | a3: the descriptor the routine resolved
        bcs.s   2f                                      | stock's own: as stock
        move.l  4(%sp),%d0                              | the slot
        lea     (%a3,%d0.l*4),%a0
        move.l  MW_P_COUNT(%a0),%d1                     | its count
        move.l  %d0,%a0
        lsl.l   #2,%d0
        add.l   %a0,%d0
        lsl.l   #2,%d0                                  | 20 * slot
        move.l  %d0,%a0
        add.l   #MW_KNOB_REC,%a0
        move.l  %d1,16(%a0)
        moveq   #40,%d0
        cmp.l   %d1,%d0
        ble.s   1f
        move.l  %d0,%d1                                 | as stock: no select steps faster than one of 40
1:      move.l  #32768,%d0
        divs.l  %d1,%d0
        cmp.l   8(%a0),%d0
        beq.s   2f                                      | staged as stock would: the turn's remainder stays
        move.l  %d0,8(%a0)
        sub.l   #MW_KNOB_REC-MW_KNOB_RUN,%a0            | a new step: as stock's stager (0x400326d4) does with one,
        clr.l   (%a0)                                   | clear the knob's running record (+0 the remainder the
        clr.l   4(%a0)                                  | stepper carries between detents), so a 0..127 knob after
        clr.l   8(%a0)                                  | a select's step neither jumps nor steps back
        clr.l   12(%a0)
2:      jmp     (MW_STEPPER).l
