        | SPDX-License-Identifier: GPL-2.0-only
        | ctrl-in-perf - CTRL IN drives a performance macro.
        |
        | Port of rytm-mods-src mods/0017-ctrl-in-perf (MrScruff), written
        | there for OS 1.73, moved to OS 1.74 and core-ar2 0.7 here:
        |   - the audio-interrupt detour is gone: ev_render_in writes the
        |     macros at the start of each audio block, before stock's lock
        |     loop (0x40120fc8) reads them in the same block;
        |   - PERF DEST is a core-ar2 mod storage field (global scope, a
        |     4-bit field per port), not a record in the persisted gap;
        |   - each port's MODE comes from stock's settings getter on the UI
        |     tick, not from the engine's port records.
        | The CONTROL INPUT page's rebuild keeps its one site, where its mode
        | branches converge (CIP_MENU_SITE below).
        |
        | adc_pedal_update leaves each port's value, 0..0x7fff after its
        | mode's mapping, at 0x8000fcf8 + 4p: CV puts CV ZERO LEVEL at 0x4000
        | and CV MAX LEVEL at 0x7fff, EXPR its learned range at 0..0x7fff.
        | A performance macro's value is the word at 0x8000e57c + 2k, 0..0x7f00
        | (knob value << 8), which the knob, the pads and CC 35..47 write and
        | the PERF pad LEDs read back. For a port in CV or EXPR mode with a
        | PERF DEST, the macro's word is written every block, so the CV always
        | wins; the step written changes only when the port moves by more than
        | HYST from the centre of the current step, so ADC noise never moves it.

        .equ    PORT_VALUE,     0x8000fcf8        | longs, per port, 0..0x7fff
        .equ    PERF_TARGET,    0x8000e57c        | words, per macro, 0..0x7f00
        .equ    MODE_CV,        1
        .equ    MODE_EXPR,      2
        .equ    HYST,           192               | 0.75 of a 256-wide step
        .equ    PORTS,          2
        .equ    DESTS,          12

        | Stock routines and data, OS 1.74.
        .equ    CI_SETTINGS_AT, 0x400fa7e4        | (port, record*): 32 B, mode long at +0
        .equ    REC_BYTES,      32
        .equ    mem_new,        0x40082a40
        .equ    std_string_from_cstr, 0x401bcff0
        .equ    project_singleton, 0x4017fa0a

        | A global field's index is the globals slot, 0..3, whose live records
        | sit at GLOBAL_LIVE + 228 k (as Silent Pad+Trig finds it).
        .extern core_store_get, core_store_set
        .extern ctrl_in_perf_dest_1, ctrl_in_perf_dest_2
        .equ    GLOBAL_LIVE,    0x413192ff
        .equ    GLOBAL_STRIDE,  228
        .equ    PROJ_GLOBALS,   236               | the project's ProjectGlobals
        .equ    PROJ_SINGLETON, 0x419f28a8        | 0 while the project is being built
        .equ    VT_RECORD,      52                | -> the active live record
        .equ    VT_CHANGED,     80                | (object, 0): the change notice

        | GLOBAL > CONTROL > CONTROL INPUT 1/2. The view holds its port at +432
        | and its copy of the settings record at +436, mode first. rebuild
        | builds the items for the port's mode and converges at
        | CIP_MENU_SITE, which restores the cursor and returns. Each item is
        | four std::function objects - label, an empty one, the value drawer,
        | the value changer - a 0x54-byte MenuItem, and an append through the
        | view's vtable +8.
        .equ    CIP_MENU_RESUME, 0x40131b34       | CIP_MENU_SITE + 6
        .equ    MENU_ITEM_CTOR, 0x40072fbc        | (item, f1, f2, f3, f4, -1, 8)
        .equ    FN_DTOR,        0x40170b92        | std::function's destructor
        .equ    VIEW_PORT,      432
        .equ    VIEW_MODE,      436
        .equ    VIEW_INVALIDATE, 0x40078580       | (view + 56)
        .equ    TEXT_PRINTF,    0x40071340        | (canvas, font, x, y, align, fmt, ...)
        .equ    CI_FONT,        0x417e3884        | the page's value font
        .equ    FMT_S,          0x402413d4        | "%s"

        .text

        | ------------------------------------------------------------------
        | ev_render_in: each port with a PERF DEST and MODE CV or EXPR sets its
        | macro's word. The tick keeps dest[] and mode[] current.
        | ------------------------------------------------------------------
        .align  2
        .globl  ctrl_in_perf_audio
