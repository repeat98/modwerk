| SYNTH MACHINE -- the machine list (2.10, 8 Oct 2026; table-driven since 2.11): FM SYNTH
| is the sixth row of the machine window (the track key twice, LEFT: SELECT MACHINE TYPE)
| and of SRC SETUP (FUNC + SRC); a machine module that runs on this engine adds the next
| row (2.11: SY DRUM, sy-drum/). GNU as, -mcpu=5475; a DRAM unit linked beside poly.s
| (modules/synth/manifest.py, Linked "fmmachine").
|
| THE ROWS (2.11). ml_rows lists the rows after the stock five, one row descriptor each,
| assembled per remix (remix.inc: FM SYNTH always, SY DRUM when HAVE_SYDRUM); ML_COUNT is
| their number. A row descriptor (20 bytes): +0 its signature (two letters and a version,
| "FM", 1), +3 the engine kind po_signed answers for it (1 FM, 2 SY), +4 its name, +8 its
| twelve seed bytes (6 PLAYBACK, 6 SETUP), +12 a routine returning its PLAYBACK descriptor
| in d0 (SRC SETUP's page for that row; clobbers d0/d1/a0/a1), +16 flags (bit 0: its SETUP
| bytes are not FLEX's; 2.12: not read -- leaving a row resets the FLEX bytes anyway). The
| stock code's row-count and row-bound constants (five machines, rows 0..4) are not poked:
| six small detours take 5 + ML_COUNT and 4 + ML_COUNT, so the same sites serve any number
| of rows and a second machine module needs no site of its own. With FM SYNTH alone every
| list behaves as 2.10's (six rows).
|
| Adapted from Modwerk's FM Synth module (repeat98/modwerk, sdk/octabam/modules/synth:
| machine.s and registration.c, commit 1c1d938; MIT, Copyright (c) 2026 Modwerk
| contributors -- the dedicated chooser, the Part validation and the sample-free
| transport; derived there from Modwerk's Analog BD chooser hooks). Their C helpers are
| written out here by hand; the stubs keep their hook sites and register contracts.
| Changed for this repository: the machine window's commit shares its site with
| po_machwin (poly.s: one detour at 0x40079816 does both jobs); the PLAYBACK page of a
| chosen track is resolved by page.s's pg_resolve (no second resolver detour); no
| refusal path (every track 1..8 may be FM SYNTH); the six-row name table is filled at
| run time from the stock one; a track that already plays the FM voice through a
| marker file keeps its patch when FM SYNTH is chosen over it.
|
| THE STORAGE. A chosen track is stored as FLEX (the machine byte 1, so every stock
| FLEX path -- the PLAYBACK lanes, locks, LFOs, scenes, the DSP voice -- stays valid)
| with the signature "F", "M", 1 in the first three bytes of the track's NEIGHBOR
| PLAYBACK column: the bank blob + part * 6322 + 0x8edbc + 30 * track, and the same
| offset in the battery-RAM shadow. NEIGHBOR has no sample and its six PLAYBACK bytes
| are never written for a FLEX track; the stock validator's NEIGHBOR range is 0..127,
| so "F" (70), "M" (77) and 1 survive a load. A Part is saved, copied, pasted and
| reloaded with its signature like any other Part byte. Choosing FM SYNTH on a track
| that does not play the FM voice yet seeds the FLEX PLAYBACK bytes with PTCH 0, RATO
| 1, INDX 32, FINE 0c, FDBK 0, DEC 40 and the FLEX SETUP bytes with 0 (LOOP, SLIC,
| LEN, RATE, TSTR, TSNS: OFF); choosing it again keeps the patch; choosing any other
| row clears the signature.
|
| THE MACHINE CHANGE (2.12). A change of the machine a track plays, where the old or the
| new machine is a row's (FM SYNTH, SY DRUM), sets the track to the new machine's init:
| PLAYBACK and its SETUP, AMP and AMP SETUP, the three LFOs and LFO SETUP; step and scene
| locks (SY DRUM's lock rows too) and the FX1 / FX2 slots stay (ml_reset). Through either list (fm_choose) and through
| a marker file (poly.s: the slot assigner and the file browser, ml_became / ml_reset). A
| change between two stock machines is stock's (nothing written); a project, a Part
| reload, a paste or a pattern change is no change (the bytes saved are the bytes played).
|
| The engine's side is poly.s: po_is_synth (and the quantizer's qz_is_synth) answer
| yes for a signed track, po_fmstart starts its voice without a sample, po_fmsource
| hands its source to sy_render, sy_call writes the source header stock would have;
| po_signed answers the row's engine kind (2.11).

        .text
        .global fm_machine_name, fm_name_a, fm_src_names
        .global fm_setup_row, fm_chooser_row, fm_setup_open, fm_chooser_open
        .global fm_setup_edit6, fm_setup_draw6
        .global fm_main_commit, fm_src_commit, fm_src_commit2
        .global fm_tick, fm_validate
        .global ml_win_count, ml_src_count, ml_name_bound, ml_draw_bound, ml_hi_bound, ml_cur_bound
        .global ml_clamp1, ml_clamp2, ml_clamp3, ml_clamp4, ml_clamp5
        .global ml_rows, fm_row
        .global ml_reset, ml_kindof, ml_became | 2.12: the machine change's init (poly.s: the marker route)
        .include "remix.inc"             | 2.11: HAVE_SYDRUM and the shared equates (engine_abi.inc; manifest.py)

        .set    FM_ROW, 5                | the sixth row, the first after the stock five: FM SYNTH
        .set    ML_COUNT, 1 + HAVE_SYDRUM | the rows after the stock five (2.11)
        .set    ML_LAST, 4 + ML_COUNT    | the last row's index
        .set    RD_KIND, 3               | a row descriptor: +0 signature (3 B), +3 kind, +4 name,
        .set    RD_NAME, 4               | +8 seeds (12 B), +12 its PLAYBACK descriptor routine, +16 flags
        .set    RD_SEEDS, 8
        .set    RD_DESC, 12
        .set    RD_FLAGS, 16
        .set    FLEX, 1
        .set    PART_OFF, 0x8ed80        | the Part's own +0 (what the validator is handed)
        .set    FLEX_PB, 0x8edb0         | + 30 * track: the FLEX PLAYBACK bytes (PTCH STRT LEN RATE RTRG RTIM)
        .set    SETUP_GAP, 0x1b0         | ... their FLEX SETUP bytes this far on (blob + 0x8ef60 + 30 * track)
        .set    CV_SETUP, 32             | + lane: the PLAYBACK page's SETUP bytes (LOOP SLIC LEN RATE TSTR TSNS)
        .set    SRC_CURSOR, 0x460d5c30   | SRC SETUP's machine row (the sample-list window's)
        .set    NAMES, 0x400a78c8        | the stock machine-name table, five pointers (STATIC .. PICKUP)
        .set    PB_TABLE, 0x400d5f38     | the machine -> PLAYBACK descriptor table (slot 5: a spare)
        .set    FLEX_DEF, 0x400d320c     | the FLEX descriptor's defaults: 6 PLAYBACK, then 6 SETUP bytes
        .set    NAME_RET, 0x400334de     | fm_machine_name's way back
        .set    NAME_A_RET, 0x4003d722
        .set    SETUP_ROW_RET, 0x4003c986
        .set    CHOOSER_HIT, 0x400786ce  | the chooser's row-equals-machine branch ...
        .set    CHOOSER_MISS, 0x400786fc | ... and its other one
        .set    SETUP_OPEN_RET, 0x400585e6
        .set    CHOOSER_OPEN_RET, 0x40078890
        .set    EDIT6_RET, 0x4003a536
        .set    DRAW6_RET, 0x4003cda0
        .set    SRC_COMMIT_RET, 0x4005a61c
        .set    SRC_COMMIT2_RET, 0x4005a856
        .set    TICK_A, 0x4005213c       | the UI tick's two calls fm_tick replays (the first is PC-relative
        .set    TICK_B, 0x4007e940       | in stock, so it is replayed by its absolute address)
        .set    TICK_RET, 0x40052228
        .set    WIN_COUNT_RET, 0x40079250 | the machine window's list init after its `pea 5; pea 6` (ml_win_count)
        .set    SRC_COUNT_RET, 0x40058602 | SRC SETUP's list init after its `pea 5; pea 5` (ml_src_count)
        .set    NAME_BOUND_IN, 0x4003c956 | SRC SETUP's name lookup: the row has a name ...
        .set    NAME_BOUND_OUT, 0x4003c95a | ... or not (the default string)
        .set    DRAW_BOUND_IN, 0x40078684 | the machine window's drawer: the row's name drawn (after the formatter call) ...
        .set    WIN_LIST, 0x460e7386     | SELECT MACHINE TYPE's list: +0 top, +4 cursor in the window, +8 row, +12 visible, +16 count
        .set    DRAW_BOUND_OUT, 0x400786a2 | ... or not
        .set    HI_BOUND_IN, 0x400786d4  | the machine window's highlight: the row is highlighted ...
        .set    CUR_BOUND_IN, 0x400797cc | the machine window's cursor: the row is applied ...
        .set    CUR_BOUND_OUT, 0x4007990c | ... or not
        .set    VALIDATE_BODY, 0x40002320 | the Part validator after its prologue

