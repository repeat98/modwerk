#NO_APP
	.file	"akl.c"
	.text
	.align	2
	.type	track_trigs, @function
track_trigs:
	move.l %d2,-(%sp)
	move.b 1175456536,%d0
	mvz.b 1175456537,%d1
	lsl.l #8,%d1
	mvz.b %d0,%d0
	or.l %d0,%d1
	jne .L2
	mov3q.l #-1,order_note
	mov3q.l #-1,order_step
	clr.l show_shift
.L3:
	move.l (%sp)+,%d2
	move.l %d1,order_prev
	rts
.L2:
	move.l order_step,%d0
	tst.l %d0
	jlt .L7
	btst %d0,%d1
	jne .L3
.L7:
	move.l order_prev,%d2
	not.l %d2
	and.l %d1,%d2
	tst.l %d2
	jeq .L18
	clr.l %d0
	btst #0,%d2
	jne .L8
.L9:
	addq.l #1,%d0
	btst %d0,%d2
	jeq .L9
.L8:
	move.l (%sp)+,%d2
	move.l %d0,order_step
	mov3q.l #-1,order_note
	clr.l show_shift
	move.l %d1,order_prev
	rts
.L18:
	move.l %d1,%d2
	clr.l %d0
	btst #0,%d2
	jeq .L9
	jra .L8
	.size	track_trigs, .-track_trigs
	.align	2
	.type	shift_now, @function
shift_now:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
	lea shift_now_r,%a0
	move.b (%a0,%d1.l),%d0
	mvz.b %d0,%d2
	move.l %d2,%a1
	cmp.l #255,%d2
	jeq .L29
	moveq #15,%d2
	and.l %d2,%d0
	subq.l #7,%d0
	tst.l %d0
	jeq .L29
	move.l %d1,%d0
	lsl.l #5,%d0
	move.l %d0,%a0
	add.l #1187475438,%a0
	tst.b (%a0)
	jeq .L29
	moveq #10,%d0
	moveq #68,%d2
	muls.l %d1,%d0
	muls.l %d2,%d1
	add.l #1187478295,%d0
	move.l %d0,%a2
	move.l %d1,%a0
	move.b (%a2),%d0
	add.l #1187474926,%a0
	mvz.b (%a0),%d1
	addq.l #1,%d1
	mvz.b %d0,%d0
	remu.l %d1,%d2:%d0
	move.l %a1,%d0
	lsr.l #4,%d0
	cmp.l %d2,%d0
	jeq .L19
.L29:
	move.w #255,%a1
.L19:
	move.l (%sp)+,%d2
	move.l %a1,%d0
	move.l (%sp)+,%a2
	rts
	.size	shift_now, .-shift_now
	.align	2
	.type	shift_at, @function
shift_at:
	subq.l #8,%sp
	move.l %d2,-(%sp)
	move.b 269161676,%d0
	move.b 269161680,%d2
	move.l order_step,%d1
	move.w %d0,%a0
	move.b %d2,7(%sp)
	move.l 1187521622,%d0
	tst.l %d1
	jlt .L35
	move.w %a0,%d2
	mvz.b %d2,%d2
	move.l %d2,%a1
	mov3q.l #7,%d2
	cmp.l %a1,%d2
	jcs .L35
	mvz.b 7(%sp),%d2
	move.l %d2,%a1
	moveq #15,%d2
	cmp.l %a1,%d2
	jcs .L35
	move.l %d0,%a1
	add.l #-1074668000,%a1
	cmp.l #9535680,%a1
	jhi .L35
	move.l 1175264772,%d2
	add.l #18719,%d0
	move.l %d2,8(%sp)
	move.b 7(%sp),%d2
	ext.w %d2
	move.w %d2,%a1
	move.w %a0,%d2
	ext.w %d2
	move.w %d2,%a0
	move.l 8(%sp),%d2
	lsl.l #4,%d2
	move.l %d2,8(%sp)
	move.w %a1,%d2
	add.l 8(%sp),%d1
	mulu.w #36568,%d2
	move.l %d2,%a1
	add.l %a1,%d0
	move.w %a0,%d2
	mulu.w #2224,%d2
	add.l %d2,%d0
	moveq #63,%d2
	and.l %d2,%d1
	move.l (%sp)+,%d2
	lsl.l #5,%d1
	add.l %d1,%d0
	addq.l #8,%sp
	rts
.L35:
	move.l (%sp)+,%d2
	clr.l %d0
	addq.l #8,%sp
	rts
	.size	shift_at, .-shift_at
	.align	2
	.type	after_edit.constprop.0, @function
