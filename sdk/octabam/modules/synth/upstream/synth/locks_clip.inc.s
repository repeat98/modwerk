| FM SYNTH independent setup locks. Adapted from the SY DRUM sequence-edit mechanism.
.global fl_clip_xfer,fl_clip_reset
.global fl_clip_pat_copy_hook,fl_clip_pat_undo_hook,fl_clip_pat_store_hook,fl_clip_full_capture_hook,fl_clip_full_store_hook,fl_clip_track_capture_hook,fl_clip_track_store_hook,fl_clip_raw_capture_hook,fl_clip_raw_restore_hook,fl_clip_page_copy_hook,fl_clip_page_undo_hook,fl_clip_page_store_hook

fl_clip_pat_copy_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460c8122,%d0
 move.l 64(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_pat_copy_hook:l
        .else
 move.l 4(%sp),%d0
 move.l #36568,%d1
 jmp 0x40026eba
        .endif

fl_clip_pat_undo_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_pat_undo_hook:l
        .else
 move.l 8(%sp),%d0
 lea 4(%sp),%a0
 jmp 0x40026ef8
        .endif

fl_clip_pat_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #1,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_pat_store_hook:l
        .else
 lea -16(%sp),%sp
 movem.l %d2-%d4/%a2,(%sp)
 jmp 0x4002b9b8
        .endif

fl_clip_full_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #4,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 jsr fs_track_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_full_capture_hook:l
        .else
 lea -28(%sp),%sp
 movem.l %d2-%d4/%a2-%a5,(%sp)
 jmp 0x4002975c
        .endif

fl_clip_full_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #4,%d4
 moveq #1,%d5
 jsr fl_clip_xfer:l
 jsr fs_track_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_full_store_hook:l
        .else
 lea -68(%sp),%sp
 movem.l %d2-%d7/%a2-%a6,(%sp)
 jmp 0x4002b65c
        .endif

fl_clip_track_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #6,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_track_capture_hook:l
        .else
 lea -16(%sp),%sp
 movem.l %d2/%a2-%a4,(%sp)
 jmp 0x400294c8
        .endif

fl_clip_track_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #6,%d4
 moveq #1,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_track_store_hook:l
        .else
 lea -36(%sp),%sp
 movem.l %d2-%d7/%a2-%a4,(%sp)
 jmp 0x4002a394
        .endif

fl_clip_raw_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #5,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_raw_capture_hook:l
        .else
 move.l %d2,-(%sp)
 move.l 12(%sp),%d1
 jmp 0x4002676e
        .endif

fl_clip_raw_restore_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 112(%sp),%d1
 move.l 116(%sp),%d2
 moveq #0,%d3
 moveq #5,%d4
 moveq #1,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_raw_restore_hook:l
        .else
 clr.l 0x460c80f4
 jmp 0x4002b456
        .endif

fl_clip_page_copy_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460c8122,%d0
 move.l 64(%sp),%d1
 move.l 68(%sp),%d2
 move.l 72(%sp),%d3
 moveq #11,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_page_copy_hook:l
        .else
 lea -28(%sp),%sp
 movem.l %d2-%d5/%a2-%a4,(%sp)
 jmp 0x400268a4
        .endif

fl_clip_page_undo_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 move.l 76(%sp),%d3
 moveq #11,%d4
 moveq #0,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_page_undo_hook:l
        .else
 lea -28(%sp),%sp
 movem.l %d2-%d5/%a2-%a4,(%sp)
 jmp 0x40026998
        .endif

fl_clip_page_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 move.l 76(%sp),%d3
 moveq #11,%d4
 moveq #1,%d5
 jsr fl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_clip_page_store_hook:l
        .else
 lea -48(%sp),%sp
 movem.l %d2-%d7/%a2-%a6,(%sp)
 jmp 0x4002af04
        .endif

fl_clip_xfer:
 lea -64(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.w %sr,%d6
 move.l %d6,60(%sp)
 move.w #0x2700,%sr
 lea fl_clip_data:l,%a1
 lea fl_clip_kind:l,%a2
 cmpi.l #0x460c8122,%d0
 beq fl_cx_buffer
 cmpi.l #0x460bf218,%d0
 bne fl_cx_out
 lea fl_undo_data:l,%a1
 lea fl_undo_kind:l,%a2
fl_cx_buffer:
 tst.l %d5
 bne fl_cx_restore_check
 clr.l (%a2)
 bra fl_cx_context
fl_cx_restore_check:
 cmp.l (%a2),%d4
 bne fl_cx_out
fl_cx_context:
 mvz.b 0x100b14ce,%d0
 cmpi.l #15,%d0
 bhi fl_cx_out
 cmpi.l #15,%d1
 bhi fl_cx_out
 move.l fl_ready_mask:l,%d6
 btst %d0,%d6
 beq fl_cx_out
 move.l fl_blocked_mask:l,%d6
 btst %d0,%d6
 bne fl_cx_out
 cmpi.l #14,%d4
 beq fl_cx_pattern
 cmpi.l #7,%d2
 bhi fl_cx_out
 move.l #64*FL_ROW,%d7
 cmpi.l #11,%d4
 bne fl_cx_track
 cmpi.l #3,%d3
 bhi fl_cx_out
 lsl.l #4,%d3
 move.l #16*FL_ROW,%d7
 bra fl_cx_row
fl_cx_track:
 moveq #0,%d3
 bra fl_cx_row
fl_cx_pattern:
 moveq #0,%d2
 moveq #0,%d3
 move.l #512*FL_ROW,%d7
fl_cx_row:
 jsr fl_row:l
 lsr.l #2,%d7
 tst.l %d5
 bne fl_cx_restore
 move.l %d4,(%a2)
fl_cx_capture_loop:
 move.l (%a0)+,(%a1)+
 subq.l #1,%d7
 bne fl_cx_capture_loop
 bra fl_cx_out
fl_cx_restore:
 moveq #0,%d6
fl_cx_restore_loop:
 move.l (%a1)+,%d4
 cmp.l (%a0),%d4
 beq fl_cx_restore_next
 move.l %d4,(%a0)
 moveq #1,%d6
fl_cx_restore_next:
 addq.l #4,%a0
 subq.l #1,%d7
 bne fl_cx_restore_loop
 tst.l %d6
 beq fl_cx_out
 jsr fl_mark_dirty:l
 move.l 60(%sp),%d6
 move.w %d6,%sr

 jsr fl_ui_refresh_locks:l
fl_cx_out:
 move.l 60(%sp),%d6
 move.w %d6,%sr
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 64(%sp),%sp
 rts

fl_clip_reset:
 clr.l fl_clip_kind:l
 clr.l fl_undo_kind:l
 jmp fl_ui_buffers_reset:l

 .section .data
 .balign 4
fl_clip_kind: .long 0
fl_undo_kind: .long 0
fl_clip_data: .space 512*FL_ROW
fl_undo_data: .space 512*FL_ROW
 .section .text
