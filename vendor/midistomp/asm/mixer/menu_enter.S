; Mixer Mode M2 / Perform: menu ENTER (settings.S mk_enter, 0x1181F0F0, A3 = entry):
; entries 2-6 go to the screen in MENUSCR (mixer.S): 2 PERFORM MODE (11),
; 3 MASTER (11), 4 SETTINGS (1, as the stock row 2), 5 the version entry (9), 6 KALEIDO (11);
; the stock handler does 0-1. MENUSCR[7] keeps the entry, so screen 11 knows
; PERFORM from MASTER (chain_vec.asm). The branch after these
; eight instructions goes to SET_SCREEN(A4, B4) when A1 is set. A5 is free
; here (mk_stock reloads it).
        .text
        .nocmp
        mvkl    .S1     0xC00F60B8, a5      ; MENUSCR
        mvkh    .S1     0xC00F60B8, a5
        cmplt   .L1     1, a3, a1           ; entries 2-6 are ours
        ldbu    .D1T1   *+a5[a3], a4
        mvk     .L2     0, b4
        nop     4
        nop
        stb     .D1T1   a3, *+a5[7]         ; MENUSCR[7] = the entry
