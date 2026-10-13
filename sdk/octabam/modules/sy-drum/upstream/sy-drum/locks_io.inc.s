| GENERATED from tools/locks_io.c (with tools/scenes_io.h, tools/gjlocks_io.h); do not edit.
| Run python3 sy-drum/tools/gen_locks_io.py (m68k-elf-gcc on PATH)
| Source SHA256 (the .c, scenes_io.h, gjlocks_io.h) 2742a73afe23913929afa9caa5741a63ebad2b838a1fde3e909b1eeb2da1ed5e
#NO_APP
	.text
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"LOCKS RECOVERED; SAVE TO REPAIR"
.LC1:
	.string	"SY LOCK FILE ERROR"
	.text
	.align	2
	.globl	sl_io_ui_warning
	.type	sl_io_ui_warning, @function
sl_io_ui_warning:
	mov3q.l #1,%d0
	cmp.l 4(%sp),%d0
	jeq .L6
	move.l #.LC1,%d0
	pea 48.w
	move.l %d0,-(%sp)
	jsr sl_io_toast
	addq.l #8,%sp
	rts
.L6:
	move.l #.LC0,%d0
	pea 48.w
	move.l %d0,-(%sp)
	jsr sl_io_toast
	addq.l #8,%sp
	rts
	.size	sl_io_ui_warning, .-sl_io_ui_warning
	.align	2
	.type	snapshot, @function
snapshot:
	lea (-24,%sp),%sp
	movem.l #7196,(%sp)
	move.l 28(%sp),%d2
	mov3q.l #3,%d3
	lea sl_generation,%a2
	lea sl_io_core_bank,%a4
	lea sl_io_core_pack,%a3
.L11:
	move.l (%a2,%d2.l*4),%d4
	move.l %d2,-(%sp)
	jsr (%a4)
	pea sl_io_file
	move.l %d0,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L12
	subq.l #1,%d3
	cmp.l (%a2,%d2.l*4),%d4
	jeq .L17
	tst.l %d3
	jne .L11
	movem.l (%sp),#7196
	moveq #-62,%d0
	lea (24,%sp),%sp
	rts
.L12:
	movem.l (%sp),#7196
	moveq #-60,%d0
	lea (24,%sp),%sp
	rts
.L17:
	lea sl_io_file+32,%a0
	clr.l %d1
.L10:
	move.b (%a0)+,%d0
	not.l %d0
	mvz.b %d0,%d0
	or.l %d0,%d1
	cmp.l #sl_io_file+49184,%a0
	jne .L10
	tst.l %d1
	sne %d1
	move.l 32(%sp),%a0
	clr.l %d0
	move.l %d4,(%a0)
	movem.l (%sp),#7196
	move.l 36(%sp),%a0
	mvs.b %d1,%d1
	neg.l %d1
	move.l %d1,(%a0)
	lea (24,%sp),%sp
	rts
	.size	snapshot, .-snapshot
	.align	2
	.type	fresh_bank, @function
fresh_bank:
	move.l %d2,-(%sp)
	move.l 8(%sp),%d2
	move.l %d2,-(%sp)
	jsr sl_io_core_bank
	addq.l #4,%sp
	move.l %d0,%a0
	add.l #131072,%d0
.L19:
	move.b #-1,(%a0)+
	cmp.l %a0,%d0
	jne .L19
	jsr sl_io_irq_lock
	mov3q.l #1,%d1
	lsl.l %d2,%d1
	lea sl_generation,%a0
	clr.l (%a0,%d2.l*4)
	move.l %d0,8(%sp)
	move.l (%sp)+,%d2
	or.l %d1,sl_ready_mask
	not.l %d1
	and.l %d1,sl_dirty_mask
	and.l %d1,sl_blocked_mask
	jra sl_io_irq_restore
	.size	fresh_bank, .-fresh_bank
	.align	2
	.type	sg_publish, @function
sg_publish:
	lea (-28,%sp),%sp
	movem.l #1052,(%sp)
	move.l 32(%sp),%d3
	mov3q.l #1,%d2
	move.l 40(%sp),%a1
	move.l 36(%sp),20(%sp)
	move.l %d3,-(%sp)
	move.l %a1,20(%sp)
	lsl.l %d3,%d2
	lea sl_io_irq_lock,%a2
	jsr sl_io_core_bank
	move.l %d0,28(%sp)
	jsr (%a2)
	move.l sl_ready_mask,%d4
	and.l %d2,%d4
	move.l %d0,-(%sp)
	not.l %d2
	and.l %d2,sl_ready_mask
	jsr sl_io_irq_restore
	move.l 32(%sp),%a0
	addq.l #8,%sp
	addq.l #6,%a0
	move.l 16(%sp),%a1
	tst.l %a1
	jeq .L27
	move.l %a1,%d0
	add.l #32768,%d0
.L25:
	move.b (%a1),(%a0)
	addq.l #4,%a1
	move.b -3(%a1),1(%a0)
	move.b -2(%a1),2(%a0)
	move.b -1(%a1),3(%a0)
	lea (16,%a0),%a0
	cmp.l %d0,%a1
	jne .L25
.L26:
	jsr (%a2)
	move.l 20(%sp),%d1
	lea sg_generation,%a0
	move.l %d1,(%a0,%d3.l*4)
	and.l %d2,sg_dirty_mask
	move.l %d0,32(%sp)
	and.l %d2,sg_blocked_mask
	and.l %d2,sg_protected_mask
	or.l %d4,sl_ready_mask
	movem.l (%sp),#1052
	lea (28,%sp),%sp
	jra sl_io_irq_restore
.L27:
	clr.l %d0
.L24:
	st %d1
	move.b #-1,(%a0)
	addq.l #4,%d0
	lea (16,%a0),%a0
	move.b %d1,-13(%a0)
	move.b %d1,-14(%a0)
	move.b %d1,-15(%a0)
	cmp.l #32768,%d0
	jeq .L26
	st %d1
	move.b #-1,(%a0)
	addq.l #4,%d0
	lea (16,%a0),%a0
	move.b %d1,-13(%a0)
	move.b %d1,-14(%a0)
	move.b %d1,-15(%a0)
	cmp.l #32768,%d0
	jne .L24
	jra .L26
	.size	sg_publish, .-sg_publish
	.section	.rodata.str1.1
.LC2:
	.string	"sylock"
.LC3:
	.string	".strd"
.LC4:
	.string	".work"
	.text
	.align	2
	.type	path_for.part.0, @function
path_for.part.0:
	lea (-12,%sp),%sp
	clr.l %d0
	movem.l #3076,(%sp)
	move.l 20(%sp),%a1
	move.l 16(%sp),%a2
	move.l 24(%sp),%d2
	move.b (%a1),%d1
	jeq .L36
.L34:
	move.b %d1,(%a2,%d0.l)
	move.l %d0,%a0
	addq.l #1,%d0
	move.b (%a1,%d0.l),%d1
	jeq .L55
	cmp.l #245,%d0
	jne .L34
.L36:
	movem.l (%sp),#3076
	moveq #-63,%d0
	lea (12,%sp),%sp
	rts
.L55:
	moveq #47,%d1
	lea 2(%a2,%a0.l),%a3
	lea .LC2,%a1
	move.b %d1,(%a2,%d0.l)
	moveq #115,%d0
.L38:
	move.b %d0,(%a3)+
	addq.l #1,%a1
	move.b (%a1),%d0
	cmp.l #.LC2+6,%a1
	jne .L38
	move.l %d2,%d0
	moveq #9,%d1
	lea 8(%a2,%a0.l),%a1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L39
	moveq #49,%d1
	add.l #38,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jne .L41
.L56:
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l #.LC4,%d2
	move.l %d2,%a1
.L43:
	move.b %d0,(%a3)+
	move.b 1(%a1),%d0
	addq.l #1,%a1
	tst.b %d0
	jne .L43
	lea 10(%a1,%a0.l),%a0
	clr.l %d0
	move.l %a0,%d1
	sub.l %d2,%d1
	clr.b %d2
	move.b %d2,(%a2,%d1.l)
	movem.l (%sp),#3076
	lea (12,%sp),%sp
	rts
.L39:
	moveq #48,%d1
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jeq .L56
.L41:
	move.l #.LC3,%d2
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l %d2,%a1
	jra .L43
	.size	path_for.part.0, .-path_for.part.0
	.section	.rodata.str1.1
.LC5:
	.string	"r"
.LC6:
	.string	"SYLOCKS"
	.text
	.align	2
	.type	read_bank, @function
