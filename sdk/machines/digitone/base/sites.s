| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Digitone mk1 base: the site entries base.json points at. Each re-authors the effect of the stock
| instructions its site displaces and continues where stock would; continuation addresses and firmware
| routines are the build's defsym. An entry keeps every register the stock code there keeps, and only the
| condition codes the next stock instruction reads. The C parts are params.c, pages.c, projdata.c, menu.c
| and audio.c.
        .section .run, "ax"

| ---- the stock effects event-hooks.s's SETTINGS and render hooks displace ----------------------------------
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
| Reload d0-d7/a0-a5 from the render's frame (link -184), as the stock exit does.
mw_resume_render_out:
        movem.l -184(%fp), %d0-%d7/%a0-%a5
        jmp mw_continue_render_out

| ---- ev_voice_on: the new pitch word d0 stored for voice a1, then the handlers (voice a1, track d2, event a3)
        .globl mw_voice_on
mw_voice_on:
        lea MW_VOICE_PITCH, %a0
        move.l %d0, (%a0,%a1.l*4)
        tst.l ev_voice_on
        beq.s 1f
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l %a3, -(%sp)
        move.l %d2, -(%sp)
        move.l %a1, -(%sp)
        jsr mw_dispatch_voice
        lea 12(%sp), %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
1:      jmp MW_VOICE_ON_DONE

| ---- ev_midi_cc: the CC router's track check (d0 = 8), then the handlers (d2 track, d3 cc, d4 value, d5 flags)
        .globl mw_cc
mw_cc:
        cmp.l %d2, %d0
        blt.s 2f
        tst.l ev_midi_cc
        beq.s 1f
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        moveq #1, %d0
        and.l %d5, %d0
        move.l %d0, -(%sp)
        move.l %d4, -(%sp)
        move.l %d3, -(%sp)
        move.l %d2, -(%sp)
        jsr mw_dispatch_midi_cc
        lea 16(%sp), %sp
        tst.l %d0
        movem.l (%sp), %d0-%d1/%a0-%a1   | movem and lea leave the condition codes
        lea 16(%sp), %sp
        bne.s 2f
1:      jmp MW_CC_ON
2:      jmp MW_CC_EXIT

| ---- ev_note_queue: the queue's entry (event, time), handlers with interrupts masked, then its prologue ---
        .globl mw_queue
mw_queue:
        tst.l ev_note_queue
        beq.s 1f
        move.w %sr, %d0
        move.l %d0, -(%sp)
        move.w #0x2700, %sr
        move.l 12(%sp), -(%sp)
        move.l 12(%sp), -(%sp)
        jsr mw_dispatch_note_queue
        addq.l #8, %sp
        move.l (%sp)+, %d0
        move.w %d0, %sr
1:      lea -20(%sp), %sp
        movem.l %d2-%d4/%a2-%a3, (%sp)
        jmp MW_QUEUE_ON

| ---- ev_key_leds: the frame's call of the views' LED update; the LED manager is the next stack word -------
        .globl mw_hook_leds
mw_hook_leds:
        tst.l ev_key_leds
        beq.s 1f
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l 24(%sp), -(%sp)
        jsr mw_dispatch_key_leds
        addq.l #4, %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
1:      jmp mw_stock_leds

| ---- core_params: a parameter id's UI record. d1 = id -> d0 = the record; a0, a1 and d2 kept ---------------
        .globl mw_uirec_d1
mw_uirec_d1:
        lea -8(%sp), %sp
        movem.l %a0-%a1, (%sp)
        move.l %d1, -(%sp)
        jsr mw_uirec
        addq.l #4, %sp
        movem.l (%sp), %a0-%a1
        addq.l #8, %sp
        rts

| ---- core_pages: a page record by index (4(sp)): a mod page's, else the stock lookup's three first effects --
        .globl mw_page_rec
mw_page_rec:
        move.l 4(%sp), %d0
        cmpi.l #27, %d0
        bcs.s 1f
        lea -12(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        move.l %d0, -(%sp)
        jsr mw_page_find
        addq.l #4, %sp
        movem.l (%sp), %d1/%a0-%a1
        lea 12(%sp), %sp
        tst.l %d0
        beq.s 1f
        rts
1:      move.l %d3, -(%sp)
        moveq #26, %d0
        move.l %d2, -(%sp)
        jmp MW_PAGE_REC_ON

| A key's page view built from (view, list, x, y): with the mod pages inserted, from a list on this stack.
        .globl mw_view_init
mw_view_init:
        lea -12(%sp), %sp           | the vector {begin, end, capacity}
        pea (%sp)
        move.l 24(%sp), -(%sp)      | list
        move.l 24(%sp), -(%sp)      | view
        jsr mw_page_list
        lea 12(%sp), %sp
        tst.l %d0
        beq.s 1f
        move.l 28(%sp), -(%sp)      | y
        move.l 28(%sp), -(%sp)      | x
        pea 8(%sp)                  | the vector
        move.l 28(%sp), -(%sp)      | view
        jsr mw_view_stock
        lea 28(%sp), %sp
        rts
1:      lea 12(%sp), %sp
mw_view_stock:
        lea -28(%sp), %sp
        movem.l %d2-%d5/%a2-%a4, (%sp)
        jmp MW_VIEW_INIT_ON

| ---- core_projdata: each call of the stock serializer, deserializer, project init and template copy --------
| Call the stock routine with the caller's `args` arguments, keep its d0-d1/a0-a1, then `after`(argument
| number `arg`, the stock d0).
        .macro after_call name, stock, args, arg, after
        .globl \name
\name:
        .rept \args
        move.l (4*\args)(%sp), -(%sp)
        .endr
        jsr \stock
        lea (4*\args)(%sp), %sp
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l %d0, -(%sp)
        move.l (20+4*\arg)(%sp), -(%sp)
        jsr \after
        addq.l #8, %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
        rts
        .endm
        after_call mw_pd_save_call, mw_fw_serialize, 5, 1, mw_pd_save
        after_call mw_pd_load_call, mw_fw_deserialize, 3, 2, mw_pd_load
        after_call mw_pd_init_call, mw_fw_init_project, 1, 1, mw_pd_new
        after_call mw_pd_new_copy, mw_fw_memcpy, 3, 1, mw_pd_new
| The file load pushes d4 and calls the deserializer PC-relative; the site is both: push d4 under the return.
        .globl mw_pd_load_file
mw_pd_load_file:
        move.l (%sp), -(%sp)
        move.l %d4, 4(%sp)
        bra.w mw_pd_load_call

| ---- core_audio: the voice-loop gate. The displaced effects, then the owner pick; a muting owner skips the
| main CPU's per-voice filter loop. d0-d1/a0-a1 kept.
        .globl mw_audio_gate
mw_audio_gate:
        move.l %a2, %d6
        movea.l %a2, %a4
        addi.l #48, %d6
        lea 12(%sp), %sp
        tst.l core_audio
        beq.s 1f
        lea -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        jsr mw_audio_pick
        tst.l %d0
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea 16(%sp), %sp
        bne.s 2f
1:      jmp MW_VOICES_LOOP
2:      jmp MW_VOICES_DONE

| ---- the stock table the parameter slots displace (three sites point the stock here) -----------------------
        .section .bss, "aw", @nobits
        .balign 4
        .globl mw_slot_table, mw_slot_table_64, mw_slot_table_end
mw_slot_table:
        .space 64
mw_slot_table_64:
        .space 164
mw_slot_table_end:
