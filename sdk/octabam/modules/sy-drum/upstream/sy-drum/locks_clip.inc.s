.global sl_clip_xfer,sl_clip_reset
.global sl_clip_pat_copy_hook,sl_clip_pat_undo_hook,sl_clip_pat_store_hook,sl_clip_full_capture_hook,sl_clip_full_store_hook,sl_clip_track_capture_hook,sl_clip_track_store_hook,sl_clip_raw_capture_hook,sl_clip_raw_restore_hook,sl_clip_page_copy_hook,sl_clip_page_undo_hook,sl_clip_page_store_hook
| SY DRUM step locks: companion clipboard and undo snapshots.
| Native copy/capture functions always replace their matching companion snapshot.
| Restore hooks run only in accepted stock store paths, after native tag checks.
| No sample/FM content, Part defaults or stock clipboard layout is modified.

sl_clip_pat_copy_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460c8122,%d0
 move.l 64(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 move.l 4(%sp),%d0
 move.l #36568,%d1
 jmp 0x40026eba

sl_clip_pat_undo_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 move.l 8(%sp),%d0
 lea 4(%sp),%a0
 jmp 0x40026ef8

sl_clip_pat_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 moveq #0,%d2
 moveq #0,%d3
 moveq #14,%d4
 moveq #1,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -16(%sp),%sp
 movem.l %d2-%d4/%a2,(%sp)
 jmp 0x4002b9b8

sl_clip_full_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #4,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -28(%sp),%sp
 movem.l %d2-%d4/%a2-%a5,(%sp)
 jmp 0x4002975c

sl_clip_full_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #4,%d4
 moveq #1,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -68(%sp),%sp
 movem.l %d2-%d7/%a2-%a6,(%sp)
 jmp 0x4002b65c

sl_clip_track_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #6,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -16(%sp),%sp
 movem.l %d2/%a2-%a4,(%sp)
 jmp 0x400294c8

sl_clip_track_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #6,%d4
 moveq #1,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -36(%sp),%sp
 movem.l %d2-%d7/%a2-%a4,(%sp)
 jmp 0x4002a394

sl_clip_raw_capture_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 moveq #0,%d3
 moveq #5,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 move.l %d2,-(%sp)
 move.l 12(%sp),%d1
 jmp 0x4002676e

sl_clip_raw_restore_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 112(%sp),%d1
 move.l 116(%sp),%d2
 moveq #0,%d3
 moveq #5,%d4
 moveq #1,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 clr.l 0x460c80f4
 jmp 0x4002b456

sl_clip_page_copy_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460c8122,%d0
 move.l 64(%sp),%d1
 move.l 68(%sp),%d2
 move.l 72(%sp),%d3
 moveq #11,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -28(%sp),%sp
 movem.l %d2-%d5/%a2-%a4,(%sp)
 jmp 0x400268a4

sl_clip_page_undo_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l #0x460bf218,%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 move.l 76(%sp),%d3
 moveq #11,%d4
 moveq #0,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -28(%sp),%sp
 movem.l %d2-%d5/%a2-%a4,(%sp)
 jmp 0x40026998

sl_clip_page_store_hook:
 lea -60(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l 64(%sp),%d0
 move.l 68(%sp),%d1
 move.l 72(%sp),%d2
 move.l 76(%sp),%d3
 moveq #11,%d4
 moveq #1,%d5
 jsr sl_clip_xfer:l
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 60(%sp),%sp
 lea -48(%sp),%sp
 movem.l %d2-%d7/%a2-%a6,(%sp)
 jmp 0x4002af04

| d0 native clipboard pointer; d1 pattern; d2 track; d3 page;
| d4 native format tag (14,4,6,5,11); d5 0 capture / 1 restore.
| Preserves all registers. Buffers contain validated raw rows, independent of
| the source bank after capture. Different clipboard formats cannot reuse them.
sl_clip_xfer:
 lea -64(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.w %sr,%d6
 move.l %d6,60(%sp)
 move.w #0x2700,%sr
 lea sl_clip_data:l,%a1
 lea sl_clip_kind:l,%a2
 cmpi.l #0x460c8122,%d0
 beq sl_cx_buffer
 cmpi.l #0x460bf218,%d0
 bne sl_cx_out
 lea sl_undo_data:l,%a1
 lea sl_undo_kind:l,%a2
sl_cx_buffer:
 tst.l %d5
 bne sl_cx_restore_check
 clr.l (%a2)
 bra sl_cx_context
sl_cx_restore_check:
 cmp.l (%a2),%d4
 bne sl_cx_out
sl_cx_context:
 mvz.b 0x100b14ce,%d0
 cmpi.l #15,%d0
 bhi sl_cx_out
 cmpi.l #15,%d1
 bhi sl_cx_out
 move.l sl_ready_mask:l,%d6
 btst %d0,%d6
 beq sl_cx_out
 move.l sl_blocked_mask:l,%d6
 btst %d0,%d6
 bne sl_cx_out
 cmpi.l #14,%d4
 beq sl_cx_pattern
 cmpi.l #7,%d2
 bhi sl_cx_out
 move.l #64*SL_ROW,%d7            | byte counts of SL_ROW-byte rows (a track: 64 rows)
 cmpi.l #11,%d4
 bne sl_cx_track
 cmpi.l #3,%d3
 bhi sl_cx_out
 lsl.l #4,%d3
 move.l #16*SL_ROW,%d7            | a page: 16 rows
 bra sl_cx_row
sl_cx_track:
 moveq #0,%d3
 bra sl_cx_row
sl_cx_pattern:
 moveq #0,%d2
 moveq #0,%d3
 move.l #512*SL_ROW,%d7           | a pattern: 8 tracks x 64 rows
sl_cx_row:
 jsr sl_row:l
 lsr.l #2,%d7
 tst.l %d5
 bne sl_cx_restore
 move.l %d4,(%a2)
sl_cx_capture_loop:
 move.l (%a0)+,(%a1)+
 subq.l #1,%d7
 bne sl_cx_capture_loop
 bra sl_cx_out
sl_cx_restore:
 moveq #0,%d6
sl_cx_restore_loop:
 move.l (%a1)+,%d4
 cmp.l (%a0),%d4
 beq sl_cx_restore_next
 move.l %d4,(%a0)
 moveq #1,%d6
sl_cx_restore_next:
 addq.l #4,%a0
 subq.l #1,%d7
 bne sl_cx_restore_loop
 tst.l %d6
 beq sl_cx_out
 jsr sl_mark_dirty:l
 move.l 60(%sp),%d6
 move.w %d6,%sr
 | Stock callers subsequently rebuild their native caches. Overlaying now also
 | covers low-level pattern stores whose UI refresh is deferred.
 jsr sl_ui_refresh_locks:l
sl_cx_out:
 move.l 60(%sp),%d6
 move.w %d6,%sr
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 64(%sp),%sp
 rts

| Lifecycle reset: buffer validity and in-progress UI gestures travel together.
sl_clip_reset:
 clr.l sl_clip_kind:l
 clr.l sl_undo_kind:l
 jmp sl_ui_buffers_reset:l

 .section .data
 .balign 4
sl_clip_kind: .long 0
sl_undo_kind: .long 0
sl_clip_data: .space 512*SL_ROW
sl_undo_data: .space 512*SL_ROW
 .section .text
