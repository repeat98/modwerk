| SPDX-License-Identifier: GPL-3.0-or-later
| Note Octave, Digitakt I OS 1.54: FUNC + turn on a TRIG page's note moves it by an octave.
|
| The TRIG view's knob handler (0x40032a78) asks, while FUNC is held, whether the turn is a jump: every
| parameter but one jumps (to its default, or for the MIDI note to 0, 60 and 127). This replaces that
| test (0x40032be0, 8 bytes). For the notes (the audio track's NOTE, 18; the MIDI track's NOT1, 25, and
| its chord notes NOT2-NOT4, 26-28) the turn is no jump but twelve steps, up or down as it turns; stock
| then applies it as an ordinary turn, so a held trig gets a lock; an octave that would leave the
| note's range is not made (a clamp would change the note itself).
| Any other parameter is tested as stock does.
        .equ    KEY_HELD, 0x400d399c            | (key) -> nonzero while held; 1 is FUNC
        .equ    DONE,     0x40032c92            | the handler's "taken, nothing to change"
        .equ    VIEW_VALUE, 84                  | the view's slot: (view, param, -1) -> its value now, 8.8
        .equ    PARAMS,   0x401aa09c            | the parameter table, a row each
        .equ    PARAM_ROW, 52
        .equ    PARAM_MIN, 8                    | 8.8
        .equ    PARAM_MAX, 12
        .equ    STEP,     12                    | the counts an octave takes (a detent is 4): three detents,
                                                | as FUNC + LEN moves a step every three or four slow ones
        .equ    TURN_FACTOR, 4                  | a3 + 4: the counts a detent gives (0x400c047e's argument)

        .lcomm  noct_acc, 4
        .text
        .balign 2

| d2 a note? -> Z set.
is_note:
        cmpi.l  #18, %d2
        beq.s   1f
        cmpi.l  #25, %d2
        blt.s   2f
        cmpi.l  #28, %d2
        bgt.s   2f
1:      cmp.l   %d2, %d2                        | Z
2:      rts

| After the speed (0x40032bc8, "move.l d0,d5; beq DONE", 6 bytes). In: d0 the turn in 8.8 steps after
| the stock speed curve, which needs several detents a step when turned slowly; d6 the detents. With
| FUNC held on a note the detents are gathered (noct_acc) until they are worth an octave (STEP), then d5 is
| twelve steps its way, unless that leaves the note's
| range (then DONE: stock would clamp it, which changes the note, not its octave). Otherwise as stock:
| d5 = d0, and none goes to DONE.
        .globl  noct_turn
noct_turn:
        move.l  %d0, %d5
        bsr.w   is_note
        bne.w   2f
        tst.l   %d6
        beq.w   2f
        pea     1.w
        jsr     KEY_HELD
        addq.l  #4, %sp
        tst.l   %d0
        beq.w   5f
        move.l  noct_acc, %d0                   | the detents so far (stock's speed curve gives whole steps
        move.l  %d0, %d1                        | only every few slow detents: too coarse to count)
        eor.l   %d6, %d1
        bpl.w   6f
        moveq   #0, %d0                         | turned the other way: start again
6:      add.l   %d6, %d0
        moveq   #STEP, %d1                      | times the counts stock makes of one (a3: the parameter's
        muls.l  TURN_FACTOR(%a3), %d1           | turn record, its plain factor at +4; 1 for the notes)
        cmp.l   %d1, %d0
        bge.w   7f
        neg.l   %d1
        cmp.l   %d1, %d0
        bgt.w   8f                              | not an octave's worth yet
        move.l  %d1, %d5                        | down: d5 = -STEP for the account
        bra.w   9f
7:      move.l  %d1, %d5
9:      sub.l   %d5, %d0
        move.l  %d0, noct_acc
        move.l  #0xc00, %d0                     | twelve steps, its way
        tst.l   %d5
        bpl.w   10f
        neg.l   %d0
10:     move.l  %d0, %d5
3:      lea     -8(%sp), %sp                    | the note now (8.8), as the view shows it
        movem.l %d1/%a1, (%sp)
        pea     -1.w
        move.l  %d2, -(%sp)
        move.l  %a2, -(%sp)
        movea.l (%a2), %a0
        movea.l VIEW_VALUE(%a0), %a0
        jsr     (%a0)
        lea     12(%sp), %sp
        movem.l (%sp), %d1/%a1
        lea     8(%sp), %sp
        add.l   %d5, %d0                        | where the octave would take it
        moveq   #PARAM_ROW, %d1
        muls.l  %d2, %d1
        movea.l %d1, %a0
        adda.l  #PARAMS, %a0
        cmp.l   PARAM_MIN(%a0), %d0
        blt.w   4f
        cmp.l   PARAM_MAX(%a0), %d0
        ble.w   1f
4:      move.l  #DONE, (%sp)                    | out of range: no change, as a clamp would change the note
1:      rts
8:      move.l  %d0, noct_acc
        move.l  #DONE, (%sp)
        rts
5:      clr.l   noct_acc                        | FUNC let go: the next octave starts from nothing
2:      tst.l   %d5
        bne.w   1b
        move.l  #DONE, (%sp)
        rts

| FUNC's jump test (0x40032be0, 8 bytes). In: d2 the parameter, d5 the turn (8.8 steps, its sign the
| direction). Out: d6 the jump flag (low byte); d1 is free here, as in stock.
        .globl  noct_func
noct_func:
        bsr.w   is_note
        bne.s   2f
        moveq   #0, %d6                         | no jump
        move.l  #0xc00, %d1                     | twelve steps
        tst.l   %d5
        bpl.s   3f
        neg.l   %d1
3:      move.l  %d1, %d5
        rts
2:      moveq   #39, %d1                        | stock: every parameter but 39 jumps
        cmp.l   %d2, %d1
        sne     %d6
        neg.l   %d6
        rts
