        | SPDX-License-Identifier: GPL-2.0-only
        | lfo-rnd - elemod port of rytm-mods-src 0004-lfo-rnd (MrScruff). Code unchanged but for
        | the lines marked elemod and the global labels the sites name, each an alias
        | carrying the mod id beside the original label.
        |
        | Mod 0004 - LFO RND. Phase 1: page, editing, dial, popup, storage.
        | Phase 2: the modifiers are applied.
        |
        | The four settings are one 16-bit field in core-ar2 0.2's mod storage,
        | lfo_rnd_cfg, sound scope (the live sound's spare bytes, saved in the
        | stored sound's spare slots with core's layout ID):
        |
        |   bits 0..3   R1 DST   index into dst_indices
        |   bits 4..7   R1 DEP   index into shared_amounts
        |   bits 8..11  R2 DST
        |   bits 12..15 R2 DEP
        |
        | Parameter ids 1..4 are dead Error records, renamed by registry patches.
        | Field = id - 1, so the nibble shift is field * 4 and odd fields are depths.
        |
        | lfo-rnd 1.0 and rytm-mods kept the same word in the sound's parameter
        | word at sound index 0 (live sound +0x14, storage slot 41), which no stock
        | parameter uses. 1.1 reads that word while the field is 0, so sounds saved
        | by the older builds keep their settings, and moves it into the field at
        | the first edit, clearing word 0 (word_of, set_field).

        .include "../include/ar2-1.74.inc"

        | elemod: rytm-mods' default build params, as its build passed them
        .equ    P_DEST_LIST, 1
        .equ    P_PHASE, 2

        .equ    PAGE_RND,       12
        .equ    PAGE_LFO,       3
        .equ    ID_FIRST,       1
        .equ    OFF_PARAMS,     0x14              | live sound parameter array
        .equ    OFF_MACHINE,    0x68              | live sound machine byte
        .equ    PARAM_ROM,      0x401bfbc8        | 0x34-byte ROM parameter records
        .equ    PARAM_ROM_SHORT, 0x30
        .equ    LIST_X,         184               | the list view's x; +188 is its width
        .equ    LR_TRACKSEL,    48                | project: the selected track
        .equ    LR_KIT,         352               | project: the active kit
        .equ    VT_CONFIG_CHANGED, 16             | the sound accessor's change notice
        .equ    SOUND_CONFIG_CHANGED, 0x401cb88c  | SoundConfigChangedInfo's vtable

        .extern core_store_get, core_store_set, lfo_rnd_cfg

        .text

        | Page 12 is in core-ar2 0.4's core_pages (lfo_rnd_page, below), and
        | ids 1..4 in its core_params (lfo_rnd_params): core asks get, delta and
        | text below for them from page_info, page_get_value, param_apply_delta
        | and param_value_text's entries. (1.1 detoured those four itself.)

        | The header's title after the page key's step is core-ar2 0.4's (1.1 and
        | 1.2's first builds pushed it here, for every view).

        | ------------------------------------------------------------------
        | field_of(d0 = parameter id) -> d0 = field 0..3, or C set if not ours
        | ------------------------------------------------------------------
        | inlined below as: subq #1; moveq #3,d1; cmp.l d1,d0; bhi not-ours

        | ------------------------------------------------------------------
        | word_of(a0 = a live sound) -> d0 = its packed word
        |
        | core's field, lfo_rnd_cfg; while that is 0, the word lfo-rnd 1.0 kept in
        | the sound's parameter word 0, so a sound saved by it keeps its settings
        | until the first edit moves them into the field. A stock sound has 0 there
        | too. Keeps a0; clobbers d0/d1/a1. Safe in any context (the sequencer
        | interrupt calls it): core_store_get masks interrupts for its loop.
        | ------------------------------------------------------------------
        .align  2
word_of:
        move.l  %a0,-(%sp)
        clr.l   -(%sp)                            | index, unused for a sound
        move.l  %a0,-(%sp)                        | item: the live sound
        move.l  #lfo_rnd_cfg,-(%sp)               | the field's descriptor, absolute
        jsr     core_store_get
        lea     12(%sp),%sp
        move.l  (%sp)+,%a0
        tst.l   %d0
        bne.s   1f
        mvzw    OFF_PARAMS(%a0),%d0               | lfo-rnd 1.0's word, or stock's 0
