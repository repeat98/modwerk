; SPDX-License-Identifier: GPL-3.0-or-later
; SPDX-FileCopyrightText: 2026 Semi Erendönmez
; ---------------------------------------------------------------------------
; SHORTWAVE -- the track as a distant station on a shortwave receiver.
;
; One mono receiver per instance, mixed back over the stereo dry:
;   s   = (L + R)/4 * (1 - FADE * g)                 the station, fading (QSB)
;       + noise * NOIS^2/2 * (1/4 + FADE * g / 2)    static, rising as it fades
;       + noise * env / 4                            crackle bursts (CRAK)
;       + whistle * level(TUNE)                      AM: the beat of a mistuned carrier
;   h   = highpass(150 Hz, s)
;   d   = h + m * (shift(h) - h)                     USB/LSB: the mistuned SSB detector
;   wet = lowpass1(clip3(gain(DRIV) * lowpass(BAND, d)))
;   out = dry + MIX * (wet - dry), per channel; MIX 0 returns the dry bit for bit.
; g is a smoothed random level: at a random moment (on average every 2 s at RATE
; 0 to 44 ms at 127) it picks a new target in 0..1 and glides to it in half that
; time. One quadrature oscillator serves both modes: in AM it is the whistle at
; 40 Hz..5.1 kHz (TUNE, 0 = in tune and silent); in USB and LSB the whistle is
; off (no carrier) and the oscillator is the detector's mistuning, 0..500 Hz
; (500 (k/127)^2 Hz), run backwards in LSB. DRFT wanders its pitch by up to
; +-6 % in every mode. shift(h) = 2 (I C - Q S): I and Q are h through two
; chains of three first-order allpasses (a 90-degree pair from 170 Hz to 4.3 kHz,
; the fit in manifest.py), C and S the oscillator at one phase, so every partial
; moves by the oscillator's frequency: up with the carrier running forwards, down
; with it backwards. m glides 0 (AM) <-> 1 (USB, LSB) like the knobs. The
; receiver's bandwidth is a state-variable low-pass at 300 Hz..4 kHz (BAND,
; damping 1) after the 150 Hz one-pole high-pass, and a one-pole of the same f
; after the clip. clip3 is v - v^3/3 on v limited to +-1: 2/3 at full drive.
; gain(DRIV) is 2..8 on the half-scale sum, so a station at DRIV 0 comes out at
; the dry's level.
;
; ABI (docs/remixer/HARNESS.md): r0 = audio block (interleaved stereo, in place),
; n7 = frames, r6 = parameters, r7 = state. A trig split's second call starts at
; r0 = split*2; nothing here depends on the frame's position in the block.
;   x:(r6+$0) TUNE  x:(r6+$1) BAND  x:(r6+$2) FADE  x:(r6+$3) RATE
;   x:(r6+$4) NOIS  x:(r6+$5) MIX   page 1, value << 16 with an LFO's fraction in
;                                   bits 15-8 (TUNE, BAND and RATE interpolate it)
;   x:(r6+$c) MODE in the knob field (bits 23-16, slot 6), DRIV in the companion
;             field (bits 15-8, slot 7)
;   x:(r6+$d) CRAK  x:(r6+$e) DRFT  page 2, slots 8/10, the knob field
; Tables: the module's own P table (manifest.py): W the whistle's step
; 2 sin(pi f/fs) at +0, F the low-pass's 2 sin(pi fc/fs) at +129, K the chance a
; sample of a new fade target at +258, S the SSB shift's step at +387 (129 words
; each), and the six allpass coefficients at +516 (chain I's three, then chain
; Q's). The base is placed by the build.
;
; r7 block ($00..$3f used, $00..$83 cleared by init):
;   $00 noise (24-bit LCG)       $01 high-pass x[n-1]    $02 high-pass y
;   $03 low-pass low             $04 low-pass band       $05/$06 oscillator s/c
;   $07 fade g                   $08 fade target         $09 crackle envelope
;   $0a drift (slow noise)       $0b the table's base
;   glides, current/target, each a one-pole of 1/32 a sample, snapped per call
;   within 64 LSB:  $10/$11 oscillator step  $12/$13 low-pass f   $14/$15 MIX
;                   $16/$17 whistle level    $18/$19 noise level  $1a/$1b FADE
;                   $1c/$1d drive/8          $1e/$1f the SSB blend m
;   per call: $20 drift depth  $2d crackle threshold  $2e fade chance K  $2f MODE << 16
;             $3e the allpass coefficients' address
;   per sample: $21 this sample's noise  $22 crackle  $23 FADE*g  $24/$25 dry L/R
;   $26 the wet: the output one-pole's state   $27 v[n-1]   $28 c(midpoint)
;   $29..$2c the bits the high-pass, low, band and the output pole dropped, added back on the next sample
;   (first-order error feedback: no truncation bias, so silence decays to zero instead of a stuck DC)
;   $30..$33 chain I's x[n-1] and its three stages' y[n-1], $34..$37 chain Q's; $38..$3a and $3b..$3d the
;   bits each stage of I and of Q dropped
;   $3f the oscillator's C, at the same phase as S
;
; Multiplies use only the encodable operand orders (x0,x0 y0,y0 x1,x0 y1,y0
; x0,y1 y0,x0 x1,y0 y1,x1): dsp_asm turns any other order into mpysu. No rep.
; Labels are sw + two digits, none a prefix of another.
; ---------------------------------------------------------------------------
init:
        move    #>$ffffff,m5
        move    r7,r5                   ; r1 is the dispatcher's across init
        clr     a
        do      #$84,>sw00
        move    a,x:(r5)+
sw00:
        move    #>$5a5a5b,x0            ; the noise's seed
        move    x0,x:(r7+$0)
        move    #>$400000,x0            ; the oscillator's amplitude, 1/2
        move    x0,x:(r7+$6)
        rts

proc:
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        move    #>$ffffff,m2
        move    #>$ffffff,m4
        move    #>$ffffff,m5
        move    #>$fab1e0,r5            ; the table's base, placed by the build
        move    r5,x:(r7+$b)
        move    #>$204,n5               ; the allpass coefficients, +516
        move    (r5)+n5
        move    r5,x:(r7+$3e)
; ---- MODE: AM 0, USB 1, LSB 2 ------------------------------------------------
        move    x:(r6+$c),a
        and     #>$7f0000,a
        move    a1,x:(r7+$2f)
; ---- TUNE, AM: the whistle's step, and its level 0.08 * min(k / 8, 1) --------
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
        clr     a
        move    a,x:(r7+$1f)            ; the SSB blend: 0, the detector unused
; ---- TUNE, USB and LSB: the shift's step, backwards in LSB; no whistle -------
        move    x:(r7+$2f),a
        tst     a
        beq     sw15
        move    x:(r6+$0),a
        move    #>$183,x1
        bsr     sw90
        move    a,x0                    ; the step, forwards
        neg     a
        move    a,x1                    ; the step, backwards
        move    x0,a
        move    x:(r7+$2f),b
        cmp     #>$010000,b
        tgt     x1,a                    ; LSB
        move    a,x:(r7+$11)
        clr     a
        move    a,x:(r7+$17)
        move    #>$7fffff,x0
        move    x0,x:(r7+$1f)
sw15:
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
        move    a,x:(r7+$2e)
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
; ---- DRIV (slot 7, the companion field): gain / 8 = 1/4 + 3/4 k -------------
        move    x:(r6+$c),a
        and     #>$7f00,a
        asl     #8,a,a
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
        move    a,x:(r7+$2d)
; ---- DRFT: the drift's depth, k / 16 -----------------------------------------
        move    x:(r6+$e),a
        and     #>$7f0000,a
        asr     #4,a,a
        move    a,x:(r7+$20)
; ---- snap a glide that is within 64 LSB of its target ------------------------
        lua     (r7+$10),r4
        do      #<8,>sw20
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
; ---- the oscillator's amplitude ----------------------------------------------
; The coupled form keeps s^2 + c^2 + w s c = A^2 (1 - w^2/4) only while its step w holds; every glide and
; the drift move A a little, and a random walk over a session would move the whistle's level and the SSB
; detector's gain. Once a call, s and c are scaled by 1 + k, k = T - (s^2 + c^2 + w s c), T = (1 - w^2/4)/4:
; half a Newton step towards A = 1/2. At rest (init's s = 0, c = 1/2, w = 0) k is exactly 0.
        move    x:(r7+$10),x0           ; w, the glided step
        mpy     x0,x0,b
        move    x0,y1
        asr     #4,b,b                  ; w^2 / 16
        move    #>$200000,a
        sub     b,a                     ; T
        move    x:(r7+$5),x0            ; s
        move    x:(r7+$6),y0            ; c
        mac     -x0,x0,a
        mac     -y0,y0,a
        mpy     y0,x0,b                 ; s c
        move    b,x1
        mac     -y1,x1,a                ; k = T - I
        move    a,y1
        move    x0,a
        mac     x0,y1,a
        move    a,x:(r7+$5)             ; s (1 + k)
        move    y0,b
        mac     y1,y0,b
        move    b,x:(r7+$6)             ; c (1 + k)

; ---- the samples -------------------------------------------------------------
        do      n7,>sw40
; the glides: current = 31/32 current + target/32 (exact in the accumulator; the store floors, as
; current + (target - current)/32 did)
        lua     (r7+$10),r4
        move    #>$7c0000,y0            ; 31/32
        move    #>$040000,y1            ; 1/32
        move    x:(r4)+,x0
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$10)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$12)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$14)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$16)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$18)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$1a)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a   x:(r4)+,x0
        move    a,x:(r7+$1c)
        mpy     y0,x0,a   x:(r4)+,x1
        mac     y1,x1,a
        move    a,x:(r7+$1e)
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
        move    x:(r7+$2d),y1
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
        move    x:(r7+$2e),y1           ; K
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
        move    x:(r7+$10),x1           ; the oscillator's step
        mpy     x1,y0,a
        add     x1,a
        move    a,x1                    ; the step, drifted
