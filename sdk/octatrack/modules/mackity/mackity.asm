; MACKITY -- DSP56300 port of Chris Johnson's Airwindows Mackity (MIT).
; Copyright (c) 2016 Chris Johnson (Airwindows), MIT.
; Upstream revision and full MIT licence: upstream/, LICENSE.
;
; A buffer-free stereo insert for FX1 or FX2: no allocator, no bus role,
; no absolute Y. Per channel, as MackityProc.cpp at 44.1 kHz:
;   one-pole high-pass (13 Hz), 19.16 kHz low-pass biquad (Q 0.43),
;   IN TRIM, clip at full scale, v - 0.1768 v^5, 19.16 kHz low-pass
;   biquad (Q 1.16), one-pole high-pass (2 Hz), OUT PAD.
; The trim is applied after the first biquad instead of before it: both
; are linear, so the result is the same while the trim holds still.
;
; Fixed point. The high-passes and biquads run at quarter scale (x/4), so
; neither biquad can overflow (their impulse responses sum to 1.54 and
; 2.52). The value going into the trim is limited at twice full scale
; (+6 dBFS), which keeps a +40 dB trim inside the accumulator's guard bits.
; The one-pole states are 48 bits (a 24-bit state stalls short of its
; input); their outputs subtract the state's high word, so silence in ends
; in exact silence out. The original's float dither and denormal noise are
; left out: the Octatrack's path is 24-bit fixed point.
;
; Knobs (page 1): TRIM x:(r6+0), PAD x:(r6+1), value<<16.
;   TRIM: gain (k/13)^2, the original's (10 A)^2 with A = k/130: 13 is
;         exactly 0 dB, 127 is +39.6 dB, 0 is silence.
;   PAD:  linear output gain k/128, 127 exactly 1.
; Both glide per sample (1/64 a sample, 1.45 ms) and snap onto their
; target at the start of a call once within 64 LSB, so a knob at rest is
; exact. The first call after init starts on the knobs.
;
; State (X, offsets from r7; init clears $00..$1f):
;   channel block, L at $00, R at $0c (r5 points at it in mack_chan):
;     +0/+1 high-pass in, state high/low   +2/+3 biquad A x1/x2
;     +4/+5 biquad A y1/y2                 +6/+7 biquad B x1/x2
;     +8/+9 biquad B y1/y2                 +a/+b high-pass out, state hi/lo
;   $18 trim target, $19 trim run (gain/128)
;   $1b pad target, $1c pad run (pad/2), $1e seeded
; $1a, $1d and $1f are reserved. Nothing above $1f is touched.
; Every product is the signed mpy/mac x0,y1 form.
; CYCLES_FORWARD_BRANCHES
init:
        move    r7,r5
        move    #>$ffffff,m5
        clr     a
        do      #32,>mack_zero
        move    a,x:(r5)+
mack_zero:
        nop
        rts

proc:
        move    #>$ffffff,m5
; TRIM: (kn^2 * 16384/169) = gain/128, kn = knob/128 with its fraction.
        move    x:(r6+$0),a
        and     #>$7fffff,a
        move    a1,x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>$60f25e,y1
        mpy     x0,y1,a
        move    a,x:(r7+$18)
; PAD: pad/2, 127 and above exactly one half.
        move    x:(r6+$1),a
        and     #>$7fffff,a
        move    a1,x0
        move    x0,b
        asr     #1,b,b
        move    x0,a
        move    #>$7f0000,y0
        cmp     y0,a
        move    #>$400000,y1
        tge     y1,b
        move    b1,x:(r7+$1b)
; The first call after init starts on the knobs.
        move    x:(r7+$1e),a
        tst     a
        bne     mack_seeded
        move    x:(r7+$18),x0
        move    x0,x:(r7+$19)
        move    x:(r7+$1b),x0
        move    x0,x:(r7+$1c)
        move    #>1,x0
        move    x0,x:(r7+$1e)
