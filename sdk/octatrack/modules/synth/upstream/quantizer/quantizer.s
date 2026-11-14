| Modwerk pending 0.1.2 (#264): the octave drawer detour is at the COMMON
| push (0x400449be), reached by audio and MIDI. Stock MIDI branches directly
| there and already carries d0. Keep its value and push the value and format
| once each. Detouring only the audio load at 0x400449b8 removes the push
| reached by MIDI and underflows the drawer's nine-argument stack.
| SCALE QUANTIZER -- the DRAM unit (13 Sep 2026; a DRAM unit since 28 Sep 2026). GNU as.
|
| OCTATRICK 2.9 (28 Sep 2026): ROOT, and the move into DRAM.
|   * ROOT: a fifth SEQUENCER row, right under SCALE (GLIDE is the sixth
|     now): C C# D D# E F F# G G# A A# B, the root the scale is
|     built on, a battery-RAM byte (NV_ROOT 0x100b14ee, beside SCALE and
|     GLIDE; core.s clamps it 0..11 at boot and sets C with the defaults),
|     saved as "#SEQUENCER_ROOT=n" after the SCALE line. Every snap this unit
|     does -- the PTCH knob, a PTCH lock, a CHROMATIC key -- and the chord
|     snap the synth engine does through SCALE_AT read ONE mask, core.s's
|     qz_scale_mask: the scale's pitch classes rotated by ROOT, so "MINOR,
|     ROOT A" is the A minor pitch classes on the C-based pitch class of
|     every note (raw 64 = C on a synth track, raw 64 = 0 st on a sample
|     track). With a scale on, the CHROMATIC keyboard is transposed so that
|     key 1 sounds the root: a synth track's key is n = key - 12 + ROOT +
|     12 * octave (so [TRIG 13] at octave 0 is the root an octave above key
|     1), a sample track's index is key + ROOT clamped at 24 (= +12 st, the
|     stock ceiling); the number beside the keyboard reads "A -1" where it
|     read "-1" (qz_octnum: the root's name is written into the format the
|     stock printer is handed). ROOT = C is 2.8 in every path -- the pitches,
|     the knob and the locks byte for byte, the keyboard's number reading
|     "C 0" where 2.8 read "0" with a scale on -- and SCALE = OFF ignores
|     ROOT altogether (every path leaves at its OFF test before ROOT is
|     read).
|   * THE SAMPLE TRACK'S TWO POSITIONS (the second pass). Stock lays the 16
|     keys over index 0..24 (-12..+12 st, TRIG 13 = index 12 = the sample's
|     own pitch) in two positions of ONE word, OCT_WORD (0 at boot; FUNC +
|     LEFT / RIGHT eor it): position 0 = index key-1 (keys 1..16 = -12..+3
|     st, the 16-key picture), position 1 = index key+11 (keys 1..13 = 0..+12
|     st; keys 14..16 fail the handler's range check, the 13-key picture).
|     With ROOT r > 0 only ONE complete root-to-root octave fits the stock
|     range, r-12 .. r: position 0 plays it (key 1 = the root below the
|     sample's pitch, key 13 = the root above, keys 14..16 = r+1 .. r+3,
|     clamped at +12 for A# / B only). Position 1 is necessarily partial: for
|     r <= 6 it is r .. r+12 with the top r keys clamped at +12 st (as the
|     first pass did for every root); for r > 6 (G .. B) the whole keyboard
|     drops two octaves there, r-24 .. r-12, and only the bottom 12 - r keys
|     clamp at -12 st -- the side that clamps FEWER keys. The number beside
|     the keyboard reads the position as an octave: "A 0" in position 0,
|     "A -1" in position 1 with r > 6, "D 1" with r <= 6 (qz_octnum). ROOT C
|     is stock's two positions exactly. The MIDI note a key sends out stays the
|     key's own (72 + key), as in 2.8 -- it never followed the octave either.
|   * DRAM: this unit is Linked(dram=True) -- linked into octabam's platform
|     runtime at the bottom of the audio page arena with the synth's poly.s,
|     depacked by the loader at the boot redirect 0x4000050c (before the
|     .data copy 0x4000f938 and main 0x40000db0, so before every detour site
|     of this unit can run; measured under the port with --watch-pc, README).
|     The OS image keeps only core.s (qz_boot, qz_defaults, qz_scale_mask,
|     the mask table: ~150 B) and the two pinned stubs keys.s / scale.s. A
|     ROM unit cannot name a DRAM symbol and a DRAM unit cannot name a ROM
|     one at link time, so this unit reaches the pinned mailbox and the
|     scale accessor as FIXED addresses (KEYS_AT, SCALE_AT: the contracts
|     poly.s uses), and the manifest's detours and TableGrow entries name
|     this unit's symbols through the platform's symbol table.
|
| A per-project SCALE setting (PROJECT > CONTROL > SEQUENCER, fourth row,
| OFF by default) and three places it acts:
|   * the PTCH knob on the PLAYBACK page (STATIC / FLEX / PICKUP -- any page
|     of kind 0 whose slot A is named "PTCH") steps to the next scale degree
|     instead of one raw unit (raw = 64 + 5 * semitones, 4..124), on the
|     Part's value and, with a [TRIG] key held, on the step's lock;
|   * a [TRIG] key in CHROMATIC trig mode snaps to the nearest degree (ties
|     to the lower one) before the key becomes a pitch, so the voice, the
|     PTCH lock a held or live-recorded trig receives and the box on the
|     screen all carry the snapped value;
|   * the setting rides the project file as a comment line the stock loader
|     skips ("#SEQUENCER_SCALE=n" after PATTERN_CHANGE_CHAIN_BEHAVIOR).
| With SCALE = OFF every detour replays what it displaced and does nothing
| else; the setting byte is in battery RAM (NV_SCALE below, 26 Sep 2026).
|
| GLIDE (24 Sep 2026): a fifth SEQUENCER row, OFF / 1..127, the synth
| machine's glide time (modules/synth: 10 ms at 1 .. 1 s at 127), saved as
| "#SYNTH_GLIDE=n" after the SCALE line. The byte is qz_glide, a battery RAM
| byte (NV_GLIDE; the synth cave reads it as an OS absolute); this unit
| reaches it through qz_glide_of -- the ONE reader, so the storage can move. With GLIDE on, a CHROMATIC key pressed while another key
| of the track is held is a LEGATO note: the stock's trigless-trig path
| (the FUNC + key path) is taken, so the voice is not restarted and only the
| pitch changes (the synth glides to it), the old key's voice note-off is
| suppressed, and the new key becomes the track's held key, so releasing the
| first key does nothing and releasing the last one releases the note (the
| 303 rule). Two more detours in the chromatic key handler, qz_leg1 / qz_leg2.
| LEG (2 Oct 2026): the legato switch is the track's LEG setting (the AMP
| SETUP page's sixth box, OFF / MONO / POLY on a synth track, OFF / MONO on
| any other audio track since 3 Oct 2026, a Part byte; modules/synth) read
| through the engine's po_legmode; GLIDE is the slide time only, everywhere.
|
| PARAPHONIC KEYS (24 Sep 2026): on a FLEX track whose assigned slot is a
| SYNTH* sample (qz_is_synth) and whose Part's VOIC byte -- the LFO page's
| slot 2, SPD3's byte, which the synth's page names VOIC -- is 2..4
| (qz_polytrack), the CHROMATIC keys are polyphonic: a press while keys are
| held starts a fresh voice and ends nothing (qz_leg1); every press posts the
| key for the engine (qz_pkey) and sets its bit in the track's held-key mask
| (qz_pmask, keys.s); a release clears the bit -- the engine releases that
| key's voices -- sends the key's MIDI note-off, and only the LAST key's
| release takes the stock note-off path, which posts the track's AMP release
| (qz_leg0, a third detour on the handler's release path). Legato is off on
| such a track. VOIC 1 (or a byte outside 1..4, the stock 32) and every
| other track: stock, byte for byte -- the mono synth with GLIDE legato.
|
| THE TUNING SYSTEM (27 Sep 2026, synth tracks only): on a FLEX track whose
| slot holds a SYNTH* sample the PTCH byte is SEMITONES -- raw 64 = 0, one
| unit a semitone, -64..+63 (the synth page's clone gives the slot that range;
| modules/synth). Every quantizer path knows it: qz_quant steps by scale
| degree over raw = 64 + n (qz_pcof computes the pitch class instead of the
| sample tracks' 5-per-semitone table), and qz_chrom turns a key into raw =
| 64 + (key - 12) + 12 * octave. The CHROMATIC octave on a synth track is
| qz_oct, -4..+4 (FUNC + LEFT / RIGHT, qz_octkey), a byte of this unit, while
| the stock word stays 0 there (qz_keyidx, qz_octdraw): the key index the
| stock handler sees is the physical key, 0..15, so its range check, the held
| key byte, the MIDI note out (72 + key, octave 0's notes) and the key mask
| are the stock's. The keyboard drawing prints qz_oct beside the keys
| (qz_octnum, stock's own "%d"). MIDI IN on a synth track is the synth
| module's since 30 Sep 2026 (modules/synth/poly.s po_mon and friends: the
| STANDARD map's chromatic notes become keys of their own, raw = note - 20,
| the full range; this unit's qz_midi detour at 0x4000e74c is gone: the synth's po_mon sits at the block's START, 0x4000e746).
| Sample tracks: byte for byte stock.
|
| FINGERED CHORDS (26 Sep 2026): the recorder detours hand every CHROMATIC
| key of a synth track to the synth engine's po_keyrec (modules/synth/
| poly.s, through the pointer it publishes before sy_render): qz_leg3 asks
| first whether the key JOINS the chord being recorded (then the chord's
| step gets its PTCH / CHRD / VOIC locks and the key records no trig of
| its own), and a fourth detour, qz_leg5, hands a key the recorder did
| record (track, key, step, raw) over to start the next chord record. The
| recognition and the stock-writer calls are the engine's. The HOLD table
| this unit carried (qz_hold128, 256 B) is read
| from the engine's po_hold128 through the same pointer block since then,
| so the ROM unit is smaller than before. The second pass (26 Sep 2026):
| qz_holdrel calls the engine's po_keyrel (the block's -20) at every key
| release with the track's four HOLD slots -- a key that joined a chord
| less than 50 ms before another key of it went up was a legato hand-over,
| and the engine gives it its own trig and a slot among the four; qz_oct
| lives in the pinned keys.s so the engine can pitch a key the handler
| never posted (two keys in one scan).
|
| Linked by the build at the address it lands on (modules/quantizer/
| manifest.py names the sites); the only absolute references to itself are
| the qz_names entries, which the linker resolves.

        .text
        .global qz_knob, qz_plock, qz_chrom, qz_draw, qz_ld_entry, qz_ld_line, qz_wr
        .global qz_get, qz_set, qz_lbl_scale, qz_scale
        .global qz_get_glide, qz_set_glide, qz_lbl_glide, qz_leg1, qz_leg2
        .global qz_leg0, qz_leg3, qz_leg4, qz_leg5
        .global qz_get_root, qz_set_root, qz_lbl_root
        .global qz_keyidx, qz_octkey, qz_octdraw, qz_octnum
        .set    OCT_WORD, 0x460d16fc      | stock's CHROMATIC octave word: 0 or 1 (FUNC + LEFT/RIGHT eor it)
        .set    KEYS_AT, 0x400d2cb0       | keys.s, pinned (manifest KEYS_AT): the paraphonic key mailbox
        .set    qz_pkey, KEYS_AT          |   the live key (index + 1) per track, 8 bytes
        .set    qz_pmask, KEYS_AT+8       |   the held keys per track, 8 longs
        .set    qz_clock, KEYS_AT+40      |   the engine's clock address (0 until it has run)
        .set    qz_oct, KEYS_AT+44        |   a synth track's CHROMATIC octave, -4..+4
        .set    SCALE_AT, 0x400d2ca8      | scale.s, pinned: `jmp qz_scale_mask` (core.s) -- d0 := the scale's
                                          | pitch-class mask rotated by ROOT, 0 = OFF; clobbers a0, d0, keeps d1
        .set    UI_TRACK, 0x100b14cc
        .set    LOCK_WRITE, 0x40042158    | (track, flat slot, value, step, ctx): the stock p-lock writer
        .set    REC_CTX, 0x46c7e956       | the recorder's context the handler passes it
        .set    FLAT_HOLD, 13             | the AMP page's HOLD slot
        .set    KIND_FLEX, 0x400d6438     | the kind table's FLEX entry: the synth engine's sy_render (modules/synth/poly.s),
                                          | which publishes, before itself, -4 the page clone, -8 the HOLD table, -12 po_keyrec,
                                          | -16 po_knob, -20 po_keyrel, -24 po_legmode (the LEG gate), -28 po_legkey (2 Oct 2026)
        .set    HELD, 0x460d171d          | the chromatic key handler's held key per track (key + 1; 0 = none)
        .set    FUNC_HELD, 0x46c7dd26
        .set    MIDI_NOTE, 0x4003f3a8     | (track, note, velocity): the key's MIDI note out
        .set    SPRINTF, 0x40013a08
        .set    FMT_D, 0x400b465d         | "%d"

| ---- the settings ----------------------------------------------------------------
| Two bytes of the unit's BATTERY-BACKED RAM (CS1, 0x10000000..: the same
| chip that keeps CHAIN AFTER at 0x100b14ae across a power cycle), in the
| linker's padding between the last UI-mirror long 0x100b14de..e1 and the
| 16-byte-aligned project record at 0x100b14f0 (0x100b14e2..ef: no
| reference in the OS, outside both blocks the boot copies to 0x80000000).
| Until 26 Sep 2026 they lived in the OS image (this unit, the pinned
| glide.s), which the bootstrap copies afresh from flash at every power-on:
| the settings reached project.work and project.strd (the serializer hooks
| below) but a power cycle never reads those files -- the unit comes back
| from battery RAM (0x4001fb3c.., the memcpy of 0x100b1480 to 0x80000020)
| and only PROJECT > CHANGE / RELOAD run the loader. So SAVE "lost" SCALE
| and GLIDE at the next boot. Now the setting IS the battery byte: read and
| written in place, clamped at boot by qz_boot (stock's own sanitiser of the
| block, 0x40010212), defaulted to OFF with the block by qz_defaults
| (0x40025ac2: a cold boot, a new project, and the loader before it stores).
        .set    NV_SCALE, 0x100b14ec
        .set    NV_GLIDE, 0x100b14ed
        .set    NV_ROOT,  0x100b14ee
        .set    qz_scale, NV_SCALE      | 0 = OFF, 1..24 = index into core.s qz_masks / qz_names
        .set    qz_glide, NV_GLIDE      | 0 = OFF, 1..127 (modules/synth GLIDE_AT: keep equal)
        .set    qz_root,  NV_ROOT       | 0..11 = C .. B (28 Sep 2026; core.s clamps and defaults it with the others)

| qz_glide_of: d0 := the GLIDE value, 0 = OFF, 1..127 (d2 = track, unused: the
| setting is per project). The one place this unit reads the storage
| (synth.s sy_glide is its twin).
qz_glide_of:
        mvz.b   qz_glide,%d0
        rts

| qz_boot (0x40010212), qz_defaults (0x40025ac2) and qz_scale_mask (the
| SCALE_AT trampoline's target) are core.s, the ROM core, since 28 Sep 2026.

| qz_polytrack: d0 := 1 (flags NE) when track d2 is a FLEX track whose
| assigned FLEX slot holds a SYNTH*-named sample AND its Part's VOIC byte
| (the LFO page's slot 2: Part + 0x8ee9a + track*24 + 2) is 2..4, else 0
| (EQ). Preserves everything but d0.
qz_polytrack:
        jbsr    qz_is_synth
        jbeq    qz_pt_ret
        move.l  %a0,-(%sp)
        move.l  %d1,-(%sp)
        movea.l 0x46c82456,%a0
        mvz.b   0x100b14cf,%d0
        move.l  #6322,%d1
        muls.l  %d1,%d0
        adda.l  %d0,%a0                 | the Part
        adda.l  #0x8ee9a,%a0            | its LFO page bytes
        move.l  %d2,%d1
        lsl.l   #3,%d1                  | track * 8 ...
        move.l  %d1,%d0
        add.l   %d1,%d1                 | ... * 2 = 16 ...
        add.l   %d0,%d1                 | ... + 8 = track * 24 (27 Sep 2026: a third
                                        | doubling made it track * 40, so T2..T8 read an
                                        | unrelated byte for VOIC and their keys stayed mono)
        mvz.b   2(%a0,%d1.l),%d0        | VOIC
        subq.l  #2,%d0
        cmpi.l  #2,%d0                  | 2..4?
        jbls    qz_pt_yes
        moveq   #0,%d0
        jbra    qz_pt_out
qz_pt_yes:
        moveq   #1,%d0
qz_pt_out:
        move.l  (%sp)+,%d1
        movea.l (%sp)+,%a0
        tst.l   %d0
qz_pt_ret:
        rts

| qz_is_synth: d0 := 1 (NE) when track d2's machine is FLEX and its assigned
| FLEX slot's settings record names a SYNTH* file -- the synth page's own test
| (modules/synth/page.s pg_resolve): slot = Part + 0x8f04a + track*5 + 1, its
| record 0x100b14f0 + 0x448*slot, the path at +0 scanned for the basename.
| Preserves everything but d0.
qz_is_synth:
        lea     -16(%sp),%sp
        movem.l %d1/%d3/%a0/%a1,(%sp)
        movea.l 0x46c82456,%a0
        mvz.b   0x100b14cf,%d0
        move.l  #6322,%d1
        muls.l  %d1,%d0
        adda.l  %d0,%a0                 | the Part
        move.l  %a0,%a1
        adda.l  #0x8eda2,%a1
        mvz.b   (%a1,%d2.l),%d0         | the track's machine
        subq.l  #1,%d0                  | FLEX
        jbne    qz_is_no
        move.l  %a0,%a1
        move.l  %d2,%d0
        mulu.w  #30,%d0
        adda.l  %d0,%a1
        adda.l  #0x8edbc,%a1
        mvz.w   (%a1),%d0
        cmpi.w  #0x464d,%d0
        jbne    1f
        mvz.b   2(%a1),%d0
        cmpi.b  #1,%d0
        jbne    1f
        moveq   #1,%d0
        jbra    qz_is_out
1:
        move.l  %d2,%d0
        lsl.l   #2,%d0
        add.l   %d2,%d0                 | track * 5
        adda.l  %d0,%a0
        adda.l  #0x8f04b,%a0
        mvz.b   (%a0),%d0               | its FLEX slot, 0-based
        moveq   #127,%d1
        cmp.l   %d1,%d0
        jbhi    qz_is_no                | none, or a recorder buffer
        move.l  #0x448,%d1
        mulu.l  %d1,%d0
        addi.l  #0x100b14f0,%d0
        move.l  %d0,%a0                 | the settings record; its path at +0
        move.l  %a0,%a1
        move.l  #255,%d3
qz_is_scan:
        mvz.b   (%a0)+,%d0
        jbeq    qz_is_scanned
        cmpi.l  #'/',%d0
        jbne    qz_is_scan1
        move.l  %a0,%a1                 | after the last '/'
qz_is_scan1:
        subq.l  #1,%d3
        jbne    qz_is_scan
qz_is_scanned:
        move.w  #0x464d,%d0             | "FM": FMSYNTH* is the marker name too
        cmp.w   (%a1),%d0
        jbne    qz_is_fm
        addq.l  #2,%a1
qz_is_fm:
        lea     qz_synthname(%pc),%a0
        moveq   #5,%d3
qz_is_cmp:
        mvz.b   (%a0)+,%d0
        mvz.b   (%a1)+,%d1
        cmp.l   %d1,%d0
        jbne    qz_is_no
        subq.l  #1,%d3
        jbne    qz_is_cmp
        moveq   #1,%d0
        jbra    qz_is_out
qz_is_no:
        moveq   #0,%d0
qz_is_out:
        movem.l (%sp),%d1/%d3/%a0/%a1
        lea     16(%sp),%sp
        tst.l   %d0
        rts

| qz_ui_synth: d0 := 1 (NE) when the UI's current track (UI_TRACK, the one the
| knobs, the page and the CHROMATIC keys act on) is a synth track. Preserves
| everything but d0.
qz_ui_synth:
        move.l  %d2,-(%sp)
        mvz.b   UI_TRACK,%d2
        jbsr    qz_is_synth
        move.l  (%sp)+,%d2
        tst.l   %d0
        rts

| ---- the PTCH knob: jsr planted at 0x40055170 (the knob handler's store) -------
| Registers there (read off 0x40055008): d2 = the clamped new value, d6 = the
| value the knob was turned from (byte), a4 = the encoder delta, d5 = slot,
| a3 = the page descriptor (min at +0x6a, count at +0x9a, slot names at
| +0x16), a2 / a5 = the Part byte and its SRAM mirror. The three displaced
| instructions store d2 and load d1, so d1 is free here.
qz_knob:
        lea     qz_scale,%a0
        mvz.b   (%a0),%d0
        jbeq     qz_k_store              | OFF: stock
        tst.l   %d5                     | slot A only
        jbne     qz_k_store
        tst.l   0x460d1684              | page kind 0 = PLAYBACK
        jbne     qz_k_store
        move.l  0x16(%a3),%d1           | the slot's name: "PTCH" (not THRU / NEIGHBOR)
        cmpi.l  #0x50544348,%d1
        jbne     qz_k_store
        move.l  %a4,%d1                 | delta: detents, signed
        jbeq     qz_k_store
        mvz.b   %d6,%d2                 | start from the value the knob was turned from
        jbsr     qz_quant
qz_k_store:
        move.b  %d2,(%a2)               | displaced: the Part byte
        move.b  %d2,(%a5)               | displaced: its mirror
        move.w  %fp,%d1                 | displaced
        rts

| ---- the PTCH knob with a [TRIG] key held: jsr planted at 0x40050e60 --------------
| The p-lock editor (loops over the held steps; d6 = step, d7 = the rest) takes
| the step's lock byte -- or the Part's value when there is none (0xff) --
| through the slot's own handler and the descriptor clamp into d4, then
| stores it at (0x59,%a0,%a1.l) = track record + 0x59 + flat slot (a0 = the
| record, a1 = flat slot) and into the SRAM mirror after the hook. Same
| registers as above: d5 = slot, a3 = descriptor, fp = delta. The lock byte
| is still the old one when the hook runs, so the start value is read there.
qz_plock:
        move.l  %a2,-(%sp)
        lea     qz_scale,%a2
        mvz.b   (%a2),%d0
        jbeq     qz_p_done
        tst.l   %d5                     | slot A only
        jbne     qz_p_done
        tst.l   0x460d1684              | PLAYBACK page only
        jbne     qz_p_done
        move.l  0x16(%a3),%d1
        cmpi.l  #0x50544348,%d1         | "PTCH"
        jbne     qz_p_done
        move.l  %fp,%d1                 | delta
        jbeq     qz_p_done
        move.l  %d2,-(%sp)
        mvz.b   (0x59,%a0,%a1.l),%d2    | the step's lock before the store
        cmpi.l  #0xff,%d2
        jbne     qz_p_go                 | a lock: step from it
        move.l  %d3,-(%sp)              | none: from the Part's PTCH
        move.l  %d4,-(%sp)
        movea.l 0x46c82456,%a2
        mvz.b   0x100b14cf,%d2
        move.l  #6322,%d3
        muls.l  %d3,%d2
        adda.l  %d2,%a2                 | the Part
        adda.l  #0x8eda2,%a2            | its machine bytes
        mvz.b   0x100b14cc,%d4          | track
        mvz.b   (%a2,%d4.l),%d2         | machine
        move.l  %d2,%d3
        lsl.l   #3,%d3
        sub.l   %d2,%d3
        sub.l   %d2,%d3                 | machine * 6
        addq.l  #8,%a2                  | +0x8edaa: the PLAYBACK slots
        adda.l  %d3,%a2
        move.l  %d4,%d3
        lsl.l   #5,%d3
        sub.l   %d4,%d3
        sub.l   %d4,%d3                 | track * 30
        mvz.b   (%a2,%d3.l),%d2         | the Part's PTCH
        move.l  (%sp)+,%d4
        move.l  (%sp)+,%d3
qz_p_go:
        jbsr     qz_quant
        move.l  %d2,%d4                 | the value the store and the mirror take
        move.l  (%sp)+,%d2
qz_p_done:
        move.l  (%sp)+,%a2
        move.b  %d4,(0x59,%a0,%a1.l)    | displaced: the lock byte
        mvz.b   0x100b14cc,%d1          | displaced
        rts

| ---- qz_quant: d2 := d2 stepped |d1| degrees in the direction of d1 -------------
| SCALE is on (the mask comes from SCALE_AT), a3 = the descriptor (min at +0x6a, count at
| +0x9a for slot A). Each step goes to the next raw value on a semitone of the
| scale (raw = 64 + 5 * n; qz_pcraw maps raw - min to a pitch class); a value
| between degrees snaps to the nearest one in the turn direction; at the ends
| the value stays, which is the stock clamp. Preserves everything but d2.
qz_quant:
        move.l  %d0,-(%sp)
        move.l  %d1,-(%sp)
        move.l  %d3,-(%sp)
        move.l  %d4,-(%sp)
        move.l  %d5,-(%sp)
        move.l  %d6,-(%sp)
        move.l  %d7,-(%sp)
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        jsr     SCALE_AT                | d3 = the scale's pitch-class mask, rotated by ROOT (core.s)
        move.l  %d0,%d3
        move.l  0x6a(%a3),%d4           | d4 = the parameter's minimum (4; 0 on the synth page)
        move.l  0x9a(%a3),%d5
        add.l   %d4,%d5
        subq.l  #1,%d5                  | d5 = its maximum (124; 127 on the synth page)
        lea     qz_pcraw(%pc),%a0
        jbsr    qz_ui_synth             | a synth track: raw = 64 + semitones (qz_pcof)
        lea     qz_synthq(%pc),%a1
        move.b  %d0,(%a1)
        move.l  %d1,%d0                 | d0 = |delta| degrees to step
        jbpl     qz_k_loop
        neg.l   %d0
qz_k_loop:
        tst.l   %d1
        jbmi     qz_k_down
        jbsr     qz_k_up
        jbra     qz_k_next
qz_k_down:
        jbsr     qz_k_dn
qz_k_next:
        subq.l  #1,%d0
        jbne     qz_k_loop
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        move.l  (%sp)+,%d7
        move.l  (%sp)+,%d6
        move.l  (%sp)+,%d5
        move.l  (%sp)+,%d4
        move.l  (%sp)+,%d3
        move.l  (%sp)+,%d1
        move.l  (%sp)+,%d0
        rts

| d2 := the first raw above (qz_k_up) / below (qz_k_dn) d2 that sits on a
| semitone of the scale, within [d4, d5]; unchanged when there is none.
| d6/d7 scratch, a0 = qz_pcraw.
qz_k_up:
        move.l  %d2,%d6
qz_k_up1:
        addq.l  #1,%d6
        cmp.l   %d5,%d6
        jbgt     qz_k_ret
        jbsr    qz_pcof                 | pitch class, 0xff between semitones
        cmpi.l  #12,%d7
        jbcc     qz_k_up1
        btst    %d7,%d3
        jbeq     qz_k_up1
        move.l  %d6,%d2
qz_k_ret:
        rts
qz_k_dn:
        move.l  %d2,%d6
qz_k_dn1:
        subq.l  #1,%d6
        cmp.l   %d4,%d6
        jblt     qz_k_ret
        jbsr    qz_pcof
        cmpi.l  #12,%d7
        jbcc     qz_k_dn1
        btst    %d7,%d3
        jbeq     qz_k_dn1
        move.l  %d6,%d2
        rts

| qz_pcof: d7 := the pitch class of raw d6 (a0 = qz_pcraw, d4 = the minimum): a
| sample track looks raw - min up in qz_pcraw (0xff between semitones); a synth
| track (qz_synthq, set by qz_quant) computes (raw + 56) mod 12 = (raw - 64)
| mod 12, every raw a semitone. Preserves everything but d7.
qz_pcof:
        move.l  %d6,%d7
        sub.l   %d4,%d7
        tst.b   qz_synthq(%pc)
        jbeq    qz_pc_tab
        move.l  %d0,-(%sp)
        move.l  %d6,-(%sp)
        addi.l  #56,%d7
        move.l  %d7,%d6
        moveq   #12,%d0
        divu.l  %d0,%d6                 | q
        mulu.l  %d0,%d6                 | 12 q
        sub.l   %d6,%d7                 | pc
        move.l  (%sp)+,%d6
        move.l  (%sp)+,%d0
        rts
qz_pc_tab:
        mvz.b   (%a0,%d7.l),%d7
        rts

| ---- CHROMATIC trig mode: jsr planted at 0x4004fc58 (10 bytes) ----------------
| In 0x4004fb94 (track d2, key index a2 = 0..24 with 12 = C, TRIG 13),
| the press path is about to turn the index into the raw pitch (5 * idx + 4)
| that becomes the lock byte the voice is trigged with (0x46c7dfda + t*32),
| the PTCH lock of a held or live-recorded trig (0x40042158 with a2) and the
| box on the screen. With a scale on, transpose the index by ROOT (clamped at
| 24 = +12 st, the stock ceiling: a sample track's PTCH runs -12..+12) and
| snap it; the MIDI note the key sends out stays the key's own (d3, matched
| on release).
qz_chrom:
        jbsr    qz_is_synth             | a synth track (d2): raw = 64 + (key - 12) + 12 * octave
        jbne    qz_c_synth
        lea     qz_scale,%a0
        mvz.b   (%a0),%d0
        jbeq     qz_c_replay
        move.l  %d2,-(%sp)
        move.l  %d3,-(%sp)
        move.l  %d4,-(%sp)
        jsr     SCALE_AT                | the scale's mask, rotated by ROOT (core.s; clobbers a0, d0)
        move.l  %d0,%d3
        lea     qz_pc25(%pc),%a0
        move.l  %a2,%d2                 | the key index (key + 12 * stock's octave word: 0..15, or 12..24) ...
        mvz.b   NV_ROOT,%d1
        add.l   %d1,%d2                 | ... transposed by ROOT: key 1 sounds the root (28 Sep 2026)
        moveq   #6,%d4
        cmp.l   %d4,%d1                 | ROOT G..B (r > 6) in the OTHER position (the word 1, 13 keys): the
        jble    qz_c_top                | keyboard drops two octaves, r .. r+12 -> r-24 .. r-12 st, the octave
        tst.l   OCT_WORD                | below the default position's r-12 .. r; the bottom 12 - r keys clamp
        jbeq    qz_c_top                | at -12 st instead of the top r keys at +12 (the second pass, below)
        subi.l  #24,%d2
        jbpl    qz_c_top
        moveq   #0,%d2                  | below -12 st: the stock floor (index 0)
qz_c_top:
        moveq   #24,%d1
        cmp.l   %d1,%d2
        jble    qz_c_inrange
        move.l  %d1,%d2                 | past +12 st: the stock ceiling (index 24)
qz_c_inrange:
        moveq   #0,%d4                  | distance: 0, 1, 2 ... -- lower candidate first
qz_c_loop:
        move.l  %d2,%d1
        sub.l   %d4,%d1
        jbmi     qz_c_hi
        mvz.b   (%a0,%d1.l),%d0
        btst    %d0,%d3
        jbne     qz_c_found
qz_c_hi:
        move.l  %d2,%d1
        add.l   %d4,%d1
        cmpi.l  #24,%d1
        jbhi     qz_c_more
        mvz.b   (%a0,%d1.l),%d0
        btst    %d0,%d3
        jbne     qz_c_found
qz_c_more:
        addq.l  #1,%d4
        cmpi.l  #24,%d4
        jbls     qz_c_loop
        move.l  %d2,%d1                 | no degree at all: cannot happen (every mask has the root)
qz_c_found:
        move.l  %d1,%a2
        move.l  (%sp)+,%d4
        move.l  (%sp)+,%d3
        move.l  (%sp)+,%d2
qz_c_replay:
        lea     (4,%a2,%a2.l*4),%a2     | displaced: raw = 5 * idx + 4
        mvz.b   0x100b14cf,%d0          | displaced: the part
        rts

| The synth track's key: a2 = the physical key 0..15 (qz_keyidx keeps the stock
| word 0 on such a track; key 12 = [TRIG 13] = C at ROOT C), n = key - 12 + 12 *
| qz_oct (-60..+51) -- plus ROOT with a scale on, so key 1 sounds the root --
| snapped to the nearest degree of the ROOT-rotated SCALE mask by pitch class
| (lower first at each distance, the rule qz_c_loop and po_snap follow), raw =
| 64 + n. The lea is not replayed: a2 := raw.
qz_c_synth:
        move.l  %d3,-(%sp)
        move.l  %d4,-(%sp)
        move.l  %a2,%d1
        subi.l  #12,%d1                 | key - 12
        mvs.b   qz_oct,%d0              | the octave, -4..+4 (keys.s, pinned: the engine reads it too)
        moveq   #12,%d3
        muls.l  %d3,%d0
        add.l   %d0,%d1                 | n = key - 12 + 12 * octave, -60..+51
        lea     qz_scale,%a0
        tst.b   (%a0)
        jbeq    qz_cs_raw               | SCALE OFF: ROOT ignored, 2.8's raw
        mvz.b   NV_ROOT,%d0
        add.l   %d0,%d1                 | ... + ROOT: key 1 sounds the root (28 Sep 2026), -60..+62
        move.l  %d1,%d0
        addi.l  #120,%d0                | n + 120 >= 0
        move.l  %d0,%d4
        moveq   #12,%d3
        divu.l  %d3,%d4
        mulu.l  %d3,%d4
        sub.l   %d4,%d0                 | pc = (n + 120) mod 12
        move.l  %d0,%a1                 | a1 = pc
        jsr     SCALE_AT                | the scale's pitch-class mask rotated by ROOT (core.s; keeps d1 = n)
        move.l  %d0,%d3
        moveq   #0,%d4                  | distance 0, 1, 2 ...
qz_cs_loop:
        move.l  %a1,%d0
        sub.l   %d4,%d0                 | the lower candidate first
        jbpl    qz_cs_lo
        addi.l  #12,%d0
qz_cs_lo:
        btst    %d0,%d3
        jbne    qz_cs_down
        move.l  %a1,%d0
        add.l   %d4,%d0                 | then the upper
        cmpi.l  #12,%d0
        jblt    qz_cs_hi
        subi.l  #12,%d0
qz_cs_hi:
        btst    %d0,%d3
        jbne    qz_cs_up
        addq.l  #1,%d4
        cmpi.l  #6,%d4
        jble    qz_cs_loop
        jbra    qz_cs_raw               | no degree at all: cannot happen (every mask has the root)
qz_cs_down:
        sub.l   %d4,%d1
        jbra    qz_cs_raw
qz_cs_up:
        add.l   %d4,%d1
qz_cs_raw:
        addi.l  #64,%d1                 | raw = 64 + n: 4..126 with ROOT, and a snap moves at most 2 (every
        cmpi.l  #127,%d1                | mask has the root; the widest gap in qz_masks is 3): clamped to
        jble    qz_cs_hi_ok             | the synth page's 0..127 (ROOT B, octave +4, key 16 could pass it)
        moveq   #127,%d1
qz_cs_hi_ok:
        tst.l   %d1
        jbge    qz_cs_lo_ok
        moveq   #0,%d1
qz_cs_lo_ok:
        move.l  %d1,%a2
        move.l  (%sp)+,%d4
        move.l  (%sp)+,%d3
        mvz.b   0x100b14cf,%d0          | displaced: the part (the lea is replaced by the raw above)
        rts

| ---- the CHROMATIC octave on a synth track --------------------------------------
| Stock keeps ONE octave word for the keyboard, OCT_WORD, 0 or 1: FUNC + LEFT
| or RIGHT eor it (0x40045918), the key handler's caller adds 12 * word to the
| key (0x40050254) and the drawer picks the 16- or 13-key picture by it
| (0x40044968), prints it with "%d" (0x400449b8) and places the held-key marks
| with it (0x40044abe). On a synth track the octave is qz_oct instead, -4..+4:
| the stock word is held at 0 there (the key index stays the physical key,
| the marks land on the keys, the 16-key picture shows), qz_chrom adds the 12
| * qz_oct, and the number beside the keyboard is qz_oct. Sample tracks: the
| displaced instructions, byte for byte.

| 0x40050254, the key handler's caller: `movel OCT_WORD,%d0; movel %d0,%d1` (8
| bytes) -> jmp qz_keyidx; a0 = the key, d2 = press (pushed already); stock
| goes on at 0x4005025c with d1 = the word and computes 12 * d1.
qz_keyidx:
        jbsr    qz_ui_synth
        jbeq    qz_ki_stock
        moveq   #0,%d0                  | a synth track: the index is the key itself
        jbra    qz_ki_out
qz_ki_stock:
        move.l  OCT_WORD,%d0            | displaced
qz_ki_out:
        move.l  %d0,%d1                 | displaced
        jmp     0x4005025c

| 0x40045918, FUNC + LEFT / RIGHT in CHROMATIC mode: `moveq #1,%d2; eorl
| %d2,OCT_WORD` (8 bytes) -> jmp qz_octkey. The key code is the handler's
| first argument, 8(%sp) (d2 is pushed at its entry): 0x34 = LEFT, 0x21 =
| RIGHT (PANEL.md: key code = row * 8 + bit). Stock goes on at 0x40045920
| (the redraw); d2 is dead (popped at the return).
qz_octkey:
        jbsr    qz_ui_synth
        jbeq    qz_ok_stock
        lea     qz_oct,%a0              | (keys.s, pinned)
        mvs.b   (%a0),%d0
        move.l  8(%sp),%d2              | the key code
        cmpi.l  #0x34,%d2
        jbeq    qz_ok_down
        addq.l  #1,%d0                  | RIGHT: up, at most +4
        cmpi.l  #4,%d0
        jble    qz_ok_store
        moveq   #4,%d0
        jbra    qz_ok_store
qz_ok_down:
        subq.l  #1,%d0                  | LEFT: down, at least -4
        cmpi.l  #-4,%d0
        jbge    qz_ok_store
        moveq   #-4,%d0
qz_ok_store:
        move.b  %d0,(%a0)
        clr.l   OCT_WORD                | the stock word reads 0 on a synth track
        jmp     0x40045920
qz_ok_stock:
        moveq   #1,%d2                  | displaced
        eor.l   %d2,OCT_WORD            | displaced
        jmp     0x40045920

| 0x40044968, the CHROMATIC drawer's picture choice: `moveq #1,%d1; cmpl
| OCT_WORD,%d1` (8 bytes) -> jmp qz_octdraw; stock's `bne` at 0x40044970 reads
| the compare's flags. On a synth track the word is set to 0 first, so this
| draw -- the picture, the number, the marks -- sees octave 0 (the word may
| hold 1 from a sample track; the keys of a synth track ignore it anyway).
qz_octdraw:
        jbsr    qz_ui_synth
        jbeq    qz_od_cmp
        clr.l   OCT_WORD
qz_od_cmp:
        moveq   #1,%d1                  | displaced
        cmp.l   OCT_WORD,%d1            | displaced
        jmp     0x40044970

| 0x400449b8, the number beside the keyboard: `movel OCT_WORD,%d0; movel
| %d0,%sp@-` (8 bytes) -> jmp qz_octnum; the value is printed by stock's own
| "%d" (0x400b465d) at 0x400449c0 -- the formatter 0x40013904 takes (ctx,
| font, x 0x44, y 9, 1, 0, buf 0x400b527d, fmt, value) and 0x400449ec pops
| the nine -- so a synth track's -4..+4 prints as is. With a scale on (28 Sep
| 2026) the format is this unit's qz_ofmt, ROOT's name + " %d" ("A %d"), pushed
| in place of stock's, the continuation at 0x400449c6: same nine arguments.
qz_octnum:
        tst.l   0x80000012              | MIDI: stock already loaded its octave into d0
        jbne    qz_on_stockfmt           | never resolve the corresponding audio track or its scale
        jbsr    qz_ui_synth
        jbeq    qz_on_stock
        mvs.b   qz_oct,%d0              | the synth track's octave (keys.s, pinned)
        jbra    qz_on_out
qz_on_stock:
        move.l  OCT_WORD,%d0            | displaced: a sample track's position, 0 or 1
        jbeq    qz_on_out               | the default position: 0
        lea     qz_scale,%a0
        tst.b   (%a0)
        jbeq    qz_on_out               | SCALE OFF: stock's 1
        mvz.b   NV_ROOT,%d1
        subq.l  #7,%d1
        jbmi    qz_on_out               | ROOT C..F#: the other position is the octave above, 1
        moveq   #-1,%d0                 | ROOT G..B: it is the octave below (qz_chrom drops the keyboard): -1
qz_on_out:
        move.l  %d0,-(%sp)              | displaced: the number
        lea     qz_scale,%a0
        tst.b   (%a0)
        jbeq    qz_on_fmt               | SCALE OFF: stock's "%d" (ROOT ignored)
        lea     qz_ofmt(%pc),%a0        | ROOT's name, then " %d": "A -1" where stock printed "-1"
        mvz.b   NV_ROOT,%d0             | (d0 / d1 / a0 / a1 are C scratch at the site: the call follows)
        lea     qz_rootnames(%pc),%a1
        movea.l (%a1,%d0.l*4),%a1
qz_on_copy:
        mvz.b   (%a1)+,%d1
        jbeq    qz_on_copied
        move.b  %d1,(%a0)+
        jbra    qz_on_copy
qz_on_copied:
        move.b  #32,(%a0)+              | ' '
        move.b  #37,(%a0)+              | '%'
        move.b  #100,(%a0)+             | 'd'
        clr.b   (%a0)
        pea     qz_ofmt(%pc)            | the format, in place of stock's pea "%d" at 0x400449c0
        jmp     0x400449c6
qz_on_stockfmt:
        move.l  %d0,-(%sp)              | common MIDI/audio push: never bypassed by stock's MIDI branch
qz_on_fmt:
        pea     0x400b465d              | displaced stock "%d" format
        jmp     0x400449c6

| ---- GLIDE legato: two jmp detours in the same handler --------------------------
| 0x4004fb94 keeps ONE held key per track (HELD + track = key + 1). Stock, a
| press while a key is held first ends that key -- 0x4004fbfe..0x4004fc40: the
| voice note-off (mailbox 0x46c80354[track] |= 0x40, which the frame builder
| turns into the AMP release, 0x4000b4e4), the MIDI note-off (key + 71) and
| held := 0 -- and then starts a new voice (0x4004fcb2: 0x40005030, cmd 0x1d,
| bit 2 = start); a release of a key that is not the held one does nothing
| (0x4004fbe6). With FUNC held (FUNC_HELD) stock skips the note-off and posts
| a TRIGLESS trig instead (0x4004fc9c: mailbox |= 0x119, no bit 2: the staged
| PTCH lock 0x46c7dfda + track*32 is applied at the next frame, 0x4000b75c,
| and the voice is not restarted -- 0x4000b5a8 starts one only on bit 2).
|
| THE LEG GATE (2 Oct 2026): what a press while a key is held does is the
| track's LEG setting (the AMP SETUP page's sixth box, a Part byte: OFF /
| MONO / POLY on a synth track, OFF / MONO on a sample track since 3 Oct
| 2026, modules/synth/poly.s po_legmode), read through the
| engine's pointer block (qz_legmode: -24 of sy_render) -- 0 stock (a sample
| track with LEG OFF, or a synth track at VOIC 1 with LEG OFF: the held note
| ends, the new one starts), 1 mono legato (VOIC 1, LEG MONO or POLY; a sample
| track with LEG MONO, the 2.6 legato -- the engine's rule: the trigless path
| without FUNC -- the old key's MIDI note-off goes out as stock, the voice
| note-off does not, and the NEW key becomes the held key: releasing the
| first key does nothing, releasing the last one releases the note as
| stock), 2 paraphonic (VOIC 2..4, LEG OFF or MONO: the keys are polyphonic,
| "Paraphonic keys" below), 3 paraphonic legato (VOIC 2..4, LEG POLY: the key
| joins the held set, the engine is told through po_legkey (-28) and the
| trigless path follows -- the sounding chord slides to the key, no
| retrigger; recorded as a trigless trig). GLIDE is the slide TIME only now,
| on every track (until 2 Oct 2026 GLIDE != 0 was the legato switch, on any
| track; until 3 Oct 2026 still on a sample track). FUNC
| held, a release, or nothing held: stock, byte for byte.

| 0x4004fbfe: `tstl 0x46c7dd26; bnes 0x4004fc44` (8 bytes) -> jmp qz_leg1.
| d1 = the held key + 1 (nonzero here), d2 = track, d3 = the new key + 1
| (0 on a release); d0/a0 are free (reloaded by the stock code that follows).
qz_leg1:
        tst.l   FUNC_HELD
        jbne     qz_g1_skip              | FUNC held: stock skips the note-off block
        tst.l   %d3
        jbeq     qz_g1_stock             | a release: stock
        mvs.b   0x8000004c,%d0
        btst    #0,%d0
        jbeq     qz_g1_stock             | audio-track trigs off: stock
        jbsr    qz_legmode              | the LEG gate: 0 stock, 1 mono legato, 2 / 3 paraphonic
        jbeq    qz_g1_end               | 0: the held key's note ends here (a synth track: its HOLD lock)
        subq.l  #1,%d0
        jbne    qz_g1_skip              | paraphonic: no note-off at all (a key's comes with its release)
        moveq   #71,%d0                 | mono legato: the old key's MIDI note-off, as stock's 0x4004fc24
        add.l   %d1,%d0                 | (the held key + 1 + 71)
        jbsr    qz_noteoff
qz_g1_skip:
        jmp     0x4004fc44              | no voice note-off; the held key stays for qz_leg2
qz_g1_end:
        jbsr    qz_is_synth             | stock (the note-off, then a fresh trig) -- a synth track's held
        jbeq    qz_g1_stock             | key's note ends here: its length becomes its step's HOLD lock
        move.l  %d1,%d0
        subq.l  #1,%d0
        jbsr    qz_holdrel
qz_g1_stock:
        jmp     0x4004fc06

| qz_legmode: d0 := the LEG gate for track d2 (the engine's po_legmode, through
| the pointer block; 0 without the engine); flags from d0; preserves the rest.
qz_legmode:
        movea.l qz_clock,%a0            | the engine is there (its clock's address, published at its first frame)?
        move.l  %a0,%d0
        jbeq    qz_lm_ret
        movea.l KIND_FLEX,%a0
        movea.l -24(%a0),%a0
        jmp     (%a0)                   | po_legmode returns to our caller
qz_lm_ret:
        rts

| 0x4004fc94: `tstl 0x46c7dd26; beqs 0x4004fcb2` (8 bytes) -> jmp qz_leg2.
| d2 = track, d3 = the new key + 1; the pitch is staged (0x4004fc84..fc90).
| The legato press posts stock's own trigless word through 0x4004fc9c
| (`mailbox |= 0x119`). Measured 24 Sep 2026: that word does not restart the
| voice or the AMP envelope (a 64-step attack does not recur), but every
| trig word -- this one, FUNC + key, a fresh note -- is followed by the same
| 2.3 dB / 200 ms level step on the synth voice; posting 0x111 (mailbox bit
| 3 dropped: frame flag 0x20, 0x4000b5fc, event-byte bit 3, 0x4000c662)
| changed nothing about it, so the stock word is kept.
qz_leg2:
        lea     qz_legato(%pc),%a0
        clr.b   (%a0)                   | this press is not a legato one until decided below
        clr.l   qz_chain-qz_legato(%a0) | ... nor a continuation of a held note's chain
        tst.l   FUNC_HELD
        jbeq    qz_g2_nofunc
        jbsr    qz_chain_of             | FUNC held: the stock trigless trig continues the held note
        jbra    qz_g2_trigless
qz_g2_nofunc:
        jbsr    qz_legmode              | the LEG gate
        jbeq    qz_g2_trig              | 0: a fresh note, the stock trig
        subq.l  #1,%d0
        jbeq    qz_g2_mono              | 1: mono legato
        move.l  %d0,%d4                 | 1 = paraphonic, 2 = paraphonic legato
        lea     qz_pmask,%a0            | paraphonic: the key joins the held set ...
        move.l  %d3,%d0
        subq.l  #1,%d0
        move.l  (%a0,%d2.l*4),%d1
        bset    %d0,%d1
        move.l  %d1,(%a0,%d2.l*4)
        bclr    %d0,%d1
        tst.l   %d1                     | ... other keys held?
        jbeq    qz_g2_para              | none: a fresh voice (the first key)
        subq.l  #2,%d4
        jbne    qz_g2_para              | no legato: a fresh voice
        movea.l KIND_FLEX,%a0           | paraphonic legato: the engine's po_legkey (-28) -- the sounding
        movea.l -28(%a0),%a0            | chord follows this key (the flag before the trig it waits for)
        move.l  %d3,%d0
        jsr     (%a0)
        lea     qz_legato(%pc),%a0
        move.b  %d3,(%a0)               | ... recorded as trigless (qz_leg3)
        jbra    qz_g2_trigless
qz_g2_para:
        jbra    qz_g2_trig              | a fresh voice: the stock trig, the key posted for the engine below
qz_g2_mono:
        lea     HELD,%a0
        tst.b   (%a0,%d2.l)             | a key still held on this track (qz_leg1 kept it)?
        jbeq    qz_g2_trig              | no: a fresh note, the stock trig
        jbsr    qz_chain_of             | legato: the new step continues the held note's chain
        lea     HELD,%a0
        move.b  %d3,(%a0,%d2.l)         | legato: the new key is the held key
        lea     qz_legato(%pc),%a0
        move.b  %d3,(%a0)               | ... and the live recorder records it as trigless (qz_leg3)
qz_g2_trigless:
        jmp     0x4004fc9c
qz_g2_trig:
        lea     qz_pkey,%a0             | the engine is told which key this trig is (index + 1) on EVERY
        move.b  %d3,(%a0,%d2.l)         | fresh-note trig (BUILD 28: the mono voice's sy_cold reads it as its
        jmp     0x4004fcb2              | condition (d) -- a live key, not a sequencer trig -- and clears it at
                                        | the START; po_start does the same for a paraphonic voice, a sample
                                        | track's START clears it in sy_no; before, only the paraphonic path posted it)

| 0x4004fce0: `tstl 0x46c7dd26; beqs 0x4004fcf8` (8 bytes) -> jmp qz_leg3. The
| same press, a few instructions on, is handed to the LIVE RECORDER (the
| block 0x4004fcd8..0x4004fd24 runs while 0x460d172a is set: live recording,
| or a trig held): stock records a TRIGLESS trig (0x4004271c) when FUNC is
| held and a sample trig (0x40042d1c) otherwise, then the PTCH lock on the
| step it returns (0x40042158 with a2). Without this hook a legato press --
| played trigless by qz_leg2 -- was recorded as a sample trig, so playback
| restarted the note (the user's report, OCTATRICK6). The legato press takes
| the trigless branch, exactly what FUNC + key records; everything else is
| stock (qz_legato is set only on the legato path, cleared at every press).
qz_leg3:
        tst.l   FUNC_HELD
        jbne    qz_g3_trigless
        lea     qz_legato(%pc),%a0
        tst.b   (%a0)
        jbne    qz_g3_trigless
        jbsr    qz_is_synth             | a synth track's key, the engine there (qz_clock): does the
        jbeq    qz_g3_sample            | key JOIN the chord being recorded? (fingered chords, 26 Sep
        movea.l qz_clock,%a0            | 2026: po_keyrec with d0 = -1, through the pointer block)
        move.l  %a0,%d0
        jbeq    qz_g3_sample
        movea.l KIND_FLEX,%a0
        movea.l -12(%a0),%a0
        moveq   #-1,%d0
        jsr     (%a0)                   | d0 := 1 when it joined (the chord's step has its locks)
        tst.l   %d0
        jbne    qz_g3_joined
qz_g3_sample:
        jmp     0x4004fcf8              | records a sample trig
qz_g3_trigless:
        jmp     0x4004fce8              | records a trigless trig
qz_g3_joined:
        jmp     0x4004fd3e              | a joined key: no trig of its own, no PTCH / HOLD lock (the chord's step has them)

| ---- the note length (OCTATRICK7 report: a recorded note droned for the AMP HOLD) --
| 0x4004fd06, after the recorder returned: `addql #8,%sp; tstl %d0; blts
| 0x4004fd3e` (6 bytes) -> jmp qz_leg4. d0 = the step the press was recorded on
| (-1 = none), d2 = track, d3 = the key + 1, a2 = the raw pitch. On a synth track
| the press is noted -- key, step, the engine's tick count (po_clock through
| qz_clock, 0 until the engine has run) -- in one of the track's four slots;
| at the key's release (qz_leg0, every key), or when a legato press ends the
| previous note (qz_leg2), qz_holdrel turns the elapsed ticks into the HOLD
| parameter's own units (steps, 1/128 .. 128 through qz_hold128, the smallest
| value that is not shorter: a tap is never silent) and writes it as the
| step's HOLD lock through the stock writer (flat slot 13), which itself
| refuses once live recording has stopped. Non-synth tracks: untouched.
qz_leg4:
        addq.l  #8,%sp                  | displaced
        tst.l   %d0                     | displaced
        jbmi    qz_g4_none              | displaced: no step recorded
        move.l  %d0,-(%sp)
        jbsr    qz_is_synth
        jbeq    qz_g4_out
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d1,-(%sp)
        move.l  %d4,-(%sp)
        movea.l qz_clock,%a1
        move.l  %a1,%d0
        jbeq    qz_g4_res               | the engine has not run: nothing to time
        jbsr    qz_slot_find            | a0 = the track's slot for key d3 - 1 (reused) or a free one
        move.l  16(%sp),%d0             | the step
        move.b  %d0,1(%a0)
        move.b  %d0,qz_step             | ... and for qz_leg5 (the fingered chord)
        move.l  %d3,%d0
        subq.l  #1,%d0
        move.b  %d0,(%a0)
        move.b  #1,2(%a0)               | in use
        move.l  (%a1),4(%a0)            | the tick count at the press ...
        lea     qz_chain(%pc),%a1
        move.l  (%a1),%d0
        jbeq    qz_g4_res
        move.l  %d0,4(%a0)              | ... or the chain's start for a legato / FUNC press
qz_g4_res:
        move.l  (%sp)+,%d4
        move.l  (%sp)+,%d1
        movea.l (%sp)+,%a1
        movea.l (%sp)+,%a0
qz_g4_out:
        move.l  (%sp)+,%d0
        jmp     0x4004fd0c              | the PTCH lock, as stock
qz_g4_none:
        jmp     0x4004fd3e

| ---- fingered chords (26 Sep 2026): 0x4004fd20, right after the recorder's PTCH
| lock write for the key: `lea %sp@(20),%sp; bras 0x4004fd3e` (6 bytes) -> jmp
| qz_leg5. d2 = track, d3 = the key + 1, a2 = the raw pitch (callee-saved
| across the writer), the step in qz_step (qz_leg4). On a synth track, once
| the engine has run (qz_clock: the synth module is there), the engine's
| po_keyrec (modules/synth/poly.s, reached through the pointer it publishes
| 12 bytes before sy_render, whose address the kind table's FLEX entry
| holds) sees the key: with VOIC 2..4 and CHRD "----" it recognises the
| chord of the keys held together and writes the step's PTCH (the lowest
| key), CHRD and VOIC locks through the stock writer -- the recognition and
| the writes live in DRAM; this ROM unit only passes the key on. d0/d1/a0/a1
| are C scratch here (the writer just clobbered them).
qz_leg5:
        lea     20(%sp),%sp             | displaced
        jbsr    qz_is_synth
        jbeq    qz_g5_out
        movea.l qz_clock,%a0
        move.l  %a0,%d0
        jbeq    qz_g5_out               | the engine has not run: no chords to record
        movea.l KIND_FLEX,%a0
        movea.l -12(%a0),%a0            | po_keyrec
        mvz.b   qz_step,%d0             | the step the press was recorded on
        jsr     (%a0)
qz_g5_out:
        jmp     0x4004fd3e

| qz_slot_find: a0 := track d2's slot for key index d0 (in use), else a free one,
| else slot 0. Slots: 8 bytes -- key, step, in-use, pad, the tick count.
qz_slot_find:
        lea     qz_press(%pc),%a0
        move.l  %d2,%d1
        lsl.l   #5,%d1
        add.l   %d1,%a0                 | the track's four
        move.l  %a0,-(%sp)              | slot 0, the fallback
        moveq   #3,%d1
qz_sf_key:                              | the key's own slot first (a repeat)
        tst.b   2(%a0)
        jbeq    qz_sf_key1
        cmp.b   (%a0),%d0
        jbeq    qz_sf_take
qz_sf_key1:
        addq.l  #8,%a0
        subq.l  #1,%d1
        jbpl    qz_sf_key
        movea.l (%sp),%a0
        moveq   #3,%d1
qz_sf_free:                             | else the first free one
        tst.b   2(%a0)
        jbeq    qz_sf_take
        addq.l  #8,%a0
        subq.l  #1,%d1
        jbpl    qz_sf_free
        movea.l (%sp),%a0               | none free: slot 0
qz_sf_take:
        addq.l  #4,%sp
        rts

| qz_holdrel: key index d0 on track d2 was released (or ended by a legato press):
| its slot's elapsed ticks -> the HOLD lock on its step, the slot freed. Preserves
| everything but d0 (C scratch d1/a0/a1 saved around the writer).
qz_holdrel:
        lea     -20(%sp),%sp
        movem.l %d1/%d3/%d4/%a0/%a1,(%sp)
        movea.l qz_clock,%a1
        move.l  %a1,%d1
        jbeq    qz_hr_out
        lea     qz_press(%pc),%a0
        move.l  %d2,%d1
        lsl.l   #5,%d1
        add.l   %d1,%a0                 | the track's four
        move.l  %a1,-(%sp)              | (a1 = the clock: kept)
        movea.l KIND_FLEX,%a1           | the engine's po_keyrel (26 Sep 2026, the hand-over rule): a joined
        movea.l -20(%a1),%a1            | key whose partner goes up within 50 ms gets its own trig and
        jsr     (%a1)                   | a slot among the four (d0 = the key, a0 = the four: both kept)
        movea.l (%sp)+,%a1
        moveq   #3,%d1
qz_hr_find:
        tst.b   2(%a0)
        jbeq    qz_hr_next
        cmp.b   (%a0),%d0
        jbeq    qz_hr_found
qz_hr_next:
        addq.l  #8,%a0
        subq.l  #1,%d1
        jbpl    qz_hr_find
        jbra    qz_hr_out               | no note of that key was recorded
qz_hr_found:
        clr.b   2(%a0)                  | freed
        move.l  (%a1),%d0
        sub.l   4(%a0),%d0              | elapsed ticks
        lsl.l   #7,%d0                  | * 128
        move.l  4(%a1),%d1              | ticks a step
        jbne    qz_hr_tps
        moveq   #6,%d1                  | (1x, not yet measured)
qz_hr_tps:
        divu.l  %d1,%d0                 | the length in 1/128 steps
        movea.l KIND_FLEX,%a1           | the HOLD table: the engine's po_hold128 (one copy since 26 Sep 2026;
        movea.l -8(%a1),%a1             | qz_clock above says the engine is there)
        moveq   #0,%d1
qz_hr_raw:
        mvz.w   (%a1,%d1.l*2),%d3
        cmp.l   %d0,%d3                 | the first entry that is not shorter
        jbcc    qz_hr_write
        addq.l  #1,%d1
        cmpi.l  #126,%d1
        jble    qz_hr_raw
qz_hr_write:
        mvz.b   1(%a0),%d0              | the step
        pea     REC_CTX
        move.l  %d0,-(%sp)
        move.l  %d1,-(%sp)              | HOLD raw
        pea     FLAT_HOLD
        move.l  %d2,-(%sp)
        jsr     LOCK_WRITE
        lea     20(%sp),%sp
qz_hr_out:
        movem.l (%sp),%d1/%d3/%d4/%a0/%a1
        lea     20(%sp),%sp
        rts

| qz_chain_of: the press in flight continues the held key's note: qz_chain := that
| key's slot's tick count (the chain's start), which qz_leg4 gives the new step
| instead of now -- the DSP's HOLD runs from the voice START, and a trigless
| step's HOLD lock re-lengthens it from there, so every step of a legato chain
| must carry the chain's whole length. Preserves everything but d0.
qz_chain_of:
        lea     -12(%sp),%sp
        movem.l %d1/%a0/%a1,(%sp)
        lea     HELD,%a0
        mvz.b   (%a0,%d2.l),%d0
        jbeq    qz_co_out
        subq.l  #1,%d0                  | the held key
        lea     qz_press(%pc),%a0
        move.l  %d2,%d1
        lsl.l   #5,%d1
        add.l   %d1,%a0
        moveq   #3,%d1
qz_co_find:
        tst.b   2(%a0)
        jbeq    qz_co_next
        cmp.b   (%a0),%d0
        jbeq    qz_co_found
qz_co_next:
        addq.l  #8,%a0
        subq.l  #1,%d1
        jbpl    qz_co_find
        jbra    qz_co_out
qz_co_found:
        move.l  4(%a0),%d0
        lea     qz_chain(%pc),%a1
        move.l  %d0,(%a1)
qz_co_out:
        movem.l (%sp),%d1/%a0/%a1
        lea     12(%sp),%sp
        rts

| qz_holdall: the note (chain) on track d2 ends now: every in-use slot's step gets
| its length as HOLD (all from the chain's start), the slots freed. Preserves
| everything but d0.
qz_holdall:
        lea     -8(%sp),%sp
        movem.l %d1/%a0,(%sp)
        lea     qz_press(%pc),%a0
        move.l  %d2,%d1
        lsl.l   #5,%d1
        add.l   %d1,%a0
        moveq   #3,%d1
qz_ha_loop:
        tst.b   2(%a0)
        jbeq    qz_ha_next
        move.l  %d1,-(%sp)
        move.l  %a0,-(%sp)
        mvz.b   (%a0),%d0
        jbsr    qz_holdrel              | (finds the same slot by its key, writes, frees)
        movea.l (%sp)+,%a0
        move.l  (%sp)+,%d1
qz_ha_next:
        addq.l  #8,%a0
        subq.l  #1,%d1
        jbpl    qz_ha_loop
        movem.l (%sp),%d1/%a0
        lea     8(%sp),%sp
        rts

| 0x4004fbde, the release path: `mvzb %a0@(0,%d2:l),%d1; movel %a2,%d0` (6
| bytes) -> jmp qz_leg0. a0 = HELD, d2 = track, a2 = the key index; stock
| goes on at 0x4004fbe4 with d0 = the index and d1 = the held key + 1, and
| returns at once unless they match. On a paraphonic synth track the mask
| decides: the key leaves qz_pmask (the engine releases its voices); with keys
| still held the key's MIDI note-off goes out and nothing else happens (HELD
| stays, whichever key it names, so the next release still gets here); the
| LAST key makes itself the held key first, so stock's note-off block runs --
| the voice note-off (the AMP release), the MIDI note-off, HELD := 0. d4 is
| free here (set before every use in the handler).
qz_leg0:
        mvz.b   (%a0,%d2.l),%d1         | displaced
        move.l  %a2,%d0                 | displaced
        jbsr    qz_is_synth
        jbeq    qz_g0_stock
        jbsr    qz_polytrack
        jbne    qz_g0_para
        cmp.l   %a2,%d1                 | VOIC 1: the held key's release ends the note (and its legato
        subq.l  #1,%d1                  | chain) -- every step of it gets the chain's length as HOLD;
        cmp.l   %a2,%d1                 | another key's release ends nothing (the 303 rule)
        jbne    qz_g0_stock
        jbsr    qz_holdall
        jbra    qz_g0_stock
qz_g0_para:
        move.l  %a2,%d0
        jbsr    qz_holdrel              | paraphonic: the released key's own note length -> its step's HOLD
        lea     qz_pmask,%a0
        move.l  (%a0,%d2.l*4),%d0       | the held keys
        move.l  %a2,%d4
        btst    %d4,%d0
        jbeq    qz_g0_stock             | a key never seen pressed (VOIC was 1 then): stock
        bclr    %d4,%d0
        move.l  %d0,(%a0,%d2.l*4)
        jbne    qz_g0_more
        lea     HELD,%a0                | the last key: HELD := it, and stock ends the note
        addq.l  #1,%d4
        move.b  %d4,(%a0,%d2.l)
qz_g0_stock:
        lea     HELD,%a0
        mvz.b   (%a0,%d2.l),%d1         | as displaced
        move.l  %a2,%d0
        jmp     0x4004fbe4
qz_g0_more:
        moveq   #72,%d0                 | this key's MIDI note-off (stock's form, 0x4004fc24)
        add.l   %a2,%d0
        jbsr    qz_noteoff
        jmp     0x4004fd68              | done: no voice note-off, the other keys sound on

| qz_noteoff: track d2's MIDI note-off for note d0, stock's form (0x4004fc24:
| MIDI_NOTE(track, note, 0)). Clobbers d0, d1, a0, a1 (C scratch).
qz_noteoff:
        clr.l   -(%sp)
        move.l  %d0,-(%sp)
        move.l  %d2,-(%sp)
        jsr     MIDI_NOTE
        lea     12(%sp),%sp
        rts

| ---- the SEQUENCER window ------------------------------------------------------
| Its draw loop (0x40065b14) draws min(visible, count) rows but indexes the
| label / getter tables from 0, so a fourth row could never scroll into
| view: with the count grown to 6 (manifest poke; SCALE, ROOT, GLIDE) and 3
| visible, start the index at the list's scroll offset instead. jmp planted
| at 0x40065bca.
qz_draw:
        move.l  0x460e43d8,%d2          | the list state's scroll offset
        lsl.l   #2,%d2                  | -> byte index into the pointer tables
        lea     32(%sp),%sp             | displaced
        jmp     0x40065bd0

| The fourth, fifth and sixth rows' (SCALE, ROOT, GLIDE) getters and setters,
| reached through the grown tables (labels 0x400b27d0, getters 0x400b27dc,
| setters 0x400b282c). A getter
| returns the value's string (C scratch d0/d1/a0/a1). A setter is jumped to
| with (delta, wrap) at 4(%sp) / 8(%sp) exactly like CHAIN AFTER's 0x400659ec:
| the LEVEL knob passes its detents (x7 with FUNC) and wrap = 0, [YES] passes
| (1, 1); qz_set_any takes the byte in a0 and its maximum in d1.
qz_get:
        lea     qz_scale,%a0
        mvz.b   (%a0),%d0
        lea     qz_names(%pc),%a0
        move.l  (%a0,%d0.l*4),%d0
        rts
qz_get_glide:                           | "OFF", or the number printed into qz_gbuf
        jbsr     qz_glide_of             | (d2 is the draw loop's index, not a track: ignored)
        tst.l   %d0
        jbne     qz_gg_num
        lea     qz_n0(%pc),%a0
        move.l  %a0,%d0
        rts
qz_gg_num:
        move.l  %d0,-(%sp)
        pea     FMT_D
        pea     qz_gbuf(%pc)
        jsr     SPRINTF
        lea     12(%sp),%sp
        lea     qz_gbuf(%pc),%a0
        move.l  %a0,%d0
        rts
qz_get_root:                            | "C" .. "B"
        mvz.b   NV_ROOT,%d0
        lea     qz_rootnames(%pc),%a0
        move.l  (%a0,%d0.l*4),%d0
        rts
qz_set:
        lea     qz_scale,%a0
        moveq   #24,%d1
        jbra     qz_set_any
qz_set_root:
        lea     qz_root,%a0
        moveq   #11,%d1
        jbra     qz_set_any
qz_set_glide:
        lea     qz_glide,%a0
        moveq   #127,%d1
qz_set_any:
        mvz.b   (%a0),%d0
        add.l   4(%sp),%d0
        tst.l   8(%sp)
        jbeq     qz_s_clamp
        cmp.l   %d1,%d0                 | wrap: past the maximum -> OFF, before OFF -> the maximum
        jbgt     qz_s_zero
        tst.l   %d0
        jbge     qz_s_store
        move.l  %d1,%d0
        jbra     qz_s_store
qz_s_clamp:
        cmp.l   %d1,%d0
        jble     qz_s_low
        move.l  %d1,%d0
qz_s_low:
        tst.l   %d0
        jbge     qz_s_store
qz_s_zero:
        moveq   #0,%d0
qz_s_store:
        move.b  %d0,(%a0)
        rts

| ---- the project file ------------------------------------------------------------
| The loader 0x400866c4 reads project.work line by line; a line starting
| with '#' is skipped at 0x400867a2 before any key is compared, on stock
| firmware too. Ours: "#SEQUENCER_SCALE=n", "#SEQUENCER_ROOT=n" (28 Sep 2026)
| and "#SYNTH_GLIDE=n". Entry (jmp at
| 0x400866cc): a storing pass (second argument != 0) starts from OFF, so a
| project saved without the lines loads as OFF. Line (jmp at 0x400867a2):
| d3 = the line; d0/d1 must hold its first character when stock continues at
| 0x400867aa.
qz_ld_entry:
        move.l  1472(%sp),%d6           | displaced
        move.l  1476(%sp),%d0           | displaced
        jbeq     qz_e_back               | parse-only pass: leave the settings
        lea     qz_scale,%a0
        clr.b   (%a0)
        lea     qz_glide,%a0
        clr.b   (%a0)
        lea     qz_root,%a0
        clr.b   (%a0)
qz_e_back:
        jmp     0x400866d4

qz_ld_line:
        move.b  1167(%sp),%d1           | displaced: the line's first character
        mvs.b   %d1,%d0                 | displaced
        moveq   #35,%d5                 | displaced: '#'
        cmp.l   %d0,%d5
        jbne     qz_l_back
        move.l  %d3,%a0
        lea     qz_key(%pc),%a1
        jbsr     qz_l_cmp
        jbeq     qz_l_scale
        move.l  %d3,%a0
        lea     qz_key2(%pc),%a1
        jbsr     qz_l_cmp
        jbeq     qz_l_glide
        move.l  %d3,%a0
        lea     qz_key3(%pc),%a1
        jbsr     qz_l_cmp
        jbeq     qz_l_root
        moveq   #35,%d5                 | another comment: stock skips it
        mvs.b   %d1,%d0
qz_l_back:
        jmp     0x400867aa
qz_l_cmp:                               | Z := the line at a0 starts with the key at a1 (a0 past it)
        mvz.b   (%a1)+,%d0
        jbeq     qz_l_c_ret
        mvz.b   (%a0)+,%d5
        cmp.l   %d0,%d5
        jbeq     qz_l_cmp
qz_l_c_ret:
        rts
qz_l_scale:
        jbsr     qz_l_dec
        cmpi.l  #24,%d0
        jbls     qz_l_ok
        moveq   #0,%d0                  | out of range: OFF
qz_l_ok:
        lea     qz_scale,%a0
        jbra     qz_l_store
qz_l_glide:
        jbsr     qz_l_dec
        cmpi.l  #127,%d0
        jbls     qz_l_gok
        moveq   #0,%d0
qz_l_gok:
        lea     qz_glide,%a0
        jbra    qz_l_store
qz_l_root:
        jbsr     qz_l_dec
        cmpi.l  #11,%d0
        jbls     qz_l_rok
        moveq   #0,%d0                  | out of range: C
qz_l_rok:
        lea     qz_root,%a0
qz_l_store:
        tst.l   58(%sp)                 | parse-only pass: nothing is stored
        jbne     qz_l_next
        move.b  %d0,(%a0)
qz_l_next:
        jmp     0x40088224              | the loop's next line
qz_l_dec:                               | d0 := the decimal at a0 (after the '=')
        moveq   #0,%d0
        moveq   #10,%d5
qz_l_dig:
        mvz.b   (%a0)+,%d1
        subi.l  #48,%d1
        cmpi.l  #9,%d1
        jbhi     qz_l_d_ret
        mulu.l  %d5,%d0
        add.l   %d1,%d0
        jbra     qz_l_dig
qz_l_d_ret:
        rts

| The writer 0x40088882.. prints one "KEY=%d\r\n" per setting: a4 = sprintf
| (buffer d2, format, value), a3 = strlen, a2 = write (file d3). jmp planted
| at 0x400888aa, the start of PATTERN_CHANGE_AUTO_SILENCE_TRACKS's line, so
| ours follow PATTERN_CHANGE_CHAIN_BEHAVIOR. A failed write is not checked
| here; the stock line that follows checks its own.
qz_wr:
        lea     qz_scale,%a0
        mvz.b   (%a0),%d0
        lea     qz_fmt(%pc),%a0
        jbsr     qz_wr_line
        mvz.b   NV_ROOT,%d0
        lea     qz_fmt3(%pc),%a0
        jbsr     qz_wr_line
        jbsr     qz_glide_of             | (d2 = the writer's buffer, not a track: the accessor ignores it)
        lea     qz_fmt2(%pc),%a0
        jbsr     qz_wr_line
        mvs.b   0x8000004f,%d1          | displaced
        move.l  %d1,-(%sp)              | displaced
        jmp     0x400888b2
qz_wr_line:                             | sprintf(buf, a0, d0); write(file, buf, strlen(buf))
        move.l  %d0,-(%sp)
        move.l  %a0,-(%sp)
        move.l  %d2,-(%sp)
        jsr     (%a4)
        move.l  %d2,-(%sp)
        jsr     (%a3)
        move.l  %d0,-(%sp)
        move.l  %d2,-(%sp)
        move.l  %d3,-(%sp)
        jsr     (%a2)
        lea     28(%sp),%sp
        rts

| ---- data ------------------------------------------------------------------------
qz_key:         .asciz  "#SEQUENCER_SCALE="
qz_fmt:         .asciz  "#SEQUENCER_SCALE=%d\r\n"
qz_key2:        .asciz  "#SYNTH_GLIDE="
qz_fmt2:        .asciz  "#SYNTH_GLIDE=%d\r\n"
qz_key3:        .asciz  "#SEQUENCER_ROOT="
qz_fmt3:        .asciz  "#SEQUENCER_ROOT=%d\r\n"
qz_lbl_scale:   .asciz  "SCALE"
qz_lbl_root:    .asciz  "ROOT"
qz_lbl_glide:   .asciz  "GLIDE"
qz_synthname:   .ascii  "SYNTH"
        .balign 4
qz_gbuf:        .fill   8, 1, 0          | the GLIDE row's number (RAM)
qz_ofmt:        .fill   8, 1, 0          | the keyboard's octave format with ROOT's name: "A# %d" (RAM)
qz_legato:      .byte   0                | the press in flight is a legato one (qz_leg2 -> qz_leg3)
qz_synthq:      .byte   0                | qz_quant runs for a synth track (qz_pcof reads it)
        .balign 4
qz_chain:       .long   0                | ... and continues a held note: that note's start (ticks), 0 = a fresh note
qz_step:        .byte   0                | the step the key in flight was recorded on (qz_leg4 -> qz_leg5)
        .balign 4
qz_press:       .fill   8 * 4 * 8, 1, 0  | the notes being played on each track: 4 x (key, step, in use, pad, ticks)
qz_names:                               | index 0..24 -> label, 7 characters at most (the value column is 33 px wide)
        .long   qz_n0, qz_n1, qz_n2, qz_n3, qz_n4, qz_n5, qz_n6, qz_n7, qz_n8, qz_n9, qz_n10, qz_n11, qz_n12, qz_n13, qz_n14, qz_n15, qz_n16, qz_n17, qz_n18, qz_n19, qz_n20, qz_n21, qz_n22, qz_n23, qz_n24
qz_n0:  .asciz  "OFF"
qz_n1:  .asciz  "MAJOR"
qz_n2:  .asciz  "DORIAN"
qz_n3:  .asciz  "PHRYGN"
qz_n4:  .asciz  "LYDIAN"
qz_n5:  .asciz  "MIXOLYD"
qz_n6:  .asciz  "MINOR"
qz_n7:  .asciz  "LOCRIAN"
qz_n8:  .asciz  "PENT.MN"
qz_n9:  .asciz  "PENT.MJ"
qz_n10:  .asciz  "MEL.MIN"
qz_n11:  .asciz  "HRM.MIN"
qz_n12:  .asciz  "WHOLE"
qz_n13:  .asciz  "BLUES"
qz_n14:  .asciz  "PHRYDOM"
qz_n15:  .asciz  "WH.DIM"
qz_n16:  .asciz  "HW.DIM"
qz_n17:  .asciz  "HUNGMIN"
qz_n18:  .asciz  "HIRAJOS"
qz_n19:  .asciz  "IN-SEN"
qz_n20:  .asciz  "IWATO"
qz_n21:  .asciz  "PELOG"
qz_n22:  .asciz  "DBLHARM"
qz_n23:  .asciz  "SUPRLOC"
qz_n24:  .asciz  "LYD.DOM"
        .balign 4
qz_rootnames:                           | ROOT 0..11 -> its name (the ROOT row's value, the keyboard readout)
        .long   qz_r0, qz_r1, qz_r2, qz_r3, qz_r4, qz_r5, qz_r6, qz_r7, qz_r8, qz_r9, qz_r10, qz_r11
qz_r0:  .asciz  "C"
qz_r1:  .asciz  "C#"
qz_r2:  .asciz  "D"
qz_r3:  .asciz  "D#"
qz_r4:  .asciz  "E"
qz_r5:  .asciz  "F"
qz_r6:  .asciz  "F#"
qz_r7:  .asciz  "G"
qz_r8:  .asciz  "G#"
qz_r9:  .asciz  "A"
qz_r10: .asciz  "A#"
qz_r11: .asciz  "B"
        .balign 2
| qz_masks, the 24 pitch-class masks, is core.s's (read through SCALE_AT).
qz_pc25:                                | chromatic key index 0..24 -> pitch class (12 = C, TRIG 13 at ROOT C)
        .byte   0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0
qz_pcraw:                               | PTCH raw - 4 (0..120) -> pitch class when on a semitone (raw = 64 + 5*n), else 0xff
        .byte   0, 0xff, 0xff, 0xff, 0xff, 1, 0xff, 0xff, 0xff, 0xff
        .byte   2, 0xff, 0xff, 0xff, 0xff, 3, 0xff, 0xff, 0xff, 0xff
        .byte   4, 0xff, 0xff, 0xff, 0xff, 5, 0xff, 0xff, 0xff, 0xff
        .byte   6, 0xff, 0xff, 0xff, 0xff, 7, 0xff, 0xff, 0xff, 0xff
        .byte   8, 0xff, 0xff, 0xff, 0xff, 9, 0xff, 0xff, 0xff, 0xff
        .byte   10, 0xff, 0xff, 0xff, 0xff, 11, 0xff, 0xff, 0xff, 0xff
        .byte   0, 0xff, 0xff, 0xff, 0xff, 1, 0xff, 0xff, 0xff, 0xff
        .byte   2, 0xff, 0xff, 0xff, 0xff, 3, 0xff, 0xff, 0xff, 0xff
        .byte   4, 0xff, 0xff, 0xff, 0xff, 5, 0xff, 0xff, 0xff, 0xff
        .byte   6, 0xff, 0xff, 0xff, 0xff, 7, 0xff, 0xff, 0xff, 0xff
        .byte   8, 0xff, 0xff, 0xff, 0xff, 9, 0xff, 0xff, 0xff, 0xff
        .byte   10, 0xff, 0xff, 0xff, 0xff, 11, 0xff, 0xff, 0xff, 0xff
        .byte   0
        .balign 4
qz_end:
