| Per-bank scenes: four working Parts then four saved Parts; each Part is
| scene/track/control order. A row is VOIC,CHRD. No filesystem work here.
        .global fl_scene_row,fl_scene_write,fl_scene_empty

| d0 bank,d1 Part 0..7 (4..7 saved),d2 scene,d3 track -> a0 pair or empty sentinel.
| All data registers preserved. Callers writing directly must validate first.
fl_scene_row:
        lea     fl_scene_empty:l,%a0
        cmpi.l  #16,%d0
        bcc     fl_scene_row_out
        cmpi.l  #8,%d1
        bcc     fl_scene_row_out
        cmpi.l  #16,%d2
        bcc     fl_scene_row_out
        cmpi.l  #8,%d3
        bcc     fl_scene_row_out
        move.l  %d0,-(%sp)
        lsl.l   #3,%d0
        add.l   %d1,%d0
        lsl.l   #4,%d0
        add.l   %d2,%d0
        lsl.l   #3,%d0
        add.l   %d3,%d0
        add.l   %d0,%d0
        lea     fl_scene_table:l,%a0
        adda.l  %d0,%a0
        move.l  (%sp)+,%d0
fl_scene_row_out:
        rts

| Same coordinates, d4 control,d5 value/255 -> d0 changed/unchanged/invalid.
| Bounds, readiness, value, edit and generation form one interrupt-masked operation.
fl_scene_write:
        lea     -16(%sp),%sp
        movem.l %d6/%a0-%a1,(%sp)
        move.w  %sr,%d6
        move.l  %d6,12(%sp)
        move.w  #0x2700,%sr
        cmpi.l  #16,%d0
        bcc     fl_sw_bad
        cmpi.l  #2,%d4
        bcc     fl_sw_bad
        move.l  fl_ready_mask:l,%d6
        btst    %d0,%d6
        beq     fl_sw_bad
        move.l  fl_blocked_mask:l,%d6
        btst    %d0,%d6
        bne     fl_sw_bad
        cmpi.l  #255,%d5
        beq     fl_sw_value
        tst.l   %d4
        bne     fl_sw_chord
        tst.l   %d5
        beq     fl_sw_bad
        cmpi.l  #4,%d5
        bhi     fl_sw_bad
        bra     fl_sw_value
fl_sw_chord:
        cmpi.l  #127,%d5
        bhi     fl_sw_bad
fl_sw_value:
        bsr     fl_scene_row
        lea     fl_scene_empty:l,%a1
        cmpa.l  %a1,%a0
        beq     fl_sw_bad
        mvz.b   (%a0,%d4.l),%d6
        cmp.l   %d6,%d5
        beq     fl_sw_same
        move.b  %d5,(%a0,%d4.l)
        bsr     fl_mark_dirty
        moveq   #1,%d0
        bra     fl_sw_out
fl_sw_same:
        moveq   #0,%d0
        bra     fl_sw_out
fl_sw_bad:
        moveq   #-1,%d0
fl_sw_out:
        move.l  12(%sp),%d6
        move.w  %d6,%sr
        movem.l (%sp),%d6/%a0-%a1
        lea     16(%sp),%sp
        rts

        .section .data
        .balign 4
fl_scene_empty:
        .long 0xffffffff
        .section .text