1:      rts

        | ------------------------------------------------------------------
        | notify() - the change notice stock's sound settings setters send
        |
        | {SoundConfigChangedInfo, 1} through the selected track's sound
        | accessor, vtable +16, as stock's ENV RESET setter (0x400bcee4) and
        | voice-dac do: without it a write to the live sound's bytes outside the
        | 42 parameters is lost at a reboot unless the kit is saved. Clobbers
        | d0/d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
notify:
        jsr     project_singleton
        move.l  %d0,%a0
        pea     LR_TRACKSEL(%a0)
        jsr     track_index_of
        addq.l  #4,%sp
        move.l  %d0,-(%sp)                        | the track
        jsr     project_singleton
        move.l  %d0,%a0
        pea     LR_KIT(%a0)                       | the active kit
        jsr     kit_track_sound
        addq.l  #8,%sp
        tst.l   %d0
        beq.s   9f
        lea     -8(%sp),%sp                       | SoundConfigChangedInfo, kind 1
        move.l  #SOUND_CONFIG_CHANGED,(%sp)
        move.b  #1,4(%sp)
        move.l  %sp,-(%sp)
        move.l  %d0,-(%sp)                        | the accessor
        move.l  %d0,%a0
        move.l  (%a0),%a0
        move.l  VT_CONFIG_CHANGED(%a0),%a0
        jsr     (%a0)
        lea     16(%sp),%sp
9:      rts

        | ------------------------------------------------------------------
        | nibble(d1 = field) -> d0 = that setting's 0..15, from the current sound
        | Clobbers d0/d1/a0/a1. Returns 0 when there is no sound.
        | ------------------------------------------------------------------
        .align  2
nibble:
        move.l  %d1,-(%sp)
        jsr     shared_cur_sound
        move.l  (%sp)+,%d1                        | sets the flags from d1, so
        tst.l   %d0                               | test the sound again
        beq.s   1f
        move.l  %d1,-(%sp)
        bsr.w   word_of
        move.l  (%sp)+,%d1
        lsl.l   #2,%d1
        lsr.l   %d1,%d0
        moveq   #15,%d1
        and.l   %d1,%d0
1:      rts

        | ------------------------------------------------------------------
        | setting_of(d0 = field 0..3) -> d0 = the setting, d1 = the field
        |
        | A destination answers its container index, which is what DST's value is; a
        | depth answers its raw 0..15, because its two readers want different things
        | - the dial wants the stop, the picker wants the setting. The field comes
        | back in d1 so the caller can tell them apart without re-deriving it.
        | Clobbers d0/d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
setting_of:
        move.l  %d0,%d1
        move.l  %d1,-(%sp)
        bsr.w   nibble
        move.l  (%sp)+,%d1
        btst    #0,%d1
        bne.s   1f
        lea     dst_indices,%a0
        mvzb    %a0@(0,%d0:l),%d0                 | its container index
1:      rts

        | ------------------------------------------------------------------
        | get(id, *value), core_params: ids 1..4 for the dials.
        |
        | Values are 8.8 on the 0..127 scale. A destination shows as its list
        | position times eight, which spaces its sixteen positions evenly across
        | the dial. A depth shows as its stop: the sixteen depths spread evenly
        | over the knob's travel, so each turn of the knob moves the needle the
        | same distance and the knob reads as a sixteen position selector. The
        | popup reads the setting from the sound instead, so it shows N or the
        | destination's name (text).
        | ------------------------------------------------------------------
        .align  2
lfo_rnd_get:
        move.l  4(%sp),%d0
        subq.l  #ID_FIRST,%d0
        bsr.s   setting_of
        btst    #0,%d1
        beq.s   2f
        lea     shared_stops,%a0
        mvzb    %a0@(0,%d0:l),%d0                 | depth: the setting's stop
2:      lsl.l   #8,%d0
        move.l  8(%sp),%a0
        move.l  %d0,(%a0)
        moveq   #1,%d0
        rts

        | ------------------------------------------------------------------
        | delta(view, id, delta, func), core_params: a turn on ids 1..4.
        |
        | The delta is 8.8; whole steps change the setting. Taking the turn
        | means stock never creates a p-lock for these parameters, and core
        | redraws the view, which the write here does not.
        |
        | A destination writes on every turn, as LFO DST does: the destination
        | list does not scroll itself, the picker moves its highlight to the
        | value it reads back after the write. YES commits that entry through
        | setter_gate; NO writes back the value the list opened on.
        | ------------------------------------------------------------------
        .align  2
