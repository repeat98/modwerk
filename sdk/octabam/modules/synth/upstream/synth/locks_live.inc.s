| FM SYNTH VOIC/CHRD live encoder recording, using stock timing and native lock trigs.
.global fl_live_edit_hook, fl_live_record

fl_live_edit_hook:
 jsr fl_live_record:l
        .if HAVE_SYDRUM
        jmp sl_live_edit_hook:l
        .else
 lea 1(%a3,%a3.l*4),%a1
 lea 0x46c7d244,%a0
 jmp 0x4003a61e:l
        .endif

fl_live_record:
 lea -76(%sp),%sp
 movem.l %d0-%d7/%a0-%a6,(%sp)
 move.l %d2,%d5
 move.l %d4,%d6
 lsr.l #3,%d6
 move.l %a3,%d7
 cmpi.l #7,%d6
 bhi fl_live_out
 cmpi.l #1,%d7
 bhi fl_live_out
 tst.l 0x460d172a
 beq fl_live_out
 tst.l 0x460d1a94
 bne fl_live_out
 tst.l 0x80000012
 bne fl_live_out
 move.l %d6,%d2
 jsr po_fm_kind:l
 beq fl_live_out
 cmpi.l #1,%d7
 bhi fl_live_out
fl_live_control_ok:
 move.l %d6,-(%sp)
 jsr 0x4009b290:l
 addq.l #4,%sp
 cmpi.l #1,%d0
 bne fl_live_out
 lea 60(%sp),%a0
 move.l %a0,-(%sp)
 moveq #0,%d0
 tst.l 0x800000ac
 bne fl_live_unquantized
 moveq #1,%d0
fl_live_unquantized:
 move.l %d0,-(%sp)
 move.l %d6,-(%sp)
 move.l 0x46c7e956,-(%sp)
 jsr 0x4009b2d4:l
 lea 16(%sp),%sp
 mvz.b 60(%sp),%d0
 mvz.b 61(%sp),%d1
 move.l %d6,%d2
 mvz.b 62(%sp),%d3
 move.l %d7,%d4

 move.w %sr,%d6
 move.l %d6,64(%sp)
 move.w #0x2700,%sr
 move.l %d0,68(%sp)
 jsr fl_write:l
 tst.l %d0
 bmi fl_live_unlock
 move.l 68(%sp),%d0
 move.l #635712,%d6
 mulu.l %d0,%d6
 move.l #36568,%d7
 mulu.l %d1,%d7
 move.l #2330,%d4
 mulu.l %d2,%d4
 add.l %d4,%d7
 lea 0x400e21e0,%a2
 adda.l %d6,%a2
 adda.l %d7,%a2
 move.l %d3,-(%sp)
 pea 1
 clr.l -(%sp)
 jsr 0x400a694c:l
 lea 12(%sp),%sp
 move.l %d0,%d6
 move.l %d1,%d7
 moveq #0,%d4
fl_live_find_event:
 move.l (%a2,%d4.l),%d0
 and.l %d6,%d0
 move.l 4(%a2,%d4.l),%d1
 and.l %d7,%d1
 or.l %d1,%d0
 bne fl_live_changed
 addq.l #8,%d4
 cmpi.l #32,%d4
 bne fl_live_find_event
 or.l %d6,16(%a2)
 or.l %d7,20(%a2)
 lea 0x89a(%a2),%a0
 moveq #0,%d0
 mvz.b 63(%sp),%d1
 andi.l #63,%d1
 lsl.l #7,%d1
 or.l %d1,%d0
 move.w %d0,(%a0,%d3.l*2)

 mvz.b 60(%sp),%d0
 mvz.b 0x80000002,%d1
 cmp.l %d0,%d1
 bne fl_live_native_dirty
 mvz.b 61(%sp),%d0
 mvz.b 0x80000004,%d1
 cmp.l %d0,%d1
 bne fl_live_native_dirty
 move.l #36568,%d4
 mulu.l %d0,%d4
 move.l #2330,%d1
 mulu.l %d2,%d1
 add.l %d1,%d4
 lea 0x1001614e,%a1
 adda.l %d4,%a1
 or.l %d6,16(%a1)
 or.l %d7,20(%a1)
 move.w (%a0,%d3.l*2),%d0
 lea 0x89a(%a1),%a1
 move.w %d0,(%a1,%d3.l*2)
 moveq #1,%d0
 move.l %d0,0x100f8598
fl_live_native_dirty:
 mvz.b 60(%sp),%d0
 move.l #635712,%d1
 mulu.l %d1,%d0
 lea 0x4017d512,%a0
 moveq #1,%d1
 move.l %d1,(%a0,%d0.l)
fl_live_changed:
 move.l 64(%sp),%d0
 move.w %d0,%sr
 jsr fl_ui_changed:l
 bra fl_live_out
fl_live_unlock:
 move.l 64(%sp),%d0
 move.w %d0,%sr
fl_live_out:
 movem.l (%sp),%d0-%d7/%a0-%a6
 lea 76(%sp),%sp
 rts
