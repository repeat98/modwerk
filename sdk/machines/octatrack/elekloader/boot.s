| SPDX-License-Identifier: MIT
| Copyright (c) 2026 Sam Banks (Octabam REMIX SWITCH, PR #655 at 879cecb:
| modules/remix-switch/chain.s and switch.s); Modwerk contributors.
|
| RAM boot for the private base: run a whole OS image the host staged in
| SDRAM (boot.c) after a soft reset, without writing the flash. A power
| cycle, or any reset without an armed mailbox, boots the flashed image.
|
| Ported from REMIX SWITCH, whose sequence was measured on an MKII on
| 29 September 2026: the gate at the OS entry, the checks before the
| handover, the copy stub, OS UPGRADE's own quiesce, the DSP park and the
| soft reset. Changed: the stage is the base's own reserved .bss rather than
| the platform reserve; the gate and the checks live in core's .boot (in
| the image from power-on), so only the stub is copied out; the staged
| image's first long is checked at the gate too.
|
| ColdFire V4e; assemble with -mcpu=54455.

        .set    UNCACHED,    0x08000000
        .set    BOOT_MAGIC,  0x4d574254     | "MWBT" while a boot is armed; cleared before anything runs
| the mailbox at the stage's start (boot.h), all through the uncached alias
        .set    MB_MAGIC,    0
        .set    MB_LEN,      4              | the image's length in bytes
        .set    MB_HASH,     8              | rolling x33 over the image
        .set    MB_CHECK,    12             | MAGIC ^ LEN ^ HASH: random DRAM is not a mailbox
        .set    MB_STATUS,   16
        .set    MB_RESET,    20             | the last reset step reached
        .set    MB_PARK,     24             | the DSP cores that took the park command
        .set    STAGE_STUB,  64             | the copy stub runs here, outside the image it overwrites
        .set    STAGE_IMAGE, 320            | the staged image
        .set    STAGE_MAX,   0x140000       | its maximum length (boot.h)
| Where any base's stage can be: Octabam's platform reserve (Elekloader's
| core RAM starts at its bottom). The gate scans it, so a base can arm a boot
| that another base's gate runs (the flashed one runs after every reset).
        .set    RESERVE_LO,  0x40a955e0
        .set    RESERVE_HI,  0x41495de0
        .set    USBCMD,      0xfc0b0140     | bit 0 RS: the controller runs (D+ pulled up)

        .set    ST_BOOT,     0x424f4f54     | "BOOT" handed over
        .set    ST_SIZE,     0x53495a45     | "SIZE"
        .set    ST_BVER,     0x42564552     | "BVER" its bootstrap version is not NOR's: it would reflash the bootstrap
        .set    ST_HASH,     0x48415348     | "HASH" the stage changed between arming and the boot
        .set    ST_FIRST,    0x46495253     | "FIRS" not an OS entry
        .set    RS_SPIN,     0x5350494e     | "SPIN" interrupts masked, parking
        .set    RS_RCR,      0x52435220     | "RCR " the soft reset requested

| stock facts (1.40C; Octabam docs/proposals/FIRMWARE_SWITCHER.md)
        .set    OS_ENTRY,    0x40000400
        .set    OS_ARGCELL,  0x400b9650     | the entry parks the bootstrap's argument here first
        .set    OS_RESUME,   0x40000418     | after the entry's `movea.l #0x48000000,%sp`
        .set    OS_FIRST,    0x4fefffe4     | the entry's `lea (-28,%sp),%sp`
        .set    OS_VEROFF,   0x000de648     | 0x400dea48 - OS_ENTRY: the bootstrap version the image carries
        .set    NOR_BOOTVER, 0x00003ffc     | the bootstrap version NOR holds
        .set    CACR_OFF,    0x00040100     | BCINVA | ICINVA, both caches off
        .set    CACR_BOOT,   0x0008c000     | what the bootstrap leaves in CACR when it calls the entry
        .set    UART1_FLUSH, 0x40010a4c
        .set    RCR,         0xfc0a0000
        .set    UART1_USR,   0xfc064004     | the panel link: bit 3 TXEMP
        .set    UART1_UTB,   0xfc06400c
        .set    MKII_FLAG,   0x46c8d18c     | 1 on an MKII
        .set    HI08_CVR,    0x20000004     | host command: bit 7 HC, bits 6..0 the vector / 2
        .set    HI08_ISR,    0x20000008     | bit 0 RXDF
        .set    HI08_RXL,    0x2000001c
        .set    DSP_SELECT,  0xfc0a400c     | which core's host port the window shows
        .set    PARK_HC,     0x008f         | HC | $0f: vector P:$1e, the park (build_core.py's DSP sites)

| ---- the gate, at the OS entry (site 0x40000412) ---------------------------
| Nothing has run yet: no DSP upload, no cache set-up, no interrupts, and
| core's boot has not cleared .bss. Scan the reserve for mailboxes (16-byte
| aligned) and spend every one found first, so an image that hangs costs one
| reset, never a loop, and no stale mailbox survives; with exactly one, check
| the stage and hand over, or record why not and resume the entry. Never a
| hang. About 0.1 s with the caches still off.
        .section .boot, "ax"
        .globl  modwerk_boot_gate
