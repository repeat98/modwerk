        | SPDX-License-Identifier: GPL-2.0-only
        | filter-hz - filter frequency in Hz (elemod port of rytm-mods-src 0008-filter-hz).
        |
        | The FILTER page's FRQ popup reads as a frequency instead of 0..127. The
        | cutoff is one semitone a step with 440 Hz at 60,
        |   f = 440 * 2^((v - 60) / 12) = 13.75 * 2^(v / 12),
        | measured on the self-oscillating filter (LP2, resonance 127) at every 4th
        | value from 16 to 116: every step 1.000 +- 0.01 semitone, 60 at 440.7 Hz
        | (0006's sidechain sweep, session calsc_20260925_155438).
        |
        | Shown to three significant figures: 13.8Hz, 440Hz, 1.11kHz, 21.1kHz. Every
        | value 0..127 lands within 0.6% of the formula.
        |
        | Modwerk 1.2.1 adds filter_hz_box: stock inverts a fixed 27-pixel box
        | behind a locked value, and a kHz value is up to 31 pixels wide, so for
        | FRQ the box is 33 pixels, the same for every value.
        |
        | Modwerk 1.3.0 sends the FX track's DELAY HPF/LPF and REVERB FRQ/HPF/LPF
        | (ids 76..87) to filter_hz_fx_text (fx-hz.c) and gives them the same box,
        | LPF's two pixels right with its text so neighbouring boxes stay apart.

        .include "../include/ar2-1.74.inc"

        .equ    PARAM_ID_FRQ,   47
        .equ    PARAM_ID_FX_LO, 76                | DELAY HPF; fx-hz.c picks its ids
        .equ    PARAM_ID_FX_HI, 87                | REVERB LPF

        | Stock's knob value routine (0x40037a56), where it pushes the lock box's
        | rectangle for a value in the label row: x-13..x+13, y-14..y-8.
        .equ    knob_box_resume, 0x40037bfe       | move.l %d3,-(%sp); jsr (%a0)
        .equ    KNOB_PARAM_ARG,  88               | the parameter id, from %sp there
        .equ    knob_text_resume, 0x40037ba6      | jsr: the text's font
        .equ    knob_text_font,  0x417e389c       | its argument

        | A row of `boxes` (below): the id, the box's half widths left and right
        | of the knob's x, and how far right the locked text moves.
        .equ    BOX_ROW,        4
        .equ    BOX_LEFT,       1
        .equ    BOX_RIGHT,      2
        .equ    BOX_TEXT,       3

        .text

        | ------------------------------------------------------------------
        | param_value_text, where it tail-calls the record's text formatter.
        |
        | Reached by a jmp over `lea %a2@(20),%a0; movel %d3,%sp@(32)`, after
        | stock's own check has accepted the value. d4 is the id, d2 the value in
        | 8.8, d3 the output buffer; the frame still holds d2-d4/a2-a3, so d2 and
        | d3 are free once read and the epilogue restores them.
        | ------------------------------------------------------------------
        | elemod: the site in mod.json replaces the 8 stock bytes at
        | param_value_text_invoke (0x400a8648) with `jmp filter_hz_gate` and a nop.
        | The code below is unchanged from rytm-mods; only this label is global,
        | because the site names it. Everything else stays local to this mod.
        .globl  filter_hz_gate
        .align  2
filter_hz_gate:
        moveq   #PARAM_ID_FRQ,%d0
        cmp.l   %d4,%d0
        beq.s   1f
        moveq   #PARAM_ID_FX_LO,%d0               | 1.3.0: the FX filters
        cmp.l   %d0,%d4
        blt.s   0f
        moveq   #PARAM_ID_FX_HI,%d0
        cmp.l   %d0,%d4
        bgt.s   0f
        move.l  %d3,-(%sp)                        | buf
        move.l  %d2,-(%sp)                        | value, 8.8
        move.l  %d4,-(%sp)                        | id
        jsr     filter_hz_fx_text                 | keeps d2-d7/a2-a6
        lea     12(%sp),%sp
        tst.l   %d0
        bne.w   7f                                | written
0:      lea     %a2@(20),%a0                      | displaced
        move.l  %d3,%sp@(32)                      | displaced
        jmp     param_value_text_invoke_resume

1:      move.l  %d3,%a1                           | the output buffer
        move.l  %d2,%d0
        asr.l   #8,%d0                            | the integer part, as stock prints
        bpl.s   2f
        moveq   #0,%d0
2:      moveq   #127,%d1
        cmp.l   %d1,%d0
        ble.s   3f
        move.l  %d1,%d0
3:      divu.w  #12,%d0                           | low word octave, high word semitone
        move.l  %d0,%d1
        swap    %d1
        mvzw    %d1,%d1
        add.l   %d1,%d1
        lea     semitones,%a0
        mvzw    %a0@(0,%d1:l),%d1                 | 2^(k/12), Q15
        mulu.w  #1375,%d1                         | 13.75 Hz in centi-Hz
        mvzw    %d0,%d0
        moveq   #15,%d2
        sub.l   %d0,%d2                           | 15 - octave, 5..15
        moveq   #1,%d0
        lsl.l   %d2,%d0
        lsr.l   #1,%d0
        add.l   %d0,%d1
        lsr.l   %d2,%d1                           | F = f in centi-Hz, rounded

        lea     ranges,%a0
4:      cmp.l   (%a0),%d1
        bcs.s   5f
        lea     RANGE(%a0),%a0
        bra.s   4b
5:      move.l  4(%a0),%d0                        | the divisor to three digits
        move.l  %d0,%d2
        lsr.l   #1,%d2
        add.l   %d2,%d1
        divu.l  %d0,%d1                           | n, 100..999

        mvzb    8(%a0),%d2                        | digits before the point, 0 = none
        divu.w  #100,%d1                          | low word hundreds, high word the rest
        mvzw    %d1,%d0
        bsr.s   digit
        swap    %d1
        mvzw    %d1,%d1
        divu.w  #10,%d1                           | low word tens, high word units
        mvzw    %d1,%d0
        bsr.s   digit
        swap    %d1
        mvzw    %d1,%d0
        bsr.s   digit
        tst.b   9(%a0)
        beq.s   6f
        move.b  #'k',(%a1)+
6:      move.b  #'H',(%a1)+
        move.b  #'z',(%a1)+
        clr.b   (%a1)
7:      movem.l (%sp),%d2-%d4/%a2-%a3             | param_value_text's epilogue
        lea     20(%sp),%sp
        rts

        | digit(d0 = 0..9, d2 = digits left before the point, a1 = output):
        | writes it, then the point when d2 reaches 0. Clobbers d0/d2/a1.
digit:
        addi.l  #0x30,%d0
        move.b  %d0,(%a1)+
        subq.l  #1,%d2
        bne.s   1f
        move.b  #'.',(%a1)+
1:      rts

        | Q15 2^(k/12), k = 0..11.
        .align  2
semitones:
        .word   32768, 34716, 36781, 38968, 41285, 43740
        .word   46341, 49097, 52016, 55109, 58386, 61858

        | One row a display range: F below the limit, the divisor that leaves
        | three digits, the digits before the point (0 = none) and whether the
        | unit is kHz. The last limit is never reached.
        .equ    RANGE,          12
ranges:
        .long   10000, 10
        .byte   2, 0, 0, 0                        | 13.8Hz .. 99.9Hz
        .long   100000, 100
        .byte   0, 0, 0, 0                        | 100Hz .. 999Hz
        .long   1000000, 1000
        .byte   1, 1, 0, 0                        | 1.00kHz .. 9.99kHz
        .long   0xffffffff, 10000
        .byte   2, 1, 0, 0                        | 10.0kHz ..

        | ------------------------------------------------------------------
        | Stock's knob value routine, at the five pushes of the lock box's
        | rectangle (label row). %a2 is the knob's x, %a3 its y, %a0 the
        | rectangle routine, %d3 the screen context; %d0, %d1 and %a1 are free.
        | Stock's box is x-13..x+13, 27 pixels. FRQ text is up to 31 pixels wide
        | ("2.22kHz"), centred on x, so for FRQ the box is always x-16..x+16,
        | 33 pixels: one pixel either side of the widest value, the same size
        | for every value. 1.3.0: the same for the FX filters, whose texts are
        | as wide at most ("12.0kHz", "14.0kHz"). Every other parameter gets
        | stock's box.
        |
        | Knobs are 32 pixels apart, and stock inverts the box after drawing the
        | text, so two 33-pixel boxes side by side share a column, inverted twice:
        | a black divider that took LPF's left margin (HPF and LPF are knobs E
        | and F). 1.3.0 moves LPF's box and its text two pixels right, box
        | x-14..x+18, so a natural black column parts the boxes and every text
        | keeps a pixel of white each side. LPF's right neighbours have no box
        | there (DELAY's REV is a slider whose lock marks its icon; REVERB's
        | knob G is empty).
        | ------------------------------------------------------------------
        .globl  filter_hz_box
        .align  2
