        | Stock sites for Retrig Rec, OS 1.74. See retrig-rec.c.

        .equ    MENU_NO_STEP,   0x400e29ee        | RETRIG menu: no step to write
        .equ    TIMING_DONE,    0x400b469a        | recorder, past the quantize

        .text

        | The RETRIG menu notes the step of its opening only in LIVE RECORDING; with
        | none noted, its pressure and rate writes to the steps never run.
        .globl  retrig_rec_menu
retrig_rec_menu:
        jmp     MENU_NO_STEP

        | The recorder drops a note's micro timing with quantize on. Over `tstb d0;
        | seq d0; mvsb d0,d0; andl d0,d5`: d0 the quantize, d5 the micro timing, d7 the
        | step retrig rate or -1. Every note follows the quantize as stock has it, and a
        | retrig press may lose its rate here.
        .globl  retrig_rec_timing
retrig_rec_timing:
        tst.b   %d0
        seq     %d0
        extb.l  %d0
        and.l   %d0,%d5
        tst.l   %d7
        blt.s   1f
        move.l  %d4,-(%sp)
        move.l  %d7,-(%sp)
        jsr     retrig_rec_press_rate
        addq.l  #8,%sp
        move.l  %d0,%d7
1:      jmp     TIMING_DONE

        | Over the recorder's call to set the step's retrig rate (track, step, rate):
        | d4 is the pad's track.
        .globl  retrig_rec_rate
retrig_rec_rate:
        move.l  %d4,-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     retrig_rec_step_rate
        lea     16(%sp),%sp
        rts

        | Over the RETRIG menu's key-down test in its YES branch (the event at 4(sp),
        | a2 the menu): the menu's track gets ALWAYS ON turned over. 0 back takes
        | stock's "not a press" exit, so the row's own YES action does not run.
        .globl  retrig_rec_yes
retrig_rec_yes:
        move.l  %a2,-(%sp)
        move.l  8(%sp),-(%sp)
        jsr     retrig_rec_menu_yes
        addq.l  #8,%sp
        rts

        | Over the recorder's note-off call that sets a retrig's LEN (track, step, len):
        | d6 is the note's track.
        .globl  retrig_rec_length
retrig_rec_length:
        move.l  %d6,-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     retrig_rec_step_length
        lea     16(%sp),%sp
        rts
