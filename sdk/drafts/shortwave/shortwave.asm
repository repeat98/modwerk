; SPDX-License-Identifier: GPL-3.0-or-later
; SPDX-FileCopyrightText: 2026 Semi Erendönmez
; ---------------------------------------------------------------------------
; SHORTWAVE -- the track as a distant station on a shortwave receiver.
;
; One mono receiver per instance, mixed back over the stereo dry:
;   s   = (L + R)/4 * (1 - FADE * g)                 the station, fading (QSB)
;       + noise * NOIS^2/2 * (1/4 + FADE * g / 2)    static, rising as it fades
;       + noise * env / 4                            crackle bursts (CRAK)
;       + whistle * level(TUNE)                      the beat of a mistuned carrier
;   wet = lowpass1(clip3(gain(DRIV) * lowpass(BAND, highpass(150 Hz, s))))
;   out = dry + MIX * (wet - dry), per channel; MIX 0 returns the dry bit for bit.
; g is a smoothed random level: at a random moment (on average every 2 s at RATE
; 0 to 44 ms at 127) it picks a new target in 0..1 and glides to it in half that
; time. The whistle is a quadrature oscillator at 40 Hz..5.1 kHz (TUNE, 0 = in
; tune and silent), its pitch wandering by up to +-6 % with DRFT. The receiver's
; bandwidth is a state-variable low-pass at 300 Hz..4 kHz (BAND, damping 1) after
; a one-pole high-pass at 150 Hz, and a one-pole of the same f after the clip. clip3 is v - v^3/3 on v limited to +-1: 2/3 at
; full drive. gain(DRIV) is 2..8 on the half-scale sum, so a station at DRIV 0
; comes out at the dry's level.
;
; ABI (docs/remixer/HARNESS.md): r0 = audio block (interleaved stereo, in place),
; n7 = frames, r6 = parameters, r7 = state. A trig split's second call starts at
; r0 = split*2; nothing here depends on the frame's position in the block.
;   x:(r6+$0) TUNE  x:(r6+$1) BAND  x:(r6+$2) FADE  x:(r6+$3) RATE
;   x:(r6+$4) NOIS  x:(r6+$5) MIX   page 1, value << 16 with an LFO's fraction in
;                                   bits 15-8 (TUNE, BAND and RATE interpolate it)
;   x:(r6+$c) DRIV  x:(r6+$d) CRAK  x:(r6+$e) DRFT   page 2, slots 6/8/10, the
;                                   knob field (bits 23-16)
; Tables: the module's own P table (manifest.py), 129 words each: W the whistle's
; step 2 sin(pi f/fs) at +0, F the low-pass's 2 sin(pi fc/fs) at +129, K the
; chance a sample of a new fade target at +258. The base is placed by the build.
;
; r7 block ($00..$2c, all cleared by init):
;   $00 noise (24-bit LCG)       $01 high-pass x[n-1]    $02 high-pass y
;   $03 low-pass low             $04 low-pass band       $05/$06 whistle s/c
;   $07 fade g                   $08 fade target         $09 crackle envelope
;   $0a drift (slow noise)       $0b the table's base
;   glides, current/target, each a one-pole of 1/32 a sample, snapped per call
;   within 64 LSB:  $10/$11 whistle step   $12/$13 low-pass f   $14/$15 MIX
;                   $16/$17 whistle level  $18/$19 noise level  $1a/$1b FADE
;                   $1c/$1d drive/8
;   per call: $1e crackle threshold  $1f fade chance K  $20 drift depth
;   per sample: $21 this sample's noise  $22 crackle  $23 FADE*g  $24/$25 dry L/R
;   $26 the wet: the output one-pole's state   $27 v[n-1]   $28 c(midpoint)
;   $29..$2c the bits the high-pass, low, band and the output pole dropped, added back on the next sample
;   (first-order error feedback: no truncation bias, so silence decays to zero instead of a stuck DC)
;
; Multiplies use only the encodable operand orders (x0,x0 y0,y0 x1,x0 y1,y0
; x0,y1 y0,x0 x1,y0 y1,x1): dsp_asm turns any other order into mpysu. No rep.
; Labels are sw + two digits, none a prefix of another.
; ---------------------------------------------------------------------------
init:
        move    #>$ffffff,m5
        move    r7,r5                   ; r1 is the dispatcher's across init
        clr     a
        do      #<$2d,>sw00
        move    a,x:(r5)+
