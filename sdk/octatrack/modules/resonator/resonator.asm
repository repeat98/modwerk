; Resonator: eight tuned partials, shared by one to four voices. A voice
; rings at a chord note, a scale note or a Colundi frequency; TYPE gives it a
; body (its partials' ratios and levels). A stereo FX1/FX2 insert; no shared
; buffers, all state private to r7.
;
; Each partial is a coupled-form (rotation) resonator: u' = C*u - S*v + G*in,
; v' = S*u + C*v, with C = r cos w and S = r sin w. Its pitch is exactly
; atan2(S, C), so a p-locked pitch or decay jumps without a transient.
; The state is kept in double precision: hi, rounded to 24 bits, and lo,
; the signed 24-bit remainder (the accumulator's a0), so a ten-second tail
; decays to silence instead of sticking in the 24-bit dead band (#2047
; measured that failure on a 24-bit state). A rounded hi reads zero once the
; state is below half an LSB, so the output ends in digital silence.
; The state holds the signal at 1/16 for 24 dB of headroom; the output
; stage restores it and soft-clips the wet signal (x - x^3/3).
;
; Mode m belongs to voice m mod VOIC as its partial m div VOIC. The main
; call of each block (a != 0) retunes one mode, in turn, so a change
; settles within eight blocks (2.9 ms) and the split call before a trig
; (a = 0) costs nothing extra. A voice's note is the root plus its chord
; offset, snapped into SCALE's key, or snapped to the nearest Colundi
; frequency with COLUN on; the partial multiplies it by TYPE's ratio. sin
; and cos come from a Taylor kernel. A note's theta is its top-octave twin's
; (48 bits in the table) shifted down by octaves; decay, input gain and TONE
; interpolate linearly between every fourth value (tables.py).
;
; Input: (L+R)/8 through the TONE one-pole: low-pass below 64, flat at 64,
; high-pass above. Output: modes 0 and 1 centre, 2/4/6 left, 3/5/7 right,
; mixed at constant power: dry (1 - MIX)^2, ring sqrt(1 - dry^2).
; Every product uses an operand pair dsp_asm encodes as signed mpy/mac.
;
; r7 block, 89 words ($00-$58), all zeroed by init:
;   mode m at 7m: C, S, ul, vl, uh, vh, G      ($00-$37)
;   $38/$3f right sum (low, high)  $39 wet gain  $3a ring's mix gain  $3b tone state
;   $3c tone k  $3d low-pass weight  $3e direct weight  $40 mode counter
;   per block: $41 PTCH $42 chord row $43 DCAY $44 damping step $45 COLUN
;   $46 SCALE $47 key $48 snap row $49 root note $4a target $4b unused
;   $4c the dry's mix gain minus 1 $4d sin $4e cos $4f note
;   (also rzlerp's index) $50 mode $51 voice $52 partial $53 type row
;   $54 voice row $55 partial ratio $56 partial level $57 voice theta
;   $58 exciter (read through r3)
; P table (tables.py OFF): NOTE 0 (note 127 first), COL 24, R 152, G 185, SEMI 218, CRATIO 274,
; TRATIO 330, TAMP 386, VJ 442, TONEK 474, SNAP 508, KERNEL 628, WMIX 634.
init:
        clr     a
        move    r7,r5
        move    #>$ffffff,m5
        do      #>89,>rzwipe
        move    a,x:(r5)+
rzwipe:
        nop
        rts

proc:
        move    #>$ffffff,m2
        move    #>$ffffff,m3
        move    #>$ffffff,m4
        move    #>$ffffff,m5
        move    #>$fab1e0,r5
        tst     a
        beq     rzaudio
; ---- main call: knobs to integers (LFO fraction bits dropped)
; TONE, slot 3: the exciter one-pole's corner, interpolated from the table
; (the high-pass points follow the low-pass ones' 64); below 64 its low-pass
; output, above 64 the high-pass (input minus low-pass), 64 flat. Set here,
; so a split call keeps the last block's, as it keeps the tuning.
        move    x:(r6+$3),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$4f)
        move    #>474,x0
        move    #>64,y1
        cmp     y1,a
        blt     rztk
        move    #>475,x0
rztk:
        bsr     rzlerp
        move    a,x:(r7+$3c)
        move    #>$7fffff,y0
        clr     b
        move    x:(r7+$4f),a
        move    #>64,x0
        cmp     x0,a
        blt     rztlow
        move    y0,x:(r7+$3e)
        beq     rztflat
        move    #>$800000,y1
        move    y1,x:(r7+$3d)
        bra     rztdone
rztflat:
        move    b,x:(r7+$3d)
        bra     rztdone
rztlow:
        move    y0,x:(r7+$3d)
        move    b,x:(r7+$3e)
rztdone:
; MIX m = v/128, at constant power: the dry falls as d = (1 - m)^2 (-26 dB
; at 100), the ring rises as sqrt(1 - d^2), interpolated from the table.
; $4c = d - 1 = m^2 - 2m, exactly -1 at 127 (only the ring); at 0 both
; products are zero, so the dry passes bit for bit.
        move    x:(r6+$5),a
        and     #>$7f0000,a
        move    a1,y1
        asr     #$10,a,a
        move    a1,x:(r7+$4f)
        move    #>634,x0
        bsr     rzlerp
        move    a,x:(r7+$3a)
        move    y1,x0
        mpy     x0,x0,b
        move    x0,a
        asl     a
        sub     a,b
        move    x0,a
        move    #>$7f0000,y0
        cmp     y0,a
        move    #>$800000,y0
        teq     y0,b
        move    b,x:(r7+$4c)
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$41)
        move    x:(r6+$1),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>13,x0
        cmp     x0,a
        tgt     x0,a
        asl     #$2,a,a
        move    a1,x:(r7+$42)
        move    x:(r6+$2),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$43)
; Damping: each partial above a voice's first rings 4 decay steps shorter
; than the one below (a fixed, gentle damping; DCAY sets the rest).
        move    #>4,x0
        move    x0,x:(r7+$44)
; COLUN, slot 6 (knob field of $c): nonzero is on.
        move    x:(r6+$c),a
        and     #>$7f0000,a
        move    a1,x:(r7+$45)
; TYPE, slot 7 (companion field of $c).
        move    x:(r6+$c),a
        and     #>$007f00,a
        asr     #$8,a,a
        move    #>6,x0
        cmp     x0,a
        tgt     x0,a
        asl     #$3,a,a
        move    a1,x:(r7+$53)
; VOIC, slot 8 (knob field of $d): 0..3 is one to four voices.
        move    x:(r6+$d),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>3,x0
        cmp     x0,a
        tgt     x0,a
        asl     #$3,a,a
        move    a1,x:(r7+$54)
; SCALE, slot 9 (companion field of $d): 0 off, else s = v - 1, key = s / 10,
; scale = s mod 10.
        move    x:(r6+$d),a
        and     #>$007f00,a
        asr     #$8,a,a
        move    a1,x:(r7+$46)
        tst     a
        beq     rzscoff
        move    #>1,x0
        sub     x0,a
        move    #>119,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,x1
        move    #>$0ccccd,y0
        mpy     x1,y0,b
        move    b1,x:(r7+$47)
        move    b1,x0
        move    x0,b
        asl     b
        move    b1,y1
        asl     #$2,b,b
        add     y1,b
        move    x1,a
        sub     b,a
        asl     #$2,a,a
        move    a1,y1
        asl     a
        add     y1,a
        move    #>508,x0
        add     x0,a
        move    a1,x:(r7+$48)
rzscoff:
        move    x:(r7+$41),a
        bsr     rzsnap
        move    a1,x:(r7+$49)
; This block's mode m, its voice and partial, and its slot r3 = r7 + 7m.
        move    x:(r7+$40),a
        move    #>1,x0
        add     x0,a
        and     #>$7,a
        move    a1,x:(r7+$40)
        move    a1,x:(r7+$50)
        move    x:(r7+$50),a
        move    x:(r7+$54),x0
        add     x0,a
        move    #>442,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),a
        tfr     a,b
        and     #>$7,a
        move    a1,x:(r7+$52)
        asr     #$3,b,b
        move    b1,x:(r7+$51)
        move    x:(r7+$50),a
        move    a1,x0
        asl     #$3,a,a
        sub     x0,a
        move    a1,n3
        move    r7,r3
        move    (r3)+n3
; The partial's ratio and level from TYPE; ratio 0 leaves it out.
        move    x:(r7+$53),a
        move    x:(r7+$52),x0
        add     x0,a
        move    #>330,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x0
        move    x0,x:(r7+$55)
        move    #>56,n2
        move    (r2)+n2
        move    p:(r2),x0
        move    x0,x:(r7+$56)
        move    x:(r7+$55),a
        tst     a
        beq     rzmute
        move    x:(r7+$45),a
        tst     a
        beq     rznote
; COLUN: the Colundi frequency nearest to the root times the voice's ratio.
        move    x:(r7+$42),a
        move    x:(r7+$51),x0
        add     x0,a
        move    #>274,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x1
        move    x:(r7+$41),a
        move    #>24,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),y0
        mpy     x1,y0,a
        asl     #$5,a,a
        move    a,x:(r7+$4a)
        bsr     rzcol
        bra     rzvoice
; A note: root + the voice's chord offset, into SCALE's key.
rznote:
        move    x:(r7+$42),a
        move    x:(r7+$51),x0
        add     x0,a
        move    #>218,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),b
        move    x:(r7+$49),a
        add     b,a
        bsr     rzsnap
        bsr     rzntheta
rzvoice:
        move    a,x:(r7+$57)
; The partial: the voice's theta times TYPE's ratio. Above 0.9 (about
; 19.8 kHz) it takes no input and rings out.
        move    x:(r7+$57),y0
        move    x:(r7+$55),x1
        mpy     x1,y0,a
        asl     #$5,a,a
        move    #>$733333,x0
        cmp     x0,a
        bge     rzmute
        move    #>$400000,x0
        cmp     x0,a
        bgt     rzhigh
        move    a1,x:(r7+$4a)
        move    a1,x0
        bsr     rzsin
        move    a,x:(r7+$4d)
        move    #>$400000,a
        move    x:(r7+$4a),x0
        sub     x0,a
        move    a1,x0
        bsr     rzsin
        move    a,x:(r7+$4e)
        bra     rzcoef
; theta above 1/2: sin = sin(pi (1 - theta)), cos = -sin(pi (theta - 1/2)).
rzhigh:
        move    a1,x:(r7+$4a)
        move    #>$400000,x0
        sub     x0,a
        move    a1,x0
        bsr     rzsin
        neg     a
        move    a,x:(r7+$4e)
        move    #>$400000,a
        move    x:(r7+$4a),x0
        sub     x0,a
        move    #>$400000,x0
        add     x0,a
        move    a1,x0
        bsr     rzsin
        move    a,x:(r7+$4d)
rzcoef:
; Decay index DCAY - partial * 4, at least 0; partial * step read from a0
; (the integer product, doubled by mpy's alignment, then halved).
        move    x:(r7+$52),x0
        move    x:(r7+$44),y0
        mpy     y0,x0,a
        move    a0,x0
        move    x0,a
        asr     a
        move    a1,x0
        move    x:(r7+$43),a
        sub     x0,a
        bge     rzdpos
        clr     a
rzdpos:
        move    a1,x:(r7+$4f)
        bsr     rzdecay
        move    x:(r7+$4e),x0
        mpyr    x0,y1,a
        move    a,x:(r3)+
        move    x:(r7+$4d),x0
        mpyr    x0,y1,a
        move    a,x:(r3)+
        move    x:(r7+$56),x0
        mpyr    y0,x0,a
        move    #>4,n3
        move    (r3)+n3
        move    a,x:(r3)
        bra     rzaudio
; A partial TYPE leaves out keeps C and S and rings down at its last pitch.
rzmute:
        clr     a
        move    #>6,n3
        move    (r3)+n3
        move    a,x:(r3)
rzaudio:
; GAIN: v/512 here, v/32 after the x256 below and the state's 1/16: 0
; silences the ring, 32 is 0 dB, 127 is +12 dB (the soft clip is reached
; less, so it aliases less).
        move    x:(r6+$4),a
        asr     #$2,a,a
        move    a,x:(r7+$39)
        move    #>$1,n0
        move    #>4,n5
        move    #>7,n2
        move    r7,r3
        move    #>$58,n3
        move    (r3)+n3
        do      n7,>rzframe
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     #$3,a,a
        move    a,x1
        move    x:(r7+$3b),b
        sub     b,a
        move    a,x0
        move    x:(r7+$3c),y1
        mpy     x0,y1,a
        add     b,a
        move    a,x:(r7+$3b)
        move    a,y0
        move    x:(r7+$3d),y1
        mpy     y1,y0,a
        move    x:(r7+$3e),y1
        mac     y1,x1,a
        move    a,x:(r3)
        move    r7,r4
        lua     (r7+$2),r5
; ---- mode 0
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 1
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 2
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 3
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 4
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 5
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 6
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- mode 7
        move    x:(r4)+,y1
        move    x:(r4)+,y0
        move    x:(r4)+,x0
        mpy     x0,y1,a     x:(r4)+,x1
        mac     -x1,y0,a
        mpy     y0,x0,b     x:(r4)+,x0
        mac     y1,x1,b     x:(r4)+,x1
        asr     #$18,a,a
        asr     #$18,b,b
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b     x:(r3),x0
        mac     y1,x1,b     x:(r4)+,y1
        mac     x0,y1,a
        move    a0,x:(r5)+
        rnd     a           b0,x:(r5)+
        rnd     b           a,x:(r5)+
        move    b,x:(r5)+n5
; ---- both sums at once: left takes modes 0,1,2,4,6, right 0,1,3,5,7.
        move    x:(r7+$39),y1
        lua     (r7+$4),r2
        move    x:(r2)+n2,x0
        mpy     x0,y1,a     x:(r2)+n2,x1
        mpy     x0,y1,b
        mac     y1,x1,a     x:(r2)+n2,x0
        mac     y1,x1,b
        mac     x0,y1,a     x:(r2)+n2,x1
        mac     y1,x1,b     x:(r2)+n2,x0
        mac     x0,y1,a     x:(r2)+n2,x1
        mac     y1,x1,b     x:(r2)+n2,x0
        mac     x0,y1,a     x:(r2)+n2,x1
        mac     y1,x1,b
        move    b,x:(r7+$3f)
        move    b0,x:(r7+$38)
; ---- left: gain x256 in two limited steps of x16 (the accumulator keeps its
; eight guard bits), soft clip, then out = dry + ring*wet + (d - 1)*dry.
        asl     #$4,a,a
        move    a,x0
        move    x0,a
        asl     #$4,a,a
        move    a,x0
        mpy     x0,x0,a
        move    a,x1
        mpy     x1,x0,a
        move    a,y0
        move    #>$2aaaab,y1
        move    x0,a
        mac     -y1,y0,a
        move    a,x0
        move    x:(r0),x1
        move    x1,b
        move    x:(r7+$3a),y1
        mac     x0,y1,b
        move    x:(r7+$4c),y0
        mac     x1,y0,b
        move    b,x:(r0)+
; ---- right, its sum restored to 48 bits like the left's
        move    x:(r7+$3f),a
        move    x:(r7+$38),a0
        asl     #$4,a,a
        move    a,x0
        move    x0,a
        asl     #$4,a,a
        move    a,x0
        mpy     x0,x0,a
        move    a,x1
        mpy     x1,x0,a
        move    a,y0
        move    #>$2aaaab,y1
        move    x0,a
        mac     -y1,y0,a
        move    a,x0
        move    x:(r0),x1
        move    x1,b
        move    x:(r7+$3a),y1
        mac     x0,y1,b
        move    x:(r7+$4c),y0
        mac     x1,y0,b
        move    b,x:(r0)+
rzframe:
        nop
        rts

; a1 = note (>= 0) -> a1 = the nearest note of SCALE's key (ties go down),
; clamped to 0..127. Uses a, b, x0, x1, y0, y1, r2, n2.
rzsnap:
        move    x:(r7+$46),b
        tst     b
        beq     rzsnlim
        move    a1,x:(r7+$4f)
        move    x:(r7+$47),x0
        sub     x0,a
        move    #>12,x0
        add     x0,a
        move    a1,x1
        move    #>$0aaaab,y0
        mpy     x1,y0,b
        move    b1,x0
        move    x0,b
        asl     #$2,b,b
        move    b1,y1
        asl     b
        add     y1,b
        move    x1,a
        sub     b,a
        move    x:(r7+$48),x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x0
        move    x:(r7+$4f),a
        add     x0,a
rzsnlim:
        tst     a
        bge     rzsnpos
        clr     a
rzsnpos:
        move    #>$7f,x0
        cmp     x0,a
        tgt     x0,a
        rts

; x0 = t, 0 <= t <= 1/2 -> a = sin(pi t) = t * P(t^2), Horner on P/8.
; Uses a, x0, x1, y0, y1, r2, n2.
rzsin:
        move    x0,x1
        mpy     x0,x0,a
        move    a,y0
        move    #>628,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2)+,y1
        mpyr    y1,y0,a
        move    p:(r2)+,x0
        add     x0,a
        move    a,y1
        mpyr    y1,y0,a
        move    p:(r2)+,x0
        add     x0,a
        move    a,y1
        mpyr    y1,y0,a
        move    p:(r2)+,x0
        add     x0,a
        move    a,y1
        mpyr    y1,y0,a
        move    p:(r2)+,x0
        add     x0,a
        move    a,y1
        mpyr    y1,y0,a
        move    p:(r2)+,x0
        add     x0,a
        move    a,y1
        mpy     y1,x1,a
        asl     #$3,a,a
        rnd     a
        rts

; target theta at $4a -> a = the theta of the nearest Colundi frequency, by
; ratio: binary search for the last entry at or below the target (r4 walks
; the table, a holds the step, the next one written to n4 an instruction
; before it is used), then the next one up if target^2 > lower * upper.
; Uses a, b, x0, y0, r4, n4 (free outside the sample loop).
rzcol:
        move    #>24,n4
        move    r5,r4
        move    (r4)+n4
        move    x:(r7+$4a),b
        move    #>$40,a
        do      #7,>rzcstep
        move    a1,n4
        asr     a
        move    p:(r4+n4),x0
        cmp     x0,b
        blt     rzcskip
        move    (r4)+n4
rzcskip:
        nop
rzcstep:
; Entry 127 has no next one up (the table's SEMI follows).
        move    r4,a
        move    r5,x0
        sub     x0,a
        move    #>151,x0
        cmp     x0,a
        beq     rzcpick
        move    p:(r4)+,x0
        move    p:(r4)-,y0
        mpy     y0,x0,b
        move    x:(r7+$4a),x0
        mpy     x0,x0,a
        sub     b,a
        ble     rzcpick
        move    (r4)+
rzcpick:
        move    p:(r4),a
        rts

; a1 = note 0..127 -> a = its theta. With k, r = divmod(127 - note, 12): the
; 48-bit theta of note 127 - r (table words 2r, high first) shifted right k
; times, then rounded: exactly the 24-bit theta of the note.
; Uses a, b, x0, x1, y0, y1, r2, n2.
rzntheta:
        move    a1,x0
        move    #>127,a
        sub     x0,a
        move    a1,x1
        move    #>$0aaaab,y0
        mpy     x1,y0,b
        move    b1,y1
        move    b1,x0
        move    x0,b
        asl     #$2,b,b
        move    b1,y0
        asl     b
        add     y0,b
        move    x1,a
        sub     b,a
        asl     a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2)+,a
        move    p:(r2),a0
        asr     y1,a,a
        rnd     a
        rts

; $4f = d (0..127) -> y1 = R, y0 = G at d: each point d div 4 plus (d mod 4)
; quarters of the step to the next, rounded (rzlerp's sum, both tables in one
; pass: G is 33 words after R). Uses a, b, x0, x1, y0, y1, r2, n2.
rzdecay:
        move    x:(r7+$4f),a
        and     #>$3,a
        asl     #$15,a,a
        move    a1,x1
        move    x:(r7+$4f),a
        asr     #$2,a,a
        move    #>152,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    #>32,n2
        move    p:(r2)+,b
        move    p:(r2)+n2,a
        sub     b,a
        move    a,x0
        mpy     x1,x0,a
        add     b,a
        rnd     a
        move    a,y1
        move    p:(r2)+,b
        move    p:(r2),a
        sub     b,a
        move    a,x0
        mpy     x1,x0,a
        add     b,a
        rnd     a
        move    a,y0
        rts

; $4f = v (0..127), x0 = a table's offset -> a = point v div 4 plus (v mod 4)
; quarters of the step to the next, rounded. Uses a, b, x0, x1, r2, n2.
rzlerp:
        move    x:(r7+$4f),a
        asr     #$2,a,a
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2)+,b
        move    p:(r2),a
        sub     b,a
        move    a,x0
        move    x:(r7+$4f),a
        and     #>$3,a
        asl     #$15,a,a
        move    a1,x1
        mpy     x1,x0,a
        add     b,a
        rnd     a
        rts
