; ---------------------------------------------------------------------------
; bd909 -- the Analog Bassdrum's TR-909 voice on the DSP (one voice per call).
;
; Fitted to Skee Mask's TR-909 recordings (fit909.json). All tables and the
; float reference: dsp909.py; measurements and limits: TESTING.md.
;   ENV5  pitch envelope ep, set at the trig (a little different per hit),
;         decays with TUNE
;   VCO   linear phase, f = fb(PITCH) + A(PITCH,TUNE,TDEP) * ep, held at the
;         negative crest for three blocks after the trig
;   SHAPE the recorded cycle from two 128-point tables, linear: the cycle
;         without its fundamental (scaled by the sweep and the VCA, once a
;         block) and the fundamental (scaled by the sweep, every sample)
;   VCA   ~65 ms hold with a slow droop, then the DECAY release (48-bit)
;   THUMP the VCA's control feedthrough: a slow negative DC
;   CLICK the trigger pulse through its filters, fired one block after the
;         trig: the filters' response is a 128-sample table per input and
;         two decaying tails (the discharge and the high-pass)
;   NOISE free-running LCG, HP 230 Hz and two LP, under an envelope that is
;         stepped once a block and ramped between
;   LPF   the service notes' output network (knob 11; 127 passes through)
;   DESK  SAT (knob 5), LOW (9), HIGH (10): a desk stage after it
;
; One pointer walks the voice block: every word the loop touches lies in the
; order the loop touches it, read with x:(r5) and written back with x:(r5)+,
; so most loads and stores ride on an arithmetic instruction. dsp909.py reads
; the order from the ;@ NAME tags below and places the words; the last access
; steps back by n5 to the first. Outside the loop r5 is the block's base and
; words are reached as x:(r5+NAME).
;
; Placeholders between at-signs are filled by dsp909.py. Labels are zqNN,
; all one length, because dsp_asm substitutes labels by textual prefix.
;
; zq01, one block:
;   r0  audio block: n7 frames written as interleaved L,R (the same value)
;   r5  this voice's 64-word block (X only: the 48-bit states are hi/lo pairs)
;   r6  knob block: x:(r6+k) = knob k, 0..127, k = 0..11; x:(r6+$c) = the
;       trig's frame offset, or negative for none
;   knobs: 0 PITCH  1 DECAY  2 TUNE  3 ATK  4 TDEP  5 SAT  6 TYPE  7 FIXD
;          8 ACNT  9 LOW  10 HIGH  11 LPF (SETUP: TYPE FIXD ACNT / LOW HIGH LPF)
; zq02, init: clears the state block at r5 and seeds the noise.
; r1, r4, n1 and both accumulators are used; r5, r6, n5 and n7 are kept (n5
; walks the block and is put back: stock code reads it after the source).
; Every instruction form here is one stock or 0.1.6 already runs on the chip.
;
; Multiplies use only signed operand orders (AGENTS.md: dsp_asm turns an
; unknown order into mpysu), and no accumulator-to-accumulator ALU form;
; dsp909.py disassembles the build and refuses su/uu/max/rnd forms.
; ---------------------------------------------------------------------------

zq01:
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        move    #>$ffffff,m4
; ---- a voice at rest: no trig, the hit long over, the VCA closed ----------
        move    x:(r6+$c),a
        tst     a
        bge     zq0c
        move    x:(r5+@BC@),a
        cmp     #>@NIDLE@,a
        blt     zq0c
        move    x:(r5+@MH@),a
        cmp     #>$000080,a
        bge     zq0c
        clr     a
        move    a,x:(r5+@PAD@)          ; the next hit starts from its own knobs
        do      n7,zq0d
        move    a,x:(r0)+
        move    a,x:(r0)+
zq0d:
        rts
zq0c:
        move    n5,a
        move    a,x:(r5+@SAVN5@)
        move    #>@WLAST@,n5