sw00:
        move    #>$5a5a5b,x0            ; the noise's seed
        move    x0,x:(r7+$0)
        move    #>$400000,x0            ; the whistle's amplitude, 1/2
        move    x0,x:(r7+$6)
        rts

proc:
        move    #>$ffffff,m0
        move    #>$ffffff,m4
        move    #>$ffffff,m5
        move    #>$fab1e0,r5            ; the table's base, placed by the build
        move    r5,x:(r7+$b)
; ---- TUNE: the whistle's step, and its level 0.08 * min(k / 8, 1) ------------
        move    x:(r6+$0),a
        move    #0,x1
        bsr     sw90
        move    a,x:(r7+$11)
        move    x:(r6+$0),a
        and     #>$7fff00,a
        asl     #4,a,a
        move    a,y0                    ; limited at 1 from k = 8
        move    #>$0a3d71,x0
        mpy     y0,x0,a
        move    a,x:(r7+$17)
; ---- BAND: the low-pass's f -------------------------------------------------
        move    x:(r6+$1),a
        move    #>$81,x1
        bsr     sw90
        move    a,x:(r7+$13)
; ---- FADE: the depth ---------------------------------------------------------
        move    x:(r6+$2),a
        and     #>$7fff00,a
        move    a1,x:(r7+$1b)
; ---- RATE: the chance a sample of a new fade target --------------------------
        move    x:(r6+$3),a
        move    #>$102,x1
        bsr     sw90
        move    a,x:(r7+$1f)
; ---- NOIS: k^2 / 2 -----------------------------------------------------------
        move    x:(r6+$4),a
        and     #>$7fff00,a
        move    a1,x0
        mpy     x0,x0,a
        asr     a
        move    a,x:(r7+$19)
; ---- MIX: k / 128, and 127 is the wet alone ----------------------------------
        move    x:(r6+$5),a
        and     #>$7fff00,a
        move    #>$7fffff,x1
        cmp     #>$7f0000,a
        tge     x1,a
        move    a1,x:(r7+$15)
; ---- DRIV: gain / 8 = 1/4 + 3/4 k --------------------------------------------
        move    x:(r6+$c),a
        and     #>$7f0000,a
        move    a1,x0
        move    #>$600000,y0
        mpy     y0,x0,a
        add     #>$200000,a
        move    a,x:(r7+$1d)
; ---- CRAK: the chance a sample of a burst, k^2 / 256 -------------------------
        move    x:(r6+$d),a
        and     #>$7f0000,a
        move    a1,x0
        mpy     x0,x0,a
        asr     #8,a,a
        move    a,x:(r7+$1e)
; ---- DRFT: the drift's depth, k / 16 -----------------------------------------
        move    x:(r6+$e),a
        and     #>$7f0000,a
        asr     #4,a,a
        move    a,x:(r7+$20)
; ---- snap a glide that is within 64 LSB of its target ------------------------
        lua     (r7+$10),r4
        do      #<7,>sw20
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
sw20:
        nop

; ---- the samples -------------------------------------------------------------
        do      n7,>sw40
; the glides
        lua     (r7+$10),r4
        do      #<7,>sw30
        move    x:(r4)+,x0              ; current
        move    x:(r4)-,a               ; target
        sub     x0,a
        asr     #5,a,a
        add     x0,a
        move    a,x:(r4)+
        move    (r4)+
sw30:
        nop
