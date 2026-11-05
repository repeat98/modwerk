| SCALE QUANTIZER -- the DRAM unit (13 Sep 2026; a DRAM unit since 28 Sep 2026). GNU as.
|
| OCTATRICK 2.22 (29 Oct 2026): the per-track switches are two rows.
|   * PROJECT > CONTROL > SEQUENCER rows 7 and 8, TRACK and FOLLOW, replace
|     the sixteen rows MIDI 1..8 SCALE (2.15) and AUDIO 1..8 SCALE (2.19):
|     TRACK picks the track (AUDIO 1 .. AUDIO 8, MIDI 1 .. MIDI 8; it only
|     chooses what FOLLOW shows, no sound changes, a RAM byte that starts at
|     AUDIO 1 and is not saved), FOLLOW is that track's ON / OFF. Stock's
|     three rows + SCALE, ROOT, GLIDE, TRACK, FOLLOW = 8. The settings are
|     2.21's: the same bits of NV_AOFF / NV_MOFF, the same project-file
|     lines, so a project saved on 2.21 loads with the same tracks OFF.
|
| OCTATRICK 2.19 (24 Oct 2026): what an AUDIO track plays follows the scale.
|   * qz_atrig, a jmp at 0x4000c614 in the frame builder's trig path, right
|     after a trig's locks are applied to the track's parameter words: with
|     a scale on and the track's AUDIO n SCALE ON, the PLAYBACK PTCH word
|     the trig resolved (its PTCH lock, or the Part's PTCH) is snapped to
|     the nearest scale degree (qz_asnap: ties down; a sample track's PTCH
|     in fifths of raw around the sample's own pitch, a synth track's in
|     semitones) and applied the way a stock PTCH lock is (the word and its
|     base byte, the slot's bit in the trig's lock mask, so the next trig
|     restores the Part's value first). Nothing stored changes: a pattern
|     recorded in C MAJOR plays its E, A, B as Eb, Ab, Bb in C MINOR and
|     as recorded again in C MAJOR.
|   * THE PER-TRACK SWITCH: SEQUENCER rows 15..22, "AUDIO 1 SCALE" ..
|     "AUDIO 8 SCALE" (TRACK AUDIO n + FOLLOW since 2.22), ON (default) / OFF, one battery-RAM byte NV_AOFF
|     0x100b14eb (bit t = audio track t+1 is OFF), saved as
|     "#SEQUENCER_AUDIO_SCALE_OFF=n" after the MIDI line. OFF = SCALE OFF
|     for that track's sequencer, PTCH knob, PTCH locks, CHROMATIC keys,
|     their mark and readout.
|
| OCTATRICK 2.15 (15 Oct 2026): the MIDI tracks, part two.
|   * WHAT A MIDI TRACK PLAYS follows the scale: qz_mnote, a jmp at
|     0x4009fb80 in the sequencer's MIDI note stage (0x4009f794), after
|     TRAN, the MIDI transpose and stock's ARP SETUP KEY, before the
|     active-note test and the note-on. Every note the stage sends -- NOTE,
|     NOTE + NOT2..4, NOTE locks, TRAN, the arpeggiator's notes (its RANGE
|     octaves, fed by the sequencer, the keys or MIDI IN) -- is snapped in
|     place to the nearest scale note (qz_msnap, ties down), so the note-on,
|     the note stage's stored note (the note-off) and its active-note table
|     all carry the snapped note: no note can hang. Two notes of one trig
|     that snap to the same note sound once: stock's active-note test drops
|     the second (the same track already holds it), so one note-on and one
|     note-off. The offsets stay semitones. qz_mprev, a jmp at 0x400439d6,
|     snaps the same way the chord a held [TRIG] key previews in GRID
|     RECORDING (stock: NOTE + NOT2..4 without TRAN, its note-offs
|     recomputed at the release).
|   * THE PER-TRACK SWITCH: PROJECT > CONTROL > SEQUENCER rows 7..14, "MIDI
|     1 SCALE" .. "MIDI 8 SCALE" (TRACK MIDI n + FOLLOW since 2.22), ON (default) / OFF. A MIDI track set OFF is
|     a track with SCALE OFF in every path -- the NOTE knob, NOTE locks, the
|     CHROMATIC keys and their readout, the note stage, the preview. Stored
|     as one battery-RAM byte, NV_MOFF 0x100b14ef (bit t = MIDI track t+1 is
|     OFF; 0 = every track follows), the last byte of the padding SCALE /
|     GLIDE / ROOT live in; saved as "#SEQUENCER_MIDI_SCALE_OFF=n" after the
|     GLIDE line; core.s's qz_defaults clears it with the others.
|
| OCTATRICK 2.13 (12 Oct 2026): the MIDI tracks. With a scale on, a MIDI
|   track's NOTE knob and NOTE locks step by scale degree from ROOT
|   (qz_mknob, qz_mplock, qz_quant's MIDI mode) and its CHROMATIC keys play
|   note + ROOT snapped to the scale (qz_mkey, qz_msnap); the keyboard's
|   number reads "A 3". Editing only: the sequencer, NOT2..4, TRAN, the
|   arpeggiator's notes and MIDI IN are stock. qz_octnum sits at the
|   drawer's common push 0x400449be (Modwerk #264; until 2.12 CHROMATIC on a
|   MIDI track froze the unit).
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
        .include "remix.inc"            | 2.11: HAVE_SYDRUM -- 1 when SY DRUM is in the remix (manifest.py); 0
                                        | assembles this unit byte for byte as 2.10's
        .global qz_knob, qz_plock, qz_chrom, qz_draw, qz_ld_entry, qz_ld_line, qz_wr
        .global qz_get, qz_set, qz_lbl_scale, qz_scale
        .global qz_get_glide, qz_set_glide, qz_lbl_glide, qz_leg1, qz_leg2
        .global qz_leg0, qz_leg3, qz_leg4, qz_leg5
        .global qz_get_root, qz_set_root, qz_lbl_root
        .global qz_keyidx, qz_octkey, qz_octdraw, qz_octnum, qz_heldmark
        .global qz_mknob, qz_mplock, qz_mkey
        .global qz_mnote, qz_mprev
        .global qz_atrig
        .global qz_lbl_trk, qz_get_trk, qz_set_trk, qz_lbl_fol, qz_get_fol, qz_set_fol
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
        .set    MIDI_MODE, 0x80000012     | (2.13) != 0: the UI shows the MIDI tracks
        .set    PARTS, 0x46c82456         | the project's Part blob (6322 B a Part; 0x100b14cf = the Part)
        .set    MPART_NOTE, 0x8f162       | a MIDI track's parameters in its Part: + 32 * track, NOTE at +0

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
        .set    NV_MOFF,  0x100b14ef      | (2.15) bit t: MIDI track t+1 has the scale OFF (0 = every MIDI track follows)
        .set    NV_AOFF,  0x100b14eb      | (2.19) bit t: audio track t+1 has the scale OFF (0 = every audio track follows)
        .set    PWORDS,   0x80000a50      | (2.19) the frame builder's parameter words, 64 B a track (slot k at + 2 k, raw << 8)
        .set    PBYTES,   0x80000810      | (2.19) their base bytes, 72 B a track (slot k at + k)
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

| qz_polytrack: d0 := 1 (flags NE) for an FM track whose effective
| VOIC (Part, scene, step lock and cap) is paraphonic, else 0 (EQ).
| Uses the engine's published legato-mode reader; preserves all but d0.
qz_polytrack:
        .if     HAVE_SYDRUM
        jbsr    qz_fmtrack
        .else
        jbsr    qz_is_synth
        .endif
        jbeq    qz_pt_ret
        move.l  %a0,-(%sp)
        jbsr    qz_legmode              | engine resolves setup locks and the Part cap
        movea.l (%sp)+,%a0
        subq.l  #2,%d0
        cmpi.l  #1,%d0                  | modes 2/3 are paraphonic
        sls     %d0
        andi.l  #1,%d0
qz_pt_ret:
        rts

| qz_is_synth: d0 := 1 (NE) when track d2's machine is FLEX and the FM SYNTH
| machine is chosen (the Part's "FM", 1; 2.11: 2 for SY DRUM's "SY", 1) -- the
| synth page's own test (modules/synth/page.s pg_resolve). Until 2.14 a FLEX slot
| whose sample was named SYNTH* / FMSYNTH* counted too; that marker selects nothing
| since 2.15 (the synth's selection guard counts the machines the lists give).
| Preserves everything but d0.
        .if     HAVE_SYDRUM
| qz_fmtrack (2.11): d0 := 1 (NE) when track d2 plays FM (qz_is_synth's 1: FM SYNTH chosen),
| 0 for SY DRUM (2) and sample tracks. Preserves everything but d0.
qz_fmtrack:
        jbsr    qz_is_synth
        subq.l  #1,%d0
        seq     %d0
        andi.l  #1,%d0
        rts
        .endif
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
        move.l  %a0,%a1                 | the FM SYNTH machine chosen in the machine list
        move.l  %d2,%d0                 | (the synth module's machine.s): "FM", 1 in the
        mulu.w  #30,%d0                 | track's NEIGHBOR column, Part + 0x8edbc + 30*track
        adda.l  %d0,%a1
        adda.l  #0x8edbc,%a1
        .if     HAVE_SYDRUM
        mvz.b   2(%a1),%d0              | (2.11) or SY DRUM (sy-drum/): "SY", 1 -- its PTCH is semitones
        subq.l  #1,%d0                  | too, its keys and locks as FM SYNTH's
        jbne    qz_is_no
        mvz.w   (%a1),%d0
        cmpi.l  #0x464d,%d0             | "FM": 1
        jbeq    qz_is_fmsig
        cmpi.l  #0x5359,%d0             | "SY": 2
        jbne    qz_is_no
        moveq   #2,%d0
        jbra    qz_is_out
qz_is_fmsig:
        .else
        mvz.w   (%a1),%d0
        cmpi.l  #0x464d,%d0
        jbne    qz_is_no
        mvz.b   2(%a1),%d0
        subq.l  #1,%d0
        jbne    qz_is_no
        .endif
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
        mvz.b   UI_TRACK,%d1            | (2.19) the track's AUDIO n SCALE OFF: stock
        btst    %d1,NV_AOFF
        jbne     qz_k_store
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
| stores it at the byte a0 + a1 + 0x59 = track record + 0x59 + flat slot (a0 = the
| record, a1 = flat slot) and into the SRAM mirror after the hook. Same
| registers as above: d5 = slot, a3 = descriptor, fp = delta. The lock byte
| is still the old one when the hook runs, so the start value is read there.
qz_plock:
        move.l  %a2,-(%sp)
        lea     qz_scale,%a2
        mvz.b   (%a2),%d0
        jbeq     qz_p_done
        mvz.b   UI_TRACK,%d1            | (2.19) the track's AUDIO n SCALE OFF: stock
        btst    %d1,NV_AOFF
        jbne     qz_p_done
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

| ---- (2.13) THE MIDI TRACKS' NOTE: the knob, jsr planted at 0x40055382 -----------
| The MIDI branch of the knob handler (0x40055304, reached with the MIDI tracks
| on screen) resolves the Part byte into a5 (Part + 0x8f162 + 32 * track +
| flat), calls the slot's handler (NOTE: the generic 0x4003240c, a semitone a
| detent), clamps it to the descriptor's min into d0, and at 0x40055382 -- the
| hook, 8 bytes: d0 copied into d2, compared with d1 and replaced by d1 when above it -- to the max
| d1 into d2, which 0x4005538a stores into the Part; the SRAM mirror, the live
| copy 0x46c76dc0 + 68 * track, a LIVE REC lock (0x40042158) and the CC echo
| then read d2. The hook sits one instruction group before the store so that
| the store itself stays stock: octabam's MIDI SCENES detours 0x4005538a (its
| scn_pwrite), and the two compose -- this unit decides d2, the store
| (stock's or MIDI SCENES') takes it. Registers here: d6 = the flat slot
| (signed byte; 0 = NOTE, slot A of the NOTE page), d5 = slot, a4 = the
| delta (detents, signed), a3 = the page descriptor (slot names at +0x16),
| (a5) still the old value. With a scale on, NOTE steps by scale degree from
| the old value exactly as PTCH does on an audio track (qz_quantm: a value
| between degrees goes to the next one in the turn direction, at 0 or 127 it
| stays). VEL, LEN, NOT2..4 and every other slot: stock. Only d2 changes:
| d0 / d1 / a0 / a1 leave as stock leaves them (d1 is kept on the stack
| while it names the slot), so whatever follows the store sees stock's
| registers but for d2.
qz_mknob:
        move.l  %d0,%d2                 | displaced: d2 := the value,
        cmp.l   %d0,%d1                 | displaced:   capped at the max (d1)
        jbge    qz_mk_capped            | displaced
        move.l  %d1,%d2                 | displaced
qz_mk_capped:
        tst.b   NV_SCALE
        jbeq    qz_mk_done              | OFF: stock
        tst.l   MIDI_MODE
        jbeq    qz_mk_done
        tst.b   %d6                     | flat 0: NOTE
        jbne    qz_mk_chord             | (2.18) or NOT2..4
        tst.l   %d5                     | slot A
        jbne    qz_mk_done
        move.l  %d1,-(%sp)
        mvz.b   UI_TRACK,%d1            | (2.15) the track's switch: MIDI n SCALE OFF = stock
        btst    %d1,NV_MOFF
        jbne    qz_mk_pop
        move.l  0x16(%a3),%d1           | the slot's name: "NOTE"
        cmpi.l  #0x4e4f5445,%d1
        jbne    qz_mk_pop
        move.l  %a4,%d1                 | delta: detents, signed
        jbeq    qz_mk_pop
        mvz.b   (%a5),%d2               | from the value the knob was turned from
        jbsr    qz_quantm
qz_mk_pop:
        move.l  (%sp)+,%d1
qz_mk_done:
        rts
| (2.18) NOT2, NOT3, NOT4 (flat 3..5 = slots D..F of the NOTE page, named "NOT2".."NOT4"):
| the offset steps so that NOTE + offset is the next note of the scale in the turn
| direction, as NOTE itself steps (qz_quantmb: the walk over the offset's raw 0..127,
| 64 = +0, the pitch class that of the Part's NOTE + raw - 64; the descriptor's
| range is NOTE's, 0 / 128, for all six slots). The value shown, the one stored and
| the chord the track plays then hold scale notes only, each its own note.
qz_mk_chord:
        move.l  %d1,-(%sp)
        move.l  %d6,%d1
        subq.l  #3,%d1
        cmpi.l  #2,%d1
        jbhi    qz_mk_pop               | not flat 3..5
        cmp.l   %d5,%d6
        jbne    qz_mk_pop               | the flat is the slot (D..F) on the NOTE page
        mvz.b   UI_TRACK,%d1            | the track's switch: MIDI n SCALE OFF = stock
        btst    %d1,NV_MOFF
        jbne    qz_mk_pop
        move.l  %d5,%d1
        add.l   %d1,%d1
        add.l   %d5,%d1
        add.l   %d1,%d1                 | 6 * slot: the names are 6 bytes apart
        move.l  0x16(%a3,%d1.l),%d1
        lsr.l   #8,%d1
        cmpi.l  #0x4e4f54,%d1           | "NOT"
        jbne    qz_mk_pop
        move.l  %a4,%d1                 | delta: detents, signed
        jbeq    qz_mk_pop
        move.l  %a0,-(%sp)
        movea.l %a5,%a0
        suba.l  %d6,%a0                 | the Part's NOTE (a5 = the slot's Part byte)
        mvz.b   (%a0),%d2
        addq.l  #8,%d2                  | the bias: NOTE + 8 = NOTE - 64 mod 12
        lea     qz_mbias(%pc),%a0
        move.l  %d2,(%a0)
        movea.l (%sp)+,%a0
        mvz.b   (%a5),%d2               | from the value the knob was turned from
        jbsr    qz_quantmb
        jbra    qz_mk_pop

| ---- (2.13) the MIDI NOTE with a [TRIG] key held: jsr planted at 0x40050b98 ------
| The MIDI p-lock editor (the loop at 0x400509f6, GRID REC + a held trig) takes
| the step's lock -- or the Part's value + delta when there is none (0xff) --
| clamps it into d4 and stores it at 0x40050b98 into 18688(a0) (the pattern's
| lock byte: a0 = the step's record + flat) and then into the SRAM mirror at
| (a0', a1). Registers: a1 = the flat slot (0 = NOTE), d5 = slot, fp = delta,
| a3 = the descriptor; the old lock is still in 18688(a0). qz_plock's twin:
| with a scale on, NOTE steps by scale degree from the lock, or from the
| Part's NOTE when the step has none. Only d0 / d1 are free (a0 / a1 / d2 / d3
| are read after the hook).
qz_mplock:
        mvz.b   NV_SCALE,%d0
        jbeq    qz_mp_store             | OFF: stock
        tst.l   MIDI_MODE
        jbeq    qz_mp_store
        mvz.b   UI_TRACK,%d0            | (2.15) the track's switch: MIDI n SCALE OFF = stock
        btst    %d0,NV_MOFF
        jbne    qz_mp_store
        move.l  %a1,%d0                 | flat 0: NOTE
        jbne    qz_mp_chord             | (2.18) or NOT2..4
        tst.l   %d5
        jbne    qz_mp_store
        move.l  0x16(%a3),%d0
        cmpi.l  #0x4e4f5445,%d0         | "NOTE"
        jbne    qz_mp_store
        move.l  %fp,%d1                 | delta
        jbeq    qz_mp_store
        move.l  %d2,-(%sp)
        mvz.b   (18688,%a0),%d2         | the step's lock before the store
        cmpi.l  #0xff,%d2
        jbne    qz_mp_go                | a lock: step from it
        move.l  %a0,-(%sp)              | none: from the Part's NOTE
        move.l  #6322,%d0               | a Part's size
        mvz.b   0x100b14cf,%d2          | the Part
        muls.l  %d0,%d2
        movea.l PARTS,%a0
        adda.l  %d2,%a0                 | the Part
        mvz.b   UI_TRACK,%d2
        lsl.l   #5,%d2
        adda.l  %d2,%a0                 | + 32 * track
        adda.l  #MPART_NOTE,%a0
        mvz.b   (%a0),%d2               | its NOTE
        movea.l (%sp)+,%a0
qz_mp_go:
        jbsr    qz_quantm
        move.l  %d2,%d4                 | the value the lock and the mirror take
        move.l  (%sp)+,%d2
qz_mp_store:
        move.b  %d4,(18688,%a0)         | displaced: the lock byte
        mvz.b   UI_TRACK,%d1            | displaced
        rts
| (2.18) a NOT2..4 lock (flat 3..5, the slot D..F named "NOT2".."NOT4"): qz_mk_chord's
| rule from the step's lock (or the Part's offset when the step has none), the note
| it is an offset from being the step's NOTE lock (or the Part's NOTE when none).
qz_mp_chord:
        subq.l  #3,%d0
        cmpi.l  #2,%d0
        jbhi    qz_mp_store             | not flat 3..5
        cmpa.l  %d5,%a1
        jbne    qz_mp_store             | the flat is the slot (D..F) on the NOTE page
        move.l  %d5,%d0
        add.l   %d0,%d0
        add.l   %d5,%d0
        add.l   %d0,%d0                 | 6 * slot
        move.l  0x16(%a3,%d0.l),%d0
        lsr.l   #8,%d0
        cmpi.l  #0x4e4f54,%d0           | "NOT"
        jbne    qz_mp_store
        move.l  %fp,%d1                 | delta
        jbeq    qz_mp_store
        move.l  %d2,-(%sp)
        move.l  %a0,-(%sp)
        suba.l  %a1,%a0                 | the step's record (flat 0)
        mvz.b   (18688,%a0),%d2         | its NOTE lock
        cmpi.l  #0xff,%d2
        jbne    qz_mp_cb
        moveq   #0,%d2                  | none: the Part's NOTE
        jbsr    qz_mpart
qz_mp_cb:
        addq.l  #8,%d2                  | the bias: NOTE + 8
        lea     qz_mbias(%pc),%a0
        move.l  %d2,(%a0)
        movea.l (%sp),%a0
        mvz.b   (18688,%a0),%d2         | the step's offset lock before the store
        cmpi.l  #0xff,%d2
        jbne    qz_mp_cgo
        move.l  %a1,%d2                 | none: the Part's offset
        jbsr    qz_mpart
        movea.l (%sp),%a0
qz_mp_cgo:
        jbsr    qz_quantmb
        move.l  %d2,%d4                 | the value the lock and the mirror take
        movea.l (%sp)+,%a0
        move.l  (%sp)+,%d2
        jbra    qz_mp_store
| qz_mpart: d2 := the UI MIDI track's Part byte at flat d2 (Part + MPART_NOTE + 32 * track
| + flat). Clobbers d0, a0.
qz_mpart:
        move.l  %d2,-(%sp)
        move.l  #6322,%d0
        mvz.b   0x100b14cf,%d2          | the Part
        muls.l  %d0,%d2
        movea.l PARTS,%a0
        adda.l  %d2,%a0
        mvz.b   UI_TRACK,%d2
        lsl.l   #5,%d2
        adda.l  %d2,%a0                 | + 32 * track
        adda.l  #MPART_NOTE,%a0
        adda.l  (%sp)+,%a0              | + flat
        mvz.b   (%a0),%d2
        rts

