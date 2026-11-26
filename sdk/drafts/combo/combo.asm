; COMBO -- an amp and speaker cabinet in one insert. Original Modwerk design.
;
; A buffer-free stereo insert for FX1 or FX2: no allocator, no bus role,
; no absolute Y. One amp, like a guitar amp: both sides get its output.
;   the mono sum (L + R)/2, the voice's pre high-pass one-pole (KHP) and pre
;   low-pass biquad (its b words carry the voice's drive x 2, so q is limited
;   at full scale there), then at twice the rate (a polyphase half-band,
;   halfband.py, up and down): GAIN, plus the voice's BIAS, limited at full
;   scale, the voice's curve CA c - CB c^3 less FB (its value at BIAS, so
;   silence stays silence); then one gain OUT = COMP x LEV x VC (COMP =
;   1/sqrt(G): more GAIN, not more volume), BASS/MID/TREB as gains of three
;   bands split at the voice's KL and KT, times its weights, CAB (three
;   biquads), a 10 Hz DC blocker.
;
; Fixed point. Everything after the input runs at quarter scale (x/4). The
; one-pole states are 48 bits. Each call copies the voice's pre low-pass and
; CAB's row to X:$40..$53 and the voice's KHP CA CB BIAS FB KL KT to $54..$5a
; from the P table (tables.py).
;
; Knobs (value<<16 with an LFO's fraction bits in 8-15):
;   GAIN x:(r6+0): G = ((k+16)/16)^2, stored as G/256 = ((k+16)/256)^2
;   BASS x:(r6+1), MID x:(r6+2), TREB x:(r6+3): band gain k/64 x the voice's
;        weight, stored k/128 x w/2
;   CAB  x:(r6+4): 0 OFF, 1 1X10, 2 1X12, 3 2X12, 4 4X12 (above 4 is 4X12)
;   LEV  x:(r6+5): (k/64)^2, 64 is 0 dB. OUT is stored as COMP/2 x (k/128)^2 x VC
;   VOIC x:(r6+$c), SETUP page slot 6: 0 CLEAN, 1 BRIT, 2 HGAIN, 3 SOLID (above 3 is SOLID)
;   TGHT x:(r6+$c) bits 8-15, slot 7: the pre high-pass x (t+16)/80, 64 the voice's own
;   PRES x:(r6+$d), slot 8, MIC bits 8-15, slot 9: each cab's biquad 2 and 3 move
;        k/128 of the way to their PRES 127 / MIC 127 versions (tables.py cab_row)
;   MIX  x:(r6+$e), slot 10: dry to wet, 127 all wet; it glides like OUT ($3a/$3b)
; GAIN, BASS, MID, TREB, OUT and MIX glide per sample (1/64 a sample) and snap
; onto their target at the start of a call once within 64 LSB. The first
; call after init starts on the knobs. CAB and VOIC switch at the start of a call.
;
; State (X, offsets from r7; init clears $00..$5f):
;   the amp's block at $00 (r5 = r7 in cmb_chan):
;     +0/+1 pre high-pass hi/lo      +2..+5 pre low-pass x1 x2 y1 y2
;     +6/+7 low split hi/lo          +8/+9 high split hi/lo
;     +a..+d cab biquad 1            +e..+11 cab biquad 2
;     +12..+15 cab biquad 3          +16/+17 DC blocker hi/lo
;     +18..+1f up all-passes a0 a2 a1 a3 (x1, y1 each)
;     +20..+27 down all-passes a0 a2 a1 a3   +28/+29/+2a scratch
;   $30/$31 GAIN target/run   $32/$33 BASS   $34/$35 MID   $36/$37 TREB
;   $38/$39 OUT target/run    $3a/$3b MIX target/run    $3f seeded
;   $40..$44 the voice's pre low-pass, $45..$53 the CAB row (b0 b1 b2 -a1 -a2, halved)
;   $54..$5a the voice's KHP CA CB BIAS FB KL KT
; Nothing above $5f is touched.
; Every product is the signed mpy/mac x0,y1 form.
; CYCLES_FORWARD_BRANCHES
init:
        move    r7,r5
        move    #>$ffffff,m5
        clr     a
        do      #96,>cmb_zero
        move    a,x:(r5)+
cmb_zero:
        nop
        rts

proc:
        move    #>$ffffff,m1
        move    #>$ffffff,m2
        move    #>$ffffff,m3
        move    #>$ffffff,m4
        move    #>$ffffff,m5
; VOIC x:(r6+$c): r1 = its row (16 words a voice, tables.py VOICES); above 3 is SOLID.
        move    #>$fab1e0,r2
        move    r2,r1
        move    x:(r6+$c),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    #>3,x0
        cmp     x0,a
        tgt     x0,a
        asl     #4,a,a
        move    a1,n1
        move    (r1)+n1
; The voice's pre low-pass to $40..$44, CAB's rows (table word 64 + 25 CAB) to $45..$53,
; then the voice's KHP CA CB BIAS FB KL KT to $54..$5a.
        move    #>$40,n4
        move    r7,r4
        move    (r4)+n4
        do      #5,>cmb_pre
        move    p:(r1)+,x0
        move    x0,x:(r4)+
cmb_pre:
        nop
        move    x:(r6+$4),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    #>4,x0
        cmp     x0,a
        tgt     x0,a
        tfr     a,b
        asl     #3,a,a
        add     a,b
        asl     #1,a,a
        add     b,a
        move    #>64,x0
        add     x0,a
        move    r2,r3
        move    a1,n3
        move    (r3)+n3
        do      #5,>cmb_cab
        move    p:(r3)+,x0
        move    x0,x:(r4)+
cmb_cab:
        nop
; Biquad 2 = its words + PRES/128 x the step to PRES 127 (5 words on), x:(r6+$d) knob field.
        move    #>5,n3
        move    x:(r6+$d),a
        and     #>$7f0000,a
        move    a1,y1
        do      #5,>cmb_bqtwo
        move    p:(r3+n3),x0
        mpy     x0,y1,a
        move    p:(r3)+,x0
        add     x0,a
        move    a,x:(r4)+
cmb_bqtwo:
        nop
        move    (r3)+n3
; Biquad 3 = its words + MIC/128 x the step to MIC 127, x:(r6+$d) companion field (bits 8-15).
        move    x:(r6+$d),a
        and     #>$007f00,a
        asl     #8,a,a
        move    a1,y1
        do      #5,>cmb_bqthree
        move    p:(r3+n3),x0
        mpy     x0,y1,a
        move    p:(r3)+,x0
        add     x0,a
        move    a,x:(r4)+
cmb_bqthree:
        nop
        do      #7,>cmb_voice
        move    p:(r1)+,x0
        move    x0,x:(r4)+
cmb_voice:
        nop
; TGHT, x:(r6+$c) companion field: KHP x (t+16)/80 = KHP x ((t+16)/256 x 0.8) x 4; 64 is the voice's own.
        move    x:(r6+$c),a
        and     #>$007f00,a
        asl     #7,a,a
        move    #>$080000,x0
        add     x0,a
        move    a1,x0
        move    #>$666666,y1
        mpy     x0,y1,a
        move    a,x0
        move    x:(r7+$54),y1
        mpy     x0,y1,a
        asl     #2,a,a
        move    a,x:(r7+$54)
; MIX, x:(r6+$e): k/128 + k/16384, so 127 leaves the dry 1/16384.
        move    x:(r6+$e),a
        and     #>$7f0000,a
        tfr     a,b
        asr     #7,b,b
        add     b,a
        move    a1,x:(r7+$3a)
; GAIN: u = kn/2 + 1/16 = (k+16)/256; u^2 = G/256 (the voice's drive is in its pre low-pass).
        move    x:(r6+$0),a
        and     #>$7fffff,a
        asr     #1,a,a
        move    #>$080000,x0
        add     x0,a
        move    a1,x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x:(r7+$30)
; OUT: COMP/2 (table word 189 + GAIN's whole step) x (k/128)^2 x the voice's VC.
        move    r2,r3
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    #>189,x0
        add     x0,a
        move    a1,n3
        move    (r3)+n3
        move    x:(r6+$5),a
        and     #>$7fffff,a
        move    a1,x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    p:(r3),y1
        mpy     x0,y1,a
        move    a,x0
        move    p:(r1)+,y1
        mpy     x0,y1,a
        move    a,x:(r7+$38)
; BASS, MID, TREB: k/128 times the voice's weights WB, WM, WT (w/2).
        move    x:(r6+$1),a
        and     #>$7fffff,a
        move    a1,x0
        move    p:(r1)+,y1
        mpy     x0,y1,a
        move    a,x:(r7+$32)
        move    x:(r6+$2),a
        and     #>$7fffff,a
        move    a1,x0
        move    p:(r1)+,y1
        mpy     x0,y1,a
        move    a,x:(r7+$34)
        move    x:(r6+$3),a
        and     #>$7fffff,a
        move    a1,x0
        move    p:(r1)+,y1
        mpy     x0,y1,a
        move    a,x:(r7+$36)
; The first call after init starts on the knobs.
        move    x:(r7+$3f),a
        tst     a
        bne     cmb_seeded
        lua     (r7+$30),r4
        do      #6,>cmb_seedcopy
        move    x:(r4)+,x0
        move    x0,x:(r4)+
cmb_seedcopy:
        nop
        move    #>1,x0
        move    x0,x:(r7+$3f)
cmb_seeded:
; A glide within 64 LSB of its target snaps onto it.
        lua     (r7+$30),r4
        do      #6,>cmb_snap
        move    x:(r4)+,y0
        move    x:(r4),x0
        move    y0,a
        sub     x0,a
        abs     a
        move    #>64,x1
        cmp     x1,a
        move    x0,b
        tlt     y0,b
        move    b1,x:(r4)+
cmb_snap:
        nop
        do      n7,>cmb_frameend
        move    x:(r7+$30),a
        move    x:(r7+$31),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$31)
        move    x:(r7+$32),a
        move    x:(r7+$33),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$33)
        move    x:(r7+$34),a
        move    x:(r7+$35),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$35)
        move    x:(r7+$36),a
        move    x:(r7+$37),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$37)
        move    x:(r7+$38),a
        move    x:(r7+$39),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$39)
        move    x:(r7+$3a),a
        move    x:(r7+$3b),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$3b)
        move    r7,r5
        bsr     cmb_chan