; ---- control, once per block ------------------------------------------------
        move    x:(r6+$0),a             ; PITCH
        move    a1,n1
        move    #>@T_INCB@,r1
        move    x:(r1+n1),b
        move    #>@T_AP@,r1
        move    x:(r1+n1),x0            ; ap(PITCH)
        move    x:(r6+$2),a             ; TUNE
        move    a1,n1
        move    #>@T_GT@,r1
        move    x:(r1+n1),y0            ; gt(TUNE)
 ; The recorded Tune endpoints also shift the settled VCO frequency.
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
        mpyr    y0,x0,b                 ; the sweep's target, q * K_A
        asr     #$10,a,a                ; thump index, q * 128
        move    a1,n1
        move    #>@T_THS@,r1
        move    x:(r1+n1),x1            ; thump level for this sweep size
        move    x:(r6+$8),a             ; ACNT: the body level is (ACNT/128)^2
        asl     #$10,a,a
        move    a,x0
        mpy     x0,x0,a
        move    a,y0
        mpyr    x1,y0,a
        asr     a
        move    a,y1                    ; the thump's target / 2
        move    #>@K_BODY@,x0
        mpyr    y0,x0,a
        move    a,x:(r5+@GBODY@)
 ; The sweep and the thump follow their knobs a quarter of the way each block
 ; (the first block after silence takes them as they are).
        move    x:(r5+@PAD@),a
        tst     a
        bne     zq09
        move    b,x:(r5+@SINCA@)
        move    y1,x:(r5+@SGDCH@)
zq09:
        move    x:(r5+@SINCA@),x0
        sub     x0,b
        asr     #$2,b,b
        add     x0,b
        move    b,x:(r5+@SINCA@)
        move    y1,a
        move    x:(r5+@SGDCH@),x0
        sub     x0,a
        asr     #$2,a,a
        add     x0,a
        move    a,x:(r5+@SGDCH@)
        move    x:(r6+$1),a             ; DECAY
        move    a1,n1
        move    #>@T_DKD@,r1
        move    x:(r1+n1),y1            ; kept in y1 for the hold's end below
        move    x:(r6+$b),a             ; LPF (SETUP bottom right)
        move    a1,n1
        move    #>@T_LPF@,r1
        move    x:(r1+n1),x0
        move    x0,x:(r5+@KLPF@)
 ; The cycle's shape above its fundamental follows the sweep and the VCA.
        move    x:(r5+@EP@),x0
        move    #>@KLE@,y0
        move    #>@KL0@,a
        mac     y0,x0,a
        move    x:(r5+@MH@),x0
        move    #>@KLM@,y0
        mac     -y0,x0,a
        move    a,x:(r5+@LR@)
 ; The phase runs from the fourth block after the trig; DECAY takes over from
 ; the hold's droop NHOLDB blocks after it.
        move    x:(r5+@BC@),a
        cmp     #>$000004,a
        blt     zq0e
        move    x:(r5+@INCB@),x0
        move    x0,x:(r5+@AINCB@)
        move    x:(r5+@SINCA@),x0
        move    x0,x:(r5+@ASINCA@)
zq0e:
        move    x:(r5+@BC@),a
        cmp     #>@NHOLDB@,a
        blt     zq0f
        move    y1,x:(r5+@DKM@)
zq0f:
        bsr     zq1a                    ; the noise envelope's next ramp
;<desk-decode>
; SAT moves a quarter of the way to its knob each block; the drive and the
; make-up are read from their tables at that position and reached by a ramp
; over the block. After silence (PAD 0) they are set at once.
        move    x:(r6+$5),a
        asl     #$10,a,a
        move    x:(r5+@PAD@),b
        tst     b
        beq     zd02
        move    x:(r5+@SSAT@),x0
        sub     x0,a
        asr     #$2,a,a
        tst     a
        bne     zd01
        move    a,x:(r5+@DTIN@)         ; settled: no ramp
        move    a,x:(r5+@DPAD@)
        bra     zd04
zd01:
        add     x0,a
zd02:
        move    a,x:(r5+@SSAT@)
        move    a,b
        asr     #$10,a,a
        move    a1,n1
        and     #>$ffff,b
        asl     #$7,b,b
        move    b,y0                    ; the fraction between two table entries
        move    #>@T_TIN@,r1
        lua     (r1)+n1,r1
        move    x:(r1)+,y1
        move    x:(r1),a
        sub     y1,a
        move    a,x0
        move    y1,a
        mac     y0,x0,a
        move    a,x1                    ; the drive's target
        move    #>@T_PAD@,r1
        lua     (r1)+n1,r1
        move    x:(r1)+,y1
        move    x:(r1),a
        sub     y1,a
        move    a,x0
        move    y1,a
        mac     y0,x0,a                 ; the make-up's target
        move    x:(r5+@PAD@),b
        tst     b
        bne     zd05
        move    x1,x:(r5+@TIN@)
        move    a,x:(r5+@PAD@)
        clr     a
        move    a,x:(r5+@DTIN@)
        move    a,x:(r5+@DPAD@)
        bra     zd06
