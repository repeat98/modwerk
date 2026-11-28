| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Digitakt mk1 base: the SRC machine sites (base.json), and the exports core_machine and
| core_machine_ui. Each entry re-authors the effect of the stock instructions its site displaces and
| continues where stock would; continuation addresses are the build's defsym. An entry keeps every
| register the stock code there keeps, and only the condition codes the next stock instruction reads.
        .section .run, "ax"

| d0 = id -> Z set when no module registered it; every register kept.
mw_known_d0:
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l %d0, -(%sp)
        jsr mw_find
        move.l %d0, (%sp)
        movem.l 4(%sp), %d0-%d1/%a0-%a1
        tst.l (%sp)
        lea 20(%sp), %sp
        rts

| d0 = id -> d0 = its descriptor's long at `off` if registered, else the id; other registers kept.
        .macro mapped name, off
\name:
        lea -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        pea \off
        move.l %d0, -(%sp)
        jsr mw_as
        addq.l #8, %sp
        movem.l (%sp), %d1/%a0-%a1
        lea 12(%sp), %sp
        rts
        .endm
        mapped mw_params_d0, 16
        .globl mw_render_d0
        mapped mw_render_d0, 20

        .globl core_machine, core_machine_ui
core_machine:
        move.l 4(%sp), -(%sp)
        jsr mw_find
        addq.l #4, %sp
        movea.l %d0, %a0
        rts
core_machine_ui:
        move.l 4(%sp), -(%sp)
        jsr mw_machine_ui
        addq.l #4, %sp
        movea.l %d0, %a0
        rts

| Machine menu list: after 0-3, every registered id in ascending order (d2 = the next id to try).
        .globl mw_mlist
mw_mlist:
        cmpi.l #3, %d2
        bls.s 1f
        move.l %d2, -(%sp)
        jsr mw_next_id
        addq.l #4, %sp
        tst.l %d0
        beq.s 2f
        move.l %d0, %d2
1:      jmp MW_MLIST_LOOP
2:      jmp MW_MLIST_DONE

| Set machine: accept 0-3 and every registered id in d2, refuse the rest.
        .globl mw_mset
mw_mset:
        cmpi.l #3, %d2
        bls.s 1f
        move.l %d2, %d0
        jsr mw_known_d0
        beq.s 2f
1:      moveq #3, %d0
        jmp MW_MSET_ON
2:      moveq #3, %d0
        jmp MW_MSET_OFF

| Selection step: select the row whose value is the id in d2 (list at a2+76), when d2 is valid.
        .globl mw_mstep
mw_mstep:
        cmpi.l #3, %d2
        bls.s 1f
        move.l %d0, -(%sp)
        move.l %d2, %d0
        jsr mw_known_d0
        movem.l (%sp), %d0
        lea 4(%sp), %sp
        beq.s 2f
1:      movea.l 76(%a2), %a0
        clr.l -(%sp)
        move.l %d2, -(%sp)
        jmp MW_MSTEP_ON
2:      jmp MW_MSTEP_SKIP

| Menu open: put the cursor on the current id in d0 (list in d2), when d0 is valid.
        .globl mw_mopen
mw_mopen:
        moveq #4, %d4
        move.l %d0, %d1
        addq.l #1, %d1
        cmpi.l #3, %d0
        bls.s 1f
        jsr mw_known_d0
        beq.s 2f
1:      clr.l -(%sp)
        move.l %d0, -(%sp)
        move.l %d2, -(%sp)
        jmp MW_MOPEN_ON
2:      jmp MW_MOPEN_SKIP

| The long and short name of a machine above 3 (d0): the descriptor's, else stock's default.
        .macro name_of name, off, fallback
        .globl \name
\name:
        pea \off
        move.l %d0, -(%sp)
        jsr mw_field
        addq.l #8, %sp
        tst.l %d0
        bne.s 1f
        move.l #\fallback, %d0
