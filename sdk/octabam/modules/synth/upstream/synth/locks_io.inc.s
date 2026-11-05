| GENERATED from tools/locks_io.c; do not edit.
| Run python3 synth/tools/gen_locks_io.py (m68k-elf-gcc on PATH)
| Source SHA256 (the .c and migration_io.h) a65024b3acbd62aed47c10972b101959eaecc3f4a7a11f2a70155a8eeecb09a1
#NO_APP
	.text
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"FM LOCKS RECOVERED"
.LC1:
	.string	"FM LOCK FILE ERROR"
	.text
	.align	2
	.globl	fl_io_ui_warning
	.type	fl_io_ui_warning, @function
fl_io_ui_warning:
	mov3q.l #1,%d0
	cmp.l 4(%sp),%d0
	jeq .L6
	move.l #.LC1,%d0
	pea 48.w
	move.l %d0,-(%sp)
	jsr fl_io_toast
	addq.l #8,%sp
	rts
.L6:
	move.l #.LC0,%d0
	pea 48.w
	move.l %d0,-(%sp)
	jsr fl_io_toast
	addq.l #8,%sp
	rts
	.size	fl_io_ui_warning, .-fl_io_ui_warning
	.align	2
	.type	snapshot, @function
snapshot:
	lea (-24,%sp),%sp
	movem.l #7196,(%sp)
	move.l 28(%sp),%d2
	mov3q.l #3,%d4
	lea fl_generation,%a2
	lea fl_io_core_bank,%a4
	lea fl_io_core_pack,%a3
.L12:
	move.l (%a2,%d2.l*4),%d3
	move.l %d2,-(%sp)
	jsr (%a4)
	pea fl_io_file
	move.l %d0,-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L13
	subq.l #1,%d4
	cmp.l (%a2,%d2.l*4),%d3
	jeq .L19
	tst.l %d4
	jne .L12
	movem.l (%sp),#7196
	moveq #-62,%d0
	lea (24,%sp),%sp
	rts
.L13:
	movem.l (%sp),#7196
	moveq #-60,%d0
	lea (24,%sp),%sp
	rts
.L19:
	lea fl_io_file+32,%a1
	clr.l %d1
	lea fl_io_file+18464,%a0
.L10:
	move.b (%a1)+,%d0
	not.l %d0
	mvz.b %d0,%d0
	or.l %d0,%d1
	cmp.l #fl_io_file+18464,%a1
	jne .L10
	lea fl_io_file+18624,%a1
.L11:
	mvz.b (%a0)+,%d0
	or.l %d0,%d1
	cmp.l %a1,%a0
	jne .L11
	tst.l %d1
	sne %d1
	move.l 32(%sp),%a0
	clr.l %d0
	move.l %d3,(%a0)
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
	jsr fl_io_core_bank
	addq.l #4,%sp
	move.l %d0,%a0
	add.l #131072,%d0
.L21:
	move.b #-1,(%a0)+
	cmp.l %a0,%d0
	jne .L21
	mvz.w %d2,%d0
	moveq #11,%d1
	lsl.l %d1,%d0
	move.l %d0,%a0
	add.l #fl_scene_table+2048,%d0
	add.l #fl_scene_table,%a0
.L22:
	move.b #-1,(%a0)+
	cmp.l %a0,%d0
	jne .L22
	move.w %d2,%d0
	mulu.w #160,%d0
	move.l %d0,%a0
	add.l #fl_migration_table+160,%d0
	add.l #fl_migration_table,%a0
.L23:
	clr.b (%a0)+
	cmp.l %a0,%d0
	jne .L23
	jsr fl_io_irq_lock
	mov3q.l #1,%d1
	lsl.l %d2,%d1
	lea fl_generation,%a0
	clr.l (%a0,%d2.l*4)
	move.l %d0,8(%sp)
	move.l (%sp)+,%d2
	or.l %d1,fl_ready_mask
	not.l %d1
	and.l %d1,fl_dirty_mask
	and.l %d1,fl_blocked_mask
	jra fl_io_irq_restore
	.size	fresh_bank, .-fresh_bank
	.section	.rodata.str1.1
.LC2:
	.string	"fmlock"
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
	jeq .L32
.L30:
	move.b %d1,(%a2,%d0.l)
	move.l %d0,%a0
	addq.l #1,%d0
	move.b (%a1,%d0.l),%d1
	jeq .L51
	cmp.l #245,%d0
	jne .L30
.L32:
	movem.l (%sp),#3076
	moveq #-63,%d0
	lea (12,%sp),%sp
	rts
.L51:
	moveq #47,%d1
	lea 2(%a2,%a0.l),%a3
	lea .LC2,%a1
	move.b %d1,(%a2,%d0.l)
	moveq #102,%d0
.L34:
	move.b %d0,(%a3)+
	addq.l #1,%a1
	move.b (%a1),%d0
	cmp.l #.LC2+6,%a1
	jne .L34
	move.l %d2,%d0
	moveq #9,%d1
	lea 8(%a2,%a0.l),%a1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L35
	moveq #49,%d1
	add.l #38,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jne .L37
.L52:
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l #.LC4,%d2
	move.l %d2,%a1
.L39:
	move.b %d0,(%a3)+
	move.b 1(%a1),%d0
	addq.l #1,%a1
	tst.b %d0
	jne .L39
	lea 10(%a1,%a0.l),%a0
	clr.l %d0
	move.l %a0,%d1
	sub.l %d2,%d1
	clr.b %d2
	move.b %d2,(%a2,%d1.l)
	movem.l (%sp),#3076
	lea (12,%sp),%sp
	rts
.L35:
	moveq #48,%d1
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d1,(%a1)
	move.b %d0,9(%a2,%a0.l)
	tst.l 28(%sp)
	jeq .L52
.L37:
	move.l #.LC3,%d2
	lea 10(%a2,%a0.l),%a3
	moveq #46,%d0
	move.l %d2,%a1
	jra .L39
	.size	path_for.part.0, .-path_for.part.0
	.section	.rodata.str1.1
.LC5:
	.string	"r"
.LC6:
	.string	"FMLOCKS"
	.text
	.align	2
	.type	read_bank, @function
read_bank:
	subq.l #8,%sp
	move.l %d2,-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	pea fl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L78
	pea 512.w
	pea fl_io_sector
	pea .LC5
	pea fl_io_path
	pea fl_io_object
	jsr fl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L88
	lea fl_io_object,%a0
	move.l (%a0),-(%sp)
	move.l %a0,8(%sp)
	jsr fl_io_fs_size
	addq.l #4,%sp
	move.l %d0,%d1
	move.l 4(%sp),%a0
	tst.l %d0
	jge .L89
	move.l %a0,-(%sp)
	move.l %d0,8(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l 4(%sp),%d1
.L53:
	move.l (%sp)+,%d2
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L89:
	moveq #32,%d2
	cmp.l %d0,%d2
	jcs .L90
	move.l %d0,-(%sp)
	pea fl_io_file
	pea fl_io_object
	move.l %d1,16(%sp)
	jsr fl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%a0
	mov3q.l #1,%d0
	move.l 4(%sp),%d1
	cmp.l %a0,%d0
	jeq .L91
.L58:
	tst.l %a0
	jlt .L92
.L82:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
.L84:
	move.l (%sp)+,%d2
	moveq #-60,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L88:
	moveq #-12,%d0
	cmp.l %d1,%d0
	jeq .L79
	moveq #-10,%d2
	cmp.l %d1,%d2
	jeq .L84
	move.l (%sp)+,%d2
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L90:
	moveq #32,%d0
	move.l %d0,-(%sp)
	pea fl_io_file
	pea fl_io_object
	move.l %d1,16(%sp)
	jsr fl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%a0
	mov3q.l #1,%d0
	move.l 4(%sp),%d1
	cmp.l %a0,%d0
	jne .L58
.L91:
	lea .LC6,%a0
	clr.l %d0
.L59:
	lea fl_io_file,%a1
	addq.l #1,%a0
	mvz.b (%a1,%d0.l),%d2
	addq.l #1,%d0
	move.l %d2,8(%sp)
	mvz.b -1(%a0),%d2
	cmp.l 8(%sp),%d2
	jne .L93
	moveq #8,%d2
	cmp.l %d0,%d2
	jne .L59
	moveq #9,%d2
	cmp.l %d1,%d2
	jcc .L82
	tst.b fl_io_file+8.l
	jne .L71
	mvz.b fl_io_file+9,%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L94
.L71:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
.L66:
	move.l (%sp)+,%d2
	moveq #-61,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L92:
	pea fl_io_object
	move.l %a0,8(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l 4(%sp),%d1
	move.l %d1,%d0
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L79:
	move.l (%sp)+,%d2
	mov3q.l #1,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L94:
	moveq #15,%d0
	cmp.l %d1,%d0
	jcc .L82
	tst.b fl_io_file+10.l
	jne .L71
	mvz.b fl_io_file+11,%d0
	moveq #32,%d2
	cmp.l %d0,%d2
	jne .L71
	move.b fl_io_file+15,%d2
	move.b fl_io_file+14,%d0
	move.w %d2,%a0
	move.l %a0,%d2
	or.l %d2,%d0
	tst.b %d0
	jne .L71
.L70:
	cmp.l #18624,%d1
	jne .L82
	pea 18592.w
	pea fl_io_file+32
	pea fl_io_object
	jsr fl_io_fs_read
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L95
	tst.l %d1
	jge .L82
	pea fl_io_object
	move.l %d1,8(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l 4(%sp),%d1
	move.l %d1,%d0
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L95:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L53
	move.l 28(%sp),-(%sp)
	pea 18624.w
	pea fl_io_file
	move.l 32(%sp),-(%sp)
	jsr fl_io_core_validate
	lea (16,%sp),%sp
	moveq #-2,%d1
	cmp.l %d0,%d1
	jeq .L66
	add.l %d0,%d0
	subx.l %d0,%d0
	moveq #-60,%d1
	move.l (%sp)+,%d2
	and.l %d0,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
.L93:
	moveq #9,%d0
	cmp.l %d1,%d0
	jcc .L82
	moveq #15,%d2
	cmp.l %d1,%d2
	jcs .L70
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	jra .L84
.L78:
	move.l (%sp)+,%d2
	moveq #-63,%d1
	move.l %d1,%d0
	addq.l #8,%sp
	rts
	.size	read_bank, .-read_bank
	.section	.rodata.str1.1
.LC7:
	.string	"/project.work"
.LC8:
	.string	"/project.strd"
	.text
	.align	2
	.type	fl_mig_path.constprop.0, @function
fl_mig_path.constprop.0:
	move.l %a2,-(%sp)
	tst.l 8(%sp)
	jeq .L105
	lea .LC8,%a1
.L97:
	lea fl_io_base,%a0
	move.b (%a0),%d1
	jeq .L115
	clr.l %d0
	lea fl_io_path,%a2
.L103:
	move.b %d1,(%a2,%d0.l)
	addq.l #1,%d0
	move.b (%a0,%d0.l),%d1
	jeq .L116
	cmp.l #245,%d0
	jne .L103
	move.l (%sp)+,%a2
	moveq #-63,%d0
	rts
.L116:
	move.b (%a1),%d1
	jeq .L100
	lea (%a2,%d0.l),%a0
	addq.l #1,%a1
.L101:
	move.b %d1,(%a0)
	move.b (%a1)+,%d1
	move.l %a0,%d0
	addq.l #1,%a0
	tst.b %d1
	jne .L101
	sub.l #fl_io_path-1,%d0
.L100:
	clr.b %d1
	move.b %d1,(%a2,%d0.l)
	clr.l %d0
	move.l (%sp)+,%a2
	rts
.L105:
	lea .LC7,%a1
	jra .L97
.L115:
	move.b (%a1),%d1
	clr.l %d0
	lea fl_io_path,%a2
	addq.l #1,%a1
	lea (%a2,%d0.l),%a0
	jra .L101
	.size	fl_mig_path.constprop.0, .-fl_mig_path.constprop.0
	.align	2
	.type	fl_mig_text_read.constprop.0, @function
fl_mig_text_read.constprop.0:
	lea (-24,%sp),%sp
	movem.l #3100,(%sp)
	move.l 32(%sp),%a2
	move.l 28(%sp),-(%sp)
	move.l 40(%sp),%a0
	clr.l (%a2)
	clr.l (%a0)
	jsr (fl_mig_path.constprop.0)
	addq.l #4,%sp
	move.l %d0,%d3
	tst.l %d0
	jne .L118
	pea 512.w
	pea fl_io_sector
	pea .LC5
	pea fl_io_path
	pea fl_io_object
	jsr fl_io_fs_open
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L152
	lea fl_io_object,%a3
	move.l (%a3),-(%sp)
	jsr fl_io_fs_size
	addq.l #4,%sp
	move.l %d0,%d2
	tst.l %d0
	jlt .L153
	cmp.l #262122,%d0
	jls .L154
	move.l %a3,-(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
.L118:
	moveq #-63,%d3
.L117:
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L153:
	move.l %a3,-(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l %d2,%d3
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L152:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jeq .L136
.L137:
	move.l %d0,%d3
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L136:
	mov3q.l #1,%d3
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L154:
	move.l %d0,-(%sp)
	pea fl_migration_text
	move.l %a3,-(%sp)
	jsr fl_io_fs_read
	lea (12,%sp),%sp
	mov3q.l #1,%d4
	cmp.l %d0,%d4
	jeq .L123
	tst.l %d0
	jlt .L124
	move.l %a3,-(%sp)
	moveq #-60,%d3
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L123:
	move.l %a3,-(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	tst.l %d0
	jlt .L137
	move.l %d2,(%a2)
	tst.l %d2
	jeq .L117
	moveq #35,%d1
	sub.l %a1,%a1
	lea fl_migration_text,%a2
	sub.l %a0,%a0
	lea fl_mig_line,%a3
.L129:
	move.l %a0,%d0
	add.l %a1,%d0
	mvz.b %d1,%d1
	cmp.l %d2,%d0
	jcc .L128
	mvz.b (%a2,%a0.l),%d0
	addq.l #1,%a0
	cmp.l %d0,%d1
	jne .L128
	move.b (%a3,%a0.l),%d1
	moveq #13,%d4
	mvs.b %d1,%d0
	cmp.l %d0,%d4
	jne .L129
	move.l %a0,%d0
	add.l %a1,%d0
	cmp.l %d2,%d0
	jeq .L133
	lea fl_migration_text,%a0
	moveq #13,%d1
	mvz.b (%a0,%d0.l),%d0
	cmp.l %d0,%d1
	jeq .L133
	moveq #10,%d4
	cmp.l %d0,%d4
	jeq .L133
.L128:
	addq.l #1,%a1
	cmp.l %d2,%a1
	jeq .L117
	mvz.b (%a2)+,%d0
	moveq #10,%d1
	cmp.l %d0,%d1
	jne .L128
	moveq #35,%d1
	sub.l %a0,%a0
	jra .L129
.L133:
	move.l %d3,%d0
	movem.l (%sp),#3100
	move.l 36(%sp),%a0
	mov3q.l #1,(%a0)
	lea (24,%sp),%sp
	rts
.L124:
	move.l %a3,-(%sp)
	move.l %d0,24(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l 20(%sp),%d3
	move.l %d3,%d0
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
	.size	fl_mig_text_read.constprop.0, .-fl_mig_text_read.constprop.0
	.section	.rodata.str1.1
.LC9:
	.string	"w"
	.text
	.align	2
	.type	fl_mig_comment.constprop.0, @function
fl_mig_comment.constprop.0:
	link.w %fp,#-16
	pea -4(%fp)
	pea -8(%fp)
	move.l 8(%fp),-(%sp)
	jsr (fl_mig_text_read.constprop.0)
	lea (12,%sp),%sp
	move.l %d0,-16(%fp)
	tst.l %d0
	jne .L155
	tst.l -4(%fp)
	jne .L155
	move.l -8(%fp),%a0
	lea fl_migration_text,%a1
	tst.l %a0
	jeq .L161
	mvz.b -1(%a1,%a0.l),%d0
	moveq #10,%d1
	cmp.l %d0,%d1
	jeq .L161
	moveq #10,%d0
	move.b %d0,(%a1,%a0.l)
	addq.l #1,%a0
.L161:
	moveq #35,%d0
	add.l %a1,%a0
	lea fl_mig_line+1,%a1
.L162:
	move.b %d0,(%a0)
	move.b (%a1)+,%d0
	move.l %a0,%d1
	addq.l #1,%a0
	tst.b %d0
	jne .L162
	move.l 8(%fp),-(%sp)
	move.l %d1,-12(%fp)
	jsr (fl_mig_path.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jne .L166
	pea 512.w
	pea fl_io_sector
	pea .LC9
	pea fl_io_path
	pea fl_io_object
	jsr fl_io_fs_open
	lea (20,%sp),%sp
	move.l -12(%fp),%d1
	move.l %d0,-16(%fp)
	tst.l %d0
	jlt .L155
	sub.l #fl_migration_text-1,%d1
	move.l %d1,-(%sp)
	pea fl_migration_text
	pea fl_io_object
	jsr fl_io_fs_write
	lea (12,%sp),%sp
	move.l %d0,-16(%fp)
	subq.l #1,%d0
	tst.l %d0
	jeq .L173
	tst.l -16(%fp)
	jlt .L165
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	moveq #-60,%d1
	move.l %d1,-16(%fp)
.L155:
	move.l -16(%fp),%d0
	unlk %fp
	rts
.L173:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l %d0,-16(%fp)
	tst.l %d0
	jle .L155
	clr.l -16(%fp)
	move.l -16(%fp),%d0
	unlk %fp
	rts
.L165:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l -16(%fp),%d0
	unlk %fp
	rts
.L166:
	moveq #-63,%d1
	move.l %d1,-16(%fp)
	move.l -16(%fp),%d0
	unlk %fp
	rts
	.size	fl_mig_comment.constprop.0, .-fl_mig_comment.constprop.0
	.align	2
	.type	write_buffer.constprop.0, @function
write_buffer.constprop.0:
	subq.l #4,%sp
	move.l 12(%sp),-(%sp)
	move.l 12(%sp),-(%sp)
	pea fl_io_base
	pea fl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L179
	pea 512.w
	pea fl_io_sector
	pea .LC9
	pea fl_io_path
	pea fl_io_object
	jsr fl_io_fs_open
	lea (20,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L174
	pea 18624.w
	pea fl_io_file
	pea fl_io_object
	jsr fl_io_fs_write
	lea (12,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L182
	tst.l %d1
	jlt .L178
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	moveq #-60,%d1
.L174:
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L182:
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l %d0,%d1
	tst.l %d0
	jle .L174
	clr.l %d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L178:
	pea fl_io_object
	move.l %d1,4(%sp)
	jsr fl_io_fs_close
	addq.l #4,%sp
	move.l (%sp),%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L179:
	moveq #-63,%d1
	move.l %d1,%d0
	addq.l #4,%sp
	rts
	.size	write_buffer.constprop.0, .-write_buffer.constprop.0
	.align	2
	.type	store_ab, @function
store_ab:
	lea (-48,%sp),%sp
	movem.l #31868,(%sp)
	move.l 52(%sp),%d4
	move.l fl_blocked_mask,%d3
	and.l %d4,%d3
	tst.l %d3
	jne .L184
	move.l fl_ready_mask,%d0
	and.l %d4,%d0
	cmp.l %d0,%d4
	jne .L184
	move.l %sp,%d6
	move.l %sp,%d5
	add.l #44,%d6
	add.l #40,%d5
	lea snapshot,%a6
	lea fl_io_irq_lock,%a4
	lea fl_generation,%a3
	lea fl_io_irq_restore,%a2
.L185:
	mov3q.l #1,%d2
	lsl.l %d3,%d2
	move.l %d4,%d0
	and.l %d2,%d0
	tst.l %d0
	jne .L200
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L185
.L202:
	clr.l %d0
.L183:
	movem.l (%sp),#31868
	lea (48,%sp),%sp
	rts
.L200:
	move.l %d6,-(%sp)
	move.l %d5,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (12,%sp),%sp
	tst.l %d0
	jne .L183
	move.l %d2,%d0
	and.l fl_present_mask,%d0
	or.l 44(%sp),%d0
	jeq .L188
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L183
	mov3q.l #1,-(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L183
	or.l %d2,fl_present_mask
.L188:
	move.l 40(%sp),%a5
	not.l %d2
	jsr (%a4)
	cmp.l (%a3,%d3.l*4),%a5
	jeq .L201
	move.l %d0,-(%sp)
	jsr (%a2)
	and.l %d2,fl_io_protected_mask
	addq.l #4,%sp
.L203:
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L185
	jra .L202
.L201:
	move.l %d0,-(%sp)
	and.l %d2,fl_dirty_mask
	jsr (%a2)
	and.l %d2,fl_io_protected_mask
	addq.l #4,%sp
	jra .L203
.L184:
	movem.l (%sp),#31868
	moveq #-61,%d0
	lea (48,%sp),%sp
	rts
	.size	store_ab, .-store_ab
	.align	2
	.type	flush_ab.constprop.0, @function
flush_ab.constprop.0:
	lea (-48,%sp),%sp
	movem.l #23804,(%sp)
	move.l fl_dirty_mask,%d0
	move.l %sp,%d6
	move.l fl_blocked_mask,%d4
	not.l %d4
	move.l fl_ready_mask,%d2
	move.l %sp,%d5
	move.l fl_io_protected_mask,%d1
	not.l %d1
	clr.l %d3
	and.l %d2,%d0
	add.l #44,%d6
	add.l #40,%d5
	lea snapshot,%a6
	lea fl_io_irq_lock,%a4
	lea fl_generation,%a3
	lea fl_io_irq_restore,%a2
	and.l %d0,%d4
	and.l %d1,%d4
	and.l 52(%sp),%d4
.L209:
	mov3q.l #1,%d2
	lsl.l %d3,%d2
	move.l %d4,%d0
	and.l %d2,%d0
	tst.l %d0
	jne .L219
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L209
.L221:
	clr.l %d0
.L204:
	movem.l (%sp),#23804
	lea (48,%sp),%sp
	rts
.L219:
	move.l %d6,-(%sp)
	move.l %d5,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (12,%sp),%sp
	tst.l %d0
	jne .L204
	move.l %d2,%d0
	and.l fl_present_mask,%d0
	or.l 44(%sp),%d0
	jeq .L207
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr (write_buffer.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jne .L204
	or.l %d2,fl_present_mask
.L207:
	move.l 40(%sp),%d7
	not.l %d2
	jsr (%a4)
	cmp.l (%a3,%d3.l*4),%d7
	jeq .L220
	move.l %d0,-(%sp)
	jsr (%a2)
	and.l %d2,fl_io_protected_mask
	addq.l #4,%sp
.L222:
	addq.l #1,%d3
	moveq #16,%d0
	cmp.l %d3,%d0
	jne .L209
	jra .L221
.L220:
	move.l %d0,-(%sp)
	and.l %d2,fl_dirty_mask
	jsr (%a2)
	and.l %d2,fl_io_protected_mask
	addq.l #4,%sp
	jra .L222
	.size	flush_ab.constprop.0, .-flush_ab.constprop.0
	.align	2
	.type	restore_mask, @function
restore_mask:
	lea (-36,%sp),%sp
	movem.l #19580,(%sp)
	move.l 40(%sp),%d5
	clr.l %d2
	lea read_bank,%a6
	lea (write_buffer.constprop.0),%a2
	lea fl_io_core_publish,%a3
.L229:
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	move.l %d3,%d0
	and.l %d5,%d0
	tst.l %d0
	jne .L237
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L229
.L239:
	clr.l %d0
.L223:
	movem.l (%sp),#19580
	lea (36,%sp),%sp
	rts
.L237:
	pea 32(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	jsr (%a6)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L238
	tst.l %d0
	jne .L223
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	tst.l %d0
	jne .L223
	or.l %d3,fl_blocked_mask
	pea fl_io_file+32
	move.l 36(%sp),-(%sp)
	move.l %d2,-(%sp)
	move.l %d3,%d6
	not.l %d6
	and.l %d6,fl_ready_mask
	jsr (%a3)
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L230
	or.l fl_present_mask,%d3
	and.l %d6,fl_io_protected_mask
	move.l %d3,fl_present_mask
.L240:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L229
	jra .L239
.L238:
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	pea fl_io_path
	jsr (path_for.part.0)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L226
	pea fl_io_path
	jsr fl_io_fs_remove
	addq.l #4,%sp
	tst.l %d0
	jge .L226
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L223
.L226:
	move.l %d2,-(%sp)
	move.l %d3,%d6
	not.l %d6
	jsr fresh_bank
	move.l %d6,%d3
	addq.l #4,%sp
	and.l fl_present_mask,%d3
	and.l %d6,fl_io_protected_mask
	move.l %d3,fl_present_mask
	jra .L240
.L230:
	movem.l (%sp),#19580
	moveq #-60,%d0
	lea (36,%sp),%sp
	rts
	.size	restore_mask, .-restore_mask
	.align	2
	.type	fl_mig_capture.isra.0, @function
fl_mig_capture.isra.0:
	lea (-72,%sp),%sp
	movem.l #31996,(%sp)
	move.l 76(%sp),%d1
	mvz.b 269161678,%d0
	move.l %d1,64(%sp)
	cmp.l %d1,%d0
	jeq .L294
.L242:
	move.l #635712,%d2
	move.l 64(%sp),%d0
	muls.l %d2,%d0
	add.l #1074668000,%d0
	move.l %d0,52(%sp)
.L244:
	move.l 64(%sp),-(%sp)
	move.w 70(%sp),%d0
	mulu.w #160,%d0
	add.l #fl_migration_table,%d0
	move.l %d0,60(%sp)
	jsr fl_io_core_bank
	move.l %d0,72(%sp)
	move.l 60(%sp),%a0
	addq.l #4,%sp
	tst.b 3(%a0)
	jne .L241
	mvz.w 66(%sp),%d6
	moveq #11,%d0
	sub.l %a1,%a1
	lea (12,%a0),%a0
	move.l 52(%sp),%d5
	add.l #585088,%d5
	lsl.l %d0,%d6
	move.l 56(%sp),%d4
	addq.l #4,%d4
	move.l %a0,60(%sp)
	move.l %a0,48(%sp)
	add.l #fl_scene_table+1,%d6
	move.l %d6,44(%sp)
.L255:
	move.l %d4,%a0
	move.l %d5,%a5
	clr.b (%a0)+
	move.l 48(%sp),%a3
	move.l %d5,%a4
	move.l %d5,%a6
	move.l %d5,%d1
	move.l 44(%sp),%d2
	add.l #5730,%d1
	sub.l %a2,%a2
	lea (60,%a5),%a5
	lea (282,%a4),%a4
	lea (34,%a6),%a6
	move.l %a0,%d4
.L254:
	mvz.b (%a6,%a2.l),%d3
	mov3q.l #1,%d0
	cmp.l %d3,%d0
	jeq .L295
.L248:
	addq.l #1,%a2
	add.l #32,%d1
	addq.l #2,%d2
	lea (30,%a5),%a5
	addq.l #2,%a3
	lea (24,%a4),%a4
	moveq #8,%d0
	cmp.l %a2,%d0
	jne .L254
.L297:
	mvz.w #256,%d1
	moveq #16,%d2
	add.l #6322,%d5
	add.l %d2,48(%sp)
	add.l %d1,44(%sp)
	cmp.l 60(%sp),%d4
	jne .L255
	tst.l %a1
	jeq .L241
	clr.l %d5
	move.l 68(%sp),%a4
	moveq #89,%d4
	move.l 52(%sp),%a3
	add.l #36350,%a3
	lea (1024,%a4),%a4
.L263:
	mvz.b (%a3,%d4.l),%d0
	mov3q.l #3,%d6
	cmp.l %d0,%d6
	jcc .L296
.L256:
	lea (8192,%a4),%a4
	add.l #36568,%d4
	addq.l #8,%d5
	cmp.l #128,%d5
	jne .L263
	move.l 56(%sp),%a0
	mov3q.l #1,(%a0)
	jsr fl_io_irq_lock
	move.l 64(%sp),%d2
	mov3q.l #1,%d1
	lsl.l %d2,%d1
	lea fl_generation,%a0
	or.l %d1,fl_dirty_mask
	addq.l #1,(%a0,%d2.l*4)
	movem.l (%sp),#31996
	move.l %d0,76(%sp)
	lea (72,%sp),%sp
	jra fl_io_irq_restore
.L295:
	mvz.b (%a5),%d3
	moveq #70,%d6
	cmp.l %d3,%d6
	jne .L248
	mvz.b 1(%a5),%d3
	moveq #77,%d7
	cmp.l %d3,%d7
	jne .L248
	move.b 2(%a5),%d3
	mvz.b %d3,%d7
	cmp.l %d7,%d0
	jne .L248
	move.l %d4,%a0
	move.l %a2,%d6
	move.b -1(%a0),%d0
	lsl.l %d6,%d7
	mov3q.l #3,%d6
	or.l %d0,%d7
	move.b %d7,-1(%a0)
	move.b 2(%a4),%d0
	move.l %d0,%d7
	subq.l #1,%d7
	mvz.b %d7,%d7
	cmp.l %d7,%d6
	jcc .L249
	move.b %d3,%d0
.L249:
	move.b %d0,(%a3)
	moveq #127,%d7
	move.l %d1,%a0
	move.l %d2,%a1
	lea (-4096,%a0),%a0
	move.b 5(%a4),%d0
	and.l %d7,%d0
	move.b %d0,1(%a3)
.L253:
	mvz.b 8(%a0),%d0
	cmp.l #255,%d0
	jeq .L250
	move.b 8(%a0),%d0
	mov3q.l #3,%d6
	move.l %d0,%d7
	subq.l #1,%d7
	mvz.b %d7,%d7
	cmp.l %d7,%d6
	jcc .L251
	move.b %d3,%d0
.L251:
	move.b %d0,-1(%a1)
.L250:
	mvz.b 11(%a0),%d0
	cmp.l #255,%d0
	jeq .L252
	move.b 11(%a0),%d0
	moveq #127,%d7
	and.l %d7,%d0
	move.b %d0,(%a1)
.L252:
	lea (256,%a0),%a0
	lea (16,%a1),%a1
	cmp.l %a0,%d1
	jne .L253
	mov3q.l #1,%a1
	addq.l #1,%a2
	add.l #32,%d1
	addq.l #2,%d2
	lea (30,%a5),%a5
	addq.l #2,%a3
	lea (24,%a4),%a4
	moveq #8,%d0
	cmp.l %a2,%d0
	jne .L254
	jra .L297
.L241:
	movem.l (%sp),#31996
	lea (72,%sp),%sp
	rts
.L296:
	move.l 56(%sp),%a0
	move.l %d4,%d3
	move.l %a4,%d1
	clr.l %d2
	lea 4(%a0,%d0.l),%a2
	mvz.b (%a2),%d0
	btst %d2,%d0
	jne .L298
.L257:
	addq.l #1,%d2
	add.l #1024,%d1
	add.l #2330,%d3
	moveq #8,%d0
	cmp.l %d2,%d0
	jeq .L256
.L293:
	mvz.b (%a2),%d0
	btst %d2,%d0
	jeq .L257
.L298:
	move.l %d1,%a1
	move.l 52(%sp),%a0
	add.l %d3,%a0
	lea (-1024,%a1),%a1
.L261:
	mvz.b 8(%a0),%d0
	cmp.l #255,%d0
	jeq .L258
	move.b 8(%a0),%d0
	mov3q.l #3,%d6
	move.l %d0,%d7
	subq.l #1,%d7
	mvz.b %d7,%d7
	cmp.l %d7,%d6
	jcc .L259
	moveq #1,%d0
.L259:
	move.b %d0,(%a1)
.L258:
	mvz.b 11(%a0),%d0
	cmp.l #255,%d0
	jeq .L260
	move.b 11(%a0),%d0
	moveq #127,%d7
	and.l %d7,%d0
	move.b %d0,1(%a1)
.L260:
	lea (32,%a0),%a0
	lea (16,%a1),%a1
	cmp.l %d1,%a1
	jne .L261
	addq.l #1,%d2
	add.l #1024,%d1
	add.l #2330,%d3
	moveq #8,%d0
	cmp.l %d2,%d0
	jne .L293
	jra .L256
.L294:
	move.l 1187521622,%d0
	move.l %d0,%d1
	add.l #-1073741824,%d1
	cmp.l #134217727,%d1
	jhi .L242
	move.l %d0,52(%sp)
	jra .L244
	.size	fl_mig_capture.isra.0, .-fl_mig_capture.isra.0
	.align	2
	.type	fl_mig_apply_to, @function
fl_mig_apply_to:
	lea (-52,%sp),%sp
	movem.l #31996,(%sp)
	move.l 64(%sp),%d6
	clr.l %d4
	move.l 60(%sp),%d7
	add.l #-268525902,%d7
	move.l #269110990,%d5
	move.b 1074608214,%d0
	move.b %d0,46(%sp)
	move.w 58(%sp),%d0
	move.b 1074608217,%d2
	mulu.w #160,%d0
	move.l %d7,48(%sp)
	move.l %d0,%a6
	add.l #fl_migration_table,%a6
	move.l %a6,%d3
	add.l #12,%d3
	move.b %d2,47(%sp)
	lea (4,%a6),%a4
.L304:
	tst.l %d6
	jne .L312
	move.l 48(%sp),%a5
	add.l %d5,%a5
	move.l %a5,%d1
	clr.l %d0
	lea (60,%a5),%a1
	add.l #1634,%d1
	lea (282,%a5),%a3
	move.l %d3,%a2
	lea (34,%a5),%a5
.L303:
	mvz.b (%a4),%d2
	btst %d0,%d2
	jne .L330
.L301:
	addq.l #1,%d0
	lea (30,%a1),%a1
	addq.l #2,%a2
	add.l #32,%d1
	lea (24,%a3),%a3
	moveq #8,%d2
	cmp.l %d0,%d2
	jne .L303
	add.l #16,%d3
	addq.l #1,%a4
	add.l #6322,%d5
	addq.l #8,%d4
	moveq #64,%d7
	cmp.l %d4,%d7
	jne .L304
	move.l #-36350,%d4
	sub.l 60(%sp),%d4
	move.l 60(%sp),%a2
	add.l #36439,%a2
	move.l 60(%sp),%d3
	add.l #621527,%d3
	move.l 60(%sp),%d5
	add.l #585088,%d5
.L311:
	move.b (%a2),%d0
	mov3q.l #3,%d2
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L331
.L305:
	add.l #36568,%a2
	cmp.l %a2,%d3
	jne .L311
	movem.l (%sp),#31996
	lea (52,%sp),%sp
	rts
.L330:
	mvz.b (%a5,%d0.l),%d2
	subq.l #1,%d2
	tst.l %d2
	jne .L301
	mvz.b (%a1),%d2
	moveq #70,%d7
	cmp.l %d2,%d7
	jne .L301
	mvz.b 1(%a1),%d2
	moveq #77,%d7
	cmp.l %d2,%d7
	jne .L301
	mvz.b 2(%a1),%d2
	subq.l #1,%d2
	tst.l %d2
	jne .L301
	move.b (%a2),420(%a1)
	move.l %d1,%d2
	move.l %d1,%a0
	add.l #4096,%d2
	move.b 1(%a2),421(%a1)
	move.b 46(%sp),2(%a3)
	move.b 47(%sp),5(%a3)
.L302:
	st %d7
	lea (256,%a0),%a0
	move.b %d7,-248(%a0)
	move.b %d7,-245(%a0)
	cmp.l %a0,%d2
	jeq .L301
	st %d7
	lea (256,%a0),%a0
	move.b %d7,-248(%a0)
	move.b %d7,-245(%a0)
	cmp.l %a0,%d2
	jne .L302
	jra .L301
.L331:
	ext.w %d0
	lea 4(%a6,%d1.l),%a3
	move.l %d4,%d2
	clr.l %d1
	add.l %a2,%d2
	mulu.w #6322,%d0
	move.l %d0,%a4
	add.l %d5,%a4
	mvz.b (%a3),%d0
	lea (60,%a4),%a1
	lea (34,%a4),%a4
	btst %d1,%d0
	jne .L332
.L306:
	addq.l #1,%d1
	lea (30,%a1),%a1
	add.l #2330,%d2
	moveq #8,%d0
	cmp.l %d1,%d0
	jeq .L305
	mvz.b (%a3),%d0
	btst %d1,%d0
	jeq .L306
.L332:
	mvz.b (%a4,%d1.l),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L306
	mvz.b (%a1),%d0
	moveq #70,%d7
	cmp.l %d0,%d7
	jne .L306
	mvz.b 1(%a1),%d0
	moveq #77,%d7
	cmp.l %d0,%d7
	jne .L306
	mvz.b 2(%a1),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L306
	btst #0,%d6
	jeq .L333
	move.l #268525902,%a0
	move.l %a0,%d0
	add.l #2048,%d0
	add.l %d2,%a0
	add.l %d2,%d0
.L309:
	st %d7
	lea (32,%a0),%a0
	move.b %d7,-24(%a0)
	move.b %d7,-21(%a0)
	cmp.l %d0,%a0
	jeq .L306
	st %d7
	lea (32,%a0),%a0
	move.b %d7,-24(%a0)
	move.b %d7,-21(%a0)
	cmp.l %d0,%a0
	jne .L309
	jra .L306
.L312:
	move.l %d5,%a5
	move.l %a5,%d1
	lea (60,%a5),%a1
	clr.l %d0
	lea (282,%a5),%a3
	add.l #1634,%d1
	move.l %d3,%a2
	lea (34,%a5),%a5
	jra .L303
.L333:
	move.l 60(%sp),%a0
	move.l %a0,%d0
	add.l #2048,%d0
	add.l %d2,%a0
	add.l %d2,%d0
	jra .L309
	.size	fl_mig_apply_to, .-fl_mig_apply_to
	.align	2
	.type	fl_mig_run, @function
fl_mig_run:
	lea (-40,%sp),%sp
	movem.l #15612,(%sp)
	move.l 48(%sp),%a3
	move.l 44(%sp),%a5
	move.l %a5,%d1
	or.l %d1,fl_mig_known_mask
	move.l fl_mig_capture_mask,%d0
	tst.l %a3
	jne .L335
	not.l %d1
	and.l %d1,%d0
	move.l #1074668000,%d5
	clr.l %d4
	lea fl_migration_table+3,%a2
	move.l %d0,fl_mig_capture_mask
	clr.l %d0
.L353:
	mov3q.l #1,%d3
	lsl.l %d0,%d3
	move.l %a5,%d1
	and.l %d3,%d1
	tst.l %d1
	jeq .L338
	mvz.b 269161678,%d1
	move.l %d5,%a0
	cmp.l %d0,%d1
	jeq .L400
.L340:
	mvz.b (%a2),%d1
	mov3q.l #2,%d6
	cmp.l %d1,%d6
	jeq .L338
	subq.l #1,%d1
	tst.l %d1
	jeq .L343
	tst.l %a3
	jne .L401
.L338:
	addq.l #1,%d0
	add.l #635712,%d5
	lea (160,%a2),%a2
	moveq #16,%d1
	cmp.l %d0,%d1
	jne .L353
.L408:
	clr.l %d2
	lea (fl_mig_capture.isra.0),%a2
.L355:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d4,%d0
	tst.l %d0
	jne .L402
	addq.l #1,%d2
	moveq #16,%d6
	cmp.l %d2,%d6
	jne .L355
.L409:
	tst.l %d4
	jeq .L356
	tst.l fl_io_loaded
	jne .L403
.L357:
	move.l #1074668000,%a2
	clr.l %d2
	move.l #635698,%a4
	lea fl_mig_apply_to,%a3
.L365:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L358
	mvz.b 269161678,%d0
	cmp.l %d0,%d2
	jeq .L404
.L359:
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	move.l %a2,%d5
.L361:
	mvz.b 269161678,%d0
	cmp.l %d0,%d2
	jeq .L405
.L364:
	mov3q.l #1,(%a2,%a4.l)
.L358:
	addq.l #1,%d2
	add.l #635712,%a2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L365
	or.l %d4,fl_mig_pending
	mov3q.l #1,fl_mig_active
.L356:
	movem.l (%sp),#15612
	clr.l %d0
	lea (40,%sp),%sp
	rts
.L400:
	move.l 1187521622,%d1
	move.l %d1,%a1
	add.l #-1073741824,%a1
	cmp.l #134217727,%a1
	jhi .L340
	move.l %d1,%a0
	jra .L340
.L401:
	move.l #629642,%a4
	move.l %a0,%d2
	add.l %a0,%a4
	add.l #585388,%d2
	move.l %d2,%a1
	move.l %d2,%a0
	lea (-266,%a1),%a1
	lea (-240,%a0),%a0
.L347:
	mvz.b (%a1),%d1
	addq.l #1,%a1
	subq.l #1,%d1
	tst.l %d1
	jeq .L406
.L345:
	lea (30,%a0),%a0
	cmp.l %a0,%d2
	jne .L347
	cmp.l %d2,%a4
	jeq .L338
	add.l #6322,%d2
	move.l %d2,%a1
	move.l %d2,%a0
	lea (-266,%a1),%a1
	lea (-240,%a0),%a0
	jra .L347
.L406:
	mvz.b (%a0),%d1
	moveq #70,%d6
	cmp.l %d1,%d6
	jne .L345
	mvz.b 1(%a0),%d1
	moveq #77,%d6
	cmp.l %d1,%d6
	jne .L345
	mvz.b 2(%a0),%d1
	subq.l #1,%d1
	tst.l %d1
	jne .L345
	cmp.l %d2,%a4
	jeq .L407
.L343:
	move.l %d3,%d1
	and.l fl_ready_mask,%d1
	tst.l %d1
	jeq .L350
	move.l %d3,%d1
	and.l fl_blocked_mask,%d1
	tst.l %d1
	jne .L350
	move.l %d3,%d1
	and.l fl_io_protected_mask,%d1
	tst.l %d1
	jne .L350
	or.l %d3,%d4
	addq.l #1,%d0
	add.l #635712,%d5
	lea (160,%a2),%a2
	moveq #16,%d1
	cmp.l %d0,%d1
	jne .L353
	jra .L408
.L402:
	move.l %d2,-(%sp)
	moveq #16,%d6
	jsr (%a2)
	addq.l #4,%sp
	addq.l #1,%d2
	cmp.l %d2,%d6
	jne .L355
	jra .L409
.L407:
	tst.l %a3
	jne .L343
	addq.l #1,%d0
	add.l #635712,%d5
	lea (160,%a2),%a2
	moveq #16,%d1
	cmp.l %d0,%d1
	jne .L353
	jra .L408
.L335:
	or.l %d1,%d0
	move.l #1074668000,%d5
	clr.l %d4
	lea fl_migration_table+3,%a2
	move.l %d0,fl_mig_capture_mask
	clr.l %d0
	jra .L353
.L404:
	move.l 1187521622,%d0
	move.l %d0,%d5
	add.l #-1073741824,%d0
	cmp.l #134217727,%d0
	jhi .L359
	clr.l -(%sp)
	move.l %d5,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	cmp.l %a2,%d5
	jeq .L361
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	lea (12,%sp),%sp
	mvz.b 269161678,%d0
	cmp.l %d0,%d2
	jne .L364
.L405:
	mov3q.l #1,-(%sp)
	move.l %d5,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a3)
	mov3q.l #1,269452696
	lea (12,%sp),%sp
	mov3q.l #1,(%a2,%a4.l)
	jra .L358
.L403:
	move.l %d4,-(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jeq .L357
	movem.l (%sp),#15612
	lea (40,%sp),%sp
	rts
.L350:
	movem.l (%sp),#15612
	moveq #-61,%d0
	lea (40,%sp),%sp
	rts
	.size	fl_mig_run, .-fl_mig_run
	.align	2
	.type	fl_migrate_restored.constprop.0, @function
fl_migrate_restored.constprop.0:
	link.w %fp,#-8
	move.l %d2,-(%sp)
	pea -4(%fp)
	pea -8(%fp)
	mov3q.l #1,-(%sp)
	jsr (fl_mig_text_read.constprop.0)
	lea (12,%sp),%sp
	mov3q.l #1,%d2
	move.l 8(%fp),%d1
	not.l %d1
	and.l %d1,fl_mig_known_mask
	and.l %d1,fl_mig_capture_mask
	cmp.l %d0,%d2
	jcc .L414
	move.l -12(%fp),%d2
	unlk %fp
	rts
.L414:
	tst.l -4(%fp)
	seq %d0
	and.l %d1,fl_mig_pending
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr fl_mig_run
	move.l -12(%fp),%d2
	addq.l #8,%sp
	unlk %fp
	rts
	.size	fl_migrate_restored.constprop.0, .-fl_migrate_restored.constprop.0
	.align	2
	.type	fl_migrate_saved.constprop.0, @function
fl_migrate_saved.constprop.0:
	move.l fl_mig_active,%d1
	lea (-68,%sp),%sp
	movem.l #31996,(%sp)
	or.l fl_mig_pristine,%d1
	move.l 72(%sp),52(%sp)
	move.l 76(%sp),64(%sp)
	move.l %d1,60(%sp)
	tst.l %d1
	jeq .L416
	move.l #1074668000,%d7
	lea fl_migration_table+3,%a4
	clr.l 60(%sp)
	move.l %d7,44(%sp)
	clr.l 48(%sp)
.L430:
	move.l 48(%sp),%d2
	mov3q.l #1,%d1
	lsl.l %d2,%d1
	move.l 52(%sp),%d0
	and.l %d1,%d0
	move.l %d1,56(%sp)
	tst.l %d0
	jne .L461
.L429:
	move.l #635712,%d2
	addq.l #1,48(%sp)
	lea (160,%a4),%a4
	add.l %d2,44(%sp)
	cmp.l #fl_migration_table+2563,%a4
	jne .L430
.L416:
	lea fl_migration_table+3,%a2
	clr.l %d2
	lea fl_io_irq_lock,%a5
	lea fl_generation,%a3
	lea fl_io_irq_restore,%a4
.L434:
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	move.l 52(%sp),%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L432
	mvz.b (%a2),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L462
.L432:
	addq.l #1,%d2
	lea (160,%a2),%a2
	cmp.l #fl_migration_table+2563,%a2
	jne .L434
.L466:
	tst.l 60(%sp)
	jeq .L435
	tst.l 64(%sp)
	jeq .L436
	tst.l fl_io_loaded
	jeq .L443
	move.l 60(%sp),-(%sp)
	jsr store_ab
	addq.l #4,%sp
	tst.l %d0
	jne .L415
.L435:
	move.l 52(%sp),%d0
	not.l %d0
	and.l fl_mig_pending,%d0
	move.l %d0,fl_mig_pending
	tst.l fl_mig_active
	jeq .L439
	tst.l %d0
	jeq .L440
.L439:
	clr.l %d0
.L415:
	movem.l (%sp),#31996
	lea (68,%sp),%sp
	rts
.L461:
	mvz.b 269161678,%d0
	move.l 44(%sp),%d4
	cmp.l %d2,%d0
	jeq .L463
.L419:
	tst.b (%a4)
	jne .L429
	add.l #585088,%d4
	lea (9,%a4),%a6
	clr.l %d6
	lea (1,%a4),%a2
	clr.l %d5
.L421:
	move.l %d4,%a0
	move.l %d4,%a3
	lea (481,%a0),%a0
	clr.l %d0
	move.l %a6,%a1
	lea (34,%a3),%a3
.L426:
	mvz.b (%a3,%d0.l),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L464
.L424:
	addq.l #1,%d0
	addq.l #2,%a1
	lea (30,%a0),%a0
	moveq #8,%d3
	cmp.l %d0,%d3
	jne .L426
.L465:
	lea (16,%a6),%a6
	addq.l #1,%a2
	add.l #6322,%d4
	addq.l #8,%d6
	moveq #64,%d7
	cmp.l %d6,%d7
	jne .L421
	tst.l %d5
	jeq .L429
	move.b #2,(%a4)
	move.l #635712,%d2
	lea (160,%a4),%a4
	jsr fl_io_irq_lock
	move.l 48(%sp),%a5
	move.l 56(%sp),%d1
	lea fl_generation,%a0
	or.l %d1,fl_dirty_mask
	addq.l #1,(%a0,%a5.l*4)
	move.l %d0,-(%sp)
	jsr fl_io_irq_restore
	addq.l #4,%sp
	mov3q.l #1,fl_mig_active
	addq.l #1,48(%sp)
	move.l 56(%sp),%d1
	add.l %d2,44(%sp)
	or.l %d1,60(%sp)
	cmp.l #fl_migration_table+2563,%a4
	jne .L430
	jra .L416
.L464:
	mvz.b -421(%a0),%d1
	move.l %a0,%d2
	moveq #70,%d7
	add.l #-421,%d2
	cmp.l %d1,%d7
	jne .L424
	move.l %d2,%a5
	moveq #77,%d3
	mvz.b 1(%a5),%d1
	cmp.l %d1,%d3
	jne .L424
	move.b 2(%a5),%d3
	mov3q.l #1,%d7
	mvz.b %d3,%d1
	cmp.l %d1,%d7
	jne .L424
	move.b (%a2),%d2
	lsl.l %d0,%d1
	mov3q.l #1,%d5
	mov3q.l #3,%d7
	or.l %d2,%d1
	move.b %d1,(%a2)
	move.b -1(%a0),%d1
	move.l %d1,%d2
	subq.l #1,%d2
	mvz.b %d2,%d2
	cmp.l %d2,%d7
	jcs .L425
	move.b %d1,%d3
.L425:
	move.b %d3,(%a1)
	moveq #127,%d2
	addq.l #1,%d0
	addq.l #2,%a1
	lea (30,%a0),%a0
	moveq #8,%d3
	move.b -30(%a0),%d1
	and.l %d2,%d1
	move.b %d1,-1(%a1)
	cmp.l %d0,%d3
	jne .L426
	jra .L465
.L463:
	move.l 1187521622,%d0
	move.l %d0,%d1
	add.l #-1073741824,%d1
	cmp.l #134217727,%d1
	jhi .L419
	move.l %d0,%d4
	jra .L419
.L462:
	move.b #2,(%a2)
	lea (160,%a2),%a2
	jsr (%a5)
	or.l %d3,fl_dirty_mask
	addq.l #1,(%a3,%d2.l*4)
	move.l %d0,-(%sp)
	jsr (%a4)
	or.l %d3,64(%sp)
	addq.l #4,%sp
	addq.l #1,%d2
	cmp.l #fl_migration_table+2563,%a2
	jne .L434
	jra .L466
.L440:
	clr.l -(%sp)
	jsr (fl_mig_comment.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jne .L415
	mov3q.l #1,%d1
	cmp.l 64(%sp),%d1
	jne .L415
	movem.l (%sp),#31996
	mov3q.l #1,72(%sp)
	lea (68,%sp),%sp
	jra (fl_mig_comment.constprop.0)
.L436:
	tst.l fl_io_loaded
	jeq .L435
	move.l 60(%sp),-(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jeq .L435
	jra .L415
.L443:
	movem.l (%sp),#31996
	moveq #-60,%d0
	lea (68,%sp),%sp
	rts
	.size	fl_migrate_saved.constprop.0, .-fl_migrate_saved.constprop.0
	.align	2
	.globl	fl_io_play_tick
	.type	fl_io_play_tick, @function
fl_io_play_tick:
	move.l %d2,-(%sp)
	tst.l fl_io_loaded
	jeq .L468
	move.l fl_dirty_mask,%d1
	move.l fl_ready_mask,%a0
	move.l %a0,%d2
	move.l fl_blocked_mask,%d0
	and.l %d2,%d1
	or.l fl_io_protected_mask,%d0
	not.l %d0
	and.l %d1,%d0
	tst.l %d0
	jeq .L468
	move.l fl_io_play_ticks,%d0
	moveq #59,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jcc .L480
	clr.l fl_io_play_ticks
	tst.l fl_io_flush_pending
	jne .L467
	tst.l 1175264744
	jne .L467
	mov3q.l #1,%d2
	cmp.l -2147483512.l,%d2
	jeq .L467
	tst.l 269452412
	jeq .L481
.L467:
	move.l (%sp)+,%d2
	rts
.L468:
	move.l (%sp)+,%d2
	clr.l fl_io_play_ticks
	rts
.L480:
	move.l (%sp)+,%d2
	move.l %d0,fl_io_play_ticks
	rts
.L481:
	jsr fl_io_stock_card_ready
	tst.l %d0
	jeq .L467
	moveq #-127,%d0
	pea fl_io_flush_job
	move.l #1175263182,-(%sp)
	mov3q.l #1,fl_io_flush_pending
	move.b %d0,fl_io_flush_job
	jsr fl_io_queue_post
	addq.l #8,%sp
	move.l (%sp)+,%d2
	rts
	.size	fl_io_play_tick, .-fl_io_play_tick
	.align	2
	.globl	fl_io_before_job
	.type	fl_io_before_job, @function
fl_io_before_job:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	move.b (%a0),%d1
	mvz.b %d1,%d0
	cmp.l #129,%d0
	jeq .L517
	move.l %d0,fl_io_job_kind
	mov3q.l #2,%d2
	cmp.l %d0,%d2
	jeq .L518
	clr.l fl_io_warning
	moveq #18,%d2
	cmp.l %d0,%d2
	jcs .L484
	move.l #401296,%d2
	btst %d0,%d2
	jeq .L484
	tst.l fl_io_loaded
	jne .L489
	moveq #8,%d1
	cmp.l %d0,%d1
	jeq .L514
	moveq #12,%d1
	cmp.l %d0,%d1
	jeq .L514
.L484:
	clr.l %d0
.L482:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L518:
	tst.l fl_io_loaded
	jeq .L484
	move.l #65535,-(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
.L493:
	tst.l %d0
	jeq .L482
	move.l %d0,fl_io_last_error
	move.l fl_io_warning,%d1
	tst.l %d1
	jne .L482
.L491:
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,12(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
.L519:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L517:
	clr.l fl_io_flush_pending
	tst.l fl_io_loaded
	jeq .L484
	move.l #65535,-(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jeq .L482
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L484
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l (%sp)+,%d2
	clr.l %d0
	addq.l #4,%sp
	rts
.L489:
	move.l #65535,-(%sp)
	move.l %d1,8(%sp)
	jsr (flush_ab.constprop.0)
	move.l 8(%sp),%d1
	addq.l #4,%sp
	and.l #251,%d1
	subq.l #8,%d1
	tst.l %d1
	jne .L493
	tst.l fl_blocked_mask
	jeq .L493
	move.l fl_io_warning,%d1
	moveq #-61,%d0
	move.l %d0,fl_io_last_error
	tst.l %d1
	jne .L482
	jra .L491
.L514:
	tst.l fl_blocked_mask
	jeq .L484
	moveq #-61,%d0
	moveq #-61,%d2
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,12(%sp)
	move.l %d2,fl_io_last_error
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
	jra .L519
	.size	fl_io_before_job, .-fl_io_before_job
	.align	2
	.globl	fl_io_reject_job
	.type	fl_io_reject_job, @function
fl_io_reject_job:
	lea (-12,%sp),%sp
	moveq #20,%d1
	move.l %d2,-(%sp)
	move.l 20(%sp),%a0
	move.l 24(%sp),12(%sp)
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jcs .L520
	move.w .L523(%pc,%d0.l*2),%d0
	ext.l %d0
	jmp %pc@(2,%d0:l)
	.balignw 2,0x284c
	.swbeg	&21
.L523:
	.word .L520-.L523
	.word .L520-.L523
	.word .L525-.L523
	.word .L520-.L523
	.word .L528-.L523
	.word .L520-.L523
	.word .L520-.L523
	.word .L528-.L523
	.word .L528-.L523
	.word .L528-.L523
	.word .L526-.L523
	.word .L525-.L523
	.word .L524-.L523
	.word .L520-.L523
	.word .L520-.L523
	.word .L520-.L523
	.word .L520-.L523
	.word .L522-.L523
	.word .L522-.L523
	.word .L522-.L523
	.word .L522-.L523
.L520:
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
.L528:
	mvz.w #270,%d0
	move.w #271,%a1
	mvz.w #269,%d1
	move.l %d0,4(%sp)
	mvz.w #268,%d0
.L527:
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
	jeq .L520
	move.l 12(%sp),24(%sp)
	move.l %d0,20(%sp)
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	jra fl_io_post
.L522:
	moveq #10,%d2
	moveq #9,%d1
	move.w #11,%a1
	move.l %d2,4(%sp)
	moveq #8,%d0
	jra .L527
.L525:
	moveq #8,%d2
	mov3q.l #7,%d1
	move.w #9,%a1
	move.l %d2,4(%sp)
	mov3q.l #6,%d0
	jra .L527
.L526:
	moveq #12,%d0
	moveq #11,%d1
	move.l %d0,4(%sp)
	moveq #10,%d0
	move.w #13,%a1
	jra .L527
.L524:
	mvz.w #528,%d1
	move.w #529,%a1
	mvz.w #526,%d0
	move.l %d1,4(%sp)
	mvz.w #527,%d1
	jra .L527
	.size	fl_io_reject_job, .-fl_io_reject_job
	.align	2
	.globl	fl_mig_retire_current
	.type	fl_mig_retire_current, @function
fl_mig_retire_current:
	lea (-40,%sp),%sp
	mov3q.l #7,%d0
	move.l 44(%sp),%d1
	movem.l #1036,(%sp)
	move.l 48(%sp),%a1
	cmp.l %d1,%d0
	jcs .L534
	tst.l fl_io_loaded
	jeq .L534
	move.b 269161678,%d0
	move.b 269161679,%d2
	move.l 1187521622,%a0
	mvz.b %d0,%d3
	move.b %d2,24(%sp)
	moveq #15,%d2
	move.l %d3,28(%sp)
	cmp.l %d3,%d2
	jcs .L534
	mvz.b 24(%sp),%d3
	mov3q.l #3,%d2
	move.l %d3,24(%sp)
	cmp.l %d3,%d2
	jcs .L534
	add.l #-1073741824,%a0
	cmp.l #134217727,%a0
	jhi .L534
	mov3q.l #1,%d3
	move.l 28(%sp),%d2
	lsl.l %d2,%d3
	move.l %d3,32(%sp)
	and.l fl_ready_mask,%d3
	tst.l %d3
	jeq .L534
	move.l 32(%sp),%d3
	and.l fl_blocked_mask,%d3
	tst.l %d3
	jne .L534
	ext.w %d0
	mov3q.l #1,%d3
	mulu.w #160,%d0
	move.l %d0,%a0
	add.l #fl_migration_table,%a0
	move.b 3(%a0),%d0
	mvz.b %d0,%d2
	cmp.l %d2,%d3
	jcs .L534
	tst.b %d0
	jne .L540
	move.l 32(%sp),%d0
	and.l fl_mig_known_mask,%d0
	tst.l %d0
	jeq .L534
	move.l 32(%sp),%d0
	and.l fl_mig_capture_mask,%d0
	tst.l %d0
	jne .L539
.L541:
	tst.l %a1
	jeq .L534
.L540:
	move.l %d1,12(%sp)
	move.l %a0,16(%sp)
	jsr fl_io_irq_lock
	mov3q.l #1,%d3
	move.l 16(%sp),%a0
	move.l %d0,36(%sp)
	move.l 12(%sp),%d1
	move.b 3(%a0),%d0
	mvz.b %d0,%d2
	cmp.l %d2,%d3
	jcc .L555
.L538:
	movem.l (%sp),#1036
	move.l 36(%sp),44(%sp)
	lea (40,%sp),%sp
	jra fl_io_irq_restore
.L534:
	movem.l (%sp),#1036
	lea (40,%sp),%sp
	rts
.L555:
	tst.b %d0
	jne .L542
	mov3q.l #1,(%a0)
.L542:
	move.l 24(%sp),%a1
	mov3q.l #1,%d2
	lsl.l %d1,%d2
	move.l 32(%sp),%d3
	lea 4(%a0,%a1.l),%a1
	move.l 28(%sp),%a0
	move.l %d2,%d1
	not.l %d1
	move.l %a1,%a2
	move.b (%a2),27(%sp)
	lea fl_generation,%a1
	move.b 27(%sp),%d2
	and.l %d2,%d1
	move.b %d1,(%a2)
	or.l %d3,fl_dirty_mask
	movem.l (%sp),#1036
	addq.l #1,(%a1,%a0.l*4)
	move.l 36(%sp),44(%sp)
	lea (40,%sp),%sp
	jra fl_io_irq_restore
.L539:
	move.l 28(%sp),-(%sp)
	move.l %d1,16(%sp)
	move.l %a0,20(%sp)
	move.l %a1,24(%sp)
	jsr (fl_mig_capture.isra.0)
	addq.l #4,%sp
	move.l 16(%sp),%a0
	move.l 12(%sp),%d1
	move.l 20(%sp),%a1
	tst.b 3(%a0)
	jeq .L541
	move.l %d1,12(%sp)
	move.l %a0,16(%sp)
	jsr fl_io_irq_lock
	mov3q.l #1,%d3
	move.l 16(%sp),%a0
	move.l %d0,36(%sp)
	move.l 12(%sp),%d1
	move.b 3(%a0),%d0
	mvz.b %d0,%d2
	cmp.l %d2,%d3
	jcs .L538
	jra .L555
	.size	fl_mig_retire_current, .-fl_mig_retire_current
	.align	2
	.globl	fl_io_banks_load
	.type	fl_io_banks_load, @function
fl_io_banks_load:
	lea (-568,%sp),%sp
	movem.l #23804,(%sp)
	move.l 584(%sp),-(%sp)
	move.l 584(%sp),-(%sp)
	move.l 584(%sp),-(%sp)
	move.l 584(%sp),-(%sp)
	lea fl_io_stock_directory,%a2
	jsr fl_io_stock_banks_load
	move.l %d0,56(%sp)
	clr.l -(%sp)
	clr.l -(%sp)
	jsr (%a2)
	lea (24,%sp),%sp
	tst.l %d0
	jeq .L556
	move.l %sp,%d5
	move.l %d0,%a1
	lea (48,%sp),%a0
	add.l #308,%d5
.L559:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L558
	cmp.l %d5,%a0
	jne .L559
.L556:
	movem.l (%sp),#23804
	move.l 40(%sp),%d0
	lea (568,%sp),%sp
	rts
.L558:
	tst.l fl_io_loaded
	jeq .L560
	mov3q.l #4,%d0
	cmp.l fl_io_job_kind.l,%d0
	jeq .L560
	move.b 48(%sp),%d0
	jeq .L622
	lea fl_io_base,%a1
	lea (48,%sp),%a0
.L563:
	mvs.b (%a1),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a1
	cmp.l %d1,%d0
	jne .L560
	move.b (%a0),%d0
	jne .L563
	move.b (%a1),%d0
	jeq .L556
.L560:
	clr.l -(%sp)
	clr.l -(%sp)
	jsr (%a2)
	addq.l #8,%sp
	tst.l %d0
	jeq .L565
	move.l %d0,%a1
	move.l %d5,%a2
	lea (568,%sp),%a6
	move.l %d5,%a0
.L567:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L566
	cmp.l %a0,%a6
	jne .L567
.L565:
	moveq #-63,%d0
.L581:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L556
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	movem.l (%sp),#23804
	move.l 40(%sp),%d0
	lea (568,%sp),%sp
	rts
.L566:
	jsr fl_reset
	jsr fl_clip_reset
	jsr fl_seq_reset
	clr.l fl_io_protected_mask
	clr.l fl_io_loaded
	clr.l fl_io_warning
	clr.l fl_io_last_error
	lea fl_io_base,%a0
.L569:
	addq.l #1,%a0
	addq.l #1,%a2
	move.b -1(%a2),%d0
	move.b %d0,-1(%a0)
	jeq .L568
	cmp.l %a2,%a6
	jne .L569
	clr.b %d1
	move.b %d1,fl_io_base
.L568:
	clr.l %d2
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	clr.l %d0
	lea (44,%sp),%a6
	move.l %a6,-(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	clr.l 60(%sp)
	lea read_bank,%a2
	lea fresh_bank,%a3
	move.l %d3,%d4
	not.l %d4
	lea fl_io_core_publish,%a4
	and.l %d4,%d0
	move.l %d0,fl_present_mask
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%d7
	mov3q.l #1,%d0
	cmp.l %d7,%d0
	jeq .L570
.L625:
	or.l %d3,fl_present_mask
	tst.l %d7
	jeq .L623
	move.l %a6,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L587
	or.l %d3,fl_present_mask
	tst.l %d0
	jne .L587
.L589:
	or.l %d3,fl_blocked_mask
	pea fl_io_file+32
	move.l 48(%sp),-(%sp)
	move.l %d2,-(%sp)
	and.l %d4,fl_ready_mask
	jsr (%a4)
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L572
	moveq #-61,%d0
	cmp.l %d7,%d0
	jeq .L624
	or.l %d3,fl_io_protected_mask
	tst.l %d7
	jlt .L575
	moveq #-60,%d7
.L575:
	move.l %d7,fl_io_last_error
	tst.l fl_io_warning
	jne .L572
	mov3q.l #1,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
.L572:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jeq .L577
.L627:
	mov3q.l #1,%d3
	lsl.l %d2,%d3
	move.l fl_present_mask,%d0
	move.l %a6,-(%sp)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	clr.l 60(%sp)
	move.l %d3,%d4
	not.l %d4
	and.l %d4,%d0
	move.l %d0,fl_present_mask
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%d7
	mov3q.l #1,%d0
	cmp.l %d7,%d0
	jne .L625
.L570:
	move.l %a6,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jne .L626
	move.l %d2,-(%sp)
	jsr (%a3)
	addq.l #4,%sp
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L627
.L577:
	move.l %d5,-(%sp)
	move.l %a6,-(%sp)
	clr.l -(%sp)
	mov3q.l #1,fl_io_loaded
	jsr (fl_mig_text_read.constprop.0)
	clr.l fl_mig_known_mask
	clr.l fl_mig_capture_mask
	clr.l fl_mig_pending
	clr.l fl_mig_active
	clr.l fl_mig_pristine
	lea (12,%sp),%sp
	tst.l %d0
	jne .L628
	move.l 308(%sp),%a1
	clr.l %d2
	lea fl_migration_table+3,%a0
	move.l #fl_migration_table+2563,%d1
	move.l %a1,fl_mig_active
.L582:
	move.b (%a0),%d0
	mov3q.l #2,%d3
	lea (160,%a0),%a0
	eor.l %d3,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	cmp.l %d1,%a0
	jne .L582
	tst.l %a1
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,-(%sp)
	move.l #65535,-(%sp)
	jsr fl_mig_run
	addq.l #8,%sp
	tst.l %d0
	jne .L581
	tst.l %d2
	jne .L629
	tst.l fl_mig_active
	jne .L556
	movem.l (%sp),#23804
	move.l 40(%sp),%d0
	mov3q.l #1,fl_mig_pristine
	lea (568,%sp),%sp
	rts
.L623:
	or.l %d3,fl_blocked_mask
	pea fl_io_file+32
	move.l 48(%sp),-(%sp)
	move.l %d2,-(%sp)
	and.l %d4,fl_ready_mask
	jsr (%a4)
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L572
	move.l %a6,-(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	moveq #-61,%d1
	cmp.l %d0,%d1
	jeq .L630
	tst.l %d0
	jge .L572
.L576:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L572
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	jra .L572
.L624:
	or.l %d3,fl_blocked_mask
	and.l %d4,fl_ready_mask
	or.l %d3,fl_io_protected_mask
	jra .L575
.L630:
	or.l %d3,fl_blocked_mask
	and.l %d4,fl_ready_mask
	move.l %d1,fl_io_last_error
	tst.l fl_io_warning
	jne .L572
	pea -61.w
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	jra .L572
.L587:
	or.l %d3,fl_blocked_mask
	move.l %d7,%d0
	and.l %d4,fl_ready_mask
	jra .L576
.L628:
	tst.l %d0
	jlt .L581
	movem.l (%sp),#23804
	move.l 40(%sp),%d0
	lea (568,%sp),%sp
	rts
.L629:
	movem.l (%sp),#23804
	move.l 40(%sp),%d0
	mov3q.l #1,fl_mig_active
	lea (568,%sp),%sp
	rts
.L622:
	move.b fl_io_base,%d0
	jeq .L556
	jra .L560
.L626:
	or.l %d3,fl_present_mask
	tst.l %d0
	jeq .L589
	or.l %d3,fl_blocked_mask
	and.l %d4,fl_ready_mask
	jra .L576
	.size	fl_io_banks_load, .-fl_io_banks_load
	.align	2
	.globl	fl_io_banks_save
	.type	fl_io_banks_save, @function
fl_io_banks_save:
	lea (-284,%sp),%sp
	movem.l #19484,(%sp)
	move.l 292(%sp),%d2
	move.l 300(%sp),-(%sp)
	move.l 300(%sp),-(%sp)
	move.l %d2,-(%sp)
	move.l 300(%sp),-(%sp)
	jsr fl_io_stock_banks_save
	lea (16,%sp),%sp
	move.l fl_io_job_kind,%d1
	subq.l #8,%d1
	move.l %d0,%d3
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jcc .L632
	tst.l %d3
	jlt .L631
	move.l fl_io_loaded,%a6
	tst.l %a6
	jne .L659
	mvz.w %d2,%d2
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	jsr (fl_migrate_saved.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jlt .L666
.L631:
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (284,%sp),%sp
	rts
.L632:
	clr.l -(%sp)
	clr.l -(%sp)
	jsr fl_io_stock_directory
	addq.l #8,%sp
	tst.l %d0
	jeq .L635
	lea (24,%sp),%a6
	move.l %d0,%a1
	move.l %a6,%a0
	lea (284,%sp),%a2
.L637:
	move.b (%a1),%d1
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d1,-1(%a0)
	jeq .L636
	cmp.l %a0,%a2
	jne .L637
	clr.b %d1
	move.b %d1,24(%sp)
.L635:
	clr.b %d0
	moveq #-63,%d1
	clr.l fl_io_loaded
	move.l %d1,fl_io_last_error
	move.b %d0,fl_io_base
	tst.l fl_io_warning
	jne .L641
	pea -63.w
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
.L641:
	tst.l %d3
	jlt .L631
	moveq #-63,%d3
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (284,%sp),%sp
	rts
.L636:
	tst.l fl_io_loaded
	jeq .L638
	move.b 24(%sp),%d0
	jeq .L685
	lea fl_io_base,%a1
	lea (24,%sp),%a0
.L643:
	mvs.b (%a1),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a1
	cmp.l %d0,%d1
	jne .L638
	move.b (%a0),%d0
	jne .L643
	move.b (%a1),%d0
.L640:
	tst.b %d0
	jne .L638
	tst.l %d3
	jlt .L631
.L659:
	mvz.w %d2,%d2
	move.l %d2,-(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jne .L666
	sub.l %a6,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	jsr (fl_migrate_saved.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jge .L631
.L666:
	move.l %d0,%d3
.L660:
	move.l %d3,fl_io_last_error
	tst.l fl_io_warning
	jne .L631
	move.l %d3,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l %d3,%d0
	movem.l (%sp),#19484
	lea (284,%sp),%sp
	rts
.L638:
	moveq #9,%d0
	cmp.l fl_io_job_kind.l,%d0
	jeq .L686
	lea fl_io_base,%a0
.L648:
	move.b (%a6),%d0
	addq.l #1,%a0
	addq.l #1,%a6
	move.b %d0,-1(%a0)
	jeq .L647
	cmp.l %a6,%a2
	jne .L648
	clr.b %d0
	move.b %d0,fl_io_base
.L647:
	mov3q.l #1,fl_io_loaded
	clr.l fl_io_protected_mask
	clr.l %d4
	clr.l %d2
	lea (path_for.part.0),%a2
	lea fl_io_fs_open,%a3
.L649:
	sub.l %a6,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	pea fl_io_path
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L687
.L651:
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jne .L663
.L689:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L649
	move.l %d4,fl_present_mask
	jsr fl_io_irq_lock
	move.l fl_blocked_mask,%d1
	not.l %d1
	and.l fl_ready_mask,%d1
	move.l %d0,-(%sp)
	or.l %d1,fl_dirty_mask
	jsr fl_io_irq_restore
	addq.l #4,%sp
	tst.l %d3
	jlt .L660
	tst.l fl_io_loaded
	jeq .L664
	move.l #65535,-(%sp)
	jsr store_ab
	addq.l #4,%sp
	tst.l %d0
	jne .L666
	mvz.w #65535,%d2
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	jsr (fl_migrate_saved.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jge .L631
	jra .L666
.L687:
	pea 512.w
	pea fl_io_sector
	pea .LC5
	pea fl_io_path
	pea fl_io_object
	jsr (%a3)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L688
	pea fl_io_object
	jsr fl_io_fs_close
	addq.l #4,%sp
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	or.l %d0,%d4
.L690:
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jeq .L689
.L663:
	mov3q.l #1,%a6
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	pea fl_io_path
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L651
	jra .L687
.L688:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jeq .L651
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	or.l %d0,%d4
	jra .L690
.L686:
	jsr fl_reset
	jsr fl_clip_reset
	jsr fl_seq_reset
	mvz.w #65535,%d1
	clr.l fl_present_mask
	clr.l fl_io_warning
	clr.l fl_mig_pending
	move.l %d1,fl_ready_mask
	clr.l fl_io_protected_mask
	clr.l fl_io_last_error
	clr.l fl_mig_active
	mov3q.l #1,fl_mig_pristine
	move.l %d1,fl_mig_known_mask
	clr.l fl_mig_capture_mask
	lea fl_io_base,%a0
	jra .L648
.L664:
	moveq #-60,%d3
	jra .L660
.L685:
	move.b fl_io_base,%d0
	jra .L640
	.size	fl_io_banks_save, .-fl_io_banks_save
	.align	2
	.globl	fl_io_card_sync
	.type	fl_io_card_sync, @function
fl_io_card_sync:
	lea (-12,%sp),%sp
	move.l 16(%sp),%d1
	move.l 20(%sp),%a0
	move.l 24(%sp),%a1
	tst.l fl_io_loaded
	jne .L701
.L692:
	move.l %a1,-(%sp)
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr fl_io_stock_card_sync
	lea (12,%sp),%sp
	tst.l %d0
	jge .L702
.L691:
	lea (12,%sp),%sp
	rts
.L701:
	move.l #65535,-(%sp)
	move.l %d1,12(%sp)
	move.l %a0,8(%sp)
	move.l %a1,4(%sp)
	jsr (flush_ab.constprop.0)
	addq.l #4,%sp
	move.l 8(%sp),%d1
	move.l 4(%sp),%a0
	move.l (%sp),%a1
	tst.l %d0
	jeq .L692
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L691
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,16(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 8(%sp),%d0
	lea (12,%sp),%sp
	rts
.L702:
	clr.l 20(%sp)
	clr.l 16(%sp)
	lea (12,%sp),%sp
	jra (fl_migrate_saved.constprop.0)
	.size	fl_io_card_sync, .-fl_io_card_sync
	.align	2
	.globl	fl_io_project_store
	.type	fl_io_project_store, @function
fl_io_project_store:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 20(%sp),-(%sp)
	move.l 20(%sp),-(%sp)
	move.l 20(%sp),-(%sp)
	jsr fl_io_stock_project_store
	lea (12,%sp),%sp
	move.l %d0,%d2
	tst.l %d0
	jlt .L703
	tst.l fl_io_loaded
	jeq .L709
	move.l #65535,-(%sp)
	jsr store_ab
	addq.l #4,%sp
	tst.l %d0
	jeq .L713
.L705:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L708
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,12(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
.L708:
	move.l %d0,%d2
.L703:
	move.l %d2,%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L713:
	mov3q.l #1,-(%sp)
	move.l #65535,-(%sp)
	jsr (fl_migrate_saved.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jlt .L705
	move.l %d2,%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L709:
	moveq #-60,%d0
	jra .L705
	.size	fl_io_project_store, .-fl_io_project_store
	.align	2
	.globl	fl_io_bank_store
	.type	fl_io_bank_store, @function
fl_io_bank_store:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	jsr fl_io_stock_bank_store
	lea (16,%sp),%sp
	move.l %d0,%d2
	tst.l %d0
	jlt .L714
	tst.l fl_io_loaded
	jeq .L720
	move.l 16(%sp),%d1
	mvz.w %d1,%d1
	move.l %d1,-(%sp)
	move.l %d1,8(%sp)
	jsr store_ab
	addq.l #4,%sp
	move.l 4(%sp),%d1
	tst.l %d0
	jeq .L724
.L716:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L719
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,12(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 4(%sp),%d0
.L719:
	move.l %d0,%d2
.L714:
	move.l %d2,%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L724:
	mov3q.l #2,-(%sp)
	move.l %d1,-(%sp)
	jsr (fl_migrate_saved.constprop.0)
	addq.l #8,%sp
	tst.l %d0
	jlt .L716
	move.l %d2,%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L720:
	moveq #-60,%d0
	jra .L716
	.size	fl_io_bank_store, .-fl_io_bank_store
	.align	2
	.globl	fl_io_project_restore
	.type	fl_io_project_restore, @function
fl_io_project_restore:
	move.l fl_blocked_mask,%d0
	subq.l #8,%sp
	move.l %a6,-(%sp)
	move.l %a2,-(%sp)
	mvz.w %d0,%d0
	move.l %d0,%a6
	tst.l %d0
	jne .L736
	lea read_bank,%a2
.L728:
	pea 12(%sp)
	mov3q.l #1,-(%sp)
	move.l %a6,-(%sp)
	pea fl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jcc .L742
	move.l %d1,fl_io_last_error
	tst.l fl_io_warning
	jne .L725
.L743:
	move.l %d1,-(%sp)
	pea fl_io_ui_warning
	move.l %d1,16(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 8(%sp),%d1
.L725:
	move.l (%sp)+,%a2
	move.l %d1,%d0
	move.l (%sp)+,%a6
	addq.l #8,%sp
	rts
.L742:
	addq.l #1,%a6
	moveq #16,%d0
	cmp.l %a6,%d0
	jne .L728
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	jsr fl_io_stock_project_restore
	lea (12,%sp),%sp
	move.l %d0,%d1
	tst.l %d0
	jlt .L725
	move.l #65535,-(%sp)
	move.l %d1,12(%sp)
	jsr restore_mask
	addq.l #4,%sp
	tst.l %d0
	jne .L732
	move.l #65535,-(%sp)
	jsr (fl_migrate_restored.constprop.0)
	addq.l #4,%sp
	move.l 8(%sp),%d1
	tst.l %d0
	jeq .L725
.L732:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L733
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,16(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 8(%sp),%d0
.L733:
	move.l (%sp)+,%a2
	move.l %d0,%d1
	move.l %d1,%d0
	move.l (%sp)+,%a6
	addq.l #8,%sp
	rts
.L736:
	moveq #-61,%d1
	move.l %d1,fl_io_last_error
	tst.l fl_io_warning
	jne .L725
	jra .L743
	.size	fl_io_project_restore, .-fl_io_project_restore
	.align	2
	.globl	fl_io_bank_restore
	.type	fl_io_bank_restore, @function
fl_io_bank_restore:
	lea (-28,%sp),%sp
	movem.l #17436,(%sp)
	move.l 36(%sp),%d3
	mvz.w %d3,%d3
	move.l %d3,%d2
	and.l fl_blocked_mask,%d2
	tst.l %d2
	jne .L757
	lea read_bank,%a2
.L747:
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L746
.L749:
	addq.l #1,%d2
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L747
	move.l 44(%sp),-(%sp)
	move.l 44(%sp),-(%sp)
	move.l 44(%sp),-(%sp)
	move.l 44(%sp),-(%sp)
	jsr fl_io_stock_bank_restore
	lea (16,%sp),%sp
	move.l %d0,%a6
	tst.l %d0
	jlt .L744
	move.l %d3,-(%sp)
	jsr restore_mask
	addq.l #4,%sp
	tst.l %d0
	jne .L753
	move.l %d3,-(%sp)
	jsr (fl_migrate_restored.constprop.0)
	addq.l #4,%sp
	tst.l %d0
	jne .L753
.L744:
	move.l %a6,%d0
	movem.l (%sp),#17436
	lea (28,%sp),%sp
	rts
.L746:
	pea 24(%sp)
	mov3q.l #1,-(%sp)
	move.l %d2,-(%sp)
	pea fl_io_base
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d0,%a6
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jcc .L749
	move.l %a6,fl_io_last_error
	tst.l fl_io_warning
	jne .L744
.L765:
	move.l %a6,-(%sp)
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l %a6,%d0
	movem.l (%sp),#17436
	lea (28,%sp),%sp
	rts
.L753:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L755
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,28(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 20(%sp),%d0
.L755:
	move.l %d0,%a6
	move.l %a6,%d0
	movem.l (%sp),#17436
	lea (28,%sp),%sp
	rts
.L757:
	move.w #-61,%a6
	move.l %a6,fl_io_last_error
	tst.l fl_io_warning
	jne .L744
	jra .L765
	.size	fl_io_bank_restore, .-fl_io_bank_restore
	.align	2
	.globl	fl_io_clear
	.type	fl_io_clear, @function
fl_io_clear:
	jsr fl_io_stock_clear
	jsr fl_reset
	jsr fl_clip_reset
	jsr fl_seq_reset
	clr.b %d0
	clr.l fl_io_protected_mask
	clr.l fl_io_loaded
	clr.l fl_io_warning
	clr.l fl_io_last_error
	clr.l fl_present_mask
	move.b %d0,fl_io_base
	rts
	.size	fl_io_clear, .-fl_io_clear
	.align	2
	.globl	fl_io_delete
	.type	fl_io_delete, @function
fl_io_delete:
	lea (-284,%sp),%sp
	movem.l #19468,(%sp)
	move.l 292(%sp),-(%sp)
	move.l 292(%sp),-(%sp)
	jsr fl_io_stock_directory
	addq.l #8,%sp
	tst.l %d0
	jeq .L769
	move.l %sp,%d3
	add.l #24,%d3
	move.l %d0,%a1
	move.l %d3,%a0
	lea (284,%sp),%a6
.L771:
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L781
	cmp.l %a0,%a6
	jne .L771
.L769:
	moveq #-63,%d0
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L772
	pea -63.w
	pea fl_io_ui_warning
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
.L772:
	moveq #-63,%d0
.L768:
	movem.l (%sp),#19468
	lea (284,%sp),%sp
	rts
.L781:
	clr.l %d2
	lea (path_for.part.0),%a2
	lea fl_io_fs_remove,%a3
.L770:
	sub.l %a6,%a6
.L777:
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	pea fl_io_path
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L798
	moveq #-63,%d0
.L793:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L768
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,28(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	movem.l (%sp),#19468
	move.l 20(%sp),%d0
	lea (284,%sp),%sp
	rts
.L798:
	pea fl_io_path
	jsr (%a3)
	addq.l #4,%sp
	tst.l %d0
	jlt .L799
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jne .L783
.L800:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L770
	move.l 292(%sp),-(%sp)
	move.l 292(%sp),-(%sp)
	jsr fl_io_stock_delete
	addq.l #8,%sp
	tst.l %d0
	jlt .L793
	movem.l (%sp),#19468
	lea (284,%sp),%sp
	rts
.L799:
	moveq #-12,%d1
	cmp.l %d0,%d1
	jne .L793
	mov3q.l #1,%d0
	cmp.l %a6,%d0
	jeq .L800
.L783:
	mov3q.l #1,%a6
	jra .L777
	.size	fl_io_delete, .-fl_io_delete
	.align	2
	.globl	fl_io_export
	.type	fl_io_export, @function
fl_io_export:
	lea (-1084,%sp),%sp
	movem.l #19580,(%sp)
	lea (44,%sp),%a6
	lea fl_io_base,%a0
	move.l %a6,%a1
.L803:
	move.b (%a0),%d0
	addq.l #1,%a1
	addq.l #1,%a0
	move.b %d0,-1(%a1)
	jeq .L802
	cmp.l #fl_io_base+260,%a0
	jne .L803
.L804:
	moveq #-63,%d1
	move.l %d1,36(%sp)
.L801:
	movem.l (%sp),#19580
	move.l 36(%sp),%d0
	lea (1084,%sp),%sp
	rts
.L802:
	move.l 1096(%sp),-(%sp)
	move.l 1096(%sp),-(%sp)
	jsr fl_io_stock_directory
	move.l %sp,%d5
	add.l #312,%d5
	addq.l #8,%sp
	move.l %sp,%d3
	move.l %d5,%a2
	move.l %d5,%a0
	addq.l #1,%a0
	move.l %d0,%a1
	add.l #564,%d3
	move.b (%a1),%d0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jeq .L842
.L805:
	cmp.l %d3,%a0
	jeq .L804
	move.b (%a1),%d0
	addq.l #1,%a0
	addq.l #1,%a1
	move.b %d0,-1(%a0)
	jne .L805
.L842:
	move.b 44(%sp),%d0
	move.l %a6,%a0
	tst.b %d0
	jeq .L843
.L806:
	mvs.b (%a2),%d1
	mvs.b %d0,%d0
	addq.l #1,%a0
	addq.l #1,%a2
	cmp.l %d1,%d0
	jne .L811
	move.b (%a0),%d0
	jne .L806
	move.b (%a2),%d0
	jeq .L804
.L811:
	move.l 1104(%sp),-(%sp)
	move.l 1104(%sp),-(%sp)
	move.l 1104(%sp),-(%sp)
	move.l 1104(%sp),-(%sp)
	move.l 1104(%sp),-(%sp)
	jsr fl_io_stock_export
	move.l %d0,56(%sp)
	lea (20,%sp),%sp
	tst.l %d0
	jlt .L801
	move.l %sp,%d6
	clr.l %d4
	lea read_bank,%a3
	add.l #824,%d6
	lea (path_for.part.0),%a2
	clr.l %d2
.L818:
	pea 40(%sp)
	move.l %d2,-(%sp)
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L813
	tst.l %d0
	jne .L837
	move.l %d2,-(%sp)
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L804
	move.l %d2,-(%sp)
	move.l %d4,-(%sp)
	move.l %d5,-(%sp)
	move.l %d6,-(%sp)
	jsr (%a2)
	lea (16,%sp),%sp
	tst.l %d0
	jne .L804
	clr.l -(%sp)
	move.l %d3,-(%sp)
	move.l %d6,-(%sp)
	jsr fl_io_fs_copy
	lea (12,%sp),%sp
	tst.l %d0
	jlt .L837
.L813:
	subq.l #1,%d2
	tst.l %d2
	jne .L822
	addq.l #1,%d4
	moveq #16,%d1
	cmp.l %d4,%d1
	jeq .L801
	clr.l %d2
	jra .L818
.L837:
	move.l %d0,fl_io_last_error
	tst.l fl_io_warning
	jne .L815
	move.l %d0,-(%sp)
	pea fl_io_ui_warning
	move.l %d0,40(%sp)
	mov3q.l #1,fl_io_warning
	jsr fl_io_post
	addq.l #8,%sp
	move.l 32(%sp),%d0
.L815:
	movem.l (%sp),#19580
	move.l %d0,36(%sp)
	move.l 36(%sp),%d0
	lea (1084,%sp),%sp
	rts
.L822:
	mov3q.l #1,%d2
	jra .L818
.L843:
	move.b 304(%sp),%d0
	jne .L811
	jra .L804
	.size	fl_io_export, .-fl_io_export
	.section	.rodata
	.type	fl_mig_line, @object
	.size	fl_mig_line, 20
fl_mig_line:
	.string	"#SYNTH_VC_SETUP=1\r\n"
	.local	fl_mig_capture_mask
.section .data
.balign 4
fl_mig_capture_mask:
.space 4
	.local	fl_mig_known_mask
.section .data
.balign 4
fl_mig_known_mask:
.space 4
	.local	fl_mig_pristine
.section .data
.balign 4
fl_mig_pristine:
.space 4
	.local	fl_mig_active
.section .data
.balign 4
fl_mig_active:
.space 4
	.local	fl_mig_pending
.section .data
.balign 4
fl_mig_pending:
.space 4
	.local	fl_io_play_ticks
.section .data
.balign 4
fl_io_play_ticks:
.space 4
	.local	fl_io_flush_pending
.section .data
.balign 4
fl_io_flush_pending:
.space 4
	.local	fl_io_flush_job
.section .data
.balign 4
fl_io_flush_job:
.space 16
	.local	fl_present_mask
.section .data
.balign 4
fl_present_mask:
.space 4
	.local	fl_io_warning
.section .data
.balign 4
fl_io_warning:
.space 4
	.local	fl_io_job_kind
.section .data
.balign 4
fl_io_job_kind:
.space 4
	.local	fl_io_loaded
.section .data
.balign 4
fl_io_loaded:
.space 4
	.globl	fl_io_protected_mask
	.section	.data
	.align	2
	.type	fl_io_protected_mask, @object
	.size	fl_io_protected_mask, 4
fl_io_protected_mask:
	.zero	4
	.globl	fl_io_last_error
	.align	2
	.type	fl_io_last_error, @object
	.size	fl_io_last_error, 4
fl_io_last_error:
	.zero	4
	.local	fl_io_object
.section .data
.balign 4
fl_io_object:
.space 24
	.local	fl_io_sector
.section .data
.balign 4
fl_io_sector:
.space 512
	.local	fl_io_file
.section .data
.balign 4
fl_io_file:
.space 18624
	.local	fl_io_path
.section .data
.balign 4
fl_io_path:
.space 260
	.local	fl_io_base
.section .data
.balign 4
fl_io_base:
.space 260

        .section .text
        .global fl_mig_retire,fl_mig_retire_fm
| d2 = current working track. Preserve every register and the caller's SR.
| C helper changes only RAM checkpoint ownership/dirty state; no card call here.
| Only the FM entry permits an empty current-format checkpoint in state 0.
fl_mig_retire:
        lea -64(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.w %sr,%d0
        move.l %d0,60(%sp)
        moveq #0,%d0
        move.l %d0,-(%sp)
        bra fl_mig_retire_call
fl_mig_retire_fm:
        lea -64(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.w %sr,%d0
        move.l %d0,60(%sp)
        pea 1
fl_mig_retire_call:
        move.l %d2,-(%sp)
        jsr fl_mig_retire_current:l
        lea 8(%sp),%sp
        move.l 60(%sp),%d0
        move.w %d0,%sr
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea 64(%sp),%sp
        rts
fl_io_core_bank:
        move.l 4(%sp),%d0
        bsr fl_bank_ptr
        move.l %a0,%d0
        rts
fl_io_core_validate:
        move.l %a2,-(%sp)
        move.l 8(%sp),%d0
        move.l 12(%sp),%a0
        move.l 16(%sp),%d1
        move.l 20(%sp),%a2
        bsr fl_file_validate
        move.l %d1,(%a2)
        move.l (%sp)+,%a2
        rts
fl_io_core_pack:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        move.l 16(%sp),%a1
        bra fl_file_pack
fl_io_core_publish:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        bra fl_bank_publish
fl_io_core_seal:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a1
        bra fl_file_seal
fl_io_fs_open:
        jmp 0x40016864:l
fl_io_fs_read:
        jmp 0x40016564:l
fl_io_fs_write:
        jmp 0x400166b8:l
fl_io_fs_close:
        jmp 0x4001677c:l
fl_io_fs_size:
        move.l 0x46c8241e:l,%a0
        jmp (%a0)
fl_io_fs_copy:
        jmp 0x40016388:l
fl_io_fs_remove:
        move.l 0x46c82432:l,%a0
        jmp (%a0)
fl_io_stock_directory:
        jmp 0x40025230:l
fl_io_stock_card_ready:
        jmp 0x400255ec:l
fl_io_queue_post:
        jmp 0x40000c3c:l
fl_io_post:
        jmp 0x40084110:l
fl_io_toast:
        jmp 0x4005a2b8:l
fl_io_irq_lock:
        moveq #0,%d0
        move.w %sr,%d0
        move.w #0x2700,%sr
        rts
fl_io_irq_restore:
        move.l 4(%sp),%d0
        move.w %d0,%sr
        rts
| Displaced dispatcher switch prefix; a2 remains the stable stock job.
fl_io_dispatch:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %a2,-(%sp)
        bsr fl_io_before_job
        addq.l #4,%sp
        tst.l %d0
        bpl fl_io_dispatch_resume
        move.l %d0,-(%sp)
        move.l %a2,-(%sp)
        bsr fl_io_reject_job
        addq.l #8,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x4008484e:l
fl_io_dispatch_resume:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_io_dispatch:l
        .else
        mvz.b (%a2),%d0
        moveq #45,%d1
        cmp.l %d0,%d1
        jmp 0x40084864:l
        .endif
| Existing UI timer schedules stock engine job2 when FM locks alone are dirty.
| No filesystem call, core call, allocation, or new queue descriptor here.
fl_io_background_request:
        and.l %d1,%d0
        bne fl_io_background_yes
        move.l %d1,-(%sp)
        move.l fl_dirty_mask:l,%d0
        and.l fl_ready_mask:l,%d0
        move.l fl_blocked_mask:l,%d1
        or.l fl_io_protected_mask:l,%d1
        not.l %d1
        and.l %d1,%d0
        tst.l %d0
        bne fl_io_background_some
fl_io_background_some:
        move.l (%sp)+,%d1
        tst.l %d0
        beq fl_io_background_no
fl_io_background_yes:
        moveq #1,%d0
        jmp 0x40022c1c:l
fl_io_background_no:
        .if HAVE_SYDRUM
        jmp sl_io_background_request:l
        .else
        jmp 0x40022c70:l
        .endif
| The UI tick's transport test (0x4005224a; d0 = the sequencer state 0x800065b8): stopped
| (0) or 2 continue to stock's background save counter; otherwise stock clears that counter
| (0x40052278) and the lock files get their own flush (fl_io_play_tick).
fl_io_tick_hook:
        tst.l %d0
        beq fl_io_tick_stock
        moveq #2,%d1
        cmp.l %d0,%d1
        beq fl_io_tick_stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        bsr fl_io_play_tick
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_io_tick_hook:l
        .else
        jmp 0x40052278:l
        .endif
fl_io_tick_stock:
        .if HAVE_SYDRUM
        jmp sl_io_tick_hook:l
        .else
        jmp 0x40052254:l
        .endif

fl_io_stock_banks_load:
.if HAVE_SYDRUM
jmp sl_io_banks_load:l
.else
lea -328(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x400905dc:l
.endif

fl_io_stock_banks_save:
.if HAVE_SYDRUM
jmp sl_io_banks_save:l
.else
link.w %a6,#-324
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x400917d0:l
.endif

fl_io_stock_card_sync:
.if HAVE_SYDRUM
jmp sl_io_card_sync:l
.else
lea -12(%sp),%sp
movem.l %d2-%d4,(%sp)
jmp 0x400919ec:l
.endif

fl_io_stock_project_store:
.if HAVE_SYDRUM
jmp sl_io_project_store:l
.else
link.w %a6,#-560
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x4008ee7c:l
.endif

fl_io_stock_project_restore:
.if HAVE_SYDRUM
jmp sl_io_project_restore:l
.else
link.w %a6,#-560
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x4008f188:l
.endif

fl_io_stock_bank_store:
.if HAVE_SYDRUM
jmp sl_io_bank_store:l
.else
lea -564(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x4008edac:l
.endif

fl_io_stock_bank_restore:
.if HAVE_SYDRUM
jmp sl_io_bank_restore:l
.else
lea -564(%sp),%sp
movem.l %d2-%d7/%a2-%a6,(%sp)
jmp 0x4008f0b8:l
.endif

fl_io_stock_export:
.if HAVE_SYDRUM
jmp sl_io_export:l
.else
lea -104(%sp),%sp
movem.l %d2-%d7/%a2-%a5,(%sp)
jmp 0x400912cc:l
.endif

fl_io_stock_clear:
.if HAVE_SYDRUM
jmp sl_io_clear:l
.else
move.l %a2,-(%sp)
clr.l -(%sp)
jsr 0x4000fd34:l
jmp 0x400909e2:l
.endif

fl_io_stock_delete:
.if HAVE_SYDRUM
jmp sl_io_delete:l
.else
lea -324(%sp),%sp
movem.l %d2-%d5/%a2-%a3,(%sp)
jmp 0x4008ec54:l
.endif

.section .text