| ---- fm_choose: d1 = the chosen row, d2 = the track (the current Part) -> d1 = the
| machine byte to store. A row of ml_rows -> FLEX, with that row's signature written into
| the Part and its shadow; a stock row: unchanged, any row's signature cleared. Preserves
| every other register.
| THE MACHINE CHANGE (2.12, Tim, 10 Oct 2026: "all the parameters, including any LFO
| settings, should be set to init. They should not inherit any parameters from the last
| machine that was on that track."). The machine the track plays before the choice (ml_ident:
| 0 a stock machine, 1 FM -- chosen, or FLEX with a marker slot --, 2 SY DRUM) is compared
| with the one it plays after it (the row's engine kind; a stock row: 0, or 1 for FLEX
| whose FLEX slot holds a marker file). When they differ and either is one of the rows'
| machines, the track gets the new machine's init (ml_reset): its PLAYBACK and PLAYBACK
| SETUP bytes, the AMP and AMP SETUP pages, the three LFOs and LFO SETUP; the step and scene
| locks (SY DRUM's lock rows too) and the FX1 / FX2 slots are kept. The same machine again keeps the patch (a track that
| plays the FM voice through a marker file keeps it when FM SYNTH is chosen over it). A
| change between stock machines writes nothing here (stock's own behaviour: each machine
| keeps its PLAYBACK column, every other page stays).
fm_choose:
        lea     -36(%sp),%sp
        movem.l %d0/%d3/%a0-%a6,(%sp)
        movea.l PART_PTR,%a0
        mvz.b   PART_IDX,%d0
        move.l  #6322,%d3
        muls.l  %d3,%d0                  | part * 6322
        adda.l  %d0,%a0                  | the Part
        lea     PART_SHADOW,%a1
        adda.l  %d0,%a1                  | its shadow
        move.l  %d2,%d0
        mulu.w  #30,%d0                  | track * 30
        adda.l  %d0,%a0
        adda.l  %d0,%a1
        movea.l %a0,%a2
        adda.l  #SIG_OFF,%a2             | a2 = the signature in the Part
        movea.l %a1,%a3
        adda.l  #SIG_OFF,%a3             | a3 = ... in the shadow
        bsr     ml_ident                 | (d2) the machine the track plays now: 0 / 1 FM / 2 SY DRUM
        move.l  %d0,%d3
        move.l  %d1,%d0
        subq.l  #FM_ROW,%d0              | the row's index in ml_rows
        cmpi.l  #ML_COUNT,%d0
        bcc     fm_ch_stock              | (unsigned) a stock row
        lea     ml_rows(%pc),%a6
        movea.l (%a6,%d0.l*4),%a6        | a6 = the row's descriptor
        mvz.b   RD_KIND(%a6),%d0         | the machine it plays
        cmp.l   %d3,%d0
        beq     fm_ch_sign               | that machine already: its patch is the user's
        bsr     ml_reset                 | its init (d0 = its kind)
fm_ch_sign:
        move.b  (%a6),(%a2)              | the row's signature: the Part ...
        move.b  1(%a6),1(%a2)
        move.b  2(%a6),2(%a2)
        move.b  (%a6),(%a3)              | ... and its shadow
        move.b  1(%a6),1(%a3)
        move.b  2(%a6),2(%a3)
        moveq   #FLEX,%d1                | stored as FLEX
        bra     fm_ch_out
fm_ch_stock:
        moveq   #0,%d0                   | a stock machine ...
        cmpi.l  #FLEX,%d1
        bne     fm_ch_new
        bsr     ml_flexmark              | ... but FLEX over a marker slot plays the FM voice
