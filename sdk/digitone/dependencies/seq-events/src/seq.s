| SPDX-License-Identifier: GPL-2.0-or-later
| seq-events (Digitone mk1): the step fires' sites (1.43: the audio tracks'
| fire at 0x400944fe, the MIDI tracks' at 0x400948a0; 1.44 0x20 further on,
| the same code), offered to other mods as the events in
| elekloader/sdk/include/digitone-mk1/seq.h (seq.c). Each jsr site covers
| whole stock instructions; its routine does the displaced work and changes
| only what those instructions change, saving the C calls' scratch registers
| (d0-d1/a0-a1) where the stock code still needs them. The C calls no
| firmware: interrupt level. Addresses in the comments are 1.43's.
| The audio tracks' fire (the synth tracks): d4 = track, d3 = step, a3 = the pattern's tracks, d5 = 976 *
| track. MIDI fire: d4 = track (4..7; t - 4 from its velocity on), d2 =
| step, a2 = the pattern's tracks, d5 = 976 * track. Inside a routine the
| fire's frame is 4 bytes further away (the return address).

        .section .run, "ax"

| ---- the step read (ev_fire_step; the step clock) -----------------------

| 0x40094512, 8 bytes over `move.l 96(sp),d4; move.l 108(sp),d3`: the fire
| loads its track and step once, and everything after reads the step in d3.
| d0 (an offset) and d1 (1) are live.
        .globl  sq_site_sread
sq_site_sread:
        move.l  100(%sp), %d4
        move.l  112(%sp), %d3
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %a3, -(%sp)             | pattern_t
        move.l  %d3, -(%sp)             | the real step
        move.l  %d4, -(%sp)             | track
        jsr     sq_on_step              | -> the step to read
        lea     12(%sp), %sp
        move.l  %d0, %d3
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        rts

| 0x400948b4 (MIDI), the same over `move.l 96(sp),d4; move.l 108(sp),d2`
        .globl  sq_site_mread
sq_site_mread:
        move.l  100(%sp), %d4
        move.l  112(%sp), %d2
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %a2, -(%sp)
        move.l  %d2, -(%sp)
        move.l  %d4, -(%sp)
        jsr     sq_on_step
        lea     12(%sp), %sp
        move.l  %d0, %d2
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        rts

| ---- the step word (ev_gen_trig, ev_fire_trig) --------------------------

| d0 = a step word, d1 = 1 on the first read of a step, 0 on the second;
| 4(sp) = the step, 8(sp) = the track (pushed by the caller).
| Out: d0, the word as sq_on_trig decides. Keeps all but d0.
apply:
        lea     -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        move.l  %d0, -(%sp)             | word
        move.l  %d1, -(%sp)             | first
        move.l  24(%sp), -(%sp)         | step
        move.l  32(%sp), -(%sp)         | track
        jsr     sq_on_trig
        lea     16(%sp), %sp
        movem.l (%sp), %d1/%a0-%a1
        lea     12(%sp), %sp
        rts

| 0x40094560, over `move.w (a3,d0.l*2),d0; and.l d0,d1` (d1 = 3 on entry):
| the trig test's read of the step word.
        .globl  sq_site_gate
sq_site_gate:
        move.w  (%a3,%d0.l*2), %d0
        move.l  %d4, -(%sp)
        move.l  %d3, -(%sp)
        moveq   #1, %d1
        bsr     apply
        addq.l  #8, %sp
        moveq   #3, %d1
        and.l   %d0, %d1
        rts

| 0x400945d2, over `add.l d3,d2; move.w (a3,d2.l*2),d2`: the fire path's
| second read of the same word.
        .globl  sq_site_word
sq_site_word:
        add.l   %d3, %d2
        move.w  (%a3,%d2.l*2), %d2
        lea     -8(%sp), %sp
        movem.l %d0-%d1, (%sp)
        move.l  %d4, -(%sp)
        move.l  %d3, -(%sp)
        move.l  %d2, %d0
        moveq   #0, %d1
        bsr     apply
        addq.l  #8, %sp
        move.l  %d0, %d2
        movem.l (%sp), %d0-%d1
        lea     8(%sp), %sp
        rts