ctrl_in_perf_audio:
        lea     -12(%sp),%sp
        movem.l %d2-%d4,(%sp)
        moveq   #0,%d2                            | port
1:      lea     dest,%a0
        mvz.b   (%a0,%d2.l),%d4                   | 0 OFF, 1..12
        lea     last_step,%a1
        lea     (%a1,%d2.l*2),%a1
        tst.l   %d4
        beq.s   7f
        lea     mode,%a0
        mvz.b   (%a0,%d2.l),%d3
        lea     PORT_VALUE,%a0
        move.l  (%a0,%d2.l*4),%d0                 | 0..0x7fff
        moveq   #MODE_EXPR,%d1
        cmp.l   %d1,%d3
        beq.s   3f
        moveq   #MODE_CV,%d1
        cmp.l   %d1,%d3
        bne.s   7f                                | OFF or another mode
        sub.l   #0x4000,%d0                       | CV: ZERO..MAX to 0..0x7fff
        bpl.s   2f
        moveq   #0,%d0
2:      add.l   %d0,%d0
        cmp.l   #0x7fff,%d0
        ble.s   3f
        move.l  #0x7fff,%d0
3:      mvs.w   (%a1),%d1                         | last step, -1 none
        bmi.s   4f
        lsl.l   #8,%d1
        add.l   #128,%d1                          | centre of that step
        sub.l   %d0,%d1
        bpl.s   5f
        neg.l   %d1
5:      cmp.l   #HYST,%d1
        ble.s   6f                                | within the dead band: keep the step
4:      lsr.l   #8,%d0                            | 0..127
        move.w  %d0,(%a1)
6:      mvz.w   (%a1),%d0
        lsl.l   #8,%d0
        lea     PERF_TARGET - 2,%a0
        move.w  %d0,(%a0,%d4.l*2)                 | every block: the CV wins
        bra.s   8f
7:      moveq   #-1,%d0                           | not driving: forget the step
        move.w  %d0,(%a1)
8:      addq.l  #1,%d2
        moveq   #PORTS,%d0
        cmp.l   %d0,%d2
        blt.w   1b
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts

        | ------------------------------------------------------------------
        | ev_tick: each port's MODE from stock's settings and its PERF DEST
        | from the active globals slot, for the audio block.
        | ------------------------------------------------------------------
        .align  2
        .globl  ctrl_in_perf_tick
ctrl_in_perf_tick:
        lea     -(REC_BYTES + 4)(%sp),%sp
        move.l  %d2,REC_BYTES(%sp)
        moveq   #0,%d2
1:      move.l  %sp,-(%sp)
        move.l  %d2,-(%sp)
        jsr     CI_SETTINGS_AT
        addq.l  #8,%sp
        move.l  (%sp),%d0                         | the mode long
        lea     mode,%a0
        move.b  %d0,(%a0,%d2.l)
        move.l  %d2,%d0
        bsr.w   dest_get
        lea     dest,%a0
        move.b  %d0,(%a0,%d2.l)
        addq.l  #1,%d2
        moveq   #PORTS,%d0
        cmp.l   %d0,%d2
        blt.s   1b
        move.l  REC_BYTES(%sp),%d2
        lea     REC_BYTES + 4(%sp),%sp
        rts

        | dest_get(d0 = port) -> d0 = 0 OFF or 1..12, the active globals
        | slot's; 0 while the project is being built. Clobbers d1/a0/a1.
        .align  2
dest_get:
        tst.l   PROJ_SINGLETON
        beq.s   8f
        move.l  %d0,-(%sp)
        bsr.w   rec_active
        bsr.w   gslot
        move.l  (%sp)+,%d1
        tst.l   %d0
        bmi.s   8f
        bsr.w   field_of
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  %a1,-(%sp)                        | the field
        jsr     core_store_get
        lea     12(%sp),%sp
        moveq   #DESTS,%d1
        cmp.l   %d1,%d0
        bhi.s   8f
        rts
8:      moveq   #0,%d0
        rts

        | dest_set(d0 = port, d1 = value): the active slot's, and the
        | globals' change notice, so stock saves them (and core the field with
        | them). Clobbers d0/d1/a0/a1.
        .align  2
