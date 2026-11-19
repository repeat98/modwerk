| BBD's stop kill. STOP, STOP, STOP holds a track (its bit in 0x8000184b) and the
| frame's record builder (0x40004bd4) zeroes FX2 SETUP slot 11 (record +53) of the
| track's 64-byte DSP record while the track's FX2 is one of the three stock
| reverbs. BBD reads slot 11 as its kill input (bbd.asm: 0 cuts to dry and clears
| the line), so this does the same while the track's FX2 is BBD.
        .text
        .equ    BBD_ID,0x0e             | manifest.py FX2_ID; pinned over USB

        .ifndef MODWERK_EVENTS
        .global bbd_kill_hook
| 0x40004d0c (card builds): a2 the held track's record, d4 the track; stock
| loads d0 and d1 again below.
bbd_kill_hook:
        moveq   #0,%d0
        move.w  56(%a2),%d0             | the FX2 id stock tests next
        moveq   #BBD_ID,%d1
        cmp.l   %d0,%d1
        bne.s   1f
        clr.b   53(%a2)                 | slot 11
1:      move.w  56(%a2),%d0             | displaced
        addi.l  #-20,%d0                | displaced
        jmp     (0x40004d16).l
        .else
        .global bbd_tail_kill
| On a Modwerk base that owns 0x40004d0c (sdk/machines/octatrack/events.json),
| the hook is this ev_tail_kill subscriber (runtime.json):
| void f(uint8_t *record, unsigned track).
bbd_tail_kill:
        movea.l 4(%sp),%a0
        moveq   #0,%d0
        move.w  56(%a0),%d0
        moveq   #BBD_ID,%d1
        cmp.l   %d0,%d1
        bne.s   9f
        clr.b   53(%a0)                 | slot 11
9:      rts
        .endif
