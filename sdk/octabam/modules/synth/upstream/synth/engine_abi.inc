| SYNTH MACHINE -- the equates shared by its units (poly.s, machine.s) and by the
| machine modules that run on its engine (sy-drum/sydrum.s). GNU as. Not assembled
| on its own: each unit's manifest reads this file into the unit's `remix.inc`
| (octabam's Linked.include, written per remix beside the unit), after the remix's
| flags (HAVE_SYDRUM: 1 when SY DRUM is in the remix). One copy, so the units cannot
| disagree about an address or a record layout. Values only: no code, no data.

| ---- OS 1.40C addresses (all read by the units; nothing here is stock code) ----
        .set    NIBBLE, 0x46104d0c       | the packer's per-track DSP command byte (bit 4: a voice START this frame)
        .set    PITCH_TAB, 0x400aa294    | the stock 2^(x/12) curve, longs Q26 (index = PTCH word >> 5)
        .set    CURVALS, 0x80000810      | the frame builder's per-track live lane, 72 B a track, locks applied
        .set    CV_STRIDE, 72
        .set    CV_WORDS, 0x80000a50     | + 64 * track: the lane's value words (byte << 8) the frame builder copies on
        .set    CV_SLEW, 0x80000db4      | + 32 * track: their slew counters, a long per four lane bytes (0 = take the lane's)
        .set    PART_PTR, 0x46c82456     | the bank blob; the Part = blob + part index * 6322
        .set    PART_IDX, 0x100b14cf     | the current Part's index
        .set    PART_SHADOW, 0x1001614e  | the bank's mirror in battery RAM: + part * 6322 + the Part offset = that byte's shadow
        .set    MACH_OFF, 0x8eda2        | Part + track: the machine byte (0 STATIC, 1 FLEX, 2 THRU, 3 NEIGHBOR, 4 PICKUP)
        .set    SIG_OFF, 0x8edbc         | Part + 30 * track: the NEIGHBOR PLAYBACK column's first three bytes, the
                                         | machine list's signature of a FLEX track ("FM", 1 / "SY", 1; machine.s)
        .set    FLEX_P, 0x400d31ae       | the stock FLEX PLAYBACK descriptor (P form) ...
        .set    FLEX_DESC_LEN, 0x192     | ... 402 bytes, the source of every runtime page clone
        .set    PING_AT, 0x800000e0      | the frame builder's ping (the record set being built this frame)
        .set    SPRINTF, 0x40013a08      | stock's sprintf (buf, format, ...)
        .set    FUNC_HELD, 0x46c7dd26    | nonzero while [FUNCTION] is down (the stock knob handlers' tst.l)
        .set    FUNC_ENC_OFF, 0x800000a0 | PERSONALIZE: DISABLE FUNCTION + ENCODER (the stock handlers' gate)
        .set    KEY_HELD, 0x46c7d8de+0x10 | + code * 0x18: nonzero while that key is held
        .set    PUSH_CODE, 0x38          | the encoder push switches: key codes 0x38..0x3d = A..F
        .set    KN_SLOTS, 0x12a          | a page descriptor's six knob handler pointers
        .set    FM_DESC, 0x400d24d0      | page.s's fm_descriptor (the pinned page cave's first routine): d0 := the FM
                                         | SYNTH page clone, built on first use (d0/d1/a0/a1 clobbered)

| ---- the engine's numbers ----
        .set    C4_INC, 25480119         | C4: 261.6256 / 44100 * 2^32
        .set    ENV_ONE, 0x01000000      | the index envelope's 1.0 (Q24)
        .set    INC_MAX, 0x73000000      | a carrier above ~19.8 kHz (increment > 0.45 cycle a sample) is no note
                                         | of this synth: the safety net resets such a voice (24 Sep 2026; raised
                                         | from 8 kHz on 27 Sep 2026 for PTCH +63 and the octave shapes)

| ---- po_clock (poly.s): the sequencer clock, its fields ----
        .set    CK_TICKS, 0              | ticks seen (monotonic, no pattern wrap)
        .set    CK_TPS, 4                | ticks a step (the largest tick value seen + 1; 0 = not yet)
        .set    CK_FPS, 8                | frames a step (measured between step changes; 345 until then)
        .set    CK_FRAMES, 12            | frames seen

| ---- sy_state (poly.s): the per-track record, the fields another engine shares ----
        .set    ST_STRIDE, 128
        .set    S_GAIN, 24               | the mono voice's level, Q15 (po_mono_env: the AMP envelope)
        .set    S_ON, 36                 | bit 0: the playing voice is an engine's; bit 1: released; bit 2: STOPPED (unused since 2.12)
        .set    S_GPREV, 38              | word: the level the last rendered call ended at (0 = silent: cold)

| ---- po_voices (poly.s): a voice record, the fields another engine shares ----
        .set    V_STRIDE, 64
        .set    V_GAIN, 24               | Q15 (the mono voice's S_GAIN format)
        .set    V_GPREV, 60              | word: the level the last rendered frame ended at
