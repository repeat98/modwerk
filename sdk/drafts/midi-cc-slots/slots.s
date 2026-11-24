| SPDX-License-Identifier: MIT
| Experimental stock-1.40C dispatch adapters; emulator research only.
        .text
        .global slot_dispatch, slot_assignment, slot_format, slot_sequence_pb, slot_sequence_at
        .global slot_setup_press, slot_setup_clamp
slot_dispatch:
        movel %a3,%d0
        andil #255,%d0
        subil #18,%d0
        cmpil #1,%d0
        bhi.w stock_dispatch
        movel %d7,%d1
        lsll #6,%d1
        moveal %d1,%a0
        lea %a0@(0,%d7:l:4),%a0
        addal %d0,%a0
        addal #0x46c76df2,%a0
        clrl %d1
        moveb %a0@,%d1
        beq.w stock_dispatch
        cmpil #128,%d1
        bhi.w stock_dispatch
        movel %a3,%d2
        andil #255,%d2
        movel #20,%d5
        jmp 0x4009f0c8
stock_dispatch:
        .incbin "dispatch.private.bin"
        jmp 0x4009ef66

slot_assignment:
        cmpil #20,%d2
        bge.s assignment_stock
        subql #1,%d0
        moveal %d0,%a5
assignment_stock:
        .incbin "assignment.private.bin"
        jmp 0x4009f104

| Sequencer enters after stock enable/channel checks. Reuse the CC sender's
| own cache, with the resolved lock/LFO value supplied by the sequencer.
        .macro sequence_slot name, offset, parameter, value, replay, resume, next
\name:
        movel %d7,%d0
        lsll #6,%d0
        moveal %d0,%a0
        lea %a0@(0,%d7:l:4),%a0
        addal #0x46c76df2+\offset,%a0
        clrl %d0
        moveb %a0@,%d0
        beq.s 1f
        cmpil #128,%d0
        bhi.s 1f
        clrl %d0
        moveb %a5@(\value),%d0
        clrl %sp@-
        movel %d0,%sp@-
        pea \parameter
        movel %d7,%sp@-
        jsr 0x4009eec8
        lea %sp@(16),%sp
        jmp \next
1:
        .incbin "\replay"
        jmp \resume
        .endm
        sequence_slot slot_sequence_pb, 0, 18, 562, sequence_pb.private.bin, 0x4009fd8a, 0x4009fde2
        sequence_slot slot_sequence_at, 1, 19, 563, sequence_at.private.bin, 0x4009fdfe, 0x4009fe4e

| CTRL 1 SETUP delivers a key code and down/up event. Toggle only a clean
| encoder A/B release; stock's turn-while-held guard must remain effective.
slot_setup_press:
        movel %sp@(4),%d0
        subil #56,%d0
        cmpil #1,%d0
        bhi.s setup_press_stock
        tstl %sp@(8)
        bne.s setup_press_stock
        tstl 0x46c7d32c
        bne.s setup_press_stock
        lea 0x460d5ce0,%a0
        lea %a0@(0,%d0:l:4),%a0
        tstl %a0@
        beq.s setup_press_cc
        clrl %a0@
        bra.s setup_press_stock
setup_press_cc:
        movel #1,%a0@
setup_press_stock:
        .incbin "setup_press.private.bin"
        jmp 0x4003fc4c

| A/B rotation selects a CC only after a click has enabled CC mode.
| Keep encoded 1 (CC0) as the lower bound; 0 is reserved for a mode click.
slot_setup_clamp:
        cmpal #2,%a2
        bge.s setup_clamp_stock
        tstl %d2
        beq.s setup_clamp_native
        tstl %d0
        bgt.s setup_clamp_stock
        moveq #1,%d0
        bra.s setup_clamp_stock
setup_clamp_native:
        clrl %d0
setup_clamp_stock:
        .incbin "setup_clamp.private.bin"
        jmp 0x4003a894

