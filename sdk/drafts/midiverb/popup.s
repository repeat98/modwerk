| SPDX-License-Identifier: MIT
| Midiverb's program names. A turn of PROG names the new program in stock's
| message box. The base's ev_knob_store take (runtime.json) hands Midiverb the
| knob handler's store while the FX2 page is shown; the entry names the program
| when the page's slot A is PROG, then stores the byte as stock does. Only a knob
| turn stores there: locks, LFOs and scenes never pop a name up. The page is
| known by its descriptor's slot name, not the effect id, which the base picks
| at install (ids past 31 do not pin). Stock addresses: OS 1.40C.

        .text
        .equ    NPROG, 24
        .equ    NAME, 20                | bytes a name, NUL included
        .equ    PAGE, 0x460d1684        | the page shown (long): 4 is FX2
        .equ    NOTIFY, 0x4005a2b8      | stock's message box: (text, duration in 1/60 s)
        .equ    PROG, 0x50524f47        | "PROG", slot A's name in our descriptor

| claims(arg), C: take the knob handler's store while the FX2 page is shown.
        .global mv_knob_claims
mv_knob_claims:
        moveq   #0,%d0
        moveq   #4,%d1
        cmp.l   PAGE,%d1
        bne.s   1f
        moveq   #1,%d0
1:      rts

| 0x40055170, the knob handler's store (jsr entry): d2 the clamped new value,
| d5 the slot, a3 the page descriptor (slot names at +0x16), a2/a5 the Part
| byte and its SRAM mirror. Only d1 is free; the three instructions the site
| held store d2 and load d1, and the flags they leave go back to stock.
        .global mv_knob_entry
mv_knob_entry:
        tst.l   %d5
        bne.s   9f
        move.l  0x16(%a3),%d1
        cmpi.l  #PROG,%d1
        bne.s   9f
        lea     -12(%sp),%sp
        movem.l %d0/%a0-%a1,(%sp)
        moveq   #0,%d1
        move.b  %d2,%d1
        moveq   #NPROG-1,%d0
        cmp.l   %d0,%d1
        bls.s   2f
        move.l  %d0,%d1
2:      mulu.w  #NAME,%d1
        lea     mv_names,%a0
        adda.l  %d1,%a0
        moveq   #72,%d0                 | 1.2 s
        move.l  %d0,-(%sp)
        move.l  %a0,-(%sp)
        jsr     NOTIFY
        addq.l  #8,%sp
        movem.l (%sp),%d0/%a0-%a1
        lea     12(%sp),%sp
9:      move.b  %d2,(%a2)               | displaced: the Part byte
        move.b  %d2,(%a5)               | displaced: its mirror
        move.w  %fp,%d1                 | displaced
        rts

| The take record (struct modwerk_take {claims, entry}).
        .global mv_take_knob
mv_take_knob:
        .long   mv_knob_claims, mv_knob_entry

        .data
| PROG's names, in programs.json's order: written by generate.mjs --write.
mv_names:
| names begin
        .ascii  ".8S LARGE WARM"
        .space  6
        .ascii  "1.6S SMALL DARK"
        .space  5
        .ascii  "1.4S MEDIUM WARM"
        .space  4
        .ascii  "1.6S MEDIUM BRIGHT"
        .space  2
        .ascii  "1.4S LARGE DARK"
        .space  5
        .ascii  "1.8S LARGE BRIGHT"
        .space  3
        .ascii  "2.5S MEDIUM DARK"
        .space  4
        .ascii  "2.8S MEDIUM BRIGHT"
        .space  2
        .ascii  "2.8S SMALL BRIGHT"
        .space  3
        .ascii  "3.0S LARGE WARM"
        .space  5
        .ascii  "4.0S LARGE DARK"
        .space  5
        .ascii  "5S LARGE WARM"
        .space  7
        .ascii  "10S LARGE BRIGHT"
        .space  4
        .ascii  "16S LARGE DARK"
        .space  6
        .ascii  "18S XLARGE BRIGHT"
        .space  3
        .ascii  "20S XLARGE DARK"
        .space  5
        .ascii  "GATED 100MS"
        .space  9
        .ascii  "GATED 200MS"
        .space  9
        .ascii  "GATED 300MS"
        .space  9
        .ascii  "GATED 600MS"
        .space  9
        .ascii  "REVERSE 300MS"
        .space  7
        .ascii  "REVERSE 400MS"
        .space  7
        .ascii  "REVERSE 500MS"
        .space  7
        .ascii  "REVERSE 600MS"
        .space  7
| names end