modwerk_boot_gate:
        lea     (RESERVE_LO+UNCACHED).l,%a1
        suba.l  %a2,%a2
        moveq   #0,%d4                  | mailboxes found
        move.l  #BOOT_MAGIC,%d1
3:      cmp.l   (MB_MAGIC,%a1),%d1
        bne.s   4f
        move.l  (MB_LEN,%a1),%d0
        eor.l   %d1,%d0
        move.l  (MB_HASH,%a1),%d2
        eor.l   %d2,%d0
        cmp.l   (MB_CHECK,%a1),%d0
        bne.s   4f                      | random DRAM, not a mailbox
        clr.l   (MB_MAGIC,%a1)          | one-shot, before anything below can fail
        movea.l %a1,%a2
        addq.l  #1,%d4
4:      lea     (16,%a1),%a1
        cmpa.l  #RESERVE_HI+UNCACHED,%a1
        bcs.s   3b
        subq.l  #1,%d4
        bne.w   g_quiet                 | none, or several: boot this image
        movea.l %a2,%a1
        move.l  (MB_LEN,%a1),%d2
        move.l  (MB_HASH,%a1),%d3
        cmpi.l  #STAGE_MAX,%d2
        bhi.w   g_size
        cmpi.l  #OS_VEROFF+2,%d2
        bcs.w   g_size
        lea     (STAGE_IMAGE,%a1),%a0
        move.l  (%a0),%d0
        cmpi.l  #OS_FIRST,%d0
        bne.w   g_first
        | The staged image's entry compares its bootstrap version with NOR's
        | and, if newer, REPROGRAMS THE BOOTSTRAP (the recovery path). Only an
        | image carrying NOR's own version may run.
        lea     (STAGE_IMAGE,%a1),%a0
        adda.l  #OS_VEROFF,%a0
        mvz.w   (%a0),%d0
        mvz.w   (NOR_BOOTVER).w,%d1
        cmp.l   %d1,%d0
        bne.w   g_bver
        lea     (STAGE_IMAGE,%a1),%a0
        move.l  %d2,%d0
        moveq   #0,%d1
1:      move.l  %d1,%d4
        lsl.l   #5,%d1
        add.l   %d4,%d1
        moveq   #0,%d4
        move.b  (%a0)+,%d4
        add.l   %d4,%d1
        subq.l  #1,%d0
        bne.s   1b
        cmp.l   %d3,%d1
        bne.w   g_hash
        move.l  #ST_BOOT,%d0
        move.l  %d0,(MB_STATUS,%a1)
        | the stub, out of the way of the copy (.boot is inside it)
        lea     g_stub(%pc),%a0
        lea     (STAGE_STUB,%a1),%a2
        moveq   #(g_stub_end-g_stub)/2,%d0
2:      move.w  (%a0)+,(%a2)+
        subq.l  #1,%d0
        bne.s   2b
        move.l  (OS_ARGCELL).l,%d1      | the bootstrap's argument, read before it is overwritten
        lea     (STAGE_IMAGE,%a1),%a0
        lea     (STAGE_STUB,%a1),%a3
        lea     (OS_ENTRY).l,%a2
        move.l  %d2,%d0
        jmp     (%a3)
g_size:
        move.l  #ST_SIZE,%d0
        bra.s   g_resume
g_first:
        move.l  #ST_FIRST,%d0
        bra.s   g_resume
g_bver:
        move.l  #ST_BVER,%d0
        bra.s   g_resume
g_hash:
        move.l  #ST_HASH,%d0
g_resume:
        move.l  %d0,(MB_STATUS,%a1)
g_quiet:
        movea.l #0x48000000,%sp         | the displaced instruction
        jmp     (OS_RESUME).l

| The stub: a0 = stage image, a2 = OS_ENTRY, d0 = length, d1 = the argument.
| Caches off and invalidated for the copy, then the bootstrap's own exit
| state, then the entry as the bootstrap calls it. Position-independent.
        .align  2
g_stub:
        move.l  #CACR_OFF,%d4
        movec   %d4,%cacr
        nop
1:      move.l  (%a0)+,(%a2)+
        subq.l  #4,%d0
        bgt.s   1b
        move.l  #CACR_BOOT,%d4
        movec   %d4,%cacr
        nop
        move.l  %d1,-(%sp)
        jsr     (OS_ENTRY).l
2:      bra.s   2b
g_stub_end:
        .align  2

| ---- the reset, in the engine task ------------------------------------------
        .text
| void modwerk_boot_quiesce(void): OS UPGRADE's own pre-flash sequence
| (0x40080444..0x40080480), then wait until the card is idle. Engine task.
        .globl  modwerk_boot_quiesce
