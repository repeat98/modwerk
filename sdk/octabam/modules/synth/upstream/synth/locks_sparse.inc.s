| FM SYNTH independent setup locks. Adapted from the SY DRUM sequence-edit mechanism.
        .global fl_sparse_capture_hook,fl_sparse_store_hook,fl_ui_buffers_reset

fl_sparse_capture_hook:
        bsr     fl_sparse_capture
        .if HAVE_SYDRUM
        jmp sl_sparse_capture_hook:l
        .else
        lea     -64(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4002bf40
        .endif
fl_sparse_capture:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        movea.l 68(%sp),%a1
        lea     fl_sparse_clip:l,%a2
        cmpa.l  #0x460c8122,%a1
        beq     fl_sparse_cap_buffer
        cmpa.l  #0x460bf218,%a1
        bne     fl_sparse_cap_out
        lea     fl_sparse_undo:l,%a2
fl_sparse_cap_buffer:
        bsr     fl_ui_readable
        tst.l   %d0
        beq     fl_sparse_cap_empty
        mvz.b   0x100b14ce,%d0
        move.l  72(%sp),%d1
        move.l  76(%sp),%d2
        move.l  80(%sp),%d3
        cmpi.l  #4,%d3
        bcc     fl_sparse_cap_empty
        lsl.l   #4,%d3
        moveq   #16,%d7
fl_sparse_cap_loop:
        bsr     fl_row
        move.l  (%a0)+,(%a2)+
        move.l  (%a0)+,(%a2)+
        move.l  (%a0)+,(%a2)+
        move.l  (%a0),(%a2)+
        addq.l  #1,%d3
        subq.l  #1,%d7
        bne     fl_sparse_cap_loop
        bra     fl_sparse_cap_out
fl_sparse_cap_empty:
        moveq   #64,%d7
        moveq   #-1,%d0
fl_sparse_cap_ff:
        move.l  %d0,(%a2)+
        subq.l  #1,%d7
        bne     fl_sparse_cap_ff
fl_sparse_cap_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_sparse_store_hook:
        bsr     fl_sparse_store
        .if HAVE_SYDRUM
        jmp sl_sparse_store_hook:l
        .else
        move.b  #1,%d0
        lsl.l   %d4,%d0
        not.l   %d0
        jmp     0x4002cb9a
        .endif
fl_sparse_store:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        lea     fl_sparse_clip:l,%a4
        cmpa.l  #0x460c8122,%a6
        beq     fl_ss_buffer
        cmpa.l  #0x460bf218,%a6
        bne     fl_ss_out
        lea     fl_sparse_undo:l,%a4
fl_ss_buffer:
        cmpi.l  #16,%d4
        bcc     fl_ss_out
        lsl.l   #4,%d4
        adda.l  %d4,%a4
        move.l  %d5,%d3
        move.l  164(%sp),%d1
        move.l  168(%sp),%d2
        moveq   #0,%d4
fl_ss_loop:
        mvz.b   0x100b14ce,%d0
        mvz.b   (%a4)+,%d5
        bsr     fl_write
        addq.l  #1,%d4
        cmpi.l  #FL_CONTROLS,%d4
        bne     fl_ss_loop
fl_ss_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
        .balign 4
fl_sparse_clip:
        .fill 64,4,0xffffffff
fl_sparse_undo:
        .fill 64,4,0xffffffff

fl_ui_buffers_reset:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        lea     fl_ui_pressed:l,%a0
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)
        lea     fl_ui_moved:l,%a0
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)
        lea     fl_sparse_clip:l,%a0
        move.l  #128,%d1
        moveq   #-1,%d0
fl_ubr_loop:
        move.l  %d0,(%a0)+
        subq.l  #1,%d1
        bne     fl_ubr_loop
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        rts
