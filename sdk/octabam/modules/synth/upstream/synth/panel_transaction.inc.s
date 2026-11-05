| Panel publication is accepted by the frame ISR and follows the actual CF buffer.
| qz_tx is private DRAM shared only when both composition guards are enabled.
| Producer fields 0..15; frame-owned accepted tuple 16..27; 28 reserved.
        .global po_tx_accept, po_tx_seq1, po_tx_seq2, po_tx_seq3, po_tx_seq4
        .global po_tx_copy, po_tx_base
po_tx_accept:
        lea     0x46c80354,%a0
        move.l  114(%sp),%d3
        .if HAVE_PANEL_TRANSACTION
        lea     -12(%sp),%sp
        movem.l %d1/%a1,(%sp)
        move.w  %sr,%d1
        move.w  %d1,8(%sp)
        move.w  #0x2700,%sr
        move.l  (%a0,%d3.l*4),%d0
        move.l  %d3,%d1
        lsl.l   #5,%d1
        lea     qz_tx:l,%a1
        adda.l  %d1,%a1
        clr.b   22(%a1)
        btst    #0,%d0
        beq     po_tx_ac_done
        tst.b   11(%a1)
        beq     po_tx_ac_done
        mvz.b   10(%a1),%d1
        cmpi.l  #1,%d1
        bne     po_tx_ac_done
        move.l  4(%a1),16(%a1)
        move.b  8(%a1),20(%a1)
        move.b  9(%a1),21(%a1)
        move.b  10(%a1),23(%a1)
        move.l  12(%a1),24(%a1)
        moveq   #1,%d1
        move.b  %d1,22(%a1)
        clr.b   11(%a1)
po_tx_ac_done:
        move.w  8(%sp),%d1
        move.w  %d1,%sr
        movem.l (%sp),%d1/%a1
        lea     12(%sp),%sp
        tst.l   %d0                     | replayed command load's condition codes
        .else
        move.l  (%a0,%d3.l*4),%d0
        .endif
        jmp     0x4000b54e

| These are positive sequencer/event contribution branches, not command guesses.
po_tx_seq1:
        .if HAVE_PANEL_TRANSACTION
        bsr     po_tx_seq_clear
        .endif
        lea     0x46104d15,%a1
        jmp     0x4000b90c
po_tx_seq2:
        .if HAVE_PANEL_TRANSACTION
        bsr     po_tx_seq_clear
        .endif
        lea     0x46104d15,%a0
        jmp     0x4000bd7a
po_tx_seq3:
        .if HAVE_PANEL_TRANSACTION
        bsr     po_tx_seq_clear
        .endif
        lea     0x46104d15,%a0
        jmp     0x4000bdc6
po_tx_seq4:
        .if HAVE_PANEL_TRANSACTION
        bsr     po_tx_seq_clear
        .endif
        lea     0x46104d15,%a0
        jmp     0x4000be54

po_tx_copy:
        .if HAVE_PANEL_TRANSACTION
        lea     -24(%sp),%sp
        movem.l %d0-%d1/%a0-%a2,(%sp)
        move.w  %sr,%d0
        move.w  %d0,20(%sp)
        moveq   #8,%d0
        sub.l   %d6,%d0                  | loop countdown -> track
        move.l  %d0,%d1
        lsl.l   #5,%d1
        lea     qz_tx:l,%a0
        adda.l  %d1,%a0
        cmpa.l  #0x80000690,%a1          | actual destination selects the bank
        bcs     po_tx_cp_bank
        addq.l  #8,%d0
