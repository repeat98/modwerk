; GRDLOOP status bar: fixed entry point at the start of its C section (0xC00F5400),
; linked first by scripts/build_looper_ui.py; patches/looper.yaml's draw callp names it.
        .sect   ".vectors"
        .nocmp
        .global lbox_draw, lbox_cover
        B       .S2     lbox_draw       ; +0 callp at 0xC00BB0EC (A4 = arg, B3 = return)
        NOP     5
        B       .S2     lbox_cover      ; +8 callp at 0xC00BAA40 (the play draw's cover call)
        NOP     5
