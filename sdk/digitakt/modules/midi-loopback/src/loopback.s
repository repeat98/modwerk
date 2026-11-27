| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Loopback v1.6 for Digitakt mk1 (OS 1.53 and 1.54)
|
| Internal MIDI loopback: sequences and modulates audio tracks 1-8
| and Master FX from MIDI tracks 9-16 using parameter locks, CCs, and LFOs
| without external cables.
|
| Configurable via SETTINGS > MIDI LOOPBACK:
|   ON  (ticked): Messages sent on internal channels (FX control ch,
|                 audio tracks 1-8 channels, and Auto channel) are
|                 captured, kept off the physical MIDI OUT/USB wire,
|                 and fed directly into the Digitakt's internal MIDI input.
|   OFF (unticked, default): Stock behavior. All messages leave via MIDI OUT/USB.
|
| Messages to external channels (not assigned to internal tracks) always
| pass through to physical MIDI OUT / USB.

        .equ RING,       128            | messages in flight, power of two

        .section .run, "ax"

| ---- Hook at append_buf1(len, bytes) [CCs] --------------------------------
| 4(%sp) caller's return addr, 8(%sp) len, 12(%sp) bytes ptr.
        .balign 2
        .globl  loopback_out_cc
loopback_out_cc:
        tst.b   loopback_on
        beq     .Lstock_cc              | OFF: stock append

        move.l  8(%sp), %d0             | message length
        cmpi.l  #2, %d0
        blo     .Lstock_cc              | < 2 bytes: stock
        cmpi.l  #5, %d0
        bhi     .Lstock_cc              | > 5 bytes: stock

        movea.l 12(%sp), %a0            | a0 = pointer to MIDI bytes
        mvz.b   (%a0), %d0              | d0 = status byte
        move.l  %d0, %d1
        andi.l  #0xf0, %d1              | message type nibble
        cmpi.l  #0x80, %d1
        blo     .Lstock_cc              | < 0x80 (invalid status): stock
        cmpi.l  #0xf0, %d1
        bhs     .Lstock_cc              | >= 0xF0 (system realtime/sysex): stock

        moveq   #0x0f, %d1
        and.l   %d0, %d1                | d1 = channel (0-15)

| Check Auto Channel:
        cmp.l   AUTO_CH, %d1
        beq.s   .Ltake_cc

| Check FX Control Channel:
        cmp.l   FX_CH, %d1
        bne.s   .Lcheck_tracks_cc
        | Channel is FX_CH. If CC (0xB0), only loop back FX CCs:
        mvz.b   (%a0), %d0
        andi.l  #0xf0, %d0
        cmpi.l  #0xb0, %d0
        bne.s   .Ltake_cc               | non-CC on FX channel -> take
        mvz.b   1(%a0), %d0             | CC number
        cmpi.l  #127, %d0
        bhi     .Lstock_cc
        lea     fxt_ccs, %a1
        tst.b   (%a1,%d0.l)
        beq     .Lstock_cc              | not an FX CC -> stock
        bra.s   .Ltake_cc

.Lcheck_tracks_cc:
| Check Audio Tracks 1 to 8:
        lea     TRACK_CH, %a1
        moveq   #7, %d0                 | 8 tracks (0..7)
1:      cmp.l   (%a1)+, %d1
        beq.s   .Ltake_cc
        subq.l  #1, %d0
        bpl.s   1b
        bra     .Lstock_cc              | channel not internal -> stock out

.Ltake_cc:
        bsr     loopback_enqueue
        addq.l  #4, %sp                 | suppress outgoing from wire: return to caller
        rts

.Lstock_cc:
        mvz.b   OUT_LEN, %d1            | replay replaced instruction
        rts


| ---- Hook at append_buf2(len, bytes) [Notes / Triggers] -------------------
| 4(%sp) caller's return addr, 8(%sp) len, 12(%sp) bytes ptr.
        .balign 2
        .globl  loopback_out_note
loopback_out_note:
        tst.b   loopback_on
        beq     .Lstock_note            | OFF: stock append

        move.l  8(%sp), %d0             | message length
        cmpi.l  #2, %d0
        blo     .Lstock_note            | < 2 bytes: stock
        cmpi.l  #5, %d0
        bhi     .Lstock_note            | > 5 bytes: stock

        movea.l 12(%sp), %a0            | a0 = pointer to MIDI bytes
        mvz.b   (%a0), %d0              | d0 = status byte
        move.l  %d0, %d1
        andi.l  #0xf0, %d1              | message type nibble
        cmpi.l  #0x80, %d1
        blo     .Lstock_note            | < 0x80 (invalid status): stock
        cmpi.l  #0xf0, %d1
        bhs     .Lstock_note            | >= 0xF0 (system realtime/sysex): stock

        moveq   #0x0f, %d1
        and.l   %d0, %d1                | d1 = channel (0-15)

| Check Auto Channel:
        cmp.l   AUTO_CH, %d1
        beq.s   .Ltake_note

| Check FX Control Channel:
        cmp.l   FX_CH, %d1
        beq.s   .Ltake_note

