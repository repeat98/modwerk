| SPDX-License-Identifier: MIT
| ARP KEY LOCKS: the two stock sites, to akl.s (compiled from akl.c). A card build reaches the entries through its
| detours (manifest.py); over USB the base's take events reach them (runtime.json, the records below). Either way an
| entry starts with every register and the stack as at the site. Stock addresses: OS 1.40C.

        .text
        .align  2

| 0x4009fb58 (ev_midi_note_key), the MIDI note sender, once per note: d7 the track, a2 the note byte. A held lock
| moves the note into its key and sends it as it is now (0x4009fb80, where stock drops a negative note); without
| one, stock's own six bytes run: KEY's root offset at -64(%fp), 0 for KEY OFF, and the correction at 0x4009fb5e.
        .globl  akl_note_entry
akl_note_entry:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  %a2,-(%sp)
        move.l  %d7,-(%sp)
        jsr     akl_note
        addq.l  #8,%sp
        tst.l   %d0                       | movem and lea keep the flags
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        bne.s   1f
        tst.l   -64(%fp)
        bgt.s   2f
1:      jmp     0x4009fb80
2:      jmp     0x4009fb5e

| 0x4007a2ec (ev_arp_setup_knob), the entry of MIDI ARP SETUP's encoder handler (encoder, delta), 4(%sp) and 8(%sp);
| d0-d1/a0-a1 are free there, as at any C call. akl_turn takes KEY (5), D (3) and E (4) while a trig is held in MIDI mode,
| returning to the caller; every other turn runs stock's handler from its first instruction, the two the site held.
        .globl  akl_knob_entry
akl_knob_entry:
        move.l  8(%sp),-(%sp)             | the delta
        move.l  8(%sp),-(%sp)             | the encoder, 4(%sp) at entry
        jsr     akl_turn
        addq.l  #8,%sp
        tst.l   %d0
        beq.s   3f
        rts
3:      lea     -36(%sp),%sp              | stock's own prologue, as the site held it
        movem.l %d2-%d7/%a2-%a4,(%sp)
        jmp     0x4007a2f4

| 0x4007a1ec (ev_arp_setup_text), MIDI ARP SETUP's drawer about to draw LEN or KEY: d3 the slot, d4 the track's
| byte, a3 the slot's descriptor, a2/d2 the place, d6 the surface; d0-d1/a0-a1 are free. KEY while a trig is held:
| the slot's own drawer with akl_key_text, then on at 0x4007a216 as stock is; anything else: the two instructions the
| site held, whose flags the branch after it reads.
        .globl  akl_text_entry
akl_text_entry:
        move.l  %d3,-(%sp)
        jsr     akl_text_claims
        addq.l  #4,%sp
        tst.l   %d0
        beq.s   6f
        move.l  48(%a3),%d0               | encoded unlike stock's own call (the packages' stock-free scan)
        movea.l %d0,%a0
        bne.s   5f
        movea.l #0x400479b4,%a0           | stock's drawer for a slot that names none
5:      move.l  %d6,-(%sp)
        pea     akl_key_text
        clr.l   -(%sp)
        moveq   #0,%d0
        move.b  %d4,%d0
        move.l  %d0,-(%sp)
        move.l  %d3,-(%sp)
        moveq   #29,%d0
        add.l   %d2,%d0
        move.l  %d0,-(%sp)
        pea     53(%a2)
        jsr     (%a0)
        lea     28(%sp),%sp
        jmp     0x4007a216
6:      movea.l 48(%a3),%a0
        tst.l   %a0
        jmp     0x4007a1f2

        .ifdef  MODWERK_EVENTS
| The take records (struct modwerk_take {claims, entry}): note keys are taken on the tracks a lock holds on, ARP
| SETUP's turns while a trig is held in MIDI mode; the entries hand anything else back to stock.
        .globl  akl_take_note_key
akl_take_note_key:
        .long   akl_claims, akl_note_entry
        .globl  akl_take_arp_knob
akl_take_arp_knob:
        .long   akl_knob_claims, akl_knob_entry
        .globl  akl_take_arp_text
akl_take_arp_text:
        .long   akl_text_claims, akl_text_entry
        .endif
