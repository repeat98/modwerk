; CYCLES_FORWARD_BRANCHES
; ---------------------------------------------------------------------------
; GHOST CUT -- a microlooper: GRAB freezes a tempo-synced piece of the track
; and loops it. ENG TAPE: at RATE, pitch and speed together. ENG GRAIN: the
; playhead moves at RATE while two grains, half a grain apart, read at PTCH's
; ratio from it (triangular windows that sum to one), so pitch and time part.
; Proven against modules/ghost-cut/ghost_cut_ref.py (verify.py).
;
; Insert contract: frames in place at x:(r0) / x:(r0+n0), knobs from r6,
; state in the r7 block. init reads the allocator base (the instance's entry
; at x:(x:$213), valid at init only). A base of $4000 or more is an FX2 slot:
; a mono ring of $3dfe words from the base, so it ends at +$3DFD, short of
; Sidechain Compressor's key window. FX2 bases are 16K-aligned, so the ring
; is an AGU modulo ring (m = $3dfd). A smaller (FX1) slot passes dry.
;
; After init the ring is cleared 128 words a block (124 blocks, the frames
; pass dry meanwhile); modulo addressing keeps the last chunk inside it.
;
; The seam is baked into the ring once a GRAB: over eight blocks (BAKE, the
; frames dry), the loop's last 256 samples are blended toward the 256 before
; its start, and its first sample is written once more after its end. Every
; read is then a plain interpolation that runs on across the loop's end. The
; loop starts 112 samples in, where it would be had it played since GRAB.
;
; Knobs: LEN slot 0, GRAB 1, RATE 2, PTCH 3, MIX 5 (r6+$0..$5, knob in bits
; 16-23); ENG slot 6 (r6+$c bits 16-23), CAPT 7 (r6+$c bits 8-15), GRN 8
; (r6+$d bits 16-23), DIR 10 (r6+$e bits 16-23); tempo24 << 8 at r6+$13.
;
; DRFT puts a second read head DRFT x L/2 after the first, swinging as a
; triangle over MOTN bars from GRAB on (tempo-synced, ramped a sample at a
; time). TAPE plays the first head left and the second right; GRAIN reads its
; second grain at the second head.
;
; The r7 block ($00..$3f, all zeroed at init):
;   $00 ring base               $01 live (1: an FX2-sized slot)
;   $02 clear chunks left       $03 state: 0 idle, 1 rec, 2 bake, 3 loop, 4 release
;   $04 GRAB latch              $05 write index w
;   $06 loop start S            $07 loop length L
;   $08/$09 play position p, integer and fraction
;   $0a PEND: 1 while moving back
;   $0b loop envelope e         $0c MIX run       $0d MIX step
;   $0e MAN countdown           $0f RATE, Q20 (glided)
;   $10/$11 increment, integer and fraction
;   $12 L for the next GRAB     $13 CAPT          $14 DIR
;   $15 primed                  $16 P table base
;   $17 BAKE: words done        $18 L - 1 (the pendulum's end)
;   $19 wet                     $1a scratch
;   $1b ring base + S (the loop's start)
;   $1c/$1d scratch             $1f grain 1's share
;   $20 grain phase step, Q22   $21/$22 grain offset step, integer and fraction
;   $23 grain 1 phase (Q22)     $24/$25 grain 1 offset
;   $26 grain 2 phase           $27/$28 grain 2 offset
;   $29 running engine          $2a ENG           $2b duck (ENG differs)
;   $2c PTCH, Q20 (glided)      $2d tempo24 (clamped)
;   $2e/$2f the drift's phase (48-bit, cycle 2^45)
;   $30/$31 the second head's offset D (48-bit)    $32/$33 D's step a sample
;   $34 wet, right              $1e, $35..$3f free
;
; Every mpy is `mpy x0,y1` (AGENTS.md). AND and ASL leave A2 stale: values
; leave through a1. Labels are gc and two characters, so none is another's
; prefix. No rep; every branch is forward.
; ---------------------------------------------------------------------------

init:
; ---- every slot to zero, through r5 (r1 holds the effect id)
        clr     a
        move    r7,r5
        move    #>$ffffff,m5
        do      #$40,>gc00
        move    a,x:(r5)+
gc00:
        nop
; ---- the allocator base, and the FX2 decision
        move    x:>$213,r4
        move    #>$ffffff,m4
        nop
        move    x:(r4),x0
        move    x0,x:(r7+$00)
        move    x0,a
        move    #>$4000,x0
        sub     x0,a                    ; base - $4000
        clr     b                       ; b = 0 BEFORE the tst
        move    #>$1,x0
        tst     a
        tpl     x0,b                    ; an FX2 slot: live
        move    b,x:(r7+$01)
        move    #>$7c,x0                ; 124 chunks of 128 words
        move    x0,x:(r7+$02)
        rts

; ===========================================================================
proc:
; ===========================================================================
        move    x:(r7+$01),a
        tst     a
        beq     gcZZ                    ; not an FX2 slot: the frames pass dry
; ---- clearing the ring, a chunk a block
        move    x:(r7+$02),a
        tst     a
        beq     gc02
        sub     #>$1,a
        move    a1,x:(r7+$02)
        asl     #$7,a,a                 ; chunk * 128
        move    x:(r7+$00),x0
        add     x0,a
        move    a1,r4
        move    #>$3dfd,m4
        clr     a
        nop
        do      #$80,>gc01
        move    a,y:(r4)+
gc01:
        nop
        move    #>$ffffff,m4
        rts
gc02:
        move    #>$ffffff,m1
        move    #>$ffffff,m4
        move    #>$ffffff,m5
        move    #>$fab1e0,r5            ; the ptable's base, placed by the build
        move    r5,x:(r7+$16)
; ---- CAPT: slot 7, bits 8-15, at most 2
        move    x:(r6+$c),a
        and     #>$007f00,a
        asr     #$8,a,a
        move    #>$2,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,x:(r7+$13)
; ---- DIR: slot 10, bits 16-23, at most 2
        move    x:(r6+$e),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>$2,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,x:(r7+$14)
; ---- LEN and the tempo: L = N / tempo24, halved until it fits
        move    x:(r6+$0),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>$7,x0
        cmp     x0,a
        tgt     x0,a
        asl     #$1,a,a
        add     #>$21,a                 ; LEN's pairs follow RATE's 33 points
        move    x:(r7+$16),x0
        add     x0,a
        move    a1,r5
        move    x:(r6+$13),b
        asr     #$8,b,b
        move    b1,x0
        move    x0,b                    ; tempo24, clean
        move    #>$2d0,x0               ; under 30 BPM (or none): 120 BPM
        cmp     x0,b
        move    #>$b40,x0
        tlt     x0,b
        move    #>$1c20,x0              ; over 300 BPM: 300
        cmp     x0,b
        tgt     x0,b
        move    b1,x0                   ; the divisor
        move    b1,x:(r7+$2d)
        move    p:(r5)+,y0              ; N's high word
        move    p:(r5),b                ; ... and its low word
        move    b,x:(r7+$1a)
        move    y0,a
        move    x:(r7+$1a),a0
        andi    #$fe,ccr
        do      #$18,>gc03              ; do, not rep
        div     x0,a
gc03:
        move    a0,x0                   ; the quotient
        move    x0,a                    ; clean: a0 = 0
        do      #$4,>gc04
        move    a1,b
        asr     #$1,b,b
        move    b1,x0                   ; L / 2, floored
        cmp     #>$3cee,a               ; over LMAX (15,598): halve
        tgt     x0,a
gc04:
        nop
        move    a1,x:(r7+$12)
; ---- RATE: the table, then a glide of 1/16 a block, snapped within 16
        move    x:(r7+$16),r5
        move    x:(r6+$2),a
        bsr     gcTB
        move    a1,x0                   ; the target, Q20
        move    x:(r7+$15),a
        tst     a
        move    x:(r7+$0f),b            ; rq (moves keep the flags)
        teq     x0,b                    ; unprimed: on the target
        move    x0,a                    ; clean
        sub     b,a                     ; t - rq
        move    a,y1
        asr     #$4,a,a
        add     a,b                     ; rq + (t - rq) / 16, in b1
        move    y1,a                    ; clean
        abs     a
        cmp     #>$10,a
        tlt     x0,b                    ; within 16: on the target
        move    b1,x:(r7+$0f)
        move    b1,a                    ; clean
        asr     #$14,a,a                ; integer in a1, fraction in a0
        move    a1,x:(r7+$10)
        move    a0,x:(r7+$11)
; ---- MIX: the run glides 1/8 of the way a block, straight within it
        move    x:(r6+$5),a
        and     #>$7fff00,a
        move    #>$7f0000,x0
        cmp     x0,a                    ; k - 127
        move    #>$7fffff,x0
        tge     x0,a                    ; 127: the loop outright
        move    a1,x0                   ; the target
        move    x:(r7+$15),a
        tst     a
        move    x:(r7+$0c),b
        teq     x0,b                    ; unprimed: on the target
        move    b1,x:(r7+$0c)
        move    x0,a                    ; clean
        sub     b,a
        move    a,y1
        abs     a
        cmp     #>$80,a
        bge     gc05
        move    x0,x:(r7+$0c)           ; within 128: on the target
        clr     a
        move    a,x:(r7+$0d)
        bra     gc06
gc05:
        move    y1,a
        asr     #$7,a,a
        move    a,x:(r7+$0d)
gc06:
; ---- GRAB: grab at 96 or more, release at 32 or less
        move    x:(r6+$1),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,y0
        move    x:(r7+$04),b
        tst     b
        bne     gc10
        move    y0,a                    ; clean
        cmp     #>$60,a
        blt     gc1F
        move    #>$1,x0
        move    x0,x:(r7+$04)
        bsr     gcGR
        bra     gc1F
gc10:
        move    y0,a
        cmp     #>$20,a
        bgt     gc1F
        clr     b
        move    b,x:(r7+$04)
        bsr     gcRL
gc1F:
; ---- BAKE: the seam into the ring, 32 words a block, g = j / 256
        move    x:(r7+$03),a
        cmp     #>$2,a
        bne     gcB9
        move    x:(r7+$00),x0
        move    x:(r7+$06),a
        add     x0,a
        move    a,r4
        move    a1,r5
        move    x:(r7+$07),a
        sub     #>$100,a
        move    x:(r7+$17),x0
        add     x0,a
        move    a1,n4                   ; L - 256 + j: the loop's tail
        move    x0,a
        sub     #>$100,a
        move    a1,n5                   ; j - 256: the pre-roll
        move    #>$3dfd,m4
        move    #>$3dfd,m5
        move    x0,a
        asl     #$f,a,a
        move    a1,x0                   ; g
        move    (r4)+n4
        move    (r5)+n5
        do      #$20,>gcB1
        move    y:(r4),b                ; tail
        move    y:(r5),a                ; pre-roll
        move    (r5)+
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,y:(r4)+               ; tail + g (pre-roll - tail)
        move    x0,b
        add     #>$8000,b
        move    b,x0
gcB1:
        nop
        move    x:(r7+$17),a
        add     #>$20,a
        move    a1,x:(r7+$17)
        cmp     #>$100,a
        blt     gcB8
; baked: the loop's first sample once more after its end, then loop
        move    x:(r7+$00),x0
        move    x:(r7+$06),a
        add     x0,a
        move    a,r4
        move    x:(r7+$07),a
        move    a1,n4
        nop
        move    y:(r4),a
        move    (r4)+n4
        move    a,y:(r4)+
; p where the loop would be had it played since GRAB: 112 increments in
        move    x:(r7+$10),x1
        move    x:(r7+$11),x0
        move    x:(r7+$10),a
        move    x:(r7+$11),a0
        asl     #$3,a,a
        neg     a
        add     x,a
        neg     a
        asl     #$4,a,a                 ; 112 inc: (8 - 1) * 16
        move    x:(r7+$14),b
        cmp     #>$1,b
        bne     gcB7
        neg     a                       ; REV: L - 112 inc
        move    x:(r7+$07),x0
        add     x0,a
gcB7:
        move    a1,x:(r7+$08)
        move    a0,x:(r7+$09)
        clr     b
        move    b,x:(r7+$0a)
        move    b,x:(r7+$2e)            ; the drift from 0
        move    b,x:(r7+$2f)
        move    b,x:(r7+$30)
        move    b,x:(r7+$31)
        move    b,x:(r7+$32)
        move    b,x:(r7+$33)
        move    #>$3,x0
        move    x0,x:(r7+$03)           ; loop
gcB8:
        move    #>$ffffff,m4
        move    #>$ffffff,m5
gcB9:
; ---- the pendulum's end, from the loop's L
        move    x:(r7+$07),a
        sub     #>$1,a
        move    a1,x:(r7+$18)
; ---- ENG: slot 6, at most 1
        move    x:(r6+$c),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    #>$1,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,x:(r7+$2a)
; ---- PTCH: semitones k - 64, clamped to +-24, the fraction between them
        clr     b
        move    x:(r6+$3),a
        and     #>$7fff00,a
        sub     #>$280000,a             ; - 40
        tlt     b,a                     ; under -24: -24
        move    #>$300000,x0            ; 48
        cmp     x0,a
        tgt     x0,a                    ; over +24: +24
        move    a1,x1
        move    x1,a
        asr     #$10,a,a
        move    a1,n5                   ; the semitone, 0..48
        move    x1,a
        and     #>$00ff00,a
        asl     #$f,a,a
        move    a1,x0                   ; the fraction, Q23
        move    x:(r7+$16),a
        add     #>$31,a                 ; PTCH's 50 points follow LEN's pairs
        move    a1,r5
        nop
        move    (r5)+n5
        move    p:(r5)+,y0
        move    p:(r5),b
        move    y0,a
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     y0,a                    ; the ratio, Q20
        move    a1,x0
        move    x:(r7+$15),a
        tst     a
        move    x:(r7+$2c),b
        teq     x0,b                    ; unprimed: on the target
        move    x0,a
        sub     b,a
        move    a,y1
        asr     #$4,a,a
        add     a,b
        move    y1,a
        abs     a
        cmp     #>$10,a
        tlt     x0,b
        move    b1,x:(r7+$2c)
; ---- a grain's offset moves PTCH - RATE a sample (48-bit)
        move    x:(r7+$2c),a
        move    x:(r7+$0f),x0
        sub     x0,a
        asr     #$14,a,a
        move    a1,x:(r7+$21)
        move    a0,x:(r7+$22)
; ---- GRN: 441 + 24 k samples, at most a quarter of the loop, at least 64
        move    x:(r6+$d),a
        and     #>$7f0000,a
        asr     #$10,a,a
        move    a1,b
        asl     #$1,a,a
        add     b,a
        asl     #$3,a,a
        add     #>$1b9,a
        move    x:(r7+$07),b
        asr     #$2,b,b
        move    b1,x0
        cmp     x0,a
        tgt     x0,a
        cmp     #>$40,a
        move    #>$40,x0
        tlt     x0,a
        move    a1,x0                   ; G
        move    #>$800000,y0
        move    y0,x:(r7+$1c)
        clr     a
        move    x:(r7+$1c),a0           ; 2^23: the div leaves 2^22 / G
        andi    #$fe,ccr
        do      #$18,>gcD1
        div     x0,a
gcD1:
        move    a0,x0
        move    x0,x:(r7+$20)           ; the phase step, Q22
; ---- the engine: idle, recording or baking, it follows ENG at once; looping,
; once the duck has taken the loop out (e = 0). Grains start half a grain apart.
        move    x:(r7+$03),a
        cmp     #>$3,a
        blt     gcE1
        bgt     gcE9
        move    x:(r7+$0b),b
        tst     b
        bne     gcE9
        move    x:(r7+$29),b
        move    x:(r7+$2a),x0
        cmp     x0,b
        beq     gcE9
gcE1:
        move    x:(r7+$2a),x0
        move    x0,x:(r7+$29)
        clr     a
        move    a,x:(r7+$23)
        move    a,x:(r7+$24)
        move    a,x:(r7+$25)
        move    a,x:(r7+$27)
        move    a,x:(r7+$28)
        move    #>$200000,x0
        move    x0,x:(r7+$26)
gcE9:
        clr     b
        move    x:(r7+$29),a
        move    x:(r7+$2a),x0
        sub     x0,a
        move    #>$1,x0
        tne     x0,b                    ; ENG differs from the running engine: duck
        move    b1,x:(r7+$2b)
; ---- DRFT and MOTN, while looping: D = DRFT x L/2 x a triangle over MOTN bars
        move    x:(r7+$03),a
        cmp     #>$3,a
        blt     gcF9
        move    x:(r6+$d),a
        and     #>$007f00,a
        asr     #$8,a,a                 ; MOTN, at most 7
        move    #>$7,x0
        cmp     x0,a
        tgt     x0,a
        move    a1,n5
        move    x:(r7+$16),a
        add     #>$63,a                 ; MOTN's 8 points follow PTCH's
        move    a1,r5
        nop
        move    (r5)+n5
        move    p:(r5),y1               ; K
        move    x:(r7+$2d),x0
        mpy     x0,y1,a                 ; a block's step: tempo24 x 2K, 48-bit
        move    a1,x1
        move    a0,x0
        move    x:(r7+$2e),a
        move    x:(r7+$2f),a0
        add     x,a
        move    #>$200000,x0
        cmp     x0,a
        blt     gcF1
        sub     x0,a                    ; one cycle round
gcF1:
        move    a1,x:(r7+$2e)
        move    a0,x:(r7+$2f)
        move    a1,x0
        move    #>$200000,b
        sub     x0,b
        cmp     x0,b
        tgt     x0,b                    ; the triangle: min(h, cycle - h)
        asl     #$3,b,b
        move    b,x0                    ; ... Q23, at most full
        move    x:(r6+$4),a
        and     #>$7fff00,a
        move    a1,y1                   ; DRFT
        mpy     x0,y1,a
        move    a,x0
        move    x:(r7+$07),a
        asr     #$1,a,a
        move    a1,y1                   ; L / 2
        mpy     x0,y1,a                 ; the target offset, 48-bit samples
        move    x:(r7+$30),x1
        move    x:(r7+$31),x0
        neg     a
        add     x,a
        neg     a                       ; target - D
        asr     #$4,a,a                 ; ... a sixteenth of it a sample
        move    a1,x:(r7+$32)
        move    a0,x:(r7+$33)
gcF9:
        move    #>$1,x0
        move    x0,x:(r7+$15)           ; primed
; ---- the pointers: r4 writes, r5 reads from the loop's start
        move    x:(r7+$00),x0
        move    x:(r7+$05),a
        add     x0,a
        move    a,r4
        move    x:(r7+$06),a
        add     x0,a
        move    a1,x:(r7+$1b)
        move    #>$3dfd,m4
        move    #>$3dfd,m5
        move    #$1,n0
        nop
        do      n7,>gcLE
; ---- the MIX run
        move    x:(r7+$0d),x0
        move    x:(r7+$0c),a
        add     x0,a
        move    a1,x:(r7+$0c)
; MODEFORK_BEGIN: one job a sample -- record, loop on TAPE or loop on GRAIN
        move    x:(r7+$03),a
        cmp     #>$2,a
        blt     gcW0
        beq     gcNB                    ; baking: neither, the frame stays dry
        move    x:(r7+$29),b
        tst     b
        bne     gcK0
; MODEFORK_MID: TAPE
        move    x:(r7+$10),x1
        move    x:(r7+$11),x0           ; the increment, x1:x0
        move    x:(r7+$08),a
        move    x:(r7+$09),a0           ; p
        move    x:(r7+$14),b
        tst     b
        beq     gcT0
        cmp     #>$1,b
        beq     gcT1
        move    x:(r7+$0a),b            ; PEND
        tst     b
        bne     gcT2
        add     x,a
        move    x:(r7+$18),x0           ; L - 1
        cmp     x0,a
        blt     gcT9
        neg     a                       ; reflect: 2 (L - 1) - p
        add     x0,a
        add     x0,a
        move    #>$1,y1
        move    y1,x:(r7+$0a)
        bra     gcT9
gcT2:
        neg     a
        add     x,a
        neg     a
        tst     a
        bge     gcT9
        neg     a
        clr     b
        move    b,x:(r7+$0a)
        bra     gcT9
gcT0:
        add     x,a                     ; FWD
        move    x:(r7+$07),x0
        cmp     x0,a
        blt     gcT9
        sub     x0,a
        bra     gcT9
gcT1:
        neg     a                       ; REV: p - inc, as -(inc - p)
        add     x,a
        neg     a
        tst     a
        bge     gcT9
        move    x:(r7+$07),x0
        add     x0,a
gcT9:
        move    a1,x:(r7+$08)
        move    a0,x:(r7+$09)
        move    a1,n5
        move    x:(r7+$09),a
        lsr     #$1,a                   ; the fraction, Q23
        move    a1,x0
        move    x:(r7+$1b),r5
        nop
        move    (r5)+n5
        move    y:(r5),b                ; s0
        move    (r5)+                   ; the modulo wraps
        move    y:(r5),a                ; s1 (past the end: the baked copy of the start)
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,x:(r7+$19)            ; wet, left
        move    x:(r7+$30),a            ; D, one step on
        move    x:(r7+$31),a0
        move    x:(r7+$32),x1
        move    x:(r7+$33),x0
        add     x,a
        move    a1,x:(r7+$30)
        move    a0,x:(r7+$31)
        move    x:(r7+$08),x1
        move    x:(r7+$09),x0
        add     x,a                     ; the second head: p + D
        move    x:(r7+$07),x0
        cmp     x0,a
        blt     gcV0
        sub     x0,a
gcV0:
        bsr     gcRD
        move    a,x:(r7+$34)            ; wet, right
        bra     gcEN
; MODEFORK_MID: GRAIN
gcK0:
        move    x:(r7+$10),x1
        move    x:(r7+$11),x0           ; the increment, x1:x0
        move    x:(r7+$08),a
        move    x:(r7+$09),a0           ; p
        move    x:(r7+$14),b
        tst     b
        beq     gcU0
        cmp     #>$1,b
        beq     gcU1
        move    x:(r7+$0a),b            ; PEND
        tst     b
        bne     gcU2
        add     x,a
        move    x:(r7+$18),x0           ; L - 1
        cmp     x0,a
        blt     gcU9
        neg     a                       ; reflect: 2 (L - 1) - p
        add     x0,a
        add     x0,a
        move    #>$1,y1
        move    y1,x:(r7+$0a)
        bra     gcU9
gcU2:
        neg     a
        add     x,a
        neg     a
        tst     a
        bge     gcU9
        neg     a
        clr     b
        move    b,x:(r7+$0a)
        bra     gcU9
gcU0:
        add     x,a                     ; FWD
        move    x:(r7+$07),x0
        cmp     x0,a
        blt     gcU9
        sub     x0,a
        bra     gcU9
gcU1:
        neg     a                       ; REV: p - inc, as -(inc - p)
        add     x,a
        neg     a
        tst     a
        bge     gcU9
        move    x:(r7+$07),x0
        add     x0,a
gcU9:
        move    a1,x:(r7+$08)
        move    a0,x:(r7+$09)
        move    x:(r7+$30),a            ; D, one step on
        move    x:(r7+$31),a0
        move    x:(r7+$32),x1
        move    x:(r7+$33),x0
        add     x,a
        move    a1,x:(r7+$30)
        move    a0,x:(r7+$31)
        move    x:(r7+$23),a           ; the phase, one step on
        move    x:(r7+$20),x0
        add     x0,a
        move    #>$400000,x0
        cmp     x0,a
        blt     gcKa
        sub     x0,a                    ; a new grain: from the playhead again
        clr     b
        move    b,x:(r7+$24)
        move    b,x:(r7+$25)
gcKa:
        move    a1,x:(r7+$23)
        move    x:(r7+$24),a
        move    x:(r7+$25),a0
        move    x:(r7+$21),x1
        move    x:(r7+$22),x0
        add     x,a                     ; the offset, one step on
        move    a1,x:(r7+$24)
        move    a0,x:(r7+$25)
        move    x:(r7+$08),x1
        move    x:(r7+$09),x0
        add     x,a                     ; playhead + offset
        move    x:(r7+$07),x0
        cmp     x0,a                    ; into the loop: grains under L / 4 need one step
        blt     gcKb
        sub     x0,a
gcKb:
        tst     a
        bge     gcKc
        add     x0,a
gcKc:
        bsr     gcRD
        move    a,y1                    ; the tap
        move    x:(r7+$23),x0
        move    #>$400000,b
        sub     x0,b
        cmp     x0,b
        tgt     x0,b                    ; min(phase, 1 - phase)
        asl     #$2,b,b
        move    b,x0                    ; the window, at most full
        mpy     x0,y1,a
        move    a,x:(r7+$1f)
        move    x:(r7+$26),a           ; the phase, one step on
        move    x:(r7+$20),x0
        add     x0,a
        move    #>$400000,x0
        cmp     x0,a
        blt     gcKd
        sub     x0,a                    ; a new grain: from the playhead again
        clr     b
        move    b,x:(r7+$27)
        move    b,x:(r7+$28)
gcKd:
        move    a1,x:(r7+$26)
        move    x:(r7+$27),a
        move    x:(r7+$28),a0
        move    x:(r7+$21),x1
        move    x:(r7+$22),x0
        add     x,a                     ; the offset, one step on
        move    a1,x:(r7+$27)
        move    a0,x:(r7+$28)
        move    x:(r7+$08),x1
        move    x:(r7+$09),x0
        add     x,a                     ; playhead + offset
        move    x:(r7+$30),x1
        move    x:(r7+$31),x0
        add     x,a                     ; ... at the drifted head
        move    x:(r7+$07),x0
        cmp     x0,a                    ; into the loop: up to two steps with D
        blt     gcKe
        sub     x0,a
        cmp     x0,a
        blt     gcKe
        sub     x0,a
gcKe:
        tst     a
        bge     gcKf
        add     x0,a
gcKf:
        bsr     gcRD
        move    a,y1                    ; the tap
        move    x:(r7+$26),x0
        move    #>$400000,b
        sub     x0,b
        cmp     x0,b
        tgt     x0,b                    ; min(phase, 1 - phase)
        asl     #$2,b,b
        move    b,x0                    ; the window, at most full
        mpy     x0,y1,a
        move    x:(r7+$1f),y0
        add     y0,a
        move    a,x:(r7+$19)            ; wet: the two grains
        move    a,x:(r7+$34)            ; ... on both sides
        bra     gcEN
; MODEFORK_MID: record, while idle (not CAPT OFF) or recording
gcW0:
        tst     a
        bne     gcW1                    ; recording: always write
        move    x:(r7+$13),b
        cmp     #>$2,b
        beq     gcNB                    ; CAPT OFF: the ring keeps what it holds
gcW1:
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     #$1,a,a                 ; the mono sum, (l + r) / 2
        move    a,y:(r4)+
        move    x:(r7+$03),a
        tst     a
        beq     gcNB
        move    x:(r7+$0e),a
        sub     #>$1,a
        move    a1,x:(r7+$0e)
        bne     gcNB
        move    #>$2,x0                 ; recorded: bake, then loop
        move    x0,x:(r7+$03)
        clr     a
        move    a,x:(r7+$17)
        bra     gcNB
; MODEFORK_END
gcEN:
; the envelope, branchless: up while looping (at most full), down while
; releasing or ducking; at 0 the release ends and the ring records again
        move    x:(r7+$0b),a
        move    a,b
        add     #>$8000,b
        move    #>$7fffff,x0
        cmp     x0,b
        tgt     x0,b
        move    b1,x1                   ; up
        sub     #>$8000,a               ; down
        move    a,x0
        move    x:(r7+$03),b
        cmp     #>$4,b
        tne     x1,a                    ; looping: up
        move    x:(r7+$2b),b
        tst     b
        tne     x0,a                    ; ... unless ENG changed: the duck
        tst     a
        bgt     gc42
        clr     a
        move    x:(r7+$03),b
        cmp     #>$4,b
        bne     gc42                    ; the duck stays looping
        move    a,x:(r7+$03)            ; the release ends: idle
gc42:
        move    a1,x:(r7+$0b)
gcNB:
; ---- dry + run e (wet - dry); while e = 0 the frame stays exact
        move    x:(r7+$0c),x0
        move    x:(r7+$0b),y1
        mpy     x0,y1,a
        move    a,x1                    ; m
        move    x:(r0),b
        move    x:(r7+$19),a
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        move    x1,x0
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,x:(r0)
        move    x:(r0+n0),b
        move    x:(r7+$34),a            ; the right side's wet
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,x:(r0+n0)
        move    (r0)+n0
        move    (r0)+n0
gcLE:
        nop
        move    r4,a
        move    x:(r7+$00),x0
        sub     x0,a
        move    a1,x:(r7+$05)           ; w
        move    #>$ffffff,m4
        move    #>$ffffff,m5
gcZZ:
        rts

; ---------------------------------------------------------------------------
; gcGR -- GRAB. Releasing: loop again. Idle: AUTO and OFF bake and loop the
; last L (S = w - L), MAN records the next L first (S = w).
; ---------------------------------------------------------------------------
gcGR:
        move    x:(r7+$03),a
        cmp     #>$4,a
        bne     gcG1
        move    #>$3,x0
        move    x0,x:(r7+$03)
        rts
gcG1:
        tst     a
        bne     gcG9
        move    x:(r7+$12),x0
        move    x0,x:(r7+$07)           ; L
        move    x:(r7+$13),b
        cmp     #>$1,b
        bne     gcG3
        move    x:(r7+$05),y0
        move    y0,x:(r7+$06)           ; MAN: S = w
        move    x0,x:(r7+$0e)
        move    #>$1,y0
        move    y0,x:(r7+$03)
        rts
gcG3:
        move    x:(r7+$05),a
        sub     x0,a                    ; w - L
        bge     gcG4
        add     #>$3dfe,a
gcG4:
        move    a1,x:(r7+$06)
        clr     a
        move    a,x:(r7+$17)
        move    #>$2,y0
        move    y0,x:(r7+$03)           ; bake
gcG9:
        rts

; ---------------------------------------------------------------------------
; gcRL -- release. Looping: fade out. Recording or baking: back to idle.
; ---------------------------------------------------------------------------
gcRL:
        move    x:(r7+$03),a
        cmp     #>$3,a
        bne     gcR1
        move    #>$4,x0
        move    x0,x:(r7+$03)
        rts
gcR1:
        cmp     #>$4,a
        beq     gcR9
        clr     a
        move    a,x:(r7+$03)
gcR9:
        rts

; ---------------------------------------------------------------------------
; gcRD -- a = a loop position (48-bit: integer in a1, fraction in a0) ->
; a = the loop there, linearly interpolated (the seam is baked in).
; Straight-line. Uses b x0 y1 r5 n5, $1d.
; ---------------------------------------------------------------------------
gcRD:
        move    a1,n5
        move    a0,x:(r7+$1d)
        move    x:(r7+$1d),a
        lsr     #$1,a                   ; the fraction, Q23
        move    a1,x0
        move    x:(r7+$1b),r5
        nop
        move    (r5)+n5
        move    y:(r5),b
        move    (r5)+
        move    y:(r5),a
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        rts

; ---------------------------------------------------------------------------
; gcTB -- adapted from VIBRATO's vb_tab (Bryan T, MIT; LICENSE).
; a = a knob word, r5 -> a 33-word P table -> a1 = T[i] + f (T[i+1]
; - T[i]), i = bits 22-18 (k >> 2), f = bits 17-8 (k & 3 and the LFO's
; fraction), Q23. Uses x0 x1 y0 y1 b n5; r5 moves.
; ---------------------------------------------------------------------------
gcTB:
        and     #>$7fff00,a
        move    a1,x1
        move    x1,a
        asr     #$12,a,a
        move    a1,n5
        move    x1,a
        and     #>$03ff00,a
        asl     #$5,a,a
        move    a1,x0
        move    (r5)+n5
        move    p:(r5)+,y0
        move    p:(r5),b
        move    y0,a
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     y0,a
        rts
