| SPDX-License-Identifier: GPL-3.0-or-later
| Original SETTINGS/render adapters. Displaced instructions are filled locally,
| or, assembled with MW_BASE, authored by the machine's base (mw_resume_*).
| Each render hook saves and restores EMAC around its handlers, so handler EMAC
| state cannot leak, wherever the stock restores its own.
| EMAC access follows MCF54418RM 5.3.1.2 (rounding disabled for raw state).
        .section .run, "ax"
        .macro event_save
        lea -64(%sp), %sp
        movem.l %d0-%d7/%a0-%a6, (%sp)
        move.w %sr, %d0
        move.l %d0, 60(%sp)
        .endm

        | Private 32-byte state: status, mask, extensions, four accumulators.
        .macro emac_save
        lea -32(%sp), %sp
        move.l %macsr, %d7
        move.l %d7, (%sp)
        moveq #0, %d0
        move.l %d0, %macsr
        move.l %acc0, %d0
        move.l %acc1, %d1
        move.l %acc2, %d2
        move.l %acc3, %d3
        movem.l %d0-%d3, 16(%sp)
        move.l %accext01, %d4
        move.l %accext23, %d5
        movem.l %d4-%d5, 8(%sp)
        move.l %mask, %d6
        move.l %d6, 4(%sp)
        move.l %d7, %macsr
        .endm
        .macro emac_restore
        moveq #0, %d0
        move.l %d0, %macsr
        movem.l 16(%sp), %d0-%d3
        move.l %d0, %acc0
        move.l %d1, %acc1
        move.l %d2, %acc2
        move.l %d3, %acc3
        movem.l 8(%sp), %d4-%d5
        move.l %d4, %accext01
        move.l %d5, %accext23
        move.l 4(%sp), %d6
        move.l %d6, %mask
        move.l (%sp), %d7
        move.l %d7, %macsr
        lea 32(%sp), %sp
        .endm
        .macro event_restore
        move.l 60(%sp), %d0
        move.w %d0, %sr
        movem.l (%sp), %d0-%d7/%a0-%a6
        lea 64(%sp), %sp
        | A call replaced an inline block. Discard its extra return address.
        lea 4(%sp), %sp
        .endm

        .globl mw_hook_settings
mw_hook_settings:
        event_save
        move.l %a2, -(%sp)
        jsr mw_dispatch_settings
        addq.l #4, %sp
        event_restore
        jmp mw_resume_settings

        .macro render_hook event
        .globl mw_hook_\event
mw_hook_\event:
        event_save
        emac_save
        jsr mw_dispatch_\event
        emac_restore
        event_restore
        jmp mw_resume_\event
        .endm
        render_hook render_in
        render_hook render_out

        .ifdef MW_BASE
        | ev_render_voices: as the render hooks, handlers get the base's track blocks.
        .globl mw_hook_render_voices
mw_hook_render_voices:
        event_save
        emac_save
        pea mw_fw_track_blocks
        jsr mw_dispatch_render_voices
        addq.l #4, %sp
        emac_restore
        event_restore
        jmp mw_resume_render_voices
        .else

        | CI emits zero placeholders. Only the local stock reader fills them.
        .macro resume event
        .globl mw_resume_\event
mw_resume_\event:
        .space 6
        jmp mw_continue_\event
        .endm
        resume settings
        resume render_in
        resume render_out
        .endif
