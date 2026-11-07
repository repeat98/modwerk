| SPDX-License-Identifier: GPL-3.0-or-later
| CC Remap for the Digitakt I, OS 1.54 on Core 2.1.
|
| Stock, CC 70-77 arriving on a MIDI track's own channel (MIDI CONFIG >
| CHANNELS > TRACK A-H CHANNEL) set that track's CC VAL 1-8. This module gives
| each MIDI track a table of eight receive numbers, one per VAL slot: a CC
| whose number is in the table reaches the stock code as that slot's 70-77, so
| a controller with fixed CC numbers drives the VAL knobs. Every slot starts at
| its stock number (VAL1 70 ... VAL8 77), so an untouched table is stock.
|
| The table is edited on a second layer of the MIDI track's AMP page (CC
| SELECT): pressing AMP on that page steps the stock page view to a second
| sub-page of the same page, titled CC RECEIVE, whose eight knobs read and
| write the table instead of SEL1-8. The table is not saved.

        .equ ALLOC,      0x400d412c     | malloc(size), behind operator new
        .equ FREE,       0x400d4332     | free(p), behind operator delete
        .equ STR_CTOR,   0x4017af20     | std::string(this, const char*, alloc&)
        .equ STR_COPY,   0x4017a616     | std::string(this, const string&): the replaced call
        .equ PATTERN,    0x421c9144     | the current pattern
        .equ MIDI_OFF,   0x59a          | its MIDI tracks' parameters, 0x70 bytes each
        .equ MIDI_SIZE,  0x70
        .equ PAGE_VT,    0x40183814     | the parameter page view's vtable
        .equ SEL_TITLE,  0x4197e2a4     | the CC SELECT page descriptor's title
        .equ V_SHOWN,    0x2c           | view: non-zero while it is on screen
        .equ V_PAGES,    124            | view: std::vector<int> of its sub-pages' page numbers
        .equ V_SUB,      144            | view: the sub-page shown
        .equ SEL1,       33             | SEL1-8: local parameter ids 33-40
        .equ VAL1_CC,    70             | the CC stock reads as VAL1

        .text

