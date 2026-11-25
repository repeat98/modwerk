| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Analog Rytm MKI copy of core-ar2 0.7's store.s (sha256 d0fe7d9d6530e42b...), for MKI OS 1.74: the resume addresses only.
| core-ar2 0.2, mod storage (store.c): each hooked routine's first
| instructions (the bytes its jmp site replaces), then a jump to the next.
| Called like the stock routine. MKI 1.74: each routine 0x120 bytes below the MKII's, the same instructions.
        .text
        .globl  st_sound_save_body, st_sound_load_body, st_pat_save_body, st_pat_load_body
        .globl  st_kit_save_body, st_kit_load_body, st_glob_save_body, st_glob_load_body
        .globl  st_pat_init_body, st_track_init_body, st_sound_init_body, st_proj_init_body
        .globl  st_proj_load_body
        .align  2
st_sound_save_body:                     | 0x4000831a
        lea     -24(%sp),%sp
        movem.l %d2-%d4/%a2-%a4,(%sp)
        jmp     0x40008322
st_sound_load_body:                     | 0x400080d6
        lea     -24(%sp),%sp
        movem.l %d2-%d3/%a2-%a5,(%sp)
        jmp     0x400080de
st_pat_save_body:                       | 0x4000925c
        lea     -24(%sp),%sp
        movem.l %d2-%d4/%a2-%a4,(%sp)
        jmp     0x40009264
st_pat_load_body:                       | 0x40009026
        lea     -32(%sp),%sp
        movem.l %d2-%d4/%a2-%a6,(%sp)
        jmp     0x4000902e
st_kit_save_body:                       | 0x400087b6
        lea     -28(%sp),%sp
        movem.l %d2-%d4/%a2-%a5,(%sp)
        jmp     0x400087be
st_kit_load_body:                       | 0x4000851e
        lea     -36(%sp),%sp
        movem.l %d2-%d5/%a2-%a6,(%sp)
        jmp     0x40008526
st_glob_save_body:                      | 0x4000793c
        lea     -16(%sp),%sp
        movem.l %d2-%d3/%a2-%a3,(%sp)
        jmp     0x40007944
st_glob_load_body:                      | 0x4000751c
        lea     -16(%sp),%sp
        movem.l %d2-%d3/%a2-%a3,(%sp)
        jmp     0x40007524
st_pat_init_body:                       | 0x40011998
        lea     -32(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,(%sp)
        jmp     0x400119a0
st_track_init_body:                     | 0x400117c8; the beq after it reads tst's flags
        movea.l 4(%sp),%a0
        tst.l   %a0
        jmp     0x400117ce
st_sound_init_body:                     | 0x40012196
        lea     -40(%sp),%sp
        movem.l %d2-%d4/%a2-%a5,(%sp)
        jmp     0x4001219e
st_proj_init_body:                      | 0x40011c18
        lea     -24(%sp),%sp
        movem.l %d2-%d5/%a2-%a3,(%sp)
        jmp     0x40011c20
st_proj_load_body:                      | 0x4000cc0e
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x4000cc16
