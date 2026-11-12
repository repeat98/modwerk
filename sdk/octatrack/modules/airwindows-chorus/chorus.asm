; Air Chorus -- DSP56300 port of Chris Johnson's Airwindows Chorus (MIT).
; Copyright (c) 2016 Chris Johnson; port (c) 2026 Jannik Assfalg.
; Upstream revision and full MIT licence: upstream/, LICENSE.
; FX2 only: two 8192-word rings in the slot's 16384-word Y allocation.
; The first 72 virtual words use X:(r7+$3c)..X:(r7+$83) instead:
; T3's Y:$38000 prefix aliases stock's live cross-core mailbox, and T7's
; Y:$30000 prefix aliases per-frame parameter staging. Never touch those
; Y words. Stay within the safe $00..$83 instance block; $84+ belongs
; to stock track state. No new RAM is allocated.
; Original ring length 8176 is safely replaced by a wrapped 8192 ring:
; the greatest referenced age is ceil(2*4079.824)+2 = 8162.
; 8 guard bits keep the alternating air states and buffer writes bounded
; even at full-scale Nyquist. Interpolation/mix restore that scaling only
; in the final accumulator. This is a fixed-point port, not float bit parity.
; State (X, offsets from r7):
; 00 allocator, 01 FX1 guard, 02 ring cursor, 03 phase high, 04 flip,
; 05 seeded, 06..08 targets, 09..0b final smoothed high words,
; 0c..0e smoothed low words, 10 tap offset, 11 fraction, 12 age,
; 15 L previous,16/17 L even hi/lo,
; 18/19 L odd hi/lo,1a R previous,1b/1c R even,1d/1e R odd,
; 20/21 RANGE first slew stage,22/23 MIX first stage,
; 30 table base,32 phase low,
; 33 speed-target low,35 dry coefficient. Other offsets are reserved.
; 37 count of valid ring history (0..8192); initial history is logically zero.
; 38 sine index,39 value,3a next value,3b temporary first difference.
; Init clears the complete 60-word control state, including reserved gaps.
; Ring history guards every unwritten X shadow word just like the Y ring.
; init preserves r1/n1/m1. Proc never reads the allocator pointer again.
; CYCLES_FORWARD_BRANCHES
init:
        move    r7,r5
        move    #>$ffffff,m5
        clr     a
        do      #60,>ac_zero
        move    a,x:(r5)+
ac_zero:
        nop
        move    x:>$213,r4
        move    #>$ffffff,m4
        move    x:(r4),x0
        move    x0,x:(r7+$00)
        move    x0,a
        sub     #>$4000,a
        clr     b
        move    #>1,x0
        tst     a
        tmi     x0,b
        move    b,x:(r7+$01)
; Unwritten history reads as zero until each ring position has been filled.
; This avoids a 16384-word clear inside the effect-change dispatcher block.
        move    #>$200000,x0
        move    x0,x:(r7+$03)
; Initial phase is at the quarter-sine endpoint. Subsequent folded indices
; change by at most one (maximum phase step is <1 table point/sample).
        move    #>1024,x0
        move    x0,x:(r7+$38)
        move    #>$7fffff,x0
        move    x0,x:(r7+$39)
        move    x0,x:(r7+$3a)
        rts
proc:
        move    x:(r7+$01),a
        tst     a
        bne     ac_return
        move    #>$ffffff,m5
        move    #>$ffffff,m4
        move    #>$ffffff,m3
; Keep MIX addressable by an indirect move so arithmetic can load it in
; parallel. n1 reaches the shared dry coefficient. Init still preserves r1.
        lua     (r7+$0b),r1
        move    #>$2a,n1
; Warm rings use the original tap body. Choose once per processing call;
; a call that finishes filling history keeps the masked path until next call.
        move    #>ac_maskedread,r2
        move    x:(r7+$37),a
        cmp     #>8192,a
        blt     ac_historyready
        move    #>ac_warmread,r2
ac_historyready:
        move    #>$fab1e0,r5
        move    r5,x:(r7+$30)
; Endpoint 127 maps to 1, other bytes k/128: exactly original default at 64.
; Speed^4 radians/sample -> Q23 cycles/sample, rounded to nearest count.
        move    x:(r6+$00),a
        bsr     ac_endpoint
        move    a,x0
        move    a,y1
        mpy     x0,y1,a
        move    a,x0
        move    a,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>1335,y1
        mpy     x0,y1,a
        move    #>741795,y1
        mpy     x0,y1,b
        asr     #23,b,b
        add     b,a
        move    a1,x:(r7+$06)
        move    a0,x:(r7+$33)
