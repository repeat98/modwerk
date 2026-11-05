| FM SYNTH PLAYBACK SETUP: project-owned defaults, effective readers and descriptor.
| New lock state belongs to fmlock files; the engine's budget arithmetic is unchanged.
        .text
        .global po_fm_kind, po_setup_default, po_setup_patch, po_setup_edit
        .global po_read_voic, po_read_chrd
        .global po_voic_steps, po_voic_dial
        .set PLAY_SETUP, 0x8ef60
        .set SETUP_STEP, 0x4003249c      | the stock SETUP stepper (knob, raw delta) -> steps

| d2 track -> d0 FM boolean. Every other register preserved.
po_fm_kind:
        bsr     po_signed
        cmpi.l  #1,%d0
        seq     %d0
        andi.l  #1,%d0
        rts

| d2 track -> d0 VOIC, d1 CHRD, other registers preserved.
| The Part stores LOOP/SLIC in the FLEX SETUP column. Out-of-range VOIC is mono.
po_setup_default:
        lea     -8(%sp),%sp
        movem.l %d3/%a0,(%sp)
        moveq   #1,%d0
        moveq   #0,%d1
        cmpi.l  #8,%d2
        bcc     po_sd_out
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0
        bcs     po_sd_out
        cmpa.l  #0x48000000,%a0
        bcc     po_sd_out
        mvz.b   PART_IDX,%d3
        cmpi.l  #4,%d3
        bcc     po_sd_out
        mulu.w  #6322,%d3
        adda.l  %d3,%a0
        move.l  %d2,%d3
        mulu.w  #30,%d3
        adda.l  %d3,%a0
        adda.l  #PLAY_SETUP,%a0
        mvz.b   (%a0),%d0
        subq.l  #1,%d0
        cmpi.l  #3,%d0
        bls     po_sd_voice
        moveq   #0,%d0
po_sd_voice:
        addq.l  #1,%d0
        mvz.b   1(%a0),%d1
        andi.l  #127,%d1
po_sd_out:
        movem.l (%sp),%d3/%a0
        lea     8(%sp),%sp
        rts

| Effective VOIC -> d1 or CHRD -> d0, all other registers preserved.
| Both use the same step > scene > Part precedence at every reader.
po_read_voic:
        move.l  %d0,-(%sp)
        jsr     lf_effective:l
        move.l  %d0,%d1
        move.l  (%sp)+,%d0
        rts
po_read_chrd:
        move.l  %d1,-(%sp)
        jsr     lf_effective:l
        move.l  %d1,%d0
        move.l  (%sp)+,%d1
        rts

| a0 descriptor: SETUP A/B become VOIC/CHRD; the other four boxes are removed.
po_setup_patch:
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        movea.l %a0,%a1
        lea     po_voic(%pc),%a0
        move.l  (%a0),0x3a(%a1)
        move.w  4(%a0),0x3e(%a1)
        lea     po_chrd(%pc),%a0
        move.l  (%a0),0x40(%a1)
        move.w  4(%a0),0x44(%a1)
        lea     po_fmt_voic(%pc),%a0
        move.l  %a0,0xca+24(%a1)
        lea     po_fmt_chord(%pc),%a0
        move.l  %a0,0xca+28(%a1)
        lea     po_fmt_blank(%pc),%a0     | SETUP slots 8-11 (stock FLEX boxes) draw no value text
        move.l  %a0,0xca+32(%a1)          | so the neighbour LEN box no longer overruns the CHRD cell
        move.l  %a0,0xca+36(%a1)
        move.l  %a0,0xca+40(%a1)
        move.l  %a0,0xca+44(%a1)
        moveq   #1,%d0
        move.l  %d0,0x6a+24(%a1)
        move.b  %d0,0x5e+6(%a1)
        moveq   #4,%d0
        move.l  %d0,0x9a+24(%a1)
        clr.l   0x6a+28(%a1)
        clr.b   0x5e+7(%a1)
        move.l  #128,%d0
        move.l  %d0,0x9a+28(%a1)
        move.l  0x18e(%a1),%d0
        andi.l  #0x00ffffff,%d0
        ori.l   #0x55000000,%d0           | enabled, fixed-layout SETUP dials
        move.l  %d0,0x18e(%a1)
        move.l  0x18a(%a1),%d0            | slots 8-11 (the stock LEN RATE TSTR TSNS boxes): enable
        andi.l  #0xffff0000,%d0           | nibbles 0, so SRC SETUP draws neither their widget nor
        move.l  %d0,0x18a(%a1)            | their name (fm_setup_draw6 removes their frame lines)
        movea.l %a1,%a0
        jsr     fl_ui_patch:l
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
        rts

