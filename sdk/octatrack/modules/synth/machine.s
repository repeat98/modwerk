| FM Synth registration, derived from Modwerk's Analog BD chooser hooks.
| FLEX plus FM/1 signature in unused NEIGHBOR page bytes; all eight tracks.
| A new assignment seeds both Part copies; reselect preserves the patch.
| Playback resolves our runtime descriptor per track. Audio enters through
| the native renderer kind table, leaving AMP, FX1 and FX2 to stock.
        .text
        .global fm_machine_name
        .global fm_src_names
        .global fm_main_commit
        .global fm_src_commit
        .global fm_name_a, fm_name_b
        .global fm_setup_row, fm_chooser_row
        .global fm_setup_open, fm_chooser_open
        .global fm_src_commit2, fm_setup_edit6, fm_setup_draw6
        .global fm_resolve_pb
        .global fm_sig_check
        .global fm_validate

        .equ    FM_ROW, 5
        .equ    FLEX, 1
        .equ    SRC_CURSOR, 0x460d5c30
        .equ    BANK_PTR, 0x46c82456
        .equ    PART_IDX, 0x100b14cf
        .equ    PART_STRIDE, 6322
        .equ    PART_OFF, 0x8ed80
        .equ    SRAM_PART, 0x100a4ece
        .equ    SIG_OFF, 0x2a + 18
        .equ    FLEX_P, 0x400d31ae
        .equ    PAGE2_GAP, 0x1da - 0x2a
        .equ    PB_TABLE, 0x400d5f38

fm_sig_check:
        lea     -8(%sp),%sp
        movem.l %d1/%a1,(%sp)
        moveq   #0,%d1
        move.b  0x22(%a0,%d0.l),%d1
        cmpi.l  #FLEX,%d1
        bne.s   .sc_no
        move.l  %d0,%d1
        mulu.w  #30,%d1
        lea     SIG_OFF(%a0,%d1.l),%a1
        move.b  (%a1),%d1
        cmpi.b  #'F',%d1
        bne.s   .sc_no
        move.b  1(%a1),%d1
        cmpi.b  #'M',%d1
        bne.s   .sc_no
        move.b  2(%a1),%d1
        cmpi.b  #1,%d1
        bne.s   .sc_no
        moveq   #1,%d0
        bra.s   .sc_done
.sc_no:
        moveq   #0,%d0
.sc_done:
        movem.l (%sp),%d1/%a1
        lea     8(%sp),%sp
        rts

fm_sig_write:
        lea     -16(%sp),%sp
        movem.l %d0-%d2/%a1,(%sp)
        mulu.w  #30,%d0
        lea     SIG_OFF(%a0,%d0.l),%a1
        bsr.s   .sw_one
        move.l  %a0,%d2
        sub.l   (BANK_PTR).l,%d2
        subi.l  #PART_OFF,%d2
        addi.l  #SRAM_PART + SIG_OFF,%d2
        add.l   %d0,%d2
        movea.l %d2,%a1
        bsr.s   .sw_one
        movem.l (%sp),%d0-%d2/%a1
        lea     16(%sp),%sp
        rts
.sw_one:
        tst.l   %d1
        beq.w   .sw_clear
        mvz.w  (%a1),%d2
        cmpi.w #0x464d,%d2
        bne.s  .sw_seed
        mvz.b  2(%a1),%d2
        cmpi.b #1,%d2
        beq.s  .sw_mark
.sw_seed:
        move.l %a0,-(%sp)
        move.l %d0,-(%sp)
        lea fm_defaults,%a0
        moveq #5,%d0
.sw_defaults1:
        move.b (%a0)+,-12(%a1)
        addq.l #1,%a1
        subq.l #1,%d0
        bpl.s .sw_defaults1
        lea -6(%a1),%a1
        moveq #5,%d0
.sw_defaults2:
        move.b (%a0)+,PAGE2_GAP-12(%a1)
        addq.l #1,%a1
        subq.l #1,%d0
        bpl.s .sw_defaults2
        lea -6(%a1),%a1
        move.l (%sp)+,%d0
        move.l (%sp)+,%a0
.sw_mark:
        move.b #'F',(%a1)
        move.b  #'M',1(%a1)
        move.b  #1,2(%a1)
        rts
.sw_clear:
        mvz.w  (%a1),%d2
        cmpi.w  #0x464d,%d2
        bne.s   .sw_out
        mvz.b  2(%a1),%d2
        cmpi.b  #1,%d2
        bne.s   .sw_out
        clr.b   (%a1)
        clr.b   1(%a1)
        clr.b   2(%a1)
.sw_out:
        rts

fm_machine_name:
        move.l  4(%sp),%d0
        cmpi.l  #FM_ROW,%d0
        beq.s   1f
        move.l  %d2,-(%sp)
        move.l  8(%sp),%d1
        jmp     (0x400334de).l
1:      lea     fm_name(%pc),%a0
        move.l  %a0,%d0
        rts

        .balign 4
fm_src_names:
        .long   0x400b3eac
        .long   0x400b3e98
        .long   0x400b7c67
        .long   0x400b5413
        .long   0x400b7a63
        .long   fm_name

fm_admit:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %a0,(%sp)
        move.l %d0,4(%sp)
        jsr fm_admit_track
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts

fm_main_commit:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        movea.l %a1,%a0
        adda.l  %d0,%a0
        adda.l  #PART_OFF,%a0
        move.l  %d1,%d0
        cmpi.l  #FM_ROW,%d4
        bne.s   .mc_other
        bsr     fm_admit
        tst.l   %d0
        beq.s   .mc_refuse
        move.l  %d1,%d0
        moveq   #1,%d1
        bsr     fm_sig_write
        moveq   #FLEX,%d4
        bra.s   .mc_store
.mc_other:
        moveq   #0,%d1
        bsr     fm_sig_write
.mc_store:
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        mvs.b   (%a0),%d3
        move.b  %d4,(%a0)
        add.l   %d1,%d0
        jmp     (0x40079822).l
.mc_refuse:
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        pea     0x30.w
        pea     fm_reject_name(%pc)
        jsr     (0x4005a2b8).l
        addq.l  #8,%sp
        jmp     (0x4007989c).l

fm_src_commit:
        pea     (0x4005a61c).l
        bra.s   fm_src_common
fm_src_commit2:
        pea     (0x4005a856).l
fm_src_common:
        move.l  (SRC_CURSOR).l,%d1
        lea     -12(%sp),%sp
        movem.l %d0/%d2/%a0,(%sp)
        movea.l %a1,%a0
        adda.l  %d0,%a0
        adda.l  #PART_OFF,%a0
        move.l  %d2,%d0
        cmpi.l  #FM_ROW,%d1
        bne.s   .sc_other
        bsr     fm_admit
        tst.l   %d0
        beq.s   .sc_refuse
        move.l  %d2,%d0
        moveq   #1,%d1
        bsr     fm_sig_write
        moveq   #FLEX,%d1
        bra.s   .sc_go
.sc_other:
        move.l  %d1,-(%sp)
        moveq   #0,%d1
        bsr     fm_sig_write
        move.l  (%sp)+,%d1
.sc_go:
        movem.l (%sp),%d0/%d2/%a0
        lea     12(%sp),%sp
        rts
.sc_refuse:
        movem.l (%sp),%d0/%d2/%a0
        lea     12(%sp),%sp
        moveq   #0,%d1
        move.b  (%a0),%d1
        move.l  %d1,(SRC_CURSOR).l
        pea     0x30.w
        pea     fm_reject_name(%pc)
        jsr     (0x4005a2b8).l
        addq.l  #8,%sp
        rts

fm_setup_open:
        move.b  (%a0),%d3
        move.l  %d0,-(%sp)
        mvs.b   %d3,%d0
        bsr     fm_row_type
        move.l  %d0,%d3
        move.l  (%sp)+,%d0
        mvs.b   %d3,%d4
        pea     (0x400bb704).l
        jmp     (0x400585e6).l

fm_setup_edit6:
        cmpi.l  #FM_ROW,%d2
        bne.s   1f
        moveq   #FLEX,%d2
1:      move.l  %d2,%d0
        lsl.l   #3,%d0
        add.l   %d2,%d2
        sub.l   %d2,%d0
        jmp     (0x4003a536).l
fm_setup_draw6:
        cmpi.l  #FM_ROW,%d6
        bne.s   1f
        moveq   #FLEX,%d6
1:      move.l  %d6,%d7
        lsl.l   #3,%d7
        add.l   %d6,%d6
        sub.l   %d6,%d7
        jmp     (0x4003cda0).l

fm_chooser_open:
        mvs.b   (%a0),%d0
        bsr     fm_row_type
        move.l  %d0,-(%sp)
        pea     (0x460e7386).l
        jmp     (0x40078890).l

fm_name_a:
        bsr.s   fm_name_pick
        jmp     (0x4003d722).l
fm_name_b:
        bsr.s   fm_name_pick
        jmp     (0x4004c374).l
fm_name_pick:
        bsr fm_row_type
        lea fm_src_names(%pc),%a0
        move.l (%a0,%d0.l*4),%d1
        rts

fm_setup_row:
        mvs.b   (%a0),%d0
        lea     24(%sp),%sp
        bsr.s   fm_row_type
        jmp     (0x4003c986).l
fm_chooser_row:
        mvs.b   (%a0),%d0
        bsr.s   fm_row_type
        cmp.l   %d0,%d2
        bne.s   1f
        jmp     (0x400786ce).l
1:      jmp     (0x400786fc).l
fm_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr fm_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts

fm_resolve_pb:
        mvs.b %d5,%d0
        bsr fm_row_type
        cmpi.l #FM_ROW,%d0
        bne.s 1f
        move.l %a0,-(%sp)
        jsr fm_track_page
        addq.l #4,%sp
        jmp (0x40031ed6).l
1:      lea (PB_TABLE).l,%a0
        jmp (0x40031ece).l


fm_validate:
        jmp fm_validate_part
        .global fm_stock_validate
fm_stock_validate:
        lea -96(%sp),%sp
        movem.l %d2-%d7/%a2-%fp,(%sp)
        jmp (0x40002320).l

        .global fm_tick_hook
fm_tick_hook:
        jsr 0x4005213c
        jsr 0x4007e940
        jsr fm_ui_tick
        jmp 0x40052228
fm_name:
        .asciz "FM SYNTH"
fm_reject_name:
        .asciz "FM: INVALID TRACK"
        .balign 2
