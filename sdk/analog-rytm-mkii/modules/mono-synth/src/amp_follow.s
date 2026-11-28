        | SPDX-License-Identifier: GPL-3.0-or-later
        | ------------------------------------------------------------------
        | ms_amp_follow: an ev_amp_record entry at order 80, after every entry
        | that rewrites the record (modwerk/amp.h). It only reads: it keeps each
        | voice's amp state (a2+0, negative when the amp is idle) and the record
        | sent, so the voice can go quiet once its amp has closed. d0 the rate
        | word, d2 the level word, d3 the voice (0..7), a2 its state. Uses a0
        | and keeps every other register.
        | ------------------------------------------------------------------
        .text
        .globl  ms_amp_follow
        .balign 2
ms_amp_follow:
        lea     ms_amp+4,%a0
        move.l  (%a2),(%a0,%d3.l*4)               | state[v]
        move.l  %d0,32(%a0,%d3.l*4)               | rate[v]
        move.l  %d2,64(%a0,%d3.l*4)               | level[v]
        rts
