; ---------------------------------------------------------------------------
; bd909 -- the Analog Bassdrum's TR-909 voice on the DSP (one voice per call).
;
; Reference candidate using Skee Mask's TR-909 recordings for body, attack
; and short Tune, retaining other controls and the shared desk. All tables:
; dsp909.py; candidate measurements and limitations: TESTING.md.
;   ENV5  pitch envelope ep, set at the trig, decays with TUNE
;   VCO   linear triangle, f = fb(PITCH) + A(PITCH,TUNE,TDEP) * ep, held while
;         the trigger holds the negative crest for 32 samples before release
;   SHAPE complex-harmonic even/odd phase body fit to the supplied 909
;   VCA   ~60 ms hold with a slow droop, then the DECAY release (48-bit)
;   THUMP the VCA's control feedthrough: a slow negative DC (48-bit)
;   PULSE negative exponential discharge, HP + resonant LP + output pole;
;         subtle hit variation samples the existing free-running noise state
;   NOISE free-running LCG, HP 230 Hz and two LP 2.37 kHz, gated by ENV2
;   LPF   the service notes' output network (knob 11; 0 passes through)
;   DESK  SAT (knob 5), LOW (9), HIGH (10): a Mackie-desk stage after it,
;         airwindows MackEQ as the reference
;
; Placeholders between at-signs are filled by dsp909.py: state offsets,
; table and constant addresses and the fixed coefficients. Labels are zqNN,
; all one length, because dsp_asm substitutes labels by textual prefix.
;
; zq01, one block:
;   r0  audio block: n7 frames written as interleaved L,R (the same value)
;   r5  this voice's 64-word block: state 0..@SWORDS@-1, SSAT at 61,
;       scratch at 54/59 after MODEL is consumed (X only: the
;       48-bit states are hi/lo word pairs, so the block can sit where
;       only X is free)
;   r6  knob block: x:(r6+k) = knob k, 0..127, k = 0..11; x:(r6+$c) = the
;       trig's frame offset, or negative for none
;   knobs: 0 PITCH  1 DECAY  2 TUNE  3 ATK  4 TDEP  5 SAT  6 TYPE  7 FIXD
;          8 ACNT  9 LOW  10 HIGH  11 LPF (SETUP: TYPE FIXD ACNT / LOW HIGH LPF)
; zq02, init: clears the state block at r5 and seeds the noise.
; m0, m1 and m4 are left linear; r5, r6 and n7 are preserved.
;
; Multiplies use only signed operand orders (AGENTS.md: dsp_asm turns an
; unknown order into mpysu), and no accumulator-to-accumulator ALU form;
; dsp909.py disassembles the build and refuses su/uu/max/rnd forms.
; ---------------------------------------------------------------------------