; Range^4 * 4079.824 samples, Q13.10.
        move    x:(r6+$01),a
        bsr     ac_endpoint
        move    a,x0
        move    a,y1
        mpy     x0,y1,a
        move    a,x0
        move    a,y1
        mpy     x0,y1,a
        move    a,x0
        move    #>4177740,y1
        mpy     x0,y1,a
        move    a,x:(r7+$07)
        move    x:(r6+$05),a
        bsr     ac_endpoint
        move    a,x:(r7+$08)
; SPEED uses a 48-bit per-sample one-pole (1024 samples / 23.2 ms).
; RANGE/MIX cascade two such poles: a jump starts at near-zero read/gain
; velocity rather than stepping one or several delay samples on its first
; sample. No block-end snap; n7 can describe a short trig-split call.
; Seed all stages from the first call's actual settings.
        move    x:(r7+$05),a
        tst     a
        bne     ac_slews
        move    x:(r7+$06),a
        move    a,x:(r7+$09)
        move    x:(r7+$33),a
        move    a1,x:(r7+$0c)
        move    x:(r7+$07),a
        move    a,x:(r7+$0a)
        move    a,x:(r7+$20)
        move    x:(r7+$08),a
        move    a,x:(r7+$0b)
        move    a,x:(r7+$22)
        move    #>1,x0
        move    x0,x:(r7+$05)
ac_slews:
        do      n7,>ac_frameend
ac_sample:
        move    x:(r7+$07),a
        move    x:(r7+$20),b
        move    x:(r7+$21),b0
        sub     b,a
        asr     #10,a,a
        add     b,a
        move    a1,x:(r7+$20)
        move    a0,x:(r7+$21)
        move    x:(r7+$0a),b
        move    x:(r7+$0d),b0
        sub     b,a
        asr     #10,a,a
        add     b,a
        move    a1,x:(r7+$0a)
        move    a0,x:(r7+$0d)
        move    x:(r7+$08),a
        move    x:(r7+$22),b
        move    x:(r7+$23),b0
        sub     b,a
        asr     #10,a,a
        add     b,a
        move    a1,x:(r7+$22)
        move    a0,x:(r7+$23)
        move    x:(r1),b
        move    x:(r7+$0e),b0
        sub     b,a
        asr     #10,a,a
        add     b,a
        move    a1,x:(r7+$0b)
        move    a0,x:(r7+$0e)
        move    x:(r7+$06),a
        move    x:(r7+$33),a0
        move    x:(r7+$09),b
        move    x:(r7+$0c),b0
        sub     b,a
        asr     #10,a,a
        add     b,a
        move    a1,x:(r7+$09)
        move    a0,x:(r7+$0c)
; The dry coefficient is shared by both channels.
        move    x:(r1),b
        neg     b
        add     #>$7fffff,b
        move    b,y0
        move    y0,x:(r7+$35)
; Sine of shared L/R phase, from a linearly interpolated 1025-point quarter.
        move    x:(r7+$03),a
        bsr     ac_sine
        move    a,y1
        move    x:(r7+$0a),x0
        mpy     x0,y1,a    x:(r1),y1
        move    a,x0
        mpy     x0,y1,a
        move    x:(r7+$0a),x0
        add     x0,a
        move    a1,x:(r7+$10)
        and     #>$3ff,a
        asl     #13,a,a
        move    a1,x:(r7+$11)
        move    x:(r7+$10),a
        asr     #10,a,a
        move    a1,x:(r7+$12)
; Count this sample before either channel writes/reads the current position.
        move    x:(r7+$37),a
        add     #>1,a
        move    #>8192,x0
        cmp     x0,a
        tge     x0,a
        move    a1,x:(r7+$37)
; Air pre-emphasis and three-point read are the same for each channel.
        lua     (r7+$15),r3
        move    x:(r7+$00),r4
        move    x:(r0),a
        bsr     ac_channel
        move    a,x:(r0)+
        lua     (r7+$1a),r3
        move    x:(r7+$00),a
        add     #>8192,a
        move    a,r4
        move    x:(r0),a
        bsr     ac_channel
        move    a,x:(r0)+
        move    x:(r7+$02),a
        sub     #>1,a
        and     #>$1fff,a
        move    a1,x:(r7+$02)
        move    x:(r7+$03),a
        move    x:(r7+$32),a0
        move    x:(r7+$09),b
        move    x:(r7+$0c),b0
        add     b,a
        move    a0,x:(r7+$32)
        and     #>$7fffff,a
        move    a1,x:(r7+$03)
        move    x:(r7+$04),a
        eor     #>1,a
        move    a1,x:(r7+$04)
ac_frameend:
        nop
