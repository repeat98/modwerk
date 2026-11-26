; COMBO -- an amp and speaker cabinet in one insert. Original Modwerk design.
;
; A buffer-free stereo insert for FX1 or FX2: no allocator, no bus role,
; no absolute Y. Both channels run the same chain with their own state:
;   pre high-pass one-pole (90 Hz), pre low-pass biquad (7 kHz, Q 0.707:
;   band-limits what reaches the curve), GAIN (+0 to +38 dB), hard limit at
;   full scale, the curve 0.75c - 0.25c^3 (flat at the limit, so its slope
;   is continuous), then one gain OUT = COMP x LEV (COMP = 1/sqrt(G): more
;   GAIN, not more volume; everything after the curve is linear, so LEV
;   applies here), BASS/MID/TREB as gains of three bands split at 300 Hz and
;   2.2 kHz (all at 64 is exactly flat), CAB (three biquads), a 10 Hz DC
;   blocker (the cabinet's resonant high-pass can freeze a truncated offset).
;
; Fixed point. Everything after the input runs at quarter scale (x/4). The
; one-pole states are 48 bits. The 7 kHz biquad's and the cabinet's
; coefficients come from the P table (tables.py) into X:$40..$53 each call.
;
; Knobs (page 1, value<<16 with an LFO's fraction bits in 8-15):
;   GAIN x:(r6+0): G = ((k+16)/16)^2, stored as G/256 = ((k+16)/256)^2
;   BASS x:(r6+1), MID x:(r6+2), TREB x:(r6+3): band gain k/64, stored k/128
;   CAB  x:(r6+4): 0 OFF, 1 1X10, 2 1X12, 3 2X12, 4 4X12 (above 4 is 4X12)
;   LEV  x:(r6+5): (k/64)^2, 64 is 0 dB. OUT is stored as COMP/2 x (k/128)^2
;        = COMP x LEV / 8 (COMP/2 from the table by GAIN's whole step).
; GAIN, BASS, MID, TREB and OUT glide per sample (1/64 a sample) and snap
; onto their target at the start of a call once within 64 LSB. The first
; call after init starts on the knobs. CAB switches at the start of a call.
;
; State (X, offsets from r7; init clears $00..$5f):
;   channel block, L at $00, R at $18 (r5 points at it in cmb_chan):
;     +0/+1 pre high-pass hi/lo      +2..+5 pre low-pass x1 x2 y1 y2
;     +6/+7 300 Hz split hi/lo       +8/+9 2.2 kHz split hi/lo
;     +a..+d cab biquad 1            +e..+11 cab biquad 2
;     +12..+15 cab biquad 3          +16/+17 DC blocker hi/lo
;   $30/$31 GAIN target/run   $32/$33 BASS   $34/$35 MID   $36/$37 TREB
;   $38/$39 OUT target/run    $3f seeded
;   $40..$44 the 7 kHz biquad, $45..$53 the CAB row (b0 b1 b2 -a1 -a2, halved)
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
        move    #>$ffffff,m2
        move    #>$ffffff,m3
        move    #>$ffffff,m4
        move    #>$ffffff,m5
; GAIN: u = kn/2 + 1/16 = (k+16)/256; u^2 = G/256.
        move    x:(r6+$0),a
        and     #>$7fffff,a
        asr     #1,a,a
        move    #>$080000,x0
        add     x0,a
        move    a1,x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x:(r7+$30)
; BASS, MID, TREB: k/128.
        move    x:(r6+$1),a
        and     #>$7fffff,a
        move    a1,x:(r7+$32)
        move    x:(r6+$2),a
        and     #>$7fffff,a
        move    a1,x:(r7+$34)
        move    x:(r6+$3),a
        and     #>$7fffff,a
        move    a1,x:(r7+$36)
; OUT: COMP/2 (table word 80 + GAIN's whole step) x (k/128)^2.
        move    #>$fab1e0,r2
        move    r2,r3
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    #>80,x0
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
        move    a,x:(r7+$38)
; The 7 kHz biquad (table words 0..4), then CAB's row (5 + 15 CAB).
        move    #>$40,n4
        move    r7,r4
        move    (r4)+n4
        do      #5,>cmb_pre
        move    p:(r2)+,x0
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
        asl     #4,a,a
        sub     b,a
        move    a1,n2
        move    (r2)+n2
        do      #15,>cmb_cab
        move    p:(r2)+,x0
        move    x0,x:(r4)+
cmb_cab:
        nop
; The first call after init starts on the knobs.
        move    x:(r7+$3f),a
        tst     a
        bne     cmb_seeded
        lua     (r7+$30),r4
        do      #5,>cmb_seedcopy
        move    x:(r4)+,x0
        move    x0,x:(r4)+
cmb_seedcopy:
        nop
        move    #>1,x0
        move    x0,x:(r7+$3f)
cmb_seeded:
; A glide within 64 LSB of its target snaps onto it.
        lua     (r7+$30),r4
        do      #5,>cmb_snap
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
        move    r7,r5
        bsr     cmb_chan
        move    a,x:(r0)+
        lua     (r7+$18),r5
        bsr     cmb_chan
        move    a,x:(r0)+
cmb_frameend:
        nop
        rts

; One channel: in x:(r0), state block at r5; out in a (the caller's store
; limits it to full scale).
cmb_chan:
        move    #>$40,n4
        move    r7,r4
        move    (r4)+n4
; Pre high-pass: s += KHP (h - s), y = h - s, h = x/4.
        move    x:(r0),a
        asr     #2,a,a
        move    a1,x1
        move    x:(r5+$0),b
        move    x:(r5+$1),b0
        move    x1,a
        move    x:(r5+$0),y0
        sub     y0,a
        move    a,x0
        move    #>$01a17f,y1
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
; GAIN and the limit: q * G/256 * 1024 = x * G, limited at full scale.
        move    x1,x0
        move    x:(r7+$31),y1
        mpy     x0,y1,a
        asl     #10,a,a
        move    a,x0
; The curve at quarter scale of half: 0.1875 c - 0.0625 c^3.
        move    x0,x1
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    x1,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>$080000,y1
        mpy     x0,y1,b
        move    x1,x0
        move    #>$180000,y1
        mpy     x0,y1,a
        sub     b,a
; OUT: p * COMP x LEV / 8 * 8.
        move    a,x0
        move    x:(r7+$39),y1
        mpy     x0,y1,a
        asl     #3,a,a
        move    a,x1
; Tone stack: L = LP(300 Hz), T = LP(2.2 kHz); M = T - L, H = p - T.
        move    x:(r5+$6),b
        move    x:(r5+$7),b0
        move    x1,a
        move    x:(r5+$6),y0
        sub     y0,a
        move    a,x0
        move    #>$055b15,y1
        mac     x0,y1,b
        move    b1,x:(r5+$6)
        move    b0,x:(r5+$7)
        move    x:(r5+$8),b
        move    x:(r5+$9),b0
        move    x1,a
        move    x:(r5+$8),y0
        sub     y0,a
        move    a,x0
        move    #>$22711c,y1
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
        asl     #1,a,a
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
; Back to full scale.
        asl     #2,a,a
        rts
