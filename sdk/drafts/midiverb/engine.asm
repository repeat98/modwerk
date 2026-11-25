; Midiverb: the Alesis Midiverb's programs on the Octatrack's DSP.
; The original runs 128 steps a sample over 16K words; generate.mjs turns each
; program into delay lines packed into this slot's ring and into the words in
; our P table. Every word in the ring is stored already halved, with the
; original's rounding (half(x) = floor(x/2) + [x<0]), so a read is a plain add
; and the state stays bit-exact. Values are 16-bit, left-aligned in 24 bits
; (the low 8 bits zero), so 16-bit wrapping is free in a1.
;
; Half rate: a program sample every second frame (22.05 kHz), its input the
; average of the last two frames' L and R, its output interpolated linearly.
; Own 16K allocator buffer: a 15,614-word ring (m = $3cfd), then the selected
; program's words at +$3cfe..+$3dfd, copied from the P table when PROG changes.
; The slot's last $202 words, Sidechain's key window on T3 and T7, stay untouched.
;
; State, r7+: 00 base  01 ring pointer  02 clear counter  03 phase
; 04 acc  05 first frame's (L+R)/2  06/07 previous out L/R  08/09 current L/R
; 0a program  0b/0c this run's out L/R  0d mix  0e level  0f half(input)
; Program words: units [handler*2][argument]; a run of reads is [0][k] then k
; ring offsets; the handlers are the jump table's order below. The P table:
; an index of program starts, each program its word count, then its words.

init:
        move    #>$ffffff,m4
        move    r7,r4
        clr     a
        do      #32,>mvqZERO
        move    a,x:(r4)+
mvqZERO:
        nop
        move    x:>$213,r4
        move    x:(r4),a
        move    a,x:(r7+$00)
        move    a,x:(r7+$01)
        move    #>$ffffff,a
        move    a,x:(r7+$0a)            ; no program yet: the first call arms a clear
        rts

proc:
; Bounded clearing: 128 calls, the last 122 clear 128 words each under the
; ring's modulus (the program area above it is kept). Audio passes untouched.
        move    x:(r7+$02),a
        tst     a
        beq     mvqREDY
        sub     #>$1,a
        move    a,x:(r7+$02)
        cmp     #>$00007a,a
        bge     mvqCLRX
        asl     #$7,a,a
        move    x:(r7+$00),x0
        add     x0,a
        move    a,r4
        move    #>$3cfd,m4
        clr     a
        do      #128,>mvqCLR_
        move    a,y:(r4)+
mvqCLR_:
        nop
        move    #>$ffffff,m4
mvqCLRX:
        rts

mvqREDY:
; PROG: a new program is copied into the buffer and the ring cleared first.
        move    #>$ffffff,m4
        move    #>$ffffff,m1
        move    x:(r6),a
        asr     #$10,a,a
        move    a1,x0                   ; the knob's index, its fraction dropped
        move    x0,a
        cmp     #>$17,a                 ; 24 programs: 0..23
        ble     mvqPRGA
        move    #>$17,a
mvqPRGA:
        move    x:(r7+$0a),x0
        cmp     x0,a
        beq     mvqPRGB
        move    a,x:(r7+$0a)
        move    #>$fab1e0,r4
        move    a,n4
        move    #>$3cfe,a
        move    x:(r7+$00),x0
        add     x0,a
        lua     (r4+n4),r2
        move    a,r3
        move    p:(r2),n4
        move    #>$ffffff,m3
        move    (r4)+n4
        move    p:(r4)+,n2              ; the program's word count
        do      n2,>mvqCOPY
        move    p:(r4)+,x0
        move    x0,y:(r3)+
mvqCOPY:
        clr     a
        move    a,x:(r7+$03)
        move    a,x:(r7+$04)
        move    a,x:(r7+$06)
        move    a,x:(r7+$07)
        move    a,x:(r7+$08)
        move    a,x:(r7+$09)
        move    x:(r7+$00),a
        move    a,x:(r7+$01)
        move    #>$80,a
        move    a,x:(r7+$02)
        rts
mvqPRGB:
; MIX (F): 127 is full wet. LEVL (B): k/32, unity at 32.
        move    x:(r6+$5),a
        move    #>$7f0000,x0
        cmp     x0,a
        bne     mvqMIXA
        move    #>$7fffff,a
mvqMIXA:
        move    a,x:(r7+$0d)
        move    x:(r6+$1),a
        move    a,x:(r7+$0e)

        move    #>$3cfd,m5
        move    x:(r7+$01),r5
        move    #>$000100,y0            ; one 16-bit LSB, left-aligned
        move    #>$1,n0
        do      n7,>mvqSMPE
        move    x:(r7+$03),a
        tst     a
        bne     mvqFRMB
; Frame A: keep (L+R)/2; the output is halfway between the last two program samples.
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$05)
        move    #>$1,a
        move    a,x:(r7+$03)
        move    x:(r7+$06),a
        move    x:(r7+$08),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$0b)
        move    x:(r7+$07),a
        move    x:(r7+$09),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$0c)
        bra     mvqMIX_

