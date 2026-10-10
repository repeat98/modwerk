; OUTPUT MATRIX, DSP side: payload A (core 0) only.
;
; Hook 1, P:$257 `brset #$a,a,func_000292` (the mixdown's MASTER TRACK
; branch) becomes `jsr >omx_mix`. Outside MATRIX this replays the branch:
; the plain path continues at P:$259 through the rts, the master path drops
; the hook's return and jumps to P:$292. In MATRIX the module mixes the 16
; samples itself and jumps to P:$2d5, where stock packs MAIN and the inputs
; for the recorder and adds the metronome to CUE and MAIN.
;
; Hook 2, P:$30a `move x:>$205,r0` (the phones crossfade) becomes
; `jsr >omx_phn`. Outside MATRIX it replays the move and returns. In MATRIX
; it writes the PHONES bus, plus the metronome at its CUE volume, to ring
; words 4/5 (swapped on the MKII, page word $2b bit 0, as stock does) and
; jumps to P:$35a, past the crossfade.
;
; The level page (X:$205) in MATRIX, from matrix.s: $28 CUE level, $37 MAIN
; level, $38 PHONES level, $39/$3a eight 4-bit destinations (T1 and T5 in
; the top bits), $3b bit 0 set. $29 arrives as unity, so a track's ramped
; MAIN gain Y:$4a+20j+k is its level x XVOL with no bus level in it (and
; carries stock's 1/4 headroom, undone by the asl #2 below, as stock does).
;
; Per sample j, per track k: y = g x (L and R). Each output pair (CUE, MAIN,
; PHONES) has three lists of the tracks routed to it: stereo (L += yL,
; R += yR), mono left (L += yL/2 + yR/2) and mono right. The inputs keep
; stock's gains: DIR into MAIN, their cue gain into CUE. Then the bus level:
; out = 4 f lim(4 sum), f = (level/128)^2 ramped over the frame, so 64 = 0
; dB and 127 = +11.9 dB, the stock law.
;
; With MASTER TRACK on, T1-T7's MAIN sums and the DIR inputs go unscaled to
; the master's input (X:(X:$209)+$1f8, 2 words a sample, as stock writes
; it) and MAIN is T8's own MAIN routing; T8 may also go to CUE or PHONES.
;
; Cheap paths: the lists are rebuilt only when the destinations or MASTER
; TRACK change; CUE is skipped (written 0) when no track goes there and the
; inputs' cue gains are 0 at both ends of the frame (the ramp is monotonic);
; PHONES is skipped when no track goes there; the mono lists are skipped
; when a bus has none; the bus ramps are skipped when no level moves.
;
; Y memory, payload A (claimed in the manifest):
;   $c00-$c02 current bus factors C, M, P   $c03-$c05 per-sample steps
;   $c06 master flag     $c07 master send pointer   $c08-$c0a targets
;   $c0b init marker     $c0c inputs pointer (r2 at entry)   $c0d 1 if a level moves
;   $c0e-$c10 the destinations and master flag the lists were built from
;   $c11-$c19 list lengths: CUE stereo, mono L, mono R, then MAIN, PHONES
;   $c1a-$c1c T8's MAIN as the master: stereo, mono L, mono R (0 or 1)
;   $c1d $cbf, T8's y address: the list those three counts walk
;   $c20-$c67 the nine lists, 8 y addresses each, in the order of $c11-$c19
;   $c90-$caf PHONES out, 16 x (L, R)     $cb0 the y loop's first store
;   $cb1-$cc0 y, 8 x (L, R)
;
; Registers: X pointers r0-r3, Y pointers r4-r7 (dual moves). Everything
; after P:$2d5 and P:$35a reloads what it reads; m0 is put back to linear.
; A zero `do` count skips the loop, as stock's gain ramp relies on. An
; address register loaded by one move may address the next: stock does it
; (A P:$564, B P:$7ac), so the chip interlocks.
; Immediates into data registers are long (#>n): a short one lands in the
; top byte. Forms: no brset (dsp_asm writes its target absolute), no
; backward bsr (dsp_asm refuses it), no displaced Y moves; absolute Y moves
; and negative lua as Character (hardware) and BusDelay use them.
;
; x1 holds this frame's flags through the sample loop:
;   bit 0 CUE has mono entries   bit 1 MAIN has   bit 2 PHONES has
;   bit 3 CUE is used            bit 4 PHONES is used
;   bit 5 MASTER TRACK           bit 6 the bus levels are steady
;   bit 7 the inputs' DIR gains are not 0 at either end of the frame
;   bit 9 the inputs' cue gains are not 0 at either end of the frame
;   bit 8 every track goes to MAIN in stereo and nowhere else, no master:
;         MAIN sums straight from the blocks, as stock does

omx_mix:
        move    x:>$205,r6              ; the level page
        move    x:(r6+$3b),b            ; MATRIX: the word is exactly 1. Until the
        and     #>$ffff,b               ; ColdFire's first page lands, the bank
        cmp     #>1,b                   ; holds whatever RAM held at power-on
        beq     omx_active
        btst    #10,a                   ; stock: MASTER TRACK
        bcs     omx_stockm
        rts
omx_stockm:
        move    ssh,x0                  ; drop the hook's return
        jmp     $292

omx_active:
        and     #>$400,a                ; MASTER TRACK, from the record word
        move    a1,y:>$c06
        move    r2,x0                   ; the inputs, as stock pointed them
        move    x0,y:>$c0c
        move    x:>$209,r3
        move    #>$1f8,n3
        move    (r3)+n3
        move    r3,x0
        move    x0,y:>$c07              ; the master's input, this frame

; ---- bus factors: target (level/128)^2, a ramp from the current value
        move    y:>$c0b,a               ; RAM starts dirty on the unit: first
        move    #>$5a5a5a,x0            ; time, start the ramps at the targets
        cmp     x0,a                    ; and force the lists to build
        beq     omx_inited
        move    x0,y:>$c0b
        move    #>$ffffff,x0
        move    x0,y:>$c0e
        move    x:(r6+$28),a
        bsr     omx_sq
        move    a,y:>$c00
        move    x:(r6+$37),a
        bsr     omx_sq
        move    a,y:>$c01
        move    x:(r6+$38),a
        bsr     omx_sq
        move    a,y:>$c02
omx_inited:
        clr     b                       ; b1 collects the three steps (or)
        move    x:(r6+$28),a
        bsr     omx_ramp0
        move    x:(r6+$37),a
        bsr     omx_ramp1
        move    x:(r6+$38),a
        bsr     omx_ramp2
        move    b1,y:>$c0d              ; the lists' build uses b

; ---- the lists, when the destinations or MASTER TRACK changed
        move    x:(r6+$39),a
        move    y:>$c0e,x0
        cmp     x0,a
        bne     omx_rebuild
        move    x:(r6+$3a),a
        move    y:>$c0f,x0
        cmp     x0,a
        bne     omx_rebuild
        move    y:>$c06,a
        move    y:>$c10,x0
        cmp     x0,a
        beq     omx_built
omx_rebuild:
        bsr     omx_build
omx_built:

; ---- this frame's flags, into x1
        clr     a
        move    y:>$c06,x0              ; bit 5: MASTER TRACK
        btst    #10,x0
        bcc     omx_f1
        bset    #5,a
omx_f1:
        move    y:>$c0d,b               ; bit 6: no bus level moves
        tst     b
        bne     omx_f2
        bset    #6,a
omx_f2:
        move    y:>$c12,b               ; bit 0: CUE has mono entries
        move    y:>$c13,x0
        add     x0,b
        beq     omx_f3
        bset    #0,a
        bset    #3,a
omx_f3:
        move    y:>$c11,b               ; bit 3: CUE is used: tracks, or the
        tst     b                       ; inputs' cue gains at either end
        beq     omx_f4a
        bset    #3,a
omx_f4a:
        move    y:>$48,b
        tst     b
        bne     omx_f4b
        move    y:>$49,b
        tst     b
        bne     omx_f4b
        move    y:>$174,b               ; $40 + 20*15 + 8
        tst     b
        bne     omx_f4b
        move    y:>$175,b
        tst     b
        beq     omx_f5
omx_f4b:
        bset    #3,a
        bset    #9,a
omx_f5:
        move    y:>$c15,b               ; bit 1: MAIN has mono entries
        move    y:>$c16,x0
        add     x0,b
        move    y:>$c1b,x0
        add     x0,b
        move    y:>$c1c,x0
        add     x0,b
        beq     omx_f6
        bset    #1,a
omx_f6:
        move    y:>$c18,b               ; bit 2: PHONES has mono entries
        move    y:>$c19,x0
        add     x0,b
        beq     omx_f7
        bset    #2,a
        bset    #4,a
omx_f7:
        move    y:>$c17,b               ; bit 4: PHONES is used
        tst     b
        beq     omx_f8
        bset    #4,a
omx_f8:
        move    y:>$52,b                ; bit 7: the inputs' DIR gains, sample 0
        tst     b
        bne     omx_f9b
        move    y:>$53,b
        tst     b
        bne     omx_f9b
        move    y:>$17e,b               ; and sample 15: $4a + 20*15 + 8
        tst     b
        bne     omx_f9b
        move    y:>$17f,b
        tst     b
        beq     omx_fdir0
omx_f9b:
        bset    #7,a
omx_fdir0:
        move    a1,x0                   ; bit 8: the fast path, when MAIN stereo
        and     #>$3e,a                 ; holds all eight and no bit 1-5 is set
        bne     omx_ffast
        move    y:>$c14,b
        move    #>8,y0
        cmp     y0,b
        bne     omx_ffast
        move    x0,a
        bset    #8,a
        move    a1,x0
omx_ffast:
        move    x0,x1

; ---- the 16 samples
        move    y:>$c0c,x0
        move    x0,r2                   ; inputs: AB L, AB R, CD L, CD R a sample
        move    x:>$204,r0              ; T1's block; track k at +32k, L/R a sample
        move    #$ff,m0                 ; the eight blocks wrap, as stock walks them
        move    #$1f,n0
        move    x:>$203,r1              ; the ring: CUE L/R, MAIN L/R, ... 8 a sample
        move    #$5,n1
        move    #>$4a,r5                ; MAIN gains of sample 0
        move    #>$c90,r6               ; PHONES out
        move    #>$400000,y1            ; one half, for the mono lists
        do      #16,omx_samples

        btst    #8,x1
        bcc     omx_general
        clr     a                       ; the fast path: MAIN straight from the
        clr     b                       ; blocks, CUE and PHONES silent
        do      #8,omx_fast
        move    x:(r0)+,x0      y:(r5)+,y0
        mac     y0,x0,a         x:(r0)+n0,x0
        mac     y0,x0,b
omx_fast:
        move    (r0)+
        move    (r0)+
        move    (r5)+                   ; r5 at slot 9, as the general path leaves it
        move    #0,x0
        move    x0,x:(r1)+              ; CUE L, R: 0 (PHONES' 0 comes from its
        move    x0,x:(r1)+              ; own section: bit 4 is clear)
        bra     omx_mainin
omx_general:
        move    #>$cb0,r4               ; y = g x for the eight tracks, pipelined:
        move    x:(r0)+,x0      y:(r5)+,y0      ; each b lands one track later
        do      #8,omx_ygain
        mpy     y0,x0,a         x:(r0)+n0,x0    b,y:(r4)+
        mpy     y0,x0,b         a,y:(r4)+
        move    x:(r0)+,x0      y:(r5)+,y0
omx_ygain:
        move    b,y:(r4)+               ; T8's R
        move    (r0)+                   ; the blocks wrapped, one read ahead: next sample

; CUE
        btst    #3,x1
        bcs     omx_cueon
        clr     a
        move    a,x:(r1)+
        move    a,x:(r1)+
        bra     omx_cuedone
omx_cueon:
        clr     a
        clr     b
        move    #>$c20,r7
        move    y:>$c11,n7
        do      n7,omx_cs
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        add     x0,a            y:(r4)+,x0
        add     x0,b
omx_cs:
        btst    #0,x1
        bcc     omx_cnomono
        move    #>$c28,r7
        move    y:>$c12,n7
        do      n7,omx_cml
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,a         y:(r4)+,x0
        mac     x0,y1,a
omx_cml:
        move    #>$c30,r7
        move    y:>$c13,n7
        do      n7,omx_cmr
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,b         y:(r4)+,x0
        mac     x0,y1,b
omx_cmr:
omx_cnomono:
        btst    #9,x1                   ; + the inputs at their cue gains, if any
        bcc     omx_nocuein
        move    r2,r3
        lua     (r5-11),r4              ; (r5 is at MAIN slot 9: cue slot 8 is 11 back)
        move    x:(r3)+,x0      y:(r4)+,y0
        mac     y0,x0,a         x:(r3)+,x0
        mac     y0,x0,b         x:(r3)+,x0      y:(r4)+,y0
        mac     y0,x0,a         x:(r3)+,x0
        mac     y0,x0,b
omx_nocuein:
        move    y:>$c00,y0              ; the CUE level
        asl     #2,a,a
        asl     #2,b,b
        move    a,x0
        mpy     y0,x0,a
        move    b,x0
        mpy     y0,x0,b
        asl     #2,a,a
        asl     #2,b,b
        move    a,x:(r1)+               ; CUE L, R
        move    b,x:(r1)+
omx_cuedone:

; MAIN
        clr     a
        clr     b
        move    #>$c38,r7
        move    y:>$c14,n7
        do      n7,omx_ms
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        add     x0,a            y:(r4)+,x0
        add     x0,b
omx_ms:
        btst    #1,x1
        bcc     omx_mnomono
        move    #>$c40,r7
        move    y:>$c15,n7
        do      n7,omx_mml
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,a         y:(r4)+,x0
        mac     x0,y1,a
omx_mml:
        move    #>$c48,r7
        move    y:>$c16,n7
        do      n7,omx_mmr
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,b         y:(r4)+,x0
        mac     x0,y1,b
omx_mmr:
omx_mnomono:
omx_mainin:
        btst    #7,x1                   ; + the inputs at their DIR gains, if any
        bcc     omx_nodir
        move    r2,r3
        lua     (r5-1),r4
        move    x:(r3)+,x0      y:(r4)+,y0
        mac     y0,x0,a         x:(r3)+,x0
        mac     y0,x0,b         x:(r3)+,x0      y:(r4)+,y0
        mac     y0,x0,a         x:(r3)+,x0
        mac     y0,x0,b
omx_nodir:
        btst    #5,x1                   ; MASTER TRACK?
        bcc     omx_mainout
        move    y:>$c07,x0              ; T1-T7 and the inputs, unscaled, into
        move    x0,r3                   ; the master's input as stock writes it
        move    a,x:(r3)+
        move    b,x:(r3)+
        move    r3,x0
        move    x0,y:>$c07
        clr     a                       ; MAIN is T8's own MAIN routing
        clr     b
        move    #>$c1d,r7
        move    y:>$c1a,n7
        do      n7,omx_t8s
        move    y:(r7),r4
        move    y:(r4)+,x0
        add     x0,a            y:(r4)+,x0
        add     x0,b
omx_t8s:
        move    y:>$c1b,n7
        do      n7,omx_t8l
        move    y:(r7),r4
        move    y:(r4)+,x0
        mac     x0,y1,a         y:(r4)+,x0
        mac     x0,y1,a
omx_t8l:
        move    y:>$c1c,n7
        do      n7,omx_t8r
        move    y:(r7),r4
        move    y:(r4)+,x0
        mac     x0,y1,b         y:(r4)+,x0
        mac     x0,y1,b
omx_t8r:
omx_mainout:
        move    y:>$c01,y0              ; the MAIN level
        asl     #2,a,a
        asl     #2,b,b
        move    a,x0
        mpy     y0,x0,a
        move    b,x0
        mpy     y0,x0,b
        asl     #2,a,a
        asl     #2,b,b
        move    a,x:(r1)+               ; MAIN L, R
        move    b,x:(r1)+n1             ; next sample's CUE L

; PHONES
        btst    #4,x1
        bcs     omx_phon
        clr     a
        move    a,y:(r6)+
        move    a,y:(r6)+
        bra     omx_phdone
omx_phon:
        clr     a
        clr     b
        move    #>$c50,r7
        move    y:>$c17,n7
        do      n7,omx_ps
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        add     x0,a            y:(r4)+,x0
        add     x0,b
omx_ps:
        btst    #2,x1
        bcc     omx_pnomono
        move    #>$c58,r7
        move    y:>$c18,n7
        do      n7,omx_pml
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,a         y:(r4)+,x0
        mac     x0,y1,a
omx_pml:
        move    #>$c60,r7
        move    y:>$c19,n7
        do      n7,omx_pmr
        move    y:(r7)+,r4
        move    y:(r4)+,x0
        mac     x0,y1,b         y:(r4)+,x0
        mac     x0,y1,b
omx_pmr:
omx_pnomono:
        move    y:>$c02,y0              ; the PHONES level
        asl     #2,a,a
        asl     #2,b,b
        move    a,x0
        mpy     y0,x0,a
        move    b,x0
        mpy     y0,x0,b
        asl     #2,a,a
        asl     #2,b,b
        move    a,y:(r6)+
        move    b,y:(r6)+
omx_phdone:

        btst    #6,x1                   ; the bus ramps, unless steady
        bcs     omx_noramp
        move    y:>$c00,a
        move    y:>$c03,x0
        add     x0,a
        move    a,y:>$c00
        move    y:>$c01,a
        move    y:>$c04,x0
        add     x0,a
        move    a,y:>$c01
        move    y:>$c02,a
        move    y:>$c05,x0
        add     x0,a
        move    a,y:>$c02
omx_noramp:
        lua     (r5+$b),r5              ; next sample's MAIN gains (r5 was at slot 9)
        lua     (r2+4),r2
omx_samples:

        move    y:>$c08,x0              ; the ramps end on their targets
        move    x0,y:>$c00
        move    y:>$c09,x0
        move    x0,y:>$c01
        move    y:>$c0a,x0
        move    x0,y:>$c02
        move    #>$ffffff,m0
        move    ssh,x0                  ; drop the hook's return
        jmp     $2d5

; One bus's ramp from its page word in a: target, step (target - current)
; / 16; bit 0 of b set when the stored step is not 0.
omx_ramp0:
        bsr     omx_sq
        move    a,y:>$c08
        move    y:>$c00,x0
        sub     x0,a
        asr     #4,a,a
        move    a,y:>$c03
        move    y:>$c03,a             ; reloaded: a0 still holds mpy's low bits,
        tst     a                       ; and tst sees all 56
        beq     omx_rs0
        bset    #0,b                    ; this level moves
omx_rs0:
        rts
omx_ramp1:
        bsr     omx_sq
        move    a,y:>$c09
        move    y:>$c01,x0
        sub     x0,a
        asr     #4,a,a
        move    a,y:>$c04
        move    y:>$c04,a             ; reloaded: a0 still holds mpy's low bits,
        tst     a                       ; and tst sees all 56
        beq     omx_rs1
        bset    #0,b                    ; this level moves
omx_rs1:
        rts
omx_ramp2:
        bsr     omx_sq
        move    a,y:>$c0a
        move    y:>$c02,x0
        sub     x0,a
        asr     #4,a,a
        move    a,y:>$c05
        move    y:>$c05,a             ; reloaded: a0 still holds mpy's low bits,
        tst     a                       ; and tst sees all 56
        beq     omx_rs2
        bset    #0,b                    ; this level moves
omx_rs2:
        rts

; a = (level/128)^2 from a page word in a (top byte: the transfer's tag).
omx_sq:
        asl     #16,a,a
        move    a,x0
        mpy     x0,x0,a
        rts

; The nine lists from the eight codes on the page at r6. Table at the
; ptable: per code, for CUE, MAIN and PHONES, the list's number 1-9 (3 x bus
; + kind, kind 1 stereo, 2 mono L, 3 mono R) or 0. List w's length is at
; $c10 + w and its entries at $c18 + 8w. With MASTER TRACK on, T8 (listed
; last) leaves the MAIN lists for $c1a-$c1c.
omx_build:
        move    x:(r6+$39),a            ; T1..T4
        move    a1,y:>$c0e
        move    x:(r6+$3a),y1           ; T5..T8
        move    y1,y:>$c0f
        move    y:>$c06,x0
        move    x0,y:>$c10
        move    #>$c11,r4               ; lengths and T8's counts: 0
        clr     b
        do      #12,omx_bclr
        move    b,y:(r4)+
omx_bclr:
        move    #>$fab1e0,r3            ; the code table: 14 codes x 3 words
        move    #>$cb1,x1               ; T1's y address
        bsr     omx_codes
        move    y1,a
        bsr     omx_codes
        move    #>$cbf,x0
        move    x0,y:>$c1d
        move    y:>$c06,x0              ; MASTER TRACK: T8 out of the MAIN lists
        btst    #10,x0
        bcc     omx_bdone
        move    #>$c14,r4               ; MAIN's three lengths
        move    #>$c1a,r6               ; T8's three counts
        move    #>$c38,r7               ; MAIN stereo list
        do      #3,omx_bt8end
        move    y:(r4),b                ; this list's length
        tst     b
        beq     omx_bt8next
        move    r7,x0                   ; its last entry: T8's?
        add     x0,b
        sub     #1,b
        move    b1,r5
        move    y:(r5),b
        move    #>$cbf,x0
        cmp     x0,b
        bne     omx_bt8next
        move    y:(r4),b                ; yes: one fewer here, T8 counted there
        sub     #1,b
        move    b1,y:(r4)
        move    #>1,x0
        move    x0,y:(r6)
omx_bt8next:
        move    (r4)+
        move    (r6)+
        lua     (r7+8),r7
omx_bt8end:
omx_bdone:
        rts

; Four tracks from the codes in a (first in bits 15..12); x1 the track's y
; address, advanced by 2 a track; table at r3.
omx_codes:
        do      #4,omx_cdone
        move    a1,b
        asr     #12,b,b
        and     #>$f,b                  ; the code; b0 holds what the asr shifted out,
        move    b1,x0                   ; so reload it clean before shifting left
        move    x0,b
        move    #>13,y0                 ; above 13 (dirty RAM, never the ColdFire):
        cmp     y0,b                    ; OFF, so the table read stays in its 14 rows
        ble     omx_cok
        move    y0,b
        move    y0,x0
omx_cok:
        asl     #1,b,b                  ; 2c
        add     x0,b                    ; 3c
        move    b1,n2
        move    r3,r2
        move    (r2)+n2                 ; this code: CUE, MAIN, PHONES list numbers
        do      #3,omx_cbus
        move    p:(r2)+,b               ; w, 0 = not routed to this bus
        tst     b
        beq     omx_cnext
        move    b1,n4
        move    #>$c10,r4
        move    (r4)+n4                 ; its length
        asl     #3,b,b                  ; 8w
        add     #>$c18,b                ; the list
        move    y:(r4),x0
        add     x0,b                    ; + the length: the free entry
        move    b1,r5
        move    x1,y:(r5)
        move    x0,b
        add     #1,b
        move    b1,y:(r4)
omx_cnext:
        nop
omx_cbus:
        move    x1,b                    ; the next track's y address
        add     #2,b
        move    b1,x1
        asl     #4,a,a                  ; the next code
omx_cdone:
        rts

; ---- hook 2: PHONES into ring words 4/5 ------------------------------
omx_phn:
        move    x:>$205,r0              ; the displaced instruction
        move    x:(r0+$3b),b            ; MATRIX: exactly 1, as in hook 1
        and     #>$ffff,b
        cmp     #>1,b
        beq     omx_phactive
        rts
omx_phactive:
        move    x:(r0+$32),a            ; the metronome at its CUE volume,
        asl     #16,a,a                 ; squared as stock does at P:$2f4
        move    a,x0                    ; (inline: dsp_asm cannot encode a
        mpy     x0,x0,a                 ; backward bsr)
        move    a,x1
        move    x:(r0+$2b),b            ; bit 0: the MKII swaps phones L/R
        move    x:>$203,r1
        move    #>$280,r4               ; this frame's click
        move    #>$c90,r5
        btst    #0,b
        bcs     omx_phswap
        lua     (r1+4),r1               ; L -> word 4, R -> word 5
        move    #7,n1
        do      #16,omx_phloop1
        move    y:(r5)+,a
        move    y:(r4)+,y0
        mac     x1,y0,a         y:(r5)+,b
        mac     x1,y0,b
        move    a,x:(r1)+
        move    b,x:(r1)+n1
omx_phloop1:
        move    ssh,x0
        jmp     $35a
omx_phswap:
        lua     (r1+5),r1               ; L -> word 5, R -> word 4
        move    #9,n1
        do      #16,omx_phloop2
        move    y:(r5)+,a
        move    y:(r4)+,y0
        mac     x1,y0,a         y:(r5)+,b
        mac     x1,y0,b
        move    a,x:(r1)-
        move    b,x:(r1)+n1
omx_phloop2:
        move    ssh,x0
        jmp     $35a
