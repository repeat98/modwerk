| FM Synth on the Octatrack base: the callbacks of its struct modwerk_machine
| (sdk/machines/octatrack/module-adapters/machine-ports.json, ports.synth) over the author's
| machine list (upstream/synth/machine.s). The USB package's base calls them; a card build
| carries the author's own machine list and never does. GNU as, ColdFire, C calling convention
| (arguments on the stack, the answer in d0; d0-d1 / a0-a1 free, every other register kept).
        .text
        .balign 2
        .global fm_port_defaults, fm_port_admit, fm_port_assign, fm_port_tick, fm_port_page, fm_port_render
        .global raise_ev_trig_muted, fm_mm_mode, fm_mm_state

        .set    FM_ROW, 5                | the author's FM SYNTH row (machine.s FM_ROW)
        .set    FLEX, 1                  | the machine byte of a FLEX track (FM SYNTH is stored as FLEX)
        .set    PART_PTR, 0x46c82456     | the bank blob (the author's engine_abi.inc)
        .set    PART_IDX, 0x100b14cf     | the current Part's index
        .set    PART_SHADOW, 0x1001614e  | the bank's mirror in battery RAM: the same offsets
        .set    PART_OFF, 0x8ed80        | blob + part * 6322 + PART_OFF: the Part as the base passes it
        .set    MACH_OFF, 0x8eda2        | the author's Part + track: the machine byte
        .set    SIG, 60                  | the base's Part + 30 * track: the signature (the author's SIG_OFF)
        .set    FLEX_PB, 0x30            | ... + 30 * track: the six FLEX PLAYBACK bytes
        .set    FLEX_SETUP, 0x1e0        | ... + 30 * track: the six FLEX SETUP bytes
        .set    FLEX_DEF, 0x400d320c     | the stock FLEX descriptor's twelve defaults (6 PLAYBACK, 6 SETUP)

| The twelve FLEX bytes a track takes when it becomes FM SYNTH: the values of the author's
| machine.s fm_defaults (PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40; VOIC 1, CHRD none).
fm_port_defaults:
        .byte   64, 12, 32, 64, 0, 40
        .byte   1, 0, 0, 0, 0, 0
        .balign 2

| unsigned fm_port_admit(const volatile uint8_t *part, unsigned track): the author's selection
| guard on the FM SYNTH row for that track of that Part, which need not be the current one
| (machine.s ml_guard_p: the Part's other seven tracks counted by their signatures, the hard
| caps and the load budget) -> 1 admitted, 0 refused. A refusal shows the guard's message in the
| firmware's popup (machine.s ml_toast), as the author's lists do; the base then leaves through
| the window's own refusal exit with nothing written. ml_guard_p keeps every register but d0.
fm_port_admit:
        move.l  %d2,-(%sp)
        movea.l 8(%sp),%a0               | the Part (blob + part * 6322 + PART_OFF)
        suba.l  #PART_OFF,%a0            | ... in the author's form (blob + part * 6322)
        move.l  12(%sp),%d2              | the track
        moveq   #FM_ROW,%d1
        jsr     ml_guard_p               | d0 = 0: allowed; else the message (tst.l done)
        beq.s   1f
        jsr     ml_toast                 | the message in the firmware's popup (d0 / d1 / a0 / a1 clobbered)
        moveq   #0,%d0
        bra.s   2f
1:      moveq   #1,%d0
2:      move.l  (%sp)+,%d2
        rts

