; Resonator: four tuned modes ringing at a note or a Colundi frequency.
; A stereo FX1/FX2 insert. No shared buffers; all state is private to r7.
;
; Each mode is a coupled-form (rotation) resonator: u' = C*u - S*v + G*in,
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
; Input: (L+R)/2. Output: mode 0 and 3 centre, mode 1 left, mode 2 right.
; Every product uses an operand pair dsp_asm encodes as signed mpy/mac.
;
; r7 block, 37 words ($00-$24), all zeroed by init:
;   $00-$0f  mode k state: uh 4k, ul 4k+1, vh 4k+2, vl 4k+3
;   $10-$1b  mode k coefficients: C 3k+$10, S 3k+$11, G 3k+$12
;   $1c mono input   $1d wet gain   $1e mix
;   $20 pitch index  $21 interval   $22 decay index  $23 damp step  $24 damp sum
; The P table (tables.py): NOTE pitches +0, COLUNDI +$100, radii +$200,
; input gains +$280.
init:
        clr     a
        move    r7,r5
        move    #>$ffffff,m5
        do      #>37,>rzwipe
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
        move    r5,r4
        move    #>$200,n4
        move    (r4)+n4
; TUNE, slot 6: 0 NOTE, anything else COLUNDI.
        move    x:(r6+$c),a
        and     #>$7f0000,a
        tst     a
        beq     rztnote
        move    #>$100,n5
        move    (r5)+n5
rztnote:
; Page-1 knobs as integers 0..127 (LFO fraction bits dropped).
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$20)
        move    x:(r6+$1),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$21)
        move    x:(r6+$2),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,x:(r7+$22)
        move    x:(r6+$3),a
        and     #>$7f0000,a
        asr     #$12,a,a
        move    a1,x:(r7+$23)
        clr     a
        move    a,x:(r7+$24)
; Mode k: pitch index PTCH + k*INTV (at most 127), decay index
; DCAY - k*(DAMP/4) (at least 0). C = r cos, S = r sin, G from the decay.
        move    r7,r3
        move    #>$10,n3
        move    (r3)+n3
        do      #4,>rzcoef
        move    x:(r7+$20),a
        move    #>$7f,x0
        cmp     x0,a
        tgt     x0,a
        asl     a
        move    a1,n2
        move    r5,r2
        move    (r2)+n2
        move    p:(r2)+,x0
        move    p:(r2),x1
        move    x:(r7+$22),a
        move    x:(r7+$24),b
        sub     b,a
        bge     rzdkpos
        clr     a
rzdkpos:
        move    a1,n2
        move    r4,r2
        move    (r2)+n2
        move    p:(r2),y1
        move    #>$80,n2
        move    (r2)+n2
        move    p:(r2),y0
        mpyr    x0,y1,a
        move    a,x:(r3)+
        mpyr    y1,x1,b
        move    b,x:(r3)+
        move    y0,x:(r3)+
        move    x:(r7+$20),a
        move    x:(r7+$21),x0
        add     x0,a
        move    a1,x:(r7+$20)
        move    x:(r7+$24),a
        move    x:(r7+$23),x0
        add     x0,a
        move    a1,x:(r7+$24)
rzcoef:
        nop
; INTV 0 is one resonance: modes 1-3 take no input and ring out.
        move    x:(r7+$21),a
        tst     a
        bne     rzspread
        clr     a
        move    a,x:(r7+$15)
        move    a,x:(r7+$18)
        move    a,x:(r7+$1b)
rzspread:
; GAIN: (v/128)^2, so 32 is 0 dB and 127 is +24 dB after the x256 below.
        move    x:(r6+$4),x0
        mpy     x0,x0,a
        move    a,x:(r7+$1d)
; MIX: 0 is exact dry passthrough, 127 fully wet.
        move    x:(r6+$5),a
        and     #>$7f0000,a
        move    #>$7f0000,x0
        cmp     x0,a
        bne     rzmixv
        move    #>$7fffff,a
