| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Digitakt mk1 base: the stock effects event-hooks.s's SETTINGS and render hooks displace,
| re-authored, then the jump back (mw_continue_*: the build's defsym).
        .section .run, "ax"
        .globl mw_resume_settings, mw_resume_render_in, mw_resume_render_out
| a0 <- the menu's vtable; push 2 (the stock call's first argument).
mw_resume_settings:
        movea.l (%a2), %a0
        pea 2
        jmp mw_continue_settings
| d0 <- 0x7fffffff, which the next stock instruction uses.
mw_resume_render_in:
        move.l #0x7fffffff, %d0
        jmp mw_continue_render_in
| Reload d0-d7/a0-a5 from the render's frame, as the stock exit does.
mw_resume_render_out:
        movem.l -168(%fp), %d0-%d7/%a0-%a5
        jmp mw_continue_render_out