read_bank:
	subq.l #8,%sp
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	pea sl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L83
	pea 512.w
	pea sl_io_sector
	pea .LC5
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L99
	lea sl_io_object,%a0
	move.l (%a0),-(%sp)
	move.l %a0,12(%sp)
	jsr sl_io_fs_size
	addq.l #4,%sp
	move.l 8(%sp),%a0
	tst.l %d0
	jge .L100
	move.l %a0,-(%sp)
	move.l %d0,12(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l 8(%sp),%d1
.L57:
	move.l (%sp)+,%d2
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L100:
	move.l %d0,12(%sp)
	moveq #32,%d2
	cmp.l %d0,%d2
	jcs .L101
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L102
.L76:
	tst.l %d1
	jlt .L103
.L64:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
.L75:
	move.l (%sp)+,%d2
	moveq #-60,%d1
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L99:
	moveq #-12,%d0
	cmp.l %d1,%d0
	jeq .L84
	moveq #-10,%d2
	cmp.l %d1,%d2
	jeq .L75
	move.l (%sp)+,%d2
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L101:
	moveq #32,%d0
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jne .L76
.L102:
	lea .LC6,%a0
	clr.l %d0
.L63:
	lea sl_io_file,%a2
	addq.l #1,%a0
	mvz.b (%a2,%d0.l),%d2
	mvz.b -1(%a0),%d1
	addq.l #1,%d0
	cmp.l %d2,%d1
	jne .L104
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L63
	moveq #9,%d0
	cmp.l 12(%sp),%d0
	jcc .L64
	tst.b sl_io_file+8.l
	jne .L73
	move.b sl_io_file+9,%d0
	mov3q.l #1,%d2
	move.l %d0,%d1
	subq.l #1,%d1
	mvz.b %d1,%d1
	cmp.l %d1,%d2
	jcc .L105
.L73:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
.L69:
	move.l (%sp)+,%d2
	moveq #-61,%d1
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L103:
	pea sl_io_object
	move.l %d1,12(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l 8(%sp),%d1
	move.l %d1,%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L84:
	move.l (%sp)+,%d2
	mov3q.l #1,%d1
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L105:
	moveq #15,%d1
	cmp.l 12(%sp),%d1
	jcc .L64
	tst.b sl_io_file+10.l
	jne .L73
	mvz.b sl_io_file+11,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L73
	move.b sl_io_file+15,%d2
	move.b sl_io_file+14,%d1
	move.w %d2,%a0
	move.l %a0,%d2
	or.l %d2,%d1
	tst.b %d1
	jne .L73
	mvz.b %d0,%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L86
	mvz.w #49184,%d0
.L72:
	cmp.l 12(%sp),%d0
	jne .L64
	move.l 12(%sp),%a0
	pea -32(%a0)
	pea sl_io_file+32
	pea sl_io_object
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jne .L76
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L57
	move.l 32(%sp),-(%sp)
	move.l 16(%sp),-(%sp)
	pea sl_io_file
	move.l 36(%sp),-(%sp)
	jsr sl_io_core_validate
	lea (16,%sp),%sp
	moveq #-2,%d1
	cmp.l %d0,%d1
	jeq .L69
	tst.l %d0
	jlt .L75
	move.l 12(%sp),%a0
	cmp.l #32800,%a0
	jeq .L106
	move.l (%sp)+,%d2
	clr.l %d1
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L86:
	mvz.w #32800,%d0
	jra .L72
.L106:
	lea sl_io_file+49178,%a0
	lea sl_io_file+32796,%a1
.L80:
	moveq #-1,%d0
	subq.l #4,%a1
	move.w %d0,4(%a0)
	move.b 7(%a1),3(%a0)
	move.b 6(%a1),2(%a0)
	move.b 5(%a1),1(%a0)
	move.b 4(%a1),(%a0)
	subq.l #6,%a0
	cmp.l #sl_io_file+26,%a0
	jne .L80
	pea sl_io_file
	move.l 36(%sp),%a0
	move.l (%a0),-(%sp)
	move.l 32(%sp),-(%sp)
	jsr sl_io_core_seal
	lea (12,%sp),%sp
	moveq #-60,%d1
	add.l %d0,%d0
	subx.l %d0,%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	and.l %d0,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L104:
	moveq #9,%d1
	cmp.l 12(%sp),%d1
	jcc .L64
	moveq #15,%d2
	cmp.l 12(%sp),%d2
	jcc .L64
	mvz.w #49184,%d0
	jra .L72
.L83:
	move.l (%sp)+,%d2
	moveq #-63,%d1
	move.l %d1,%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
	.size	read_bank, .-read_bank
	.section	.rodata.str1.1
.LC7:
	.string	"syscen"
	.text
	.align	2
	.type	sc_path.part.0, @function
sc_path.part.0:
	lea (-12,%sp),%sp
	clr.l %d0
	movem.l #3076,(%sp)
	move.l 20(%sp),%a1
	move.l 16(%sp),%a2
	move.l 24(%sp),%d2
	move.b (%a1),%d1
	jeq .L110
.L108:
	move.b %d1,(%a2,%d0.l)
	move.l %d0,%a0
	addq.l #1,%d0
	move.b (%a1,%d0.l),%d1
	jeq .L129
	cmp.l #245,%d0
	jne .L108
.L110:
	movem.l (%sp),#3076
	moveq #-63,%d0
	lea (12,%sp),%sp
	rts
.L129:
	moveq #47,%d1
	lea 2(%a2,%a0.l),%a3
	lea .LC7,%a1
	move.b %d1,(%a2,%d0.l)
	moveq #115,%d0
.L112:
	move.b %d0,(%a3)+
	addq.l #1,%a1
	move.b (%a1),%d0
	cmp.l #.LC7+6,%a1
	jne .L112
	move.l %d2,%d0
	moveq #9,%d1
	lea 8(%a2,%a0.l),%a1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L113
	moveq #49,%d1
	add.l #38,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jne .L115
.L130:
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l #.LC4,%d2
	move.l %d2,%a1
.L117:
	move.b %d0,(%a3)+
	move.b 1(%a1),%d0
	addq.l #1,%a1
	tst.b %d0
	jne .L117
	lea 10(%a1,%a0.l),%a0
	clr.l %d0
	move.l %a0,%d1
	sub.l %d2,%d1
	clr.b %d2
	move.b %d2,(%a2,%d1.l)
	movem.l (%sp),#3076
	lea (12,%sp),%sp
	rts
.L113:
	moveq #48,%d1
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jeq .L130
.L115:
	move.l #.LC3,%d2
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l %d2,%a1
	jra .L117
	.size	sc_path.part.0, .-sc_path.part.0
	.section	.rodata.str1.1
.LC8:
	.string	"sylkgj"
	.text
	.align	2
	.type	sg_path.part.0, @function
sg_path.part.0:
	lea (-12,%sp),%sp
	clr.l %d0
	movem.l #3076,(%sp)
	move.l 20(%sp),%a1
	move.l 16(%sp),%a2
	move.l 24(%sp),%d2
	move.b (%a1),%d1
	jeq .L134
.L132:
	move.b %d1,(%a2,%d0.l)
	move.l %d0,%a0
	addq.l #1,%d0
	move.b (%a1,%d0.l),%d1
	jeq .L153
	cmp.l #245,%d0
	jne .L132
.L134:
	movem.l (%sp),#3076
	moveq #-63,%d0
	lea (12,%sp),%sp
	rts
.L153:
	moveq #47,%d1
	lea 2(%a2,%a0.l),%a3
	lea .LC8,%a1
	move.b %d1,(%a2,%d0.l)
	moveq #115,%d0
.L136:
	move.b %d0,(%a3)+
	addq.l #1,%a1
	move.b (%a1),%d0
	cmp.l #.LC8+6,%a1
	jne .L136
	move.l %d2,%d0
	moveq #9,%d1
	lea 8(%a2,%a0.l),%a1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L137
	moveq #49,%d1
	add.l #38,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jne .L139
.L154:
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l #.LC4,%d2
	move.l %d2,%a1
.L141:
	move.b %d0,(%a3)+
	move.b 1(%a1),%d0
	addq.l #1,%a1
	tst.b %d0
	jne .L141
	lea 10(%a1,%a0.l),%a0
	clr.l %d0
	move.l %a0,%d1
	sub.l %d2,%d1
	clr.b %d2
	move.b %d2,(%a2,%d1.l)
	movem.l (%sp),#3076
	lea (12,%sp),%sp
	rts
.L137:
	moveq #48,%d1
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jeq .L154
.L139:
	move.l #.LC3,%d2
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l %d2,%a1
	jra .L141
	.size	sg_path.part.0, .-sg_path.part.0
	.section	.rodata.str1.1
.LC9:
	.string	"w"
	.text
	.align	2
	.type	sg_write_file.constprop.0, @function
sg_write_file.constprop.0:
	subq.l #4,%sp
	move.l 12(%sp),-(%sp)
	move.l 12(%sp),-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (sg_path.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L160
	pea 512.w
	pea sl_io_sector
	pea .LC9
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L155
	move.l #32800,-(%sp)
	pea sl_io_file
	pea sl_io_object
	jsr sl_io_fs_write
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L163
	tst.l %d1
	jlt .L159
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	moveq #-60,%d1
.L155:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L163:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jle .L155
	clr.l %d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L159:
	pea sl_io_object
	move.l %d1,4(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l (%sp),%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L160:
	moveq #-63,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	sg_write_file.constprop.0, .-sg_write_file.constprop.0
	.align	2
	.type	write_buffer.constprop.0, @function
write_buffer.constprop.0:
	subq.l #4,%sp
	move.l 12(%sp),-(%sp)
	move.l 12(%sp),-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L169
	pea 512.w
	pea sl_io_sector
	pea .LC9
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L164
	move.l #49184,-(%sp)
	pea sl_io_file
	pea sl_io_object
	jsr sl_io_fs_write
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L172
	tst.l %d1
	jlt .L168
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	moveq #-60,%d1
.L164:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L172:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jle .L164
	clr.l %d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L168:
	pea sl_io_object
	move.l %d1,4(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l (%sp),%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L169:
	moveq #-63,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	write_buffer.constprop.0, .-write_buffer.constprop.0
	.section	.rodata.str1.1
.LC10:
	.string	"SYSCENE"
	.text
	.align	2
	.type	sc_read, @function
sc_read:
	lea (-16,%sp),%sp
	movem.l #1036,(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	pea sl_io_path
	jsr (sc_path.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L193
	pea 512.w
	pea sl_io_sector
	pea .LC5
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L202
	lea sl_io_object,%a2
	move.l (%a2),-(%sp)
	jsr sl_io_fs_size
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jge .L203
	move.l %a2,-(%sp)
	move.l %d0,16(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l 12(%sp),%d1
.L173:
	movem.l (%sp),#1036
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L203:
	moveq #32,%d3
	cmp.l %d0,%d3
	jcs .L204
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	move.l %d1,24(%sp)
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d2
	mov3q.l #1,%d0
	move.l 12(%sp),%d1
	cmp.l %d2,%d0
	jeq .L205
.L178:
	tst.l %d2
	jlt .L206
.L186:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
.L181:
	movem.l (%sp),#1036
	moveq #-60,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L202:
	moveq #-12,%d0
	cmp.l %d1,%d0
	jeq .L194
	moveq #-10,%d2
	cmp.l %d1,%d2
	jeq .L181
	movem.l (%sp),#1036
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L204:
	moveq #32,%d0
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	move.l %d1,24(%sp)
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d2
	mov3q.l #1,%d0
	move.l 12(%sp),%d1
	cmp.l %d2,%d0
	jne .L178
.L205:
	lea .LC10,%a0
	clr.l %d0
	lea sl_io_file,%a2
.L179:
	mvz.b (%a2,%d0.l),%d3
	mvz.b (%a0),%d2
	addq.l #1,%a0
	addq.l #1,%d0
	cmp.l %d3,%d2
	jne .L186
	moveq #8,%d2
	cmp.l %d0,%d2
	jne .L179
	moveq #9,%d3
	cmp.l %d1,%d3
	jcc .L186
	tst.b sl_io_file+8.l
	jne .L185
	mvz.b sl_io_file+9,%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L207
.L185:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	movem.l (%sp),#1036
	moveq #-61,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L206:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d2,%d1
	move.l %d1,%d0
	movem.l (%sp),#1036
	lea (16,%sp),%sp
	rts
.L194:
	movem.l (%sp),#1036
	mov3q.l #1,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L207:
	moveq #15,%d3
	cmp.l %d1,%d3
	jcc .L186
	mvz.b sl_io_file+11,%d0
	moveq #32,%d2
	cmp.l %d0,%d2
	jne .L185
	move.b sl_io_file+14,%d3
	move.b sl_io_file+10,%d0
	move.b sl_io_file+15,%d2
	move.w %d3,%a0
	move.l %a0,%d3
	or.l %d3,%d0
	or.l %d2,%d0
	tst.b %d0
	jne .L185
	cmp.l #4128,%d1
	jne .L186
	pea 4096.w
	pea sl_io_file+32
	pea sl_io_object
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L208
	tst.l %d1
	jge .L186
	pea sl_io_object
	move.l %d1,16(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	movem.l (%sp),#1036
	move.l 12(%sp),%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L208:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L173
	tst.b sl_io_file+12.l
	jne .L181
	mvz.b sl_io_file+13,%d0
	cmp.l 24(%sp),%d0
	jne .L181
	mvz.w #4096,%d1
	cmp.l sl_io_file+16.l,%d1
	jne .L181
	mov3q.l #-1,%d1
	lea sl_io_file,%a0
	lea sl_crc_table,%a2
.L189:
	mvz.b (%a0)+,%d0
	move.l %d1,%d2
	lsr.l #8,%d2
	eor.l %d1,%d0
	mvz.b %d0,%d0
	move.l (%a2,%d0.l*4),%d1
	eor.l %d2,%d1
	cmp.l #sl_io_file+28,%a0
	jne .L189
	not.l %d1
	cmp.l sl_io_file+28.l,%d1
	jne .L181
	mov3q.l #-1,%d1
	lea sl_io_file+32,%a1
.L190:
	mvz.b (%a1)+,%d0
	move.l %d1,%d2
	lsr.l #8,%d2
	eor.l %d1,%d0
	mvz.b %d0,%d0
	move.l (%a2,%d0.l*4),%d1
	eor.l %d2,%d1
	cmp.l #sl_io_file+4128,%a1
	jne .L190
	not.l %d1
	cmp.l sl_io_file+24.l,%d1
	jne .L181
	lea sl_io_file+32,%a0
.L191:
	move.b (%a0),%d0
	addq.l #1,%a0
	moveq #126,%d2
	add.l #-128,%d0
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jcc .L181
	cmp.l %a1,%a0
	jne .L191
	movem.l (%sp),#1036
	move.l 32(%sp),%a0
	clr.l %d1
	move.l %d1,%d0
	move.l sl_io_file+20,(%a0)
	lea (16,%sp),%sp
	rts
.L193:
	movem.l (%sp),#1036
	moveq #-63,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
	.size	sc_read, .-sc_read
	.section	.rodata.str1.1
.LC11:
	.string	"SYLOCKGJ"
	.text
	.align	2
	.type	sg_snapshot, @function
sg_snapshot:
	lea (-36,%sp),%sp
	movem.l #7420,(%sp)
	move.l 40(%sp),%d3
	mov3q.l #3,%d2
	lea sg_generation,%a2
	move.l %d3,-(%sp)
	jsr sl_io_core_bank
	addq.l #4,%sp
	move.l %d0,%a4
.L216:
	move.l (%a2,%d3.l*4),%d4
	lea (6,%a4),%a0
	clr.l %d0
	lea sl_io_file,%a3
	lea sl_io_file+32,%a1
.L210:
	move.b (%a0),(%a1)
	lea (16,%a0),%a0
	move.b -15(%a0),1(%a1)
	move.b -14(%a0),2(%a1)
	addq.l #4,%a1
	move.b -13(%a0),%d6
	move.b %d6,-1(%a1)
	move.b -16(%a0),%d1
	move.b -15(%a0),%d5
	move.b -14(%a0),%d7
	and.l %d6,%d1
	and.l %d5,%d1
	and.l %d7,%d1
	not.l %d1
	mvz.b %d1,%d1
	or.l %d1,%d0
	cmp.l #sl_io_file+32800,%a1
	jne .L210
	cmp.l (%a2,%d3.l*4),%d4
	jeq .L224
	subq.l #1,%d2
	tst.l %d2
	jne .L216
	movem.l (%sp),#7420
	moveq #-62,%d0
	lea (36,%sp),%sp
	rts
.L224:
	lea .LC11,%a0
.L212:
	move.b (%a0)+,(%a3)+
	cmp.l #.LC11+8,%a0
	jne .L212
	clr.b %d1
	move.b %d3,sl_io_file+13
	mov3q.l #-1,%d2
	move.l %d4,sl_io_file+20
	lea sl_io_file+32,%a0
	lea sl_crc_table,%a1
	move.b %d1,sl_io_file+12
	clr.w %d1
	move.w %d1,sl_io_file+14
	move.l #65568,%d1
	move.l %d1,sl_io_file+8
	mvz.w #32768,%d1
	move.l %d1,sl_io_file+16
.L213:
	mvz.b (%a0)+,%d1
	move.l %d2,%d3
	lsr.l #8,%d3
	eor.l %d2,%d1
	mvz.b %d1,%d1
	move.l (%a1,%d1.l*4),%d2
	eor.l %d3,%d2
	cmp.l #sl_io_file+32800,%a0
	jne .L213
	not.l %d2
	move.l %d2,sl_io_file+24
	mov3q.l #-1,%d2
	lea sl_io_file,%a0
.L214:
	mvz.b (%a0)+,%d1
	move.l %d2,%d3
	lsr.l #8,%d3
	eor.l %d2,%d1
	mvz.b %d1,%d1
	move.l (%a1,%d1.l*4),%d2
	eor.l %d3,%d2
	cmp.l #sl_io_file+28,%a0
	jne .L214
	tst.l %d0
	sne %d1
	move.l 44(%sp),%a0
	not.l %d2
	move.l %d2,sl_io_file+28
	clr.l %d0
	move.l %d4,(%a0)
	movem.l (%sp),#7420
	move.l 48(%sp),%a0
	mvs.b %d1,%d1
	neg.l %d1
	move.l %d1,(%a0)
	lea (36,%sp),%sp
	rts
	.size	sg_snapshot, .-sg_snapshot
	.align	2
	.type	flush.part.0.constprop.0, @function
flush.part.0.constprop.0:
	lea (-52,%sp),%sp
	movem.l #31996,(%sp)
	move.l sl_dirty_mask,%d0
	move.l %sp,%d6
	move.l sl_blocked_mask,%d4
	not.l %d4
	move.l sl_ready_mask,%d2
	move.l %sp,%d5
	move.l sl_io_protected_mask,%d1
	not.l %d1
	move.l 56(%sp),%d7
	clr.l %d3
	and.l %d2,%d0
	add.l #48,%d6
	add.l #44,%d5
	lea snapshot,%a2
	lea sl_io_irq_lock,%a5
	lea sl_generation,%a4
	lea sl_io_irq_restore,%a3
	and.l %d0,%d4
	and.l %d1,%d4
	and.l %d7,%d4
.L230:
	mov3q.l #1,%d2
	lsl.l %d3,%d2
	move.l %d4,%d0
	and.l %d2,%d0
	tst.l %d0
	jne .L257
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L230
.L260:
	sub.l %a6,%a6
.L227:
	move.l sg_dirty_mask,%d1
	move.l %sp,%d5
	move.l sl_ready_mask,%d3
	move.l %sp,%d4
	move.l sl_blocked_mask,%d6
	not.l %d6
	move.l sg_blocked_mask,%d0
	not.l %d0
	and.l %d3,%d1
	move.l sg_protected_mask,%d3
	not.l %d3
	clr.l %d2
	add.l #48,%d5
	add.l #44,%d4
	lea sg_snapshot,%a2
	lea sl_io_irq_lock,%a5
	lea sg_generation,%a4
	lea sl_io_irq_restore,%a3
	and.l %d1,%d6
	and.l %d0,%d6
	and.l %d3,%d6
	and.l %d7,%d6
.L235:
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	move.l %d6,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L258
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L235
.L263:
	clr.l %d0
.L232:
	tst.l %a6
	jeq .L225
	move.l %a6,%d0
.L225:
	movem.l (%sp),#31996
	lea (52,%sp),%sp
	rts
.L257:
	move.l %d6,-(%sp)
	move.l %d5,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
	move.l %d0,%a6
	tst.l %d0
	jne .L227
	move.l %d2,%d0
	and.l sl_present_mask,%d0
	or.l 48(%sp),%d0
	jeq .L228
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	move.l %d0,%a6
	tst.l %d0
	jne .L227
	or.l %d2,sl_present_mask
.L228:
	move.l 44(%sp),%a6
	not.l %d2
	jsr (%a5)
	cmp.l (%a4,%d3.l*4),%a6
	jeq .L259
	move.l %d0,-(%sp)
	jsr (%a3)
	and.l %d2,sl_io_protected_mask
	addq.l #4,%sp
.L261:
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L230
	jra .L260
.L259:
	move.l %d0,-(%sp)
	and.l %d2,sl_dirty_mask
	jsr (%a3)
	and.l %d2,sl_io_protected_mask
	addq.l #4,%sp
	jra .L261
.L258:
	move.l %d5,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
	tst.l %d0
	jne .L237
	move.l %d3,%d0
	and.l sg_present_mask,%d0
	or.l 48(%sp),%d0
	jeq .L233
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (sg_write_file.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L232
	or.l %d3,sg_present_mask
.L233:
	move.l 44(%sp),%d7
	jsr (%a5)
	cmp.l (%a4,%d2.l*4),%d7
	jeq .L262
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #4,%sp
.L264:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L235
	jra .L263
.L262:
	not.l %d3
	move.l %d0,-(%sp)
	and.l %d3,sg_dirty_mask
	jsr (%a3)
	addq.l #4,%sp
	jra .L264
.L237:
	moveq #-62,%d0
	jra .L232
	.size	flush.part.0.constprop.0, .-flush.part.0.constprop.0
	.align	2
	.type	store_mask, @function
store_mask:
	lea (-52,%sp),%sp
	movem.l #31996,(%sp)
	move.l 56(%sp),%d4
	tst.l sl_io_loaded
	jeq .L278
	move.l %d4,%d3
	and.l sl_blocked_mask,%d3
	tst.l %d3
	jne .L267
	move.l %d4,%d0
	and.l sl_ready_mask,%d0
	cmp.l %d4,%d0
	jne .L267
	move.l %sp,%d6
	move.l %sp,%d5
	add.l #48,%d6
	add.l #44,%d5
	lea snapshot,%a2
	lea sl_io_irq_lock,%a5
	lea sl_generation,%a4
	lea sl_io_irq_restore,%a3
.L268:
	mov3q.l #1,%d2
	lsl.l %d3,%d2
	move.l %d4,%d0
	and.l %d2,%d0
	tst.l %d0
	jne .L300
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L268
.L303:
	sub.l %a6,%a6
.L269:
	move.l sl_ready_mask,%d0
	move.l %sp,%d6
	move.l sl_blocked_mask,%d3
	move.l %sp,%d5
	clr.l %d7
	add.l #48,%d6
	or.l sg_blocked_mask,%d3
	add.l #44,%d5
	lea sg_snapshot,%a2
	lea sl_io_irq_lock,%a5
	lea sg_generation,%a4
	lea sl_io_irq_restore,%a3
	not.l %d3
	and.l %d0,%d3
	and.l %d4,%d3
.L277:
	mov3q.l #1,%d2
	lsl.l %d7,%d2
	move.l %d3,%d0
	and.l %d2,%d0
	tst.l %d0
	jne .L301
	addq.l #1,%d7
	moveq #16,%d0
	cmp.l %d7,%d0
	jne .L277
.L306:
	clr.l %d0
.L274:
	tst.l %a6
	jeq .L265
.L308:
	move.l %a6,%d0
.L265:
	movem.l (%sp),#31996
	lea (52,%sp),%sp
	rts
.L300:
	move.l %d6,-(%sp)
	move.l %d5,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
	move.l %d0,%a6
	tst.l %d0
	jne .L269
	move.l %d2,%d0
	and.l sl_present_mask,%d0
	or.l 48(%sp),%d0
	jeq .L271
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	move.l %d0,%a6
	tst.l %d0
	jne .L269
	mov3q.l #1,-(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	move.l %d0,%a6
	tst.l %d0
	jne .L269
	or.l %d2,sl_present_mask
.L271:
	move.l 44(%sp),%d7
	not.l %d2
	jsr (%a5)
	cmp.l (%a4,%d3.l*4),%d7
	jeq .L302
	move.l %d0,-(%sp)
	jsr (%a3)
	and.l %d2,sl_io_protected_mask
	addq.l #4,%sp
.L304:
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L268
	jra .L303
.L302:
	move.l %d0,-(%sp)
	and.l %d2,sl_dirty_mask
	jsr (%a3)
	and.l %d2,sl_io_protected_mask
	addq.l #4,%sp
	jra .L304
.L301:
	move.l %d6,-(%sp)
	move.l %d5,-(%sp)
	move.l %d7,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
	tst.l %d0
	jne .L279
	move.l %d2,%d0
	and.l sg_present_mask,%d0
	or.l 48(%sp),%d0
	jeq .L275
	clr.l -(%sp)
	move.l %d7,-(%sp)
	jsr (sg_write_file.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L274
	mov3q.l #1,-(%sp)
	move.l %d7,-(%sp)
	jsr (sg_write_file.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L274
	or.l %d2,sg_present_mask
.L275:
	move.l 44(%sp),%d4
	not.l %d2
	jsr (%a5)
	cmp.l (%a4,%d7.l*4),%d4
	jeq .L305
	move.l %d0,-(%sp)
	jsr (%a3)
	and.l %d2,sg_protected_mask
	addq.l #4,%sp
.L307:
	addq.l #1,%d7
	moveq #16,%d0
	cmp.l %d7,%d0
	jne .L277
	jra .L306
.L305:
	move.l %d0,-(%sp)
	and.l %d2,sg_dirty_mask
	jsr (%a3)
	and.l %d2,sg_protected_mask
	addq.l #4,%sp
	jra .L307
.L279:
	moveq #-62,%d0
	tst.l %a6
	jeq .L265
	jra .L308
.L267:
	move.l sl_ready_mask,%d0
	move.l %sp,%d6
	move.l sl_blocked_mask,%d3
	move.l %sp,%d5
	move.w #-61,%a6
	clr.l %d7
	or.l sg_blocked_mask,%d3
	add.l #48,%d6
	add.l #44,%d5
	lea sg_snapshot,%a2
	lea sl_io_irq_lock,%a5
	lea sg_generation,%a4
	lea sl_io_irq_restore,%a3
	not.l %d3
	and.l %d0,%d3
	and.l %d4,%d3
	jra .L277
.L278:
	movem.l (%sp),#31996
	moveq #-60,%d0
	lea (52,%sp),%sp
	rts
	.size	store_mask, .-store_mask
	.align	2
	.type	sg_read, @function
sg_read:
	lea (-16,%sp),%sp
	movem.l #1036,(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	pea sl_io_path
	jsr (sg_path.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L329
	pea 512.w
	pea sl_io_sector
	pea .LC5
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L338
	lea sl_io_object,%a2
	move.l (%a2),-(%sp)
	jsr sl_io_fs_size
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jge .L339
	move.l %a2,-(%sp)
	move.l %d0,16(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l 12(%sp),%d1
.L309:
	movem.l (%sp),#1036
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L339:
	moveq #32,%d3
	cmp.l %d0,%d3
	jcs .L340
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	move.l %d1,24(%sp)
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d2
	mov3q.l #1,%d0
	move.l 12(%sp),%d1
	cmp.l %d2,%d0
	jeq .L341
.L314:
	tst.l %d2
	jlt .L342
.L322:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
.L317:
	movem.l (%sp),#1036
	moveq #-60,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L338:
	moveq #-12,%d0
	cmp.l %d1,%d0
	jeq .L330
	moveq #-10,%d2
	cmp.l %d1,%d2
	jeq .L317
	movem.l (%sp),#1036
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L340:
	moveq #32,%d0
	move.l %d0,-(%sp)
	pea sl_io_file
	pea sl_io_object
	move.l %d1,24(%sp)
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d2
	mov3q.l #1,%d0
	move.l 12(%sp),%d1
	cmp.l %d2,%d0
	jne .L314
.L341:
	lea .LC11,%a0
	clr.l %d0
	lea sl_io_file,%a2
.L315:
	mvz.b (%a2,%d0.l),%d3
	mvz.b (%a0),%d2
	addq.l #1,%a0
	addq.l #1,%d0
	cmp.l %d3,%d2
	jne .L322
	moveq #8,%d2
	cmp.l %d0,%d2
	jne .L315
	moveq #9,%d3
	cmp.l %d1,%d3
	jcc .L322
	tst.b sl_io_file+8.l
	jne .L321
	mvz.b sl_io_file+9,%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L343
.L321:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	movem.l (%sp),#1036
	moveq #-61,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L342:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d2,%d1
	move.l %d1,%d0
	movem.l (%sp),#1036
	lea (16,%sp),%sp
	rts
.L330:
	movem.l (%sp),#1036
	mov3q.l #1,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L343:
	moveq #15,%d3
	cmp.l %d1,%d3
	jcc .L322
	mvz.b sl_io_file+11,%d0
	moveq #32,%d2
	cmp.l %d0,%d2
	jne .L321
	move.b sl_io_file+14,%d3
	move.b sl_io_file+10,%d0
	move.b sl_io_file+15,%d2
	move.w %d3,%a0
	move.l %a0,%d3
	or.l %d3,%d0
	or.l %d2,%d0
	tst.b %d0
	jne .L321
	cmp.l #32800,%d1
	jne .L322
	move.l #32768,-(%sp)
	pea sl_io_file+32
	pea sl_io_object
	jsr sl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L344
	tst.l %d1
	jge .L322
	pea sl_io_object
	move.l %d1,16(%sp)
	jsr sl_io_fs_close
	addq.l #4,%sp
	movem.l (%sp),#1036
	move.l 12(%sp),%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
.L344:
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L309
	tst.b sl_io_file+12.l
	jne .L317
	mvz.b sl_io_file+13,%d0
	cmp.l 24(%sp),%d0
	jne .L317
	mvz.w #32768,%d1
	cmp.l sl_io_file+16.l,%d1
	jne .L317
	mov3q.l #-1,%d1
	lea sl_io_file,%a0
	lea sl_crc_table,%a2
.L325:
	mvz.b (%a0)+,%d0
	move.l %d1,%d2
	lsr.l #8,%d2
	eor.l %d1,%d0
	mvz.b %d0,%d0
	move.l (%a2,%d0.l*4),%d1
	eor.l %d2,%d1
	cmp.l #sl_io_file+28,%a0
	jne .L325
	not.l %d1
	cmp.l sl_io_file+28.l,%d1
	jne .L317
	mov3q.l #-1,%d1
	lea sl_io_file+32,%a1
.L326:
	mvz.b (%a1)+,%d0
	move.l %d1,%d2
	lsr.l #8,%d2
	eor.l %d1,%d0
	mvz.b %d0,%d0
	move.l (%a2,%d0.l*4),%d1
	eor.l %d2,%d1
	cmp.l #sl_io_file+32800,%a1
	jne .L326
	not.l %d1
	cmp.l sl_io_file+24.l,%d1
	jne .L317
	lea sl_io_file+32,%a0
.L327:
	move.b (%a0),%d0
	addq.l #1,%a0
	moveq #126,%d2
	add.l #-128,%d0
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jcc .L317
	cmp.l %a1,%a0
	jne .L327
	movem.l (%sp),#1036
	move.l 32(%sp),%a0
	clr.l %d1
	move.l %d1,%d0
	move.l sl_io_file+20,(%a0)
	lea (16,%sp),%sp
	rts
.L329:
	movem.l (%sp),#1036
	moveq #-63,%d1
	move.l %d1,%d0
	lea (16,%sp),%sp
	rts
	.size	sg_read, .-sg_read
	.align	2
	.type	restore_preflight.part.0, @function
restore_preflight.part.0:
	lea (-28,%sp),%sp
	movem.l #16444,(%sp)
	move.l 32(%sp),%d3
	clr.l %d2
	lea read_bank,%a6
.L347:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L346
.L349:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L347
	move.l %sp,%d5
	clr.l %d2
	add.l #24,%d5
	lea sg_read,%a6
.L348:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L351
.L353:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L348
	movem.l (%sp),#16444
	clr.l %d0
	lea (28,%sp),%sp
	rts
.L346:
	pea 20(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jcc .L349
	movem.l (%sp),#16444
	lea (28,%sp),%sp
	rts
.L351:
	move.l %d5,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jcc .L353
	moveq #-61,%d1
	cmp.l %d0,%d1
	jeq .L353
	movem.l (%sp),#16444
	lea (28,%sp),%sp
	rts
	.size	restore_preflight.part.0, .-restore_preflight.part.0
	.align	2
	.type	restore_mask, @function
restore_mask:
	link.w %fp,#-52
	movem.l #15612,(%sp)
	move.l 8(%fp),%d5
	move.l %fp,%d4
	clr.l %d2
	subq.l #4,%d4
	lea sc_read,%a2
	lea (sc_path.part.0),%a3
.L368:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d5,%d0
	tst.l %d0
	jne .L412
.L363:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L368
.L416:
	move.l %fp,%d6
	clr.l %d4
	subq.l #4,%d6
	lea sg_publish,%a3
	lea sl_io_irq_lock,%a4
.L382:
	mov3q.l #1,%d3
	lsl.l %d4,%d3
	move.l %d5,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L413
.L369:
	addq.l #1,%d4
	moveq #16,%d1
	cmp.l %d4,%d1
	jne .L382
	clr.l %d0
.L362:
	movem.l -52(%fp),#15612
	unlk %fp
	rts
.L412:
	move.l %d4,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L414
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L415
	moveq #-61,%d1
	cmp.l %d0,%d1
	jeq .L363
.L407:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L363
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L368
	jra .L416
.L413:
	pea -8(%fp)
	mov3q.l #1,-(%sp)
	move.l %d4,-(%sp)
	pea sl_io_base
	jsr read_bank
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L417
	tst.l %d0
	jne .L362
	clr.l -(%sp)
	move.l %d4,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L362
	or.l %d3,sl_blocked_mask
	pea sl_io_file+32
	move.l -8(%fp),-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,%d2
	not.l %d2
	and.l %d2,sl_ready_mask
	jsr sl_io_core_publish
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L385
	move.l %d3,%d0
	or.l sl_present_mask,%d0
	and.l %d2,sl_io_protected_mask
	clr.l %d2
	lea sg_read,%a2
	lea (sg_write_file.constprop.0),%a5
	move.l %d0,sl_present_mask
.L381:
	mov3q.l #1,%d7
	lsl.l %d2,%d7
	move.l %d3,%d0
	and.l %d7,%d0
	tst.l %d0
	jne .L418
.L374:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jeq .L369
.L410:
	mov3q.l #1,%d7
	lsl.l %d2,%d7
	move.l %d3,%d0
	and.l %d7,%d0
	tst.l %d0
	jeq .L374
.L418:
	move.l %d6,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,-12(%fp)
	tst.l %d0
	jeq .L419
	mov3q.l #1,%d1
	cmp.l -12(%fp),%d1
	jeq .L420
	moveq #-61,%d0
	cmp.l -12(%fp),%d0
	jeq .L405
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	jsr (%a4)
	move.l %d0,-(%sp)
	or.l %d7,sg_blocked_mask
	jsr sl_io_irq_restore
	or.l %d7,sg_present_mask
	lea (16,%sp),%sp
	move.l -12(%fp),%d1
	move.l %d1,sl_io_last_error
	tst.l sl_io_warning
	jne .L374
	move.l %d1,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L410
	jra .L369
.L419:
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a5)
	pea sl_io_file+32
	move.l -4(%fp),-(%sp)
	move.l %d2,-(%sp)
	move.l %d0,-12(%fp)
	jsr (%a3)
	lea (20,%sp),%sp
	or.l %d7,sg_present_mask
	tst.l -12(%fp)
	jeq .L374
	move.l -12(%fp),%d0
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L374
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L410
	jra .L369
.L405:
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	jsr (%a4)
	addq.l #1,%d2
	move.l %d0,-(%sp)
	or.l %d7,sg_blocked_mask
	jsr sl_io_irq_restore
	or.l %d7,sg_present_mask
	lea (16,%sp),%sp
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L410
	jra .L369
.L420:
	move.l %d7,%d0
	and.l sg_blocked_mask,%d0
	tst.l %d0
	jne .L405
	move.l %d6,-(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	moveq #-61,%d1
	cmp.l %d0,%d1
	jeq .L405
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (sg_path.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L421
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	not.l %d7
	lea (12,%sp),%sp
	and.l %d7,sg_present_mask
.L423:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L410
	jra .L369
.L414:
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (%a3)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L383
	pea 512.w
	pea sl_io_sector
	pea .LC9
	pea sl_io_path
	pea sl_io_object
	jsr sl_io_fs_open
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L407
	pea 4128.w
	pea sl_io_file
	pea sl_io_object
	jsr sl_io_fs_write
	pea sl_io_object
	move.l %d0,%d6
	jsr sl_io_fs_close
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d6,%d1
	jeq .L366
	tst.l %d6
	jlt .L422
	moveq #-60,%d0
	jra .L407
.L417:
	clr.l -(%sp)
	move.l %d4,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L371
	pea sl_io_path
	jsr sl_io_fs_remove
	addq.l #4,%sp
	tst.l %d0
	jge .L371
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L362
.L371:
	move.l %d4,-(%sp)
	jsr fresh_bank
	move.l %d3,%d2
	not.l %d2
	addq.l #4,%sp
	lea sg_read,%a2
	move.l %d2,%d0
	and.l sl_present_mask,%d0
	and.l %d2,sl_io_protected_mask
	clr.l %d2
	lea (sg_write_file.constprop.0),%a5
	move.l %d0,sl_present_mask
	jra .L381
.L415:
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (sc_path.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L363
	pea sl_io_path
	jsr sl_io_fs_remove
	addq.l #4,%sp
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L368
	jra .L416
.L383:
	moveq #-63,%d0
	jra .L407
.L421:
	pea sl_io_path
	jsr sl_io_fs_remove
	addq.l #4,%sp
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	not.l %d7
	lea (12,%sp),%sp
	and.l %d7,sg_present_mask
	jra .L423
.L422:
	move.l %d6,%d0
	jra .L407
.L366:
	tst.l %d0
	jlt .L407
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L368
	jra .L416
.L385:
	movem.l -52(%fp),#15612
	moveq #-60,%d0
	unlk %fp
	rts
	.size	restore_mask, .-restore_mask
	.align	2
	.globl	sl_io_play_tick
	.type	sl_io_play_tick, @function
sl_io_play_tick:
	move.l %d2,-(%sp)
	tst.l sl_io_loaded
	jne .L437
.L425:
	clr.l sl_io_play_ticks
.L424:
	move.l (%sp)+,%d2
	rts
.L437:
	move.l sl_dirty_mask,%d1
	move.l sl_ready_mask,%a0
	move.l %a0,%d2
	move.l sl_blocked_mask,%d0
	and.l %d2,%d1
	or.l sl_io_protected_mask,%d0
	not.l %d0
	and.l %d1,%d0
	tst.l %d0
	jne .L426
	move.l sg_dirty_mask,%d1
	move.l sl_ready_mask,%a0
	move.l %a0,%d2
	move.l sl_blocked_mask,%d0
	and.l %d2,%d1
	or.l sg_blocked_mask,%d0
	or.l sg_protected_mask,%d0
	not.l %d0
	and.l %d1,%d0
	tst.l %d0
	jeq .L425
.L426:
	move.l sl_io_play_ticks,%d0
	moveq #59,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L438
	clr.l sl_io_play_ticks
	tst.l sl_io_flush_pending
	jne .L424
	tst.l 1175264744
	jne .L424
	mov3q.l #1,%d2
	cmp.l -2147483512.l,%d2
	jeq .L424
	tst.l 269452412
	jne .L424
	jsr sl_io_stock_card_ready
	tst.l %d0
	jeq .L424
	moveq #-128,%d0
	pea sl_io_flush_job
	move.l #1175263182,-(%sp)
	mov3q.l #1,sl_io_flush_pending
	move.b %d0,sl_io_flush_job
	jsr sl_io_queue_post
	addq.l #8,%sp
	move.l (%sp)+,%d2
	rts
.L438:
	move.l (%sp)+,%d2
	move.l %d0,sl_io_play_ticks
	rts
	.size	sl_io_play_tick, .-sl_io_play_tick
	.align	2
	.globl	sl_io_before_job
	.type	sl_io_before_job, @function
sl_io_before_job:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	move.b (%a0),%d1
	mvz.b %d1,%d0
	cmp.l #128,%d0
	jeq .L474
	move.l %d0,sl_io_job_kind
	mov3q.l #2,%d2
	cmp.l %d0,%d2
	jeq .L475
	clr.l sl_io_warning
	moveq #18,%d2
	cmp.l %d0,%d2
	jcs .L441
	move.l #401296,%d2
	btst %d0,%d2
	jeq .L441
	tst.l sl_io_loaded
	jne .L446
	moveq #8,%d1
	cmp.l %d0,%d1
	jeq .L471
	moveq #12,%d1
	cmp.l %d0,%d1
	jeq .L471
.L441:
	clr.l %d0
.L439:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L475:
	tst.l sl_io_loaded
	jeq .L441
	move.l #65535,-(%sp)
	jsr (flush.part.0.constprop.0)
	addq.l #4,%sp
.L450:
	tst.l %d0
	jeq .L439
	move.l %d0,sl_io_last_error
	move.l sl_io_warning,%d1
	tst.l %d1
	jne .L439
.L448:
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,12(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
.L476:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L474:
	clr.l sl_io_flush_pending
	tst.l sl_io_loaded
	jeq .L441
	move.l #65535,-(%sp)
	jsr (flush.part.0.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jeq .L439
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L441
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l (%sp)+,%d2
	clr.l %d0
	addq.l #4,%sp
	rts
.L446:
	move.l #65535,-(%sp)
	move.l %d1,8(%sp)
	jsr (flush.part.0.constprop.0)
	move.l 8(%sp),%d1
	addq.l #4,%sp
	and.l #251,%d1
	subq.l #8,%d1
	tst.l %d1
	jne .L450
	tst.l sl_blocked_mask
	jeq .L450
	move.l sl_io_warning,%d1
	moveq #-61,%d0
	move.l %d0,sl_io_last_error
	tst.l %d1
	jne .L439
	jra .L448
.L471:
	tst.l sl_blocked_mask
	jeq .L441
	moveq #-61,%d0
	moveq #-61,%d2
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,12(%sp)
	move.l %d2,sl_io_last_error
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
	jra .L476
	.size	sl_io_before_job, .-sl_io_before_job
	.align	2
	.globl	sl_io_reject_job
	.type	sl_io_reject_job, @function
sl_io_reject_job:
	lea (-12,%sp),%sp
	moveq #20,%d1
	move.l %d2,-(%sp)
	move.l 20(%sp),%a0
	move.l 24(%sp),12(%sp)
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jcs .L477
	move.w .L480(%pc,%d0.l*2),%d0
	ext.l %d0
	jmp %pc@(2,%d0:l)
	.balignw 2,0x284c
	.swbeg	&21
.L480:
	.word .L477-.L480
	.word .L477-.L480
	.word .L482-.L480
	.word .L477-.L480
	.word .L485-.L480
	.word .L477-.L480
	.word .L477-.L480
	.word .L485-.L480
	.word .L485-.L480
	.word .L485-.L480
	.word .L483-.L480
	.word .L482-.L480
	.word .L481-.L480
	.word .L477-.L480
	.word .L477-.L480
	.word .L477-.L480
	.word .L477-.L480
	.word .L479-.L480
	.word .L479-.L480
	.word .L479-.L480
	.word .L479-.L480
.L477:
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
.L485:
	mvz.w #270,%d0
	move.w #271,%a1
	mvz.w #269,%d1
	move.l %d0,4(%sp)
	mvz.w #268,%d0
.L484:
	mvz.b (%a0,%d1.l),%d1
	mvz.b (%a0,%a1.l),%d2
	mvz.b (%a0,%d0.l),%d0
	swap %d1
	clr.w %d1
	move.l %d2,8(%sp)
	moveq #24,%d2
	lsl.l %d2,%d0
	move.l 4(%sp),%d2
	move.l %d1,%a1
	mvz.b (%a0,%d2.l),%d1
	move.l %a1,%d2
	or.l %d2,%d0
	lsl.l #8,%d1
	or.l 8(%sp),%d0
	or.l %d1,%d0
	jeq .L477
	move.l 12(%sp),24(%sp)
	move.l %d0,20(%sp)
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	jra sl_io_post
.L479:
	moveq #10,%d2
	moveq #9,%d1
	move.w #11,%a1
	move.l %d2,4(%sp)
	moveq #8,%d0
	jra .L484
.L482:
	moveq #8,%d2
	mov3q.l #7,%d1
	move.w #9,%a1
	move.l %d2,4(%sp)
	mov3q.l #6,%d0
	jra .L484
.L483:
	moveq #12,%d0
	moveq #11,%d1
	move.l %d0,4(%sp)
	moveq #10,%d0
	move.w #13,%a1
	jra .L484
.L481:
	mvz.w #528,%d1
	move.w #529,%a1
	mvz.w #526,%d0
	move.l %d1,4(%sp)
	mvz.w #527,%d1
	jra .L484
	.size	sl_io_reject_job, .-sl_io_reject_job
	.align	2
	.globl	sl_io_banks_load
	.type	sl_io_banks_load, @function
sl_io_banks_load:
	lea (-572,%sp),%sp
	movem.l #31996,(%sp)
	move.l 588(%sp),-(%sp)
	move.l 588(%sp),-(%sp)
	move.l 588(%sp),-(%sp)
	move.l 588(%sp),-(%sp)
	lea sl_io_stock_directory,%a3
	jsr sl_io_stock_banks_load
	move.l %d0,60(%sp)
	clr.l -(%sp)
	clr.l -(%sp)
	jsr (%a3)
	lea (24,%sp),%sp
	tst.l %d0
	jeq .L491
	move.l %d0,%a1
	lea (52,%sp),%a0
	lea (312,%sp),%a2
.L494:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L493
	cmp.l %a0,%a2
	jne .L494
.L491:
	movem.l (%sp),#31996
	move.l 44(%sp),%d0
	lea (572,%sp),%sp
	rts
.L493:
	tst.l sl_io_loaded
	jeq .L495
	mov3q.l #4,%d0
	cmp.l sl_io_job_kind.l,%d0
	jeq .L495
	move.b 52(%sp),%d0
	jeq .L556
	lea sl_io_base,%a1
	lea (52,%sp),%a0
.L498:
	mvs.b (%a1),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a1
	cmp.l %d1,%d0
	jne .L495
	move.b (%a0),%d0
	jne .L498
	move.b (%a1),%d0
	jeq .L491
.L495:
	clr.l -(%sp)
	clr.l -(%sp)
	jsr (%a3)
	addq.l #8,%sp
	tst.l %d0
	jeq .L500
	move.l %d0,%a1
	move.l %a2,%a0
	lea (572,%sp),%a6
.L502:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L501
	cmp.l %a0,%a6
	jne .L502
.L500:
	moveq #-63,%d0
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L491
	pea -63.w
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	movem.l (%sp),#31996
	move.l 44(%sp),%d0
	lea (572,%sp),%sp
	rts
.L501:
	jsr sl_reset
	jsr sl_clip_reset
	jsr sl_seq_reset
	clr.l sl_io_protected_mask
	clr.l sl_io_loaded
	clr.l sl_io_warning
	clr.l sl_io_last_error
	lea sl_io_base,%a0
.L504:
	addq.l #1,%a0
	addq.l #1,%a2
	move.b -1(%a2),%d0
	move.b %d0,-1(%a0)
	jeq .L503
	cmp.l %a2,%a6
	jne .L504
	clr.b %d1
	move.b %d1,sl_io_base
.L503:
	clr.l %d2
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	clr.l %d0
	pea 48(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	clr.l 64(%sp)
	lea read_bank,%a6
	lea sg_read,%a2
	lea sg_publish,%a3
	move.l %d3,%d4
	not.l %d4
	and.l %d4,%d0
	lea sl_io_irq_lock,%a5
	lea sl_io_irq_restore,%a4
	move.l %d0,sl_present_mask
	jsr (%a6)
	lea (16,%sp),%sp
	move.l %d0,%d7
	mov3q.l #1,%d0
	cmp.l %d7,%d0
	jeq .L505
.L562:
	or.l %d3,sl_present_mask
	tst.l %d7
	jeq .L557
	pea 48(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L521
	or.l %d3,sl_present_mask
	tst.l %d0
	jne .L521
.L523:
	or.l %d3,sl_blocked_mask
	pea sl_io_file+32
	move.l 52(%sp),-(%sp)
	move.l %d2,-(%sp)
	and.l %d4,sl_ready_mask
	jsr sl_io_core_publish
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L507
	moveq #-61,%d0
	cmp.l %d7,%d0
	jeq .L558
	or.l %d3,sl_io_protected_mask
	tst.l %d7
	jlt .L510
	moveq #-60,%d7
.L510:
	move.l %d7,sl_io_last_error
	tst.l sl_io_warning
	jne .L507
	mov3q.l #1,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
.L507:
	pea 48(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	clr.l 64(%sp)
	and.l %d4,sg_present_mask
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%d4
	tst.l %d0
	jeq .L559
.L512:
	mov3q.l #1,%d0
	cmp.l %d4,%d0
	jeq .L560
	pea 48(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	moveq #-61,%d1
	cmp.l %d4,%d1
	jeq .L515
	cmp.l %d0,%d1
	jeq .L515
	tst.l %d0
	jeq .L561
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	jsr (%a5)
	move.l %d0,-(%sp)
	or.l %d3,sg_blocked_mask
	jsr (%a4)
	or.l %d3,sg_present_mask
	move.l %d4,sl_io_last_error
	lea (16,%sp),%sp
	tst.l sl_io_warning
	jne .L513
	move.l %d4,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
.L513:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jeq .L518
.L564:
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	move.l sl_present_mask,%d0
	pea 48(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	clr.l 64(%sp)
	move.l %d3,%d4
	not.l %d4
	and.l %d4,%d0
	move.l %d0,sl_present_mask
	jsr (%a6)
	lea (16,%sp),%sp
	move.l %d0,%d7
	mov3q.l #1,%d0
	cmp.l %d7,%d0
	jne .L562
.L505:
	pea 48(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jne .L563
	move.l %d2,-(%sp)
	lea fresh_bank,%a0
	jsr (%a0)
	addq.l #4,%sp
	pea 48(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	clr.l 64(%sp)
	and.l %d4,sg_present_mask
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%d4
	tst.l %d0
	jne .L512
.L559:
	pea sl_io_file+32
	move.l 52(%sp),-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	addq.l #1,%d2
	or.l %d3,sg_present_mask
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L564
.L518:
	movem.l (%sp),#31996
	move.l 44(%sp),%d0
	mov3q.l #1,sl_io_loaded
	lea (572,%sp),%sp
	rts
.L557:
	or.l %d3,sl_blocked_mask
	pea sl_io_file+32
	move.l 52(%sp),-(%sp)
	move.l %d2,-(%sp)
	and.l %d4,sl_ready_mask
	jsr sl_io_core_publish
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L507
	pea 48(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	moveq #-61,%d1
	cmp.l %d0,%d1
	jeq .L565
	tst.l %d0
	jge .L507
.L511:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L507
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	jra .L507
.L515:
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	jsr (%a5)
	move.l %d0,-(%sp)
	or.l %d3,sg_blocked_mask
	jsr (%a4)
	lea (16,%sp),%sp
	or.l %d3,sg_present_mask
	moveq #-61,%d0
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L513
	pea -61.w
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	jra .L513
.L560:
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	jra .L513
.L561:
	pea sl_io_file+32
	move.l 52(%sp),-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	or.l %d3,sg_protected_mask
	or.l %d3,sg_present_mask
	move.l %d4,sl_io_last_error
	tst.l sl_io_warning
	jne .L513
	mov3q.l #1,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	jra .L513
.L558:
	or.l %d3,sl_blocked_mask
	and.l %d4,sl_ready_mask
	or.l %d3,sl_io_protected_mask
	jra .L510
.L565:
	or.l %d3,sl_blocked_mask
	and.l %d4,sl_ready_mask
	move.l %d1,sl_io_last_error
	tst.l sl_io_warning
	jne .L507
	pea -61.w
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	jra .L507
.L521:
	or.l %d3,sl_blocked_mask
	move.l %d7,%d0
	and.l %d4,sl_ready_mask
	jra .L511
.L556:
	move.b sl_io_base,%d0
	jeq .L491
	jra .L495
.L563:
	or.l %d3,sl_present_mask
	tst.l %d0
	jeq .L523
	or.l %d3,sl_blocked_mask
	and.l %d4,sl_ready_mask
	jra .L511
	.size	sl_io_banks_load, .-sl_io_banks_load
	.align	2
	.globl	sl_io_banks_save
	.type	sl_io_banks_save, @function
sl_io_banks_save:
	lea (-288,%sp),%sp
	movem.l #19484,(%sp)
	move.l 304(%sp),-(%sp)
	move.l 304(%sp),-(%sp)
	move.l 304(%sp),-(%sp)
	move.l 304(%sp),-(%sp)
	jsr sl_io_stock_banks_save
	lea (16,%sp),%sp
	move.l sl_io_job_kind,%d1
	subq.l #8,%d1
	move.l %d0,%d3
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jcc .L567
	tst.l %d3
	jlt .L566
	tst.l sl_io_loaded
	jne .L594
.L566:
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (288,%sp),%sp
	rts
.L571:
	tst.l sl_io_loaded
	jeq .L573
	move.b 28(%sp),%d0
	jeq .L614
	lea sl_io_base,%a1
	lea (28,%sp),%a0
.L578:
	mvs.b (%a1),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a1
	cmp.l %d0,%d1
	jne .L573
	move.b (%a0),%d0
	jne .L578
	move.b (%a1),%d0
.L575:
	tst.b %d0
	jne .L573
	tst.l %d3
	jlt .L566
.L594:
	move.w 298(%sp),-(%sp)
	clr.w -(%sp)
	jsr (flush.part.0.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jeq .L566
.L618:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L597
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,32(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 24(%sp),%d0
.L597:
	move.l %d0,%d3
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (288,%sp),%sp
	rts
.L567:
	clr.l -(%sp)
	clr.l -(%sp)
	jsr sl_io_stock_directory
	addq.l #8,%sp
	tst.l %d0
	jeq .L570
	lea (28,%sp),%a6
	move.l %sp,%d2
	move.l %d0,%a1
	add.l #288,%d2
	move.l %a6,%a0
.L572:
	move.b (%a1),%d1
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d1,-1(%a0)
	jeq .L571
	cmp.l %a0,%d2
	jne .L572
	clr.b %d1
	move.b %d1,28(%sp)
.L570:
	clr.b %d0
	moveq #-63,%d1
	clr.l sl_io_loaded
	move.l %d1,sl_io_last_error
	move.b %d0,sl_io_base
	tst.l sl_io_warning
	jne .L576
	pea -63.w
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
.L576:
	tst.l %d3
	jlt .L566
	moveq #-63,%d3
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (288,%sp),%sp
	rts
.L573:
	moveq #9,%d0
	cmp.l sl_io_job_kind.l,%d0
	jeq .L615
	lea sl_io_base,%a0
.L583:
	move.b (%a6),%d0
	addq.l #1,%a0
	addq.l #1,%a6
	move.b %d0,-1(%a0)
	jeq .L582
	cmp.l %a6,%d2
	jne .L583
	clr.b %d0
	move.b %d0,sl_io_base
.L582:
	clr.l sl_io_protected_mask
	mov3q.l #1,sl_io_loaded
	clr.l sg_present_mask
	clr.l sg_protected_mask
	clr.l %d4
	clr.l %d2
	lea (path_for.part.0),%a2
	lea sl_io_fs_open,%a3
.L584:
	sub.l %a6,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L616
.L586:
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jne .L598
.L620:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L584
	move.l %d4,sl_present_mask
	jsr sl_io_irq_lock
	move.l sl_blocked_mask,%d1
	not.l %d1
	and.l sl_ready_mask,%d1
	move.l %d0,-(%sp)
	or.l %d1,sl_dirty_mask
	jsr sl_io_irq_restore
	addq.l #4,%sp
	tst.l %d3
	jlt .L617
	move.l #65535,-(%sp)
	jsr store_mask
	addq.l #4,%sp
	tst.l %d0
	jeq .L566
	jra .L618
.L616:
	pea 512.w
	pea sl_io_sector
	pea .LC5
	pea sl_io_path
	pea sl_io_object
	jsr (%a3)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L619
	pea sl_io_object
	jsr sl_io_fs_close
	addq.l #4,%sp
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	or.l %d0,%d4
.L621:
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jeq .L620
.L598:
	mov3q.l #1,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	pea sl_io_base
	pea sl_io_path
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L586
	jra .L616
.L619:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jeq .L586
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	or.l %d0,%d4
	jra .L621
.L617:
	move.l %d3,sl_io_last_error
	tst.l sl_io_warning
	jne .L566
	move.l %d3,-(%sp)
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (288,%sp),%sp
	rts
.L615:
	jsr sl_reset
	jsr sl_clip_reset
	jsr sl_seq_reset
	mvz.w #65535,%d1
	clr.l sl_present_mask
	clr.l sl_io_warning
	lea sl_io_base,%a0
	move.l %d1,sl_ready_mask
	clr.l sl_io_protected_mask
	clr.l sg_protected_mask
	clr.l sl_io_last_error
	jra .L583
.L614:
	move.b sl_io_base,%d0
	jra .L575
	.size	sl_io_banks_save, .-sl_io_banks_save
	.align	2
	.globl	sl_io_card_sync
	.type	sl_io_card_sync, @function
sl_io_card_sync:
	lea (-12,%sp),%sp
	move.l 16(%sp),%d1
	move.l 20(%sp),%a0
	move.l 24(%sp),%a1
	tst.l sl_io_loaded
	jne .L632
.L623:
	move.l %a1,24(%sp)
	move.l %a0,20(%sp)
	move.l %d1,16(%sp)
	lea (12,%sp),%sp
	jra sl_io_stock_card_sync
.L632:
	move.l #65535,-(%sp)
	move.l %d1,12(%sp)
	move.l %a0,8(%sp)
	move.l %a1,4(%sp)
	jsr (flush.part.0.constprop.0)
	addq.l #4,%sp
	move.l 8(%sp),%d1
	move.l 4(%sp),%a0
	move.l (%sp),%a1
	tst.l %d0
	jeq .L623
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L622
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,16(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 8(%sp),%d0
.L622:
	lea (12,%sp),%sp
	rts
	.size	sl_io_card_sync, .-sl_io_card_sync
	.align	2
	.globl	sl_io_project_store
	.type	sl_io_project_store, @function
sl_io_project_store:
	subq.l #4,%sp
	move.l 16(%sp),-(%sp)
	move.l 16(%sp),-(%sp)
	move.l 16(%sp),-(%sp)
	jsr sl_io_stock_project_store
	lea (12,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L633
	move.l #65535,-(%sp)
	move.l %d0,4(%sp)
	jsr store_mask
	addq.l #4,%sp
	move.l (%sp),%d1
	tst.l %d0
	jne .L641
.L633:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L641:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L638
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,8(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l (%sp),%d0
.L638:
	move.l %d0,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	sl_io_project_store, .-sl_io_project_store
	.align	2
	.globl	sl_io_bank_store
	.type	sl_io_bank_store, @function
sl_io_bank_store:
	subq.l #4,%sp
	move.l 20(%sp),-(%sp)
	move.l 20(%sp),-(%sp)
	move.l 20(%sp),-(%sp)
	move.l 20(%sp),-(%sp)
	jsr sl_io_stock_bank_store
	lea (16,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L642
	move.w 14(%sp),-(%sp)
	clr.w -(%sp)
	move.l %d0,4(%sp)
	jsr store_mask
	addq.l #4,%sp
	move.l (%sp),%d1
	tst.l %d0
	jne .L650
.L642:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L650:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L647
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,8(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l (%sp),%d0
.L647:
	move.l %d0,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	sl_io_bank_store, .-sl_io_bank_store
	.align	2
	.globl	sl_io_project_restore
	.type	sl_io_project_restore, @function
sl_io_project_restore:
	move.l sl_blocked_mask,%d0
	subq.l #4,%sp
	mvz.w %d0,%d0
	tst.l %d0
	jne .L661
	move.l #65535,-(%sp)
	jsr (restore_preflight.part.0)
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jne .L652
	move.l 16(%sp),-(%sp)
	move.l 16(%sp),-(%sp)
	move.l 16(%sp),-(%sp)
	jsr sl_io_stock_project_restore
	lea (12,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L651
	move.l #65535,-(%sp)
	move.l %d0,4(%sp)
	jsr restore_mask
	addq.l #4,%sp
	move.l (%sp),%d1
	tst.l %d0
	jne .L664
.L651:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L661:
	moveq #-61,%d1
.L652:
	move.l %d1,sl_io_last_error
	tst.l sl_io_warning
	jne .L651
	move.l %d1,-(%sp)
	pea sl_io_ui_warning
	move.l %d1,8(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l (%sp),%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L664:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L660
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,8(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l (%sp),%d0
.L660:
	move.l %d0,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	sl_io_project_restore, .-sl_io_project_restore
	.align	2
	.globl	sl_io_bank_restore
	.type	sl_io_bank_restore, @function
sl_io_bank_restore:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 16(%sp),%d2
	mvz.w %d2,%d2
	move.l %d2,%d0
	and.l sl_blocked_mask,%d0
	tst.l %d0
	jne .L674
	move.l %d2,-(%sp)
	jsr (restore_preflight.part.0)
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jne .L666
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	jsr sl_io_stock_bank_restore
	lea (16,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L665
	move.l %d2,-(%sp)
	move.l %d0,8(%sp)
	jsr restore_mask
	addq.l #4,%sp
	move.l 4(%sp),%d1
	tst.l %d0
	jne .L680
.L665:
	move.l (%sp)+,%d2
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L674:
	moveq #-61,%d1
.L666:
	move.l %d1,sl_io_last_error
	tst.l sl_io_warning
	jne .L665
	move.l %d1,-(%sp)
	pea sl_io_ui_warning
	move.l %d1,12(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d1
	move.l %d1,%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L680:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L673
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,12(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
.L673:
	move.l (%sp)+,%d2
	move.l %d0,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	sl_io_bank_restore, .-sl_io_bank_restore
	.align	2
	.globl	sl_io_clear
	.type	sl_io_clear, @function
sl_io_clear:
	jsr sl_io_stock_clear
	jsr sl_reset
	jsr sl_clip_reset
	jsr sl_seq_reset
	clr.b %d0
	clr.l sl_io_protected_mask
	clr.l sl_io_last_error
	clr.l sl_io_loaded
	clr.l sl_io_warning
	clr.l sl_present_mask
	clr.l sg_present_mask
	clr.l sg_protected_mask
	move.b %d0,sl_io_base
	rts
	.size	sl_io_clear, .-sl_io_clear
	.align	2
	.globl	sl_io_delete
	.type	sl_io_delete, @function
sl_io_delete:
	lea (-284,%sp),%sp
	movem.l #19468,(%sp)
	move.l 292(%sp),-(%sp)
	move.l 292(%sp),-(%sp)
	jsr sl_io_stock_directory
	addq.l #8,%sp
	tst.l %d0
	jeq .L684
	move.l %sp,%d3
	add.l #24,%d3
	move.l %d0,%a1
	move.l %d3,%a0
	lea (284,%sp),%a6
.L686:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L708
	cmp.l %a0,%a6
	jne .L686
.L684:
	moveq #-63,%d0
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L687
	pea -63.w
	pea sl_io_ui_warning
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
.L687:
	moveq #-63,%d0
.L683:
	movem.l (%sp),#19468
	lea (284,%sp),%sp
	rts
.L708:
	clr.l %d2
	lea (path_for.part.0),%a3
	lea sl_io_fs_remove,%a2
.L685:
	sub.l %a6,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	pea sl_io_path
	jsr (%a3)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L731
.L712:
	moveq #-63,%d0
.L694:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L683
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,28(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	movem.l (%sp),#19468
	move.l 20(%sp),%d0
	lea (284,%sp),%sp
	rts
.L731:
	pea sl_io_path
	jsr (%a2)
	addq.l #4,%sp
	tst.l %d0
	jlt .L732
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jne .L710
.L735:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L685
	sub.l %a6,%a6
	lea (sc_path.part.0),%a3
.L693:
	clr.l %d2
.L696:
	move.l %d2,-(%sp)
	move.l %a6,-(%sp)
	move.l %d3,-(%sp)
	pea sl_io_path
	jsr (%a3)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L712
	pea sl_io_path
	jsr (%a2)
	addq.l #4,%sp
	tst.l %d0
	jlt .L733
	subq.l #1,%d2
	tst.l %d2
	jne .L713
.L736:
	addq.l #1,%a6
	moveq #16,%d1
	cmp.l %a6,%d1
	jne .L693
	sub.l %a3,%a3
	lea (sg_path.part.0),%a6
.L697:
	clr.l %d2
.L700:
	move.l %d2,-(%sp)
	move.l %a3,-(%sp)
	move.l %d3,-(%sp)
	pea sl_io_path
	jsr (%a6)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L712
	pea sl_io_path
	jsr (%a2)
	addq.l #4,%sp
	tst.l %d0
	jlt .L734
	subq.l #1,%d2
	tst.l %d2
	jne .L716
.L737:
	addq.l #1,%a3
	moveq #16,%d1
	cmp.l %a3,%d1
	jne .L697
	move.l 292(%sp),-(%sp)
	move.l 292(%sp),-(%sp)
	jsr sl_io_stock_delete
	addq.l #8,%sp
	tst.l %d0
	jlt .L694
	movem.l (%sp),#19468
	lea (284,%sp),%sp
	rts
.L732:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L694
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jeq .L735
.L710:
	mov3q.l #1,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	pea sl_io_path
	jsr (%a3)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L712
	jra .L731
.L733:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L694
	subq.l #1,%d2
	tst.l %d2
	jeq .L736
.L713:
	mov3q.l #1,%d2
	jra .L696
.L734:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L694
	subq.l #1,%d2
	tst.l %d2
	jeq .L737
.L716:
	mov3q.l #1,%d2
	jra .L700
	.size	sl_io_delete, .-sl_io_delete
	.align	2
	.globl	sl_io_export
	.type	sl_io_export, @function
sl_io_export:
	lea (-1088,%sp),%sp
	movem.l #19580,(%sp)
	move.l %sp,%d2
	add.l #48,%d2
	lea sl_io_base,%a0
	move.l %d2,%a1
.L740:
	move.b (%a0),%d0
	addq.l #1,%a1
	addq.l #1,%a0
	move.b %d0,-1(%a1)
	jeq .L739
	cmp.l #sl_io_base+260,%a0
	jne .L740
.L741:
	moveq #-63,%d1
	move.l %d1,36(%sp)
.L738:
	movem.l (%sp),#19580
	move.l 36(%sp),%d0
	lea (1088,%sp),%sp
	rts
.L739:
	move.l 1100(%sp),-(%sp)
	move.l 1100(%sp),-(%sp)
	jsr sl_io_stock_directory
	move.l %sp,%d5
	add.l #316,%d5
	addq.l #8,%sp
	move.l %d5,%a2
	move.l %d5,%a0
	addq.l #1,%a0
	move.l %d0,%a1
	addq.l #1,%a1
	move.b -1(%a1),%d0
	lea (568,%sp),%a6
	move.b %d0,-1(%a0)
	jeq .L804
.L742:
	cmp.l %a6,%a0
	jeq .L741
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jne .L742
.L804:
	move.b 48(%sp),%d0
	move.l %d2,%a0
	tst.b %d0
	jeq .L805
.L743:
	mvs.b (%a2),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a2
	cmp.l %d1,%d0
	jne .L748
	move.b (%a0),%d0
	jne .L743
	move.b (%a2),%d0
	jeq .L741
.L748:
	move.l 1108(%sp),-(%sp)
	move.l 1108(%sp),-(%sp)
	move.l 1108(%sp),-(%sp)
	move.l 1108(%sp),-(%sp)
	move.l 1108(%sp),-(%sp)
	jsr sl_io_stock_export
	move.l %d0,56(%sp)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L738
	move.l %sp,%d6
	clr.l %d4
	lea read_bank,%a3
	add.l #828,%d6
	lea (path_for.part.0),%a2
.L749:
	clr.l %d3
.L754:
	pea 40(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L750
	tst.l %d0
	jne .L758
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L741
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d5,-(%sp)
	move.l %d6,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L741
	clr.l -(%sp)
	move.l %a6,-(%sp)
	move.l %d6,-(%sp)
	jsr sl_io_fs_copy
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L758
.L750:
	subq.l #1,%d3
	tst.l %d3
	jne .L775
	addq.l #1,%d4
	moveq #16,%d1
	cmp.l %d4,%d1
	jne .L749
	move.l %sp,%d6
	clr.l %d4
	add.l #44,%d6
	lea sc_read,%a3
	lea (sc_path.part.0),%a2
.L755:
	clr.l %d3
.L759:
	move.l %d6,-(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	subq.l #1,%d0
	tst.l %d0
	jeq .L756
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L757
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d5,-(%sp)
	pea 840(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L757
	clr.l -(%sp)
	move.l %a6,-(%sp)
	pea 836(%sp)
	jsr sl_io_fs_copy
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L758
.L756:
	subq.l #1,%d3
	tst.l %d3
	jne .L777
	addq.l #1,%d4
	moveq #16,%d1
	cmp.l %d4,%d1
	jne .L755
	clr.l %d4
	lea (sg_path.part.0),%a2
	clr.l %d3
	lea (828,%sp),%a3
.L766:
	move.l %d6,-(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr sg_read
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L762
	tst.l %d0
	jeq .L763
	moveq #-61,%d1
	cmp.l %d0,%d1
	jne .L758
.L763:
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L757
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l %d5,-(%sp)
	move.l %a3,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L757
	clr.l -(%sp)
	move.l %a6,-(%sp)
	move.l %a3,-(%sp)
	jsr sl_io_fs_copy
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L758
.L762:
	subq.l #1,%d3
	tst.l %d3
	jne .L778
	addq.l #1,%d4
	moveq #16,%d1
	cmp.l %d4,%d1
	jeq .L738
	clr.l %d3
	jra .L766
.L757:
	moveq #-63,%d0
.L758:
	move.l %d0,sl_io_last_error
	tst.l sl_io_warning
	jne .L768
	move.l %d0,-(%sp)
	pea sl_io_ui_warning
	move.l %d0,40(%sp)
	mov3q.l #1,sl_io_warning
	jsr sl_io_post
	addq.l #8,%sp
	move.l 32(%sp),%d0
.L768:
	movem.l (%sp),#19580
	move.l %d0,36(%sp)
	move.l 36(%sp),%d0
	lea (1088,%sp),%sp
	rts
.L775:
	mov3q.l #1,%d3
	jra .L754
.L777:
	mov3q.l #1,%d3
	jra .L759
.L805:
	move.b 308(%sp),%d0
	jne .L748
	jra .L741
.L778:
	mov3q.l #1,%d3
	jra .L766
	.size	sl_io_export, .-sl_io_export
	.local	sg_present_mask
.section .data
.balign 4
sg_present_mask:
.space 4
	.globl	sg_protected_mask
	.section	.data
	.align	2
	.type	sg_protected_mask, @object
	.size	sg_protected_mask, 4
sg_protected_mask:
	.zero	4
	.local	sl_io_play_ticks
.section .data
.balign 4
sl_io_play_ticks:
.space 4
	.local	sl_io_flush_pending
.section .data
.balign 4
sl_io_flush_pending:
.space 4
	.local	sl_io_flush_job
.section .data
.balign 4
sl_io_flush_job:
.space 16
	.local	sl_present_mask
.section .data
.balign 4
sl_present_mask:
.space 4
	.local	sl_io_warning
.section .data
.balign 4
sl_io_warning:
.space 4
	.local	sl_io_job_kind
.section .data
.balign 4
sl_io_job_kind:
.space 4
	.local	sl_io_loaded
.section .data
.balign 4
sl_io_loaded:
.space 4
	.globl	sl_io_protected_mask
	.align	2
	.type	sl_io_protected_mask, @object
	.size	sl_io_protected_mask, 4
sl_io_protected_mask:
	.zero	4
	.globl	sl_io_last_error
	.align	2
	.type	sl_io_last_error, @object
	.size	sl_io_last_error, 4
sl_io_last_error:
	.zero	4
	.local	sl_io_object
.section .data
.balign 4
sl_io_object:
.space 24
	.local	sl_io_sector
.section .data
.balign 4
sl_io_sector:
.space 512
	.local	sl_io_file
.section .data
.balign 4
sl_io_file:
.space 49184
	.local	sl_io_path
.section .data
.balign 4
sl_io_path:
.space 260
	.local	sl_io_base
.section .data
.balign 4
sl_io_base:
.space 260

        .section .text
sl_io_core_bank:
        move.l 4(%sp),%d0
        bsr sl_bank_ptr
        move.l %a0,%d0
        rts
sl_io_core_validate:
        move.l %a2,-(%sp)
        move.l 8(%sp),%d0
        move.l 12(%sp),%a0
        move.l 16(%sp),%d1
        move.l 20(%sp),%a2
        bsr sl_file_validate
        move.l %d1,(%a2)
        move.l (%sp)+,%a2
        rts
sl_io_core_pack:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        move.l 16(%sp),%a1
        bra sl_file_pack
sl_io_core_publish:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        bra sl_bank_publish
sl_io_core_seal:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a1
        bra sl_file_seal
sl_io_fs_open:
        jmp 0x40016864:l
sl_io_fs_read:
        jmp 0x40016564:l
sl_io_fs_write:
        jmp 0x400166b8:l
sl_io_fs_close:
        jmp 0x4001677c:l
sl_io_fs_size:
        move.l 0x46c8241e:l,%a0
        jmp (%a0)
sl_io_fs_copy:
        jmp 0x40016388:l
sl_io_fs_remove:
        move.l 0x46c82432:l,%a0
        jmp (%a0)
sl_io_stock_directory:
        jmp 0x40025230:l
sl_io_stock_card_ready:
        jmp 0x400255ec:l
sl_io_queue_post:
        jmp 0x40000c3c:l
sl_io_post:
        jmp 0x40084110:l
sl_io_toast:
        jmp 0x4005a2b8:l
sl_io_irq_lock:
        moveq #0,%d0
        move.w %sr,%d0
        move.w #0x2700,%sr
        rts
sl_io_irq_restore:
        move.l 4(%sp),%d0
        move.w %d0,%sr
        rts
| Displaced dispatcher switch prefix; a2 remains the stable stock job.
sl_io_dispatch:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %a2,-(%sp)
        bsr sl_io_before_job
        addq.l #4,%sp
        tst.l %d0
        bpl sl_io_dispatch_resume
        move.l %d0,-(%sp)
        move.l %a2,-(%sp)
        bsr sl_io_reject_job
        addq.l #8,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x4008484e:l
sl_io_dispatch_resume:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        mvz.b (%a2),%d0
        moveq #45,%d1
        cmp.l %d0,%d1
        jmp 0x40084864:l
| Existing UI timer schedules stock engine job2 when SY locks alone are dirty.
| No filesystem call, core call, allocation, or new queue descriptor here.
sl_io_background_request:
        and.l %d1,%d0
        bne sl_io_background_yes
        move.l %d1,-(%sp)
        move.l sl_dirty_mask:l,%d0
        and.l sl_ready_mask:l,%d0
        move.l sl_blocked_mask:l,%d1
        or.l sl_io_protected_mask:l,%d1
        not.l %d1
        and.l %d1,%d0
        tst.l %d0
        bne sl_io_background_some
        move.l sg_dirty_mask:l,%d0       | the G..J lock files (sylkgj) alone dirty
        and.l sl_ready_mask:l,%d0
        move.l sl_blocked_mask:l,%d1
        or.l sg_blocked_mask:l,%d1
        or.l sg_protected_mask:l,%d1
        not.l %d1
        and.l %d1,%d0
        tst.l %d0
sl_io_background_some:
        move.l (%sp)+,%d1
        tst.l %d0
        beq sl_io_background_no
sl_io_background_yes:
        moveq #1,%d0
        jmp 0x40022c1c:l
sl_io_background_no:
        jmp 0x40022c70:l
| The UI tick's transport test (0x4005224a; d0 = the sequencer state 0x800065b8): stopped
| (0) or 2 continue to stock's background save counter; otherwise stock clears that counter
| (0x40052278) and the lock files get their own flush (sl_io_play_tick).
sl_io_tick_hook:
        tst.l %d0
        beq sl_io_tick_stock
        moveq #2,%d1
        cmp.l %d0,%d1
        beq sl_io_tick_stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        bsr sl_io_play_tick
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x40052278:l
sl_io_tick_stock:
        jmp 0x40052254:l

sl_io_stock_banks_load:
lea -328(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x400905dc:l

sl_io_stock_banks_save:
link.w %a6,#-324
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x400917d0:l

sl_io_stock_card_sync:
lea -12(%sp),%sp
movem.l %d2-%d4,(%sp)
jmp 0x400919ec:l

sl_io_stock_project_store:
link.w %a6,#-560
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x4008ee7c:l

sl_io_stock_project_restore:
link.w %a6,#-560
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x4008f188:l

sl_io_stock_bank_store:
lea -564(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x4008edac:l

sl_io_stock_bank_restore:
lea -564(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x4008f0b8:l

sl_io_stock_export:
lea -104(%sp),%sp
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x400912cc:l

sl_io_stock_clear:
move.l %a2,-(%sp)
clr.l -(%sp)
jsr 0x4000fd34:l
jmp 0x400909e2:l

sl_io_stock_delete:
lea -324(%sp),%sp
movem.l %d2-%d5/%a2-%a3,(%sp)
jmp 0x4008ec54:l

.section .text
