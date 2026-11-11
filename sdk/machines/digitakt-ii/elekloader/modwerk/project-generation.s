/* SPDX-License-Identifier: GPL-2.0-or-later */
        .equ    ACTIVE_PROJECT,0x41776c9c
        .text
        .globl  core_project_loaded
        .globl  core_project_created

/* The stock loader also operates on project buffers outside the active project. */
core_project_loaded:
        cmpal   #ACTIVE_PROJECT,%a4
        bne.s   1f
        bsr.s   project_changed
1:      movel   %a3@(24),%a4@(8)
        rts

core_project_created:
        moveal  %d2,%a0
        cmpal   #ACTIVE_PROJECT,%a0
        bne.s   1f
        bsr.s   project_changed
1:      clrl    %a0@(8)
        rts

/* The displaced stock operations leave X intact. Preserve it across the reset. */
project_changed:
        lea     %sp@(-20),%sp
        moveml  %d0-%d1/%a0-%a1,%sp@
        movew   %ccr,%d0
        movel   %d0,%sp@(16)
        addql   #1,core_project_generation
        jsr     core_project_clear_kitdata
        movel   %sp@(16),%d0
        movew   %d0,%ccr
        moveml  %sp@,%d0-%d1/%a0-%a1
        lea     %sp@(20),%sp
        rts

        .bss
        .balign 4
        .globl  core_project_generation
        .globl  core_project_kitdata_generation
        .type   core_project_generation,@object
        .type   core_project_kitdata_generation,@object
core_project_generation:
core_project_kitdata_generation:
        .zero   4
        .size   core_project_generation,4
        .size   core_project_kitdata_generation,4