| Check Audio Tracks 1 to 8:
        lea     TRACK_CH, %a1
        moveq   #7, %d0                 | 8 tracks (0..7)
1:      cmp.l   (%a1)+, %d1
        beq.s   .Ltake_note
        subq.l  #1, %d0
        bpl.s   1b
        bra     .Lstock_note            | channel not internal -> stock out

.Ltake_note:
        bsr     loopback_enqueue
        addq.l  #4, %sp                 | suppress outgoing from wire: return to caller
        rts

.Lstock_note:
        mvz.b   NOTE_OUT_LEN, %d1       | replay replaced instruction
        rts


| ---- Common Enqueue routine -----------------------------------------------
| Enqueues MIDI message in %a0 into loop_ring
        .balign 2
loopback_enqueue:
        move.l  IN_PORTS, %d1
        lea     DIN_QUEUE, %a1
        btst    #0, %d1
        bne.s   2f
        lea     USB_QUEUE, %a1
        btst    #1, %d1
        beq.s   8f                      | no input port active: drop
2:      move.l  loop_head, %d0
        move.l  %d0, %d1
        addq.l  #1, %d1
        andi.l  #RING-1, %d1
        cmp.l   loop_tail, %d1
        beq.s   8f                      | ring full: drop
        lsl.l   #4, %d0                 | 16 bytes per entry
        move.l  %a2, -(%sp)
        lea     loop_ring, %a2
        adda.l  %d0, %a2
        move.b  (%a0), 12(%a2)
        move.b  1(%a0), 13(%a2)
        move.b  2(%a0), 14(%a2)
        move.l  16(%sp), (%a2)          | len (from 8(%sp) at entry to hook)
        lea     12(%a2), %a0
        move.l  %a0, 4(%a2)             | pointer to data
        move.l  %a1, 8(%a2)             | target queue
        movea.l (%sp)+, %a2
        move.l  %d1, loop_head          | advance head
8:      rts


| ---- ev_render_out: flush queued messages to MIDI input task --------------
        .balign 2
        .globl  loopback_flush
loopback_flush:
        move.l  loop_tail, %d0
        cmp.l   loop_head, %d0
        beq.s   9f
        lea     -8(%sp), %sp
        movem.l %d2/%a2, (%sp)
        move.l  %d0, %d2
1:      move.l  %d2, %d0
        lsl.l   #4, %d0
        lea     loop_ring, %a2
        adda.l  %d0, %a2
        move.l  %a2, -(%sp)
        move.l  8(%a2), -(%sp)
        jsr     QUEUE_SEND
        addq.l  #8, %sp
        addq.l  #1, %d2
        moveq   #RING-1, %d0
        and.l   %d0, %d2
        move.l  %d2, loop_tail
        cmp.l   loop_head, %d2
        bne.s   1b
        pea     MIDI_SEM
        jsr     SEM_POST
        addq.l  #4, %sp
        movem.l (%sp), %d2/%a2
        lea     8(%sp), %sp
9:      rts

| ---- ev_settings: SETTINGS > MIDI LOOPBACK menu item ----------------------
        .balign 2
        .globl  loopback_settings
loopback_settings:
        pea     loop_row
        move.l  8(%sp), -(%sp)          | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

loop_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     loop_name
        move.l  %a0, %d2
        move.l  %a0, -(%sp)             | string to build
        jsr     STR_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

loop_select:
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2              | the menu
        tst.b   loopback_on
        bne.s   2f
1:      moveq   #1, %d0
        move.b  %d0, loopback_on
        bra.s   3f
2:      clr.b   loopback_on
3:      movea.l %d2, %a0
        lea     0x38(%a0), %a0
        move.l  (%sp)+, %d2
        move.l  %a0, 4(%sp)
        jmp     INVALIDATE              | redraw menu

loop_change:
        move.l  12(%sp), %d0            | delta (-1 left, +1 right)
        beq.s   9f
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2
        tst.l   %d0
        bpl.s   1b                      | RIGHT: turn ON
        bra.s   2b                      | LEFT: turn OFF
9:      rts

loop_draw:
        moveq   #0, %d0
        tst.b   loopback_on
        beq.s   1f
        moveq   #0x1c, %d0              | ticked box bitmap
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
loop_row:   .long   loop_label, loop_select, loop_draw, loop_change
loop_name:  .asciz  "MIDI LOOPBACK"

| Valid FX Control Channel CC numbers:
| Reverb 24-31, Delay 85-92, External Mixer 102-109, Compressor 111-119
fxt_ccs:
        .fill   24, 1, 0
        .fill   8, 1, 1                 | 24-31 reverb
        .fill   53, 1, 0
        .fill   8, 1, 1                 | 85-92 delay
        .fill   9, 1, 0
        .fill   8, 1, 1                 | 102-109 External Mixer
        .fill   1, 1, 0
        .fill   9, 1, 1                 | 111-119 compressor
        .fill   8, 1, 0
        .balign 2

        .section .bss
        .balign 4
loop_head:      .skip 4
loop_tail:      .skip 4
loop_ring:      .skip 16 * RING
loopback_on:    .skip 2
