 .text
 .balign 2
 .global euc_equal
euc_equal:
 move.l 4(%sp),%a0
 move.l 8(%sp),%a1
 move.l 12(%sp),%d0
 bra 2f
1:
 .rept 4
 move.l (%a0)+,%d1
 cmp.l (%a1)+,%d1
 bne 7f
 .endr
 subi.l #16,%d0
2: cmpi.l #16,%d0
 bcc 1b
 bra 4f
3: move.l (%a0)+,%d1
 cmp.l (%a1)+,%d1
 bne 7f
 subq.l #4,%d0
4: cmpi.l #4,%d0
 bcc 3b
 tst.l %d0
 beq 6f
5: move.b (%a0)+,%d1
 cmp.b (%a1)+,%d1
 bne 7f
 subq.l #1,%d0
 bne 5b
6: moveq #1,%d0
 rts
7: moveq #0,%d0
 rts
 .global euc_native_audio,euc_native_midi,euc_native_save,euc_native_load
 .global euc_native_copy,euc_native_clear,euc_native_key
euc_native_audio:
 lea -0x3c(%sp),%sp
 moveq #1,%d1
 jmp 0x4006f4c4
euc_native_midi:
 lea -0x44(%sp),%sp
 moveq #1,%d1
 jmp 0x4006f84c
euc_native_save:
 lea -0x18(%sp),%sp
 movem.l %d2-%d3/%a2-%a5,(%sp)
 jmp 0x4007ae76
euc_native_load:
 lea -0x20(%sp),%sp
 movem.l %d2-%d4/%a2-%a6,(%sp)
 jmp 0x4007acea
euc_native_copy:
 move.l 4(%sp),%a1
 move.l 8(%sp),%a0
 jmp 0x400e8af0
euc_native_clear:
 lea -0xc(%sp),%sp
 movem.l %a2-%a4,(%sp)
 jmp 0x40084828
euc_native_key:
 link %a6,#-0x50
 movem.l %d2-%d7/%a2-%a5,(%sp)
 jmp 0x4003307e
 .global euc_native_grid,euc_native_selected,euc_native_first
euc_native_grid:
 link %a6,#-0x7c
 movem.l %d2-%d7/%a2-%a5,(%sp)
 jmp 0x400345a8
euc_native_selected:
 lea -0x24(%sp),%sp
 movem.l %d2-%d5/%a2-%a4/%a6,(%sp)
 jmp 0x40093d58
euc_native_first:
 lea -0xc(%sp),%sp
 movem.l %d2-%d3/%a2,(%sp)
 jmp 0x40093b58
 .global euc_native_track_mirror
euc_native_track_mirror:
 lea -0xc(%sp),%sp
 movem.l %d2-%d3/%a2,(%sp)
 jmp 0x40023a4a
 .global euc_audio_gate,euc_audio_flags,euc_midi_gate,euc_midi_flags
euc_audio_gate:
 move.w (%a3,%d0.l),%d0
 tst.l 0x5c(%sp)
 beq 1f
 bset #0,%d0
1: and.l %d0,%d1
 rts
euc_audio_flags:
 move.w (%a3,%d2.l),%d1
 tst.l 0x5c(%sp)
 beq 1f
 bset #0,%d1
1: move.l %d1,%d0
 rts
euc_midi_gate:
 move.w (%a2,%d0.l),%d0
 tst.l 0x64(%sp)
 beq 1f
 bset #0,%d0
1: and.l %d0,%d1
 rts
euc_midi_flags:
 move.w (%a2,%d2.l),%d2
 tst.l 0x64(%sp)
 beq 1f
 bset #0,%d2
1: move.w %d2,0x32(%sp)
 rts