fm_ch_new:
        cmp.l   %d3,%d0
        beq     fm_ch_unsign             | the same machine (or stock to stock): nothing written
        bsr     ml_reset                 | d0 = 0 / 1, d1 = the stock machine
fm_ch_unsign:
        movea.l %a2,%a0
        bsr     fm_unsign
        movea.l %a3,%a0
        bsr     fm_unsign
fm_ch_out:
        movem.l (%sp),%d0/%d3/%a0-%a6
        lea     36(%sp),%sp
        rts
| ml_ident: d2 = track of the current Part -> d0 = the machine it plays: 1 FM (FM SYNTH
| chosen, or FLEX with an FMSYNTH* / SYNTH* slot), 2 SY DRUM (chosen), 0 a stock machine;
| tst.l done. Preserves every other register.
ml_ident:
        .if     HAVE_SYDRUM
        jmp     po_ident
        .else
        jmp     po_is_synth
        .endif
| ml_flexmark: d2 = track -> d0 = 1 when the current Part's FLEX slot of the track holds a
| marker file (po_slot_marker), else 0; tst.l done. Preserves every other register.
ml_flexmark:
        move.l  %a0,-(%sp)
        bsr     ml_part
        move.l  %d2,%d0
        mulu.w  #5,%d0
        adda.l  %d0,%a0
        adda.l  #SLOT_FLEX,%a0
        mvz.b   (%a0),%d0                | its FLEX slot, 0-based
        movea.l (%sp)+,%a0
        jmp     po_slot_marker
| ml_part: a0 := the current Part (the bank blob + part * 6322). Preserves every other register.
ml_part:
        move.l  %d0,-(%sp)
        mvz.b   PART_IDX,%d0
        mulu.w  #6322,%d0                | part * 6322 (part 0..3)
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        move.l  (%sp)+,%d0
        rts
| ml_kindof: d0 = a machine byte, d1 = a FLEX slot, d2 = track of the current Part -> d0 =
| the machine the track plays with them: 0 a stock machine, the row's kind for FLEX with a
| row's signature (the Part's), 1 for FLEX over a marker slot; tst.l done. Preserves every
| other register (the assigners' test, before or after their write: poly.s).
ml_kindof:
        cmpi.l  #FLEX,%d0
        bne     ml_ko_stock
        move.l  %a0,-(%sp)
        bsr     ml_part
        move.l  %d2,%d0
        mulu.w  #30,%d0
        adda.l  %d0,%a0
        adda.l  #SIG_OFF,%a0             | the track's signature place
        bsr     ml_sigrow
        bmi     ml_ko_marker
        lea     ml_rows(%pc),%a0
        movea.l (%a0,%d0.l*4),%a0
        mvz.b   RD_KIND(%a0),%d0         | the row's machine
        movea.l (%sp)+,%a0
        rts
ml_ko_marker:
        movea.l (%sp)+,%a0
        move.l  %d1,%d0
        jmp     po_slot_marker
ml_ko_stock:
        moveq   #0,%d0
        rts
| ml_became: the slot assigner's test (poly.s po_assign, after its slot-byte write): d0 =
| the old machine, d1 = the new one, d2 = the track, d3 = the old slot of the new machine's
| column, d4 = its new slot. The machine the track played before the assignment and the one
| it plays after it (ml_kindof, the FLEX slot being d3 / d4 when the new machine is FLEX,
| else the Part's): different, and one of them a row's -> ml_reset to the new one. The
| marker route: a FLEX track given an FMSYNTH* / SYNTH* slot, or a marker track given a
| sample, a STATIC slot... Preserves every register.
ml_became:
        lea     -24(%sp),%sp
        movem.l %d0-%d5,(%sp)
        move.l  %d1,%d5                  | the new machine
        cmpi.l  #FLEX,%d1
        beq     ml_bc_slots              | the FLEX column's slots are d3 (before) and d4 (after)
        bsr     ml_flexslot              | another column: the FLEX slot is the Part's, unchanged
        move.l  %d1,%d3
        move.l  %d1,%d4
ml_bc_slots:
        move.l  %d3,%d1
        bsr     ml_kindof                | d0 (the old machine), d1 (its FLEX slot): before
        move.l  %d0,%d3
        move.l  %d5,%d0
        move.l  %d4,%d1
        bsr     ml_kindof                | after
        cmp.l   %d3,%d0
        beq     ml_bc_out
        move.l  %d5,%d1                  | the new machine (the column of a stock init)
        bsr     ml_reset
ml_bc_out:
        movem.l (%sp),%d0-%d5
        lea     24(%sp),%sp
        rts
| ml_flexslot: d2 = track -> d1 = the current Part's FLEX slot of the track (0-based).
| Preserves every other register.
ml_flexslot:
        move.l  %a0,-(%sp)
        bsr     ml_part
        move.l  %d2,%d1
        mulu.w  #5,%d1
        adda.l  %d1,%a0
        adda.l  #SLOT_FLEX,%a0
        mvz.b   (%a0),%d1
        movea.l (%sp)+,%a0
        rts

| ---- ml_reset (2.12): d0 = the machine the track gets (0 a stock machine, 1 FM SYNTH, 2 SY
| DRUM), d1 = the stock machine (d0 = 0), d2 = the track of the current Part. Writes the
| machine's INIT into the Part, its battery-RAM shadow and the track's live lane, so the
| page shows it at once, the next frame plays it and SAVE keeps it:
|   * PLAYBACK and PLAYBACK SETUP: a row's machine -- its twelve seeds in the FLEX column (FM
|     SYNTH: PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40, SETUP 0; SY DRUM: PTCH 0, MODE
|     A, WDTH 64, SWEP 0, SPED 64, DEC 64, LSPD 64, LDEP 0, WAVE OFF, S&H OFF); a stock
|     machine -- its column at the defaults of its stock PLAYBACK descriptor, and the FLEX
|     column at FLEX's (the FLEX bytes a row's machine had used: they are no sample settings);
|   * AMP (ATK HOLD REL VOL BAL XVOL), AMP SETUP (AMP SYNC ATCK FX1 FX2, and LEG / TRIG), the
|     LFO page (SPD1..3 DEP1..3) and LFO SETUP (PMTR WAVE MULT TRIG of each LFO): the stock
|     new-track values -- what the stock Part initialiser (0x40005638, run for every Part of
|     a new project and by Part CLEAR) writes, read here from the same stock descriptors at
|     run time (their defaults: page 1 at P + 0x5e, page 2 at P + 0x64; the six PMTR / WAVE
|     bytes from the LFO page's slot 6 / 7 defaults and the six MULT / TRIG bytes from its
|     slot 8 / 9 defaults, alternately, as the initialiser writes them);
|     FM SYNTH: VOIC 1 and CHRD off in LFO 3's SPD3 / DEP3 bytes;
| FX1 / FX2 (their effect, page and setup bytes) are kept: effect slots, not the machine's.
| Step locks, scene locks and SY DRUM's own lock rows are kept, as at a stock machine change.
| The live lane gets the bytes written (its PLAYBACK, SETUP, page-1 and page-2 bytes, the
| page-1 value words byte << 8, their slew counters cleared): the stock machine change
| reloads a track from its Part only for PICKUP (0x400972fc -> 0x40001f18), and the frame
| builder refreshes the words from the Part only at a trig from another bank or Part (8 Oct
| 2026: a stale RATE word played 67.8 Hz). Preserves every register.
        .set    LFO_P, 0x400d37f6        | the stock LFO page descriptor (P form)
        .set    AMP_P, 0x400d3988        | the stock AMP page descriptor (P form)
        .set    DEF1, 0x5e               | a descriptor's twelve defaults: page 1 (6), then page 2 (6) at + 6
        .set    PB_OFF, 0x8edaa          | + 30 * track + 6 * machine: a PLAYBACK column (SETUP_GAP on: its SETUP column)
        .set    PAGE1_OFF, 0x8ee9a       | + 24 * track: LFO (SPD1..3 DEP1..3), AMP, FX1, FX2 page 1
        .set    PAGE2_OFF, 0x8f072       | + 30 * track: PMTR1..3 WAVE1..3, AMP SETUP, FX1 SETUP, FX2 SETUP, the MULT / TRIG bytes
        .set    SLOT_FLEX, 0x8f04b       | + 5 * track: the FLEX column's slot byte
        .set    CV_LFO, 6                | the lane: page 1 at + 6 (LFO, then AMP at + 12)
        .set    CV_P2, 38                | ... page 2's PMTR / WAVE at + 38, AMP SETUP at + 44
        .set    CV_MT, 62                | ... MULT / TRIG at + 62
