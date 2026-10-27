; CYCLES_FORWARD_BRANCHES
; FRACT SPACE: stereo diffused four-branch FDN, full-rate 44.1 kHz.
; Adapted from repeat98 Mini Verb at SDK c0c949a4 (MIT, Sam Banks 2026).
; See THIRD_PARTY_NOTICES.md. Delay/allpass lengths and safe DSP instruction forms
; retained; segments packed without the two gaps Mini Verb's deeper modulation kept.
; Native control: only r6+4 SPCE. No global writable state or absolute Y address.
; Own allocator FX2 ring: 15,779 words (+0..+$3DA2, modulus $3da2) of the
; 16,384-word slot, the most any stock effect writes; +$3DA3..+$3FFF (with
; Sidechain Compressor's key window on T3/T7) is never written or read.
; r7+$20..$3f (32 scalar words).
; Zero SPACE: exact dry after a <=256-frame mix glide, lazy tank invalidation.
; Init/reopen: dry while 8 words/sample are cleared, 1984 frames in total
; (15,872 words through the modulus; the last 93 wrap onto 0..92).
; Mid/side DC rejection, six input allpasses, eight loop allpasses (two modulated),
; orthogonal Householder feedback, damping and bounded feedback below .97.
; Top range (above SPACE 96, mix m above .75), from the slewed mix every
; sample: the wet makeup into the cubic knee falls from x4 to x2 and the
; in-loop damping coefficient from .65 to .40 (u = m-.75 subtracted from both).
; SPACE 0..96 is bit-exact to the fitted engine (tests/oracle_space_fitted).
; Linked output-envelope smoothing above 96; no ColdFire audio change. Linear AGU modes restored on return.
; Active segments (write..last read including interpolation/modulation):
; 0..113,114..287,288..625,626..1075,1076..2053,2054..2410,
; 2411..3094,3095..4524,4525..4956,4957..5844,5845..7676,7677..8304,
; 8305..9396,9397..11610,11611..12330,12331..13692,
; 13693..14634,14635..15764 (15,765 used, 14 spare).

init:
        move    #>$ffffff,m4
        lua     (r7+$20),r4
        clr     a
        do      #32,>sp_zero
        move    a,x:(r4)+
sp_zero:
        nop
        move    x:>$213,r4
        move    x:(r4),a
        move    a,x:(r7+$20)
        move    a,x:(r7+$21)
        move    #>$3e00,a
        move    a,x:(r7+$22)
        rts

proc:
; Read only the native fifth parameter (SPCE). Zero, once glided, costs one return.
        move    x:(r6+$4),a
        move    #<$7f,x0
        cmp     x0,a
        bne     sp_target
        move    #>$7fffff,a
sp_target:
        move    a,x:(r7+$26)
        move    x:(r7+$26),a
        move    x:(r7+$2a),x0
        add     x0,a
        tst     a
        bne     sp_warm
; Invalidate the old tank. Reopening clears it in bounded sample-clock chunks:
; 15,872 words (124 blocks of 128) through the ring modulus, so the clear ends
; on a 16-frame boundary for every call pattern; its last 93 wrap onto 0..92.
        move    #>$3e00,a
        move    a,x:(r7+$22)
        move    x:(r7+$20),a
        move    a,x:(r7+$21)
        rts
sp_warm:
        move    x:(r7+$22),a
        tst     a
        beq     sp_ready
        move    x:(r7+$21),r4
        move    #>$3da2,m4
        move    n7,b
        asl     #$3,b,b
        move    b,x0
        cmp     x0,a
        tlt     a,b
        move    b,x0
        sub     x0,a
        move    a,x:(r7+$22)
        clr     a
        do      b,>sp_clear
        move    a,y:(r4)+
sp_clear:
        nop
        move    r4,x:(r7+$21)
        move    #>$ffffff,m4
        move    x:(r7+$22),a
        tst     a
        bne     sp_ret
; The last clear also retires every filter, phase and control state.
        lua     (r7+$23),r4
        clr     a
        do      #29,>sp_reset
        move    a,x:(r4)+
sp_reset:
        nop
        move    x:(r7+$20),a
        move    a,x:(r7+$21)
sp_ret:
        rts
sp_ready:
; Decay .80 + .17 * (SPACE/128)^2; strictly below .97.
        move    x:(r6+$4),x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>$15c28f,y1
        mpy     x0,y1,a    #>$666666,x0
        add     x0,a
        move    a,x:(r7+$24)
; Eight-sample motion avoids extra per-frame glides; the damping and the knee
; drive follow the slewed mix (below), so they need no glide of their own.
        move    #<$2,n2
        move    #>$ffffff,m2
        move    x:(r7+$37),r2
        move    #>$3da2,m4
        move    #>$3da2,m5
        move    x:(r7+$21),r5
        move    #<$1,n0
        do      n7,>sp_end
; Smooth target $24 into $28.
        move    x:(r7+$24),a
        move    x:(r7+$28),b
        sub     b,a
        asr     #$8,a,a
        add     b,a
        move    a,x:(r7+$28)
; Bounded, sample-clocked mix slew: full range in 256 samples, exact endpoints.
        move    x:(r7+$26),a
        move    x:(r7+$2a),b
        sub     b,a    #>$008000,x0
        cmp     x0,a
        tgt     x0,a
        move    #>$ff8000,x0
        cmp     x0,a
        tlt     x0,a
        add     b,a
        move    a,x:(r7+$2a)
; Top range from this sample's slewed mix m (in a): u = max(m-.75, 0), zero up
; to SPACE 96. Damping coefficient .65-u into x:$3d (.40 at m = 1, darker as
; SPACE grows); the knee drive's eighth .5-u into x:$3e (x4 up to SPACE 96, x2
; at m = 1: the knee no longer overdrives on loud sustained input). Both move
; with the blend, at most 1/256 a sample, so automation cannot step them.
        sub     #>$600000,a
        clr     b
        max     a,b                     ; b = u
        move    #>$533333,a
        sub     b,a
        move    a,x:(r7+$3d)            ; damping .65 - u
        sub     #>$133333,a
        move    a,x:(r7+$3e)            ; drive/8 = .5 - u
        move    b,x:(r7+$35)            ; u for the linked post-output gain
        move    #>$00ba37,y0            ; 40 Hz input high-pass, both channels
; Approximate power-complementary blend: dry=1-m^2, wet=m*(1.5-.5*m^2).
; It avoids the level dip of a linear blend while reaching fully wet.
        move    x:(r7+$2a),x0
        move    x0,y1
        mpy     x0,y1,a
        move    a,x:(r7+$25)
        asr     a    #<$40,b
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     x0,a
        move    a,x:(r7+$27)
; Stereo mid and side reject DC/rumble at 40 Hz independently (c in y0).
; Each uses three allpasses. (L +/- R)/16 leaves headroom.
; Input branches reconstruct both stereo sides.
; An input allpass holds its tap in x0 and the stored value in x1:
; out = tap + g*store, the same words as Mini Verb's b/x0 form.
        move    x:(r0),a
        move    x:(r0+n0),x0
        add     x0,a
        asr     #$4,a,a
        move    a,x1
        move    x:(r7+$2b),b
        sub     b,a
        move    a,x0
        mpy     y0,x0,a
        add     b,a
        move    a,x:(r7+$2b)
        move    x1,b
        sub     a,b
        move    b,a
; Input diffuser 113, g=0.75.
        move    #>$ffff8f,n5
        move    y:(r5+n5),x0
        move    #<$60,y1
        mac     -x0,y1,a
        move    a,y:(r5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
; Input diffuser 173, g=0.75.
        move    #>$fffee1,n5
        move    y:(r5+n5),x0
        mac     -x0,y1,a    #>$ffff8e,n5
        move    a,y:(r5+n5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
; Extra input diffusion: 941 samples, g=0.5; outside the tank feedback.
        move    #>$ffc6d6,n5
        move    y:(r5+n5),x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$ffca83,n5
        move    a,y:(r5+n5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
        move    a,x:(r7+$2c)
        move    x:(r0),a
        move    x:(r0+n0),x0
        sub     x0,a
        asr     #$4,a,a
        move    a,x1
        move    x:(r7+$36),b
        sub     b,a
        move    a,x0
        mpy     y0,x0,a
        add     b,a
        move    a,x:(r7+$36)
        move    x1,b
        sub     a,b
        move    b,a
; Input diffuser 337, g=0.625.
        move    #>$fffd8f,n5
        move    y:(r5+n5),x0
        move    #<$50,y1
        mac     -x0,y1,a    #>$fffee0,n5
        move    a,y:(r5+n5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
; Input diffuser 449, g=0.625.
        move    #>$fffbcd,n5
        move    y:(r5+n5),x0
        mac     -x0,y1,a    #>$fffd8e,n5
        move    a,y:(r5+n5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
; Extra input diffusion: 1129 samples, g=0.5; outside the tank feedback.
        move    #>$ffc26c,n5
        move    y:(r5+n5),x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$ffc6d5,n5
        move    a,y:(r5+n5)
        move    a,x1
        move    x0,a
        mac     y1,x1,a
        move    a,x:(r7+$3c)
; One continuous per-sample triangle; split calls do not change its timebase.
; Triangle -> Q12 samples (0..8); x1=whole,
; y0=fraction. First allpasses in branches 1/3 move in opposite directions with adjacent taps.
        move    (r2)+n2
        move    r2,a
        and     #>$1ffff,a             ; M=0x1ffff selects LINEAR, not modulo
        move    a1,r2                 ; phase is nonnegative, extension stays zero
        sub     #>$10000,a
        abs     a
        asr     #$1,a,a
        move    a,b
        asr     #$c,a,a
        move    a1,x1                  ; integer only; do not negate fractional A0
        and     #>$fff,b
; B2 stays zero: phase/product/fraction are nonnegative and bounded.
        asl     #$b,b,b
        move    b,y0
; Branch 1: delay 977, damping, modulated AP 347, AP 683.
        move    #>$fff7fb,n5
        move    y:(r5+n5),a
        move    x:(r7+$3d),y1
        move    x:(r7+$30),b
        sub     b,a
        move    a,x0
        mpy     x0,y1,a
        add     b,a
        move    a,x:(r7+$30)
        move    a,y1             ; park input while interpolating the AP read
        move    #>$fff69f,a
        sub     x1,a
        move    a,n5
        lua     (r5+n5),r4
        move    y:(r4)-,b
        move    y:(r4),a
        sub     b,a
        move    a,x0
        mpy     y0,x0,a
        add     b,a
        move    a,b
        move    y1,a
        move    b,x0
        move    #>$59999a,y1
        mac     -x0,y1,a    #>$fff7fa,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a    #>$fff3ea,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$fff695,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a
        move    a,x:(r7+$38)
; Branch 2: delay 1429, damping, AP 431, AP 887.
        move    #>$ffee54,n5
        move    y:(r5+n5),a
        move    x:(r7+$3d),y1
        move    x:(r7+$31),b
        sub     b,a
        move    a,x0
        mpy     x0,y1,a
        add     b,a
        move    a,x:(r7+$31)
        move    #>$ffeca4,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #>$59999a,y1
        mac     -x0,y1,a    #>$ffee53,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a    #>$ffe92c,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$ffeca3,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a
        move    a,x:(r7+$39)
; Branch 3: delay 1831, damping, modulated AP 627, AP 1091.
        move    #>$ffe204,n5
        move    y:(r5+n5),a
        move    x:(r7+$3d),y1
        move    x:(r7+$32),b
        sub     b,a
        move    a,x0
        mpy     x0,y1,a
        add     b,a
        move    a,x:(r7+$32)
        move    a,y1             ; park input while interpolating the AP read
        move    #>$ffdf90,a
        add     x1,a
        move    a,n5
        lua     (r5+n5),r4
        move    y:(r4)+,b
        move    y:(r4),a
        sub     b,a
        move    a,x0
        mpy     y0,x0,a
        add     b,a
        move    a,b
        move    y1,a
        move    b,x0
        move    #>$59999a,y1
        mac     -x0,y1,a    #>$ffe203,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a    #>$ffdb4c,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$ffdf8f,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a
        move    a,x:(r7+$3a)
; Branch 4: delay 2213, damping, AP 719, AP 1361.
        move    #>$ffd2a6,n5
        move    y:(r5+n5),a
        move    x:(r7+$3d),y1
        move    x:(r7+$33),b
        sub     b,a
        move    a,x0
        mpy     x0,y1,a
        add     b,a
        move    a,x:(r7+$33)
        move    #>$ffcfd6,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #>$59999a,y1
        mac     -x0,y1,a    #>$ffd2a5,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a    #>$ffca84,n5
        move    y:(r5+n5),b
        move    b,x0
        move    #<$40,y1
        mac     -x0,y1,a    #>$ffcfd5,n5
        move    a,y:(r5+n5)
        move    a,x0
        move    b,a
        mac     x0,y1,a
        move    a,x:(r7+$3b)
; Store the MEAN, not half-sum: sum/2 can exceed Q23 and its saturation
; would break the intended matrix at large signal levels.
; Keep feedback*mean, saturated to Q23 by the move (as its store did), doubled
; in b; reconstruct 2*g*mean - g*di in the wide accumulator using MAC, then
; add input and saturate only the final line.
        move    x:(r7+$38),a
        move    x:(r7+$39),x0
        add     x0,a
        move    x:(r7+$3a),x0
        add     x0,a
        move    x:(r7+$3b),x0
        add     x0,a
        asr     #$2,a,a
        move    x:(r7+$28),y1
        move    a,x0
        mpy     x0,y1,a
        move    a,b
        asl     #$1,b,b
; line 1 = diffused input + feedback * (half-sum - di).
        tfr     b,a
        move    x:(r7+$38),x0
        mac     -x0,y1,a
        move    a,x1
        move    x:(r7+$2c),a
        move    x:(r7+$3c),x0
        add     x0,a
        asr     #$1,a,a
        add     x1,a    #>$fffbcc,n5
        move    a,y:(r5+n5)
; line 2 = diffused input + feedback * (half-sum - di).
        tfr     b,a
        move    x:(r7+$39),x0
        mac     -x0,y1,a
        move    a,x1
        move    x:(r7+$2c),a
        move    x:(r7+$3c),x0
        sub     x0,a
        asr     #$1,a,a
        add     x1,a    #>$fff3e9,n5
        move    a,y:(r5+n5)
; line 3 = diffused input + feedback * (half-sum - di).
        tfr     b,a
        move    x:(r7+$3a),x0
        mac     -x0,y1,a
        move    a,x1
        move    x:(r7+$2c),a
        move    x:(r7+$3c),x0
        add     x0,a
        asr     #$1,a,a
        add     x1,a    #>$ffe92b,n5
        move    a,y:(r5+n5)
; line 4 = diffused input + feedback * (half-sum - di).
        tfr     b,a
        move    x:(r7+$3b),x0
        mac     -x0,y1,a
        move    a,x1
        move    x:(r7+$2c),a
        move    x:(r7+$3c),x0
        sub     x0,a
        asr     #$1,a,a
        add     x1,a    #>$ffdb4b,n5
        move    a,y:(r5+n5)
; Orthogonal stereo projections. Maximum SPACE is fully diffused/wet.
; Wet makeup uses a bounded cubic soft knee outside the feedback tank.
; y=(13/16)*(1.5*x-.5*x^3), x=clamp(k*projection,-1,1), k = 8*x:$3e:
; 4 up to SPACE 96, falling to 2 at 127. The projection is saturated before
; the multiply; that changes nothing, since k >= 2 clamps |projection| >= 1/2.
; Power-complementary blend preserves exact zero; the wet knee leaves headroom.
        move    x:(r7+$3e),y0           ; drive/8 for both channels
        move    x:(r7+$38),a
        move    x:(r7+$39),x0
        add     x0,a
        move    x:(r7+$3a),x0
        sub     x0,a
        move    x:(r7+$3b),x0
        sub     x0,a
        bsr     hy_output
        move    x:(r7+$38),a
        move    x:(r7+$39),x0
        sub     x0,a
        move    x:(r7+$3a),x0
        add     x0,a
        move    x:(r7+$3b),x0
        sub     x0,a
        bsr     hy_output

; Above 96 only: linked stereo mean-absolute envelope servo after the blend.
; Ef has a 512-sample time constant. Es follows Ef every 16 samples with
; a 512-update time constant and retained fractional remainder. Prime Es
; from Ef for 4096 samples on entry, so a running tank is not muted.
; d = (estimated gain - 1)/2, stepped by 1/512 per update, bounded
; -.375..+.0625. Applied gain is 1 + 8*u*d: identity at/below 96,
; .25..1.125 at 127. Neither detector nor gain feeds back into the tank.
        move    x:(r7+$3e),a
        cmp     #>$400000,a
        beq     hy_low
        move    x:(r0-$2),a
        abs     a
        move    x:(r0-$1),b
        abs     b    a,x0
        add     x0,b
        asr     b
; Full-rate Ef, 512-sample time constant.
        move    x:(r7+$23),a
        sub     a,b
        asr     #$9,b,b
        add     b,a
        move    a,x:(r7+$23)
; Es/gain clock derives from the original sample phase, independent of calls.
        move    r2,b
        and     #>$1e,b
        bne     hy_gain
; Slow reference follows the full-rate detector, not a point sample of audio.
        move    x:(r7+$2e),b
        cmp     #>$400000,b
        bge     hy_reference
        add     #>$004000,b
        move    b,x:(r7+$2e)
        move    a,b
        bra     hy_store_ref
hy_reference:
        move    a,b
        move    x:(r7+$29),a
        move    x:(r7+$34),a0
        sub     a,b
        asr     #$9,b,b
        add     a,b
hy_store_ref:
        move    b,x:(r7+$29)
        move    b0,x:(r7+$34)
        move    x:(r7+$23),a
; Compare Ef * (1 + 2*d) to Es; no divide/root.
        move    a,x0
        move    x:(r7+$2d),y1
        mpy     x0,y1,b
        asl     #$1,b,b
        add     x0,b
        move    x:(r7+$29),a
        sub     b,a
        beq     hy_gain
        move    #<$01,b
        move    #<$ff,x0
        tlt     x0,b
        asr     #$2,b,b
        add     y1,b    #<$d0,x0
        cmp     x0,b
        tlt     x0,b
        move    #<$08,x0
        cmp     x0,b
        tgt     x0,b
        move    b,x:(r7+$2d)
hy_gain:
; g = 1 + 8*u*d, continuously from the same slewed mix as SPACE.
        move    x:(r7+$35),x0
        move    x:(r7+$2d),y1
        mpy     x0,y1,a
        asl     #$3,a,a
        move    a,y1
; Gain has an additive identity, avoiding a Q23 unity-rounding change.
; At fully wet the 13/16 knee times 1.125 stays below .914063 FS.
        move    x:(r0-$2),x0
        mpy     x0,y1,a
        add     x0,a
        move    a,x:(r0-$2)
        move    x:(r0-$1),x0
        mpy     x0,y1,a
        add     x0,a
        move    a,x:(r0-$1)
        bra     hy_done
hy_low:
        clr     a
        move    a,x:(r7+$23)
        move    a,x:(r7+$29)
        move    a,x:(r7+$34)
        move    a,x:(r7+$2d)
        move    a,x:(r7+$2e)
hy_done:
        move    (r5)+
sp_end:
        nop
        move    r2,x:(r7+$37)
        move    #>$ffffff,m2
        move    #>$ffffff,m4
        move    r5,x:(r7+$21)
        move    #>$ffffff,m5
        rts

hy_output:
        move    a,x0                    ; the projection, saturated
        mpy     y0,x0,a                 ; drive/8 * projection, exact at .5
        asl     #$3,a,a                 ; drive * projection
        move    a,x0                    ; saturate the soft-knee argument only
        move    x0,y1
        mpy     x0,y1,a
        asr     a    #<$40,b
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     x0,a
        move    a,b
        asr     #$4,b,b
        sub     b,a
        sub     b,a
        sub     b,a                     ; 13/16 wet ceiling, including overload
        move    a,x0
        move    x:(r7+$27),y1
        mpy     x0,y1,a    x:(r0),x0
        move    x:(r7+$25),y1
        mac     -x0,y1,a    x0,b
        add     b,a
        move    a,x:(r0)+
        rts
