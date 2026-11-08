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

/* Address-register addition leaves X intact, as do the displaced stock operations. */
project_changed:
        movel   %a1,%sp@-
        moveal  core_project_generation,%a1
        addql   #1,%a1
        movel   %a1,core_project_generation
        moveal  %sp@+,%a1
        rts

        .bss
        .balign 4
        .globl  core_project_generation
        .type   core_project_generation,@object
core_project_generation:
        .zero   4
        .size   core_project_generation,4