ac_return:
        rts

ac_endpoint:
        move    #>$7f0000,x0
        cmp     x0,a
        move    #>$7fffff,x0
        tge     x0,a
        rts

ac_sine:
; Q23 phase 0..1 -> first quarter position; explicit a1 transfers drop
; masked accumulator extension bits. The cached endpoints reconstruct the
; exact original 1026 Q23 values from a lossless 256-word table.
        move    a1,b
        and     #>$1fffff,b
        move    b1,y0
        jclr    #21,a1,ac_unfold
        move    #>$200000,b
        move    y0,x0
        sub     x0,b
        move    b1,y0
ac_unfold:
        move    y0,a
        asr     #11,a,a
        move    a1,x1
        bsr     ac_lookup
        sub     x0,b
        move    b,y1
        move    y0,a
        and     #>$7ff,a
        asl     #12,a,a
        move    a1,y0
        move    x0,x1
        move    y0,x0
        mpy     x0,y1,a
        add     x1,a
        move    a,x0
        move    x0,a
        move    x:(r7+$03),b
        jclr    #22,b1,ac_positive
        neg     a
ac_positive:
        rts

ac_lookup:
; x1=index, y0=original quarter position (both preserved). Endpoints are
; cached per instance; a changed index advances or reverses one exact delta.
        move    x:(r7+$38),a
        sub     x1,a
        beq     ac_cachedsine
        bgt     ac_backwardsine
ac_advancesine:
        move    x:(r7+$3a),a
        move    x:(r7+$39),b
        sub     b,a
        move    a1,x:(r7+$3b)
        move    x1,a
        add     #>1,a
        bsr     ac_seconddiff
        move    x:(r7+$3b),a
        add     x0,a
        move    x:(r7+$3a),b
        move    b1,x:(r7+$39)
        add     b,a
        move    a1,x:(r7+$3a)
        bra     ac_cachefinish
ac_backwardsine:
        move    x:(r7+$3a),a
        move    x:(r7+$39),b
        sub     b,a
        move    a1,x:(r7+$3b)
        move    x:(r7+$38),a
        add     #>1,a
        bsr     ac_seconddiff
        move    x:(r7+$3b),a
        sub     x0,a
        move    x:(r7+$39),b
        move    b1,x:(r7+$3a)
        sub     a,b
        move    b1,x:(r7+$39)
ac_cachefinish:
        move    x1,x:(r7+$38)
ac_cachedsine:
        move    x:(r7+$39),x0
        move    x:(r7+$3a),b
        rts

ac_seconddiff:
; a=global second-difference index 2..1025. Four signed six-bit values
; share each P word. Preserve x1/y0; return the sign-extended value in x0.
        sub     #>2,a
        move    a,b
        and     #>3,b
        move    b1,y1
        asr     #2,a,a
        move    a1,n5
        move    x:(r7+$30),r5
        move    (r5)+n5
        move    y1,a
        asl     #1,a,a
        move    a,x0
        asl     #1,a,a
        add     x0,a
        move    a1,y1
        move    p:(r5),a
        asr     y1,a,a
        and     #>63,a
        asl     #18,a,a
        move    a1,x0
        move    x0,a
        asr     #18,a,a
        move    a1,x0
        rts

ac_channel:
; Previous is full Q23; even/odd states are Q23 + a 24-bit low word, with
; eight guard bits. Rounding never accumulates inside the air recurrences.
        move    a,x1
        move    x:(r3),b
        sub     x1,b      x1,x:(r3)+
        asr     #8,b,b
; Sign the air delta once; the even and odd updates use opposite signs.
        move    x:(r7+$04),a
        tst     a
        beq     ac_deltaready
        neg     b
ac_deltaready:
        move    x:(r3),a
        move    x:(r3+1),a0
        add     b,a
        move    a1,x:(r3)
        move    a0,x:(r3+1)
        move    a1,y0
        move    x:(r3+2),a
        move    x:(r3+3),a0
        sub     b,a
        move    a1,x:(r3+2)
        move    a0,x:(r3+3)
        move    a1,x0
        move    x:(r7+$04),b
        tst     b
        move    y0,b
        tne     x0,b
        move    b1,y0
; Keep the 48-bit recurrences in the accumulators instead of spilling
; each difference and loading it back. Arithmetic order/rounding is unchanged.
        move    x:(r3),b
        move    x:(r3+1),b0
        sub     b,a
        asr     #8,a,a
        move    x:(r3+2),b
        move    x:(r3+3),b0
        sub     a,b
        move    b1,x0
        move    #>839,y1
        mpy     x0,y1,a
        sub     a,b
        move    b1,x:(r3+2)
        move    b0,x:(r3+3)