; the oscillator: s += w c, c -= w s; C = (c[n] + c[n+1]) / 2 = c[n+1] + w s / 2 is the cosine at s's
; phase (c runs half a step ahead of s)
        move    x:(r7+$5),a
        move    x:(r7+$6),y0
        mac     x1,y0,a
        move    a,x:(r7+$5)
        move    y0,b                    ; c[n]
        move    a,y0                    ; s[n+1]
        mpy     -x1,y0,a                ; -w s
        add     a,b
        move    b,x:(r7+$6)             ; c[n+1]
        asr     a
        sub     a,b
        move    b,x:(r7+$3f)            ; C
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
; the SSB detector: chains I and Q, three first-order allpasses each, y = x[n-1] + a (x - y[n-1]).
; Each stage carries the bits its store drops into its next sample (error feedback, in a0 as the
; receiver's other filters do), so a stage left at -1 LSB on silence climbs out instead of holding a DC
; the shift would turn into a tone. r1 reads and r2 writes a chain's x[n-1] and its stages' y[n-1].
        move    a,x1                    ; h, the chains' input
        move    x1,y0                   ; h, kept for the blend (the chains leave y0 alone)
        lua     (r7+$30),r1
        lua     (r7+$30),r2
        move    x:(r7+$3e),r5           ; the coefficients
; chain I
        move    x:(r1)+,a               ; x[n-1]
        move    x:(r7+$38),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$38)
        move    a,x1                    ; the next stage's x
        move    x0,a                    ; the next stage's x[n-1]: this stage's y[n-1]
        move    x:(r7+$39),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$39)
        move    a,x1                    ; the next stage's x
        move    x0,a                    ; the next stage's x[n-1]: this stage's y[n-1]
        move    x:(r7+$3a),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$3a)
        move    a,x:(r2)+               ; the chain's output, and its y[n-1] next sample
; chain Q
        move    y0,x1
        move    x:(r1)+,a
        move    x:(r7+$3b),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$3b)
        move    a,x1                    ; the next stage's x
        move    x0,a                    ; the next stage's x[n-1]: this stage's y[n-1]
        move    x:(r7+$3c),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$3c)
        move    a,x1                    ; the next stage's x
        move    x0,a                    ; the next stage's x[n-1]: this stage's y[n-1]
        move    x:(r7+$3d),a0           ; + the bits this stage dropped last sample
        move    p:(r5)+,y1              ; a
        mac     y1,x1,a   x:(r1)+,x0    ; + a x       x0 = y[n-1]
        mac     -x0,y1,a  x1,x:(r2)+    ; - a y[n-1]  x[n-1] <- x
        move    a0,x:(r7+$3d)
        move    a,x:(r2)+               ; the chain's output, and its y[n-1] next sample
; shift(h) / 2 = I C - Q S
        move    a,x1                    ; Q
        move    x:(r7+$5),y1            ; S
        mpy     -y1,x1,a
        move    x:(r7+$33),x0           ; I
        move    x:(r7+$3f),y1           ; C
        mac     x0,y1,a
; the blend: d = h + m (shift(h) - h), worked at half scale so the difference cannot clip
        move    y0,b
        asr     b
        sub     b,a                     ; (shift(h) - h) / 2
        move    a,x0
        move    x:(r7+$1e),y1           ; m
        mpy     x0,y1,a
        asl     a
        add     y0,a                    ; d
; low-pass: low += f band, band += f (x - low - band)
        move    x:(r7+$12),x1
        move    x:(r7+$4),y0
        move    x:(r7+$3),b
        move    x:(r7+$2a),b0
        mac     x1,y0,b
        move    b0,x:(r7+$2a)
        move    b,x:(r7+$3)
        move    b,x0                    ; low as stored: with the accumulator's dropped bits in the
        sub     x0,a                    ; difference, low = -1 LSB, band = 0 on silence held for good
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
