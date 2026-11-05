| FM SYNTH independent setup locks. Adapted from the SY DRUM sequence-edit mechanism.
        .global fl_clear_track_hook,fl_clear_page_hook,fl_shift_hook,fl_clear_selected_hook,fl_live_erase_hook,fl_live_erase_tail,fl_duplicate_hook,fl_page_nonempty_tail

fl_clear_track_hook:
        bsr     fl_clear_track
        .if HAVE_SYDRUM
        jmp sl_clear_track_hook:l
        .else
        lea     -60(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40039dfc
        .endif
fl_clear_track:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  76(%sp),%d0
        btst    #0,%d0
        beq     fl_ct_out
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        moveq   #0,%d3
        moveq   #64,%d7
        bsr     fl_clear_rows
fl_ct_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
fl_clear_page_hook:
        bsr     fl_clear_page
        .if HAVE_SYDRUM
        jmp sl_clear_page_hook:l
        .else
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x400398bc
        .endif
fl_clear_page:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        move.l  76(%sp),%d3
        cmpi.l  #4,%d3
        bcc     fl_cp_out
        lsl.l   #4,%d3
        moveq   #16,%d7
        bsr     fl_clear_rows
fl_cp_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_clear_rows:
        moveq   #0,%d4
        move.l  #255,%d5
fl_cr_control:
        mvz.b   0x100b14ce,%d0
        bsr     fl_write
        addq.l  #1,%d4
        cmpi.l  #FL_CONTROLS,%d4
        bne     fl_cr_control
        moveq   #0,%d4
        addq.l  #1,%d3
        subq.l  #1,%d7
        bne     fl_cr_control
        rts

fl_shift_hook:
        bsr     fl_shift_rows
        .if HAVE_SYDRUM
        jmp sl_shift_hook:l
        .else
        move.l  124(%sp),%d0
        btst    #0,%d0
        jmp     0x4003d91e
        .endif
fl_shift_rows:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        tst.l   192(%sp)
        bne     fl_sr_out
        move.l  188(%sp),%d0
        btst    #0,%d0
        beq     fl_sr_out
        move.l  136(%sp),%d7
        cmpi.l  #2,%d7
        bcs     fl_sr_out
        cmpi.l  #64,%d7
        bhi     fl_sr_out
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     fl_sr_out
        move.w  %sr,%d6
        movea.l %d6,%a6
        move.w  #0x2700,%sr
        move.l  fl_ready_mask:l,%d6
        btst    %d0,%d6
        beq     fl_sr_unlock
        move.l  fl_blocked_mask:l,%d6
        btst    %d0,%d6
        bne     fl_sr_unlock
        move.l  176(%sp),%d1
        move.l  180(%sp),%d2
        moveq   #0,%d3
        bsr     fl_row
        lea     fl_empty_row:l,%a1
        cmpa.l  %a1,%a0
        beq     fl_sr_unlock
        moveq   #0,%d6
        move.l  184(%sp),%d1
        movea.l %a0,%a2
        moveq   #4,%d2
fl_sr_column:
        movea.l %a2,%a0
        move.l  %d7,%d3
        subq.l  #1,%d3
        tst.l   %d1
        bpl     fl_sr_right
        move.l  (%a0),%d4
fl_sr_left_loop:
        move.l  FL_ROW(%a0),%d5
        cmp.l   (%a0),%d5
        beq     fl_sr_left_same
        moveq   #1,%d6
fl_sr_left_same:
        move.l  %d5,(%a0)
        lea     FL_ROW(%a0),%a0
        subq.l  #1,%d3
        bne     fl_sr_left_loop
        bra     fl_sr_last
fl_sr_right:
        move.l  %d3,%d5
        lsl.l   #4,%d5
        adda.l  %d5,%a0
        move.l  (%a0),%d4
fl_sr_right_loop:
        move.l  -FL_ROW(%a0),%d5
        cmp.l   (%a0),%d5
        beq     fl_sr_right_same
        moveq   #1,%d6
fl_sr_right_same:
        move.l  %d5,(%a0)
        lea     -FL_ROW(%a0),%a0
        subq.l  #1,%d3
        bne     fl_sr_right_loop
fl_sr_last:
        cmp.l   (%a0),%d4
        beq     fl_sr_last_same
        moveq   #1,%d6
fl_sr_last_same:
        move.l  %d4,(%a0)
        addq.l  #4,%a2
        subq.l  #1,%d2
        bne     fl_sr_column
        tst.l   %d6
        beq     fl_sr_unlock
        bsr     fl_mark_dirty
fl_sr_unlock:
        move.l  %a6,%d6
        move.w  %d6,%sr
fl_sr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_clear_selected_hook:
        bsr     fl_clear_selected
        .if HAVE_SYDRUM
        jmp sl_clear_selected_hook:l
        .else
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40040e1c
        .endif
fl_clear_selected:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        move.l  76(%sp),%d6
        cmpi.l  #4,%d6
        bcc     fl_cs_out
        lsl.l   #4,%d6
        mvz.w   82(%sp),%d7
        suba.l  %a3,%a3
fl_cs_loop:
        move.l  %a3,%d0
        btst    %d0,%d7
        beq     fl_cs_next
        move.l  %d6,%d3
        add.l   %a3,%d3
        moveq   #0,%d4
        move.l  #255,%d5
fl_cs_control:
        mvz.b   0x100b14ce,%d0
        bsr     fl_write
        addq.l  #1,%d4
        cmpi.l  #FL_CONTROLS,%d4
        bne     fl_cs_control
fl_cs_next:
        addq.l  #1,%a3
        cmpa.l  #16,%a3
        bne     fl_cs_loop
fl_cs_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_live_erase_hook:
        bsr     fl_live_erase
        .if HAVE_SYDRUM
        jmp sl_live_erase_hook:l
        .else
        tst.l   56(%sp)
        beq     fl_le_no_trig
        jmp     0x400388b0
fl_le_no_trig:
        jmp     0x40038a16
        .endif
fl_live_erase:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        tst.l   120(%sp)
        bne     fl_le_clear
        move.l  124(%sp),%d0
        cmpi.l  #-1,%d0
        bne     fl_le_out
fl_le_clear:
        move.l  %d7,%d2
        move.l  %a3,%d3
        mvz.b   0x100b14d0,%d1
        moveq   #1,%d7
        bsr     fl_clear_rows
fl_le_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
fl_live_erase_tail:
        bsr     fl_ui_cache_overlay
        .if HAVE_SYDRUM
        jmp sl_live_erase_tail:l
        .else
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     48(%sp),%sp
        rts
        .endif

fl_duplicate_hook:
        bsr     fl_duplicate_rows
        .if HAVE_SYDRUM
        jmp sl_duplicate_hook:l
        .else
        lea     -84(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4009c8c4
        .endif
fl_duplicate_rows:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        bsr     fl_ui_readable
        tst.l   %d0
        beq     fl_dr_out
        move.l  80(%sp),%d0
        tst.l   %d0
        beq     fl_dr_audio
        cmpi.l  #-1,%d0
        bne     fl_dr_out
fl_dr_audio:
        move.l  68(%sp),%d6
        cmpi.l  #4,%d6
        bcc     fl_dr_out
        lsl.l   #4,%d6
        move.l  72(%sp),%d7
        cmpi.l  #4,%d7
        bcc     fl_dr_out
        lsl.l   #4,%d7
        move.l  76(%sp),%d2
        movea.l %d2,%a4
        addq.l  #1,%a4
        cmpi.l  #-1,%d2
        bne     fl_dr_track
        moveq   #0,%d2
        movea.w #8,%a4
fl_dr_track:
        suba.l  %a5,%a5
fl_dr_step:
        mvz.b   0x100b14ce,%d0
        mvz.b   0x100b14d0,%d1
        move.l  %d6,%d3
        add.l   %a5,%d3
        bsr     fl_row
        movea.l %a0,%a2
        move.l  %d7,%d3
        add.l   %a5,%d3
        moveq   #0,%d4
fl_dr_control:
        mvz.b   0x100b14ce,%d0
        mvz.b   (%a2)+,%d5
        bsr     fl_write
        addq.l  #1,%d4
        cmpi.l  #FL_CONTROLS,%d4
        bne     fl_dr_control
        addq.l  #1,%a5
        cmpa.l  #16,%a5
        bne     fl_dr_step
        addq.l  #1,%d2
        cmp.l   %a4,%d2
        bne     fl_dr_track
fl_dr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_page_nonempty_tail:
        bsr     fl_page_nonempty
        .if HAVE_SYDRUM
        jmp sl_page_nonempty_tail:l
        .else
        movem.l (%sp),%d2-%d7/%a2-%a5
        lea     40(%sp),%sp
        rts
        .endif
fl_page_nonempty:
        tst.l   %d0
        bne     fl_pn_return
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  120(%sp),%d0
        tst.l   %d0
        beq     fl_pn_audio
        cmpi.l  #-1,%d0
        bne     fl_pn_out
fl_pn_audio:
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     fl_pn_out
        move.l  fl_ready_mask:l,%d4
        btst    %d0,%d4
        beq     fl_pn_out
        move.l  fl_blocked_mask:l,%d4
        btst    %d0,%d4
        bne     fl_pn_out
        move.l  108(%sp),%d1
        move.l  112(%sp),%d7
        cmpi.l  #4,%d7
        bcc     fl_pn_out
        lsl.l   #4,%d7
        move.l  116(%sp),%d2
        movea.l %d2,%a2
        addq.l  #1,%a2
        cmpi.l  #-1,%d2
        bne     fl_pn_track
        moveq   #0,%d2
        movea.w #8,%a2
fl_pn_track:
        move.l  %d7,%d3
        moveq   #16,%d5
fl_pn_step:
        bsr     fl_row
        move.l  (%a0),%d4
        and.l   4(%a0),%d4
        and.l   8(%a0),%d4
        cmpi.l  #-1,%d4
        bne     fl_pn_yes
        addq.l  #1,%d3
        subq.l  #1,%d5
        bne     fl_pn_step
        addq.l  #1,%d2
        cmp.l   %a2,%d2
        bne     fl_pn_track
        bra     fl_pn_out
fl_pn_yes:
        moveq   #1,%d0
        move.l  %d0,(%sp)
fl_pn_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
fl_pn_return:
        rts