| unsigned fm_port_assign(volatile uint8_t *part, unsigned track, unsigned on): the base's
| commit (the machine window's, SRC SETUP's two) after admit_track, in place of the author's
| fm_main_commit / fm_src_commit hooks -> the machine byte to store (FLEX).
|   on 1, the track becomes FM SYNTH: the author's choice of the row (machine.s fm_choose): its
|     signature "FM", 1 in the Part and its shadow, and his machine change (2.12, ml_reset): the
|     FM init (PLAYBACK and its SETUP, AMP and AMP SETUP, the LFOs and LFO SETUP; locks and FX
|     kept) unless the track plays FM SYNTH already, whose patch is the user's.
|   on 0, the track leaves FM SYNTH for a stock machine: the author's choice of FLEX at once
|     (the signature cleared in both copies, FLEX's init); the struct does not name the machine
|     chosen, so a track whose stored machine is another stock machine gets that machine's init
|     (ml_reset) at the next UI tick (fm_port_tick), once the commit has stored it.
| A Part that is not the current one (no live lane to set): what the base does for a machine
| without assign -- on 1 FM SYNTH's twelve FLEX bytes and its signature in both copies (an FM
| track keeps its patch), on 0 stock's FLEX defaults back and the signature cleared.
fm_port_assign:
        lea     -16(%sp),%sp
        movem.l %d2-%d3/%a2-%a3,(%sp)
        movea.l 20(%sp),%a2              | the Part (the base's form)
        move.l  24(%sp),%d2              | the track
        move.l  28(%sp),%d3              | on
        mvz.b   PART_IDX,%d0
        mulu.w  #6322,%d0
        add.l   PART_PTR,%d0
        addi.l  #PART_OFF,%d0            | the current Part, the base's form
        cmpa.l  %d0,%a2
        bne     fm_as_other
        tst.l   %d3
        beq.s   fm_as_leave
        moveq   #FM_ROW,%d1
        jsr     fm_choose                | d1 = FLEX (d2 = the track; every other register kept)
        moveq   #FLEX,%d0
        bra     fm_as_out
fm_as_leave:
        moveq   #FLEX,%d1
        jsr     fm_choose                | FLEX: FM SYNTH's signature cleared, FLEX's init (the machine changed)
        mvz.b   PART_IDX,%d0
        cmp.l   fm_port_pend_part,%d0
        beq.s   1f
        clr.l   fm_port_pend             | a pending track of another Part is no change of this one
        move.l  %d0,fm_port_pend_part
1:      move.l  fm_port_pend,%d0
        bset    %d2,%d0
        move.l  %d0,fm_port_pend         | the stored machine's init at the next UI tick
        moveq   #FLEX,%d0
        bra     fm_as_out
fm_as_other:
        move.l  %a2,%d0
        sub.l   PART_PTR,%d0
        addi.l  #PART_SHADOW,%d0
        movea.l %d0,%a3                  | its shadow (the same offsets)
        move.l  %d2,%d0
        mulu.w  #30,%d0                  | 30 * track
        lea     SIG(%a2,%d0.l),%a0
        bsr     fm_pt_is_fm              | d1 = 1: the track is FM SYNTH's
        tst.l   %d3
        beq.s   2f
        tst.l   %d1
        bne.s   3f                       | FM SYNTH again: its patch is the user's
        lea     fm_port_defaults,%a1
        bsr     fm_pt_flex
        moveq   #1,%d1
        bsr     fm_pt_sign
        bra.s   3f
2:      tst.l   %d1
        beq.s   3f
        lea     FLEX_DEF,%a1
        bsr     fm_pt_flex
        moveq   #0,%d1
        bsr     fm_pt_sign
3:      moveq   #FLEX,%d0
fm_as_out:
        movem.l (%sp),%d2-%d3/%a2-%a3
        lea     16(%sp),%sp
        rts

| fm_pt_is_fm: a0 = a signature's place -> d1 = 1 when it holds "FM", 1, else 0 (tst.l done).
fm_pt_is_fm:
        mvz.b   (%a0),%d1
        cmpi.l  #70,%d1                  | 'F'
        bne.s   1f
        mvz.b   1(%a0),%d1
        cmpi.l  #77,%d1                  | 'M'
        bne.s   1f
        mvz.b   2(%a0),%d1
        cmpi.l  #1,%d1
        bne.s   1f
        moveq   #1,%d1
        rts
1:      moveq   #0,%d1
        rts
| fm_pt_flex: a1 = twelve bytes (6 PLAYBACK, 6 SETUP) -> the track's FLEX bytes in the Part a2
| and its shadow a3; d0 = 30 * track (kept). d1 / a0 / a1 clobbered.
fm_pt_flex:
        move.l  %d2,-(%sp)
        moveq   #FLEX_PB,%d2
        add.l   %d0,%d2
        bsr.s   fm_pt_six
        move.l  #FLEX_SETUP,%d2
        add.l   %d0,%d2
        bsr.s   fm_pt_six
        move.l  (%sp)+,%d2
        rts
fm_pt_six:                               | six bytes from a1 to the Part's and the shadow's + d2
        moveq   #6,%d1
1:      movea.l %a2,%a0
        adda.l  %d2,%a0
        move.b  (%a1),(%a0)
        movea.l %a3,%a0
        adda.l  %d2,%a0
        move.b  (%a1)+,(%a0)
        addq.l  #1,%d2
        subq.l  #1,%d1
        bne.s   1b
        rts
| fm_pt_sign: d1 = 1 writes "FM", 1, d1 = 0 clears the track's signature, in the Part a2 and
| its shadow a3; d0 = 30 * track (kept). d1 / a0 / a1 clobbered.
fm_pt_sign:
        lea     SIG(%a2,%d0.l),%a0
        lea     SIG(%a3,%d0.l),%a1
        tst.l   %d1
        beq.s   1f
        moveq   #70,%d1                  | 'F'
        move.b  %d1,(%a0)
        move.b  %d1,(%a1)
        moveq   #77,%d1                  | 'M'
        move.b  %d1,1(%a0)
        move.b  %d1,1(%a1)
        moveq   #1,%d1
        move.b  %d1,2(%a0)
        move.b  %d1,2(%a1)
        rts
1:      clr.b   (%a0)
        clr.b   1(%a0)
        clr.b   2(%a0)
        clr.b   (%a1)
        clr.b   1(%a1)
        clr.b   2(%a1)
        rts

| void fm_port_tick(void): the machine's ui_tick. A track fm_port_assign left for a stock
| machine other than FLEX gets that machine's init now that the commit has stored it (the
| author's ml_reset: its PLAYBACK column at its stock defaults, the FLEX column at FLEX's,
| AMP, AMP SETUP, the LFOs and LFO SETUP); FLEX's was set at the commit. Nothing for a Part
| that is no longer the current one. ml_reset keeps every register.
fm_port_tick:
        move.l  fm_port_pend,%d0
        bne.s   1f
        rts
