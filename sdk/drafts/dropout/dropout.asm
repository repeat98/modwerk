; SPDX-License-Identifier: GPL-3.0-or-later
; SPDX-FileCopyrightText: 2026 Semi Erendönmez
; ---------------------------------------------------------------------------
; DROPOUT -- the track drops out now and then, like a failing tape or stream.
;
; Dropouts start at random (CHNC: on average once in 20 s at 1 to every 60 ms at
; 127; 0 = never) and last LEN x 0.5..1.5 (LEN: 5 ms to 1 s). A dropout's depth e
; ramps from 0 to 1 and back by EDGE's step (0.1 ms to 50 ms a ramp). During it
; MODE says what the track drops to, and the result darkens by TONE:
;   m   = GAP: silence   HOLD: the last 64 + 7 SIZE frames, looped (a stuck buffer)
;         CRSH: the track held every 2 + SIZE/4 samples at 6 bits
;   v   = x + DPTH e (m - x)
;   out = v + TONE e (lowpass(800 Hz, v) - v)
; Outside a dropout e is exactly 0 and the output is the input, bit for bit.
;
; ABI (docs/remixer/HARNESS.md): r0 = audio block (interleaved stereo, in place),
; n7 = frames, r6 = parameters, r7 = state. A trig split's second call starts at
; r0 = split*2; nothing here depends on the frame's position in the block.
;   x:(r6+$0) CHNC  x:(r6+$1) LEN  x:(r6+$2) DPTH  x:(r6+$3) EDGE  x:(r6+$4) TONE
;   page 1, value << 16 with an LFO's fraction in bits 15-8 (CHNC, LEN and EDGE
;   interpolate it); x:(r6+$c) MODE, x:(r6+$d) SIZE: page 2 slots 6 and 8, the
;   knob field (bits 23-16)
; Tables: the module's own P table (manifest.py), 129 words each: P the chance a
; sample of a dropout at +0, L the length in samples at +129, E the ramp's step
; at +258. The base is placed by the build.
; Buffer: HOLD keeps the last 1,024 frames, interleaved, in the first 2,048 words
; of the allocator's Y buffer (Claims(buffer_words=2048): an FX1 slot holds it).
; It is written only while no loop plays; a loop is never longer than the frames
; written since init, so garbage left in the buffer is never heard.
;
; r7 block ($00..$1f, all cleared by init):
;   $00 noise (24-bit LCG)   $01 samples left in this dropout   $02 e
;   $03 e's step   $04 the chance P   $05 the length L   $06/$07 DPTH cur/target
;   $08/$09 TONE cur/target   $0a MODE 0..2   $0b HOLD's loop, frames
;   $0c CRSH's hold, samples   $0d the buffer's base   $0e the write frame
;   $0f frozen (a HOLD loop plays)   $10 the read frame   $11 the loop's start
;   $12 CRSH's countdown   $13/$14 CRSH's held L/R   $15/$16 TONE's low-pass L/R
;   $17 the table's base   $18/$19 dry L/R   $1a/$1b m L/R   $1c DPTH e
;   $1d TONE e   $1e frames written since init or the last dropout, up to 1,024
;
; Multiplies use only the encodable operand orders; no rep; no tfr between
; accumulators. Labels are dp + two digits, none a prefix of another.
; ---------------------------------------------------------------------------
init:
        move    #>$ffffff,m5
        move    r7,r5                   ; r1 is the dispatcher's across init
        clr     a
        do      #<$20,>dp00
        move    a,x:(r5)+
dp00:
        move    #>$3c6ef3,x0            ; the noise's seed
        move    x0,x:(r7+$0)
        move    x:>$213,r5              ; the allocator's entry
        move    x:(r5),x0
        move    x0,x:(r7+$d)            ; the Y buffer's base
        rts

proc:
        move    #>$ffffff,m0
        move    #>$ffffff,m4
        move    #>$ffffff,m5
        move    #>$fab1e0,r5            ; the table's base, placed by the build
        move    r5,x:(r7+$17)
; ---- CHNC: the chance a sample, 0 at 0 ---------------------------------------
        move    x:(r6+$0),a
        move    #0,x1
        bsr     dp90
        move    a,x:(r7+$4)
; ---- LEN: the length in samples ----------------------------------------------
        move    x:(r6+$1),a
        move    #>$81,x1
        bsr     dp90
        move    a1,x:(r7+$5)
; ---- DPTH: k / 128, and 127 is all of it ---------------------------------------
        move    x:(r6+$2),a
        and     #>$7fff00,a
        move    #>$7fffff,x1
        cmp     #>$7f0000,a
        tge     x1,a
        move    a1,x:(r7+$7)
; ---- EDGE: the ramp's step ------------------------------------------------------
        move    x:(r6+$3),a
        move    #>$102,x1
        bsr     dp90
        move    a,x:(r7+$3)
; ---- TONE: k / 128 ----------------------------------------------------------------
        move    x:(r6+$4),a
        and     #>$7fff00,a
        move    a1,x:(r7+$9)
; ---- MODE: 0 GAP, 1 HOLD, 2 CRSH; anything else GAP ------------------------------
        move    x:(r6+$c),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    #0,x1
        cmp     #<2,a
        tgt     x1,a
        move    a1,x:(r7+$a)
; ---- SIZE: HOLD's loop 64 + 7k frames, CRSH's hold 2 + k/4 samples ---------------
        move    x:(r6+$d),a
        and     #>$7f0000,a
        asr     #16,a,a
        move    a1,b
        asl     #3,a,a
        sub     b,a
        add     #>$40,a
        move    a1,x:(r7+$b)
        asr     #2,b,b
        add     #<2,b
        move    b1,x:(r7+$c)
; ---- snap the two glides within 64 LSB -------------------------------------------
        lua     (r7+$6),r4
        do      #<2,>dp02
        move    x:(r4)+,x0              ; current
        move    x:(r4)-,a               ; target
        move    a,x1
        sub     x0,a
        abs     a
        move    x0,b
        cmp     #>$40,a
        tlt     x1,b
        move    b,x:(r4)+
        move    (r4)+
dp02:
        nop

; ---- the samples -------------------------------------------------------------------
        do      n7,>dp40
; the glides, 1/32 a sample
        move    x:(r7+$6),x0
        move    x:(r7+$7),a
        sub     x0,a
        asr     #5,a,a
        add     x0,a
        move    a,x:(r7+$6)
        move    x:(r7+$8),x0
        move    x:(r7+$9),a
        sub     x0,a
        asr     #5,a,a
        add     x0,a
        move    a,x:(r7+$8)
; the dry frame
        move    x:(r0)+,x0
        move    x0,x:(r7+$18)
        move    x:(r0)-,x0
        move    x0,x:(r7+$19)
; HOLD's buffer: while no loop plays, keep the frame and count it
        move    x:(r7+$f),a
        tst     a
        bne     dp10
        move    x:(r7+$e),a
        asl     a
        move    x:(r7+$d),x0
        add     x0,a
        move    a1,r4
        move    x:(r7+$18),x0
        move    x:(r7+$19),x1
        move    x0,y:(r4)+
        move    x1,y:(r4)
        move    x:(r7+$e),a
        add     #<1,a
        and     #>$3ff,a
        move    a1,x:(r7+$e)
        move    x:(r7+$1e),a
        add     #<1,a
        move    #>$400,x1
        cmp     x1,a
        tgt     x1,a
        move    a1,x:(r7+$1e)
dp10:
; noise: x = x * 1664525 + 1013904223 mod 2^24 (b0 carries the doubled product)
        move    x:(r7+$0),x0
        move    #>$0cb306,y0
        mpy     y0,x0,b
        move    #0,x1
        add     x,b
        move    #>$6ef35f,y0
        move    #0,y1
        add     y,b
        move    b0,x0
        move    x0,x:(r7+$0)
; a dropout counts down; with none playing, one starts at the chance P a sample
        move    x:(r7+$1),a
        tst     a
        beq     dp12
        sub     #<1,a
        move    a1,x:(r7+$1)
        bra     dp14
dp12:
        move    x0,b
        abs     b
        move    x:(r7+$4),x1
        cmp     x1,b
        bge     dp14
; it lasts L x (1/2 .. 3/2), from the noise's low 16 bits, taken as 0..1/2
        move    x0,a
        and     #>$00ffff,a
        asl     #6,a,a
        move    a1,b                    ; 0 .. 1/2
        add     #>$200000,b
        move    b1,x1
        move    x:(r7+$5),y0
        mpy     x1,y0,a
        asl     a
        add     #<1,a
        move    a1,x:(r7+$1)
; HOLD: freeze the last min(loop, frames written) frames, once
        move    x:(r7+$a),a
        cmp     #<1,a
        bne     dp14
        move    x:(r7+$f),a
        tst     a
        bne     dp14
        move    #>$1,x1
        move    x1,x:(r7+$f)
        move    x:(r7+$b),a
        move    x:(r7+$1e),x1
        cmp     x1,a
        tgt     x1,a
        move    a1,x1
        move    x:(r7+$e),a
        sub     x1,a
        and     #>$3ff,a
        move    a1,x:(r7+$11)
        move    a1,x:(r7+$10)
dp14:
; e: toward 1 while the dropout lasts, then back to 0, by the step
        move    x:(r7+$3),x1
        move    x:(r7+$2),a
        move    x:(r7+$1),b
        tst     b
        beq     dp16
        add     x1,a
        move    a,x:(r7+$2)             ; limited at 1
        bra     dp18
