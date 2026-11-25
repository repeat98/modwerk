; Midiverb: the Alesis Midiverb's programs on the Octatrack's DSP.
; The original runs 128 steps a sample over 16K words; generate.mjs turns each
; program into delay lines packed into this slot's ring and into the words the
; module's ColdFire half streams here (stream.c). Every word in the ring is
; stored already halved, with the original's rounding (half(x) = floor(x/2) +
; [x<0]), so a read is a plain add and the state stays bit-exact. Values are
; 16-bit, left-aligned in 24 bits (the low 8 bits zero), so 16-bit wrapping is
; free in a1.
;
; Half rate: a program sample every second frame (22.05 kHz), its input the
; average of the last two frames' L and R, its output interpolated linearly.
; Own 16K allocator buffer: a 15,608-word ring (m = $3cf7), then the program
; area at +$3cf8..+$3dfd (262 words: header, program, checksum). The slot's last $202 words, Sidechain's
; key window on T3 and T7, stay untouched.
;
; The stream: every frame FX2's page 2 carries one chunk of the selected
; program, round and round: r6+$c the chunk k (bits 16-23) and the program g
; (bits 8-15), r6+$d and r6+$e the program's words 2k and 2k+1 (bits 8-23).
; Word 0 is a header ($8000 | N), the last word a checksum (the sum of the
; others, low 16 bits, xor $a5a5). A program other than the one playing is
; taken from its chunk 0, in order, while the ring clears; it plays once both
; are done and the checksum holds. A program playing fades out first (16
; calls); while none plays the reverb is silent and the dry stays at its mix.
;
; State, r7+: 00 base  01 ring pointer  02 clear counter  03 phase
; 04 acc  05 first frame's (L+R)/2  06/07 unused  08/09 current out L/R
; 0a program playing ($ffffff none)  0b/0c the out L/R played (the previous sample's after END)  0d mix  0e level
; 0f half(input)  10 program loading ($ffffff none)  11 its next chunk
; 12 loaded (1)  13 its running sum  14 its N  15 its checksum
; 16 fade calls left  17 the wet's mix  18 its fall a sample  19 this build's
; signature ($4d5605: bump it with any change to this layout)  1a the tail kill holds
; Program words: units [handler*16][argument]; a run of reads is [0][k] then k
; ring offsets; the handlers sit 16 words apart from mvqJTAB, in HANDLER's order.

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
        move    a,x:(r7+$0a)            ; nothing plays until a program arrives
        move    a,x:(r7+$10)
        move    #>$4d5605,a
        move    a,x:(r7+$19)            ; this build's state
        rts

proc:
        move    #>$ffffff,m4
        move    #>$ffffff,m1
        move    #>$ffffff,m3
; State another build left: stock runs init only when a slot's effect id
; changes, so a new version installed over the same id meets the old one's
; state. Start afresh then, keeping only the slot's buffer base.
        move    x:(r7+$19),a
        move    #>$4d5605,x0
        cmp     x0,a
        beq     mvqSIGK
        move    x:(r7+$00),b
        move    r7,r4
        clr     a
        do      #32,>mvqSIGZ
        move    a,x:(r4)+
mvqSIGZ:
        move    b,x:(r7+$00)
        move    b,x:(r7+$01)
        move    #>$ffffff,a
        move    a,x:(r7+$0a)
        move    a,x:(r7+$10)
        move    #>$4d5605,a
        move    a,x:(r7+$19)
mvqSIGK:
; The stream's chunk: k and g from r6+$c.
        move    x:(r6+$c),x1
        move    x1,a
        lsr     #$10,a
        move    a1,x0                   ; k
        move    x1,a
        lsr     #$8,a
        and     #>$0000ff,a
        move    a1,y1                   ; g
; STOP's tail kill holds the track (chunk $ff): the reverb goes silent and the
; ring clears once; the program stays and plays on from silence after it.
        move    x0,a
        cmp     #>$ff,a
        bne     mvqNOKL
        move    x:(r7+$1a),a
        tst     a
        bne     mvqRCVX
        move    #>$1,a
        move    a,x:(r7+$1a)
        clr     a
        move    a,x:(r7+$16)
        move    a,x:(r7+$03)
        move    a,x:(r7+$04)
        move    a,x:(r7+$0b)
        move    a,x:(r7+$0c)
        move    a,x:(r7+$08)
        move    a,x:(r7+$09)
        move    x:(r7+$00),a
        move    a,x:(r7+$01)
        move    #>$1f,a
        move    a,x:(r7+$02)
        bra     mvqRCVX
mvqNOKL:
        clr     a
        move    a,x:(r7+$1a)
; A fade in progress: the program playing fades out over 16 calls; then
; nothing plays until the new one has loaded.
        move    x:(r7+$16),a
        tst     a
        beq     mvqNOFD
        sub     #>$1,a
        move    a,x:(r7+$16)
        bne     mvqRCVX
        move    #>$ffffff,a
        move    a,x:(r7+$0a)            ; faded out: nothing plays
        bra     mvqRCVX
mvqNOFD:
        move    x:(r7+$0a),a
        cmp     y1,a
        beq     mvqRCVX                 ; it offers what plays
        move    x:(r7+$10),a
        cmp     y1,a
        beq     mvqLOAD
; Another program while one plays: that one fades out first.
        move    x:(r7+$0a),a
        move    #>$ffffff,x1
        cmp     x1,a
        beq     mvqNEWP
        move    #>$10,a
        move    a,x:(r7+$16)
        move    x:(r7+$0d),a
        move    a,x:(r7+$17)            ; the wet's mix falls from the mix
        asr     #$8,a,a
        move    a1,x1
        move    x1,x:(r7+$18)           ; by a 256th of it a sample
        bra     mvqRCVX
mvqNEWP:
; Nothing plays: a program only from its chunk 0, whose first word is the header
; $8000 | N, N the words after it (the last of them the checksum), 4..261.
        move    x0,a
        tst     a
        bne     mvqRCVX
        move    x:(r6+$d),a
        lsr     #$8,a
        and     #>$00ffff,a
        move    a1,x1
        move    x1,b
        and     #>$008000,b
        move    b1,y0
        move    y0,b
        tst     b
        beq     mvqRCVX                 ; no header: not a stream
        move    x1,b
        and     #>$007fff,b
        move    b1,y0
        move    y0,b                    ; N
        cmp     #>$4,b
        blt     mvqRCVX
        cmp     #>$105,b
        bgt     mvqRCVX
        move    b,x:(r7+$14)
        move    y1,x:(r7+$10)
        clr     a
        move    a,x:(r7+$11)
        move    a,x:(r7+$12)
        move    a,x:(r7+$13)
        move    a,x:(r7+$03)
        move    a,x:(r7+$04)
        move    a,x:(r7+$0b)
        move    a,x:(r7+$0c)
        move    a,x:(r7+$08)
        move    a,x:(r7+$09)
        move    x:(r7+$00),a
        move    a,x:(r7+$01)
        move    #>$ffffff,a
        move    a,x:(r7+$0a)            ; nothing plays while it loads
        move    #>$1f,a
        move    a,x:(r7+$02)            ; the ring clears meanwhile
; Chunk k, in order: words 2k and 2k+1 into the area; every word before the
; last adds to the sum, the last is the checksum.
mvqLOAD:
        move    x:(r7+$12),a
        tst     a
        bne     mvqRCVX                 ; complete already
        move    x:(r7+$11),a
        cmp     x0,a
        bne     mvqRCVX                 ; not the chunk due: wait for it
        move    x0,a
        asl     a
        move    a,y0                    ; i = 2k
        move    x:(r7+$00),x1
        add     x1,a
        move    #>$3cf8,x1
        add     x1,a
        move    a,r3                    ; word i's place
        move    x:(r6+$d),a
        lsr     #$8,a
        and     #>$00ffff,a
        move    a1,x1
        move    x1,y:(r3)+
        move    y0,a
        move    x:(r7+$14),b
        cmp     b,a
        beq     mvqCKA_                  ; i = N: the checksum
        move    x:(r7+$13),a
        add     x1,a
        move    a,x:(r7+$13)
        bra     mvqWB__
mvqCKA_:
        move    x1,x:(r7+$15)
mvqWB__:
        move    y0,a
        add     #>$1,a                  ; i + 1
        move    x:(r7+$14),b
        cmp     b,a
        bgt     mvqNEXK                 ; past the checksum: nothing
        move    x:(r6+$e),a
        lsr     #$8,a
        and     #>$00ffff,a
        move    a1,x1
        move    x1,y:(r3)
        move    y0,a
        add     #>$1,a
        cmp     b,a
        beq     mvqCKB_
        move    x:(r7+$13),a
        add     x1,a
        move    a,x:(r7+$13)
        bra     mvqNEXK
mvqCKB_:
        move    x1,x:(r7+$15)
mvqNEXK:
        move    x0,a
        add     #>$1,a
        move    a,x:(r7+$11)
        asl     a                       ; 2(k+1) words in
        move    x:(r7+$14),b
        cmp     b,a
        ble     mvqRCVX                 ; the checksum, word N, not in yet
        move    x:(r7+$13),a
        and     #>$00ffff,a
        move    a1,x1
        move    #>$00a5a5,a
        eor     x1,a
        move    a1,x1
        move    x:(r7+$15),a
        cmp     x1,a
        bne     mvqBAD_
        move    #>$1,a
        move    a,x:(r7+$12)            ; loaded
        bra     mvqRCVX
mvqBAD_:
        move    #>$ffffff,a
        move    a,x:(r7+$10)            ; a broken stream: wait for chunk 0 again
mvqRCVX:

; The ring clears 512 words a call while a program loads (nothing plays, so
; the time is free): 31 calls cover its 15,608 words, modulo the ring.
        move    x:(r7+$02),a
        tst     a
        beq     mvqREDY
        sub     #>$1,a
        move    a,x:(r7+$02)
        asl     #$9,a,a
        move    x:(r7+$00),x0
        add     x0,a
        move    a,r4
        move    #>$3cf7,m4
        clr     a
        do      #512,>mvqCLR_
        move    a,y:(r4)+
mvqCLR_:
        nop
        move    #>$ffffff,m4
        bra     mvqQUIT

mvqREDY:
; A loaded program plays from this call; without one the reverb is silent.
        move    x:(r7+$12),a
        tst     a
        beq     mvqPLAY
        move    x:(r7+$10),a
        move    a,x:(r7+$0a)
        move    #>$ffffff,a
        move    a,x:(r7+$10)
        clr     a
        move    a,x:(r7+$12)
mvqPLAY:
        move    x:(r7+$1a),a
        tst     a
        bne     mvqQUIT                 ; the tail kill holds
        move    x:(r7+$0a),a
        move    #>$ffffff,x0
        cmp     x0,a
        bne     mvqPRGB
        bra     mvqQUIT
mvqPRGB:
; MIX (F): 127 is full wet. LEVL (B): k/32, unity at 32.
        move    x:(r6+$5),a
        move    #>$7f0000,x0
        cmp     x0,a
        bne     mvqMIXA
        move    #>$7fffff,a
mvqMIXA:
        move    a,x:(r7+$0d)
        move    a,b
        move    x:(r7+$16),a
        tst     a
        bne     mvqFADG
        move    b,x:(r7+$17)            ; no fade: the wet's mix is the mix
mvqFADG:
        move    x:(r6+$1),a
        move    a,x:(r7+$0e)

        move    #>$3cf7,m5
        move    x:(r7+$01),r5
        move    #>$000100,y0            ; one 16-bit LSB, left-aligned
        move    #>$1,n0
        do      n7,>mvqSMPE
        move    x:(r7+$03),a
        tst     a
        bne     mvqFRMB
; Frame A: keep (L+R)/2; the output is halfway between the last two program samples
; (the previous one in 0b/0c, where END left it, the current one in 08/09).
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$05)
        move    #>$1,a
        move    a,x:(r7+$03)
        move    x:(r7+$0b),a
        move    x:(r7+$08),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$0b)
        move    x:(r7+$0c),a
        move    x:(r7+$09),x0
        add     x0,a
        asr     a
        move    a,x:(r7+$0c)
        bra     mvqMIX_