zq01:
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        move    #>$ffffff,m4
; ---- control, once per block ------------------------------------------------
        move    x:(r6+$0),a             ; PITCH
        move    a1,n1
        move    #>@T_INCB@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@INCB@)
        move    #>@T_AP@,r1
        move    x:(r1+n1),x0            ; ap(PITCH)
        move    x:(r6+$2),a             ; TUNE
        move    a1,n1
        move    #>@T_GT@,r1
        move    x:(r1+n1),y0            ; gt(TUNE)
 ; The recorded Tune endpoints also shift the settled VCO frequency.
 ; Derive its small offset from the existing monotone Tune table.
        move    x:(r5+@INCB@),b
        move    #>@KTFB0@,x1
        add     x1,b
        move    #>@KTFB@,x1
        mac     x1,y0,b
        move    b,x:(r5+@INCB@)
        mpyr    y0,x0,a
        move    #>@T_DKP@,r1
        move    x:(r1+n1),y1
        move    y1,x:(r5+@DKP@)
        move    a,x0                    ; ap*gt
        move    x:(r6+$4),a             ; TDEP
        move    a1,n1
        move    #>@T_GD@,r1
        move    x:(r1+n1),y0            ; gd(TDEP)
        mpyr    y0,x0,a                 ; q = ap*gt*gd, 0..1
        move    a,x0
        move    #>@KA_INC@,y0
        mpyr    y0,x0,b                 ; inc_a = q * K_A
        move    b,x:(r5+@INCA@)
        asr     #$10,a,a                ; thump index, q * 128
        move    a1,n1
        move    #>@T_THS@,r1
        move    x:(r1+n1),x1            ; thump level for this sweep size
        move    x:(r6+$1),a             ; DECAY
        move    a1,n1
        move    #>@T_DKD@,r1
        move    x:(r1+n1),y1
        move    y1,x:(r5+@DKD@)
        move    x:(r6+$8),a             ; ACNT (SETUP top right)
        move    a1,n1
        move    #>@T_VB@,r1
        move    x:(r1+n1),y0            ; body level, velocity law
        mpyr    x1,y0,a
        move    a,x:(r5+@GDC@)
        move    #>@K_BODY@,x0
        mpyr    y0,x0,a
        move    a,x:(r5+@GBODY@)
        move    #>@T_VA@,r1
        move    x:(r1+n1),y1            ; attack level, velocity law
        move    x:(r6+$3),a             ; ATK
        move    a1,n1
        move    #>@T_ATP@,r1
        move    x:(r1+n1),x0
        mpyr    x0,y1,a
        move    a,x:(r5+@GP@)
 ; Fast discharge follows Attack too; affine gain uses the same normalized
 ; table. KFDR carries 1/4 so every decoded constant is a signed fraction.
        move    a,x0
        move    #>@KFDR@,y0
        mpy     y0,x0,a
        asl     a
        asl     a
        move    #>@KGS@,x0
        mac     x0,y1,a
        move    a,x:(r5+@GS@)
        move    #>@T_ATN@,r1
        move    x:(r1+n1),x0
        mpyr    x0,y1,a
        move    a,x:(r5+@GN@)
        move    x:(r6+$b),a             ; LPF (SETUP bottom right)
        move    a1,n1
        move    #>@T_LPF@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@KLPF@)
 ; Seed depth on first use, before the shared desk marks the voice initialized.
        move    x:(r5+@PAD@),a
        tst     a
        bne     zq09
        move    x:(r5+@INCA@),x0
        move    x0,x:(r5+@SINCA@)
        move    x:(r5+@GDC@),x0
        move    x0,x:(r5+@SGDC@)
zq09:
;<desk-decode>
; Seed the fractional SAT position before decoding PAD for the first time.
        move    x:(r5+@PAD@),a
        tst     a
        bne     zd03
        move    x:(r6+$5),a
        asl     #$10,a,a
        move    a,x:(r5+@SSAT@)
zd03:
        move    x:(r6+$5),a             ; SAT
        move    a1,n1
        move    #>@T_TIN@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@TIN@)
        move    #>@T_PAD@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@PAD@)
        move    #>@T_KHP@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@KHP@)
        move    x:(r6+$9),a             ; LOW
        move    a1,n1
        move    #>@T_GB@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@GB@)
        move    #>@T_OB@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@OB@)
        move    x:(r6+$a),a             ; HIGH
        move    a1,n1
        move    #>@T_GB@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@GH@)
        move    #>@T_OB@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@OH@)
;</desk-decode>
; ---- the block, in one or two segments around the trig --------------------
        move    x:(r6+$c),a
        tst     a
        blt     zq03                    ; no trig in this block
        move    a,x:(r5+@SEG@)
        bsr     zq04                    ; frames before the trig (may be none)
        bsr     zq06                    ; the trig
        move    n7,a
        move    x:(r5+@SEG@),x0
        sub     x0,a
        bsr     zq04                    ; the rest of the block
        rts
zq03:
        move    n7,a
        bsr     zq04
        rts

; ---- zq04: a1 samples. A DO with a count of 0 runs 65536 times: skip it ----
zq04:
        tst     a
        beq     zq05
        do      a1,zq07
; Per-sample 1/64 coefficient slew (~1.44 ms at 44.1 kHz).
        move    x:(r5+@INCA@),a
        move    x:(r5+@SINCA@),x0
        sub     x0,a
        asr     #$6,a,a
        add     x0,a
        move    a,x:(r5+@SINCA@)
        move    x:(r5+@GDC@),a
        move    x:(r5+@SGDC@),x0
        sub     x0,a
        asr     #$6,a,a
        add     x0,a
        move    a,x:(r5+@SGDC@)
; (1) inc = inc_b + inc_a*ep; ep -= ep*dkp, truncating, so it reaches 0
        move    x:(r5+@EP@),x0
        move    x:(r5+@SINCA@),y0
        move    x:(r5+@INCB@),a
        mac     y0,x0,a
        move    x0,b
        move    x:(r5+@DKP@),y1
        mac     -x0,y1,b
        move    b,x:(r5+@EP@)
        move    a,x1                    ; x1 = inc