lfo_rnd_delta:
        lea     -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)                 | view 16, id 20, delta 24
        move.l  16(%sp),%a2                       | the view, for shared_mark_changed
        move.l  20(%sp),%d3
        subq.l  #ID_FIRST,%d3                     | field
        move.l  24(%sp),%d2
        asr.l   #8,%d2                            | whole steps, sign preserved
        beq.s   7f
        move.l  %d3,%d1
        bsr.w   nibble                            | the old setting
        add.l   %d2,%d0
        bpl.s   1f
        clr.l   %d0
1:      moveq   #15,%d1
        cmp.l   %d1,%d0
        ble.s   2f
        move.l  %d1,%d0                           | clamp to 15
2:      move.l  %d3,%d1
        bsr.w   set_field
        tst.l   %d1
        beq.s   7f
        subq.l  #1,%d1
        beq.s   3f
        clr.l   -(%sp)                            | lfo-rnd 1.0's word moved out:
        move.l  %sp@(24),-(%sp)                   | clear it in the kit's bank too
        jsr     shared_mark_changed
        addq.l  #8,%sp
3:      jsr     notify
7:      movem.l (%sp),%d2-%d3/%a2
        lea     12(%sp),%sp
        moveq   #1,%d0
        rts

        | ------------------------------------------------------------------
        | text(t), core_params: ids 1..4' text; t = {obj, id, value, buf}.
        |
        | The text comes from the sound, not the passed value: a destination
        | prints its parameter's short name for the sound's machine, a depth
        | prints N.
        | ------------------------------------------------------------------
        .align  2
lfo_rnd_text:
        move.l  %d2,-(%sp)
        move.l  8(%sp),%a0
        move.l  4(%a0),%d0
        subq.l  #ID_FIRST,%d0
        move.l  %d0,%d2                           | field
        move.l  %d0,%d1
        bsr.w   nibble                            | d0 = 0..15
        btst    #0,%d2
        bne.s   5f

        lea     dst_indices,%a0
        mvzb    %a0@(0,%d0:l),%d0                 | position -> container index
        bsr.w   dst_name                          | a0 = the destination's name
        move.l  8(%sp),%a1
        move.l  12(%a1),%a1                       | output
1:      move.b  (%a0)+,(%a1)+
        bne.s   1b
        bra.s   8f

5:      move.l  8(%sp),%a1
        move.l  12(%a1),%a1                       | output
        lea     shared_amounts,%a0
        mvzb    %a0@(0,%d0:l),%d0                 | N
        jsr     shared_fmt_u8

8:      move.l  (%sp)+,%d2
        moveq   #1,%d0
        rts

        | ------------------------------------------------------------------
        | dst_name(d0 = container index) -> a0 = its short name
        |
        | The index is a parameter id for the current sound's machine, and that ROM
        | record's +0x30 is the short name. "--" when there is no sound, or no such
        | parameter on the machine. Clobbers d0/d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
dst_name:
        move.l  %d0,-(%sp)                        | container index
        jsr     shared_cur_sound
        beq.s   8f
        mvzb    OFF_MACHINE(%a0),%d0
        move.l  (%sp),%d1                         | container index
        move.l  %d0,(%sp)                         | machine
        move.l  %d1,-(%sp)                        | sound index
        jsr     sound_param_id_for_index
        addq.l  #4,%sp
        tst.l   %d0
        beq.s   8f
        moveq   #0x34,%d1
        mulsl   %d1,%d0
        add.l   #PARAM_ROM+PARAM_ROM_SHORT,%d0
        move.l  %d0,%a0
        move.l  (%a0),%a0                         | its short name
        bra.s   9f
8:      lea     str_none,%a0
9:      addq.l  #4,%sp                            | the machine, or the position
        rts

        | ------------------------------------------------------------------
        | param_knob_draw for ids 1 and 3, the two destination knobs.
        |
        | Entered by a jmp at the entry: (%sp) return, 4 the parameter set, 8 the id,
        | 12 the value in 8.8, and 24/28/32 the three the field is placed by.
        |
        | Stock's own LFO DST callback draws exactly what these knobs want - it maps
        | the value through the sound's parameters to a short name and draws that,
        | with no dial - and read_gate already makes our value read as the container
        | index it expects. So rather than draw it again here, the arguments are
        | shuffled into the frame param_knob_draw would have built for a callback and
        | the call is handed to lfo_dst_knob_draw.
        |
        | That frame is (functor, value, x, y, h, 1), written over our own argument
        | slots in place, exactly as param_knob_draw does at 0x400a85a8. The functor
        | slot keeps whatever it held: the invoker reads the value at its +8 and the
        | three at +12/+16/+20 and nothing else - checked instruction by instruction -
        | so it never looks at it.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_knob_draw_gate
