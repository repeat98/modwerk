| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm core (Modwerk): the stock routines store.c wraps, run as stock would.
|
| Each storage site puts a jmp to store.c's hook on a stock routine's first instructions. The hook calls the
| matching *_body here with the same arguments: it redoes what the replaced instructions did (the routine's frame
| and its saved registers) and goes on in stock at the site's end, ST_*_RET (mod.json defsym), so stock returns to
| the hook with its own result. Called with the C ABI.

        .section .run, "ax"

        .macro body name, frame, regs, resume
        .ifndef \resume
        .error "store.s: \resume is not defined for this machine"
        .endif
        .globl \name
\name:
        lea -\frame(%sp), %sp
        movem.l \regs, (%sp)
        jmp \resume
        .endm

        body st_sound_save_body, 24, %d2-%d4/%a2-%a4, ST_SOUND_SAVE_RET
        body st_sound_load_body, 24, %d2-%d3/%a2-%a5, ST_SOUND_LOAD_RET
        body st_pat_save_body, 24, %d2-%d4/%a2-%a4, ST_PAT_SAVE_RET
        body st_pat_load_body, 32, %d2-%d4/%a2-%a6, ST_PAT_LOAD_RET
        body st_kit_save_body, 28, %d2-%d4/%a2-%a5, ST_KIT_SAVE_RET
        body st_kit_load_body, 36, %d2-%d5/%a2-%a6, ST_KIT_LOAD_RET
        body st_glob_save_body, 16, %d2-%d3/%a2-%a3, ST_GLOB_SAVE_RET
        body st_glob_load_body, 16, %d2-%d3/%a2-%a3, ST_GLOB_LOAD_RET
        body st_pat_init_body, 32, %d2-%d7/%a2-%a3, ST_PAT_INIT_RET
        body st_sound_init_body, 40, %d2-%d4/%a2-%a5, ST_SOUND_INIT_RET
        body st_proj_init_body, 24, %d2-%d5/%a2-%a3, ST_PROJ_INIT_RET
        body st_proj_load_body, 44, %d2-%d7/%a2-%a6, ST_PROJ_LOAD_RET

| Track init has no frame: it loads its track into a0 and tests it, and the branch at ST_TRACK_INIT_RET reads
| those condition codes.
        .ifndef ST_TRACK_INIT_RET
        .error "store.s: ST_TRACK_INIT_RET is not defined for this machine"
        .endif
        .globl st_track_init_body
st_track_init_body:
        movea.l 4(%sp), %a0
        tst.l %a0
        jmp ST_TRACK_INIT_RET
