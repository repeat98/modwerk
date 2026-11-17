; Mixer Mode M3b: fixed entry points at the start of the C section (0xC00F8000),
; linked first by scripts/build_mixer_ui.py; patches/mixer-m2.yaml and mixer.S
; name them by address. TI assembler syntax (this file goes through cl6x).
        .sect   ".vectors"
        .nocmp                          ; 32-bit only: the vectors keep their 8-byte stride
        .global chain_key, chain_draw_h, chain_poll, s33_keys
        .global settings_key, settings_draw, settings_pack, settings_unpack
        .global engine_run, mix_get, mix_put, pages_key, pages_draw_h, ab_tag
        .global r50_load, r50_save, perf_poll16, perf_key, perf_draw, midi_key, midi_draw, idle_ev
        B       .S2     keys_e          ; +0  screen 3 key table entry
        NOP     5
        B       .S2     draw_e          ; +8  screen 3 draw table entry
        NOP     5
        B       .S2     perf_poll16     ; +16 from mixer.S poll (B3 = return): chain_poll, then Perform
        NOP     5
        B       .S2     s33_keys        ; +24 callp at 0xC00A832C (screens 32/33 keys)
        NOP     5
        B       .S2     set_keys_e      ; +32 screen 1 (SETTINGS) key table entry
        NOP     5
        B       .S2     set_draw_e      ; +40 screen 1 draw table entry
        NOP     5
        B       .S2     settings_pack   ; +48 pack trampoline 0xC00B9EC8 (B3 = return)
        NOP     5
        B       .S2     settings_unpack ; +56 unpack trampoline 0xC00BD9E4 (B3 = return)
        NOP     5
        B       .S2     engine_run      ; +64 mixer.S engine (B3 = return)
        NOP     5
        B       .S2     mix_get         ; +72 mixer.S get_bytes (packed, settings)
        NOP     5
        B       .S2     mix_put         ; +80 mixer.S put_bytes (packed, settings)
        NOP     5
        B       .S2     pg_keys_e       ; +88 screen 15 key table entry (mixer.S +48)
        NOP     5
        B       .S2     pg_draw_e       ; +96 screen 15 draw table entry (mixer.S +56)
        NOP     5
        B       .S2     ab_e            ; +104 callp at 0xC00CB284 (Effect View knob pages)
        NOP     5
        B       .S2     r50_load        ; +112 callp at 0xC00BA798 (record 50 load)
        NOP     5
        B       .S2     r50_save        ; +120 callp at 0xC00BA3F8 (record 50 save)
        NOP     5
        B       .S2     perf_keys_e     ; +128 screen 11 (PERFORM, MASTER) key table entry
        NOP     5
        B       .S2     perf_draw_e     ; +136 screen 11 draw table entry
        NOP     5
        B       .S2     midi_keys_e     ; +144 screen 14 (MIDI) key table entry
        NOP     5
        B       .S2     midi_draw_e     ; +152 screen 14 draw table entry
        NOP     5
        B       .S2     idle_ev         ; +160 callp at 0xC00ACE08 (UI task, each event: A4 = event, B3 = return)
        NOP     5

; Switch-table entries: the event pair is in the dispatcher's frame (+8 event,
; +12 knob steps); return through the dispatcher's epilogue.
keys_e:
        LDW     .D2T1   *+B15(8), A4
        LDW     .D2T2   *+B15(12), B4
        MVKL    .S2     0xC00A83C0, B3  ; KEY_DONE, A4 = redraw
        MVKH    .S2     0xC00A83C0, B3
        B       .S1     chain_key
        NOP     5
draw_e:
        MVKL    .S2     0xC00A9404, B3  ; DRAW_DONE
        MVKH    .S2     0xC00A9404, B3
        B       .S1     chain_draw_h
        NOP     5
set_keys_e:
        LDW     .D2T1   *+B15(8), A4
        LDW     .D2T2   *+B15(12), B4
        MVKL    .S2     0xC00A83C0, B3
        MVKH    .S2     0xC00A83C0, B3
        B       .S1     settings_key
        NOP     5
set_draw_e:
        MVKL    .S2     0xC00A9404, B3
        MVKH    .S2     0xC00A9404, B3
        B       .S1     settings_draw
        NOP     5
pg_keys_e:
        LDW     .D2T1   *+B15(8), A4
        LDW     .D2T2   *+B15(12), B4
        MVKL    .S2     0xC00A83C0, B3
        MVKH    .S2     0xC00A83C0, B3
        B       .S1     pages_key
        NOP     5
pg_draw_e:
        MVKL    .S2     0xC00A9404, B3
        MVKH    .S2     0xC00A9404, B3
        B       .S1     pages_draw_h
        NOP     5
ab_e:                                   ; A4 = slot (the callp's parallel MV), B3 = return
        MV      .L2     B11, B4         ; the frame the pages draw in
        MV      .L1     A11, A6         ; right edge of the last page tab
        B       .S1     ab_tag
        NOP     5
perf_keys_e:                            ; perf_key is void: return through perf_kret, redraw = 1
        LDW     .D2T1   *+B15(8), A4
        LDW     .D2T2   *+B15(12), B4
        MVKL    .S2     perf_kret, B3
        MVKH    .S2     perf_kret, B3
        MVKL    .S2     perf_key, B5
        MVKH    .S2     perf_key, B5
        MVKL    .S1     0xC010A010, A0  ; master_key (asm/master/master_vec.asm)
        B       .S1     ms_or
        MVKH    .S1     0xC010A010, A0
        NOP     4
perf_kret:
        MVKL    .S2     0xC00A83C0, B3
        MVKH    .S2     0xC00A83C0, B3
        B       .S2     B3
        MVK     .S1     1, A4
        NOP     4
perf_draw_e:
        MVKL    .S2     0xC00A9404, B3
        MVKH    .S2     0xC00A9404, B3
        MVKL    .S2     perf_draw, B5
        MVKH    .S2     perf_draw, B5
        MVKL    .S1     0xC010A018, A0  ; master_draw
        MVKH    .S1     0xC010A018, A0
ms_or:                                  ; B5 = PERFORM's, A0 = MASTER's: MASTER when the menu entry was 3 or 6 (KALEIDO)
        MVKL    .S1     0xC00F60BF, A1  ; MENUSCR[7] (mixer.S, menu_enter.S)
        MVKH    .S1     0xC00F60BF, A1
        LDBU    .D1T1   *A1, A1
        NOP     4
        CMPEQ   .L1     3, A1, A2       ; A2 is free: the C we branch to may clobber it anyway
        CMPEQ   .L1     6, A1, A1
        OR      .L1     A1, A2, A1
  [A1]  MV      .L2X    A0, B5
        B       .S2     B5
        NOP     5
midi_keys_e:
        LDW     .D2T1   *+B15(8), A4
        LDW     .D2T2   *+B15(12), B4
        MVKL    .S2     0xC00A83C0, B3
        MVKH    .S2     0xC00A83C0, B3
        B       .S1     midi_key
        NOP     5
midi_draw_e:
        MVKL    .S2     0xC00A9404, B3
        MVKH    .S2     0xC00A9404, B3
        B       .S1     midi_draw
        NOP     5
