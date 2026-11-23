/* SPDX-License-Identifier: GPL-3.0-or-later */
stock_read = 0xc00d3bc8;
stock_view = 0xc00d3bb0;
stock_seek = 0xc00d3ba4;
stock_close = 0xc00d3be0;
midistomp_diag_draw = 0xc00f3110;
draw_text = 0xc009fce0;
stock_midi_send = 0xc00ad664;
midistomp_diag_mend = 0xc00f3920;

SECTIONS {
    .patch_read 0xc00a5518 : SUBALIGN(4) { *(.patch_read) }
    .patch_seek_phdr 0xc00a55a0 : SUBALIGN(4) { *(.patch_seek_phdr) }
    .patch_view_phdr 0xc00a55c4 : SUBALIGN(4) { *(.patch_view_phdr) }
    .patch_seek_section 0xc00a57ec : SUBALIGN(4) { *(.patch_seek_section) }
    .patch_view_section 0xc00a5800 : SUBALIGN(4) { *(.patch_view_section) }
    .patch_seek_symbols 0xc00a58e0 : SUBALIGN(4) { *(.patch_seek_symbols) }
    .patch_view_symbols 0xc00a5900 : SUBALIGN(4) { *(.patch_view_symbols) }
    .patch_seek_reloc 0xc00a5920 : SUBALIGN(4) { *(.patch_seek_reloc) }
    .patch_copy_reloc 0xc00a5934 : SUBALIGN(4) { *(.patch_copy_reloc) }
    .patch_copy_word 0xc00a5944 : SUBALIGN(4) { *(.patch_copy_word) }
    .patch_seek_data 0xc00a5988 : SUBALIGN(4) { *(.patch_seek_data) }
    .patch_view_data 0xc00a59ac : SUBALIGN(4) { *(.patch_view_data) }
    .patch_seek_end 0xc00a5be8 : SUBALIGN(4) { *(.patch_seek_end) }
    .patch_close 0xc00a6a70 : SUBALIGN(4) { *(.patch_close) }
    .patch_draw 0xc00a93d0 : SUBALIGN(4) { *(.patch_draw) }
    .patch_midi 0xc00f485c : SUBALIGN(4) { *(.patch_midi) }
    .probe 0xc00f4b00 : { *(.probe) }
    ASSERT(SIZEOF(.probe) <= 0x900, "Probe exceeds its window before 0xc00f5400")
    /DISCARD/ : { *(*) }
}
