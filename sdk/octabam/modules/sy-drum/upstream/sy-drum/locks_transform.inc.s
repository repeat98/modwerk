        .global sl_clear_track_hook,sl_clear_page_hook,sl_shift_hook,sl_clear_selected_hook,sl_live_erase_hook,sl_live_erase_tail,sl_duplicate_hook,sl_page_nonempty_tail
| Companion-row operations alongside native musical sequence mutations.
| No marker gate: latent dedicated locks travel with their pattern identity.
sl_clear_track_hook:
        bsr     sl_clear_track
        lea     -60(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40039dfc
sl_clear_track:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  76(%sp),%d0             | flags at native12(sp)
        btst    #0,%d0
        beq     sl_ct_out
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        moveq   #0,%d3
        moveq   #64,%d7
        bsr     sl_clear_rows
sl_ct_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
sl_clear_page_hook:
        bsr     sl_clear_page
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x400398bc
sl_clear_page:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        move.l  76(%sp),%d3
        cmpi.l  #4,%d3
        bcc     sl_cp_out
        lsl.l   #4,%d3
        moveq   #16,%d7
        bsr     sl_clear_rows
sl_cp_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
| d1pattern,d2track,d3firststep,d7count. Preserving not required internally.
sl_clear_rows:
        moveq   #0,%d4
        move.l  #255,%d5
sl_cr_control:
        mvz.b   0x100b14ce,%d0
        bsr     sl_write
        addq.l  #1,%d4
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bne     sl_cr_control
        moveq   #0,%d4
        addq.l  #1,%d3
        subq.l  #1,%d7
        bne     sl_cr_control
        rts

| Hook4003d916 after native chooses track/master length, before native rotates.
sl_shift_hook:
        bsr     sl_shift_rows
        move.l  124(%sp),%d0
        btst    #0,%d0
        jmp     0x4003d91e
sl_shift_rows:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        tst.l   192(%sp)                | MIDI flag at128(native frame)
        bne     sl_sr_out
        move.l  188(%sp),%d0             | normal musical rows only (flags bit0)
        btst    #0,%d0
        beq     sl_sr_out
        move.l  136(%sp),%d7             | exact native active length
        cmpi.l  #2,%d7
        bcs     sl_sr_out
        cmpi.l  #64,%d7
        bhi     sl_sr_out
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     sl_sr_out
        move.w  %sr,%d6
        movea.l %d6,%a6
        move.w  #0x2700,%sr             | publish/check and complete rotation atomic
        move.l  sl_ready_mask:l,%d6
        btst    %d0,%d6
        beq     sl_sr_unlock
        move.l  sl_blocked_mask:l,%d6
        btst    %d0,%d6
        bne     sl_sr_unlock
        move.l  176(%sp),%d1
        move.l  180(%sp),%d2
        moveq   #0,%d3
        bsr     sl_row
        lea     sl_empty_row:l,%a1
        cmpa.l  %a1,%a0
        beq     sl_sr_unlock
        moveq   #0,%d6                   | changed
        move.l  184(%sp),%d1             | native shifts one step, sign selects dir
        movea.l %a0,%a2                  | a row is SL_ROW (16) bytes: each of its
        moveq   #4,%d2                   | four long columns rotates on its own
sl_sr_column:
        movea.l %a2,%a0
        move.l  %d7,%d3
        subq.l  #1,%d3
        tst.l   %d1
        bpl     sl_sr_right
        move.l  (%a0),%d4
sl_sr_left_loop:
        move.l  SL_ROW(%a0),%d5
        cmp.l   (%a0),%d5
        beq     sl_sr_left_same
        moveq   #1,%d6
sl_sr_left_same:
        move.l  %d5,(%a0)
        lea     SL_ROW(%a0),%a0
        subq.l  #1,%d3
        bne     sl_sr_left_loop
        bra     sl_sr_last
sl_sr_right:
        move.l  %d3,%d5
        lsl.l   #4,%d5                   | x SL_ROW
        adda.l  %d5,%a0
        move.l  (%a0),%d4
sl_sr_right_loop:
        move.l  -SL_ROW(%a0),%d5
        cmp.l   (%a0),%d5
        beq     sl_sr_right_same
        moveq   #1,%d6
sl_sr_right_same:
        move.l  %d5,(%a0)
        lea     -SL_ROW(%a0),%a0
        subq.l  #1,%d3
        bne     sl_sr_right_loop
sl_sr_last:
        cmp.l   (%a0),%d4
        beq     sl_sr_last_same
        moveq   #1,%d6
sl_sr_last_same:
        move.l  %d4,(%a0)
        addq.l  #4,%a2
        subq.l  #1,%d2
        bne     sl_sr_column
        tst.l   %d6
        beq     sl_sr_unlock
        bsr     sl_mark_dirty
sl_sr_unlock:
        move.l  %a6,%d6
        move.w  %d6,%sr
sl_sr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| Native selected-trig/all-locks clear (paired with tag1 undo snapshot).
sl_clear_selected_hook:
        bsr     sl_clear_selected
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40040e1c
sl_clear_selected:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        move.l  76(%sp),%d6
        cmpi.l  #4,%d6
        bcc     sl_cs_out
        lsl.l   #4,%d6
        mvz.w   82(%sp),%d7
        suba.l  %a3,%a3
sl_cs_loop:
        move.l  %a3,%d0
        btst    %d0,%d7
        beq     sl_cs_next
        move.l  %d6,%d3
        add.l   %a3,%d3
        moveq   #0,%d4
        move.l  #255,%d5
sl_cs_control:
        mvz.b   0x100b14ce,%d0
        bsr     sl_write
        addq.l  #1,%d4
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bne     sl_cs_control
sl_cs_next:
        addq.l  #1,%a3
        cmpa.l  #16,%a3
        bne     sl_cs_loop
sl_cs_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| Live erase has already resolved this track's actual playhead step in a3.
sl_live_erase_hook:
        bsr     sl_live_erase
        tst.l   56(%sp)
        beq     sl_le_no_trig
        jmp     0x400388b0
sl_le_no_trig:
        jmp     0x40038a16
sl_live_erase:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        tst.l   120(%sp)                | clear entire trig
        bne     sl_le_clear
        move.l  124(%sp),%d0
        cmpi.l  #-1,%d0                 | or explicitly all native lock columns
        bne     sl_le_out
sl_le_clear:
        move.l  %d7,%d2
        move.l  %a3,%d3
        mvz.b   0x100b14d0,%d1
        moveq   #1,%d7
        bsr     sl_clear_rows
sl_le_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
sl_live_erase_tail:
        bsr     sl_ui_cache_overlay
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     48(%sp),%sp
        rts

| Native scale auto-duplicate and explicit page duplication share this API:
|4009c8bc(sourcepage,destpage,track/-1,midi0audio/1midi/-1both).
sl_duplicate_hook:
        bsr     sl_duplicate_rows
        lea     -84(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4009c8c4
sl_duplicate_rows:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        bsr     sl_ui_readable
        tst.l   %d0
        beq     sl_dr_out
        move.l  80(%sp),%d0
        tst.l   %d0
        beq     sl_dr_audio
        cmpi.l  #-1,%d0
        bne     sl_dr_out
sl_dr_audio:
        move.l  68(%sp),%d6
        cmpi.l  #4,%d6
        bcc     sl_dr_out
        lsl.l   #4,%d6
        move.l  72(%sp),%d7
        cmpi.l  #4,%d7
        bcc     sl_dr_out
        lsl.l   #4,%d7
        move.l  76(%sp),%d2
        movea.l %d2,%a4
        addq.l  #1,%a4
        cmpi.l  #-1,%d2
        bne     sl_dr_track
        moveq   #0,%d2
        movea.w #8,%a4
sl_dr_track:
        suba.l  %a5,%a5
sl_dr_step:
        mvz.b   0x100b14ce,%d0
        mvz.b   0x100b14d0,%d1
        move.l  %d6,%d3
        add.l   %a5,%d3
        bsr     sl_row
        movea.l %a0,%a2
        move.l  %d7,%d3
        add.l   %a5,%d3
        moveq   #0,%d4
sl_dr_control:
        mvz.b   0x100b14ce,%d0
        mvz.b   (%a2)+,%d5
        bsr     sl_write
        addq.l  #1,%d4
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bne     sl_dr_control
        addq.l  #1,%a5
        cmpa.l  #16,%a5
        bne     sl_dr_step
        addq.l  #1,%d2
        cmp.l   %a4,%d2
        bne     sl_dr_track
sl_dr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| The stock nonempty test must also see companion-only rows before deciding
| that an extending scale page is blank and may be auto-overwritten.
sl_page_nonempty_tail:
        bsr     sl_page_nonempty
        movem.l (%sp),%d2-%d7/%a2-%a5
        lea     40(%sp),%sp
        rts
sl_page_nonempty:
        tst.l   %d0
        bne     sl_pn_return
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  120(%sp),%d0
        tst.l   %d0
        beq     sl_pn_audio
        cmpi.l  #-1,%d0
        bne     sl_pn_out
sl_pn_audio:
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     sl_pn_out
        move.l  sl_ready_mask:l,%d4
        btst    %d0,%d4
        beq     sl_pn_out
        move.l  sl_blocked_mask:l,%d4
        btst    %d0,%d4
        bne     sl_pn_out
        move.l  108(%sp),%d1
        move.l  112(%sp),%d7
        cmpi.l  #4,%d7
        bcc     sl_pn_out
        lsl.l   #4,%d7
        move.l  116(%sp),%d2
        movea.l %d2,%a2
        addq.l  #1,%a2
        cmpi.l  #-1,%d2
        bne     sl_pn_track
        moveq   #0,%d2
        movea.w #8,%a2
sl_pn_track:
        move.l  %d7,%d3
        moveq   #16,%d5
sl_pn_step:
        bsr     sl_row
        move.l  (%a0),%d4
        and.l   4(%a0),%d4               | E F too (the padding is 255)
        and.l   8(%a0),%d4               | G..J too (a companion-only row of any kind)
        cmpi.l  #-1,%d4
        bne     sl_pn_yes
        addq.l  #1,%d3
        subq.l  #1,%d5
        bne     sl_pn_step
        addq.l  #1,%d2
        cmp.l   %a2,%d2
        bne     sl_pn_track
        bra     sl_pn_out
sl_pn_yes:
        moveq   #1,%d0
        move.l  %d0,(%sp)
sl_pn_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
sl_pn_return:
        rts
