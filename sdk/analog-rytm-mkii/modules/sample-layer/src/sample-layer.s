        | SPDX-License-Identifier: GPL-3.0-or-later
        | Sample Layer: the audio interrupt's two entries.
        |
        | Stock's voice mixer (0x4010ea98, called once a block at 0x4012129a) sums three streams
        | into each voice's DAC word, 32 frames a block:
        |   0x80006bf8 + 128v   the digital machine's stream
        |   0x80007040          a second unscaled stream
        |   0x800067f8 + 128v   the sample, scaled by SMPL LEV's ramped gain at 0x80007000 + 8v
        | Probe SL01 (26 November 2026, on a unit) cleared the third stream: the sample went silent and
        | the analog machine kept sounding. sample_layer_render (sample-layer.c) shapes it in place.

        .equ    STOCK_MIXER,    0x4010ea98
        .equ    LEVEL_ATTACK,   0x4000007f        | the amp record of a trig (Improved AMP's name)

        .extern sample_layer_render, sample_layer_trig

        .text

        | Over `jsr 0x4010ea98` at 0x4012129a: the mixer's argument is on the stack and the jsr to
        | this gate pushed the return address stock's would have, so the jmp leaves the call as
        | stock's. The C body may clobber d0-d1/a0-a1; the caller reloads what it needs after the
        | mixer, which saves d2-d7/a2-a6 itself. The EMAC goes to the fractional mode modwerk/dsp.h
        | expects, with ACC0 clear; the mixer sets its own mode.
        .globl  sample_layer_mixer_gate
        .align  2
sample_layer_mixer_gate:
        move.l  #0x20,%macsr
        movclr.l %acc0,%d0
        jsr     sample_layer_render
        jmp     STOCK_MIXER

        | ev_amp_record, a follower (order 60): d2 the level word, d3 the voice. A trig's attack
        | record marks the voice, and the next render starts its decay from full. Uses a0 only.
        .globl  sample_layer_amp
        .align  2
sample_layer_amp:
        cmp.l   #LEVEL_ATTACK,%d2
        bne.s   1f
        lea     sample_layer_trig,%a0
        bset    %d3,(%a0)
1:      rts
