| SPDX-License-Identifier: GPL-3.0-or-later
| Improved FLTR: the band types' cutoff and resonance, in stock's filter routine.
| Written for Modwerk by Nathaniel Pavel (npp1993).
|
| OS 1.74's filter routine (0x4010d0fc) runs once an audio block and, for each voice, writes the
| analog filter's cutoff, resonance and type from the owner track's engine words (a4 = word 25,
| ENV). The site, a jmp over 0x4010d1a6..0x4010d1c1, takes its three stores:
|   cutoff     (a0)+  = (FRQ word - 0x4000) * 2            FRQ  = a4 + 10, signed
|   resonance  (fp)+  = RES word as it is                  RES  = a4 + 12
|   type index d0     = TYP high byte, 6 when above 6      TYP  = a4 + 14 (byte), d1 = 6
| and returns to 0x4010d1c2, which maps d0 through stock's type table. a0 and d1 are written again
| there; fp walks on to the next voice. Every other register is kept.
|
| Types 7 and 8 are the band: a 2-pole band-pass whose -3 dB edges are FRQ (the high-pass edge,
| the base) and the low-pass edge. Measured on a unit (22 Nov 2026): below stock's RES 0 the
| resonance word (signed) widens the band-pass, the same at every cutoff.
|   7, linked:   the low-pass edge sits RES x 15/32 semitones above FRQ (0..59.5).
|   8, unlinked: the low-pass edge is RES itself, on FRQ's scale.
| Words are 8.8 semitones (stock's FRQ: one value a semitone). The width w = edge - FRQ is held to
| 1..60 semitones; the filter's cutoff is the edges' midpoint (their geometric mean in hertz), held
| to 0..0x7f00 (stock's FRQ 127), and its resonance the width table's word for w, interpolated. The filter envelope
| moves the analog cutoff, so it moves both edges.
        .text
        .globl  improved_fltr_store
        .extern improved_fltr_resume, fltr_width_words

        .equ    W_MIN,  0x0100                  | 1 semitone
        .equ    W_MAX,  0x3c00                  | 60 semitones, 5 octaves

improved_fltr_store:
        mvs.b   14(%a4),%d0                     | TYP
        subq.l  #7,%d0
        cmp.l   #1,%d0
        bhi.w   stock                           | not 7 or 8 (unsigned: below 7 too)

        lea     -8(%sp),%sp
        movem.l %d2-%d3,(%sp)
        mvs.w   10(%a4),%d1                     | FRQ: the base
        mvs.w   12(%a4),%d2                     | RES
        bsr.w   band_edges                      | d2 = w, d1 = the cutoff
        add.l   #-16384,%d1
        add.l   %d1,%d1
        move.w  %d1,(%a0)+
        move.l  %d2,%d3                         | the resonance: table[w >> 8], to the next by w & 255
        asr.l   #8,%d3
        lea     fltr_width_words,%a0
        add.l   %d3,%d3
        add.l   %d3,%a0
        mvs.w   (%a0),%d3
        mvs.w   2(%a0),%d1
        sub.l   %d3,%d1
        and.l   #0xff,%d2
        muls.l  %d2,%d1
        asr.l   #8,%d1
        add.l   %d1,%d3
        move.w  %d3,(%fp)+
        moveq   #2,%d0                          | stock's BP
        movem.l (%sp),%d2-%d3
        lea     8(%sp),%sp
        jmp     improved_fltr_resume

stock:  mvs.w   10(%a4),%d0                     | stock's own stores, as displaced
        add.l   #-16384,%d0
        add.l   %d0,%d0
        move.w  %d0,(%a0)+
        move.w  12(%a4),(%fp)+
        mvs.b   14(%a4),%d0
        cmp.l   %d0,%d1
        bcc.s   7f
        moveq   #6,%d0
7:      jmp     improved_fltr_resume

| band_edges: d0 = 0 linked (TYP 7) or 1 unlinked (TYP 8), d1 = FRQ, d2 = RES (8.8 semitones).
| Out: d2 = the width w, 1..60 semitones; d1 = the analog cutoff, the edges' midpoint FRQ + w / 2,
| held to 0..0x7f00 (stock's FRQ 127). 7: w = RES x 15/32; 8: w = RES - FRQ. d0 is used.
band_edges:
        tst.l   %d0
        bne.s   1f
        move.l  %d2,%d0                         | 7: w = RES x 15/32
        lsl.l   #4,%d2
        sub.l   %d0,%d2
        asr.l   #5,%d2
        bra.s   2f
1:      sub.l   %d1,%d2                         | 8: w = RES - FRQ
2:      cmp.l   #W_MIN,%d2
        bge.s   3f
        move.l  #W_MIN,%d2
3:      cmp.l   #W_MAX,%d2
        ble.s   4f
        move.l  #W_MAX,%d2
4:      move.l  %d2,%d0                         | the cutoff
        asr.l   #1,%d0
        add.l   %d0,%d1
        bge.s   5f
        moveq   #0,%d1
5:      cmp.l   #0x7f00,%d1
        ble.s   6f
        move.l  #0x7f00,%d1
6:      rts

| The FILTER page's graph (0x40038db6, args: obj, bitmap, x, y, 1, FRQ, RES, TYP; held in d7 = FRQ,
| d2 = RES, d4 = TYP, all 8.8, each as the page shows it: a held trig's lock included) takes
| d1 = TYP >> 8 at 0x40038e20 and, above 6, returns without a curve. The site (a jmp over
| 0x40038e20..0x40038e27) first notes FRQ and TYP for main.c (the page's own values for RES's text,
| and proof that stock's FILTER page drew), then keeps stock's types and draws the band types as
| stock's BP: d7 the edges' midpoint, d2 the width table's word, or 0 for a band wider than stock's
| widest BP (the graph shows such a band at that width). d0 is free here and d1 goes on as the jump
| table's index; the stack is not touched but for a0's save and the call.
        .globl  improved_fltr_graph
        .extern improved_fltr_graph_on, improved_fltr_graph_off
        .extern improved_fltr_seen_frq, improved_fltr_seen_typ, improved_fltr_seen

improved_fltr_graph:
        move.l  %d7,improved_fltr_seen_frq
        move.l  %d1,improved_fltr_seen_typ
        moveq   #1,%d0
        move.l  %d0,improved_fltr_seen
        moveq   #6,%d0
        cmp.l   %d1,%d0
        bcc.s   9f                              | stock's 0..6
        cmp.l   #8,%d1
        bhi.s   8f                              | above 8: stock's early return
        moveq   #7,%d0
        sub.l   %d0,%d1
        move.l  %d1,%d0                         | 0 linked, 1 unlinked
        move.l  %d7,%d1
        bsr.w   band_edges
        move.l  %d1,%d7                         | the centre
        move.l  %d2,%d0                         | the drawn RES: table[w], never below 0
        asr.l   #8,%d0
        add.l   %d0,%d0
        move.l  %a0,-(%sp)
        lea     fltr_width_words,%a0
        mvs.w   (%a0,%d0.l),%d2
        move.l  (%sp)+,%a0
        tst.l   %d2
        bge.s   7f
        moveq   #0,%d2
7:      moveq   #2,%d1                          | stock's BP curve
9:      jmp     improved_fltr_graph_on
8:      jmp     improved_fltr_graph_off

| improved_fltr_snap(track, res, typ): a tap's new RES and TYP land at once. Stock glides every
| sound word to its target (0x40120cfa: targets 0x8000e5b0 + 84 t, state 0x8000eeec + 168 t in
| 16.16), so the type would read its old meaning for a few blocks against the new RES: an audible
| sweep. Target and state of RES (index 31) and TYP (32) are written together with interrupts
| masked; the next block builds the engine words from them, modulation on top.
        .globl  improved_fltr_snap
improved_fltr_snap:
        move.l  4(%sp),%d0                      | track
        move.l  %d2,-(%sp)
        move.w  %sr,%d2
        move.w  #0x2700,%sr
        move.l  %d0,%d1                         | targets: 0x8000e5b0 + 84 t + 62
        mulu.w  #84,%d1
        move.l  %d1,%a0
        add.l   #0x8000e5ee,%a0
        move.l  12(%sp),%d1                     | RES
        move.w  %d1,(%a0)
        move.l  16(%sp),%d1                     | TYP
        move.w  %d1,2(%a0)
        mulu.w  #168,%d0                        | state: 0x8000eeec + 168 t + 4 x 31, 16.16
        move.l  %d0,%a0
        add.l   #0x8000ef68,%a0
        move.l  12(%sp),%d1
        swap    %d1
        clr.w   %d1
        move.l  %d1,(%a0)
        move.l  16(%sp),%d1
        swap    %d1
        clr.w   %d1
        move.l  %d1,4(%a0)
        move.w  %d2,%sr
        move.l  (%sp)+,%d2
        rts