dp16:
        sub     x1,a
        move    #0,y1
        tmi     y1,a
        move    a,x:(r7+$2)
        tst     a
        bne     dp18
        move    x:(r7+$f),b
        tst     b
        beq     dp18
        move    a,x:(r7+$f)             ; faded out: a HOLD loop lets go,
        move    a,x:(r7+$1e)            ; and the next one reaches back no further than this
dp18:
        move    x:(r7+$2),y0
        move    x:(r7+$6),x1
        mpy     x1,y0,a
        move    a,x:(r7+$1c)            ; DPTH e
        move    x:(r7+$8),x1
        mpy     x1,y0,a
        move    a,x:(r7+$1d)            ; TONE e
; m: what the track drops to
        clr     a
        move    a,x:(r7+$1a)
        move    a,x:(r7+$1b)            ; GAP: silence
        move    x:(r7+$a),a
        tst     a
        beq     dp30
        cmp     #<1,a
        bne     dp26
; HOLD: the frozen loop (a HOLD that has not frozen yet drops to silence)
        move    x:(r7+$f),a
        tst     a
        beq     dp30
        move    x:(r7+$10),a
        asl     a
        move    x:(r7+$d),x0
        add     x0,a
        move    a1,r4
        move    x:(r7+$10),a
        add     #<1,a
        and     #>$3ff,a
        move    x:(r7+$e),x0            ; the loop ends where writing stopped
        cmp     x0,a
        move    x:(r7+$11),x1
        teq     x1,a
        move    a1,x:(r7+$10)
        move    y:(r4)+,x0
        move    x0,x:(r7+$1a)
        move    y:(r4),x0
        move    x0,x:(r7+$1b)
        bra     dp30
; CRSH: the track held every N samples, rounded to 6 bits
dp26:
        move    x:(r7+$12),a
        sub     #<1,a
        bgt     dp28
        move    x:(r7+$c),a
        move    x:(r7+$18),b
        add     #>$020000,b
        move    b,x0                    ; limited
        move    x0,b
        and     #>$fc0000,b
        move    b1,x:(r7+$13)
        move    x:(r7+$19),b
        add     #>$020000,b
        move    b,x0
        move    x0,b
        and     #>$fc0000,b
        move    b1,x:(r7+$14)
dp28:
        move    a1,x:(r7+$12)
        move    x:(r7+$13),x0
        move    x0,x:(r7+$1a)
        move    x:(r7+$14),x0
        move    x0,x:(r7+$1b)
dp30:
; L: v = x + DPTH e (m - x); lp += k (v - lp); out = v + TONE e (lp - v)
        move    x:(r7+$1a),b
        asr     b
        move    x:(r7+$18),a
        asr     a
        sub     a,b
        move    b,x1
        move    x:(r7+$1c),y0
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$18),x0
        add     x0,a
        move    a,x0                    ; v
        move    x:(r7+$15),a
        move    x0,b
        sub     a,b
        move    b,x1
        move    #>$0db22d,y0            ; 800 Hz
        mac     x1,y0,a
        move    a,x:(r7+$15)
        asr     a
        move    x0,b
        asr     b
        sub     b,a
        move    a,x1
        move    x:(r7+$1d),y0
        mpy     x1,y0,a
        asl     a
        add     x0,a
        move    a,x:(r0)+
; R, the same
        move    x:(r7+$1b),b
        asr     b
        move    x:(r7+$19),a
        asr     a
        sub     a,b
        move    b,x1
        move    x:(r7+$1c),y0
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$19),x0
        add     x0,a
        move    a,x0
        move    x:(r7+$16),a
        move    x0,b
        sub     a,b
        move    b,x1
        move    #>$0db22d,y0
        mac     x1,y0,a
        move    a,x:(r7+$16)
        asr     a
        move    x0,b
        asr     b
        sub     b,a
        move    a,x1
        move    x:(r7+$1d),y0
        mpy     x1,y0,a
        asl     a
        add     x0,a
        move    a,x:(r0)+
dp40:
        rts

; ---- a table entry, interpolated by the knob's LFO fraction -------------------------
; In: a = the knob word, x1 = the table's offset. Out: a = T[k] + f (T[k+1] - T[k]).
; Uses b, x0, y0, y1, r5, n5.
dp90:
        and     #>$7fff00,a
        move    a1,y1
        asr     #$10,a,a
        add     x1,a
        move    a1,n5
        move    y1,a
        and     #>$00ff00,a
        asl     #$7,a,a
        move    a1,x0
        move    x:(r7+$17),r5
        move    (r5)+n5
        move    p:(r5)+,y0
        move    p:(r5),b
        move    y0,a
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     y0,a
        rts
