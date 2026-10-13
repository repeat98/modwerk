| SY DRUM -- a drum machine modelled on a classic analog two-voice drum synthesizer (the
| SY-1 circuit; README.md), on SYNTH MACHINE's engine: its row in the machine list, its
| voice, its pages. GNU as, -mcpu=5475; a DRAM unit linked beside SYNTH MACHINE's poly.s
| and machine.s (sy-drum/manifest.py, Linked "sydrum"; it requires SYNTH MACHINE).
|
| WHAT IT IS. A FLEX track whose machine-list row SY DRUM is chosen (machine.s: FLEX with
| "SY", 1 in the Part's NEIGHBOR PLAYBACK bytes, the FM SYNTH mechanism) plays the SY DRUM
| voice: PTCH (semitones, -64..+63), MODE A..F, WDTH, SWEP (semitones, -64..+63), SPED,
| DEC on the PLAYBACK page -- the FLEX PLAYBACK bytes, so stock p-locks, LFOs and scenes
| reach them -- and the dedicated LFO / S&H on the PLAYBACK SETUP page: LSPD (0.40 ..
| 200 Hz), LDEP, WAVE (OFF TRI SQR RND), S&H (OFF ON) -- the FLEX SETUP bytes, the Part's
| defaults, each lockable per step (the dedicated step locks: locks_*.inc.s, kept in
| companion files beside the project's banks; no scenes or LFO destinations for them).
| The DSP shapes and effects the voice as a sample (filter, FX, level, pan); the engine
| owns the AMP envelope (ATK / HOLD / REL from the AMP page, as FM SYNTH's).
|
| WHERE IT IS. The engine (engine.inc.s: the model, its tables, sy1_*) and this file's glue
| are one unit. SYNTH MACHINE's poly.s calls it at its dispatch sites when the remix
| carries SY DRUM (HAVE_SYDRUM): the START (sd_trigger), the frame (sy1_mono_key_frame,
| sy1_mono_frame), the render (sy1_mono_render), po_tick (sd_tick); sy1_kind[t] is the
| engine a track's last START chose (0 FM, 1 SY DRUM). Its machine-list row is sd_row
| (machine.s's ml_rows). Its own hooks: the page resolver's epilogue (sd_page), which
| hands a SY DRUM track its PLAYBACK page; the setup editor (sd_setup_edit); and the
| step locks' stock hooks (lock_hooks.json, the development line's: sequencer, UI,
| clipboard, card I/O).
|
| From the development line (Octatrick 3.0, 8 Oct 2026): the engine, sy1_pgdesc and its
| formatters, widgets and knob handler, the SETUP page's formatters, the LEG MONO
| recharge, the SETUP shield, the LFO's phase-only frames, the per-step SETUP locks and
| their card files (locks_*.inc.s, setup_stage.inc.s). Not here: the development line's SETUP
| scenes, the SETUP controls as LFO destinations, the marker files. No stock firmware
| bytes are embedded: OS addresses only.
        .text
        .include "remix.inc"             | pass 1: the remix's flags and synth/engine_abi.inc (manifest.py)
        .global sy1_kind, sy1_leg_pending, sy1_mono_trigger, sy1_mono_frame, sy1_mono_key_frame
        .global sy1_mono_render, sd_trigger, sd_tick, sd_row, sd_page, sy1_pgdesc
        .global sd_sig, sd_kind, sd_setup_edit
        .set    FLEX, 1
        .set    PLAY_SETUP, 0x8ef60      | Part + 30 * track: the FLEX SETUP bytes (LOOP SLIC LEN RATE TSTR TSNS)
        .set    LANE_SETUP, 0x80000830   | + 72 * track: the live lane's six SETUP bytes
        .set    CF_SETUP, 0x80000528     | + 384 * ping + 48 * track: the CF record's SETUP bytes (0x80000510 + 24)
        .set    RESOLVER_TAIL, 0x40031ede | the page resolver's `rts` after its epilogue (sd_page)

| ==== sd_tick: po_tick's SY DRUM part, once an audio frame (from po_lfo3b, the frame
| builder's LFO pass, before the render loop). Every register kept.
|   0. THE GATE: with no SY DRUM voice (every sy1_kind 0) and no track of the current Part
|      SY DRUM (no FLEX track with "SY", 1), nothing below has work: the setup stage and the
|      shield are for SY DRUM tracks alone, no reader of the LFOs' outputs runs, and the
|      lock rows reach a track only through a SY DRUM track's stage (or a lock-only trig,
|      which the sequencer grants a SY DRUM track alone). The frame then does only what the
|      steps below do for tracks that are not SY DRUM -- 1. (the Part's SETUP controls into
|      sy1_mod_params: the LFO phase reads LSPD there), ss_kind 0, a track's active /
|      pending rows cleared after a trig (sl_seq_cleanm), and 4.'s phase part
|      (sy1_mod_phase_tick, the frame marked skipped in sy1_mod_skipf) -- and skips the
|      lock staging, the shield and the LFOs' outputs. The free-running LFOs therefore
|      advance every frame at the LSPD in force, exactly as without the test (the
|      development line's rule: the timing keeps running, only the outputs are skipped).
|      Measured on ot_emu: README.md "Measured".
| Then, in the development line's order:
|   1. the four SETUP controls of every track, from the Part (sy1_setup_tick: Part +
|      PLAY_SETUP + 30 t, clamped to LSPD 127 LDEP 127 WAVE 3 S&H 1) into sy1_mod_params;
|   2. a SY DRUM track's effective values (sl_seq_tick -> the setup stage, setup_stage.inc.s):
|      its live lane (what the SETUP page edits and the Part loader fills), the playing
|      step's lock laid over it, the same clamp;
|   3. the shield: a SY DRUM track's CF record SETUP bytes (the bank the frame builder just
|      copied) read LOOP SLIC LEN RATE 0, TSTR 0, TSNS 64 -- its LSPD .. S&H never reach a
|      stock reader as sample settings;
|   4. the LFOs: with a SY DRUM voice on any track (sy1_kind 1) the full sy1_mod_tick, else
|      its phase part alone (sy1_mod_phase_tick; sd_trigger catches the outputs up at the
|      START that makes a track SY DRUM -- the development line's load cut of 8 Oct 2026, the
|      same values).
sd_tick:
        lea     -36(%sp),%sp
        movem.l %d0-%d4/%a0-%a3,(%sp)
        lea     sy1_kind(%pc),%a0        | 0. the gate: a SY DRUM voice on any track?
        move.l  (%a0),%d0
        or.l    4(%a0),%d0
        bne     sd_tk_work
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0          | (no Part yet: no SY DRUM track)
        bcs     sd_tk_idle
        cmpa.l  #0x48000000,%a0
        bcc     sd_tk_idle
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     sd_tk_idle
        mulu.w  #6322,%d0
        adda.l  %d0,%a0                  | the Part
        movea.l %a0,%a1
        adda.l  #MACH_OFF,%a1            | the eight machine bytes
        movea.l %a0,%a2
        adda.l  #SIG_OFF,%a2             | + 30 t: the signature (sd_sig's test, inline)
        moveq   #7,%d1
        move.l  #7*30,%d3
        moveq   #30,%d4
sd_tk_scan:
        mvz.b   (%a1,%d1.l),%d0
        subq.l  #FLEX,%d0
        bne     sd_tk_scan1
        mvz.w   (%a2,%d3.l),%d0
        cmpi.l  #0x5359,%d0              | "SY"
        bne     sd_tk_scan1
        mvz.b   2(%a2,%d3.l),%d0
        subq.l  #1,%d0                   | version 1
        beq     sd_tk_work               | a SY DRUM track
sd_tk_scan1:
        sub.l   %d4,%d3
        subq.l  #1,%d1
        bpl     sd_tk_scan
sd_tk_idle:
        bsr     sy1_setup_tick           | 1. (the LSPD the phase reads)
        clr.l   ss_kind:l                | every track "not SY DRUM", as 2. leaves them
        clr.l   ss_kind+4:l
        move.l  sl_seq_cleanm:l,%d0
        cmpi.l  #0xff,%d0
        beq     sd_tk_idle1
        jsr     sl_seq_tick:l            | a row to clear (2. for tracks that are not SY DRUM)
sd_tk_idle1:
        move.l  po_clock+CK_FRAMES,%d1
        move.l  %d1,sy1_mod_skipf        | as 4.: this frame's outputs are not computed
        bsr     sy1_mod_phase_tick       | as 4.: the phase part alone, every frame
        bra     sd_tk_out
sd_tk_work:
        bsr     sy1_setup_tick           | 1.
        jsr     sl_seq_tick:l            | 2. (locks_seq.inc.s; every register kept)
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0          | (a boot pointer that is no Part yet: nothing to read)
        bcs     sd_tk_lfo
        cmpa.l  #0x48000000,%a0
        bcc     sd_tk_lfo
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     sd_tk_lfo
        move.l  #6322,%d1
        mulu.l  %d1,%d0
        adda.l  %d0,%a0                  | the Part
        lea     CF_SETUP,%a3
        move.l  PING_AT,%d0
        andi.l  #1,%d0
        mulu.w  #384,%d0
        adda.l  %d0,%a3                  | the bank the frame builder copied this frame
        moveq   #0,%d2
sd_tk_track:
        move.l  %d2,%d0
        bsr     sd_sig                   | (a0 = the Part, d0 = track) SY DRUM chosen?
        beq     sd_tk_next
        clr.l   (%a3)                    | 3. the shield: LOOP SLIC LEN RATE 0, TSTR 0, TSNS 64
        move.w  #64,4(%a3)
sd_tk_next:
        lea     48(%a3),%a3
        addq.l  #1,%d2
        cmpi.l  #8,%d2
        bne     sd_tk_track
sd_tk_lfo:
        lea     sy1_kind(%pc),%a0        | 4. a SY DRUM voice on any track?
        moveq   #7,%d1
sd_tk_kind:
        mvz.b   (%a0,%d1.l),%d3
        cmpi.l  #1,%d3
        beq     sd_tk_full
        subq.l  #1,%d1
        bpl     sd_tk_kind
        move.l  po_clock+CK_FRAMES,%d1
        move.l  %d1,sy1_mod_skipf        | this frame's outputs are not computed (sd_trigger may need them)
        bsr     sy1_mod_phase_tick
        bra     sd_tk_out
sd_tk_full:
        bsr     sy1_mod_tick             | the free-running LFO, including between notes
sd_tk_out:
        movem.l (%sp),%d0-%d4/%a0-%a3
        lea     36(%sp),%sp
        rts

| sd_sig: a0 = the Part (the bank blob + part * 6322), d0 = track -> d0 = 1 when the track
| is FLEX with "SY", 1 (SY DRUM chosen in the machine list), else 0; tst.l done.
| Preserves every other register.
sd_sig:
        lea     -8(%sp),%sp
        movem.l %d1/%a1,(%sp)
        movea.l %a0,%a1
        adda.l  #MACH_OFF,%a1
        mvz.b   (%a1,%d0.l),%d1
        subq.l  #FLEX,%d1
        bne     sd_sg_no
        mulu.w  #30,%d0
        movea.l %a0,%a1
        adda.l  %d0,%a1
        adda.l  #SIG_OFF,%a1
        mvz.w   (%a1),%d1
        cmpi.l  #0x5359,%d1              | "SY"
        bne     sd_sg_no
        mvz.b   2(%a1),%d1
        subq.l  #1,%d1                   | version 1
        bne     sd_sg_no
        moveq   #1,%d0
        bra     sd_sg_out
sd_sg_no:
        moveq   #0,%d0
sd_sg_out:
        movem.l (%sp),%d1/%a1
        lea     8(%sp),%sp
        tst.l   %d0
        rts

| sd_kind: d2 = track -> d0 = 2 when the current Part plays SY DRUM on it (sd_sig), else 0
| (the development line's setup kind 2); tst.l done. Every other register kept. An invalid
| boot pointer (no Part yet) answers 0.
sd_kind:
        move.l  %a0,-(%sp)
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0
        bcs     sd_kd_no
        cmpa.l  #0x48000000,%a0
        bcc     sd_kd_no
        move.l  %d1,-(%sp)
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     sd_kd_no1
        move.l  #6322,%d1
        mulu.l  %d1,%d0
        adda.l  %d0,%a0                  | the Part
        move.l  %d2,%d0
        bsr     sd_sig
        beq     sd_kd_no1
        moveq   #2,%d0
        move.l  (%sp)+,%d1
        movea.l (%sp)+,%a0
        tst.l   %d0
        rts
sd_kd_no1:
        move.l  (%sp)+,%d1
sd_kd_no:
        movea.l (%sp)+,%a0
        moveq   #0,%d0
        rts

| The development line's sy1_setup_tick: every track's four SETUP controls from the Part, clamped,
| into sy1_mod_params (a SY DRUM track's are then the lane's, sd_tick 2.). Invalid boot
| pointers leave them. Every register kept.
sy1_setup_tick:
        lea     -32(%sp),%sp
        movem.l %d0-%d3/%a0-%a3,(%sp)
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0
        bcs     sy1_st_out
        cmpa.l  #0x48000000,%a0
        bcc     sy1_st_out
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     sy1_st_out
        move.l  #6322,%d1
        mulu.l  %d1,%d0
        adda.l  %d0,%a0
        adda.l  #PLAY_SETUP,%a0
        lea     sy1_mod_params(%pc),%a2
        moveq   #0,%d2
sy1_st_track:
        moveq   #0,%d3
sy1_st_value:
        mvz.b   (%a0,%d3.l),%d0
        lea     sy1_setup_max(%pc),%a1
        mvz.b   (%a1,%d3.l),%d1
        cmp.l   %d1,%d0
        bls     sy1_st_store
        move.l  %d1,%d0
sy1_st_store:
        move.b  %d0,(%a2)+
        addq.l  #1,%d3
        cmpi.l  #4,%d3
        bne     sy1_st_value
        adda.l  #30,%a0
        addq.l  #1,%d2
        cmpi.l  #8,%d2
        bne     sy1_st_track
sy1_st_out:
        movem.l (%sp),%d0-%d3/%a0-%a3
        lea     32(%sp),%sp
        rts

| ==== sd_trigger: a SY DRUM START (poly.s sy_render, after the engine kind is stored):
| a3 = the track record, d2 = the track. When po_tick ran the LFOs' phase part alone this
| frame (no SY DRUM voice yet), their outputs are computed first (sy1_mod_tick: no second
| advance); then both envelopes recharge -- warm (the voice still sounds: S_GPREV != 0)
| keeps the oscillators' phase and the filter. Every register kept.
sd_trigger:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        move.l  sy1_mod_skipf,%d0
        cmp.l   po_clock+CK_FRAMES,%d0
        bne     sd_tr_go
        clr.l   sy1_mod_skipf
        bsr     sy1_mod_tick             | delta 0: this frame's outputs
sd_tr_go:
        moveq   #0,%d0
        tst.w   S_GPREV(%a3)
        sne     %d0
        bsr     sy1_mono_trigger
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        rts

| ==== the LEG MONO recharge (the development line's): a legato key on a SY DRUM track (poly.s
| po_legkey, from the quantizer's qz_g2_mono) marks the track; the frame whose NIBBLE bit 3
| (stock's posted trigless event, mailbox 0x119) carries the key's PTCH lock recharges the
| envelopes warm -- phase, filter, AMP level and glide stay. A UI key flag alone may come
| before that frame; knobs, LFOs and trigless p-locks post no key flag.
| d2 = track, a3 = the track record; d0/d1/a0 scratch, every other register kept.
sy1_mono_key_frame:
        lea     sy1_leg_pending(%pc),%a0
        tst.b   (%a0,%d2.l)
        beq     sy1_mk_out
        lea     NIBBLE,%a0
        mvz.b   (%a0,%d2.l),%d0
        btst    #3,%d0
        beq     sy1_mk_out
        lea     sy1_leg_pending(%pc),%a0
        clr.b   (%a0,%d2.l)
        moveq   #1,%d0
        bsr     sy1_mono_trigger
sy1_mk_out:
        rts

| ==== sd_page: 0x40031ed6 (jmp, 8 B), the page resolver's epilogue `moveml %sp@,%d2-%d5;
| lea %sp@(16),%sp` (then `rts` at 0x40031ede). Every page lookup ends here with d0 = the
| descriptor; d3 = the track, d1 = the current Part's index (the resolver's own reads,
| 0x40031e08..), d2-d5 are restored by the displaced instructions. The PLAYBACK page of a
| FLEX track that page.s left stock (FLEX_P: not FM SYNTH) is SY DRUM's when SY DRUM is
| chosen on it; every other lookup passes untouched.
sd_page:
        cmpi.l  #FLEX_P,%d0
        bne     sd_pg_out
        cmpi.l  #7,%d3
        bhi     sd_pg_out                | (unsigned) not an audio track
        movea.l PART_PTR,%a0
        move.l  #6322,%d2
        mulu.l  %d1,%d2
        adda.l  %d2,%a0                  | the Part
        move.l  %d3,%d0
        bsr     sd_sig
        beq     sd_pg_stock
        bsr     sy1_pgdesc               | d0 = SY DRUM's page (d0/d1/a0/a1 clobbered)
        bra     sd_pg_out
sd_pg_stock:
        move.l  #FLEX_P,%d0
sd_pg_out:
        movem.l (%sp),%d2-%d5            | displaced
        lea     16(%sp),%sp              | displaced
        jmp     RESOLVER_TAIL

| ==== THE PLAYBACK PAGE (the development line's sy1_pgdesc): a runtime clone of the FM SYNTH
| page's (itself a clone of the stock FLEX record: no stock bytes in the source) with
| SY DRUM's title, names, ranges, formatters, widgets and knob handler; its SETUP half is
| LSPD LDEP WAVE S&H (sd_setup_patch). Built on first use; d0 = the clone. Clobbers
| d0/d1/a0/a1 (the resolver's scratch), a2/a3 saved.
sy1_pgdesc:
        lea     -8(%sp),%sp
        movem.l %a2-%a3,(%sp)
        lea     sy1_pgdesc_buf(%pc),%a2
        tst.b   sy1_pg_built
        bne     sy1_pg_have
        jsr     FM_DESC                  | page.s's fm_descriptor: d0 = the FM SYNTH clone (built on first use;
                                         | d0/d1/a0/a1 clobbered) -- the signed PTCH formatter is its slot 0's
        movea.l %d0,%a0
        movea.l %a2,%a3
        move.l  #FLEX_DESC_LEN,%d1
sy1_pg_copy:
        move.b  (%a0)+,(%a3)+
        subq.l  #1,%d1
        bne     sy1_pg_copy
        lea     sy1_pg_title(%pc),%a0
        lea     0x009(%a2),%a3
        moveq   #9,%d1
sy1_pg_title_copy:
        move.b  (%a0)+,(%a3)+
        subq.l  #1,%d1
        bne     sy1_pg_title_copy
        lea     sy1_pg_names(%pc),%a0
        lea     0x01c(%a2),%a3
        moveq   #30,%d1
sy1_pg_names_copy:
        move.b  (%a0)+,(%a3)+
        subq.l  #1,%d1
        bne     sy1_pg_names_copy
        move.l  #0x40004040,%d1
        move.l  %d1,0x05e(%a2)           | PTCH 64 / MODE A / WDTH 64 / SWEP 64
        move.w  #0x4040,0x062(%a2)        | SPED 64 / DEC 64
        clr.l   0x06e(%a2)               | MODE minimum 0
        moveq   #6,%d1
        move.l  %d1,0x09e(%a2)           | MODE count 6: raw 0..5
        move.l  0x0ca(%a2),0x0d6(%a2)   | SWEP uses the signed PTCH formatter
        lea     sy1_fmt_mode(%pc),%a0
        move.l  %a0,0x0ce(%a2)
        move.l  #0x4003c178,%d1
        move.l  %d1,0x0d2(%a2)           | WDTH: stock plain integer formatter
        lea     sy1_fmt_sped(%pc),%a0
        move.l  %a0,0x0da(%a2)
        lea     sy1_fmt_decay(%pc),%a0
        move.l  %a0,0x0de(%a2)
        lea     FLEX_P+0x0fa,%a0         | six stock dial widgets; no FM icons
        lea     0x0fa(%a2),%a3
        moveq   #6,%d1
sy1_pg_widgets:
        move.l  (%a0)+,(%a3)+
        subq.l  #1,%d1
        bne     sy1_pg_widgets
        lea     sy1_wid_mode(%pc),%a0
        move.l  %a0,0x0fa+4(%a2)        | six positions across the stock dial's full arc
        lea     sy1_knob(%pc),%a0
        lea     KN_SLOTS(%a2),%a3
        moveq   #6,%d1
sy1_pg_knobs:
        move.l  %a0,(%a3)+
        subq.l  #1,%d1
        bne     sy1_pg_knobs
        movea.l %a2,%a0
        bsr     sd_setup_patch           | its SETUP half: LSPD LDEP WAVE S&H (SRC SETUP's right half)
        lea     sy1_pg_built(%pc),%a0
        move.b  #1,(%a0)
sy1_pg_have:
        move.l  %a2,%d0
        movem.l (%sp),%a2-%a3
        lea     8(%sp),%sp
        rts

sy1_fmt_mode:                            | fmt(buf, raw) -> A..F; lane values above 5 clamp
        move.l  8(%sp),%d0
        cmpi.l  #5,%d0
        bls     sy1_fm_letter
        moveq   #5,%d0
sy1_fm_letter:
        addi.l  #'A',%d0
        movea.l 4(%sp),%a0
        move.b  %d0,(%a0)+
        clr.b   (%a0)
        moveq   #1,%d0
        rts

| widget(x, y, slot, raw, flags, fmt, window): storage stays MODE 0..5.
| Only the stock dial's visual value is normalized to its 128-position arc.
| Its formatter receives that visual value too, so use a matching adapter.
| Negative stock sentinel values and all layout/highlight flags are retained.
sy1_wid_mode:
        move.l  16(%sp),%d0
        blt     sy1_wm_args
        cmpi.l  #5,%d0
        bls     sy1_wm_lookup
        moveq   #5,%d0
sy1_wm_lookup:
        lea     sy1_mode_dial(%pc),%a0
        mvz.b   (%a0,%d0.l),%d0
sy1_wm_args:
        lea     sy1_fmt_mode_dial(%pc),%a0
        bra     sy1_wid_enum_args
sy1_wid_wave:                            | OFF/TRI/SQR/RND spread across the dial
        move.l  16(%sp),%d0
        blt     sy1_ww_args
        cmpi.l  #3,%d0
        bls     sy1_ww_lookup
        moveq   #3,%d0
sy1_ww_lookup:
        lea     sy1_wave_dial(%pc),%a0
        mvz.b   (%a0,%d0.l),%d0
sy1_ww_args:
        lea     sy1_fmt_wave_dial(%pc),%a0
sy1_wid_enum_args:
        move.l  28(%sp),-(%sp)          | window
        move.l  %a0,-(%sp)
        move.l  28(%sp),-(%sp)          | flags
        move.l  %d0,-(%sp)              | visual value only
        move.l  28(%sp),-(%sp)          | slot
        move.l  28(%sp),-(%sp)          | y
        move.l  28(%sp),-(%sp)          | x
        jsr     0x400479b4
        lea     28(%sp),%sp
        rts
sy1_fmt_mode_dial:
        move.l  8(%sp),%d0
        moveq   #5,%d1
        mulu.l  %d1,%d0
        addi.l  #63,%d0
        moveq   #127,%d1
        divu.l  %d1,%d0                 | nearest mode from the normalized dial value
        bra     sy1_fm_letter
sy1_fmt_wave_dial:
        move.l  8(%sp),%d0
        moveq   #3,%d1
        mulu.l  %d1,%d0
        addi.l  #63,%d0
        moveq   #127,%d1
        divu.l  %d1,%d0
        bra     sy1_fw_lookup
sy1_mode_dial:
        .byte   0,25,51,76,102,127
sy1_wave_dial:
        .byte   0,42,85,127
        .align  2

sy1_fmt_sped:                            | 20 ms * 55^(raw/127): clockwise is longer/slower
        lea     sy1_sped_ms(%pc),%a0
        bra     sy1_fmt_ms
sy1_fmt_decay:                           | 6 ms * (2500/6)^(raw/127), at C4
        lea     sy1_decay_ms(%pc),%a0
sy1_fmt_ms:
        move.l  %d2,-(%sp)
        move.l  12(%sp),%d0
        cmpi.l  #127,%d0
        bls     sy1_ms_lookup
        moveq   #127,%d0
sy1_ms_lookup:
        mvz.w   (%a0,%d0.l*2),%d0       | nearest integer millisecond
        cmpi.l  #1000,%d0
        bcc     sy1_ms_seconds
        move.l  %d0,-(%sp)
        pea     sd_f_d(%pc)
        move.l  16(%sp),-(%sp)
        jsr     SPRINTF
        lea     12(%sp),%sp
        bra     sy1_ms_out
sy1_ms_seconds:
        move.l  #1000,%d1
        move.l  %d0,%d2
        divu.l  %d1,%d2                  | whole seconds
        moveq   #100,%d1
        divu.l  %d1,%d0                  | tenths, as the FM decay formatter
        move.l  %d2,%d1
        lsl.l   #3,%d1
        add.l   %d2,%d1
        add.l   %d2,%d1
        sub.l   %d1,%d0
        move.l  %d0,-(%sp)
        move.l  %d2,-(%sp)
        pea     sy1_f_seconds(%pc)
        move.l  20(%sp),-(%sp)
        jsr     SPRINTF
        lea     16(%sp),%sp
sy1_ms_out:
        move.l  (%sp)+,%d2

| ---- sd_setup_patch: a0 = a descriptor -> its page 2 (the PLAYBACK SETUP page) is SY DRUM's:
| LSPD LDEP WAVE S&H in slots 6..9, 10 and 11 hidden, the four widgets the locks' (the development
| line's po_setup_patch for its SY kind). Every register kept.
sd_setup_patch:
        lea     -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a2,(%sp)
        movea.l %a0,%a2
        move.l  0x18e(%a2),%d1
        andi.l  #0x00ffffff,%d1          | p6/7 hidden, page 1 unchanged
        move.l  %d1,0x18e(%a2)
        clr.l   0x18a(%a2)               | p8..11 hidden
        lea     0x3a(%a2),%a0
        moveq   #36,%d1
sd_sp_blank:
        clr.b   (%a0)+
        subq.l  #1,%d1
        bne     sd_sp_blank
        moveq   #6,%d1
        movea.l #1,%a1
        lea     0x9a(%a2),%a0
sd_sp_ranges:
        clr.l   0x6a(%a2,%d1.l*4)
        move.l  %a1,(%a0,%d1.l*4)
        clr.b   0x5e(%a2,%d1.l)
        addq.l  #1,%d1
        cmpi.l  #12,%d1
        bne     sd_sp_ranges
        lea     sy1_setup_names(%pc),%a0
        lea     0x3a(%a2),%a1
        moveq   #24,%d1
sd_sp_names:
        move.b  (%a0)+,(%a1)+
        subq.l  #1,%d1
        bne     sd_sp_names
        move.l  0x18e(%a2),%d1
        ori.l   #0x11000000,%d1
        move.l  %d1,0x18e(%a2)
        moveq   #0x11,%d1
        move.l  %d1,0x18a(%a2)
        move.b  #64,0x5e+6(%a2)          | LSPD's default 64 (4.56 Hz)
        move.l  #128,%d1
        move.l  %d1,0x9a+24(%a2)         | LSPD 0..127
        move.l  %d1,0x9a+28(%a2)         | LDEP 0..127
        moveq   #4,%d1
        move.l  %d1,0x9a+32(%a2)         | WAVE 0..3
        moveq   #2,%d1
        move.l  %d1,0x9a+36(%a2)         | S&H 0..1
        lea     sy1_fmt_lspd(%pc),%a0
        move.l  %a0,0xca+24(%a2)
        move.l  #0x4003c178,%d1          | LDEP: the stock plain integer formatter
        move.l  %d1,0xca+28(%a2)
        lea     sy1_fmt_wave(%pc),%a0
        move.l  %a0,0xca+32(%a2)
        lea     sy1_fmt_sh(%pc),%a0
        move.l  %a0,0xca+36(%a2)
        move.l  #0x400479b4,%d1          | the stock dial widget
        move.l  %d1,0xfa+24(%a2)
        move.l  %d1,0xfa+28(%a2)
        lea     sy1_wid_wave(%pc),%a0
        move.l  %a0,0xfa+32(%a2)
        move.l  #0x40046f10,%d1          | the stock switch widget
        move.l  %d1,0xfa+36(%a2)
        movea.l %a2,%a0
        jsr     sl_ui_patch:l            | the four widgets lock-aware: a held step's lock inverted (locks_ui)
        movem.l (%sp),%d0-%d1/%a0-%a2
        lea     20(%sp),%sp
        rts

| ---- sd_setup_edit: 0x4003a524 (jmp, 10 B), the PLAYBACK SETUP editor's descriptor load
| `lea 0x400d5f38,%a0; moveal %a0@(0,%d2:l:4),%a5` (d2 = the window's machine row, a3 =
| the control, d4 = the track; then 0x4003a52e stores the edit in the Part, its shadow and
| the live lane). On SY DRUM's page (the development line's po_setup_edit for its SY
| page): E / F store nothing (hidden); with trigs held the turn edits their locks
| (sl_ui_edit) and stores no default; otherwise the default edit releases the playing
| step's lock of that control (sl_seq_release_control), so the new value is heard at once.
| Every other page: stock.
sd_setup_edit:
        lea     0x400d5f38,%a0
        movea.l (%a0,%d2.l*4),%a5        | displaced
        lea     sy1_pgdesc_buf(%pc),%a0
        cmpa.l  %a0,%a5
        bne     sd_se_stock
        cmpa.l  #4,%a3
        bcc     sd_se_hidden
        jsr     sl_ui_edit:l
        tst.l   %d0
        bne     sd_se_hidden
        lea     -8(%sp),%sp
        movem.l %d2/%d4,(%sp)
        move.l  %d4,%d2
        move.l  %a3,%d4
        jsr     sl_seq_release_control:l | a manual default edit releases this effective override
        movem.l (%sp),%d2/%d4
        addq.l  #8,%sp
sd_se_stock:
        jmp     0x4003a52e
sd_se_hidden:
        jmp     0x4003a624               | no Part / shadow / live store

| ---- sy1_knob: the PLAYBACK page's knob handler (slot, detents, value) -> d0 = the new raw
| value (the stock knob routine clamps it): one unit a detent, seven with the encoder
| pressed, FUNC held: PTCH 12 (an octave), MODE 1, WDTH 16, SWEP 12, SPED 16, DEC 16. The
| development line's sy1_knob with FM SYNTH's po_knob paths written out (another unit's labels).
sy1_knob:
        lea     -12(%sp),%sp
        movem.l %d2-%d4,(%sp)
        move.l  16(%sp),%d2              | the slot, 0..5
        move.l  20(%sp),%d1              | detents, signed
        move.l  24(%sp),%d0              | the raw value the knob is turned from
        tst.l   FUNC_HELD
        beq     sd_kn_plain
        tst.l   FUNC_ENC_OFF
        bne     sd_kn_plain
        lea     sy1_kn_jump(%pc),%a0
        mvz.b   (%a0,%d2.l),%d3
        muls.l  %d3,%d1
        add.l   %d1,%d0
        bra     sd_kn_out
sd_kn_plain:
        move.l  %d2,%d3
        addi.l  #PUSH_CODE,%d3           | the push switch's key code ...
        move.l  %d3,%a0
        add.l   %d3,%d3
        add.l   %a0,%d3                  | * 3 ...
        lsl.l   #3,%d3                   | * 8 = code * 0x18: its key record
        lea     KEY_HELD,%a0
        tst.l   (%a0,%d3.l)
        beq     sd_kn_one
        move.l  %d1,%d3                  | pressed: seven units a detent
        lsl.l   #3,%d1
        sub.l   %d3,%d1
sd_kn_one:
        add.l   %d1,%d0
sd_kn_out:
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts
sy1_kn_jump:
        .byte   12, 1, 16, 12, 16, 16
        .align  4

sy1_fmt_lspd:                           | .40..200.0 Hz; preserved raw 64 = 4.56
        move.l  8(%sp),%d0
        cmpi.l  #127,%d0
        bls     sy1_fl_lookup
        moveq   #127,%d0
sy1_fl_lookup:
        lea     sy1_lspd_centi(%pc),%a0
        mvz.w   (%a0,%d0.l*2),%d0
        move.l  %d0,%d1
        move.l  #100,%d0
        divu.l  %d0,%d1                 | integer Hz
        move.l  %d1,-(%sp)
        mulu.l  %d1,%d0
        lea     sy1_lspd_centi(%pc),%a0
        move.l  12(%sp),%d1
        cmpi.l  #127,%d1
        bls     sy1_fl_frac
        moveq   #127,%d1
sy1_fl_frac:
        mvz.w   (%a0,%d1.l*2),%d1
        sub.l   %d0,%d1
        move.l  (%sp)+,%d0
        lea     sy1_hz_format(%pc),%a0
        cmpi.l  #10,%d0
        bcs     sy1_fl_print
        addq.l  #5,%d1
        move.l  %d0,-(%sp)
        moveq   #10,%d0
        divu.l  %d0,%d1
        move.l  (%sp)+,%d0
        cmpi.l  #10,%d1
        bcs     sy1_fl_tenths
        moveq   #0,%d1
        addq.l  #1,%d0
sy1_fl_tenths:
        lea     sy1_hz_format_short(%pc),%a0
sy1_fl_print:
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)
        move.l  %a0,-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     SPRINTF
        lea     16(%sp),%sp
        rts
sy1_fmt_wave:
        move.l  8(%sp),%d0
        cmpi.l  #3,%d0
        bls     sy1_fw_lookup
        moveq   #3,%d0
sy1_fw_lookup:
        lea     sy1_wave_names(%pc),%a0
        bra     sy1_setup_string
sy1_fmt_sh:
        move.l  8(%sp),%d0
        cmpi.l  #1,%d0
        bls     sy1_fs_lookup
        moveq   #1,%d0
sy1_fs_lookup:
        lea     sy1_sh_names(%pc),%a0
sy1_setup_string:
        lsl.l   #2,%d0
        adda.l  %d0,%a0
        movea.l 4(%sp),%a1
sy1_ss_byte:
        move.b  (%a0)+,(%a1)+
        bne     sy1_ss_byte
        rts


| ==== SY DRUM's row in the machine list (machine.s ml_rows; its layout there) ==========
| The seeds a track gets when SY DRUM is chosen on it (and it was not SY DRUM): PTCH 0,
| MODE A, WDTH 64, SWEP 0, SPED 64, DEC 64; LSPD 64 (4.56 Hz), LDEP 0, WAVE OFF, S&H OFF,
| and 0 in FLEX's TSTR / TSNS bytes (the development line's sy1_defaults). Leaving the row puts
| the stock FLEX SETUP bytes back (flags bit 0: LSPD .. S&H are no sample settings).
        .balign 4
sd_row:
        .byte   'S', 'Y', 1, 2           | the signature "SY", 1; engine kind 2 (po_signed's answer)
        .long   sd_name
        .long   sd_seeds
        .long   sy1_pgdesc               | SRC SETUP's page for the row: the SY DRUM page (its SETUP half)
        .byte   1, 0, 0, 0               | flags: its SETUP bytes are its own
sd_seeds:
        .byte   64, 0, 64, 64, 64, 64    | PLAYBACK: PTCH 0, MODE A, WDTH 64, SWEP 0, SPED 64, DEC 64
        .byte   64, 0, 0, 0, 0, 0        | SETUP: LSPD 64, LDEP 0, WAVE OFF, S&H OFF, (TSTR, TSNS 0)
sd_name:
        .asciz  "SY DRUM"
sd_f_d:
        .asciz  "%d"
        .balign 2

| ---- data ----------------------------------------------------------------------
sy1_setup_names:
        .ascii  "LSPD\0\0LDEP\0\0WAVE\0\0S&H\0\0\0"
sy1_setup_max:
        .byte   127,127,3,1
sy1_wave_names:
        .ascii  "OFF\0TRI\0SQR\0RND\0"
sy1_sh_names:
        .ascii  "OFF\0ON\0\0"
sy1_hz_format:
        .asciz  "%d.%02d"
sy1_hz_format_short:
        .asciz  "%d.%d"
        .balign 2
sy1_pg_title:                            | the page title, copied as 9 bytes into the clone (+0x009): 8 + NUL
        .asciz  "SY DRUM"
        .byte   0
sy1_pg_names:
        .ascii  "MODE\0\0WDTH\0\0SWEP\0\0SPED\0\0DEC\0\0\0"
sy1_f_seconds:
        .asciz  "%d.%ds"
        .align  2
| Display-only milliseconds, rounded from the engine's time constants (U2, U6 in engine.inc.s).
sy1_sped_ms:
        .short  20, 21, 21, 22, 23, 23, 24, 25
        .short  26, 27, 27, 28, 29, 30, 31, 32
        .short  33, 34, 35, 36, 38, 39, 40, 41
        .short  43, 44, 45, 47, 48, 50, 52, 53
        .short  55, 57, 58, 60, 62, 64, 66, 68
        .short  71, 73, 75, 78, 80, 83, 85, 88
        .short  91, 94, 97, 100, 103, 106, 110, 113
        .short  117, 121, 125, 129, 133, 137, 141, 146
        .short  151, 156, 160, 166, 171, 176, 182, 188
        .short  194, 200, 207, 213, 220, 227, 234, 242
        .short  250, 258, 266, 274, 283, 292, 302, 311
        .short  321, 332, 342, 353, 365, 376, 388, 401
        .short  414, 427, 441, 455, 469, 484, 500, 516
        .short  532, 549, 567, 585, 604, 623, 643, 664
        .short  685, 707, 730, 753, 777, 802, 828, 855
        .short  882, 910, 939, 970, 1001, 1033, 1066, 1100
sy1_decay_ms:
        .short  6, 6, 7, 7, 7, 8, 8, 8
        .short  9, 9, 10, 10, 11, 11, 12, 12
        .short  13, 13, 14, 15, 16, 16, 17, 18
        .short  19, 20, 21, 22, 23, 24, 25, 26
        .short  27, 29, 30, 32, 33, 35, 36, 38
        .short  40, 42, 44, 46, 49, 51, 53, 56
        .short  59, 62, 65, 68, 71, 74, 78, 82
        .short  86, 90, 94, 99, 104, 109, 114, 120
        .short  125, 132, 138, 145, 152, 159, 167, 175
        .short  183, 192, 202, 211, 222, 233, 244, 256
        .short  268, 281, 295, 309, 324, 340, 357, 374
        .short  392, 411, 431, 452, 474, 497, 521, 547
        .short  573, 601, 631, 661, 693, 727, 762, 800
        .short  838, 879, 922, 967, 1014, 1063, 1115, 1169
        .short  1226, 1286, 1348, 1414, 1483, 1555, 1630, 1710
        .short  1793, 1880, 1972, 2067, 2168, 2273, 2384, 2500

sy1_lspd_centi:
        .word   40,42,43,45,47,48,50,52
        .word   54,56,59,61,63,66,68,71
        .word   73,76,79,82,86,89,92,96
        .word   100,103,107,112,116,120,125,130
        .word   135,140,146,151,157,163,170,176
        .word   183,190,197,205,213,221,230,239
        .word   248,258,268,278,289,300,312,324
        .word   336,349,363,377,391,407,422,439
        .word   456,484,514,546,579,615,653,694
        .word   737,782,831,882,937,995,1056,1121
        .word   1191,1265,1343,1426,1514,1608,1707,1813
        .word   1925,2044,2170,2305,2447,2599,2759,2930
        .word   3111,3304,3508,3725,3956,4200,4460,4736
        .word   5029,5340,5670,6021,6394,6789,7209,7655
        .word   8129,8631,9165,9732,10334,10974,11653,12373
        .word   13139,13952,14815,15731,16704,17738,18835,20000
        .balign 4

| ---- run-time state (depacked as zeros at every boot) ------------------------------
sy1_leg_pending:                         | per track: a mono legato key's recharge awaits its trigless frame
        .fill   8, 1, 0
sy1_pg_built:
        .byte   0
        .align  4
sy1_pgdesc_buf:                          | the PLAYBACK page clone (sy1_pgdesc)
        .fill   FLEX_DESC_LEN, 1, 0

        .include "remix.inc"             | pass 2: the engine, engine.inc.s (manifest.py)
