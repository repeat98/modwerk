/* SPDX-License-Identifier: MIT */
/* Original deliberately hostile callback for wrapper ABI comparison. It is
 * not a C ABI callback: every data/address register except SP is clobbered. */
.text
.align 2
.globl bs_selection_abi_callback
bs_selection_abi_callback:
    move.l #0x76540000,%d0
    move.l #0x76540001,%d1
    move.l #0x76540002,%d2
    move.l #0x76540003,%d3
    move.l #0x76540004,%d4
    move.l #0x76540005,%d5
    move.l #0x76540006,%d6
    move.l #0x76540007,%d7
    move.l #0x76540008,%a0
    move.l #0x76540009,%a1
    move.l #0x7654000a,%a2
    move.l #0x7654000b,%a3
    move.l #0x7654000c,%a4
    move.l #0x7654000d,%a5
    move.l #0x7654000e,%a6
    move.w #0x201f,%sr
    rts