lfo_rnd_knob_draw_gate:
knob_draw_gate:
        move.l  8(%sp),%d0
        moveq   #2,%d1
        or.l    %d1,%d0                           | 1 and 3 are the destinations
        moveq   #3,%d1
        cmp.l   %d1,%d0
        bne.s   9f
        move.l  12(%sp),8(%sp)                    | the value moves down one slot
        move.l  24(%sp),12(%sp)
        move.l  28(%sp),16(%sp)
        move.l  32(%sp),20(%sp)
        moveq   #1,%d0
        move.l  %d0,24(%sp)
        jmp     lfo_dst_knob_draw
9:      lea     %sp@(-16),%sp                     | displaced
        moveml  %d2-%d5,%sp@                      | displaced
        jmp     param_knob_draw_body

        | ------------------------------------------------------------------
        | set_field(d0 = new setting 0..15, d1 = field)
        |   -> d0 = the new packed word, d1 = 0 when there is no sound, 1 when
        |      written, 2 when written and lfo-rnd 1.0's word 0 was cleared (the
        |      caller then clears it in the kit's parameter bank as well)
        |
        | Reads the word (word_of), puts the setting in, and writes the whole word
        | to core's field. Only the UI writes the field, so the read-modify-write
        | needs no lock. Clobbers d0/d1/a0/a1.
        | ------------------------------------------------------------------
        .align  2
set_field:
        move.l  %d1,-(%sp)                        | field
        move.l  %d0,-(%sp)                        | the new setting
        jsr     shared_cur_sound
        beq.s   9f
        move.l  %d2,-(%sp)
        move.l  %a0,-(%sp)                        | 0 sound, 4 d2, 8 setting, 12 field
        bsr.w   word_of                           | d0 = the old word
        move.l  12(%sp),%d1
        lsl.l   #2,%d1                            | shift
        moveq   #15,%d2
        lsl.l   %d1,%d2
        not.l   %d2                               | its mask
        and.l   %d0,%d2
        move.l  8(%sp),%d0
        lsl.l   %d1,%d0
        or.l    %d0,%d2                           | the new packed word
        moveq   #1,%d1
        move.l  (%sp),%a0
        tst.w   OFF_PARAMS(%a0)
        beq.s   1f
        clr.w   OFF_PARAMS(%a0)                   | lfo-rnd 1.0's word: now the field's
        moveq   #2,%d1
1:      move.l  %d1,8(%sp)                        | the answer, over the setting
        move.l  %d2,-(%sp)                        | value
        clr.l   -(%sp)                            | index
        move.l  %a0,-(%sp)                        | item: the live sound
        move.l  #lfo_rnd_cfg,-(%sp)               | the field's descriptor, absolute
        jsr     core_store_set
        lea     16(%sp),%sp
        move.l  %d2,%d0                           | the new packed word
        move.l  8(%sp),%d1
        move.l  4(%sp),%d2
        lea     16(%sp),%sp
        rts
9:      addq.l  #8,%sp
        clr.l   %d1
        rts

        .if     P_DEST_LIST
        | ------------------------------------------------------------------
        | pos_of(d0 = container index) -> d0 = its position 0..15, or -1
        | Clobbers d0/d1/a0.
        | ------------------------------------------------------------------
        .align  2
pos_of:
        move.l  %d0,-(%sp)                        | the index being looked for
        lea     dst_indices,%a0
        moveq   #15,%d1
1:      mvzb    %a0@(0,%d1:l),%d0
        cmp.l   (%sp),%d0
        beq.s   2f
        subq.l  #1,%d1
        bpl.s   1b
2:      move.l  %d1,%d0                           | the position, or -1
        addq.l  #4,%sp
        rts

        | ------------------------------------------------------------------
        | param_set_read for ids 1..4.
        |
        | Entered by a jmp at the entry: (%sp) return, 4 the parameter set, 8 the id.
        | The picker reads the current destination through here, straight from the
        | sound, so it would otherwise see the packed word and read a nibble pair as
        | a container index. Answers what stock would have stored: the destination's
        | container index shifted up by 8. A depth answers its setting the same way;
        | nothing reads one through here, and a raw nibble is at least in range.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_read_gate