; MIX: each side = 2 (d/2 + MIX (h - d/2)), h the wet halved.
        move    a,x1
        move    x:(r7+$3b),y1
        move    x:(r0),b
        asr     #1,b,b
        move    x1,a
        sub     b,a
        move    a,x0
        mac     x0,y1,b
        asl     #1,b,b
        move    b,x:(r0)+
        move    x:(r0),b
        asr     #1,b,b
        move    x1,a
        sub     b,a
        move    a,x0
        mac     x0,y1,b
        asl     #1,b,b
        move    b,x:(r0)+
cmb_frameend:
        nop
        rts

; The amp: in x:(r0) and x:(r0+1), state block at r5; out in a, which the
; caller stores to both sides (its store limits it to full scale).
cmb_chan:
        move    #>$40,n4
        move    r7,r4
        move    (r4)+n4
; Pre high-pass (the voice's KHP): s += KHP (h - s), y = h - s, h = (L + R)/8, the mono sum at quarter scale.
        move    x:(r0),a
        move    x:(r0+1),b
        add     b,a
        asr     #3,a,a
        move    a1,x1
        move    x:(r5+$0),b
        move    x:(r5+$1),b0
        move    x1,a
        move    x:(r5+$0),y0
        sub     y0,a
        move    a,x0
        move    x:(r5+$54),y1
        mac     x0,y1,b
        move    b1,x:(r5+$0)
        move    b0,x:(r5+$1)
        move    x1,a
        move    b1,y0
        sub     y0,a
        move    a,x1
; Pre low-pass: direct form 1, halved coefficients from r4.
        lua     (r5+$2),r3
        move    x1,x0
        move    x:(r4)+,y1
        mpy     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$2),y0
        move    y0,x:(r5+$3)
        move    x1,x:(r5+$2)
        move    x:(r5+$4),y0
        move    y0,x:(r5+$5)
        move    a,x1
        move    x1,x:(r5+$4)
