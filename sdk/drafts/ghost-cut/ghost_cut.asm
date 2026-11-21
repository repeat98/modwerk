; CYCLES_FORWARD_BRANCHES
; ---------------------------------------------------------------------------
; GHOST CUT -- a microlooper: GRAB freezes a tempo-synced piece of the track
; and loops it at RATE (milestone A: the TAPE engine, pitch and speed together).
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
; Knobs: LEN slot 0, GRAB 1, RATE 2, MIX 5 (r6+$0..$5, knob in bits 16-23);
; CAPT slot 7 (r6+$c bits 8-15), DIR slot 10 (r6+$e bits 16-23); the tempo
; word tempo24 << 8 at r6+$13.
;
; The r7 block ($00..$1f, all zeroed at init):
;   $00 ring base               $01 live (1: an FX2-sized slot)
;   $02 clear chunks left       $03 state: 0 idle, 1 rec, 2 loop, 3 release
;   $04 GRAB latch              $05 write index w
;   $06 loop start S            $07 loop length L
;   $08/$09 play position p, integer and fraction
;   $0a PEND: 1 while moving back
;   $0b loop envelope e         $0c MIX run       $0d MIX step
;   $0e MAN countdown           $0f RATE, Q20 (glided)
;   $10/$11 increment, integer and fraction
;   $12 L for the next GRAB     $13 CAPT          $14 DIR
;   $15 primed                  $16 P table base
;   $17 L - 256 (the seam)      $18 L - 1 (the pendulum's end)
;   $19 wet                     $1a scratch
;   $1b ring base + S (the loop's start)            $1c..$1f free
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
        do      #$20,>gc00
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
; ---- the seam's start and the pendulum's end, from the loop's L
        move    x:(r7+$07),a
        sub     #>$100,a
        move    a1,x:(r7+$17)
        move    x:(r7+$07),a
        sub     #>$1,a
        move    a1,x:(r7+$18)
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
; ---- A: the MIX run
        move    x:(r7+$0d),x0
        move    x:(r7+$0c),a
        add     x0,a
        move    a1,x:(r7+$0c)
; ---- B: the ring write while idle or recording, and MAN's countdown
        move    x:(r7+$03),a
        cmp     #>$2,a
        bge     gc2F
        tst     a
        bne     gc21                    ; recording: always write
        move    x:(r7+$13),b
        cmp     #>$2,b
        beq     gc2F                    ; CAPT OFF: the ring keeps what it holds
gc21:
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     #$1,a,a                 ; the mono sum, (l + r) / 2
        move    a,y:(r4)+
        move    x:(r7+$03),a
        tst     a
        beq     gc2F
        move    x:(r7+$0e),a
        sub     #>$1,a
        move    a1,x:(r7+$0e)
        bne     gc2F
        move    #>$2,x0                 ; the countdown is done: loop
        move    x0,x:(r7+$03)
        clr     a
        move    a,x:(r7+$08)
        move    a,x:(r7+$09)
        move    a,x:(r7+$0a)
gc2F:
; ---- C: the loop read, the seam and the envelope
        move    x:(r7+$03),a
        cmp     #>$2,a
        blt     gc4F
        move    x:(r7+$10),x1
        move    x:(r7+$11),x0           ; the increment, x1:x0
        move    x:(r7+$08),a
        move    x:(r7+$09),a0           ; p
; MODEFORK_BEGIN: DIR -- every compare first, then one arm a sample
        move    x:(r7+$14),b
        tst     b
        beq     gc30
        cmp     #>$1,b
        beq     gc31
; MODEFORK_MID: PEND, forwards to L - 1, then back to 0
        move    x:(r7+$0a),b
        tst     b
        bne     gc35
        add     x,a
        move    x:(r7+$18),x0           ; L - 1
        cmp     x0,a
        blt     gc3A
        neg     a                       ; reflect: 2 (L - 1) - p
        add     x0,a
        add     x0,a
        move    #>$1,y1
        move    y1,x:(r7+$0a)
        bra     gc3A
gc35:
        neg     a
        add     x,a
        neg     a
        tst     a
        bge     gc3A
        neg     a
        clr     b
        move    b,x:(r7+$0a)
        bra     gc3A
; MODEFORK_MID: FWD
gc30:
        add     x,a
        move    x:(r7+$07),x0
        cmp     x0,a
        blt     gc3A
        sub     x0,a
        bra     gc3A
; MODEFORK_MID: REV, p - inc as -(inc - p)
gc31:
        neg     a
        add     x,a
        neg     a
        tst     a
        bge     gc3A
        move    x:(r7+$07),x0
        add     x0,a
; MODEFORK_END
gc3A:
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
        move    y:(r5),a                ; s1
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,x:(r7+$19)            ; wet
; the seam (not on PEND): blend toward the pre-roll as the loop's end nears
        move    x:(r7+$14),b
        cmp     #>$2,b
        beq     gc3F
        move    x:(r7+$08),a
        move    x:(r7+$17),y0
        sub     y0,a
        blt     gc3F
        asl     #$f,a,a                 ; g = (p - (L - 256)) / 256
        move    a1,x1
        move    x:(r7+$08),a
        move    x:(r7+$07),y0
        sub     y0,a                    ; p - L
        move    a1,n5
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
        add     b,a                     ; the pre-roll's tap
        move    x:(r7+$19),b
        sub     b,a
        asr     #$1,a,a
        move    a,y1
        move    x1,x0
        mpy     x0,y1,a
        asl     #$1,a,a
        add     b,a
        move    a,x:(r7+$19)            ; wet + g (tap - wet)
gc3F:
; the envelope, branchless: up while looping (at most full), down while
; releasing; at 0 the release ends and the ring records again
        move    x:(r7+$0b),a
        move    a,b
        add     #>$8000,b
        move    #>$7fffff,x0
        cmp     x0,b
        tgt     x0,b
        move    b1,x1                   ; up
        sub     #>$8000,a               ; down
        move    x:(r7+$03),b
        cmp     #>$3,b
        tne     x1,a                    ; looping: up
        tst     a
        bgt     gc42
        clr     a
        move    a,x:(r7+$03)
gc42:
        move    a1,x:(r7+$0b)
gc4F:
; ---- D: dry + run e (wet - dry); idle, e = 0 and the frame stays exact
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
        move    x:(r7+$19),a
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
; gcGR -- GRAB. Releasing: loop again. Idle: AUTO and OFF loop the last L
; (S = w - L), MAN records the next L first (S = w).
; ---------------------------------------------------------------------------
gcGR:
        move    x:(r7+$03),a
        cmp     #>$3,a
        bne     gcG1
        move    #>$2,x0
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
        move    a,x:(r7+$08)
        move    a,x:(r7+$09)
        move    a,x:(r7+$0a)
        move    #>$2,y0
        move    y0,x:(r7+$03)
gcG9:
        rts

; ---------------------------------------------------------------------------
; gcRL -- release. Looping: fade out. Recording: back to idle.
; ---------------------------------------------------------------------------
gcRL:
        move    x:(r7+$03),a
        cmp     #>$2,a
        bne     gcR1
        move    #>$3,x0
        move    x0,x:(r7+$03)
        rts
gcR1:
        cmp     #>$1,a
        bne     gcR9
        clr     a
        move    a,x:(r7+$03)
gcR9:
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
