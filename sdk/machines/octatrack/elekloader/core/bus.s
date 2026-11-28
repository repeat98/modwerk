| SPDX-License-Identifier: GPL-3.0-or-later
| Hook bus (Modwerk core): one dispatcher per stock site, in .run. Each walks its subscriber table
| (absolute handler addresses ending in a zero long, laid out by the linker) and calls the handlers with
| the C convention, then performs what the site replaced.
|
| The walk pointer lives in %a2, which every C handler preserves, and the caller's %a2 is saved on the
| stack. No static state, so a dispatcher can be re-entered (frame interrupt, MIDI task, nested
| compositor) while an earlier activation is suspended. Nothing here masks interrupts.
| ColdFire V4e; assemble with -mcpu=54455.

| Load the next handler into %a0, or branch to \done at the terminator. move.l sets the flags,
| movea would not.
        .macro  next_handler done
        move.l  (%a2)+, %d0
        beq.s   \done
        movea.l %d0, %a0
        .endm

        .text
        .globl  core_tick, core_draw, core_key, core_enc, core_midi, core_frame

| ev_tick: sys task, 60 Hz. Afterwards tail-jump into the stock tick step with the site's stack.
        .balign 2
core_tick:
        move.l  %a2, -(%sp)
        lea     ev_tick, %a2
1:      next_handler 2f
        jsr     (%a0)
        bra.s   1b
2:      movea.l (%sp)+, %a2
        jmp     TICK_NEXT

| ev_draw: each handler gets the frame buffer, re-read every time. Returns with %a5 = the frame
| (the replaced movea). d0/d1/a0/a1 are dead at the site.
core_draw:
        move.l  %a2, -(%sp)
        lea     ev_draw, %a2
1:      next_handler 2f
        move.l  FRAME_PTR, -(%sp)
        jsr     (%a0)
        addq.l  #4, %sp
        bra.s   1b
2:      movea.l (%sp)+, %a2
        movea.l FRAME_PTR, %a5
        rts

| ev_key and ev_enc: handlers get (arg1, arg2) copied from the site's 4(sp) and 8(sp). A nonzero
| result takes the event: return it in %d0 and skip stock. Otherwise tail-jump into stock's function
| with the site's stack, which returns to the site.
| Offsets: after saving %a2 the args sit at 8 and 12; after pushing arg2 the old 8 is at 12 again.
        .macro  take_two table, stockfn
        move.l  %a2, -(%sp)
        lea     \table, %a2
1:      next_handler 2f
        move.l  12(%sp), -(%sp)         | arg2
        move.l  12(%sp), -(%sp)         | arg1
        jsr     (%a0)
        addq.l  #8, %sp
        tst.l   %d0
        beq.s   1b
        movea.l (%sp)+, %a2             | taken; movea keeps %d0
        rts
2:      movea.l (%sp)+, %a2
        jmp     \stockfn
        .endm

core_key:
        take_two ev_key, KEYFN
core_enc:
        take_two ev_enc, ENCFN

| ev_midi: the site had %a2 = stock's handler table and %d0 = status >> 4, both needed by the stock
| path, so both are saved. Handlers get the message pointer (site's 4(sp)). Taken: return to the site.
| Otherwise do the replaced instructions as a tail jump: %a0 = table[d0], enter it with the site's stack.
core_midi:
        lea     -8(%sp), %sp
        movem.l %d0/%a2, (%sp)          | frame reserved first: ColdFire movem has no -(sp)
        lea     ev_midi, %a2
1:      next_handler 2f
        move.l  12(%sp), -(%sp)         | msg
        jsr     (%a0)
        addq.l  #4, %sp
        tst.l   %d0
        beq.s   1b
        movea.l 4(%sp), %a2
        lea     8(%sp), %sp
        rts
2:      movem.l (%sp), %d0/%a2
        lea     8(%sp), %sp
        movea.l (0, %a2, %d0.l*4), %a0
        jmp     (%a0)

| ev_frame: inside the level-5 frame interrupt; d0/d1/a0/a1/a2 are free here, %a2 is kept anyway.
| The replaced tst.l comes last so its flags reach the stock beq.s untouched (movea and rts set none).
core_frame:
        move.l  %a2, -(%sp)
        lea     ev_frame, %a2
1:      next_handler 2f
        jsr     (%a0)
        bra.s   1b
2:      movea.l (%sp)+, %a2
        tst.l   ISR_FLAG
        rts