modwerk_boot_quiesce:
        jsr     (0x4006d4a8).l
        jsr     (0x400a10c8).l
        pea     (-1).w
        jsr     (0x40006820).l
        jsr     (0x40091cdc).l
        addq.l  #4,%sp
1:      pea     (0x46c901b8).l
        jsr     (0x400009dc).l
        addq.l  #4,%sp
        tst.l   %d0
        beq.s   2f
        clr.l   -(%sp)
        pea     (0x2710).w
        jsr     (0x40020c7c).l
        addq.l  #8,%sp
        bra.s   1b
2:      rts

| void modwerk_boot_reset(void): interrupts off, the panel's queue drained,
| both DSP cores parked in a boot-ROM loader (the soft reset restarts the
| ColdFire, not the DSP), the MKII panel back to its start-up state, then
| the soft reset. Never returns.
        .globl  modwerk_boot_reset
modwerk_boot_reset:
        move.w  #0x2700,%sr
        lea     (modwerk_boot_stage+UNCACHED).l,%a1
        move.l  #RS_SPIN,%d0
        move.l  %d0,(MB_RESET,%a1)
        jsr     (UART1_FLUSH).l
        bsr.w   park
        lea     (modwerk_boot_stage+UNCACHED).l,%a1
        move.l  %d0,(MB_PARK,%a1)
        tst.l   (MKII_FLAG).l
        beq.s   9f
        moveq   #0x60,%d1
        bsr.w   putpanel
        moveq   #0x02,%d1
        bsr.w   putpanel
        bsr.w   txempty
        move.l  #0x00400000,%d0         | ~20 ms for the panel to act on it (REMIX SWITCH's count)
7:      subq.l  #1,%d0
        bne.s   7b
        | USB off before the reset: the host sees a clean unplug, and the
        | controller is at rest when stock's start-up brings it up again.
9:      move.l  (USBCMD).l,%d0
        bclr    #0,%d0
        move.l  %d0,(USBCMD).l
        move.l  #0x00a00000,%d0         | ~50 ms (REMIX SWITCH's 0x00400000 is ~20)
6:      subq.l  #1,%d0
        bne.s   6b
        lea     (modwerk_boot_stage+UNCACHED).l,%a1
        move.l  #RS_RCR,%d0
        move.l  %d0,(MB_RESET,%a1)
        move.b  #0x80,%d0
        move.b  %d0,(RCR).l
8:      bra.s   8b

| park: host command $0f to both cores, each one's host receive register
| drained; d0 = a bit per core that took it, then the words drained from
| core 0 (bits 3..2) and core 1 (bits 5..4). First ~5 ms for a frame's
| host transfers to finish.
park:
        lea     (-12,%sp),%sp
        movem.l %d2-%d4,(%sp)
        move.l  #0x00100000,%d0
1:      subq.l  #1,%d0
        bne.s   1b
        moveq   #0,%d3
        moveq   #0,%d1
        bsr.s   parkcore
        beq.s   2f
        moveq   #1,%d3
2:      bsr.s   drain
        lsl.l   #2,%d0
        or.l    %d0,%d3
        moveq   #1,%d1
        bsr.s   parkcore
        beq.s   3f
        addq.l  #2,%d3
3:      bsr.s   drain
        lsl.l   #4,%d0
        or.l    %d0,%d3
        moveq   #0,%d0
        move.b  %d0,(DSP_SELECT).l      | core 0, as the upload starts
        move.l  %d3,%d0
        movem.l (%sp),%d2-%d4
        lea     (12,%sp),%sp
        rts

| drain: the selected core's host-side receive register; a word left there
| would be read as the next OS's first upload echo. d0 = words read, 0..3.
drain:
        moveq   #0,%d4
1:      move.l  #20000,%d2
2:      subq.l  #1,%d2
        bne.s   2b
        move.w  (HI08_ISR).l,%d0
        btst    #0,%d0
        beq.s   3f
        move.w  (HI08_RXL).l,%d0
        addq.l  #1,%d4
        moveq   #15,%d0
        cmp.l   %d4,%d0
        bne.s   1b
3:      move.l  %d4,%d0
        moveq   #3,%d2
        cmp.l   %d0,%d2
        bge.s   4f
        move.l  %d2,%d0
4:      rts

| parkcore: the core in d1; Z clear if it took the host command.
parkcore:
        move.b  %d1,(DSP_SELECT).l
        nop
        move.l  #PARK_HC,%d0
        move.w  %d0,(HI08_CVR).l
        move.l  #2000000,%d2
1:      move.w  (HI08_CVR).l,%d0
        tst.b   %d0
        bpl.s   2f
        subq.l  #1,%d2
        bne.s   1b
        moveq   #0,%d0
        rts
2:      moveq   #1,%d0
        rts

putpanel:
        bsr.w   txempty
        move.b  %d1,(UART1_UTB).l
        rts
txempty:
        move.b  (UART1_USR).l,%d0
        btst    #3,%d0
        beq.s   txempty
        rts
