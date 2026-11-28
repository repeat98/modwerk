| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm core (Modwerk): parameter pages and overrides (analog-rytm-mk2/pages.h).
|
| Four stock routines ask the tables first, in table order, the first answer winning; otherwise they go on in stock
| as if nothing happened:
|   core_page_info   page_info(page): core_page_fns, then core_pages
|   core_param_get   page_get_value(view, id, lock): core_params' get
|   core_param_delta param_apply_delta(view, id, delta, func): core_params' delta
|   core_param_text  param_value_text(obj, id, value, buf): core_params' text
| core_view_0..9 build each view's page-key list (stock's pages, then core_view_pages'), core_cycle steps through it
| skipping hidden pages and puts the new page's title in the header. Every table is a list of record pointers
| ended by 0. Addresses come from mod.json's defsyms.

        .irp name, PAGE_INFO_RET, PAGE_BOUND, GET_RET, DELTA_RET, TEXT_RET, VIEW_INVALIDATE, CYCLE_RET, STR_FROM_CSTR, UI_SET_TITLE, STR_DTOR
        .ifndef \name
        .error "pages.s: \name is not defined for this machine"
        .endif
        .endr

        .section .run, "ax"

| core_page_info: the page's entry, &record->name. The page argument is read from the stack at every step.
        .globl core_page_info
core_page_info:
        move.l %a2, -(%sp)
        lea core_page_fns, %a2
1:      move.l (%a2)+, %d0
        beq.s 3f
        movea.l %d0, %a0
        move.l 8(%sp), %d1
        cmp.l (%a0), %d1
        bne.s 1b
        move.l 4(%a0), %d0
        beq.s 1b
        movea.l %d0, %a1
        move.l %d1, -(%sp)
        jsr (%a1)
        addq.l #4, %sp
        tst.l %d0
        beq.s 1b
        bra.s 5f
3:      lea core_pages, %a2
4:      move.l (%a2)+, %d0
        beq.s 6f
        movea.l %d0, %a0
        move.l 8(%sp), %d1
        cmp.l (%a0), %d1
        bne.s 4b
5:      addq.l #4, %d0
        movea.l (%sp)+, %a2
        rts
6:      movea.l (%sp)+, %a2
        moveq #PAGE_BOUND, %d1
        move.l 4(%sp), %d0
        jmp PAGE_INFO_RET

| The parameter tables: a0 = the next record of core_params whose first..last holds the id in d2 and whose
| function at \slot is set, a1 = that function; at the table's end, to \none. a2 walks the table.
        .macro next_param slot, none, again
\again:
        move.l (%a2)+, %d0
        beq \none
        movea.l %d0, %a0
        cmp.l (%a0), %d2
        blt.s \again
        cmp.l 4(%a0), %d2
        bgt.s \again
        move.l \slot(%a0), %d0
        beq.s \again
        movea.l %d0, %a1
        .endm

| core_param_get: frame of 12 as stock's (d2 at 0, a2 at 4, the value at 8), so the stock path keeps it.
        .globl core_param_get
core_param_get:
        lea -12(%sp), %sp
        movem.l %d2/%a2, (%sp)
        lea core_params, %a2
        move.l 20(%sp), %d2
        next_param 8, .Lget_stock, .Lget_next
        pea 8(%sp)
        move.l %d2, -(%sp)
        jsr (%a1)
        addq.l #8, %sp
        tst.l %d0
        beq.s .Lget_next
        move.l 8(%sp), %d0
        movem.l (%sp), %d2/%a2
        lea 12(%sp), %sp
        rts
.Lget_stock:
        movem.l (%sp), %d2/%a2
        movem.l %d2-%d3/%a2, (%sp)
        jmp GET_RET

| core_param_delta: an answer redraws the view, and stock makes no lock.
        .globl core_param_delta
core_param_delta:
        lea -12(%sp), %sp
        movem.l %d2/%a2, (%sp)
        lea core_params, %a2
        move.l 20(%sp), %d2
        next_param 12, .Ldelta_stock, .Ldelta_next
        moveq #0, %d1
        move.b 31(%sp), %d1
        move.l %d1, -(%sp)
        move.l 28(%sp), -(%sp)
        move.l %d2, -(%sp)
        move.l 28(%sp), -(%sp)
        jsr (%a1)
        lea 16(%sp), %sp
        tst.l %d0
        beq.s .Ldelta_next
        move.l 16(%sp), -(%sp)
        jsr VIEW_INVALIDATE
        addq.l #4, %sp
        movem.l (%sp), %d2/%a2
        lea 12(%sp), %sp
        rts
.Ldelta_stock:
        movem.l (%sp), %d2/%a2
        movem.l %d2-%d3/%a2, (%sp)
        jmp DELTA_RET

| core_param_text: text(t), t the routine's own arguments, so a handler may change id and value; the id is read
| again for every entry. PASS (or less) asks the next, DONE returns, STOCK (or more) runs stock with them.
        .globl core_param_text
core_param_text:
        lea -8(%sp), %sp
        movem.l %d2/%a2, (%sp)
        lea core_params, %a2
.Ltext_next:
        move.l 16(%sp), %d2
        next_param 16, .Ltext_stock, .Ltext_again
        pea 12(%sp)
        jsr (%a1)
        addq.l #4, %sp
        tst.l %d0
        ble.s .Ltext_next
        subq.l #1, %d0
        bne.s .Ltext_stock
        moveq #1, %d0
        movem.l (%sp), %d2/%a2
        addq.l #8, %sp
        rts
