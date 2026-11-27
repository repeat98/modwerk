| SPDX-License-Identifier: GPL-2.0-or-later
| MUTINY's own OS 1.44 site: where the audio tracks' step fire reads LEN.
| seq-events has no event for it; this site overlaps none of seq-events' or
| core's. In the fire: d4 = track, d3 = step, a0 = track data, a1 = a0 +
| step, d1 = -1. The fire keeps LEN in a4.

        .section .run, "ax"

| 0x40094688, 6 bytes over `mvs.b 192(a1),d7; cmp.l d7,d1`: d7 = mut_on_len's
| LEN and the flags of the compare for the stock `beq`. Keeps all but d7 and
| the flags.
        .globl  mut_site_len
mut_site_len:
        mvs.b   192(%a1), %d7
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %a0, -(%sp)             | the track's data
        move.l  %d7, -(%sp)             | the step's LEN, -1 the track's
        move.l  %d3, -(%sp)             | step
        move.l  %d4, -(%sp)             | track
        jsr     mut_on_len
        lea     16(%sp), %sp
        move.l  %d0, %d7
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        cmp.l   %d7, %d1
        rts