zd05:
        move    x:(r5+@PAD@),x0
        sub     x0,a
        asr     #$4,a,a
        move    a,x:(r5+@DPAD@)
        move    x1,a
        move    x:(r5+@TIN@),x0
        sub     x0,a
        asr     #$4,a,a
        move    a,x:(r5+@DTIN@)
zd06:
        move    x:(r5+@SSAT@),a         ; the input coupling opens over SAT 0..16
        move    #>$100000,x0
        cmp     x0,a
        tge     x0,a
        move    a,x0
        move    #>@KHP8@,y0
        mpy     y0,x0,a
        move    a,x:(r5+@KHP@)
zd04:
        move    x:(r6+$9),a             ; LOW
        move    a1,n1
        move    #>@T_GLH@,r1
        move    x:(r1+n1),a
        asl     a
        move    a,x:(r5+@GL@)
        move    x:(r6+$a),a             ; HIGH
        move    a1,n1
        move    x:(r1+n1),a
        asl     a
        move    a,x:(r5+@GH@)
;</desk-decode>
; ---- the block, in segments around the click, the release and the trig -----
        clr     a
        move    a,x:(r5+@SEG@)
        move    x:(r5+@BC@),b
        cmp     #>$000001,b
        beq     zq10                    ; the click, one block after the trig
        cmp     #>$000003,b
        bne     zq12                    ; (3: the phase is released)
zq10:
        move    x:(r6+$c),a
        tst     a
        blt     zq11
        move    a,x0                    ; a trig at or before it replaces it
        move    x:(r5+@T0@),a
        cmp     x0,a
        bge     zq12
zq11:
        move    x:(r5+@T0@),a
        move    a,x:(r5+@SEG@)
        bsr     zq04
        move    x:(r5+@BC@),b
        cmp     #>$000001,b
        bne     zq13
        bsr     zq1c
        bra     zq12
zq13:
        bsr     zq1e
zq12:
        move    x:(r6+$c),a
        tst     a
        blt     zq03                    ; no trig in this block
        move    x:(r5+@SEG@),x0
        move    a,x:(r5+@SEG@)
        move    a,x:(r5+@T0@)
        sub     x0,a
        bsr     zq04                    ; frames before the trig (may be none)
        bsr     zq06                    ; the trig
zq03:
        move    n7,a
        move    x:(r5+@SEG@),x0
        sub     x0,a
        bsr     zq04                    ; the rest of the block
        move    x:(r5+@BC@),a           ; blocks since the trig, saturating
        add     #>$000001,a
        move    a,x:(r5+@BC@)
        move    x:(r5+@SAVN5@),a
        move    a1,n5
        rts

; ---- zq04: a samples. A DO with a count of 0 runs 65536 times: skip it ----
zq04:
        tst     a
        beq     zq05
        move    x:(r5+@PP@),b           ; the click table's position
        cmp     #>@CEND@,b
        blt     zq0h
        move    #>@CEND@,b              ; past it: its silent rows, a block of them
zq0h:
        move    b1,r4
        do      a1,zq07
; (1) inc = inc_b + inc_a*ep (both 0 while the crest is held); ep -= ep*dkp
        move    x:(r5)+,a                       ;@ AINCB
        move    x:(r5)+,y0                      ;@ ASINCA
        move    x:(r5)+,y1                      ;@ DKP
        move    x:(r5),x0                       ;@ EP
        mac     y0,x0,a         x0,b
        mac     -x0,y1,b        #>$000040,y0
        move    b,x:(r5)+                       ;@ EP
; (2) phase u, -1..1, wrapping
        move    x:(r5),x1                       ;@ U
        add     x1,a            b,x0            ; x0 = ep
        move    a1,x1
; (3) the body tables at u: a1 = the cell -64..63, a0 = the fraction
        mpy     x1,y0,a         x1,x:(r5)+      ;@ U
        move    a0,b
        lsr     b               a1,n1
        move    #>@KKF@,y0
        mpy     y0,x0,a         b1,y1           ; y1 = the fraction, 0..1
        add     #>$400000,a
        move    a,x0                            ; the fundamental's scale / 2
        move    #>@TD@,r1
        move    x:(r1+n1),x1
        move    #>@TD1@,r1
        move    x:(r1+n1),a
        sub     x1,a            #>@CF@,r1
        tfr     x1,b            a,y0
        mac     y1,y0,b         x:(r1+n1),x1    ; b = the cycle without its fundamental
        move    #>@CF1@,r1
        move    x:(r1+n1),a
        sub     x1,a
        tfr     x1,a            a,y0
        mac     y1,y0,a         b,x1            ; a = the fundamental
        move    x:(r5)+,y0                      ;@ LR
        mpy     x1,y0,a         a,y1
        mac     x0,y1,a         #>@KA@,y0       ; a = S/8
