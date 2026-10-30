; SPDX-License-Identifier: GPL-3.0-or-later
; SPDX-FileCopyrightText: 2026 Semi Erendönmez
; ---------------------------------------------------------------------------
; DROPOUT -- codec and link failures, on the project's tempo.
;
; The cheap part of FRAMELOSS, per frame:
;   c = ADPCM(x) per channel (BITS: off, then 5, 4, 3 or 2 bits a sample, G.726's
;       40 to 16 kbit/s depths), or x itself with BITS off
;   e = c, or an error: they start at random, RATE events a step on average, and
;       each is of MODE's kind for SIZE samples:
;         HOLD  the last good sample held (ADAT/MADI style), 4 to 512 samples
;         PCKT  a 64, 128 or 256-sample packet lost and the one before it played
;               again, fading from full level to nothing
;         CIRC  1 to 8 bad samples concealed (CD style; the DSP cannot look ahead,
;               so the track's last slope is continued across them), or a long
;               burst of 16 to 1,024 muted
;   f = e, or, on a frozen step, the step's first frame (FRM samples) as it
;       passed, then looped to the end of the step; a step freezes at FRZ's chance
;   out = x + MIX (f - x): MIX 0 returns the dry bit for bit, and so does any
;       setting with RATE 0, BITS off and FRZ 0 (f is then x).
; STEP sets the step (1/32 to 1/4 note) that RATE and FRZ count in. Its length in
; samples comes from stock's tempo24 (BPM x 24), with a 24-step div, as octabam's
; BusDelay does it: record halfword 31, at r6+$13 for an FX2 instance and r6+$19 for
; an FX1 one (its r6 is six words lower); a word outside 30-300 BPM falls back to
; 120 BPM. The step clock
; is tempo-locked but free-running from the moment the effect is chosen: a DSP
; insert sees no step phase, transport, swing or track speed.
;
; ABI (docs/remixer/HARNESS.md): r0 = audio block (interleaved stereo, in place),
; n7 = frames, r6 = parameters, r7 = state. A trig split's second call starts at
; r0 = split*2; nothing here depends on the frame's position in the block.
;   x:(r6+$0) RATE  x:(r6+$1) SIZE  x:(r6+$2) BITS  x:(r6+$3) FRZ  x:(r6+$4) FRM
;   x:(r6+$5) MIX   page 1, value << 16 with an LFO's fraction in bits 15-8 (RATE,
;   FRZ and MIX use it); x:(r6+$c) MODE, x:(r6+$d) STEP: page 2 slots 6 and 8, the
;   knob field (bits 23-16); x:(r6+$13) tempo24 << 8 (FX2; x:(r6+$19) on FX1)
; Table: the module's own P table (manifest.py): the ADPCM's W at +0 and S at +89,
; its four depths at +178 (four words each), RATE's events a step at +194 (129
; words). The base is placed by the build.
; Buffer: the allocator's Y buffer, 3,072 words (an FX1 slot holds it): a ring of
; the last 512 coded frames in its first 1,024 words (PCKT reads the packet
; before), cleared over the first 8 calls, which pass the dry untouched; the
; frozen frame, up to 1,024 frames, in the other 2,048, written before it is read.
;
; r7 block ($00..$3a, all cleared by init):
;   $00 noise (24-bit LCG)  $01 calls left to clear the ring  $02 the buffer's base
;   $03 the table's base  $04 the ring's write frame w  $05 the error's frames left
;   $06 its kind (0 HOLD, 1 PCKT, 2 CIRC concealed, 3 CIRC muted)  $07 PCKT's read
;   frame  $08 PCKT's gain  $09 its fade a frame  $0a frames to the next step
;   $0b this step is frozen  $0c the frozen frame's index  $0d it is recorded
;   $0e its length  $0f the chance an error starts, a frame  $10 MODE  $11 SIZE in
;   samples  $12 a step in samples  $13 FRZ's chance a step  $14 FRM in samples
;   $15/$16 MIX cur/target  $17 BITS' zone (0 off)  $18 PCKT's fade  $19 the kind
;   SIZE gives  $1a/$1b dry L/R  $1c/$1d c L/R  $1e/$1f e, then f, L/R
;   $20..$27 the left codec, $28..$2f the right: its prediction p, step index,
;   quantiser shift, largest code, last code, dequantiser shift, half the codes,
;   the table's base (the codec runs on r7 + 8 for the right channel)
;   $30/$31 the last good sample L/R  $32/$33 the one before  $34/$35 CIRC's slope
;   $36/$37 CIRC's running value  $38 STEP 0..3  $39 the tempo word  $3a 1 on FX1
;
; Multiplies use only the encodable operand orders; no rep; no tfr between
; accumulators. Labels are dr + two digits, none a prefix of another.
; ---------------------------------------------------------------------------
init:
        move    #>$ffffff,m5
        move    r7,r5                   ; r1 is the dispatcher's across init
        clr     a
        do      #<$3b,>dr00
        move    a,x:(r5)+
