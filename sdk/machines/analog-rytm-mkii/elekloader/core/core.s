| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk hook bus: the boot copier and the UI events (ev_tick, ev_draw, ev_key, ev_enc).
| One source for the Digitakt II, the Analog Rytm MKII and the Model:Cycles; each machine's
| recipe mod.json chooses the addresses and switches with --defsym (see the machine's guide).
| Tables are the linker's collections: 4-byte handler addresses, ended by a zero entry.

        .ifndef DRAWALL
        .error "core.s: DRAWALL is not defined for this machine"
        .endif
        .ifndef KEYDISP
        .error "core.s: KEYDISP is not defined for this machine"
        .endif
        .ifndef ENCDISP
        .error "core.s: ENCDISP is not defined for this machine"
        .endif
        .ifndef VBR_FN
        .error "core.s: VBR_FN is not defined for this machine"
        .endif
        .ifndef NO_DTIM0
        .ifndef DTMR0
        .error "core.s: DTMR0 is not defined (or set NO_DTIM0)"
        .endif
        .ifndef PPMSR0
        .error "core.s: PPMSR0 is not defined (or set NO_DTIM0)"
        .endif
        .endif

| boot: reached by jsr from the boot site, once, before the OS clears its .bss.
| Copies the DDR image, clears .bss, starts DTIM0, invalidates the caches, runs
| core_boot_init, then hands over to the call(s) the site displaced.
        .section .boot, "ax"
        .globl boot
boot:
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        movea.l #__run_load, %a0
        movea.l #__run_start, %a1
        move.l #__run_words, %d0
        beq.s .Lcopied
.Lcopy:
        move.l (%a0)+, (%a1)+
        subq.l #1, %d0
        bne.s .Lcopy
.Lcopied:
        movea.l #__bss_start, %a1
        move.l #__bss_words, %d0
        beq.s .Lcleared
.Lclear:
        clr.l (%a1)+
        subq.l #1, %d0
        bne.s .Lclear
.Lcleared:
        .ifndef NO_DTIM0
        | A running timer keeps running: rewriting its mode would stop it.
        move.w DTMR0, %d0
        btst #0, %d0
        bne.s .Ltimer
        moveq #0x1c, %d0
        move.b %d0, PPMSR0
        moveq #0, %d0
        move.w %d0, DTMR0
        moveq #3, %d0
        move.w %d0, DTMR0
.Ltimer:
        .endif
        .ifdef BOOT_CACR
        move.l #BOOT_CACR, %d0
        nop
        movec %d0, %cacr
        nop
        .endif
        .ifdef BOOT_INIT
        jsr core_boot_init
        .endif
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
        .ifdef VBR_FN2
        | Two displaced calls: the first returns here, the second to the site's nop.
        jsr VBR_FN
        jmp VBR_FN2
        .else
        jmp VBR_FN
        .endif

        .section .run, "ax"

| core_tick(ctrl): every ev_tick handler as f(ctrl), then the recompose flag at ctrl+0x20.
        .globl core_tick
core_tick:
        lea -8(%sp), %sp
        movem.l %a2-%a3, (%sp)
        movea.l 12(%sp), %a3
        lea ev_tick, %a2
.Ltick:
        move.l (%a2)+, %d0
        beq.s .Lticked
        movea.l %d0, %a0
        move.l %a3, -(%sp)
        jsr (%a0)
        addq.l #4, %sp
        bra.s .Ltick
.Lticked:
        moveq #0, %d0
        move.b 0x20(%a3), %d0
        movem.l (%sp), %a2-%a3
        lea 8(%sp), %sp
        rts

| core_draw(ctrl, bitmap): the stock composer, then every ev_draw handler as f(bitmap, ctrl).
        .globl core_draw
core_draw:
        lea -12(%sp), %sp
        movem.l %a2-%a4, (%sp)
        movea.l 16(%sp), %a3
        movea.l 20(%sp), %a4
        move.l %a4, -(%sp)
        move.l %a3, -(%sp)
        jsr DRAWALL
        addq.l #8, %sp
        lea ev_draw, %a2
.Ldraw:
        move.l (%a2)+, %d0
        beq.s .Ldrawn
        movea.l %d0, %a0
        move.l %a3, -(%sp)
        move.l %a4, -(%sp)
        jsr (%a0)
        addq.l #8, %sp
        bra.s .Ldraw
.Ldrawn:
        movem.l (%sp), %a2-%a4
        lea 12(%sp), %sp
        rts

| core_key(brain, event), core_enc(brain, event): handlers in order as f(brain, event);
| the first nonzero d0 takes the input and is returned. Otherwise the stock dispatcher
| runs on the caller's own stack, as if called directly. No static state: re-entrant.
        .macro input name, table, stock
        .globl \name
\name:
        move.l %a2, -(%sp)
        lea \table, %a2
.Lnext\@:
        move.l (%a2)+, %d0
        beq.s .Lstock\@
        movea.l %d0, %a0
        move.l 12(%sp), -(%sp)
        move.l 12(%sp), -(%sp)
        jsr (%a0)
        addq.l #8, %sp
        tst.l %d0
        beq.s .Lnext\@
        movea.l (%sp)+, %a2
        rts
.Lstock\@:
        movea.l (%sp)+, %a2
        jmp \stock
        .endm

        input core_key, ev_key, KEYDISP
        input core_enc, ev_enc, ENCDISP

| Target of every weak import nothing defines: 16 bytes that always read as zero.
        .section .bss, "aw", @nobits
        .balign 4
        .globl core_zero
core_zero:
        .space 16
