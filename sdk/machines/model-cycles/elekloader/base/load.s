| SPDX-License-Identifier: GPL-3.0-or-later
| Every base (base.json's add): the audio load probe. The audio interrupt calls the
| audio function (voices, mix, effects) at OS 1.13 0x40059382, jsr 0x4005979e (defsym
| LOAD_AUDIO_FN); the site points that call here. The probe takes the return address off the
| stack so the audio function sees its arguments where stock put them, reads DMA timer 0
| (LOAD_TIMER, 90,112 ticks a codec block) before and after, and hands the busy ticks to
| mw_load_block (load.c). d0 is kept; d1/a0/a1 are a call's scratch, as for stock's call.
| The audio interrupt does not nest, so one saved return address is enough.

        .section .run, "ax"
        .globl  mw_load_probe
mw_load_probe:
        move.l  (%sp)+, mw_load_ret
        move.l  LOAD_TIMER, %d0         | d0 is scratch before a call
        move.l  %d0, mw_load_t0
        jsr     LOAD_AUDIO_FN
        move.l  %d0, -(%sp)
        move.l  LOAD_TIMER, %d0
        sub.l   mw_load_t0, %d0
        move.l  %d0, -(%sp)
        jsr     mw_load_block
        addq.l  #4, %sp
        move.l  (%sp)+, %d0
        move.l  mw_load_ret, -(%sp)
        rts
