| SPDX-License-Identifier: GPL-3.0-or-later
| Filters for the Digitakt I, OS 1.54 on Core 2.1: the four patch sites. The logic is in filters.c.
|
| Stock TYPE runs 0..7 (OFF, LP, HP, EQ:1..EQ:5). This module raises the descriptor's maximum to 15 and
| gives 8..15 their own filters; every site below hands 0..7 straight back to the stock code.

        .section .run, "ax"

| ---------------- the per-voice filter (0x400780a4: lea 0x40072844,%a3) ---------------------------
| The render calls the filter once per voice as f(params, block, note-on bit, voice); params + 0 is
| the voice's TYPE byte. The site's lea now loads flt_voice: 8..15 go to flt_render, the rest to the
| stock filter, untouched.
        .balign 2
        .globl  flt_voice
flt_voice:
        movea.l 4(%sp), %a0
        mvs.b   (%a0), %d0
        moveq   #8, %d1
        cmp.l   %d1, %d0
        blt.s   1f
        jmp     flt_render
1:      jmp     0x40072844                      | 0..7: the stock filter

| ---------------- TYPE's value text (0x40065336, the formatter's first 6 bytes) -------------------
| f(id, value, buf): stock prints OFF, LP, HP or "EQ:%d". 8..15 get their names from flt_name.
        .balign 2
        .globl  flt_fmt
flt_fmt:
        move.l  8(%sp), %d0
        asr.l   #8, %d0
        moveq   #8, %d1
        cmp.l   %d1, %d0
        blt.s   1f
        jmp     flt_name
1:      move.l  %d2, -(%sp)                     | the displaced stock instructions
        move.l  12(%sp), %d0
        jmp     0x4006533c

| ---------------- RESO or GAIN on knob F (0x40037444: cmpi.l #767,%d0) ----------------------------
| The FLTR page shows GAIN (id 31) instead of RESO (id 32) when TYPE > 2 (the EQ types). For 8..15
| the comparison sees 0, so the page keeps RESO. Only the condition codes survive: d0 is set next.
        .balign 2
        .globl  flt_resoq
flt_resoq:
        cmpi.l  #0x800, %d0
        blt.s   1f
        moveq   #0, %d0
1:      cmpi.l  #767, %d0
        rts

| ---------------- the FREQ/RESO box's shape (0x4003799e: move.l %a5,%d7; asr.l #8,%d7; moveq #7,%d1)
| The box draws one of the eight stock responses; 8..15 borrow the nearest (flt_shape_map).
        .balign 2
        .globl  flt_shape
flt_shape:
        move.l  %a5, %d7
        asr.l   #8, %d7
        move.l  %d7, flt_boxtype                | for the box's draw call (flt_boxcall)
        moveq   #8, %d1
        cmp.l   %d1, %d7
        blt.s   2f
        subq.l  #8, %d7
        moveq   #7, %d1
        cmp.l   %d1, %d7
        bgt.s   1f
        move.b  (flt_shape_map, %pc, %d7.l), %d7
        extb.l  %d7
        bra.s   2f
1:      moveq   #7, %d7
2:      moveq   #7, %d1
        rts
| DJ, BP, BR, LP4, HP4, F:LP, F:BP, F:HP -> OFF, EQ:5 (narrow peak), EQ:3, LP, HP, LP, EQ:5, HP
flt_shape_map:
        .byte   0, 7, 5, 1, 2, 1, 7, 2

| ---------------- the box's draw call (0x400378cc: jsr 0x40031ef6) -------------------------------
| f(view, canvas, 0, 1, FREQ, RESO, shape), values 8.8. On DJ, flt_boxdj draws the stock LP or HP
| curve at the real cutoff (flat in the open middle) and marks where FREQ is; else the stock drawer.
        .balign 2
        .globl  flt_boxcall
flt_boxcall:
        moveq   #8, %d0
        cmp.l   flt_boxtype, %d0
        bne.s   1f
        pea     4(%sp)
        jsr     flt_boxdj
        addq.l  #4, %sp
        rts
1:      jmp     0x40031ef6

| ---------------- a parameter set from a knob (0x4000ff3c, in the set-with-range 0x4000fef6) -------
| Replaces "movea.l (a2),a0; move.l d3,-(sp); move.l d2,-(sp)": a2 the sound, d2 the parameter id,
| d3 the new value (8.8), clamped. FREQ (id 30) on DJ, turned by knob E, goes through flt_freqset
| (the catch in the middle); everything else as stock.
        .balign 2
        .globl  flt_setv
flt_setv:
        moveq   #30, %d0
        cmp.l   %d2, %d0
        bne.s   1f
        tst.l   flt_knob
        beq.s   1f
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %d3, -(%sp)
        move.l  %a2, -(%sp)
        jsr     flt_freqset
        addq.l  #8, %sp
        move.l  %d0, %d3
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
1:      movea.l (%a2), %a0
        move.l  %d3, -(%sp)
        move.l  %d2, -(%sp)
        jmp     0x4000ff42