; (4) the VCA opens: o += ka*(1 - o); holds or decays: m -= m*coef, 48-bit
        move    x:(r5),x0                       ;@ O
        tfr     x0,a            a,y1            ; y1 = S/8
        add     y0,a
        mac     -y0,x0,a
        move    a,x:(r5)+                       ;@ O
        move    x:(r5)+,y0                      ;@ DKM
        move    x:(r5)+,b                       ;@ MH
        move    x:(r5)-,b0                      ;@ ML
        move    b1,x0
        mac     -y0,x0,b        a,x1            ; x1 = o
        move    b,x:(r5)+                       ;@ MH
        move    b,x0
        mpy     x1,x0,a         b0,x:(r5)+      ;@ ML
        move    a,x1                            ; x1 = g = o*m
; (5) body = GBODY * g * S/4; thump th += kth*(g - th); minus GDC*th
        mpy     y1,x1,a         #>@KTH@,y0
        move    x:(r5)+,y1                      ;@ GBODY
        move    a,x0
        mpy     x0,y1,a         x:(r5),x0       ;@ TH
        tfr     x0,b            x:(r4)+,y1
        mac     x1,y0,b
        mac     -y0,x0,b
        move    b,x:(r5)+                       ;@ TH
        move    b,x0
        move    x:(r5)+,y0                      ;@ SGDCH
        mac     -y0,x0,a        y1,x0
        asl     a               #0,x1           ; the body, with its thump
; (6) the click: two table columns and two decaying tails, each with its gain
        move    x:(r5)+,y0                      ;@ G1
        mac     y0,x0,a         x:(r4)+,x0
        move    x:(r5)+,y0                      ;@ G2
        mac     y0,x0,a         x:(r5)+,y0      ;@ G3
        move    x:(r5)+,x1                      ;@ G4
        move    x:(r5),x0                       ;@ E1
        mac     y0,x0,a         #>@KPR@,y1
        mpy     x0,y1,b         #>@AHP@,y1
        move    b,x:(r5)+                       ;@ E1
        move    x:(r5),x0                       ;@ E2
        mac     x1,x0,a         #>@LCGK@,y0
        mpy     x0,y1,b         #0,x1
        move    b,x:(r5)+                       ;@ E2
; (7) noise: 24-bit LCG, HP, two LP, times its envelope (the gain is in it).
;     The chain runs at half scale: the HP swings w - prev, up to 2
        move    x:(r5),x0                       ;@ LCG
        mpy     y0,x0,b         #0,y1           ; b0 = x*(M-1) mod 2^24
        add     x,b             #>@LCGC@,y0     ; + x, then load c
        add     y,b             #>@BNH@,y0      ; + c
        move    b0,x0
        move    x0,x:(r5)+                      ;@ LCG
        move    x:(r5),y1                       ;@ NPREV
        mpy     y0,x0,b         x0,x:(r5)+      ;@ NPREV
        mac     -y1,y0,b        #>@ANH@,y0
        move    x:(r5),x0                       ;@ NH
        mac     y0,x0,b         #>@KL1@,y0
        move    b,x:(r5)+                       ;@ NH
        move    x:(r5),x0                       ;@ N1
        tfr     x0,b            b,x1
        mac     x1,y0,b
        mac     -y0,x0,b        #>@KL2@,y0
        move    b,x:(r5)+                       ;@ N1
        move    x:(r5),x0                       ;@ N2
        tfr     x0,b            b,x1
        mac     x1,y0,b
        mac     -y0,x0,b
        move    b,x:(r5)+                       ;@ N2
        move    b,y1                            ; y1 = n2
        move    x:(r5)+,b                       ;@ DENV
        move    x:(r5),x0                       ;@ ENV
        add     x0,b
        move    b,x:(r5)+                       ;@ ENV
        move    b,x0
        mac     x0,y1,a         x:(r5)+,y0      ;@ KLPF
; (8) the output network: yl += klpf*(y - yl); klpf $7fffff passes y
        move    x:(r5),x0                       ;@ YL
        tfr     x0,a            a,x1            ; x1 = y, limited: the one clip point
        mac     x1,y0,a
        mac     -y0,x0,a
        move    a,x:(r5)+                       ;@ YL