lfo_rnd_read_gate:
read_gate:
        move.l  8(%sp),%d0
        subq.l  #ID_FIRST,%d0
        moveq   #3,%d1
        cmp.l   %d1,%d0
        bhi.s   9f
        bsr.w   setting_of
        lsl.l   #8,%d0
        rts
9:      lea     %sp@(-16),%sp                     | displaced
        moveml  %d2/%a2/%fp,%sp@                  | displaced
        jmp     param_set_read_body

        | ------------------------------------------------------------------
        | param_set_value for ids 1..4, where the destination list's commit lands.
        |
        | Entered by a jmp at the entry: (%sp) return, 4 the parameter set, 8 the
        | id, 12 the value in 8.8. The list writes the chosen parameter's container
        | index, so it maps back to a position here and the field is rewritten in
        | place. A destination the sixteen do not hold is left alone, as is a depth
        | id: the list never offers one, and letting stock write it would overwrite
        | the packed word with a raw value.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_setter_gate
lfo_rnd_setter_gate:
setter_gate:
        move.l  8(%sp),%d0
        subq.l  #ID_FIRST,%d0
        moveq   #3,%d1
        cmp.l   %d1,%d0
        bhi.s   9f
        move.l  %d0,-(%sp)                        | field
        btst    #0,%d0
        bne.s   8f                                | a depth: swallow it
        move.l  16(%sp),%d0                       | the value
        lsr.l   #8,%d0                            | -> container index
        bsr.w   pos_of
        tst.l   %d0
        bmi.s   8f                                | not one of ours: leave it alone
        move.l  (%sp),%d1                         | field
        bsr.w   set_field
        tst.l   %d1
        beq.s   8f
        subq.l  #1,%d1
        beq.s   7f
        clr.l   -(%sp)                            | lfo-rnd 1.0's word moved out:
        move.l  16(%sp),-(%sp)                    | clear it in the kit's bank too
        move.l  16(%sp),%a1                       | the parameter set
        jsr     shared_mark_changed_set
        addq.l  #8,%sp
7:      jsr     notify                            | elemod 1.1: was shared_mark_changed_set
8:      addq.l  #4,%sp
        rts
9:      lea     %sp@(-40),%sp                     | displaced
        moveml  %d2-%d7/%a2,%sp@                  | displaced
        jmp     param_set_value_body

        | ------------------------------------------------------------------
        | The destination list, filtered to our sixteen.
        |
        | Reached by a jmp over the `jsr dest_list_build` inside the list view's
        | constructor - the six bytes are that call alone, and the `addql #8,%sp`
        | after it is NOT displaced, so it must not be re-emitted here: the stub
        | rejoins at it and stock pops the arguments once. The frame is still the
        | constructor's: %fp@(20) is the CONTAINER
        | INDEX of the parameter the list is for - not its id - and %fp@(-88) takes
        | the vector, whose +0 and +4 are begin and end.
        |
        | Two things have to match. The mask at %fp@(32) is 0x600 for the LFO DST list
        | and 0x200 for MOD SETUP's, which the same constructor builds at 0x4004bab8;
        | and the index is 0, the sound's free word, which no stock parameter uses -
        | LFO DST's own is 4. MOD SETUP passes its route slot in that argument, and
        | slot 0 would otherwise look exactly like ours.
        |
        | The panel is moved to the left edge here too. Its geometry reached the view
        | before this point - x at +184, width at +188 - and stock's 49 + 79 puts it
        | flush right. Only the x moves, so it keeps stock's width.
        |
        | Stock builds every modulation destination the sound
        | has; for our two ids the entries outside dst_indices are dropped by
        | compacting the vector in place and moving its end back. The rows, their
        | labels and the highlighted entry are all built from the vector after
        | this, so they follow. Every other id is left exactly as stock built it.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_list_filter_gate
lfo_rnd_list_filter_gate:
list_filter_gate:
        jsr     dest_list_build                   | displaced
        lea     -24(%sp),%sp
        movem.l %d0-%d2/%a0-%a2,(%sp)
        move.l  #0x600,%d0                        | LFO DST's list, not MOD SETUP's
        cmp.l   %fp@(32),%d0
        bne.s   8f
        tst.l   %fp@(20)                          | and container index 0, so ours
        bne.s   8f
        move.l  %fp@(8),%a0                       | the view being built
        clr.l   LIST_X(%a0)                       | against the left edge, not the right
        move.l  %fp@(-88),%a0
        move.l  (%a0),%a2                         | read cursor
        move.l  %a2,%d2                           | write cursor