| ---- qz_quant: d2 := d2 stepped |d1| degrees in the direction of d1 -------------
| SCALE is on (the mask comes from SCALE_AT), a3 = the descriptor (min at +0x6a, count at
| +0x9a for slot A). Each step goes to the next raw value on a semitone of the
| scale (raw = 64 + 5 * n; qz_pcraw maps raw - min to a pitch class); a value
| between degrees snaps to the nearest one in the turn direction; at the ends
| the value stays, which is the stock clamp. Preserves everything but d2.
| qz_quantm (2.13) is the same walk over a MIDI track's NOTE: raw = the MIDI
| note, every value a semitone, pitch class = note mod 12 (48 = C3, C = 0).
qz_quant:
        move.l  %d0,-(%sp)
        moveq   #0,%d0                  | an audio track (qz_ui_synth decides below)
        jbra    qz_q_go
qz_quantm:
        move.l  %a0,-(%sp)
        lea     qz_mbias(%pc),%a0
        clr.l   (%a0)                   | NOTE: the note's own pitch class
        movea.l (%sp)+,%a0
qz_quantmb:                             | (2.18) NOT2..4: qz_mbias set by the caller (NOTE + 8)
        move.l  %d0,-(%sp)
        moveq   #-1,%d0                 | (2.13) a MIDI track's NOTE
