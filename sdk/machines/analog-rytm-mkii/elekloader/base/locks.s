| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Rytm base, the FX track's lock words (locks.c): each hooked routine's
| first instructions (the bytes its jmp site replaces), then a jump to the
| next. Called like the stock routine. OS 1.74.
        .text
        .globl  lk_save_one_body, lk_save_all_body, lk_load_body
        .align  2
lk_save_one_body:                       | 0x4000940c, a parameter's locks saved
        lea     -36(%sp),%sp
        movem.l %d2-%d7/%a2-%a4,(%sp)
        jmp     0x40009414
lk_save_all_body:                       | 0x40009216, every lock saved
        lea     -48(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4000921e
lk_load_body:                           | 0x40008f98, the locks loaded
        lea     -36(%sp),%sp
        movem.l %d2-%d6/%a2-%a5,(%sp)
        jmp     0x40008fa0
