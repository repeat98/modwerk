| SPDX-License-Identifier: GPL-3.0-or-later
| Draw gate (Modwerk core). Fixed at 0x400c46ea in a zero run of the stock image, 24 bytes at most.
| The compositor's site jumps here from power-on, twice before boot has placed .run, so this code must
| live in the image itself and may look at nothing but core_up, which is also part of the image and so
| reads 0 on every start. Once boot sets core_up, hand the compositor's call straight to core_draw.

        .text
        .globl  core_draw_gate
        .globl  core_up
core_draw_gate:
        tst.b   (core_up, %pc)          | position-independent: no relocation, 4 bytes
        bne.s   1f
        movea.l FRAME_PTR, %a5          | the instruction the site replaced; only the CCR else changes
        rts
1:      jmp     (core_draw).l           | tail jump: the dispatcher returns to the compositor
core_up:
        .byte   0