; noise: x = x * 1664525 + 1013904223 mod 2^24 (b0 carries the doubled product)
        move    x:(r7+$0),x0
        move    #>$0cb306,y0            ; (1664525 - 1) / 2
        mpy     y0,x0,b
        move    #0,x1
        add     x,b
        move    #>$6ef35f,y0
        move    #0,y1
        add     y,b
        move    b0,x0
        move    x0,x:(r7+$0)            ; x0 = the noise, full scale
; crackle: a burst of the noise, struck when |noise| falls under the threshold
        move    x0,b
        abs     b
        move    x:(r7+$9),y0
        move    #>$4ccccd,x1            ; the burst decays by 0.6 a sample
        mpy     x1,y0,a
        move    x:(r7+$1e),y1
        cmp     y1,b
        move    #>$7fffff,y0
        tlt     y0,a
        move    a,x:(r7+$9)
        move    a,y1
        mpy     x0,y1,a
        asr     a
        move    a,x:(r7+$22)            ; noise * env / 2
; fade: at a chance K a sample, the last sample's |noise| becomes the target
        move    x:(r7+$21),a
        abs     a
        move    a,y0                    ; a target, 0..1
        move    x:(r7+$1f),y1           ; K
        move    x0,x:(r7+$21)
        move    x0,b
        abs     b
        move    x:(r7+$8),a
        cmp     y1,b
        tlt     y0,a
        move    a,x:(r7+$8)
        move    x:(r7+$7),x1            ; g
        sub     x1,a
        move    a,x0
        mpy     x0,y1,a                 ; K (target - g)
        asl     a
        add     x1,a
        move    a,x:(r7+$7)
        move    a,y0
        move    x:(r7+$1a),x1
        mpy     x1,y0,a                 ; FADE * g
        move    a,x:(r7+$23)
; drift: noise through a one-pole of 2^-12, times 32, times DRFT's depth
        move    x:(r7+$a),x1
        move    x:(r7+$21),a
        sub     x1,a
        asr     #12,a,a
        add     x1,a
        move    a,x:(r7+$a)
        asl     #5,a,a
        move    a,y0                    ; limited
        move    x:(r7+$20),x0
        mpy     y0,x0,a                 ; the drift, +-DRFT/16
        move    a,y0
        move    x:(r7+$10),x1           ; the whistle's step
        mpy     x1,y0,a
        add     x1,a
        move    a,x1                    ; the step, drifted
; the whistle: s += w c, c -= w s
        move    x:(r7+$5),a
        move    x:(r7+$6),y0
        mac     x1,y0,a
        move    a,x:(r7+$5)
        move    a,y0
        move    x:(r7+$6),b
        mac     -x1,y0,b
        move    b,x:(r7+$6)
; the receiver's input, at half scale
        move    x:(r0)+,x0              ; L
        move    x0,x:(r7+$24)
        move    x:(r0)-,a               ; R
        move    a,x:(r7+$25)
        add     x0,a
        asr     #2,a,a
        move    a,x1                    ; (L + R) / 4
        move    #>$7fffff,b
        move    x:(r7+$23),x0           ; FADE * g
        sub     x0,b
        move    b,y0
        mpy     x1,y0,a                 ; the station, faded
        move    x0,b
        asr     b
        add     #>$200000,b
        move    b,y0
        move    x:(r7+$18),x1
        mpy     x1,y0,b                 ; the static's level: NOIS (1/4 + FADE g / 2)
        move    b,y0
        move    x:(r7+$21),x1
        mac     x1,y0,a                 ; + static
        move    x:(r7+$22),x1
        move    #>$400000,y0
        mac     x1,y0,a                 ; + crackle
        move    x:(r7+$5),x1
        move    x:(r7+$16),y0
        mac     x1,y0,a                 ; + whistle