; (2) phase; held until the release count
        move    x:(r5+@U@),a
        move    a,y0
        add     x1,a
        move    x:(r5+@C@),b
        cmp     #>@NREL@,b
        tlt     y0,a                    ; before the release: u stays
        move    a1,x:(r5+@U@)           ; a1 is not limited: wraps mod 2
; (3) triangle x = 1 - 2|u|; x1 keeps u for the quadrature (inc is consumed)
        move    a1,x1
        move    x1,a
        abs     a                       #>$400000,y0
        sub     y0,a
        asl     a
        neg     a                       #>@CPOLY@,r1
        move    a,x0                    ; x0 = x (1.0 limits to $7fffff)
; (4) The transient is a decaying trigger pulse, independent of VCO phase.
; (5) S/16 = c0/16 + x*(c1/16 + x*( ... + x*c11/16)), Horner; the degree-11
;     partial sums need the 1/16 (dsp909.horner_ok), two asl give S/4
        move    x:(r1)+,y0
        move    x:(r1)+,a
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         #>@CQUAD@,r1
 ; Quadrature Q(x)/16, then u*(1+x)*Q(x)/16. The endpoint factor gives
 ; continuous joins at the triangle's crests; no oscillator/history is added.
        move    a,y1
        move    x:(r1)+,y0
        move    x:(r1)+,a
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b         x:(r1)+,a
        move    b,y0
        mac     y0,x0,a         x:(r1)+,b
        move    a,y0
        mac     y0,x0,b
        move    b,y0
        mpy     x1,y0,b
        move    b,y0
        move    b,a
        mac     y0,x0,a
        add     y1,a
        asl     a
        asl     a
        move    a,y1                    ; y1 = S/4
; (6) the VCA opens: o += ka*(1 - o)
        move    x:(r5+@O@),x0
        tfr     x0,a            #>@KA@,y0
        add     y0,a
        mac     -y0,x0,a
        move    a,x:(r5+@O@)
; (7) the VCA holds (slow droop) until NHOLD, then DECAY: m -= m*coef, 48-bit
        move    x:(r5+@C@),b
        cmp     #>@NHOLD@,b
        move    x:(r5+@DKD@),b
        move    #>@DKDROOP@,x1
        tlt     x1,b
        move    b,y0
        move    x:(r5+@LMH@),b          ; m, 48-bit as two X words
        move    x:(r5+@LML@),b0
        move    b1,x1
        mac     -x1,y0,b
        move    b,x:(r5+@LMH@)
        move    b0,x:(r5+@LML@)
        move    b,x1
        move    a,x0
        mpy     x1,x0,b
        move    b,x1                    ; x1 = g = o*m
; (8) body = GBODY * g * S/4; thump th += kth*(g - th), 48-bit; minus GDC*th
        mpy     y1,x1,a
        move    a,x0
        move    x:(r5+@GBODY@),y0
        mpy     y0,x0,a         #>@KTH@,y0
        move    x:(r5+@THH@),b          ; th, 48-bit as two X words
        move    x:(r5+@THL@),b0
        move    b1,x0
        mac     x1,y0,b
        mac     -y0,x0,b
        move    b,x:(r5+@THH@)
        move    b0,x:(r5+@THL@)
        move    b,x0
        move    x:(r5+@SGDC@),y0
        mac     -y0,x0,a        #>@KPR@,y1
        move    a,x:(r5+@ACC@)          ; the body
 ; (9) Two Attack-controlled negative discharges.