; even -= (even-updatedOdd)/256, then the same full-precision leak.
        move    x:(r3),a
        move    x:(r3+1),a0
        sub     b,a
        asr     #8,a,a
        move    x:(r3),b
        move    x:(r3+1),b0
        sub     a,b
        move    b1,x0
        mpy     x0,y1,a
        sub     a,b
        move    b1,x:(r3)
        move    b0,x:(r3+1)
; The selected factor is captured BEFORE either state decays, as upstream.
        move    x:(r1),x0
        mpy     y0,x0,a    x1,b
        asr     #8,b,b
        add     b,a
        rnd     a
        move    x:(r7+$02),n5
        move    r4,r5
        move    (r5)+n5
; Shadow the slot's first 72 words in its own unused X state. This also
; works on private-Y slots, preserving one identical virtual ring layout.
        move    r5,b
        and     #>$3fff,b
        cmp     #>72,b
        bge     ac_writey
ac_writeshadow:
        add     #>60,b
        move    b1,n4
        move    r7,r4
        move    (r4)+n4
        move    a,x:(r4)
        bra     ac_writeend
ac_writey:
        move    a,y:(r5)
ac_writeend:
; Advance from the write address to age with the hardware modulo AGU.
; Allocator bases are 8192-word aligned. Restore linear mode for the sine.
        move    x:(r7+$12),n5
        move    #>8191,m5
        move    (r5)+n5
        jsr     (r2)
        move    #>$ffffff,m5
; Preserve the three tap words in registers through interpolation and
; correction, keeping the original truncations at the same arithmetic points.
        move    y1,b
        move    y1,a
        sub     x0,a
        move    x0,x1
        move    a,x0
        move    x:(r7+$11),y1
        mpy     x0,y1,a
        add     x1,a
        add     x1,b
        add     y0,a
        asr     #1,a,a
        move    a,x1
; Correction -0.01 * (s0 - 2*s1 + s2), after the 0.5 normalization.
        move    y0,a
        asl     #1,a,a
        sub     a,b
        move    b,y1
        move    #>83886,x0
        mpy     x0,y1,a
        move    a,b
        move    x1,a
        sub     b,a
; Blend in the full accumulator: no intermediate clipping of wet.
        move    a,x0
        move    x:(r1),y1
        mpy     x0,y1,a    x:(r0),x0
        asl     #8,a,a
        move    x:(r1+n1),y1
        mac     x0,y1,a    x:(r1),b
; MIX 0 preserves every original input bit.
        tst     b
        teq     x0,a
        rts

ac_maskedread:
; Return s0/s1/s2 in x0/y0/y1. The valid count includes the new sample.
; age+2 <= 8161, so only the last zero, one or two taps can be unwritten.
; Fully valid triplets use the same three reads even before the ring fills.
        move    x:(r7+$12),b
        move    x:(r7+$37),a
        sub     b,a
        cmp     #>2,a
        bgt     ac_warmread
        tst     a
        ble     ac_emptyread
        cmp     #>1,a
        beq     ac_oneread
ac_tworead:
        bsr     ac_readword
        move    x0,y0
        bsr     ac_readword
        move    x0,y1
        move    y0,x0
        move    y1,y0
        move    #>0,y1
        rts
ac_emptyread:
        move    #>0,x0
        move    #>0,y0
        move    #>0,y1
        rts
ac_oneread:
        bsr     ac_readword
        move    #>0,y0
        move    #>0,y1
        rts
ac_warmread:
; Most triplets remain entirely in Y. Only left-ring prefix/boundary
; triplets need the virtual-word helper; right-ring wrapping stays in Y.
        move    r5,a
        and     #>$3fff,a
        cmp     #>72,a
        blt     ac_shadowread
        cmp     #>8190,a
        blt     ac_yread
        cmp     #>8192,a
        bge     ac_yread
ac_shadowread:
        bsr     ac_readword
        move    x0,y0
        bsr     ac_readword
        move    x0,y1
        bsr     ac_readword
        move    x0,x1
        move    y0,x0
        move    y1,y0
        move    x1,y1
        rts
ac_yread:
        move    y:(r5)+,x0
        move    y:(r5)+,y0
        move    y:(r5)+,y1
        rts

ac_readword:
        move    r5,a
        and     #>$3fff,a
        cmp     #>72,a
        bge     ac_ready
ac_readshadow:
        add     #>60,a
        move    a1,n4
        move    r7,r4
        move    (r4)+n4
        move    x:(r4),x0
        move    (r5)+
        rts
ac_ready:
        move    y:(r5)+,x0
        rts
