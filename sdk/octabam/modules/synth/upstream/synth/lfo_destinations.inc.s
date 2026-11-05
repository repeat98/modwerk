| Module LFO destinations, 2.17. PMTR 30/31 store in the native Part PMTR byte.
| Stock DEP arithmetic writes a private word, never a stock parameter past
| destination 29. The word is preset to the parameter midpoint (63.5 in the
| stock's value << 8 form) before the stock adds its signed, DEP-scaled output
| and clamps 0..127 << 8, so it holds midpoint + offset exactly as a stock
| parameter sitting at its midpoint would, both halves of the waveform kept.
| The next real START samples these words after the existing step > scene >
| Part resolver, subtracts the midpoint and applies the signed offset, then
| the caller applies its budget cap.
| (2.18) With SY DRUM in the remix a SY DRUM track has four such destinations
| of its own, PMTR 30..33 = LSPD LDEP WAVE S&H (its PLAYBACK SETUP controls):
| the same private words and lf_targets record them; SY DRUM's setup stage
| (sy-drum/setup_stage.inc.s ss_lfo_stage) applies the offsets every frame.
        .set    LF_MID, 16256            | 63.5 << 8: the private word's base for the stock arithmetic
        .set    LF_FM_LAST, 31           | the last module destination on an FM SYNTH track (VOIC 30, CHRD 31)
        .set    LF_SY_LAST, 33           | (2.18) on a SY DRUM track (LSPD 30, LDEP 31, WAVE 32, S&H 33)
        .text
        .global lf_apply, lf_lfo_standalone, lf_latch, lf_effective, lf_unlatch
        .global lf_page, lf_stage, lf_move, lf_draw, lf_edit, lf_pmtr_edit
        .global lf_scratch, lf_targets, lf_latched, lf_desc, lf_latch_out

| Existing depth-hook contract: d2 LFO, d4 PMTR, a4 track state, a2 page.
| d0 depth and a1 destination are outputs; every other register is preserved.
| The stock path uses its own DEP/full-depth correction, held output and
| saturation on this scratch word. No DSP/ColdFire destination table is extended.
lf_apply:
        mvs.w   0x12(%a2,%d2.l*2),%d0
        lea     (%a0,%d4.l*2),%a1
        tst.l   %d4
        beq     lf_apply_ptch            | (2.20) PMTR 0 = PTCH
        cmpi.l  #30,%d4
        bcs     lf_apply_out
        lea     -20(%sp),%sp
        movem.l %d0-%d3/%a0,(%sp)
        move.l  %d2,%d3
        move.l  %a4,%d2
        subi.l  #LFO_STATE,%d2
        lsr.l   #3,%d2
        cmpi.l  #8,%d2
        bcc     lf_apply_discard
        bsr     lf_kind_last             | d0 = the track's last module destination (0: none)
        move.l  %d0,%d1
        move.l  %d2,%d0
        add.l   %d0,%d0
        add.l   %d2,%d0
        add.l   %d3,%d0
        lea     lf_targets:l,%a0
        clr.b   (%a0,%d0.l)
        cmp.l   %d1,%d4
        bhi     lf_apply_sink            | not a destination of this track's machine
        move.b  %d4,(%a0,%d0.l)
lf_apply_sink:
        lea     lf_scratch:l,%a1
        adda.l  %d0,%a1
        adda.l  %d0,%a1
        bra     lf_apply_mid
lf_apply_discard:
        lea     lf_discard:l,%a1
lf_apply_mid:
        move.w  #LF_MID,(%a1)            | the base the stock adds to: a negative output now reads below it
        movem.l (%sp),%d0-%d3/%a0
        lea     20(%sp),%sp
lf_apply_out:
        rts

| (2.20) PTCH on an FM SYNTH track, following Jan Kolkmeier's report and fix in Modwerk
| #883 / #884: a synth's PTCH unit is a semitone, five of a sample track's (sy_word), so an
| LFO moved the pitch five times as far as on FLEX. The depth is a fifth here, for both
| depth reads (this routine serves both): 0.2 semitone per unit of depth, as on FLEX (DEP 16
| = about +-3.2 semitones); FLEX's PTCH stops at +-12.8, an FM SYNTH track's goes further.
| Full DEP counts as 0x8000 first, as the stock arithmetic's own full-depth correction makes it.
| Every other track and destination: the stock depth. d0 = the depth (in and out).
lf_apply_ptch:
        tst.l   %d0
        beq     lf_apply_out             | DEP 0 (every LFO's default PMTR is PTCH): nothing to scale
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  %d0,%d1                  | the stock depth
        move.l  %a4,%d2
        subi.l  #LFO_STATE,%d2
        lsr.l   #3,%d2                   | the track
        cmpi.l  #8,%d2
        bcc     lf_ap_keep
        jsr     po_signed:l              | 1 FM SYNTH (d0; every other register kept)
        cmpi.l  #1,%d0
        bne     lf_ap_keep
        cmpi.l  #0x7f00,%d1
        bne     lf_ap_fifth
        move.l  #0x8000,%d1
lf_ap_fifth:
        moveq   #5,%d0
        divs.l  %d0,%d1
lf_ap_keep:
        move.l  %d1,%d0
        movem.l (%sp),%d1-%d2/%a0
        lea     12(%sp),%sp
        rts

lf_lfo_standalone:
        bsr     lf_apply
        jmp     0x40003cac

| d2 track, all registers preserved. Called once at the engine's real START,
| before the warm/cold and mono/poly decision. Multiple LFOs on a destination
| add. Each word less the midpoint is a signed offset of -63.5..+63.5 value
| units (<< 8): 16 units a voice (-3..+3, the sum clamped 1..4) and two units
| a shape (-31..+31, the sum clamped 0..31, no wrap). Signed division
| truncates toward zero, so tiny output either side of zero stays neutral.
lf_latch:
        lea     -40(%sp),%sp
        movem.l %d0-%d7/%a0-%a1,(%sp)
        cmpi.l  #8,%d2
        bcc     lf_latch_out
        lea     lf_latched:l,%a1
        lea     (%a1,%d2.l*4),%a1
        clr.b   (%a1)
        lea     lf_context:l,%a0
        lea     (%a0,%d2.l*4),%a0
        lea     (%a0,%d2.l*4),%a0
        lea     0x8000182a,%a1
        mvz.b   (%a1,%d2.l),%d0
        move.l  %d0,(%a0)
        mvz.b   8(%a1,%d2.l),%d0
        move.l  %d0,4(%a0)
        lea     lf_latched:l,%a1
        lea     (%a1,%d2.l*4),%a1
        bsr     po_fm_kind
        tst.l   %d0
        beq     lf_latch_out
        move.l  PING_AT,%d0
        andi.l  #1,%d0
        mulu.w  #0x180,%d0
        move.l  %d2,%d1
        mulu.w  #48,%d1
        add.l   %d1,%d0
        lea     0x80000510,%a0
        adda.l  %d0,%a0
        lea     0x1e(%a0),%a0
        move.l  %d2,%d3
        add.l   %d3,%d3
        add.l   %d2,%d3
        moveq   #0,%d4
        moveq   #0,%d5
        moveq   #0,%d6
lf_latch_each:
        mvz.b   (%a0)+,%d0
        cmpi.l  #30,%d0
        bcs     lf_latch_next
        cmpi.l  #31,%d0
        bhi     lf_latch_next
        move.l  %a0,-(%sp)
        lea     lf_targets:l,%a0
        cmp.b   (%a0,%d3.l),%d0
        bne     lf_latch_stale
        move.b  #1,(%a1)
        lea     lf_scratch:l,%a0
        mvs.w   (%a0,%d3.l*2),%d1
        subi.l  #LF_MID,%d1              | midpoint + offset -> the signed offset
        cmpi.l  #30,%d0
        bne     lf_latch_chord
        add.l   %d1,%d4
        bra     lf_latch_stale
lf_latch_chord:
        add.l   %d1,%d5
lf_latch_stale:
        movea.l (%sp)+,%a0
lf_latch_next:
        addq.l  #1,%d3
        addq.l  #1,%d6
        cmpi.l  #3,%d6
        bne     lf_latch_each
        tst.b   (%a1)
        beq     lf_latch_out
        jsr     fl_effective:l
        move.l  #4096,%d6
        divs.l  %d6,%d4
        add.l   %d4,%d0
        cmpi.l  #1,%d0
        bge     lf_latch_vmax
        moveq   #1,%d0
lf_latch_vmax:
        cmpi.l  #4,%d0
        ble     lf_latch_vstore
        moveq   #4,%d0
lf_latch_vstore:
        move.b  %d0,1(%a1)
        move.l  %d1,%d7
        andi.l  #3,%d7
        lsr.l   #2,%d1
        move.l  #512,%d6
        divs.l  %d6,%d5
        add.l   %d5,%d1
        bpl     lf_latch_cmax
        moveq   #0,%d1
lf_latch_cmax:
        cmpi.l  #31,%d1
        ble     lf_latch_cstore
        moveq   #31,%d1
lf_latch_cstore:
        lsl.l   #2,%d1
        or.l    %d7,%d1
        move.b  %d1,2(%a1)
lf_latch_out:
        movem.l (%sp),%d0-%d7/%a0-%a1
        lea     40(%sp),%sp
        rts

| d2 track -> d0 VOIC, d1 CHRD, other registers preserved. A sounding note's
| latch survives a PMTR edit and UI Part selection. Only the sounding track's
| bank/Part identity, a native kill, or its next START replaces/clears it.
lf_effective:
        cmpi.l  #8,%d2
        bcc     lf_effective_base
        move.l  %a0,-(%sp)
        lea     lf_latched:l,%a0
        tst.b   (%a0,%d2.l*4)
        beq     lf_effective_unlatched
        lea     0x8000182a,%a0
        mvz.b   (%a0,%d2.l),%d0
        mvz.b   8(%a0,%d2.l),%d1
        lea     lf_context:l,%a0
        lea     (%a0,%d2.l*4),%a0
        lea     (%a0,%d2.l*4),%a0
        cmp.l   (%a0),%d0
        bne     lf_effective_unlatched
        cmp.l   4(%a0),%d1
        bne     lf_effective_unlatched
        lea     lf_latched:l,%a0
        lea     (%a0,%d2.l*4),%a0
        mvz.b   1(%a0),%d0
        mvz.b   2(%a0),%d1
        movea.l (%sp)+,%a0
        rts
lf_effective_unlatched:
        lea     lf_latched:l,%a0
        clr.b   (%a0,%d2.l*4)
        movea.l (%sp)+,%a0
lf_effective_base:
        jmp     fl_effective:l

| A sample START or native voice kill clears the previous FM latch. The kill
| path includes STOP and project/Part loaders. Every register is preserved.
lf_unlatch:
        move.l  %a0,-(%sp)
        lea     lf_latched:l,%a0
        clr.b   (%a0,%d2.l*4)
        movea.l (%sp)+,%a0
        rts

| Return the UI track's descriptor in d0, preserving every other register.
| Only PMTR's count and formatter differ from stock. SPD3/DEP3 remain stock.
lf_ui_desc:
        lea     -12(%sp),%sp
        movem.l %d2/%a0-%a1,(%sp)
        move.l  #LFO_P,%d0
        tst.b   0x80000012
        bne     lf_ui_out
        mvz.b   UI_TRACK,%d2
        bsr     lf_kind_last
        tst.l   %d0
        beq     lf_ui_stock
        bsr     lf_build_desc
        lea     lf_desc:l,%a0
        .if HAVE_SYDRUM
        cmpi.l  #LF_SY_LAST,%d0
        bne     lf_ui_fm
        lea     lf_desc_sy:l,%a0         | SY DRUM: PMTR counts 34
lf_ui_fm:
        .endif
        move.l  %a0,%d0
        bra     lf_ui_out
lf_ui_stock:
        move.l  #LFO_P,%d0
lf_ui_out:
        movem.l (%sp),%d2/%a0-%a1
        lea     12(%sp),%sp
        rts

lf_build_desc:
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        tst.b   lf_built:l
        bne     lf_build_out
        lea     LFO_P,%a0
        lea     lf_desc:l,%a1
        move.l  #LFO_DESC_LEN,%d0
lf_build_copy:
        move.b  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne     lf_build_copy
        lea     lf_desc:l,%a1
        moveq   #32,%d0
        move.l  %d0,0x9a+24(%a1)
        lea     lf_pmtr_fmt:l,%a0
        move.l  %a0,0xca+24(%a1)
        .if HAVE_SYDRUM
        lea     lf_desc:l,%a0            | SY DRUM's copy: the same, with PMTR counting 34
        lea     lf_desc_sy:l,%a1
        move.l  #LFO_DESC_LEN,%d0
lf_build_sy:
        move.b  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne     lf_build_sy
        lea     lf_desc_sy:l,%a1
        moveq   #LF_SY_LAST+1,%d0
        move.l  %d0,0x9a+24(%a1)
        .endif
        lea     lf_built:l,%a0
        move.b  #1,(%a0)
lf_build_out:
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
        rts

| Page resolver's existing LFO branch. Its bank/Part/track identify the page;
| do not substitute UI_TRACK here, because formatters resolve other tracks too.
lf_page:
        move.l  #LFO_P,%d0
        mvz.b   %d5,%d2
        cmpi.l  #1,%d2
        bne     lf_page_out
        move.l  #6322,%d2
        muls.l  %d1,%d2
        add.l   %a1,%d2
        move.l  %d0,-(%sp)
        movea.l %d2,%a0
        move.l  %d3,%d0
        jsr     po_sig:l
        move.l  %d0,%d2
        move.l  (%sp)+,%d0
        cmpi.l  #1,%d2
        bne     lf_page_out
        bsr     lf_build_desc
        lea     lf_desc:l,%a1
        move.l  %a1,%d0
lf_page_out:
        jmp     0x40031ed6

lf_stage:
        subq.l  #4,%sp
        move.l  %d0,-(%sp)
        bsr     lf_ui_desc
        move.l  %d0,4(%sp)
        move.l  (%sp)+,%d0
        jmp     0x4005848e
lf_move:
        subq.l  #4,%sp
        move.l  %d0,-(%sp)
        bsr     lf_ui_desc
        move.l  %d0,4(%sp)
        move.l  (%sp)+,%d0
        jmp     0x4003a462
lf_draw:
        move.l  %d0,-(%sp)
        bsr     lf_ui_desc
        movea.l %d0,%a4
        move.l  (%sp)+,%d0
        jmp     0x400574d2
lf_edit:
        move.l  %d0,-(%sp)
        bsr     lf_ui_desc
        movea.l %d0,%a3
        move.l  (%sp)+,%d0
        jmp     0x40039026

| Native formatter ABI fmt(buffer, value). Native entries tail-call stock.
lf_pmtr_fmt:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  16(%sp),%d0
        cmpi.l  #30,%d0
        bcs     lf_pmtr_stock
        .if HAVE_SYDRUM
        cmpi.l  #LF_SY_LAST,%d0
        bhi     lf_pmtr_stock
        movea.l 12(%sp),%a0
        bsr     lf_pmtr_sy               | a SY DRUM track (the UI's): LSPD LDEP WAVE S&H; an FM track's 32 / 33: ----
        tst.l   %d0
        bne     lf_pmtr_label
        move.l  16(%sp),%d0
        .else
        cmpi.l  #31,%d0
        bhi     lf_pmtr_stock
        movea.l 12(%sp),%a0
        .endif
        cmpi.l  #30,%d0
        beq     lf_pmtr_voic
        move.b  #'C',(%a0)+
        move.b  #'H',(%a0)+
        move.b  #'R',(%a0)+
        move.b  #'D',(%a0)+
        bra     lf_pmtr_label
lf_pmtr_voic:
        move.b  #'V',(%a0)+
        move.b  #'O',(%a0)+
        move.b  #'I',(%a0)+
        move.b  #'C',(%a0)+
lf_pmtr_label:
        clr.b   (%a0)                    | the stock formatter fills two fields: the name at buffer + 0
        move.b  #'S',1(%a0)              | and the page tag at buffer + 5 (0x4003c058: buffer + 5 first,
        move.b  #'R',2(%a0)              | then the slot name); the tag line drew leftover bytes before
        move.b  #'C',3(%a0)
        clr.b   4(%a0)
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        rts
lf_pmtr_stock:
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        jmp     0x4003bf64

| Native audio PMTR editor, after its slot/mode branches. Preserve its encoder
| and store paths. The authored map swaps AMP/LFO display pages, then appends
| VOIC/CHRD. Values >=30 never index either stock order table.
lf_pmtr_edit:
        lea     -12(%sp),%sp
        movem.l %d4/%d6/%a2,(%sp)
        moveq   #29,%d6
        mvz.b   UI_TRACK,%d2
        bsr     lf_kind_last             | 31 FM SYNTH, 33 SY DRUM, 0 any other track
        tst.l   %d0
        beq     lf_pmtr_bound
        move.l  %d0,%d6
lf_pmtr_bound:
        move.l  %d3,%d0
        cmp.l   %d6,%d0
        bls     lf_pmtr_position
        move.l  %d6,%d0
lf_pmtr_position:
        bsr     lf_pmtr_map
        move.l  %d0,%d7
        move.l  %d5,-(%sp)
        clr.l   -(%sp)
        jsr     LFD_ENC
        addq.l  #8,%sp
        add.l   %d7,%d0
        bpl     lf_pmtr_max
        moveq   #0,%d0
lf_pmtr_max:
        cmp.l   %d6,%d0
        ble     lf_pmtr_value
        move.l  %d6,%d0
lf_pmtr_value:
        move.l  %d0,%d7                  | continuation sees the final display position
        move.l  %d0,%d2
        bsr     lf_pmtr_map
        move.l  %d0,%d3
        movem.l (%sp),%d4/%d6/%a2
        lea     12(%sp),%sp
        jmp     LFD_STORE
| d2 = track -> d0 = the last module destination of its machine: 31 on FM SYNTH (VOIC 30,
| CHRD 31), 33 on SY DRUM (LSPD 30 .. S&H 33; only with SY DRUM in the remix), 0 on any other
| track (the stock 30). po_signed reads the current Part. Every other register kept.
lf_kind_last:
        jsr     po_signed:l              | 1 FM SYNTH, 2 SY DRUM, 0 other
        cmpi.l  #1,%d0
        bne     lf_kl_sy
        moveq   #LF_FM_LAST,%d0
        rts
lf_kl_sy:
        .if HAVE_SYDRUM
        cmpi.l  #2,%d0
        bne     lf_kl_none
        moveq   #LF_SY_LAST,%d0
        rts
lf_kl_none:
        .endif
        moveq   #0,%d0
        rts
        .if HAVE_SYDRUM
| a0 = the formatter's buffer, d0 = PMTR 30..33. On the UI's SY DRUM track the name of
| control d0 - 30; on another track PMTR 32 / 33 (no destination there) prints ----.
| d0 = 1 when written (the caller adds the page tag), 0 for the FM names. a0 advanced.
lf_pmtr_sy:
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a1,(%sp)
        move.l  %d0,%d1
        mvz.b   UI_TRACK,%d2
        bsr     lf_kind_last
        cmpi.l  #LF_SY_LAST,%d0
        beq     lf_ps_name
        cmpi.l  #31,%d1
        bls     lf_ps_fm
        lea     lf_ps_none:l,%a1         | 32 / 33 off a SY DRUM track: no destination
        bra     lf_ps_copy
lf_ps_name:
        subi.l  #30,%d1
        lsl.l   #2,%d1
        lea     lf_ps_names:l,%a1
        adda.l  %d1,%a1
lf_ps_copy:
        moveq   #4,%d1
lf_ps_byte:
        move.b  (%a1)+,(%a0)+
        subq.l  #1,%d1
        bne     lf_ps_byte
        moveq   #1,%d0
        bra     lf_ps_out
lf_ps_fm:
        moveq   #0,%d0
lf_ps_out:
        movem.l (%sp),%d1-%d2/%a1
        lea     12(%sp),%sp
        rts
        .data
lf_ps_names:    .ascii  "LSPDLDEPWAVES&H\0"
lf_ps_none:     .ascii  "----"
        .text
        .endif

lf_pmtr_map:
        cmpi.l  #6,%d0
        bcs     lf_pmtr_map_out
        cmpi.l  #12,%d0
        bcs     lf_pmtr_map_plus
        cmpi.l  #18,%d0
        bcc     lf_pmtr_map_out
        subq.l  #6,%d0
        rts
lf_pmtr_map_plus:
        addq.l  #6,%d0
lf_pmtr_map_out:
        rts

        .balign 4
lf_scratch:
        .fill   24,2,0
lf_targets:
        .fill   24,1,0
lf_latched:
        .fill   8,4,0
lf_context:
        .fill   8,8,0
lf_discard:
        .word   0
lf_built:
        .byte   0
        .balign 4
lf_desc:
        .fill   LFO_DESC_LEN,1,0
        .balign 4
        .if HAVE_SYDRUM
lf_desc_sy:                              | (2.18) SY DRUM's: lf_desc with PMTR counting 34
        .fill   LFO_DESC_LEN,1,0
        .balign 4
        .endif