after_edit.constprop.0:
	move.b gen,%d0
	mvz.b %d0,%d1
	cmp.l #255,%d1
	jeq .L40
	addq.l #1,%d0
	move.b %d0,gen
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	jsr 1074240840
	move.l 4(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
	rts
.L40:
	moveq #1,%d0
	move.b %d0,gen
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	jsr 1074240840
	move.l 4(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
	rts
	.size	after_edit.constprop.0, .-after_edit.constprop.0
	.align	2
	.type	pick_note, @function
pick_note:
	subq.l #8,%sp
	move.l %d2,-(%sp)
	move.b 269161676,%d0
	move.l order_note,%a0
	move.b %d0,4(%sp)
	move.l order_step,%d0
	move.b 269161680,%d1
	move.b %d1,7(%sp)
	move.l 1187521622,%d1
	tst.l %d0
	jlt .L45
	mvz.b 4(%sp),%d2
	move.l %d2,%a1
	mov3q.l #7,%d2
	cmp.l %a1,%d2
	jcs .L45
	mvz.b 7(%sp),%d2
	move.l %d2,%a1
	moveq #15,%d2
	cmp.l %a1,%d2
	jcs .L46
	cmp.l #1074667999,%d1
	jls .L47
	cmp.l #1084203680,%d1
	jhi .L45
	move.l 1175264772,%d2
	move.l %d2,8(%sp)
	mov3q.l #-1,%d2
	cmp.l %a0,%d2
	jeq .L70
.L43:
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L45:
	mov3q.l #-1,%d0
	cmp.l %a0,%d0
	jne .L43
.L50:
	clr.l %d0
	move.l %d0,order_note
.L71:
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L70:
	move.l 8(%sp),%d2
	move.l %d1,%a0
	lea (18719,%a0),%a0
	lsl.l #4,%d2
	move.l %d2,8(%sp)
	move.b 7(%sp),%d2
	add.l 8(%sp),%d0
	ext.w %d2
	move.w %d2,%a1
	move.b 4(%sp),%d2
	move.w %a1,%d1
	ext.w %d2
	mulu.w #36568,%d1
	move.l %d1,%a1
	add.l %a1,%a0
	move.w %d2,%d1
	moveq #63,%d2
	and.l %d2,%d0
	mulu.w #2224,%d1
	lsl.l #5,%d0
	add.l %d1,%a0
	add.l %d0,%a0
	mvz.b (%a0),%d0
	cmp.l #255,%d0
	jeq .L50
	mvz.b (%a0),%d0
	lsr.l #4,%d0
	move.l %d0,order_note
	jra .L71
.L46:
	mov3q.l #-1,%d2
	cmp.l %a0,%d2
	jeq .L50
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L47:
	mov3q.l #-1,%d1
	cmp.l %a0,%d1
	jeq .L50
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
	.size	pick_note, .-pick_note
	.align	2
	.globl	akl_snap
	.type	akl_snap, @function
akl_snap:
	subq.l #4,%sp
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	moveq #83,%d2
	move.l 20(%sp),%d1
	subq.l #1,%d1
	move.l 16(%sp),%d0
	cmp.l %d1,%d2
	jcs .L72
	tst.l %d0
	jlt .L72
	mov3q.l #7,%d3
	remu.l %d3,%d2:%d1
	divu.l %d3,%d1
	move.l %d0,%a0
	moveq #12,%d3
	lea (12,%a0),%a0
	lea modes,%a1
	sub.l %d1,%a0
	move.l %d2,8(%sp)
	move.l %a0,%d1
	remu.l %d3,%d2:%d1
	move.l 8(%sp),%d3
	mvz.w (%a1,%d3.l*2),%d1
	btst %d2,%d1
	jne .L72
	subq.l #1,%d0
.L72:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	addq.l #4,%sp
	rts
	.size	akl_snap, .-akl_snap
	.align	2
	.globl	akl_key
	.type	akl_key, @function
akl_key:
	lea (-44,%sp),%sp
	mov3q.l #7,%d0
	movem.l #3132,(%sp)
	move.l 48(%sp),%d2
	cmp.l %d2,%d0
	jcs .L79
	move.b -2147457603,%d1
	move.b -2147457602,%d0
	move.l %d2,%a0
	add.l #-2147457816,%a0
	move.b (%a0),%d4
	moveq #15,%d5
	move.l %d1,%d3
	or.l %d0,%d3
	mvz.b %d3,%d3
	cmp.l %d3,%d5
	jcs .L79
	mvz.b %d4,%d4
	mvz.b %d1,%d1
	mvz.b gen,%d3
	moveq #24,%d5
	move.l %d4,24(%sp)
	move.l %d1,%d4
	lsl.l %d5,%d3
	swap %d4
	clr.w %d4
	mvz.b %d0,%d0
	move.l #635712,%d5
	muls.l %d5,%d1
	lea cache_for,%a2
	move.l %d3,%a1
	move.l %d0,%d3
	move.l %a1,%d5
	lsl.l #8,%d3
	or.l %d5,%d4
	mulu.w #36568,%d0
	add.l %d0,%d1
	move.l %d1,%a0
	add.l #1074704437,%a0
	or.l %d4,%d3
	move.l %d1,28(%sp)
	move.l %a0,36(%sp)
	or.l 24(%sp),%d3
	move.l %d3,%a1
	cmp.l (%a2,%d2.l*4),%d3
	jne .L82
	lea cache_key,%a0
	mvz.b (%a0,%d2.l),%d4
	lea shift_track,%a0
	move.l (%a0,%d2.l*4),%a0
	move.l 36(%sp),%a2
	move.l %a0,32(%sp)
	tst.b (%a2)
	jeq .L91
.L111:
	move.l 32(%sp),%a3
	move.b 40(%a3),%d0
	mvz.b %d0,%d1
	tst.b %d0
	jeq .L99
.L112:
	move.l %d1,%d3
	moveq #64,%d0
	cmp.l %d1,%d0
	jcs .L109
	move.l 24(%sp),%d0
	remu.l %d3,%d1:%d0
	move.l %d1,%d0
	addq.l #1,%d0
	remu.l %d3,%d5:%d0
	mov3q.l #7,%d0
	move.l %d5,%d3
	lsr.l #3,%d5
	and.l %d0,%d3
	move.l %d5,24(%sp)
.L93:
	lea shift_step,%a1
	mvz.b (%a1,%d2.l),%d0
	move.l 32(%sp),%a0
	addq.l #7,%a0
	cmp.l %d0,%d1
	jeq .L95
	move.l %d1,%d0
	lsr.l #3,%d0
	move.b %d1,(%a1,%d2.l)
	move.l %a0,%a1
	sub.l %d0,%a1
	mov3q.l #7,%d0
	and.l %d1,%d0
	mvz.b (%a1),%d5
	btst %d0,%d5
	jne .L110
.L95:
	sub.l 24(%sp),%a0
	mvz.b (%a0),%d0
	btst %d3,%d0
	jne .L78
	move.l %d2,%d0
	lsl.l #5,%d0
	move.l %d0,%a0
	add.l #1187487775,%a0
	move.b (%a0),%d0
	mvz.b %d0,%d1
	cmp.l #255,%d1
	jeq .L78
	lea shift_now_r,%a0
	move.b %d0,(%a0,%d2.l)
.L78:
	move.l %d4,%d0
	movem.l (%sp),#3132
	lea (44,%sp),%sp
	rts
.L82:
	mvz.w #2224,%d0
	move.l 28(%sp),%d3
	add.l #1074668000,%d3
	move.l 36(%sp),%a0
	muls.l %d2,%d0
	add.l %d0,%d3
	move.l %d3,%a3
	lea (18640,%a3),%a3
	move.l %a3,32(%sp)
	tst.b (%a0)
	jeq .L84
	move.l %d3,%a2
	move.b 18680(%a2),%d1
	mvz.b %d1,%d0
	tst.b %d1
	jeq .L97
.L113:
	move.l %d0,%d1
	moveq #64,%d0
	cmp.l %d1,%d0
	jcc .L87
	moveq #64,%d1
.L87:
	move.l 24(%sp),%d4
	add.l #18718,%d3
	move.l %d3,%a0
	remu.l %d1,%d0:%d4
	move.l %d1,%d4
	subq.l #1,%d4
	mvz.w %d4,%d4
	lsl.l #5,%d0
	lsl.l #5,%d4
	add.l %d0,%a0
	add.l %d3,%d4
	move.l %d4,40(%sp)
.L90:
	move.b (%a0),%d0
	moveq #84,%d5
	mvz.b %d0,%d4
	cmp.l %d4,%d5
	jcc .L88
	cmp.l %d3,%a0
	jeq .L98
	lea (-32,%a0),%a0
	subq.l #1,%d1
	tst.l %d1
	jne .L90
.L114:
	st %d0
	mvz.w #255,%d4
.L88:
	lea cache_key,%a0
	move.b %d0,(%a0,%d2.l)
	lea cache_for,%a0
	move.l %a1,(%a0,%d2.l*4)
	move.l 32(%sp),%a1
	lea shift_track,%a0
	move.l 36(%sp),%a2
	move.l %a1,(%a0,%d2.l*4)
	tst.b (%a2)
	jne .L111
.L91:
	move.l 28(%sp),%a0
	add.l #1074704435,%a0
	move.b (%a0),%d0
	mvz.b %d0,%d1
	tst.b %d0
	jne .L112
.L99:
	clr.l %d3
	clr.l 24(%sp)
	jra .L93
.L79:
	mvz.w #255,%d4
	move.l %d4,%d0
	movem.l (%sp),#3132
	lea (44,%sp),%sp
	rts
.L110:
	lsl.l #5,%d1
	move.l 32(%sp),%a2
	lea shift_now_r,%a1
	lea 79(%a2,%d1.l),%a3
	move.b (%a3),(%a1,%d2.l)
	jra .L95
.L109:
	move.l 24(%sp),%d0
	moveq #64,%d3
	remu.l %d3,%d1:%d0
	move.l %d1,%d0
	addq.l #1,%d0
	remu.l %d3,%d5:%d0
	mov3q.l #7,%d0
	move.l %d5,%d3
	lsr.l #3,%d5
	and.l %d0,%d3
	move.l %d5,24(%sp)
	jra .L93
.L84:
	move.l 28(%sp),%a0
	add.l #1074704435,%a0
	move.b (%a0),%d1
	mvz.b %d1,%d0
	tst.b %d1
	jne .L113
.L97:
	add.l #18718,%d3
	clr.l %d4
	add.l %d3,%d4
	move.l %d3,%a0
	mov3q.l #1,%d1
	add.l %d0,%a0
	move.l %d4,40(%sp)
	jra .L90
.L98:
	move.l 40(%sp),%a0
	subq.l #1,%d1
	tst.l %d1
	jne .L90
	jra .L114
	.size	akl_key, .-akl_key
	.align	2
	.globl	akl_move
	.type	akl_move, @function
akl_move:
	lea (-24,%sp),%sp
	moveq #83,%d1
	movem.l #252,(%sp)
	move.l 32(%sp),%d4
	subq.l #1,%d4
	move.l 28(%sp),%d0
	move.l 36(%sp),%d5
	cmp.l %d4,%d1
	jcs .L117
	tst.l %d0
	jlt .L117
	move.l %d4,%d2
	mov3q.l #7,%d6
	remu.l %d6,%d3:%d2
	divu.l %d6,%d2
	move.l %d0,%d1
	add.l #12,%d1
	moveq #12,%d7
	lea modes,%a0
	sub.l %d2,%d1
	remu.l %d7,%d2:%d1
	mvz.w (%a0,%d3.l*2),%d1
	btst %d2,%d1
	jeq .L157
.L117:
	tst.l %d5
	jle .L154
	move.l %d4,%d1
	mov3q.l #7,%d2
	remu.l %d2,%d6:%d1
	divu.l %d2,%d1
	move.w #12,%a0
	lea modes,%a1
	sub.l %d1,%a0
.L126:
	moveq #126,%d7
	cmp.l %d0,%d7
	jlt .L115
	addq.l #1,%d0
	moveq #83,%d1
	cmp.l %d4,%d1
	jcs .L118
.L121:
	tst.l %d0
	jlt .L158
	move.l %d0,%d1
	moveq #12,%d7
	add.l %a0,%d1
	remu.l %d7,%d2:%d1
	mvz.w (%a1,%d6.l*2),%d3
	btst %d2,%d3
	jne .L118
.L159:
	moveq #127,%d1
	cmp.l %d0,%d1
	jeq .L118
	addq.l #1,%d0
	move.l %d0,%d1
	moveq #12,%d7
	add.l %a0,%d1
	remu.l %d7,%d2:%d1
	btst %d2,%d3
	jeq .L159
.L118:
	subq.l #1,%d5
	tst.l %d5
	jne .L126
.L115:
	movem.l (%sp),#252
	lea (24,%sp),%sp
	rts
.L158:
	subq.l #1,%d5
	tst.l %d5
	jeq .L115
	addq.l #1,%d0
	jra .L121
.L154:
	tst.l %d5
	jeq .L115
	move.l %d0,%a1
	subq.l #1,%a1
	tst.l %d0
	jle .L115
	moveq #83,%d1
	cmp.l %d4,%d1
	jcc .L160
	addq.l #1,%d5
	move.l %a1,%d0
	jra .L154
.L160:
	move.l %d4,%d2
	mov3q.l #7,%d6
	remu.l %d6,%d3:%d2
	divu.l %d6,%d2
	lea modes,%a0
	move.l %d0,%d1
	mvz.w (%a0,%d3.l*2),%d4
	moveq #12,%d3
	sub.l %d2,%d3
.L131:
	move.l %a1,%d0
	moveq #12,%d7
	add.l %d3,%d0
	remu.l %d7,%d6:%d0
	move.l %d4,%d2
	mov3q.l #1,%d0
	asr.l %d6,%d2
	and.l %d2,%d0
	btst #0,%d2
	jeq .L132
.L161:
	addq.l #1,%d5
	tst.l %d5
	jeq .L133
	tst.l %a1
	jeq .L133
	move.l %a1,%d1
	subq.l #1,%a1
	move.l %a1,%d0
	moveq #12,%d7
	add.l %d3,%d0
	remu.l %d7,%d6:%d0
	move.l %d4,%d2
	mov3q.l #1,%d0
	asr.l %d6,%d2
	and.l %d2,%d0
	btst #0,%d2
	jne .L161
.L132:
	move.l %d1,%a0
	subq.l #2,%a0
.L136:
	move.l %d3,%d1
	mov3q.l #-1,%d7
	add.l %a0,%d1
	lea (-1,%a0),%a1
	cmp.l %a0,%d7
	jeq .L115
	moveq #12,%d6
	remu.l %d6,%d2:%d1
	btst %d2,%d4
	jeq .L141
	move.l %a0,%d1
	addq.l #1,%d5
	tst.l %d5
	jeq .L138
	tst.l %a0
	jne .L131
.L138:
	movem.l (%sp),#252
	move.l %a0,%d0
	lea (24,%sp),%sp
	rts
.L141:
	move.l %a1,%a0
	jra .L136
.L157:
	subq.l #1,%d0
	jra .L117
.L133:
	movem.l (%sp),#252
	move.l %a1,%d0
	lea (24,%sp),%sp
	rts
	.size	akl_move, .-akl_move
	.align	2
	.globl	akl_note
	.type	akl_note, @function
akl_note:
	lea (-16,%sp),%sp
	movem.l #1052,(%sp)
	move.l 20(%sp),-(%sp)
	jsr akl_key
	move.l 24(%sp),-(%sp)
	move.l %d0,%a2
	jsr shift_now
	addq.l #8,%sp
	cmp.l #255,%a2
	jeq .L180
	move.l 24(%sp),%a1
	tst.b (%a1)
	jlt .L168
	cmp.l #255,%d0
	jeq .L181
	moveq #15,%d4
	and.l %d4,%d0
	move.l %d0,%a0
	pea -7(%a0)
	move.l %a2,-(%sp)
	move.l 32(%sp),%a0
	mvs.b (%a0),%d0
	move.l %d0,-(%sp)
	jsr akl_move
	lea (12,%sp),%sp
.L172:
	move.l 24(%sp),%a1
	move.b %d0,(%a1)
.L168:
	movem.l (%sp),#1052
	mov3q.l #1,%d0
	lea (16,%sp),%sp
	rts
.L180:
	cmp.l %d0,%a2
	jeq .L173
	move.l 20(%sp),%d1
	moveq #68,%d2
	moveq #23,%d3
	muls.l %d2,%d1
	move.l %d1,%a0
	add.l #1187474929,%a0
	mvz.b (%a0),%d1
	subq.l #1,%d1
	cmp.l %d1,%d3
	jcs .L165
	mov3q.l #1,%d4
	and.l %d1,%d4
	move.l %d4,%a0
	btst #0,%d1
	jeq .L166
	mov3q.l #5,%a0
.L166:
	move.l 24(%sp),%a1
	tst.b (%a1)
	jlt .L168
	lsr.l #1,%d1
	moveq #15,%d4
	and.l %d4,%d0
	mulu.w #7,%d1
	lea 1(%a0,%d1.l),%a2
	move.l %d0,%a0
	pea -7(%a0)
	move.l %a2,-(%sp)
	move.l 32(%sp),%a0
	mvs.b (%a0),%d0
	move.l %d0,-(%sp)
	jsr akl_move
	lea (12,%sp),%sp
	jra .L172
.L181:
	move.b (%a1),%d0
	subq.l #1,%a2
	moveq #83,%d1
	cmp.l %a2,%d1
	jcs .L172
	mvs.b %d0,%d1
	tst.b %d0
	jmi .L172
	mov3q.l #7,%d3
	move.l %a2,%d2
	add.l #12,%d1
	remu.l %d3,%d4:%d2
	divu.l %d3,%d2
	lea modes,%a1
	sub.l %d2,%d1
	moveq #12,%d2
	remu.l %d2,%d3:%d1
	mvz.w (%a1,%d4.l*2),%d1
	btst %d3,%d1
	jne .L172
	move.l 24(%sp),%a1
	subq.l #1,%d0
	move.b %d0,(%a1)
	jra .L168
.L165:
	move.l 24(%sp),%a0
	tst.b (%a0)
	jlt .L168
	moveq #15,%d4
	sub.l %a2,%a2
	and.l %d4,%d0
	move.l %d0,%a0
	pea -7(%a0)
	move.l %a2,-(%sp)
	move.l 32(%sp),%a0
	mvs.b (%a0),%d0
	move.l %d0,-(%sp)
	jsr akl_move
	lea (12,%sp),%sp
	jra .L172
.L173:
	movem.l (%sp),#1052
	clr.l %d0
	lea (16,%sp),%sp
	rts
	.size	akl_note, .-akl_note
	.align	2
	.globl	akl_claims
	.type	akl_claims, @function
akl_claims:
	move.l 4(%sp),-(%sp)
	jsr akl_key
	addq.l #4,%sp
	cmp.l #255,%d0
	jeq .L187
	mov3q.l #1,%d0
	rts
.L187:
	move.l 4(%sp),-(%sp)
	jsr shift_now
	addq.l #4,%sp
	cmp.l #255,%d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	akl_claims, .-akl_claims
	.align	2
	.globl	akl_knob
	.type	akl_knob, @function
akl_knob:
	lea (-36,%sp),%sp
	movem.l #3084,(%sp)
	move.b 1175456536,%d0
	mvz.b 1175456537,%d1
	move.b 269161676,%d2
	move.b 269161680,%d3
	move.l 1187521622,%a1
	lsl.l #8,%d1
	move.l %a1,20(%sp)
	mvz.b %d0,%d0
	move.w %d2,%a0
	move.w %d3,%a2
	or.l %d0,%d1
	move.l %d1,%a1
	tst.l %d1
	jeq .L188
	mvz.b %d2,%d0
	mov3q.l #7,%d1
	cmp.l %d0,%d1
	jcs .L188
	mvz.b %d3,%d0
	moveq #15,%d2
	cmp.l %d0,%d2
	jcs .L188
	move.l 20(%sp),%d0
	add.l #-1074668000,%d0
	cmp.l #9535680,%d0
	jhi .L188
	move.w %a0,%d0
	move.w %a2,%d1
	move.b 269161679,%d3
	move.l 20(%sp),%a0
	add.l #586355,%a0
	ext.w %d0
	ext.w %d1
	move.w %d0,%d2
	mulu.w #36568,%d1
	mulu.w #2224,%d0
	mulu.w #36,%d2
	move.l %d2,24(%sp)
	add.l 24(%sp),%a0
	mov3q.l #3,%d2
	and.l %d2,%d3
	move.l %a0,16(%sp)
	move.l 20(%sp),%a0
	move.l 16(%sp),%a3
	lea (18640,%a0),%a0
	add.l %d1,%a0
	add.l %d0,%a0
	add.l %d0,%d1
	mvz.w #6322,%d0
	muls.l %d0,%d3
	mvz.b (%a3,%d3.l),%d0
	move.l %d0,%d2
	subq.l #1,%d2
	move.l %d2,28(%sp)
	btst #0,%d0
	jne .L190
	move.l 28(%sp),%d0
	lsr.l #1,%d0
	lea (78,%a0),%a0
	mov3q.l #5,%a2
	move.l %a0,16(%sp)
	move.l %d1,%a3
	add.l #268544620,%a3
	mulu.w #7,%d0
	move.l %a3,24(%sp)
	clr.l %d1
	lea 1(%a2,%d0.l),%a0
	add.l 40(%sp),%a0
	move.l %a0,32(%sp)
.L197:
	move.l %a1,%d0
	btst %d1,%d0
	jeq .L192
	move.l 1175264772,%d0
	moveq #63,%d2
	move.l 16(%sp),%a2
	lsl.l #4,%d0
	add.l %d1,%d0
	and.l %d2,%d0
	moveq #84,%d2
	lsl.l #5,%d0
	add.l %d0,%a2
	mvz.b (%a2),%d3
	move.l %d3,%a0
	cmp.l %d3,%d2
	jcc .L193
	moveq #23,%d3
	cmp.l 28(%sp),%d3
	jcs .L199
	move.l 32(%sp),%a0
.L194:
	tst.l %a0
	jlt .L200
.L211:
	moveq #84,%d2
	cmp.l %a0,%d2
	jge .L195
	move.w #84,%a0
.L195:
	move.w %a0,%d3
	move.b %d3,(%a2)
	move.l 24(%sp),%a2
	move.b %d3,(%a2,%d0.l)
.L192:
	addq.l #1,%d1
	moveq #16,%d0
	cmp.l %d1,%d0
	jne .L197
	move.b gen,%d0
	mvz.b %d0,%d1
	cmp.l #255,%d1
	jeq .L201
	addq.l #1,%d0
	move.b %d0,gen
	move.l 20(%sp),%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	jsr 1074240840
	move.l 40(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
.L188:
	movem.l (%sp),#3084
	lea (36,%sp),%sp
	rts
.L193:
	add.l 40(%sp),%a0
	tst.l %a0
	jge .L211
.L200:
	move.w #255,%a0
	move.w %a0,%d3
	move.b %d3,(%a2)
	move.l 24(%sp),%a2
	move.b %d3,(%a2,%d0.l)
	jra .L192
.L199:
	move.l 40(%sp),%a0
	jra .L194
.L190:
	move.l 28(%sp),%d0
	lsr.l #1,%d0
	lea (78,%a0),%a0
	sub.l %a2,%a2
	move.l %a0,16(%sp)
	move.l %d1,%a3
	add.l #268544620,%a3
	mulu.w #7,%d0
	move.l %a3,24(%sp)
	clr.l %d1
	lea 1(%a2,%d0.l),%a0
	add.l 40(%sp),%a0
	move.l %a0,32(%sp)
	jra .L197
.L201:
	moveq #1,%d0
	move.l 20(%sp),%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	move.b %d0,gen
	mov3q.l #1,269452696
	jsr 1073905152
	jsr 1074240840
	move.l 40(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
	jra .L188
	.size	akl_knob, .-akl_knob
	.align	2
	.globl	akl_turn
	.type	akl_turn, @function
akl_turn:
	subq.l #4,%sp
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	jsr track_trigs
	tst.l -2147483630
	jeq .L215
	move.b 1175456536,%d1
	mvz.b 1175456537,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d1
	or.l %d1,%d0
	jeq .L215
	mov3q.l #5,%d0
	cmp.l 16(%sp),%d0
	jeq .L247
	mov3q.l #3,%d1
	cmp.l 16(%sp),%d1
	jeq .L248
	mov3q.l #4,%d2
	cmp.l 16(%sp),%d2
	jeq .L249
.L215:
	move.l (%sp)+,%d2
	clr.l %d0
	move.l (%sp)+,%a2
	addq.l #4,%sp
	rts
.L247:
	move.l 20(%sp),-(%sp)
	clr.l show_shift
	mov3q.l #1,close_on_release
	jsr akl_knob
	addq.l #4,%sp
.L217:
	mov3q.l #1,%d0
.L252:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #4,%sp
	rts
.L249:
	mov3q.l #1,show_shift
	mov3q.l #1,close_on_release
	jsr shift_at
	move.l %d0,%a0
	tst.l %d0
	jeq .L217
	move.l order_note,%d0
	tst.l %d0
	jlt .L250
.L225:
	move.b (%a0),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	cmp.l #255,%d1
	jeq .L228
	lsr.l #4,%d1
	cmp.l %d1,%d0
	jeq .L251
.L228:
	move.l 20(%sp),%d1
.L227:
	mov3q.l #7,%d2
	cmp.l %d1,%d2
	jge .L229
	mov3q.l #7,%d1
.L230:
	lsl.l #4,%d0
	addq.l #7,%d1
	move.l #268525902,%a1
	or.l %d0,%d1
	move.b %d1,(%a0)
	sub.l 1187521622,%a1
	move.b %d1,(%a1,%a0.l)
	move.l 20(%sp),-(%sp)
	jsr (after_edit.constprop.0)
	addq.l #4,%sp
.L255:
	mov3q.l #1,%d0
	jra .L252
.L250:
	move.l %a0,8(%sp)
	mov3q.l #-1,order_note
	jsr pick_note
	move.l order_note,%d0
	move.l 8(%sp),%a0
	jra .L225
.L251:
	moveq #15,%d1
	move.l %a1,%d2
	and.l %d1,%d2
	move.l 20(%sp),%a2
	lea -7(%a2,%d2.l),%a2
	move.l %a2,%d1
	jra .L227
.L248:
	move.l order_note,%d0
	mov3q.l #-1,%d2
	mov3q.l #1,show_shift
	mov3q.l #1,close_on_release
	cmp.l %d0,%d2
	jeq .L253
	moveq #-2,%d1
	cmp.l %d0,%d1
	jeq .L254
	add.l 20(%sp),%d0
	moveq #15,%d2
	cmp.l %d0,%d2
	jge .L223
	move.l %d2,order_note
.L244:
	jsr shift_at
.L222:
	jsr 1074240840
	move.l 20(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
.L256:
	mov3q.l #1,%d0
	jra .L252
.L229:
	moveq #-7,%d2
	cmp.l %d1,%d2
	jle .L230
	lsl.l #4,%d0
	moveq #-7,%d1
	addq.l #7,%d1
	move.l #268525902,%a1
	or.l %d0,%d1
	move.b %d1,(%a0)
	sub.l 1187521622,%a1
	move.b %d1,(%a1,%a0.l)
	move.l 20(%sp),-(%sp)
	jsr (after_edit.constprop.0)
	addq.l #4,%sp
	jra .L255
.L254:
	tst.l 20(%sp)
	jle .L244
	clr.l %d0
.L221:
	move.l %d0,order_note
	jsr shift_at
	jsr 1074240840
	move.l 20(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
	jra .L256
.L223:
	tst.l %d0
	jge .L221
	moveq #-2,%d0
	move.l %d0,order_note
	jsr shift_at
	move.l %d0,%a0
	tst.l %d0
	jeq .L222
	mvz.b (%a0),%d0
	cmp.l #255,%d0
	jeq .L222
	move.b #-1,(%a0)
	st %d1
	move.l #268525902,%a1
	sub.l 1187521622,%a1
	move.b %d1,(%a1,%a0.l)
	move.l 20(%sp),-(%sp)
	jsr (after_edit.constprop.0)
	addq.l #4,%sp
	mov3q.l #1,%d0
	jra .L252
.L253:
	jsr pick_note
	jsr 1074240840
	move.l 20(%sp),-(%sp)
	clr.l -(%sp)
	jsr 1074260376
	addq.l #8,%sp
	jra .L256
	.size	akl_turn, .-akl_turn
	.align	2
	.globl	akl_tick
	.type	akl_tick, @function
akl_tick:
	tst.l close_on_release
	jeq .L257
	move.b 1175456536,%d1
	mvz.b 1175456537,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d1
	or.l %d1,%d0
	jne .L257
	clr.l close_on_release
	tst.l 1074593470
	jeq .L257
	tst.l -2147483630
	jeq .L257
	jsr 1074240188
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L257:
	rts
	.size	akl_tick, .-akl_tick
	.align	2
	.globl	akl_text_claims
	.type	akl_text_claims, @function
akl_text_claims:
	jsr track_trigs
	mov3q.l #5,%d0
	cmp.l 4(%sp),%d0
	jeq .L268
.L270:
	clr.l %d0
	rts
.L268:
	tst.l -2147483630
	jeq .L270
	move.b 1175456536,%d1
	mvz.b 1175456537,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d1
	or.l %d1,%d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	akl_text_claims, .-akl_text_claims
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"OFF"
	.text
	.align	2
	.globl	akl_key_text
	.type	akl_key_text, @function
akl_key_text:
	lea (-36,%sp),%sp
	movem.l #17436,(%sp)
	move.l 40(%sp),%a0
	move.b 269161676,%d1
	move.b 269161680,%d0
	move.l 1187521622,%a1
	clr.b (%a0)
	move.b %d0,20(%sp)
	move.l order_step,%d0
	tst.l %d0
	jlt .L302
	mvz.b %d1,%d2
	mov3q.l #7,%d3
	cmp.l %d2,%d3
	jcs .L302
	mvz.b 20(%sp),%d4
	moveq #15,%d2
	cmp.l %d4,%d2
	jcs .L302
	move.l #-1074668000,%a6
	add.l %a1,%a6
	cmp.l #9535680,%a6
	jhi .L302
	move.b 20(%sp),%d3
	move.l 1175264772,%d2
	ext.w %d1
	lea (18640,%a1),%a6
	lea (5,%a0),%a1
	lsl.l #4,%d2
	mulu.w #2224,%d1
	ext.w %d3
	move.w %d3,%d4
	add.l %d2,%d0
	mulu.w #36568,%d4
	add.l %d4,%a6
	add.l %d1,%a6
	moveq #63,%d1
	and.l %d1,%d0
	tst.l show_shift
	jeq .L280
	move.l order_note,%d1
	moveq #-2,%d2
	cmp.l %d1,%d2
	jeq .L302
	tst.l %d1
	jge .L307
.L280:
	lsl.l #5,%d0
	moveq #84,%d1
	mvz.b 78(%a6,%d0.l),%d0
	cmp.l %d0,%d1
	jcs .L308
	tst.l %d0
	jne .L290
	move.l %a0,%d0
	add.l #9,%d0
	lea .LC0,%a6
.L291:
	move.l %a1,%a0
	addq.l #1,%a1
	move.b (%a6)+,(%a0)
	cmp.l %d0,%a1
	jne .L291
.L276:
	movem.l (%sp),#17436
	lea (36,%sp),%sp
	rts
.L302:
	moveq #45,%d3
	clr.b %d4
	move.b %d3,5(%a0)
	move.b %d3,6(%a0)
	move.b %d4,7(%a0)
	movem.l (%sp),#17436
	lea (36,%sp),%sp
	rts
.L308:
	moveq #45,%d2
	clr.b %d3
	move.b %d2,5(%a0)
	move.b %d2,6(%a0)
	move.b %d3,7(%a0)
	movem.l (%sp),#17436
	lea (36,%sp),%sp
	rts
.L307:
	moveq #9,%d3
	move.l %d1,%d2
	rems.l %d3,%d4:%d2
	lsl.l #5,%d0
	moveq #78,%d2
	clr.w %d3
	add.l #49,%d4
	move.l %d4,20(%sp)
	move.w #11565,%d4
	move.b 79(%a6,%d0.l),%d0
	move.b %d2,32(%sp)
	clr.b %d2
	move.w %d3,34(%sp)
	move.b 23(%sp),33(%sp)
	move.w %d4,28(%sp)
	moveq #8,%d4
	mvz.b %d0,%d3
	move.b %d2,30(%sp)
	move.l %d3,%a6
	cmp.l %d1,%d4
	jge .L282
	moveq #49,%d2
	move.l %d1,%d3
	add.l #39,%d3
	move.l %d3,20(%sp)
	move.b 23(%sp),34(%sp)
	move.b %d2,33(%sp)
.L282:
	cmp.l #255,%a6
	jeq .L283
	move.l %a6,%d4
	lsr.l #4,%d4
	cmp.l %d1,%d4
	jeq .L309
.L283:
	move.l %sp,%d0
	add.l #32,%d0
.L287:
	move.l %d0,%a2
	addq.l #1,%a2
	move.b -1(%a2),(%a1)
	move.l %a2,%d0
	addq.l #1,%a1
	subq.l #1,%a2
	tst.b (%a2)+
	jne .L287
	lea (28,%sp),%a6
.L288:
	move.b (%a6),(%a0)
	addq.l #1,%a0
	tst.b (%a6)+
	jeq .L276
	move.b (%a6),(%a0)
	addq.l #1,%a0
	tst.b (%a6)+
	jne .L288
	jra .L276
.L309:
	moveq #15,%d1
	and.l %d0,%d1
	move.l %d1,%a6
	move.l %d1,%d0
	subq.l #7,%a6
	subq.l #7,%d1
	tst.l %d1
	jne .L284
	move.w #12288,%d4
	move.l %sp,%d0
	add.l #32,%d0
	move.w %d4,28(%sp)
	jra .L287
.L290:
	subq.l #1,%d0
	move.l %d0,20(%sp)
	mov3q.l #7,%d4
	remu.l %d4,%d1:%d0
	lsl.l #2,%d1
	move.l %d1,%d0
	add.l #names,%d0
.L292:
	move.l %d0,%a2
	addq.l #1,%a0
	move.b (%a2)+,%d1
	move.b %d1,-1(%a0)
	move.l %a2,%d0
	tst.b %d1
	jne .L292
	move.l 20(%sp),%d0
	mov3q.l #7,%d2
	divu.l %d2,%d0
	mulu.w #3,%d0
	move.l %d0,%a0
	add.l #roots,%a0
.L293:
	move.b (%a0)+,%d0
	addq.l #1,%a1
	move.b %d0,-1(%a1)
	jeq .L276
	move.b (%a0)+,%d0
	addq.l #1,%a1
	move.b %d0,-1(%a1)
	jne .L293
	jra .L276
.L284:
	tst.l %a6
	jlt .L310
	moveq #43,%d1
	add.l #41,%d0
	move.b %d0,29(%sp)
	move.b %d1,28(%sp)
.L311:
	move.l %sp,%d0
	add.l #32,%d0
	jra .L287
.L310:
	moveq #55,%d1
	sub.l %d0,%d1
	move.b %d1,%d0
	move.b %d0,29(%sp)
	jra .L311
	.size	akl_key_text, .-akl_key_text
	.align	2
	.globl	akl_knob_claims
	.type	akl_knob_claims, @function
akl_knob_claims:
	tst.l -2147483630
	jeq .L314
	move.b 1175456536,%d1
	mvz.b 1175456537,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d1
	or.l %d1,%d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
.L314:
	clr.l %d0
	rts
	.size	akl_knob_claims, .-akl_knob_claims
	.section	.rodata
	.type	roots, @object
	.size	roots, 36
roots:
	.string	"C"
	.zero	1
	.string	"C#"
	.string	"D"
	.zero	1
	.string	"D#"
	.string	"E"
	.zero	1
	.string	"F"
	.zero	1
	.string	"F#"
	.string	"G"
	.zero	1
	.string	"G#"
	.string	"A"
	.zero	1
	.string	"A#"
	.string	"B"
	.zero	1
	.type	names, @object
	.size	names, 28
names:
	.string	"MAJ"
	.string	"DOR"
	.string	"PHR"
	.string	"LYD"
	.string	"MIX"
	.string	"MIN"
	.string	"LOC"
	.local	close_on_release
	.comm	close_on_release,4,2
	.local	order_prev
	.comm	order_prev,4,2
	.local	show_shift
	.comm	show_shift,4,2
	.data
	.align	2
	.type	order_note, @object
	.size	order_note, 4
order_note:
	.long	-1
	.align	2
	.type	order_step, @object
	.size	order_step, 4
order_step:
	.long	-1
	.type	gen, @object
	.size	gen, 1
gen:
	.byte	1
	.local	shift_track
	.comm	shift_track,32,2
	.type	shift_step, @object
	.size	shift_step, 8
shift_step:
	.base64	"//////////8="
	.type	shift_now_r, @object
	.size	shift_now_r, 8
shift_now_r:
	.base64	"//////////8="
	.local	cache_key
	.comm	cache_key,8,1
	.local	cache_for
	.comm	cache_for,32,2
	.section	.rodata
	.align	2
	.type	modes, @object
	.size	modes, 14
modes:
	.word	2741
	.word	1709
	.word	1451
	.word	2773
	.word	1717
	.word	1453
	.word	1387
	.ident	"GCC: (GNU) 16.2.0"
