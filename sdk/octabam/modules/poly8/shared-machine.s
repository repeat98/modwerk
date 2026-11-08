#NO_APP
	.file	"shared-machine.c"
	.text
	.align	2
	.type	owner.part.0, @function
owner.part.0:
	move.w 10(%sp),%d0
	moveq #80,%d1
	mulu.w #30,%d0
	move.l %d0,%a0
	lea (60,%a0),%a0
	add.l 4(%sp),%a0
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jeq .L17
.L2:
	mvz.b (%a0),%d0
	moveq #65,%d1
	cmp.l %d0,%d1
	jeq .L18
.L4:
	mvz.b (%a0),%d0
	moveq #83,%d1
	cmp.l %d0,%d1
	jeq .L19
.L5:
	mvz.b (%a0),%d0
	moveq #70,%d1
	cmp.l %d0,%d1
	jeq .L8
.L9:
	clr.l %d0
	rts
.L17:
	mvz.b 1(%a0),%d0
	moveq #76,%d1
	cmp.l %d0,%d1
	jne .L2
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L2
	mov3q.l #1,%d0
	rts
.L18:
	mvz.b 1(%a0),%d0
	moveq #66,%d1
	cmp.l %d0,%d1
	jne .L4
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L4
	mov3q.l #2,%d0
	rts
.L19:
	mvz.b 1(%a0),%d0
	moveq #50,%d1
	cmp.l %d0,%d1
	jne .L5
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L7
	mvz.b 2(%a0),%d0
	subq.l #2,%d0
	tst.l %d0
	jne .L5
.L7:
	mov3q.l #3,%d0
	rts
.L8:
	mvz.b 1(%a0),%d0
	moveq #77,%d1
	cmp.l %d0,%d1
	jne .L9
	move.b 2(%a0),%d0
	mov3q.l #1,%d1
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	lsl.l #2,%d0
	rts
	.size	owner.part.0, .-owner.part.0
	.align	2
	.type	mr_current_owner.part.0, @function