dest_set:
        lea     -8(%sp),%sp
        movem.l %d2-%d3,(%sp)
        move.l  %d0,%d2
        move.l  %d1,%d3
        tst.l   PROJ_SINGLETON
        beq.s   9f
        bsr.w   rec_active
        bsr.w   gslot
        tst.l   %d0
        bmi.s   9f
        move.l  %d2,%d1
        bsr.w   field_of
        move.l  %d3,-(%sp)                        | value
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  %a1,-(%sp)                        | the field
        jsr     core_store_set
        lea     16(%sp),%sp
        lea     dest,%a0                          | the audio block sees it now
        move.b  %d3,(%a0,%d2.l)
        jsr     project_singleton
        add.l   #PROJ_GLOBALS,%d0
        move.l  %d0,%a0
        clr.l   -(%sp)
        move.l  %a0,-(%sp)
        move.l  (%a0),%a0
        move.l  VT_CHANGED(%a0),%a0
        jsr     (%a0)
        addq.l  #8,%sp
9:      movem.l (%sp),%d2-%d3
        lea     8(%sp),%sp
        rts

        | field_of(d1 = port) -> a1 = its field's descriptor.
        .align  2
field_of:
        movea.l #ctrl_in_perf_dest_1,%a1
        tst.l   %d1
        beq.s   1f
        movea.l #ctrl_in_perf_dest_2,%a1
1:      rts

        | gslot(a0 = live globals record) -> d0 = its slot 0..3, or -1.
        | Clobbers d0/d1.
        .align  2
gslot:
        move.l  %a0,%d0
        sub.l   #GLOBAL_LIVE,%d0
        bcs.s   8f
        moveq   #0,%d1
1:      tst.l   %d0
        beq.s   9f
        sub.l   #GLOBAL_STRIDE,%d0
        bcs.s   8f
        addq.l  #1,%d1
        cmp.l   #4,%d1
        blt.s   1b
8:      moveq   #-1,%d0
        rts
