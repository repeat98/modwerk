        | SPDX-License-Identifier: GPL-2.0-only
        | pad-select - PAD+TRIG SEL TRK: the pads and TRIG keys sound only in
        | LIVE and STEP RECORDING; otherwise a press selects its track, silent,
        | and FUNC + pad plays it.
        |
        | A new mod, not a port. The setting is core-ar2 0.3's mod storage
        | field pad_select_on (global scope, one bit per globals slot), saved
        | with the project's globals; a slot saved without it loads unchecked.
        | The slot lookup follows voice-dac 1.2's DAC SUM (MrScruff's mod, the
        | elemod port's dac_gslot).
        |
        | KeyboardView handles the pads (slot 19, 0x400c7854) and the TRIG keys
        | (slot 2, 0x400c7b18) outside CHROMATIC mode. Both play through one
        | routine, 0x400c76c2 (view, src, track, track, note, vel, retrig), src
        | 1 a pad and 0 a TRIG key, which triggers the voice and the MIDI note
        | (0x400c6eac) and keeps the held note for the release. Nothing else
        | calls it: CHRO pads (ChromPadsView), TRIG + YES, MIDI in and the
        | sequencer reach the voice trigger by their own paths.
        |
        | With PAD+TRIG SEL TRK checked and the view's sequencer state in neither
        | LIVE REC nor STEP REC (active()):
        |   play_gate   0x400c76c2  the play routine returns at once unless
        |                           FUNC is held: no voice, no MIDI, no held note
        |   autotrk     0x400c79d2  both handlers' AUTO TRK SWITCH test reads
        |               0x400c7e24  on for a silent press, so it selects its track
        |   pressure_gate (1.74: 0x400c74d4, read from 1.74 only; no 1.73
        |                           address) a held pad whose press was
        |                           silent sends no aftertouch
        |   func_gate   0x400c78e4  the pad handler's FUNC test reads off, so
        |                           FUNC + pad plays at the pad's velocity, not VEL
        | and for the switch, a SEQUENCER CONFIG item after AUTO TRK SWITCH:
        |   menu_add    0x400ec118  SeqSettingsMenuView's constructor, between
        |                           AUTO TRK SWITCH's item and SAMPLE POS RES's
        |
        | Addresses are OS 1.73's, each 1.74's moved back by the README's OS
        | 1.74 shifts; not yet checked against a 1.73 file. core-ar2 0.3 is
        | OS 1.74 only, so only the 1.74 port builds for now.

        .include "../include/ar2-1.74.inc"

        .equ    PLAY_RESUME,    0x400c7734        | the play routine past `linkw; moveq`
        .equ    AUTOTRK_GET,    0x400b606c        | AUTO TRK SWITCH's getter (globals)
        .equ    FUNC_RESUME,    0x400c7956        | the pad handler's `addql #4,%sp`
        .equ    VIEW_SEQ,       0x8c              | KeyboardView: the sequencer state
        .equ    LIVE_GET,       0x40036370        | state: LIVE REC (+0x169, while playing)
        .equ    STEP_GET,       0x400363bc        | state: STEP REC (+0x16a)
        .equ    PRESSURE_RESUME, 0x400c74dc       | the pressure handler past `lea; moveml`

        | core-ar2 0.3's mod storage: the field's descriptor is an absolute
        | symbol elekloader defines; core_store_get(field, item, index) and
        | core_store_set(field, item, index, value) clobber d0-d1/a0-a1. A
        | global field's index is the globals slot, 0..3: the live records sit
        | at GLOBAL_LIVE + 228 k (core-ar2's GLOBAL_LIVE, as voice-dac has it).
        .extern core_store_get, core_store_set, pad_select_on
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
        | at %sp@(4), src at %sp@(8), the track at %sp@(12); d0/d1/a0/a1 are
        | free, as at any call. Whether this press is silent is kept in
        | pl_last for autotrk, which both handlers reach after this call with
        | nothing branching in between, and, for a pad, in its silent_mask
        | bit for pressure_gate.
        | ------------------------------------------------------------------
        .align  2
        .globl  pad_select_play_gate
pad_select_play_gate:
        move.l  4(%sp),%a0
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
        bsr.s   mark
        rts                                       | silent
1:      clr.l   pl_last                           | plays: AUTO TRK SWITCH decides
        moveq   #0,%d0
        bsr.s   mark
        link.w  %fp,#-64                          | displaced
        moveq   #127,%d0                          | displaced
        jmp     PLAY_RESUME

        | mark(d0 = 1 silent, 0 plays): a pad's bit in silent_mask, from
        | play_gate's arguments (4 bytes up past this call's return
        | address). TRIG keys (src 0) and tracks past 11 leave it alone.
        | Clobbers d0/d1.