rzmixv:
        move    a1,x:(r7+$1e)

        move    #>$1,n0
        do      n7,>rzframe
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$1c)
; ---- mode 0
        move    x:(r7+$10),y1
        move    x:(r7+$11),y0
        move    x:(r7+$01),x0
        move    x:(r7+$03),x1
        mpy     x0,y1,a
        mac     -x1,y0,a
        mpy     y0,x0,b
        mac     y1,x1,b
        asr     #$18,a,a
        asr     #$18,b,b
        move    x:(r7+$00),x0
        move    x:(r7+$02),x1
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b
        mac     y1,x1,b
        move    x:(r7+$1c),x0
        move    x:(r7+$12),x1
        mac     x1,x0,a
        move    a0,x:(r7+$01)
        move    b0,x:(r7+$03)
        move    #0,x1
        move    #$80,x0
        add     x,a
        add     x,b
        move    a,x:(r7+$00)
        move    b,x:(r7+$02)
; ---- mode 1
        move    x:(r7+$13),y1
        move    x:(r7+$14),y0
        move    x:(r7+$05),x0
        move    x:(r7+$07),x1
        mpy     x0,y1,a
        mac     -x1,y0,a
        mpy     y0,x0,b
        mac     y1,x1,b
        asr     #$18,a,a
        asr     #$18,b,b
        move    x:(r7+$04),x0
        move    x:(r7+$06),x1
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b
        mac     y1,x1,b
        move    x:(r7+$1c),x0
        move    x:(r7+$15),x1
        mac     x1,x0,a
        move    a0,x:(r7+$05)
        move    b0,x:(r7+$07)
        move    #0,x1
        move    #$80,x0
        add     x,a
        add     x,b
        move    a,x:(r7+$04)
        move    b,x:(r7+$06)
; ---- mode 2
        move    x:(r7+$16),y1
        move    x:(r7+$17),y0
        move    x:(r7+$09),x0
        move    x:(r7+$0b),x1
        mpy     x0,y1,a
        mac     -x1,y0,a
        mpy     y0,x0,b
        mac     y1,x1,b
        asr     #$18,a,a
        asr     #$18,b,b
        move    x:(r7+$08),x0
        move    x:(r7+$0a),x1
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b
        mac     y1,x1,b
        move    x:(r7+$1c),x0
        move    x:(r7+$18),x1
        mac     x1,x0,a
        move    a0,x:(r7+$09)
        move    b0,x:(r7+$0b)
        move    #0,x1
        move    #$80,x0
        add     x,a
        add     x,b
        move    a,x:(r7+$08)
        move    b,x:(r7+$0a)
; ---- mode 3
        move    x:(r7+$19),y1
        move    x:(r7+$1a),y0
        move    x:(r7+$0d),x0
        move    x:(r7+$0f),x1
        mpy     x0,y1,a
        mac     -x1,y0,a
        mpy     y0,x0,b
        mac     y1,x1,b
        asr     #$18,a,a
        asr     #$18,b,b
        move    x:(r7+$0c),x0
        move    x:(r7+$0e),x1
        mac     x0,y1,a
        mac     -x1,y0,a
        mac     y0,x0,b
        mac     y1,x1,b
        move    x:(r7+$1c),x0
        move    x:(r7+$1b),x1
        mac     x1,x0,a
        move    a0,x:(r7+$0d)
        move    b0,x:(r7+$0f)
        move    #0,x1
        move    #$80,x0
        add     x,a
        add     x,b
        move    a,x:(r7+$0c)
        move    b,x:(r7+$0e)
; ---- left: modes 0, 1, 3. Gain x256 in two limited steps of x16, so the
; accumulator never leaves its eight guard bits.
        move    x:(r7+$1d),y1
        move    x:(r7+$00),x0
        mpy     x0,y1,a
        move    x:(r7+$04),x0
        mac     x0,y1,a
        move    x:(r7+$0c),x0
        mac     x0,y1,a
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
; out = dry + 2*MIX*(wet/2 - dry/2): MIX 0 leaves the dry sample untouched.
        move    x:(r0),b
        asr     a
        asr     b
        sub     b,a
        move    a,x0
        move    x:(r7+$1e),y1
        move    x:(r0),b
        mac     x0,y1,b
        mac     x0,y1,b
        move    b,x:(r0)+
; ---- right: modes 0, 2, 3.
        move    x:(r7+$1d),y1
        move    x:(r7+$00),x0
        mpy     x0,y1,a
        move    x:(r7+$08),x0
        mac     x0,y1,a
        move    x:(r7+$0c),x0
        mac     x0,y1,a
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
        move    x:(r7+$1e),y1
        move    x:(r0),b
        mac     x0,y1,b
        mac     x0,y1,b
        move    b,x:(r0)+
rzframe:
        nop
        rts