; (9) the desk stage (airwindows MackEQ as the reference, dsp909.MK): SAT's
;     drive into the curve x - KSAT*x^5, a complementary bass / mid / high
;     split weighted by LOW and HIGH, the output stage's curve, the make-up.
;     SAT 0 with LOW and HIGH at 64 is flat.
;<desk>
        move    a,x1
        move    x:(@D@)+,y0                     ;@ KHP
        move    x:(@D@)+,b                      ;@ HPH
        move    x:(@D@)-,b0                     ;@ HPL
        move    b1,y1                           ; the input coupling, 48-bit (a 24-bit
        mac     x1,y0,b                         ; state stalls short of the input and
        mac     -y1,y0,b                        ; SAT's drive makes that a DC floor)
        move    b,x:(@D@)+                      ;@ HPH
        move    b0,x:(@D@)+                     ;@ HPL
        move    b,y1
        sub     y1,a            x:(@D@)+,b      ;@ DTIN
        move    x:(@D@),y0                      ;@ TIN
        add     y0,b            a,x0
        move    b,y0
        mpy     y0,x0,a         b,x:(@D@)+      ;@ TIN
        asl     #$5,a,a
        move    a,x0                            ; the clip at 1: the move limits
        mpy     x0,x0,a
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0     ; parallel load reads the old y0
        tfr     x0,a            a,y1            ; save the old product while loading x
        mac     -y1,y0,a        x:(@D@),x0      ;@ LB
        tfr     x0,b            a,x1            ; x1 = x
        move    #>@KB@,y0
        mac     x1,y0,b                         ; lb += KB*(x - lb): the bass band
        mac     -y0,x0,b
        move    b,x:(@D@)+                      ;@ LB
        move    b,y1                            ; y1 = lb
        sub     y1,a            x:(@D@),x0      ;@ M2
        asr     a
        tfr     x0,b            a,x1            ; x1 = rest/2
        move    #>@KM@,y0
        mac     x1,y0,b                         ; m2 += KM*(rest/2 - m2): mid/2
        mac     -y0,x0,b
        move    b,x:(@D@)+                      ;@ M2
        move    b,x0
        sub     x0,a            #>@KMS@,y0      ; a = high/2
        mpy     y0,x0,b         x:(@D@)+,y0     ;@ GL
        mac     y1,y0,b         x:(@D@)+,y0     ;@ GH
        move    a,x1
        mac     x1,y0,b
        mac     x1,y0,b                         ; b = the sum * stage/16
        asl     #$4,b,b
        move    b,x0                            ; the output stage's clip
        mpy     x0,x0,a
        move    a,y0
        mpy     y0,y0,a
        move    a,y0
        mpy     y0,x0,a         #>@KSAT@,y0     ; parallel load reads the old y0
        tfr     x0,a            a,y1            ; save the old product while loading x
        mac     -y1,y0,a        x:(@D@)+,b      ;@ DPAD
        move    x:(@D@),y0                      ;@ PAD
        add     y0,b            a,x0
        move    b,y0
        mpy     y0,x0,a         b,x:(@D@)@DEND@ ;@ PAD
        asl     a                               ; (the make-up is stored halved)
        move    a,x:(r0)+
        move    a,x:(r0)+
;</desk>
zq07:
        move    r4,a
        move    a,x:(r5+@PP@)
zq05:
        rts

; ---- zq06: the trig ---------------------------------------------------------
; ep to full, a little different per hit from the free-running noise state
; (FIXD, knob 7: always the same, and the noise restarts from its seed). The
; VCA to 1.0 (48-bit), its opening to 0, the phase to the negative crest and
; held. The thump, the filters and the noise keep running.
zq06:
        move    #>@KEBASE@,a
        move    x:(r6+$7),b             ; FIXD (SETUP top middle)
        tst     b
        bne     zq0a
        move    x:(r5+@LCG@),x0
        move    #>@KEJIT@,y1
        mac     x0,y1,a
        bra     zq0b
zq0a:
        move    #>@SEED@,x0
        move    x0,x:(r5+@LCG@)
zq0b:
        move    a,x:(r5+@EP@)
        clr     a
        move    a,x:(r5+@BC@)
        move    a,x:(r5+@O@)
        move    a,x:(r5+@AINCB@)
        move    a,x:(r5+@ASINCA@)
        move    #>$7fffff,x0            ; m = 1 (48-bit: $7fffff:$ffffff)
        move    x0,x:(r5+@MH@)
        move    #>$ffffff,x0
        move    x0,x:(r5+@ML@)
        move    #>@U0@,x0
        move    x0,x:(r5+@U@)
        move    #>@DKDROOP@,x0
        move    x0,x:(r5+@DKM@)
        rts

; ---- zq1c: the click, one block after the trig ------------------------------
; Its strength J varies a little per hit (not with FIXD). The gains are taken
; from ATK and ACNT here and hold for the hit:
;   gp = va*atp, gs = va*KGS + 4*gp*KFDR (the two discharges' gains)
;   G1 = -4*J*gp, G2 = -4*J*gs, G3 = G1*A1, G4 = G1*B1 + G2*B2
zq1c:
        move    #>@KPBASE@,b
        move    x:(r6+$7),a
        tst     a
        bne     zq1d
        move    x:(r5+@LCG@),x0
        move    #>@KPJIT@,y1
        mac     x0,y1,b
zq1d:
        move    b,x1                    ; x1 = J
        move    x:(r6+$8),a             ; ACNT
        move    a1,n1
        move    #>@T_VA@,r1
        move    x:(r1+n1),y1            ; va
        move    x:(r6+$3),a             ; ATK
        move    a1,n1
        move    #>@T_ATP@,r1
        move    x:(r1+n1),x0            ; atp
        move    #>@KN1Q@,y0             ; the noise gain: va*(KN0 + KN1*atp), x16
        mpy     y0,x0,b
        asl     b
        asl     b
        move    #>@KN0X@,y0
        add     y0,b
        move    b,y0
        mpy     y1,y0,b
        move    b,x:(r5+@GN16@)
        mpyr    x0,y1,a
        move    a,x0                    ; gp
        move    #>@KFDR@,y0
        mpy     y0,x0,b
        asl     b
        asl     b
        move    #>@KGS@,y0
        mac     y1,y0,b
        move    b,y0                    ; gs
        mpy     x1,x0,a
        asl     a
        asl     a
        neg     a
        move    a,x0
        move    x0,x:(r5+@G1@)
        mpy     x1,y0,a
        asl     a
        asl     a
        neg     a
        move    a,y0
        move    y0,x:(r5+@G2@)
        move    #>@KA1@,y1
        mpy     x0,y1,a
        move    a,x:(r5+@G3@)
        move    #>@KB1@,y1
        mpy     x0,y1,a
        move    #>@KB2@,x1
        mac     x1,y0,a
        move    a,x:(r5+@G4@)
        move    #>$7fffff,x0
        move    x0,x:(r5+@E1@)
        move    x0,x:(r5+@E2@)
        move    x0,x:(r5+@E2N@)
        move    x0,x:(r5+@E3N@)
        move    #>@CSTART@,x0
        move    x0,x:(r5+@PP@)
        bsr     zq1a
        rts

; ---- zq1e: the phase is released, three blocks after the trig ---------------
zq1e:
        move    x:(r5+@INCB@),x0
        move    x0,x:(r5+@AINCB@)
        move    x:(r5+@SINCA@),x0
        move    x0,x:(r5+@ASINCA@)
        rts

; ---- zq1a: the noise envelope ENV2 = e2 - e3, one block on, and the ramp ----
zq1a:
        move    x:(r5+@E2N@),x0
        move    #>@K2B@,y0
        mpy     y0,x0,a
        move    a,x:(r5+@E2N@)
        move    a,x1
        move    x:(r5+@E3N@),x0
        move    #>@K3B@,y0
        mpy     y0,x0,a
        move    a,x:(r5+@E3N@)
        move    a,x0
        move    x1,a
        sub     x0,a
        move    a,x0
        move    x:(r5+@GN16@),y0
        mpy     y0,x0,a                 ; where the envelope stands a block on
        move    x:(r5+@ENV@),x0
        sub     x0,a
        asr     #$4,a,a
        move    a,x:(r5+@DENV@)
        rts

; ---- zq02: init --------------------------------------------------------------
zq02:
        clr     a
        move    r5,r1
        do      #$30,zq08
        move    a,x:(r1)+
zq08:
        move    a,x:(r5+$3d)
        move    a,x:(r5+$3e)
        move    a,x:(r5+$3f)
        move    #>$7fffff,x0
        move    x0,x:(r5+@BC@)
        move    #>@CEND@,x0
        move    x0,x:(r5+@PP@)
        move    #>@SEED@,x0
        move    x0,x:(r5+@LCG@)
        rts