ml_reset:
        lea     -48(%sp),%sp
        movem.l %d0-%d5/%a0-%a5,(%sp)
        bsr     ml_part                  | a0 = the Part
        move.l  %a0,%d3
        sub.l   PART_PTR,%d3
        lea     PART_SHADOW,%a1
        adda.l  %d3,%a1                  | a1 = its shadow
        move.l  %d2,%d3
        mulu.w  #CV_STRIDE,%d3
        addi.l  #CURVALS,%d3
        movea.l %d3,%a2                  | a2 = the track's live lane
        move.l  %d2,%d3
        lsl.l   #6,%d3
        addi.l  #CV_WORDS,%d3
        movea.l %d3,%a3                  | a3 = its value words
        move.l  %d0,%d4                  | the machine
        beq     ml_rs_stock
        bsr     ml_kindrow               | a5 = the row's descriptor
        movea.l RD_SEEDS(%a5),%a5        | its seeds: 6 PLAYBACK, then 6 SETUP
        moveq   #FLEX,%d1
        moveq   #1,%d3
        bsr     ml_column                | the FLEX column, the lane's too
        bra     ml_rs_pages
ml_rs_stock:
        move.l  %d1,%d5                  | the stock machine
        moveq   #FLEX,%d1
        movea.l PB_TABLE+4*FLEX,%a5
        lea     DEF1(%a5),%a5            | FLEX's defaults
        moveq   #0,%d3
        bsr     ml_column                | the FLEX column (Part and shadow)
        move.l  %d5,%d1
        lea     PB_TABLE,%a5             | the machine -> PLAYBACK descriptor table
        movea.l (%a5,%d1.l*4),%a5
        lea     DEF1(%a5),%a5            | the machine's defaults
        moveq   #1,%d3
        bsr     ml_column                | its column, the lane's too
ml_rs_pages:
        move.l  %d2,%d3
        lsl.l   #3,%d3
        move.l  %d3,%d0
        add.l   %d3,%d3
        add.l   %d0,%d3                  | track * 24
        addi.l  #PAGE1_OFF,%d3
        lea     LFO_P+DEF1,%a4           | the LFO page: SPD1..3 DEP1..3
        moveq   #0,%d1
ml_rs_lfo:
        mvz.b   (%a4)+,%d0
        cmpi.l  #1,%d4
        bne     ml_rs_lfo1               | FM SYNTH: SPD3 = VOIC 1, DEP3 = CHRD off
        cmpi.l  #2,%d1
        bne     ml_rs_chrd
        moveq   #1,%d0
ml_rs_chrd:
        cmpi.l  #5,%d1
        bne     ml_rs_lfo1
        moveq   #0,%d0
ml_rs_lfo1:
        bsr     ml_p1byte
        addq.l  #1,%d1
        cmpi.l  #6,%d1
        bne     ml_rs_lfo
        lea     AMP_P+DEF1,%a4           | the AMP page: ATK HOLD REL VOL BAL XVOL
ml_rs_amp:
        mvz.b   (%a4)+,%d0
        bsr     ml_p1byte
        addq.l  #1,%d1
        cmpi.l  #12,%d1
        bne     ml_rs_amp
        move.l  %d2,%d3
        lsl.l   #5,%d3
        sub.l   %d2,%d3
        sub.l   %d2,%d3                  | track * 30
        addi.l  #PAGE2_OFF,%d3
        moveq   #0,%d1                   | page 2's bytes 0..5: PMTR / WAVE of LFO 1..3
        lea     LFO_P+DEF1+6,%a4         | (the LFO page's slot 6 / 7 defaults: PMTR, WAVE)
        bsr     ml_p2pairs
        lea     AMP_P+DEF1+6,%a4         | 6..11: AMP SETUP
ml_rs_amps:
        mvz.b   (%a4)+,%d0
        bsr     ml_p2byte
        addq.l  #1,%d1
        cmpi.l  #12,%d1
        bne     ml_rs_amps
        moveq   #24,%d1                  | 24..29: MULT / TRIG of LFO 1..3
        lea     LFO_P+DEF1+8,%a4         | (slot 8 / 9 defaults: MULT, TRIG)
        bsr     ml_p2pairs
        move.l  %d2,%d0
        lsl.l   #5,%d0
        addi.l  #CV_SLEW,%d0
        movea.l %d0,%a4                  | the slew counters of lane bytes 0..19 (a long per four)
        clr.l   (%a4)+
        clr.l   (%a4)+
        clr.l   (%a4)+
        clr.l   (%a4)+
        clr.l   (%a4)
        movem.l (%sp),%d0-%d5/%a0-%a5
        lea     48(%sp),%sp
        rts
| ml_column: d1 = a machine's column, d2 = track, a5 = 12 bytes (6 PLAYBACK, 6 SETUP), d3 = 1
| to write the live lane (a2) and the value words (a3) too, a0 / a1 = the Part / shadow ->
| the column's PLAYBACK and SETUP bytes written. Clobbers d0 only.
ml_column:
        lea     -12(%sp),%sp
        movem.l %d1/%d4-%d5,(%sp)
        move.l  %d2,%d0
        mulu.w  #30,%d0
        move.l  %d1,%d4
        mulu.w  #6,%d4
        add.l   %d4,%d0
        addi.l  #PB_OFF,%d0              | the column's PLAYBACK bytes
        move.l  %d0,%d5
        addi.l  #SETUP_GAP,%d5           | its SETUP bytes
        moveq   #0,%d1
ml_cl_byte:
        mvz.b   (%a5,%d1.l),%d4
        move.b  %d4,(%a0,%d0.l)          | PLAYBACK k: the Part,
        move.b  %d4,(%a1,%d0.l)          | its shadow
        tst.l   %d3
        beq     ml_cl_setup
        move.b  %d4,(%a2,%d1.l)          | the lane
        lsl.l   #8,%d4
        move.w  %d4,(%a3,%d1.l*2)        | its value word
ml_cl_setup:
        mvz.b   6(%a5,%d1.l),%d4
        move.b  %d4,(%a0,%d5.l)          | SETUP k: the Part,
        move.b  %d4,(%a1,%d5.l)          | its shadow
        tst.l   %d3
        beq     ml_cl_next
        move.b  %d4,CV_SETUP(%a2,%d1.l)  | the lane
ml_cl_next:
        addq.l  #1,%d0
        addq.l  #1,%d5
        addq.l  #1,%d1
        cmpi.l  #6,%d1
        bne     ml_cl_byte
        movem.l (%sp),%d1/%d4-%d5
        lea     12(%sp),%sp
        rts
| ml_p1byte: d0 = a value, d1 = page 1's slot 0..11 (LFO, AMP), d3 = the track's page 1 in
| the Part -> the Part, the shadow, the lane (+ 6 + slot) and the value word written.
ml_p1byte:
        move.l  %d3,-(%sp)
        add.l   %d1,%d3
        move.b  %d0,(%a0,%d3.l)
        move.b  %d0,(%a1,%d3.l)
        move.b  %d0,CV_LFO(%a2,%d1.l)
        lsl.l   #8,%d0
        move.w  %d0,2*CV_LFO(%a3,%d1.l*2)
        move.l  (%sp)+,%d3
        rts
| ml_p2byte: d0 = a value, d1 = page 2's byte 0..29, d3 = the track's page 2 in the Part ->
| the Part, the shadow and the lane (+ 38 + byte; MULT / TRIG at + 62) written.
ml_p2byte:
        move.l  %d3,-(%sp)
        add.l   %d1,%d3
        move.b  %d0,(%a0,%d3.l)
        move.b  %d0,(%a1,%d3.l)
        move.l  (%sp)+,%d3
        cmpi.l  #24,%d1
        bcc     ml_p2_mt
        move.b  %d0,CV_P2(%a2,%d1.l)
        rts
ml_p2_mt:
        move.b  %d0,CV_MT-24(%a2,%d1.l)
        rts
| ml_p2pairs: a4 = two defaults (a, b), d1 = page 2's first byte -> bytes d1 .. d1 + 5 =
| a b a b a b, as the stock initialiser writes them (`slot & 1` picks the default); d1 += 6.
ml_p2pairs:
        moveq   #3,%d5
ml_pp_lfo:
        mvz.b   (%a4),%d0
        bsr     ml_p2byte
        addq.l  #1,%d1
        mvz.b   1(%a4),%d0
        bsr     ml_p2byte
        addq.l  #1,%d1
        subq.l  #1,%d5
        bne     ml_pp_lfo
        rts
| ml_kindrow: d0 = a row's engine kind -> a5 = its descriptor in ml_rows (the first row
| when none matches). Preserves every other register.
ml_kindrow:
        move.l  %d1,-(%sp)
        moveq   #0,%d1
ml_kr_row:
        lea     ml_rows(%pc),%a5
        movea.l (%a5,%d1.l*4),%a5
        cmp.b   RD_KIND(%a5),%d0
        beq     ml_kr_out
        addq.l  #1,%d1
        cmpi.l  #ML_COUNT,%d1
        bne     ml_kr_row
        lea     ml_rows(%pc),%a5
        movea.l (%a5),%a5
ml_kr_out:
        move.l  (%sp)+,%d1
        rts
| ml_sigrow: a0 = a signature's place -> d0 = the index in ml_rows of the row whose
| signature it holds, else -1; tst.l done (bmi: none). Preserves every other register.
ml_sigrow:
        lea     -8(%sp),%sp
        movem.l %d1/%a1,(%sp)
        moveq   #0,%d0
ml_sr_row:
        lea     ml_rows(%pc),%a1
        movea.l (%a1,%d0.l*4),%a1        | the row's descriptor: its signature at +0
        mvz.b   (%a0),%d1
        cmp.b   (%a1),%d1
        bne     ml_sr_next
        mvz.b   1(%a0),%d1
        cmp.b   1(%a1),%d1
        bne     ml_sr_next
        mvz.b   2(%a0),%d1
        cmp.b   2(%a1),%d1
        beq     ml_sr_out
ml_sr_next:
        addq.l  #1,%d0
        cmpi.l  #ML_COUNT,%d0
        bne     ml_sr_row
        moveq   #-1,%d0
ml_sr_out:
        movem.l (%sp),%d1/%a1
        lea     8(%sp),%sp
        tst.l   %d0
        rts
| fm_unsign: a0 = a signature's place -> cleared when it holds a row's signature (d0 clobbered)
fm_unsign:
        bsr     ml_sigrow
        bmi     fm_us_out
        clr.b   (%a0)
        clr.b   1(%a0)
        clr.b   2(%a0)
fm_us_out:
        rts