; Frame B: one program sample.
mvqFRMB:
        move    #>$000100,y0            ; one 16-bit LSB, left-aligned
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
        move    #>$3cf9,a               ; the program's words, after its header
        move    x:(r7+$00),x0
        add     x0,a
        move    a,r4
        move    #>mvqJTAB,r1
        move    x:(r7+$04),a            ; acc
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)

; The handlers, each at 16 words times its index from mvqJTAB: a unit's first
; word is that offset, so the jump lands on its handler (generate.mjs SLOT;
; verify.py checks the layout). Each ends by fetching the next unit and jumping.
mvqJTAB:
; 0: a run of reads, n5 of them: acc += word. The last parallel fetch takes the
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
        nop
        nop
        nop
        nop
        nop
        nop
        nop
; 1: word = half(acc), acc += word
mvqST__:
        move    a1,a                    ; acc wrapped to 16 bits
        asr     #$1,a,b
        and     #>$ffff00,b
        bpl     mvqH1__
        add     y0,b
mvqH1__:
        move    b,y:(r5+n5)
        add     b,a             y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        nop
; 2: acc = word
mvqLD__:
        move    y:(r5+n5),a
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
; 3: word = half(~acc), acc = word
mvqSTN_:
        move    a1,a                    ; acc wrapped to 16 bits
        neg     a
        sub     y0,a            y:(r4)+,n1
        asr     a
        and     #>$ffff00,a
        bpl     mvqH2__
        add     y0,a
