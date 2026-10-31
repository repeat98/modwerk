        | Stock sites for Live Rec Retrig Fix, OS 1.74. See live-rec-retrig-fix.c.

        .equ    MENU_NO_STEP,   0x400e29ee        | RETRIG menu: no step to write
        .equ    TIMING_DONE,    0x400b469a        | recorder, past the quantize

        .text

        | The RETRIG menu notes the step of its opening only in LIVE RECORDING; with
        | none noted, its pressure and rate writes to the steps never run.
        .globl  retrig_fix_menu
retrig_fix_menu:
        jmp     MENU_NO_STEP

        | The recorder drops a note's micro timing with quantize on. Over `tstb d0;
        | seq d0; mvsb d0,d0; andl d0,d5`: d0 the quantize, d2 the step, d5 the micro
        | timing, d7 the step retrig rate or -1. A retrig press goes on the retrig grid
        | first, then every note follows the quantize as stock has it, and a retrig
        | press may lose its rate here.
        .globl  retrig_fix_timing
retrig_fix_timing:
        tst.l   %d7
        blt.s   2f
        move.l  %d0,-(%sp)
        move.l  %d5,-(%sp)
        move.l  %d2,-(%sp)
        pea     4(%sp)
        pea     4(%sp)
        move.l  %d7,-(%sp)
        move.l  %d4,-(%sp)
        jsr     retrig_fix_press_place
        lea     16(%sp),%sp
        move.l  (%sp)+,%d2
        move.l  (%sp)+,%d5
        move.l  (%sp)+,%d0
2:      tst.b   %d0
        seq     %d0
        extb.l  %d0
        and.l   %d0,%d5
        tst.l   %d7
        blt.s   1f
        move.l  %d4,-(%sp)
        move.l  %d7,-(%sp)
        jsr     retrig_fix_press_rate
        addq.l  #8,%sp
        move.l  %d0,%d7
1:      jmp     TIMING_DONE

        | Over the recorder's call to set the step's retrig rate (track, step, rate):
        | d4 is the pad's track.
        .globl  retrig_fix_rate
retrig_fix_rate:
        move.l  %d4,-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     retrig_fix_step_rate
        lea     16(%sp),%sp
        rts

        | Over the RETRIG menu's key-down test in its YES branch (the event at 4(sp),
        | a2 the menu): the menu's track gets ALWAYS ON turned over. 0 back takes
        | stock's "not a press" exit, so the row's own YES action does not run.
        .globl  retrig_fix_yes
retrig_fix_yes:
        move.l  %a2,-(%sp)
        move.l  8(%sp),-(%sp)
        jsr     retrig_fix_menu_yes
        addq.l  #8,%sp
        rts

        | Over the recorder's note-off call that sets a retrig's LEN (track, step, len):
        | d6 is the note's track.
        .globl  retrig_fix_length
retrig_fix_length:
        move.l  %d6,-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     retrig_fix_step_length
        lea     16(%sp),%sp
        rts

        | SeqSettingsMenuView's constructor, after its last row, over its `moveml` and
        | return: the RETRIG GRID row. a3 is the view. core_additem keeps the registers
        | the exit restores anyway.
        .globl  retrig_grid_menu_add
retrig_grid_menu_add:
        pea     retrig_grid_row
        move.l  %a3,-(%sp)
        jsr     core_additem
        addq.l  #8,%sp
        movem.l 24(%sp),%d2-%d6/%a2-%fp
        lea     128(%sp),%sp
        rts
