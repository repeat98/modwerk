| SPDX-License-Identifier: GPL-3.0-or-later
| Sample Rate: the sites in stock's sample engine and the menus. See rate.c.

        .text

| Before the prefetch of every block; d0-d1/a0-a1 are free there.
        .globl  sample_rate_block_gate
        .extern sample_rate_block

sample_rate_block_gate:
        move.l  #0x8000ea18,%d7                 | displaced
        jmp     sample_rate_block

| The prefetch's step loop, once a voice: a1 is one past the voice's byte in
| stock's voice to track list; d0 the track's offset, a2 the effective array.
| The first gate reads TUN and FIN as stock does and, for a voice with RATE,
| gives the pitch a FIN at rest and keeps the real one for the second gate,
| which scales the finished step by |FIN - 64| / 64. d6 is free at both.

        .equ    IDLE, 0x7f00                    | what the second gate skips: 1x
        .globl  sample_rate_fin_gate, sample_rate_scale_gate
        .extern sample_rate_voices

sample_rate_fin_gate:
        mvs.w   2(%a2,%d0.l),%d1                | displaced
        mvs.w   4(%a2,%d0.l),%d0                | displaced
        move.l  %a1,%d6
        subi.l  #0x40291139,%d6
        btst    %d6,sample_rate_voices
        beq.s   1f
        move.l  %d0,sample_rate_fin
        move.l  #0x4000,%d0
        rts
1:      move.l  #IDLE,%d6
        move.l  %d6,sample_rate_fin
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

| Stock's routine that applies a sound to a track, past its checks, before it
| copies the settings: a2 the sound, d2 the track. d0-d1/a0-a1 are free.
        .globl  sample_rate_apply_gate
        .extern sample_rate_applied

sample_rate_apply_gate:
        move.l  %d2,-(%sp)
        move.l  %a2,-(%sp)
        jsr     sample_rate_applied
        addq.l  #8,%sp
        lea     0x8000ea00,%a0                  | displaced
        rts

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

| param_short_name and param_long_name(obj, id): FIN's names read RATE while
| it is. d0-d1/a0-a1 are free at their entries, so the check can call out.
        .globl  sample_rate_label_gate, sample_rate_long_gate
        .extern sample_rate_selected

sample_rate_label_gate:
        bsr.s   rate_name
        beq.s   1f
        rts
1:      move.l  8(%sp),%d1                      | displaced
        cmpi.l  #469,%d1                        | displaced
        jmp     sample_rate_label_resume

sample_rate_long_gate:
        bsr.s   rate_name
        beq.s   1f
        rts
1:      move.l  8(%sp),%d1                      | displaced
        cmpi.l  #469,%d1                        | displaced
        jmp     sample_rate_long_resume

| -> d0 the name and Z clear for FIN while it is RATE, else Z set
rate_name:
        moveq   #40,%d0                         | FIN's id
        cmp.l   12(%sp),%d0
        bne.s   1f
        jsr     sample_rate_selected
        tst.l   %d0
        beq.s   1f
        move.l  #sample_rate_label,%d0
        rts
1:      clr.l   %d0
        rts

| SoundSetupMenuView's constructor after the SMP: row is added: a4 is the view,
| the menu its rows go to, and the site is what ends that row's call.
        .globl  sample_rate_menu_gate
        .extern sample_rate_add_row

sample_rate_menu_gate:
        move.l  %a4,-(%sp)
        jsr     sample_rate_add_row
        addq.l  #4,%sp
        move.l  %d2,-(%sp)                      | displaced
        jsr     (%a2)                           | displaced
        move.l  %d3,-(%sp)                      | displaced
        jmp     sample_rate_menu_resume

| Stock's sound page key handler, on a knob's press or release: d2 the event,
| d4 the knob's parameter id, a2 the view. d1/a0-a1 are free, and d0 is stored
| first. The tst sets the flags for the branch that follows the site.
        .globl  sample_rate_knob_gate
        .extern sample_rate_knob

sample_rate_knob_gate:
        move.l  %d0,-20(%fp)                    | displaced
        move.l  %d2,-(%sp)
        move.l  %d4,-(%sp)
        move.l  %a2,-(%sp)
        jsr     sample_rate_knob
        lea     12(%sp),%sp
        tst.l   %d4                             | displaced
        rts

| The row's label, a std::function returning a std::string: the string to
| build is at a0, and d0 returns a0.
        .globl  sample_rate_row_label

sample_rate_row_label:
        link    %a6,#-4
        move.l  %d2,-(%sp)
        move.l  %a0,%d2
        pea     -1(%a6)
        pea     sample_rate_row_text
        move.l  %d2,-(%sp)
        jsr     sample_rate_string
        lea     12(%sp),%sp
        move.l  %d2,%d0
        move.l  -8(%a6),%d2
        unlk    %a6
        rts

        .bss
        .align  4
sample_rate_fin:
        .space  4

        .section .rodata
sample_rate_label:
        .asciz  "RATE"
sample_rate_row_text:
        .asciz  "SMP RATE"