1:      lea     -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)
        clr.l   fm_port_pend
        move.l  %d0,%d3                  | the tracks
        mvz.b   PART_IDX,%d1
        cmp.l   fm_port_pend_part,%d1
        bne.s   4f
        mulu.w  #6322,%d1
        movea.l PART_PTR,%a2
        adda.l  %d1,%a2                  | the Part (the author's form)
        moveq   #0,%d2
2:      btst    %d2,%d3
        beq.s   3f
        movea.l %a2,%a0
        adda.l  #MACH_OFF,%a0
        mvz.b   (%a0,%d2.l),%d1          | the machine the commit stored
        moveq   #FLEX,%d0
        cmp.l   %d0,%d1
        beq.s   3f                       | FLEX (or FM SYNTH chosen again): set already
        moveq   #4,%d0
        cmp.l   %d0,%d1
        bhi.s   3f                       | (unsigned) not a stock machine
        moveq   #0,%d0                   | a stock machine, d1; d2 the track
        jsr     ml_reset
3:      addq.l  #1,%d2
        moveq   #8,%d0
        cmp.l   %d0,%d2
        bne.s   2b
4:      movem.l (%sp),%d2-%d3/%a2
        lea     12(%sp),%sp
        rts

| uint32_t fm_port_page(const volatile uint8_t *slot): the FM SYNTH PLAYBACK descriptor
| (page.s fm_descriptor: d0 = the descriptor, built on first use). The page is a DRAM unit
| (Modwerk #895), reached by its symbol, not at the author's cave address.
fm_port_page:
        jmp     fm_descriptor

| int fm_port_render(unsigned track, unsigned ping, unsigned start, unsigned end): the machine's
| render (sy_render), first asking the base which tracks' new trigs a module drops now (the raised
| event ev_trig_muted, Modwerk #912). The answer becomes the two words the author's engine reads
| for a mute module's trig-mute rule (poly.s po_mm_silenced, MM_MODE / MM_STATE: the wrapper
| points them here): mode 2, its tracks' mute bits (8 + t). sy_render then starts no note on those
| tracks and lets a sounding note finish (po_mm_drop), and po_mm_tick ends their voices at STOP as
| the stock kill would. raise_ev_trig_muted stays 0 on a base without the event, when the package
| does not raise it, and on a card build (no base): mode 0, and every trig plays, as stock does.
| Every register is kept; the stack is as the base's call left it when sy_render runs.
fm_port_render:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  raise_ev_trig_muted,%d0
        beq.s   1f
        move.l  %d0,%a0
        jsr     (%a0)                    | unsigned f(void): bit t, track t+1 (handlers keep d2-d7 / a2-a6)
        andi.l  #0xff,%d0
        lsl.l   #8,%d0
        move.l  %d0,fm_mm_state
        moveq   #2,%d0
        move.l  %d0,fm_mm_mode
1:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        jmp     sy_render

        .balign 4
| The raised event's word: zero in the image; the loader points it at the base's
| modwerk_raise_ev_trig_muted at install when the package raises ev_trig_muted and the base has it.
raise_ev_trig_muted:
        .long   0
fm_mm_mode:                              | 0: no mute rule (the author's OT mode); 2: the answer's tracks drop new trigs
        .long   0
fm_mm_state:                             | bit 8 + t: track t+1's new trigs are dropped
        .long   0
fm_port_pend:                            | bit t: track t left FM SYNTH; its stored machine's init is due
        .long   0
fm_port_pend_part:                       | ... in this Part
        .long   0