; The sample-domain envelope follows the native trigger offset; no extra clock.
        move    x:(r5+@PULSE@),x0
        mpy     x0,y1,b
        move    b,x:(r5+@PULSE@)
        move    x:(r5+@GP@),y0
        mpy     y0,x0,a         #>@KFAST@,y1 ; longer discharge follows ATK
        move    x:(r5+@FAST@),x0
        mpy     x0,y1,b
        move    b,x:(r5+@FAST@)
        move    x:(r5+@GS@),y0
        mac     y0,x0,a                 ; short edge remains at minimum ATK
        neg     a
        asr     a
        asr     a                       ; quarter-scale mixed input for headroom
        move    a,x1
        move    x:(r5+@LPU@),x0         ; lpu += ku*(up - lpu)
        tfr     x0,a            #>@KU@,y0
        mac     x1,y0,a
        mac     -y0,x0,a        #>@BHP@,y0
        move    a,x:(r5+@LPU@)
        move    x:(r5+@UPPREV@),x0      ; hp = ahp*hp + bhp*(up - prev)
        move    x1,x:(r5+@UPPREV@)
        mpy     x1,y0,b
        mac     -y0,x0,b        #>@AHP@,y0
        move    x:(r5+@HP@),x0
        mac     y0,x0,b         #>@CBIQ@,r1
        move    b,x:(r5+@HP@)
        move    b,y1                    ; y1 = hp, the biquad's input
                                        ; CBIQ: b0 b1 b2 -a1/2 -a2
        move    x:(r1)+,y0
        mpy     y1,y0,b         x:(r1)+,y0
        move    x:(r5+@BX1@),x1
        move    y1,x:(r5+@BX1@)
        mac     x1,y0,b         x:(r1)+,y0
        move    x:(r5+@BX2@),x0
        mac     y0,x0,b         x:(r1)+,y0
        move    x1,x:(r5+@BX2@)         ; the histories move while their values are in registers
        move    x:(r5+@BY1@),x0
        mac     y0,x0,b
        mac     y0,x0,b         x:(r1)+,y0
        move    x:(r5+@BY2@),x1
        mac     x1,y0,b         #>@KW16@,y1
        move    x0,x:(r5+@BY2@)
        move    b,x:(r5+@BY1@)
        move    b,x0                    ; x0 = w8
        mpy     x0,y1,b         #>@KU16@,x1 ; pls/16 = kw16*w8 + ku16*lpu8
        move    x:(r5+@LPU@),y0
        mac     x1,y0,b
; The pulse's own output pole. R8 is reused; it is filter history now and
; survives triggers, like the HP/biquad/LP histories. No state words are added.
        move    b,x1
        move    x:(r5+@R8@),x0
        tfr     x0,b            #>@KPLP@,y0
        mac     x1,y0,b
        mac     -y0,x0,b        #>@LCGK@,y0
        move    b,x:(r5+@R8@)
        move    b,x:(r5+@PT@)           ; the pulse term / 16
; (10) noise: 24-bit LCG, HP, two LP, times ENV2 = e2 - e3. The chain runs
;      at half scale (BNH carries the 1/2): the HP swings w - prev, up to 2
        move    x:(r5+@LCG@),x0
        mpy     y0,x0,b                 #0,x1 ; b0 = x*(M-1) mod 2^24
        add     x,b                     #>@LCGC@,y0 ; + x, then load c
        move    #0,y1
        add     y,b                     #>@BNH@,y0 ; + c
        move    b0,x0
        move    x0,x:(r5+@LCG@)         ; x0 = white
        move    x:(r5+@NPREV@),y1
        move    x0,x:(r5+@NPREV@)
        mpy     y0,x0,b
        mac     -y1,y0,b        #>@ANH@,y0
        move    x:(r5+@NH@),x0
        mac     y0,x0,b
        move    b,x:(r5+@NH@)
        move    b,x1                    ; x1 = nh
        move    x:(r5+@N1@),x0          ; n1 += kl*(nh - n1)
        tfr     x0,b            #>@KL1@,y0
        mac     x1,y0,b
        mac     -y0,x0,b
        move    b,x:(r5+@N1@)
        move    b,x1
        move    x:(r5+@N2@),x0
        tfr     x0,b            #>@KL2@,y0
        mac     x1,y0,b
        mac     -y0,x0,b        #>@K2@,y0
        move    b,x:(r5+@N2@)
        move    b,y1                    ; y1 = n2
        move    x:(r5+@E2@),x0
        mpy     y0,x0,a         #>@K3@,y0
        move    a,x:(r5+@E2@)
        move    x:(r5+@E3@),x0
        mpy     y0,x0,b
        move    b,x:(r5+@E3@)
        move    b,x0
        sub     x0,a                    ; env2
        move    a,x0
        mpy     x0,y1,a
        move    a,x0
        move    x:(r5+@GN@),y0
        mpy     y0,x0,b                 ; the noise term / 16
        move    x:(r5+@PT@),x0
        add     x0,b
        asl     b                       ; x16: single-bit shifts only (the
        asl     b                       ; multi-bit asl has no stock site)
        asl     b
        asl     b
        move    x:(r5+@ACC@),x0
        add     x0,b                    ; y = body + pulse + noise
