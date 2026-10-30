; SPDX-License-Identifier: GPL-3.0-or-later
; SPDX-FileCopyrightText: 2026 Semi Erendönmez
; ---------------------------------------------------------------------------
; CODEC ECHO -- an echo whose repeats pass through a lossy codec.
;
; The line runs at half the rate (22.05 kHz) and stores 12-bit samples, two to a
; word, so the allocator's 15,870 words hold 1.44 s. Every pass goes through the
; codec again:
;   s = the mono input, two frames averaged (the half rate's decimation)
;   u = lowpass(LOSS, s + FDBK * d)       d = the line's output, D samples back
;   u = ADPCM(u): coded at 5, 4, 3 or 2 bits a sample by LOSS (G.726's 40, 32, 24
;       and 16 kbit/s depths, at this rate) and decoded, then kept to 12 bits
;   a packet of PKT samples is lost at DROP's chance: its samples are written as
;   silence (PLC MUTE) or as the packet before it again (PLC RPT, a codec's
;   packet-loss concealment)
; so each repeat is darker, coarser and more broken than the last. The wet is the
; line's output brought back to the full rate (linear, then a one-pole) and MIX
; blends it over the stereo dry: MIX 0 returns the dry bit for bit.
;
; TIME is a note division of the project's tempo: stock's tempo24 (BPM x 24) at
; r6+$13, which the frame builder publishes for an FX2 instance; the samples a MIDI
; clock lasts come from it with a 24-step div, as octabam's BusDelay does it. A
; division longer than the line halves until it fits. TIME and tempo changes move
; the read head under a short fade (64 half-rate samples out and back in).
;
; ABI (docs/remixer/HARNESS.md): r0 = audio block (interleaved stereo, in place),
; n7 = frames, r6 = parameters, r7 = state. A trig split's second call starts at
; r0 = split*2; the half-rate phase is kept in the state, not in the block.
;   x:(r6+$0) TIME  x:(r6+$1) FDBK  x:(r6+$2) LOSS  x:(r6+$3) DROP  x:(r6+$4) PKT
;   x:(r6+$5) MIX   page 1, value << 16 (an LFO's fraction in bits 15-8 is masked)
;   x:(r6+$c) PLC   page 2 slot 6, the knob field (bits 23-16)
;   x:(r6+$13) tempo24 << 8
; Table: the module's own P table (manifest.py): the twelve divisions' MIDI clocks.
; Buffer: the allocator's Y buffer from its base, 15,870 words, cleared over the
; first 124 calls (128 words a call through a modulus of $3dfd, so the slot's last
; $202 words, Sidechain Compressor's key window on T3 and T7, are never touched);
; the dry passes untouched until the line is clear.
;
; r7 block ($00..$28, all cleared by init):
;   $00 noise (24-bit LCG)  $01 the half-rate phase  $02 the frame held for it
;   $03 the write sample w (0 .. 31,739)  $04 the delay D in use  $05 D's target
;   $06 the read head's fade g  $07/$08 FDBK cur/target  $09/$0a MIX cur/target
;   $0b/$0c LOSS's low-pass k cur/target  $0d the line's 12-bit mask  $0e the low-pass
;   $20 the ADPCM's prediction p  $21 its step index  $22..$26 its depth (from the table) and
;   the last code  $27 the loop's DC blocker
;   $0f/$10 the line's output, previous/latest  $11 the packet's samples left
;   $12 the packet is lost  $13 PKT, samples  $14 DROP's chance  $15 PLC
;   $16 the buffer's base  $17 the table's base  $18 calls left to clear
;   $1a/$1b dry L/R  $1c/$1d the wet's two one-poles (the wet is $1d)  $1e scratch
;   $19/$1f the bits those two poles dropped, added back on the next frame
;
; Multiplies use only the encodable operand orders; no rep; no tfr between
; accumulators. Labels are ce + two digits, none a prefix of another.
; ---------------------------------------------------------------------------
init:
        move    #>$ffffff,m5
        move    r7,r5                   ; r1 is the dispatcher's across init
        clr     a
        do      #<$29,>ce00
        move    a,x:(r5)+
ce00:
        move    #>$2b7e15,x0            ; the noise's seed
        move    x0,x:(r7+$0)
        move    x:>$213,r5              ; the allocator's entry
        move    x:(r5),x0
        move    x0,x:(r7+$16)           ; the Y buffer's base
        move    #>$7c,x0                ; 124 calls of 128 words
        move    x0,x:(r7+$18)
        move    #>$7fffff,x0
        move    x0,x:(r7+$6)            ; the read head open
        rts

proc:
        move    #>$ffffff,m0
        move    #>$ffffff,m5
; ---- the line's first calls: clear it, and leave the dry alone --------------
        move    x:(r7+$18),a
        tst     a
        beq     ce02
        sub     #<1,a
        move    a1,x:(r7+$18)
        asl     #7,a,a
        move    x:(r7+$16),x0
        add     x0,a
        move    a1,r4
        move    #>$3dfd,m4
        clr     a
        do      #128,>ce01
        move    a,y:(r4)+
ce01:
        move    #>$ffffff,m4
        rts
ce02:
        move    #>$ffffff,m4
        move    #>$fab1e0,r5            ; the table's base, placed by the build
        move    r5,x:(r7+$17)
; ---- the samples a MIDI clock lasts, Q12.4, from tempo24 (120 BPM without one)
        move    x:(r6+$13),a
        and     #>$ffff00,a
        asr     #$8,a,a
        move    #>$b40,x1               ; 2,880: 120 BPM
        tst     a
        teq     x1,a
        move    a1,x0
        move    #>$0bfe00,x1
        move    #>$5,a                  ; a1:a0 = 84,672,000, the doubled dividend
        move    x1,a0
        andi    #$fe,ccr
        do      #$18,>ce03
        div     x0,a
ce03:
        move    a0,y0                   ; samples a clock x 16
; ---- TIME: D = clocks x that / 32 half-rate samples, halved until it fits ----
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>$b,x1
        cmp     x1,a
        tgt     x1,a                    ; 0 .. 11
        move    a1,n5
        move    x:(r7+$17),r5
        move    (r5)+n5
        move    p:(r5),x1               ; the division's clocks
        clr     a
        do      x1,>ce04
        add     y0,a
ce04:
        asr     #5,a,a
        move    #>$7788,x1              ; 30,600: the line less a packet and a margin
        do      #3,>ce05
        move    a1,b
        asr     b
        move    b1,y1
        cmp     x1,a
        tgt     y1,a
ce05:
        move    #>$2,x1
        cmp     x1,a
        tlt     x1,a
        move    a1,x:(r7+$5)
; ---- FDBK: up to 0.95 ---------------------------------------------------------
        move    x:(r6+$1),a
        and     #>$7f0000,a
        move    a1,x0
        move    #>$79999a,y0
        mpy     y0,x0,a
        move    a,x:(r7+$8)
; ---- LOSS: the loop's low-pass k = 1 - 3/4 LOSS, and the ADPCM's bits: 5, 4, 3 or 2 --
        move    x:(r6+$2),a
        and     #>$7f0000,a
        move    a1,x0
        move    #>$600000,y0
        mpy     y0,x0,b
        move    #>$7fffff,a
        sub     b,a
        move    a,x:(r7+$c)
        move    #>$fff000,x1            ; the line keeps 12 bits
        move    x1,x:(r7+$d)
        move    #>$4,y0
        mpy     y0,x0,a                 ; LOSS x 4 / 128: 0 .. 3, so 5 - that bits
        move    a1,b                    ; the whole part only (a0 holds the fraction)
        asl     #2,b,b
        add     #>$be,b                 ; four words a depth, after the clocks and two tables
        move    b1,n5
        move    x:(r7+$17),r5
        move    (r5)+n5
        lua     (r7+$22),r4
        move    p:(r5)+,x0
        move    x0,x:(r4)+              ; $22: the quantiser's shift, 12 - bits
        move    p:(r5)+,x0
        move    x0,x:(r4)+              ; $23: the largest code, 2^(bits-1) - 1
        move    p:(r5)+,x0
        move    x0,x:(r7+$25)           ; the dequantiser's shift, 25 - bits
        move    p:(r5),x0
        move    x0,x:(r7+$26)           ; half the codes, 2^(bits-2)
; ---- DROP: a packet's chance, up to 1/2 ---------------------------------------
        move    x:(r6+$3),a
        and     #>$7f0000,a
        asr     a
        move    a1,x:(r7+$14)
; ---- PKT: 64 + 7.5 k samples at the half rate (2.9 to 46 ms) -------------------
        move    x:(r6+$4),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,b
        asl     #3,a,a
        sub     b,a
        asr     b
        add     b,a
        add     #>$40,a
        move    a1,x:(r7+$13)
; ---- MIX: k / 128, and 127 is the wet alone -----------------------------------
        move    x:(r6+$5),a
        and     #>$7f0000,a
        move    #>$7fffff,x1
        cmp     #>$7f0000,a
        tge     x1,a
        move    a1,x:(r7+$a)
; ---- PLC: 0 MUTE, else RPT ------------------------------------------------------
        move    x:(r6+$c),a
        and     #>$7f0000,a
        move    a1,x:(r7+$15)
; ---- snap the three glides within 64 LSB ----------------------------------------
        lua     (r7+$7),r4
        do      #<3,>ce06
        move    x:(r4)+,x0
        move    x:(r4)-,a
        move    a,x1
        sub     x0,a
        abs     a
        move    x0,b
        cmp     #>$40,a
        tlt     x1,b
        move    b,x:(r4)+
        move    (r4)+
ce06:
        nop

; ---- the frames ------------------------------------------------------------------
        do      n7,>ce40
; the glides, 1/32 a frame
        lua     (r7+$7),r4
        do      #<3,>ce07
        move    x:(r4)+,x0
        move    x:(r4)-,a
        sub     x0,a
        asr     #5,a,a
        add     x0,a
        move    a,x:(r4)+
        move    (r4)+
ce07:
        nop
; the dry frame and its mono sum
        move    x:(r0)+,x0
        move    x0,x:(r7+$1a)
        move    x:(r0)-,a
        move    a,x:(r7+$1b)
        add     x0,a
        asr     a
        move    a,x1                    ; (L + R) / 2
; the half rate: an even frame holds the sum, an odd one runs the line
        move    x:(r7+$1),a
        tst     a
        bne     ce10
        move    #>$1,x0
        move    x0,x:(r7+$1)
        move    x1,x:(r7+$2)
        move    x:(r7+$10),a            ; the wet: the line's latest
        bra     ce30
ce10:
        clr     a
        move    a,x:(r7+$1)
        move    x:(r7+$2),a
        add     x1,a
        asr     a
        move    a,x:(r7+$1e)            ; s, the half-rate input
; the read head, D behind w, faded by g
        move    x:(r7+$3),a
        move    x:(r7+$4),x0
        sub     x0,a
        tst     a
        bge     ce11
        move    #>$7bfc,x0              ; N = 31,740 samples
        add     x0,a
ce11:
        bsr     ce80
        move    a,x0
        move    x:(r7+$6),y0
        mpy     y0,x0,a
        move    x:(r7+$10),x0
        move    x0,x:(r7+$f)
        move    a,x:(r7+$10)            ; d, the line's latest
; g: toward 0 while D is not its target (then D takes it), back toward 1
        move    x:(r7+$4),a
        move    x:(r7+$5),x0
        cmp     x0,a
        move    x:(r7+$6),a
        beq     ce12
        sub     #>$020000,a
        bgt     ce13
        clr     a
        move    x0,x:(r7+$4)
        bra     ce13
ce12:
        add     #>$020000,a
ce13:
        move    a,x:(r7+$6)             ; limited at 1
; the codec: u = s + FDBK d, limited to full scale; lp = k u + (1 - k) lp (no difference
; term to overflow: a full-scale tone near the top of the band passes unlimited)
        move    x:(r7+$1e),a
        move    x:(r7+$10),x0
        move    x:(r7+$7),y0
        mac     y0,x0,a
        move    a,x0                    ; u
; a DC blocker in the loop (a one-pole of 2^-7 subtracted, about 27 Hz): the coder's
; small biases never pile up through the feedback
        move    x:(r7+$27),b
        move    x0,a
        sub     b,a
        asr     #7,a,a
        add     a,b
        move    b,x:(r7+$27)
        move    x0,a
        sub     b,a
        move    a,x0
        move    x:(r7+$b),y0            ; k
        mpy     y0,x0,a
        move    #>$7fffff,b
        sub     y0,b
        move    b,y1                    ; 1 - k
        move    x:(r7+$e),x1
        mac     y1,x1,a
        move    a,x:(r7+$e)
; through the ADPCM, then truncated toward zero to the line's 12 bits
        move    a,x1
        bsr     ce70
        move    a,x0                    ; u
        move    x0,a
        abs     a
        move    a,y1                    ; |u|, limited below 1
        move    y1,a
        move    x:(r7+$d),x1
        and     x1,a
        move    a1,y1                   ; |q|
        move    y1,a
        neg     a
        move    a,y0                    ; -|q|
        move    x0,b
        tst     b
        move    y1,a
        tmi     y0,a
        move    a,x:(r7+$1e)            ; q
; packets: a countdown; each new packet is lost at DROP's chance
        move    x:(r7+$11),a
        sub     #<1,a
        bgt     ce14
        move    x:(r7+$0),x0
        move    #>$0cb306,y0            ; the noise: x * 1664525 + 1013904223
        mpy     y0,x0,b
        move    #0,x1
        add     x,b
        move    #>$6ef35f,y0
        move    #0,y1
        add     y,b
        move    b0,x0
        move    x0,x:(r7+$0)
        move    x0,b
        abs     b
        move    x:(r7+$14),x1
        move    #>$1,y0
        move    #0,y1
        cmp     x1,b
        tlt     y0,b
        tge     y1,b
        move    b1,x:(r7+$12)
        move    x:(r7+$13),a            ; PKT samples
ce14:
        move    a1,x:(r7+$11)
; a lost packet's samples: silence (MUTE), or the packet before it again (RPT)
        move    x:(r7+$12),a
        tst     a
        beq     ce16
        move    x:(r7+$15),a
        tst     a
        beq     ce15
        move    x:(r7+$3),a
        move    x:(r7+$13),x0
        sub     x0,a
        tst     a
        bge     ce17
        move    #>$7bfc,x0
        add     x0,a
ce17:
        bsr     ce80
        move    a,x:(r7+$1e)
        bra     ce16
ce15:
        clr     a
        move    a,x:(r7+$1e)
ce16:
; into the line at w; w moves on
        move    x:(r7+$3),a
        move    x:(r7+$1e),x1
        bsr     ce82
        move    x:(r7+$3),a
        add     #<1,a
        move    #>$7bfc,x0
        move    #0,y1
        cmp     x0,a
        tge     y1,a
        move    a1,x:(r7+$3)
; the wet at an odd frame: halfway from the line's previous to its latest
        move    x:(r7+$f),a
        move    x:(r7+$10),x0
        add     x0,a
        asr     a
ce30:
; two one-poles (k = 0.66) take the half rate's images down: y = k x + (1 - k) y, each
; carrying the bits it dropped to the next frame, so silence reaches exactly 0
        move    a,x0                    ; the line's output at this frame
        move    #>$547ae1,y0            ; k
        move    #>$2b851f,y1            ; 1 - k: the two sum to exactly 1
        mpy     y0,x0,a
        clr     b
        move    x:(r7+$19),b0
        add     b,a
        move    x:(r7+$1c),x1
        mac     y1,x1,a
        move    a0,x:(r7+$19)
        move    a,x:(r7+$1c)
        move    a,x0
        mpy     y0,x0,a
        clr     b
        move    x:(r7+$1f),b0
        add     b,a
        move    x:(r7+$1d),x1
        mac     y1,x1,a
        move    a0,x:(r7+$1f)
        move    a,x:(r7+$1d)            ; the wet
; out = dry + MIX (wet - dry), per channel
        move    x:(r7+$9),y0
        move    x:(r7+$1d),b
        asr     b
        move    x:(r7+$1a),a
        asr     a
        sub     a,b
        move    b,x1
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$1a),x0
        add     x0,a
        move    a,x:(r0)+
        move    x:(r7+$1d),b
        asr     b
        move    x:(r7+$1b),a
        asr     a
        sub     a,b
        move    b,x1
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$1b),x0
        add     x0,a
        move    a,x:(r0)+
ce40:
        rts

; ---- the ADPCM: an adaptive quantiser on the error from a leaky prediction ----------------
; In: x1 = the sample. Out: a = the decoded sample, which is also the next prediction p.
; G.726-like in its rates (2 to 5 bits a sample) and IMA-like in its 89 step sizes, each
; 1.1 times the last. The code m is |x - p| in units of step / 2^(bits-2), rounded (a
; mid-tread quantiser: a small error codes as 0 and changes nothing), up to 2^(bits-1) - 1;
; p moves by m of those units, signed. The step index falls by 1 on the lower half of the
; codes and rises by 2, 4, 6 ... on the upper half (IMA's rule, for any depth). p leaks
; 1/64 a sample toward 0 and is 0 under 64 LSB, so silence decodes to exact silence.
; Uses a, b, x0, x1, y0, y1, r5, n5; reads the tables through $17.
ce70:
        move    x:(r7+$20),a
        move    a,b
        asr     #6,b,b
        sub     b,a                     ; p - p/64
        move    a,b
        abs     b
        move    #0,y1
        cmp     #>$40,b
        tlt     y1,a
        move    a,x:(r7+$20)
        move    x1,b
        sub     a,b                     ; d = x - p
        move    b,y1                    ; d's sign
        abs     b
        move    b,x0                    ; |d|, limited below 1
        move    x:(r7+$21),a
        add     #>$c,a                  ; W[i] = 1 / (8192 step[i]), after the clocks
        move    a1,n5
        move    x:(r7+$17),r5
        move    (r5)+n5
        move    p:(r5),y0
        mpy     y0,x0,a                 ; |d| / (8192 step)
        move    x:(r7+$22),y0
        asr     y0,a,a                  ; a1.a0 = |d| / step x 2^(bits-2)
        rnd     a
        move    x:(r7+$23),x0
        cmp     x0,a
        tgt     x0,a                    ; m
        move    a1,x:(r7+$24)
        move    a1,x0
        move    #>$59,n5
        move    (r5)+n5
        move    p:(r5),y0               ; step[i]
        mpy     y0,x0,a                 ; m step / 2^23
        move    x:(r7+$25),y0
        asl     y0,a,a                  ; m step / 2^(bits-2)
        move    a,x0                    ; limited
        neg     a
        move    a,y0
        move    y1,b
        tst     b
        move    x0,a
        tmi     y0,a                    ; signed as d
        move    x:(r7+$20),b
        add     a,b
        move    b,x:(r7+$20)            ; p, limited
; the step index: -1 below half the codes, 2 (m - half + 1) from there, kept in 0 .. 88
        move    x:(r7+$24),a
        move    x:(r7+$26),x0
        sub     x0,a
        asl     a
        add     #<2,a
        move    #>$ffffff,y0
        tle     y0,a
        move    x:(r7+$21),x0
        add     x0,a
        move    #0,x0
        tst     a
        tlt     x0,a
        move    #>$58,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,x:(r7+$21)
        move    x:(r7+$20),a
        rts

; ---- read the line's sample at index a1 (0 .. 31,739): out a; uses b, x0, r4 ---------
; Two 12-bit samples a word: an even index the high half, an odd one the low half.
ce80:
        move    a1,b
        asr     b
        move    x:(r7+$16),x0
        add     x0,b
        move    b1,r4
        and     #>$1,a                  ; Z from a1
        move    y:(r4),b
        bne     ce81
        and     #>$fff000,b
        move    b1,a
        rts
ce81:
        asl     #12,b,b
        and     #>$fff000,b
        move    b1,a
        rts

; ---- write x1's high 12 bits at index a1; uses a, b, x0, r4 ------------------------------
ce82:
        move    a1,b
        asr     b
        move    x:(r7+$16),x0
        add     x0,b
        move    b1,r4
        and     #>$1,a
        move    y:(r4),b
        bne     ce83
        and     #>$000fff,b             ; even: keep the odd sample's half
        move    x1,a
        and     #>$fff000,a
        move    a1,x0
        or      x0,b
        move    b1,y:(r4)
        rts
ce83:
        and     #>$fff000,b             ; odd: keep the even sample's half
        move    x1,a
        asr     #12,a,a
        and     #>$000fff,a
        move    a1,x0
        or      x0,b
        move    b1,y:(r4)
        rts