9:      move.l  %d1,%d0
        rts

        | rec_active() -> a0 = the active live globals record (ProjectGlobals'
        | vtable +52, as stock's getters ask). Clobbers d0/d1/a0/a1.
        .align  2
rec_active:
        jsr     project_singleton
        add.l   #PROJ_GLOBALS,%d0
        move.l  %d0,%a0
        move.l  %a0,-(%sp)
        move.l  (%a0),%a0
        move.l  VT_RECORD(%a0),%a0
        jsr     (%a0)
        addq.l  #4,%sp
        move.l  %d0,%a0
        rts

        | ------------------------------------------------------------------
        | ctrl_in_perf_menu: over the 6 bytes at CIP_MENU_SITE, where
        | rebuild's mode branches converge. a2 the view, d6 the cursor; past
        | here rebuild uses nothing else and its epilogue restores d2..d7 and
        | a2..fp, so this may use them. Appends PERF DEST in CV and EXPR.
        | ------------------------------------------------------------------
        .align  2
        .globl  ctrl_in_perf_menu
ctrl_in_perf_menu:
        move.l  VIEW_MODE(%a2),%d0
        subq.l  #MODE_CV,%d0
        moveq   #MODE_EXPR - MODE_CV,%d1
        cmp.l   %d1,%d0
        bhi.w   9f                                | OFF or another mode: no item
        lea     -64(%sp),%sp                      | four std::function, 16 B each:
        move.l  %sp,%a3                           | +0 data, +4, +8 manager, +12 invoker
        moveq   #15,%d1
        move.l  %a3,%a0
1:      clr.l   (%a0)+
        subq.l  #1,%d1
        bpl.s   1b
        move.l  %a2,(%a3)                         | label, the view in place
        move.l  #cip_mgr,%d0
        move.l  %d0,8(%a3)
        move.l  #cip_label,%d0
        move.l  %d0,12(%a3)
        move.l  %a2,32(%a3)                       | drawer
        move.l  #cip_mgr,%d0
        move.l  %d0,40(%a3)
        move.l  #cip_draw,%d0
        move.l  %d0,44(%a3)
        move.l  %a2,48(%a3)                       | changer
        move.l  #cip_mgr,%d0
        move.l  %d0,56(%a3)
        move.l  #cip_change,%d0
        move.l  %d0,60(%a3)
        pea     0x54
        jsr     mem_new
        addq.l  #4,%sp
        move.l  %d0,%d7
        pea     0x8
        pea     -1
        pea     48(%a3)
        pea     32(%a3)
        pea     16(%a3)
        pea     (%a3)
        move.l  %d7,-(%sp)
        jsr     MENU_ITEM_CTOR
        lea     28(%sp),%sp
        move.l  (%a2),%a0
        move.l  8(%a0),%a0                        | append
        move.l  %d7,-(%sp)
        move.l  %a2,-(%sp)
        jsr     (%a0)
        addq.l  #8,%sp
        moveq   #3,%d2
2:      move.l  %d2,%d0
        lsl.l   #4,%d0
        pea     (%a3,%d0.l)
        jsr     FN_DTOR
        addq.l  #4,%sp
        subq.l  #1,%d2
        bpl.s   2b
        lea     64(%sp),%sp
9:      move.l  (%a2),%a0                         | displaced
        clr.l   -(%sp)
        move.l  %d6,-(%sp)
        jmp     CIP_MENU_RESUME

        | cip_label(a0 = the std::string to construct) -> d0 = a0, as stock's
        | label invokers.
        .align  2
cip_label:
        link.w  %fp,#-4
        move.l  %d2,-(%sp)
        pea     -1(%fp)
        pea     txt_label
        move.l  %a0,%d2
        move.l  %a0,-(%sp)
        jsr     std_string_from_cstr
        lea     12(%sp),%sp
        move.l  %d2,%d0
        move.l  -8(%fp),%d2
        unlk    %fp
        rts

        | cip_draw(functor, item, canvas, x, y): OFF or PFn, drawn as the page
        | draws MODE.
        .align  2
cip_draw:
        move.l  4(%sp),%a0
        move.l  (%a0),%a0                         | the view
        move.l  VIEW_PORT(%a0),%d0
        lea     dest,%a0
        mvz.b   (%a0,%d0.l),%d0
        tst.l   %d0
        bne.s   1f
        pea     txt_off
        pea     FMT_S
        bra.s   2f
1:      move.l  %d0,-(%sp)
        pea     txt_pf
2:      pea     0x4
        move.l  32(%sp),%d0                       | y
        addq.l  #2,%d0
        move.l  %d0,-(%sp)
        move.l  32(%sp),%d0                       | x
        add.l   #19,%d0
        move.l  %d0,-(%sp)
        pea     CI_FONT
        move.l  36(%sp),-(%sp)                    | canvas
        jsr     TEXT_PRINTF
        lea     28(%sp),%sp
        rts

        | cip_change(functor, item, delta): PERF DEST of the view's port, 0..12,
        | in the active globals slot. Then the view is invalidated: the value
        | is not a stock setting, so no setter's notification redraws it.
        .align  2
cip_change:
        move.l  12(%sp),%d1                       | delta
        beq.s   9f
        move.l  %a2,-(%sp)
        move.l  %d2,-(%sp)
        move.l  12(%sp),%a0
        move.l  (%a0),%a2                         | the view
        move.l  %d1,%d2
        move.l  VIEW_PORT(%a2),%d0
        lea     dest,%a0
        mvz.b   (%a0,%d0.l),%d1
        add.l   %d2,%d1
        bpl.s   3f
        moveq   #0,%d1
3:      moveq   #DESTS,%d2
        cmp.l   %d2,%d1
        ble.s   4f
        move.l  %d2,%d1
4:      bsr.w   dest_set
        pea     56(%a2)
        jsr     VIEW_INVALIDATE
        addq.l  #4,%sp
        move.l  (%sp)+,%d2
        move.l  (%sp)+,%a2
9:      rts

        | cip_mgr(dest, source, op): the std::function manager for a functor
        | stored in place - the view pointer. 0 names the type (this routine's
        | address stands in for its typeinfo), 1 answers the functor's address,
        | 2 copies the pointer, 3 has nothing to free.
        .align  2
cip_mgr:
        move.l  4(%sp),%a0                        | dest
        move.l  12(%sp),%d0                       | op
        bne.s   1f
        move.l  #cip_mgr,(%a0)
        bra.s   9f
1:      subq.l  #1,%d0
        bne.s   2f
        move.l  8(%sp),(%a0)
        bra.s   9f
2:      subq.l  #1,%d0
        bne.s   9f
        move.l  8(%sp),%a1
        move.l  (%a1),(%a0)
9:      moveq   #0,%d0
        rts

txt_label:
        .asciz  "PERF DEST"
txt_off:
        .asciz  "OFF"
txt_pf:
        .asciz  "PF%d"

        | ------------------------------------------------------------------
        | State. dest[] and mode[] are written by the UI (tick and changer),
        | last_step[] by the audio block.
        | ------------------------------------------------------------------
        .data
        .align  2
last_step:
        .short  -1, -1
dest:
        .byte   0, 0
mode:
        .byte   0, 0