| ---- 0x40079816 (jmp, 8 B): the machine window's machine-byte write (FUNC + SRC, YES).
| a1 = the bank blob, d0 = part * 6322, d1 = the track, d2 = the part index, d4 = the
| chosen row, a0 = blob + part * 6322 + track. The row becomes the machine byte to store
| (fm_choose), then po_machwin (poly.s) replays the displaced `addal #0x8eda2,%a0; mvsb
| %a0@,%d3` with its FINE rule and stock stores d4 into the Part and its shadow.
fm_main_commit:
        move.l  %d2,-(%sp)
        move.l  %d1,-(%sp)
        move.l  %d1,%d2                  | the track
        move.l  %d4,%d1                  | the row
        bsr     fm_choose
        move.l  %d1,%d4                  | the machine to store
        move.l  (%sp)+,%d1
        move.l  (%sp)+,%d2
        jmp     po_machwin

| ---- 0x4005a616 / 0x4005a850 (jmp, 6 B each): SRC SETUP's two machine-byte writes:
| displaced `movel 0x460d5c30,%d1` (the chosen row), then stock stores d1 at a0 (the
| machine byte) and into the shadow. d2 = the track. The second site follows
| po_machlist's detour (0x4005a848, poly.s), which returns to it.
fm_src_commit:
        move.l  SRC_CURSOR,%d1           | displaced
        bsr     fm_choose
        jmp     SRC_COMMIT_RET
fm_src_commit2:
        move.l  SRC_CURSOR,%d1           | displaced
        bsr     fm_choose
        jmp     SRC_COMMIT2_RET

