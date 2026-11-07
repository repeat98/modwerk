        | SPDX-License-Identifier: GPL-2.0-only
        | Envelopes - the amp envelope record write (OS 1.74), Nathaniel Pavel.
        |
        | Every voice's record goes to envelopes_voice (envelopes.c), which puts
        | this module's ATK rate into the attack's records, follows the voice's
        | amp level and decides when the hold ends (HOLD 0 = no hold, 127 =
        | AUTO, never before the attack's top).

        .equ    WRITE_RESUME,   0x40109c2c        | moveq #8,%d0, then the level word

        .text

        | ------------------------------------------------------------------
        | envelopes_write: over the two `move.l %d0` stores of the voice's rate
        | word at 0x40109c24 (amp_env_commands 0x40109940), every block for each
        | voice, in every state, after stock's state machine.
        |
        | It calls envelopes_voice unless the voice's record is the one it last
        | took and that one left the voice as it was (envelopes_gate,
        | envelopes.c): an idle voice (rate and level words 0) and a decay that
        | has reached its end get the same record every block, so an idle unit
        | makes no C call.
        |
        | d0 the rate word, d2 the level word, d3 the voice, a2 its state (-1
        | idle; +4 the hold counter), a3 the frame at the voice's record, a4 the
        | track's sound slice (+0 ATK, +2 HLD, +4 DEC). d1 and a0 are written
        | before they are read on the next pass, so they are free.
        | ------------------------------------------------------------------
        .globl  envelopes_write
        .align  2
envelopes_write:
        move.l  envelopes_gate,%d1                | the voices left as they were
        btst    %d3,%d1
        beq.s   5f
        lea     envelopes_gate+16,%a0
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
        jsr     envelopes_voice
        move.l  %d0,20(%sp)                       | the rate word it returns
        lea     20(%sp),%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
8:      move.l  %d0,172(%a3)                      | displaced
        move.l  %d0,236(%a3)
        jmp     WRITE_RESUME

        | ------------------------------------------------------------------
        | envelopes_amp_graph: over the AMP page's call of stock's envelope
        | picture at 0x400d3302, `jsr 0x40038bce` (SoundPageView's draw). The
        | picture takes (view, bmp, 6, 0, 0, ATK, HLD, DEC) in 8.8 and draws HLD
        | 0 as AUTO (the note and a full-width hold). Here HLD 127 is AUTO and 0
        | is no hold, so 127 goes in as 0 and 0 as 1/256 (no width, no note).
        | At entry the arguments sit above the return address: HLD at 28(%sp).
        | d0 is free: the caller drops it.
        | ------------------------------------------------------------------
        .equ    AMP_PICTURE,    0x40038bce

        .globl  envelopes_amp_graph
        .align  2
envelopes_amp_graph:
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
