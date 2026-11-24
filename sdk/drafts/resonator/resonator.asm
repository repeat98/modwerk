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
; and cos come from a Taylor kernel.
;
; Input: (L+R)/8 through the TONE one-pole: low-pass below 64, flat at 64,
; high-pass above. Output: modes 0 and 1 centre, 2/4/6 left, 3/5/7 right.
; Every product uses an operand pair dsp_asm encodes as signed mpy/mac.
;
; r7 block, 89 words ($00-$58), all zeroed by init:
;   mode m at 7m: C, S, ul, vl, uh, vh, G      ($00-$37)
;   $38/$3f right sum (low, high)  $39 wet gain  $3a mix  $3b tone state
;   $3c tone k  $3d low-pass weight  $3e direct weight  $40 mode counter
;   per block: $41 PTCH $42 chord row $43 DCAY $44 damping step $45 COLUN
;   $46 SCALE $47 key $48 snap row $49 root note $4a target $4b/$4c search
;   $4d sin $4e cos $4f note $50 mode $51 voice $52 partial $53 type row
;   $54 voice row $55 partial ratio $56 partial level $57 voice theta
;   $58 exciter (read through r3)
; P table (tables.py OFF): NOTE 0, COL 128, R 256, G 384, SEMI 512, CRATIO 568,
; TRATIO 624, TAMP 680, VMAP 736, JMAP 768, TONEK 800, SNAP 928, KERNEL 1048.
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
        move    #>928,x0
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
        move    #>736,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x0
        move    x0,x:(r7+$51)
        move    #>32,n2
        move    (r2)+n2
        move    p:(r2),x0
        move    x0,x:(r7+$52)
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
        move    #>624,x0
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
        move    #>568,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x1
        move    x:(r7+$41),a
        move    #>128,x0
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
        move    #>512,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),b
        move    x:(r7+$49),a
        add     b,a
        bsr     rzsnap
        move    #>0,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),a
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
        move    #>256,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),y1
        move    #>128,n2
        move    (r2)+n2
        move    p:(r2),y0
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
; GAIN: (v/128)^2, so 32 is 0 dB and 127 is +24 dB after the x256 below.
        move    x:(r6+$4),x0
        mpy     x0,x0,a
        move    a,x:(r7+$39)
; MIX m: the dry falls as (1 - m)^2, so the ring takes over well before 127
; (dry -26 dB at 100). k = 2m - m^2 is the wet share. 0 is exact dry
; passthrough, 127 only the ring.
        move    x:(r6+$5),a
        and     #>$7f0000,a
        move    #>$7f0000,x0
        cmp     x0,a
        beq     rzmixfull
        move    a1,x0
        mpy     x0,x0,b
        asl     a
        sub     b,a
        bra     rzmixv
rzmixfull:
        move    #>$7fffff,a
rzmixv:
        move    a1,x:(r7+$3a)
; TONE, slot 3: the exciter one-pole's corner from the table; below 64 its
; low-pass output, above 64 the high-pass (input minus low-pass), 64 flat.
        move    x:(r6+$3),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x1
        move    #>800,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x0
        move    x0,x:(r7+$3c)
        move    #>$7fffff,y0
        clr     b
        move    x1,a
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
; eight guard bits), soft clip, then out = dry + 2*MIX*(wet/2 - dry/2).
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
        move    x:(r0),b
        asr     a
        asr     b
        sub     b,a
        move    a,x0
        move    x:(r7+$3a),y1
        move    x:(r0),b
        mac     x0,y1,b
        mac     x0,y1,b
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
        move    x:(r0),b
        asr     a
        asr     b
        sub     b,a
        move    a,x0
        move    x:(r7+$3a),y1
        move    x:(r0),b
        mac     x0,y1,b
        mac     x0,y1,b
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
        move    #>1048,n2
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
; ratio: binary search for the last entry at or below the target, then the
; next one up if target^2 > lower * upper. Uses a, b, x0, x1, y0, r2, n2.
rzcol:
        clr     a
        move    a1,x:(r7+$4b)
        move    #>$40,a
        move    a1,x:(r7+$4c)
        do      #7,>rzcstep
        move    x:(r7+$4b),a
        move    x:(r7+$4c),x0
        add     x0,a
        move    a1,x1
        move    #>128,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),x0
        move    x:(r7+$4a),b
        cmp     x0,b
        blt     rzcskip
        move    x1,x:(r7+$4b)
rzcskip:
        move    x:(r7+$4c),a
        asr     a
        move    a1,x:(r7+$4c)
rzcstep:
        move    x:(r7+$4b),a
        move    #>$7f,x0
        cmp     x0,a
        beq     rzcpick
        move    #>128,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2)+,x0
        move    p:(r2),y0
        mpy     y0,x0,b
        move    x:(r7+$4a),x0
        mpy     x0,x0,a
        sub     b,a
        ble     rzcpick
        move    x:(r7+$4b),a
        move    #>1,x0
        add     x0,a
        move    a1,x:(r7+$4b)
rzcpick:
        move    x:(r7+$4b),a
        move    #>128,x0
        add     x0,a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2),a
        rts