mark:
        move.l  12(%sp),%d1                       | src
        subq.l  #1,%d1
        bne.s   9f                                | not a pad
        move.l  16(%sp),%d1                       | the track, the pad's index
        cmpi.l  #12,%d1
        bcc.s   9f
        tst.l   %d0
        beq.s   1f
        move.l  silent_mask,%d0
        bset    %d1,%d0
        bra.s   2f
1:      move.l  silent_mask,%d0
        bclr    %d1,%d0
2:      move.l  %d0,silent_mask
9:      rts

        | ------------------------------------------------------------------
        | pressure_gate: KeyboardView's pad-pressure handler (slot 18,
        | 0x400c74d4, also reached through its this-adjusting thunk), over
        | `lea %sp@(-28),%sp; moveml %d2-%d6/%a2-%a3,%sp@`, both re-emitted.
        | (view, event): a pressure event (type +16 == 2) for a pad whose last
        | press was silent is answered as handled, as stock answers one, and
        | goes no further: no aftertouch to the voice, no MIDI pressure. Any
        | other event, and pressure on a pad that played, go to stock.
        | ------------------------------------------------------------------
        .align  2
        .globl  pad_select_pressure_gate
pad_select_pressure_gate:
        move.l  8(%sp),%a0                        | the event
        moveq   #2,%d0
        cmp.l   16(%a0),%d0
        bne.s   1f                                | not pressure
        move.l  20(%a0),%d1                       | its pad
        cmpi.l  #12,%d1
        bcc.s   1f
        move.l  silent_mask,%d0
        btst    %d1,%d0
        beq.s   1f
        moveq   #1,%d0                            | handled
        rts
1:      lea     -28(%sp),%sp                      | displaced
        movem.l %d2-%d6/%a2-%a3,(%sp)             | displaced
        jmp     PRESSURE_RESUME

        | ------------------------------------------------------------------
        | autotrk(globals): in place of AUTO TRK SWITCH's getter at both
        | handlers' calls. On for a silent press - as play_gate found it for
        | this press - so the handler selects the pressed track as with AUTO
        | TRK SWITCH checked; for a press that plays (FUNC + pad, LIVE or STEP
        | REC, the setting off), the getter itself, with the same argument.
        | ------------------------------------------------------------------
        .align  2
        .globl  pad_select_autotrk
pad_select_autotrk:
        tst.l   pl_last
        beq.s   1f
        moveq   #1,%d0
        rts
1:      jmp     AUTOTRK_GET

        | ------------------------------------------------------------------
        | func_gate: the pad handler's FUNC test, over `pea 0x80; jsr %a3@`
        | (a3 is_key_held), re-emitted. While active(), FUNC reads not held, so
        | the pad's own velocity is taken; play_gate still sees FUNC and plays.
        | The pea stays pushed for the addql at FUNC_RESUME. a2 is the view,
        | d2 the pad (event +20); d1/a0/a1 are not read before they are
        | written.
        |
        | Every pad event the handler gets this far with, a press or a
        | release, first clears its pad's silent_mask bit; play_gate sets it
        | again for a silent press. So the bit lasts from a silent press to
        | its release, and a later press that skips the play routine (NO +
        | pad in LIVE REC) finds it clear.
        | ------------------------------------------------------------------
        .align  2
        .globl  pad_select_func_gate
pad_select_func_gate:
        pea     KEY_FUNC                          | displaced
        jsr     (%a3)                             | displaced
        cmpi.l  #12,%d2
        bcc.s   2f
        move.l  silent_mask,%d1
        bclr    %d2,%d1
        move.l  %d1,silent_mask
2:      tst.l   %d0
        beq.s   1f
        move.l  %a2,%a0
        bsr.w   active
        eori.l  #1,%d0                            | held, and reported only when off
1:      jmp     FUNC_RESUME

        | ------------------------------------------------------------------
        | active(a0 = KeyboardView) -> d0 = 1 when PAD+TRIG SEL TRK is checked
        | and the sequencer is in neither LIVE REC nor STEP REC, else 0.
        | Clobbers d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
active:
        move.l  %a2,-(%sp)
        move.l  %a0,%a2
        bsr.w   flag_get
        tst.l   %d0
        beq.s   9f
        move.l  VIEW_SEQ(%a2),-(%sp)
        jsr     LIVE_GET
        addq.l  #4,%sp
        tst.b   %d0
        bne.s   8f
        move.l  VIEW_SEQ(%a2),-(%sp)
        jsr     STEP_GET
        addq.l  #4,%sp
        tst.b   %d0
        bne.s   8f
        moveq   #1,%d0
        bra.s   9f
