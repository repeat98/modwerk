; Quadraverb's shell, the release package's DSP part (engine/qvarea.py writes it; no Alesis program in it).
; The base writes the picked program's code into one of the slot's two program areas and names it in word 0 of the
; slot's record, X:$7fb0 + 4 ((r7 >> 8) & 15) (docs/OCTATRACK_API.md, "Program areas"). proc runs that area with the
; dispatcher's registers as it got them (a1 the frame flag, r0, n7, r6, r7), or leaves the block dry while there is none.
; init keeps the slot's buffer base and clears the signature: the first area to run sets itself up (qvc ASTATE).

init:
        move    #>$ffffff,m4
        move    x:>$213,r4
        move    x:(r4),b
        move    b,x:(r7+$00)
        clr     b
        move    b,x:(r7+$0c)
        rts

proc:
        move    r7,b
        lsr     #6,b
        and     #>$00003c,b
        add     #>$007fb0,b
        move    b1,r1
        nop
        move    x:(r1),b
        tst     b
        beq     qsDRY
        move    b1,r1
        nop
        jsr     (r1)
qsDRY:
        rts