| 0x40094906 (MIDI), over `move.w (a2,d0.l*2),d0; and.l d0,d1` (d1 = 3)
        .globl  sq_site_mgate
sq_site_mgate:
        move.w  (%a2,%d0.l*2), %d0
        move.l  %d4, -(%sp)
        move.l  %d2, -(%sp)
        moveq   #1, %d1
        bsr     apply
        addq.l  #8, %sp
        moveq   #3, %d1
        and.l   %d0, %d1
        rts

| 0x4009497c (MIDI), over `add.l d2,d0; move.w (a2,d0.l*2),d0`
        .globl  sq_site_mword
sq_site_mword:
        add.l   %d2, %d0
        move.w  (%a2,%d0.l*2), %d0
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d2, -(%sp)
        moveq   #0, %d1
        bsr     apply
        addq.l  #8, %sp
        move.l  (%sp)+, %d1
        rts

| ---- trig conditions and probability (ev_fire_cond) ---------------------

| d0 = the condition call's answer (0 passes), d1 = the step, 4(sp) = the
| track (pushed by the caller). Out: d0 as sq_on_cond decides. Keeps all but d0.
cond:
        lea     -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        move.l  %d0, -(%sp)             | the answer
        move.l  %d1, -(%sp)             | step
        move.l  24(%sp), -(%sp)         | track
        jsr     sq_on_cond
        lea     12(%sp), %sp
        movem.l (%sp), %d1/%a0-%a1
        lea     12(%sp), %sp
        rts

| 0x400945b4, over `lea 16(sp),sp; tst.l d0` (after the trig condition's
| call 0x400fdab4; the branches after it read the flags; d0 is dead after)
        .globl  sq_site_scond
sq_site_scond:
        move.l  (%sp), 16(%sp)          | our return, over the call's last argument
        lea     16(%sp), %sp
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d3, %d1
        bsr     cond
        addq.l  #4, %sp
        move.l  (%sp)+, %d1
        tst.l   %d0
        rts

| 0x4009495a (MIDI), the same instructions
        .globl  sq_site_mcond
sq_site_mcond:
        move.l  (%sp), 16(%sp)
        lea     16(%sp), %sp
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d2, %d1
        bsr     cond
        addq.l  #4, %sp
        move.l  (%sp)+, %d1
        tst.l   %d0
        rts

| d1 = a probability (track_t + 0x3c8), d0 = the step, 4(sp) = the track.
| Out: d1, the probability 0x400fda6c is asked with (sq_on_prob). Keeps all
| but d1.
prob:
        lea     -12(%sp), %sp
        movem.l %d0/%a0-%a1, (%sp)
        move.l  %d1, -(%sp)             | probability
        move.l  %d0, -(%sp)             | step
        move.l  24(%sp), -(%sp)         | track
        jsr     sq_on_prob
        lea     12(%sp), %sp
        move.l  %d0, %d1
        movem.l (%sp), %d0/%a0-%a1
        lea     12(%sp), %sp
        rts

| 0x400945be, over `mvs.b 968(a0),d1; move.l d1,-(sp)` (a0 = track_t: the
| argument of 0x400fda6c). The push lands under our return: the return is
| copied down and the argument written where it was.
        .globl  sq_site_sprob
sq_site_sprob:
        mvs.b   968(%a0), %d1
        move.l  (%sp), -(%sp)           | our return, once more
        move.l  %d0, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d3, %d0
        bsr     prob
        addq.l  #4, %sp
        move.l  (%sp)+, %d0
        move.l  %d1, 4(%sp)             | the argument
        rts

| 0x40094964 (MIDI), over `mvs.b 968(a0),d0; move.l d0,-(sp)`
        .globl  sq_site_mprob
sq_site_mprob:
        mvs.b   968(%a0), %d0
        move.l  (%sp), -(%sp)
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d0, %d1
        move.l  %d2, %d0
        bsr     prob
        addq.l  #4, %sp
        move.l  %d1, %d0
        move.l  (%sp)+, %d1
        move.l  %d0, 4(%sp)
        rts

| ---- notes (ev_gen_notes, ev_fire_notes) --------------------------------

| 0x400945fe, over `lea (a3,d0.l),a1; clr.l d0` (d0 = 976t + 8*step; the
| loop after it reads the step's notes at a1 + 0x1c0 + i, i = 0..7). d0,
| d1, a0 are free here; d2 = the step word.
        .globl  sq_site_notes
sq_site_notes:
        lea     (%a3,%d0.l), %a1
        move.l  %a1, -(%sp)
        pea     (%a3,%d5.l)             | track_t
        move.l  %d2, -(%sp)             | the word as fired
        move.l  %d3, -(%sp)             | step
        move.l  %d4, -(%sp)             | track
        jsr     sq_on_notes             | -> an 8-note list, or 0
        lea     16(%sp), %sp
        move.l  (%sp)+, %a1
        tst.l   %d0
        beq.s   9f
        move.l  %d0, %a1
        lea     -0x1c0(%a1), %a1        | the loop reads a1 + 0x1c0 + i
9:      clr.l   %d0
        rts

| 0x400949a4 (MIDI), over `lea (a2,d0.l),a4; clr.l d0` (the loop reads
| a4 + 0x1c0 + i); d1, a0, a1 are free here; d3 = the step word.
        .globl  sq_site_mnotes
sq_site_mnotes:
        lea     (%a2,%d0.l), %a4
        pea     (%a2,%d5.l)             | track_t
        move.l  %d3, -(%sp)
        move.l  %d2, -(%sp)
        move.l  %d4, -(%sp)
        jsr     sq_on_notes
        lea     16(%sp), %sp
        tst.l   %d0
        beq.s   9f
        move.l  %d0, %a4
        lea     -0x1c0(%a4), %a4
9:      clr.l   %d0
        rts

| ---- velocity (ev_fire_vel) ---------------------------------------------

| 0x400947ea, over `move.l 48(sp),d0; moveq #1,d1` (the velocity, shifted
| into the event after); the target of the note-copy loop's exit too.
        .globl  sq_site_svel
sq_site_svel:
        lea     -8(%sp), %sp
        movem.l %a0-%a1, (%sp)
        move.l  60(%sp), -(%sp)         | the velocity (the fire's 48(sp))
        move.l  %d3, -(%sp)
        move.l  %d4, -(%sp)
        jsr     sq_on_vel
        lea     12(%sp), %sp
        movem.l (%sp), %a0-%a1
        lea     8(%sp), %sp
        moveq   #1, %d1
        rts

| 0x40094ba2 (MIDI), over `move.l 52(sp),d1; move.l a3,d0`; d4 = t - 4 here
        .globl  sq_site_mvel
sq_site_mvel:
        lea     -8(%sp), %sp
        movem.l %a0-%a1, (%sp)
        move.l  64(%sp), -(%sp)         | the velocity (the fire's 52(sp))
        move.l  %d2, -(%sp)
        move.l  %d4, %d0
        addq.l  #4, %d0
        move.l  %d0, -(%sp)
        jsr     sq_on_vel
        lea     12(%sp), %sp
        move.l  %d0, %d1
        movem.l (%sp), %a0-%a1
        lea     8(%sp), %sp
        move.l  %a3, %d0
        rts

| ---- locks (ev_fire_locks) ----------------------------------------------

| 0x400947ae, over `move.l #1500,d0` (after the step's lock resolve, and the
| target of the branch that skips it when d5, the event's lock list, is 0)
        .globl  sq_site_slocks
sq_site_slocks:
        lea     -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        move.l  %d5, -(%sp)             | the lock list, or 0
        move.l  %d3, -(%sp)
        move.l  %d4, -(%sp)
        jsr     sq_on_locks
        lea     12(%sp), %sp
        movem.l (%sp), %d1/%a0-%a1
        lea     12(%sp), %sp
        move.l  #1500, %d0
        rts
