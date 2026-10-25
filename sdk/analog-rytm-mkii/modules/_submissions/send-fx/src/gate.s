| SPDX-License-Identifier: GPL-3.0-or-later
| Send FX: the FX returns' hook, and the block's input and output loops.
|
| The audio block calls one routine with the output slot in its argument; it
| runs the PRE return mixer (delay and reverb into the analog mixer, before
| distortion and the compressor), then the POST one, and ends with
| `movel #32,%macsr` (6 bytes), with d2 still holding the slot. The detour
| replaces that instruction: it runs the effect, which adds its stereo return
| to the PRE words the mixer has just written, then sets the MAC mode as stock
| does. d0, d1, a0 and a1 are free here (stock returns next); the C code
| keeps d2-d7/a2-a6. The addresses come from build.json for each OS release.
|
| The block uses the EMAC (the multiply-accumulate unit stock's mixers use) in
| signed integer mode with saturation: the hook keeps the two accumulators it
| uses as stock left them (read and written back in stock's fractional mode,
| as the registers hold them) and restores stock's mode after.

        .text
        .globl  send_fx_gate
        .globl  send_fx_in8
        .globl  send_fx_out
        .extern send_fx_block

send_fx_gate:
        lea     -12(%sp),%sp
        move.l  %acc0,%d0
        move.l  %acc1,%d1
        move.l  %accext01,%a0
        movem.l %d0-%d1/%a0,(%sp)
        move.l  #0x80,%macsr                      | signed integer, saturating
        move.l  %d2,-(%sp)
        jsr     send_fx_block
        addq.l  #4,%sp
        move.l  #32,%macsr                        | stock
        movem.l (%sp),%d0-%d1/%a0
        move.l  %d0,%acc0
        move.l  %d1,%acc1
        move.l  %a0,%accext01
        lea     12(%sp),%sp
        jmp     send_fx_resume

| void send_fx_in8(const volatile int *rx, const int *gain, int *x, int pairs)
| The eight voices, rx pointing at frame 0's first voice word (12 words a
| frame), each times its gain (Q15, one per voice word), summed: x gets
| sum >> 15 a frame (32 values), or with pairs the mean of each pair of
| frames (16 values, each product halved as it is summed). The read
| saturates, so x stays within +-65536.
send_fx_in8:
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        move.l  48(%sp),%a0
        move.l  52(%sp),%a1
        movem.l (%a1),%d3-%d7/%a2-%a4
        move.l  56(%sp),%a1
        tst.l   60(%sp)
        bne.s   .Lpairs
        lea     128(%a1),%a5
.Lframe:
        move.l  (%a0),%d0
        mac.w   %d0u,%d3l,4(%a0),%d1,%acc0
        mac.w   %d1u,%d4l,8(%a0),%d0,%acc0
        mac.w   %d0u,%d5l,12(%a0),%d1,%acc0
        mac.w   %d1u,%d6l,16(%a0),%d0,%acc0
        mac.w   %d0u,%d7l,20(%a0),%d1,%acc0
        mac.w   %d1u,%a2l,24(%a0),%d0,%acc0
        mac.w   %d0u,%a3l,28(%a0),%d1,%acc0
        mac.w   %d1u,%a4l,%acc0
        lea     48(%a0),%a0
        movclr.l %acc0,%d2
        asr.l   #8,%d2
        asr.l   #7,%d2
        move.l  %d2,(%a1)+
        cmp.l   %a5,%a1
        bne.s   .Lframe
        bra.s   .Lin_done
.Lpairs:
        lea     64(%a1),%a5
