| SY DRUM's step locks follow the stock accepted-event queues (the development line's
| locks_seq, 8 Oct 2026, with the track's machine read from its Part's machine-list
| signature instead of a marker file's name). No card I/O, native parameter column,
| persistent trig mask or Part default is changed. All extension data uses absolute
| addressing: the resident project table is far out of PC-relative reach.
        .text
        .global sl_seq_produce,sl_seq_eligible,sl_seq_promote_a,sl_seq_promote_b
        .global sl_seq_consume,sl_seq_publish,sl_seq_queue_clear,sl_seq_full_restore
        .global sl_seq_tick,sl_seq_reset,sl_seq_release_control

| Producer 4009d1e8(track,bank,pattern,step,queue), before its 104-byte frame.
| Clear the private destination first. Only the condition-approved musical
| eligibility hook below fills it; ancillary-only events cannot leak a row.
sl_seq_produce:
        lea     -12(%sp),%sp
        movem.l %d0/%d2/%a0,(%sp)
        move.l  16(%sp),%d2
        move.l  32(%sp),%d0
        bsr     sl_seq_queue_ptr
        cmpa.l  #0,%a0
        beq     sl_sp_done
        moveq   #-1,%d0                 | an entry is a whole SL_ROW (16-byte) row: A..F, G..J, padding
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)
sl_sp_done:
        movem.l (%sp),%d0/%d2/%a0
        lea     12(%sp),%sp
        lea     -104(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4009d1f0

| d0 bank,d1 pattern,d2 track,d3 step -> d0 = 2 when that pattern's Part plays SY DRUM
| on the track (FLEX with "SY", 1: the machine list's signature), else 0; tst.l done.
| Eligibility of an extension-only (lock-only) event. The active bank's Parts are read
| where the UI edits them (PART_PTR's bank blob); another bank's from its resident blob
| (0x400e21e0 + bank * 0x9b340, the stock queue's prefetch source). Other regs kept.
sl_seq_source_kind:
        lea     -16(%sp),%sp
        movem.l %d1/%d3/%a0-%a1,(%sp)
        cmpi.l  #8,%d2
        bcc     sl_ssk_no
        cmpi.l  #16,%d0
        bcc     sl_ssk_no
        cmpi.l  #16,%d1
        bcc     sl_ssk_no
        move.l  #0x9b340,%d3
        mulu.l  %d0,%d3
        movea.l #0x400e21e0,%a0
        adda.l  %d3,%a0                  | the bank's resident blob
        move.l  #0x8ed8,%d3
        mulu.l  %d1,%d3
        adda.l  %d3,%a0
        adda.l  #0x8e57,%a0
        mvz.b   (%a0),%d1                | the pattern's Part
        suba.l  #0x8e57,%a0
        suba.l  %d3,%a0
        cmpi.l  #4,%d1
        bcc     sl_ssk_no
        lea     0x8000182a,%a1
        mvz.b   (%a1,%d2.l),%d3          | the track's live bank
        cmp.l   %d0,%d3
        bne     sl_ssk_part
        movea.l PART_PTR,%a0             | the active bank: the blob the UI edits
        cmpa.l  #0x40000000,%a0
        bcs     sl_ssk_no
        cmpa.l  #0x48000000,%a0
        bcc     sl_ssk_no
sl_ssk_part:
        move.l  #6322,%d3
        mulu.l  %d1,%d3
        adda.l  %d3,%a0                  | the Part
        move.l  %d2,%d0
        jsr     sd_sig:l                 | sydrum.s: SY DRUM chosen?
        beq     sl_ssk_out
        moveq   #2,%d0
        bra     sl_ssk_out
sl_ssk_no:
        moveq   #0,%d0
sl_ssk_out:
        movem.l (%sp),%d1/%d3/%a0-%a1
        lea     16(%sp),%sp
        tst.l   %d0
        rts

| d0 queue -1/0/1/2,d2 track -> a0 private row, or zero. d0 is scratch.
sl_seq_queue_ptr:
        cmpi.l  #8,%d2
        bcc     sl_sqp_bad
        cmpi.l  #-1,%d0
        beq     sl_sqp_scratch
        cmpi.l  #3,%d0
        bcc     sl_sqp_bad
        lsl.l   #3,%d0
        add.l   %d2,%d0
        lsl.l   #4,%d0                  | x SL_ROW (16)
        lea     sl_seq_queue:l,%a0
        adda.l  %d0,%a0
        rts
sl_sqp_scratch:
        move.l  %d2,%d0
        lsl.l   #4,%d0                  | x SL_ROW (16)
        lea     sl_seq_scratch:l,%a0
        adda.l  %d0,%a0
        rts
sl_sqp_bad:
        suba.l  %a0,%a0
        rts

| 4009d39e: condition already accepted. Add an ephemeral lock-only trigger
| if the dedicated row is present; never write mask2 into the stock bank.
sl_seq_eligible:
        move.l  %a5,%d3                 | displaced
        lea     -28(%sp),%sp
        movem.l %d0-%d4/%a0-%a1,(%sp)
        move.l  140(%sp),%d0            | producer bank arg 112 + save28
        bsr     sl_seq_bank_ok
        tst.l   %d0
        beq     sl_se_done
        move.l  %d7,%d2
        move.l  152(%sp),%d0            | producer queue arg 124 + save28
        bsr     sl_seq_queue_ptr        | the entry takes the snapshot directly
        cmpa.l  #0,%a0
        beq     sl_se_done
        movea.l %a0,%a1
        move.l  140(%sp),%d0
        move.l  144(%sp),%d1
        move.l  148(%sp),%d3
        jsr     sl_row:l
        move.l  (%a0)+,(%a1)+           | immutable snapshot after condition accepted:
        move.l  (%a0)+,(%a1)+           | the whole 16-byte row (A..F, G..J, padding)
        move.l  (%a0)+,(%a1)+
        move.l  (%a0),(%a1)
        lea     -12(%a1),%a1
        move.l  (%sp),%d0
        and.l   12(%sp),%d0             | (d1 keeps the pattern for the machine test below)
        bne     sl_se_done              | native musical event already eligible
        move.l  4(%a1),%d4
        ori.l   #0xffff,%d4
        and.l   (%a1),%d4               | A..F (G H masked off)
        cmpi.l  #-1,%d4
        bne     sl_se_af
        bra     sl_se_none
sl_se_af:
        move.l  140(%sp),%d0
        bsr     sl_seq_source_kind
        tst.l   %d0                     | a SY DRUM track in that bank's Part
        beq     sl_se_none
        moveq   #-1,%d4
        cmp.l   (%a1),%d4               | A..D unlocked (only E / F, a sidecar track's on the
        bne     sl_se_lock              | development line): not a lock trig on SY DRUM
sl_se_none:
        moveq   #-1,%d0                 | not a lock trig: the entry stays empty
        move.l  %d0,(%a1)+
        move.l  %d0,(%a1)+
        move.l  %d0,(%a1)+
        move.l  %d0,(%a1)
        bra     sl_se_done
sl_se_lock:
        move.l  12(%sp),%d0             | a5's selected-step bit saved as d3
        or.l    %d0,(%sp)               | stock combined trigger mask, never bank RAM
sl_se_done:
        movem.l (%sp),%d0-%d4/%a0-%a1
        lea     28(%sp),%sp
        and.l   %d3,%d0                 | displaced
        beq     sl_se_absent
        jmp     0x4009d3a6
sl_se_absent:
        jmp     0x4009d91a

| Two stock start/prefetch paths promote scratch to queue slot zero.
sl_seq_promote_a:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  %d3,%d0
        bsr     sl_seq_promote
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        lea     0x46c7a874,%a1
        jmp     0x4009b874
sl_seq_promote_b:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  %d4,%d0
        bsr     sl_seq_promote
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        lea     0x46c7a874,%a1
        jmp     0x4009c054
sl_seq_promote:                         | d0 is the caller's saved scratch; the entry is four longs
        cmpi.l  #8,%d0
        bcc     sl_spro_out
        lsl.l   #4,%d0
        move.l  %a1,-(%sp)
        lea     sl_seq_scratch:l,%a0
        adda.l  %d0,%a0
        lea     sl_seq_queue:l,%a1
        adda.l  %d0,%a1
        move.l  (%a0)+,(%a1)+
        move.l  (%a0)+,(%a1)+
        move.l  (%a0)+,(%a1)+
        move.l  (%a0),(%a1)
        move.l  (%sp)+,%a1
sl_spro_out:
        rts

| 4000bafe: this queue event has passed native acceptance/mute/due-time gates.
| d5=queue*8+track. Its pending copy survives retriggers exactly as native.
sl_seq_consume:
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        cmpi.l  #24,%d5
        bcc     sl_sc_out
        mvz.b   130(%sp),%d0            | selected event bank: native frame+118
        bsr     sl_seq_bank_ok
        tst.l   %d0
        beq     sl_sc_empty
        move.l  %d5,%d0                 | entries are SL_ROW (16) bytes
        lsl.l   #4,%d0
        lea     sl_seq_queue:l,%a1
        adda.l  %d0,%a1
        bra     sl_sc_store
sl_sc_empty:
        lea     sl_empty_row:l,%a1
sl_sc_store:
        move.l  %d5,%d0
        andi.l  #7,%d0
        move.l  %d1,-(%sp)               | the pending row changes: not known clean
        move.l  sl_seq_cleanm:l,%d1
        bclr    %d0,%d1
        move.l  %d1,sl_seq_cleanm:l
        move.l  (%sp)+,%d1
        lsl.l   #4,%d0
        lea     sl_seq_pending:l,%a0
        adda.l  %d0,%a0
        move.l  (%a1)+,(%a0)+
        move.l  (%a1)+,(%a0)+
        move.l  (%a1)+,(%a0)+
        move.l  (%a1),(%a0)
sl_sc_out:
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
        movem.l (%a0),%d1-%d4/%d6-%d7/%a4-%a5
        movem.l %d1-%d4/%d6-%d7/%a4-%a5,(%a2)
        jmp     0x4000bb06

| 4000c422: native full Part publication clears its complete prior lock mask.
| This also covers same-Part reload, which invalidates the stock cached
| context without changing the selected bank/Part identity.
sl_seq_full_restore:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  122(%sp),%d0
        cmpi.l  #8,%d0
        bcc     sl_sfr_out
        lsl.l   #4,%d0                   | x SL_ROW (16)
        lea     sl_seq_active:l,%a0
        adda.l  %d0,%a0
        moveq   #-1,%d0
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)+
        move.l  %d0,(%a0)
sl_sfr_out:
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        movea.l 184(%sp),%a5
        clr.l   (%a5)
        jmp     0x4000c428

| 4000c62e: after native default restoration/sample locks, before START.
| Frame track=114(sp), bank/Part=118/119(sp), a4=native event flags.
sl_seq_publish:
        lea     -32(%sp),%sp
        movem.l %d0-%d4/%a0-%a2,(%sp)
        move.l  146(%sp),%d2
        cmpi.l  #8,%d2
        bcc     sl_spl_out
        move.l  sl_seq_cleanm:l,%d0     | the rows change here: not known clean
        bclr    %d2,%d0
        move.l  %d0,sl_seq_cleanm:l
        move.l  %d2,%d0                 | entries are SL_ROW (16) bytes
        lsl.l   #4,%d0
        lea     sl_seq_active:l,%a0
        adda.l  %d0,%a0
        lea     sl_seq_pending:l,%a1
        adda.l  %d0,%a1
        lea     sl_seq_context:l,%a2
        move.w  150(%sp),%d0
        cmp.w   (%a2,%d2.l*2),%d0
        beq     sl_spl_flags
        move.w  %d0,(%a2,%d2.l*2)
        bsr     sl_seq_empty_a0         | full Part/bank publication restores defaults
sl_spl_flags:
        mvz.b   150(%sp),%d0
        bsr     sl_seq_bank_ok
        tst.l   %d0
        bne     sl_spl_ready
        bsr     sl_seq_empty_a0
        move.l  %a0,-(%sp)
        movea.l %a1,%a0
        bsr     sl_seq_empty_a0
        movea.l (%sp)+,%a0
        bra     sl_spl_refresh
sl_spl_ready:
        move.l  %a4,%d4
        btst    #6,%d4
        bne     sl_spl_apply
        bsr     sl_seq_empty_a0         | ordinary native lock restoration
sl_spl_apply:
        btst    #3,%d4
        bne     sl_spl_refresh
        moveq   #0,%d3
sl_spl_control:
        mvz.b   (%a1,%d3.l),%d0
        cmpi.l  #255,%d0
        beq     sl_spl_next
        move.b  %d0,(%a0,%d3.l)
        btst    #2,%d4
        bne     sl_spl_next
        moveq   #-1,%d0
        move.b  %d0,(%a1,%d3.l)
sl_spl_next:
        addq.l  #1,%d3
        cmpi.l  #SL_CONTROLS,%d3         | A..J (+ the spare, always 255)
        bne     sl_spl_control
sl_spl_refresh:
        bsr     sl_seq_refresh_track
sl_spl_out:
        movem.l (%sp),%d0-%d4/%a0-%a2
        lea     32(%sp),%sp
        lea     0x46104d15,%a0
        jmp     0x4000c634

| d2 track. Refresh the effective controls: the setup stage (setup_stage.inc.s) for a
| SY DRUM track of a published, unblocked bank -- the live setup default lane plus the
| active lock -- else the track's rows are cleared. Clobbers d0,d1,d3,a0-a2. Never
| changes the Part or a live parameter byte. The development line scans the track's
| live FLEX slot's file name here (its markers); SY DRUM is the Part's signature.
sl_seq_refresh_track:
        lea     0x8000182a,%a0
        mvz.b   (%a0,%d2.l),%d0          | the track's live bank
        bsr     sl_seq_bank_ok
        tst.l   %d0
        bne     sl_srt_ready
        bsr     sl_seq_clear_track
sl_srt_ready:
        jsr     sd_kind:l                | sydrum.s: d0 = 2 for a SY DRUM track of the current Part, else 0
        lea     ss_kind:l,%a0
        move.b  %d0,(%a0,%d2.l)
        bne     sl_srt_synth
        move.l  sl_seq_cleanm:l,%d0      | rows already all "no lock" since their last clear
        btst    %d2,%d0                  | (every writer of a row drops the track's bit): the clear would
        beq     sl_seq_clear_track       | rewrite the same bytes
        rts
sl_srt_synth:
        jmp     ss_stage:l               | THE SETUP STAGE: base -> lock -> effective

| d2 track -> its active and pending entries (SL_ROW bytes each) := no lock.
| Clobbers d0, a0.
sl_seq_clear_track:
        move.l  sl_seq_cleanm:l,%d0      | both rows clean once this returns
        bset    %d2,%d0
        move.l  %d0,sl_seq_cleanm:l
        move.l  %d2,%d0
        lsl.l   #4,%d0                   | x SL_ROW (16)
        lea     sl_seq_active:l,%a0
        adda.l  %d0,%a0
        bsr     sl_seq_empty_a0
        move.l  %d2,%d0
        lsl.l   #4,%d0
        lea     sl_seq_pending:l,%a0
        adda.l  %d0,%a0
| a0 -> its SL_ROW-byte entry := no lock. All registers kept.
sl_seq_empty_a0:
        move.l  %d0,-(%sp)
        moveq   #-1,%d0
        move.l  %d0,(%a0)
        move.l  %d0,4(%a0)
        move.l  %d0,8(%a0)
        move.l  %d0,12(%a0)
        move.l  (%sp)+,%d0
        rts

| Called after sy1_setup_tick and before the LFO tick (sd_tick); covers idle edits.
sl_seq_tick:
        lea     -28(%sp),%sp
        movem.l %d0-%d3/%a0-%a2,(%sp)
        moveq   #0,%d2
sl_st_loop:
        bsr     sl_seq_refresh_track
        addq.l  #1,%d2
        cmpi.l  #8,%d2
        bne     sl_st_loop
        movem.l (%sp),%d0-%d3/%a0-%a2
        lea     28(%sp),%sp
        rts

| Normal default edit only: d2 track,d4 control. Accepted queued events stay
| immutable, just as stock queued parameter rows do. All registers kept.
sl_seq_release_control:
        cmpi.l  #8,%d2
        bcc     sl_src_out
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bcc     sl_src_out
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  %d2,%d0
        lsl.l   #4,%d0                   | x SL_ROW (16)
        lea     sl_seq_active:l,%a0
        adda.l  %d0,%a0
        moveq   #-1,%d0
        move.b  %d0,(%a0,%d4.l)
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
sl_src_out:
        rts

| d0 bank -> d0=1 iff the complete bank is published and unblocked.
| Every table/snapshot/effective reader checks this; other registers kept.
sl_seq_bank_ok:
        move.l  %d1,-(%sp)
        cmpi.l  #16,%d0
        bcc     sl_sbo_no
        move.l  sl_ready_mask:l,%d1
        btst    %d0,%d1
        beq     sl_sbo_no
        move.l  sl_blocked_mask:l,%d1
        btst    %d0,%d1
        bne     sl_sbo_no
        moveq   #1,%d0
        bra     sl_sbo_out
sl_sbo_no:
        moveq   #0,%d0
sl_sbo_out:
        move.l  (%sp)+,%d1
        rts

| Stock queue reset clears future rows, not active/pending native locks.
sl_seq_queue_clear:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        lea     sl_seq_queue:l,%a0
        moveq   #96,%d0                  | 24 entries of four longs
sl_sqc_loop:
        move.l  #-1,(%a0)+
        subq.l  #1,%d0
        bne     sl_sqc_loop
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        move.l  %d2,-(%sp)
        lea     0x80006500,%a1
        jmp     0x4009b228

| Project reset/reload must call this alongside sl_reset. All regs kept.
sl_seq_reset:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        lea     sl_seq_queue:l,%a0
        move.l  #196,%d0                 | queue 96 + scratch 32 + pending 32 + active 32 longs + context 4
sl_sr_loop:
        move.l  #-1,(%a0)+
        subq.l  #1,%d0
        bne     sl_sr_loop
        move.l  #0xff,%d0                | every row "no lock"
        move.l  %d0,sl_seq_cleanm:l
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        rts

        .data
        .balign 4
sl_seq_queue:       .fill 96,4,0xffffffff | every entry is an SL_ROW (16-byte) row: A..F, G..J, padding
sl_seq_scratch:     .fill 32,4,0xffffffff
sl_seq_pending:     .fill 32,4,0xffffffff
sl_seq_active:      .fill 32,4,0xffffffff
sl_seq_context:     .fill 4,4,0xffffffff
sl_seq_cleanm:      .long 0xff            | bit t = active[t] and pending[t] are all 0xff (no lock)
        .text