8:      moveq   #0,%d0
9:      move.l  (%sp)+,%a2
        rts

        | ------------------------------------------------------------------
        | The flag: the active globals slot's pad_select_on.
        |   flag_get() -> d0 = 0 or 1; 0 while the project is being built
        |                   (boot), or when the active record is none of the
        |                   four slots
        |   flag_set(d0)    the active slot's, and the globals' change notice,
        |                   so stock saves them (and core the field with them)
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
        bsr.w   rec_active
        bsr.w   gslot
        tst.l   %d0
        bmi.s   8f
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  #pad_select_on,-(%sp)
        jsr     core_store_get
        lea     12(%sp),%sp
        rts
8:      moveq   #0,%d0
        rts

        .align  2
flag_set:
        move.l  %d2,-(%sp)
        move.l  %d0,%d2
        tst.l   PROJ_SINGLETON
        beq.s   9f
        bsr.w   rec_active
        bsr.w   gslot
        tst.l   %d0
        bmi.s   9f
        move.l  %d2,-(%sp)                        | value
        move.l  %d0,-(%sp)                        | index: the slot
        clr.l   -(%sp)                            | item, unused
        move.l  #pad_select_on,-(%sp)
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
9:      move.l  (%sp)+,%d2
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
        | are as SAMPLE POS RES's item expects them, so the four functions and
        | the registers used here live in a frame of their own below.
        | ------------------------------------------------------------------
        .align  2
        .globl  pad_select_menu_add
pad_select_menu_add:
        lea     -80(%sp),%sp
        movem.l %d2-%d4/%a2,64(%sp)
        move.l  %sp,%a0
        moveq   #15,%d1
1:      clr.l   (%a0)+
        subq.l  #1,%d1
        bpl.s   1b
        moveq   #0,%d2                            | label: an empty functor
        lea     lbl_invoke,%a2
        bsr.w   fn_empty
        moveq   #16,%d2                           | action: holds the view
        lea     act_invoke,%a2
        bsr.w   fn_view
        moveq   #32,%d2                           | drawer: empty
        lea     drw_invoke,%a2
        bsr.w   fn_empty
        moveq   #48,%d2                           | changer: holds the view
        lea     chg_invoke,%a2
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
        movem.l 64(%sp),%d2-%d4/%a2
        lea     80(%sp),%sp
        clr.l   72(%sp)                           | displaced
        pea     0x1                               | displaced
        jmp     MENU_RESUME

        | fn_empty / fn_view(a2 = invoker, d2 = the function's offset in
        | menu_add's frame, 4 bytes up past this call's return address): the
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

        | lbl_invoke(a0 = the std::string to construct) -> d0 = a0, as stock's
        | label invokers (AUTO TRK SWITCH's, 0x400eb6a4).
        .align  2
lbl_invoke:
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

        | act_invoke(functor): YES toggles. chg_invoke(functor, -, delta):
        | RIGHT checks, LEFT unchecks. The functor's storage points at the
        | view, invalidated after, as no stock setting's notice redraws ours.
        .align  2
act_invoke:
        move.l  4(%sp),%a0
        move.l  %a2,-(%sp)
        move.l  (%a0),%a0
        move.l  (%a0),%a2                         | the view
        bsr.w   flag_get
        moveq   #1,%d1
        eor.l   %d1,%d0
        bra.s   set_redraw

        .align  2
chg_invoke:
        move.l  12(%sp),%d1
        bne.s   1f
        rts
1:      move.l  4(%sp),%a0
        move.l  %a2,-(%sp)
        move.l  (%a0),%a0
        move.l  (%a0),%a2
        moveq   #0,%d0
        tst.l   %d1
        bmi.s   set_redraw
        moveq   #1,%d0
set_redraw:                                       | d0 the value, a2 the view, a2 pushed
        bsr.w   flag_set
        pea     56(%a2)
        jsr     VIEW_INVALIDATE
        addq.l  #4,%sp
        move.l  (%sp)+,%a2
        rts

        | drw_invoke(functor, -, canvas, x, y): the checkbox, as AUTO TRK
        | SWITCH's drawer (0x400ec3e4) draws it: glyph 0 or 1 of the table at
        | CHECK_GLYPHS, at x + 11, called with a frame of its own.
        .align  2
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

txt_label:
        .asciz  "PAD+TRIG SEL TRK"

        | Written at run time: whether the press in hand is silent, and one
        | bit per pad (0..11) for a pad whose last press was silent.
        .align  2
pl_last: .long  0
silent_mask: .long 0