; 2x oversampling: a polyphase half-band (halfband.py), path 0 the even
; coefficients, path 1 the odd ones. Up: both paths take q; path 0 gives the
; first sample at 2x, path 1 the second.
        move    x1,x:(r5+$2a)
; up, path 0, a0
        move    x1,b
        move    x:(r5+$19),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$18),a
        move    #>$0df730,y1
        mac     x0,y1,a
        move    x1,x:(r5+$18)
        move    a,x1
        move    x1,x:(r5+$19)
; up, path 0, a2
        move    x1,b
        move    x:(r5+$1b),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$1a),a
        move    #>$5115c8,y1
        mac     x0,y1,a
        move    x1,x:(r5+$1a)
        move    a,x1
        move    x1,x:(r5+$1b)
        move    x1,x:(r5+$28)
        move    x:(r5+$2a),x1
; up, path 1, a1
        move    x1,b
        move    x:(r5+$1d),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$1c),a
        move    #>$2e49fa,y1
        mac     x0,y1,a
        move    x1,x:(r5+$1c)
        move    a,x1
        move    x1,x:(r5+$1d)
; up, path 1, a3
        move    x1,b
        move    x:(r5+$1f),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$1e),a
        move    #>$705011,y1
        mac     x0,y1,a
        move    x1,x:(r5+$1e)
        move    a,x1
        move    x1,x:(r5+$1f)