| SETUP formatter ABI: (char *destination, unsigned encoded_assignment).
slot_format:
        movel %sp@(8),%d0
        beq.s format_stock
        subql #1,%d0
        movel %d0,%sp@-
        pea format_number
        movel %sp@(12),%sp@-
        jsr 0x40013a08
        lea %sp@(12),%sp
        rts
format_stock:
        pea format_native
        movel %sp@(8),%sp@-
        jsr 0x40013a08
        addql #8,%sp
        rts
format_number: .asciz "%d"
format_native: .asciz "STK"
        .align 2

| The page renderer has selected its label and computed the centered text
| coordinates. Only the two stock MIDI CONTROL descriptors are ours. Render
| a short assignment label using the same fonts, alignment and surface;
| every other page follows the displaced stock push and continuation.
        .global slot_label
slot_label:
        lea %sp@(-28),%sp
        moveml %d0-%d1/%a0-%a1,%sp@
        moveal %fp@(-80),%a0
        movel %a4,%d1
        cmpil #5,%d1
        bhi.w label_stock
        cmpal #0x400d42f4,%a0
        beq.s label_page
        cmpal #0x400d4486,%a0
        bne.w label_stock
label_page:
        movel %d1,%d0
        addl %d1,%d0
        addl %d1,%d0
        addl %d0,%d0
        lea %a0@(22,%d0:l),%a1
        cmpal %fp@(-56),%a1
        bne.w label_stock
label_main:
        cmpal #0x400d4486,%a0
        bne.s label_track
        addql #6,%d1
label_track:
        clrl %d0
        moveb 0x100b14cc,%d0
        cmpil #7,%d0
        bhi.w label_stock
        moveal %d0,%a0
        lsll #6,%d0
        lea %a0@(0,%d0:l),%a1
        | track * 68 = track * 64 + track * 4
        addal %a0,%a1
        addal %a0,%a1
        addal %a0,%a1
        addal %d1,%a1
        addal #0x46c76df2,%a1
        clrl %d0
        moveb %a1@,%d0
        cmpil #2,%d1
        bge.s label_cc
        tstl %d0
        beq.w label_stock
        cmpil #128,%d0
        bhi.w label_stock
        subql #1,%d0
label_cc:
        cmpil #127,%d0
        bhi.w label_stock
label_number:
        lea %sp@(16),%a0
        movel %d0,%sp@-
        pea format_number
        movel %a0,%sp@-
        jsr 0x40013a08
        lea %sp@(12),%sp
label_draw:
        lea %sp@(16),%a0
        movel %a0,%sp@-
        pea 0x400b451d
        clrl %sp@-
        pea 1
        movel %sp@(16),%sp@-
        movel %sp@(28),%sp@-
        pea 0x400bf10a
        pea 0x400ba876
        jsr 0x40013904
        lea %sp@(32),%sp
        moveml %sp@,%d0-%d1/%a0-%a1
        lea %sp@(28),%sp
        jmp 0x4004e4a6
label_stock:
        moveml %sp@,%d0-%d1/%a0-%a1
        lea %sp@(28),%sp
        movel %fp@(-56),%sp@-
        jmp 0x4004e480

| CTRL 1 SETUP draws each caption after the staged value. Keep native PB/AT
| captions, and use CC while mapped: at most two glyphs, fully inside the
| stock selection rectangle. Other four captions keep their original text.
        .global slot_setup_label
slot_setup_label:
        cmpil #1,%d4
        bhi.s setup_label_stock
        tstl %d6
        beq.s setup_label_stock
        cmpil #128,%d6
        bhi.s setup_label_stock
        pea label_cc_text
        bra.s setup_label_format
setup_label_stock:
        movel %sp@(52),%sp@-
setup_label_format:
        pea 0x400b37cf
        jmp 0x4003fbce
label_cc_text: .asciz "CC"
        .align 2