.Ltext_stock:
        movem.l (%sp), %d2/%a2
        addq.l #8, %sp
        lea -20(%sp), %sp
        movem.l %d2-%d4/%a2-%a3, (%sp)
        jmp TEXT_RET

| core_view_n: at view n's constructor, where stock pushes its page count and loads its list into d0. Builds the
| list in view n's buffer instead: stock's pages, then each core_view_pages entry for view n in table order, up to
| 16, each with its shown function beside it (0 for stock's). Keeps every register but d0, d1, a0 and a1.
        .macro view n
        .ifndef VIEW\n\()_RET
        .error "pages.s: VIEW\n\()_RET is not defined for this machine"
        .endif
        .globl core_view_\n
core_view_\n:
        lea -12(%sp), %sp
        movem.l %d2/%a2-%a3, (%sp)
        lea lists+64*\n, %a0
        lea shown+64*\n, %a2
        movea.l #VIEW\n\()_LIST, %a1
        moveq #0, %d1
1:      moveq #VIEW\n\()_N, %d2
        cmp.l %d2, %d1
        bge.s 2f
        move.l (%a1)+, (%a0)+
        clr.l (%a2)+
        addq.l #1, %d1
        bra.s 1b
2:      lea core_view_pages, %a3
3:      move.l (%a3)+, %d0
        beq.s 4f
        moveq #16, %d2
        cmp.l %d2, %d1
        bge.s 4f
        movea.l %d0, %a1
        moveq #\n, %d2
        cmp.l (%a1), %d2
        bne.s 3b
        move.l 4(%a1), (%a0)+
        move.l 8(%a1), (%a2)+
        addq.l #1, %d1
        bra.s 3b
4:      move.l %d1, lengths+4*\n
        movem.l (%sp), %d2/%a2-%a3
        lea 12(%sp), %sp
        move.l %d1, -(%sp)
        move.l #lists+64*\n, %d0
        jmp VIEW\n\()_RET
        .endm

        view 0
        view 1
        view 2
        view 3
        view 4
        view 5
        view 6
        view 7
        view 8
        view 9

| core_cycle: the page key on view a2 with d0 = its page count (> 1). The view's pages are a copy of a list
| (begin +124, end +128), so its core list is the first whose length and pages are the same. From the selection
| (+140) the next page is taken whose shown function is 0 or answers non-zero, at most count steps, so with none the
| page stays. Then stock's invalidate, with the view left pushed for stock at CYCLE_RET, and the new page's title
| (vtable +0x4c) in the header (the UI at +108). Keeps d3 (the key handler's answer); d2 is stock's scratch here.
        .globl core_cycle
core_cycle:
        lea -20(%sp), %sp
        movem.l %d4-%d6/%a3-%a4, (%sp)
        move.l %d0, %d4
        suba.l %a4, %a4
        moveq #0, %d5
1:      lea lengths, %a0
        cmp.l 0(%a0,%d5.l*4), %d4
        bne.s 4f
        movea.l 124(%a2), %a0
        move.l %d5, %d6
        lsl.l #6, %d6
        lea lists, %a1
        adda.l %d6, %a1
        lea shown, %a3
        adda.l %d6, %a3
        moveq #0, %d6
2:      cmp.l %d4, %d6
        bge.s 3f
        move.l (%a0)+, %d1
        cmp.l (%a1)+, %d1
        bne.s 4f
        addq.l #1, %d6
        bra.s 2b
3:      movea.l %a3, %a4
        bra.s 5f
4:      addq.l #1, %d5
        moveq #10, %d6
        cmp.l %d6, %d5
        blt.s 1b
5:      move.l 140(%a2), %d6
        moveq #1, %d5
6:      addq.l #1, %d6
        cmp.l %d4, %d6
        blt.s 7f
        moveq #0, %d6
7:      cmp.l %d4, %d5
        beq.s 8f
        move.l %a4, %d0
        beq.s 8f
        move.l 0(%a4,%d6.l*4), %d0
        beq.s 8f
        movea.l %d0, %a0
        move.l %a2, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        tst.l %d0
        bne.s 8f
        addq.l #1, %d5
        bra.s 6b
8:      move.l %d6, 140(%a2)
        movem.l (%sp), %d4-%d6/%a3-%a4
        lea 20(%sp), %sp
        move.l %a2, -(%sp)
        jsr VIEW_INVALIDATE
        movea.l (%a2), %a0
        movea.l 0x4c(%a0), %a0
        move.l %a2, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        | a String at 0(sp) and its one-byte allocator at 7(sp)
        lea -8(%sp), %sp
        pea 7(%sp)
        move.l %d0, -(%sp)
        pea 8(%sp)
        jsr STR_FROM_CSTR
        lea 12(%sp), %sp
        pea (%sp)
        move.l 108(%a2), -(%sp)
        jsr UI_SET_TITLE
        addq.l #8, %sp
        pea (%sp)
        jsr STR_DTOR
        addq.l #4, %sp
        lea 8(%sp), %sp
        jmp CYCLE_RET

        .section .bss, "aw", @nobits
        .balign 4
lists:                                  | 10 views x 16 pages
        .space 640
shown:                                  | 10 views x 16 shown functions
        .space 640
lengths:                                | 10 list lengths
        .space 40
