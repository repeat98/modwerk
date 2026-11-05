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
| chosen track is resolved by page.s's pg_resolve (no second resolver detour); the
| refusal path is this repository's selection guard (2.15, below), not Modwerk's; the
| six-row name table is filled at run time from the stock one; until 2.14 a track that played the FM voice
| through a marker file kept its patch when FM SYNTH was chosen over it (2.15: the marker path is off).
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
| the slot assigner (poly.s, ml_became; until 2.14 also a marker file, through it and the file browser). A
| change between two stock machines is stock's (nothing written); a project, a Part
| reload, a paste or a pattern change is no change (the bytes saved are the bytes played).
|
| THE SELECTION GUARD (2.15). FM SYNTH and SY DRUM render on the ColdFire, and too many
| tracks of them freeze the unit. Both lists refuse a choice that would take the ACTIVE
| Part past the limits of synth/machine_limits.inc (2.15: at most 2 SY DRUM tracks, at
| most 1 FM SYNTH track, and FM SYNTH with at most 1 SY DRUM track), counted over the
| Part's eight audio tracks by the signature each machine keeps in the Part (ml_guard).
| THE LOAD BUDGET (2.16) replaces the three counting rules with one price per Part:
| every FM SYNTH track costs by the voices that may sound on it (LOAD_FM_V1..V4), every
| SY DRUM track LOAD_SY_TRACK, two amounts are paid once (LOAD_S_ANY, LOAD_S_FM), and the
| Part must fit LOAD_BUDGET (ml_cost, ml_over). The lists and the paste guards refuse a
| choice only past the hard caps (ML_FM_MAX, ML_SY_MAX) or when the Part would be over
| the budget with every FM SYNTH track MONO; otherwise the engine CAPS the FM voices:
| ml_cap answers the largest v in 4..1 whose cost fits (1 when none does), the engine
| plays min(VOIC, cap) voices on each FM SYNTH track (poly.s po_voiccap) and the VOIC
| shown stays the Part's. ml_cap serves every voice START, so it reads a cache of this
| unit's own (ml_budget: the 32 bytes the count depends on -- the Part's machine bytes and
| signatures -- and the cap they gave), counted again only when those bytes are not the
| Part's now: a machine store, a paste, a load, PART RELOAD, a bank or Part change, the
| power-on, whatever wrote them (no event is hooked for it). Two FM SYNTH tracks keep four
| voices each; beside an SY DRUM track they go mono; two FM SYNTH and two SY DRUM tracks
| are refused.
| A refused choice writes nothing: the track keeps its machine and its patch, the
| firmware's own message popup shows why (the stock routine and duration the lists use
| for their own NOT AVAILABLE HERE!), and the window leaves through the same exit as
| that stock refusal, so the list works as before. Choosing a track's own machine again
| and choosing any stock machine are always allowed. Stock's copy / paste and undo are
| guarded the same way (the paste guards below), and the 2.10 marker file selects nothing
| since 2.15 (poly.s po_slot_marker), so a row's machine comes from a guarded write only.
| A Part saved by an older build with more loads and plays as saved.
|
| The engine's side is poly.s: po_is_synth (and the quantizer's qz_is_synth) answer
| yes for a signed track, po_fmstart starts its voice without a sample, po_fmsource
| hands its source to sy_render, sy_call writes the source header stock would have;
| po_signed answers the row's engine kind (2.11).

        .text
        .global fm_machine_name, fm_name_a, fm_src_names
        .global fm_setup_row, fm_chooser_row, fm_setup_open, fm_chooser_open, fm_chooser_col
        .global fm_setup_edit6, fm_setup_draw6
        .global fm_main_commit, fm_src_commit, fm_src_commit2
        .global fm_tick, fm_validate
        .global ml_win_count, ml_src_count, ml_name_bound, ml_draw_bound, ml_hi_bound, ml_cur_bound
        .global ml_clamp1, ml_clamp2, ml_clamp3, ml_clamp4, ml_clamp5
        .global ml_rows, fm_row
        .global ml_reset, ml_kindof, ml_became | 2.12: the machine change's init (poly.s: the marker route)
        .global ml_guard, ml_limits      | 2.15: the selection guard and its limits (machine_limits.inc)
        .global ml_cap, ml_cap_now       | 2.16: the FM voice cap of the current Part (poly.s po_voiccap / po_voiccap_now)
        .global fm_page_store, fm_track_undo, fm_track_paste, fm_part_undo, fm_part_paste, fm_preview | 2.15: the paste guards
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
        .set    LFO_PMTR, 0x8f072        | + 30 * track: the LFO SETUP column's three PMTR bytes (stock Part bytes)
        .set    LFD_MODULE_FIRST, 30     | the module's LFO destinations VOIC (30) and CHRD (31): past the stock
        .if     HAVE_SYDRUM              | descriptor's count, so the stock Part validator would clamp or reject them
        .set    LFD_MODULE_LAST, 33      | (2.18) and SY DRUM's LSPD LDEP WAVE S&H (30..33, lfo_destinations.inc.s)
        .else
        .set    LFD_MODULE_LAST, 31
        .endif
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
        .set    CHOOSER_COL_RET, 0x400788cc | the machine window's opening column, after its machine test
        .set    EDIT6_RET, 0x4003a536
        .set    DRAW6_RET, 0x4003cda0
        .set    FILL_RECT, 0x40012254    | the stock rectangle fill (window, x0, y0, x1, y1, mode)
        .set    SRC_COMMIT_RET, 0x4005a61c
        .set    SRC_COMMIT2_RET, 0x4005a856
        .set    TICK_A, 0x4005213c       | the UI tick's two calls fm_tick replays (the first is PC-relative
        .set    TICK_B, 0x4007e940       | in stock, so it is replayed by its absolute address)
        .set    TICK_RET, 0x40052228
        .set    WIN_COUNT_RET, 0x40079250 | the machine window's list init after its pushes of 5 and 6 (ml_win_count)
        .set    SRC_COUNT_RET, 0x40058602 | SRC SETUP's list init after its pushes of 5 and 5 (ml_src_count)
        .set    NAME_BOUND_IN, 0x4003c956 | SRC SETUP's name lookup: the row has a name ...
        .set    NAME_BOUND_OUT, 0x4003c95a | ... or not (the default string)
        .set    DRAW_BOUND_IN, 0x40078684 | the machine window's drawer: the row's name drawn (after the formatter call) ...
        .set    WIN_LIST, 0x460e7386     | SELECT MACHINE TYPE's list: +0 top, +4 cursor in the window, +8 row, +12 visible, +16 count
        .set    DRAW_BOUND_OUT, 0x400786a2 | ... or not
        .set    HI_BOUND_IN, 0x400786d4  | the machine window's highlight: the row is highlighted ...
        .set    CUR_BOUND_IN, 0x400797cc | the machine window's cursor: the row is applied ...
        .set    CUR_BOUND_OUT, 0x4007990c | ... or not
        .set    VALIDATE_BODY, 0x40002320 | the Part validator after its prologue
        .set    TOAST, 0x4005a2b8        | the firmware's message popup: (text, duration); both lists' own refusal calls it
        .set    TOAST_TIME, 48           | ... with this duration (NOT AVAILABLE HERE!)
        .set    WIN_REFUSE, 0x4007989c   | the machine window's way out after its own refusal (the stack as at the commit)
        .set    SRC_REFUSE, 0x4005a8ba   | SRC SETUP's way out after its own refusal (both of its paths)
        .if     (ML_FM_MAX < 1) || (ML_FM_MAX > 8) || (ML_SY_MAX < 1) || (ML_SY_MAX > 8)
        .error  "machine_limits.inc: ML_FM_MAX and ML_SY_MAX are 1..8"
        .endif
        .if     (LOAD_S_ANY < 0) || (LOAD_S_ANY > 255) || (LOAD_S_FM < 0) || (LOAD_S_FM > 255) || (LOAD_SY_TRACK < 0) || (LOAD_SY_TRACK > 255)
        .error  "machine_limits.inc: LOAD_S_ANY, LOAD_S_FM and LOAD_SY_TRACK are 0..255"
        .endif
        .if     (LOAD_FM_V1 < 0) || (LOAD_FM_V1 > LOAD_FM_V2) || (LOAD_FM_V2 > LOAD_FM_V3) || (LOAD_FM_V3 > LOAD_FM_V4) || (LOAD_FM_V4 > 255)
        .error  "machine_limits.inc: LOAD_FM_V1 <= LOAD_FM_V2 <= LOAD_FM_V3 <= LOAD_FM_V4, each 0..255"
        .endif
        .if     (LOAD_BUDGET < 1) || (LOAD_BUDGET > 9999)
        .error  "machine_limits.inc: LOAD_BUDGET is 1..9999"
        .endif
        .if     (LOAD_S_ANY + LOAD_S_FM + LOAD_FM_V1 > LOAD_BUDGET) || (LOAD_S_ANY + LOAD_SY_TRACK > LOAD_BUDGET)
        .error  "machine_limits.inc: one FM SYNTH track (mono) and one SY DRUM track must each fit LOAD_BUDGET"
        .endif

