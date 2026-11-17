; MASTER metering screen: fixed entry points and flags at the start of its section
; (0xC010A000), linked first by scripts/build_master_ui.py. engine.c, perform_engine.c
; and chain_vec.asm (ms_or) name these offsets.
        .sect   ".vectors"
        .nocmp
        .global master_tap, master_poll, master_key, master_draw, ms_on
        B       .S2     master_tap      ; +0  engine.c, end of each audio block while ms_on
        NOP     5
        B       .S2     master_poll     ; +8  perform_engine.c perf_poll16, every 16 ms while ms_on
        NOP     5
        B       .S2     master_key      ; +16 screen 11 keys when the menu entry was MASTER: (ev, steps)
        NOP     5
        B       .S2     master_draw     ; +24 screen 11 draw, the same
        NOP     5
ms_on:  .word   0                       ; +32 the screen is open (0 at boot)
        .word   0xFFFFFFFF, 0xFFFFFFFF  ; +36 / +40 MASTER / KALEIDO CPU, tenths of %, last measured while open
                                        ; (-1 = not yet); asm/diag/diag.c MODS shows them
