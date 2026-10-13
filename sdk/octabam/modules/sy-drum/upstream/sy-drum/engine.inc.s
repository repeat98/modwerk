| SY DRUM: original fixed-point implementation of the design study / tools/sy1_model.py (the development
| line's engine (8 Oct 2026), without its CHECK-build shadow block; its
| three references to SYNTH MACHINE's poly.s state -- po_clock, sy_state, po_voices --
| absolute, the unit being a separate one now). Not assembled on its own: sy-drum's
| manifest reads it into its unit's remix.inc after synth/engine_abi.inc (the equates it
| shares with the FM engine). No stock firmware bytes are embedded.
| All public bsr entrypoints preserve every register and use the stock fractional
| EMAC convention (acc0 clear on entry/return, as po_rate). Side records deliberately
| use 128 bytes: independent ramps never alias the full FM track/voice records.
|
| Public interface:
| sy1_mono_trigger  a3 track, d0 0=cold / nonzero=warm
| sy1_voice_trigger a0 voice, d0 0=cold / nonzero=warm
| sy1_mono_frame    a3 track, a4 parameter record, d6 slewed pitch word
| sy1_voice_frame   a6 voice, a4 parameter record, d6 slewed pitch word
| sy1_mono_render   a3 track, a1 output L long, d7 sample count; writes L/R,
|                   updates S_GPREV (caller proceeds to the mono tail mixer).
| sy1_voice_render  a6 voice, a1 output L sum, d7 count; adds c*gain to L,
|                   updates V_GPREV (caller performs the usual doubling/clamp).
| sy1_carry         a3 mono track, a1 destination voice; copies all side state.
| sy1_mod_tick      once per global audio frame, after setup parameter refresh;
|                   uses po_clock.CK_FRAMES, advances every track even when silent.
| sy1_mod_capture   a3 track; sample TRI at a real trigger (mono_trigger calls it).
| sy1_mod_params    8 rows of bytes {SPEED, DEPTH, WAVE, SH}; WAVE 0/1/2.
| sy1_mod_state     free-running modulation state, never reset by a note.
|
| Calibration constants U1..U12 correspond to the design's unsettled analog values.
| Run sy-drum/tools/gen_tables.py after changing table-dependent constants.
| The generator reads the named table-dependent constants; all tables are ORIGINAL data.
        .set SY1_U1_C4_INC, C4_INC       | U1: PTCH retains semitone keyboard tracking
        .set SY1_U1_INC_MIN, 48696       | 0.5 Hz, Q32 cycles at 44100 Hz
        .set SY1_U2_SWEEP_SCALE, 1       | one SWEP raw unit = one semitone
        .set SY1_U2_SPEED_MIN_US, 20000  | SPED raw 0; clockwise lengthens tau
        .set SY1_U2_SPEED_MAX_US, 1100000 | SPED raw 127
        .set SY1_U3_D_EG2_BOTH, 0        | 0: Bergfors routing; 1: EG2 also bends VCO1
        .set SY1_U3_D_OCT_Q16, 131072
        .set SY1_U4_RAISE_Q16, 65536     | VCO2 one octave higher in C/D/E
        .set SY1_OFF2_Q16, 2125          | log2(450/440), calibration trimmer
        .set SY1_U5_FM_OCT_NUM, 3        | table law: 3/2 octaves peak modulation
        .set SY1_U5_FM_OCT_DEN, 2
        .set SY1_U6_DEC_MIN_US, 6000
        .set SY1_U6_DEC_MAX_US, 2500000
        .set SY1_U6_TUNE_NUM, 1         | tau2 tracking exponent 1/2
        .set SY1_U6_TUNE_DEN, 2
        .set SY1_U7_POLE1_INC, 38956619  | 400 Hz * 2^32 / 44100
        .set SY1_U7_POLE2_INC, 155826478 | 1600 Hz * 2^32 / 44100
        .set SY1_P1_BYPASS_Q16, 368976   | generated bus bound for pole 1
        .set SY1_P2_BYPASS_Q16, 237903   | tracked legacy bus bound; preserves open transition
        .set SY1_U7_TRACK2_NUM, 213
        .set SY1_U7_TRACK2_DEN, 100
        .set SY1_U7_WIDTH_OCT, 6
        .set SY1_U7_CLOSE_OCT, 3        | added closing range at WDTH 0; none at 127
        .set SY1_U7_E_VCF_Q16, 65536
        .set SY1_U8_NOISE_MUL, 1664525
        .set SY1_U8_NOISE_ADD, 1013904223
        .set SY1_U8_NOISE_SEED, 0x12345678
        .set SY1_U9_C_MIX1_NUM, 1        | C = (w1 + 2*w2)/3
        .set SY1_U9_C_MIX1_DEN, 2
        .set SY1_U10_N_RISE, 16
        .set SY1_U10_E_RATE_Q16, 59804   | generated log2(2*N/(N+1)), Q16
        .set SY1_E_RATE_Q29, 1010580540 | generated 2*N/(N+1), Q29
        .set SY1_U11_NORMALIZE, 1        | C,D normalized to Q14 full scale
| U12: original LFO/S&H voltage gains and 100kA taper await hardware calibration.
| .4..50 Hz follows the clone QSG; original Pearl endpoints remain unmeasured.
| The circuit takes S&H from TRI before WAVE/DEPTH, through its own CV resistor.
        .set SY1_U12_RATE_MIN_MHZ, 400
        .set SY1_U12_RATE_MAX_MHZ, 200000 | upper extension of 3 Oct 2026 (1 Oct 2026: 100000); lower half unchanged
        .set SY1_U12_RATE_LEGACY_MAX_MHZ, 50000
        .set SY1_U12_RATE_KNEE_RAW, 64
        .set SY1_U12_TRI_RANGE_SEMI, 24
        .set SY1_U12_SQ_RANGE_SEMI, 24
        .set SY1_U12_SH_RANGE_SEMI, 24
        .set SY1_U12_DEPTH_EXP_NUM, 1     | normalized linear default, not a measured A taper
        .set SY1_U12_DEPTH_EXP_DEN, 1
        .set SY1_SH_GAIN_Q13, 16384       | generated from independent SH range

        .set M_STRIDE, 32
        .set M_PHASE, 0                 | Q32 cycles, free-running from global frame clock
        .set M_FRAME, 4                 | last CK_FRAMES seen; unsigned delta wraps correctly
        .set M_TRI, 8                   | raw TRI, signed Q16 (-65536..65536)
        .set M_HELD, 12                 | captured selected waveform; independent of DEPTH
        .set M_OFFSET, 16               | total modulation, signed Q16 octaves
        .set M_LFO, 20                  | continuous WAVE/DEPTH contribution, Q16 octaves
        .set M_RANDOM, 24               | cached raw RND Q16 (-65536..65535)
        .set M_RANDOM_KEY, 28           | continuous counter represented by the cache
        .set MR_STRIDE, 8               | separate continuous / trigger counter streams
        .set MR_CONT, 0
        .set MR_SH, 4
        .set SY1_RANDOM_STEP, 0x9e3779b9 | odd Weyl step; full-period counter
        .set MP_SPEED, 0
        .set MP_DEPTH, 1
        .set MP_WAVE, 2
        .set MP_SH, 3

        .set Y_STRIDE, 128
        .set Y_PH1, 0
        .set Y_PH2, 4
        .set Y_E1, 8                    | Q24, recharge at every trigger
        .set Y_E2, 12
        .set Y_Y1, 16                   | filter states Q20 (avoid DC bias at low cutoff)
        .set Y_Y2, 20
        .set Y_NOISE, 24
        .set Y_I1, 28                   | running Q32 increment; five contiguous controls
        .set Y_I2, 32
        .set Y_AMP, 36                  | running VCA envelope Q24
        .set Y_G1, 40                   | running pole coefficients Q19
        .set Y_G2, 44
        .set Y_DI1, 48                  | increments use Q32 steps; AMP/G1/G2 use Q30 steps
        .set Y_DI2, 52
        .set Y_DAMP, 56
        .set Y_DG1, 60
        .set Y_DG2, 64
        .set Y_CV, 68                   | previous frame's tune bus, Q16 octaves
        .set Y_MODE, 72
        .set Y_FLAGS, 76                | bit 0=recharged, bit 1=cold (prime controls)
        .set Y_TARGETS, 80              | five frame targets (80..99)
        .set Y_MOD, 100                 | this track's dedicated LFO + S&H, Q16 octaves

        .align 4
sy1_kind:
        .fill 8,1,0
sy1_tracks:
        .fill 8*Y_STRIDE,1,0
sy1_voices:
        .fill 32*Y_STRIDE,1,0
sy1_mod_params:
        .fill 8*4,1,0
sy1_mod_state:
        .long 0, 0, 0, 0, 0, 0, 22562, 0xe407730a
        .long 0, 0, 0, 0, 0, 0, 40650, 0x113d2ddb
        .long 0, 0, 0, 0, 0, 0, -18468, 0xc041698d
        .long 0, 0, 0, 0, 0, 0, 29986, 0xf211e8e8
        .long 0, 0, 0, 0, 0, 0, 65153, 0xf40fc810
        .long 0, 0, 0, 0, 0, 0, 28303, 0x0bc648ef
        .long 0, 0, 0, 0, 0, 0, 12830, 0x4294735a
        .long 0, 0, 0, 0, 0, 0, -52823, 0x721571ba
| Per-track/domain seeds = mix32(0x53593100 + 2*track + domain).
| Counters are independent of note resets and the Mode F audio-noise state.
sy1_mod_random_state:
        .long 0xe407730a, 0xe0349a40
        .long 0x113d2ddb, 0x30aba685
        .long 0xc041698d, 0x887fdcfa
        .long 0xf211e8e8, 0x7ee03268
        .long 0xf40fc810, 0x635e1803
        .long 0x0bc648ef, 0x3f4d65fd
        .long 0x4294735a, 0xd2a27759
        .long 0x721571ba, 0x67a69a67
sy1_state_end:

| Every track's oscillator advances independently of voice lifetime. CK_FRAMES
| delta, rather than a note's frame count, also handles skipped idle callbacks
| and the global counter's uint32 wrap. Parameter changes use the new rate for
| elapsed frames; the normal setup/tick callback runs every audio frame.
sy1_mod_tick:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  po_clock+CK_FRAMES,%d7   | (absolute: po_clock is poly.s's, another unit)
        lea     sy1_mod_params(%pc),%a4
        lea     sy1_mod_state(%pc),%a5
        lea     sy1_mod_random_state(%pc),%a6
        moveq   #8,%d2
sy1_mod_next:
        mvz.b   MP_SPEED(%a4),%d1
        cmpi.l  #127,%d1
        bls     sy1_mod_speed
        moveq   #127,%d1
sy1_mod_speed:
        lea     sy1_lfo_rate(%pc),%a0
        move.l  (%a0,%d1.l*4),%d0       | Q32 cycles per 16-sample frame
        move.l  %d7,%d1
        sub.l   M_FRAME(%a5),%d1
        beq     sy1_mod_phase_ready
        cmpi.l  #1,%d1
        bne     sy1_mod_phase_delta
        add.l   %d0,M_PHASE(%a5)
        bcc     sy1_mod_phase_ready
        move.l  #SY1_RANDOM_STEP,%d0
        add.l   %d0,MR_CONT(%a6)         | one fresh continuous draw per full LFO cycle
        bra     sy1_mod_phase_ready
sy1_mod_phase_delta:
        move.l  M_PHASE(%a5),%d3
        bsr     sy1_mod_advance          | exact 64-bit product, bounded for large idle gaps
        move.l  %d0,M_PHASE(%a5)
        move.l  #SY1_RANDOM_STEP,%d0
        mulu.l  %d1,%d0
        add.l   %d0,MR_CONT(%a6)         | skip counters in O(1), never loop once per cycle
sy1_mod_phase_ready:
        move.l  %d7,M_FRAME(%a5)
        move.l  M_PHASE(%a5),%d0
        bsr     sy1_mod_triangle
        move.l  %d0,M_TRI(%a5)
        mvz.b   MP_WAVE(%a4),%d1
        cmpi.l  #3,%d1
        beq     sy1_mod_depth_random
        subq.l  #1,%d1
        cmpi.l  #1,%d1
        bhi     sy1_mod_lfo_off          | WAVE 0 or invalid: continuous LFO off
        tst.l   %d1
        beq     sy1_mod_depth_tri
        move.l  #65536,%d0              | SQ opposite TRI derivative: negative while rising
        tst.l   M_PHASE(%a5)
        bmi     sy1_mod_depth_square
        neg.l   %d0
sy1_mod_depth_square:
        lea     sy1_lfo_sq_depth(%pc),%a0
        bra     sy1_mod_depth
sy1_mod_depth_random:
        tst.b   MP_SH(%a4)
        bne     sy1_mod_lfo_off          | RND+SH changes pitch only when triggered
        move.l  MR_CONT(%a6),%d0
        cmp.l   M_RANDOM_KEY(%a5),%d0
        beq     sy1_mod_random_cached
        move.l  %d0,M_RANDOM_KEY(%a5)
        bsr     sy1_mod_random
        move.l  %d0,M_RANDOM(%a5)
sy1_mod_random_cached:
        move.l  M_RANDOM(%a5),%d0
sy1_mod_depth_tri:
        lea     sy1_lfo_tri_depth(%pc),%a0
sy1_mod_depth:
        mvz.b   MP_DEPTH(%a4),%d1
        cmpi.l  #127,%d1
        bls     sy1_mod_depth_read
        moveq   #127,%d1
sy1_mod_depth_read:
        mvz.w   (%a0,%d1.l*2),%d1       | calibrated octaves at this depth, Q13
        muls.l  %d1,%d0
        asr.l   #8,%d0
        asr.l   #5,%d0                  | continuous offset, Q16 octaves
        bra     sy1_mod_lfo_store
sy1_mod_lfo_off:
        moveq   #0,%d0
sy1_mod_lfo_store:
        move.l  %d0,M_LFO(%a5)
        bsr     sy1_mod_sum
        addq.l  #4,%a4
        lea     M_STRIDE(%a5),%a5
        addq.l  #MR_STRIDE,%a6
        subq.l  #1,%d2
        bne     sy1_mod_next
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| sy1_mod_phase_tick (the development line's load cut of 8 Oct 2026, its exact form) --
| sy1_mod_tick's phase part alone (M_PHASE, M_FRAME,
| MR_CONT: the same instructions), for a frame with no SY DRUM track (sy1_kind 1):
| the outputs (M_TRI / M_LFO / M_RANDOM / M_OFFSET) have no reader then (sy1_mono_frame,
| sy1_voice_frame, sy1_mod_capture run for kind-1 tracks alone). The state that integrates
| over time stays exactly as the full tick leaves it, so the frame a track becomes kind 1
| (sd_trigger) recomputes the outputs with sy1_mod_tick (delta 0: no second advance) and every
| reader sees the values the full tick would have given.
sy1_mod_phase_tick:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  po_clock+CK_FRAMES,%d7   | (absolute: po_clock is poly.s's, another unit)
        lea     sy1_mod_params(%pc),%a4
        lea     sy1_mod_state(%pc),%a5
        lea     sy1_mod_random_state(%pc),%a6
        moveq   #8,%d2
1:      mvz.b   MP_SPEED(%a4),%d1
        cmpi.l  #127,%d1
        bls     2f
        moveq   #127,%d1
2:      lea     sy1_lfo_rate(%pc),%a0
        move.l  (%a0,%d1.l*4),%d0       | Q32 cycles per 16-sample frame
        move.l  %d7,%d1
        sub.l   M_FRAME(%a5),%d1
        beq     5f
        cmpi.l  #1,%d1
        bne     4f
        add.l   %d0,M_PHASE(%a5)
        bcc     5f
        move.l  #SY1_RANDOM_STEP,%d0
        add.l   %d0,MR_CONT(%a6)
        bra     5f
4:      move.l  M_PHASE(%a5),%d3
        bsr     sy1_mod_advance
        move.l  %d0,M_PHASE(%a5)
        move.l  #SY1_RANDOM_STEP,%d0
        mulu.l  %d1,%d0
        add.l   %d0,MR_CONT(%a6)
5:      move.l  %d7,M_FRAME(%a5)
        addq.l  #4,%a4
        lea     M_STRIDE(%a5),%a5
        addq.l  #MR_STRIDE,%a6
        subq.l  #1,%d2
        bne     1b
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
sy1_mod_skipf:
        .long   0                       | CK_FRAMES of the last frame po_tick ran the phase part alone


| d0 rate, d1 elapsed frames, d3 old phase -> d0 new phase, d1 cycle count.
| Clobbers d3-d6/a0. Four unsigned 16-bit limbs form the exact 64-bit product;
| delta can span uint32 frame wrap, without losing complete random periods.
sy1_mod_advance:
        move.l  %d3,%a0
        move.l  %d1,%d5
        swap    %d5
        andi.l  #65535,%d5
        move.l  %d0,%d6
        swap    %d6
        andi.l  #65535,%d6
        andi.l  #65535,%d0
        andi.l  #65535,%d1
        move.l  %d0,%d3
        mulu.l  %d1,%d3                 | low*low
        mulu.l  %d5,%d0                 | low*high
        mulu.l  %d6,%d1                 | high*low
        mulu.l  %d5,%d6                 | high*high
        move.l  %d0,%d4
        swap    %d4
        andi.l  #65535,%d4
        add.l   %d4,%d6
        move.l  %d1,%d4
        swap    %d4
        andi.l  #65535,%d4
        add.l   %d4,%d6
        andi.l  #65535,%d0
        andi.l  #65535,%d1
        add.l   %d1,%d0
        move.l  %d3,%d4
        swap    %d4
        andi.l  #65535,%d4
        add.l   %d4,%d0                 | middle limb, including carry from low*low
        move.l  %d0,%d1
        swap    %d1
        andi.l  #65535,%d1
        add.l   %d1,%d6
        swap    %d0
        clr.w   %d0
        andi.l  #65535,%d3
        add.l   %d3,%d0
        move.l  %d6,%d1
        move.l  %a0,%d3
        add.l   %d3,%d0
        bcc     sy1_mod_advance_done
        addq.l  #1,%d1
sy1_mod_advance_done:
        rts

| d0 counter -> raw uniform Q16 [-1,1), clobbers d1 only. Murmur3's bijective
| 32-bit finalizer scrambles the counter; each 17-bit result has exactly 2^15
| preimages. No modulo bias, no oscillator/noise state shared across tracks.
sy1_mod_random:
        move.l  %d0,%d1
        swap    %d1
        andi.l  #65535,%d1
        eor.l   %d1,%d0
        move.l  #0x85ebca6b,%d1
        mulu.l  %d1,%d0
        move.l  %d0,%d1
        lsr.l   #8,%d1
        lsr.l   #5,%d1
        eor.l   %d1,%d0
        move.l  #0xc2b2ae35,%d1
        mulu.l  %d1,%d0
        move.l  %d0,%d1
        swap    %d1
        andi.l  #65535,%d1
        eor.l   %d1,%d0
        lsr.l   #8,%d0
        lsr.l   #7,%d0
        subi.l  #65536,%d0
        rts

| Internal waveform: d0 phase Q32 -> d0 raw TRI Q16; no other clobbers.
sy1_mod_triangle:
        asr.l   #8,%d0
        asr.l   #6,%d0
        bpl     sy1_mod_tri_abs
        neg.l   %d0
sy1_mod_tri_abs:
        subi.l  #65536,%d0
        rts

| Internal sum: a4 params, a5 modulation record; clobbers d0,d1 only.
sy1_mod_sum:
        move.l  M_HELD(%a5),%d0         | capacitor holds even after SH switches off
        .if SY1_SH_GAIN_Q13 == 16384
        add.l   %d0,%d0                 | nominal independent S&H +/-2 octaves
        .else
        move.l  #SY1_SH_GAIN_Q13,%d1
        muls.l  %d1,%d0
        asr.l   #8,%d0
        asr.l   #5,%d0
        .endif
sy1_mod_sum_lfo:
        add.l   M_LFO(%a5),%d0
        move.l  %d0,M_OFFSET(%a5)
        rts

| Public trigger sampler. It never resets phase, speed or the continuous LFO.
| SH off captures ground AT THE NEXT TRIGGER; toggling off retains the stored
| voltage until then. OFF/TRI sample raw TRI, SQR samples comparator polarity;
| RND advances its own stream on every trigger, independent of LFO speed.
sy1_mod_capture:
        lea     -24(%sp),%sp
        movem.l %d0-%d1/%a0/%a4-%a5/%a6,(%sp)
        move.l  %a3,%d1
        lea     sy_state,%a0             | (absolute: poly.s's)
        sub.l   %a0,%d1                 | track * 128
        lsr.l   #2,%d1
        lea     sy1_mod_state(%pc),%a5
        adda.l  %d1,%a5                 | track * 32
        lsr.l   #3,%d1
        lea     sy1_mod_params(%pc),%a4
        adda.l  %d1,%a4                 | track * 4
        moveq   #0,%d0
        tst.b   MP_SH(%a4)
        beq     sy1_mod_capture_store
        mvz.b   MP_WAVE(%a4),%d0
        cmpi.l  #3,%d0
        beq     sy1_mod_capture_random
        subq.l  #2,%d0
        beq     sy1_mod_capture_square
        move.l  M_PHASE(%a5),%d0
        bsr     sy1_mod_triangle
        bra     sy1_mod_capture_store
sy1_mod_capture_square:
        move.l  #65536,%d0
        tst.l   M_PHASE(%a5)
        bmi     sy1_mod_capture_store
        neg.l   %d0
        bra     sy1_mod_capture_store
sy1_mod_capture_random:
        clr.l   M_LFO(%a5)              | no rate-clocked random motion under triggered RND
        move.l  %a3,%d1
        lea     sy_state,%a0             | (absolute: poly.s's)
        sub.l   %a0,%d1
        lsr.l   #4,%d1                  | track * 128 -> random record * 8
        lea     sy1_mod_random_state+MR_SH(%pc),%a6
        adda.l  %d1,%a6
        move.l  #SY1_RANDOM_STEP,%d0
        add.l   %d0,(%a6)
        move.l  (%a6),%d0
        bsr     sy1_mod_random
sy1_mod_capture_store:
        move.l  %d0,M_HELD(%a5)
        bsr     sy1_mod_sum
        movem.l (%sp),%d0-%d1/%a0/%a4-%a5/%a6
        lea     24(%sp),%sp
        rts

| Internal address helpers. d1/a0 scratch; output a0.
sy1_track_ptr:
        move.l  %a3,%d1
        lea     sy_state,%a0             | (absolute: poly.s's)
        sub.l   %a0,%d1
        lea     sy1_tracks(%pc),%a0      | both have stride 128
        adda.l  %d1,%a0
        rts
sy1_voice_ptr:
        move.l  %a6,%d1
        lea     po_voices,%a0            | (absolute: poly.s's)
        sub.l   %a0,%d1
        add.l   %d1,%d1                 | voice stride 64 -> side stride 128
        lea     sy1_voices(%pc),%a0
        adda.l  %d1,%a0
        rts

sy1_mono_trigger:
        bsr     sy1_mod_capture
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0/%a6,(%sp)
        bsr     sy1_track_ptr
        bra     sy1_trigger
sy1_voice_trigger:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0/%a6,(%sp)
        move.l  %a0,%a6
        bsr     sy1_voice_ptr
sy1_trigger:
        tst.l   %d0
        bne     sy1_trigger_warm
        move.l  %a0,%a6
        moveq   #Y_STRIDE/4,%d1
sy1_trigger_clear:
        clr.l   (%a6)+
        subq.l  #1,%d1
        bne     sy1_trigger_clear
        move.l  #SY1_U8_NOISE_SEED,%d1
        move.l  %d1,Y_NOISE(%a0)
        move.b  #2,Y_FLAGS(%a0)
sy1_trigger_warm:
        move.l  #ENV_ONE,%d1
        move.l  %d1,Y_E1(%a0)
        move.l  %d1,Y_E2(%a0)
        bset    #0,Y_FLAGS(%a0)
        movem.l (%sp),%d0-%d1/%a0/%a6
        lea     16(%sp),%sp
        rts

sy1_carry:
        lea     -24(%sp),%sp
        movem.l %d0-%d1/%a0-%a2/%a6,(%sp)
        move.l  %a1,%a6
        bsr     sy1_track_ptr
        move.l  %a0,%a2
        bsr     sy1_voice_ptr
        moveq   #Y_STRIDE/4,%d0
sy1_carry_loop:
        move.l  (%a2)+,(%a0)+
        subq.l  #1,%d0
        bne     sy1_carry_loop
        movem.l (%sp),%d0-%d1/%a0-%a2/%a6
        lea     24(%sp),%sp
        rts

sy1_mono_frame:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        bsr     sy1_track_ptr
        lsr.l   #2,%d1                  | track*128 -> modulation record track*32
        lea     sy1_mod_state(%pc),%a1
        move.l  M_OFFSET(%a1,%d1.l),%d0
        move.l  %d0,Y_MOD(%a0)
        bra     sy1_frame
sy1_voice_frame:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        bsr     sy1_voice_ptr
sy1_frame:
        move.l  %a0,%a5
        mvz.w   2(%a4),%d0              | MODE's lane can be LFO-modulated
        lsr.l   #8,%d0
        cmpi.l  #5,%d0
        bls     sy1_frame_mode
        moveq   #5,%d0
sy1_frame_mode:
        move.l  %d0,Y_MODE(%a5)
        btst    #0,Y_FLAGS(%a5)
        bne     sy1_frame_recharged
        mvz.w   8(%a4),%d0              | SPED (integer page value)
        lsr.l   #8,%d0
        cmpi.l  #127,%d0
        bls     sy1_frame_speed
        moveq   #127,%d0
sy1_frame_speed:
        lea     sy1_k1(%pc),%a0
        move.l  (%a0,%d0.l*4),%d0       | exact 1-exp(-16/(sr*tau1)), Q31
        move.l  Y_E1(%a5),%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        tst.l   %d0
        bne     sy1_frame_e1_step
        tst.l   Y_E1(%a5)
        beq     sy1_frame_e1_step
        moveq   #1,%d0                  | an exponential tail must eventually reach zero
sy1_frame_e1_step:
        sub.l   %d0,Y_E1(%a5)
        mvz.w   10(%a4),%d0             | DEC -> dt/tau2 at C4, Q26
        lsr.l   #8,%d0
        cmpi.l  #127,%d0
        bls     sy1_frame_decay
        moveq   #127,%d0
sy1_frame_decay:
        lea     sy1_decay_x(%pc),%a0
        move.l  (%a0,%d0.l*4),%d4
        move.l  Y_CV(%a5),%d0           | previous bus, as the float oracle
        .if SY1_U6_TUNE_NUM != 1
        move.l  #SY1_U6_TUNE_NUM,%d1
        muls.l  %d1,%d0
        .endif
        moveq   #SY1_U6_TUNE_DEN,%d1
        divs.l  %d1,%d0
        bsr     sy1_pow_scaled
        bsr     sy1_decay_loss
        move.l  Y_E2(%a5),%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        tst.l   %d0
        bne     sy1_frame_e2_step
        tst.l   Y_E2(%a5)
        beq     sy1_frame_e2_step
        moveq   #1,%d0
sy1_frame_e2_step:
        sub.l   %d0,Y_E2(%a5)
sy1_frame_recharged:
        bclr    #0,Y_FLAGS(%a5)
        move.l  %d6,%d0
        subi.l  #0x4000,%d0
        lsl.l   #6,%d0
        moveq   #15,%d1
        divs.l  %d1,%d0                 | word / (12*SEMI) -> Q16 octaves
        add.l   Y_MOD(%a5),%d0           | dedicated LFO/S&H enter the common tune-CV bus
        move.l  %d0,%d7                 | base note, before sweep
        mvz.w   6(%a4),%d0
        neg.l   %d0
        addi.l  #0x4000,%d0
        lsl.l   #6,%d0
        moveq   #3,%d1
        divs.l  %d1,%d0                 | -(SWEP-64)/12, Q16 octaves
        .if SY1_U2_SWEEP_SCALE != 1
        move.l  #SY1_U2_SWEEP_SCALE,%d1
        muls.l  %d1,%d0
        .endif
        move.l  Y_E1(%a5),%d1
        lsl.l   #6,%d1                  | EG1 Q30 (1.0 stays positive)
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        add.l   %d0,%d0
        add.l   %d7,%d0
        move.l  %d0,Y_CV(%a5)
        .if SY1_U3_D_EG2_BOTH
        move.l  Y_MODE(%a5),%d1
        cmpi.l  #3,%d1
        bne     sy1_frame_f1
        move.l  Y_E2(%a5),%d1
        .if SY1_U3_D_OCT_Q16 == 131072
        lsr.l   #7,%d1
        .else
        lsl.l   #6,%d1
        move.l  #SY1_U3_D_OCT_Q16,%d3
        mac.l   %d1,%d3,%acc0
        movclr.l %acc0,%d1
        add.l   %d1,%d1
        .endif
        add.l   %d1,%d0
        .endif
sy1_frame_f1:
        move.l  #SY1_U1_C4_INC,%d4
        bsr     sy1_frequency
        move.l  %d0,Y_TARGETS(%a5)
        move.l  Y_CV(%a5),%d0
        move.l  Y_MODE(%a5),%d1
        cmpi.l  #3,%d1
        bne     sy1_frame_cv2
        move.l  Y_E2(%a5),%d0
        .if SY1_U3_D_OCT_Q16 == 131072
        lsr.l   #7,%d0                  | D_OCT=2 * EG2, Q16 octaves
        .else
        lsl.l   #6,%d0
        move.l  #SY1_U3_D_OCT_Q16,%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        add.l   %d0,%d0
        .endif
        add.l   %d7,%d0                 | mode D: no EG1 on VCO2
sy1_frame_cv2:
        addi.l  #SY1_OFF2_Q16,%d0
        move.l  Y_MODE(%a5),%d1
        subq.l  #2,%d1
        cmpi.l  #2,%d1
        bhi     sy1_frame_f2
        addi.l  #SY1_U4_RAISE_Q16,%d0
sy1_frame_f2:
        move.l  #SY1_U1_C4_INC,%d4
        bsr     sy1_frequency
        move.l  Y_MODE(%a5),%d1
        cmpi.l  #4,%d1
        bne     sy1_frame_f2_store
        move.l  #SY1_E_RATE_Q29,%d1
        mac.l   %d0,%d1,%acc0           | E scales the already clamped VCO2
        movclr.l %acc0,%d0
        cmpi.l  #INC_MAX/4,%d0
        bls     sy1_frame_e_rate
        move.l  #INC_MAX/4,%d0
sy1_frame_e_rate:
        lsl.l   #2,%d0
sy1_frame_f2_store:
        move.l  %d0,Y_TARGETS+4(%a5)
        move.l  Y_E2(%a5),Y_TARGETS+8(%a5)
        mvz.w   4(%a4),%d0              | WDTH, fractional lane values retained
        move.l  #SY1_U7_WIDTH_OCT*256,%d1
        mulu.l  %d1,%d0
        moveq   #127,%d1
        divu.l  %d1,%d0                 | width octaves, Q16
        move.l  %d0,%d2
        .if SY1_U7_WIDTH_OCT == 2*SY1_U7_CLOSE_OCT
        lsr.l   #1,%d2
        .else
        move.l  #SY1_U7_CLOSE_OCT,%d1
        mulu.l  %d1,%d2
        move.l  #SY1_U7_WIDTH_OCT,%d1
        divu.l  %d1,%d2
        .endif
        subi.l  #SY1_U7_CLOSE_OCT*65536,%d2 | -3*(1-WDTH/127), outside EG2
        move.l  Y_E2(%a5),%d1
        lsl.l   #6,%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        add.l   %d0,%d0
        add.l   Y_CV(%a5),%d0
        move.l  Y_MODE(%a5),%d1
        cmpi.l  #4,%d1
        bne     sy1_frame_vcf
        addi.l  #SY1_U7_E_VCF_Q16,%d0
sy1_frame_vcf:
        move.l  %d0,%d7
        add.l   %d2,%d0                 | close both poles by the same octaves
        cmpi.l  #SY1_P1_BYPASS_Q16,%d0
        bge     sy1_frame_p1_bypass
        move.l  #SY1_U7_POLE1_INC,%d4
        bsr     sy1_frequency
        bsr     sy1_lp_coefficient
        bra     sy1_frame_p1_store
sy1_frame_p1_bypass:
        move.l  #524288,%d0
sy1_frame_p1_store:
        move.l  %d0,Y_TARGETS+12(%a5)
        move.l  %d7,%d0
        move.l  #SY1_U7_TRACK2_NUM,%d1
        muls.l  %d1,%d0
        moveq   #SY1_U7_TRACK2_DEN,%d1
        divs.l  %d1,%d0
        add.l   %d2,%d0                 | do not multiply the closing range by 2.13
        cmpi.l  #SY1_P2_BYPASS_Q16,%d0
        bge     sy1_frame_p2_bypass
        move.l  #SY1_U7_POLE2_INC,%d4
        bsr     sy1_frequency
        bsr     sy1_lp_coefficient
        bra     sy1_frame_p2_store
sy1_frame_p2_bypass:
        move.l  #524288,%d0
sy1_frame_p2_store:
        move.l  %d0,Y_TARGETS+16(%a5)
        lea     Y_I1(%a5),%a0
        lea     Y_DI1(%a5),%a1
        lea     Y_TARGETS(%a5),%a2
        moveq   #5,%d2
        btst    #1,Y_FLAGS(%a5)
        bne     sy1_frame_prime
sy1_frame_ramps:
        move.l  (%a2)+,%d0
        sub.l   (%a0)+,%d0
        asr.l   #4,%d0
        move.l  %d0,(%a1)+
        subq.l  #1,%d2
        bne     sy1_frame_ramps
        bra     sy1_frame_done
sy1_frame_prime:                        | first cold frame starts at its true controls
        move.l  (%a2)+,(%a0)+
        clr.l   (%a1)+
        subq.l  #1,%d2
        bne     sy1_frame_prime
        bclr    #1,Y_FLAGS(%a5)
sy1_frame_done:
        move.l  Y_DAMP(%a5),%d0
        lsl.l   #6,%d0
        move.l  %d0,Y_DAMP(%a5)
        move.l  Y_DG1(%a5),%d0
        lsl.l   #8,%d0
        lsl.l   #3,%d0
        move.l  %d0,Y_DG1(%a5)
        move.l  Y_DG2(%a5),%d0
        lsl.l   #8,%d0
        lsl.l   #3,%d0
        move.l  %d0,Y_DG2(%a5)
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| d0 octave exponent Q16, d4 positive base -> saturating scale*2^x.
| Stock PITCH_TAB is read at runtime, with interpolation (no firmware copied).
| Preserves d2,d5-d7,a1-a6; scratch d0,d1,d3,d4,a0. acc0 clear on return.
sy1_pow_scaled:
        tst.l   %d0
        bne     sy1_pow_nonzero
        move.l  %d4,%d0
        rts
sy1_pow_nonzero:
        move.l  %d0,%d1
        swap    %d1
        ext.l   %d1                     | floor exponent (negative fractions work)
        cmpi.l  #-20,%d1
        blt     sy1_pow_zero
        cmpi.l  #20,%d1
        bgt     sy1_pow_max
        mvz.w   %d0,%d0
        move.l  #480,%d3
        mulu.l  %d3,%d0
        move.l  %d0,%d3
        swap    %d3
        mvz.w   %d3,%d3
        lea     PITCH_TAB+128,%a0
        lea     (%a0,%d3.l*4),%a0
        mvz.w   %d0,%d0
        lsl.l   #8,%d0
        lsl.l   #7,%d0                  | fraction Q31
        move.l  (%a0),%d3
        move.l  %d3,%acc0
        msac.l  %d0,%d3,4(%a0),%d3,%acc0
        mac.l   %d0,%d3,%acc0
        movclr.l %acc0,%d0              | mantissa Q26
        cmpi.l  #0x04000000,%d4
        bhs     sy1_pow_large
        lsl.l   #5,%d4
        mac.l   %d0,%d4,%acc0
        movclr.l %acc0,%d0
        bra     sy1_pow_shift
sy1_pow_large:
        mac.l   %d0,%d4,%acc0
        movclr.l %acc0,%d0
        lsl.l   #5,%d0
sy1_pow_shift:
        tst.l   %d1
        bmi     sy1_pow_down
        move.l  #0x7fffffff,%d3
        lsr.l   %d1,%d3
        cmp.l   %d3,%d0
        bhi     sy1_pow_max
        lsl.l   %d1,%d0
        rts
sy1_pow_down:
        neg.l   %d1
        lsr.l   %d1,%d0
        rts
sy1_pow_zero:
        moveq   #0,%d0
        rts
sy1_pow_max:
        move.l  #0x7fffffff,%d0
        rts
sy1_frequency:
        bsr     sy1_pow_scaled
        cmpi.l  #INC_MAX,%d0
        bls     sy1_frequency_low
        move.l  #INC_MAX,%d0
        rts
sy1_frequency_low:
        cmpi.l  #SY1_U1_INC_MIN,%d0
        bhs     sy1_frequency_done
        move.l  #SY1_U1_INC_MIN,%d0
sy1_frequency_done:
        rts

| d0=dt/tau Q26 -> 1-exp(-dt/tau), Q31. The small-x quadratic
| avoids table-chord bias on long decays; at x<1/32 its relative error is
| below 0.017%, falling quadratically. Larger x uses 257 original points.
sy1_decay_loss:
        cmpi.l  #2097152,%d0
        bhs     sy1_loss_lookup
        lsl.l   #5,%d0                  | x Q31
        mac.l   %d0,%d0,%acc0
        movclr.l %acc0,%d1
        lsr.l   #1,%d1
        sub.l   %d1,%d0                 | x - x*x/2
        rts
sy1_loss_lookup:
        cmpi.l  #8*67108864,%d0
        bhs     sy1_pow_max              | effectively instant when tau is very short
        move.l  %d0,%d1
        moveq   #21,%d3
        lsr.l   %d3,%d1
        lea     sy1_loss(%pc),%a0
        lea     (%a0,%d1.l*4),%a0
        andi.l  #2097151,%d0
        lsl.l   #8,%d0
        lsl.l   #2,%d0                  | fraction Q31
        move.l  (%a0),%d1
        move.l  %d1,%acc0
        msac.l  %d0,%d1,4(%a0),%d1,%acc0
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        rts

| d0=pole increment Q32 -> g=w/(1+w), Q19; INC_MAX bypasses a stage.
sy1_lp_coefficient:
        cmpi.l  #INC_MAX,%d0
        bhs     sy1_lp_bypass
        move.l  #1686629713,%d1          | 2*pi/8, Q31
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d1
        lsr.l   #8,%d1
        lsr.l   #5,%d1                  | w Q16 = 2*pi*increment/65536
        addi.l  #65536,%d1
        move.l  #0x80000000,%d0
        divu.l  %d1,%d0
        neg.l   %d0
        addi.l  #32768,%d0
        lsl.l   #4,%d0                  | Q19 gives smooth sub-Q15 frame ramps
        rts
sy1_lp_bypass:
        move.l  #524288,%d0
        rts

| Render wrappers save their callers' complete state. a4=side record;
| d5/d6=running phase increments, a5=AMP-page gain Q15.16, a6=its sample step;
| a2=mode dispatch address; d3/d4=VCF coefficients Q30, a3=VCA Q30.
| The original FM-compatible record pointer is saved in the local stack slot.
sy1_mono_render:
        lea     -68(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        clr.l   60(%sp)                 | mono output
        bsr     sy1_track_ptr
        move.l  %a0,%a4
        move.l  S_GAIN(%a3),%d0
        mvz.w   S_GPREV(%a3),%d1
        bra     sy1_render_setup
sy1_voice_render:
        lea     -68(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        moveq   #1,%d0
        move.l  %d0,60(%sp)             | sum output
        move.l  %a6,%a3
        bsr     sy1_voice_ptr
        move.l  %a0,%a4
        move.l  V_GAIN(%a3),%d0
        mvz.w   V_GPREV(%a3),%d1
sy1_render_setup:
        move.l  %a3,64(%sp)
        tst.l   %d7
        beq     sy1_render_return
        sub.l   %d1,%d0
        lsl.l   #8,%d0
        lsl.l   #4,%d0                  | delta << 16 / 16; frame slope, even for a split call
        move.l  %d0,%a6
        swap    %d1
        clr.w   %d1
        move.l  %d1,%a5
        move.l  Y_I1(%a4),%d5
        move.l  Y_I2(%a4),%d6
        move.l  Y_MODE(%a4),%d0
        lea     sy1_mode_vectors(%pc),%a0
        movea.l (%a0,%d0.l*4),%a2
        move.l  Y_G1(%a4),%d3
        lsl.l   #8,%d3
        lsl.l   #3,%d3
        move.l  Y_G2(%a4),%d4
        lsl.l   #8,%d4
        lsl.l   #3,%d4
        move.l  Y_AMP(%a4),%d0
        lsl.l   #6,%d0
        move.l  %d0,%a3
sy1_sample:
        add.l   Y_DI1(%a4),%d5
        add.l   %d5,Y_PH1(%a4)
        add.l   Y_DI2(%a4),%d6
        jmp     (%a2)
sy1_sample_a:
        add.l   %d6,Y_PH2(%a4)
        move.l  Y_PH1(%a4),%d1
        swap    %d1
        ext.l   %d1
        bpl     sy1_a_abs
        neg.l   %d1
sy1_a_abs:
        subi.l  #16384,%d1
        bra     sy1_filter
sy1_sample_c:
        add.l   %d6,Y_PH2(%a4)
        move.l  Y_PH1(%a4),%d0
        swap    %d0
        ext.l   %d0
        bpl     sy1_inline_c_tri1_abs
        neg.l   %d0
sy1_inline_c_tri1_abs:
        subi.l  #16384,%d0
        move.l  Y_PH2(%a4),%d1
        swap    %d1
        ext.l   %d1
        bpl     sy1_inline_c_tri2_abs
        neg.l   %d1
sy1_inline_c_tri2_abs:
        subi.l  #16384,%d1
        .if SY1_U9_C_MIX1_DEN == 2
        add.l   %d1,%d1
        .elseif SY1_U9_C_MIX1_DEN != 1
        moveq   #SY1_U9_C_MIX1_DEN,%d2
        muls.l  %d2,%d1
        .endif
        .if SY1_U9_C_MIX1_NUM != 1
        moveq   #SY1_U9_C_MIX1_NUM,%d2
        muls.l  %d2,%d0
        .endif
        add.l   %d0,%d1
        .if SY1_U11_NORMALIZE
        moveq   #SY1_U9_C_MIX1_NUM+SY1_U9_C_MIX1_DEN,%d2
        divs.l  %d2,%d1
        .endif
        bra     sy1_filter
sy1_sample_d:
        add.l   %d6,Y_PH2(%a4)
        move.l  Y_PH1(%a4),%d0
        swap    %d0
        ext.l   %d0
        bpl     sy1_inline_d_tri1_abs
        neg.l   %d0
sy1_inline_d_tri1_abs:
        subi.l  #16384,%d0
        move.l  Y_PH2(%a4),%d1
        swap    %d1
        ext.l   %d1
        bpl     sy1_inline_d_tri2_abs
        neg.l   %d1
sy1_inline_d_tri2_abs:
        subi.l  #16384,%d1
        add.l   %d0,%d1
        .if SY1_U11_NORMALIZE
        asr.l   #1,%d1
        .endif
        bra     sy1_filter
sy1_two_triangles:
        move.l  Y_PH1(%a4),%d0
        swap    %d0
        ext.l   %d0
        bpl     sy1_tri1_abs
        neg.l   %d0
sy1_tri1_abs:
        subi.l  #16384,%d0
        move.l  Y_PH2(%a4),%d1
        swap    %d1
        ext.l   %d1
        bpl     sy1_tri2_abs
        neg.l   %d1
sy1_tri2_abs:
        subi.l  #16384,%d1
        rts
sy1_sample_b:
        move.l  Y_PH1(%a4),%d0
        addi.l  #0x00040000,%d0          | round full phase BEFORE folding: no tie bias
        moveq   #19,%d1
        asr.l   %d1,%d0
        bpl     sy1_inline_b_fm_abs
        neg.l   %d0
sy1_inline_b_fm_abs:                             | folded index 0..4096 = triangle + 1
        lea     sy1_fm(%pc),%a0
        move.l  (%a0,%d0.l*4),%d1
        move.l  %d6,%d0
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        cmpi.l  #INC_MAX/16,%d0
        bls     sy1_inline_b_fm_increment
        move.l  #INC_MAX/16,%d0
sy1_inline_b_fm_increment:
        lsl.l   #4,%d0
        add.l   %d0,Y_PH2(%a4)
        move.l  Y_PH2(%a4),%d1
        swap    %d1
        ext.l   %d1
        bpl     sy1_b_abs
        neg.l   %d1
sy1_b_abs:
        subi.l  #16384,%d1
        bra     sy1_filter
sy1_sample_e:
        move.l  Y_PH1(%a4),%d0
        addi.l  #0x00040000,%d0          | round full phase BEFORE folding: no tie bias
        moveq   #19,%d1
        asr.l   %d1,%d0
        bpl     sy1_inline_e_fm_abs
        neg.l   %d0
sy1_inline_e_fm_abs:                             | folded index 0..4096 = triangle + 1
        lea     sy1_fm(%pc),%a0
        move.l  (%a0,%d0.l*4),%d1
        move.l  %d6,%d0
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        cmpi.l  #INC_MAX/16,%d0
        bls     sy1_inline_e_fm_increment
        move.l  #INC_MAX/16,%d0
sy1_inline_e_fm_increment:
        lsl.l   #4,%d0
        add.l   %d0,Y_PH2(%a4)
        move.l  Y_PH2(%a4),%d1
        addi.l  #0x00040000,%d1          | nearest of 8192 original pseudo-saw points
                                         | max error 0.002106 FS at N_RISE=16 (0.21%)
        moveq   #19,%d0
        lsr.l   %d0,%d1
        lea     sy1_saw(%pc),%a0
        mvs.w   (%a0,%d1.l*2),%d1
        bra     sy1_filter
sy1_sample_f:
        add.l   %d6,Y_PH2(%a4)
        move.l  Y_NOISE(%a4),%d1
        move.l  #SY1_U8_NOISE_MUL,%d0
        mulu.l  %d0,%d1
        addi.l  #SY1_U8_NOISE_ADD,%d1
        move.l  %d1,Y_NOISE(%a4)
        swap    %d1
        mvz.w   %d1,%d1
        lsr.l   #1,%d1
        subi.l  #16384,%d1
        bra     sy1_filter

| Exp-FM: positive factor 2^(FM_OCT*triangle), never linear FM or phase FM.
| Table Q27, nearest of 4097 triangle points (max pitch error 0.44 cent).
| A pre-shift clamp avoids
| any unsigned overflow when a high VCO2 is multiplied by the FM factor.
sy1_exponential_fm:
        move.l  Y_PH1(%a4),%d0
        addi.l  #0x00040000,%d0          | round full phase BEFORE folding: no tie bias
        moveq   #19,%d1
        asr.l   %d1,%d0
        bpl     sy1_fm_abs
        neg.l   %d0
sy1_fm_abs:                             | folded index 0..4096 = triangle + 1
        lea     sy1_fm(%pc),%a0
        move.l  (%a0,%d0.l*4),%d1
        move.l  %d6,%d0
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
        cmpi.l  #INC_MAX/16,%d0
        bls     sy1_fm_increment
        move.l  #INC_MAX/16,%d0
sy1_fm_increment:
        lsl.l   #4,%d0
        add.l   %d0,Y_PH2(%a4)
        rts

sy1_filter:
        lsl.l   #6,%d1                  | x Q14 -> Q20
        add.l   Y_DG1(%a4),%d3          | coefficient Q30, 1.0 is positive
        sub.l   Y_Y1(%a4),%d1
        mac.l   %d3,%d1,%acc0
        movclr.l %acc0,%d1
        add.l   %d1,%d1
        add.l   %d1,Y_Y1(%a4)
        add.l   Y_DG2(%a4),%d4
        move.l  Y_Y1(%a4),%d1
        sub.l   Y_Y2(%a4),%d1
        mac.l   %d4,%d1,%acc0
        movclr.l %acc0,%d1
        add.l   %d1,%d1
        add.l   %d1,Y_Y2(%a4)
        adda.l  Y_DAMP(%a4),%a3
        move.l  %a3,%d0                 | VCA envelope Q30
        move.l  Y_Y2(%a4),%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d1
        asr.l   #5,%d1                  | filtered sample * EG2 -> Q14
        adda.l  %a6,%a5
        move.l  %a5,%d2
        swap    %d2
        tst.l   60(%sp)
        bne     sy1_sample_sum
        mvz.w   %d2,%d2                 | mono gain may be 32768: positive long multiply
        muls.l  %d2,%d1
        add.l   %d1,%d1
        clr.w   %d1
        move.l  %d1,(%a1)+
        move.l  %d1,(%a1)+
        bra     sy1_sample_next
sy1_sample_sum:
        muls.w  %d2,%d1
        add.l   %d1,(%a1)
        addq.l  #8,%a1
sy1_sample_next:
        subq.l  #1,%d7
        bne     sy1_sample
        move.l  %d5,Y_I1(%a4)
        move.l  %d6,Y_I2(%a4)
        lsr.l   #8,%d3
        lsr.l   #3,%d3
        move.l  %d3,Y_G1(%a4)
        lsr.l   #8,%d4
        lsr.l   #3,%d4
        move.l  %d4,Y_G2(%a4)
        move.l  %a3,%d0
        asr.l   #6,%d0
        move.l  %d0,Y_AMP(%a4)
        movea.l 64(%sp),%a3
        move.l  %a5,%d0
        swap    %d0
        mvz.w   %d0,%d0
        cmpi.l  #32768,%d0
        bls     sy1_render_gain
        moveq   #0,%d0
sy1_render_gain:
        tst.l   60(%sp)
        bne     sy1_render_poly_gain
        move.w  %d0,S_GPREV(%a3)
        bra     sy1_render_return
sy1_render_poly_gain:
        move.w  %d0,V_GPREV(%a3)
sy1_render_return:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     68(%sp),%sp
        rts

        .align 4
sy1_mode_vectors:
        .long sy1_sample_a,sy1_sample_b,sy1_sample_c,sy1_sample_d,sy1_sample_e,sy1_sample_f

| BEGIN GENERATED MODEL TABLES -- sy-drum/tools/gen_tables.py
| Original mathematical data; no captured firmware bytes.
        .align 4
sy1_lfo_rate:
        .long 623306, 647459, 672548, 698610, 725681, 753801
        .long 783011, 813353, 844870, 877609, 911617, 946942
        .long 983636, 1021752, 1061345, 1102473, 1145194, 1189570
        .long 1235666, 1283548, 1333286, 1384951, 1438618, 1494365
        .long 1552272, 1612422, 1674904, 1739807, 1807225, 1877255
        .long 1949999, 2025561, 2104052, 2185585, 2270276, 2358250
        .long 2449632, 2544556, 2643158, 2745581, 2851973, 2962487
        .long 3077284, 3196529, 3320395, 3449061, 3582713, 3721543
        .long 3865754, 4015552, 4171155, 4332788, 4500685, 4675087
        .long 4856247, 5044427, 5239900, 5442947, 5653862, 5872950
        .long 6100528, 6336924, 6582481, 6837553, 7102509, 7541876
        .long 8008423, 8503831, 9029886, 9588482, 10181634, 10811478
        .long 11480285, 12190466, 12944578, 13745341, 14595639, 15498538
        .long 16457291, 17475353, 18556393, 19704308, 20923233, 22217562
        .long 23591959, 25051378, 26601078, 28246643, 29994004, 31849459
        .long 33819694, 35911809, 38133344, 40492305, 42997194, 45657037
        .long 48481420, 51480522, 54665151, 58046784, 61637608, 65450562
        .long 69499390, 73798682, 78363931, 83211591, 88359131, 93825102
        .long 99629203, 105792350, 112336755, 119286003, 126665137, 134500750
        .long 142821081, 151656115, 161037692, 170999621, 181577803, 192810361
        .long 204737775, 217403028, 230851765, 245132452, 260296554, 276398721
        .long 293496982, 311652956
        .align 4
sy1_lfo_tri_depth:
        .word 0, 129, 258, 387, 516, 645
        .word 774, 903, 1032, 1161, 1290, 1419
        .word 1548, 1677, 1806, 1935, 2064, 2193
        .word 2322, 2451, 2580, 2709, 2838, 2967
        .word 3096, 3225, 3354, 3483, 3612, 3741
        .word 3870, 3999, 4128, 4257, 4386, 4515
        .word 4644, 4773, 4902, 5031, 5160, 5289
        .word 5418, 5547, 5676, 5805, 5934, 6063
        .word 6192, 6321, 6450, 6579, 6708, 6837
        .word 6966, 7095, 7224, 7353, 7482, 7611
        .word 7740, 7869, 7998, 8127, 8257, 8386
        .word 8515, 8644, 8773, 8902, 9031, 9160
        .word 9289, 9418, 9547, 9676, 9805, 9934
        .word 10063, 10192, 10321, 10450, 10579, 10708
        .word 10837, 10966, 11095, 11224, 11353, 11482
        .word 11611, 11740, 11869, 11998, 12127, 12256
        .word 12385, 12514, 12643, 12772, 12901, 13030
        .word 13159, 13288, 13417, 13546, 13675, 13804
        .word 13933, 14062, 14191, 14320, 14449, 14578
        .word 14707, 14836, 14965, 15094, 15223, 15352
        .word 15481, 15610, 15739, 15868, 15997, 16126
        .word 16255, 16384
        .align 4
sy1_lfo_sq_depth:
        .word 0, 129, 258, 387, 516, 645
        .word 774, 903, 1032, 1161, 1290, 1419
        .word 1548, 1677, 1806, 1935, 2064, 2193
        .word 2322, 2451, 2580, 2709, 2838, 2967
        .word 3096, 3225, 3354, 3483, 3612, 3741
        .word 3870, 3999, 4128, 4257, 4386, 4515
        .word 4644, 4773, 4902, 5031, 5160, 5289
        .word 5418, 5547, 5676, 5805, 5934, 6063
        .word 6192, 6321, 6450, 6579, 6708, 6837
        .word 6966, 7095, 7224, 7353, 7482, 7611
        .word 7740, 7869, 7998, 8127, 8257, 8386
        .word 8515, 8644, 8773, 8902, 9031, 9160
        .word 9289, 9418, 9547, 9676, 9805, 9934
        .word 10063, 10192, 10321, 10450, 10579, 10708
        .word 10837, 10966, 11095, 11224, 11353, 11482
        .word 11611, 11740, 11869, 11998, 12127, 12256
        .word 12385, 12514, 12643, 12772, 12901, 13030
        .word 13159, 13288, 13417, 13546, 13675, 13804
        .word 13933, 14062, 14191, 14320, 14449, 14578
        .word 14707, 14836, 14965, 15094, 15223, 15352
        .word 15481, 15610, 15739, 15868, 15997, 16126
        .word 16255, 16384
        .align 4
sy1_k1:
        .long 38605398, 37416778, 36264438, 35147292, 34064281, 33014380
        .long 31996593, 31009952, 30053518, 29126381, 28227653, 27356478
        .long 26512021, 25693473, 24900048, 24130985, 23385545, 22663009
        .long 21962681, 21283887, 20625969, 19988293, 19370242, 18771217
        .long 18190637, 17627940, 17082579, 16554025, 16041763, 15545294
        .long 15064137, 14597821, 14145892, 13707910, 13283445, 12872085
        .long 12473426, 12087079, 11712666, 11349820, 10998186, 10657418
        .long 10327184, 10007158, 9697026, 9396485, 9105239, 8823001
        .long 8549495, 8284450, 8027607, 7778712, 7537521, 7303795
        .long 7077305, 6857827, 6645145, 6439048, 6239335, 6045807
        .long 5858273, 5676549, 5500455, 5329816, 5164465, 5004238
        .long 4848976, 4698526, 4552739, 4411471, 4274582, 4141937
        .long 4013403, 3888855, 3768169, 3651225, 3537907, 3428103
        .long 3321704, 3218606, 3118705, 3021902, 2928102, 2837212
        .long 2749142, 2663803, 2581112, 2500986, 2423346, 2348116
        .long 2275219, 2204584, 2136141, 2069822, 2005561, 1943294
        .long 1882960, 1824498, 1767850, 1712960, 1659774, 1608239
        .long 1558303, 1509918, 1463034, 1417605, 1373587, 1330935
        .long 1289607, 1249562, 1210760, 1173163, 1136732, 1101433
        .long 1067230, 1034088, 1001976, 970860, 940711, 911498
        .long 883191, 855764, 829188, 803437, 778486, 754309
        .long 730884, 708185
        .align 4
sy1_decay_x:
        .long 4057981, 3869740, 3690231, 3519049, 3355807, 3200138
        .long 3051690, 2910129, 2775134, 2646401, 2523640, 2406574
        .long 2294938, 2188480, 2086961, 1990152, 1897833, 1809796
        .long 1725843, 1645785, 1569441, 1496637, 1427212, 1361006
        .long 1297872, 1237666, 1180254, 1125504, 1073294, 1023506
        .long 976028, 930752, 887576, 846404, 807141, 769699
        .long 733994, 699946, 667477, 636514, 606987, 578831
        .long 551980, 526375, 501957, 478672, 456468, 435293
        .long 415101, 395845, 377483, 359972, 343274, 327350
        .long 312165, 297684, 283875, 270707, 258149, 246174
        .long 234755, 223865, 213480, 203578, 194134, 185128
        .long 176541, 168351, 160542, 153095, 145993, 139221
        .long 132763, 126604, 120731, 115131, 109790, 104697
        .long 99840, 95209, 90792, 86581, 82564, 78734
        .long 75082, 71599, 68278, 65111, 62090, 59210
        .long 56463, 53844, 51346, 48965, 46693, 44527
        .long 42462, 40492, 38614, 36822, 35114, 33485
        .long 31932, 30451, 29038, 27691, 26407, 25182
        .long 24014, 22900, 21837, 20824, 19858, 18937
        .long 18059, 17221, 16422, 15660, 14934, 14241
        .long 13581, 12951, 12350, 11777, 11231, 10710
        .long 10213, 9739
        .align 4
sy1_loss:
        .long 0, 66071126, 130109457, 192177536, 252335980, 310643544
        .long 367157173, 421932060, 475021701, 526477946, 576351048, 624689717
        .long 671541160, 716951137, 760963995, 803622720, 844968974, 885043138
        .long 923884349, 961530542, 998018483, 1033383808, 1067661057, 1100883705
        .long 1133084200, 1164293990, 1194543556, 1223862440, 1252279277, 1279821820
        .long 1306516968, 1332390793, 1357468564, 1381774773, 1405333158, 1428166728
        .long 1450297783, 1471747937, 1492538139, 1512688694, 1532219282, 1551148976
        .long 1569496265, 1587279067, 1604514750, 1621220147, 1637411573, 1653104841
        .long 1668315278, 1683057739, 1697346622, 1711195882, 1724619045, 1737629221
        .long 1750239117, 1762461046, 1774306946, 1785788386, 1796916579, 1807702394
        .long 1818156364, 1828288700, 1838109296, 1847627744, 1856853340, 1865795095
        .long 1874461740, 1882861741, 1891003302, 1898894372, 1906542660, 1913955635
        .long 1921140537, 1928104382, 1934853973, 1941395900, 1947736553, 1953882125
        .long 1959838618, 1965611849, 1971207456, 1976630904, 1981887490, 1986982348
        .long 1991920454, 1996706631, 2001345552, 2005841748, 2010199611, 2014423397
        .long 2018517231, 2022485110, 2026330911, 2030058389, 2033671184, 2037172826
        .long 2040566733, 2043856220, 2047044501, 2050134689, 2053129802, 2056032764
        .long 2058846412, 2061573493, 2064216671, 2066778526, 2069261562, 2071668202
        .long 2074000798, 2076261628, 2078452899, 2080576752, 2082635261, 2084630436
        .long 2086564226, 2088438520, 2090255147, 2092015883, 2093722447, 2095376505
        .long 2096979673, 2098533517, 2100039554, 2101499256, 2102914047, 2104285309
        .long 2105614382, 2106902564, 2108151113, 2109361248, 2110534151, 2111670967
        .long 2112772808, 2113840748, 2114875831, 2115879068, 2116851439, 2117793893
        .long 2118707351, 2119592704, 2120450818, 2121282531, 2122088655, 2122869977
        .long 2123627260, 2124361243, 2125072645, 2125762159, 2126430459, 2127078198
        .long 2127706007, 2128314501, 2128904274, 2129475901, 2130029941, 2130566935
        .long 2131087408, 2131591867, 2132080806, 2132554702, 2133014017, 2133459201
        .long 2133890688, 2134308899, 2134714243, 2135107117, 2135487903, 2135856973
        .long 2136214688, 2136561397, 2136897440, 2137223143, 2137538826, 2137844796
        .long 2138141352, 2138428784, 2138707373, 2138977391, 2139239101, 2139492759
        .long 2139738613, 2139976902, 2140207861, 2140431713, 2140648678, 2140858968
        .long 2141062788, 2141260337, 2141451808, 2141637389, 2141817259, 2141991596
        .long 2142160568, 2142324342, 2142483077, 2142636929, 2142786047, 2142930577
        .long 2143070660, 2143206433, 2143338029, 2143465577, 2143589200, 2143709019
        .long 2143825152, 2143937712, 2144046809, 2144152550, 2144255037, 2144354371
        .long 2144450649, 2144543964, 2144634409, 2144722071, 2144807035, 2144889386
        .long 2144969203, 2145046564, 2145121546, 2145194220, 2145264658, 2145332929
        .long 2145399100, 2145463235, 2145525396, 2145585645, 2145644041, 2145700640
        .long 2145755497, 2145808667, 2145860200, 2145910149, 2145958560, 2146005482
        .long 2146050961, 2146095040, 2146137763, 2146179171, 2146219306, 2146258205
        .long 2146295908, 2146332451, 2146367870, 2146402199, 2146435471, 2146467720
        .long 2146498977, 2146529272, 2146558635, 2146587095, 2146614679, 2146641414
        .long 2146667327, 2146692443, 2146716786, 2146740380, 2146763247
        .align 4
sy1_fm:
        .long 47453133, 47477230, 47501339, 47525460, 47549594, 47573740
        .long 47597898, 47622069, 47646251, 47670446, 47694654, 47718873
        .long 47743105, 47767349, 47791606, 47815875, 47840156, 47864449
        .long 47888755, 47913073, 47937404, 47961747, 47986102, 48010469
        .long 48034849, 48059242, 48083646, 48108063, 48132493, 48156935
        .long 48181389, 48205856, 48230335, 48254827, 48279331, 48303847
        .long 48328376, 48352918, 48377471, 48402038, 48426617, 48451208
        .long 48475812, 48500428, 48525057, 48549698, 48574352, 48599018
        .long 48623697, 48648388, 48673092, 48697809, 48722538, 48747279
        .long 48772033, 48796800, 48821579, 48846371, 48871175, 48895992
        .long 48920822, 48945664, 48970519, 48995387, 49020267, 49045160
        .long 49070065, 49094983, 49119914, 49144857, 49169813, 49194782
        .long 49219763, 49244757, 49269764, 49294783, 49319815, 49344860
        .long 49369918, 49394988, 49420071, 49445167, 49470275, 49495397
        .long 49520531, 49545677, 49570837, 49596009, 49621194, 49646392
        .long 49671603, 49696826, 49722063, 49747312, 49772574, 49797849
        .long 49823136, 49848437, 49873750, 49899076, 49924415, 49949767
        .long 49975132, 50000509, 50025900, 50051303, 50076719, 50102149
        .long 50127591, 50153046, 50178514, 50203995, 50229489, 50254995
        .long 50280515, 50306048, 50331593, 50357152, 50382724, 50408308
        .long 50433906, 50459517, 50485140, 50510777, 50536426, 50562089
        .long 50587765, 50613453, 50639155, 50664870, 50690598, 50716339
        .long 50742093, 50767860, 50793640, 50819433, 50845240, 50871059
        .long 50896892, 50922737, 50948596, 50974468, 51000353, 51026252
        .long 51052163, 51078087, 51104025, 51129976, 51155940, 51181917
        .long 51207908, 51233911, 51259928, 51285958, 51312002, 51338058
        .long 51364128, 51390211, 51416307, 51442416, 51468539, 51494675
        .long 51520824, 51546987, 51573163, 51599352, 51625554, 51651770
        .long 51677999, 51704241, 51730497, 51756766, 51783048, 51809344
        .long 51835653, 51861976, 51888311, 51914661, 51941023, 51967399
        .long 51993788, 52020191, 52046607, 52073037, 52099480, 52125936
        .long 52152406, 52178889, 52205386, 52231896, 52258419, 52284957
        .long 52311507, 52338071, 52364649, 52391240, 52417844, 52444462
        .long 52471094, 52497739, 52524398, 52551070, 52577755, 52604455
        .long 52631168, 52657894, 52684634, 52711387, 52738154, 52764935
        .long 52791729, 52818537, 52845359, 52872194, 52899043, 52925905
        .long 52952781, 52979671, 53006574, 53033491, 53060422, 53087366
        .long 53114324, 53141296, 53168281, 53195281, 53222293, 53249320
        .long 53276360, 53303414, 53330482, 53357563, 53384659, 53411768
        .long 53438890, 53466027, 53493177, 53520341, 53547519, 53574711
        .long 53601917, 53629136, 53656369, 53683616, 53710877, 53738151
        .long 53765440, 53792742, 53820059, 53847389, 53874733, 53902090
        .long 53929462, 53956848, 53984247, 54011661, 54039088, 54066530
        .long 54093985, 54121454, 54148937, 54176434, 54203945, 54231470
        .long 54259009, 54286562, 54314129, 54341710, 54369305, 54396914
        .long 54424537, 54452175, 54479826, 54507491, 54535170, 54562863
        .long 54590570, 54618292, 54646027, 54673777, 54701540, 54729318
        .long 54757110, 54784916, 54812736, 54840570, 54868418, 54896281
        .long 54924158, 54952048, 54979953, 55007872, 55035806, 55063753
        .long 55091715, 55119691, 55147681, 55175685, 55203703, 55231736
        .long 55259783, 55287844, 55315920, 55344009, 55372113, 55400232
        .long 55428364, 55456511, 55484672, 55512847, 55541037, 55569241
        .long 55597459, 55625692, 55653939, 55682201, 55710476, 55738766
        .long 55767071, 55795390, 55823723, 55852070, 55880432, 55908809
        .long 55937199, 55965605, 55994024, 56022458, 56050907, 56079370
        .long 56107847, 56136339, 56164845, 56193366, 56221901, 56250451
        .long 56279015, 56307594, 56336187, 56364795, 56393417, 56422054
        .long 56450706, 56479372, 56508052, 56536747, 56565457, 56594181
        .long 56622920, 56651673, 56680441, 56709224, 56738021, 56766833
        .long 56795660, 56824501, 56853356, 56882227, 56911112, 56940012
        .long 56968926, 56997855, 57026799, 57055758, 57084731, 57113719
        .long 57142721, 57171739, 57200771, 57229818, 57258879, 57287955
        .long 57317047, 57346152, 57375273, 57404409, 57433559, 57462724
        .long 57491904, 57521098, 57550308, 57579532, 57608771, 57638025
        .long 57667294, 57696578, 57725877, 57755190, 57784519, 57813862
        .long 57843220, 57872593, 57901981, 57931384, 57960802, 57990235
        .long 58019682, 58049145, 58078623, 58108115, 58137623, 58167146
        .long 58196683, 58226236, 58255803, 58285386, 58314983, 58344596
        .long 58374224, 58403866, 58433524, 58463197, 58492885, 58522588
        .long 58552306, 58582039, 58611787, 58641551, 58671329, 58701123
        .long 58730932, 58760756, 58790595, 58820449, 58850318, 58880202
        .long 58910102, 58940017, 58969947, 58999892, 59029853, 59059828
        .long 59089819, 59119825, 59149847, 59179883, 59209935, 59240002
        .long 59270085, 59300182, 59330295, 59360423, 59390567, 59420726
        .long 59450900, 59481089, 59511294, 59541514, 59571750, 59602001
        .long 59632267, 59662548, 59692845, 59723158, 59753485, 59783829
        .long 59814187, 59844561, 59874950, 59905355, 59935775, 59966211
        .long 59996662, 60027129, 60057611, 60088108, 60118622, 60149150
        .long 60179694, 60210254, 60240829, 60271419, 60302025, 60332647
        .long 60363284, 60393937, 60424605, 60455289, 60485989, 60516704
        .long 60547435, 60578181, 60608943, 60639720, 60670514, 60701322
        .long 60732147, 60762987, 60793843, 60824714, 60855601, 60886504
        .long 60917422, 60948357, 60979306, 61010272, 61041253, 61072250
        .long 61103263, 61134292, 61165336, 61196396, 61227472, 61258564
        .long 61289671, 61320794, 61351933, 61383088, 61414259, 61445445
        .long 61476647, 61507866, 61539100, 61570349, 61601615, 61632897
        .long 61664194, 61695508, 61726837, 61758182, 61789543, 61820920
        .long 61852313, 61883722, 61915147, 61946588, 61978045, 62009518
        .long 62041006, 62072511, 62104032, 62135568, 62167121, 62198690
        .long 62230275, 62261876, 62293493, 62325125, 62356775, 62388440
        .long 62420121, 62451818, 62483531, 62515261, 62547006, 62578768
        .long 62610546, 62642340, 62674150, 62705976, 62737819, 62769677
        .long 62801552, 62833443, 62865350, 62897273, 62929213, 62961169
        .long 62993141, 63025129, 63057133, 63089154, 63121191, 63153244
        .long 63185314, 63217400, 63249502, 63281620, 63313755, 63345906
        .long 63378073, 63410257, 63442457, 63474674, 63506906, 63539155
        .long 63571421, 63603703, 63636001, 63668316, 63700647, 63732994
        .long 63765358, 63797739, 63830136, 63862549, 63894979, 63927425
        .long 63959887, 63992367, 64024862, 64057374, 64089903, 64122448
        .long 64155010, 64187588, 64220183, 64252794, 64285422, 64318067
        .long 64350728, 64383405, 64416099, 64448810, 64481538, 64514282
        .long 64547042, 64579820, 64612614, 64645424, 64678252, 64711096
        .long 64743956, 64776833, 64809727, 64842638, 64875566, 64908510
        .long 64941471, 64974448, 65007443, 65040454, 65073482, 65106526
        .long 65139588, 65172666, 65205761, 65238873, 65272001, 65305147
        .long 65338309, 65371488, 65404684, 65437897, 65471127, 65504373
        .long 65537637, 65570917, 65604214, 65637528, 65670859, 65704207
        .long 65737572, 65770954, 65804353, 65837769, 65871202, 65904651
        .long 65938118, 65971602, 66005102, 66038620, 66072155, 66105707
        .long 66139275, 66172861, 66206464, 66240084, 66273721, 66307375
        .long 66341047, 66374735, 66408440, 66442163, 66475903, 66509659
        .long 66543433, 66577224, 66611033, 66644858, 66678701, 66712560
        .long 66746437, 66780332, 66814243, 66848172, 66882117, 66916081
        .long 66950061, 66984058, 67018073, 67052105, 67086155, 67120221
        .long 67154305, 67188407, 67222525, 67256661, 67290815, 67324985
        .long 67359173, 67393378, 67427601, 67461841, 67496099, 67530374
        .long 67564666, 67598976, 67633303, 67667647, 67702009, 67736389
        .long 67770785, 67805200, 67839632, 67874081, 67908548, 67943032
        .long 67977534, 68012053, 68046590, 68081144, 68115716, 68150306
        .long 68184913, 68219538, 68254180, 68288840, 68323517, 68358212
        .long 68392925, 68427655, 68462403, 68497168, 68531952, 68566753
        .long 68601571, 68636407, 68671261, 68706133, 68741022, 68775929
        .long 68810854, 68845796, 68880757, 68915735, 68950730, 68985744
        .long 69020775, 69055824, 69090891, 69125976, 69161079, 69196199
        .long 69231337, 69266493, 69301667, 69336859, 69372068, 69407296
        .long 69442541, 69477804, 69513086, 69548385, 69583702, 69619037
        .long 69654390, 69689760, 69725149, 69760556, 69795981, 69831424
        .long 69866884, 69902363, 69937860, 69973375, 70008907, 70044458
        .long 70080027, 70115614, 70151219, 70186842, 70222484, 70258143
        .long 70293820, 70329516, 70365230, 70400962, 70436711, 70472480
        .long 70508266, 70544070, 70579893, 70615734, 70651593, 70687470
        .long 70723365, 70759279, 70795211, 70831161, 70867130, 70903116
        .long 70939121, 70975145, 71011186, 71047246, 71083324, 71119421
        .long 71155535, 71191669, 71227820, 71263990, 71300178, 71336385
        .long 71372610, 71408853, 71445115, 71481395, 71517694, 71554011
        .long 71590346, 71626700, 71663072, 71699463, 71735873, 71772301
        .long 71808747, 71845212, 71881695, 71918197, 71954717, 71991256
        .long 72027814, 72064390, 72100985, 72137598, 72174230, 72210880
        .long 72247549, 72284237, 72320943, 72357668, 72394412, 72431174
        .long 72467955, 72504754, 72541573, 72578410, 72615265, 72652140
        .long 72689033, 72725945, 72762875, 72799825, 72836793, 72873780
        .long 72910785, 72947810, 72984853, 73021915, 73058996, 73096096
        .long 73133214, 73170352, 73207508, 73244683, 73281877, 73319090
        .long 73356322, 73393573, 73430842, 73468131, 73505438, 73542765
        .long 73580110, 73617474, 73654858, 73692260, 73729681, 73767122
        .long 73804581, 73842059, 73879557, 73917073, 73954609, 73992163
        .long 74029737, 74067329, 74104941, 74142572, 74180222, 74217891
        .long 74255579, 74293287, 74331013, 74368759, 74406524, 74444308
        .long 74482111, 74519933, 74557775, 74595636, 74633516, 74671415
        .long 74709334, 74747271, 74785228, 74823205, 74861200, 74899215
        .long 74937249, 74975303, 75013376, 75051468, 75089579, 75127710
        .long 75165860, 75204030, 75242219, 75280427, 75318655, 75356902
        .long 75395169, 75433455, 75471761, 75510086, 75548430, 75586794
        .long 75625177, 75663580, 75702002, 75740444, 75778906, 75817387
        .long 75855887, 75894407, 75932947, 75971506, 76010084, 76048683
        .long 76087301, 76125938, 76164595, 76203272, 76241968, 76280684
        .long 76319420, 76358176, 76396951, 76435745, 76474560, 76513394
        .long 76552248, 76591122, 76630015, 76668928, 76707861, 76746813
        .long 76785786, 76824778, 76863790, 76902822, 76941874, 76980945
        .long 77020036, 77059148, 77098279, 77137429, 77176600, 77215791
        .long 77255001, 77294232, 77333482, 77372753, 77412043, 77451353
        .long 77490683, 77530034, 77569404, 77608794, 77648204, 77687634
        .long 77727084, 77766554, 77806045, 77845555, 77885085, 77924636
        .long 77964206, 78003797, 78043408, 78083039, 78122689, 78162361
        .long 78202052, 78241763, 78281495, 78321247, 78361018, 78400811
        .long 78440623, 78480455, 78520308, 78560181, 78600074, 78639988
        .long 78679922, 78719876, 78759850, 78799845, 78839860, 78879895
        .long 78919951, 78960027, 79000123, 79040240, 79080377, 79120534
        .long 79160712, 79200910, 79241129, 79281368, 79321627, 79361907
        .long 79402208, 79442528, 79482870, 79523231, 79563614, 79604017
        .long 79644440, 79684884, 79725348, 79765833, 79806339, 79846865
        .long 79887411, 79927978, 79968566, 80009175, 80049804, 80090454
        .long 80131124, 80171815, 80212526, 80253259, 80294012, 80334786
        .long 80375580, 80416395, 80457231, 80498088, 80538965, 80579863
        .long 80620782, 80661721, 80702682, 80743663, 80784665, 80825688
        .long 80866732, 80907796, 80948882, 80989988, 81031115, 81072263
        .long 81113432, 81154622, 81195832, 81237064, 81278317, 81319590
        .long 81360885, 81402200, 81443537, 81484894, 81526273, 81567672
        .long 81609092, 81650534, 81691996, 81733480, 81774985, 81816511
        .long 81858057, 81899625, 81941214, 81982825, 82024456, 82066108
        .long 82107782, 82149477, 82191192, 82232930, 82274688, 82316467
        .long 82358268, 82400090, 82441933, 82483798, 82525683, 82567590
        .long 82609519, 82651468, 82693439, 82735431, 82777445, 82819479
        .long 82861535, 82903613, 82945712, 82987832, 83029974, 83072137
        .long 83114321, 83156527, 83198754, 83241003, 83283273, 83325565
        .long 83367878, 83410213, 83452569, 83494947, 83537346, 83579766
        .long 83622209, 83664672, 83707158, 83749665, 83792193, 83834743
        .long 83877315, 83919908, 83962523, 84005160, 84047818, 84090498
        .long 84133200, 84175923, 84218668, 84261434, 84304223, 84347033
        .long 84389865, 84432718, 84475594, 84518491, 84561410, 84604351
        .long 84647313, 84690297, 84733304, 84776332, 84819381, 84862453
        .long 84905547, 84948662, 84991799, 85034959, 85078140, 85121343
        .long 85164568, 85207815, 85251084, 85294375, 85337688, 85381023
        .long 85424380, 85467759, 85511160, 85554583, 85598028, 85641495
        .long 85684984, 85728495, 85772029, 85815584, 85859162, 85902761
        .long 85946383, 85990027, 86033693, 86077382, 86121092, 86164825
        .long 86208580, 86252357, 86296156, 86339978, 86383822, 86427688
        .long 86471577, 86515487, 86559420, 86603376, 86647353, 86691353
        .long 86735375, 86779420, 86823487, 86867577, 86911688, 86955823
        .long 86999979, 87044158, 87088360, 87132584, 87176830, 87221099
        .long 87265390, 87309704, 87354040, 87398399, 87442780, 87487184
        .long 87531611, 87576060, 87620531, 87665025, 87709542, 87754081
        .long 87798643, 87843228, 87887835, 87932465, 87977118, 88021793
        .long 88066491, 88111211, 88155955, 88200721, 88245510, 88290321
        .long 88335155, 88380012, 88424892, 88469795, 88514720, 88559668
        .long 88604639, 88649633, 88694650, 88739690, 88784752, 88829837
        .long 88874946, 88920077, 88965231, 89010408, 89055608, 89100831
        .long 89146077, 89191345, 89236637, 89281952, 89327290, 89372651
        .long 89418035, 89463442, 89508872, 89554325, 89599801, 89645300
        .long 89690822, 89736368, 89781936, 89827528, 89873143, 89918781
        .long 89964442, 90010127, 90055834, 90101565, 90147319, 90193096
        .long 90238897, 90284721, 90330568, 90376438, 90422331, 90468248
        .long 90514189, 90560152, 90606139, 90652149, 90698183, 90744240
        .long 90790320, 90836424, 90882551, 90928702, 90974876, 91021073
        .long 91067294, 91113539, 91159807, 91206098, 91252413, 91298752
        .long 91345114, 91391499, 91437908, 91484341, 91530797, 91577277
        .long 91623780, 91670307, 91716858, 91763432, 91810030, 91856652
        .long 91903297, 91949966, 91996659, 92043375, 92090115, 92136879
        .long 92183666, 92230478, 92277313, 92324172, 92371054, 92417961
        .long 92464891, 92511845, 92558823, 92605825, 92652851, 92699900
        .long 92746974, 92794071, 92841193, 92888338, 92935507, 92982700
        .long 93029917, 93077158, 93124423, 93171712, 93219025, 93266362
        .long 93313724, 93361109, 93408518, 93455951, 93503409, 93550890
        .long 93598396, 93645926, 93693479, 93741058, 93788660, 93836286
        .long 93883937, 93931611, 93979310, 94027033, 94074781, 94122552
        .long 94170348, 94218169, 94266013, 94313882, 94361775, 94409692
        .long 94457634, 94505600, 94553590, 94601605, 94649644, 94697708
        .long 94745796, 94793908, 94842045, 94890206, 94938392, 94986602
        .long 95034837, 95083096, 95131380, 95179688, 95228021, 95276378
        .long 95324760, 95373166, 95421597, 95470053, 95518533, 95567038
        .long 95615567, 95664121, 95712700, 95761303, 95809931, 95858584
        .long 95907262, 95955964, 96004691, 96053442, 96102219, 96151020
        .long 96199846, 96248697, 96297572, 96346473, 96395398, 96444348
        .long 96493323, 96542323, 96591348, 96640397, 96689472, 96738571
        .long 96787695, 96836845, 96886019, 96935218, 96984442, 97033691
        .long 97082966, 97132265, 97181589, 97230938, 97280313, 97329712
        .long 97379137, 97428586, 97478061, 97527561, 97577086, 97626636
        .long 97676211, 97725812, 97775437, 97825088, 97874764, 97924466
        .long 97974192, 98023944, 98073721, 98123523, 98173351, 98223204
        .long 98273082, 98322986, 98372915, 98422869, 98472849, 98522854
        .long 98572884, 98622940, 98673021, 98723128, 98773260, 98823417
        .long 98873600, 98923809, 98974043, 99024302, 99074587, 99124898
        .long 99175234, 99225596, 99275983, 99326396, 99376834, 99427298
        .long 99477788, 99528303, 99578844, 99629411, 99680003, 99730621
        .long 99781265, 99831935, 99882630, 99933351, 99984097, 100034870
        .long 100085668, 100136492, 100187342, 100238217, 100289119, 100340046
        .long 100390999, 100441978, 100492983, 100544014, 100595071, 100646154
        .long 100697262, 100748397, 100799557, 100850744, 100901956, 100953195
        .long 101004459, 101055750, 101107067, 101158409, 101209778, 101261173
        .long 101312594, 101364041, 101415514, 101467013, 101518539, 101570090
        .long 101621668, 101673272, 101724902, 101776559, 101828242, 101879950
        .long 101931686, 101983447, 102035235, 102087049, 102138889, 102190756
        .long 102242649, 102294568, 102346514, 102398486, 102450484, 102502509
        .long 102554560, 102606638, 102658742, 102710873, 102763030, 102815214
        .long 102867424, 102919660, 102971923, 103024213, 103076529, 103128872
        .long 103181241, 103233637, 103286060, 103338509, 103390985, 103443487
        .long 103496017, 103548572, 103601155, 103653764, 103706400, 103759063
        .long 103811752, 103864468, 103917211, 103969981, 104022777, 104075600
        .long 104128451, 104181327, 104234231, 104287162, 104340120, 104393104
        .long 104446115, 104499154, 104552219, 104605311, 104658430, 104711576
        .long 104764749, 104817949, 104871176, 104924430, 104977712, 105031020
        .long 105084355, 105137717, 105191107, 105244523, 105297967, 105351438
        .long 105404936, 105458461, 105512013, 105565593, 105619200, 105672834
        .long 105726495, 105780183, 105833899, 105887642, 105941412, 105995210
        .long 106049035, 106102887, 106156767, 106210674, 106264608, 106318570
        .long 106372559, 106426575, 106480619, 106534691, 106588789, 106642916
        .long 106697070, 106751251, 106805460, 106859696, 106913960, 106968251
        .long 107022570, 107076917, 107131291, 107185693, 107240122, 107294580
        .long 107349064, 107403577, 107458117, 107512685, 107567280, 107621903
        .long 107676554, 107731233, 107785939, 107840674, 107895436, 107950225
        .long 108005043, 108059889, 108114762, 108169663, 108224592, 108279549
        .long 108334534, 108389547, 108444588, 108499657, 108554753, 108609878
        .long 108665030, 108720211, 108775420, 108830657, 108885921, 108941214
        .long 108996535, 109051884, 109107261, 109162666, 109218100, 109273561
        .long 109329051, 109384569, 109440115, 109495689, 109551291, 109606922
        .long 109662581, 109718268, 109773984, 109829728, 109885500, 109941300
        .long 109997129, 110052986, 110108871, 110164785, 110220727, 110276698
        .long 110332697, 110388725, 110444781, 110500865, 110556978, 110613119
        .long 110669289, 110725488, 110781715, 110837970, 110894254, 110950567
        .long 111006908, 111063278, 111119676, 111176104, 111232559, 111289044
        .long 111345557, 111402099, 111458669, 111515269, 111571897, 111628553
        .long 111685239, 111741953, 111798696, 111855468, 111912269, 111969099
        .long 112025957, 112082845, 112139761, 112196706, 112253680, 112310683
        .long 112367715, 112424776, 112481866, 112538984, 112596132, 112653309
        .long 112710515, 112767750, 112825014, 112882307, 112939629, 112996981
        .long 113054361, 113111771, 113169210, 113226677, 113284175, 113341701
        .long 113399256, 113456841, 113514455, 113572098, 113629771, 113687472
        .long 113745203, 113802964, 113860754, 113918573, 113976421, 114034299
        .long 114092206, 114150143, 114208109, 114266104, 114324129, 114382183
        .long 114440267, 114498381, 114556523, 114614696, 114672898, 114731129
        .long 114789390, 114847681, 114906001, 114964351, 115022730, 115081140
        .long 115139578, 115198047, 115256545, 115315073, 115373630, 115432218
        .long 115490835, 115549482, 115608158, 115666865, 115725601, 115784367
        .long 115843163, 115901989, 115960844, 116019730, 116078645, 116137590
        .long 116196566, 116255571, 116314606, 116373671, 116432766, 116491891
        .long 116551047, 116610232, 116669447, 116728692, 116787968, 116847273
        .long 116906609, 116965975, 117025371, 117084797, 117144253, 117203739
        .long 117263256, 117322803, 117382380, 117441987, 117501625, 117561293
        .long 117620991, 117680720, 117740479, 117800268, 117860087, 117919937
        .long 117979818, 118039728, 118099670, 118159641, 118219643, 118279676
        .long 118339739, 118399832, 118459956, 118520111, 118580296, 118640512
        .long 118700758, 118761035, 118821342, 118881680, 118942049, 119002448
        .long 119062878, 119123339, 119183831, 119244353, 119304906, 119365489
        .long 119426104, 119486749, 119547425, 119608132, 119668869, 119729638
        .long 119790437, 119851267, 119912128, 119973020, 120033943, 120094897
        .long 120155882, 120216898, 120277944, 120339022, 120400131, 120461271
        .long 120522441, 120583643, 120644876, 120706140, 120767436, 120828762
        .long 120890119, 120951508, 121012928, 121074379, 121135861, 121197374
        .long 121258919, 121320495, 121382102, 121443740, 121505410, 121567111
        .long 121628844, 121690607, 121752403, 121814229, 121876087, 121937976
        .long 121999897, 122061849, 122123833, 122185848, 122247894, 122309972
        .long 122372082, 122434223, 122496396, 122558600, 122620836, 122683104
        .long 122745403, 122807733, 122870096, 122932490, 122994916, 123057373
        .long 123119862, 123182383, 123244936, 123307520, 123370136, 123432784
        .long 123495464, 123558176, 123620919, 123683694, 123746502, 123809341
        .long 123872212, 123935115, 123998050, 124061016, 124124015, 124187046
        .long 124250109, 124313204, 124376331, 124439490, 124502681, 124565904
        .long 124629159, 124692446, 124755766, 124819117, 124882501, 124945917
        .long 125009365, 125072845, 125136358, 125199903, 125263480, 125327090
        .long 125390731, 125454405, 125518112, 125581850, 125645622, 125709425
        .long 125773261, 125837129, 125901030, 125964963, 126028929, 126092927
        .long 126156957, 126221021, 126285116, 126349245, 126413405, 126477599
        .long 126541825, 126606083, 126670374, 126734698, 126799055, 126863444
        .long 126927866, 126992320, 127056808, 127121328, 127185881, 127250466
        .long 127315085, 127379736, 127444420, 127509137, 127573887, 127638670
        .long 127703485, 127768334, 127833215, 127898129, 127963077, 128028057
        .long 128093070, 128158117, 128223196, 128288308, 128353454, 128418632
        .long 128483844, 128549089, 128614366, 128679677, 128745022, 128810399
        .long 128875810, 128941253, 129006730, 129072241, 129137784, 129203361
        .long 129268971, 129334615, 129400291, 129466001, 129531745, 129597522
        .long 129663332, 129729176, 129795053, 129860964, 129926908, 129992885
        .long 130058896, 130124941, 130191019, 130257130, 130323276, 130389455
        .long 130455667, 130521913, 130588193, 130654506, 130720853, 130787234
        .long 130853648, 130920096, 130986578, 131053094, 131119643, 131186227
        .long 131252844, 131319494, 131386179, 131452898, 131519650, 131586436
        .long 131653257, 131720111, 131786999, 131853921, 131920877, 131987867
        .long 132054891, 132121950, 132189042, 132256168, 132323328, 132390523
        .long 132457751, 132525014, 132592311, 132659642, 132727007, 132794407
        .long 132861840, 132929308, 132996810, 133064347, 133131918, 133199523
        .long 133267162, 133334836, 133402544, 133470286, 133538063, 133605875
        .long 133673720, 133741601, 133809515, 133877464, 133945448, 134013466
        .long 134081519, 134149606, 134217728, 134285884, 134354075, 134422301
        .long 134490561, 134558856, 134627186, 134695551, 134763950, 134832383
        .long 134900852, 134969355, 135037893, 135106466, 135175074, 135243717
        .long 135312394, 135381106, 135449854, 135518636, 135587453, 135656305
        .long 135725192, 135794114, 135863071, 135932063, 136001090, 136070152
        .long 136139249, 136208381, 136277548, 136346751, 136415988, 136485261
        .long 136554569, 136623912, 136693290, 136762704, 136832153, 136901637
        .long 136971156, 137040711, 137110301, 137179926, 137249587, 137319283
        .long 137389014, 137458781, 137528583, 137598421, 137668294, 137738203
        .long 137808147, 137878126, 137948142, 138018192, 138088279, 138158401
        .long 138228558, 138298751, 138368980, 138439245, 138509545, 138579881
        .long 138650252, 138720660, 138791103, 138861581, 138932096, 139002646
        .long 139073233, 139143855, 139214513, 139285207, 139355936, 139426702
        .long 139497504, 139568341, 139639215, 139710124, 139781070, 139852051
        .long 139923069, 139994122, 140065212, 140136338, 140207500, 140278698
        .long 140349932, 140421203, 140492509, 140563852, 140635231, 140706646
        .long 140778098, 140849586, 140921110, 140992670, 141064267, 141135900
        .long 141207570, 141279276, 141351018, 141422797, 141494612, 141566464
        .long 141638352, 141710276, 141782238, 141854235, 141926270, 141998340
        .long 142070448, 142142592, 142214773, 142286990, 142359244, 142431535
        .long 142503862, 142576227, 142648627, 142721065, 142793540, 142866051
        .long 142938599, 143011184, 143083806, 143156464, 143229160, 143301893
        .long 143374662, 143447468, 143520312, 143593192, 143666109, 143739064
        .long 143812055, 143885084, 143958149, 144031252, 144104392, 144177569
        .long 144250783, 144324034, 144397322, 144470648, 144544011, 144617411
        .long 144690849, 144764323, 144837836, 144911385, 144984972, 145058596
        .long 145132257, 145205956, 145279692, 145353466, 145427277, 145501126
        .long 145575012, 145648936, 145722897, 145796896, 145870933, 145945007
        .long 146019118, 146093267, 146167454, 146241679, 146315941, 146390241
        .long 146464579, 146538954, 146613367, 146687818, 146762307, 146836834
        .long 146911398, 146986001, 147060641, 147135319, 147210035, 147284789
        .long 147359581, 147434411, 147509279, 147584185, 147659129, 147734111
        .long 147809131, 147884189, 147959286, 148034420, 148109593, 148184804
        .long 148260053, 148335340, 148410665, 148486029, 148561431, 148636871
        .long 148712350, 148787867, 148863422, 148939015, 149014647, 149090318
        .long 149166027, 149241774, 149317560, 149393384, 149469246, 149545148
        .long 149621088, 149697066, 149773083, 149849138, 149925232, 150001365
        .long 150077537, 150153747, 150229996, 150306283, 150382609, 150458975
        .long 150535378, 150611821, 150688302, 150764823, 150841382, 150917980
        .long 150994617, 151071293, 151148007, 151224761, 151301554, 151378385
        .long 151455256, 151532166, 151609115, 151686103, 151763130, 151840196
        .long 151917301, 151994445, 152071629, 152148852, 152226113, 152303415
        .long 152380755, 152458135, 152535554, 152613012, 152690510, 152768047
        .long 152845623, 152923239, 153000894, 153078589, 153156323, 153234096
        .long 153311910, 153389762, 153467654, 153545586, 153623557, 153701568
        .long 153779618, 153857708, 153935838, 154014007, 154092217, 154170465
        .long 154248754, 154327082, 154405450, 154483858, 154562306, 154640793
        .long 154719321, 154797888, 154876495, 154955142, 155033829, 155112556
        .long 155191323, 155270130, 155348977, 155427864, 155506791, 155585758
        .long 155664765, 155743813, 155822900, 155902028, 155981196, 156060404
        .long 156139652, 156218941, 156298269, 156377638, 156457048, 156536497
        .long 156615987, 156695518, 156775089, 156854700, 156934351, 157014043
        .long 157093776, 157173549, 157253362, 157333217, 157413111, 157493046
        .long 157573022, 157653038, 157733095, 157813193, 157893331, 157973510
        .long 158053730, 158133991, 158214292, 158294634, 158375017, 158455440
        .long 158535905, 158616410, 158696956, 158777544, 158858172, 158938841
        .long 159019551, 159100301, 159181093, 159261926, 159342800, 159423715
        .long 159504672, 159585669, 159666707, 159747787, 159828908, 159910069
        .long 159991273, 160072517, 160153803, 160235130, 160316498, 160397907
        .long 160479358, 160560850, 160642384, 160723959, 160805575, 160887233
        .long 160968933, 161050674, 161132456, 161214280, 161296145, 161378052
        .long 161460001, 161541991, 161624023, 161706096, 161788211, 161870368
        .long 161952567, 162034807, 162117089, 162199413, 162281779, 162364186
        .long 162446636, 162529127, 162611660, 162694235, 162776852, 162859511
        .long 162942212, 163024955, 163107740, 163190567, 163273436, 163356347
        .long 163439300, 163522295, 163605333, 163688412, 163771534, 163854698
        .long 163937904, 164021153, 164104443, 164187777, 164271152, 164354570
        .long 164438030, 164521532, 164605077, 164688664, 164772294, 164855966
        .long 164939681, 165023438, 165107238, 165191080, 165274965, 165358893
        .long 165442863, 165526875, 165610931, 165695029, 165779170, 165863353
        .long 165947579, 166031848, 166116160, 166200515, 166284912, 166369353
        .long 166453836, 166538362, 166622931, 166707543, 166792198, 166876896
        .long 166961637, 167046421, 167131248, 167216118, 167301031, 167385987
        .long 167470987, 167556029, 167641115, 167726244, 167811416, 167896632
        .long 167981890, 168067193, 168152538, 168237927, 168323359, 168408834
        .long 168494353, 168579915, 168665521, 168751170, 168836863, 168922599
        .long 169008379, 169094202, 169180069, 169265980, 169351934, 169437931
        .long 169523973, 169610058, 169696187, 169782359, 169868576, 169954836
        .long 170041140, 170127488, 170213879, 170300315, 170386794, 170473317
        .long 170559884, 170646496, 170733151, 170819850, 170906593, 170993380
        .long 171080212, 171167087, 171254007, 171340970, 171427978, 171515030
        .long 171602126, 171689267, 171776451, 171863680, 171950954, 172038271
        .long 172125633, 172213039, 172300490, 172387985, 172475524, 172563108
        .long 172650737, 172738410, 172826127, 172913889, 173001696, 173089547
        .long 173177443, 173265383, 173353368, 173441398, 173529472, 173617591
        .long 173705755, 173793964, 173882217, 173970515, 174058859, 174147247
        .long 174235679, 174324157, 174412680, 174501248, 174589860, 174678518
        .long 174767220, 174855968, 174944761, 175033599, 175122482, 175211410
        .long 175300383, 175389401, 175478465, 175567574, 175656728, 175745927
        .long 175835172, 175924462, 176013797, 176103178, 176192604, 176282076
        .long 176371592, 176461155, 176550763, 176640416, 176730115, 176819859
        .long 176909649, 176999485, 177089366, 177179293, 177269266, 177359284
        .long 177449348, 177539458, 177629613, 177719814, 177810061, 177900354
        .long 177990693, 178081077, 178171508, 178261984, 178352506, 178443075
        .long 178533689, 178624349, 178715056, 178805808, 178896607, 178987451
        .long 179078342, 179169279, 179260262, 179351291, 179442367, 179533488
        .long 179624656, 179715871, 179807131, 179898438, 179989792, 180081191
        .long 180172638, 180264130, 180355669, 180447255, 180538887, 180630565
        .long 180722290, 180814062, 180905880, 180997745, 181089657, 181181615
        .long 181273620, 181365672, 181457770, 181549915, 181642107, 181734346
        .long 181826632, 181918964, 182011343, 182103770, 182196243, 182288763
        .long 182381330, 182473944, 182566606, 182659314, 182752069, 182844872
        .long 182937721, 183030618, 183123562, 183216553, 183309591, 183402677
        .long 183495809, 183588990, 183682217, 183775492, 183868814, 183962183
        .long 184055600, 184149065, 184242576, 184336136, 184429743, 184523397
        .long 184617099, 184710848, 184804645, 184898490, 184992383, 185086323
        .long 185180310, 185274346, 185368429, 185462560, 185556739, 185650966
        .long 185745240, 185839562, 185933933, 186028351, 186122817, 186217331
        .long 186311893, 186406503, 186501162, 186595868, 186690622, 186785425
        .long 186880275, 186975174, 187070121, 187165116, 187260159, 187355251
        .long 187450391, 187545579, 187640816, 187736101, 187831434, 187926816
        .long 188022246, 188117725, 188213252, 188308827, 188404452, 188500124
        .long 188595846, 188691616, 188787434, 188883301, 188979217, 189075182
        .long 189171195, 189267257, 189363368, 189459528, 189555736, 189651994
        .long 189748300, 189844655, 189941059, 190037512, 190134014, 190230565
        .long 190327165, 190423814, 190520512, 190617260, 190714056, 190810902
        .long 190907796, 191004740, 191101734, 191198776, 191295868, 191393009
        .long 191490199, 191587439, 191684728, 191782066, 191879454, 191976892
        .long 192074378, 192171915, 192269501, 192367136, 192464821, 192562556
        .long 192660340, 192758174, 192856057, 192953991, 193051974, 193150006
        .long 193248089, 193346221, 193444403, 193542636, 193640917, 193739249
        .long 193837631, 193936063, 194034544, 194133076, 194231658, 194330290
        .long 194428972, 194527704, 194626486, 194725318, 194824201, 194923133
        .long 195022116, 195121150, 195220233, 195319367, 195418551, 195517786
        .long 195617070, 195716406, 195815792, 195915228, 196014715, 196114252
        .long 196213840, 196313478, 196413167, 196512907, 196612697, 196712538
        .long 196812429, 196912372, 197012365, 197112409, 197212503, 197312649
        .long 197412845, 197513092, 197613391, 197713740, 197814140, 197914591
        .long 198015093, 198115646, 198216250, 198316905, 198417611, 198518369
        .long 198619178, 198720037, 198820948, 198921911, 199022924, 199123989
        .long 199225105, 199326273, 199427492, 199528762, 199630084, 199731457
        .long 199832881, 199934358, 200035885, 200137465, 200239095, 200340778
        .long 200442512, 200544298, 200646135, 200748024, 200849965, 200951958
        .long 201054002, 201156098, 201258246, 201360446, 201462698, 201565002
        .long 201667358, 201769765, 201872225, 201974737, 202077301, 202179916
        .long 202282584, 202385305, 202488077, 202590901, 202693778, 202796707
        .long 202899688, 203002722, 203105807, 203208946, 203312136, 203415379
        .long 203518674, 203622022, 203725422, 203828875, 203932381, 204035938
        .long 204139549, 204243212, 204346928, 204450696, 204554517, 204658391
        .long 204762318, 204866297, 204970329, 205074414, 205178552, 205282743
        .long 205386986, 205491283, 205595632, 205700035, 205804490, 205908999
        .long 206013560, 206118175, 206222843, 206327564, 206432338, 206537166
        .long 206642046, 206746980, 206851967, 206957008, 207062102, 207167249
        .long 207272449, 207377703, 207483011, 207588372, 207693786, 207799254
        .long 207904776, 208010351, 208115979, 208221662, 208327398, 208433187
        .long 208539031, 208644928, 208750879, 208856884, 208962942, 209069055
        .long 209175221, 209281441, 209387715, 209494044, 209600426, 209706862
        .long 209813352, 209919896, 210026495, 210133147, 210239854, 210346615
        .long 210453430, 210560299, 210667223, 210774201, 210881233, 210988319
        .long 211095460, 211202656, 211309905, 211417210, 211524568, 211631982
        .long 211739449, 211846972, 211954549, 212062180, 212169867, 212277608
        .long 212385403, 212493254, 212601159, 212709119, 212817133, 212925203
        .long 213033327, 213141507, 213249741, 213358031, 213466375, 213574774
        .long 213683228, 213791738, 213900302, 214008922, 214117597, 214226327
        .long 214335112, 214443953, 214552848, 214661799, 214770806, 214879867
        .long 214988984, 215098157, 215207385, 215316668, 215426007, 215535402
        .long 215644851, 215754357, 215863918, 215973535, 216083207, 216192936
        .long 216302719, 216412559, 216522454, 216632406, 216742413, 216852476
        .long 216962594, 217072769, 217183000, 217293286, 217403629, 217514028
        .long 217624482, 217734993, 217845560, 217956183, 218066862, 218177598
        .long 218288390, 218399237, 218510142, 218621102, 218732119, 218843192
        .long 218954322, 219065508, 219176751, 219288050, 219399405, 219510818
        .long 219622286, 219733812, 219845393, 219957032, 220068727, 220180479
        .long 220292288, 220404154, 220516076, 220628055, 220740091, 220852184
        .long 220964334, 221076541, 221188805, 221301125, 221413503, 221525938
        .long 221638430, 221750979, 221863585, 221976249, 222088970, 222201747
        .long 222314583, 222427475, 222540425, 222653432, 222766497, 222879619
        .long 222992798, 223106035, 223219329, 223332681, 223446091, 223559558
        .long 223673082, 223786665, 223900305, 224014002, 224127758, 224241571
        .long 224355442, 224469371, 224583357, 224697402, 224811505, 224925665
        .long 225039883, 225154160, 225268494, 225382887, 225497337, 225611846
        .long 225726413, 225841038, 225955721, 226070462, 226185262, 226300120
        .long 226415036, 226530011, 226645044, 226760136, 226875286, 226990494
        .long 227105761, 227221086, 227336470, 227451913, 227567414, 227682974
        .long 227798593, 227914270, 228030006, 228145801, 228261654, 228377567
        .long 228493538, 228609568, 228725657, 228841805, 228958012, 229074278
        .long 229190604, 229306988, 229423431, 229539933, 229656495, 229773116
        .long 229889796, 230006535, 230123333, 230240191, 230357108, 230474085
        .long 230591121, 230708216, 230825371, 230942585, 231059859, 231177192
        .long 231294585, 231412038, 231529550, 231647122, 231764753, 231882445
        .long 232000196, 232118007, 232235877, 232353808, 232471798, 232589849
        .long 232707959, 232826129, 232944359, 233062650, 233181000, 233299411
        .long 233417881, 233536412, 233655003, 233773654, 233892366, 234011137
        .long 234129969, 234248862, 234367815, 234486828, 234605901, 234725035
        .long 234844230, 234963485, 235082801, 235202177, 235321614, 235441111
        .long 235560669, 235680288, 235799968, 235919708, 236039510, 236159372
        .long 236279295, 236399278, 236519323, 236639429, 236759596, 236879823
        .long 237000112, 237120462, 237240873, 237361345, 237481878, 237602473
        .long 237723128, 237843845, 237964624, 238085463, 238206364, 238327327
        .long 238448351, 238569436, 238690583, 238811791, 238933061, 239054392
        .long 239175785, 239297240, 239418756, 239540334, 239661974, 239783676
        .long 239905439, 240027264, 240149151, 240271100, 240393111, 240515184
        .long 240637319, 240759516, 240881774, 241004095, 241126479, 241248924
        .long 241371431, 241494001, 241616633, 241739327, 241862083, 241984902
        .long 242107783, 242230727, 242353733, 242476801, 242599932, 242723126
        .long 242846382, 242969700, 243093082, 243216525, 243340032, 243463601
        .long 243587233, 243710928, 243834686, 243958506, 244082390, 244206336
        .long 244330345, 244454417, 244578553, 244702751, 244827012, 244951336
        .long 245075724, 245200175, 245324689, 245449266, 245573906, 245698610
        .long 245823377, 245948207, 246073101, 246198058, 246323079, 246448163
        .long 246573310, 246698521, 246823796, 246949135, 247074537, 247200002
        .long 247325532, 247451125, 247576782, 247702503, 247828287, 247954136
        .long 248080048, 248206024, 248332064, 248458169, 248584337, 248710569
        .long 248836866, 248963227, 249089651, 249216140, 249342694, 249469311
        .long 249595993, 249722739, 249849549, 249976424, 250103364, 250230367
        .long 250357435, 250484568, 250611766, 250739028, 250866354, 250993745
        .long 251121201, 251248722, 251376307, 251503957, 251631672, 251759452
        .long 251887297, 252015206, 252143181, 252271221, 252399325, 252527495
        .long 252655730, 252784029, 252912394, 253040825, 253169320, 253297881
        .long 253426507, 253555198, 253683955, 253812777, 253941664, 254070617
        .long 254199635, 254328719, 254457868, 254587083, 254716364, 254845710
        .long 254975122, 255104600, 255234143, 255363752, 255493427, 255623168
        .long 255752975, 255882848, 256012786, 256142791, 256272861, 256402998
        .long 256533201, 256663470, 256793805, 256924206, 257054673, 257185207
        .long 257315807, 257446473, 257577206, 257708005, 257838870, 257969802
        .long 258100800, 258231865, 258362997, 258494195, 258625460, 258756791
        .long 258888189, 259019654, 259151185, 259282783, 259414448, 259546180
        .long 259677979, 259809845, 259941778, 260073778, 260205844, 260337978
        .long 260470179, 260602447, 260734782, 260867185, 260999655, 261132191
        .long 261264796, 261397467, 261530206, 261663013, 261795886, 261928828
        .long 262061836, 262194913, 262328057, 262461268, 262594547, 262727894
        .long 262861309, 262994791, 263128341, 263261959, 263395645, 263529398
        .long 263663220, 263797109, 263931067, 264065093, 264199186, 264333348
        .long 264467578, 264601876, 264736242, 264870676, 265005179, 265139750
        .long 265274389, 265409097, 265543873, 265678717, 265813630, 265948612
        .long 266083662, 266218780, 266353968, 266489224, 266624548, 266759941
        .long 266895404, 267030934, 267166534, 267302203, 267437940, 267573746
        .long 267709622, 267845566, 267981579, 268117662, 268253813, 268390034
        .long 268526324, 268662683, 268799111, 268935608, 269072175, 269208811
        .long 269345517, 269482292, 269619137, 269756050, 269893034, 270030087
        .long 270167210, 270304402, 270441664, 270578996, 270716397, 270853868
        .long 270991409, 271129020, 271266701, 271404451, 271542272, 271680162
        .long 271818123, 271956153, 272094254, 272232425, 272370666, 272508977
        .long 272647359, 272785810, 272924332, 273062925, 273201587, 273340320
        .long 273479124, 273617998, 273756943, 273895958, 274035044, 274174200
        .long 274313427, 274452725, 274592093, 274731533, 274871043, 275010624
        .long 275150275, 275289998, 275429792, 275569656, 275709592, 275849599
        .long 275989676, 276129825, 276270046, 276410337, 276550699, 276691133
        .long 276831638, 276972215, 277112863, 277253582, 277394373, 277535235
        .long 277676169, 277817174, 277958251, 278099400, 278240620, 278381912
        .long 278523276, 278664711, 278806219, 278947798, 279089449, 279231172
        .long 279372967, 279514834, 279656773, 279798784, 279940868, 280083023
        .long 280225250, 280367550, 280509922, 280652367, 280794883, 280937472
        .long 281080134, 281222868, 281365674, 281508553, 281651505, 281794529
        .long 281937625, 282080795, 282224037, 282367351, 282510739, 282654199
        .long 282797733, 282941339, 283085018, 283228770, 283372595, 283516493
        .long 283660464, 283804508, 283948626, 284092816, 284237080, 284381417
        .long 284525827, 284670311, 284814868, 284959498, 285104202, 285248980
        .long 285393830, 285538755, 285683753, 285828824, 285973970, 286119189
        .long 286264482, 286409848, 286555289, 286700803, 286846391, 286992053
        .long 287137789, 287283599, 287429483, 287575441, 287721473, 287867580
        .long 288013760, 288160015, 288306344, 288452748, 288599226, 288745778
        .long 288892404, 289039105, 289185881, 289332731, 289479655, 289626655
        .long 289773729, 289920877, 290068100, 290215398, 290362771, 290510219
        .long 290657742, 290805339, 290953011, 291100759, 291248581, 291396479
        .long 291544451, 291692499, 291840622, 291988820, 292137094, 292285442
        .long 292433866, 292582366, 292730940, 292879591, 293028316, 293177118
        .long 293325995, 293474947, 293623975, 293773079, 293922258, 294071513
        .long 294220844, 294370251, 294519734, 294669293, 294818927, 294968638
        .long 295118424, 295268287, 295418226, 295568240, 295718331, 295868499
        .long 296018742, 296169062, 296319458, 296469931, 296620480, 296771105
        .long 296921807, 297072585, 297223440, 297374372, 297525380, 297676465
        .long 297827627, 297978865, 298130180, 298281572, 298433041, 298584587
        .long 298736210, 298887909, 299039686, 299191540, 299343471, 299495479
        .long 299647564, 299799727, 299951967, 300104284, 300256678, 300409150
        .long 300561699, 300714326, 300867030, 301019812, 301172672, 301325609
        .long 301478623, 301631716, 301784886, 301938134, 302091459, 302244863
        .long 302398344, 302551904, 302705541, 302859257, 303013050, 303166922
        .long 303320871, 303474899, 303629005, 303783190, 303937452, 304091793
        .long 304246213, 304400710, 304555287, 304709941, 304864674, 305019486
        .long 305174377, 305329346, 305484394, 305639520, 305794725, 305950010
        .long 306105372, 306260814, 306416335, 306571935, 306727614, 306883371
        .long 307039208, 307195124, 307351120, 307507194, 307663348, 307819581
        .long 307975893, 308132285, 308288756, 308445307, 308601937, 308758646
        .long 308915436, 309072304, 309229253, 309386281, 309543389, 309700577
        .long 309857844, 310015191, 310172619, 310330126, 310487713, 310645380
        .long 310803128, 310960955, 311118863, 311276850, 311434918, 311593067
        .long 311751295, 311909604, 312067993, 312226463, 312385013, 312543644
        .long 312702355, 312861147, 313020019, 313178972, 313338006, 313497121
        .long 313656316, 313815593, 313974950, 314134388, 314293907, 314453507
        .long 314613188, 314772950, 314932793, 315092718, 315252724, 315412811
        .long 315572979, 315733228, 315893559, 316053972, 316214465, 316375041
        .long 316535698, 316696436, 316857256, 317018158, 317179141, 317340206
        .long 317501353, 317662582, 317823893, 317985285, 318146760, 318308316
        .long 318469955, 318631676, 318793478, 318955363, 319117330, 319279380
        .long 319441511, 319603725, 319766022, 319928401, 320090862, 320253406
        .long 320416032, 320578741, 320741532, 320904407, 321067363, 321230403
        .long 321393525, 321556731, 321720019, 321883390, 322046844, 322210381
        .long 322374001, 322537704, 322701490, 322865360, 323029312, 323193348
        .long 323357468, 323521670, 323685956, 323850325, 324014778, 324179315
        .long 324343935, 324508638, 324673425, 324838296, 325003250, 325168289
        .long 325333411, 325498617, 325663907, 325829280, 325994738, 326160280
        .long 326325906, 326491616, 326657410, 326823288, 326989251, 327155297
        .long 327321429, 327487644, 327653944, 327820328, 327986797, 328153350
        .long 328319988, 328486711, 328653518, 328820410, 328987387, 329154448
        .long 329321594, 329488826, 329656142, 329823543, 329991029, 330158600
        .long 330326256, 330493997, 330661824, 330829736, 330997733, 331165815
        .long 331333983, 331502236, 331670574, 331838998, 332007508, 332176103
        .long 332344784, 332513550, 332682402, 332851340, 333020363, 333189473
        .long 333358668, 333527949, 333697316, 333866770, 334036309, 334205934
        .long 334375646, 334545443, 334715327, 334885297, 335055354, 335225497
        .long 335395726, 335566041, 335736444, 335906932, 336077507, 336248169
        .long 336418918, 336589753, 336760675, 336931684, 337102779, 337273962
        .long 337445231, 337616588, 337788031, 337959562, 338131179, 338302884
        .long 338474676, 338646555, 338818521, 338990575, 339162716, 339334945
        .long 339507261, 339679664, 339852155, 340024734, 340197400, 340370154
        .long 340542996, 340715925, 340888943, 341062048, 341235241, 341408522
        .long 341581891, 341755348, 341928893, 342102526, 342276247, 342450057
        .long 342623955, 342797941, 342972016, 343146178, 343320430, 343494770
        .long 343669198, 343843715, 344018321, 344193015, 344367798, 344542669
        .long 344717630, 344892679, 345067818, 345243045, 345418361, 345593766
        .long 345769260, 345944844, 346120516, 346296278, 346472129, 346648069
        .long 346824099, 347000218, 347176426, 347352724, 347529112, 347705589
        .long 347882156, 348058812, 348235558, 348412394, 348589319, 348766335
        .long 348943440, 349120635, 349297920, 349475296, 349652761, 349830316
        .long 350007962, 350185698, 350363524, 350541440, 350719447, 350897544
        .long 351075732, 351254010, 351432378, 351610837, 351789387, 351968027
        .long 352146759, 352325581, 352504493, 352683497, 352862591, 353041777
        .long 353221053, 353400421, 353579879, 353759429, 353939069, 354118802
        .long 354298625, 354478539, 354658545, 354838643, 355018832, 355199112
        .long 355379484, 355559947, 355740503, 355921149, 356101888, 356282718
        .long 356463640, 356644655, 356825760, 357006958, 357188248, 357369630
        .long 357551104, 357732671, 357914329, 358096080, 358277923, 358459858
        .long 358641886, 358824006, 359006219, 359188524, 359370922, 359553412
        .long 359735995, 359918671, 360101439, 360284301, 360467255, 360650302
        .long 360833442, 361016675, 361200001, 361383420, 361566933, 361750538
        .long 361934237, 362118029, 362301914, 362485893, 362669965, 362854131
        .long 363038390, 363222743, 363407189, 363591729, 363776363, 363961090
        .long 364145911, 364330827, 364515836, 364700939, 364886136, 365071427
        .long 365256812, 365442291, 365627864, 365813532, 365999294, 366185150
        .long 366371101, 366557146, 366743286, 366929520, 367115848, 367302272
        .long 367488790, 367675402, 367862110, 368048912, 368235809, 368422801
        .long 368609888, 368797070, 368984347, 369171719, 369359186, 369546749
        .long 369734407, 369922160, 370110008, 370297952, 370485991, 370674125
        .long 370862356, 371050681, 371239103, 371427620, 371616233, 371804941
        .long 371993746, 372182646, 372371642, 372560734, 372749923, 372939207
        .long 373128587, 373318064, 373507637, 373697306, 373887071, 374076933
        .long 374266891, 374456946, 374647097, 374837345, 375027689, 375218130
        .long 375408667, 375599302, 375790033, 375980861, 376171786, 376362808
        .long 376553927, 376745143, 376936456, 377127866, 377319374, 377510978
        .long 377702680, 377894480, 378086376, 378278371, 378470462, 378662652
        .long 378854938, 379047323, 379239805, 379432385, 379625062
        .align 4
sy1_saw:
        .word -16384, -16316, -16248, -16180, -16112, -16044
        .word -15976, -15908, -15840, -15772, -15704, -15636
        .word -15568, -15500, -15432, -15364, -15296, -15228
        .word -15160, -15092, -15024, -14956, -14888, -14820
        .word -14752, -14684, -14616, -14548, -14480, -14412
        .word -14344, -14276, -14208, -14140, -14072, -14004
        .word -13936, -13868, -13800, -13732, -13664, -13596
        .word -13528, -13460, -13392, -13324, -13256, -13188
        .word -13120, -13052, -12984, -12916, -12848, -12780
        .word -12712, -12644, -12576, -12508, -12440, -12372
        .word -12304, -12236, -12168, -12100, -12032, -11964
        .word -11896, -11828, -11760, -11692, -11624, -11556
        .word -11488, -11420, -11352, -11284, -11216, -11148
        .word -11080, -11012, -10944, -10876, -10808, -10740
        .word -10672, -10604, -10536, -10468, -10400, -10332
        .word -10264, -10196, -10128, -10060, -9992, -9924
        .word -9856, -9788, -9720, -9652, -9584, -9516
        .word -9448, -9380, -9312, -9244, -9176, -9108
        .word -9040, -8972, -8904, -8836, -8768, -8700
        .word -8632, -8564, -8496, -8428, -8360, -8292
        .word -8224, -8156, -8088, -8020, -7952, -7884
        .word -7816, -7748, -7680, -7612, -7544, -7476
        .word -7408, -7340, -7272, -7204, -7136, -7068
        .word -7000, -6932, -6864, -6796, -6728, -6660
        .word -6592, -6524, -6456, -6388, -6320, -6252
        .word -6184, -6116, -6048, -5980, -5912, -5844
        .word -5776, -5708, -5640, -5572, -5504, -5436
        .word -5368, -5300, -5232, -5164, -5096, -5028
        .word -4960, -4892, -4824, -4756, -4688, -4620
        .word -4552, -4484, -4416, -4348, -4280, -4212
        .word -4144, -4076, -4008, -3940, -3872, -3804
        .word -3736, -3668, -3600, -3532, -3464, -3396
        .word -3328, -3260, -3192, -3124, -3056, -2988
        .word -2920, -2852, -2784, -2716, -2648, -2580
        .word -2512, -2444, -2376, -2308, -2240, -2172
        .word -2104, -2036, -1968, -1900, -1832, -1764
        .word -1696, -1628, -1560, -1492, -1424, -1356
        .word -1288, -1220, -1152, -1084, -1016, -948
        .word -880, -812, -744, -676, -608, -540
        .word -472, -404, -336, -268, -200, -132
        .word -64, 4, 72, 140, 208, 276
        .word 344, 412, 480, 548, 616, 684
        .word 752, 820, 888, 956, 1024, 1092
        .word 1160, 1228, 1296, 1364, 1432, 1500
        .word 1568, 1636, 1704, 1772, 1840, 1908
        .word 1976, 2044, 2112, 2180, 2248, 2316
        .word 2384, 2452, 2520, 2588, 2656, 2724
        .word 2792, 2860, 2928, 2996, 3064, 3132
        .word 3200, 3268, 3336, 3404, 3472, 3540
        .word 3608, 3676, 3744, 3812, 3880, 3948
        .word 4016, 4084, 4152, 4220, 4288, 4356
        .word 4424, 4492, 4560, 4628, 4696, 4764
        .word 4832, 4900, 4968, 5036, 5104, 5172
        .word 5240, 5308, 5376, 5444, 5512, 5580
        .word 5648, 5716, 5784, 5852, 5920, 5988
        .word 6056, 6124, 6192, 6260, 6328, 6396
        .word 6464, 6532, 6600, 6668, 6736, 6804
        .word 6872, 6940, 7008, 7076, 7144, 7212
        .word 7280, 7348, 7416, 7484, 7552, 7620
        .word 7688, 7756, 7824, 7892, 7960, 8028
        .word 8096, 8164, 8232, 8300, 8368, 8436
        .word 8504, 8572, 8640, 8708, 8776, 8844
        .word 8912, 8980, 9048, 9116, 9184, 9252
        .word 9320, 9388, 9456, 9524, 9592, 9660
        .word 9728, 9796, 9864, 9932, 10000, 10068
        .word 10136, 10204, 10272, 10340, 10408, 10476
        .word 10544, 10612, 10680, 10748, 10816, 10884
        .word 10952, 11020, 11088, 11156, 11224, 11292
        .word 11360, 11428, 11496, 11564, 11632, 11700
        .word 11768, 11836, 11904, 11972, 12040, 12108
        .word 12176, 12244, 12312, 12380, 12448, 12516
        .word 12584, 12652, 12720, 12788, 12856, 12924
        .word 12992, 13060, 13128, 13196, 13264, 13332
        .word 13400, 13468, 13536, 13604, 13672, 13740
        .word 13808, 13876, 13944, 14012, 14080, 14148
        .word 14216, 14284, 14352, 14420, 14488, 14556
        .word 14624, 14692, 14760, 14828, 14896, 14964
        .word 15032, 15100, 15168, 15236, 15304, 15372
        .word 15440, 15508, 15576, 15644, 15712, 15780
        .word 15848, 15916, 15984, 16052, 16120, 16188
        .word 16256, 16324, 16384, 16379, 16375, 16371
        .word 16366, 16362, 16358, 16354, 16350, 16345
        .word 16341, 16337, 16332, 16328, 16324, 16320
        .word 16316, 16311, 16307, 16303, 16298, 16294
        .word 16290, 16286, 16282, 16277, 16273, 16269
        .word 16264, 16260, 16256, 16252, 16248, 16243
        .word 16239, 16235, 16230, 16226, 16222, 16218
        .word 16214, 16209, 16205, 16201, 16196, 16192
        .word 16188, 16184, 16180, 16175, 16171, 16167
        .word 16162, 16158, 16154, 16150, 16146, 16141
        .word 16137, 16133, 16128, 16124, 16120, 16116
        .word 16112, 16107, 16103, 16099, 16094, 16090
        .word 16086, 16082, 16078, 16073, 16069, 16065
        .word 16060, 16056, 16052, 16048, 16044, 16039
        .word 16035, 16031, 16026, 16022, 16018, 16014
        .word 16010, 16005, 16001, 15997, 15992, 15988
        .word 15984, 15980, 15976, 15971, 15967, 15963
        .word 15958, 15954, 15950, 15946, 15942, 15937
        .word 15933, 15929, 15924, 15920, 15916, 15912
        .word 15908, 15903, 15899, 15895, 15890, 15886
        .word 15882, 15878, 15874, 15869, 15865, 15861
        .word 15856, 15852, 15848, 15844, 15840, 15835
        .word 15831, 15827, 15822, 15818, 15814, 15810
        .word 15806, 15801, 15797, 15793, 15788, 15784
        .word 15780, 15776, 15772, 15767, 15763, 15759
        .word 15754, 15750, 15746, 15742, 15738, 15733
        .word 15729, 15725, 15720, 15716, 15712, 15708
        .word 15704, 15699, 15695, 15691, 15686, 15682
        .word 15678, 15674, 15670, 15665, 15661, 15657
        .word 15652, 15648, 15644, 15640, 15636, 15631
        .word 15627, 15623, 15618, 15614, 15610, 15606
        .word 15602, 15597, 15593, 15589, 15584, 15580
        .word 15576, 15572, 15568, 15563, 15559, 15555
        .word 15550, 15546, 15542, 15538, 15534, 15529
        .word 15525, 15521, 15516, 15512, 15508, 15504
        .word 15500, 15495, 15491, 15487, 15482, 15478
        .word 15474, 15470, 15466, 15461, 15457, 15453
        .word 15448, 15444, 15440, 15436, 15432, 15427
        .word 15423, 15419, 15414, 15410, 15406, 15402
        .word 15398, 15393, 15389, 15385, 15380, 15376
        .word 15372, 15368, 15364, 15359, 15355, 15351
        .word 15346, 15342, 15338, 15334, 15330, 15325
        .word 15321, 15317, 15312, 15308, 15304, 15300
        .word 15296, 15291, 15287, 15283, 15278, 15274
        .word 15270, 15266, 15262, 15257, 15253, 15249
        .word 15244, 15240, 15236, 15232, 15228, 15223
        .word 15219, 15215, 15210, 15206, 15202, 15198
        .word 15194, 15189, 15185, 15181, 15176, 15172
        .word 15168, 15164, 15160, 15155, 15151, 15147
        .word 15142, 15138, 15134, 15130, 15126, 15121
        .word 15117, 15113, 15108, 15104, 15100, 15096
        .word 15092, 15087, 15083, 15079, 15074, 15070
        .word 15066, 15062, 15058, 15053, 15049, 15045
        .word 15040, 15036, 15032, 15028, 15024, 15019
        .word 15015, 15011, 15006, 15002, 14998, 14994
        .word 14990, 14985, 14981, 14977, 14972, 14968
        .word 14964, 14960, 14956, 14951, 14947, 14943
        .word 14938, 14934, 14930, 14926, 14922, 14917
        .word 14913, 14909, 14904, 14900, 14896, 14892
        .word 14888, 14883, 14879, 14875, 14870, 14866
        .word 14862, 14858, 14854, 14849, 14845, 14841
        .word 14836, 14832, 14828, 14824, 14820, 14815
        .word 14811, 14807, 14802, 14798, 14794, 14790
        .word 14786, 14781, 14777, 14773, 14768, 14764
        .word 14760, 14756, 14752, 14747, 14743, 14739
        .word 14734, 14730, 14726, 14722, 14718, 14713
        .word 14709, 14705, 14700, 14696, 14692, 14688
        .word 14684, 14679, 14675, 14671, 14666, 14662
        .word 14658, 14654, 14650, 14645, 14641, 14637
        .word 14632, 14628, 14624, 14620, 14616, 14611
        .word 14607, 14603, 14598, 14594, 14590, 14586
        .word 14582, 14577, 14573, 14569, 14564, 14560
        .word 14556, 14552, 14548, 14543, 14539, 14535
        .word 14530, 14526, 14522, 14518, 14514, 14509
        .word 14505, 14501, 14496, 14492, 14488, 14484
        .word 14480, 14475, 14471, 14467, 14462, 14458
        .word 14454, 14450, 14446, 14441, 14437, 14433
        .word 14428, 14424, 14420, 14416, 14412, 14407
        .word 14403, 14399, 14394, 14390, 14386, 14382
        .word 14378, 14373, 14369, 14365, 14360, 14356
        .word 14352, 14348, 14344, 14339, 14335, 14331
        .word 14326, 14322, 14318, 14314, 14310, 14305
        .word 14301, 14297, 14292, 14288, 14284, 14280
        .word 14276, 14271, 14267, 14263, 14258, 14254
        .word 14250, 14246, 14242, 14237, 14233, 14229
        .word 14224, 14220, 14216, 14212, 14208, 14203
        .word 14199, 14195, 14190, 14186, 14182, 14178
        .word 14174, 14169, 14165, 14161, 14156, 14152
        .word 14148, 14144, 14140, 14135, 14131, 14127
        .word 14122, 14118, 14114, 14110, 14106, 14101
        .word 14097, 14093, 14088, 14084, 14080, 14076
        .word 14072, 14067, 14063, 14059, 14054, 14050
        .word 14046, 14042, 14038, 14033, 14029, 14025
        .word 14020, 14016, 14012, 14008, 14004, 13999
        .word 13995, 13991, 13986, 13982, 13978, 13974
        .word 13970, 13965, 13961, 13957, 13952, 13948
        .word 13944, 13940, 13936, 13931, 13927, 13923
        .word 13918, 13914, 13910, 13906, 13902, 13897
        .word 13893, 13889, 13884, 13880, 13876, 13872
        .word 13868, 13863, 13859, 13855, 13850, 13846
        .word 13842, 13838, 13834, 13829, 13825, 13821
        .word 13816, 13812, 13808, 13804, 13800, 13795
        .word 13791, 13787, 13782, 13778, 13774, 13770
        .word 13766, 13761, 13757, 13753, 13748, 13744
        .word 13740, 13736, 13732, 13727, 13723, 13719
        .word 13714, 13710, 13706, 13702, 13698, 13693
        .word 13689, 13685, 13680, 13676, 13672, 13668
        .word 13664, 13659, 13655, 13651, 13646, 13642
        .word 13638, 13634, 13630, 13625, 13621, 13617
        .word 13612, 13608, 13604, 13600, 13596, 13591
        .word 13587, 13583, 13578, 13574, 13570, 13566
        .word 13562, 13557, 13553, 13549, 13544, 13540
        .word 13536, 13532, 13528, 13523, 13519, 13515
        .word 13510, 13506, 13502, 13498, 13494, 13489
        .word 13485, 13481, 13476, 13472, 13468, 13464
        .word 13460, 13455, 13451, 13447, 13442, 13438
        .word 13434, 13430, 13426, 13421, 13417, 13413
        .word 13408, 13404, 13400, 13396, 13392, 13387
        .word 13383, 13379, 13374, 13370, 13366, 13362
        .word 13358, 13353, 13349, 13345, 13340, 13336
        .word 13332, 13328, 13324, 13319, 13315, 13311
        .word 13306, 13302, 13298, 13294, 13290, 13285
        .word 13281, 13277, 13272, 13268, 13264, 13260
        .word 13256, 13251, 13247, 13243, 13238, 13234
        .word 13230, 13226, 13222, 13217, 13213, 13209
        .word 13204, 13200, 13196, 13192, 13188, 13183
        .word 13179, 13175, 13170, 13166, 13162, 13158
        .word 13154, 13149, 13145, 13141, 13136, 13132
        .word 13128, 13124, 13120, 13115, 13111, 13107
        .word 13102, 13098, 13094, 13090, 13086, 13081
        .word 13077, 13073, 13068, 13064, 13060, 13056
        .word 13052, 13047, 13043, 13039, 13034, 13030
        .word 13026, 13022, 13018, 13013, 13009, 13005
        .word 13000, 12996, 12992, 12988, 12984, 12979
        .word 12975, 12971, 12966, 12962, 12958, 12954
        .word 12950, 12945, 12941, 12937, 12932, 12928
        .word 12924, 12920, 12916, 12911, 12907, 12903
        .word 12898, 12894, 12890, 12886, 12882, 12877
        .word 12873, 12869, 12864, 12860, 12856, 12852
        .word 12848, 12843, 12839, 12835, 12830, 12826
        .word 12822, 12818, 12814, 12809, 12805, 12801
        .word 12796, 12792, 12788, 12784, 12780, 12775
        .word 12771, 12767, 12762, 12758, 12754, 12750
        .word 12746, 12741, 12737, 12733, 12728, 12724
        .word 12720, 12716, 12712, 12707, 12703, 12699
        .word 12694, 12690, 12686, 12682, 12678, 12673
        .word 12669, 12665, 12660, 12656, 12652, 12648
        .word 12644, 12639, 12635, 12631, 12626, 12622
        .word 12618, 12614, 12610, 12605, 12601, 12597
        .word 12592, 12588, 12584, 12580, 12576, 12571
        .word 12567, 12563, 12558, 12554, 12550, 12546
        .word 12542, 12537, 12533, 12529, 12524, 12520
        .word 12516, 12512, 12508, 12503, 12499, 12495
        .word 12490, 12486, 12482, 12478, 12474, 12469
        .word 12465, 12461, 12456, 12452, 12448, 12444
        .word 12440, 12435, 12431, 12427, 12422, 12418
        .word 12414, 12410, 12406, 12401, 12397, 12393
        .word 12388, 12384, 12380, 12376, 12372, 12367
        .word 12363, 12359, 12354, 12350, 12346, 12342
        .word 12338, 12333, 12329, 12325, 12320, 12316
        .word 12312, 12308, 12304, 12299, 12295, 12291
        .word 12286, 12282, 12278, 12274, 12270, 12265
        .word 12261, 12257, 12252, 12248, 12244, 12240
        .word 12236, 12231, 12227, 12223, 12218, 12214
        .word 12210, 12206, 12202, 12197, 12193, 12189
        .word 12184, 12180, 12176, 12172, 12168, 12163
        .word 12159, 12155, 12150, 12146, 12142, 12138
        .word 12134, 12129, 12125, 12121, 12116, 12112
        .word 12108, 12104, 12100, 12095, 12091, 12087
        .word 12082, 12078, 12074, 12070, 12066, 12061
        .word 12057, 12053, 12048, 12044, 12040, 12036
        .word 12032, 12027, 12023, 12019, 12014, 12010
        .word 12006, 12002, 11998, 11993, 11989, 11985
        .word 11980, 11976, 11972, 11968, 11964, 11959
        .word 11955, 11951, 11946, 11942, 11938, 11934
        .word 11930, 11925, 11921, 11917, 11912, 11908
        .word 11904, 11900, 11896, 11891, 11887, 11883
        .word 11878, 11874, 11870, 11866, 11862, 11857
        .word 11853, 11849, 11844, 11840, 11836, 11832
        .word 11828, 11823, 11819, 11815, 11810, 11806
        .word 11802, 11798, 11794, 11789, 11785, 11781
        .word 11776, 11772, 11768, 11764, 11760, 11755
        .word 11751, 11747, 11742, 11738, 11734, 11730
        .word 11726, 11721, 11717, 11713, 11708, 11704
        .word 11700, 11696, 11692, 11687, 11683, 11679
        .word 11674, 11670, 11666, 11662, 11658, 11653
        .word 11649, 11645, 11640, 11636, 11632, 11628
        .word 11624, 11619, 11615, 11611, 11606, 11602
        .word 11598, 11594, 11590, 11585, 11581, 11577
        .word 11572, 11568, 11564, 11560, 11556, 11551
        .word 11547, 11543, 11538, 11534, 11530, 11526
        .word 11522, 11517, 11513, 11509, 11504, 11500
        .word 11496, 11492, 11488, 11483, 11479, 11475
        .word 11470, 11466, 11462, 11458, 11454, 11449
        .word 11445, 11441, 11436, 11432, 11428, 11424
        .word 11420, 11415, 11411, 11407, 11402, 11398
        .word 11394, 11390, 11386, 11381, 11377, 11373
        .word 11368, 11364, 11360, 11356, 11352, 11347
        .word 11343, 11339, 11334, 11330, 11326, 11322
        .word 11318, 11313, 11309, 11305, 11300, 11296
        .word 11292, 11288, 11284, 11279, 11275, 11271
        .word 11266, 11262, 11258, 11254, 11250, 11245
        .word 11241, 11237, 11232, 11228, 11224, 11220
        .word 11216, 11211, 11207, 11203, 11198, 11194
        .word 11190, 11186, 11182, 11177, 11173, 11169
        .word 11164, 11160, 11156, 11152, 11148, 11143
        .word 11139, 11135, 11130, 11126, 11122, 11118
        .word 11114, 11109, 11105, 11101, 11096, 11092
        .word 11088, 11084, 11080, 11075, 11071, 11067
        .word 11062, 11058, 11054, 11050, 11046, 11041
        .word 11037, 11033, 11028, 11024, 11020, 11016
        .word 11012, 11007, 11003, 10999, 10994, 10990
        .word 10986, 10982, 10978, 10973, 10969, 10965
        .word 10960, 10956, 10952, 10948, 10944, 10939
        .word 10935, 10931, 10926, 10922, 10918, 10914
        .word 10910, 10905, 10901, 10897, 10892, 10888
        .word 10884, 10880, 10876, 10871, 10867, 10863
        .word 10858, 10854, 10850, 10846, 10842, 10837
        .word 10833, 10829, 10824, 10820, 10816, 10812
        .word 10808, 10803, 10799, 10795, 10790, 10786
        .word 10782, 10778, 10774, 10769, 10765, 10761
        .word 10756, 10752, 10748, 10744, 10740, 10735
        .word 10731, 10727, 10722, 10718, 10714, 10710
        .word 10706, 10701, 10697, 10693, 10688, 10684
        .word 10680, 10676, 10672, 10667, 10663, 10659
        .word 10654, 10650, 10646, 10642, 10638, 10633
        .word 10629, 10625, 10620, 10616, 10612, 10608
        .word 10604, 10599, 10595, 10591, 10586, 10582
        .word 10578, 10574, 10570, 10565, 10561, 10557
        .word 10552, 10548, 10544, 10540, 10536, 10531
        .word 10527, 10523, 10518, 10514, 10510, 10506
        .word 10502, 10497, 10493, 10489, 10484, 10480
        .word 10476, 10472, 10468, 10463, 10459, 10455
        .word 10450, 10446, 10442, 10438, 10434, 10429
        .word 10425, 10421, 10416, 10412, 10408, 10404
        .word 10400, 10395, 10391, 10387, 10382, 10378
        .word 10374, 10370, 10366, 10361, 10357, 10353
        .word 10348, 10344, 10340, 10336, 10332, 10327
        .word 10323, 10319, 10314, 10310, 10306, 10302
        .word 10298, 10293, 10289, 10285, 10280, 10276
        .word 10272, 10268, 10264, 10259, 10255, 10251
        .word 10246, 10242, 10238, 10234, 10230, 10225
        .word 10221, 10217, 10212, 10208, 10204, 10200
        .word 10196, 10191, 10187, 10183, 10178, 10174
        .word 10170, 10166, 10162, 10157, 10153, 10149
        .word 10144, 10140, 10136, 10132, 10128, 10123
        .word 10119, 10115, 10110, 10106, 10102, 10098
        .word 10094, 10089, 10085, 10081, 10076, 10072
        .word 10068, 10064, 10060, 10055, 10051, 10047
        .word 10042, 10038, 10034, 10030, 10026, 10021
        .word 10017, 10013, 10008, 10004, 10000, 9996
        .word 9992, 9987, 9983, 9979, 9974, 9970
        .word 9966, 9962, 9958, 9953, 9949, 9945
        .word 9940, 9936, 9932, 9928, 9924, 9919
        .word 9915, 9911, 9906, 9902, 9898, 9894
        .word 9890, 9885, 9881, 9877, 9872, 9868
        .word 9864, 9860, 9856, 9851, 9847, 9843
        .word 9838, 9834, 9830, 9826, 9822, 9817
        .word 9813, 9809, 9804, 9800, 9796, 9792
        .word 9788, 9783, 9779, 9775, 9770, 9766
        .word 9762, 9758, 9754, 9749, 9745, 9741
        .word 9736, 9732, 9728, 9724, 9720, 9715
        .word 9711, 9707, 9702, 9698, 9694, 9690
        .word 9686, 9681, 9677, 9673, 9668, 9664
        .word 9660, 9656, 9652, 9647, 9643, 9639
        .word 9634, 9630, 9626, 9622, 9618, 9613
        .word 9609, 9605, 9600, 9596, 9592, 9588
        .word 9584, 9579, 9575, 9571, 9566, 9562
        .word 9558, 9554, 9550, 9545, 9541, 9537
        .word 9532, 9528, 9524, 9520, 9516, 9511
        .word 9507, 9503, 9498, 9494, 9490, 9486
        .word 9482, 9477, 9473, 9469, 9464, 9460
        .word 9456, 9452, 9448, 9443, 9439, 9435
        .word 9430, 9426, 9422, 9418, 9414, 9409
        .word 9405, 9401, 9396, 9392, 9388, 9384
        .word 9380, 9375, 9371, 9367, 9362, 9358
        .word 9354, 9350, 9346, 9341, 9337, 9333
        .word 9328, 9324, 9320, 9316, 9312, 9307
        .word 9303, 9299, 9294, 9290, 9286, 9282
        .word 9278, 9273, 9269, 9265, 9260, 9256
        .word 9252, 9248, 9244, 9239, 9235, 9231
        .word 9226, 9222, 9218, 9214, 9210, 9205
        .word 9201, 9197, 9192, 9188, 9184, 9180
        .word 9176, 9171, 9167, 9163, 9158, 9154
        .word 9150, 9146, 9142, 9137, 9133, 9129
        .word 9124, 9120, 9116, 9112, 9108, 9103
        .word 9099, 9095, 9090, 9086, 9082, 9078
        .word 9074, 9069, 9065, 9061, 9056, 9052
        .word 9048, 9044, 9040, 9035, 9031, 9027
        .word 9022, 9018, 9014, 9010, 9006, 9001
        .word 8997, 8993, 8988, 8984, 8980, 8976
        .word 8972, 8967, 8963, 8959, 8954, 8950
        .word 8946, 8942, 8938, 8933, 8929, 8925
        .word 8920, 8916, 8912, 8908, 8904, 8899
        .word 8895, 8891, 8886, 8882, 8878, 8874
        .word 8870, 8865, 8861, 8857, 8852, 8848
        .word 8844, 8840, 8836, 8831, 8827, 8823
        .word 8818, 8814, 8810, 8806, 8802, 8797
        .word 8793, 8789, 8784, 8780, 8776, 8772
        .word 8768, 8763, 8759, 8755, 8750, 8746
        .word 8742, 8738, 8734, 8729, 8725, 8721
        .word 8716, 8712, 8708, 8704, 8700, 8695
        .word 8691, 8687, 8682, 8678, 8674, 8670
        .word 8666, 8661, 8657, 8653, 8648, 8644
        .word 8640, 8636, 8632, 8627, 8623, 8619
        .word 8614, 8610, 8606, 8602, 8598, 8593
        .word 8589, 8585, 8580, 8576, 8572, 8568
        .word 8564, 8559, 8555, 8551, 8546, 8542
        .word 8538, 8534, 8530, 8525, 8521, 8517
        .word 8512, 8508, 8504, 8500, 8496, 8491
        .word 8487, 8483, 8478, 8474, 8470, 8466
        .word 8462, 8457, 8453, 8449, 8444, 8440
        .word 8436, 8432, 8428, 8423, 8419, 8415
        .word 8410, 8406, 8402, 8398, 8394, 8389
        .word 8385, 8381, 8376, 8372, 8368, 8364
        .word 8360, 8355, 8351, 8347, 8342, 8338
        .word 8334, 8330, 8326, 8321, 8317, 8313
        .word 8308, 8304, 8300, 8296, 8292, 8287
        .word 8283, 8279, 8274, 8270, 8266, 8262
        .word 8258, 8253, 8249, 8245, 8240, 8236
        .word 8232, 8228, 8224, 8219, 8215, 8211
        .word 8206, 8202, 8198, 8194, 8190, 8185
        .word 8181, 8177, 8172, 8168, 8164, 8160
        .word 8156, 8151, 8147, 8143, 8138, 8134
        .word 8130, 8126, 8122, 8117, 8113, 8109
        .word 8104, 8100, 8096, 8092, 8088, 8083
        .word 8079, 8075, 8070, 8066, 8062, 8058
        .word 8054, 8049, 8045, 8041, 8036, 8032
        .word 8028, 8024, 8020, 8015, 8011, 8007
        .word 8002, 7998, 7994, 7990, 7986, 7981
        .word 7977, 7973, 7968, 7964, 7960, 7956
        .word 7952, 7947, 7943, 7939, 7934, 7930
        .word 7926, 7922, 7918, 7913, 7909, 7905
        .word 7900, 7896, 7892, 7888, 7884, 7879
        .word 7875, 7871, 7866, 7862, 7858, 7854
        .word 7850, 7845, 7841, 7837, 7832, 7828
        .word 7824, 7820, 7816, 7811, 7807, 7803
        .word 7798, 7794, 7790, 7786, 7782, 7777
        .word 7773, 7769, 7764, 7760, 7756, 7752
        .word 7748, 7743, 7739, 7735, 7730, 7726
        .word 7722, 7718, 7714, 7709, 7705, 7701
        .word 7696, 7692, 7688, 7684, 7680, 7675
        .word 7671, 7667, 7662, 7658, 7654, 7650
        .word 7646, 7641, 7637, 7633, 7628, 7624
        .word 7620, 7616, 7612, 7607, 7603, 7599
        .word 7594, 7590, 7586, 7582, 7578, 7573
        .word 7569, 7565, 7560, 7556, 7552, 7548
        .word 7544, 7539, 7535, 7531, 7526, 7522
        .word 7518, 7514, 7510, 7505, 7501, 7497
        .word 7492, 7488, 7484, 7480, 7476, 7471
        .word 7467, 7463, 7458, 7454, 7450, 7446
        .word 7442, 7437, 7433, 7429, 7424, 7420
        .word 7416, 7412, 7408, 7403, 7399, 7395
        .word 7390, 7386, 7382, 7378, 7374, 7369
        .word 7365, 7361, 7356, 7352, 7348, 7344
        .word 7340, 7335, 7331, 7327, 7322, 7318
        .word 7314, 7310, 7306, 7301, 7297, 7293
        .word 7288, 7284, 7280, 7276, 7272, 7267
        .word 7263, 7259, 7254, 7250, 7246, 7242
        .word 7238, 7233, 7229, 7225, 7220, 7216
        .word 7212, 7208, 7204, 7199, 7195, 7191
        .word 7186, 7182, 7178, 7174, 7170, 7165
        .word 7161, 7157, 7152, 7148, 7144, 7140
        .word 7136, 7131, 7127, 7123, 7118, 7114
        .word 7110, 7106, 7102, 7097, 7093, 7089
        .word 7084, 7080, 7076, 7072, 7068, 7063
        .word 7059, 7055, 7050, 7046, 7042, 7038
        .word 7034, 7029, 7025, 7021, 7016, 7012
        .word 7008, 7004, 7000, 6995, 6991, 6987
        .word 6982, 6978, 6974, 6970, 6966, 6961
        .word 6957, 6953, 6948, 6944, 6940, 6936
        .word 6932, 6927, 6923, 6919, 6914, 6910
        .word 6906, 6902, 6898, 6893, 6889, 6885
        .word 6880, 6876, 6872, 6868, 6864, 6859
        .word 6855, 6851, 6846, 6842, 6838, 6834
        .word 6830, 6825, 6821, 6817, 6812, 6808
        .word 6804, 6800, 6796, 6791, 6787, 6783
        .word 6778, 6774, 6770, 6766, 6762, 6757
        .word 6753, 6749, 6744, 6740, 6736, 6732
        .word 6728, 6723, 6719, 6715, 6710, 6706
        .word 6702, 6698, 6694, 6689, 6685, 6681
        .word 6676, 6672, 6668, 6664, 6660, 6655
        .word 6651, 6647, 6642, 6638, 6634, 6630
        .word 6626, 6621, 6617, 6613, 6608, 6604
        .word 6600, 6596, 6592, 6587, 6583, 6579
        .word 6574, 6570, 6566, 6562, 6558, 6553
        .word 6549, 6545, 6540, 6536, 6532, 6528
        .word 6524, 6519, 6515, 6511, 6506, 6502
        .word 6498, 6494, 6490, 6485, 6481, 6477
        .word 6472, 6468, 6464, 6460, 6456, 6451
        .word 6447, 6443, 6438, 6434, 6430, 6426
        .word 6422, 6417, 6413, 6409, 6404, 6400
        .word 6396, 6392, 6388, 6383, 6379, 6375
        .word 6370, 6366, 6362, 6358, 6354, 6349
        .word 6345, 6341, 6336, 6332, 6328, 6324
        .word 6320, 6315, 6311, 6307, 6302, 6298
        .word 6294, 6290, 6286, 6281, 6277, 6273
        .word 6268, 6264, 6260, 6256, 6252, 6247
        .word 6243, 6239, 6234, 6230, 6226, 6222
        .word 6218, 6213, 6209, 6205, 6200, 6196
        .word 6192, 6188, 6184, 6179, 6175, 6171
        .word 6166, 6162, 6158, 6154, 6150, 6145
        .word 6141, 6137, 6132, 6128, 6124, 6120
        .word 6116, 6111, 6107, 6103, 6098, 6094
        .word 6090, 6086, 6082, 6077, 6073, 6069
        .word 6064, 6060, 6056, 6052, 6048, 6043
        .word 6039, 6035, 6030, 6026, 6022, 6018
        .word 6014, 6009, 6005, 6001, 5996, 5992
        .word 5988, 5984, 5980, 5975, 5971, 5967
        .word 5962, 5958, 5954, 5950, 5946, 5941
        .word 5937, 5933, 5928, 5924, 5920, 5916
        .word 5912, 5907, 5903, 5899, 5894, 5890
        .word 5886, 5882, 5878, 5873, 5869, 5865
        .word 5860, 5856, 5852, 5848, 5844, 5839
        .word 5835, 5831, 5826, 5822, 5818, 5814
        .word 5810, 5805, 5801, 5797, 5792, 5788
        .word 5784, 5780, 5776, 5771, 5767, 5763
        .word 5758, 5754, 5750, 5746, 5742, 5737
        .word 5733, 5729, 5724, 5720, 5716, 5712
        .word 5708, 5703, 5699, 5695, 5690, 5686
        .word 5682, 5678, 5674, 5669, 5665, 5661
        .word 5656, 5652, 5648, 5644, 5640, 5635
        .word 5631, 5627, 5622, 5618, 5614, 5610
        .word 5606, 5601, 5597, 5593, 5588, 5584
        .word 5580, 5576, 5572, 5567, 5563, 5559
        .word 5554, 5550, 5546, 5542, 5538, 5533
        .word 5529, 5525, 5520, 5516, 5512, 5508
        .word 5504, 5499, 5495, 5491, 5486, 5482
        .word 5478, 5474, 5470, 5465, 5461, 5457
        .word 5452, 5448, 5444, 5440, 5436, 5431
        .word 5427, 5423, 5418, 5414, 5410, 5406
        .word 5402, 5397, 5393, 5389, 5384, 5380
        .word 5376, 5372, 5368, 5363, 5359, 5355
        .word 5350, 5346, 5342, 5338, 5334, 5329
        .word 5325, 5321, 5316, 5312, 5308, 5304
        .word 5300, 5295, 5291, 5287, 5282, 5278
        .word 5274, 5270, 5266, 5261, 5257, 5253
        .word 5248, 5244, 5240, 5236, 5232, 5227
        .word 5223, 5219, 5214, 5210, 5206, 5202
        .word 5198, 5193, 5189, 5185, 5180, 5176
        .word 5172, 5168, 5164, 5159, 5155, 5151
        .word 5146, 5142, 5138, 5134, 5130, 5125
        .word 5121, 5117, 5112, 5108, 5104, 5100
        .word 5096, 5091, 5087, 5083, 5078, 5074
        .word 5070, 5066, 5062, 5057, 5053, 5049
        .word 5044, 5040, 5036, 5032, 5028, 5023
        .word 5019, 5015, 5010, 5006, 5002, 4998
        .word 4994, 4989, 4985, 4981, 4976, 4972
        .word 4968, 4964, 4960, 4955, 4951, 4947
        .word 4942, 4938, 4934, 4930, 4926, 4921
        .word 4917, 4913, 4908, 4904, 4900, 4896
        .word 4892, 4887, 4883, 4879, 4874, 4870
        .word 4866, 4862, 4858, 4853, 4849, 4845
        .word 4840, 4836, 4832, 4828, 4824, 4819
        .word 4815, 4811, 4806, 4802, 4798, 4794
        .word 4790, 4785, 4781, 4777, 4772, 4768
        .word 4764, 4760, 4756, 4751, 4747, 4743
        .word 4738, 4734, 4730, 4726, 4722, 4717
        .word 4713, 4709, 4704, 4700, 4696, 4692
        .word 4688, 4683, 4679, 4675, 4670, 4666
        .word 4662, 4658, 4654, 4649, 4645, 4641
        .word 4636, 4632, 4628, 4624, 4620, 4615
        .word 4611, 4607, 4602, 4598, 4594, 4590
        .word 4586, 4581, 4577, 4573, 4568, 4564
        .word 4560, 4556, 4552, 4547, 4543, 4539
        .word 4534, 4530, 4526, 4522, 4518, 4513
        .word 4509, 4505, 4500, 4496, 4492, 4488
        .word 4484, 4479, 4475, 4471, 4466, 4462
        .word 4458, 4454, 4450, 4445, 4441, 4437
        .word 4432, 4428, 4424, 4420, 4416, 4411
        .word 4407, 4403, 4398, 4394, 4390, 4386
        .word 4382, 4377, 4373, 4369, 4364, 4360
        .word 4356, 4352, 4348, 4343, 4339, 4335
        .word 4330, 4326, 4322, 4318, 4314, 4309
        .word 4305, 4301, 4296, 4292, 4288, 4284
        .word 4280, 4275, 4271, 4267, 4262, 4258
        .word 4254, 4250, 4246, 4241, 4237, 4233
        .word 4228, 4224, 4220, 4216, 4212, 4207
        .word 4203, 4199, 4194, 4190, 4186, 4182
        .word 4178, 4173, 4169, 4165, 4160, 4156
        .word 4152, 4148, 4144, 4139, 4135, 4131
        .word 4126, 4122, 4118, 4114, 4110, 4105
        .word 4101, 4097, 4092, 4088, 4084, 4080
        .word 4076, 4071, 4067, 4063, 4058, 4054
        .word 4050, 4046, 4042, 4037, 4033, 4029
        .word 4024, 4020, 4016, 4012, 4008, 4003
        .word 3999, 3995, 3990, 3986, 3982, 3978
        .word 3974, 3969, 3965, 3961, 3956, 3952
        .word 3948, 3944, 3940, 3935, 3931, 3927
        .word 3922, 3918, 3914, 3910, 3906, 3901
        .word 3897, 3893, 3888, 3884, 3880, 3876
        .word 3872, 3867, 3863, 3859, 3854, 3850
        .word 3846, 3842, 3838, 3833, 3829, 3825
        .word 3820, 3816, 3812, 3808, 3804, 3799
        .word 3795, 3791, 3786, 3782, 3778, 3774
        .word 3770, 3765, 3761, 3757, 3752, 3748
        .word 3744, 3740, 3736, 3731, 3727, 3723
        .word 3718, 3714, 3710, 3706, 3702, 3697
        .word 3693, 3689, 3684, 3680, 3676, 3672
        .word 3668, 3663, 3659, 3655, 3650, 3646
        .word 3642, 3638, 3634, 3629, 3625, 3621
        .word 3616, 3612, 3608, 3604, 3600, 3595
        .word 3591, 3587, 3582, 3578, 3574, 3570
        .word 3566, 3561, 3557, 3553, 3548, 3544
        .word 3540, 3536, 3532, 3527, 3523, 3519
        .word 3514, 3510, 3506, 3502, 3498, 3493
        .word 3489, 3485, 3480, 3476, 3472, 3468
        .word 3464, 3459, 3455, 3451, 3446, 3442
        .word 3438, 3434, 3430, 3425, 3421, 3417
        .word 3412, 3408, 3404, 3400, 3396, 3391
        .word 3387, 3383, 3378, 3374, 3370, 3366
        .word 3362, 3357, 3353, 3349, 3344, 3340
        .word 3336, 3332, 3328, 3323, 3319, 3315
        .word 3310, 3306, 3302, 3298, 3294, 3289
        .word 3285, 3281, 3276, 3272, 3268, 3264
        .word 3260, 3255, 3251, 3247, 3242, 3238
        .word 3234, 3230, 3226, 3221, 3217, 3213
        .word 3208, 3204, 3200, 3196, 3192, 3187
        .word 3183, 3179, 3174, 3170, 3166, 3162
        .word 3158, 3153, 3149, 3145, 3140, 3136
        .word 3132, 3128, 3124, 3119, 3115, 3111
        .word 3106, 3102, 3098, 3094, 3090, 3085
        .word 3081, 3077, 3072, 3068, 3064, 3060
        .word 3056, 3051, 3047, 3043, 3038, 3034
        .word 3030, 3026, 3022, 3017, 3013, 3009
        .word 3004, 3000, 2996, 2992, 2988, 2983
        .word 2979, 2975, 2970, 2966, 2962, 2958
        .word 2954, 2949, 2945, 2941, 2936, 2932
        .word 2928, 2924, 2920, 2915, 2911, 2907
        .word 2902, 2898, 2894, 2890, 2886, 2881
        .word 2877, 2873, 2868, 2864, 2860, 2856
        .word 2852, 2847, 2843, 2839, 2834, 2830
        .word 2826, 2822, 2818, 2813, 2809, 2805
        .word 2800, 2796, 2792, 2788, 2784, 2779
        .word 2775, 2771, 2766, 2762, 2758, 2754
        .word 2750, 2745, 2741, 2737, 2732, 2728
        .word 2724, 2720, 2716, 2711, 2707, 2703
        .word 2698, 2694, 2690, 2686, 2682, 2677
        .word 2673, 2669, 2664, 2660, 2656, 2652
        .word 2648, 2643, 2639, 2635, 2630, 2626
        .word 2622, 2618, 2614, 2609, 2605, 2601
        .word 2596, 2592, 2588, 2584, 2580, 2575
        .word 2571, 2567, 2562, 2558, 2554, 2550
        .word 2546, 2541, 2537, 2533, 2528, 2524
        .word 2520, 2516, 2512, 2507, 2503, 2499
        .word 2494, 2490, 2486, 2482, 2478, 2473
        .word 2469, 2465, 2460, 2456, 2452, 2448
        .word 2444, 2439, 2435, 2431, 2426, 2422
        .word 2418, 2414, 2410, 2405, 2401, 2397
        .word 2392, 2388, 2384, 2380, 2376, 2371
        .word 2367, 2363, 2358, 2354, 2350, 2346
        .word 2342, 2337, 2333, 2329, 2324, 2320
        .word 2316, 2312, 2308, 2303, 2299, 2295
        .word 2290, 2286, 2282, 2278, 2274, 2269
        .word 2265, 2261, 2256, 2252, 2248, 2244
        .word 2240, 2235, 2231, 2227, 2222, 2218
        .word 2214, 2210, 2206, 2201, 2197, 2193
        .word 2188, 2184, 2180, 2176, 2172, 2167
        .word 2163, 2159, 2154, 2150, 2146, 2142
        .word 2138, 2133, 2129, 2125, 2120, 2116
        .word 2112, 2108, 2104, 2099, 2095, 2091
        .word 2086, 2082, 2078, 2074, 2070, 2065
        .word 2061, 2057, 2052, 2048, 2044, 2040
        .word 2036, 2031, 2027, 2023, 2018, 2014
        .word 2010, 2006, 2002, 1997, 1993, 1989
        .word 1984, 1980, 1976, 1972, 1968, 1963
        .word 1959, 1955, 1950, 1946, 1942, 1938
        .word 1934, 1929, 1925, 1921, 1916, 1912
        .word 1908, 1904, 1900, 1895, 1891, 1887
        .word 1882, 1878, 1874, 1870, 1866, 1861
        .word 1857, 1853, 1848, 1844, 1840, 1836
        .word 1832, 1827, 1823, 1819, 1814, 1810
        .word 1806, 1802, 1798, 1793, 1789, 1785
        .word 1780, 1776, 1772, 1768, 1764, 1759
        .word 1755, 1751, 1746, 1742, 1738, 1734
        .word 1730, 1725, 1721, 1717, 1712, 1708
        .word 1704, 1700, 1696, 1691, 1687, 1683
        .word 1678, 1674, 1670, 1666, 1662, 1657
        .word 1653, 1649, 1644, 1640, 1636, 1632
        .word 1628, 1623, 1619, 1615, 1610, 1606
        .word 1602, 1598, 1594, 1589, 1585, 1581
        .word 1576, 1572, 1568, 1564, 1560, 1555
        .word 1551, 1547, 1542, 1538, 1534, 1530
        .word 1526, 1521, 1517, 1513, 1508, 1504
        .word 1500, 1496, 1492, 1487, 1483, 1479
        .word 1474, 1470, 1466, 1462, 1458, 1453
        .word 1449, 1445, 1440, 1436, 1432, 1428
        .word 1424, 1419, 1415, 1411, 1406, 1402
        .word 1398, 1394, 1390, 1385, 1381, 1377
        .word 1372, 1368, 1364, 1360, 1356, 1351
        .word 1347, 1343, 1338, 1334, 1330, 1326
        .word 1322, 1317, 1313, 1309, 1304, 1300
        .word 1296, 1292, 1288, 1283, 1279, 1275
        .word 1270, 1266, 1262, 1258, 1254, 1249
        .word 1245, 1241, 1236, 1232, 1228, 1224
        .word 1220, 1215, 1211, 1207, 1202, 1198
        .word 1194, 1190, 1186, 1181, 1177, 1173
        .word 1168, 1164, 1160, 1156, 1152, 1147
        .word 1143, 1139, 1134, 1130, 1126, 1122
        .word 1118, 1113, 1109, 1105, 1100, 1096
        .word 1092, 1088, 1084, 1079, 1075, 1071
        .word 1066, 1062, 1058, 1054, 1050, 1045
        .word 1041, 1037, 1032, 1028, 1024, 1020
        .word 1016, 1011, 1007, 1003, 998, 994
        .word 990, 986, 982, 977, 973, 969
        .word 964, 960, 956, 952, 948, 943
        .word 939, 935, 930, 926, 922, 918
        .word 914, 909, 905, 901, 896, 892
        .word 888, 884, 880, 875, 871, 867
        .word 862, 858, 854, 850, 846, 841
        .word 837, 833, 828, 824, 820, 816
        .word 812, 807, 803, 799, 794, 790
        .word 786, 782, 778, 773, 769, 765
        .word 760, 756, 752, 748, 744, 739
        .word 735, 731, 726, 722, 718, 714
        .word 710, 705, 701, 697, 692, 688
        .word 684, 680, 676, 671, 667, 663
        .word 658, 654, 650, 646, 642, 637
        .word 633, 629, 624, 620, 616, 612
        .word 608, 603, 599, 595, 590, 586
        .word 582, 578, 574, 569, 565, 561
        .word 556, 552, 548, 544, 540, 535
        .word 531, 527, 522, 518, 514, 510
        .word 506, 501, 497, 493, 488, 484
        .word 480, 476, 472, 467, 463, 459
        .word 454, 450, 446, 442, 438, 433
        .word 429, 425, 420, 416, 412, 408
        .word 404, 399, 395, 391, 386, 382
        .word 378, 374, 370, 365, 361, 357
        .word 352, 348, 344, 340, 336, 331
        .word 327, 323, 318, 314, 310, 306
        .word 302, 297, 293, 289, 284, 280
        .word 276, 272, 268, 263, 259, 255
        .word 250, 246, 242, 238, 234, 229
        .word 225, 221, 216, 212, 208, 204
        .word 200, 195, 191, 187, 182, 178
        .word 174, 170, 166, 161, 157, 153
        .word 148, 144, 140, 136, 132, 127
        .word 123, 119, 114, 110, 106, 102
        .word 98, 93, 89, 85, 80, 76
        .word 72, 68, 64, 59, 55, 51
        .word 46, 42, 38, 34, 30, 25
        .word 21, 17, 12, 8, 4, 0
        .word -4, -9, -13, -17, -22, -26
        .word -30, -34, -38, -43, -47, -51
        .word -56, -60, -64, -68, -72, -77
        .word -81, -85, -90, -94, -98, -102
        .word -106, -111, -115, -119, -124, -128
        .word -132, -136, -140, -145, -149, -153
        .word -158, -162, -166, -170, -174, -179
        .word -183, -187, -192, -196, -200, -204
        .word -208, -213, -217, -221, -226, -230
        .word -234, -238, -242, -247, -251, -255
        .word -260, -264, -268, -272, -276, -281
        .word -285, -289, -294, -298, -302, -306
        .word -310, -315, -319, -323, -328, -332
        .word -336, -340, -344, -349, -353, -357
        .word -362, -366, -370, -374, -378, -383
        .word -387, -391, -396, -400, -404, -408
        .word -412, -417, -421, -425, -430, -434
        .word -438, -442, -446, -451, -455, -459
        .word -464, -468, -472, -476, -480, -485
        .word -489, -493, -498, -502, -506, -510
        .word -514, -519, -523, -527, -532, -536
        .word -540, -544, -548, -553, -557, -561
        .word -566, -570, -574, -578, -582, -587
        .word -591, -595, -600, -604, -608, -612
        .word -616, -621, -625, -629, -634, -638
        .word -642, -646, -650, -655, -659, -663
        .word -668, -672, -676, -680, -684, -689
        .word -693, -697, -702, -706, -710, -714
        .word -718, -723, -727, -731, -736, -740
        .word -744, -748, -752, -757, -761, -765
        .word -770, -774, -778, -782, -786, -791
        .word -795, -799, -804, -808, -812, -816
        .word -820, -825, -829, -833, -838, -842
        .word -846, -850, -854, -859, -863, -867
        .word -872, -876, -880, -884, -888, -893
        .word -897, -901, -906, -910, -914, -918
        .word -922, -927, -931, -935, -940, -944
        .word -948, -952, -956, -961, -965, -969
        .word -974, -978, -982, -986, -990, -995
        .word -999, -1003, -1008, -1012, -1016, -1020
        .word -1024, -1029, -1033, -1037, -1042, -1046
        .word -1050, -1054, -1058, -1063, -1067, -1071
        .word -1076, -1080, -1084, -1088, -1092, -1097
        .word -1101, -1105, -1110, -1114, -1118, -1122
        .word -1126, -1131, -1135, -1139, -1144, -1148
        .word -1152, -1156, -1160, -1165, -1169, -1173
        .word -1178, -1182, -1186, -1190, -1194, -1199
        .word -1203, -1207, -1212, -1216, -1220, -1224
        .word -1228, -1233, -1237, -1241, -1246, -1250
        .word -1254, -1258, -1262, -1267, -1271, -1275
        .word -1280, -1284, -1288, -1292, -1296, -1301
        .word -1305, -1309, -1314, -1318, -1322, -1326
        .word -1330, -1335, -1339, -1343, -1348, -1352
        .word -1356, -1360, -1364, -1369, -1373, -1377
        .word -1382, -1386, -1390, -1394, -1398, -1403
        .word -1407, -1411, -1416, -1420, -1424, -1428
        .word -1432, -1437, -1441, -1445, -1450, -1454
        .word -1458, -1462, -1466, -1471, -1475, -1479
        .word -1484, -1488, -1492, -1496, -1500, -1505
        .word -1509, -1513, -1518, -1522, -1526, -1530
        .word -1534, -1539, -1543, -1547, -1552, -1556
        .word -1560, -1564, -1568, -1573, -1577, -1581
        .word -1586, -1590, -1594, -1598, -1602, -1607
        .word -1611, -1615, -1620, -1624, -1628, -1632
        .word -1636, -1641, -1645, -1649, -1654, -1658
        .word -1662, -1666, -1670, -1675, -1679, -1683
        .word -1688, -1692, -1696, -1700, -1704, -1709
        .word -1713, -1717, -1722, -1726, -1730, -1734
        .word -1738, -1743, -1747, -1751, -1756, -1760
        .word -1764, -1768, -1772, -1777, -1781, -1785
        .word -1790, -1794, -1798, -1802, -1806, -1811
        .word -1815, -1819, -1824, -1828, -1832, -1836
        .word -1840, -1845, -1849, -1853, -1858, -1862
        .word -1866, -1870, -1874, -1879, -1883, -1887
        .word -1892, -1896, -1900, -1904, -1908, -1913
        .word -1917, -1921, -1926, -1930, -1934, -1938
        .word -1942, -1947, -1951, -1955, -1960, -1964
        .word -1968, -1972, -1976, -1981, -1985, -1989
        .word -1994, -1998, -2002, -2006, -2010, -2015
        .word -2019, -2023, -2028, -2032, -2036, -2040
        .word -2044, -2049, -2053, -2057, -2062, -2066
        .word -2070, -2074, -2078, -2083, -2087, -2091
        .word -2096, -2100, -2104, -2108, -2112, -2117
        .word -2121, -2125, -2130, -2134, -2138, -2142
        .word -2146, -2151, -2155, -2159, -2164, -2168
        .word -2172, -2176, -2180, -2185, -2189, -2193
        .word -2198, -2202, -2206, -2210, -2214, -2219
        .word -2223, -2227, -2232, -2236, -2240, -2244
        .word -2248, -2253, -2257, -2261, -2266, -2270
        .word -2274, -2278, -2282, -2287, -2291, -2295
        .word -2300, -2304, -2308, -2312, -2316, -2321
        .word -2325, -2329, -2334, -2338, -2342, -2346
        .word -2350, -2355, -2359, -2363, -2368, -2372
        .word -2376, -2380, -2384, -2389, -2393, -2397
        .word -2402, -2406, -2410, -2414, -2418, -2423
        .word -2427, -2431, -2436, -2440, -2444, -2448
        .word -2452, -2457, -2461, -2465, -2470, -2474
        .word -2478, -2482, -2486, -2491, -2495, -2499
        .word -2504, -2508, -2512, -2516, -2520, -2525
        .word -2529, -2533, -2538, -2542, -2546, -2550
        .word -2554, -2559, -2563, -2567, -2572, -2576
        .word -2580, -2584, -2588, -2593, -2597, -2601
        .word -2606, -2610, -2614, -2618, -2622, -2627
        .word -2631, -2635, -2640, -2644, -2648, -2652
        .word -2656, -2661, -2665, -2669, -2674, -2678
        .word -2682, -2686, -2690, -2695, -2699, -2703
        .word -2708, -2712, -2716, -2720, -2724, -2729
        .word -2733, -2737, -2742, -2746, -2750, -2754
        .word -2758, -2763, -2767, -2771, -2776, -2780
        .word -2784, -2788, -2792, -2797, -2801, -2805
        .word -2810, -2814, -2818, -2822, -2826, -2831
        .word -2835, -2839, -2844, -2848, -2852, -2856
        .word -2860, -2865, -2869, -2873, -2878, -2882
        .word -2886, -2890, -2894, -2899, -2903, -2907
        .word -2912, -2916, -2920, -2924, -2928, -2933
        .word -2937, -2941, -2946, -2950, -2954, -2958
        .word -2962, -2967, -2971, -2975, -2980, -2984
        .word -2988, -2992, -2996, -3001, -3005, -3009
        .word -3014, -3018, -3022, -3026, -3030, -3035
        .word -3039, -3043, -3048, -3052, -3056, -3060
        .word -3064, -3069, -3073, -3077, -3082, -3086
        .word -3090, -3094, -3098, -3103, -3107, -3111
        .word -3116, -3120, -3124, -3128, -3132, -3137
        .word -3141, -3145, -3150, -3154, -3158, -3162
        .word -3166, -3171, -3175, -3179, -3184, -3188
        .word -3192, -3196, -3200, -3205, -3209, -3213
        .word -3218, -3222, -3226, -3230, -3234, -3239
        .word -3243, -3247, -3252, -3256, -3260, -3264
        .word -3268, -3273, -3277, -3281, -3286, -3290
        .word -3294, -3298, -3302, -3307, -3311, -3315
        .word -3320, -3324, -3328, -3332, -3336, -3341
        .word -3345, -3349, -3354, -3358, -3362, -3366
        .word -3370, -3375, -3379, -3383, -3388, -3392
        .word -3396, -3400, -3404, -3409, -3413, -3417
        .word -3422, -3426, -3430, -3434, -3438, -3443
        .word -3447, -3451, -3456, -3460, -3464, -3468
        .word -3472, -3477, -3481, -3485, -3490, -3494
        .word -3498, -3502, -3506, -3511, -3515, -3519
        .word -3524, -3528, -3532, -3536, -3540, -3545
        .word -3549, -3553, -3558, -3562, -3566, -3570
        .word -3574, -3579, -3583, -3587, -3592, -3596
        .word -3600, -3604, -3608, -3613, -3617, -3621
        .word -3626, -3630, -3634, -3638, -3642, -3647
        .word -3651, -3655, -3660, -3664, -3668, -3672
        .word -3676, -3681, -3685, -3689, -3694, -3698
        .word -3702, -3706, -3710, -3715, -3719, -3723
        .word -3728, -3732, -3736, -3740, -3744, -3749
        .word -3753, -3757, -3762, -3766, -3770, -3774
        .word -3778, -3783, -3787, -3791, -3796, -3800
        .word -3804, -3808, -3812, -3817, -3821, -3825
        .word -3830, -3834, -3838, -3842, -3846, -3851
        .word -3855, -3859, -3864, -3868, -3872, -3876
        .word -3880, -3885, -3889, -3893, -3898, -3902
        .word -3906, -3910, -3914, -3919, -3923, -3927
        .word -3932, -3936, -3940, -3944, -3948, -3953
        .word -3957, -3961, -3966, -3970, -3974, -3978
        .word -3982, -3987, -3991, -3995, -4000, -4004
        .word -4008, -4012, -4016, -4021, -4025, -4029
        .word -4034, -4038, -4042, -4046, -4050, -4055
        .word -4059, -4063, -4068, -4072, -4076, -4080
        .word -4084, -4089, -4093, -4097, -4102, -4106
        .word -4110, -4114, -4118, -4123, -4127, -4131
        .word -4136, -4140, -4144, -4148, -4152, -4157
        .word -4161, -4165, -4170, -4174, -4178, -4182
        .word -4186, -4191, -4195, -4199, -4204, -4208
        .word -4212, -4216, -4220, -4225, -4229, -4233
        .word -4238, -4242, -4246, -4250, -4254, -4259
        .word -4263, -4267, -4272, -4276, -4280, -4284
        .word -4288, -4293, -4297, -4301, -4306, -4310
        .word -4314, -4318, -4322, -4327, -4331, -4335
        .word -4340, -4344, -4348, -4352, -4356, -4361
        .word -4365, -4369, -4374, -4378, -4382, -4386
        .word -4390, -4395, -4399, -4403, -4408, -4412
        .word -4416, -4420, -4424, -4429, -4433, -4437
        .word -4442, -4446, -4450, -4454, -4458, -4463
        .word -4467, -4471, -4476, -4480, -4484, -4488
        .word -4492, -4497, -4501, -4505, -4510, -4514
        .word -4518, -4522, -4526, -4531, -4535, -4539
        .word -4544, -4548, -4552, -4556, -4560, -4565
        .word -4569, -4573, -4578, -4582, -4586, -4590
        .word -4594, -4599, -4603, -4607, -4612, -4616
        .word -4620, -4624, -4628, -4633, -4637, -4641
        .word -4646, -4650, -4654, -4658, -4662, -4667
        .word -4671, -4675, -4680, -4684, -4688, -4692
        .word -4696, -4701, -4705, -4709, -4714, -4718
        .word -4722, -4726, -4730, -4735, -4739, -4743
        .word -4748, -4752, -4756, -4760, -4764, -4769
        .word -4773, -4777, -4782, -4786, -4790, -4794
        .word -4798, -4803, -4807, -4811, -4816, -4820
        .word -4824, -4828, -4832, -4837, -4841, -4845
        .word -4850, -4854, -4858, -4862, -4866, -4871
        .word -4875, -4879, -4884, -4888, -4892, -4896
        .word -4900, -4905, -4909, -4913, -4918, -4922
        .word -4926, -4930, -4934, -4939, -4943, -4947
        .word -4952, -4956, -4960, -4964, -4968, -4973
        .word -4977, -4981, -4986, -4990, -4994, -4998
        .word -5002, -5007, -5011, -5015, -5020, -5024
        .word -5028, -5032, -5036, -5041, -5045, -5049
        .word -5054, -5058, -5062, -5066, -5070, -5075
        .word -5079, -5083, -5088, -5092, -5096, -5100
        .word -5104, -5109, -5113, -5117, -5122, -5126
        .word -5130, -5134, -5138, -5143, -5147, -5151
        .word -5156, -5160, -5164, -5168, -5172, -5177
        .word -5181, -5185, -5190, -5194, -5198, -5202
        .word -5206, -5211, -5215, -5219, -5224, -5228
        .word -5232, -5236, -5240, -5245, -5249, -5253
        .word -5258, -5262, -5266, -5270, -5274, -5279
        .word -5283, -5287, -5292, -5296, -5300, -5304
        .word -5308, -5313, -5317, -5321, -5326, -5330
        .word -5334, -5338, -5342, -5347, -5351, -5355
        .word -5360, -5364, -5368, -5372, -5376, -5381
        .word -5385, -5389, -5394, -5398, -5402, -5406
        .word -5410, -5415, -5419, -5423, -5428, -5432
        .word -5436, -5440, -5444, -5449, -5453, -5457
        .word -5462, -5466, -5470, -5474, -5478, -5483
        .word -5487, -5491, -5496, -5500, -5504, -5508
        .word -5512, -5517, -5521, -5525, -5530, -5534
        .word -5538, -5542, -5546, -5551, -5555, -5559
        .word -5564, -5568, -5572, -5576, -5580, -5585
        .word -5589, -5593, -5598, -5602, -5606, -5610
        .word -5614, -5619, -5623, -5627, -5632, -5636
        .word -5640, -5644, -5648, -5653, -5657, -5661
        .word -5666, -5670, -5674, -5678, -5682, -5687
        .word -5691, -5695, -5700, -5704, -5708, -5712
        .word -5716, -5721, -5725, -5729, -5734, -5738
        .word -5742, -5746, -5750, -5755, -5759, -5763
        .word -5768, -5772, -5776, -5780, -5784, -5789
        .word -5793, -5797, -5802, -5806, -5810, -5814
        .word -5818, -5823, -5827, -5831, -5836, -5840
        .word -5844, -5848, -5852, -5857, -5861, -5865
        .word -5870, -5874, -5878, -5882, -5886, -5891
        .word -5895, -5899, -5904, -5908, -5912, -5916
        .word -5920, -5925, -5929, -5933, -5938, -5942
        .word -5946, -5950, -5954, -5959, -5963, -5967
        .word -5972, -5976, -5980, -5984, -5988, -5993
        .word -5997, -6001, -6006, -6010, -6014, -6018
        .word -6022, -6027, -6031, -6035, -6040, -6044
        .word -6048, -6052, -6056, -6061, -6065, -6069
        .word -6074, -6078, -6082, -6086, -6090, -6095
        .word -6099, -6103, -6108, -6112, -6116, -6120
        .word -6124, -6129, -6133, -6137, -6142, -6146
        .word -6150, -6154, -6158, -6163, -6167, -6171
        .word -6176, -6180, -6184, -6188, -6192, -6197
        .word -6201, -6205, -6210, -6214, -6218, -6222
        .word -6226, -6231, -6235, -6239, -6244, -6248
        .word -6252, -6256, -6260, -6265, -6269, -6273
        .word -6278, -6282, -6286, -6290, -6294, -6299
        .word -6303, -6307, -6312, -6316, -6320, -6324
        .word -6328, -6333, -6337, -6341, -6346, -6350
        .word -6354, -6358, -6362, -6367, -6371, -6375
        .word -6380, -6384, -6388, -6392, -6396, -6401
        .word -6405, -6409, -6414, -6418, -6422, -6426
        .word -6430, -6435, -6439, -6443, -6448, -6452
        .word -6456, -6460, -6464, -6469, -6473, -6477
        .word -6482, -6486, -6490, -6494, -6498, -6503
        .word -6507, -6511, -6516, -6520, -6524, -6528
        .word -6532, -6537, -6541, -6545, -6550, -6554
        .word -6558, -6562, -6566, -6571, -6575, -6579
        .word -6584, -6588, -6592, -6596, -6600, -6605
        .word -6609, -6613, -6618, -6622, -6626, -6630
        .word -6634, -6639, -6643, -6647, -6652, -6656
        .word -6660, -6664, -6668, -6673, -6677, -6681
        .word -6686, -6690, -6694, -6698, -6702, -6707
        .word -6711, -6715, -6720, -6724, -6728, -6732
        .word -6736, -6741, -6745, -6749, -6754, -6758
        .word -6762, -6766, -6770, -6775, -6779, -6783
        .word -6788, -6792, -6796, -6800, -6804, -6809
        .word -6813, -6817, -6822, -6826, -6830, -6834
        .word -6838, -6843, -6847, -6851, -6856, -6860
        .word -6864, -6868, -6872, -6877, -6881, -6885
        .word -6890, -6894, -6898, -6902, -6906, -6911
        .word -6915, -6919, -6924, -6928, -6932, -6936
        .word -6940, -6945, -6949, -6953, -6958, -6962
        .word -6966, -6970, -6974, -6979, -6983, -6987
        .word -6992, -6996, -7000, -7004, -7008, -7013
        .word -7017, -7021, -7026, -7030, -7034, -7038
        .word -7042, -7047, -7051, -7055, -7060, -7064
        .word -7068, -7072, -7076, -7081, -7085, -7089
        .word -7094, -7098, -7102, -7106, -7110, -7115
        .word -7119, -7123, -7128, -7132, -7136, -7140
        .word -7144, -7149, -7153, -7157, -7162, -7166
        .word -7170, -7174, -7178, -7183, -7187, -7191
        .word -7196, -7200, -7204, -7208, -7212, -7217
        .word -7221, -7225, -7230, -7234, -7238, -7242
        .word -7246, -7251, -7255, -7259, -7264, -7268
        .word -7272, -7276, -7280, -7285, -7289, -7293
        .word -7298, -7302, -7306, -7310, -7314, -7319
        .word -7323, -7327, -7332, -7336, -7340, -7344
        .word -7348, -7353, -7357, -7361, -7366, -7370
        .word -7374, -7378, -7382, -7387, -7391, -7395
        .word -7400, -7404, -7408, -7412, -7416, -7421
        .word -7425, -7429, -7434, -7438, -7442, -7446
        .word -7450, -7455, -7459, -7463, -7468, -7472
        .word -7476, -7480, -7484, -7489, -7493, -7497
        .word -7502, -7506, -7510, -7514, -7518, -7523
        .word -7527, -7531, -7536, -7540, -7544, -7548
        .word -7552, -7557, -7561, -7565, -7570, -7574
        .word -7578, -7582, -7586, -7591, -7595, -7599
        .word -7604, -7608, -7612, -7616, -7620, -7625
        .word -7629, -7633, -7638, -7642, -7646, -7650
        .word -7654, -7659, -7663, -7667, -7672, -7676
        .word -7680, -7684, -7688, -7693, -7697, -7701
        .word -7706, -7710, -7714, -7718, -7722, -7727
        .word -7731, -7735, -7740, -7744, -7748, -7752
        .word -7756, -7761, -7765, -7769, -7774, -7778
        .word -7782, -7786, -7790, -7795, -7799, -7803
        .word -7808, -7812, -7816, -7820, -7824, -7829
        .word -7833, -7837, -7842, -7846, -7850, -7854
        .word -7858, -7863, -7867, -7871, -7876, -7880
        .word -7884, -7888, -7892, -7897, -7901, -7905
        .word -7910, -7914, -7918, -7922, -7926, -7931
        .word -7935, -7939, -7944, -7948, -7952, -7956
        .word -7960, -7965, -7969, -7973, -7978, -7982
        .word -7986, -7990, -7994, -7999, -8003, -8007
        .word -8012, -8016, -8020, -8024, -8028, -8033
        .word -8037, -8041, -8046, -8050, -8054, -8058
        .word -8062, -8067, -8071, -8075, -8080, -8084
        .word -8088, -8092, -8096, -8101, -8105, -8109
        .word -8114, -8118, -8122, -8126, -8130, -8135
        .word -8139, -8143, -8148, -8152, -8156, -8160
        .word -8164, -8169, -8173, -8177, -8182, -8186
        .word -8190, -8194, -8198, -8203, -8207, -8211
        .word -8216, -8220, -8224, -8228, -8232, -8237
        .word -8241, -8245, -8250, -8254, -8258, -8262
        .word -8266, -8271, -8275, -8279, -8284, -8288
        .word -8292, -8296, -8300, -8305, -8309, -8313
        .word -8318, -8322, -8326, -8330, -8334, -8339
        .word -8343, -8347, -8352, -8356, -8360, -8364
        .word -8368, -8373, -8377, -8381, -8386, -8390
        .word -8394, -8398, -8402, -8407, -8411, -8415
        .word -8420, -8424, -8428, -8432, -8436, -8441
        .word -8445, -8449, -8454, -8458, -8462, -8466
        .word -8470, -8475, -8479, -8483, -8488, -8492
        .word -8496, -8500, -8504, -8509, -8513, -8517
        .word -8522, -8526, -8530, -8534, -8538, -8543
        .word -8547, -8551, -8556, -8560, -8564, -8568
        .word -8572, -8577, -8581, -8585, -8590, -8594
        .word -8598, -8602, -8606, -8611, -8615, -8619
        .word -8624, -8628, -8632, -8636, -8640, -8645
        .word -8649, -8653, -8658, -8662, -8666, -8670
        .word -8674, -8679, -8683, -8687, -8692, -8696
        .word -8700, -8704, -8708, -8713, -8717, -8721
        .word -8726, -8730, -8734, -8738, -8742, -8747
        .word -8751, -8755, -8760, -8764, -8768, -8772
        .word -8776, -8781, -8785, -8789, -8794, -8798
        .word -8802, -8806, -8810, -8815, -8819, -8823
        .word -8828, -8832, -8836, -8840, -8844, -8849
        .word -8853, -8857, -8862, -8866, -8870, -8874
        .word -8878, -8883, -8887, -8891, -8896, -8900
        .word -8904, -8908, -8912, -8917, -8921, -8925
        .word -8930, -8934, -8938, -8942, -8946, -8951
        .word -8955, -8959, -8964, -8968, -8972, -8976
        .word -8980, -8985, -8989, -8993, -8998, -9002
        .word -9006, -9010, -9014, -9019, -9023, -9027
        .word -9032, -9036, -9040, -9044, -9048, -9053
        .word -9057, -9061, -9066, -9070, -9074, -9078
        .word -9082, -9087, -9091, -9095, -9100, -9104
        .word -9108, -9112, -9116, -9121, -9125, -9129
        .word -9134, -9138, -9142, -9146, -9150, -9155
        .word -9159, -9163, -9168, -9172, -9176, -9180
        .word -9184, -9189, -9193, -9197, -9202, -9206
        .word -9210, -9214, -9218, -9223, -9227, -9231
        .word -9236, -9240, -9244, -9248, -9252, -9257
        .word -9261, -9265, -9270, -9274, -9278, -9282
        .word -9286, -9291, -9295, -9299, -9304, -9308
        .word -9312, -9316, -9320, -9325, -9329, -9333
        .word -9338, -9342, -9346, -9350, -9354, -9359
        .word -9363, -9367, -9372, -9376, -9380, -9384
        .word -9388, -9393, -9397, -9401, -9406, -9410
        .word -9414, -9418, -9422, -9427, -9431, -9435
        .word -9440, -9444, -9448, -9452, -9456, -9461
        .word -9465, -9469, -9474, -9478, -9482, -9486
        .word -9490, -9495, -9499, -9503, -9508, -9512
        .word -9516, -9520, -9524, -9529, -9533, -9537
        .word -9542, -9546, -9550, -9554, -9558, -9563
        .word -9567, -9571, -9576, -9580, -9584, -9588
        .word -9592, -9597, -9601, -9605, -9610, -9614
        .word -9618, -9622, -9626, -9631, -9635, -9639
        .word -9644, -9648, -9652, -9656, -9660, -9665
        .word -9669, -9673, -9678, -9682, -9686, -9690
        .word -9694, -9699, -9703, -9707, -9712, -9716
        .word -9720, -9724, -9728, -9733, -9737, -9741
        .word -9746, -9750, -9754, -9758, -9762, -9767
        .word -9771, -9775, -9780, -9784, -9788, -9792
        .word -9796, -9801, -9805, -9809, -9814, -9818
        .word -9822, -9826, -9830, -9835, -9839, -9843
        .word -9848, -9852, -9856, -9860, -9864, -9869
        .word -9873, -9877, -9882, -9886, -9890, -9894
        .word -9898, -9903, -9907, -9911, -9916, -9920
        .word -9924, -9928, -9932, -9937, -9941, -9945
        .word -9950, -9954, -9958, -9962, -9966, -9971
        .word -9975, -9979, -9984, -9988, -9992, -9996
        .word -10000, -10005, -10009, -10013, -10018, -10022
        .word -10026, -10030, -10034, -10039, -10043, -10047
        .word -10052, -10056, -10060, -10064, -10068, -10073
        .word -10077, -10081, -10086, -10090, -10094, -10098
        .word -10102, -10107, -10111, -10115, -10120, -10124
        .word -10128, -10132, -10136, -10141, -10145, -10149
        .word -10154, -10158, -10162, -10166, -10170, -10175
        .word -10179, -10183, -10188, -10192, -10196, -10200
        .word -10204, -10209, -10213, -10217, -10222, -10226
        .word -10230, -10234, -10238, -10243, -10247, -10251
        .word -10256, -10260, -10264, -10268, -10272, -10277
        .word -10281, -10285, -10290, -10294, -10298, -10302
        .word -10306, -10311, -10315, -10319, -10324, -10328
        .word -10332, -10336, -10340, -10345, -10349, -10353
        .word -10358, -10362, -10366, -10370, -10374, -10379
        .word -10383, -10387, -10392, -10396, -10400, -10404
        .word -10408, -10413, -10417, -10421, -10426, -10430
        .word -10434, -10438, -10442, -10447, -10451, -10455
        .word -10460, -10464, -10468, -10472, -10476, -10481
        .word -10485, -10489, -10494, -10498, -10502, -10506
        .word -10510, -10515, -10519, -10523, -10528, -10532
        .word -10536, -10540, -10544, -10549, -10553, -10557
        .word -10562, -10566, -10570, -10574, -10578, -10583
        .word -10587, -10591, -10596, -10600, -10604, -10608
        .word -10612, -10617, -10621, -10625, -10630, -10634
        .word -10638, -10642, -10646, -10651, -10655, -10659
        .word -10664, -10668, -10672, -10676, -10680, -10685
        .word -10689, -10693, -10698, -10702, -10706, -10710
        .word -10714, -10719, -10723, -10727, -10732, -10736
        .word -10740, -10744, -10748, -10753, -10757, -10761
        .word -10766, -10770, -10774, -10778, -10782, -10787
        .word -10791, -10795, -10800, -10804, -10808, -10812
        .word -10816, -10821, -10825, -10829, -10834, -10838
        .word -10842, -10846, -10850, -10855, -10859, -10863
        .word -10868, -10872, -10876, -10880, -10884, -10889
        .word -10893, -10897, -10902, -10906, -10910, -10914
        .word -10918, -10923, -10927, -10931, -10936, -10940
        .word -10944, -10948, -10952, -10957, -10961, -10965
        .word -10970, -10974, -10978, -10982, -10986, -10991
        .word -10995, -10999, -11004, -11008, -11012, -11016
        .word -11020, -11025, -11029, -11033, -11038, -11042
        .word -11046, -11050, -11054, -11059, -11063, -11067
        .word -11072, -11076, -11080, -11084, -11088, -11093
        .word -11097, -11101, -11106, -11110, -11114, -11118
        .word -11122, -11127, -11131, -11135, -11140, -11144
        .word -11148, -11152, -11156, -11161, -11165, -11169
        .word -11174, -11178, -11182, -11186, -11190, -11195
        .word -11199, -11203, -11208, -11212, -11216, -11220
        .word -11224, -11229, -11233, -11237, -11242, -11246
        .word -11250, -11254, -11258, -11263, -11267, -11271
        .word -11276, -11280, -11284, -11288, -11292, -11297
        .word -11301, -11305, -11310, -11314, -11318, -11322
        .word -11326, -11331, -11335, -11339, -11344, -11348
        .word -11352, -11356, -11360, -11365, -11369, -11373
        .word -11378, -11382, -11386, -11390, -11394, -11399
        .word -11403, -11407, -11412, -11416, -11420, -11424
        .word -11428, -11433, -11437, -11441, -11446, -11450
        .word -11454, -11458, -11462, -11467, -11471, -11475
        .word -11480, -11484, -11488, -11492, -11496, -11501
        .word -11505, -11509, -11514, -11518, -11522, -11526
        .word -11530, -11535, -11539, -11543, -11548, -11552
        .word -11556, -11560, -11564, -11569, -11573, -11577
        .word -11582, -11586, -11590, -11594, -11598, -11603
        .word -11607, -11611, -11616, -11620, -11624, -11628
        .word -11632, -11637, -11641, -11645, -11650, -11654
        .word -11658, -11662, -11666, -11671, -11675, -11679
        .word -11684, -11688, -11692, -11696, -11700, -11705
        .word -11709, -11713, -11718, -11722, -11726, -11730
        .word -11734, -11739, -11743, -11747, -11752, -11756
        .word -11760, -11764, -11768, -11773, -11777, -11781
        .word -11786, -11790, -11794, -11798, -11802, -11807
        .word -11811, -11815, -11820, -11824, -11828, -11832
        .word -11836, -11841, -11845, -11849, -11854, -11858
        .word -11862, -11866, -11870, -11875, -11879, -11883
        .word -11888, -11892, -11896, -11900, -11904, -11909
        .word -11913, -11917, -11922, -11926, -11930, -11934
        .word -11938, -11943, -11947, -11951, -11956, -11960
        .word -11964, -11968, -11972, -11977, -11981, -11985
        .word -11990, -11994, -11998, -12002, -12006, -12011
        .word -12015, -12019, -12024, -12028, -12032, -12036
        .word -12040, -12045, -12049, -12053, -12058, -12062
        .word -12066, -12070, -12074, -12079, -12083, -12087
        .word -12092, -12096, -12100, -12104, -12108, -12113
        .word -12117, -12121, -12126, -12130, -12134, -12138
        .word -12142, -12147, -12151, -12155, -12160, -12164
        .word -12168, -12172, -12176, -12181, -12185, -12189
        .word -12194, -12198, -12202, -12206, -12210, -12215
        .word -12219, -12223, -12228, -12232, -12236, -12240
        .word -12244, -12249, -12253, -12257, -12262, -12266
        .word -12270, -12274, -12278, -12283, -12287, -12291
        .word -12296, -12300, -12304, -12308, -12312, -12317
        .word -12321, -12325, -12330, -12334, -12338, -12342
        .word -12346, -12351, -12355, -12359, -12364, -12368
        .word -12372, -12376, -12380, -12385, -12389, -12393
        .word -12398, -12402, -12406, -12410, -12414, -12419
        .word -12423, -12427, -12432, -12436, -12440, -12444
        .word -12448, -12453, -12457, -12461, -12466, -12470
        .word -12474, -12478, -12482, -12487, -12491, -12495
        .word -12500, -12504, -12508, -12512, -12516, -12521
        .word -12525, -12529, -12534, -12538, -12542, -12546
        .word -12550, -12555, -12559, -12563, -12568, -12572
        .word -12576, -12580, -12584, -12589, -12593, -12597
        .word -12602, -12606, -12610, -12614, -12618, -12623
        .word -12627, -12631, -12636, -12640, -12644, -12648
        .word -12652, -12657, -12661, -12665, -12670, -12674
        .word -12678, -12682, -12686, -12691, -12695, -12699
        .word -12704, -12708, -12712, -12716, -12720, -12725
        .word -12729, -12733, -12738, -12742, -12746, -12750
        .word -12754, -12759, -12763, -12767, -12772, -12776
        .word -12780, -12784, -12788, -12793, -12797, -12801
        .word -12806, -12810, -12814, -12818, -12822, -12827
        .word -12831, -12835, -12840, -12844, -12848, -12852
        .word -12856, -12861, -12865, -12869, -12874, -12878
        .word -12882, -12886, -12890, -12895, -12899, -12903
        .word -12908, -12912, -12916, -12920, -12924, -12929
        .word -12933, -12937, -12942, -12946, -12950, -12954
        .word -12958, -12963, -12967, -12971, -12976, -12980
        .word -12984, -12988, -12992, -12997, -13001, -13005
        .word -13010, -13014, -13018, -13022, -13026, -13031
        .word -13035, -13039, -13044, -13048, -13052, -13056
        .word -13060, -13065, -13069, -13073, -13078, -13082
        .word -13086, -13090, -13094, -13099, -13103, -13107
        .word -13112, -13116, -13120, -13124, -13128, -13133
        .word -13137, -13141, -13146, -13150, -13154, -13158
        .word -13162, -13167, -13171, -13175, -13180, -13184
        .word -13188, -13192, -13196, -13201, -13205, -13209
        .word -13214, -13218, -13222, -13226, -13230, -13235
        .word -13239, -13243, -13248, -13252, -13256, -13260
        .word -13264, -13269, -13273, -13277, -13282, -13286
        .word -13290, -13294, -13298, -13303, -13307, -13311
        .word -13316, -13320, -13324, -13328, -13332, -13337
        .word -13341, -13345, -13350, -13354, -13358, -13362
        .word -13366, -13371, -13375, -13379, -13384, -13388
        .word -13392, -13396, -13400, -13405, -13409, -13413
        .word -13418, -13422, -13426, -13430, -13434, -13439
        .word -13443, -13447, -13452, -13456, -13460, -13464
        .word -13468, -13473, -13477, -13481, -13486, -13490
        .word -13494, -13498, -13502, -13507, -13511, -13515
        .word -13520, -13524, -13528, -13532, -13536, -13541
        .word -13545, -13549, -13554, -13558, -13562, -13566
        .word -13570, -13575, -13579, -13583, -13588, -13592
        .word -13596, -13600, -13604, -13609, -13613, -13617
        .word -13622, -13626, -13630, -13634, -13638, -13643
        .word -13647, -13651, -13656, -13660, -13664, -13668
        .word -13672, -13677, -13681, -13685, -13690, -13694
        .word -13698, -13702, -13706, -13711, -13715, -13719
        .word -13724, -13728, -13732, -13736, -13740, -13745
        .word -13749, -13753, -13758, -13762, -13766, -13770
        .word -13774, -13779, -13783, -13787, -13792, -13796
        .word -13800, -13804, -13808, -13813, -13817, -13821
        .word -13826, -13830, -13834, -13838, -13842, -13847
        .word -13851, -13855, -13860, -13864, -13868, -13872
        .word -13876, -13881, -13885, -13889, -13894, -13898
        .word -13902, -13906, -13910, -13915, -13919, -13923
        .word -13928, -13932, -13936, -13940, -13944, -13949
        .word -13953, -13957, -13962, -13966, -13970, -13974
        .word -13978, -13983, -13987, -13991, -13996, -14000
        .word -14004, -14008, -14012, -14017, -14021, -14025
        .word -14030, -14034, -14038, -14042, -14046, -14051
        .word -14055, -14059, -14064, -14068, -14072, -14076
        .word -14080, -14085, -14089, -14093, -14098, -14102
        .word -14106, -14110, -14114, -14119, -14123, -14127
        .word -14132, -14136, -14140, -14144, -14148, -14153
        .word -14157, -14161, -14166, -14170, -14174, -14178
        .word -14182, -14187, -14191, -14195, -14200, -14204
        .word -14208, -14212, -14216, -14221, -14225, -14229
        .word -14234, -14238, -14242, -14246, -14250, -14255
        .word -14259, -14263, -14268, -14272, -14276, -14280
        .word -14284, -14289, -14293, -14297, -14302, -14306
        .word -14310, -14314, -14318, -14323, -14327, -14331
        .word -14336, -14340, -14344, -14348, -14352, -14357
        .word -14361, -14365, -14370, -14374, -14378, -14382
        .word -14386, -14391, -14395, -14399, -14404, -14408
        .word -14412, -14416, -14420, -14425, -14429, -14433
        .word -14438, -14442, -14446, -14450, -14454, -14459
        .word -14463, -14467, -14472, -14476, -14480, -14484
        .word -14488, -14493, -14497, -14501, -14506, -14510
        .word -14514, -14518, -14522, -14527, -14531, -14535
        .word -14540, -14544, -14548, -14552, -14556, -14561
        .word -14565, -14569, -14574, -14578, -14582, -14586
        .word -14590, -14595, -14599, -14603, -14608, -14612
        .word -14616, -14620, -14624, -14629, -14633, -14637
        .word -14642, -14646, -14650, -14654, -14658, -14663
        .word -14667, -14671, -14676, -14680, -14684, -14688
        .word -14692, -14697, -14701, -14705, -14710, -14714
        .word -14718, -14722, -14726, -14731, -14735, -14739
        .word -14744, -14748, -14752, -14756, -14760, -14765
        .word -14769, -14773, -14778, -14782, -14786, -14790
        .word -14794, -14799, -14803, -14807, -14812, -14816
        .word -14820, -14824, -14828, -14833, -14837, -14841
        .word -14846, -14850, -14854, -14858, -14862, -14867
        .word -14871, -14875, -14880, -14884, -14888, -14892
        .word -14896, -14901, -14905, -14909, -14914, -14918
        .word -14922, -14926, -14930, -14935, -14939, -14943
        .word -14948, -14952, -14956, -14960, -14964, -14969
        .word -14973, -14977, -14982, -14986, -14990, -14994
        .word -14998, -15003, -15007, -15011, -15016, -15020
        .word -15024, -15028, -15032, -15037, -15041, -15045
        .word -15050, -15054, -15058, -15062, -15066, -15071
        .word -15075, -15079, -15084, -15088, -15092, -15096
        .word -15100, -15105, -15109, -15113, -15118, -15122
        .word -15126, -15130, -15134, -15139, -15143, -15147
        .word -15152, -15156, -15160, -15164, -15168, -15173
        .word -15177, -15181, -15186, -15190, -15194, -15198
        .word -15202, -15207, -15211, -15215, -15220, -15224
        .word -15228, -15232, -15236, -15241, -15245, -15249
        .word -15254, -15258, -15262, -15266, -15270, -15275
        .word -15279, -15283, -15288, -15292, -15296, -15300
        .word -15304, -15309, -15313, -15317, -15322, -15326
        .word -15330, -15334, -15338, -15343, -15347, -15351
        .word -15356, -15360, -15364, -15368, -15372, -15377
        .word -15381, -15385, -15390, -15394, -15398, -15402
        .word -15406, -15411, -15415, -15419, -15424, -15428
        .word -15432, -15436, -15440, -15445, -15449, -15453
        .word -15458, -15462, -15466, -15470, -15474, -15479
        .word -15483, -15487, -15492, -15496, -15500, -15504
        .word -15508, -15513, -15517, -15521, -15526, -15530
        .word -15534, -15538, -15542, -15547, -15551, -15555
        .word -15560, -15564, -15568, -15572, -15576, -15581
        .word -15585, -15589, -15594, -15598, -15602, -15606
        .word -15610, -15615, -15619, -15623, -15628, -15632
        .word -15636, -15640, -15644, -15649, -15653, -15657
        .word -15662, -15666, -15670, -15674, -15678, -15683
        .word -15687, -15691, -15696, -15700, -15704, -15708
        .word -15712, -15717, -15721, -15725, -15730, -15734
        .word -15738, -15742, -15746, -15751, -15755, -15759
        .word -15764, -15768, -15772, -15776, -15780, -15785
        .word -15789, -15793, -15798, -15802, -15806, -15810
        .word -15814, -15819, -15823, -15827, -15832, -15836
        .word -15840, -15844, -15848, -15853, -15857, -15861
        .word -15866, -15870, -15874, -15878, -15882, -15887
        .word -15891, -15895, -15900, -15904, -15908, -15912
        .word -15916, -15921, -15925, -15929, -15934, -15938
        .word -15942, -15946, -15950, -15955, -15959, -15963
        .word -15968, -15972, -15976, -15980, -15984, -15989
        .word -15993, -15997, -16002, -16006, -16010, -16014
        .word -16018, -16023, -16027, -16031, -16036, -16040
        .word -16044, -16048, -16052, -16057, -16061, -16065
        .word -16070, -16074, -16078, -16082, -16086, -16091
        .word -16095, -16099, -16104, -16108, -16112, -16116
        .word -16120, -16125, -16129, -16133, -16138, -16142
        .word -16146, -16150, -16154, -16159, -16163, -16167
        .word -16172, -16176, -16180, -16184, -16188, -16193
        .word -16197, -16201, -16206, -16210, -16214, -16218
        .word -16222, -16227, -16231, -16235, -16240, -16244
        .word -16248, -16252, -16256, -16261, -16265, -16269
        .word -16274, -16278, -16282, -16286, -16290, -16295
        .word -16299, -16303, -16308, -16312, -16316, -16320
        .word -16324, -16329, -16333, -16337, -16342, -16346
        .word -16350, -16354, -16358, -16363, -16367, -16371
        .word -16376, -16380

| END GENERATED MODEL TABLES


sy1_end:
