/* SPDX-License-Identifier: GPL-3.0-or-later */
stock_read = 0xc00d3bc8;
midistomp_diag_draw = 0xc00f3110;
draw_text = 0xc009fce0;

SECTIONS {
    .patch_read 0xc00a5518 : SUBALIGN(4) { *(.patch_read) }
    .patch_draw 0xc00a93d0 : SUBALIGN(4) { *(.patch_draw) }
    .probe 0xc00f4b00 : { *(.probe) }
    ASSERT(SIZEOF(.probe) <= 0x900, "Probe exceeds its window before 0xc00f5400")
    /DISCARD/ : { *(*) }
}
