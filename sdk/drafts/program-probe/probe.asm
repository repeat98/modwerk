; PROGRAM PROBE (development fixture of the base's program areas and stream, events.json ot_dsp_effects): the proc runs
; the area its slot record names, X:$7fb0 + 4 * ((r7 >> 8) & 15), word 0, and nothing while that word is 0; with both
; stream words set (1 the in-block's offset in this frame's host bank, 2 the out-block's) it echoes the in-block's two
; halfwords into the out-block. The audio is never touched.
init:
        rts
proc:
        move    r7,a
        lsr     #6,a
        and     #>$3c,a
        add     #>$7fb0,a
        move    a1,r1
        nop
        move    x:(r1),a
        tst     a
        beq     ppdry
        move    a1,r2
        nop
        jsr     (r2)
ppdry:
        move    x:(r1+1),a              ; the in-block's offset, 0 none
        tst     a
        beq     ppdone
        move    x:(r1+2),b              ; the out-block's
        tst     b
        beq     ppdone
        move    r6,x0                   ; the parameter page lies in this frame's bank: $2000-$3fff or $4000-$5fff
        move    #>$ffe000,x1
        move    x0,a1
        and     x1,a                    ; only A1 is read below
        move    a1,x0
        move    x:(r1+1),a
        add     x0,a
        move    a1,r2
        move    x:(r1+2),b
        add     x0,b
        move    b1,r3
        nop
        move    x:(r2)+,x1
        move    x1,x:(r3)+
        move    x:(r2),x1
        move    x1,x:(r3)
ppdone:
        rts