1:      movea.l %d0, %a0
        rts
        .endm
        name_of mw_mname, 4, MW_DEFAULT_NAME
        name_of mw_mshort, 8, MW_DEFAULT_SHORT

| Menu row icon (function entry: a, item, bmp, x, y): an added machine's own, else stock's drawer.
        .globl mw_micon
mw_micon:
        move.l 20(%sp), -(%sp)
        move.l 20(%sp), -(%sp)
        move.l 20(%sp), -(%sp)
        move.l 20(%sp), -(%sp)
        jsr mw_icon
        lea 16(%sp), %sp
        tst.l %d0
        beq.s 1f
        rts
1:      lea -12(%sp), %sp
        movem.l %d2-%d4, (%sp)
        jmp MW_MICON_ON

| Parameter descriptor (machine d0): an added machine uses its stand-in's.
        .globl mw_mparams
mw_mparams:
        moveq #3, %d2
        cmp.l %d0, %d2
        bcc.s 1f
        jsr mw_known_d0
        beq.s 2f
        jsr mw_params_d0
1:      jmp MW_MPARAMS_ON
2:      jmp MW_MPARAMS_NONE

| The engine takes a track's sound (a0 = sound, d0 = track, a1 = the render's machine bytes):
| core_track_machine gets the raw id, the render the machine it renders as.
        .globl mw_mrender
mw_mrender:
        move.l %d0, %d1
        moveq #0, %d0
        move.b 126(%a0), %d0
        lea core_track_machine, %a0
        move.b %d0, (%a0,%d1.l)
        jsr mw_render_d0
        move.b %d0, (%a1,%d1.l)
        jmp MW_MRENDER_DONE

| Kit and sound load (a3 = stored sound): keep 0-3, 0xff and registered ids, else 0.
        .globl mw_mload
mw_mload:
        moveq #0, %d0
        move.b 124(%a3), %d0
        cmpi.l #3, %d0
        bls.s 1f
        cmpi.l #255, %d0
        beq.s 1f
        jsr mw_known_d0
        bne.s 1f
        moveq #0, %d0
1:      moveq #1, %d2
        jmp MW_MLOAD_STORE

| "What does this track play": the stock answer, an added machine as the machine it renders as.
        .macro plays name, stock
        .globl \name
\name:
        move.l 8(%sp), -(%sp)
        move.l 8(%sp), -(%sp)
        jsr \stock
        addq.l #8, %sp
        jmp mw_render_d0
        .endm
        plays mw_mplays, MW_TRACK_MACHINE
        plays mw_mplays_page, MW_PAGE_MACHINE

| Parameter owner loop: compare the owner (d0) with the machine at 24(sp), mapped to its stand-in.
        .globl mw_mowner
mw_mowner:
        move.l %d0, -(%sp)
        move.l 28(%sp), %d0
        jsr mw_params_d0
        cmp.l (%sp), %d0
        movem.l (%sp), %d0
        lea 4(%sp), %sp
        bne.s 1f
        jmp MW_MOWNER_ON
1:      jmp MW_MOWNER_SKIP

| CC map (machine d1): an added machine uses its stand-in's.
        .globl mw_mcc
mw_mcc:
        moveq #3, %d2
        cmp.l %d1, %d2
        bcc.s 1f
        move.l %d0, -(%sp)
        move.l %d1, %d0
        jsr mw_known_d0
        beq.s 2f
        jsr mw_params_d0
        move.l %d0, %d1
        move.l (%sp)+, %d0
1:      jmp MW_MCC_ON
2:      move.l (%sp)+, %d0
        jmp MW_MCC_GENERIC

| NRPN map (machine d0): the same.
        .globl mw_mnrpn
mw_mnrpn:
        moveq #3, %d1
        cmp.l %d0, %d1
        bcc.s 1f
        jsr mw_known_d0
        beq.s 2f
        jsr mw_params_d0
1:      jmp MW_MNRPN_ON
2:      jmp MW_MNRPN_GENERIC
