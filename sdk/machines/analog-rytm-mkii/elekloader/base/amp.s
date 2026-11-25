        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base: the amp envelope's record (the table ev_amp_record).
        | modwerk/amp.h is the modules' side.
        |
        | Stock OS 1.74's amp_env_commands (0x40109940, once an audio block) runs each voice's amp
        | envelope state machine, then stores the voice's record for the amp: the rate word at
        | 172/236(a3) and the level word at 168/232(a3) (0x40109c24..0x40109c34). The base takes those
        | four stores, so no module patches them:
        |
        |   1. Each ev_amp_record entry in turn, by order: d0 the rate word and d2 the level word, in
        |      and out; d3 the voice (0..7), a2 its state (+0 state, +4 hold counter), a3 the frame at
        |      its record, a4 its track's sound slice (+0 ATK, +2 HLD, +4 DEC). An entry may rewrite
        |      d0, d2 and the state's +0, may use d1, d4 and a0, and keeps every other register.
        |   2. Stock's four stores, then stock's loop.
        |
        | With no entry, a voice costs one table read and one test more than stock.

        .equ    STORES_DONE,    0x40109c36        | stock's loop after the four stores

        .extern ev_amp_record

        .text
        .globl  mw_amp_record
        .align  2
mw_amp_record:
        lea     ev_amp_record,%a0
        tst.l   (%a0)
        beq.s   5f
        move.l  %a1,-(%sp)
        movea.l %a0,%a1
4:      movea.l (%a1)+,%a0
        jsr     (%a0)
        tst.l   (%a1)
        bne.s   4b
        movea.l (%sp)+,%a1
5:      move.l  %d0,172(%a3)                      | stock's four stores, as at 0x40109c24
        move.l  %d0,236(%a3)
        moveq   #8,%d0                            | the loop's voice count, as stock
        move.l  %d2,168(%a3)
        move.l  %d2,232(%a3)
        jmp     STORES_DONE