mvqH2__:
        move    a,y:(r5+n5)
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
; 4: word = half(input)
mvqIN__:
        move    x:(r7+$0f),b
        move    b,y:(r5+n5)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
; 5, 6: an output tap reads a whole word: twice the stored half, then 16-bit << 3.
mvqOUTR:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$0c)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
mvqOUTL:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$0b)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
; 7-10: a store at an output step: the stored value goes out, acc is kept.
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
        nop
        nop
        nop
        nop
        nop
        nop
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
        nop
        nop
        nop
        nop
        nop
        nop
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
        nop
        nop
        nop
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
        nop
        nop
        nop
; 11: the end of the sample: the new outputs become the current ones, the
; current ones the previous (in 0b/0c, which frame B plays).
mvqEND_:
        move    a1,x1                   ; acc carries into the next sample, wrapped
        move    x1,x:(r7+$04)
        move    (r5)+
        move    x:(r7+$0b),a
        move    x:(r7+$08),b
        move    a,x:(r7+$08)
        move    b,x:(r7+$0b)
        move    x:(r7+$0c),a
        move    x:(r7+$09),b
        move    a,x:(r7+$09)
        move    b,x:(r7+$0c)
        clr     a
        move    a,x:(r7+$03)

; out = dry - MIX dry + WET wet: WET is MIX, falling to 0 while a program fades out.
mvqMIX_:
        move    x:(r7+$16),a
        tst     a
        beq     mvqFNON
        move    x:(r7+$17),a
        move    x:(r7+$18),x1
        sub     x1,a
        bge     mvqFPOS
        clr     a
