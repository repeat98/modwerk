| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: the stock entries of the kit-data and project-data store (store.c holds the logic)
| and the memcpy hook that follows kit copies in RAM.

        .ifne KIT_ROOM - 146
        .error "store.s: store.c's kit-data area is 146 bytes; KIT_ROOM must be 146"
        .endif

        .section .run, "ax"

| Words startup-kitdata-refresh.c reads by index (0-2): keep the order and the word size.
        .balign 4
        .globl core_store_layout
core_store_layout:
        .long FW_KITS, KIT_SIZE, KIT_PAD, KIT_ROOM, PATTERN_OBJ

| core_kit_save: in the kit serializer, in place of "move.l #0xBACEF00C,d1" before the end mark is stored.
| a2 = the record being written, a3 = the kit in RAM; leaves d1 as the replaced instruction did.
        .globl core_kit_save
core_kit_save:
        move.l %a3, -(%sp)
        move.l %a2, -(%sp)
        jsr core_kitdata_save
        addq.l #8, %sp
        move.l #0xbacef00c, %d1
        rts

| core_kit_load: in the kit loader, after the version check and before the end-mark compare.
| a2 = the kit in RAM, a3 = the record; leaves d1 as the replaced instruction did.
        .globl core_kit_load
core_kit_load:
        move.l %a3, -(%sp)
        move.l %a2, -(%sp)
        jsr core_kitdata_load
        addq.l #8, %sp
        move.l #0xbacef00c, %d1
        rts

| core_proj_save: in the project save, in place of "move.l #0xBEEFBACE,(a3)" (a3 = the file). Stores the
| magic first, then saves the modules' project data. d0 is live after the site: d0-d1/a0-a1 are kept.
        .globl core_proj_save
core_proj_save:
        move.l #0xbeefbace, (%a3)
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l %a3, -(%sp)
        jsr core_projdata_save
        addq.l #4, %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
        rts

| core_proj_load: in the project load, in place of "move.l #0xBEEFBACE,d0" before the magic compare.
        .globl core_proj_load
core_proj_load:
        move.l %a3, -(%sp)
        jsr core_projdata_load
        addq.l #4, %sp
        move.l #0xbeefbace, %d0
        rts

| core_memcpy(dst, src, n): reached by jmp from memcpy's first 12 bytes (its three argument loads).
| Any n but KIT_SIZE: the loads, then memcpy's body. A kit-sized copy runs the body as a subroutine (it
| returns the word above its return address, so dst is pushed for it), then core_kit_copied(dst, src).
        .globl core_memcpy
core_memcpy:
        move.l 12(%sp), %d0
        cmpi.l #KIT_SIZE, %d0
        beq.s .Lkit
        movea.l 4(%sp), %a1
        movea.l 8(%sp), %a0
        jmp MEMCPY + 12
.Lkit:
        movea.l 4(%sp), %a1
        movea.l 8(%sp), %a0
        move.l %a1, -(%sp)
        jsr MEMCPY + 12
        addq.l #4, %sp
        move.l 8(%sp), -(%sp)
        move.l 8(%sp), -(%sp)
        jsr core_kit_copied
        addq.l #8, %sp
        move.l 4(%sp), %d0
        rts