; high-pass, 150 Hz: y = c (y + x - x[n-1])
        move    a,x0
        move    x:(r7+$1),b
        move    x0,x:(r7+$1)
        move    x:(r7+$2),a
        add     x0,a
        sub     b,a
        move    a,x1
        move    #>$7d5da0,y0
        mpy     x1,y0,a
        clr     b
        move    x:(r7+$29),b0           ; + the bits the last sample dropped
        add     b,a
        move    a0,x:(r7+$29)
        move    a,x:(r7+$2)
; low-pass: low += f band, band += f (x - low - band)
        move    x:(r7+$12),x1
        move    x:(r7+$4),y0
        move    x:(r7+$3),b
        move    x:(r7+$2a),b0
        mac     x1,y0,b
        move    b0,x:(r7+$2a)
        move    b,x:(r7+$3)
        sub     b,a
        sub     y0,a
        move    a,y0
        move    x:(r7+$4),b
        move    x:(r7+$2b),b0
        mac     x1,y0,b
        move    b0,x:(r7+$2b)
        move    b,x:(r7+$4)
; drive and the soft clip at twice the rate: v = gain * low, limited; c(v) = v - v^3 / 3 on the
; midpoint (v + v[n-1]) / 2 and on v, averaged
        move    x:(r7+$3),x1
        move    x:(r7+$1c),y0
        mpy     x1,y0,a
        asl     #3,a,a
        move    a,x0                    ; v, limited to +-1
        move    x:(r7+$27),b            ; v[n-1]
        move    x0,x:(r7+$27)
        add     x0,b
        asr     b
        move    b,x1                    ; the midpoint
        bsr     sw80
        move    a,x:(r7+$28)
        move    x:(r7+$27),x1
        bsr     sw80
        move    x:(r7+$28),x0
        add     x0,a
        asr     a
; the detector's output: one pole, k = the low-pass's f
        move    a,x0                    ; the clip's output
        move    x:(r7+$26),a            ; y
        move    x0,b
        sub     a,b                     ; x - y
        move    b,y0
        move    x:(r7+$12),x1
        move    x:(r7+$2c),a0
        mac     x1,y0,a
        move    a0,x:(r7+$2c)
        move    a,x:(r7+$26)
; out = dry + MIX (wet - dry), per channel
        move    x:(r7+$14),y0
        move    x:(r7+$26),b
        asr     b
        move    x:(r7+$24),a
        asr     a
        sub     a,b
        move    b,x1
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$24),x0
        add     x0,a
        move    a,x:(r0)+
        move    x:(r7+$26),b
        asr     b
        move    x:(r7+$25),a
        asr     a
        sub     a,b
        move    b,x1
        mpy     x1,y0,a
        asl     a
        move    x:(r7+$25),x0
        add     x0,a
        move    a,x:(r0)+
sw40:
        rts

; ---- c(x1) = x1 - x1^3 / 3, x1 within +-1: out a; uses b, x0, y0, y1 ---------
sw80:
        move    x1,x0
        mpy     x0,x0,b
        move    b,y1
        move    #>$2aaaab,y0
        mpy     y1,y0,b
        move    #>$7fffff,a
        sub     b,a
        move    a,y0
        mpy     y0,x0,a
        rts

; ---- a table entry, interpolated by the knob's LFO fraction -----------------
; In: a = the knob word, x1 = the table's offset. Out: a = T[k] + f (T[k+1] - T[k]).
; Uses b, x0, y0, y1, r5, n5.
sw90:
        and     #>$7fff00,a
        move    a1,y1
        asr     #$10,a,a
        add     x1,a
        move    a1,n5
        move    y1,a
        and     #>$00ff00,a
        asl     #$7,a,a
        move    a1,x0                   ; the fraction
        move    x:(r7+$b),r5
        move    (r5)+n5
        move    p:(r5)+,y0
        move    p:(r5),b
        move    y0,a
        sub     a,b
        move    b,y1
        mpy     x0,y1,a
        add     y0,a
        rts
