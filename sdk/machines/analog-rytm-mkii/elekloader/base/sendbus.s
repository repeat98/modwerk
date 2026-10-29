| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Analog Rytm MKII base, the send bus: the FX returns' hook, and the block's input and output loops.
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
        .globl  mw_send_gate
        .globl  mw_send_in8
        .globl  mw_send_out
        .globl  mw_send_inl
        .globl  mw_send_ret
        .extern mw_send_block
        .extern mw_send_meter
        .extern mw_send_blk

| The light block's working set (send-fx.c, blk): its offsets.
        .set    B_OB, 0                           | int ob[2][32]
        .set    B_XB, 256                         | int xb[32]
        .set    B_VL, 384                         | int vl[8][2]: word offset, gain
        .set    B_NV, 448
        .set    B_MODE, 452                       | 1 at 24 kHz, 3 with the lift
        .set    B_LAST, 456
        .set    B_PV, 460                         | int pv[2]
        .set    B_GLEV, 468
        .set    B_STATE, 472                      | 1: the next block light
        .set    B_RTYPE, 476
        .set    B_LTRIM, 480
        .set    B_PFX, 484                        | &fx_type
        .set    B_PLEV, 488                       | &lev
        .set    B_PRE0, 492
        .set    B_RX0, 496
        .set    B_USED, 500
        .set    B_BLOCKS, 504

| A light block (blk.state 1, the effect unchanged) is worked out here: its
| input kept (mw_send_inl), the return the block before worked out for it
| out (mw_send_ret, LEV as (lev * lev * trim) >> 8), the next block full. A
| full block runs in mw_send_block (C). Each is timed on DMA timer 0 for the
| CPU meter (mw_send_meter every 1500 blocks).
mw_send_gate:
        lea     -12(%sp),%sp
        move.l  %acc0,%d0
        move.l  %acc1,%d1
        move.l  %accext01,%a0
        movem.l %d0-%d1/%a0,(%sp)
        move.l  #0x80,%macsr                      | signed integer, saturating
        move.l  (0xFC07000C).l,-(%sp)             | the block's start
        lea     mw_send_blk,%a0
        moveq   #1,%d0
        cmp.l   B_STATE(%a0),%d0
        bne.s   .Lfull
        move.l  B_PFX(%a0),%a1
        moveq   #0,%d0
        move.b  (%a1),%d0
        cmp.l   B_RTYPE(%a0),%d0
        bne.s   .Lfull
        move.l  B_PLEV(%a0),%a1
        moveq   #0,%d0
        move.b  (%a1),%d0
        mulu.w  %d0,%d0
        muls.l  B_LTRIM(%a0),%d0
        asr.l   #8,%d0
        move.l  %d0,-(%sp)                        | tlev
        moveq   #3,%d0
        and.l   %d2,%d0
        moveq   #11,%d1
        lsl.l   %d1,%d0
        add.l   B_PRE0(%a0),%d0
        move.l  %d0,-(%sp)                        | this slot's PRE words
        move.l  %a0,-(%sp)
        move.l  B_RX0(%a0),-(%sp)
        move.l  %a0,-(%sp)
        bsr     mw_send_inl
        addq.l  #8,%sp
        bsr     mw_send_ret
        move.l  (%sp),%a0
        moveq   #2,%d0
        move.l  %d0,B_STATE(%a0)
        lea     12(%sp),%sp
        bra.s   .Lmeter
.Lfull:
        move.l  %d2,-(%sp)
        jsr     mw_send_block
        addq.l  #4,%sp
        lea     mw_send_blk,%a0
.Lmeter:
        move.l  (0xFC07000C).l,%d0
        sub.l   (%sp)+,%d0
        add.l   %d0,B_USED(%a0)
        move.l  B_BLOCKS(%a0),%d0
        addq.l  #1,%d0
        move.l  %d0,B_BLOCKS(%a0)
        cmpi.l  #1500,%d0
        blt.s   1f
        jsr     mw_send_meter
1:      move.l  #32,%macsr                        | stock
        movem.l (%sp),%d0-%d1/%a0
        move.l  %d0,%acc0
        move.l  %d1,%acc1
        move.l  %a0,%accext01
        lea     12(%sp),%sp
        jmp     mw_send_resume

| void mw_send_in8(const volatile int *rx, const int *gain, int *x, int pairs)
| The eight voices, rx pointing at frame 0's first voice word (12 words a
| frame), each times its gain (Q15, one per voice word), summed: x gets
| sum >> 15 a frame (32 values), or with pairs the mean of each pair of
| frames (16 values, each product halved as it is summed). The read
| saturates, so x stays within +-65536.
mw_send_in8:
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

| void mw_send_out(volatile int *pre, const int *l, const int *r, int g, int step, int half)
| Adds the return to the PRE words (pre: frame 0's left word, 16 words a
| frame; 24-bit values in the low bits): each word, moved up to the top of an
| accumulator, plus the sample times the gain (g, stepped by step each frame,
| 256 x the gain in 24-bit units a 16-bit unit), read back saturated. l and r
| hold 32 samples, or with half the previous block's last sample then 16 at
| 24 kHz, each frame pair taking the midpoint and then the sample.
mw_send_out:
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        movem.l 48(%sp),%a0-%a2
        movem.l 60(%sp),%d4-%d5
        tst.l   68(%sp)
        bne.s   .Lhalf
