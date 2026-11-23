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
| to 0..0x7fff, and its resonance the width table's word for w, interpolated. The filter envelope
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
        tst.l   %d0
        bne.s   1f
        move.l  %d2,%d3                         | 7: w = RES x 15/32
        lsl.l   #4,%d2
        sub.l   %d3,%d2
        asr.l   #5,%d2
        bra.s   2f
1:      sub.l   %d1,%d2                         | 8: w = RES - FRQ
2:      cmp.l   #W_MIN,%d2
        bge.s   3f
        move.l  #W_MIN,%d2
3:      cmp.l   #W_MAX,%d2
        ble.s   4f
        move.l  #W_MAX,%d2
4:      move.l  %d2,%d3                         | the cutoff: FRQ + w / 2
        asr.l   #1,%d3
        add.l   %d1,%d3
        bge.s   5f
        moveq   #0,%d3
5:      cmp.l   #0x7fff,%d3
        ble.s   6f
        move.l  #0x7fff,%d3
6:      add.l   #-16384,%d3
        add.l   %d3,%d3
        move.w  %d3,(%a0)+
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

| The FILTER page's graph (0x40038db6, args: obj, bitmap, x, y, 1, FRQ, RES, TYP; held in d7 = FRQ,
| d2 = RES, d4 = TYP, all 8.8) takes d1 = TYP >> 8 at 0x40038e20 and, above 6, returns without a
| curve. The site (a jmp over 0x40038e20..0x40038e27) keeps stock's types and draws the band types as
| stock's BP: d7 the edges' midpoint, d2 the width table's word, or 0 for a band wider than stock's
| widest BP (the graph shows such a band at that width). d0 is free here and d1 goes on as the jump
| table's index; the stack is not touched but for a0's save.
        .globl  improved_fltr_graph
        .extern improved_fltr_graph_on, improved_fltr_graph_off

improved_fltr_graph:
        moveq   #6,%d0
        cmp.l   %d1,%d0
        bcc.s   9f                              | stock's 0..6
        cmp.l   #8,%d1
        bhi.s   8f                              | above 8: stock's early return
        move.l  %d2,%d0                         | RES
        cmp.l   #7,%d1
        bne.s   1f
        lsl.l   #4,%d0                          | 7: w = RES x 15/32
        sub.l   %d2,%d0
        asr.l   #5,%d0
        bra.s   2f
1:      sub.l   %d7,%d0                         | 8: w = RES - FRQ
2:      cmp.l   #W_MIN,%d0
        bge.s   3f
        move.l  #W_MIN,%d0
3:      cmp.l   #W_MAX,%d0
        ble.s   4f
        move.l  #W_MAX,%d0
4:      move.l  %d0,%d1                         | the centre: FRQ + w / 2, on the graph's 0..127
        asr.l   #1,%d1
        add.l   %d1,%d7
        cmp.l   #0x7f00,%d7
        ble.s   5f
        move.l  #0x7f00,%d7
5:      asr.l   #8,%d0                          | the drawn RES: table[w], never below 0
        add.l   %d0,%d0
        move.l  %a0,-(%sp)
        lea     fltr_width_words,%a0
        mvs.w   (%a0,%d0.l),%d2
        move.l  (%sp)+,%a0
        tst.l   %d2
        bge.s   6f
        moveq   #0,%d2
6:      moveq   #2,%d1                          | stock's BP curve
9:      jmp     improved_fltr_graph_on
8:      jmp     improved_fltr_graph_off