| ---- fm_choose: d1 = the chosen row, d2 = the track (the current Part) -> d1 = the
| machine byte to store. A row of ml_rows -> FLEX, with that row's signature written into
| the Part and its shadow; a stock row: unchanged, any row's signature cleared. Preserves
| every other register.
| THE MACHINE CHANGE (2.12, Tim, 10 Oct 2026: "all the parameters, including any LFO
| settings, should be set to init. They should not inherit any parameters from the last
| machine that was on that track."). The machine the track plays before the choice (ml_ident:
| 0 a stock machine, 1 FM -- chosen, or FLEX with a marker slot --, 2 SY DRUM) is compared
| with the one it plays after it (the row's engine kind; a stock row: 0, or 1 for FLEX
| whose FLEX slot holds a marker file; 2.15: no slot is a marker, po_slot_marker). When they differ and either is one of the rows'
| machines, the track gets the new machine's init (ml_reset): its PLAYBACK and PLAYBACK
| SETUP bytes, the AMP and AMP SETUP pages, the three LFOs and LFO SETUP; the step and scene
| locks (SY DRUM's lock rows too) and the FX1 / FX2 slots are kept. The same machine again keeps the patch. A
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
        cmpi.l  #1,%d0
        bne     fm_ch_retire_other
        jsr     fl_mig_retire_fm:l      | new/reselected FM may freeze an empty state-1 checkpoint
        bra     fm_ch_retired
fm_ch_retire_other:
        jsr     fl_mig_retire:l         | other kinds retire existing legacy ownership only
fm_ch_retired:
        cmp.l   %d3,%d0
        beq     fm_ch_sign               | that machine already: its patch is the user's
        bsr     ml_warn_mono
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
        jsr     fl_mig_retire:l         | no new FM checkpoint for a stock-only assignment
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
| Chosen kind d0, track d2. One popup on choosing SY beside an FM track.
| This changes no guard or budget decision; every register is preserved.
ml_warn_mono:
        cmpi.l  #2,%d0
        bne     ml_wm_out
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        bsr     ml_part
        bsr     ml_count
        tst.l   %d0
        beq     ml_wm_done
        lea     ml_msg_mono(%pc),%a0
        move.l  %a0,%d0
        bsr     ml_toast
ml_wm_done:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
ml_wm_out:
        rts

| ml_ident: d2 = track of the current Part -> d0 = the machine it plays: 1 FM (FM SYNTH
| chosen; until 2.14 also FLEX with an FMSYNTH* / SYNTH* slot), 2 SY DRUM (chosen), 0 a stock machine;
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
| sample, a STATIC slot... 2.15: a track that leaves FLEX keeps no signature (cleared
| after its init), and FLEX given to a track that was not FLEX revives none (cleared
| before: the slot assigned plays) -- a row's machine comes from a guarded write only.
| Preserves every register.
ml_became:
        lea     -24(%sp),%sp
        movem.l %d0-%d5,(%sp)
        cmpi.l  #FLEX,%d1
        bne     ml_bc_kinds
        cmpi.l  #FLEX,%d0
        beq     ml_bc_kinds              | FLEX to FLEX: the track keeps its machine
        bsr     ml_unsign_t              | (2.15) FLEX given now: no signature revived
ml_bc_kinds:
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
        cmpi.l  #FLEX,%d5
        beq     ml_bc_rts
        bsr     ml_unsign_t              | (2.15) not FLEX now: the signature goes
ml_bc_rts:
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
        cmpi.l  #1,%d0
        bne     ml_rs_retire_other
        jsr     fl_mig_retire_fm:l      | slot/browser machine changes share this native reset
        bra     ml_rs_retired
ml_rs_retire_other:
        jsr     fl_mig_retire:l
ml_rs_retired:
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
| (fm_choose), then po_machwin (poly.s) replays the displaced instructions (0x8eda2 added
| to a0, the signed byte at a0 into d3) with its FINE rule and stock stores d4 into the Part and its shadow. Stock
| goes on with d0 (+ d1: the shadow's byte, 0x100a4ef0 + part * 6322 + track), d1, d2
| (the Part's change bit), d3 (the old machine), d4 and a0 / a1: each is what it was, d4
| the machine to store (2.15: the guard's verdict is not left in d0).
fm_main_commit:
        move.l  %d2,-(%sp)
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)               | part * 6322: stock's shadow offset
        move.l  %d1,%d2                  | the track
        move.l  %d4,%d1                  | the row
        bsr     ml_guard                 | 2.15: over a limit? (d0 = the verdict)
        bne     fm_mc_refuse
        bsr     fm_choose
        move.l  %d1,%d4                  | the machine to store
        move.l  (%sp)+,%d0
        move.l  (%sp)+,%d1
        move.l  (%sp)+,%d2
        jmp     po_machwin
fm_mc_refuse:
        lea     12(%sp),%sp              | the exit reloads what it uses
        bsr     ml_toast
        jmp     WIN_REFUSE               | nothing written: the stock refusal's exit

| ---- 0x4005a616 / 0x4005a850 (jmp, 6 B each): SRC SETUP's two machine-byte writes:
| displaced: the long at 0x460d5c30 into d1 (the chosen row), then stock stores d1 at a0 (the
| machine byte) and into the shadow. d2 = the track. The second site follows
| po_machlist's detour (0x4005a848, poly.s), which returns to it. Stock goes on with d0
| (part * 6322; + d2: the shadow's byte), d1 (the machine to store), d2, d3 (the part
| index: the Part's change bit), d4 (the old machine), a0 and a1: each is returned as it
| came but d1 (2.15: the guard's verdict is not left in d0).
| 2.15: a row the guard refuses leaves through SRC_REFUSE with nothing written.
fm_src_commit:
        move.l  SRC_CURSOR,%d1           | displaced
        move.l  %d0,-(%sp)               | part * 6322
        bsr     ml_guard                 | (d0 = the verdict)
        bne     fm_sc_refuse
        move.l  (%sp)+,%d0
        bsr     fm_choose
        jmp     SRC_COMMIT_RET
fm_src_commit2:
        move.l  SRC_CURSOR,%d1           | displaced
        move.l  %d0,-(%sp)
        bsr     ml_guard
        bne     fm_sc_refuse
        move.l  (%sp)+,%d0
        bsr     fm_choose
        jmp     SRC_COMMIT2_RET
fm_sc_refuse:
        addq.l  #4,%sp                   | SRC_REFUSE reloads what it uses
        bsr     ml_toast
        jmp     SRC_REFUSE

| ---- the selection guard (2.15; 2.16: the load budget) ----
| ml_guard: d1 = the chosen row, d2 = the track (the current Part) -> d0 = 0 when the
| choice is allowed, else the message that refuses it; tst.l done. A stock row, or the row
| of the machine the track has already, is allowed; a row's machine is refused when, with
| it in the Part (the other seven tracks counted by their signatures, ml_count), the Part
| would hold more than ML_FM_MAX FM SYNTH tracks ("FM SYNTH: 2 MAX"), more than ML_SY_MAX
| SY DRUM tracks ("SY DRUM: 2 MAX"), or cost more than LOAD_BUDGET with every FM SYNTH
| track mono (ml_over, ml_cost at v = 1: "FM+SY DRUM: LIMIT"). Otherwise the voice cap
| (ml_cap) fits the Part to the budget. The hard caps are read from ml_limits. Preserves
| every other register. ml_guard_p: the same for a0 = any Part (the paste guards: the Part
| a stock paste writes into).
        .set    LIM_FM, 0                | ml_limits: the two bytes
        .set    LIM_SY, 1
ml_guard:
        move.l  %a0,-(%sp)
        bsr     ml_part                  | a0 = the current Part
        bsr     ml_guard_p
        movea.l (%sp)+,%a0
        tst.l   %d0
        rts
ml_guard_p:
        lea     -24(%sp),%sp
        movem.l %d1-%d5/%a1,(%sp)
        move.l  %d1,%d0
        subq.l  #FM_ROW,%d0
        cmpi.l  #ML_COUNT,%d0
        bcc     ml_gd_ok                 | (unsigned) a stock row: always
        lea     ml_rows(%pc),%a1
        movea.l (%a1,%d0.l*4),%a1
        mvz.b   RD_KIND(%a1),%d5         | the machine chosen: 1 FM SYNTH, 2 SY DRUM
        move.l  %d2,%d0
        bsr     ml_sigkind               | (a0 = the Part) the machine the track has
        cmp.l   %d5,%d0
        beq     ml_gd_ok                 | the track's own machine again: always
        bsr     ml_count                 | d0 = FM SYNTH tracks among the other seven (d2 left out), d1 = SY DRUM tracks
        cmpi.l  #2,%d5
        beq     ml_gd_sy
        addq.l  #1,%d0                   | FM SYNTH chosen: one FM SYNTH track more ...
        bra     ml_gd_test
ml_gd_sy:
        addq.l  #1,%d1                   | SY DRUM chosen: one SY DRUM track more ...
ml_gd_test:
        bsr     ml_over                  | ... in the Part: past a hard cap, or over the budget at mono? (d0 = the message, or 0)
        bra     ml_gd_out
ml_gd_ok:
        moveq   #0,%d0
ml_gd_out:
        movem.l (%sp),%d1-%d5/%a1
        lea     24(%sp),%sp
        tst.l   %d0
        rts
| ml_over: d0 = FM SYNTH tracks, d1 = SY DRUM tracks of a Part -> d0 = 0 when the Part may
| hold them, else the message: more FM SYNTH tracks than ML_FM_MAX ("FM SYNTH: 2 MAX"), more
| SY DRUM tracks than ML_SY_MAX ("SY DRUM: 2 MAX"), or a cost above LOAD_BUDGET with every
| FM SYNTH track mono ("FM+SY DRUM: LIMIT", the existing string); tst.l done. The one rule
| of the lists (ml_guard_p) and the Part paste (ml_part_over). Preserves every other register.
ml_over:
        lea     -12(%sp),%sp
        movem.l %d2-%d3/%a0,(%sp)
        move.l  %d0,%d3                  | nFM
        lea     ml_limits(%pc),%a0
        mvz.b   LIM_FM(%a0),%d0
        cmp.l   %d0,%d3
        bhi     ml_ov_fm                 | (unsigned) more FM SYNTH tracks than the hard cap
        mvz.b   LIM_SY(%a0),%d0
        cmp.l   %d0,%d1
        bhi     ml_ov_sy                 | more SY DRUM tracks than the hard cap
        move.l  %d3,%d0
        moveq   #1,%d2
        bsr     ml_cost                  | the Part's cost with every FM SYNTH track mono
        cmpi.l  #LOAD_BUDGET,%d0
        bhi     ml_ov_both               | over the budget even so
        moveq   #0,%d0
        bra     ml_ov_out
ml_ov_fm:
        lea     ml_msg_fm(%pc),%a0
        bra     ml_ov_msg
ml_ov_sy:
        lea     ml_msg_sy(%pc),%a0
        bra     ml_ov_msg
ml_ov_both:
        lea     ml_msg_both(%pc),%a0
ml_ov_msg:
        move.l  %a0,%d0
ml_ov_out:
        movem.l (%sp),%d2-%d3/%a0
        lea     12(%sp),%sp
        tst.l   %d0
        rts
| ml_count: a0 = a Part, d2 = a track left out (-1: none) -> d0 = its FM SYNTH tracks, d1 =
| its SY DRUM tracks, by the signatures (ml_sigkind). The one count the lists, the paste
| guards and the voice cap share. Preserves every other register.
ml_count:
        lea     -12(%sp),%sp
        movem.l %d3-%d5,(%sp)
        moveq   #0,%d3                   | FM SYNTH tracks
        moveq   #0,%d4                   | SY DRUM tracks
        moveq   #0,%d5                   | the track
ml_cn_track:
        cmp.l   %d2,%d5
        beq     ml_cn_next               | the track left out
        move.l  %d5,%d0
        bsr     ml_sigkind
        cmpi.l  #1,%d0
        bne     ml_cn_sy
        addq.l  #1,%d3
ml_cn_sy:
        cmpi.l  #2,%d0
        bne     ml_cn_next
        addq.l  #1,%d4
ml_cn_next:
        addq.l  #1,%d5
        cmpi.l  #8,%d5
        bne     ml_cn_track
        move.l  %d3,%d0
        move.l  %d4,%d1
        movem.l (%sp),%d3-%d5
        lea     12(%sp),%sp
        rts
| ml_cost: d0 = FM SYNTH tracks, d1 = SY DRUM tracks, d2 = v (1..4) -> d0 = the Part's cost
| in points with every FM SYNTH track at v voices (machine_limits.inc: LOAD_S_ANY once when
| the Part holds any of the two, LOAD_S_FM once when it holds FM SYNTH, LOAD_FM_Vv per FM
| SYNTH track, LOAD_SY_TRACK per SY DRUM track; a v outside 1..4 prices as 1). Preserves
| every other register.
ml_cost:
        lea     -12(%sp),%sp
        movem.l %d3-%d4/%a0,(%sp)
        move.l  %d0,%d3                  | nFM
        moveq   #0,%d0
        tst.l   %d3
        bne     ml_co_any
        tst.l   %d1
        beq     ml_co_out                | neither machine: nothing
ml_co_any:
        move.l  #LOAD_S_ANY,%d0
        move.l  #LOAD_SY_TRACK,%d4
        muls.l  %d1,%d4                  | nSY * LOAD_SY_TRACK
        add.l   %d4,%d0
        tst.l   %d3
        beq     ml_co_out                | no FM SYNTH track
        addi.l  #LOAD_S_FM,%d0
        move.l  %d2,%d4
        subq.l  #1,%d4
        cmpi.l  #3,%d4
        bls     ml_co_v
        moveq   #0,%d4                   | v outside 1..4: as 1
ml_co_v:
        lea     ml_load_v(%pc),%a0       | LOAD_FM_V1..V4, a word each
        mvz.w   (%a0,%d4.l*2),%d4
        muls.l  %d3,%d4                  | nFM * LOAD_FM_Vv
        add.l   %d4,%d0
ml_co_out:
        movem.l (%sp),%d3-%d4/%a0
        lea     12(%sp),%sp
        rts
| ml_cap_of: d0 = FM SYNTH tracks, d1 = SY DRUM tracks -> d0 = the FM voice cap for them: the
| largest v in 4, 3, 2, 1 whose cost is <= LOAD_BUDGET; 1 when none is (the Part plays as
| saved, every FM SYNTH track mono). Preserves every other register.
ml_cap_of:
        lea     -8(%sp),%sp
        movem.l %d2-%d3,(%sp)
        move.l  %d0,%d3                  | nFM
        moveq   #4,%d2
ml_cv_try:
        move.l  %d3,%d0
        bsr     ml_cost
        cmpi.l  #LOAD_BUDGET,%d0
        bls     ml_cv_out                | fits at v
        subq.l  #1,%d2
        cmpi.l  #1,%d2
        bhi     ml_cv_try                | 3, 2 ... ; 1 is the floor whatever its cost
ml_cv_out:
        move.l  %d2,%d0
        movem.l (%sp),%d2-%d3
        lea     8(%sp),%sp
        rts

| ---- the voice cap and its cache (2.16) ----
| ml_cap: -> d0 = the FM voice cap of the current Part, 1..4 (ml_cap_of over its counts).
| Read by the engine INSIDE THE FRAME INTERRUPT at every voice START of an FM SYNTH track
| (poly.s po_voiccap: sy_render's START, po_xfq, po_start, po_ho), so it answers from a cache
| of this unit's own, ml_budget: the 32 bytes the count depends on -- the Part's eight machine
| bytes (MACH_OFF, two longs) and the eight signature places ml_sigkind reads (SIG_OFF + 30 t,
| a long each: the three signature bytes and the byte after them) -- are compared with the
| Part's now, and when every one is equal the cached cap is the answer (about 50
| instructions); else the Part is COUNTED (ml_part, ml_count, ml_cap_of), the 32 bytes as
| read before the count and the cap are stored. No event has to be hooked for the recount:
| whatever writes a Part's machines -- the lists' commits, the paste / undo stores, the slot
| assigner, the FLEX preview, a project or Part load, PART RELOAD, a bank change, the
| battery-backed bank at power-on -- is seen by the bytes themselves at the next START, and a
| Part change to a Part with the same machines rightly counts nothing (the count is a pure
| function of those bytes: ml_sigkind reads the machine byte and the signature only). A
| hooked recount was the first design; PART RELOAD and a bank change write the Part through
| no site the synth detours (measured on the emulator: only the stock VOICE KILL, po_kill, is
| reached), so the bytes are compared instead. The cache is read and written only inside the
| frame interrupt, which does not interrupt itself, so no reader sees a torn cache; every
| caller outside it (the UI task's keys and the MIDI task: po_polytrack, po_legmode,
| po_keyrec) takes ml_cap_now, which counts and never touches the cache. A START that lands
| between the two writes of one store (the signature and the machine byte, a few hundred
| instructions of the UI task apart) counts that half-written Part for that START alone; the
| next START counts the finished one. Unknown at power-on (the image's cap 0: the first START
| counts). Preserves every other register (tst.l not done).
        .set    BG_CAP, 0                | ml_budget: a word, the cap 1..4 (0: unknown, the image's)
        .set    BG_NFM, 2                | the last count's FM SYNTH tracks ... (words, for a peek)
        .set    BG_NSY, 4                | ... and SY DRUM tracks (+6 a pad)
        .set    BG_MACH, 8               | the eight machine bytes the count read (two longs)
        .set    BG_SIG, 16               | the eight signature longs it read (SIG_OFF + 30 t)
ml_cap:
        lea     -20(%sp),%sp
        movem.l %d1-%d2/%a0-%a2,(%sp)
        bsr     ml_part                  | a0 = the current Part
        lea     ml_budget(%pc),%a1
        tst.w   BG_CAP(%a1)
        beq     ml_cap_count             | unknown
        movea.l %a0,%a2
        adda.l  #MACH_OFF,%a2
        move.l  (%a2),%d0
        cmp.l   BG_MACH(%a1),%d0
        bne     ml_cap_count             | a machine byte is not the one counted
        move.l  4(%a2),%d0
        cmp.l   BG_MACH+4(%a1),%d0
        bne     ml_cap_count
        movea.l %a0,%a2
        adda.l  #SIG_OFF,%a2
        lea     BG_SIG(%a1),%a1
        moveq   #8,%d1
ml_cap_cmp:
        move.l  (%a2),%d0
        cmp.l   (%a1)+,%d0
        bne     ml_cap_count             | a signature is not the one counted
        lea     30(%a2),%a2
        subq.l  #1,%d1
        bne     ml_cap_cmp
        lea     ml_budget(%pc),%a1
        mvz.w   BG_CAP(%a1),%d0          | the same 32 bytes: the same cap
        bra     ml_cap_out
ml_cap_count:
        movea.l %a0,%a2
        adda.l  #MACH_OFF,%a2
        lea     ml_budget(%pc),%a1
        move.l  (%a2),BG_MACH(%a1)       | the bytes as they are before the count ...
        move.l  4(%a2),BG_MACH+4(%a1)
        movea.l %a0,%a2
        adda.l  #SIG_OFF,%a2
        lea     BG_SIG(%a1),%a1
        moveq   #8,%d1
ml_cap_snap:
        move.l  (%a2),(%a1)+
        lea     30(%a2),%a2
        subq.l  #1,%d1
        bne     ml_cap_snap
        moveq   #-1,%d2
        bsr     ml_count                 | ... d0 = its FM SYNTH tracks, d1 = its SY DRUM tracks
        lea     ml_budget(%pc),%a1
        move.w  %d0,BG_NFM(%a1)
        move.w  %d1,BG_NSY(%a1)
        bsr     ml_cap_of                | d0 = the cap
        move.w  %d0,BG_CAP(%a1)
ml_cap_out:
        movem.l (%sp),%d1-%d2/%a0-%a2
        lea     20(%sp),%sp
        rts
| ml_cap_now: -> d0 = the FM voice cap of the current Part, counted now (ml_part, ml_count,
| ml_cap_of), the cache neither read nor written: the callers outside the frame interrupt.
| Preserves every other register.
ml_cap_now:
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        bsr     ml_part
        moveq   #-1,%d2
        bsr     ml_count
        bsr     ml_cap_of
        movem.l (%sp),%d1-%d2/%a0
        lea     12(%sp),%sp
        rts
| ml_sigkind: a0 = a Part, d0 = a track -> d0 = the machine its signature names: the row's
| engine kind (1 FM SYNTH, 2 SY DRUM) for FLEX with a row's signature, else 0; tst.l done.
| Preserves every other register.
ml_sigkind:
        lea     -8(%sp),%sp
        movem.l %d1/%a0,(%sp)
        move.l  %d0,%d1
        adda.l  #MACH_OFF,%a0
        mvz.b   (%a0,%d1.l),%d0          | the track's machine byte
        suba.l  #MACH_OFF,%a0
        cmpi.l  #FLEX,%d0
        bne     ml_sk_none
        mulu.w  #30,%d1
        adda.l  %d1,%a0
        adda.l  #SIG_OFF,%a0             | its signature place
        bsr     ml_sigrow
        bmi     ml_sk_none
        lea     ml_rows(%pc),%a0
        movea.l (%a0,%d0.l*4),%a0
        mvz.b   RD_KIND(%a0),%d0
        bra     ml_sk_out
ml_sk_none:
        moveq   #0,%d0
ml_sk_out:
        movem.l (%sp),%d1/%a0
        lea     8(%sp),%sp
        tst.l   %d0
        rts
| ml_toast: d0 = a message -> the firmware's popup shows it for TOAST_TIME (the stock
| routine; d0/d1/a0/a1 clobbered, as by any stock call).
ml_toast:
        pea     (TOAST_TIME).w
        move.l  %d0,-(%sp)
        jsr     TOAST
        addq.l  #8,%sp
        rts

| ---- the paste guards (2.15). Stock's copy / paste and its undo write a track's machine
| byte without either list: the SRC page (FUNC + REC / FUNC + STOP on the SRC page: the
| machine, its slot and its PLAYBACK column), the whole track (FUNC + REC / FUNC + STOP in
| SRC SETUP: the machine, the 30 PLAYBACK bytes with the signature, every page and the
| pattern track) and the Part (the PART window: all of it). Each store is guarded where
| it starts, for a paste and for an undo alike (an undo restores what a paste or a clear
| replaced). A store that would give the Part a row's machine past the limits is refused
| as a choice in the lists is: nothing is written (the pattern track and SY DRUM's lock
| rows included), the clipboard is kept, stock's own "nothing stored" exit is taken, and
| the popup shows the same message. A Part paste is refused whole when the Part pasted
| holds more than the limits (a Part saved by an older build); a Part within them pastes
| as in 2.14. A track that leaves FLEX keeps no signature, and FLEX given to a track that
| was not FLEX does not revive one (ml_became, fm_preview): only a guarded write makes a
| row's machine.
        .set    CLIP_BUF, 0x460c8122     | stock's clipboard: what COPY took (a page, a track, a Part ...)
        .set    UNDO_BUF, 0x460bf218     | stock's undo buffer: what a paste replaced (the same layouts)
        .set    PAGE_STORE_RET, 0x40027ea2 | the SRC page's store (0x40027e4c, page 0), after the three loads
        .set    PAGE_STORE_NONE, 0x40028f2e | ... its "nothing stored" exit (d0 := 0)
        .set    FULL_STORE, 0x4002b654   | the whole track's store (clip, pattern, track)
        .set    TRACK_PASTE_RET, 0x4002b9a8 | its paste, after the store
        .set    TRACK_UNDO_RET, 0x4002b96c | its undo, after the store
        .set    TRACK_UNDO_NONE, 0x4002b980 | ... the undo's "nothing restored" exit (d0 := 0)
        .set    PART_STORE, 0x40029a4c   | the Part's store (clip, part)
        .set    PART_PASTE_RET, 0x40029b94 | its paste, after the store
        .set    PART_UNDO_RET, 0x40029b5e | its undo, after the store
        .set    PART_UNDO_NONE, 0x40029b70 | ... the undo's "nothing restored" exit (d0 := 0)
        .set    TS_MACH, 2334            | the whole track's clip: the machine byte ...
        .set    TS_SIG, 2335 + 18        | ... its 30 PLAYBACK bytes at 2335: the signature's place
        .set    PATTERN_SIZE, 36568      | a pattern in the bank blob ...
        .set    PAT_PART, 36438 + 1      | ... and its Part (a signed byte)
        .set    PREVIEW_SAVE, 0x46105424 | the FLEX preview's saved machine
        .set    PREVIEW_RET, 0x40096d2e
| 0x40027e98 (jmp, 10 B): the SRC page's store (d4 = the Part, d5 = the track, a2 = the
| clipboard for a paste, 0x40028fd4, or the undo buffer for an undo, 0x40028f94): displaced: the record's bytes at a2 + 19 into d3 (sign-extended into d6) and at a2 + 18 into d7 (the machine and
| its slot). FLEX pasted over a track whose signature place holds a row's signature makes
| that machine (the signature is not written by this store): guarded.
fm_page_store:
        move.b  19(%a2),%d3              | displaced: the machine pasted
        mvs.b   %d3,%d6                  | displaced
        move.b  18(%a2),%d7              | displaced: its slot
        cmpi.l  #FLEX,%d6
        bne     fm_ps_go                 | another machine: no row's
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0-%a1,(%sp)
        move.l  %d4,%d0
        bsr     ml_partn                 | a0 = the Part pasted into
        move.l  %d5,%d2                  | the track
        bsr     ml_rowat                 | d1 = the row its signature names
        bmi     fm_ps_ok
        bsr     ml_guard_p
        bne     fm_ps_refuse
fm_ps_ok:
        movem.l (%sp),%d1-%d2/%a0-%a1
        lea     16(%sp),%sp
fm_ps_go:
        jmp     PAGE_STORE_RET
fm_ps_refuse:
        movem.l (%sp),%d1-%d2/%a0-%a1
        lea     16(%sp),%sp
        bsr     ml_toast
        jmp     PAGE_STORE_NONE
| 0x4002b962 / 0x4002b99e (jmp, 10 B each): the whole track's undo (0x4002b8xx, which saved
| d2 / d3) and its paste (0x4002b988) call the store: displaced: UNDO_BUF / CLIP_BUF pushed
| and the pc-relative call of FULL_STORE (replayed by its address); the store's other two arguments are on
| the stack (0(sp) the pattern, 4(sp) the track). A refusal leaves through the function's
| own "nothing" answer (d0 = 0).
fm_track_undo:
        lea     UNDO_BUF,%a1
        bsr     ml_trackchk
        bne     fm_tu_refuse
        pea     (UNDO_BUF).l             | displaced
        jsr     FULL_STORE               | displaced
        jmp     TRACK_UNDO_RET
fm_tu_refuse:
        bsr     ml_toast
        addq.l  #8,%sp                   | the store's two arguments
        jmp     TRACK_UNDO_NONE
fm_track_paste:
        lea     CLIP_BUF,%a1
        bsr     ml_trackchk
        bne     fm_tp_refuse
        pea     (CLIP_BUF).l             | displaced
        jsr     FULL_STORE               | displaced
        jmp     TRACK_PASTE_RET
fm_tp_refuse:
        bsr     ml_toast
        addq.l  #8,%sp                   | the store's two arguments
        moveq   #0,%d0                   | nothing pasted (the paste's own answer when the clipboard holds no track)
        rts
| ml_trackchk: a1 = a whole track's clip, 4(sp) = the pattern, 8(sp) = the track (the
| caller's store arguments) -> d0 = 0 when storing it is allowed, else the message; tst.l
| done. Clobbers d0 only.
ml_trackchk:
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0/%a2,(%sp)
        moveq   #0,%d0
        mvz.b   TS_MACH(%a1),%d1
        cmpi.l  #FLEX,%d1
        bne     ml_tc_out                | another machine: no row's
        lea     TS_SIG(%a1),%a0
        bsr     ml_sigrow
        bmi     ml_tc_ok                 | FLEX with no signature: a sample track
        addq.l  #FM_ROW,%d0
        movea.l %d0,%a2                  | the row pasted
        move.l  20(%sp),%d0              | the pattern
        move.l  #PATTERN_SIZE,%d1
        muls.l  %d1,%d0
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        adda.l  #PAT_PART,%a0
        mvs.b   (%a0),%d0                | its Part: the one stock's store writes
        move.l  #6322,%d1
        muls.l  %d1,%d0
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        move.l  %a2,%d1
        move.l  24(%sp),%d2              | the track
        bsr     ml_guard_p
        bra     ml_tc_out
ml_tc_ok:
        moveq   #0,%d0
ml_tc_out:
        movem.l (%sp),%d1-%d2/%a0/%a2
        lea     16(%sp),%sp
        tst.l   %d0
        rts
| 0x40029b54 / 0x40029b8a (jmp, 10 B each): the Part's undo and its paste call the store:
| displaced: UNDO_BUF / CLIP_BUF pushed and the pc-relative call of PART_STORE (replayed by its address); the
| Part's index is on the stack. The buffer holds a whole Part from its +0.
fm_part_undo:
        lea     UNDO_BUF-PART_OFF,%a0
        bsr     ml_part_over
        bne     fm_pu_refuse
        pea     (UNDO_BUF).l             | displaced
        jsr     PART_STORE               | displaced
        jmp     PART_UNDO_RET
fm_pu_refuse:
        bsr     ml_toast
        addq.l  #4,%sp                   | the store's other argument
        jmp     PART_UNDO_NONE
fm_part_paste:
        lea     CLIP_BUF-PART_OFF,%a0
        bsr     ml_part_over
        bne     fm_pp_refuse
        pea     (CLIP_BUF).l             | displaced
        jsr     PART_STORE               | displaced
        jmp     PART_PASTE_RET
fm_pp_refuse:
        bsr     ml_toast
        addq.l  #4,%sp                   | the store's other argument
        moveq   #0,%d0                   | nothing pasted (the paste's own answer)
        rts
| ml_part_over: a0 = a Part -> d0 = 0 when its eight tracks are within the hard caps and
| the budget at mono (ml_count over all eight, ml_over), else the message (as ml_guard's);
| tst.l done. Preserves every other register.
ml_part_over:
        lea     -8(%sp),%sp
        movem.l %d1-%d2,(%sp)
        moveq   #-1,%d2                  | every track
        bsr     ml_count                 | d0 = FM SYNTH tracks, d1 = SY DRUM tracks
        bsr     ml_over                  | d0 = 0, or the message
        movem.l (%sp),%d1-%d2
        lea     8(%sp),%sp
        tst.l   %d0
        rts
| 0x40096d22 (jmp, 12 B): the sample preview of the FLEX list (0x40096c54: d4 = the track
| of the current Part, a0 = its machine byte) makes the track FLEX while it plays and puts
| the machine back after: displaced: the signed byte at a0 into d3, d3 stored to PREVIEW_SAVE and 1 written to the byte at a0.
| A track that is not FLEX loses the signature it kept, so the preview plays the sample.
fm_preview:
        mvs.b   (%a0),%d3                | displaced: the machine before the preview
        move.l  %d3,PREVIEW_SAVE         | displaced
        cmpi.l  #FLEX,%d3
        beq     fm_pv_flex               | FLEX already: the track plays what it played
        move.l  %d2,-(%sp)
        move.l  %d4,%d2
        bsr     ml_unsign_t
        move.l  (%sp)+,%d2
fm_pv_flex:
        move.b  #FLEX,(%a0)              | displaced
        jmp     PREVIEW_RET
| ml_unsign_t: d2 = a track of the current Part -> a row's signature in its signature
| place cleared, in the Part and its shadow. Preserves every register.
ml_unsign_t:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        bsr     ml_part
        move.l  %a0,%d1
        sub.l   PART_PTR,%d1             | part * 6322
        move.l  %d2,%d0
        mulu.w  #30,%d0
        addi.l  #SIG_OFF,%d0
        add.l   %d0,%d1
        adda.l  %d0,%a0                  | the Part's signature place
        bsr     fm_unsign
        lea     PART_SHADOW,%a0
        adda.l  %d1,%a0                  | ... its shadow
        bsr     fm_unsign
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts
| ml_partn: d0 = a Part's index -> a0 = the Part (the bank blob + index * 6322). Clobbers d0.
ml_partn:
        move.l  %d1,-(%sp)
        move.l  #6322,%d1
        muls.l  %d1,%d0
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        move.l  (%sp)+,%d1
        rts
| ml_rowat: a0 = a Part, d2 = a track -> d1 = the row (FM_ROW + its index in ml_rows) whose
| signature the track's signature place holds, whatever its machine byte, else -1; tst.l
| done. Clobbers d0.
ml_rowat:
        move.l  %a0,-(%sp)
        move.l  %d2,%d1
        mulu.w  #30,%d1
        adda.l  %d1,%a0
        adda.l  #SIG_OFF,%a0
        bsr     ml_sigrow
        movea.l (%sp)+,%a0
        bmi     ml_ra_none
        addq.l  #FM_ROW,%d0
ml_ra_none:
        move.l  %d0,%d1
        rts

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
| names; any other row replays the displaced push of d2 and the stack's long at +8 into d1.
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
| a0 = its machine byte; displaced: the address 0x400a78c8 into a0, then d1 := the name (the
| instruction after, the long at a0 + 4 * d0 into d1, is done here: rejoins after it).
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

| ---- 0x4003c980 (jmp, 6 B): SRC SETUP's row highlight: displaced: the signed byte at a0 into
| d0 and the release of 24 stack bytes (a0 = the track's machine byte); a signed track's row is its row.
fm_setup_row:
        mvs.b   (%a0),%d0
        lea     24(%sp),%sp
        bsr     fm_type
        jmp     SETUP_ROW_RET

| ---- 0x400786c8 (jmp, 6 B): the machine window's row highlight: displaced: the signed
| byte at a0 into d0, its compare with d2 and a short branch to 0x400786fc when they differ (d2 = the visible row drawn; 2.11: the
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

| ---- 0x400585dc (jmp, 10 B): SRC SETUP opens on the track's row: displaced: the byte at
| a0 into d3, sign-extended into d4, and the push of 0x400bb704; d4 indexes the PLAYBACK descriptor table
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
| the signed byte at a0 into d0, d0 pushed and the push of 0x460e7386.
fm_chooser_open:
        mvs.b   (%a0),%d0
        bsr     fm_type
        move.l  %d0,-(%sp)
        pea     (0x460e7386).l           | displaced
        jmp     CHOOSER_OPEN_RET

| ---- 0x400788c4 (jmp, 8 B): the machine window's opening column (2.18): displaced: the
| unsigned byte at a0 into d0, 1 into d2, their compare and d0 set when the byte is above 1 (a0 = the track's machine byte); stock goes
| on to store column 1 (the sample-slot list) for STATIC / FLEX and column 0 (the machine
| list) for every other machine. A signed track (FM SYNTH, SY DRUM) is FLEX by its byte, so
| the track key pressed twice opened the slot list (empty for these machines); its row
| (fm_type: 5..) takes it to the machine list, as THRU, NEIGHBOR and PICKUP go.
fm_chooser_col:
        mvz.b   (%a0),%d0                | displaced
        bsr     fm_type                  | FLEX + signed -> its row (5..); d1/d2/a0/a1 kept
        moveq   #1,%d2                   | displaced
        cmp.l   %d0,%d2                  | displaced
        scs     %d0                      | displaced
        jmp     CHOOSER_COL_RET

| ---- 0x4003a52e / 0x4003cd98 (jmp, 8 B each): SRC SETUP's editor and drawer address the
| row's Part bytes at row * 6: displaced: the row copied into d0 and shifted left by 3,
| the row doubled and subtracted from it (d2 / d6, the row; d0 / d7 := row * 6). Rows 5.. address FLEX's.
fm_setup_edit6:
        jsr     po_setup_edit:l
        cmpi.l  #2,%d0
        beq     fm_e6_one
        tst.l   %d0
        bne     fm_e6_handled
        cmpi.l  #FM_ROW,%d2
        blt     fm_e6
        moveq   #FLEX,%d2
fm_e6:
        move.l  %d2,%d0
        lsl.l   #3,%d0
        add.l   %d2,%d2
        sub.l   %d2,%d0
        jmp     EDIT6_RET
| Ordinary FM A/B default. The stock SETUP editor bypasses descriptor knob handlers.
| CHRD (128 values): one raw unit a value. VOIC (4 values): the stock stepper, as the
| stock few-valued boxes step (2.18). The stock clamp/store/redraw remains.
fm_e6_one:
        moveq   #FLEX*6,%d0
        lea     (%a3,%d0.l),%a4
        move.l  %d4,%d2
        jsr     po_setup_default:l      | one storage reader for the Part's FM defaults
        cmpa.l  #0,%a3
        beq     fm_e6_voice
        move.l  %d1,%d0
fm_e6_voice:
        move.l  %d0,%d2
        move.l  %d3,-(%sp)
        move.l  %a3,-(%sp)
        cmpa.l  #0,%a3
        bne     fm_e6_chord
        jsr     0x4003249c               | VOIC: the stock stepper (knob A's accumulator) -> steps
        jmp     0x4003a56c
fm_e6_chord:
        move.l  %a3,%d0
        mulu.w  #24,%d0
        lea     0x46c7de2e,%a0
        tst.l   (%a0,%d0.l)
        beq     fm_e6_plain
        move.l  %d3,%d0
        moveq   #7,%d1
        divs.l  %d1,%d0
        bra     fm_e6_delta
fm_e6_plain:
        move.l  %d3,%d0
fm_e6_delta:
        jmp     0x4003a56c
fm_e6_handled:
        jmp     0x4003a624
fm_setup_draw6:
        cmpi.l  #FM_ROW,%d6
        blt     fm_d6
        bne     fm_d6_flex
        bsr     fm_d6_frame              | the FM SYNTH page: only VOIC and CHRD keep a frame
fm_d6_flex:
        moveq   #FLEX,%d6
fm_d6:
        move.l  %d6,%d7
        lsl.l   #3,%d7
        add.l   %d6,%d6
        sub.l   %d6,%d7
        jmp     DRAW6_RET
| The stock drawer has just drawn the right panel's dotted dividers (window x 72 and 92
| from y 2 to 54, y 28 from x 52; y grows upward). The FM page has no boxes in slots
| 8-11 (LEN RATE TSTR TSNS, setup.inc.s), so the segments that only frame them are
| cleared with the stock rectangle fill (window, x0, y0, x1, y1, 0 = clear): the
| bottom row's two dividers and the line under the right column. The divider between
| VOIC and CHRD and the line under them stay. d4 = the window; C scratch only.
fm_d6_frame:
        lea     fm_d6_rects(%pc),%a0
fm_d6_rect:
        mvs.w   (%a0)+,%d0               | x0; negative ends the list
        bmi     fm_d6_done
        move.l  %a0,-(%sp)
        clr.l   -(%sp)                   | clear
        mvs.w   4(%a0),%d1
        move.l  %d1,-(%sp)               | y1
        mvs.w   2(%a0),%d1
        move.l  %d1,-(%sp)               | x1
        mvs.w   (%a0),%d1
        move.l  %d1,-(%sp)               | y0
        move.l  %d0,-(%sp)               | x0
        move.l  %d4,-(%sp)               | the window
        jsr     FILL_RECT
        lea     24(%sp),%sp
        movea.l (%sp)+,%a0
        addq.l  #6,%a0
        bra     fm_d6_rect
fm_d6_done:
        rts
fm_d6_rects:                             | x0, y0, x1, y1
        .short  72, 2, 72, 27            | RATE | TSTR
        .short  92, 2, 92, 27            | TSTR | TSNS
        .short  93, 28, 111, 28          | under LEN
        .short  -1
        .balign 2

| ---- 0x4005221e (jmp, 10 B): the UI tick: displaced: the calls of 0x4005213c and 0x4007e940,
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
| 0x40079248 (jmp, 8 B): the machine window's list init, the pushes of 5 and 6 (rows, visible).
ml_win_count:
        pea     (5+ML_COUNT).w           | the rows
        pea     6.w                      | the rows visible (stock's)
        jmp     WIN_COUNT_RET
| 0x400585fa (jmp, 8 B): SRC SETUP's list init, the pushes of 5 and 5 (rows, visible).
ml_src_count:
        pea     (5+ML_COUNT).w
        pea     5.w
        jmp     SRC_COUNT_RET
| 0x4003c950 (jmp, 6 B): SRC SETUP's name lookup, the row d2 compared with 4 and a
| short branch on carry to 0x4003c95a (d2 = the row: past the last row, the default string).
ml_name_bound:
        moveq   #ML_LAST,%d1
        cmp.l   %d2,%d1
        bcs     ml_nb_out
        jmp     NAME_BOUND_IN
ml_nb_out:
        jmp     NAME_BOUND_OUT
| 0x40078678 (jmp, 12 B): the machine window's row drawer, the row d2 compared with 4,
| a short branch to 0x400786a2 past it, d2 pushed and the call through d3 (d2 = the visible row, d3 =
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
| 0x400786ce (jmp, 6 B): the machine window's highlight, the row d2 compared with 4 and
| a short branch to 0x400786fc past it.
ml_hi_bound:
        moveq   #ML_LAST,%d0
        cmp.l   %d2,%d0
        blt     ml_hb_out
        jmp     HI_BOUND_IN
ml_hb_out:
        jmp     CHOOSER_MISS
| The machine window's row clamp after a list move (five sites, 8 B each: the row d0 compared
| with 5 and set to 5 when above it -- the absolute row 0x460e738e kept to 0..5, the
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
| 0x40079904 (jmp, 8 B): the machine window's cursor, the row d4 compared with 4 and
| a branch to 0x400797cc when it is not above it (d4 = the cursor's row).
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
        lea     -140(%sp),%sp            | 96 B: 8 tracks x 12 saved FLEX bytes; 24 B: 8 tracks x 3 saved
        movem.l %d2-%d4/%a2-%a3,120(%sp) | LFO PMTR bytes; 20 B: d2-d4/a2-a3
        movea.l 144(%sp),%a2
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
        bsr     fm_vd_lptrs              | a0 = its three LFO PMTR bytes, a1 = their save area
        moveq   #3,%d4
fm_vd_s2:                                | VOIC / CHRD (30 / 31) sit the stock clamp out too: the
        mvz.b   (%a0),%d0                | power-up battery-RAM check (0x40025770) rejects the whole
        move.b  %d0,(%a1)+               | restored state on any correction, and the project load
        subi.l  #LFD_MODULE_FIRST,%d0    | would clamp them to 29; PTCH (0) stands in meanwhile
        cmpi.l  #LFD_MODULE_LAST-LFD_MODULE_FIRST,%d0
        bhi     fm_vd_s2n                | a stock destination keeps the stock clamp
        clr.b   (%a0)
fm_vd_s2n:
        addq.l  #1,%a0
        subq.l  #1,%d4
        bne     fm_vd_s2
fm_vd_snext:
        addq.l  #1,%d2
        moveq   #8,%d0
        cmp.l   %d0,%d2
        bne     fm_vd_save
        move.l  144(%sp),-(%sp)
        bsr     fm_stock_validate
        addq.l  #4,%sp
        moveq   #0,%d2
fm_vd_rest:
        btst    %d2,%d3
        beq     fm_vd_rnext
        move.l  %d0,-(%sp)               | the validator's correction count, kept over both loops
        bsr     fm_vd_ptrs4              | (the stack is 4 deeper here)
        moveq   #6,%d4
fm_vd_r1:
        move.b  (%a1),(%a0)
        move.b  6(%a1),SETUP_GAP(%a0)
        addq.l  #1,%a0
        addq.l  #1,%a1
        subq.l  #1,%d4
        bne     fm_vd_r1
        bsr     fm_vd_lptrs4
        moveq   #3,%d4
fm_vd_r2:
        mvz.b   (%a1)+,%d1
        move.l  %d1,%d0
        subi.l  #LFD_MODULE_FIRST,%d0
        cmpi.l  #LFD_MODULE_LAST-LFD_MODULE_FIRST,%d0
        bhi     fm_vd_r2n                | a stock destination stays as the stock clamp left it
        move.b  %d1,(%a0)                | VOIC / CHRD back
fm_vd_r2n:
        addq.l  #1,%a0
        subq.l  #1,%d4
        bne     fm_vd_r2
        move.l  (%sp)+,%d0
fm_vd_rnext:
        addq.l  #1,%d2
        moveq   #8,%d4
        cmp.l   %d4,%d2
        bne     fm_vd_rest
        movem.l 120(%sp),%d2-%d4/%a2-%a3
        lea     140(%sp),%sp
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
| fm_vd_lptrs: d2 = the track -> a0 = blob-relative Part a2 + LFO_PMTR + 30 * track (its three
| LFO PMTR bytes), a1 = the caller's PMTR save area (after the 96 FLEX bytes) + 3 * track
| (d0 clobbered).
fm_vd_lptrs:
        lea     4+96(%sp),%a1
        bra     fm_vd_lp
fm_vd_lptrs4:
        lea     8+96(%sp),%a1
fm_vd_lp:
        move.l  %d2,%d0
        add.l   %d0,%d0
        add.l   %d2,%d0
        adda.l  %d0,%a1
        move.l  %d2,%d0
        mulu.w  #30,%d0
        movea.l %a2,%a0
        adda.l  %d0,%a0
        adda.l  #LFO_PMTR,%a0
        rts
fm_stock_validate:
        lea     -96(%sp),%sp             | displaced
        movem.l %d2-%d7/%a2-%fp,(%sp)    | displaced
        jmp     VALIDATE_BODY

| the guard's hard caps (machine_limits.inc), as bytes ml_over reads: FM SYNTH, SY DRUM (the
| third byte, 2.15's SY DRUM beside FM SYNTH, is 0 and not read: the budget replaced it); the
| load table ml_cost reads (LOAD_FM_V1..V4, a word each); the voice cap's cache (ml_cap); and
| the three messages, the numbers printed from the same caps. The popup shows a short line
| only: 17 characters were measured on screen, 21 were not drawn at all (the stock routine
| draws nothing for a line wider than its box); 19 is the most.
ml_limits:
        .byte   ML_FM_MAX, ML_SY_MAX, 0, 0
ml_load_v:
        .word   LOAD_FM_V1, LOAD_FM_V2, LOAD_FM_V3, LOAD_FM_V4
ml_budget:
        .word   0, 0, 0, 0               | BG_CAP (0: unknown at power-on, the first START counts), BG_NFM, BG_NSY, a pad
        .long   0, 0                     | BG_MACH: the eight machine bytes the count read
        .long   0, 0, 0, 0, 0, 0, 0, 0   | BG_SIG: the eight signature longs it read
ml_msg_fm:
        .ascii  "FM SYNTH: "
        .byte   '0' + ML_FM_MAX
        .asciz  " MAX"
ml_msg_sy:
        .ascii  "SY DRUM: "
        .byte   '0' + ML_SY_MAX
        .asciz  " MAX"
ml_msg_mono:
        .asciz  "FM SYNTH -> MONO"
        .balign 2
ml_msg_both:
        .asciz  "FM+SY DRUM: LIMIT"
        .balign 2
fm_defaults:
        .byte   64, 12, 32, 64, 0, 40    | PLAYBACK: PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40 (Modwerk's)
        .byte   1, 0, 0, 0, 0, 0         | SETUP: VOIC 1, CHRD none; other four stock defaults
fm_name:
        .asciz  "FM SYNTH"
        .balign 4
| FM SYNTH's row descriptor (the layout above ml_rows)
fm_row:
        .byte   'F', 'M', 1, 1           | the signature "FM", 1; engine kind 1
        .long   fm_name
        .long   fm_defaults
        .long   fm_descriptor            | page.s's exported DRAM entry (built on first use)
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