| ---------------- incoming CC (0x400d6c80, the per-track CC handler's entry) ----------------
| replaces "tst.l 20(sp); sne d0". (sp) our return, 4 the handler's return, 8 the
| track (0-7 audio, 8-15 MIDI A-H, 16 the auto channel), 12 the CC number, 16 the value.
        .balign 2
        .globl  ccm_in
ccm_in:
        move.l  8(%sp), %d0
        subq.l  #8, %d0
        moveq   #8, %d1
        cmp.l   %d1, %d0
        bcc.s   9f                      | not a MIDI track's own channel
        lsl.l   #3, %d0
        lea     ccm_rx, %a0
        adda.l  %d0, %a0
        move.l  12(%sp), %d1
        moveq   #0, %d0
1:      cmp.b   (%a0)+, %d1
        beq.s   2f
        addq.l  #1, %d0
        cmpi.l  #8, %d0
        bne.s   1b
        bra.s   9f
2:      addi.l  #VAL1_CC, %d0           | the slot's stock number
        move.l  %d0, 12(%sp)
9:      tst.l   24(%sp)
        sne     %d0
        rts

| ---------------- the slot a parameter access is for ----------------
| a0 the parameters it reads or writes, d2 the local id. -> a1 the table byte, or 0
| when the access is stock's: the CC RECEIVE sub-page is not on screen, or the
| access is not SEL1-8 of a MIDI track of the current pattern. Uses d0, d1.
ccm_slot:
        suba.l  %a1, %a1
        move.l  ccm_view, %d0
        beq.s   9f
        movea.l %d0, %a1
        move.l  V_SHOWN(%a1), %d0
        beq.s   8f
        moveq   #1, %d0
        cmp.l   V_SUB(%a1), %d0
        bne.s   8f
        move.l  %d2, %d1
        subi.l  #SEL1, %d1
        moveq   #8, %d0
        cmp.l   %d0, %d1
        bcc.s   8f
        move.l  PATTERN, %d0
        addi.l  #MIDI_OFF, %d0
        lea     ccm_rx, %a1
        adda.l  %d1, %a1
        moveq   #8, %d1
1:      cmpa.l  %d0, %a0
        beq.s   9f
        addi.l  #MIDI_SIZE, %d0
        addq.l  #8, %a1
        subq.l  #1, %d1
        bne.s   1b
8:      suba.l  %a1, %a1
9:      rts

| ---------------- parameter read (0x4000fe10) ----------------
| replaces "mvs.w (a0,d2.l*2),d0; bra.s 0x4000fe18"; the word is the value << 8.
        .balign 2
        .globl  ccm_get
ccm_get:
        bsr.s   ccm_slot
        move.l  %a1, %d0
        beq.s   1f
        moveq   #0, %d0
        move.b  (%a1), %d0
        lsl.l   #8, %d0
        bra.s   2f
1:      mvs.w   (0,%a0,%d2.l*2), %d0
2:      addq.l  #2, (%sp)               | past the replaced bra
        rts

| ---------------- parameter write (0x40010b62) ----------------
| replaces "move.w d4,(a0,d2.l*2); tst.b d5". On CC RECEIVE the table takes the value
| and Z is set, so the setter skips its pattern-edit step; its change notice still
| goes out and redraws the page.
        .balign 2
        .globl  ccm_set
ccm_set:
        bsr.s   ccm_slot
        move.l  %a1, %d0
        beq.s   1f
        move.l  %d4, %d0
        asr.l   #8, %d0
        move.b  %d0, (%a1)
        cmp.l   %d0, %d0
        rts
1:      move.w  %d4, (0,%a0,%d2.l*2)
        tst.b   %d5
        rts

| ---------------- page title (0x40030954, in the page view's getTitle) ----------------
| replaces "jsr STR_COPY" (the title from the page's descriptor); (sp) our return, 4 the
| string to make, 8 the descriptor's title; a2 the view. The first time the MIDI AMP view
| asks, its sub-page list grows from {n} to {n, n}, so the stock AMP key steps it.
        .balign 2
        .globl  ccm_title
ccm_title:
        move.l  (%a2), %d0
        cmpi.l  #PAGE_VT, %d0
        bne.w   8f
        move.l  8(%sp), %d0
        cmpi.l  #SEL_TITLE, %d0
        bne.w   8f                      | not the CC SELECT page
        movea.l V_PAGES(%a2), %a0
        move.l  V_PAGES+4(%a2), %d0
        sub.l   %a0, %d0
        moveq   #4, %d1
        cmp.l   %d1, %d0
        bne.s   5f                      | already grown
        pea     8.w
        jsr     ALLOC
        addq.l  #4, %sp
        tst.l   %d0
        beq.w   8f
        movea.l V_PAGES(%a2), %a1       | the old list: {its page number}
        movea.l %d0, %a0
        move.l  (%a1), %d1
        move.l  %d1, (%a0)
        move.l  %d1, 4(%a0)
        move.l  %a1, -(%sp)
        move.l  %a0, V_PAGES(%a2)
        addq.l  #8, %d0
        move.l  %d0, V_PAGES+4(%a2)
        move.l  %d0, V_PAGES+8(%a2)
        jsr     FREE
        addq.l  #4, %sp
        move.l  %a2, ccm_view
5:      cmpa.l  ccm_view, %a2
        bne.w   8f
        moveq   #1, %d0
        cmp.l   V_SUB(%a2), %d0
        bne.w   8f
        pea     ccm_alloc
        pea     ccm_name
        move.l  12(%sp), -(%sp)         | the string to make
        jsr     STR_CTOR
        lea     12(%sp), %sp
        rts
8:      jmp     STR_COPY

        .data
        .globl  ccm_rx
ccm_rx:                                 | per MIDI track A-H, the CC each VAL slot receives
        .rept   8
        .byte   70, 71, 72, 73, 74, 75, 76, 77
        .endr
ccm_name:
        .asciz  "CC Receive"

        .bss
        .balign 4
ccm_view:
        .skip   4                       | the MIDI AMP page view, once grown
ccm_alloc:
        .skip   4                       | the allocator argument STR_CTOR takes