filter_hz_box:
        move.l  KNOB_PARAM_ARG(%sp),%d0
        bsr.s   box_record
        moveq   #0,%d1
        move.b  BOX_RIGHT(%a1),%d1
        add.l   %a2,%d1                           | right: x + its half
        moveq   #0,%d0
        move.b  BOX_LEFT(%a1),%d0
        neg.l   %d0
        add.l   %a2,%d0                           | left: x - its half
        pea     -1                                | colour, as stock
        pea     -8(%a3)                           | bottom
        move.l  %d1,-(%sp)                        | right
        pea     -14(%a3)                          | top
        move.l  %d0,-(%sp)                        | left
        jmp     knob_box_resume

        | ------------------------------------------------------------------
        | The same routine where it has placed the value's text: %d4 is its left
        | edge (x minus half its width), and the next instructions read the
        | colour and the font. %d5 set means the value is shown locked, %d6 that
        | it sits in the label row: then the text moves with its box (LPF's two
        | pixels). Unlocked values stay where stock puts them.
        | Replaced: `move.l 44(%sp),%d7; pea 0x417e389c` (10 bytes).
        | ------------------------------------------------------------------
        .globl  filter_hz_text_x
        .align  2
filter_hz_text_x:
        move.l  44(%sp),%d7                       | displaced
        tst.b   %d5
        beq.s   9f
        tst.b   %d6
        beq.s   9f
        move.l  KNOB_PARAM_ARG(%sp),%d0
        bsr.s   box_record
        moveq   #0,%d1
        move.b  BOX_TEXT(%a1),%d1
        add.l   %d1,%d4                           | the text's left edge, moved
9:      pea     knob_text_font                    | displaced
        jmp     knob_text_resume

        | box_record(d0 = id): %a1 = its row of boxes, or the last row (stock's
        | box) for every other id. Clobbers %d1.
box_record:
        lea     boxes,%a1
        cmp.l   #255,%d0                          | ids above a byte: stock's box
        bhi.s   2f
1:      move.b  (%a1),%d1                         | 0 ends the table
        beq.s   3f
        cmp.b   %d1,%d0
        beq.s   3f
        addq.l  #BOX_ROW,%a1
        bra.s   1b
2:      lea     boxes_stock,%a1
3:      rts

        | One row an id (BOX_ROW bytes).
boxes:
        .byte   PARAM_ID_FRQ, 16, 16, 0           | FILTER FRQ
        .byte   76, 16, 16, 0                     | DELAY HPF
        .byte   77, 14, 18, 2                     | DELAY LPF
        .byte   84, 16, 16, 0                     | REVERB FRQ
        .byte   86, 16, 16, 0                     | REVERB HPF
        .byte   87, 14, 18, 2                     | REVERB LPF
boxes_stock:
        .byte   0, 13, 13, 0                      | every other id: stock's box
