; SPDX-License-Identifier: MIT
; Copyright (c) 2026 Sam Banks (Octabam REMIX SWITCH, PR #655 at 879cecb:
; modules/remix-switch/dsp_park.asm); Modwerk contributors.
;
; DSP side of the RAM boot (boot.s): before the soft reset, the ColdFire
; sends each core host command $0F (vector P:$1E, a dead `jmp *` in both
; 1.40C payloads, turned into `jsr >$20`). This handler stops the DMA and
; ESAI, puts the host port back into the boot ROM's mode, leaves the
; interrupt and then IS the boot ROM: a word count, a load address, that
; many words, then a jump. The next OS's upload drives it as it drives the
; ROM after a power-on; the soft reset does not reset the DSP. Measured on
; an MKII by REMIX SWITCH (29 September 2026). Every instruction, comment on
; why, and the measured traps are in the original.
;
; It lives in the payloads' dead interrupt vectors, as REMIX SWITCH placed
; it: HEAD at P:$20..$3E (31 words), a one-word bridge to TAIL at
; P:$06..$0D (8 words). Assembled with Octabam's vendored dsp_asm
; (`dsp_asm -in head.asm -org 20`, `-org 6` for the tail; -org is hex);
; build_core.py carries the words and writes them into both payloads.

; ---- HEAD, P:$20 ----
osw_dsp:
        move    #0,r3
        movep   r3,x:<<$ffffec          ; DMA0 off
        movep   r3,x:<<$ffffe8          ; DMA1 off
        movep   r3,x:<<$ffffe4          ; DMA2 off
        movep   r3,x:<<$ffffe0          ; DMA3 off (1.40C never enables DMA4/5)
        movep   r3,x:<<$ffffb5          ; ESAI transmitter off
        movep   r3,x:<<$ffffb7          ; ESAI receiver off
        movep   #>$0,y:<<$ffff95        ; ESAI_1 transmitter off
        movep   #>$0,y:<<$ffff97        ; ESAI_1 receiver off
        bclr    #6,x:<<$ffffc4          ; HPCR: HEN off
        bclr    #7,x:<<$ffffc4          ; the boot ROM's lane mode
        bset    #6,x:<<$ffffc4          ; HEN on
        move    ssh,x0                  ; leave the long interrupt into the loader
        move    #>osw_ldr,x0
        move    x0,ssh
        nop
        rti
osw_ldr:
        move    #>$300,sr               ; the payload's own start mode
        brclr   #0,x:<<$ffffc3,0        ; wait: the word count
        movep   x:<<$ffffc6,a
        brclr   #0,x:<<$ffffc3,0        ; wait: the load address
        movep   x:<<$ffffc6,r0
        move    r0,r1
        move    a1,x0
        jmp     $06                     ; the bridge to TAIL

; ---- TAIL, P:$06 ----
osw_tail:
        do      x0,osw_xend
        brclr   #0,x:<<$ffffc3,0        ; wait: a word
        movep   x:<<$ffffc6,x:(r0)+
osw_xend:
        bclr    #$e,y:<<$fffffd
        bclr    #$e,y:<<$fffffe
        jmp     (r1)
