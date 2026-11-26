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
; 04 the LFO update keeps r4  05 first frame's (L+R)/2  06/07 the update keeps r3, the mode  08/09 current out L/R
; 0a program playing ($ffffff none)  0b/0c the out L/R played (frame B copies 08/09 there first)  0d mix  0e level
; 0f the update's scratch  10 program loading ($ffffff none)  11 its next chunk
; 12 loaded (1)  13 its running sum  14 its N  15 its checksum
; 16 fade calls left  17 the wet's mix  18 its fall a sample  19 this build's
; signature ($4d5607: bump it with any change to this layout or the program's)  1a the tail kill holds
; 1b program samples to the next LFO update, in $100s (0: the program's first)  1c-1f the two LFOs' state
; Program words (generate.mjs encode): the input's ring offset, then units [handler word][k offsets][offset]: k reads
; added to the accumulator, then the handler's operation. The handlers sit SLOT (24) words apart from mvqJTAB in
; HANDLER's order, each with READS (7) read pairs before its operation; the handler word lands k pairs before it.
; A Midiverb II chorus or flange program starts with a tick unit and moves the ring pointer with sh units: its
; LFOs (generate.mjs encodeLfo, lfoUpdate) rewrite four of its words each, once every 8 program samples.

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
        move    #>$4d5607,a
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
        move    #>$4d5607,x0
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
        move    #>$4d5607,a
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
        move    a,x:(r7+$1b)            ; the LFOs start afresh
        move    a,x:(r7+$1c)
        move    a,x:(r7+$1d)
        move    a,x:(r7+$1e)
        move    a,x:(r7+$1f)
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
        move    #>mvqMIXF,r3            ; a fade runs: MIX lowers the wet's mix every frame
        bne     mvqFADG
        move    b,x:(r7+$17)            ; no fade: the wet's mix is the mix
        move    #>mvqMIX_,r3
mvqFADG:
        move    x:(r6+$1),a
        move    a,x:(r7+$0e)
        move    #>$3cf9,a               ; the program's words, after its header
        move    x:(r7+$00),x0
        add     x0,a
        move    a,r2
        move    #>mvqJTAB,r1

        move    #>$3cf7,m5
        move    x:(r7+$01),r5
        move    #>$1,n0
        do      n7,>mvqSMPE
        move    x:(r7+$03),a
        tst     a
        bne     mvqFRMB
; Frame A: keep (L+R)/2; the output is halfway between the last two program samples
; (the previous one in 0b/0c, where frame B left it, the current one in 08/09).
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
        jmp     (r3)

; Frame B: one program sample. The last sample's outputs (08/09) become the ones this frame plays (0b/0c); the
; program writes the new ones to 08/09. Every program starts with the input's store and a load: the input is stored
; here and the accumulator cleared, so the load is the first unit's first read.
mvqFRMB:
        move    r2,r4
        move    x:(r7+$08),a
        move    a,x:(r7+$0b)
        move    x:(r7+$09),a
        move    a,x:(r7+$0c)
        move    y:(r4)+,n5              ; the input's word
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
        move    #>$ffff00,x0            ; the halving's mask, in x0 while the program runs
        and     x0,b
        add     y0,b            ifmi
        move    b,y:(r5+n5)             ; word = half(input)
        clr     a               y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)

; The handlers, SLOT (24) words apart from mvqJTAB in generate.mjs HANDLER's order (verify.py checks the layout).
; Each but END starts with READS (7) read pairs, acc += word, the last pair's fetch taking the operation's offset;
; a unit's handler word lands k pairs before the operation. Each ends by fetching the next unit and jumping there.
; A halving adds its 16-bit LSB to a negative word with `add y0,b ifmi` (the 56300's conditional ALU execution, on
; the flags the mask's and leaves): no branch.
mvqJTAB:
; 0: reads only, then the next unit (a run longer than READS before an operation).
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqRUN_:
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
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqST__:
        move    a1,a                    ; acc wrapped to 16 bits
        asr     #$1,a,b
        and     x0,b            y:(r4)+,n1
        add     y0,b            ifmi
        move    b,y:(r5+n5)
        add     b,a             y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
; 2: word = half(acc), then acc = 0 (the next step loads)
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqSTC_:
        move    a1,a                    ; acc wrapped to 16 bits
        asr     #$1,a,b
        and     x0,b            y:(r4)+,n1
        add     y0,b            ifmi
        move    b,y:(r5+n5)
        clr     a               y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
; 3: word = half(~acc), acc = word. not a1 is ~acc with its low byte set, which the shift and the mask drop.
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqSTN_:
        not     a               y:(r4)+,n1
        move    a1,a                    ; ~acc wrapped to 16 bits
        asr     a
        and     x0,a
        add     y0,a            ifmi
        move    a,y:(r5+n5)
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
; 4: word = half(~acc), then acc = 0 (the next step loads)
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqSNC_:
        not     a               y:(r4)+,n1
        move    a1,a                    ; ~acc wrapped to 16 bits
        asr     a
        and     x0,a
        add     y0,a            ifmi
        move    a,y:(r5+n5)
        clr     a               y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
; 5-8: an output tap reads a whole word: twice the stored half, then 16-bit << 3 (right to 09, left to 08);
; 6 and 8 then clear acc (the next step loads).
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqOUTR:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$09)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqORC_:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$09)
        clr     a               y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqOUTL:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$08)
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqOLC_:
        move    y:(r5+n5),b
        asl     #$4,b,b
        move    b,x:(r7+$08)
        clr     a               y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)
        nop
        nop
        nop
        nop
