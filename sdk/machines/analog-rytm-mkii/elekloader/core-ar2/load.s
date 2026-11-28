| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm core (Modwerk): the audio interrupt's load, core_audio_load (analog-rytm-mk2/load.h).
|
| core_load_in runs first in ev_render_in (order 0) and core_load_out last in ev_render_out (order 100). Both read
| DMA timer 0's counter, which the hook bus starts at boot. The load is the time between them in 256ths of the
| time between two blocks' entries, 0..256. void f(void) at interrupt level: d0, d1, a0 and a1 only, no EMAC.

        .equ DTCN0, 0xfc07000c

        .section .run, "ax"

        .globl core_load_in
core_load_in:
        move.l DTCN0, %d0
        move.l entered, %d1
        beq.s 1f
        movea.l %d0, %a0
        sub.l %d1, %d0
        move.l %d0, period
        move.l %a0, %d0
1:      move.l %d0, entered
        rts

        .globl core_load_out
core_load_out:
        move.l period, %d1
        beq.s 9f
        move.l DTCN0, %d0
        sub.l entered, %d0
        cmp.l %d1, %d0
        bcs.s 1f
        move.l #256, %d0
        bra.s 2f
1:      lsl.l #8, %d0
        divu.l %d1, %d0
2:      move.l %d0, core_audio_load
9:      rts

        .section .bss, "aw", @nobits
        .balign 4
        .globl core_audio_load
core_audio_load:
        .space 4
entered:
        .space 4
period:
        .space 4
