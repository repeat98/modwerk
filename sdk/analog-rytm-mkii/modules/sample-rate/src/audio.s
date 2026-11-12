| SPDX-License-Identifier: GPL-3.0-or-later
| Fine Tune + Sample Rate: the sites in stock's sample engine and parameter code. See rate.c.

        .text

| Before the prefetch of every block; d0-d1/a0-a1 are free there.
        .globl  sample_rate_block_gate
        .extern sample_rate_block

sample_rate_block_gate:
        move.l  #0x8000ea18,%d7                 | displaced
        jmp     sample_rate_block

| The prefetch's step loop, once a voice: a1 is one past the voice's byte in
| stock's voice to track list; d0 the track's offset, a2 the effective array.
| The first gate reads TUN and FIN as stock does, gives the pitch a FIN at rest
| and keeps the real one for the second gate, which scales the finished step by
| |FIN - 64| / 64. d6 is free at both.

        .equ    IDLE, 0x7f00                    | what the second gate skips: 1x
        .globl  sample_rate_fin_gate, sample_rate_scale_gate

sample_rate_fin_gate:
        mvs.w   2(%a2,%d0.l),%d1                | displaced
        mvs.w   4(%a2,%d0.l),%d0                | displaced
        move.l  %d0,sample_rate_fin
        move.l  #0x4000,%d0
        rts

| In the prefetch's EMAC mode, fractional: the multiply by the amount << 17
| is amount / 2^14. FIN 127 is exactly 1x, and so is 0 going back, at 2^14.
sample_rate_scale_gate:
        asr.l   #1,%d0                          | displaced
        lea     92(%a0),%a0                     | displaced
        move.l  sample_rate_fin,%d1
        cmpi.l  #IDLE,%d1
        bge.s   9f
        subi.l  #0x4000,%d1
        bpl.s   1f
        neg.l   %d1
1:      cmpi.l  #0x4000,%d1
        bge.s   9f
        moveq   #17,%d6
        lsl.l   %d6,%d1
        mac.l   %d0,%d1,%acc0
        movclr.l %acc0,%d0
9:      rts

| Stock's frames for STA and END, frames(sta, end, count) -> d0 and d1, under
| the MACSR the prefetch sets for it: this runs before the prefetch sets it.
        .globl  sample_rate_frames
        .extern sample_rate_stock_frames

sample_rate_frames:
        move.l  %macsr,%d1
        move.l  #0xa0,%macsr
        move.l  %d1,-(%sp)
        move.l  16(%sp),-(%sp)                  | count
        move.l  16(%sp),-(%sp)                  | end
        move.l  16(%sp),-(%sp)                  | sta
        jsr     sample_rate_stock_frames
        lea     12(%sp),%sp
        move.l  (%sp)+,%a0
        move.l  %a0,%macsr
        movea.l 16(%sp),%a0                     | out
        move.l  %d0,(%a0)
        move.l  %d1,4(%a0)
        rts

| Stock's add of a turn to a value, (obj, id, cur, delta) on the stack, d0-d1/a0-a1
| free: for TUN the delta becomes cents (rate.c). The site's lea and moveml follow.
        .globl  sample_rate_add_gate
        .extern sample_rate_tun_delta, sample_rate_add_resume

sample_rate_add_gate:
        moveq   #39,%d0                         | TUN's id
        cmp.l   8(%sp),%d0
        bne.s   1f
        move.l  16(%sp),-(%sp)                  | delta
        move.l  16(%sp),-(%sp)                  | cur
        jsr     sample_rate_tun_delta
        addq.l  #8,%sp
        move.l  %d0,16(%sp)
1:      lea     -44(%sp),%sp                    | displaced
        movem.l %d2-%d7/%a2-%a3,(%sp)           | displaced
        jmp     sample_rate_add_resume

        .bss
        .align  4
sample_rate_fin:
        .space  4

        .section .rodata
| FIN's names in its parameter row, which every screen reads: knob, header, LFO
| destinations, locks.
        .globl  sample_rate_short_text, sample_rate_long_text
sample_rate_short_text:
        .asciz  "RATE"
sample_rate_long_text:
        .asciz  "Rate"