qz_q_go:
        move.l  %d1,-(%sp)
        move.l  %d3,-(%sp)
        move.l  %d4,-(%sp)
        move.l  %d5,-(%sp)
        move.l  %d6,-(%sp)
        move.l  %d7,-(%sp)
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,%d6                 | the mode (d6 is saved; the walk sets it before use)
        jsr     SCALE_AT                | d3 = the scale's pitch-class mask, rotated by ROOT (core.s)
        move.l  %d0,%d3
        move.l  0x6a(%a3),%d4           | d4 = the parameter's minimum (4; 0 on the synth page and MIDI's NOTE)
        move.l  0x9a(%a3),%d5
        add.l   %d4,%d5
        subq.l  #1,%d5                  | d5 = its maximum (124; 127 on the synth page and MIDI's NOTE)
        lea     qz_pcraw(%pc),%a0
        move.l  %d6,%d0
        jbne    qz_q_mode               | MIDI: -1
        jbsr    qz_ui_synth             | a synth track: raw = 64 + semitones (qz_pcof)
qz_q_mode:
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
| track (qz_synthq > 0, set by qz_quant) computes (raw + 56) mod 12 = (raw - 64)
| mod 12, every raw a semitone; a MIDI track's NOTE (qz_synthq < 0, qz_quantm)
| is the note itself, raw mod 12. Preserves everything but d7.
qz_pcof:
        move.l  %d6,%d7
        sub.l   %d4,%d7
        tst.b   qz_synthq(%pc)
        jbeq    qz_pc_tab
        jbpl    qz_pc_syn
        move.l  %d6,%d7                 | (2.13) MIDI: the note's own pitch class
        add.l   qz_mbias(%pc),%d7       | (2.18) NOT2..4: + NOTE + 8, the class of the note NOTE + (raw - 64)
        jbra    qz_pc_mod
