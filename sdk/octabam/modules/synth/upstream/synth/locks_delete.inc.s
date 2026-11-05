| FM SYNTH independent setup locks. Adapted from the SY DRUM sequence-edit mechanism.
        .global fl_grid_delete_hook

fl_grid_delete_hook:
        bsr     fl_grid_delete_row
        .if HAVE_SYDRUM
        jmp sl_grid_delete_hook:l
        .else
        lea     0x46c7d48c,%a0
        jmp     0x400603f8
        .endif
fl_grid_delete_row:
        lea     -64(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.w  %sr,%d0
        move.l  %d0,60(%sp)
        move.w  #0x2700,%sr
        tst.l   0x80000012
        bne     fl_gd_out
        mvz.b   0x100b14d0,%d1
        mvz.b   0x100b14cc,%d2
        moveq   #0,%d4
        move.l  #255,%d5
fl_gd_control:
        mvz.b   0x100b14ce,%d0
        jsr     fl_write:l
        addq.l  #1,%d4
        cmpi.l  #FL_CONTROLS,%d4
        bne     fl_gd_control
fl_gd_out:
        move.l  60(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     64(%sp),%sp
        rts