.Lout:
        lea     128(%a1),%a5
.Lframe_out:
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
        bne.s   .Lframe_out
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

| void mw_send_ret(struct blk *b, volatile int *pre, int tlev)
| The return worked out for this block (ob) out to the PRE words through
| mw_send_out's loops, LEV's gain stepped from b->glev to tlev across the
| block (glev * 4, then (tlev - glev) / 32 * 4 a frame, as C divides). At
| 24 kHz ob starts with the sample before (pv, given back by the block
| before), and its last sample is kept for the block after.
mw_send_ret:
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        move.l  48(%sp),%a3
        move.l  52(%sp),%a0
        move.l  56(%sp),%d5
        move.l  B_GLEV(%a3),%d4
        move.l  %d5,B_GLEV(%a3)
        sub.l   %d4,%d5
        bpl.s   1f
        moveq   #31,%d0
        add.l   %d0,%d5
1:      asr.l   #5,%d5
        lsl.l   #2,%d5
        lsl.l   #2,%d4
        lea     B_OB(%a3),%a1
        lea     B_OB+128(%a3),%a2
        moveq   #1,%d0
        and.l   B_MODE(%a3),%d0
        beq     .Lout
        move.l  B_PV(%a3),(%a1)
        move.l  B_PV+4(%a3),(%a2)
        move.l  64(%a1),B_PV(%a3)
        move.l  64(%a2),B_PV+4(%a3)
        bra     .Lhalf

| void mw_send_inl(struct blk *b, const volatile int *rx)
| A light block's input, as block_body works it out voice by voice: xb
| cleared, then for each voice in b->vl (rx plus its word's offset, its gain
| g) 32 frames of ((word >> 16) * g) >> 15, or at 24 kHz 16 pairs of
| (((word >> 16) + (next frame's >> 16)) * g) >> 16, summed; with two voices
| or more each sum held within +-65535; then, for an effect whose input is
| lifted, x + (x - the sample before) / 4, held within +-65535.
mw_send_inl:
        lea     -32(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,(%sp)
        movem.l 36(%sp),%a2/%a3
        moveq   #32,%d2                           | samples
        moveq   #1,%d0
        and.l   B_MODE(%a2),%d0
        beq.s   1f
        moveq   #16,%d2
1:      lea     B_XB(%a2),%a1
        move.l  %d2,%d0
2:      clr.l   (%a1)+
        subq.l  #1,%d0
        bne.s   2b
        move.l  %a3,%d5
        lea     B_VL(%a2),%a3
        move.l  B_NV(%a2),%d4
        beq.s   .Llift
        moveq   #15,%d6
.Lvoice:
        move.l  %d5,%a0
        adda.l  (%a3)+,%a0
        move.l  (%a3)+,%d3
        lea     B_XB(%a2),%a1
        move.l  %d2,%d7
        btst    #4,%d2
        bne.s   .Lvpair
.Lvframe:
        move.l  (%a0),%d0
        swap    %d0
        ext.l   %d0
        muls.l  %d3,%d0
        asr.l   %d6,%d0
        add.l   %d0,(%a1)+
        lea     48(%a0),%a0
        subq.l  #1,%d7
        bne.s   .Lvframe
        bra.s   .Lvnext
.Lvpair:
        move.l  (%a0),%d0
        move.l  48(%a0),%d1
        swap    %d0
        ext.l   %d0
        swap    %d1
        ext.l   %d1
        add.l   %d1,%d0
        muls.l  %d3,%d0
        swap    %d0
        ext.l   %d0
        add.l   %d0,(%a1)+
        lea     96(%a0),%a0
        subq.l  #1,%d7
        bne.s   .Lvpair
.Lvnext:
        subq.l  #1,%d4
        bne.s   .Lvoice
        moveq   #1,%d0
        cmp.l   B_NV(%a2),%d0
        bge.s   .Llift
        lea     B_XB(%a2),%a1
        move.l  #65535,%d3
        move.l  %d3,%d4
        neg.l   %d4
3:      move.l  (%a1),%d0
        cmp.l   %d3,%d0
        ble.s   4f
        move.l  %d3,%d0
4:      cmp.l   %d4,%d0
        bge.s   5f
        move.l  %d4,%d0
5:      move.l  %d0,(%a1)+
        subq.l  #1,%d2
        bne.s   3b
.Llift:
        moveq   #2,%d0
        and.l   B_MODE(%a2),%d0
        beq.s   .Linl_done
        lea     B_XB(%a2),%a1
        move.l  B_LAST(%a2),%d1
        move.l  #65535,%d3
        move.l  %d3,%d4
        neg.l   %d4
        moveq   #16,%d7
6:      move.l  (%a1),%d0
        move.l  %d0,%d5
        sub.l   %d1,%d5
        asr.l   #2,%d5
        add.l   %d0,%d5
        move.l  %d0,%d1
        cmp.l   %d3,%d5
        ble.s   7f
        move.l  %d3,%d5
7:      cmp.l   %d4,%d5
        bge.s   8f
        move.l  %d4,%d5
8:      move.l  %d5,(%a1)+
        subq.l  #1,%d7
        bne.s   6b
        move.l  %d1,B_LAST(%a2)
.Linl_done:
        movem.l (%sp),%d2-%d7/%a2-%a3
        lea     32(%sp),%sp
        rts