; (11) the output network: yl += klpf*(y - yl); klpf $7fffff passes y
        move    b,x0                    ; limits: the one clip point
        move    x:(r5+@YL@),y1
        move    y1,a
        move    x:(r5+@KLPF@),y0
        mac     y0,x0,a
        mac     -y1,y0,a
        move    a,x:(r5+@YL@)
; (12) the Mackie stage (airwindows MackEQ as the reference, dsp909.MK): SAT's
;      drive into the curve, a complementary bass / mid / high split, the bass
;      and high bands driven into the curve by LOW and HIGH, the output
;      stage's curve, the make-up. SAT 0 with LOW and HIGH at 64 is flat.
;<desk>
; Slew SAT in knob space so drive, makeup and coupling follow the same
; table curve; separate coefficient slews can overshoot during large jumps.
        move    a,x1
        move    x:(r6+$5),a
        asl     #$10,a,a
        move    x:(r5+@SSAT@),x0
        sub     x0,a
; Settled (SSAT = SAT << 16): drive, make-up and coupling already hold the
; table entries the decode wrote or the last interpolation gave; skip them.
        beq     zd04
        asr     #$6,a,a
        add     x0,a            #>@T_TIN@,r1
        move    a,x:(r5+@SSAT@)
        move    a,b
        asr     #$10,a,a
        move    a1,n1
        and     #>$ffff,b
        asl     #$7,b,b
        move    b,y0
        lua     (r1)+n1,r1
        move    x:(r1)+,y1
        move    x:(r1),a
        sub     y1,a
        move    a,x0
        move    y1,a
        mac     y0,x0,a         #>@T_PAD@,r1
        move    a,x:(r5+@TIN@)
        lua     (r1)+n1,r1
        move    x:(r1)+,y1
        move    x:(r1),a
        sub     y1,a
        move    a,x0
        move    y1,a
        mac     y0,x0,a         #>@T_KHP@,r1
        move    a,x:(r5+@PAD@)
        lua     (r1)+n1,r1
        move    x:(r1)+,y1
        move    x:(r1),a
        sub     y1,a
        move    a,x0
        move    y1,a
        mac     y0,x0,a
        move    a,x:(r5+@KHP@)
zd04:
        move    x1,a                    ; the desk's input coupling, 48-bit (a
        move    x:(r5+@HPH@),b          ; 24-bit state stalls short of the input
        move    x:(r5+@HPL@),b0         ; and SAT's drive makes that a DC floor):
        move    b1,y1                   ; hps += khp*(y - hps), y -= hps
        move    x:(r5+@KHP@),y0         ; (khp is 0 at SAT 0: DC-coupled)
        mac     x1,y0,b
        mac     -y1,y0,b
        move    b,x:(r5+@HPH@)
        move    b0,x:(r5+@HPL@)
        move    b,y1
        sub     y1,a
        move    a,x0
        move    x:(r5+@TIN@),y0         ; drive / stage / 32
        mpy     y0,x0,a
        asl     a
        asl     a
        asl     a
        asl     a
        asl     a
        move    a,x0                    ; the clip at 1: the move limits
        mpy     x0,x0,a                 ; the curve: x - KSAT*x^5
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0 ; parallel load reads the old y0
        tfr     x0,a            a,y1    ; save the old product while loading x
        mac     -y1,y0,a
        move    a,x1                    ; x1 = x
        move    x:(r5+@LB@),x0          ; lb += KB*(x - lb): the bass band
        tfr     x0,a            #>@KB@,y0
        mac     x1,y0,a
        mac     -y0,x0,a
        move    a,x:(r5+@LB@)
        move    a,y1                    ; y1 = lb
        move    x1,b
        sub     y1,b
        asr     b
        move    b,x1                    ; x1 = rest/2
        move    x:(r5+@M2@),x0          ; m2 += KM*(rest/2 - m2): mid/2
        tfr     x0,a            #>@KM@,y0
        mac     x1,y0,a
        mac     -y0,x0,a
        move    a,x:(r5+@M2@)
        move    a,x0
        move    x1,b
        sub     x0,b
        move    b,x1                    ; x1 = high/2
        move    x:(r5+@GB@),y0          ; LOW: curve(gb*lb) * ob
        mpy     y1,y0,a
        asl     a
        asl     a
        move    a,x0
        mpy     x0,x0,a                 ; the curve: x - KSAT*x^5
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0 ; parallel load reads the old y0
        tfr     x0,a            a,y1    ; save the old product while loading x
        mac     -y1,y0,a
        move    a,x0
        move    x:(r5+@OB@),y0
        mpy     y0,x0,b                 ; b = the sum * stage/16
        move    x:(r5+@GH@),y0          ; HIGH: curve(gh*high) * oh
        mpy     x1,y0,a
        asl     a
        asl     a
        asl     a
        move    a,x0
        mpy     x0,x0,a                 ; the curve: x - KSAT*x^5
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0 ; parallel load reads the old y0
        tfr     x0,a            a,y1    ; save the old product while loading x
        mac     -y1,y0,a
        move    a,x0
        move    x:(r5+@OH@),y0
        mac     y0,x0,b         #>@KMS@,y0
        move    x:(r5+@M2@),x0          ; + mid
        mac     y0,x0,b
        asl     b
        asl     b
        asl     b
        asl     b
        move    b,x0                    ; the output stage's clip
        mpy     x0,x0,a                 ; the curve: x - KSAT*x^5
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0 ; parallel load reads the old y0
        tfr     x0,a            a,y1    ; save the old product while loading x
        mac     -y1,y0,a
        move    a,x0
        move    x:(r5+@PAD@),y0         ; make-up / 2
        mpy     y0,x0,a
        asl     a
        move    a,x:(r0)+
        move    a,x:(r0)+