1:      move.l  %fp@(-88),%a0                     | pos_of clobbers a0
        move.l  %a2,%d0
        cmp.l   4(%a0),%d0
        beq.s   3f
        move.l  (%a2)+,%d0                        | the parameter id
        move.l  %d0,-(%sp)                        | kept, and the argument
        jsr     param_container_index
        bsr.w   pos_of
        tst.l   %d0
        bmi.s   2f                                | not one of ours: drop it
        move.l  (%sp),%d0
        move.l  %d2,%a1
        move.l  %d0,(%a1)
        addq.l  #4,%d2
2:      addq.l  #4,%sp
        bra.s   1b
3:      move.l  %d2,4(%a0)                        | the new end
8:      movem.l (%sp),%d0-%d2/%a0-%a2
        lea     24(%sp),%sp
        jmp     dest_list_build_resume

        | ------------------------------------------------------------------
        | The picker's test for whether the open list is this knob's.
        |
        | Reached by a jmp over `jsr param_container_index` at 0x40039d32, with
        | the id at (%sp). Stock keeps the open list when its container index
        | matches the knob's, and cancels it and opens the knob's own otherwise.
        | DS1 and DS2 share index 0, so turning one with the other's list up
        | moved that list, and YES wrote the value into the list's parameter.
        | The list does not record its parameter, so list_new_gate keeps it in
        | list_owner; one of ours that does not own the list answers -1.
        | ------------------------------------------------------------------
        .equ    LIST_SAME_RESUME, 0x40039d38
        .align  2
        .globl  lfo_rnd_list_same_gate
lfo_rnd_list_same_gate:
list_same_gate:
        jsr     param_container_index             | displaced
        tst.l   %d0
        bne.s   9f                                | not one of ours
        move.l  (%sp),%d1                         | the id
        cmp.b   list_owner,%d1
        beq.s   9f
        moveq   #-1,%d0
9:      jmp     LIST_SAME_RESUME

list_owner:                                       | the id the open list is for
        .byte   0

        | ------------------------------------------------------------------
        | The knob-release test, for the two depth knobs.
        |
        | Reached by a jmp over `jsr param_container_index` in the page view key
        | handler's knob-event path, with the id at (%sp) and in d4. The result is
        | kept at %fp@(-20) and read only by the release, at 0x4003aa1e: a list
        | whose container index matches the released knob's is confirmed, any
        | other is cancelled. The four settings share container index 0, so
        | releasing DP1 or DP2 confirmed the DS list its own press had just
        | cancelled, and the list came back up for a moment. The depths answer
        | -1 here, which no list holds, so their release cancels as any other
        | knob's does. In its own section: cave2 has no room left for it.
        | ------------------------------------------------------------------
        .equ    KNOB_CIDX_RESUME, 0x4003a5f8
        .text                     | elemod: was .section .kgate,"ax"
        .align  2
        .globl  lfo_rnd_knob_cidx_gate
lfo_rnd_knob_cidx_gate:
knob_cidx_gate:
        jsr     param_container_index             | displaced
        moveq   #2,%d1                            | DP1
        cmp.l   %d4,%d1
        beq.s   1f
        moveq   #4,%d1                            | DP2
        cmp.l   %d4,%d1
        bne.s   9f
1:      moveq   #-1,%d0
9:      jmp     KNOB_CIDX_RESUME

        | ------------------------------------------------------------------
        | The picker, creating a list: record whose it is, for list_same_gate.
        | Reached by a jmp over `jsr param_container_index` at 0x40039d9a, with
        | the id at (%sp).
        | ------------------------------------------------------------------
        .equ    LIST_NEW_RESUME, 0x40039da0
        .align  2
        .globl  lfo_rnd_list_new_gate
