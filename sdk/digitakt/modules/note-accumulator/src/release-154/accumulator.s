 .text
 .balign 2
 .global acc_pattern_s
acc_pattern_s:
 lea -16(%sp),%sp
 movem.l %d0-%d1/%a0-%a1,(%sp)
 jsr acc_reset
 movem.l (%sp),%d0-%d1/%a0-%a1
 lea 16(%sp),%sp
 move.l %d0,0x800019ac
 rts
 .global acc_builder_s,acc_accept_s,acc_pitch_s,acc_stock_popup
acc_builder_s:
 move.l %a5,68(%a2)
 lea -16(%sp),%sp
 movem.l %d1/%a0-%a1,4(%sp)
 move.l 100(%sp),-(%sp)
 move.l 100(%sp),-(%sp)
 move.l 96(%sp),-(%sp)
 move.l 96(%sp),-(%sp)
 move.l %a2,-(%sp)
 jsr acc_prepare
 lea 20(%sp),%sp
 movem.l 4(%sp),%d1/%a0-%a1
 lea 16(%sp),%sp
 move.l %a2,%d0
 rts
acc_accept_s:
 lea -16(%sp),%sp
 movem.l %d0-%d1/%a0-%a1,(%sp)
 move.l %a2,-(%sp)
 jsr acc_accept
 addq.l #4,%sp
 movem.l (%sp),%d0-%d1/%a0-%a1
 lea 16(%sp),%sp
 lea 0x4399eb54,%a1
 rts
acc_pitch_s:
 move.l 28(%a2),%d1
 andi.l #0xffff0000,%d1
 cmpi.l #0xacc20000,%d1
 bne 1f
 move.l 64(%a2),%d1
 bra 2f
1: move.l 24(%a2),%d1
2: lea 0x80001f28,%a1
 rts
acc_stock_popup:
 move.l 4(%sp),%d1
 cmpi.l #164,%d1
 scs %d0
 pea 0x4197de98
 jmp 0x40065800
