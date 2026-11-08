| SPDX-License-Identifier: MIT
| Original resident wrappers. The stock entry replay is a zero placeholder;
| build_core fills it from the owner's hash-checked OS via stock_reference.
| No extracted instruction bytes are carried in this source.
.text
.balign 2
.globl mw_sample_menu_call
mw_sample_menu_call:
    jsr mw_sample_menu_open
    jmp 0x40072cb0

.globl mw_sample_waveform_entry
mw_sample_waveform_entry:
    lea -64(%sp),%sp
    movem.l %d0-%d7/%a0-%a6,(%sp)
    move.w %sr,%d0
    move.l %d0,60(%sp)
    move.w #0x2700,%sr
    move.l %a2,-(%sp)
    jsr mw_sample_waveform_job
    addq.l #4,%sp
    move.l 60(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d7/%a0-%a6
    lea 64(%sp),%sp
.globl modwerk_stock_400858c0_6
modwerk_stock_400858c0_6:
    .space 6
    jmp 0x400858c6

.globl mw_sample_select_entry
mw_sample_select_entry:
    lea -64(%sp),%sp
    movem.l %d0-%d7/%a0-%a6,(%sp)
    move.w %sr,%d0
    move.l %d0,60(%sp)
    move.w #0x2700,%sr
    lea 64(%sp),%a0
    move.l %a0,-(%sp)
    move.l (%a0),-(%sp)
    jsr mw_sample_selection_enter
    addq.l #8,%sp
    tst.l %d0
    beq .Lsample_nested
    cmpi.l #2,%d0
    beq .Lsample_passthrough
    move.l #mw_sample_select_return,%d0
    move.l %d0,64(%sp)
.Lsample_passthrough:
    move.l 60(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d7/%a0-%a6
    lea 64(%sp),%sp
.globl modwerk_stock_4006d8f4_6
modwerk_stock_4006d8f4_6:
    .space 6
    jmp 0x4006d8fa
.Lsample_nested:
    move.l 60(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d7/%a0-%a6
    lea 64(%sp),%sp
    moveq #0,%d0
    rts

.globl mw_sample_select_tail
mw_sample_select_tail:
    lea -64(%sp),%sp
    movem.l %d0-%d7/%a0-%a6,(%sp)
    move.w %sr,%d0
    move.l %d0,60(%sp)
    move.w #0x2700,%sr
    lea 64(%sp),%a0
    move.l %a0,-(%sp)
    move.l 4(%a0),-(%sp)
    jsr mw_sample_selection_arm
    addq.l #8,%sp
    move.l 60(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d7/%a0-%a6
    lea 64(%sp),%sp
    jmp 0x40020c28

.globl mw_sample_select_return
mw_sample_select_return:
    lea -68(%sp),%sp
    movem.l %d0-%d7/%a0-%a6,(%sp)
    move.w %sr,%d0
    move.l %d0,60(%sp)
    move.w #0x2700,%sr
    lea 68(%sp),%a0
    move.l %a0,-(%sp)
    jsr mw_sample_selection_leave
    addq.l #4,%sp
    move.l %d0,64(%sp)
    move.l 60(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d7/%a0-%a6
    lea 64(%sp),%sp
    rts