po_tx_cp_bank:
        lsl.l   #5,%d0
        lea     po_tx_buffers(%pc),%a2
        adda.l  %d0,%a2
        move.l  %a1,(%a2)
        lea     po_tx_serial(%pc),%a1
        addq.l  #1,(%a1)
        move.l  (%a1),4(%a2)
        move.l  16(%a0),12(%a2)
        move.l  20(%a0),16(%a2)
        move.l  24(%a0),20(%a2)
        clr.b   22(%a0)                 | next frame cannot inherit acceptance
        move.w  20(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d1/%a0-%a2
        lea     24(%sp),%sp
        .endif
        movem.l (%a3),%d0-%d5
        movem.l %d0-%d5,(%a1)
        jmp     0x4000cb32

        .if HAVE_PANEL_TRANSACTION
po_tx_seq_clear:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        move.w  %sr,%d0
        move.w  %d0,12(%sp)
        move.l  134(%sp),%d0            | original frame +114, call4, save16
        move.l  %d0,%d1
        lsl.l   #5,%d0
        lea     qz_tx:l,%a0
        adda.l  %d0,%a0
        tst.b   22(%a0)
        beq     po_tx_sq_done
        clr.b   22(%a0)
        lea     KEYS_AT,%a0
        clr.b   (%a0,%d1.l)             | superseded accepted panel identity only
po_tx_sq_done:
        move.w  12(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d1/%a0
        lea     16(%sp),%sp
        rts

| Called after qz_atrig's snap and before its flag-producing replay.
po_tx_base:
        lea     -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.w  %sr,%d0
        move.w  %d0,16(%sp)
        move.l  138(%sp),%d0            | original +114, call4, save20
        move.l  %d0,%d1
        lsl.l   #5,%d1
        lea     qz_tx:l,%a0
        adda.l  %d1,%a0
        tst.b   22(%a0)
        beq     po_tx_bs_done
        lsl.l   #6,%d0
        lea     0x80000a50,%a1
        mvz.w   (%a1,%d0.l),%d1
        lsr.l   #8,%d1
        move.b  %d1,21(%a0)
po_tx_bs_done:
        move.w  16(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     20(%sp),%sp
        rts

| Exactly one selection per second render call; no ping-only/latest-track match.
po_tx_select:
        lea     -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.w  %sr,%d0
        move.w  %d0,16(%sp)
        lea     po_tx_active(%pc),%a1
        clr.l   (%a1,%d2.l*4)
        lea     po_tx_buffers(%pc),%a0
        moveq   #16,%d0
po_tx_sel_loop:
        cmpa.l  (%a0),%a4
        beq     po_tx_sel_found
        lea     32(%a0),%a0
        subq.l  #1,%d0
        bne     po_tx_sel_loop
        bra     po_tx_sel_done
po_tx_sel_found:
        move.l  4(%a0),%d1
        cmp.l   8(%a0),%d1
        beq     po_tx_sel_done
        move.l  %d1,8(%a0)
        tst.b   18(%a0)
        beq     po_tx_sel_done
        mvz.b   19(%a0),%d1
        cmpi.l  #1,%d1
        bne     po_tx_sel_done
        move.l  %a0,(%a1,%d2.l*4)
po_tx_sel_done:
        move.w  16(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     20(%sp),%sp
        rts

| Input accepted panel tuple, same-frame T_W. Live release mask remains T_MASK.
| Use the existing quantizer mapper, preserving ROOT/bypass/snap/clamp semantics.
po_tx_panel:
        lea     KEYS_AT,%a1
        clr.b   (%a1,%d2.l)             | accepted panel identity consumed here
        lea     -16(%sp),%sp
        move.l  T_W(%a5),(%sp)
        move.l  %a0,4(%sp)
        mvz.b   17(%a0),%d0
        subi.l  #64,%d0
        move.l  #SEMI,%d1
        muls.l  %d1,%d0
        addi.l  #0x4000,%d0
        neg.l   %d0
        add.l   (%sp),%d0
        move.l  %d0,8(%sp)              | all integer/fractional PTCH and FINE delta
        mvz.b   16(%a0),%d7
        bra     po_tx_pan_key
po_tx_pan_next:
        movea.l 4(%sp),%a0
        move.l  20(%a0),%d0             | only membership accepted with this frame
        and.l   T_MASK(%a5),%d0         | a key released meanwhile must not recover
        move.l  T_SMASK(%a5),%d1
        not.l   %d1
        and.l   %d1,%d0
        beq     po_tx_pan_done
        moveq   #0,%d7
po_tx_pan_find:
        btst    %d7,%d0
        bne     po_tx_pan_found
        addq.l  #1,%d7
        bra     po_tx_pan_find
po_tx_pan_found:
        addq.l  #1,%d7
po_tx_pan_key:
        move.l  %d7,12(%sp)
        move.l  %d7,%d0
        subq.l  #1,%d0
        movea.l %d0,%a2
        jsr     qz_chrom:l
        move.l  %a2,%d0
        subi.l  #64,%d0
        move.l  #SEMI,%d1
        muls.l  %d1,%d0
        addi.l  #0x4000,%d0
        add.l   8(%sp),%d0
        move.l  %d0,T_W(%a5)
        move.l  12(%sp),%d7
        jbsr    po_start1
        bra     po_tx_pan_next
po_tx_pan_done:
        move.l  (%sp),T_W(%a5)
        lea     16(%sp),%sp
        rts

| MIDI task helpers run outside the frame ISR; publish only fixed scalar stores
| under the saved interrupt mask. The native duplicate store is skipped.
po_tx_midi_start:
        lea     -32(%sp),%sp
        movem.l %d0-%d3/%a0-%a2,(%sp)
        clr.w   30(%sp)                 | no legato intent, recorder fresh
        moveq   #1,%d3
        bra     po_tx_midi_write
po_tx_midi_poly_leg:
        lea     -32(%sp),%sp
        movem.l %d0-%d3/%a0-%a2,(%sp)
        moveq   #1,%d3
        move.b  %d3,30(%sp)              | FM poly intent, private until commit
        move.b  %d3,31(%sp)
        moveq   #0,%d3
        bra     po_tx_midi_write
po_tx_midi_leg:
        lea     -32(%sp),%sp
        movem.l %d0-%d3/%a0-%a2,(%sp)
        clr.b   30(%sp)
        moveq   #1,%d3
        move.b  %d3,31(%sp)
        moveq   #0,%d3
po_tx_midi_write:
        move.w  %sr,%d0
        move.w  %d0,28(%sp)
        move.w  #0x2700,%sr
        tst.l   %d3
        bne     po_tx_midi_have_command
        move.l  (%a5,%d2.l*4),%d0
        btst    #2,%d0                  | a fresh START already pending: final contributor owns it
        beq     po_tx_midi_leg_command
        moveq   #1,%d3                  | publish this MIDI identity/raw/ring with the merged START
po_tx_midi_leg_command:
        ori.l   #0x119,%d0               | preserves native bits; never creates fresh bit2
        move.l  %d0,(%sp)               | never repost a command read before ISR consumption
po_tx_midi_have_command:
        move.l  %d2,%d0
        lsl.l   #7,%d0
        lea     sy_state:l,%a2
        adda.l  %d0,%a2
        move.b  31(%sp),T_MLEG(%a2)
        tst.b   30(%sp)
        beq     po_tx_midi_no_intent
        move.l  4(%sp),%d1
        move.b  %d1,T_LEGKEY(%a2)
        clr.b   T_LEGN(%a2)
po_tx_midi_no_intent:
        move.l  %d2,%d0
        lsl.l   #5,%d0
        lea     qz_tx:l,%a1
        adda.l  %d0,%a1
        addq.l  #1,(%a1)
        clr.b   11(%a1)
        movea.l %d4,%a2
        move.l  16(%sp),%d0
        move.b  %d0,(%a2)
        tst.l   %d3
        beq     po_tx_midi_command
| Existing eight-entry ring append, bounded scalar stores; full means dropped.
        lea     po_mtail:l,%a1
        mvz.b   (%a1,%d2.l),%d3
        move.l  %d3,%d0
        addq.l  #1,%d0
        andi.l  #7,%d0
        lea     po_mhead:l,%a2
        cmp.b   (%a2,%d2.l),%d0
        beq     po_tx_midi_ring_done
        lea     po_mring:l,%a2
        move.l  %d2,%d1
        lsl.l   #4,%d1
        adda.l  %d1,%a2
        add.l   %d3,%d3
        adda.l  %d3,%a2
        move.l  4(%sp),%d1
        move.b  %d1,(%a2)
        move.l  16(%sp),%d1
        move.b  %d1,1(%a2)
        move.b  %d0,(%a1,%d2.l)
po_tx_midi_ring_done:
        lea     KEYS_AT,%a1
        move.l  4(%sp),%d1
        move.b  %d1,(%a1,%d2.l)
po_tx_midi_command:
        move.l  (%sp),%d0
        move.l  %d0,(%a5,%d2.l*4)
        move.w  28(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d3/%a0-%a2
        lea     32(%sp),%sp
        rts

        .balign 4
po_tx_serial:
        .long   0
po_tx_buffers:                           | ptr, token, used, accepted tuple, spare
        .fill   16*32,1,0
po_tx_active:
        .fill   8*4,1,0
        .else
po_tx_base:
        rts
        .endif
