| SPDX-License-Identifier: MIT
| Append-only wrappers keep the reviewed v7 authored-copy spans unchanged.
.global names_window,names_pending,names_template_open,names_template_draw
.global mt_clone_start_site,mt_clone_end_site,mt_load_site,replay_template_load
names_template_open:
 movel %sp@(8),%sp@-
 movel %sp@(8),%sp@-
 jsr mt_key
 addql #8,%sp
 tstl %d0
 beq.s mt_key_stock
 rts
mt_key_stock:
 jmp names_open
names_template_draw:
 bsr names_setup_draw
 tstl 0x80000012
 beq mt_draw_done
 moveal 0x400bc6c0,%a0
 tstl %a0
 beq mt_draw_done
 .macro mt_text text,y
 pea \text
 pea 0x400b37cf
 pea 0x400b451d
 clrl %sp@-
 pea 1
 pea \y
 | Native text is centered in a 16-pixel field. D is 40 pixels left of F.
 pea 62
 moveal 0x400bc6c0,%a0
 pea %a0@(36)
 pea 0x400ba876
 jsr 0x40013904
 lea %sp@(36),%sp
 .endm
 mt_text mt_init_caption,21
 mt_text mt_func_caption,12
 mt_text mt_push_caption,5
mt_draw_done:
 rts
mt_init_caption: .asciz "INIT"
mt_func_caption: .asciz "FN+"
mt_push_caption: .asciz "PUSH"
.align 2
mt_clone_start_site:
 jsr mt_clone_begin
 jmp 0x400255ec
mt_clone_end_site:
 lea %sp@(-8),%sp
 moveml %d2-%d3,%sp@
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 jsr 0x400917c8
 lea %sp@(16),%sp
 movel %d0,%d3
 tstl %d0
 bmi.s mt_clone_end_done
 tstl %d2
 bmi.s mt_clone_end_done
 jsr mt_clone_finish
mt_clone_end_done:
 movel %d3,%d0
 moveml %sp@,%d2-%d3
 lea %sp@(8),%sp
 rts
mt_load_site:
 lea %sp@(-8),%sp
 moveml %d2-%d3,%sp@
 movel %sp@(8),%d2
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 movel %sp@(24),%sp@-
 bsr replay_template_load
 lea %sp@(16),%sp
 movel %d0,%d3
 tstl %d0
 bmi.s mt_load_done
 movel %d2,%sp@-
 jsr mt_project_loaded
 addql #4,%sp
mt_load_done:
 movel %d3,%d0
 moveml %sp@,%d2-%d3
 lea %sp@(8),%sp
 rts
replay_template_load:
 .space 8
 jmp 0x400905dc
