| SPDX-License-Identifier: MIT
| Local test version: volatile Part/track names, no file writes.
| The stock editor retains only stock pointers after names_open returns.
.text
.global names_header,names_open,names_store,names_setup_draw,names_confirm
names_slot:
 clrl %d0
 moveb 0x100b14cf,%d0
 andil #3,%d0
 lsll #3,%d0
 clrl %d1
 moveb 0x100b14cc,%d1
 andil #7,%d1
 addl %d1,%d0
 lsll #4,%d0
 lea names_store,%a0
 addal %d0,%a0
 rts
names_header:
 lea %sp@(-24),%sp
 moveml %d0-%d1/%a0-%a3,%sp@
 tstl 0x80000012
 beq.s names_header_done
 bsr names_slot
 tstb %a0@
 beq.s names_header_done
 movel %a0,%sp@-
 pea %fp@(-120)
 jsr 0x40013f40
 addql #8,%sp
names_header_done:
 moveml %sp@,%d0-%d1/%a0-%a3
 lea %sp@(24),%sp
 .incbin "header.private.bin"
 jmp 0x4004c414
names_open:
 movel 0x400bcd14,%d0
 cmpil #0x400bc6b8,%d0
 bne.s names_open_stock
 movel %sp@(4),%d0
 cmpil #61,%d0
 bne.s names_open_stock
 tstl %sp@(8)
 bne.s names_open_return
 tstl 0x80000012
 beq.s names_open_return
 lea %sp@(-4),%sp
 movel %a2,%sp@
 bsr names_slot
 moveal %a0,%a2
 jsr 0x40056808
 pea 0x4004e978
 pea 1
 movel %a2,%sp@-
 pea names_title
 pea 10
 jsr 0x4007e664
 lea %sp@(20),%sp
 | Stock owns both the working buffer and the editor callback. Retarget its
 | commit destination to that buffer before returning to the UI loop.
 movel #0x460e743c,%d0
 movel %d0,0x460e761e
 lea names_window,%a0
 movel 0x460e7612,%a0@
 lea names_pending,%a0
 movel %a2,%a0@
 movel %sp@+,%a2
names_open_return:
 rts
names_open_stock:
 .incbin "names_key.private.bin"
 jmp 0x4004ae10
| Only the package-owned stock entry detours enter these wrappers. Removal
| restores those entries; a still-open stock editor can then close safely
| without following any pointer into the retired module.
names_is_ours:
 lea names_window,%a0
 movel %a0@,%d0
 beq.s names_not_ours
 cmpl 0x460e7612,%d0
 bne.s names_not_ours
 movel 0x460e761e,%d0
 cmpil #0x460e743c,%d0
 bne.s names_not_ours
 moveq #1,%d0
 rts
names_not_ours:
 clrl %d0
 rts
names_confirm:
 bsr names_is_ours
 tstl %d0
 beq.s names_confirm_stock
 lea %sp@(-4),%sp
 movel %a2,%sp@
 lea names_pending,%a0
 moveal %a0@,%a2
 lea names_window,%a0
 clrl %a0@
 bsr names_confirm_stock
 pea 0x460e743c
 movel %a2,%sp@-
 jsr 0x40013f40
 addql #8,%sp
 pea -1
 jsr 0x4004d948
 addql #4,%sp
 movel %sp@+,%a2
 rts
names_confirm_stock:
 .incbin "names_yes.private.bin"
 jmp 0x4007ddd6
names_setup_draw:
 bsr names_draw_stock
 movel 0x400bc6c0,%d0
 beq.s names_setup_return
 .macro names_text text,y
 pea \text
 pea 0x400b37cf
 pea 0x400b451d
 clrl %sp@-
 pea 1
 pea \y
 pea 102
 moveal 0x400bc6c0,%a0
 pea %a0@(36)
 pea 0x400ba876
 jsr 0x40013904
 lea %sp@(36),%sp
 .endm
 names_text names_caption,21
 names_text names_push,9
names_setup_return:
 rts
names_draw_stock:
 .incbin "names_draw.private.bin"
 jmp 0x40036550
names_caption: .asciz "NAME"
names_push: .asciz "PUSH"
names_title: .asciz "MIDI TRACK NAME"
.align 4
names_window: .long 0
names_pending: .long 0
names_store: .space 512