| ---- fm_type: d0 = a machine read through a0 = a pointer to it -> d0 = 5 + the row's
| index when a0 is the current Part's machine byte of a track whose row of ml_rows is
| chosen (FLEX, signed), else d0 unchanged. Preserves every other register
| (registration.c's fm_type).
fm_type:
        cmpi.l  #FLEX,%d0
        bne     fm_ty_rts
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0-%a1,(%sp)
        movea.l PART_PTR,%a1
        mvz.b   PART_IDX,%d1
        move.l  #6322,%d2
        muls.l  %d2,%d1
        adda.l  %d1,%a1                  | the Part
        move.l  %a0,%d2
        sub.l   %a1,%d2
        subi.l  #MACH_OFF,%d2            | the track, if a0 is one of its machine bytes
        moveq   #8,%d1
        cmp.l   %d1,%d2
        bhs     fm_ty_out                | (unsigned) another byte: unchanged
        mulu.w  #30,%d2
        movea.l %a1,%a0
        adda.l  %d2,%a0
        adda.l  #SIG_OFF,%a0             | the track's signature place (FLEX: the caller's byte)
        bsr     ml_sigrow
        bmi     fm_ty_flex               | unsigned: FLEX
        addq.l  #FM_ROW,%d0              | its row
        bra     fm_ty_out
fm_ty_flex:
        moveq   #FLEX,%d0
fm_ty_out:
        movem.l (%sp),%d1-%d2/%a0-%a1
        lea     16(%sp),%sp
fm_ty_rts:
        rts

| ---- 0x400334d8 (jmp, 6 B): the machine-name formatter name(row): rows 5.. -> their
| names; any other row replays the displaced `movel %d2,%sp@-; movel %sp@(8),%d1`.
fm_machine_name:
        move.l  4(%sp),%d0
        subq.l  #FM_ROW,%d0
        cmpi.l  #ML_COUNT,%d0
        bcs     fm_mn_row                | (unsigned) one of ours
        move.l  %d2,-(%sp)               | displaced
        move.l  8(%sp),%d1               | displaced
        jmp     NAME_RET
fm_mn_row:
        lea     ml_rows(%pc),%a0
        movea.l (%a0,%d0.l*4),%a0
        move.l  RD_NAME(%a0),%d0
        rts

| ---- 0x4003d718 (jmp, 6 B): a track's machine name, d0 = its machine (0..4 checked),
| a0 = its machine byte; displaced `lea 0x400a78c8,%a0`, then d1 := the name (the
| instruction after, `movel %a0@(0,%d0:l:4),%d1`, is done here: rejoins after it).
fm_name_a:
        bsr     fm_type                  | FLEX + signed -> its row
        lea     NAMES,%a0                | displaced
        cmpi.l  #FM_ROW,%d0
        bge     fm_na_row
        move.l  (%a0,%d0.l*4),%d1
        jmp     NAME_A_RET
fm_na_row:
        lea     ml_rows-4*FM_ROW(%pc),%a0
        movea.l (%a0,%d0.l*4),%a0
        move.l  RD_NAME(%a0),%d1
        lea     NAMES,%a0
        jmp     NAME_A_RET

| ---- 0x4003c980 (jmp, 6 B): SRC SETUP's row highlight: displaced `mvsb %a0@,%d0; lea
| %sp@(24),%sp` (a0 = the track's machine byte); a signed track's row is its row.
fm_setup_row:
        mvs.b   (%a0),%d0
        lea     24(%sp),%sp
        bsr     fm_type
        jmp     SETUP_ROW_RET

| ---- 0x400786c8 (jmp, 6 B): the machine window's row highlight: displaced `mvsb
| %a0@,%d0; cmpl %d0,%d2; bnes 0x400786fc` (d2 = the visible row drawn; 2.11: the
| window scrolls, so the list row is d2 + its top, ml_draw_name).
fm_chooser_row:
        mvs.b   (%a0),%d0
        bsr     fm_type
        move.l  WIN_LIST,%d1             | the list's top row (d1 is reloaded at 0x400786fc)
        add.l   %d2,%d1
        cmp.l   %d0,%d1
        bne     fm_cr_miss
        jmp     CHOOSER_HIT
fm_cr_miss:
        jmp     CHOOSER_MISS

| ---- 0x400585dc (jmp, 10 B): SRC SETUP opens on the track's row: displaced `moveb
| %a0@,%d3; mvsb %d3,%d4; pea 0x400bb704`; d4 indexes the PLAYBACK descriptor table
| (slots 5..: the rows' pages, fm_tick), d3 is the row the window starts on.
fm_setup_open:
        move.b  (%a0),%d3
        move.l  %d0,-(%sp)
        mvs.b   %d3,%d0
        bsr     fm_type
        move.l  %d0,%d3
        move.l  (%sp)+,%d0
        mvs.b   %d3,%d4
        pea     (0x400bb704).l           | displaced
        jmp     SETUP_OPEN_RET

| ---- 0x40078886 (jmp, 10 B): the machine window opens on the track's row: displaced
| `mvsb %a0@,%d0; movel %d0,%sp@-; pea 0x460e7386`.
fm_chooser_open:
        mvs.b   (%a0),%d0
        bsr     fm_type
        move.l  %d0,-(%sp)
        pea     (0x460e7386).l           | displaced
        jmp     CHOOSER_OPEN_RET

| ---- 0x4003a52e / 0x4003cd98 (jmp, 8 B each): SRC SETUP's editor and drawer address the
| row's Part bytes at row * 6: displaced `movel %dN,%d0; lsll #3,%d0; addl %dN,%dN; subl
| %dN,%d0` (d2 / d6, the row; d0 / d7 := row * 6). Rows 5.. address FLEX's.
fm_setup_edit6:
        cmpi.l  #FM_ROW,%d2
        blt     fm_e6
        moveq   #FLEX,%d2
fm_e6:
        move.l  %d2,%d0
        lsl.l   #3,%d0
        add.l   %d2,%d2
        sub.l   %d2,%d0
        jmp     EDIT6_RET
fm_setup_draw6:
        cmpi.l  #FM_ROW,%d6
        blt     fm_d6
        moveq   #FLEX,%d6
fm_d6:
        move.l  %d6,%d7
        lsl.l   #3,%d7
        add.l   %d6,%d6
        sub.l   %d6,%d7
        jmp     DRAW6_RET

| ---- 0x4005221e (jmp, 10 B): the UI tick: displaced `jsr 0x4005213c; jsr 0x4007e940`,
| replayed; then SRC SETUP's name table is filled from the stock one and the rows' names,
| and the PLAYBACK descriptor table's spare slots 5.. get the rows' pages (FM SYNTH:
| page.s, built on first use; SY DRUM: its unit's), so the SRC SETUP window has a page
| for each row. (Slots 5 and 6 are spares holding NEIGHBOR's descriptor in stock; slot 7
| is the table's end: two rows at most write here.)
fm_tick:
        jsr     TICK_A                   | displaced
        jsr     TICK_B                   | displaced
        lea     NAMES,%a0
        lea     fm_src_names(%pc),%a1
        moveq   #5,%d0
fm_tk_copy:
        move.l  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bne     fm_tk_copy
        move.l  %a2,-(%sp)
        move.l  %d2,-(%sp)
        moveq   #0,%d2
fm_tk_row:
        lea     ml_rows(%pc),%a2
        movea.l (%a2,%d2.l*4),%a2        | the row's descriptor
        move.l  RD_NAME(%a2),%d0         | its name
        lea     fm_src_names+4*FM_ROW(%pc),%a0
        move.l  %d0,(%a0,%d2.l*4)
        movea.l RD_DESC(%a2),%a0
        jsr     (%a0)                    | d0 = its page (d0/d1/a0/a1 clobbered)
        lea     PB_TABLE+4*FM_ROW,%a0
        move.l  %d0,(%a0,%d2.l*4)
        addq.l  #1,%d2
        cmpi.l  #ML_COUNT,%d2
        bne     fm_tk_row
        move.l  (%sp)+,%d2
        movea.l (%sp)+,%a2
        jmp     TICK_RET

| ---- the six row-count and row-bound sites (2.11): the stock list code was written for
| five machines; 2.10 poked its constants to six rows. Each detour does what the stock
| instruction did with 5 + ML_COUNT rows (the last row ML_LAST), and rejoins.
| 0x40079248 (jmp, 8 B): the machine window's list init, `pea 5; pea 6` (rows, visible).
ml_win_count:
        pea     (5+ML_COUNT).w           | the rows
        pea     6.w                      | the rows visible (stock's)
        jmp     WIN_COUNT_RET
| 0x400585fa (jmp, 8 B): SRC SETUP's list init, `pea 5; pea 5` (rows, visible).
ml_src_count:
        pea     (5+ML_COUNT).w
        pea     5.w
        jmp     SRC_COUNT_RET
| 0x4003c950 (jmp, 6 B): SRC SETUP's name lookup, `moveq #4,%d1; cmpl %d2,%d1; bcss
| 0x4003c95a` (d2 = the row: past the last row, the default string).
ml_name_bound:
        moveq   #ML_LAST,%d1
        cmp.l   %d2,%d1
        bcs     ml_nb_out
        jmp     NAME_BOUND_IN
ml_nb_out:
        jmp     NAME_BOUND_OUT
| 0x40078678 (jmp, 12 B): the machine window's row drawer, `moveq #4,%d0; cmpl %d2,%d0;
| blts 0x400786a2; movel %d2,%sp@-; moveal %d3,%a0; jsr %a0@` (d2 = the visible row, d3 =
| the name formatter). It drew name(d2) for d2 = 0 .. 5 with no scroll offset: a seventh
| row was never drawn and the cursor box left its name (found by a study of the list code, 8 Oct 2026). 2.11:
| name(d2 + the list's top), up to the last row -- the window scrolls as SRC SETUP's does,
| six rows visible. With six rows or fewer the top stays 0: stock's drawing.
ml_draw_bound:
        move.l  WIN_LIST,%d0             | the top row
        add.l   %d2,%d0
        cmpi.l  #ML_LAST,%d0
        bgt     ml_db_out
        move.l  %d0,-(%sp)               | (replaces the pushed d2: the same stack)
        movea.l %d3,%a0
        jsr     (%a0)
        jmp     DRAW_BOUND_IN
ml_db_out:
        jmp     DRAW_BOUND_OUT
| 0x400786ce (jmp, 6 B): the machine window's highlight, `moveq #4,%d0; cmpl %d2,%d0;
| blts 0x400786fc`.
ml_hi_bound:
        moveq   #ML_LAST,%d0
        cmp.l   %d2,%d0
        blt     ml_hb_out
        jmp     HI_BOUND_IN
ml_hb_out:
        jmp     CHOOSER_MISS
| The machine window's row clamp after a list move (five sites, 8 B each: `moveq #5,%d1;
| cmpl %d0,%d1; bges +2; moveq #5,%d0` -- the absolute row 0x460e738e kept to 0..5, the
| six rows the window shows, then handed to the list's row setter 0x4007edb0): a row past
| the sixth was put back on the sixth, so it could not be selected or committed (located by the
| development line's machine-list build, 8 Oct 2026). 2.11: kept to 0 .. the last row.
        .macro  ML_CLAMP n, back
ml_clamp\n:
        moveq   #ML_LAST,%d1
        cmp.l   %d0,%d1
        bge     1f
        moveq   #ML_LAST,%d0
1:      jmp     \back
        .endm
        ML_CLAMP 1, 0x40078c2a
        ML_CLAMP 2, 0x40078cb8
        ML_CLAMP 3, 0x40078d36
        ML_CLAMP 4, 0x40078df6
        ML_CLAMP 5, 0x40078e84
| 0x40079904 (jmp, 8 B): the machine window's cursor, `moveq #4,%d3; cmpl %d4,%d3;
| bgew 0x400797cc` (d4 = the cursor's row).
ml_cur_bound:
        moveq   #ML_LAST,%d3
        cmp.l   %d4,%d3
        blt     ml_cb_out
        jmp     CUR_BOUND_IN
ml_cb_out:
        jmp     CUR_BOUND_OUT

| ---- 0x40002318 (jmp, 8 B): the Part validator (4(sp) = the Part's +0), entered before
| its prologue. The stock validator clamps every column's PLAYBACK bytes into its
| descriptor's ranges -- FLEX's PTCH into 4..124, where FM SYNTH's PTCH is 0..127
| (-64..+63 semitones) -- and the SETUP bytes into theirs (SY DRUM's LSPD is 0..127 in
| FLEX's LOOP byte). For each track signed with a row of ml_rows the twelve FLEX bytes
| are swapped for the stock FLEX defaults (read from the descriptor), the stock
| validator runs, and the row's bytes are put back. d0 = the stock result.
fm_validate:
        lea     -116(%sp),%sp            | 96 B: 8 tracks x 12 saved bytes; 20 B: d2-d4/a2-a3
        movem.l %d2-%d4/%a2-%a3,96(%sp)
        movea.l 120(%sp),%a2
        suba.l  #PART_OFF,%a2            | blob-relative: + MACH_OFF / SIG_OFF / FLEX_PB
        moveq   #0,%d3                   | the signed tracks
        moveq   #0,%d2
fm_vd_save:
        movea.l %a2,%a0
        adda.l  #MACH_OFF,%a0
        mvz.b   (%a0,%d2.l),%d0          | the track's machine
        subq.l  #FLEX,%d0
        bne     fm_vd_snext              | not FLEX
        move.l  %d2,%d0
        mulu.w  #30,%d0
        movea.l %a2,%a0
        adda.l  %d0,%a0
        adda.l  #SIG_OFF,%a0
        bsr     ml_sigrow                | signed with one of the rows?
        bmi     fm_vd_snext
        bset    %d2,%d3
        bsr     fm_vd_ptrs               | a0 = its FLEX bytes, a1 = its save area, a3 = the defaults
        moveq   #6,%d4
fm_vd_s1:
        move.b  (%a0),(%a1)
        move.b  SETUP_GAP(%a0),6(%a1)
        move.b  (%a3),(%a0)
        move.b  6(%a3),SETUP_GAP(%a0)
        addq.l  #1,%a0
        addq.l  #1,%a1
        addq.l  #1,%a3
        subq.l  #1,%d4
        bne     fm_vd_s1
fm_vd_snext:
        addq.l  #1,%d2
        moveq   #8,%d0
        cmp.l   %d0,%d2
        bne     fm_vd_save
        move.l  120(%sp),-(%sp)
        bsr     fm_stock_validate
        addq.l  #4,%sp
        moveq   #0,%d2
fm_vd_rest:
        btst    %d2,%d3
        beq     fm_vd_rnext
        move.l  %d0,-(%sp)
        bsr     fm_vd_ptrs4              | (the stack is 4 deeper here)
        move.l  (%sp)+,%d0
        moveq   #6,%d4
fm_vd_r1:
        move.b  (%a1),(%a0)
        move.b  6(%a1),SETUP_GAP(%a0)
        addq.l  #1,%a0
        addq.l  #1,%a1
        subq.l  #1,%d4
        bne     fm_vd_r1
fm_vd_rnext:
        addq.l  #1,%d2
        moveq   #8,%d4
        cmp.l   %d4,%d2
        bne     fm_vd_rest
        movem.l 96(%sp),%d2-%d4/%a2-%a3
        lea     116(%sp),%sp
        rts
| fm_vd_ptrs: d2 = the track -> a0 = blob-relative Part a2 + FLEX_PB + 30 * track, a1 =
| the caller's save area + 12 * track, a3 = the stock FLEX defaults (d0 clobbered).
fm_vd_ptrs:
        lea     4(%sp),%a1               | the caller's frame: its save area at its 0(sp)
        bra     fm_vd_p
fm_vd_ptrs4:
        lea     8(%sp),%a1
fm_vd_p:
        move.l  %d2,%d0
        mulu.w  #12,%d0
        adda.l  %d0,%a1
        move.l  %d2,%d0
        mulu.w  #30,%d0
        movea.l %a2,%a0
        adda.l  %d0,%a0
        adda.l  #FLEX_PB,%a0
        lea     FLEX_DEF,%a3
        rts
fm_stock_validate:
        lea     -96(%sp),%sp             | displaced
        movem.l %d2-%d7/%a2-%fp,(%sp)    | displaced
        jmp     VALIDATE_BODY

fm_defaults:
        .byte   64, 12, 32, 64, 0, 40    | PLAYBACK: PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40 (Modwerk's)
        .byte   0, 0, 0, 0, 0, 0         | SETUP: LOOP SLIC LEN RATE TSTR TSNS all 0 (OFF)
fm_name:
        .asciz  "FM SYNTH"
        .balign 4
| FM SYNTH's row descriptor (the layout above ml_rows)
fm_row:
        .byte   'F', 'M', 1, 1           | the signature "FM", 1; engine kind 1
        .long   fm_name
        .long   fm_defaults
        .long   FM_DESC                  | page.s's fm_descriptor: the FM SYNTH page (built on first use)
        .byte   0, 0, 0, 0               | flags: its SETUP bytes are FLEX's (kept when it is left, as 2.10)
| THE ROWS after the stock five, in list order (2.11): FM SYNTH, then each machine module
| on this engine the remix carries -- SY DRUM's descriptor is its own unit's sd_row.
ml_rows:
        .long   fm_row
        .if     HAVE_SYDRUM
        .long   sd_row
        .endif
| SRC SETUP's name table (the lea at 0x4003c928 points here): the stock five, copied
| by fm_tick, and the rows' names.
fm_src_names:
        .fill   5+ML_COUNT, 4, 0
