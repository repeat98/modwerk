| SPDX-License-Identifier: GPL-3.0-or-later
| FX Track for the Digitakt mk1, OS 1.54.
|
| Stock, the Digitakt changes its delay, reverb, compressor and External
| Mixer settings when a control change arrives on MIDI CONFIG > CHANNELS >
| FX CONTROL CH, but a MIDI track's own control changes only leave by MIDI
| OUT and USB. With SETTINGS > FX TRACK ticked, a control change that a MIDI
| track sends on FX CONTROL CH for one of those settings is handed to the
| Digitakt's own MIDI task instead, as if it had come in through the input
| that PORT CONFIG > INPUT FROM takes, and is not sent out. A MIDI track on
| that channel becomes an effects track: its CC VAL knobs, parameter locks
| and LFO play the effects through the sequencer.
|
| The MIDI tracks build every control change in one buffer through one
| function (0x400e0dac); the site is its first instruction. Taken messages
| wait in a ring until the next audio block posts them.

        .equ STR_CTOR,   0x4017af20     | std::string(this, const char*, alloc&)
        .equ INVALIDATE, 0x400c9a3a     | View::invalidate(view)
        .equ BLIT,       0x400c2b88     | blit(dst, src, x, y, centre)
        .equ CHECKBOXES, 0x421f8a3c     | -> Bitmap[2], 0x1c each: empty, ticked
        .equ FX_CH,      0x4197c740     | FX CONTROL CH: 0-15, or -1 for OFF
        .equ IN_PORTS,   0x4197c754     | INPUT FROM: bit 0 MIDI, bit 1 USB
        .equ DIN_QUEUE,  0x421a9d7c     | the MIDI task's messages from MIDI IN
        .equ USB_QUEUE,  0x421a9d5c     | the MIDI task's messages from USB
        .equ MIDI_SEM,   0x421a9d34     | wakes the MIDI task
        .equ QUEUE_SEND, 0x40001b7a     | queue_send(queue, item); masks interrupts
        .equ SEM_POST,   0x40001840     | sem_post(sem)
        .equ OUT_LEN,    0x421b6a21     | bytes in the MIDI tracks' buffer
        .equ RING,       128            | messages in flight, a power of two

        .section .run, "ax"

| ---- 0x400e0dac: add a message to the MIDI tracks' buffer (6 bytes) --------
| append(len, bytes), called from the MIDI tracks' task. 4(%sp) is the
| caller's return address, 8(%sp) len, 12(%sp) the bytes. A message that is
| taken returns straight to the caller, unsent; any other replays the
| instruction this replaced and carries on into the stock function.
        .balign 2
        .globl  fxt_out
fxt_out:
        tst.b   fxt_on
        beq     9f
        moveq   #3, %d0
        cmp.l   8(%sp), %d0
        bne     9f
        movea.l 12(%sp), %a0
        mvz.b   (%a0), %d0              | status
        move.l  %d0, %d1
        andi.l  #0xf0, %d1
        cmpi.l  #0xb0, %d1
        bne     9f                      | not a control change
        moveq   #0x0f, %d1
        and.l   %d0, %d1
        cmp.l   FX_CH, %d1
        bne     9f                      | another channel, or FX CONTROL CH OFF
        mvz.b   1(%a0), %d0             | controller
        cmpi.l  #127, %d0
        bhi     9f
        lea     fxt_ccs, %a1
        tst.b   (%a1,%d0.l)
        beq     9f                      | not an effects setting: sent as stock
        move.l  IN_PORTS, %d1
        lea     DIN_QUEUE, %a1
        btst    #0, %d1
        bne.s   1f
        lea     USB_QUEUE, %a1
        btst    #1, %d1
        beq     8f                      | no input taken: dropped, like any input
1:      move.l  fxt_head, %d0
        move.l  %d0, %d1
        addq.l  #1, %d1
        andi.l  #RING-1, %d1
        cmp.l   fxt_tail, %d1
        beq.s   8f                      | ring full: dropped
        lsl.l   #4, %d0                 | 16 bytes an entry
        move.l  %a2, -(%sp)
        lea     fxt_ring, %a2
        adda.l  %d0, %a2
        move.b  (%a0), 12(%a2)
        move.b  1(%a0), 13(%a2)
        move.b  2(%a0), 14(%a2)
        moveq   #3, %d0
        move.l  %d0, (%a2)              | length, pointer: as the MIDI parser posts
        lea     12(%a2), %a0
        move.l  %a0, 4(%a2)
        move.l  %a1, 8(%a2)             | the queue
        movea.l (%sp)+, %a2
        move.l  %d1, fxt_head           | published once complete
8:      addq.l  #4, %sp                 | to append's caller: the message is not sent
        rts
9:      mvz.b   OUT_LEN, %d1            | the instruction this replaced
        rts

| ---- ev_render_out: hand the taken messages to the MIDI task ---------------
| From the audio interrupt, as the MIDI input's interrupt posts what it
| parses: posting them from the MIDI tracks' own context stalled the panel
| in the emulator. At most one audio block (about 0.7 ms) late.
        .balign 2
        .globl  fxt_flush
fxt_flush:
        move.l  fxt_tail, %d0
        cmp.l   fxt_head, %d0
        beq.s   9f
        lea     -8(%sp), %sp
        movem.l %d2/%a2, (%sp)
        move.l  %d0, %d2
1:      move.l  %d2, %d0
        lsl.l   #4, %d0
        lea     fxt_ring, %a2
        adda.l  %d0, %a2
        move.l  %a2, -(%sp)
        move.l  8(%a2), -(%sp)
        jsr     QUEUE_SEND
        addq.l  #8, %sp
        addq.l  #1, %d2
        moveq   #RING-1, %d0
        and.l   %d0, %d2
        move.l  %d2, fxt_tail
        cmp.l   fxt_head, %d2
        bne.s   1b
        pea     MIDI_SEM
        jsr     SEM_POST
        addq.l  #4, %sp
        movem.l (%sp), %d2/%a2
        lea     8(%sp), %sp
9:      rts

| ---- ev_settings: the FX TRACK row -----------------------------------------
| A checkbox row like the stock ones: YES or RIGHT ticks it, YES or LEFT
| unticks it. Unticked (stock) at every power-on; not saved.
        .balign 2
        .globl  fxt_settings
fxt_settings:
        pea     fxt_row
        move.l  8(%sp), -(%sp)          | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

fxt_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     fxt_name
        move.l  %a0, %d2
        move.l  %a0, -(%sp)             | the string to build
        jsr     STR_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

fxt_select:
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2              | the menu
        tst.b   fxt_on
        bne.s   2f
1:      moveq   #1, %d0
        move.b  %d0, fxt_on
        bra.s   3f
2:      clr.b   fxt_on
3:      movea.l %d2, %a0
        lea     0x38(%a0), %a0
        move.l  (%sp)+, %d2
        move.l  %a0, 4(%sp)
        jmp     INVALIDATE              | redraw the menu

fxt_change:
        move.l  12(%sp), %d0            | delta
        beq     9f
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  (%a0), %d2
        tst.l   %d0
        bpl.s   1b                      | RIGHT: tick
        bra.s   2b                      | LEFT: untick
9:      rts

fxt_draw:
        moveq   #0, %d0
        tst.b   fxt_on
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
fxt_row:    .long   fxt_label, fxt_select, fxt_draw, fxt_change
fxt_name:   .asciz  "FX TRACK"

| The controllers FX CONTROL CH answers on OS 1.54 (measured in the
| emulator): reverb 24-31, delay 85-92, External Mixer 102-109 and
| compressor 111-119. Every other controller, All Sound Off (120) among
| them, still goes out as stock.
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
fxt_head:   .skip 4             | the next entry fxt_out fills
fxt_tail:   .skip 4             | the next entry fxt_flush posts
fxt_ring:   .skip 16 * RING     | taken messages: length, pointer, queue, bytes
fxt_on:     .skip 2             | byte 0: FX TRACK is ticked
