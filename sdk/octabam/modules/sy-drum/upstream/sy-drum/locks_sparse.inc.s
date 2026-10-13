        .global sl_sparse_capture_hook,sl_sparse_store_hook,sl_ui_buffers_reset
| Companion rows for native tag1 held audio-trig copy/paste/undo.
| Stock retains selection, wrap, length and destination mapping decisions.
| Hook4002bf38 capture before stockprologue; hook4002cb92 once per copiedrow.
sl_sparse_capture_hook:
        bsr     sl_sparse_capture
        lea     -64(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4002bf40
sl_sparse_capture:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        movea.l 68(%sp),%a1             | buffer
        lea     sl_sparse_clip:l,%a2
        cmpa.l  #0x460c8122,%a1
        beq     sl_sparse_cap_buffer
        cmpa.l  #0x460bf218,%a1
        bne     sl_sparse_cap_out
        lea     sl_sparse_undo:l,%a2
sl_sparse_cap_buffer:
        bsr     sl_ui_readable
        tst.l   %d0
        beq     sl_sparse_cap_empty
        mvz.b   0x100b14ce,%d0
        move.l  72(%sp),%d1             | pattern
        move.l  76(%sp),%d2             | track
        move.l  80(%sp),%d3             | page0..3
        cmpi.l  #4,%d3
        bcc     sl_sparse_cap_empty
        lsl.l   #4,%d3
        moveq   #16,%d7
sl_sparse_cap_loop:
        bsr     sl_row
        move.l  (%a0)+,(%a2)+           | the whole SL_ROW (16-byte) row
        move.l  (%a0)+,(%a2)+
        move.l  (%a0)+,(%a2)+
        move.l  (%a0),(%a2)+
        addq.l  #1,%d3
        subq.l  #1,%d7
        bne     sl_sparse_cap_loop
        bra     sl_sparse_cap_out
sl_sparse_cap_empty:
        moveq   #64,%d7                 | 16 rows of four longs
        moveq   #-1,%d0
sl_sparse_cap_ff:
        move.l  %d0,(%a2)+
        subq.l  #1,%d7
        bne     sl_sparse_cap_ff
sl_sparse_cap_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

sl_sparse_store_hook:
        bsr     sl_sparse_store
        move.b  #1,%d0                  | displaced cb92..cb98
        lsl.l   %d4,%d0
        not.l   %d0
        jmp     0x4002cb9a
sl_sparse_store:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        lea     sl_sparse_clip:l,%a4
        cmpa.l  #0x460c8122,%a6
        beq     sl_ss_buffer
        cmpa.l  #0x460bf218,%a6
        bne     sl_ss_out
        lea     sl_sparse_undo:l,%a4
sl_ss_buffer:
        cmpi.l  #16,%d4                 | native source bit
        bcc     sl_ss_out
        lsl.l   #4,%d4                  | x SL_ROW (16)
        adda.l  %d4,%a4
        move.l  %d5,%d3                 | native wrapped destination step
        move.l  164(%sp),%d1            | original pattern100(oldsp)
        move.l  168(%sp),%d2            | original track104(oldsp)
        moveq   #0,%d4
sl_ss_loop:
        mvz.b   0x100b14ce,%d0
        mvz.b   (%a4)+,%d5
        bsr     sl_write
        addq.l  #1,%d4
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bne     sl_ss_loop
sl_ss_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
        .balign 4
sl_sparse_clip:
        .fill 64,4,0xffffffff           | 16 rows of SL_ROW (16) bytes
sl_sparse_undo:
        .fill 64,4,0xffffffff

| Project/UI reset hook, paired with native clipboard invalidation.
sl_ui_buffers_reset:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        lea     sl_ui_pressed:l,%a0     | sixteen bytes each (controls A..J + spare)
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)
        lea     sl_ui_moved:l,%a0
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)+
        clr.l   (%a0)
        lea     sl_sparse_clip:l,%a0
        move.l  #128,%d1                | both buffers, 16 rows of four longs each
        moveq   #-1,%d0
sl_ubr_loop:
        move.l  %d0,(%a0)+
        subq.l  #1,%d1
        bne     sl_ubr_loop
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        rts