| Called at synth's existing SETUP edit site, after descriptor resolution.
| a5 descriptor, a3 control, d3 delta, d4 track. d0: 0 stock, 1 handled,
| 2 ordinary FM default (caller bypasses the range-scaled accumulator).
po_setup_edit:
        move.l  %a0,-(%sp)
        lea     po_pgdesc_buf(%pc),%a0
        cmpa.l  %a0,%a5
        movea.l (%sp)+,%a0
        bne     po_se_no
        cmpa.l  #2,%a3
        bcc     po_se_inert              | knobs C-F: no box on the FM page, the turn edits nothing
        jsr     fs_ui_edit:l
        tst.l   %d0
        bne     po_se_out
        jsr     fl_ui_edit:l
        tst.l   %d0
        bne     po_se_out
        lea     -8(%sp),%sp
        movem.l %d2/%d4,(%sp)
        move.l  %d4,%d2
        jsr     fl_mig_retire_fm:l      | ordinary FM default owns this working Part/track; not a getter
        move.l  %a3,%d4
        jsr     fl_seq_release_control:l
        movem.l (%sp),%d2/%d4
        lea     8(%sp),%sp
        moveq   #2,%d0
        rts
po_se_inert:
        moveq   #1,%d0
        rts
po_se_no:
        moveq   #0,%d0
po_se_out:
        rts

| VOIC steps like the stock few-valued SETUP boxes (LOOP, SLIC): the stock stepper
| accumulates the raw turn in knob A's record and returns one step per threshold, the
| threshold the page set from the box's count (4 values: 819 = 3.2 raw units a step;
| CHRD's 128 values: 256 = one unit). d4 = control, d1 = raw delta -> d1 = steps for
| VOIC (control 0), unchanged for CHRD. Every other register preserved.
po_voic_steps:
        tst.l   %d4
        bne     po_vs_out
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        move.l  %d1,-(%sp)
        clr.l   -(%sp)                   | knob A
        jsr     SETUP_STEP
        addq.l  #8,%sp
        move.l  %d0,%d1
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
po_vs_out:
        rts

| The VOIC dial: the stock dial points at value/127, so 1..4 sat in the first
| 4/128 of its arc. Called from fl_ui_widget just before the stock dial with its
| argument block at 4(sp): value (+12) becomes the pointer position 0/42/85/127 of
| the voice count (a byte outside 1..4 reads 1, as po_fmt_voic), the formatter (+20)
| becomes po_fmt_voic_dial, which prints the count from that position. Registers kept.
po_voic_dial:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  24(%sp),%d0
        subq.l  #1,%d0
        cmpi.l  #3,%d0
        bls     po_vd_pos
        moveq   #0,%d0
po_vd_pos:
        lea     po_voic_pos(%pc),%a0
        mvz.b   (%a0,%d0.l),%d0
        move.l  %d0,24(%sp)
        lea     po_fmt_voic_dial(%pc),%a0
        move.l  %a0,32(%sp)
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        rts

| fmt(buf, position) -> po_fmt_voic(buf, count): positions 0/42/85/127 read 1/2/3/4.
po_fmt_voic_dial:
        lea     -8(%sp),%sp
        movem.l %d0-%d1,(%sp)
        move.l  16(%sp),%d0
        moveq   #1,%d1
        cmpi.l  #21,%d0
        blt     po_fvd_fmt
        addq.l  #1,%d1
        cmpi.l  #64,%d0
        blt     po_fvd_fmt
        addq.l  #1,%d1
        cmpi.l  #106,%d0
        blt     po_fvd_fmt
        addq.l  #1,%d1
po_fvd_fmt:
        move.l  %d1,-(%sp)
        move.l  16(%sp),-(%sp)           | buf
        jsr     po_fmt_voic:l
        addq.l  #8,%sp
        movem.l (%sp),%d0-%d1
        lea     8(%sp),%sp
        rts
po_voic_pos:
        .byte   0, 42, 85, 127
        .balign 2