.Lpair:
        move.l  (%a0),%d0
        mac.w   %d0u,%d3l,>>,4(%a0),%d1,%acc0
        mac.w   %d1u,%d4l,>>,8(%a0),%d0,%acc0
        mac.w   %d0u,%d5l,>>,12(%a0),%d1,%acc0
        mac.w   %d1u,%d6l,>>,16(%a0),%d0,%acc0
        mac.w   %d0u,%d7l,>>,20(%a0),%d1,%acc0
        mac.w   %d1u,%a2l,>>,24(%a0),%d0,%acc0
        mac.w   %d0u,%a3l,>>,28(%a0),%d1,%acc0
        mac.w   %d1u,%a4l,>>,48(%a0),%d0,%acc0    | the next frame's first voice
        mac.w   %d0u,%d3l,>>,52(%a0),%d1,%acc0
        mac.w   %d1u,%d4l,>>,56(%a0),%d0,%acc0
        mac.w   %d0u,%d5l,>>,60(%a0),%d1,%acc0
        mac.w   %d1u,%d6l,>>,64(%a0),%d0,%acc0
        mac.w   %d0u,%d7l,>>,68(%a0),%d1,%acc0
        mac.w   %d1u,%a2l,>>,72(%a0),%d0,%acc0
        mac.w   %d0u,%a3l,>>,76(%a0),%d1,%acc0
        mac.w   %d1u,%a4l,>>,%acc0
        lea     96(%a0),%a0
        movclr.l %acc0,%d2
        asr.l   #8,%d2
        asr.l   #7,%d2
        move.l  %d2,(%a1)+
        cmp.l   %a5,%a1
        bne.s   .Lpair
.Lin_done:
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     44(%sp),%sp
        rts

| void send_fx_out(volatile int *pre, const int *l, const int *r, int g, int step, int half)
| Adds the return to the PRE words (pre: frame 0's left word, 16 words a
| frame; 24-bit values in the low bits): each word, moved up to the top of an
| accumulator, plus the sample times the gain (g, stepped by step each frame,
| 256 x the gain in 24-bit units a 16-bit unit), read back saturated. l and r
| hold 32 samples, or with half the previous block's last sample then 16 at
| 24 kHz, each frame pair taking the midpoint and then the sample.
send_fx_out:
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        movem.l 48(%sp),%a0-%a2
        movem.l 60(%sp),%d4-%d5
        tst.l   68(%sp)
        bne.s   .Lhalf
        lea     128(%a1),%a5
.Lout:
        move.l  (%a0),%d0
        move.l  4(%a0),%d1
        lsl.l   #8,%d0
        lsl.l   #8,%d1
        move.l  %d0,%acc0
        move.l  %d1,%acc1
        move.l  (%a1)+,%d2
        move.l  (%a2)+,%d3
        add.l   %d5,%d4
        mac.l   %d2,%d4,%acc0
        mac.l   %d3,%d4,%acc1
        movclr.l %acc0,%d0
        movclr.l %acc1,%d1
        lsr.l   #8,%d0
        lsr.l   #8,%d1
        move.l  %d0,(%a0)
        move.l  %d1,4(%a0)
        lea     64(%a0),%a0
        cmp.l   %a5,%a1
        bne.s   .Lout
        bra.s   .Lout_done
.Lhalf:
        lea     68(%a1),%a5
        move.l  (%a1)+,%d6
        move.l  (%a2)+,%d7
.Lhpair:
        move.l  (%a1)+,%d2
        move.l  (%a2)+,%d3
        add.l   %d2,%d6
        add.l   %d3,%d7
        asr.l   #1,%d6
        asr.l   #1,%d7
        move.l  (%a0),%d0
        move.l  4(%a0),%d1
        lsl.l   #8,%d0
        lsl.l   #8,%d1
        move.l  %d0,%acc0
        move.l  %d1,%acc1
        add.l   %d5,%d4
        mac.l   %d6,%d4,%acc0
        mac.l   %d7,%d4,%acc1
        movclr.l %acc0,%d0
        movclr.l %acc1,%d1
        lsr.l   #8,%d0
        lsr.l   #8,%d1
        move.l  %d0,(%a0)
        move.l  %d1,4(%a0)
        move.l  64(%a0),%d0
        move.l  68(%a0),%d1
        lsl.l   #8,%d0
        lsl.l   #8,%d1
        move.l  %d0,%acc0
        move.l  %d1,%acc1
        add.l   %d5,%d4
        mac.l   %d2,%d4,%acc0
        mac.l   %d3,%d4,%acc1
        movclr.l %acc0,%d0
        movclr.l %acc1,%d1
        lsr.l   #8,%d0
        lsr.l   #8,%d1
        move.l  %d0,64(%a0)
        move.l  %d1,68(%a0)
        lea     128(%a0),%a0
        move.l  %d2,%d6
        move.l  %d3,%d7
        cmp.l   %a5,%a1
        bne.s   .Lhpair
.Lout_done:
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     44(%sp),%sp
        rts
