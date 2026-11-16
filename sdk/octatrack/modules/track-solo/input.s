| SPDX-License-Identifier: MIT
| Copyright (c) 2026 twwwy
| Guards live in manifest.py. These entries preserve the native caller ABI.
        .text
        .balign 4
        .global ts_native_led_level, ts_panel_row, ts_project_load, ts_led_level
        .balign 4
ts_native_led_level:
        lea -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)
        jmp 0x400135b8


| Copy arguments: do not alter the caller's parameter slots.
ts_led_level:
        move.l 8(%sp),-(%sp)
        move.l 8(%sp),-(%sp)
        jsr ts_led_value
        addq.l #8,%sp
        move.l %d0,-(%sp)
        move.l 8(%sp),-(%sp)
        bsr ts_native_led_level
        addq.l #8,%sp
        rts


| d3: on XOR blink, d2: row. Change only the transmitted value.
ts_panel_row:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %d3,-(%sp)
        move.l %d2,-(%sp)
        jsr ts_led_row
        addq.l #8,%sp
        move.l %d0,%d3
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jsr 0x40010db0
        jmp 0x4001365a

| Before the base-owned project seam: all its subscribers still run.
ts_project_load:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr ts_cancel
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        lea -1468(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp 0x400866cc
