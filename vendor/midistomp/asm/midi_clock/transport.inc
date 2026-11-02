; Shared by clock.S and poll.S (MS-70CDR 2.10).
;
; Transport block for custom effects (issue #24): 8 words at a fixed L2
; address, read by effects with plain loads. Loaded at boot with the magic
; and 120 BPM; layout and reader rules in docs/transport-block.md.
        .equ    BLOCK, 0x1181FF00
        .equ    B_MAGIC, 0                  ; 0x5A4D5401 ("ZMT", version 1)
        .equ    B_SEQ, 4                    ; +1 before and after each update
        .equ    B_RUN, 8                    ; 1 after Start, 0 after Stop
        .equ    B_STARTS, 12                ; +1 on every Start
        .equ    B_TICKS, 16                 ; clocks since Start
        .equ    B_TEMPO, 20                 ; BPM x 100

; MIDI SETTINGS (v0.5): the MIDI word, kept in the settings section
; (asm/midi_settings/settings.S, base + 0) and saved in flash record 51.
; Bits 0-3 are "receive off" bits (0 = on); bit 4 and bits 5-9 are PROG CH
; START and MIDI CHANNEL (settings.S).
        .equ    MIDI_FLAGS, 0x1181EA00
        .equ    OFF_CLOCK, 1
        .equ    OFF_TRANSPORT, 2
        .equ    OFF_PC, 4
        .equ    OFF_CC, 8

; Clock handler variables, 192 bytes zeroed at boot (clock_vars section).
        .equ    VARS, 0x1181E700
        .equ    V_COUNT, 0                  ; ticks since the last beat (0..23)
        .equ    V_LAST, 4                   ; time of the last tick
        .equ    V_BEATS, 8                  ; beats seen since restart (0..8)
        .equ    V_IDX, 12                   ; next slot in the beat ring (0..7)
        .equ    V_APPLIED10, 16             ; 10 x tempo applied last, 0 = none
        .equ    V_N, 20                     ; beats in the ring before this one
        .equ    V_SUM, 24                   ; sum of this beat's tick times
        .equ    V_PREVQ, 28                 ; last beat's quick 10 x tempo
        .equ    V_RING, 32                  ; tick-time sums of the last 8 beats
        .equ    V_STARTT, 64                ; time of the last Start
        .equ    V_PSEEN, 68                 ; patch TEMPO the poll saw last
        .equ    V_NTK, 72                   ; tick times in V_TR (0..24)
        .equ    V_TIDX, 76                  ; next slot in V_TR (0..23)
        .equ    V_RUN, 80                   ; fast path: agreeing ticks so far
        .equ    V_RQ, 84                    ; fast path: first value of the run
        .equ    V_QS, 88                    ; fast path: sum of the run's values
        .equ    V_WANT, 92                  ; tempo for poll.S to apply, 0 = none
        .equ    V_TR, 96                    ; times of the last 24 ticks

        .equ    CLOCK_GETTICKS, 0xC00DEE20  ; SYS/BIOS Clock_getTicks, 1 ms
        .equ    TEMPO_VALUE, 0xC009C06C     ; patch TEMPO, int BPM
        .equ    SET_SETTING, 0xC00CAB44     ; (setting, value, notify)
        .equ    TEMPO_SETTING, 0xC00EDEE0   ; value ptr, min 40, max 250
        .equ    EVENT_POST, 0xC00CBF40
        .equ    UI_EVENT_OFS, 656

; Update the block atomically: interrupts off (nothing can read it half
; written on this single core), sequence odd while writing.
; Uses A5 = block, A6 = sequence, B6 = saved CSR, B7.
        .macro  PUB_BEGIN
        mvkl    .S1     BLOCK, a5
        mvkh    .S1     BLOCK, a5
        mvc     .S2     csr, b6
        and     .L2     -2, b6, b7          ; clear GIE
        mvc     .S2     b7, csr
        ldw     .D1T1   *+a5(B_SEQ), a6
        nop     4
        add     .L1     1, a6, a6
        stw     .D1T1   a6, *+a5(B_SEQ)
        .endm

        .macro  PUB_END
        add     .L1     1, a6, a6
        stw     .D1T1   a6, *+a5(B_SEQ)
        mvc     .S2     b6, csr             ; GIE back as it was
        .endm

; Far call: B5 = target, B3 = return label. Arguments must be set before.
        .macro  FARCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        mvkl    .S2     ret\@, b3
        mvkh    .S2     ret\@, b3
        nop     3
ret\@:
        .endm
