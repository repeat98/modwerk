| SPDX-License-Identifier: GPL-3.0-or-later
| CC Recall for the Digitakt mk1, OS 1.54.
|
| Stock, the MIDI tracks keep the CC values they last sent when a pattern
| is reloaded, changed or loaded with its project, or the sequencer stops:
| the new values go out only with each track's next trig, note or lock
| trig. Until then external gear, and the effects through FX CONTROL CH,
| keep the old values. With SETTINGS > CC RECALL ticked, each MIDI track
| sends its pattern's values at once, as its next trig would.
|
| The MIDI tracks' task learns of a new or reloaded pattern through two
| functions that store the pattern's address (0x400e0b04, which also marks
| every track for loading at its next trig, and 0x400e0b3a, which loads
| them at once), and, when the sequencer changes pattern while playing,
| through its own pattern record (0x400e126c, which marks every track); the
| three sites are those stores. The task's clock record
| (0x400e128c, about 30 times a second even when stopped) then loads one
| track and sends what the stock first trig sends, keeping the track's
| stock state so that trig still does its own.

        .equ STR_CTOR,   0x4017af20     | std::string(this, const char*, alloc&)
        .equ INVALIDATE, 0x400c9a3a     | View::invalidate(view)
        .equ BLIT,       0x400c2b88     | blit(dst, src, x, y, centre)
        .equ CHECKBOXES, 0x421f8a3c     | -> Bitmap[2], 0x1c each: empty, ticked
        .equ PATTERN,    0x421c9144     | the MIDI tracks' pattern
        .equ LOADED,     0x421c9148     | per track: its parameters, or 0 until its next trig
        .equ PARAMS,     0x421c9188     | per track, 106 bytes: the parameters in use
        .equ CLOCK_FLAG, 0x4020c668     | read by the instruction the tick site replaced
        .equ LOAD,       0x400e0918     | load(params, track)
        .equ ENABLED,    0x400e0966     | enabled(track, id)
        .equ CHANNEL,    0x400e09d8     | channel(track): 0-15, or -1 when CHAN is off
        .equ STORE,      0x400e1086     | store(channel, id, value): pitch bend, aftertouch
        .equ FORGET,     0x400e10d6     | forget(channel, id)
        .equ SEND,       0x400e0ddc     | send(track, channel, id, value, force)
        .equ FIRST_ID,   18             | the parameters the stock first trig sends
        .equ END_ID,     33

        .section .run, "ax"

| ---- 0x400e0b08, 0x400e0b56 and 0x400e126c: a pattern for the MIDI tracks --
| (6 bytes each). The first two are the calls a reload, STOP, a pattern change
| while stopped or a project load makes; the third is the MIDI task's own
| pattern record, which the sequencer sends when it changes pattern while
| playing (a cued pattern, a chain, song mode). Each replays the store it
| replaced and counts a new pattern.
        .balign 2
        .globl  ccr_mark
ccr_mark:
        addq.l  #1, ccr_gen
        move.l  (%a0), PATTERN          | the instruction this replaced
        rts

        .balign 2
        .globl  ccr_mark_loaded
ccr_mark_loaded:
        addq.l  #1, ccr_gen
        move.l  %d3, PATTERN            | the instruction this replaced
        rts

        .balign 2
        .globl  ccr_mark_record
ccr_mark_record:
        addq.l  #1, ccr_gen
        move.l  %d0, PATTERN            | the instruction this replaced
        rts

| ---- 0x400e128c: the MIDI tracks' clock record (6 bytes) --------------------
| One clock after a new pattern, then one MIDI track with CHAN on a clock,
| loads the track from the pattern and sends it as the stock first trig
| does. Ends with the replaced test, whose flags the next branch reads.
        .balign 2
        .globl  ccr_tick
ccr_tick:
        tst.b   ccr_on
        beq     9f
        move.l  ccr_gen, %d0
        cmp.l   ccr_seen, %d0
        beq.s   1f
        move.l  %d0, ccr_seen           | new: start with the next clock
        clr.l   ccr_next
        bra     9f
1:      moveq   #8, %d0
        cmp.l   ccr_next, %d0
        bls     9f                      | every track done
        lea     -60(%sp), %sp
        movem.l %d0-%d7/%a0-%a6, (%sp)
2:      move.l  ccr_next, %d2           | the track
        addq.l  #1, ccr_next
        lea     LOADED, %a2
        move.l  (%a2,%d2.l*4), %d6      | its stock state, restored below
        moveq   #112, %d1
        mulu.l  %d2, %d1
        add.l   PATTERN, %d1
        addi.l  #1434, %d1              | the track in the pattern
        move.l  %d2, -(%sp)
        move.l  %d1, -(%sp)
        jsr     LOAD
        addq.l  #8, %sp
        move.l  %d2, -(%sp)
        jsr     CHANNEL
        addq.l  #4, %sp
        move.l  %d0, %d3
        bmi     6f                      | CHAN off: nothing to send
        moveq   #106, %d7
        mulu.l  %d2, %d7
        lea     PARAMS, %a3
        adda.l  %d7, %a3
        moveq   #FIRST_ID, %d4
3:      move.l  %d4, -(%sp)
        move.l  %d2, -(%sp)
        jsr     ENABLED
        addq.l  #8, %sp
        move.l  %d4, %d5
        subi.l  #FIRST_ID, %d5          | 0-2: pitch bend and aftertouch
        tst.l   %d0
        bne.s   4f
        moveq   #2, %d1
        cmp.l   %d5, %d1
        bcs.s   5f
        move.l  %d4, -(%sp)
        move.l  %d3, -(%sp)
        jsr     FORGET
        addq.l  #8, %sp
        bra.s   5f
4:      move.l  %d4, %d1
        add.l   %d1, %d1
        mvs.w   (%a3,%d1.l), %d1        | the value just loaded
        moveq   #2, %d0
        cmp.l   %d5, %d0
        bcs.s   7f
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d3, -(%sp)
        jsr     STORE
        lea     12(%sp), %sp
        bra.s   5f
7:      pea     1.w                     | forced, as the first trig sends
        move.l  %d1, -(%sp)
        move.l  %d4, -(%sp)
        move.l  %d3, -(%sp)
        move.l  %d2, -(%sp)
        jsr     SEND
        lea     20(%sp), %sp
5:      addq.l  #1, %d4
        moveq   #END_ID, %d0
        cmp.l   %d4, %d0
        bne     3b
        move.l  %d6, (%a2,%d2.l*4)      | the next trig still loads and sends
        bra.s   8f                      | one track a clock
6:      move.l  %d6, (%a2,%d2.l*4)
        moveq   #8, %d0
        cmp.l   ccr_next, %d0
        bhi     2b                      | CHAN off: on to the next track
8:      movem.l (%sp), %d0-%d7/%a0-%a6
        lea     60(%sp), %sp
9:      tst.l   CLOCK_FLAG              | the instruction this replaced
        rts

| ---- ev_settings: the CC RECALL row -----------------------------------------
| A checkbox row like the stock ones: YES or RIGHT ticks it, YES or LEFT
| unticks it. Unticked (stock) at every power-on; not saved.
        .balign 2
        .globl  ccr_settings
ccr_settings:
        pea     ccr_row
        move.l  8(%sp), -(%sp)          | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

ccr_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     ccr_name
        move.l  %a0, %d2
        move.l  %a0, -(%sp)             | the string to build
        jsr     STR_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

ccr_select:
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2              | the menu
        tst.b   ccr_on
        bne.s   2f
1:      move.l  ccr_gen, %d0
        move.l  %d0, ccr_seen
        moveq   #8, %d0
        move.l  %d0, ccr_next           | nothing to send until a new pattern
        moveq   #1, %d0
        move.b  %d0, ccr_on
        bra.s   3f
2:      clr.b   ccr_on
3:      movea.l %d2, %a0
        lea     0x38(%a0), %a0
        move.l  (%sp)+, %d2
        move.l  %a0, 4(%sp)
        jmp     INVALIDATE              | redraw the menu

ccr_change:
        move.l  12(%sp), %d0            | delta
        beq     9f
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2
        tst.l   %d0
        bmi.s   2b                      | LEFT: untick
        tst.b   ccr_on
        beq.s   1b                      | RIGHT: tick
        bra.s   3b
9:      rts

ccr_draw:
        moveq   #0, %d0
        tst.b   ccr_on
        beq.s   1f
        moveq   #0x1c, %d0              | the ticked box
1:      add.l   CHECKBOXES, %d0
        move.l  12(%sp), %d1
        move.l  %d1, 4(%sp)
        move.l  %d0, 8(%sp)
        move.l  16(%sp), %d1
        move.l  %d1, 12(%sp)
        move.l  20(%sp), %d1
        move.l  %d1, 16(%sp)
        clr.l   20(%sp)
        jmp     BLIT

        .balign 4
ccr_row:    .long   ccr_label, ccr_select, ccr_draw, ccr_change
ccr_name:   .asciz  "CC RECALL"
        .balign 2

        .section .bss
        .balign 4
ccr_gen:    .skip 4             | new patterns counted by the sites
ccr_seen:   .skip 4             | the count the clock has started on
ccr_next:   .skip 4             | the next track to send, 8 when done
ccr_on:     .skip 2             | byte 0: CC RECALL is ticked
