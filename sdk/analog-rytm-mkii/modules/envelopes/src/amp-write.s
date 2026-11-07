        | SPDX-License-Identifier: GPL-2.0-only
        | Envelopes - the amp envelope record write (OS 1.74).
        |
        | ENV RESET AMP comes from Env Reset Amp: MrScruff's rytm-mods 0015, ported
        | to elemod by Iced-Cream, with Nathaniel Pavel's pre-fade (1.1): the voice
        | fades out over up to ~4 ms, starting up to 7.3 ms before a trig the
        | Rytm schedules itself - a sequencer trig or a retrig - so stock's
        | attack, which ramps from the
        | current level, starts from silence on time. A pad or MIDI hit is not
        | known in advance and plays as stock.
        |
        | Envelopes adds (Nathaniel Pavel): every voice's record then goes to
        | envelopes_voice (envelopes.c), which puts this module's ATK rate into
        | the attack's records, follows the voice's amp level and decides when
        | the hold ends (HOLD 0 = no hold, 127 = AUTO, never before the attack's
        | top).
        |
        | Rate word bit 30, which stock sets for ENV RESET FILTER, resets the
        | level to 0 - the filter envelope's neutral point, but half gain on the
        | amp - so it is not used here.

        .equ    VOICE_TRACK,    0x40291138        | voice -> track, bytes
        .equ    WRITE_RESUME,   0x40109c2c        | moveq #8,%d0, then the level word
        .equ    TRIG,           0x8000e508        | per track, long: 1 on a trig
        .equ    FADE_START,     0xb006a7ec        | linear ramp from the current level
        .equ    FADE_GO_ON,     0x3006a7ec        | the same ramp, continued
        .equ    FADE_LEVEL,     0x00000080        | to -128
        .equ    ENV_RESET,      0x8000ea30        | per track, byte: bit 0 AMP (12 tracks)

        .text

        | ------------------------------------------------------------------
        | envelopes_write: over the two `move.l %d0` stores of the voice's rate
        | word at 0x40109c24 (amp_env_commands 0x40109940), every block for each
        | voice, in every state, after stock's state machine.
        |
        | For voice 0 it first runs envelopes_scan (pre-fade.c), which marks the
        | voices a scheduled trig with AMP in its ENV RESET will restart within
        | the fade; while no track has AMP in its ENV RESET it clears the mask
        | instead, as the scan would. For a marked voice that is sounding and was
        | not trigged this block, it sends a linear ramp to -128 instead of the
        | state's command: the ramp (mode B) in its first block, then mode 3 with
        | the same target and rate every block until the trig, as stock's own
        | attack does.
        |
        | Then envelopes_voice, unless the voice's record is the one it last
        | took and that one left the voice as it was (envelopes_gate, pre-fade.c):
        | an idle voice (rate and level words 0) and a decay that has reached its
        | end get the same record every block, so an idle unit makes no C call.
        |
        | d0 the rate word, d2 the level word, d3 the voice, a2 its state (-1
        | idle; +4 the hold counter), a3 the frame at the voice's record, a4 the
        | track's sound slice (+0 ATK, +2 HLD, +4 DEC). d1, d4 and a0 are written
        | before they are read on the next pass, so they are free.
        | ------------------------------------------------------------------
        .globl  envelopes_write
        .align  2
envelopes_write:
        tst.l   %d3
        bne.s   1f
        move.l  ENV_RESET,%d1                     | once a block: any track's AMP bit
        or.l    ENV_RESET+4,%d1
        or.l    ENV_RESET+8,%d1
        andi.l  #0x01010101,%d1
        bne.s   3f
        clr.l   envelopes_gate                    | no voice to fade
        bra.s   1f
3:      lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr     envelopes_scan
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
1:      move.l  envelopes_gate,%d1                | the voices to fade
        btst    %d3,%d1
        beq.s   9f
        tst.l   (%a2)
        bmi.s   9f                                | idle
        lea     VOICE_TRACK,%a0
        mvz.b   (%a0,%d3.l),%d1
        lea     TRIG,%a0
        moveq   #1,%d4
        cmp.l   (%a0,%d1.l*4),%d4
        beq.s   9f                                | trigged this block
        move.l  #FADE_GO_ON,%d0
        move.l  envelopes_gate+4,%d1              | the fades that start now
        btst    %d3,%d1
        beq.s   2f
        move.l  #FADE_START,%d0
2:      move.l  #FADE_LEVEL,%d2
9:      move.l  envelopes_gate+8,%d1              | the voices left as they were
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
