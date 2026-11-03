| SPDX-License-Identifier: GPL-3.0-or-later
| The boot stub (docs/OCTATRACK_TWO_SLOT_BASE.md). Elektron's bootloader unpacks
| the section at 0x4012 to 0x40000400 and calls it with its boot word on the
| stack, checking nothing; ours is a jump here (build_stub.py's trampoline),
| so this runs from NOR, where build_stub.py places it (SLOT_STUB_CODE). It
| picks a slot (stub.c), then does what the bootloader does for the OS
| (1.40C 0x22a2): the caches set for unpacking, the slot's section unpacked
| to 0x40000400 by the bootloader's own unpacker (0x207e), the caches as the
| bootloader leaves them, and a jump with the stack and every register as the
| bootloader called it. ColdFire V4 (MCF5445x): -mcpu=54455.
|
| One addition: the instruction cache is invalidated before the jump. The
| trampoline ran at 0x40000400 from that cache, and the bootloader's own
| CACR values never invalidate it (they set DCINVA, not ICINVA): without
| this, the jump could run the trampoline again instead of the OS, at every
| start. ICINVA is bit 8, as runtime.c's modwerk_machine_invalidate_code uses
| it on the unit.

        .section .text.entry, "ax"
        .globl  stub_entry
stub_entry:
        lea     -60(%sp), %sp
        movem.l %d0-%d7/%a0-%a6, (%sp)  | the bootloader's registers, for the OS
        jsr     stub_main               | the slot's container, 0 when none is whole
        tst.l   %d0
        beq.s   9f
        movea.l %d0, %a2
        move.l  #0xa508e000, %d0        | 0x22a2: caches on for the unpacking
        movec   %d0, %cacr
        move.l  #0x4007e000, %d0
        movec   %d0, %acr0
        move.l  #0x0000e020, %d0
        movec   %d0, %acr1
        pea     0x40000400
        pea     0x12(%a2)               | the section header; the unpacker skips its 8 bytes
        jsr     0x207e                  | the bootloader's unpacker, in NOR
        nop
        addq.l  #8, %sp
        moveq   #0, %d0
        movec   %d0, %acr0
        movec   %d0, %acr1
        move.l  #0x0008c100, %d0        | the bootloader's last CACR, plus ICINVA
        movec   %d0, %cacr
        nop
        movem.l (%sp), %d0-%d7/%a0-%a6
        lea     60(%sp), %sp
        jmp     0x40000400              | the OS entry, as the bootloader would call it
9:      bra.s   9b                      | no whole slot: nothing to start

| int stub_program(uint32_t at, uint32_t word): one NOR word, with the unlock and
| command words the bootloader's MIDI UPGRADE uses. Copied to SRAM and run from
| there (stub.c): NOR answers status, not code, while it programs. 1 once the
| word reads back, else 0 after about a second, with NOR back to reading.
        .text
        .globl  stub_program, stub_program_end
stub_program:
        move.l  %d2, -(%sp)
        movea.l 8(%sp), %a0
        move.l  12(%sp), %d0
        mvz.w   %d0, %d0
        movea.l #0xaaaa, %a1
        move.w  #0xaaaa, (%a1)
        movea.l #0x5554, %a1
        move.w  #0x5555, (%a1)
        movea.l #0xaaaa, %a1
        move.w  #0xa0a0, (%a1)
        move.w  %d0, (%a0)
        move.l  #8000000, %d1
1:      mvz.w   (%a0), %d2
        cmp.l   %d2, %d0
        beq.s   2f
        subq.l  #1, %d1
        bne.s   1b
        movea.l #0xaaaa, %a1
        move.w  #0xf0f0, (%a1)          | reset: reading again
        moveq   #0, %d0
        bra.s   3f
2:      moveq   #1, %d0
3:      move.l  (%sp)+, %d2
        rts
stub_program_end:
