; Mixer Mode M2 / Perform: the menu draw (midi_settings settings.S menu_draw,
; 0x1181EF78) lists the six names in MENU7 (mixer.S) instead of its own.
        .text
        .nocmp
        mvkl    .S2     0xC00F60C4, b4
        mvkh    .S2     0xC00F60C4, b4
        mvk     .L1     7, a6