mr_current_owner.part.0:
	move.l %d2,-(%sp)
	mvz.b 269161676,%d1
	move.l 1187521622,%a0
	mov3q.l #7,%d2
	move.b 269161679,%d0
	cmp.l %d1,%d2
	jcs .L23
	mov3q.l #3,%d2
	and.l %d2,%d0
	mvz.w #6322,%d2
	add.l #585088,%a0
	muls.l %d2,%d0
	mov3q.l #1,%d2
	add.l %d0,%a0
	mvz.b 34(%a0,%d1.l),%d0
	cmp.l %d0,%d2
	jcs .L23
	move.l %d1,-(%sp)
	move.l %a0,-(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	move.l (%sp)+,%d2
	rts
.L23:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
	.size	mr_current_owner.part.0, .-mr_current_owner.part.0
	.align	2
	.globl	mr_row
	.type	mr_row, @function
mr_row:
	move.l %d2,-(%sp)
	move.l 8(%sp),%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jeq .L33
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L34
	mov3q.l #2,%d2
	cmp.l %d1,%d2
	jeq .L35
	mov3q.l #7,%d0
	lea st_type,%a0
	tst.l %a0
	jeq .L31
.L49:
	mov3q.l #3,%d2
	cmp.l %d1,%d2
	jeq .L26
	addq.l #1,%d0
.L31:
	lea fm_type,%a0
	tst.l %a0
	jeq .L46
	subq.l #4,%d1
	tst.l %d1
	jeq .L26
.L46:
	clr.l %d0
.L26:
	move.l (%sp)+,%d2
	rts
.L34:
	mov3q.l #6,%d0
	lea st_type,%a0
	tst.l %a0
	jne .L49
	jra .L31
.L33:
	move.l (%sp)+,%d2
	mov3q.l #5,%d0
	rts
.L35:
	move.l (%sp)+,%d2
	mov3q.l #6,%d0
	rts
	.size	mr_row, .-mr_row
	.align	2
	.globl	mr_current_owner
	.type	mr_current_owner, @function
mr_current_owner:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L52
	tst.b -2147483627.l
	jeq .L56
.L52:
	clr.l %d0
	rts
.L56:
	jra (mr_current_owner.part.0)
	.size	mr_current_owner, .-mr_current_owner
	.align	2
	.globl	mr_backing
	.type	mr_backing, @function
mr_backing:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L65
	mvz.b 269161676,%d0
	mov3q.l #7,%d1
	cmp.l %d0,%d1
	jcs .L65
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	mvz.b 269161676,%d1
	add.l #585088,%a0
	and.l %d2,%d0
	mvz.w #6322,%d2
	muls.l %d2,%d0
	add.l %d0,%a0
	mvz.b 34(%a0,%d1.l),%d0
	tst.l %d0
	jne .L65
	move.l (%sp)+,%d2
	rts
.L65:
	move.l (%sp)+,%d2
	mov3q.l #1,%d0
	rts
	.size	mr_backing, .-mr_backing
	.align	2
	.type	tables, @function
tables:
	lea (-12,%sp),%sp
	move.l %a2,-(%sp)
	move.l #1074618172,%a0
	move.l %d2,-(%sp)
	lea mr_pb_table,%a2
	move.l 1074618168,(%a2)
	move.l (%a0),mr_pb_table+4
	move.l #1074618176,%a0
	move.l (%a0),mr_pb_table+8
	move.l #1074618180,%a0
	move.l (%a0),mr_pb_table+12
	move.l #1074618184,%a0
	move.l (%a0),mr_pb_table+16
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L71
	tst.b -2147483627.l
	jeq .L104
.L71:
	clr.l 16(%sp)
.L70:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L72
	move.l 1187521622,%a0
	move.l #1074606510,%d2
	move.l %d2,mr_pb_table+20
	move.b 269161679,%d1
	mov3q.l #3,%d2
	mvz.b 269161676,%d0
	add.l #585088,%a0
	move.l %d0,%a1
	move.l #ab_track_page,%d0
	and.l %d2,%d1
	mvz.w #6322,%d2
	muls.l %d2,%d1
	add.l %d1,%a0
	lea 34(%a0,%a1.l),%a1
	move.l %a1,12(%sp)
	tst.l %d0
	jeq .L74
	move.l 12(%sp),-(%sp)
	move.l %d0,%a0
	jsr (%a0)
	addq.l #4,%sp
.L75:
	move.l #ab_type,%d1
	tst.l %d1
	jeq .L76
	mov3q.l #6,%d1
.L76:
	move.l %d0,(%a2,%d1.l*4)
.L74:
	move.l #st_type,%d1
	tst.l %d1
	jeq .L77
	mov3q.l #3,%d0
	cmp.l 16(%sp),%d0
	jeq .L105
.L87:
	move.l #1074606510,%a0
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L89
.L108:
	mov3q.l #7,%d0
	tst.l %d1
	jeq .L106
.L80:
	move.l %a0,(%a2,%d0.l*4)
.L77:
	lea fm_track_page,%a0
	tst.l %a0
	jeq .L68
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L91
	mov3q.l #7,%a1
.L82:
	tst.l %d1
	jeq .L83
	addq.l #1,%a1
.L83:
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L107
	move.l 12(%sp),-(%sp)
	move.l %a1,12(%sp)
	jsr (%a0)
	move.l 12(%sp),%a1
	addq.l #4,%sp
	move.l %d0,(%a2,%a1.l*4)
.L68:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	lea (12,%sp),%sp
	rts
.L72:
	move.l #1074606510,%a0
	move.l %a0,mr_pb_table+20
	move.l #ab_track_page,%d0
	clr.l 12(%sp)
	tst.l %d0
	jeq .L74
	move.l #1074606510,%d0
	jra .L75
.L89:
	mov3q.l #6,%d0
	tst.l %d1
	jne .L80
.L106:
	clr.l %d0
	move.l %a0,(%a2,%d0.l*4)
	jra .L77
.L104:
	jsr (mr_current_owner.part.0)
	move.l %d0,16(%sp)
	jra .L70
.L105:
	move.l %d1,8(%sp)
	jsr mr_backing
	move.l 8(%sp),%d1
	tst.l %d0
	jne .L87
	move.l #1074606108,%a0
	move.l #ab_type,%d0
	tst.l %d0
	jne .L108
	jra .L89
.L107:
	move.l 12(%sp),-(%sp)
	sub.l %a1,%a1
	move.l %a1,12(%sp)
	jsr (%a0)
	move.l 12(%sp),%a1
	addq.l #4,%sp
	move.l %d0,(%a2,%a1.l*4)
	jra .L68
.L91:
	mov3q.l #6,%a1
	jra .L82
	.size	tables, .-tables
	.align	2
	.type	names, @function
names:
	lea (-16,%sp),%sp
	movem.l #60,(%sp)
	tst.l tables_ready
	jeq .L141
	lea labels,%a0
	mov3q.l #1,%d0
	move.l #fm_type,%d3
	mov3q.l #5,%d1
	lea mr_src_names,%a1
	move.l #ab_type,%d2
	move.l #st_type,%d4
.L115:
	move.l (%a0)+,(%a1,%d1.l*4)
	addq.l #1,%d0
.L122:
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jeq .L142
.L114:
	mov3q.l #3,%d5
	cmp.l %d0,%d5
	jeq .L143
.L125:
	tst.l %d3
	jeq .L109
.L129:
	mov3q.l #4,%d0
.L136:
	tst.l %d2
	jeq .L127
	mov3q.l #2,%d5
	cmp.l %d0,%d5
	jeq .L128
	mov3q.l #7,%d1
.L116:
	tst.l %d4
	jeq .L119
	mov3q.l #3,%d5
	cmp.l %d0,%d5
	jeq .L115
	addq.l #1,%d1
.L119:
	tst.l %d3
	jeq .L144
	mov3q.l #4,%d5
	cmp.l %d0,%d5
	jeq .L145
	move.l (%a0)+,(%a1)
	addq.l #1,%d0
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jne .L114
.L142:
	move.l #ab_type,%d1
	tst.l %d1
	jne .L136
	addq.l #4,%a0
	mov3q.l #3,%d0
	mov3q.l #3,%d5
	cmp.l %d0,%d5
	jne .L125
.L143:
	move.l #st_type,%d1
	tst.l %d1
	jne .L136
	addq.l #4,%a0
	tst.l %d3
	jne .L129
.L109:
	movem.l (%sp),#60
	lea (16,%sp),%sp
	rts
.L141:
	jsr tables
	mov3q.l #1,tables_ready
	move.l #fm_type,%d3
	move.l #ab_type,%d2
	move.l #st_type,%d4
	lea labels,%a0
	mov3q.l #1,%d0
	mov3q.l #5,%d1
	lea mr_src_names,%a1
	jra .L115
.L144:
	move.l (%a0),(%a1)
	addq.l #1,%d0
	mov3q.l #5,%d1
	cmp.l %d0,%d1
	jeq .L109
	addq.l #4,%a0
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jne .L114
	jra .L142
.L127:
	mov3q.l #6,%d1
	jra .L116
.L128:
	mov3q.l #6,%d1
	move.l (%a0)+,(%a1,%d1.l*4)
	addq.l #1,%d0
	jra .L122
.L145:
	movem.l (%sp),#60
	move.l (%a0),(%a1,%d1.l*4)
	lea (16,%sp),%sp
	rts
	.size	names, .-names
	.align	2
	.globl	mr_name
	.type	mr_name, @function
mr_name:
	jsr names
	moveq #8,%d0
	cmp.l 4(%sp),%d0
	jcs .L147
	mov3q.l #4,%d1
	cmp.l 4(%sp),%d1
	jcc .L148
	mov3q.l #5,%d0
	cmp.l 4(%sp),%d0
	jeq .L148
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L155
	mov3q.l #6,%d1
	cmp.l 4(%sp),%d1
	jeq .L148
	mov3q.l #7,%d0
.L165:
	move.l #st_type,%d1
	tst.l %d1
	jeq .L152
	cmp.l 4(%sp),%d0
	jeq .L148
	addq.l #1,%d0
.L152:
	move.l #fm_type,%d1
	tst.l %d1
	jeq .L147
	cmp.l 4(%sp),%d0
	jeq .L148
.L147:
	move.l mr_src_names+4,%d0
	rts
.L148:
	move.l 4(%sp),%d1
	lea mr_src_names,%a0
	move.l (%a0,%d1.l*4),%d0
	rts
.L155:
	mov3q.l #6,%d0
	jra .L165
	.size	mr_name, .-mr_name
	.align	2
	.globl	mr_type
	.type	mr_type, @function
mr_type:
	move.l %d2,-(%sp)
	jsr names
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L206
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	mvz.w #6322,%d2
	add.l #585088,%a0
	move.l 12(%sp),%a1
	and.l %d1,%d0
	mov3q.l #7,%d1
	muls.l %d2,%d0
	add.l %d0,%a0
	sub.l %a0,%a1
	move.l %a1,%d0
	add.l #-34,%d0
	cmp.l %d0,%d1
	jcc .L212
.L206:
	move.l 8(%sp),%d0
.L168:
	move.l (%sp)+,%d2
	rts
.L212:
	mvz.b (%a0,%a1.l),%d1
	mov3q.l #1,%d2
	cmp.l %d1,%d2
	jcs .L206
	move.l %d0,-(%sp)
	move.l %a0,-(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	move.l %d0,%d1
	tst.l %d0
	jeq .L206
	cmp.l %d0,%d2
	jeq .L172
	mov3q.l #2,%d0
	cmp.l %d1,%d0
	jeq .L213
	mov3q.l #3,%d2
	cmp.l %d1,%d2
	jeq .L214
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L206
	mov3q.l #1,%d2
	cmp.l 8(%sp),%d2
	jcs .L206
.L205:
	move.l #ab_type,%d0
.L174:
	tst.l %d0
	jeq .L180
	mov3q.l #2,%d2
	cmp.l %d1,%d2
	jeq .L181
	mov3q.l #7,%d0
.L176:
	lea st_type,%a0
	tst.l %a0
	jeq .L177
	mov3q.l #3,%d2
	cmp.l %d1,%d2
	jeq .L168
	addq.l #1,%d0
.L177:
	lea fm_type,%a0
	tst.l %a0
	jeq .L207
	subq.l #4,%d1
	tst.l %d1
	jeq .L168
.L207:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L213:
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L206
	cmp.l 8(%sp),%d2
	jcc .L174
	move.l 8(%sp),%d0
	jra .L168
.L172:
	mov3q.l #1,%d0
	cmp.l 8(%sp),%d0
	jcs .L206
	move.l (%sp)+,%d2
	mov3q.l #5,%d0
	rts
.L214:
	move.l #st_type,%d0
	tst.l %d0
	jeq .L206
	mov3q.l #1,%d0
	cmp.l 8(%sp),%d0
	jcc .L205
	move.l 8(%sp),%d0
	jra .L168
.L180:
	mov3q.l #6,%d0
	jra .L176
.L181:
	move.l (%sp)+,%d2
	mov3q.l #6,%d0
	rts
	.size	mr_type, .-mr_type
	.align	2
	.globl	mr_chooser_type
	.type	mr_chooser_type, @function
mr_chooser_type:
	subq.l #8,%sp
	move.l %d2,-(%sp)
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l 20(%sp),%a0
	move.l 16(%sp),8(%sp)
	cmp.l #133169151,%d0
	jls .L216
.L217:
	move.l %a0,20(%sp)
	move.l 8(%sp),16(%sp)
	move.l (%sp)+,%d2
	addq.l #8,%sp
	jra mr_type
.L216:
	mvz.b 269161676,%d1
	move.l 1187521622,%a1
	mov3q.l #7,%d2
	move.b 269161679,%d0
	cmp.l %d1,%d2
	jcs .L217
	mov3q.l #3,%d2
	and.l %d2,%d0
	mvz.w #6322,%d2
	add.l #585088,%a1
	muls.l %d2,%d0
	mov3q.l #1,%d2
	add.l %d0,%a1
	mvz.b 34(%a1,%d1.l),%d0
	cmp.l %d0,%d2
	jcs .L217
	move.l %d1,-(%sp)
	move.l %a1,-(%sp)
	move.l %a0,12(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	move.l 4(%sp),%a0
	cmp.l %d0,%d2
	jeq .L229
	subq.l #3,%d0
	tst.l %d0
	jne .L217
	lea st_chooser_type,%a1
	tst.l %a1
	jeq .L217
	move.l %a0,-(%sp)
	move.l 12(%sp),-(%sp)
	move.l %a0,12(%sp)
	jsr (%a1)
	addq.l #8,%sp
	subq.l #5,%d0
	move.l 4(%sp),%a0
	tst.l %d0
	jeq .L217
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L229:
	move.l %a0,-(%sp)
	move.l 12(%sp),-(%sp)
	move.l %a0,12(%sp)
	jsr pm_chooser_type
	addq.l #8,%sp
	subq.l #5,%d0
	move.l 4(%sp),%a0
	tst.l %d0
	jeq .L217
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
	.size	mr_chooser_type, .-mr_chooser_type
	.align	2
	.globl	mr_assign
	.type	mr_assign, @function
mr_assign:
	lea (-56,%sp),%sp
	movem.l #1052,(%sp)
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l 60(%sp),%a1
	move.l 64(%sp),%a0
	move.l 68(%sp),%d2
	cmp.l #133169151,%d0
	jhi .L264
	mov3q.l #7,%d0
	cmp.l %a0,%d0
	jcs .L264
	move.l 1187521622,%d3
	move.l %a1,%d4
	sub.l %d3,%d4
	move.l %d4,%d0
	add.l #-585088,%d0
	move.l %d4,28(%sp)
	mvz.w #6322,%d4
	move.l %d3,40(%sp)
	move.l %d0,%d3
	remu.l %d4,%d1:%d3
	tst.l %d1
	jne .L234
	cmp.l #25287,%d0
	jhi .L234
	mov3q.l #5,%d0
	cmp.l %d2,%d0
	jeq .L236
	move.l #ab_type,%d3
	tst.l %d3
	jeq .L282
	mov3q.l #6,%d4
	cmp.l %d2,%d4
	jeq .L283
	mov3q.l #7,36(%sp)
.L237:
	mov3q.l #3,32(%sp)
	move.l #st_type,%d0
	tst.l %d0
	jeq .L241
	cmp.l 36(%sp),%d2
	jeq .L238
	addq.l #1,36(%sp)
.L241:
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L339
	cmp.l 36(%sp),%d2
	jeq .L340
	mov3q.l #1,%d3
	lea 34(%a1,%a0.l),%a2
	mvz.b (%a2),%d0
	move.l %a2,36(%sp)
	cmp.l %d0,%d3
	jcs .L264
	move.l %a0,-(%sp)
	move.l #owner.part.0,%d4
	move.l %a1,-(%sp)
	move.l %d4,56(%sp)
	move.l %d1,32(%sp)
	move.l %a0,24(%sp)
	move.l %a1,28(%sp)
	move.l %d4,%a2
	jsr (%a2)
	move.l %d0,40(%sp)
	move.l 32(%sp),%d1
	addq.l #8,%sp
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
.L244:
	mov3q.l #1,%d3
	cmp.l 32(%sp),%d3
	jeq .L341
	mov3q.l #3,%d0
	cmp.l 32(%sp),%d0
	jeq .L342
	tst.l 32(%sp)
	jeq .L264
	mov3q.l #2,%d4
	cmp.l 32(%sp),%d4
	jeq .L343
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L264
	move.l %a0,%d0
	moveq #30,%d3
	muls.l %d3,%d0
	move.l 28(%sp),%a0
	move.l 40(%sp),%a1
	add.l #-268525902,%a1
	add.l %d0,%a0
	add.l #268525962,%a0
.L269:
	clr.b %d4
	clr.b (%a0)
	addq.l #1,%d1
	mov3q.l #3,%d0
	move.b %d4,(%a1,%a0.l)
	addq.l #1,%a0
	cmp.l %d1,%d0
	jne .L269
.L264:
	mov3q.l #4,%d1
	cmp.l %d2,%d1
	jcs .L344
.L288:
	move.l %d2,%d1
.L230:
	movem.l (%sp),#1052
	move.l %d1,%d0
	lea (56,%sp),%sp
	rts
.L344:
	movem.l (%sp),#1052
	mov3q.l #1,%d1
	move.l %d1,%d0
	lea (56,%sp),%sp
	rts
.L234:
	movem.l (%sp),#1052
	mov3q.l #-1,%d1
	move.l %d1,%d0
	lea (56,%sp),%sp
	rts
.L282:
	mov3q.l #6,36(%sp)
	jra .L237
.L339:
	clr.l 32(%sp)
.L238:
	lea 34(%a1,%a0.l),%a2
	mov3q.l #1,%d3
	mvz.b (%a2),%d0
	move.l %a2,36(%sp)
	cmp.l %d0,%d3
	jcs .L345
.L329:
	move.l %a0,-(%sp)
	move.l #owner.part.0,%d0
	move.l %a1,-(%sp)
	move.l %d0,56(%sp)
	move.l 56(%sp),%a2
	mov3q.l #2,%d3
	move.l %d1,32(%sp)
	move.l %a0,24(%sp)
	move.l %a1,28(%sp)
	jsr (%a2)
	move.l %d0,60(%sp)
	move.l 36(%sp),%d0
	add.l #268525902,%d0
	move.l %d0,52(%sp)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	cmp.l 32(%sp),%d3
	jeq .L247
	move.l 32(%sp),%d0
	mov3q.l #4,%d3
	move.l 52(%sp),32(%sp)
	cmp.l %d0,%d3
	jeq .L248
	tst.l %d0
	jeq .L244
	mov3q.l #1,%d2
	cmp.l 32(%sp),%d2
	jeq .L346
.L249:
	movem.l (%sp),#1052
	mov3q.l #1,68(%sp)
	move.l %a0,64(%sp)
	move.l %a1,60(%sp)
	lea (56,%sp),%sp
	jra st_assign
.L342:
	move.l #st_assign,%d0
	tst.l %d0
	jeq .L266
	clr.l -(%sp)
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l %a0,28(%sp)
	move.l %a1,32(%sp)
	move.l %d0,%a2
	mov3q.l #1,%d3
	jsr (%a2)
	move.l 48(%sp),%a2
	lea (12,%sp),%sp
	move.l %d0,%d1
	mvz.b (%a2),%d0
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	cmp.l %d0,%d3
	jcs .L264
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l 56(%sp),%a0
	move.l %d1,32(%sp)
	jsr (%a0)
	addq.l #8,%sp
	subq.l #3,%d0
	move.l 24(%sp),%d1
	tst.l %d0
	jeq .L230
	mov3q.l #4,%d1
	cmp.l %d2,%d1
	jcc .L288
	jra .L344
.L345:
	move.l 28(%sp),%a2
	add.l #268525902,%a2
	move.l %a2,44(%sp)
	mov3q.l #2,%d0
	cmp.l 32(%sp),%d0
	jeq .L286
	mov3q.l #4,%d3
	cmp.l 32(%sp),%d3
	jeq .L287
	tst.l 32(%sp)
	jne .L249
	mov3q.l #4,%d1
	cmp.l %d2,%d1
	jcc .L288
	jra .L344
.L346:
	move.l %a0,-(%sp)
	move.l %a0,20(%sp)
	move.l %a1,24(%sp)
	jsr pm_clear_extensions
	addq.l #4,%sp
	mov3q.l #1,68(%sp)
	movem.l (%sp),#1052
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	move.l %a0,64(%sp)
	move.l %a1,60(%sp)
	lea (56,%sp),%sp
	jra st_assign
.L286:
	clr.l 52(%sp)
.L247:
	move.l #ab_admit_track,%d0
	tst.l %d0
	jeq .L234
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l %d1,32(%sp)
	move.l %a0,24(%sp)
	move.l %a1,28(%sp)
	move.l %d0,%a2
	jsr (%a2)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	tst.l %d0
	jeq .L234
	mov3q.l #1,%d3
	cmp.l 52(%sp),%d3
	jeq .L347
	mov3q.l #2,%d2
	cmp.l 52(%sp),%d2
	jeq .L348
	lea ab_defaults,%a2
	mov3q.l #2,32(%sp)
	move.l %a2,28(%sp)
.L276:
	moveq #30,%d2
	move.l %a0,%d0
	muls.l %d2,%d0
	move.l %d0,%d2
	addq.l #6,%d2
	move.l %d0,40(%sp)
.L260:
	move.l %d2,%a2
	mov3q.l #5,%d0
	lea 42(%a2,%d1.l),%a0
	cmp.l %d1,%d0
	jcc .L258
	move.l %d1,%d3
	mov3q.l #6,%d4
	remu.l %d4,%d0:%d3
	move.l 28(%sp),%a2
	move.b (%a2,%d1.l),%d3
	move.l 44(%sp),%a2
	addq.l #1,%d1
	add.l %d2,%d0
	add.l #474,%d0
	move.b %d3,(%a2,%d0.l)
	move.b %d3,(%a1,%d0.l)
	moveq #12,%d0
	cmp.l %d1,%d0
	jne .L260
	move.l 40(%sp),%d0
	mov3q.l #2,%d1
	add.l #60,%d0
	cmp.l 32(%sp),%d1
	jeq .L261
	moveq #70,%d2
	move.l 44(%sp),%a0
	move.b %d2,(%a0,%d0.l)
	move.b %d2,(%a1,%d0.l)
	moveq #77,%d0
.L262:
	moveq #1,%d2
	move.l 40(%sp),%d1
	move.l 44(%sp),%a2
	move.b %d0,61(%a2,%d1.l)
	move.b %d0,61(%a1,%d1.l)
	move.b %d2,62(%a2,%d1.l)
	move.b %d2,62(%a1,%d1.l)
	mov3q.l #1,%d1
.L349:
	movem.l (%sp),#1052
	move.l %d1,%d0
	lea (56,%sp),%sp
	rts
.L348:
	move.l %a0,%d3
	moveq #30,%d4
	muls.l %d4,%d3
	move.l %d3,%d0
	add.l #60,%d0
	move.l %d3,40(%sp)
.L261:
	moveq #65,%d1
	move.l 44(%sp),%a0
	moveq #1,%d2
	move.l 44(%sp),%a2
	move.b %d1,(%a0,%d0.l)
	move.b %d1,(%a1,%d0.l)
	moveq #66,%d0
	move.l 40(%sp),%d1
	move.b %d0,61(%a2,%d1.l)
	move.b %d0,61(%a1,%d1.l)
	move.b %d2,62(%a2,%d1.l)
	move.b %d2,62(%a1,%d1.l)
	mov3q.l #1,%d1
	jra .L349
.L258:
	move.l 28(%sp),%a2
	move.b (%a2,%d1.l),%d0
	move.l 44(%sp),%a2
	addq.l #1,%d1
	move.b %d0,(%a2,%a0.l)
	move.b %d0,(%a1,%a0.l)
	jra .L260
.L287:
	clr.l 32(%sp)
.L248:
	move.l #fm_admit_track,%d0
	tst.l %d0
	jeq .L234
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l %d1,32(%sp)
	move.l %a0,24(%sp)
	move.l %a1,28(%sp)
	move.l %d0,%a2
	jsr (%a2)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	tst.l %d0
	jeq .L234
	mov3q.l #1,%d0
	cmp.l 32(%sp),%d0
	jeq .L350
	mov3q.l #4,%d0
	cmp.l 32(%sp),%d0
	jeq .L275
	lea fm_defaults,%a2
	mov3q.l #4,32(%sp)
	move.l %a2,28(%sp)
.L351:
	moveq #30,%d2
	move.l %a0,%d0
	muls.l %d2,%d0
	move.l %d0,%d2
	addq.l #6,%d2
	move.l %d0,40(%sp)
	jra .L260
.L275:
	moveq #70,%d2
	move.l %a0,%d0
	moveq #30,%d1
	muls.l %d1,%d0
	move.l 44(%sp),%a0
	move.l %d0,40(%sp)
	add.l #60,%d0
	move.b %d2,(%a0,%d0.l)
	move.b %d2,(%a1,%d0.l)
	moveq #77,%d0
	jra .L262
.L341:
	clr.l -(%sp)
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l %a0,28(%sp)
	move.l %a1,32(%sp)
	jsr pm_assign
	mov3q.l #1,%d3
	move.l 48(%sp),%a2
	move.l %d0,%d1
	lea (12,%sp),%sp
	mvz.b (%a2),%d0
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	cmp.l %d0,%d3
	jcs .L263
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l 56(%sp),%a1
	move.l %d1,32(%sp)
	move.l %a0,24(%sp)
	jsr (%a1)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	cmp.l %d0,%d3
	jeq .L230
.L263:
	move.l %a0,-(%sp)
	jsr pm_clear_extensions
	addq.l #4,%sp
	mov3q.l #4,%d1
	cmp.l %d2,%d1
	jcc .L288
	jra .L344
.L350:
	move.l %a0,-(%sp)
	move.l %d1,28(%sp)
	move.l %a0,20(%sp)
	move.l %a1,24(%sp)
	jsr pm_clear_extensions
	addq.l #4,%sp
	lea fm_defaults,%a2
	mov3q.l #4,32(%sp)
	move.l %a2,28(%sp)
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	jra .L351
.L340:
	lea 34(%a1,%a0.l),%a2
	mov3q.l #4,32(%sp)
	mov3q.l #1,%d3
	mvz.b (%a2),%d0
	move.l %a2,36(%sp)
	cmp.l %d0,%d3
	jcc .L329
	jra .L345
.L343:
	lea ab_type,%a1
	tst.l %a1
	jeq .L264
	move.l %a0,%d0
	moveq #30,%d3
	muls.l %d3,%d0
	move.l 28(%sp),%a0
	move.l 40(%sp),%a1
	add.l #-268525902,%a1
	add.l %d0,%a0
	add.l #268525962,%a0
	jra .L269
.L236:
	mvz.b 34(%a1,%a0.l),%d0
	mov3q.l #1,%d4
	cmp.l %d0,%d4
	jcs .L246
	move.l %a0,-(%sp)
	move.l %a1,-(%sp)
	move.l %a0,24(%sp)
	move.l %a1,28(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
.L246:
	movem.l (%sp),#1052
	mov3q.l #1,68(%sp)
	move.l %a0,64(%sp)
	move.l %a1,60(%sp)
	lea (56,%sp),%sp
	jra pm_assign
.L266:
	move.l #st_type,%d0
	tst.l %d0
	jeq .L264
	move.l %a0,%d0
	moveq #30,%d3
	muls.l %d3,%d0
	move.l 28(%sp),%a0
	move.l 40(%sp),%a1
	add.l #-268525902,%a1
	add.l %d0,%a0
	add.l #268525962,%a0
	jra .L269
.L283:
	lea 34(%a1,%a0.l),%a2
	mov3q.l #2,32(%sp)
	mov3q.l #1,%d3
	mvz.b (%a2),%d0
	move.l %a2,36(%sp)
	cmp.l %d0,%d3
	jcc .L329
	jra .L345
.L347:
	move.l %a0,-(%sp)
	move.l %d1,28(%sp)
	move.l %a0,20(%sp)
	move.l %a1,24(%sp)
	jsr pm_clear_extensions
	addq.l #4,%sp
	lea ab_defaults,%a2
	mov3q.l #2,32(%sp)
	move.l %a2,28(%sp)
	move.l 24(%sp),%d1
	move.l 16(%sp),%a0
	move.l 20(%sp),%a1
	jra .L276
	.size	mr_assign, .-mr_assign
	.align	2
	.globl	mr_ui_tick
	.type	mr_ui_tick, @function
mr_ui_tick:
	move.l %d2,-(%sp)
	jsr names
	jsr pm_ui_tick
	lea st_ui_tick,%a0
	tst.l %a0
	jeq .L353
	jsr (%a0)
.L353:
	lea ab_ui_tick,%a0
	tst.l %a0
	jeq .L354
	jsr (%a0)
.L354:
	lea fm_ui_tick,%a0
	tst.l %a0
	jeq .L355
	jsr (%a0)
.L355:
	jsr tables
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jls .L380
	move.l (%sp)+,%d2
	rts
.L380:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L357
	tst.b -2147483627.l
	jeq .L381
.L357:
	move.l 1187521622,%d0
	move.b 269161679,%d0
	move.b 269161676,%d0
.L359:
	jsr mr_backing
	tst.l %d0
	jne .L361
	move.l #1074606108,%d0
	move.l %d0,1074618188
.L383:
	move.l (%sp)+,%d2
	rts
.L381:
	jsr (mr_current_owner.part.0)
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d1
	mvz.b 269161676,%d2
	move.l %d2,%a1
	mov3q.l #3,%d2
	and.l %d2,%d1
	mvz.w #6322,%d2
	muls.l %d2,%d1
	add.l %d1,%a0
	lea 34(%a0,%a1.l),%a0
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jeq .L382
	subq.l #4,%d0
	tst.l %d0
	jne .L359
	lea fm_track_page,%a1
	tst.l %a1
	jeq .L359
	move.l %a0,-(%sp)
	jsr (%a1)
	addq.l #4,%sp
.L384:
	move.l %d0,1074618188
	jra .L383
.L361:
	move.l #1074606510,%d0
	move.l %d0,1074618188
	jra .L383
.L382:
	lea ab_track_page,%a1
	tst.l %a1
	jeq .L359
	move.l %a0,-(%sp)
	jsr (%a1)
	addq.l #4,%sp
	jra .L384
	.size	mr_ui_tick, .-mr_ui_tick
	.align	2
	.globl	mr_page
	.type	mr_page, @function
mr_page:
	subq.l #8,%sp
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 20(%sp),%a0
	tst.l tables_ready
	jeq .L399
.L386:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L388
	move.l #-585088,%d0
	mov3q.l #3,%d2
	move.l 1187521622,%d1
	sub.l %d1,%d0
	move.b 269161679,%d1
	mvz.w #6322,%d3
	add.l %a0,%d0
	and.l %d2,%d1
	mov3q.l #7,%d2
	muls.l %d3,%d1
	sub.l %d1,%d0
	move.l %d0,%d1
	add.l #-34,%d1
	cmp.l %d1,%d2
	jcc .L400
.L388:
	move.l (%sp)+,%d2
	clr.l %d0
	move.l (%sp)+,%d3
	addq.l #8,%sp
	rts
.L399:
	move.l %a0,8(%sp)
	jsr tables
	mov3q.l #1,tables_ready
	move.l 8(%sp),%a0
	jra .L386
.L400:
	move.l 1187521622,%a1
	add.l #585088,%a1
	move.b 269161679,%d3
	move.b %d3,%d2
	mov3q.l #3,%d3
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	add.l %d2,%a1
	mvz.b (%a1,%d0.l),%d0
	mov3q.l #1,%d2
	cmp.l %d0,%d2
	jcs .L388
	move.l %d1,-(%sp)
	move.l %a1,-(%sp)
	move.l %a0,16(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	mov3q.l #2,%d3
	move.l 8(%sp),%a0
	cmp.l %d0,%d3
	jne .L390
	move.l #ab_track_page,%d0
	tst.l %d0
	jeq .L388
	move.l %a0,20(%sp)
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	addq.l #8,%sp
	jra ab_track_page
.L390:
	subq.l #4,%d0
	tst.l %d0
	jne .L388
	move.l #fm_track_page,%d0
	tst.l %d0
	jeq .L388
	move.l %a0,20(%sp)
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	addq.l #8,%sp
	jra fm_track_page
	.size	mr_page, .-mr_page
	.align	2
	.globl	mr_validate
	.type	mr_validate, @function
mr_validate:
	lea (-144,%sp),%sp
	movem.l #31996,(%sp)
	move.l 148(%sp),%a2
	mov3q.l #6,%a6
	lea (48,%sp),%a5
	clr.l %d6
	move.l %a5,%d5
	clr.l %d2
	lea (34,%a2),%a0
	move.l %a0,44(%sp)
	move.l #ab_type,%d3
	lea (owner.part.0),%a3
.L409:
	move.l 44(%sp),%a4
	mov3q.l #1,%d1
	mvz.b (%a4,%d6.l),%d0
	cmp.l %d0,%d1
	jcs .L407
	move.l %d6,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	mov3q.l #2,%d4
	cmp.l %d0,%d4
	jeq .L403
	subq.l #4,%d0
	tst.l %d0
	jeq .L437
.L407:
	addq.l #1,%d6
	lea (30,%a6),%a6
	add.l #12,%d5
	cmp.l #246,%a6
	jne .L409
	lea vector_validate_part,%a0
	tst.l %a0
	jeq .L410
	pea mr_stock_validate
	move.l %a2,-(%sp)
	jsr (%a0)
	addq.l #8,%sp
	clr.l %d3
	mov3q.l #6,%a1
.L416:
	btst %d3,%d2
	jne .L438
	addq.l #1,%d3
	lea (30,%a1),%a1
	lea (12,%a5),%a5
	cmp.l #246,%a1
	jne .L416
.L441:
	movem.l (%sp),#31996
	lea (144,%sp),%sp
	rts
.L437:
	lea fm_type,%a0
	tst.l %a0
	jeq .L407
	mov3q.l #1,%d0
	lsl.l %d6,%d0
	sub.l %a0,%a0
	or.l %d0,%d2
.L408:
	move.l %a0,%d0
	mov3q.l #5,%d4
	lea 42(%a0,%a6.l),%a1
	add.l #1074606604,%d0
	cmp.l %a0,%d4
	jcc .L406
.L439:
	move.l %a0,%d7
	mov3q.l #6,%d4
	remu.l %d4,%d1:%d7
	move.l %d0,%a4
	moveq #12,%d0
	lea (%a6,%d1.l),%a1
	lea (474,%a1),%a1
	add.l %a2,%a1
	move.b (%a1),(%a0,%d5.l)
	addq.l #1,%a0
	move.b (%a4),(%a1)
	cmp.l %a0,%d0
	jeq .L407
	move.l %a0,%d0
	mov3q.l #5,%d4
	lea 42(%a0,%a6.l),%a1
	add.l #1074606604,%d0
	cmp.l %a0,%d4
	jcs .L439
.L406:
	add.l %a2,%a1
	move.b (%a1),(%a0,%d5.l)
	move.l %d0,%a4
	addq.l #1,%a0
	move.b (%a4),(%a1)
	jra .L408
.L438:
	sub.l %a0,%a0
.L415:
	lea 42(%a0,%a1.l),%a3
	mov3q.l #5,%d1
	cmp.l %a0,%d1
	jcs .L413
.L440:
	lea (%a5,%a0.l),%a4
	addq.l #1,%a0
	move.b (%a4),(%a2,%a3.l)
	lea 42(%a0,%a1.l),%a3
	mov3q.l #5,%d1
	cmp.l %a0,%d1
	jcc .L440
.L413:
	move.l %a0,%d4
	mov3q.l #6,%d5
	remu.l %d5,%d1:%d4
	lea (%a5,%a0.l),%a3
	addq.l #1,%a0
	add.l %a1,%d1
	add.l #474,%d1
	move.b (%a3),(%a2,%d1.l)
	moveq #12,%d1
	cmp.l %a0,%d1
	jne .L415
	addq.l #1,%d3
	lea (30,%a1),%a1
	lea (12,%a5),%a5
	cmp.l #246,%a1
	jne .L416
	jra .L441
.L403:
	tst.l %d3
	jeq .L407
	mov3q.l #1,%d0
	lsl.l %d6,%d0
	sub.l %a0,%a0
	or.l %d0,%d2
	jra .L408
.L410:
	move.l %a2,-(%sp)
	jsr mr_stock_validate
	addq.l #4,%sp
	clr.l %d3
	mov3q.l #6,%a1
	jra .L416
	.size	mr_validate, .-mr_validate
	.align	2
	.globl	mr_open_pool
	.type	mr_open_pool, @function
mr_open_pool:
	move.l 1187521622,%d0
	subq.l #4,%sp
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L479
	tst.b -2147483627.l
	jeq .L444
.L479:
	clr.l %d0
	addq.l #4,%sp
	rts
.L444:
	jsr (mr_current_owner.part.0)
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jeq .L485
	mov3q.l #3,%d1
	cmp.l %d0,%d1
	jne .L447
	lea st_pool_choice_open,%a0
	tst.l %a0
	jeq .L448
	jsr (%a0)
.L448:
	mov3q.l #1,%d0
	move.l #st_type,%d1
	tst.l %d1
	jeq .L479
	addq.l #4,%sp
	rts
.L447:
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jne .L449
	lea ab_engine_open,%a0
	tst.l %a0
	jeq .L450
	jsr (%a0)
.L450:
	mov3q.l #1,%d0
	move.l #ab_type,%d1
	tst.l %d1
	jeq .L479
	addq.l #4,%sp
	rts
.L485:
	move.l %d0,(%sp)
	jsr pm_pool_choice_open
	move.l (%sp),%d0
	addq.l #4,%sp
	rts
.L449:
	subq.l #4,%d0
	tst.l %d0
	jne .L479
	jsr pm_stock_pool_open
	tst.l 1175351520
	jeq .L451
	tst.l 1175352218
	jne .L486
.L451:
	tst.l 1175351520
	jeq .L487
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L459
	mov3q.l #7,%d0
.L453:
	move.l #st_type,%d1
	tst.l %d1
	jeq .L454
	addq.l #1,%d0
.L454:
	move.l #fm_type,%d1
	tst.l %d1
	jeq .L488
	move.l %d0,-(%sp)
	move.l #1175352198,-(%sp)
	move.l %d1,8(%sp)
	jsr 1074261424
	addq.l #8,%sp
	move.l (%sp),%d1
.L452:
	mov3q.l #1,%d0
	tst.l %d1
	jeq .L479
.L484:
	addq.l #4,%sp
	rts
.L487:
	move.l #fm_type,%d1
	mov3q.l #1,%d0
	tst.l %d1
	jne .L484
	jra .L479
.L486:
	jsr 1074235708
	jra .L451
.L488:
	clr.l %d0
	move.l %d0,-(%sp)
	move.l #1175352198,-(%sp)
	move.l %d1,8(%sp)
	jsr 1074261424
	addq.l #8,%sp
	move.l (%sp),%d1
	jra .L452
.L459:
	mov3q.l #6,%d0
	jra .L453
	.size	mr_open_pool, .-mr_open_pool
	.align	2
	.globl	mr_pool_left
	.type	mr_pool_left, @function
mr_pool_left:
	move.l 1175352218,%d1
	lea (-16,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d1,8(%sp)
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	cmp.l #133169151,%d0
	jhi .L490
	tst.b -2147483627.l
	jeq .L549
.L490:
	move.l %a0,24(%sp)
	move.l %d1,20(%sp)
	lea (16,%sp),%sp
	jmp 1074235708
.L549:
	move.l %d1,4(%sp)
	move.l %a0,(%sp)
	jsr (mr_current_owner.part.0)
	move.l 4(%sp),%d1
	move.l %d0,12(%sp)
	move.l (%sp),%a0
	mov3q.l #1,%d0
	cmp.l 12(%sp),%d0
	jeq .L550
	mov3q.l #3,%d0
	cmp.l 12(%sp),%d0
	jne .L494
	lea st_pool_left,%a1
	tst.l %a1
	jeq .L495
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr (%a1)
	addq.l #8,%sp
	tst.l 8(%sp)
	jeq .L489
.L496:
	move.l #st_type,%d0
	tst.l %d0
	jeq .L489
	tst.l 1175351520
	jeq .L489
	tst.l 1175352218
	jne .L489
	move.l #ab_type,%d0
.L499:
	tst.l %d0
	jeq .L508
	mov3q.l #2,%d0
	cmp.l 12(%sp),%d0
	jeq .L509
	mov3q.l #7,%d0
.L502:
	move.l #st_type,%d1
	tst.l %d1
	jeq .L503
	mov3q.l #3,%d1
	cmp.l 12(%sp),%d1
	jeq .L500
	addq.l #1,%d0
.L503:
	move.l #fm_type,%d1
	tst.l %d1
	jeq .L546
	mov3q.l #4,%d1
	cmp.l 12(%sp),%d1
	jeq .L500
.L546:
	clr.l %d0
.L500:
	move.l %d0,24(%sp)
	move.l #1175352198,%d0
	move.l %d0,20(%sp)
	lea (16,%sp),%sp
	jmp 1074261424
.L495:
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr 1074235708
	addq.l #8,%sp
	tst.l 8(%sp)
	jne .L496
.L489:
	lea (16,%sp),%sp
	rts
.L550:
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr pm_pool_left
	addq.l #8,%sp
	tst.l 8(%sp)
	jeq .L489
	tst.l 1175351520
	jeq .L489
	tst.l 1175352218
	jne .L489
	mov3q.l #5,%d0
	move.l %d0,24(%sp)
	move.l #1175352198,%d0
	move.l %d0,20(%sp)
	lea (16,%sp),%sp
	jmp 1074261424
.L508:
	mov3q.l #6,%d0
	jra .L502
.L509:
	mov3q.l #6,%d0
	move.l %d0,24(%sp)
	move.l #1175352198,%d0
	move.l %d0,20(%sp)
	lea (16,%sp),%sp
	jmp 1074261424
.L494:
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr 1074235708
	addq.l #8,%sp
	tst.l 8(%sp)
	jeq .L489
	tst.l 12(%sp)
	jeq .L489
	mov3q.l #2,%d1
	cmp.l 12(%sp),%d1
	jne .L497
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L489
	tst.l 1175351520
	jeq .L489
	tst.l 1175352218
	jeq .L499
	lea (16,%sp),%sp
	rts
.L497:
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L489
	tst.l 1175351520
	jeq .L489
	tst.l 1175352218
	jne .L489
	mov3q.l #4,12(%sp)
	move.l #ab_type,%d0
	jra .L499
	.size	mr_pool_left, .-mr_pool_left
	.align	2
	.globl	mr_pool_right
	.type	mr_pool_right, @function
mr_pool_right:
	move.l 1175352206,%d0
	mov3q.l #5,%d1
	lea (-12,%sp),%sp
	move.l 16(%sp),%a1
	move.l 20(%sp),4(%sp)
	cmp.l %d0,%d1
	jeq .L559
	move.l #ab_type,%d1
	tst.l %d1
	jeq .L560
	mov3q.l #6,%d1
	cmp.l %d0,%d1
	jeq .L561
	mov3q.l #7,%a0
.L553:
	mov3q.l #3,8(%sp)
	move.l #st_type,%d1
	tst.l %d1
	jeq .L556
	cmp.l %d0,%a0
	jeq .L552
	addq.l #1,%a0
.L556:
	move.l #fm_type,%d1
	tst.l %d1
	jeq .L555
	cmp.l %d0,%a0
	jeq .L569
.L555:
	move.l 4(%sp),20(%sp)
	move.l %a1,16(%sp)
	lea (12,%sp),%sp
	jmp 1074237596
.L559:
	mov3q.l #1,8(%sp)
.L552:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L555
.L570:
	tst.b -2147483627.l
	jne .L555
	move.l %a1,(%sp)
	jsr (mr_current_owner.part.0)
	move.l (%sp),%a1
	cmp.l 8(%sp),%d0
	jne .L555
	tst.l 1175352218
	jne .L555
	jsr 1074235876
	lea (12,%sp),%sp
	jra mr_open_pool
.L560:
	mov3q.l #6,%a0
	jra .L553
.L569:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	mov3q.l #4,8(%sp)
	cmp.l #133169151,%d0
	jhi .L555
	jra .L570
.L561:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	mov3q.l #2,8(%sp)
	cmp.l #133169151,%d0
	jhi .L555
	jra .L570
	.size	mr_pool_right, .-mr_pool_right
	.align	2
	.globl	mr_list_target
	.type	mr_list_target, @function
mr_list_target:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L576
	tst.b -2147483627.l
	jeq .L581
.L576:
	move.l (%sp)+,%d2
	move.l #pm_lipm_draw,%d0
	rts
.L581:
	mvz.b 269161676,%d1
	move.l 1187521622,%a0
	mov3q.l #7,%d2
	move.b 269161679,%d0
	cmp.l %d1,%d2
	jcs .L576
	mov3q.l #3,%d2
	and.l %d2,%d0
	mvz.w #6322,%d2
	add.l #585088,%a0
	muls.l %d2,%d0
	mov3q.l #1,%d2
	add.l %d0,%a0
	mvz.b 34(%a0,%d1.l),%d0
	cmp.l %d0,%d2
	jcs .L576
	move.l %d1,-(%sp)
	move.l %a0,-(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jne .L575
	move.l #ab_list_draw,%d0
	tst.l %d0
	jeq .L576
	move.l (%sp)+,%d2
	rts
.L575:
	subq.l #3,%d0
	tst.l %d0
	jne .L576
	move.l #st_list_draw,%d0
	tst.l %d0
	jeq .L576
	move.l (%sp)+,%d2
	rts
	.size	mr_list_target, .-mr_list_target
	.align	2
	.globl	mr_row_has_pool
	.type	mr_row_has_pool, @function
mr_row_has_pool:
	move.l 4(%sp),%d1
	mov3q.l #5,%d0
	cmp.l %d1,%d0
	jeq .L591
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L592
	mov3q.l #6,%d0
	cmp.l %d1,%d0
	jeq .L593
	mov3q.l #7,%a1
.L584:
	mov3q.l #3,%d0
	lea st_type,%a0
	tst.l %a0
	jeq .L587
	cmp.l %d1,%a1
	jeq .L583
	addq.l #1,%a1
.L587:
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L590
	cmp.l %d1,%a1
	jeq .L594
.L590:
	clr.l %d0
	rts
.L592:
	mov3q.l #6,%a1
	jra .L584
.L591:
	mov3q.l #1,%d0
.L583:
	moveq #-5,%d1
	and.l %d1,%d0
	tst.l %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
.L601:
	rts
.L594:
	mov3q.l #4,%d0
	moveq #-5,%d1
	and.l %d1,%d0
	tst.l %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L601
.L593:
	mov3q.l #2,%d0
	moveq #-5,%d1
	and.l %d1,%d0
	tst.l %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L601
	.size	mr_row_has_pool, .-mr_row_has_pool
	.align	2
	.globl	mr_mute_suppressed
	.type	mr_mute_suppressed, @function
mr_mute_suppressed:
	move.l #fresh_bind,%d0
	tst.l %d0
	jeq .L607
	mov3q.l #7,%d0
	cmp.l 4(%sp),%d0
	jcs .L607
	move.l -2147483428,%d0
	mov3q.l #1,%d1
	subq.l #1,%d0
	cmp.l %d0,%d1
	jcs .L607
	move.l -2147483640,%d1
	move.l 4(%sp),%d0
	addq.l #8,%d0
	btst %d0,%d1
	jeq .L614
.L606:
	move.l #KEYMASK,%d0
	tst.l %d0
	jeq .L608
	mvz.b KEYMASK,%d0
	move.l 4(%sp),%d1
	lsr.l %d1,%d0
	mov3q.l #1,%d1
	not.l %d0
	and.l %d1,%d0
.L602:
	rts
.L614:
	move.l %d1,%d0
	mvz.b %d0,%d0
	tst.b %d1
	jeq .L602
	move.l 4(%sp),%d1
	btst %d1,%d0
	jeq .L606
.L607:
	clr.l %d0
	rts
.L608:
	mov3q.l #1,%d0
	rts
	.size	mr_mute_suppressed, .-mr_mute_suppressed
	.align	2
	.globl	mr_choice_left
	.type	mr_choice_left, @function
mr_choice_left:
	lea (-12,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l 20(%sp),%a0
	cmp.l #133169151,%d0
	jhi .L615
	tst.b -2147483627.l
	jeq .L678
.L615:
	lea (12,%sp),%sp
	rts
.L678:
	move.l %a0,(%sp)
	move.l 16(%sp),4(%sp)
	jsr (mr_current_owner.part.0)
	move.l 4(%sp),%d1
	move.l %d0,8(%sp)
	move.l (%sp),%a0
	mov3q.l #2,%d0
	cmp.l 8(%sp),%d0
	jne .L617
	lea ab_engine_left,%a1
	tst.l %a1
	jeq .L618
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr (%a1)
	addq.l #8,%sp
.L618:
	move.l #ab_type,%d0
	tst.l %d0
	jeq .L615
	tst.l 1175351520
	jeq .L615
	tst.l 1175352218
	jne .L615
.L624:
	tst.l %d0
	jeq .L633
	mov3q.l #2,%d0
	cmp.l 8(%sp),%d0
	jeq .L634
	mov3q.l #7,%d0
.L628:
	move.l #st_type,%d1
	tst.l %d1
	jeq .L629
	mov3q.l #3,%d1
	cmp.l 8(%sp),%d1
	jeq .L625
	addq.l #1,%d0
.L629:
	move.l #fm_type,%d1
	tst.l %d1
	jeq .L675
	mov3q.l #4,%d1
	cmp.l 8(%sp),%d1
	jeq .L625
.L675:
	clr.l %d0
.L625:
	move.l %d0,20(%sp)
	move.l #1175352198,%d0
	move.l %d0,16(%sp)
	lea (12,%sp),%sp
	jmp 1074261424
.L633:
	mov3q.l #6,%d0
	jra .L628
.L634:
	mov3q.l #6,%d0
	move.l %d0,20(%sp)
	move.l #1175352198,%d0
	move.l %d0,16(%sp)
	lea (12,%sp),%sp
	jmp 1074261424
.L617:
	mov3q.l #3,%d0
	cmp.l 8(%sp),%d0
	jeq .L619
	tst.l 8(%sp)
	jeq .L615
	mov3q.l #1,%d1
	cmp.l 8(%sp),%d1
	jeq .L679
	move.l #fm_type,%d0
	tst.l %d0
	jeq .L615
	tst.l 1175351520
	jeq .L615
	tst.l 1175352218
	jne .L615
	mov3q.l #4,8(%sp)
	move.l #ab_type,%d0
	jra .L624
.L619:
	lea st_pool_choice_left,%a1
	tst.l %a1
	jeq .L622
	move.l %a0,-(%sp)
	move.l %d1,-(%sp)
	jsr (%a1)
	addq.l #8,%sp
.L622:
	move.l #st_type,%d0
	tst.l %d0
	jeq .L615
	tst.l 1175351520
	jeq .L615
	tst.l 1175352218
	jne .L615
	move.l #ab_type,%d0
	jra .L624
.L679:
	tst.l 1175351520
	jeq .L615
	tst.l 1175352218
	jne .L615
	mov3q.l #5,%d0
	move.l %d0,20(%sp)
	move.l #1175352198,%d0
	move.l %d0,16(%sp)
	lea (12,%sp),%sp
	jmp 1074261424
	.size	mr_choice_left, .-mr_choice_left
	.align	2
	.globl	mr_source_render_impl
	.type	mr_source_render_impl, @function
mr_source_render_impl:
	lea (-32,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	movem.l #1036,(%sp)
	move.l 36(%sp),%d1
	move.l 40(%sp),%a0
	move.l 44(%sp),%a1
	move.l 48(%sp),24(%sp)
	cmp.l #133169151,%d0
	jls .L681
.L684:
	move.l #sy_render,%d0
	tst.l %d0
	jne .L692
	move.l %a1,44(%sp)
	movem.l (%sp),#1036
	move.l 24(%sp),48(%sp)
	move.l %a0,40(%sp)
	move.l %d1,36(%sp)
	lea (32,%sp),%sp
	jmp 1073758216
.L681:
	move.l 1187521622,%d0
	mov3q.l #7,%d2
	move.b 269161679,%d3
	move.b %d3,31(%sp)
	cmp.l %d1,%d2
	jcs .L684
	mov3q.l #3,%d2
	and.l %d2,%d3
	mvz.w #6322,%d2
	add.l #585088,%d0
	muls.l %d2,%d3
	mov3q.l #1,%d2
	add.l %d3,%d0
	move.l %d0,%a2
	mvz.b 34(%a2,%d1.l),%d3
	cmp.l %d3,%d2
	jcs .L684
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	move.l %d1,28(%sp)
	move.l %a0,24(%sp)
	move.l %a1,20(%sp)
	jsr (owner.part.0)
	addq.l #8,%sp
	mov3q.l #2,%d3
	move.l 20(%sp),%d1
	move.l 16(%sp),%a0
	move.l 12(%sp),%a1
	cmp.l %d0,%d3
	jeq .L693
	moveq #-3,%d2
	and.l %d2,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L684
	movem.l (%sp),#1036
	move.l 24(%sp),48(%sp)
	move.l %a1,44(%sp)
	move.l %a0,40(%sp)
	move.l %d1,36(%sp)
	lea (32,%sp),%sp
	jmp 1073758216
.L692:
	movem.l (%sp),#1036
	move.l 24(%sp),48(%sp)
	move.l %a1,44(%sp)
	move.l %a0,40(%sp)
	move.l %d1,36(%sp)
	lea (32,%sp),%sp
	jra sy_render
.L693:
	move.l #ab_render,%d0
	tst.l %d0
	jeq .L684
	movem.l (%sp),#1036
	move.l 24(%sp),48(%sp)
	move.l %a1,44(%sp)
	move.l %a0,40(%sp)
	move.l %d1,36(%sp)
	lea (32,%sp),%sp
	jra ab_render
	.size	mr_source_render_impl, .-mr_source_render_impl
	.data
	.align	2
	.type	tables_ready, @object
	.size	tables_ready, 4
tables_ready:
	.zero	4
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"POLY8"
.LC1:
	.string	"ANALOG BD"
.LC2:
	.string	"VECTOR"
.LC3:
	.string	"FM SYNTH"
	.section	.rodata
	.align	2
	.type	labels, @object
	.size	labels, 16
labels:
	.long	.LC0
	.long	.LC1
	.long	.LC2
	.long	.LC3
	.weak	ab_render
	.weak	sy_render
	.weak	st_pool_choice_left
	.weak	ab_engine_left
	.weak	KEYMASK
	.weak	fresh_bind
	.weak	st_list_draw
	.weak	ab_list_draw
	.weak	st_pool_left
	.weak	ab_engine_open
	.weak	st_pool_choice_open
	.weak	vector_validate_part
	.weak	fm_ui_tick
	.weak	ab_ui_tick
	.weak	st_ui_tick
	.weak	fm_defaults
	.weak	fm_admit_track
	.weak	ab_defaults
	.weak	ab_admit_track
	.weak	st_assign
	.weak	st_chooser_type
	.weak	fm_track_page
	.weak	ab_track_page
	.weak	fm_type
	.weak	st_type
	.weak	ab_type

#APP
/* Original POLY integration; registration seams adapted from octabam's */
/* MIT Analog BD machine.s (Sam Banks / repeat98). Replayed stock instructions */
/* are generated only in the private local build by prepare.py. */
        .text
        .global mr_machine_name, mr_src_names, mr_main_commit
        .global mr_src_commit, mr_src_commit2, mr_name_a, mr_name_b
        .global mr_setup_open, mr_chooser_open, mr_setup_row, mr_chooser_row, mr_chooser_name
        .global mr_setup_edit6, mr_setup_draw6, mr_tick_hook
        .equ BANK_PTR, 0x46c82456
        .equ PART_OFF, 0x8ed80
mr_machine_name:
        lea -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l 16(%sp),-(%sp)
        jsr mr_name
        addq.l #4,%sp
        movem.l (%sp),%d1/%a0-%a1
        lea 12(%sp),%sp
        rts
mr_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mr_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
mr_main_commit:
        lea -32(%sp),%sp
        movem.l %d0-%d2/%a0-%a1,12(%sp)
        move.l %a1,%d2
        add.l %d0,%d2
        addi.l #PART_OFF,%d2
        move.l %d2,(%sp)
        move.l %d1,4(%sp)
        move.l %d4,8(%sp)
        jsr mr_assign
        tst.l %d0
        bmi.s .main_refuse
        move.l %d0,%d4
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp pm_main_replay
.main_refuse:
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp 0x4007989c
mr_src_commit:
        pea 0x4005a61c
        bra.s mr_src_common
mr_src_commit2:
        pea 0x4005a856
mr_src_common:
        move.l 0x460d5c30,%d1
        lea -32(%sp),%sp
        movem.l %d0/%d2-%d3/%a0-%a1,12(%sp)
        move.l %a1,%d3
        add.l %d0,%d3
        addi.l #PART_OFF,%d3
        move.l %d3,(%sp)
        move.l %d2,4(%sp)
        move.l %d1,8(%sp)
        move.l %d1,%d3
        jsr mr_assign
        tst.l %d0
        bmi.s .src_refuse
        move.l %d0,%d1
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        rts
.src_refuse:
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        mvz.b (%a0),%d1
        move.l %d1,0x460d5c30
        rts
mr_setup_open:
        move.b (%a0),%d3
        move.l %d0,-(%sp)
        mvs.b %d3,%d0
        bsr mr_row_type
        move.l %d0,%d3
        move.l (%sp)+,%d0
        mvs.b %d3,%d4
        pea 0x400bb704
        jmp 0x400585e6
mr_chooser_open:
        mvs.b (%a0),%d0
        bsr mr_chooser_row_type
        move.l %d0,-(%sp)
        pea 0x460e7386
        jmp 0x40078890
mr_name_a:
        bsr mr_name_pick
        jmp 0x4003d722
mr_name_b:
        bsr mr_name_pick
        jmp 0x4004c374
mr_name_pick:
        bsr mr_row_type
        lea mr_src_names(%pc),%a0
        move.l (%a0,%d0.l*4),%d1
        rts
mr_setup_row:
        mvs.b (%a0),%d0
        lea 24(%sp),%sp
        bsr mr_row_type
        jmp 0x4003c986
| The machine chooser (double-tap TRACK) draws six rows from the top of the
| screen, d2 the row on screen. Past six rows (POLY8 beside VECTOR, FM Synth
| or Analog BD) its list (0x460e7386, top row first) scrolls but the rows did
| not: names and the track's mark read the list's row, top + d2, as the USB
| base's mw_chooser_name/mw_chooser_row do. The highlight is by screen row.
mr_chooser_name:
        move.l 4(%sp),%d0
        add.l 0x460e7386,%d0
        move.l %d0,-(%sp)
        jsr mr_machine_name
        addq.l #4,%sp
        rts
mr_chooser_row:
        mvs.b (%a0),%d0
        bsr mr_chooser_row_type
        move.l %d2,%d1                  | d1 is free: both paths load it again
        add.l 0x460e7386,%d1
        cmp.l %d0,%d1
        bne.s 1f
        jmp 0x400786ce
1:      jmp 0x400786fc
mr_chooser_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mr_chooser_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
/* SRC SETUP on row five edits the real underlying pool's settings. */
mr_pool_kind:
        move.l %a0,-(%sp)
        move.l %d1,-(%sp)
        movea.l BANK_PTR,%a0
        mvz.b 0x100b14cf,%d1
        mulu.w #6322,%d1
        adda.l %d1,%a0
        mvz.b 0x100b14cc,%d1
        adda.l #0x8eda2,%a0
        mvz.b (%a0,%d1.l),%d0
        move.l (%sp)+,%d1
        move.l (%sp)+,%a0
        rts
mr_setup_edit6:
        cmpi.l #5,%d2
        bcs.s 1f
        move.l %a3,%d0
        cmpi.l #4,%d0
        bne.s 2f
        jmp 0x4003a624
2:      bsr mr_pool_kind
        move.l %d0,%d2
1:      jmp pm_edit_replay
mr_setup_draw6:
        cmpi.l #5,%d6
        bcs.s 1f
        move.l %d0,-(%sp)
        bsr mr_pool_kind
        move.l %d0,%d6
        move.l (%sp)+,%d0
1:      jmp pm_draw_replay
mr_tick_hook:
        jsr 0x4005213c
        jsr 0x4007e940
        jsr mr_ui_tick
        jmp 0x40052228

        .global mr_resolve_pb, mr_validate_hook, mr_stock_validate
mr_resolve_pb:
        move.l %a0,-(%sp)
        jsr mr_page
        addq.l #4,%sp
        tst.l %d0
        bne.s 1f
        mvs.b %d5,%d0
        lea mr_pb_table,%a0
        jmp 0x40031ece
1:      jmp 0x40031ed6
mr_validate_hook:
        jmp mr_validate
mr_stock_validate:
        lea -96(%sp),%sp
        movem.l %d2-%d7/%a2-%fp,(%sp)
        jmp 0x40002320

        .global mr_pool_open, mr_pool_title, mr_list_draw
mr_pool_open:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr mr_open_pool
        tst.l %d0
        beq.s 1f
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        rts
1:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp pm_stock_pool_open
mr_pool_title:
        moveq #1,%d6
        cmpi.l #5,%d0
        bcs.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l %d0,(%sp)
        jsr mr_row_has_pool
        tst.l %d0
        beq.s 2f
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        jmp 0x40077b62
2:      movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        jmp 0x40077b70
1:      cmp.l %d0,%d6
        bcs.s 3f
        jmp 0x40077b62
3:      jmp 0x40077b70
mr_list_draw:
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        jsr mr_list_target
        move.l %d0,(%sp)
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        move.l (%sp),16(%sp)
        lea 16(%sp),%sp
        rts

| Dispatch the overlapping audio/key sites without altering the entry ABI.
| Every absent weak target resolves to zero; the POLY path replays stock.
        .weak rate_hook, qz_octkey, qz_octnum, po_mon, po_moff
        .global mr_rate_hook, mr_octkey, mr_octnum, mr_note_on, mr_note_off
        .macro MR_NEXT target, fallback
        move.l #\target,-(%sp)
        tst.l (%sp)
        beq.s 9f
        rts
9:      addq.l #4,%sp
        jmp \fallback
        .endm
        .macro MR_TRACK input,poly_target
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        \input
        jsr poly_is_track
        tst.l %d0
        beq.s 8f
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp \poly_target
8:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        .endm
mr_rate_hook:
        MR_TRACK "move.l 68(%sp),%d0",poly_increment_shift
        MR_NEXT rate_hook,poly_increment_shift
mr_octkey:
        tst.l 0x80000012
        bne.s .mr_octkey_midi
        MR_TRACK "mvz.b 0x100b14cc,%d0",poly_octave_button
.mr_octkey_midi:
        MR_NEXT qz_octkey,poly_octave_button
mr_octnum:
        tst.l 0x80000012
        bne.s .mr_octnum_midi
        MR_TRACK "mvz.b 0x100b14cc,%d0",poly_oct_number
        move.l 0x460d16fc,%d0
.mr_octnum_midi:
        MR_NEXT qz_octnum,poly_oct_number
mr_note_on:
        MR_TRACK "move.l %d2,%d0",poly_midi_note_on
        MR_NEXT po_mon,poly_midi_note_on
mr_note_off:
        MR_TRACK "move.l %d2,%d0",poly_midi_note_off
        MR_NEXT po_moff,poly_midi_note_off

        .global mr_stop_voice
mr_stop_voice:
        tst.l poly_voice_selector
        bne.s 1f
        tst.l poly_rendering
        bne.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l 24(%sp),(%sp)
        jsr mr_mute_suppressed
        tst.l %d0
        beq.s 2f
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
2:      movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
1:      jmp poly_stop_voice

| Authored bounded name table in the existing validated chooser section.
        .text
        .balign 4
mr_src_names:
        .long 0x400b3eac,0x400b3e98,0x400b7c67,0x400b5413,0x400b7a63
        .long 0,0,0,0

| Preserve FM's complete published pointer ABI. Its bundled quantizer uses
| the legato/key helpers and HOLD table as well as the playback descriptor.
| Explicit composition exports expose existing local labels without changing
| the upstream engine's bytes. Absent FM helpers resolve to zero.
        .text
        .balign 4
        .weak po_octave,po_legkey,po_legmode,po_keyrel,po_knob,po_keyrec,po_hold128,po_pgdesc
        .long po_octave,po_legkey,po_legmode,po_keyrel,po_knob,po_keyrec,po_hold128,po_pgdesc
        .global mr_source_render
mr_source_render:
        jmp mr_source_render_impl

| Nine authored placeholders; the native stock table supplies rows 0..4 at
| runtime, and each selected machine supplies its own descriptor.
        .text
        .balign 4
        .global mr_pb_table
mr_pb_table:
        .space 36
