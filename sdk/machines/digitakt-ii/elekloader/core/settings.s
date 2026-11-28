| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk hook bus: the SETTINGS (Rytm: GLOBAL) menu event ev_settings and core_additem.
| One source for the Digitakt II and the Analog Rytm MKII; addresses come from --defsym.

        .ifndef SETTINGS_RET
        .error "settings.s: SETTINGS_RET is not defined for this machine"
        .endif
        .ifndef OP_NEW
        .error "settings.s: OP_NEW is not defined for this machine"
        .endif
        .ifndef ITEM_CTOR
        .error "settings.s: ITEM_CTOR is not defined for this machine"
        .endif
        .ifndef MENU_ADD
        .error "settings.s: MENU_ADD is not defined for this machine"
        .endif
        .ifndef FN_MGR
        .error "settings.s: FN_MGR is not defined for this machine"
        .endif

        .section .run, "ax"

| core_settings: reached by jmp from the menu builder, after its last row, menu in a2.
| Runs every ev_settings handler as f(menu), then the two displaced effects (a0 = the
| menu's vtable, push 2) and continues the builder at SETTINGS_RET.
        .globl core_settings
core_settings:
        move.l %a3, -(%sp)
        lea ev_settings, %a3
.Lrow:
        move.l (%a3)+, %d0
        beq.s .Lrows
        movea.l %d0, %a0
        move.l %a2, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        bra.s .Lrow
.Lrows:
        movea.l (%sp)+, %a3
        movea.l (%a2), %a0
        pea 2
        jmp SETTINGS_RET

| core_additem(menu, row): appends a stock MenuItem whose four callbacks are row's
| {label, select, draw, change}. Select and change get the menu as their functor payload.
| Frame: 4 x 16-byte std::function objects at 0..63, saved a2-a4 at 64, then the caller's.
        .globl core_additem
core_additem:
        lea -76(%sp), %sp
        movem.l %a2-%a4, 64(%sp)
        movea.l 80(%sp), %a2
        movea.l 84(%sp), %a3
        moveq #0, %d0
        move.l #FN_MGR, %d1
        move.l %d0, 0(%sp)
        move.l %d0, 4(%sp)
        move.l %d1, 8(%sp)
        move.l 0(%a3), 12(%sp)
        move.l %a2, 16(%sp)
        move.l %d0, 20(%sp)
        move.l %d1, 24(%sp)
        move.l 4(%a3), 28(%sp)
        move.l %d0, 32(%sp)
        move.l %d0, 36(%sp)
        move.l %d1, 40(%sp)
        move.l 8(%a3), 44(%sp)
        move.l %a2, 48(%sp)
        move.l %d0, 52(%sp)
        move.l %d1, 56(%sp)
        move.l 12(%a3), 60(%sp)
        pea 0x54
        jsr OP_NEW
        addq.l #4, %sp
        tst.l %d0
        | No memory: skip the row rather than construct at address 0.
        beq.s .Lnoitem
        movea.l %d0, %a4
        | ITEM_CTOR(item, &label, &select, &draw, &change, -1, 8), pushed last argument first.
        pea 8
        pea -1
        pea 56(%sp)
        pea 44(%sp)
        pea 32(%sp)
        pea 20(%sp)
        move.l %a4, -(%sp)
        jsr ITEM_CTOR
        lea 28(%sp), %sp
        move.l %a4, -(%sp)
        move.l %a2, -(%sp)
        jsr MENU_ADD
        addq.l #8, %sp
.Lnoitem:
        movem.l 64(%sp), %a2-%a4
        lea 76(%sp), %sp
        rts