lfo_rnd_list_new_gate:
list_new_gate:
        move.l  (%sp),%d1                         | the id
        move.b  %d1,list_owner
        jsr     param_container_index             | displaced
        jmp     LIST_NEW_RESUME
        .text
        .endif

        .if     P_PHASE >= 2
        | ==================================================================
        | Phase 2: apply the modifiers.
        |
        | trig_fire (sequencer interrupt) copies the triggering track's settings
        | word into cfg. The audio interrupt, before the LFO runs, redraws that
        | track's two offsets when its trig flag says a note started this block,
        | and adds the held offsets to the effective parameter array every block.
        | The array is rebuilt from the smoother each block, so the add does not
        | accumulate - the LFO relies on the same property.
        | ==================================================================
        .equ    VOICE_TRACKS,   12
        .equ    TF_TRACK,       92                | trig_fire's track, from its frame
        .equ    TRIG_FLAGS,     0x8000e508        | per-track long, 1 on a note this block
        .equ    PARAMS_EFF,     0x8000f7a8        | effective array, track 0 index 0
        .equ    TRACK_STRIDE,   0x54
        .equ    PARAM_MAX,      0x7fff            | the LFO's clamp

        | ------------------------------------------------------------------
        | trig_fire, once the event is valid.
        |
        | Reached by a jmp over `movel %d5,%a4@(12); movel %d0,%a4@(24)`, after
        | the event has been marked valid, so only trigs that play arrive here.
        | Everything the stub touches is saved; the frame is balanced here, so the
        | track argument is at TF_TRACK(%sp) on arrival.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_trig_cfg_gate
lfo_rnd_trig_cfg_gate:
trig_cfg_gate:
        movel   %d5,%a4@(12)                      | displaced
        movel   %d0,%a4@(24)                      | displaced
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  16+TF_TRACK(%sp),%d0
        moveq   #VOICE_TRACKS-1,%d1
        cmp.l   %d1,%d0
        bhi.s   9f                                | voice tracks only
        move.l  %d0,-(%sp)                        | the track, across the call
        jsr     shared_sound_of                   | -> the live sound
        move.l  (%sp)+,%d1                        | track
        tst.l   %d0
        beq.s   9f
        move.l  %d0,%a0
        move.l  %d1,-(%sp)
        bsr.w   word_of                           | elemod 1.1: was mvzw OFF_PARAMS(%a0),%d0
        move.l  (%sp)+,%d1
        lea     cfg,%a1
        add.l   %d1,%d1
        move.w  %d0,%a1@(0,%d1:l)
9:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        jmp     trig_fire_cfg_resume

        | ------------------------------------------------------------------
        | The audio interrupt's LFO call, with the modifiers first.
        |
        | Reached by a jmp over `jsr 0x4009e790`, with the LFO's argument at
        | (%sp). Per voice track: on a note this block, draw both offsets from
        | cfg; then add the held offsets to their destinations, clamped to
        | 0..PARAM_MAX. Then call the LFO exactly as stock does.
        |
        | An offset is held as one signed byte: the draw is a whole value in -64..64
        | and the array wants it in 8.8, so the shift happens on the way out. The
        | destination is an index into the sound's 42 parameters, so it is a byte too.
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_audio_gate
lfo_rnd_audio_gate:
audio_gate:
        lea     -36(%sp),%sp
        movem.l %d0-%d5/%a0-%a2,(%sp)
        clr.l   %d2                               | track
        lea     TRIG_FLAGS,%a2
        lea     held,%a1                          | 2 bytes per modifier
1:      moveq   #1,%d0
        cmp.l   (%a2)+,%d0
        bne.s   5f

        | a note started: redraw both offsets from the track's settings
        lea     cfg,%a0
        move.l  %d2,%d0
        add.l   %d0,%d0
        mvzw    %a0@(0,%d0:l),%d3                 | settings word
        moveq   #2,%d5                            | modifiers left
2:      moveq   #15,%d0
        and.l   %d3,%d0                           | destination position
        lea     dst_indices,%a0
        mvzb    %a0@(0,%d0:l),%d0
        move.b  %d0,(%a1)+                        | destination index, 0..41
        move.l  %d3,%d0
        lsr.l   #4,%d0
        moveq   #15,%d1
        and.l   %d1,%d0
        lea     shared_amounts,%a0
        mvzb    %a0@(0,%d0:l),%d1                 | N
        clr.l   %d0
        tst.l   %d1
        beq.s   3f
        lea     rng_state,%a0                     | this mod's own stream
        jsr     shared_rnd                        | -> d0 = -N..N
3:      move.b  %d0,(%a1)+                        | offset, whole; -64..64 fits a byte
        lsr.l   #8,%d3
        subq.l  #1,%d5
        bne.s   2b
        subq.l  #4,%a1                            | back to this track's entry

        | every block: add the held offsets
