; PROGRAM PROBE (development fixture of the base's program areas, events.json ot_dsp_effects): the proc runs the area its
; slot record names, X:$7fb0 + 4 * ((r7 >> 8) & 15), word 0, and nothing while that word is 0. The audio is never touched.
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
        move    a1,r1
        nop
        jsr     (r1)
ppdry:
        rts