; The amp on the second sample: GAIN and the limit (q x drive x 2 * G/256 * 512, plus BIAS, limited at full scale),
; then the voice's curve at quarter scale, CA c - CB c^3 - FB. Out in x1.
        move    x1,x0
        move    x:(r7+$31),y1
        mpy     x0,y1,a
        asl     #9,a,a
        move    x:(r5+$57),x0
        add     x0,a
        move    a,x0
        move    x0,x1
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    x1,y1
        mpy     x0,y1,a
        move    a,x0
        move    x:(r5+$56),y1
        mpy     x0,y1,b
        move    x1,x0
        move    x:(r5+$55),y1
        mpy     x0,y1,a
        sub     b,a
        move    x:(r5+$58),x0
        sub     x0,a
        move    a,x1
        move    x1,x:(r5+$29)
        move    x:(r5+$28),x1
; The amp on the first sample: GAIN and the limit (q x drive x 2 * G/256 * 512, plus BIAS, limited at full scale),
; then the voice's curve at quarter scale, CA c - CB c^3 - FB. Out in x1.
        move    x1,x0
        move    x:(r7+$31),y1
        mpy     x0,y1,a
        asl     #9,a,a
        move    x:(r5+$57),x0
        add     x0,a
        move    a,x0
        move    x0,x1
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    x1,y1
        mpy     x0,y1,a
        move    a,x0
        move    x:(r5+$56),y1
        mpy     x0,y1,b
        move    x1,x0
        move    x:(r5+$55),y1
        mpy     x0,y1,a
        sub     b,a
        move    x:(r5+$58),x0
        sub     x0,a
        move    a,x1
; Down: path 1 takes the first sample, path 0 the second; p = (path 0 + path 1)/2.
; down, path 1, a1
        move    x1,b
        move    x:(r5+$25),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$24),a
        move    #>$2e49fa,y1
        mac     x0,y1,a
        move    x1,x:(r5+$24)
        move    a,x1
        move    x1,x:(r5+$25)
; down, path 1, a3
        move    x1,b
        move    x:(r5+$27),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$26),a
        move    #>$705011,y1
        mac     x0,y1,a
        move    x1,x:(r5+$26)
        move    a,x1
        move    x1,x:(r5+$27)
        move    x1,x:(r5+$28)
        move    x:(r5+$29),x1
