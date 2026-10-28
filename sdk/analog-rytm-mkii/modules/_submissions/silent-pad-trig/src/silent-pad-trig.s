        | SPDX-License-Identifier: GPL-2.0-only
        | silent-pad-trig - two SEQUENCER CONFIG checkboxes:
        |   SILENT PAD+TRIG     stopped, playing, GRID REC and every mode but
        |                       LIVE and STEP REC: a pad or TRIG key 1-12 press
        |                       selects its track, silent; FUNC + pad plays it
        |   SILENT PAD LIVEREC  LIVE REC: a pad press selects its track, silent,
        |                       and records nothing; FUNC + pad plays and records.
        |                       TRIG keys play and record there, as stock.
        | STEP REC is stock. Aftertouch is untouched, so a held pad modulates
        | its track without sounding.
        |
        | A new mod, not a port, first written as pad-select (PAD+TRIG SEL
        | TRK) in an unpublished rytm2_mods checkout. Each setting is a
        | core-ar2 0.3 mod storage field (silent_pad_trig_on,
        | silent_live_rec_on: global scope, one bit per globals slot), saved
        | with the project's globals; a slot saved without one loads it
        | unchecked. The slot lookup follows voice-dac 1.2's DAC SUM
        | (MrScruff's mod, the elemod port's dac_gslot).
        |
        | KeyboardView handles the pads (slot 19, 0x400c78c0) and the TRIG keys
        | (slot 2, 0x400c7b84) outside CHROMATIC mode. Both play through one
        | routine, 0x400c772e (view, src, track, track, note, vel, retrig), src
        | 1 a pad and 0 a TRIG key, which triggers the voice and the MIDI note
        | (0x400c6f18) and keeps the held note for the release. Nothing else
        | calls it: CHRO pads (ChromPadsView), TRIG + YES, MIDI in and the
        | sequencer reach the voice trigger by their own paths.
        |
        | While the setting for the view's sequencer state is checked
        | (active()), at OS 1.74's addresses:
        |   play_gate   0x400c772e  the play routine returns at once unless
        |                           FUNC is held: no voice, no MIDI, no held note
        |   autotrk     0x400c7a3e  both handlers' AUTO TRK SWITCH test reads
        |               0x400c7e90  on for a silent press, so it selects its track
        |   func_gate   0x400c7950  the pad handler's FUNC test reads off, so
        |                           FUNC + pad plays at the pad's velocity, not VEL
        | and for the switches, two SEQUENCER CONFIG items after AUTO TRK SWITCH:
        |   menu_add    0x400ec184  SeqSettingsMenuView's constructor, between
        |                           AUTO TRK SWITCH's item and SAMPLE POS RES's
        |
        | core-ar2 0.3 is OS 1.74 only, so only the 1.74 port builds.

        .include "../include/ar2-1.74.inc"

        .equ    PLAY_RESUME,    0x400c7734        | the play routine past `linkw; moveq`
        .equ    AUTOTRK_GET,    0x400b606c        | AUTO TRK SWITCH's getter (globals)
        .equ    FUNC_RESUME,    0x400c7956        | the pad handler's `addql #4,%sp`
        .equ    VIEW_SEQ,       0x8c              | KeyboardView: the sequencer state
        .equ    LIVE_GET,       0x40036370        | state: LIVE REC (+0x169, while playing)
        .equ    STEP_GET,       0x400363bc        | state: STEP REC (+0x16a)

        | core-ar2 0.3's mod storage: the field's descriptor is an absolute
        | symbol elekloader defines; core_store_get(field, item, index) and
        | core_store_set(field, item, index, value) clobber d0-d1/a0-a1. A
        | global field's index is the globals slot, 0..3: the live records sit
        | at GLOBAL_LIVE + 228 k (core-ar2's GLOBAL_LIVE, as voice-dac has it).
        .extern core_store_get, core_store_set, silent_pad_trig_on, silent_live_rec_on
        .equ    GLOBAL_LIVE,    0x413192ff
        .equ    GLOBAL_STRIDE,  228
        .equ    PROJ_GLOBALS,   236               | the project's ProjectGlobals
        .equ    PROJ_SINGLETON, 0x419f28a8        | project_singleton's project, 0
                                                  | while it is being built
        .equ    VT_RECORD,      52                | -> the active live record
        .equ    VT_CHANGED,     80                | (object, 0): the change notice

        | SeqSettingsMenuView's item list, 0x400ebdb6. Each item is four
        | std::function objects - label, action (YES), drawer, changer
        | (LEFT/RIGHT) - a 0x54-byte MenuItem, and an append. A std::function
        | is 16 bytes: its storage at +0, its manager at +8, its invoker at +12.
        | AUTO TRK SWITCH's managers serve ours: the label's keeps a 1-byte
        | empty functor, the action's a 4-byte one holding the view.
        .equ    MENU_RESUME,    0x400ec18c        | after `clrl %sp@(72); pea 0x1`
        .equ    MENU_ITEM_CTOR, 0x40072fbc        | (item, label, action, drawer, changer, -1, 8)
        .equ    MENU_APPEND,    0x400727f2        | (view, item)
        .equ    FN_DTOR,        0x40170b92        | (std::function *)
        .equ    MGR_EMPTY,      0x400ebb3c
        .equ    MGR_VIEW,       0x400ebb8e
        .equ    BITMAP_DRAW,    0x400716e0        | (canvas, bitmap, x, y, 0)
        .equ    CHECK_GLYPHS,   0x419f0910        | RAM: -> the checkbox glyphs, 28 B each
        .equ    VIEW_INVALIDATE, 0x40078580       | (view + 56)
        .equ    MENU_ITEM_SIZE, 0x54

        .text

        | ------------------------------------------------------------------
        | play_gate: the play routine's entry, over `linkw %fp,#-64; moveq
        | #127,%d0`, both re-emitted. The arguments are on the stack: the view
        | at %sp@(4), src at %sp@(8) (1 a pad, 0 a TRIG key); d0/d1/a0/a1 are
        | free, as at any call. Whether this press is silent is kept in
        | pl_last for autotrk, which both handlers reach after this call with
        | nothing branching in between.
        | ------------------------------------------------------------------
        .align  2
        .globl  silent_pad_trig_play_gate
silent_pad_trig_play_gate:
        move.l  4(%sp),%a0
        move.l  8(%sp),%d1                        | src: a pad stays gated in LIVE REC
        bsr.w   active
        tst.l   %d0
        beq.s   1f
        pea     KEY_FUNC
        jsr     is_key_held
        addq.l  #4,%sp
        tst.l   %d0
        bne.s   1f                                | FUNC + pad: plays
        moveq   #1,%d0
        move.l  %d0,pl_last                       | silent: autotrk selects
        rts                                       | silent: no voice, no MIDI, no
                                                  | held note, nothing recorded
1:      clr.l   pl_last                           | plays: AUTO TRK SWITCH decides
        link.w  %fp,#-64                          | displaced
        moveq   #127,%d0                          | displaced
        jmp     PLAY_RESUME

        | ------------------------------------------------------------------
        | autotrk(globals): in place of AUTO TRK SWITCH's getter at both
        | handlers' calls. On for a silent press - as play_gate found it for
        | this press - so the handler selects the pressed track as with AUTO
        | TRK SWITCH checked; for a press that plays (FUNC + pad, a TRIG key
        | in LIVE REC, STEP REC, the setting off), the getter itself, with the
        | same argument.
        | ------------------------------------------------------------------
        .align  2
        .globl  silent_pad_trig_autotrk
silent_pad_trig_autotrk:
        tst.l   pl_last
        beq.s   1f
        moveq   #1,%d0
        rts
1:      jmp     AUTOTRK_GET

        | ------------------------------------------------------------------
        | func_gate: the pad handler's FUNC test, over `pea 0x80; jsr %a3@`
        | (a3 is_key_held), re-emitted. While active() for a pad, FUNC reads
        | not held, so the pad's own velocity is taken; play_gate still sees
        | FUNC and plays. The pea stays pushed for the addql at FUNC_RESUME.
        | a2 is the view; d1/a0/a1 are not read before they are written.
        | ------------------------------------------------------------------
        .align  2
        .globl  silent_pad_trig_func_gate
silent_pad_trig_func_gate:
        pea     KEY_FUNC                          | displaced
        jsr     (%a3)                             | displaced
        tst.l   %d0
        beq.s   1f
        move.l  %a2,%a0
        moveq   #1,%d1                            | a pad
        bsr.w   active
        eori.l  #1,%d0                            | held, and reported only when off
1:      jmp     FUNC_RESUME

        | ------------------------------------------------------------------
        | active(a0 = KeyboardView, d1 = 1 a pad, 0 a TRIG key) -> d0 = 1
        | when the press is gated: in STEP REC never; in LIVE REC a pad while
        | SILENT PAD LIVEREC is checked, a TRIG key never; otherwise while SILENT
        | PAD+TRIG is checked. Else 0. Clobbers d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
active:
        move.l  %d2,-(%sp)
        move.l  %a2,-(%sp)
        move.l  %a0,%a2
        move.l  %d1,%d2
        move.l  VIEW_SEQ(%a2),-(%sp)
        jsr     STEP_GET
        addq.l  #4,%sp
        tst.b   %d0
        bne.s   8f                                | STEP REC: stock
        move.l  VIEW_SEQ(%a2),-(%sp)
        jsr     LIVE_GET
        addq.l  #4,%sp
        tst.b   %d0
        beq.s   6f
        tst.l   %d2
        beq.s   8f                                | LIVE REC, a TRIG key: stock
        movea.l #silent_live_rec_on,%a1           | LIVE REC, a pad
        bra.s   7f
6:      movea.l #silent_pad_trig_on,%a1           | every other state
7:      bsr.w   flag_get
        bra.s   9f
8:      moveq   #0,%d0
9:      move.l  (%sp)+,%a2
        move.l  (%sp)+,%d2
        rts

        | ------------------------------------------------------------------
        | The flags: a field's value for the active globals slot.
        |   flag_get(a1 = field) -> d0 = 0 or 1; 0 while the project is being
        |                   built (boot), or when the active record is none
        |                   of the four slots
        |   flag_set(a1 = field, d0 = value)  the active slot's, and the
        |                   globals' change notice, so stock saves them (and
        |                   core the fields with them)
        |   gslot(a0 = live globals record) -> d0 = its slot 0..3, or -1;
        |                   clobbers d0/d1 (voice-dac's dac_gslot)
        |   rec_active() -> a0 = the active live record (ProjectGlobals'
        |                   vtable +52, as stock's getters ask)
        | All but gslot clobber d0/d1/a0/a1. project_singleton builds the
        | project when there is none, so each first checks it exists.
        | ------------------------------------------------------------------
        .align  2
flag_get:
        tst.l   PROJ_SINGLETON
        beq.s   8f
        move.l  %a1,-(%sp)
        bsr.w   rec_active
        bsr.w   gslot
        move.l  (%sp)+,%a1
        tst.l   %d0
        bmi.s   8f
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  %a1,-(%sp)                        | the field
        jsr     core_store_get
        lea     12(%sp),%sp
        rts
8:      moveq   #0,%d0
        rts

        .align  2
flag_set:
        lea     -8(%sp),%sp
        movem.l %d2/%a2,(%sp)
        move.l  %d0,%d2
        move.l  %a1,%a2
        tst.l   PROJ_SINGLETON
        beq.s   9f
        bsr.w   rec_active
        bsr.w   gslot
        tst.l   %d0
        bmi.s   9f
        move.l  %d2,-(%sp)                        | value
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  %a2,-(%sp)                        | the field
        jsr     core_store_set
        lea     16(%sp),%sp
        jsr     project_singleton                 | the globals changed, so the
        add.l   #PROJ_GLOBALS,%d0                 | project saves them, as a
        move.l  %d0,%a0                           | stock setter's notice does
        clr.l   -(%sp)
        move.l  %a0,-(%sp)
        move.l  (%a0),%a0
        move.l  VT_CHANGED(%a0),%a0
        jsr     (%a0)
        addq.l  #8,%sp
9:      movem.l (%sp),%d2/%a2
        lea     8(%sp),%sp
        rts

        .align  2
gslot:
        move.l  %a0,%d0
        sub.l   #GLOBAL_LIVE,%d0
        bcs.s   8f                                | below slot 0
        moveq   #0,%d1
1:      tst.l   %d0
        beq.s   9f
        sub.l   #GLOBAL_STRIDE,%d0
        bcs.s   8f                                | between two slots
        addq.l  #1,%d1
        cmp.l   #4,%d1
        blt.s   1b
8:      moveq   #-1,%d0
        rts
9:      move.l  %d1,%d0
        rts

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
        | menu_add: SeqSettingsMenuView's constructor, between AUTO TRK
        | SWITCH's item and SAMPLE POS RES's, over `clrl %sp@(72); pea 0x1`,
        | re-emitted after. a3 is the view; a2 (mem_new), d2..d5 and the stack
        | are as SAMPLE POS RES's item expects them, so the registers used
        | here are saved, and each item's four functions live in a frame of
        | item_add's own. SILENT PAD+TRIG first, then SILENT PAD LIVEREC.
        | ------------------------------------------------------------------
        .align  2
        .globl  silent_pad_trig_menu_add
silent_pad_trig_menu_add:
        lea     -16(%sp),%sp
        movem.l %d2-%d4/%a2,(%sp)
        lea     items_main,%a0
        move.l  %a0,%d4
        bsr.w   item_add
        lea     items_live,%a0
        move.l  %a0,%d4
        bsr.w   item_add
        movem.l (%sp),%d2-%d4/%a2
        lea     16(%sp),%sp
        clr.l   72(%sp)                           | displaced
        pea     0x1                               | displaced
        jmp     MENU_RESUME

        | item_add(d4 = the item's invokers: label, action, drawer, changer;
        | a3 = the view): build one MenuItem and append it. Clobbers
        | d0-d3/a0-a2.
        .align  2
item_add:
        lea     -64(%sp),%sp
        move.l  %sp,%a0
        moveq   #15,%d1
1:      clr.l   (%a0)+
        subq.l  #1,%d1
        bpl.s   1b
        move.l  %d4,%a0
        moveq   #0,%d2                            | label: an empty functor
        move.l  (%a0),%a2
        bsr.w   fn_empty
        move.l  %d4,%a0
        moveq   #16,%d2                           | action: holds the view
        move.l  4(%a0),%a2
        bsr.w   fn_view
        move.l  %d4,%a0
        moveq   #32,%d2                           | drawer: empty
        move.l  8(%a0),%a2
        bsr.w   fn_empty
        move.l  %d4,%a0
        moveq   #48,%d2                           | changer: holds the view
        move.l  12(%a0),%a2
        bsr.w   fn_view
        pea     MENU_ITEM_SIZE
        jsr     mem_new
        addq.l  #4,%sp
        move.l  %d0,%d2                           | the item
        lea     48(%sp),%a0
        lea     32(%sp),%a1
        lea     16(%sp),%a2
        move.l  %sp,%d3
        pea     8
        pea     -1
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %a2,-(%sp)
        move.l  %d3,-(%sp)
        move.l  %d2,-(%sp)
        jsr     MENU_ITEM_CTOR
        lea     28(%sp),%sp
        move.l  %d2,-(%sp)
        move.l  %a3,-(%sp)
        jsr     MENU_APPEND
        addq.l  #8,%sp
        moveq   #48,%d2
2:      lea     (%sp,%d2.l),%a0
        move.l  %a0,-(%sp)
        jsr     FN_DTOR
        addq.l  #4,%sp
        moveq   #16,%d1
        sub.l   %d1,%d2
        bpl.s   2b
        lea     64(%sp),%sp
        rts

        | fn_empty / fn_view(a2 = invoker, d2 = the function's offset in
        | item_add's frame, 4 bytes up past this call's return address): the
        | storage from mem_new - 1 byte, or 4 holding the view (a3) as stock's
        | toggle keeps it - and the manager to match. Clobber d0/d1/a0/a1.
        .align  2
fn_empty:
        pea     1
        jsr     mem_new
        addq.l  #4,%sp
        move.l  #MGR_EMPTY,%d1
        bra.s   fn_fill

        .align  2
fn_view:
        pea     4
        jsr     mem_new
        addq.l  #4,%sp
        move.l  %d0,%a0
        move.l  %a3,(%a0)
        move.l  #MGR_VIEW,%d1
fn_fill:
        lea     4(%sp,%d2.l),%a0
        move.l  %d0,(%a0)
        move.l  %d1,8(%a0)
        move.l  %a2,12(%a0)
        rts

        | Each item's invokers: an entry per item that names its text or
        | field in a1, then the shared body.
        .align  2
items_main:
        .long   lbl_main, act_main, drw_main, chg_main
items_live:
        .long   lbl_live, act_live, drw_live, chg_live

        | lbl_*(a0 = the std::string to construct) -> d0 = a0, as stock's
        | label invokers (AUTO TRK SWITCH's, OS 1.74 0x400eb710).
        .align  2
lbl_main:
        lea     txt_main,%a1
        bra.s   lbl_invoke
lbl_live:
        lea     txt_live,%a1
lbl_invoke:
        link.w  %fp,#-4
        move.l  %d2,-(%sp)
        pea     -1(%fp)
        move.l  %a1,-(%sp)
        move.l  %a0,%d2
        move.l  %a0,-(%sp)
        jsr     std_string_from_cstr
        lea     12(%sp),%sp
        move.l  %d2,%d0
        move.l  -8(%fp),%d2
        unlk    %fp
        rts

        | act_*(functor): YES toggles. chg_*(functor, -, delta): RIGHT
        | checks, LEFT unchecks. The functor's storage points at the view,
        | invalidated after, as no stock setting's notice redraws ours. The
        | field rides on the stack under the saved a2 until flag_set.
        .align  2
act_main:
        movea.l #silent_pad_trig_on,%a1
        bra.s   act_invoke
act_live:
        movea.l #silent_live_rec_on,%a1
act_invoke:
        move.l  4(%sp),%a0
        move.l  %a2,-(%sp)
        move.l  %a1,-(%sp)
        move.l  (%a0),%a0
        move.l  (%a0),%a2                         | the view
        bsr.w   flag_get
        moveq   #1,%d1
        eor.l   %d1,%d0
        bra.s   set_redraw

        .align  2
chg_main:
        movea.l #silent_pad_trig_on,%a1
        bra.s   chg_invoke
chg_live:
        movea.l #silent_live_rec_on,%a1
chg_invoke:
        move.l  12(%sp),%d1
        bne.s   1f
        rts
1:      move.l  4(%sp),%a0
        move.l  %a2,-(%sp)
        move.l  %a1,-(%sp)
        move.l  (%a0),%a0
        move.l  (%a0),%a2
        moveq   #0,%d0
        tst.l   %d1
        bmi.s   set_redraw
        moveq   #1,%d0
set_redraw:                                       | d0 the value, a2 the view;
        move.l  (%sp)+,%a1                        | the field, then a2, pushed
        bsr.w   flag_set
        pea     56(%a2)
        jsr     VIEW_INVALIDATE
        addq.l  #4,%sp
        move.l  (%sp)+,%a2
        rts

        | drw_*(functor, -, canvas, x, y): the checkbox, as AUTO TRK SWITCH's
        | drawer (OS 1.74 0x400ec450) draws it: glyph 0 or 1 of the table at
        | CHECK_GLYPHS, at x + 11, called with a frame of its own.
        .align  2
drw_main:
        movea.l #silent_pad_trig_on,%a1
        bra.s   drw_invoke
drw_live:
        movea.l #silent_live_rec_on,%a1
drw_invoke:
        bsr.w   flag_get
        move.l  %d0,%d1
        lsl.l   #2,%d1
        lsl.l   #5,%d0
        sub.l   %d1,%d0                           | 28 * flag
        add.l   CHECK_GLYPHS,%d0
        move.l  12(%sp),%a0                       | canvas
        move.l  16(%sp),%d1
        add.l   #11,%d1                           | x
        move.l  20(%sp),%a1                       | y
        clr.l   -(%sp)                            | a frame of its own: the
        move.l  %a1,-(%sp)                        | caller's arguments stay
        move.l  %d1,-(%sp)                        | as it pushed them
        move.l  %d0,-(%sp)
        move.l  %a0,-(%sp)
        jsr     BITMAP_DRAW
        lea     20(%sp),%sp
        rts

txt_main:
        .asciz  "SILENT PAD+TRIG"
txt_live:
        .asciz  "SILENT PAD LIVEREC"

        | Written at run time: whether the press in hand is silent.
        .align  2
pl_last: .long  0