; Frame B: one program sample.
mvqFRMB:
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     a
        move    x:(r7+$05),x0
        add     x0,a
        asr     a
        move    a,x0                    ; the average of four
        move    x:(r7+$0e),y1
        mpy     x0,y1,a                 ; times LEVL k/128
        asl     #$2,a,a                 ; times 4: k/32
        move    a,x1                    ; the converter clips at full scale
        move    x1,b
        asr     #$3,b,b
        and     #>$fffe00,b             ; 13 bits, the 12-bit converter's clear LSB
        asr     b
        and     #>$ffff00,b
        bpl     mvqHIN_
        add     y0,b
mvqHIN_:
        move    b,x:(r7+$0f)
        move    #>$3cfe,a
        move    x:(r7+$00),x0
        add     x0,a
        move    a,r4                    ; the program's words
        move    #>mvqJTAB,r1
        move    x:(r7+$04),a            ; acc
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)

mvqJTAB:
        bra     >mvqRUN_
        bra     >mvqST__
        bra     >mvqLD__
        bra     >mvqSTN_
        bra     >mvqIN__
        bra     >mvqOUTR
        bra     >mvqOUTL
        bra     >mvqSTR_
        bra     >mvqSTL_
        bra     >mvqSNR_
        bra     >mvqSNL_
        bra     >mvqEND_

; A run of reads, n5 of them: acc += word. The last parallel fetch takes the
; next unit's handler word.
mvqRUN_:
        move    n5,n2
        move    y:(r4)+,n5
        do      n2,>mvqRUNE
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqRUNE:
        move    n5,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
; word = half(acc), acc += word
mvqST__:
        move    a1,x1
        move    x1,b
        asr     b
        and     #>$ffff00,b
        bpl     mvqH1__
        add     y0,b
mvqH1__:
        move    b,y:(r5+n5)
        move    x1,a
        add     b,a             y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqLD__:
        move    y:(r5+n5),a
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
; word = half(~acc), acc = word
mvqSTN_:
        move    a1,x1
        move    x1,b
        neg     b
        sub     y0,b
        asr     b
        and     #>$ffff00,b
        bpl     mvqH2__
        add     y0,b
mvqH2__:
        move    b,y:(r5+n5)
        move    b,a
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqIN__:
        move    x:(r7+$0f),b
        move    b,y:(r5+n5)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
; An output tap reads a whole word: twice the stored half, then 16-bit << 3.
mvqOUTR:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$0c)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqOUTL:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$0b)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
; A store at an output step: the stored value goes out, acc is kept.
mvqSTR_:
        move    a1,x1
        move    x1,b
        bsr     mvqHST_
        move    x1,b
        asl     #$3,b,b
        move    b,x:(r7+$0c)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqSTL_:
        move    a1,x1
        move    x1,b
        bsr     mvqHST_
        move    x1,b
        asl     #$3,b,b
        move    b,x:(r7+$0b)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqSNR_:
        move    a1,x1
        move    x1,b
        neg     b
        sub     y0,b
        move    b,x1
        bsr     mvqHST_
        move    x1,b
        asl     #$3,b,b
        move    b,x:(r7+$0c)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
mvqSNL_:
        move    a1,x1
        move    x1,b
        neg     b
        sub     y0,b
        move    b,x1
        bsr     mvqHST_
        move    x1,b
        asl     #$3,b,b
        move    b,x:(r7+$0b)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
; b = half(b), stored at the step's word.
mvqHST_:
        asr     b
        and     #>$ffff00,b
        bpl     mvqH3__
        add     y0,b
mvqH3__:
        move    b,y:(r5+n5)
        rts

mvqEND_:
        move    a1,x1                   ; acc carries into the next sample, wrapped
        move    x1,x:(r7+$04)
        move    (r5)+
        move    x:(r7+$08),a
        move    a,x:(r7+$06)
        move    x:(r7+$09),a
        move    a,x:(r7+$07)
        move    x:(r7+$0b),a
        move    a,x:(r7+$08)
        move    x:(r7+$0c),a
        move    a,x:(r7+$09)
        move    x:(r7+$06),a
        move    a,x:(r7+$0b)
        move    x:(r7+$07),a
        move    a,x:(r7+$0c)
        clr     a
        move    a,x:(r7+$03)

; out = dry + MIX (wet - dry)
mvqMIX_:
        move    x:(r7+$0d),y1
        move    x:(r0),x0
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    x:(r7+$0b),x0
        mac     x0,y1,a
        move    x:(r0+n0),x0
        move    a,x:(r0)+
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    x:(r7+$0c),x0
        mac     x0,y1,a
        move    a,x:(r0)+
mvqSMPE:
        move    r5,x:(r7+$01)
        move    #>$ffffff,m5
        rts