mack_seeded:
; A glide within 64 LSB of its target snaps onto it.
        move    x:(r7+$18),a
        move    x:(r7+$19),x0
        sub     x0,a
        abs     a
        move    #>64,x0
        cmp     x0,a
        move    x:(r7+$19),b
        move    x:(r7+$18),y0
        tlt     y0,b
        move    b1,x:(r7+$19)
        move    x:(r7+$1b),a
        move    x:(r7+$1c),x0
        sub     x0,a
        abs     a
        move    #>64,x0
        cmp     x0,a
        move    x:(r7+$1c),b
        move    x:(r7+$1b),y0
        tlt     y0,b
        move    b1,x:(r7+$1c)
        do      n7,>mack_frameend
        move    x:(r7+$18),a
        move    x:(r7+$19),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$19)
        move    x:(r7+$1b),a
        move    x:(r7+$1c),x0
        sub     x0,a
        asr     #6,a,a
        add     x0,a
        move    a1,x:(r7+$1c)
        move    r7,r5
        bsr     mack_chan
        move    a,x:(r0)+
        lua     (r7+$0c),r5
        bsr     mack_chan
        move    a,x:(r0)+
mack_frameend:
        nop
        rts

; One channel: in x:(r0), state block at r5; out in a (the caller's store
; limits it to full scale).
mack_chan:
; High-pass in: s += K1 (h - s), y = h - s, h = x/4.
        move    x:(r0),a
        asr     #2,a,a
        move    a1,x1
        move    x:(r5+$0),b
        move    x:(r5+$1),b0
        move    x1,a
        move    x:(r5+$0),y0
        sub     y0,a
        move    a,x0
        move    #>$003cfa,y1
        mac     x0,y1,b
        move    b1,x:(r5+$0)
        move    b0,x:(r5+$1)
        move    x1,a
        move    b1,y0
        sub     y0,a
        move    a,x1
; Biquad A, direct form 1, halved coefficients.
        move    x1,x0
        move    #>$29e6d8,y1
        mpy     x0,y1,a
        move    x:(r5+$2),x0
        move    #>$53cdaf,y1
        mac     x0,y1,a
        move    x:(r5+$3),x0
        move    #>$29e6d8,y1
        mac     x0,y1,a
        move    x:(r5+$4),x0
        move    #>$afd9f8,y1
        mac     x0,y1,a
        move    x:(r5+$5),x0
        move    #>$e88aaa,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$2),y0
        move    y0,x:(r5+$3)
        move    x1,x:(r5+$2)
        move    x:(r5+$4),y0
        move    y0,x:(r5+$5)
        move    a,x:(r5+$4)
; IN TRIM and the clip: limited at +6 dBFS, times gain, limited at 0 dBFS.
        asl     #1,a,a
        move    a,x0
        move    x:(r7+$19),y1
        mpy     x0,y1,a
        asl     #8,a,a
        move    a,x0
; The curve at quarter scale: c/4 - (0.1768/4) c^5.
        move    x0,y1
        move    y1,y0
        mpy     x0,y1,a
        move    a,x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>$05a858,y1
        mpy     x0,y1,a
        move    a,x0
        move    y0,y1
        mpy     x0,y1,b
        move    y0,a
        asr     #2,a,a
        sub     b,a
        move    a,x1
; Biquad B.
        move    x1,x0
        move    #>$344a81,y1
        mpy     x0,y1,a
        move    x:(r5+$6),x0
        move    #>$689502,y1
        mac     x0,y1,a
        move    x:(r5+$7),x0
        move    #>$344a81,y1
        mac     x0,y1,a
        move    x:(r5+$8),x0
        move    #>$9bfaa3,y1
        mac     x0,y1,a
        move    x:(r5+$9),x0
        move    #>$d2db5a,y1
        mac     x0,y1,a
        asl     #1,a,a
        move    x:(r5+$6),y0
        move    y0,x:(r5+$7)
        move    x1,x:(r5+$6)
        move    x:(r5+$8),y0
        move    y0,x:(r5+$9)
        move    a,x1
        move    x1,x:(r5+$8)
; High-pass out: s += K2 (u - s), y = u - s.
        move    x:(r5+$a),b
        move    x:(r5+$b),b0
        move    x1,a
        move    x:(r5+$a),y0
        sub     y0,a
        move    a,x0
        move    #>$00096c,y1
        mac     x0,y1,b
        move    b1,x:(r5+$a)
        move    b0,x:(r5+$b)
        move    x1,a
        move    b1,y0
        sub     y0,a
; OUT PAD: y * (pad/2) * 8 = y * 4 * pad, back to full scale.
        move    a,x0
        move    x:(r7+$1c),y1
        mpy     x0,y1,a
        asl     #3,a,a
        rts