qz_pc_syn:
        addi.l  #56,%d7
qz_pc_mod:
        move.l  %d0,-(%sp)
        move.l  %d6,-(%sp)
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
        btst    %d2,NV_AOFF             | (2.19) the track's AUDIO n SCALE OFF: stock
        jbne     qz_c_replay
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
| 64 + n. The displaced address load is not replayed: a2 := raw.
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
        btst    %d2,NV_AOFF             | (2.19) the track's AUDIO n SCALE OFF: as SCALE OFF
        jbne    qz_cs_raw
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
| or RIGHT flips it (0x40045918), the key handler's caller adds 12 * word to the
| key (0x40050254) and the drawer picks the 16- or 13-key picture by it
| (0x40044968), prints it with "%d" (0x400449be) and places the held-key marks
| with it (0x40044abe). On a synth track the octave is qz_oct instead, -4..+4:
| the stock word is held at 0 there (the key index stays the physical key,
| the marks land on the keys, the 16-key picture shows), qz_chrom adds the 12
| * qz_oct, and the number beside the keyboard is qz_oct. Sample tracks: the
| displaced instructions, byte for byte.

| 0x40050254, the key handler's caller: OCT_WORD read into d0 and copied into d1 (8
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

| 0x40045918, FUNC + LEFT / RIGHT in CHROMATIC mode: OCT_WORD toggled by 1 through
| d2 (8 bytes) -> jmp qz_octkey. The key code is the handler's
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

| 0x40044968, the CHROMATIC drawer's picture choice: OCT_WORD compared with 1
| through d1 (8 bytes) -> jmp qz_octdraw; stock's conditional branch at 0x40044970 reads
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

