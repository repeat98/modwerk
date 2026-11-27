| SPDX-License-Identifier: GPL-2.0-or-later
| Real Units 0.2: the two value-text routines, entered a little after their start, so machine-pages
| (which takes their first instruction for its own parameters, then goes on into them) can be in the
| same build.
        .section .run, "ax"

| Inside 0x4000f324(obj, id, value, buf), the text under a turning knob: at 0x4000f348 (was: tst.l
| 28(a2) ; beq.s, 6 bytes), by jsr. Here d4 = id, d2 = value, d3 = buf, the routine's d2-d4/a2-a3
| saved at our 4(sp).
        .globl  ru_val_text_s
ru_val_text_s:
        lea     -12(%sp), %sp
        movem.l %d0-%d1/%a0, (%sp)
        move.l  %d3, -(%sp)
        move.l  %d2, -(%sp)
        move.l  %d4, -(%sp)
        jsr     ru_value_text
        lea     12(%sp), %sp
        tst.l   %d0
        bne.s   1f
        movem.l (%sp), %d0-%d1/%a0
        lea     12(%sp), %sp
        tst.l   28(%a2)                         | the replaced test; its flags go back with us
        rts
1:      lea     16(%sp), %sp                    | ours: drop the saves and our return
        move.l  %d3, %d0                        | buf, as the routine returns it
        movem.l (%sp), %d2-%d4/%a2-%a3
        lea     20(%sp), %sp
        rts

| Inside 0x400657ee(id, value), the pop-up's text: at 0x400657fa (was: pea 0x4197de98, the text's
| buffer), by jsr. d0 and d1 are live here (the id's check); a0 is free.
        .globl  ru_pop_text_s
ru_pop_text_s:
        subq.l  #8, %sp
        movem.l %d0-%d1, (%sp)
        move.l  20(%sp), -(%sp)                 | the value
        move.l  20(%sp), -(%sp)                 | the id
        jsr     ru_pop_text
        addq.l  #8, %sp
        tst.l   %d0
        bne.s   1f
        movem.l (%sp), %d0-%d1
        addq.l  #8, %sp
        move.l  (%sp), -(%sp)                   | [ret][ret]
        lea     0x4197de98, %a0
        move.l  %a0, 4(%sp)                     | [ret][the buffer]: the replaced pea
        rts
1:      lea     12(%sp), %sp                    | ours: drop the saves and our return
        rts                                     | d0 = our text, back to the routine's caller
