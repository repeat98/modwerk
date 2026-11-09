| SPDX-License-Identifier: GPL-2.0-or-later
| MKI copy (Analog Rytm MKI, OS 1.74) of the MKII base's locks.s: the MKI's three lock routines, whose
| entries and lock tables are the MKII's (88-byte steps, 5674-byte tracks, 72 lanes of 66 bytes).
| Modwerk's Rytm base, the FX track's lock words (locks.c): each hooked routine's
| first instructions (the bytes its jmp site replaces), then a jump to the
| next. Called like the stock routine. OS 1.74.
        .text
        .globl  lk_save_one_body, lk_save_all_body, lk_load_body
        .align  2
lk_save_one_body:                       | 0x400092ec, a parameter's locks saved
        lea     -36(%sp),%sp
        movem.l %d2-%d7/%a2-%a4,(%sp)
        jmp     0x400092f4
lk_save_all_body:                       | 0x400090f6, every lock saved
        lea     -48(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x400090fe
lk_load_body:                           | 0x40008e78, the locks loaded
        lea     -36(%sp),%sp
        movem.l %d2-%d6/%a2-%a5,(%sp)
        jmp     0x40008e80
