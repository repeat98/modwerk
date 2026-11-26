| SPDX-License-Identifier: GPL-3.0-or-later
| PROGRAM PROBE's ColdFire half: its ot_dsp_effects record (events.json). Each program is `do #(100 + 500 p),end / nop /
| end: rts`, four words for the area's address; its stream sends each frame's number and takes it back. Stock addresses:
| OS 1.40C.

        .text
        .equ    FRAME, 0x800000e0       | the frame count: bit 0 picks this frame's records
        .equ    KNOB_A, 0x80000128      | the first record's FX2 slot A (record + 24); a record a track, 64 bytes

        .align  4
        .global pp_effect
pp_effect:                              | struct modwerk_dsp_effect
        .long   1                       | abi
        .long   8                       | program_words: the four the code takes, and room
        .long   pp_program
        .long   pp_code
        .word   2, 2                    | stream_in, stream_out: two halfwords each way
        .long   pp_fill
        .long   pp_take
        .long   0

| void pp_fill(unsigned slot, uint32_t frame, volatile uint16_t *in): the frame's low half and its complement.
        .global pp_fill
pp_fill:
        move.l  8(%sp),%d0
        movea.l 12(%sp),%a0
        move.w  %d0,(%a0)+
        not.l   %d0
        move.w  %d0,(%a0)
        rts

| void pp_take(unsigned slot, uint32_t frame, const volatile uint16_t *out): the DSP echoes in-block f into out-block f,
| so it must hold f's halfwords; good and bad are counted, the last bad frame kept.
        .global pp_take
pp_take:
        move.l  8(%sp),%d0
        movea.l 12(%sp),%a0
        moveq   #0,%d1
        move.w  (%a0)+,%d1
        cmp.w   %d0,%d1
        bne.s   1f
        not.l   %d0
        move.w  (%a0),%d1
        cmp.w   %d0,%d1
        bne.s   2f
        addq.l  #1,pp_good
        rts
2:      not.l   %d0
1:      addq.l  #1,pp_bad
        move.l  %d0,pp_last_bad
        rts

| module_tick: the counts in the base's diagnostics word (try prints it): good << 16 | bad, each saturating.
        .global pp_tick
pp_tick:
        movea.l 4(%sp),%a0
        move.l  pp_good,%d0
        cmpi.l  #0xffff,%d0
        bls.s   1f
        move.l  #0xffff,%d0
1:      swap    %d0
        clr.w   %d0
        move.l  pp_bad,%d1
        cmpi.l  #0xffff,%d1
        bls.s   2f
        move.l  #0xffff,%d1
2:      or.l    %d1,%d0
        move.l  %d0,(%a0)
        rts

        .data
        .align  4
        .global pp_good, pp_bad, pp_last_bad
pp_good:        .long 0
pp_bad:         .long 0
pp_last_bad:    .long 0
        .text

| int32_t pp_program(unsigned slot): FX2 slots (8-15) only, knob A of the track in this frame's record, / 16.
        .global pp_program
pp_program:
        move.l  4(%sp),%d1
        moveq   #-1,%d0
        subq.l  #8,%d1
        bcs.s   1f                      | FX1: none
        lsl.l   #6,%d1                  | the track's record
        move.l  FRAME,%d0
        andi.l  #1,%d0
        lsl.l   #8,%d0
        add.l   %d0,%d0                 | this frame's bank: 512 bytes a bank
        add.l   %d0,%d1
        lea     KNOB_A,%a0
        moveq   #0,%d0
        move.b  0(%a0,%d1.l),%d0
        lsr.l   #4,%d0
1:      rts

| uint32_t pp_code(unsigned slot, int32_t program, uint32_t at, uint32_t *out): its four words at P address at.
        .global pp_code
pp_code:
        move.l  8(%sp),%d1              | the program
        moveq   #0,%d0
        cmpi.l  #8,%d1
        bcc.s   1f                      | 8 or more (a negative too): none
        mulu.w  #500,%d1
        addi.l  #100,%d1                | the loop's count, at most 3,600 (DO takes 12 bits)
        move.l  %d1,%d0
        andi.l  #0xff,%d0
        lsl.l   #8,%d0
        lsr.l   #8,%d1
        or.l    %d1,%d0
        ori.l   #0x060080,%d0           | do #count: the count's low byte in bits 15-8, its high nibble in 3-0
        movea.l 16(%sp),%a0
        move.l  %d0,(%a0)+
        move.l  12(%sp),%d0
        addq.l  #2,%d0
        move.l  %d0,(%a0)+              | the loop's last instruction: the nop
        clr.l   (%a0)+                  | nop
        moveq   #12,%d0
        move.l  %d0,(%a0)               | rts
        moveq   #4,%d0
1:      rts