| 0x400449be, the number beside the keyboard: the pushes of d0 and of 0x400b465d
| (8 bytes, the octave and stock's decimal format) -> jmp qz_octnum. The
| drawer reaches 0x400449be from BOTH branches: the audio one loads OCT_WORD
| into d0 at 0x400449b8 and falls through, the MIDI one (0x400449a6: a test of the
| long at 0x80000012) loads stock's MIDI octave word 0x400beba2 - 1 into d0 and
| branches straight here. The value is printed by the formatter 0x40013904
| (ctx, font, x 0x44, y 9, 1, 0, buf 0x400b527d, fmt, value), and 0x400449ec
| pops the nine -- so a synth track's -4..+4 prints as is. With a scale on
| (28 Sep 2026) the format is this unit's qz_ofmt, ROOT's name + " %d" ("A
| %d"), pushed in place of stock's; the continuation is 0x400449c6 on every
| path: same nine arguments.
| 2.13 (Modwerk #264): until 2.12 this detour sat at 0x400449b8, the audio
| branch's load, and 0x400449be was its pad. Stock's MIDI branch jumps to
| 0x400449be, so on a MIDI track the octave push was skipped, the drawer's
| call ran one argument short and the unit froze when CHROMATIC was entered
| (every public tag since the ROOT round, 2.9 .. 2.12). Modwerk found it and
| its bundled quantizer moved the detour to the common push; this is that
| form: the push is ours on both branches, a MIDI track's d0 is stock's.
| A MIDI track (2.13): stock's number, with ROOT's name before it when a
| scale is on ("A 3": qz_mkey makes key 1 the root at that octave).
qz_octnum:
        tst.l   MIDI_MODE               | MIDI: stock already loaded its octave into d0
        jbne    qz_on_out               | (an audio track's octave is not read)
        jbsr    qz_ui_synth
        jbeq    qz_on_stock
        mvs.b   qz_oct,%d0              | the synth track's octave (keys.s, pinned)
        jbra    qz_on_out
qz_on_stock:
        move.l  OCT_WORD,%d0            | as 0x400449b8: a sample track's position, 0 or 1
        jbeq    qz_on_out               | the default position: 0
        lea     qz_scale,%a0
        tst.b   (%a0)
        jbeq    qz_on_out               | SCALE OFF: stock's 1
        mvz.b   UI_TRACK,%d1            | (2.19) the track's AUDIO n SCALE OFF: stock's 1
        btst    %d1,NV_AOFF
        jbne    qz_on_out
        mvz.b   NV_ROOT,%d1
        subq.l  #7,%d1
        jbmi    qz_on_out               | ROOT C..F#: the other position is the octave above, 1
        moveq   #-1,%d0                 | ROOT G..B: it is the octave below (qz_chrom drops the keyboard): -1
qz_on_out:
        move.l  %d0,-(%sp)              | displaced: the number
        lea     qz_scale,%a0
        tst.b   (%a0)
        jbeq    qz_on_fmt               | SCALE OFF: stock's "%d" (ROOT ignored)
        tst.l   MIDI_MODE               | (2.15) a MIDI track whose switch is OFF: stock's "%d"
        jbeq    qz_on_audio
        mvz.b   UI_TRACK,%d1
        btst    %d1,NV_MOFF
        jbne    qz_on_fmt
        jbra    qz_on_root
qz_on_audio:                            | (2.19) an audio track whose AUDIO n SCALE is OFF: stock's "%d"
        mvz.b   UI_TRACK,%d1
        btst    %d1,NV_AOFF
        jbne    qz_on_fmt
qz_on_root:
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
        pea     qz_ofmt(%pc)            | the format, in place of stock's "%d"
        jmp     0x400449c6
qz_on_fmt:
        pea     FMT_D                   | displaced: stock's decimal format
        jmp     0x400449c6

| ---- (2.18) the held key's mark on an audio track's keyboard: jmp planted at 0x40044abc
| The drawer's audio branch (MIDI_MODE 0) walks the eight tracks' held keys, a2 =
| HELD + track (the key index the handler saw + 1, 0 = none), and marks the
| picture's key at held - 1 - 12 * OCT_WORD (0x40044ac4..: the range check, the
| key's x, the draw through a3). That is the PHYSICAL key, but with a scale on the
| key sounds qz_chrom's note -- key 1 the root, every key snapped -- so with ROOT E
| key 1 played E while the mark sat on C (a MIDI track's mark is its held note,
| which qz_mkey already made the sounding one: that branch is not touched). Here
| the held key goes through qz_chrom itself, the press path's own rule, and d1
| becomes the sounding note's place in the picture (+ 1 + 12 * OCT_WORD, which the
| stock arithmetic takes off again): a sample track's index s (raw = 5 * s + 4)
| sits at s - 12 * N, N = the number beside the keyboard (qz_octnum: 0 at word 0;
| 1 at word 1 with ROOT C..F#; -1 at word 1 with ROOT G..B, the dropped keyboard);
| a synth track's n (raw = 64 + n) sits at n + 12 - 12 * qz_oct. A note outside the
| picture fails the stock range check, as a key off the picture does. SCALE OFF or
| no key held: the displaced instructions. d0 / d1 / d2 / a0 are loaded by the
| stock code that follows, a1 / a2 are saved; qz_chrom keeps d2..d4.
qz_heldmark:
        mvz.b   (%a2),%d1               | displaced: the track's held key + 1 (0 = none)
        tst.b   NV_SCALE
        jbeq    qz_hm_word              | SCALE OFF: stock
        move.l  %a2,%d0                 | (2.19) the track's AUDIO n SCALE OFF: stock
        subi.l  #HELD,%d0
        btst    %d0,NV_AOFF
        jbne    qz_hm_word
        tst.l   %d1
        jbeq    qz_hm_word              | no key held on this track
        lea     -8(%sp),%sp
        movem.l %a1-%a2,(%sp)
        move.l  %a2,%d2
        subi.l  #HELD,%d2               | the track, 0..7
        subq.l  #1,%d1
        movea.l %d1,%a2                 | the key index the handler saw
        jbsr    qz_chrom                | a2 := the raw the key sounds (the press path's rule)
        move.l  %a2,%d1
        jbsr    qz_is_synth             | (track d2)
        jbne    qz_hm_synth
        subq.l  #4,%d1
        moveq   #5,%d0
        divu.l  %d0,%d1                 | s = (raw - 4) / 5: the index that sounds, 0..24
        tst.l   OCT_WORD
        jbeq    qz_hm_place             | position 0: the picture starts at index 0
        mvz.b   NV_ROOT,%d0
        subq.l  #7,%d0
        jbmi    qz_hm_place             | ROOT C..F#, position 1: it starts at index 12 (the stock 12 * word)
        addi.l  #24,%d1                 | ROOT G..B, position 1 ("-1"): it starts at index -12
        jbra    qz_hm_place
qz_hm_synth:
        subi.l  #52,%d1                 | raw - 64 + 12: n + 12, key 1 of the picture is n = -12 at octave 0
        mvs.b   qz_oct,%d0
        move.l  %d0,%d2
        lsl.l   #2,%d0
        lsl.l   #3,%d2
        add.l   %d2,%d0                 | 12 * qz_oct
        sub.l   %d0,%d1                 | the place, n + 12 - 12 * qz_oct
        tst.l   OCT_WORD
        jbeq    qz_hm_place
        addi.l  #12,%d1                 | (+ 12 * word: the stock arithmetic takes it off)
qz_hm_place:
        addq.l  #1,%d1                  | + 1: the stock arithmetic takes held - 1
        movem.l (%sp),%a1-%a2
        lea     8(%sp),%sp
qz_hm_word:
        move.l  OCT_WORD,%d0            | displaced
        jmp     0x40044ac4

| ---- (2.13) the CHROMATIC keys of a MIDI track: jmp planted at 0x400436a8 ---------
| 0x40043664(track, note, press) plays a MIDI track's CHROMATIC key: its caller
| (0x40050226) made the note key + 12 * stock's octave word 0x400beba2 (4 at
| boot: key 1 = 48 = C3). On a press stock has checked note <= 127 and taken
| the key's held slot d2 = note & 15; at 0x400436a8 it pushes the event flag
| (a push of 1) and then calls 0x4009e9a8(track, note, the Part's VEL, 1) -- the
| note-on, or the arpeggiator's add with ARP MODE on -- and stores held[d2] =
| note + 1 (0x460d170c), which the release turns back into the note-off; the
| live recorder records the note it was given (event 0x46). With a scale on
| the note becomes the keyboard's own rule (qz_chrom's, the synth track's):
| note + ROOT (at most 127), then the nearest scale note, ties down -- key 1
| sounds the root, every key a note of the scale. The note-on, the arp, held[]
| (so the note-off) and the recorder all carry it; the release needs no hook.
| Registers: d3 = the note, d4 = track, d2 = the slot; d0 / d1 / a0 / a1 are
| free (d5 is not: stock's word load of a constant into d5 keeps its upper half).
qz_mkey:
        mvz.b   NV_SCALE,%d0
        jbeq    qz_mky_replay           | OFF: stock
        btst    %d4,NV_MOFF             | (2.15) d4 = the track: MIDI n SCALE OFF = stock
        jbne    qz_mky_replay
        mvz.b   NV_ROOT,%d0
        add.l   %d3,%d0                 | + ROOT: key 1 sounds the root
        moveq   #127,%d1
        cmp.l   %d1,%d0
        jble    qz_mky_snap
        move.l  %d1,%d0                 | the MIDI ceiling
qz_mky_snap:
        jbsr    qz_msnap
        move.l  %d0,%d3
qz_mky_replay:
        pea     1                       | displaced: the event flag
        mvz.b   0x100b14cf,%d1          | displaced: the Part
        jmp     0x400436b2

| qz_msnap: d0 := the MIDI note nearest to note d0 (0..127) whose pitch class
| (note mod 12, C = 0) is in the scale's ROOT-rotated mask (SCALE_AT), the
| lower candidate first at each distance (ties go down: qz_chrom's and the
| synth's po_snap's rule), within 0..127. SCALE is on. Clobbers d1, a0, a1.
qz_msnap:
        lea     -12(%sp),%sp
        movem.l %d2-%d4,(%sp)
        move.l  %d0,%d2                 | n
        jsr     SCALE_AT                | d0 = the mask (clobbers a0, d0)
        move.l  %d0,%d3
        move.l  %d2,%d1
        moveq   #12,%d4
        divu.l  %d4,%d1
        mulu.l  %d4,%d1
        move.l  %d2,%d0
        sub.l   %d1,%d0
        move.l  %d0,%a1                 | a1 = n's pitch class
        moveq   #0,%d4                  | distance 0, 1, 2 ...
qz_ms_loop:
        move.l  %d2,%d1
        sub.l   %d4,%d1                 | the lower candidate first
        jbmi    qz_ms_hi                | (below note 0: none)
        move.l  %a1,%d0
        sub.l   %d4,%d0
        jbpl    qz_ms_lo
        addi.l  #12,%d0
qz_ms_lo:
        btst    %d0,%d3
        jbne    qz_ms_found
qz_ms_hi:
        move.l  %d2,%d1
        add.l   %d4,%d1                 | then the upper
        cmpi.l  #127,%d1
        jbgt    qz_ms_next              | (above note 127: none)
        move.l  %a1,%d0
        add.l   %d4,%d0
        cmpi.l  #12,%d0
        jblt    qz_ms_up
        subi.l  #12,%d0
qz_ms_up:
        btst    %d0,%d3
        jbne    qz_ms_found
qz_ms_next:
        addq.l  #1,%d4
        cmpi.l  #11,%d4
        jble    qz_ms_loop
        move.l  %d2,%d1                 | no degree at all: cannot happen (every mask has the root)
qz_ms_found:
        move.l  %d1,%d0
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts

| ---- (2.15) WHAT A MIDI TRACK PLAYS: jmp planted at 0x4009fb80 --------------------
| The sequencer's MIDI note stage 0x4009f794 (called from the sequencer tick
| 0x400a1dfe, playing or stopped: the arpeggiator runs there too) builds a
| track's four notes in its frame (fp-4..-1: NOTE, NOTE + NOT2..4 - 64, or
| what the arpeggiator 0x40099c08 / 0x40099ee4 wrote there) and walks them
| (0x4009fb2e, a2 = the note, d4 = 0..3, d7 = the track 0..7): + TRAN - 64 +
| the MIDI transpose 0x46c7a124[t] (a byte out of 0..127 becomes -1),
| stock's ARP SETUP KEY (0x4009fb58..7e), then at 0x4009fb80 -- the hook,
| 6 bytes: the note byte read into d1 and a branch to 0x4009fd2a when it is negative -- a negative note is skipped
| and any other one goes through the active-note table 0x46c78152 (ch * 128
| + note): a free note is sent (0x4009fbac) and stored for its note-off
| (0x46c77a1a + 32 t + 8 i; the table entry := t * 4 + i), a note this track
| already holds is SKIPPED (0x4009fc8c: the same or a lower track holds it),
| a note a higher track holds is taken over. With a scale on and the
| track's switch ON, the note is snapped in place (qz_msnap: nearest scale
| note, ties down) before the replay, so the note-on, the stored note (the
| note-off) and the table all carry it -- nothing can hang, whatever SCALE
| or ROOT does later; two notes of one trig that snap to the same note:
| the second is the skipped kind, one note-on, one note-off. Registers:
| d0 / d1 / a0 / a1 are free here (stock loads each before it reads it),
| d2..d4 are saved by qz_msnap; d5 / d6 / a2..a5 are not touched.
qz_mnote:
        tst.b   NV_SCALE
        jbeq    qz_mn_replay            | OFF: stock
        btst    %d7,NV_MOFF             | d7 = the track: MIDI n SCALE OFF = stock
        jbne    qz_mn_replay
        mvs.b   (%a2),%d0
        jbmi    qz_mn_replay            | none / out of range: stock skips it
        jbsr    qz_msnap
        move.b  %d0,(%a2)               | the note, snapped (fp-4..-1: the stage's own copy)
qz_mn_replay:
        move.b  (%a2),%d1               | displaced
        jblt    qz_mn_skip              | displaced: the branch on a negative note (to 0x4009fd2a)
        jmp     0x4009fb86
qz_mn_skip:
        jmp     0x4009fd2a

| ---- (2.19) WHAT AN AUDIO TRACK PLAYS: jmp planted at 0x4000c614 -----------------
| The frame builder's trig path (the track at 114(sp), the trig's lock mask at
| (184(sp)): bit k = slot k was locked) has restored the slots the previous
| trig locked from the Part and applied this trig's locks: each lock byte b
| went into the track's base byte PBYTES + 72 t + k and, as b << 8, into its
| parameter word PWORDS + 64 t + 2 k, with bit k set in the mask. Here, with
| a scale on and the track's AUDIO n SCALE ON, on a STATIC or FLEX track (the
| synth machines are FLEX), slot 0 (PLAYBACK PTCH) is taken as the trig
| resolved it -- the word -- and snapped (qz_asnap); when that moves it, the
| snapped value is applied as a lock of that value is (byte, word, mask bit),
| so the next trig restores the Part's own PTCH first: nothing stored changes,
| and a scale switched back plays the pattern as recorded. Then the two
| displaced instructions are replayed (a register copy into d1 and a bit test
| of it, whose flags the stock branch after the site reads). d1 is the
| displaced code's; everything else used is saved.
qz_atrig:
        tst.b   NV_SCALE
        jbeq    qz_at_replay            | SCALE OFF: stock
        lea     -28(%sp),%sp
        movem.l %d0/%d2-%d4/%a0-%a2,(%sp)
        move.l  28+114(%sp),%d2         | the track
        moveq   #7,%d0
        cmp.l   %d0,%d2
        jbhi    qz_at_pop
        btst    %d2,NV_AOFF             | the track's AUDIO n SCALE OFF: stock
        jbne    qz_at_pop
        movea.l PARTS,%a0
        mvz.b   0x100b14cf,%d0
        move.l  #6322,%d1
        muls.l  %d1,%d0
        adda.l  %d0,%a0
        adda.l  #0x8eda2,%a0            | the Part's machine bytes
        mvz.b   (%a0,%d2.l),%d0
        moveq   #5,%d3                  | STATIC: a sample track, 5 raw a semitone
        tst.l   %d0
        jbeq    qz_at_go
        subq.l  #1,%d0
        jbne    qz_at_pop               | THRU / NEIGHBOR / PICKUP: stock
        jbsr    qz_is_synth             | FLEX: FM SYNTH / SY DRUM -- semitones; a sample: fifths
        jbeq    qz_at_go
        moveq   #1,%d3
qz_at_go:
        move.l  %d2,%d0
        lsl.l   #6,%d0
        movea.l %d0,%a1
        adda.l  #PWORDS,%a1             | the track's PTCH word
        mvs.w   (%a1),%d4
        move.l  %d4,%d0
        asr.l   #8,%d0                  | the raw the trig resolved
        jbsr    qz_asnap                | d0 := the snapped raw (d3 = raw per semitone)
        move.l  %d0,%d1
        lsl.l   #8,%d1
        cmp.l   %d1,%d4
        jbeq    qz_at_pop               | on the scale already: nothing to do
        move.w  %d1,(%a1)               | the word, as a lock writes it
        move.l  %d2,%d1
        lsl.l   #3,%d1
        lsl.l   #6,%d2
        add.l   %d1,%d2                 | 72 t
        movea.l %d2,%a2
        adda.l  #PBYTES,%a2
        move.b  %d0,(%a2)               | the base byte
        movea.l 28+184(%sp),%a2
        moveq   #1,%d1
        or.l    %d1,(%a2)               | slot 0 locked by this trig: the next one restores the Part's PTCH
qz_at_pop:
        movem.l (%sp),%d0/%d2-%d4/%a0-%a2
        lea     28(%sp),%sp
qz_at_replay:
        .if     HAVE_PANEL_TRANSACTION
        jbsr    po_tx_base             | bind the resolved pre-LFO base to this accepted frame
        .endif
        move.l  %a4,%d1                 | displaced
        btst    #1,%d1                  | displaced
        jmp     0x4000c61a

| qz_asnap: d0 := the raw nearest to raw d0 (0..127) that sits on a degree of the
| ROOT-rotated scale (SCALE_AT), ties to the lower (the keys' rule). d3 = raw a
| semitone: 5 on a sample track (raw = 64 + 5 n, n = -12..+12 semitones from
| the sample's own pitch, which counts as C, the keys' and the knob's
| convention), 1 on a synth track (raw = 64 + n, n = -64..+63). The search
| runs over the degrees within 7 semitones of the raw's own semitone. SCALE
| is on. Preserves everything but d0 (a0 is saved: SCALE_AT clobbers it).
qz_asnap:
        lea     -32(%sp),%sp
        movem.l %d1-%d7/%a0,(%sp)
        move.l  %d0,%d2                 | r
        jsr     SCALE_AT                | the mask
        move.l  %d0,%d7
        move.l  %d2,%d0
        subi.l  #64,%d0
        divs.l  %d3,%d0                 | n0 = (r - 64) / u, toward 0
        move.l  %d0,%d4
        subq.l  #7,%d4                  | n = n0 - 7 ..
        move.l  %d0,%d5
        addq.l  #7,%d5                  | .. n0 + 7
        moveq   #-12,%d0                | clamped to the track's range
        moveq   #12,%d1
        cmpi.l  #5,%d3
        jbeq    qz_as_clamp
        moveq   #-64,%d0
        moveq   #63,%d1
qz_as_clamp:
        cmp.l   %d0,%d4
        jbge    qz_as_lo_ok
        move.l  %d0,%d4
qz_as_lo_ok:
        cmp.l   %d1,%d5
        jble    qz_as_hi_ok
        move.l  %d1,%d5
qz_as_hi_ok:
        move.l  %d2,%a0                 | the best raw so far: r itself (none found)
        move.l  #0x7fff,%d6             | its distance
qz_as_loop:
        cmp.l   %d5,%d4
        jbgt    qz_as_done
        move.l  %d4,%d0
        addi.l  #120,%d0
        moveq   #12,%d1
        divu.l  %d1,%d0                 | (n + 120) / 12 ...
        mulu.l  %d1,%d0
        move.l  %d4,%d1
        addi.l  #120,%d1
        sub.l   %d0,%d1                 | ... pc = (n + 120) mod 12
        btst    %d1,%d7
        jbeq    qz_as_next
        move.l  %d4,%d0
        muls.l  %d3,%d0
        addi.l  #64,%d0                 | c = 64 + u n
        move.l  %d0,%d1
        sub.l   %d2,%d1
        jbpl    qz_as_abs
        neg.l   %d1
qz_as_abs:
        cmp.l   %d6,%d1
        jbge    qz_as_next              | not nearer (a tie keeps the lower, found first)
        move.l  %d1,%d6
        movea.l %d0,%a0
qz_as_next:
        addq.l  #1,%d4
        jbra    qz_as_loop
qz_as_done:
        move.l  %a0,%d0
        movem.l (%sp),%d1-%d7/%a0
        lea     32(%sp),%sp
        rts

| ---- (2.15) the chord a held [TRIG] key previews: jmp planted at 0x400439d6 ------
| 0x400438fc(_, press) plays the UI MIDI track's step under a [TRIG] key in
| GRID RECORDING: its four notes into 28(sp)..31(sp) (the step's NOTE lock or
| the Part's NOTE, + the NOT2..4 locks or the Part's - 64; no TRAN, no KEY),
| then at 0x400439d6 -- the hook, 8 bytes: a test of the press argument on the stack and a branch to 0x40043b1c when it is 0 --
| the press sends each note that is not negative through 0x4009e9a8 (the
| note-on, or the arpeggiator's add), the release recomputes the four the
| same way and sends their note-offs. The snap goes on both, so the release
| turns off what the press turned on. d0 / d1 / a0 / a1 are free (stock
| reloads each); a2 is saved.
qz_mprev:
        tst.b   NV_SCALE
        jbeq    qz_mv_replay            | OFF: stock
        mvz.b   UI_TRACK,%d0            | the track the preview plays
        btst    %d0,NV_MOFF
        jbne    qz_mv_replay            | MIDI n SCALE OFF: stock
        move.l  %a2,-(%sp)
        lea     32(%sp),%a2             | the four notes (28(sp) before the push)
        jbsr    qz_mv_one
        jbsr    qz_mv_one
        jbsr    qz_mv_one
        jbsr    qz_mv_one
        movea.l (%sp)+,%a2
qz_mv_replay:
        tst.l   40(%sp)                 | displaced: the press?
        jbeq    qz_mv_rel               | displaced: the branch on a release (to 0x40043b1c)
        jmp     0x400439de
qz_mv_rel:
        jmp     0x40043b1c
qz_mv_one:                              | (a2)+ snapped when it is a note (not negative)
        mvs.b   (%a2),%d0
        jbmi    qz_mv_next
        jbsr    qz_msnap
        move.b  %d0,(%a2)
qz_mv_next:
        addq.l  #1,%a2
        rts

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

| 0x4004fbfe: a test of the long at 0x46c7dd26 and a short branch to 0x4004fc44 when it is set (8 bytes) -> jmp qz_leg1.
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

| 0x4004fc94: the same test and a short branch to 0x4004fcb2 when it is clear (8 bytes) -> jmp qz_leg2.
| d2 = track, d3 = the new key + 1; the pitch is staged (0x4004fc84..fc90).
| The legato press posts stock's own trigless word through 0x4004fc9c
| (`mailbox |= 0x119`). Measured 24 Sep 2026: that word does not restart the
| voice or the AMP envelope (a 64-step attack does not recur), but every
| trig word -- this one, FUNC + key, a fresh note -- is followed by the same
| 2.3 dB / 200 ms level step on the synth voice; posting 0x111 (mailbox bit
| 3 dropped: frame flag 0x20, 0x4000b5fc, event-byte bit 3, 0x4000c662)
| changed nothing about it, so the stock word is kept.
qz_leg2:
        .if     HAVE_PANEL_TRANSACTION
        jbsr    qz_leg2_select
        tst.l   %d0
        jbeq    qz_leg2_legacy_fresh
        jmp     0x4004fc9c
qz_leg2_legacy_fresh:
        jbsr    qz_panel_legacy_key
        jmp     0x4004fcb2
qz_leg2_select:
        .endif
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
        .if     HAVE_PANEL_TRANSACTION
        move.l  (%sp),%d0
        cmpi.l  #qz_panel_selected,%d0
        jbne    qz_g2_poly_legacy
        moveq   #1,%d0
        move.l  %d0,20(%sp)            | this FM transaction's private deferred legato intent
        jbra    qz_g2_poly_record
qz_g2_poly_legacy:
        .endif
        movea.l KIND_FLEX,%a0           | paraphonic legato: the engine's po_legkey (-28) -- the sounding
        movea.l -28(%a0),%a0            | chord follows this key (the flag before the trig it waits for)
        move.l  %d3,%d0
        jsr     (%a0)
        .if     HAVE_PANEL_TRANSACTION
qz_g2_poly_record:
        .endif
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
        .if     HAVE_SYDRUM
        .if     HAVE_PANEL_TRANSACTION
        move.l  (%sp),%d0
        cmpi.l  #qz_panel_selected,%d0
        jbeq    qz_g2_mono_mark         | this FM mono selector has no envelope-recharge intent
        .endif
        jbsr    qz_is_synth             | (2.11) a synth track: the engine's po_legkey (-28) hears the key --
        jbeq    qz_g2_mono_mark         | SY DRUM recharges its envelopes at the key's trigless frame (FM and
        movea.l qz_clock,%a0            | samples: nothing); the engine there (its clock published)?
        move.l  %a0,%d0
        jbeq    qz_g2_mono_mark
        movea.l KIND_FLEX,%a0
        movea.l -28(%a0),%a0
        move.l  %d3,%d0
        jsr     (%a0)
qz_g2_mono_mark:
        .endif
        lea     qz_legato(%pc),%a0
        move.b  %d3,(%a0)               | ... and the live recorder records it as trigless (qz_leg3)
qz_g2_trigless:
        .if     HAVE_PANEL_TRANSACTION
        moveq   #1,%d0
        rts
        .else
        jmp     0x4004fc9c
        .endif
qz_g2_trig:
        .if     HAVE_PANEL_TRANSACTION
        moveq   #0,%d0
        rts
        .else
        lea     qz_pkey,%a0             | the engine is told which key this trig is (index + 1) on EVERY
        move.b  %d3,(%a0,%d2.l)         | fresh-note trig (BUILD 28: the mono voice's sy_cold reads it as its
        jmp     0x4004fcb2              | condition (d) -- a live key, not a sequencer trig -- and clears it at
                                        | the START; po_start does the same for a paraphonic voice, a sample
                                        | track's START clears it in sy_no; before, only the paraphonic path posted it)
        .endif

| 0x4004fce0: the same test and a short branch to 0x4004fcf8 when it is clear (8 bytes) -> jmp qz_leg3. The
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
| 0x4004fd06, after the recorder returned: the release of 8 stack bytes, a test of d0
| and a short branch to 0x4004fd3e when it is negative (6 bytes) -> jmp qz_leg4. d0 = the step the press was recorded on
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
| lock write for the key: the release of 20 stack bytes and a short branch to 0x4004fd3e (6 bytes) -> jmp
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

| 0x4004fbde, the release path: the track's held-key byte read unsigned into d1 and a2
| copied into d0 (6 bytes) -> jmp qz_leg0. a0 = HELD, d2 = track, a2 = the key index; stock
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

| (2.22) rows 7 and 8, TRACK and FOLLOW: the per-track switch of 2.15 (MIDI)
| and 2.19 (AUDIO), one pair of rows instead of sixteen. TRACK only picks the
| track the next row shows -- AUDIO 1 .. AUDIO 8, then MIDI 1 .. MIDI 8 -- and
| changes no sound: it is qz_trk, a byte of this unit's RAM (0 = AUDIO 1 at
| every power-on, not saved). FOLLOW is that track's switch: ON (the track
| follows SCALE and ROOT, the default) / OFF (the track is stock, as with
| SCALE OFF), the same bits as before -- bit t of NV_AOFF for AUDIO t+1, bit
| t of NV_MOFF for MIDI t+1, set = OFF -- so the bytes, the project-file lines
| and every path that tests them are 2.21's. The window draws every visible
| row's getter at each redraw, so FOLLOW reads the newly picked track's bit
| as soon as TRACK moves. The setters' (delta, wrap) as the other rows': the
| LEVEL knob and the arrows step (clamped: TRACK stops at AUDIO 1 and MIDI 8,
| FOLLOW at OFF and ON), [YES] wraps (TRACK: past MIDI 8 -> AUDIO 1; FOLLOW
| toggles).
qz_get_trk:                             | "AUDIO 1" .. "MIDI 8"
        jbsr    qz_trk_of
        lea     qz_trknames(%pc),%a0
        move.l  (%a0,%d0.l*4),%d0
        rts
qz_set_trk:
        lea     qz_trk(%pc),%a0
        moveq   #15,%d1
        jbra    qz_set_any
qz_get_fol:                             | "ON" / "OFF": the TRACK row's track
        jbsr    qz_trk_of
        moveq   #8,%d1
        cmp.l   %d1,%d0
        jblt    qz_get_a                | 0..7: AUDIO d0+1
        sub.l   %d1,%d0                 | 8..15: MIDI d0-7
        jbra    qz_get_m
qz_set_fol:                             | (delta, wrap) at 4(sp) / 8(sp), as the setter jumped to
        jbsr    qz_trk_of
        moveq   #8,%d1
        cmp.l   %d1,%d0
        jblt    qz_set_a
        sub.l   %d1,%d0
        jbra    qz_set_m
qz_trk_of:                              | d0 := qz_trk, 0..15 (clobbers a0)
        lea     qz_trk(%pc),%a0
        mvz.b   (%a0),%d0
        moveq   #15,%d1
        and.l   %d1,%d0
        rts

| The MIDI track d0's switch (2.15): the value is bit d0 of NV_MOFF.
qz_get_m:
        mvz.b   NV_MOFF,%d1
        btst    %d0,%d1
        jbne    qz_gm_off
        lea     qz_s_on(%pc),%a0
        move.l  %a0,%d0
        rts
qz_gm_off:
        lea     qz_n0(%pc),%a0          | "OFF"
        move.l  %a0,%d0
        rts
qz_set_m:                               | d0 = the track; (delta, wrap) at 4(sp) / 8(sp)
        move.l  %d2,-(%sp)              | (8(sp) / 12(sp) now)
        move.l  %d0,%d2
        mvz.b   NV_MOFF,%d1
        moveq   #0,%d0                  | the row's value: 0 = OFF ...
        btst    %d2,%d1
        jbne    qz_sm_add
        moveq   #1,%d0                  | ... 1 = ON
qz_sm_add:
        add.l   8(%sp),%d0
        tst.l   12(%sp)
        jbeq    qz_sm_clamp
        moveq   #1,%d1                  | [YES]: wrap -- a toggle
        and.l   %d1,%d0
        jbra    qz_sm_put
qz_sm_clamp:
        tst.l   %d0
        jble    qz_sm_off
        moveq   #1,%d0
        jbra    qz_sm_put
qz_sm_off:
        moveq   #0,%d0
qz_sm_put:
        mvz.b   NV_MOFF,%d1
        bclr    %d2,%d1
        tst.l   %d0
        jbne    qz_sm_store
        bset    %d2,%d1                 | OFF
qz_sm_store:
        move.b  %d1,NV_MOFF
        move.l  (%sp)+,%d2
        rts

| The audio track d0's switch (2.19): as the MIDI one, on NV_AOFF.
qz_get_a:
        mvz.b   NV_AOFF,%d1
        btst    %d0,%d1
        jbne    qz_gm_off
        lea     qz_s_on(%pc),%a0
        move.l  %a0,%d0
        rts
qz_set_a:                               | d0 = the track; (delta, wrap) at 4(sp) / 8(sp)
        move.l  %d2,-(%sp)              | (8(sp) / 12(sp) now)
        move.l  %d0,%d2
        mvz.b   NV_AOFF,%d1
        moveq   #0,%d0                  | the row's value: 0 = OFF ...
        btst    %d2,%d1
        jbne    qz_sa_add
        moveq   #1,%d0                  | ... 1 = ON
qz_sa_add:
        add.l   8(%sp),%d0
        tst.l   12(%sp)
        jbeq    qz_sa_clamp
        moveq   #1,%d1                  | [YES]: wrap -- a toggle
        and.l   %d1,%d0
        jbra    qz_sa_put
qz_sa_clamp:
        tst.l   %d0
        jble    qz_sa_off
        moveq   #1,%d0
        jbra    qz_sa_put
qz_sa_off:
        moveq   #0,%d0
qz_sa_put:
        mvz.b   NV_AOFF,%d1
        bclr    %d2,%d1
        tst.l   %d0
        jbne    qz_sa_store
        bset    %d2,%d1                 | OFF
qz_sa_store:
        move.b  %d1,NV_AOFF
        move.l  (%sp)+,%d2
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
        clr.b   NV_MOFF                 | (2.15) every MIDI track follows
        clr.b   NV_AOFF                 | (2.19) every audio track follows
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
        move.l  %d3,%a0
        lea     qz_key4(%pc),%a1
        jbsr     qz_l_cmp
        jbeq     qz_l_moff
        move.l  %d3,%a0
        lea     qz_key5(%pc),%a1
        jbsr     qz_l_cmp
        jbeq     qz_l_aoff
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
        jbra    qz_l_store
qz_l_moff:                              | (2.15) the MIDI tracks with the scale OFF, a mask 0..255
        jbsr     qz_l_dec
        cmpi.l  #255,%d0
        jbls     qz_l_mok
        moveq   #0,%d0                  | out of range: every track follows
qz_l_mok:
        lea     NV_MOFF,%a0
        jbra    qz_l_store
qz_l_aoff:                              | (2.19) the audio tracks with the scale OFF, a mask 0..255
        jbsr     qz_l_dec
        cmpi.l  #255,%d0
        jbls     qz_l_aok
        moveq   #0,%d0                  | out of range: every track follows
qz_l_aok:
        lea     NV_AOFF,%a0
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
        mvz.b   NV_MOFF,%d0             | (2.15)
        lea     qz_fmt4(%pc),%a0
        jbsr     qz_wr_line
        mvz.b   NV_AOFF,%d0             | (2.19)
        lea     qz_fmt5(%pc),%a0
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
qz_key4:        .asciz  "#SEQUENCER_MIDI_SCALE_OFF="
qz_fmt4:        .asciz  "#SEQUENCER_MIDI_SCALE_OFF=%d\r\n"
qz_key5:        .asciz  "#SEQUENCER_AUDIO_SCALE_OFF="
qz_fmt5:        .asciz  "#SEQUENCER_AUDIO_SCALE_OFF=%d\r\n"
qz_lbl_trk:     .asciz  "TRACK"
qz_lbl_fol:     .asciz  "FOLLOW"
qz_s_on:        .asciz  "ON"
qz_lbl_scale:   .asciz  "SCALE"
qz_lbl_root:    .asciz  "ROOT"
qz_lbl_glide:   .asciz  "GLIDE"
        .balign 4
qz_gbuf:        .fill   8, 1, 0          | the GLIDE row's number (RAM)
qz_ofmt:        .fill   8, 1, 0          | the keyboard's octave format with ROOT's name: "A# %d" (RAM)
qz_legato:      .byte   0                | the press in flight is a legato one (qz_leg2 -> qz_leg3)
qz_synthq:      .byte   0                | qz_quant runs for a synth track (> 0) or a MIDI note (< 0, 2.13; qz_pcof reads it)
qz_trk:         .byte   0                | (2.22) the TRACK row: 0..7 = AUDIO 1..8, 8..15 = MIDI 1..8 (RAM, not saved)
        .balign 4
qz_chain:       .long   0                | ... and continues a held note: that note's start (ticks), 0 = a fresh note
qz_mbias:       .long   0                | (2.18) qz_pcof's MIDI bias: 0 for NOTE, NOTE + 8 for NOT2..4 (qz_quantm / qz_quantmb)
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
qz_trknames:                            | (2.22) TRACK 0..15 -> its name (7 characters at most, as qz_names)
        .long   qz_t0
        .long   qz_t1
        .long   qz_t2
        .long   qz_t3
        .long   qz_t4
        .long   qz_t5
        .long   qz_t6
        .long   qz_t7
        .long   qz_t8
        .long   qz_t9
        .long   qz_t10
        .long   qz_t11
        .long   qz_t12
        .long   qz_t13
        .long   qz_t14
        .long   qz_t15
qz_t0:  .asciz  "AUDIO 1"
qz_t1:  .asciz  "AUDIO 2"
qz_t2:  .asciz  "AUDIO 3"
qz_t3:  .asciz  "AUDIO 4"
qz_t4:  .asciz  "AUDIO 5"
qz_t5:  .asciz  "AUDIO 6"
qz_t6:  .asciz  "AUDIO 7"
qz_t7:  .asciz  "AUDIO 8"
qz_t8: .asciz  "MIDI 1"
qz_t9: .asciz  "MIDI 2"
qz_t10: .asciz  "MIDI 3"
qz_t11: .asciz  "MIDI 4"
qz_t12: .asciz  "MIDI 5"
qz_t13: .asciz  "MIDI 6"
qz_t14: .asciz  "MIDI 7"
qz_t15: .asciz  "MIDI 8"
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
        .include "remix.inc"             | second pass: panel publication adapters
qz_end:
