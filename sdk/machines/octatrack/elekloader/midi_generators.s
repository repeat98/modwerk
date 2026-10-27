| SPDX-License-Identifier: MIT
| The sites of the MIDI generator registry (midi_generators.c, hooks.json ot_midi_generators): the base's, and a
| card build's generator module patches the same ones. Each replays its own instructions, never stock's bytes.
        .text
        .balign 2
        .global mg_tap_site, mg_page_site, mg_setup_site
| Double-tap TRACK (0x40083afc, 10 bytes): d2 is the tapped track, the current one. Stock asks for MIDI mode
| (0x40033970) and does nothing in it (0x40083b7e).
mg_tap_site:
        jsr 0x40033970
        tst.l %d0
        beq.s 1f
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %d2,-(%sp)
        jsr mg_track_tap
        addq.l #4,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x40083b7e
1:      jmp 0x40083b06
| The main page drawer's MIDI arm (0x4004e1ea, 10 bytes): 0x40031ee0(-1, its page argument) is the descriptor; a
| generator's page replaces it. Stock pops the two arguments at 0x4004e1f4.
mg_page_site:
        move.l 8(%fp),-(%sp)
        pea -1.w
        jsr 0x40031ee0
        lea -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l %d0,-(%sp)
        jsr mg_page
        addq.l #4,%sp
        movem.l (%sp),%d1/%a0-%a1
        lea 12(%sp),%sp
        jmp 0x4004e1f4
| The setup opener 0x40032228(page) in MIDI mode, page 2 (0x40032280, 8 bytes): ARP SETUP's open routine from its
| window record, then 0x400322ec calls it. The opener has no frame here, so rts returns to its caller.
mg_setup_site:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr mg_arp_setup
        tst.l %d0
        movem.l (%sp),%d0-%d1/%a0-%a1   | movem and lea keep the condition codes
        lea 16(%sp),%sp
        bne.s 1f
        move.l 0x400cfeda,%a1
        jmp 0x400322ec
1:      rts
| MIDI NOTE SETUP's drawer 0x40036548 (8 bytes): its displaced prologue, filled from the user's own OS (the base's
| modwerk_stock_ placeholders; a card build's StockCopy of the same span), then the rest of it.
        .global mg_stock_note_draw
mg_stock_note_draw:
        .globl modwerk_stock_40036548_8
modwerk_stock_40036548_8:
        .space 8
        jmp 0x40036550

| Input layers (stock's list at 0x460d165c: a pushed layer links last). Keys: code, then the press, release and
| repeat handlers; encoders A-F: the turn handler.
        .data
        .balign 4
        .global mg_list_layer, mg_page_layer
mg_list_layer:
        .long 0,mg_list_keys,0,0,0,-1,-1
mg_page_layer:
        .long 0,mg_page_keys,mg_page_encs,0,0,-1,-1
mg_list_keys:
        .irp k,0x33,0x20,0x31
        .byte \k,0
        .long mg_key,mg_key,mg_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
mg_page_keys:
        .irp k,0x31,0x32
        .byte \k,0
        .long mg_key,mg_key,mg_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
mg_page_encs:
        .irp k,0,1,2,3,4,5
        .byte \k,0
        .long mg_knob,0,0,0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .text
