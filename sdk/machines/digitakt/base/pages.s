| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Digitakt mk1 base: the SRC and LFO page sites (base.json) for the added machines that
| describe their own page (pages.c). As in machines.s, each entry re-authors the stock instructions its
| site displaces and continues where stock would (the build's defsym).
        .section .run, "ax"

| Site 1, layout(machine): a page's layout, else stock's.
        .globl mw_layout
mw_layout:
        move.l 4(%sp), -(%sp)
        jsr mw_page_layout
        addq.l #4, %sp
        tst.l %d0
        beq.s 1f
        movea.l %d0, %a0
        rts
1:      moveq #3, %d1
        move.l 4(%sp), %d0
        jmp MW_LAYOUT_ON

| The stock layout of stock machine 0-3, past the hook, so the current page stays.
        .globl mw_stock_layout
mw_stock_layout:
        moveq #3, %d1
        move.l 4(%sp), %d0
        jmp MW_LAYOUT_ON

| Sites 2 and 3, label(obj, id): a knob's own text, else stock's with its id compare.
        .macro label name, which, on
        .globl \name
\name:
        move.l 8(%sp), -(%sp)
        pea \which
        jsr mw_page_label
        addq.l #8, %sp
        tst.l %d0
        beq.s 1f
        movea.l %d0, %a0
        rts
1:      move.l 8(%sp), %d1
        cmpi.l #164, %d1
        jmp \on
        .endm
        label mw_label_short, 0, MW_LABEL_SHORT_ON
        label mw_label_long, 1, MW_LABEL_LONG_ON

| Site 4, value_text(obj, id, value, buf): returns buf when the machine wrote it.
        .globl mw_value_text
mw_value_text:
        move.l 16(%sp), -(%sp)
        move.l 16(%sp), -(%sp)
        move.l 16(%sp), -(%sp)
        jsr mw_page_value_text
        lea 12(%sp), %sp
        tst.l %d0
        beq.s 1f
        move.l 16(%sp), %d0
        movea.l %d0, %a0
        rts
1:      lea -20(%sp), %sp
        movem.l %d2-%d4/%a2-%a3, (%sp)
        jmp MW_VALUE_TEXT_ON

| Site 5, knob_gfx(obj, id, value, flag, -, bmp, x, y): the machine's own graphic, else stock's with
| the arguments mw_page_knob_gfx left.
        .globl mw_knob_gfx
mw_knob_gfx:
        pea 4(%sp)
        jsr mw_page_knob_gfx
        addq.l #4, %sp
        tst.l %d0
        beq.s 1f
        rts
1:      lea -20(%sp), %sp
        movem.l %d2-%d6, (%sp)
        jmp MW_KNOB_GFX_ON

| Site 6, ui_record(id): with the id a knob borrows.
        .globl mw_ui_record
mw_ui_record:
        move.l 4(%sp), -(%sp)
        jsr mw_page_look
        addq.l #4, %sp
        move.l %d0, %d1
        cmpi.l #164, %d1
        jmp MW_UI_RECORD_ON

| Site 7, popup_text(id, value).
        .globl mw_popup
mw_popup:
        move.l 8(%sp), -(%sp)
        move.l 8(%sp), -(%sp)
        jsr mw_page_popup
        addq.l #8, %sp
        tst.l %d0
        beq.s 1f
        movea.l %d0, %a0
        rts
1:      move.l 4(%sp), %d1
        cmpi.l #164, %d1
        jmp MW_POPUP_ON

| Sites 8-10, calls to range(id) (a0 = result, a2 = the parameter object): stock's, then the page's.
        .globl mw_range
mw_range:
        move.l %a0, -(%sp)
        move.l 8(%sp), -(%sp)
        jsr MW_RANGE
        addq.l #4, %sp
        move.l (%sp), -(%sp)
        move.l 12(%sp), -(%sp)
        move.l %a2, -(%sp)
        jsr mw_page_range
        lea 12(%sp), %sp
        move.l (%sp)+, %d0
        movea.l %d0, %a0
        rts

| Site 11 loads a2 with this: range(id) whose object is its caller's caller's first argument, 36(sp).
        .globl mw_range_f
mw_range_f:
        move.l %a2, -(%sp)
        movea.l 40(%sp), %a2
        move.l 8(%sp), -(%sp)
        bsr.s mw_range
        addq.l #4, %sp
        movea.l (%sp)+, %a2
        rts

| Site 12 resumes here after ev_render_voices (event-hooks.s).
        .globl mw_resume_render_voices
mw_resume_render_voices:
        lea MW_RV_A4, %a4
        jmp mw_continue_render_voices

| Site 13, an LFO destination's label (d0 = id): the active machine's short name in the stock slot.
        .globl mw_lfo_label
mw_lfo_label:
        move.l %a1, -(%sp)
        move.l %d0, -(%sp)
        clr.l -(%sp)
        move.l %d0, %d1
        mulu.w #52, %d1
        move.l %d1, -(%sp)
        pea 2
        jsr mw_lfo_text
        lea 12(%sp), %sp
        move.l %d0, %d1
        move.l (%sp)+, %d0
        movea.l (%sp)+, %a1
        lea mw_fw_param_table, %a0
        tst.l %d1
        bne.s 1f
        jmp MW_LFO_LABEL_ON
1:      move.l %d1, (%sp)
        jmp MW_LFO_LABEL_NAMED

| Sites 14-17 push LFO destination texts; each entry pushes the active machine's answer instead.
| text kind, offset register, stock operand (sp-relative operands see 12 more bytes) -> d0;
| every other register kept.
        .macro text kind, reg, stock
        lea -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        move.l \stock, -(%sp)
        move.l \reg, -(%sp)
        pea \kind
        jsr mw_lfo_text
        lea 12(%sp), %sp
        movem.l (%sp), %d1/%a0-%a1
        lea 12(%sp), %sp
        .endm

| Two pushes (first, then second) where a jsr's return address sat: entry [S] = ret; on return the
| stack holds [S-4] = second, [S] = first. Inside, 0(sp) keeps d0 and 4(sp) the return address.
        .macro pair name, kind1, reg, stock1, kind2, stock2
        .globl \name
\name:
        lea -12(%sp), %sp
        move.l %d0, (%sp)
        move.l 12(%sp), 4(%sp)
        text \kind1, \reg, "\stock1"
        move.l %d0, 12(%sp)
        movem.l (%sp), %d0
        .ifnb \kind2
        text \kind2, \reg, "\stock2"
        move.l %d0, 8(%sp)
        movem.l (%sp), %d0
        .else
        move.l \stock2, 8(%sp)
        .endif
        lea 4(%sp), %sp
        rts
        .endm
        | 14: long name (table+0x28) then group (d6), offset d0, table a3
        pair mw_lfo_list, 1, %d0, "40(%a3,%d0.l)", 0, %d6
        | 15: short name (table+0x30) then group (d6), offset d2
        pair mw_lfo_lshort, 2, %d2, "48(%a3,%d2.l)", 0, %d6
        | 16: group (table+0x2c, a0) then d2 unchanged, offset d0
        pair mw_lfo_bgroup, 0, %d0, "44(%a0,%d0.l)", , %d2

| 17: the "%s" format where the return address sat, the short name pushed just before it (offset d3)
| replaced: entry [S] = ret, [S+4] = short; on return [S] = format, [S+4] = the answer.
        .globl mw_lfo_bname
mw_lfo_bname:
        lea -8(%sp), %sp
        move.l %d0, (%sp)
        move.l 8(%sp), 4(%sp)
        text 2, %d3, "24(%sp)"
        move.l %d0, 12(%sp)
        move.l #MW_LFO_FORMAT, %d0
        move.l %d0, 8(%sp)
        movem.l (%sp), %d0
        lea 4(%sp), %sp
        rts

| Sites 18 and 19: SLICE's sample knob compare (d0, d2), reported unequal when the page says knob D
| is no sample slot. Only Z is read after; every register kept.
        .macro sample name, reg
        .globl \name
\name:
        cmpi.l #135, \reg
        bne.s 1f
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        jsr mw_page_not_sample
        move.l %d0, -(%sp)
        movem.l 4(%sp), %d0-%d1/%a0-%a1
        tst.l (%sp)
        lea 20(%sp), %sp
1:      rts
        .endm
        sample mw_sample_d0, %d0
        sample mw_sample_d2, %d2

| Site 20, the menu row loop's type(machine): stock's for 0-3, 5 + id for an added machine, so every
| added row draws its icon.
        .globl mw_mtype
mw_mtype:
        move.l 4(%sp), %d0
        cmpi.l #3, %d0
        bhi.s 1f
        jmp MW_MACHINE_TYPE
1:      addq.l #5, %d0
        rts