dr00:
        move    #>$3c6ef3,x0            ; the noise's seed
        move    x0,x:(r7+$0)
        move    x:>$213,r5              ; the allocator's entry
        move    x:(r5),x0
        move    x0,x:(r7+$2)            ; the Y buffer's base
; FX1 or FX2, from the base (Modulation's idiom, as Character reads it): X:$213
; points at THIS instance's entry only during init. FX1 slots sit below $4000.
        move    x0,a
        move    #>$4000,x1
        sub     x1,a                    ; base - $4000
        clr     b                       ; b = 0 before the tst
        move    #>$1,x1
        tst     a
        tmi     x1,b                    ; an FX1 slot
        move    b,x:(r7+$3a)
        move    #>$8,x0                 ; 8 calls of 128 words clear the ring
        move    x0,x:(r7+$1)
        rts

proc:
        move    #>$ffffff,m0
        move    #>$ffffff,m4
        move    #>$ffffff,m5
; ---- the first 8 calls clear the ring and leave the dry alone ------------------
        move    x:(r7+$1),a
        tst     a
        beq     dr02
        sub     #<1,a
        move    a1,x:(r7+$1)
        asl     #7,a,a
        move    x:(r7+$2),x0
        add     x0,a
        move    a1,r4
        clr     a
        do      #128,>dr01
        move    a,y:(r4)+
dr01:
        rts
dr02:
        move    #>$fab1e0,r5            ; the table's base, placed by the build
        move    r5,x:(r7+$3)
        move    r5,x:(r7+$27)
        move    r5,x:(r7+$2f)
; ---- the tempo word: stock's record halfword 31 (120 BPM outside 30-300) -------
; An FX2 instance finds it at r6+$13, as BusDelay does. An FX1 instance's r6 sits
; six words lower in the same record (its page 2 at r6+$c..$e is FX2's r6+$6..$8:
; docs/remixer/FAILURE_MODES.md), so its r6+$13 is FX2's page-2 slots 8/9 and the
; word is at r6+$19. Anything outside the Octatrack's 30-300 BPM falls back.
        move    x:(r7+$3a),b
        tst     b
        move    x:(r6+$13),a            ; FX2
        beq     dr12
        move    x:(r6+$19),a            ; FX1
dr12:
        and     #>$ffff00,a
        move    #>$0b4000,y1            ; 2,880 << 8: 120 BPM
        move    #>$02d000,x1            ; 720 << 8: 30 BPM
        cmp     x1,a
        tlt     y1,a
        move    #>$1c2000,x1            ; 7,200 << 8: 300 BPM
        cmp     x1,a
        tgt     y1,a
        move    a1,x:(r7+$39)           ; t = tempo24 / 32,768 as a fraction
; ---- STEP: 0 .. 3 for 1/32, 1/16, 1/8, 1/4 -------------------------------------
        move    x:(r6+$d),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>$3,x1
        cmp     x1,a
        tgt     x1,a
        move    a1,x:(r7+$38)
; ---- the samples a MIDI clock lasts x 16, then a step: 3 x 2^STEP clocks -------
        move    x:(r7+$39),a
        asr     #$8,a,a
        move    a1,x0                   ; tempo24
        move    #>$0bfe00,x1
        move    #>$5,a                  ; a1:a0 = 84,672,000, the doubled dividend
        move    x1,a0
        andi    #$fe,ccr
        do      #$18,>dr03
        div     x0,a
dr03:
        move    a0,x0                   ; q = 42,336,000 / tempo24
        clr     a
        move    x0,a1
        asl     a
        add     x0,a                    ; 3 q
        move    x:(r7+$38),y0
        asl     y0,a,a
        asr     #4,a,a
        move    a1,x:(r7+$12)           ; S = 3 q 2^STEP / 16
; ---- RATE: the chance an error starts, a frame = R[k] t / 2^STEP ----------------
        move    x:(r6+$0),a
        move    #>$c2,x1
        bsr     dr90
        move    a,x0
        move    x:(r7+$39),y1
        mpy     x0,y1,a
        move    x:(r7+$38),y0
        asr     y0,a,a
        move    a,x:(r7+$f)
; ---- MODE: 0 HOLD, 1 PCKT, 2 CIRC; anything else HOLD ----------------------------
        move    x:(r6+$c),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #0,x1
        cmp     #<2,a
        tgt     x1,a
        move    a1,x:(r7+$10)
; ---- SIZE, by MODE: the error's samples and its kind -----------------------------
        move    x:(r6+$1),a
        and     #>$7f0000,a
        move    a1,x0                   ; k / 128
        asr     #$10,a,a
        move    a1,b                    ; k
        move    x:(r7+$10),a
        tst     a
        bne     dr05
        asl     #2,b,b                  ; HOLD: 4 + 4k samples
        add     #>$4,b
        move    b1,x:(r7+$11)
        move    #0,x1
        move    x1,x:(r7+$19)
        bra     dr08
dr05:
        cmp     #<1,a
        bne     dr06
        move    #>$3,y0                 ; PCKT: 64 << z samples, z = 3k / 128
        mpy     y0,x0,a
        move    a1,y0                   ; the whole part only (a0 holds the fraction)
        move    #>$40,a
        asl     y0,a,a
        move    a1,x:(r7+$11)
        move    #>$020000,a             ; the fade: 1 / the packet a frame
        asr     y0,a,a
        move    a1,x:(r7+$18)
        move    #>$1,x1
        move    x1,x:(r7+$19)
        bra     dr08
dr06:
        move    b1,a                    ; CIRC: 1 + k/8 concealed, k < 64
        asr     #3,a,a
        add     #<1,a
        move    #>$2,x1
        cmp     #>$40,b
        blt     dr07
        sub     #>$3f,b                 ; 16 (k - 63) muted, k >= 64
        asl     #4,b,b
        move    b1,a
        move    #>$3,x1
dr07:
        move    a1,x:(r7+$11)
        move    x1,x:(r7+$19)
dr08:
; ---- BITS: zones of 5k / 128: off, 5, 4, 3, 2 bits ---------------------------------
        move    x:(r6+$2),a
        and     #>$7f0000,a
        move    a1,x0
        move    #>$5,y0
        mpy     y0,x0,a
        move    a1,b                    ; the whole part only
        move    b1,x:(r7+$17)
        tst     b
        bne     dr09
        clr     a                       ; off: both coders start clean when it comes on
        move    a,x:(r7+$20)
        move    a,x:(r7+$21)
        move    a,x:(r7+$28)
        move    a,x:(r7+$29)
        bra     dr04
dr09:
        sub     #<1,b
        asl     #2,b,b
        add     #>$b2,b                 ; four words a depth, after W and S
        move    b1,n5
        move    x:(r7+$3),r5
        move    (r5)+n5
        move    p:(r5)+,x0
        move    x0,x:(r7+$22)           ; the quantiser's shift, 12 - bits
        move    x0,x:(r7+$2a)
        move    p:(r5)+,x0
        move    x0,x:(r7+$23)           ; the largest code, 2^(bits-1) - 1
        move    x0,x:(r7+$2b)
        move    p:(r5)+,x0
        move    x0,x:(r7+$25)           ; the dequantiser's shift, 25 - bits
        move    x0,x:(r7+$2d)
        move    p:(r5),x0
        move    x0,x:(r7+$26)           ; half the codes, 2^(bits-2)
        move    x0,x:(r7+$2e)
dr04:
; ---- FRZ: the chance a step freezes; 127 is every step ---------------------------
        move    x:(r6+$3),a
        and     #>$7fff00,a
        move    #>$7fffff,x1
        cmp     #>$7f0000,a
        tge     x1,a
        move    a1,x:(r7+$13)
; ---- FRM: 64 + 7.5k samples (1.5 to 23 ms) ----------------------------------------
        move    x:(r6+$4),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,b
        asl     #3,a,a
        sub     b,a
        asr     b
        add     b,a
        add     #>$40,a
        move    a1,x:(r7+$14)
; ---- MIX: k / 128, and 127 is the wet alone ----------------------------------------
        move    x:(r6+$5),a
        and     #>$7fff00,a
        move    #>$7fffff,x1
        cmp     #>$7f0000,a
        tge     x1,a
        move    a1,x:(r7+$16)
; ---- snap MIX's glide within 64 LSB -------------------------------------------------
        move    x:(r7+$15),x0
        move    x:(r7+$16),a
        move    a,x1
        sub     x0,a
        abs     a
        move    x0,b
        cmp     #>$40,a
        tlt     x1,b
        move    b,x:(r7+$15)

; ---- the frames ------------------------------------------------------------------------
        do      n7,>dr40
; MIX's glide, 1/32 a frame
        move    x:(r7+$15),x0
        move    x:(r7+$16),a
        sub     x0,a
        asr     #5,a,a
        add     x0,a
        move    a,x:(r7+$15)
; the dry frame
        move    x:(r0)+,x0
        move    x0,x:(r7+$1a)
        move    x:(r0)-,x0
        move    x0,x:(r7+$1b)
; the codec, per channel, or the dry itself
        move    x:(r7+$17),a
        tst     a
        bne     dr10
        move    x:(r7+$1a),x0
        move    x0,x:(r7+$1c)
        move    x:(r7+$1b),x0
        move    x0,x:(r7+$1d)
        bra     dr11
dr10:
        move    x:(r7+$1a),x1
        bsr     dr70
        move    a,x:(r7+$1c)
        move    x:(r7+$1b),x1
        lua     (r7+8),r7               ; the right channel's coder
        bsr     dr70
        lua     (r7-8),r7
        move    a,x:(r7+$1d)
dr11:
; noise: x = x * 1664525 + 1013904223 mod 2^24 (b0 carries the doubled product)
        move    x:(r7+$0),x0
        bsr     dr80
; the step clock: S frames a step, never more than a step left at this tempo
        move    x:(r7+$a),a
        move    x:(r7+$12),x1
        cmp     x1,a
        tgt     x1,a
        sub     #<1,a
        move    a1,x:(r7+$a)
        bgt     dr14
        move    x1,x:(r7+$a)            ; a step starts: the next in S frames
        move    x:(r7+$13),a
        tst     a
        beq     dr13                    ; FRZ 0: never (a is 0)
        move    x:(r7+$0),x0
        bsr     dr80                    ; a draw of its own
        clr     b
        move    x0,b1
        and     #>$7fffff,b             ; 0 .. 1 - 2^-23 (abs would make $800000 1.0)
        move    x:(r7+$13),x1
        clr     a
        move    #>$1,y1
        cmp     x1,b
        tle     y1,a                    ; a = 1: frozen
        move    x:(r7+$0),x0
        bsr     dr80                    ; a fresh word, so the error test below
        tst     a                       ; does not reuse the freeze's
        beq     dr13
        move    #>$1,a                  ; frozen: its first FRM frames, then looped
        move    x:(r7+$14),x1
        move    x1,x:(r7+$e)
        clr     b
        move    b,x:(r7+$c)
        move    b,x:(r7+$d)
dr13:
        move    a1,x:(r7+$b)
dr14:
; an error runs, or one starts at the chance p a frame
        move    x:(r7+$5),a
        tst     a
        bne     dr16
        move    x:(r7+$0),b
        abs     b
        move    x:(r7+$f),x1
        cmp     x1,b
        bge     dr20
        move    x:(r7+$11),a            ; it lasts SIZE's samples
        move    a1,x:(r7+$5)
        move    x:(r7+$19),x0
        move    x0,x:(r7+$6)
        move    x:(r7+$4),b             ; PCKT: the packet before, P frames back
        sub     a,b
        and     #>$1ff,b
        move    b1,x:(r7+$7)
        move    #>$7fffff,x0
        move    x0,x:(r7+$8)
        move    x:(r7+$18),x0
        move    x0,x:(r7+$9)
        move    x:(r7+$30),a            ; CIRC: the last good and its slope, per channel
        move    a,x:(r7+$36)
        move    x:(r7+$32),x0
        sub     x0,a
        move    a,x:(r7+$34)            ; limited
        move    x:(r7+$31),a
        move    a,x:(r7+$37)
        move    x:(r7+$33),x0
        sub     x0,a
        move    a,x:(r7+$35)
dr16:
        move    x:(r7+$5),a
        sub     #<1,a
        move    a1,x:(r7+$5)
        move    x:(r7+$6),a
        tst     a
        bne     dr17
; HOLD: the last good sample
        move    x:(r7+$30),x0
        move    x0,x:(r7+$1e)
        move    x:(r7+$31),x0
        move    x0,x:(r7+$1f)
        bra     dr22
dr17:
        cmp     #<1,a
        bne     dr18
; PCKT: the packet before, again, by a gain that falls to nothing across it
        move    x:(r7+$7),a
        asl     a
        move    x:(r7+$2),x0
        add     x0,a
        move    a1,r4
        move    x:(r7+$7),a
        add     #<1,a
        and     #>$1ff,a
        move    a1,x:(r7+$7)
        move    x:(r7+$8),y0
        move    y:(r4)+,x0
        mpy     y0,x0,a
        move    a,x:(r7+$1e)
        move    y:(r4),x0
        mpy     y0,x0,a
        move    a,x:(r7+$1f)
        move    x:(r7+$9),x0
        move    y0,a
        sub     x0,a
        move    #0,x1
        tmi     x1,a
        move    a,x:(r7+$8)
        bra     dr22
dr18:
        cmp     #<2,a
        bne     dr19
; CIRC, concealed: the last slope continued
        move    x:(r7+$36),a
        move    x:(r7+$34),x0
        add     x0,a
        move    a,x:(r7+$36)            ; limited
        move    x:(r7+$36),x0
        move    x0,x:(r7+$1e)
        move    x:(r7+$37),a
        move    x:(r7+$35),x0
        add     x0,a
        move    a,x:(r7+$37)
        move    x:(r7+$37),x0
        move    x0,x:(r7+$1f)
        bra     dr22
dr19:
; CIRC, a long burst: muted
        clr     a
        move    a,x:(r7+$1e)
        move    a,x:(r7+$1f)
        bra     dr22
; a good frame: e = c, and it is the last good one
dr20:
        move    x:(r7+$30),x0
        move    x0,x:(r7+$32)
        move    x:(r7+$31),x0
        move    x0,x:(r7+$33)
        move    x:(r7+$1c),x0
        move    x0,x:(r7+$30)
        move    x0,x:(r7+$1e)
        move    x:(r7+$1d),x0
        move    x0,x:(r7+$31)
        move    x0,x:(r7+$1f)
dr22:
; the ring keeps c, every frame
        move    x:(r7+$4),a
        asl     a
        move    x:(r7+$2),x0
        add     x0,a
        move    a1,r4
        move    x:(r7+$1c),x0
        move    x0,y:(r4)+
        move    x:(r7+$1d),x0
        move    x0,y:(r4)
        move    x:(r7+$4),a
        add     #<1,a
        and     #>$1ff,a
        move    a1,x:(r7+$4)
; a frozen step: its first frame passes and is kept, then loops
        move    x:(r7+$b),a
        tst     a
        beq     dr30
        move    x:(r7+$c),a
        asl     a
        move    x:(r7+$2),x0
        add     x0,a
        add     #>$400,a
        move    a1,r4
        move    x:(r7+$d),a
        tst     a
        bne     dr24
        move    x:(r7+$1e),x0
        move    x0,y:(r4)+
        move    x:(r7+$1f),x0
        move    x0,y:(r4)
        bra     dr26
dr24:
        move    y:(r4)+,x0
        move    x0,x:(r7+$1e)
        move    y:(r4),x0
        move    x0,x:(r7+$1f)
dr26:
        move    x:(r7+$c),a
        add     #<1,a
        move    x:(r7+$e),x0
        cmp     x0,a
        blt     dr28
        clr     a
        move    #>$1,x0
        move    x0,x:(r7+$d)
dr28:
        move    a1,x:(r7+$c)
dr30:
; out = x + MIX (f - x), per channel
        move    x:(r7+$15),y0
        move    x:(r7+$1e),b
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
        move    x:(r7+$1f),b
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
dr40:
        rts

; ---- the ADPCM: an adaptive quantiser on the error from a leaky prediction ----------------
; CODEC ECHO's coder (a copy: modules share no code), on the block at r7 + $20.
; In: x1 = the sample. Out: a = the decoded sample, which is also the next prediction p.
; G.726-like in its rates (2 to 5 bits a sample) and IMA-like in its 89 step sizes, each
; 1.1 times the last. The code m is |x - p| in units of step / 2^(bits-2), rounded (a
; mid-tread quantiser: a small error codes as 0 and changes nothing), up to 2^(bits-1) - 1;
; p moves by m of those units, signed. The step index falls by 1 on the lower half of the
; codes and rises by 2, 4, 6 ... on the upper half (IMA's rule, for any depth). p leaks
; 1/64 a sample toward 0 and is 0 under 64 LSB, so silence decodes to exact silence.
; Uses a, b, x0, x1, y0, y1, r5, n5; reads the tables through $27.
dr70:
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
        move    x:(r7+$21),a            ; W[i] = 1 / (8192 step[i]), at +0
        move    a1,n5
        move    x:(r7+$27),r5
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

; ---- the noise: x0 = the next LCG value, also kept at $00; uses b, x1, y0, y1 ----------
dr80:
        move    #>$0cb306,y0
        mpy     y0,x0,b
        move    #0,x1
        add     x,b
        move    #>$6ef35f,y0
        move    #0,y1
        add     y,b
        move    b0,x0
        move    x0,x:(r7+$0)
        rts

; ---- a table entry, interpolated by the knob's LFO fraction -------------------------
; In: a = the knob word, x1 = the table's offset. Out: a = T[k] + f (T[k+1] - T[k]).
; Uses b, x0, y0, y1, r5, n5.
dr90:
        and     #>$7fff00,a
        move    a1,y1
        asr     #$10,a,a
        add     x1,a
        move    a1,n5
        move    y1,a
        and     #>$00ff00,a
        asl     #$7,a,a
        move    a1,x0
        move    x:(r7+$3),r5
        move    (r5)+n5
        move    p:(r5)+,y0
        move    p:(r5),b
        move    y0,a
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     y0,a
        rts