mvqFPOS:
        move    a,x:(r7+$17)
mvqFNON:
        move    x:(r7+$0d),y1
        move    x:(r7+$17),y0
        move    x:(r0),x0
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    x:(r7+$0b),x0
        mac     y0,x0,a
        move    x:(r0+n0),x0
        move    a,x:(r0)+
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    x:(r7+$0c),x0
        mac     y0,x0,a
        move    a,x:(r0)+
mvqSMPE:
        move    r5,x:(r7+$01)
        move    #>$ffffff,m5
        rts

; No program plays (none yet, a fade ended, or one loading): the reverb is
; silent and the dry stays at its mix, so a switch never jumps to full dry.
mvqQUIT:
        move    x:(r6+$5),a
        move    #>$7f0000,x0
        cmp     x0,a
        bne     mvqQMIX
        move    #>$7fffff,a
mvqQMIX:
        move    a,y1
        do      n7,>mvqQEND
        move    x:(r0),x0
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    a,x:(r0)+
        move    x:(r0),x0
        mpy     x0,y1,b
        move    x0,a
        sub     b,a
        move    a,x:(r0)+
mvqQEND:
        rts

; b = half(b), stored at the step's word (the output steps' units).
mvqHST_:
        asr     b
        and     #>$ffff00,b
        bpl     mvqH3__
        add     y0,b
mvqH3__:
        move    b,y:(r5+n5)
        rts