;</desk>
; (12) samples since the trig, saturating at $7fffff
        move    x:(r5+@C@),a
        add     #>$000001,a
        move    a,x:(r5+@C@)
zq07:
zq05:
        rts

; ---- zq06: the trig ---------------------------------------------------------
; ep, the pulse flag and ENV2 to full; the count to 0; the VCA to 1.0 (48-bit)
; u starts at the negative body crest. Pulse filter histories survive triggers.
; The thump, the filters and the noise keep running (a retrig does not reset
; the output coupling or the noise circuit).
zq06:
        move    #>$7fffff,x0
        move    x0,x:(r5+@EP@)
        move    x0,x:(r5+@E2@)
        move    x0,x:(r5+@E3@)
; Sample the existing free-running noise state once per hit. Only pulse
; strength moves (+/- 6.4%); pitch, trigger timing and the body stay fixed.
; Knob 7 (FIXD, SETUP) set: the strength is the constant and the noise
; restarts from its seed, so every hit opens the same way.
        move    x:(r6+$7),a             ; FIXD (SETUP top middle)
        tst     a
        bne     zq0a
        move    x:(r5+@LCG@),x0
        move    #>@KPJIT@,y1
        move    #>@KPBASE@,a
        mac     x0,y1,a
        bra     zq0b
zq0a:
        move    #>@SEED@,x0
        move    x0,x:(r5+@LCG@)
        move    #>@KPBASE@,a
zq0b:
        move    a,x:(r5+@PULSE@)
        move    a,x:(r5+@FAST@)
        clr     a
        move    a,x:(r5+@C@)
        move    a,x:(r5+@O@)            ; restore the short VCA rise
        move    #>$7fffff,x0            ; m = 1 (48-bit: $7fffff:$ffffff)
        move    x0,x:(r5+@LMH@)
        move    #>$ffffff,x0
        move    x0,x:(r5+@LML@)
        move    x:(r5+@INCB@),a
        move    x:(r5+@SINCA@),x0
        add     x0,a
        move    a,x0
        move    #>@FRAC@,y0
        move    #>@U0@,a
        mac     -y0,x0,a
        move    a,x:(r5+@U@)
        rts

; ---- zq02: init --------------------------------------------------------------
zq02:
        clr     a
        move    r5,r1
        do      #@SWORDS@,zq08
        move    a,x:(r1)+
zq08:
        move    a,x:(r5+@FAST@)
        move    a,x:(r5+@GS@)
        move    #>$7fffff,x0
        move    x0,x:(r5+@C@)
        move    x0,x:(r5+@KLPF@)
        move    #>@SEED@,x0
        move    x0,x:(r5+@LCG@)
        rts