5:      move.l  %d2,%d0
        moveq   #TRACK_STRIDE,%d1
        mulsl   %d1,%d0
        add.l   #PARAMS_EFF,%d0
        move.l  %d0,%a0                           | this track's slice
        moveq   #2,%d5
6:      mvzb    (%a1)+,%d0                        | destination index
        mvsb    (%a1)+,%d1                        | offset
        tst.l   %d1
        beq.s   8f
        lsl.l   #8,%d1                            | back to the 8.8 the array holds
        add.l   %d0,%d0
        mvsw    %a0@(0,%d0:l),%d3
        add.l   %d1,%d3
        bpl.s   7f
        clr.l   %d3
7:      move.l  #PARAM_MAX,%d4
        cmp.l   %d4,%d3
        ble.s   71f
        move.l  %d4,%d3
71:     move.w  %d3,%a0@(0,%d0:l)
8:      subq.l  #1,%d5
        bne.s   6b

        addq.l  #1,%d2
        moveq   #VOICE_TRACKS,%d0
        cmp.l   %d0,%d2
        bne.w   1b

        movem.l (%sp),%d0-%d5/%a0-%a2
        lea     36(%sp),%sp
        jsr     lfo_block                         | displaced
        jmp     lfo_call_resume
        .endif

        | ------------------------------------------------------------------
        | Data
        | ------------------------------------------------------------------
        .align  2
        .globl  lfo_rnd_view_page                 | core_view_pages: behind LFO
lfo_rnd_view_page:
        .long   4, PAGE_RND, 0                    | CORE_VIEW_LFO, always shown

        .globl  lfo_rnd_page, lfo_rnd_params
lfo_rnd_page:                                     | core_pages: page 12
        .long   PAGE_RND
page_rnd:                                         | {name, top row, bottom row}
        .long   str_page
        .long   1, 3, 0, 0
        .long   2, 4, 0, 0

lfo_rnd_params:                                   | core_params: ids 1..4
        .long   ID_FIRST, ID_FIRST+3, lfo_rnd_get, lfo_rnd_delta, lfo_rnd_text

        | Destination list: the 8 machine parameters, then sample FIN and STA,
        | filter FRQ and RES, amp DEC and PAN, DEL and REV sends.
dst_indices:
        .byte   9, 10, 11, 12, 13, 14, 15, 16
        .byte   18, 21, 30, 31, 35, 38, 40, 41


        .if     P_PHASE >= 2
        .align  2
rng_state:      .long   0x6c8e9cf5                | the draw itself is 0000-shared's
cfg:            .space  2*VOICE_TRACKS            | settings word per voice track
held:           .space  4*VOICE_TRACKS            | {dst, offset} bytes, x2 per track
        .endif


str_none:       .asciz  "--"
        .globl  lfo_rnd_str_r1dst_l
lfo_rnd_str_r1dst_l:
str_r1dst_l:    .asciz  "Random 1 Dest"
        .globl  lfo_rnd_str_r1dep_l
lfo_rnd_str_r1dep_l:
str_r1dep_l:    .asciz  "Random 1 Depth"
        .globl  lfo_rnd_str_r2dst_l
lfo_rnd_str_r2dst_l:
str_r2dst_l:    .asciz  "Random 2 Dest"
        .globl  lfo_rnd_str_r2dep_l
lfo_rnd_str_r2dep_l:
str_r2dep_l:    .asciz  "Random 2 Depth"
        | One label, two uses: the page's name and the four parameters' group name
        | are the same text, so page_rnd points at it too.
str_page:
        .globl  lfo_rnd_str_group
lfo_rnd_str_group:
str_group:      .asciz  "LFO RND"
        .globl  lfo_rnd_str_r1dst
lfo_rnd_str_r1dst:
str_r1dst:      .asciz  "DS1"
        .globl  lfo_rnd_str_r1dep
lfo_rnd_str_r1dep:
str_r1dep:      .asciz  "DP1"
        .globl  lfo_rnd_str_r2dst
lfo_rnd_str_r2dst:
str_r2dst:      .asciz  "DS2"
        .globl  lfo_rnd_str_r2dep
lfo_rnd_str_r2dep:
str_r2dep:      .asciz  "DP2"

        | elemod: 0000-shared's runtime, a private copy in this unit
        .text
        .include "../shared/shared.s"
