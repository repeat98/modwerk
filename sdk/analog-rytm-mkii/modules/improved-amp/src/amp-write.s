        | SPDX-License-Identifier: GPL-2.0-only
        | Envelopes - the amp envelope record write (OS 1.74), Nathaniel Pavel.
        |
        | Every voice's record goes to improved_amp_voice (improved-amp.c), which puts
        | this module's ATK rate into the attack's records, follows the voice's
        | amp level and decides when the hold ends (HOLD 0 = no hold, 127 =
        | AUTO, never before the attack's top).

        .text

        | ------------------------------------------------------------------
        | improved_amp_write: an ev_amp_record entry (modwerk/amp.h, order 50): the
        | base runs it once a voice an audio block, in every state, after stock's
        | state machine and before stock's stores of the record at 0x40109c24
        | (amp_env_commands 0x40109940). Order 50 puts it after the entries that
        | rewrite the record (10-39), so it follows the record the amp gets, and
        | before the followers (60-89), which see its ATK rewrite.
        |
        | It calls improved_amp_voice unless the voice's record is the one it last
        | took and that one left the voice as it was (GATE_STILL, hot.h): an
        | idle voice (rate and level words 0) and a decay that has reached its
        | end get the same record every block, so an idle unit makes no C call.
        | A 0/0 record is checked first, against GATE_ZERO alone: an idle voice
        | then reads one word of the module's data, in the line the pre-fade's
        | entry has just read (amp_prefade_mask), and none of the stored records.
        |
        | d0 the rate word, d2 the level word, d3 the voice, a2 its state (-1
        | idle; +4 the hold counter), a3 the frame at the voice's record, a4 the
        | track's sound slice (+0 ATK, +2 HLD, +4 DEC). It uses d1 and a0, as the
        | hook allows, and keeps every other register.
        | ------------------------------------------------------------------
        .equ    HOT_ZERO,       8                 | hot.h: GATE_ZERO
        .equ    HOT_STILL,      12                | GATE_STILL
        .equ    HOT_RATE,       32                | GATE_RATE(0); GATE_LW(v) is 32 further

        .globl  improved_amp_write
        .balign 16
improved_amp_write:
        move.l  %d0,%d1
        or.l    %d2,%d1
        bne.s   3f
        move.l  improved_amp_hot+HOT_ZERO,%d1     | a 0/0 record: was the one taken 0/0 too?
        btst    %d3,%d1
        beq.s   5f
        rts                                       | idle, as it was
3:      move.l  improved_amp_hot+HOT_STILL,%d1    | the voices left as they were
        btst    %d3,%d1
        beq.s   5f
        lea     improved_amp_hot+HOT_RATE,%a0
        cmp.l   (%a0,%d3.l*4),%d0                 | the same rate word
        bne.s   5f
        cmp.l   32(%a0,%d3.l*4),%d2               | and level word: nothing changes
        beq.s   8f
5:      lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  %d2,-(%sp)                        | level word
        move.l  %d0,-(%sp)                        | rate word
        move.l  %a4,-(%sp)                        | sound slice
        move.l  %a2,-(%sp)                        | state, counter
        move.l  %d3,-(%sp)                        | voice
        jsr     improved_amp_voice
        move.l  %d0,20(%sp)                       | the rate word it returns
        lea     20(%sp),%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
8:      rts

        | ------------------------------------------------------------------
        | improved_amp_amp_graph: over the AMP page's call of stock's envelope
        | picture at 0x400d3302, `jsr 0x40038bce` (SoundPageView's draw). The
        | picture takes (view, bmp, 6, 0, 0, ATK, HLD, DEC) in 8.8 and draws HLD
        | 0 as AUTO (the note and a full-width hold). Here HLD 127 is AUTO and 0
        | is no hold, so 127 goes in as 0 and 0 as 1/256 (no width, no note).
        | At entry the arguments sit above the return address: HLD at 28(%sp).
        | d0 is free: the caller drops it.
        | ------------------------------------------------------------------
        .equ    AMP_PICTURE,    0x40038bce

        .globl  improved_amp_amp_graph
        .align  2
improved_amp_amp_graph:
        move.l  28(%sp),%d0
        cmp.l   #0x7f00,%d0
        blt.s   1f
        clr.l   28(%sp)                           | AUTO
        bra.s   2f
1:      tst.l   %d0
        bgt.s   2f
        moveq   #1,%d0                            | no hold
        move.l  %d0,28(%sp)
2:      jmp     AMP_PICTURE
