; Looper services block (services.inc), loaded at boot at 0xC00F3000 (RAM test
; region 1, inside the 64 KB kept for MOD code). The big buffer: free RAM
; regions 3, 2 and 1 (region 1 from 0xC0102000, above the 64 KB kept for code).
        .text
        .word   0x5A4C5301                  ; S_MAGIC
        .word   3                           ; S_NREG
        .word   0xC0636980, 0x00199680      ; region 3: 1,677,952 bytes
        .word   0xC0198000, 0x00068000      ; region 2: 425,984 bytes
        .word   0xC0102000, 0x00096000      ; region 1: 614,400 bytes
        .word   0, 0                        ; S_CLAIM, S_HB
        .word   -1                          ; S_SLOT
        .word   0, 0, 0, 0, 0, 0            ; S_PRESS, S_MINE, S_LEDON, S_LEDOFF, S_LEDMASK, S_LEVEL
        .ascii  "        "                  ; S_TEXT
        .word   0, 0, 0, 0, 0               ; S_TEXT end padding
        .word   0, 0, 0, 0, 0, 0, 0         ; S_LASTHB, S_STALE, S_WASMINE, spare
        .word   0x5A4C53FF                  ; end mark (keeps the zero words above in the section)