; down, path 0, a0
        move    x1,b
        move    x:(r5+$21),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$20),a
        move    #>$0df730,y1
        mac     x0,y1,a
        move    x1,x:(r5+$20)
        move    a,x1
        move    x1,x:(r5+$21)
; down, path 0, a2
        move    x1,b
        move    x:(r5+$23),y0
        sub     y0,b
        move    b,x0
        move    x:(r5+$22),a
        move    #>$5115c8,y1
        mac     x0,y1,a
        move    x1,x:(r5+$22)
        move    a,x1
        move    x1,x:(r5+$23)
        move    x1,a
        move    x:(r5+$28),b
        add     b,a
        asr     #1,a,a
; OUT: p * COMP x LEV x VC / 8 * 16 (VC 1/2 is unity).
        move    a,x0
        move    x:(r7+$39),y1
        mpy     x0,y1,a
        asl     #4,a,a
        move    a,x1
; Tone stack: L = LP(KL), T = LP(KT), the voice's splits; M = T - L, H = p - T; weights w/2, so << 2.
        move    x:(r5+$6),b
        move    x:(r5+$7),b0
        move    x1,a
        move    x:(r5+$6),y0
        sub     y0,a
        move    a,x0
        move    x:(r5+$59),y1
        mac     x0,y1,b
        move    b1,x:(r5+$6)
        move    b0,x:(r5+$7)
        move    x:(r5+$8),b
        move    x:(r5+$9),b0
        move    x1,a
        move    x:(r5+$8),y0
        sub     y0,a
        move    a,x0
        move    x:(r5+$5a),y1
        mac     x0,y1,b
        move    b1,x:(r5+$8)
        move    b0,x:(r5+$9)
        move    x:(r5+$6),x0
        move    x:(r7+$33),y1
        mpy     x0,y1,a
        move    x:(r5+$8),b
        sub     x0,b
        move    b,x0
        move    x:(r7+$35),y1
        mac     x0,y1,a
        move    x1,b
        move    x:(r5+$8),y0
        sub     y0,b
        move    b,x0
        move    x:(r7+$37),y1
        mac     x0,y1,a
        asl     #2,a,a
        move    a,x1
; Cabinet biquad 1: direct form 1, halved coefficients from r4.
        lua     (r5+$a),r3
        move    x1,x0
        move    x:(r4)+,y1
        mpy     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$a),y0
        move    y0,x:(r5+$b)
        move    x1,x:(r5+$a)
        move    x:(r5+$c),y0
        move    y0,x:(r5+$d)
        move    a,x1
        move    x1,x:(r5+$c)
; Cabinet biquad 2: direct form 1, halved coefficients from r4.
        lua     (r5+$e),r3
        move    x1,x0
        move    x:(r4)+,y1
        mpy     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$e),y0
        move    y0,x:(r5+$f)
        move    x1,x:(r5+$e)
        move    x:(r5+$10),y0
        move    y0,x:(r5+$11)
        move    a,x1
        move    x1,x:(r5+$10)
; Cabinet biquad 3: direct form 1, halved coefficients from r4.
        lua     (r5+$12),r3
        move    x1,x0
        move    x:(r4)+,y1
        mpy     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a         x:(r3)+,x0
        move    x:(r4)+,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$12),y0
        move    y0,x:(r5+$13)
        move    x1,x:(r5+$12)
        move    x:(r5+$14),y0
        move    y0,x:(r5+$15)
        move    a,x1
        move    x1,x:(r5+$14)
; DC blocker after the cabinet: s += KDC (u - s), y = u - s (48-bit state).
        move    x:(r5+$16),b
        move    x:(r5+$17),b0
        move    x1,a
        move    x:(r5+$16),y0
        sub     y0,a
        move    a,x0
        move    #>$002ea7,y1
        mac     x0,y1,b
        move    b1,x:(r5+$16)
        move    b0,x:(r5+$17)
        move    x1,a
        move    b1,y0
        sub     y0,a
; Back to half of full scale (MIX doubles it).
        asl     #1,a,a
        rts