; 9: the end of the sample (no reads: the accumulator does not carry).
mvqEND_:
        move    (r5)+
        clr     a
        move    a,x:(r7+$03)
        jmp     (r3)
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
        nop
        nop
        nop
        nop
        nop
        nop
        nop
        nop
; 10: an LFO program's first unit (no reads; its word, in n5, the LFO block's place from r2): the update is due on
; the program's first sample and every eighth after.
mvqTICK:
        move    x:(r7+$1b),b
        sub     y0,b                    ; y0 is $000100 here
        move    b,x:(r7+$1b)
        ble     mvqLFOU
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
        nop
        nop
        nop
        nop
; 11: the ring pointer moves by the word (modulo the ring): into an LFO's window by size - w, out of it by w.
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
        move    y:(r5+n5),b
        add     b,a             y:(r4)+,n5
mvqSH__:
        move    (r5)+n5
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)

; The LFO update (generate.mjs lfoUpdate), between two units of the program's first: each LFO's step, then its w
; and row written into the program (its two sh words and its window's two row reads). Every register the program
; holds comes back: r4 (the next unit), r1 (mvqJTAB), r3 (MIX's entry), x0 and y0, and a = 0.
mvqLFOU:
        move    #>$800,x1
        move    x1,x:(r7+$1b)           ; eight program samples to the next
        move    r4,x:(r7+$04)
        move    r3,x:(r7+$06)
        move    r2,b
        move    n5,x1
        add     x1,b
        move    b,r4                    ; the LFO block
        move    r7,b
        add     #>$1c,b
        move    b,r3                    ; the first LFO's state
mvqLFON:
        move    y:(r4)+,a               ; its mode: 0 triangle, 1 sine, 2 sine read two bits over, 3 none left
        tst     a
        beq     mvqTRI_
        cmp     #>$3,a
        bne     mvqSIN_
        move    x:(r7+$06),r3
        move    x:(r7+$04),r4
        move    #>mvqJTAB,r1
        move    #>$ffff00,x0
        move    #>$000100,y0
        clr     a
        move    y:(r4)+,n1
        move    y:(r4)+,n5
        jmp     (r1+n1)

; A triangle: [rate] [ceiling] [unused]; state (position, rising).
mvqTRI_:
        move    y:(r4)+,x1
        move    y:(r4)+,y1
        move    (r4)+
        move    x:(r3),a
        move    x:(r3+$1),b
        tst     b
        beq     mvqTDN_
        add     x1,a
        cmp     y1,a
        ble     mvqTST_
        move    y1,a                    ; at the ceiling it turns
        clr     b
        bra     mvqTST_
mvqTDN_:
        sub     x1,a
        bge     mvqTST_
        clr     a                       ; at 0 it turns
        move    #>$1,b
mvqTST_:
        move    a,x:(r3)
        move    b,x:(r3+$1)
        bra     mvqLFOP

; A sine (the firmware's magic circle): [rate] [limit, the clamp << 8] [y0]; state (x, y - y0). y += M(top(x)),
; x += ~M(top(y)), each clamped to -limit..limit - 1; top(v) = v >> 8 (mode 2: v >> 6), M(t) = (t r) >> 8, or
; ~((~t r) >> 8) for a negative t (the 8031's signed multiply).
mvqSIN_:
        move    a,x:(r7+$07)
        move    y:(r4)+,a
        asl     #$f,a,a
        move    a1,y1                   ; rate << 15: a product's a1 is (t r) >> 8
        move    y:(r4)+,x1              ; the limit
        move    y:(r4)+,a
        move    a,x:(r7+$0f)            ; y0
        move    x:(r3+$1),b
        add     a,b
        move    b,x:(r3+$1)             ; y, while it steps
        move    x:(r3),b
        move    x:(r7+$07),a
        cmp     #>$2,a
        bne     mvqSA1_
        asl     #$2,b,b
mvqSA1_:
        asr     #$8,b,b                 ; t = top(x)
        tst     b
        blt     mvqSN1_
        move    b1,x0
        mpy     x0,y1,b
        bra     mvqSM1_
mvqSN1_:
        not     b
        move    b1,x0
        mpy     x0,y1,b
        not     b
mvqSM1_:
        move    b1,x0                   ; M(top(x))
        move    x:(r3+$1),a
        add     x0,a
        cmp     x1,a
        blt     mvqSC1_
        move    x1,a
        sub     #>$1,a
mvqSC1_:
        move    a,b
        add     x1,b
        bge     mvqSD1_
        clr     a
        sub     x1,a
mvqSD1_:
        move    a,x:(r3+$1)             ; y
        move    a,b
        move    x:(r7+$07),a
        cmp     #>$2,a
        bne     mvqSA2_
        asl     #$2,b,b
mvqSA2_:
        asr     #$8,b,b                 ; t = top(y)
        tst     b
        blt     mvqSN2_
        move    b1,x0
        mpy     x0,y1,b
        bra     mvqSM2_
mvqSN2_:
        not     b
        move    b1,x0
        mpy     x0,y1,b
        not     b
mvqSM2_:
        move    b1,x0                   ; M(top(y))
        move    x:(r3),a
        sub     x0,a
        sub     #>$1,a                  ; x + ~M
        cmp     x1,a
        blt     mvqSC2_
        move    x1,a
        sub     #>$1,a
mvqSC2_:
        move    a,b
        add     x1,b
        bge     mvqSD2_
        clr     a
        sub     x1,a
mvqSD2_:
        move    a,x:(r3)                ; x
        move    x:(r3+$1),b
        move    x:(r7+$0f),x0
        sub     x0,b
        move    b,x:(r3+$1)             ; y - y0
        move    x:(r7+$07),b
        cmp     #>$2,b
        bne     mvqLFOP
        asr     #$2,a,a                 ; mode 2: x >> 2

; a1: the LFO's value. [base] [sh in] [sh out] [row read] [row read] [16 rows of two offsets]: w = base + value >> 8
; into both sh words (size - w, modulo the ring, and w), the row (value >> 4) & 15's offsets into the two reads.
mvqLFOP:
        move    r4,x:(r7+$0f)
        asr     #$3,a,b                 ; b1: value >> 3
        asr     #$8,a,a
        move    y:(r4)+,x1
        add     x1,a
        move    a1,x1                   ; w
        move    #>$3cf8,a
        sub     x1,a
        cmp     #>$3cf8,a
        bne     mvqLFW_
        clr     a                       ; w = 0: no move
mvqLFW_:
        move    r2,r1
        move    y:(r4)+,n1
        move    a,y:(r1+n1)             ; size - w
        move    y:(r4)+,n1
        move    x1,y:(r1+n1)            ; w
        move    y:(r4)+,n1
        move    y:(r4)+,y1
        and     #>$00001e,b             ; twice the row
        move    b1,x0
        move    x0,n4
        move    (r4)+n4
        move    y:(r4)+,x0
        move    x0,y:(r1+n1)
        move    y1,n1
        move    y:(r4),x0
        move    x0,y:(r1+n1)
        move    x:(r7+$0f),a
        add     #>$25,a                 ; past the 37 words
        move    a,r4                    ; the next LFO's
        move    (r3)+
        move    (r3)+
        move    #>mvqLFON,r1          ; dsp_asm takes no backward bra (TRAPS.md)
        jmp     (r1)

; A fade runs: the wet's mix falls by its step every frame, to 0.
mvqMIXF:
        move    x:(r7+$17),a
        move    x:(r7+$18),x1
        sub     x1,a
        bge     mvqFPOS
        clr     a
mvqFPOS:
        move    a,x:(r7+$17)
; out = dry - MIX dry + WET wet: WET is MIX, falling to 0 while a program fades out.
mvqMIX_:
        move    x:(r7+$0d),y1
        move    x:(r7+$17),y0
        move    x:(r0),x0
        mpy     x0,y1,b         x0,a
        sub     b,a
        move    x:(r7+$0b),x0
        mac     y0,x0,a         x:(r0+n0),x0
        move    a,x:(r0)+
        mpy     x0,y1,b         x0,a
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
