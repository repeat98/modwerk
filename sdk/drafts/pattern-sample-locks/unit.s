#NO_APP
	.file	"translation.c"
	.text
	.align	2
	.type	close_view, @function
close_view:
	clr.b %d0
	clr.l phase
	clr.l encoder_residual
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	rts
	.size	close_view, .-close_view
	.align	2
	.type	text, @function
text:
	move.l 4(%sp),%a0
	move.l 8(%sp),%a1
.L3:
	move.b (%a1),%d0
	jne .L4
	clr.b (%a0)
	rts
.L4:
	move.b %d0,(%a0)+
	addq.l #1,%a1
	jra .L3
	.size	text, .-text
	.align	2
	.type	psl_write_batch, @function
psl_write_batch:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
#APP
| 113 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d2
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	move.l -66600948,%d0
	move.l %d0,4(%sp)
	moveq #10,%d0
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #edits,%a0
.L6:
	cmp.l 16(%sp),%d1
	jcs .L8
	move.l -66600948,%d0
	sub.l 4(%sp),%d0
#APP
| 118 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d2,%sr
| 0 "" 2
#NO_APP
	addq.l #1,psl_guard_spans
	cmp.l psl_guard_max.l,%d0
	jls .L5
	move.l %d0,psl_guard_max
.L5:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L8:
	move.b 9(%a0),%d0
	move.l (%a0),%a1
	move.b %d0,(%a1)
	move.l 4(%a0),%a1
	tst.l %a1
	jeq .L7
	move.b %d0,(%a1)
.L7:
	addq.l #1,%d1
	lea (10,%a0),%a0
	jra .L6
	.size	psl_write_batch, .-psl_write_batch
	.align	2
	.type	source_valid, @function
source_valid:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	tst.l %a0
	jne .L14
.L16:
	clr.l %d0
.L13:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L14:
	tst.l (%a0)
	jeq .L16
	mvz.b 4(%a0),%d0
	lsr.l #4,%d0
	jne .L16
	mvz.b 5(%a0),%d0
	lsr.l #2,%d0
	jne .L16
	mvz.b 6(%a0),%d2
	clr.l %d0
.L19:
	btst %d0,%d2
	jeq .L17
	tst.l 24(%a0,%d0.l*4)
	jeq .L16
	move.b 7(%a0,%d0.l),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	lsr.l #1,%d1
	jne .L16
	move.w %a1,%d3
	mvz.b 15(%a0,%d0.l),%d1
	tst.b %d3
	jeq .L20
	move.w #135,%a1
.L18:
	cmp.l %d1,%a1
	jcc .L17
	cmp.l #255,%d1
	jne .L16
.L17:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L19
	moveq #1,%d0
	jra .L13
.L20:
	move.w #127,%a1
	jra .L18
	.size	source_valid, .-source_valid
	.align	2
	.type	pixel, @function
pixel:
	move.l %d2,-(%sp)
	moveq #127,%d2
	move.l 12(%sp),%d0
	move.l 16(%sp),%d1
	cmp.l %d0,%d2
	jcs .L25
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L25
	lsl.l #3,%d0
	move.l %d1,%d2
	lsr.l #3,%d2
	move.l 8(%sp),%a0
	sub.l %d2,%d0
	lea 7(%a0,%d0.l),%a0
	moveq #7,%d0
	and.l %d0,%d1
	moveq #1,%d0
	lsl.l %d1,%d0
	move.b (%a0),%d1
	tst.l 20(%sp)
	jeq .L27
	eor.l %d1,%d0
.L28:
	move.b %d0,(%a0)
.L25:
	move.l (%sp)+,%d2
	rts
.L27:
	or.l %d1,%d0
	jra .L28
	.size	pixel, .-pixel
	.align	2
	.globl	psl_prepare
	.type	psl_prepare, @function
psl_prepare:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 60(%sp),%a2
	move.l 64(%sp),%a3
	move.l 68(%sp),%d2
	move.l 72(%sp),%d3
	tst.l %a2
	jeq .L44
	clr.b %d0
	move.b %d0,10(%a2)
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L44
	cmp.l #255,%d2
	jhi .L29
	move.b 6(%a3),%d4
	mvz.b %d4,%d1
	not.l %d1
	and.l %d2,%d1
	tst.l %d1
	jne .L29
	move.l 76(%sp),%d1
	or.l %d3,%d1
	lsr.l #1,%d1
	jne .L29
	tst.l %d2
	jeq .L45
	clr.l %d1
.L34:
	btst %d1,%d2
	jeq .L33
	tst.l %d3
	jne .L33
	mvz.b 15(%a3,%d1.l),%d5
	cmp.l #255,%d5
	jeq .L29
.L33:
	addq.l #1,%d1
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L34
	tst.l 76(%sp)
	sne %d0
	tst.l %d3
	seq %d1
	move.l (%a3),(%a2)
	move.b 4(%a3),4(%a2)
	lea (91,%a2),%a0
	lea (7,%a3),%a4
	lea (11,%a2),%a5
	move.l %a0,50(%sp)
	neg.l %d0
	neg.l %d1
	and.l %d1,%d0
	move.b 5(%a3),5(%a2)
	move.b %d4,6(%a2)
	move.b %d2,7(%a2)
	move.b %d3,8(%a2)
	clr.l 1116(%a2)
	clr.l %d1
	move.b %d0,9(%a2)
.L42:
	move.b (%a4)+,(%a5)+
	move.b 7(%a4),%d0
	move.b %d0,55(%sp)
	move.b %d0,7(%a5)
	btst %d1,%d2
	jeq .L35
	mvz.w %d1,%d0
	move.l 24(%a3,%d1.l*4),%d6
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a1
	clr.l %d0
.L36:
	move.l %d6,%a0
	moveq #8,%d4
	lea (%a0,%d0.l),%a6
	move.b (%a6),27(%a1,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d4
	jne .L36
	move.l 50(%sp),%d5
	move.l %d6,%a6
	lea (120,%a6),%a6
	sub.l %a0,%a0
.L41:
	move.b (%a6),%d4
	moveq #1,%d7
	cmp.l %d3,%d7
	jeq .L46
	move.l %a0,%d7
	lsr.l #3,%d7
	moveq #7,%d0
	move.l %d6,%a1
	sub.l %d7,%d0
	moveq #7,%d7
	mvz.b (%a1,%d0.l),%d0
	move.l %d0,46(%sp)
	move.l %a0,%d0
	and.l %d7,%d0
	move.l 46(%sp),%d7
	btst %d0,%d7
	jeq .L38
	mvz.b %d4,%d0
	cmp.l #255,%d0
	jne .L39
.L40:
	move.b 55(%sp),%d0
.L37:
	move.l %d5,%a1
	addq.l #1,%a0
	move.b %d4,(%a1)+
	lea (32,%a6),%a6
	move.b %d0,511(%a1)
	eor.l %d4,%d0
	move.l %a1,%d5
	move.w 1116(%a2),%d4
	tst.b %d0
	sne %d0
	ext.w %d0
	sub.l %d0,%d4
	move.w %d4,1116(%a2)
	moveq #64,%d0
	cmp.l %a0,%d0
	jne .L41
.L35:
	moveq #64,%d4
	addq.l #1,%d1
	add.l %d4,50(%sp)
	moveq #8,%d5
	cmp.l %d1,%d5
	jne .L42
	moveq #1,%d7
	clr.l %d0
	move.b %d7,10(%a2)
.L29:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L39:
	tst.l 76(%sp)
	jne .L40
	move.w 1118(%a2),%d0
	addq.l #1,%d0
	move.w %d0,1118(%a2)
.L38:
	move.b %d4,%d0
	jra .L37
.L46:
	st %d0
	jra .L37
.L44:
	moveq #1,%d0
	jra .L29
.L45:
	moveq #2,%d0
	jra .L29
	.size	psl_prepare, .-psl_prepare
	.align	2
	.globl	psl_validate
	.type	psl_validate, @function
psl_validate:
	lea (-28,%sp),%sp
	movem.l #7228,(%sp)
	move.l 32(%sp),%a2
	move.l 36(%sp),%a3
	tst.l %a2
	jne .L64
.L66:
	moveq #1,%d0
.L63:
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L64:
	tst.b 10(%a2)
	jeq .L66
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L66
	move.l (%a2),%d0
	cmp.l (%a3),%d0
	jeq .L67
.L68:
	moveq #3,%d0
	jra .L63
.L67:
	mvz.b 4(%a3),%d1
	mvz.b 4(%a2),%d0
	cmp.l %d1,%d0
	jne .L68
	mvz.b 5(%a3),%d1
	mvz.b 5(%a2),%d0
	cmp.l %d1,%d0
	jne .L68
	mvz.b 6(%a3),%d1
	mvz.b 6(%a2),%d0
	cmp.l %d1,%d0
	jne .L68
	mvz.b 7(%a2),%d3
	move.l %a2,%d2
	clr.l %d0
	add.l #91,%d2
.L72:
	btst %d0,%d3
	jeq .L69
	mvz.b 7(%a3,%d0.l),%d4
	mvz.b 11(%a2,%d0.l),%d1
	cmp.l %d4,%d1
	jne .L68
	mvz.b 15(%a3,%d0.l),%d4
	mvz.b 19(%a2,%d0.l),%d1
	cmp.l %d4,%d1
	jne .L68
	mvz.w %d0,%d1
	move.l 24(%a3,%d0.l*4),%a0
	lsl.l #3,%d1
	lea (%a2,%d1.l),%a1
	clr.l %d1
.L70:
	mvz.b (%a0,%d1.l),%d5
	mvz.b 27(%a1,%d1.l),%d4
	cmp.l %d5,%d4
	jne .L68
	addq.l #1,%d1
	moveq #8,%d4
	cmp.l %d1,%d4
	jne .L70
	lea (120,%a0),%a1
	lea (2168,%a0),%a0
	move.l %d2,%d1
.L71:
	move.l %d1,%a4
	mvz.b (%a1),%d5
	mvz.b (%a4),%d4
	cmp.l %d5,%d4
	jne .L68
	addq.l #1,%d1
	lea (32,%a1),%a1
	cmp.l %a1,%a0
	jne .L71
.L69:
	addq.l #1,%d0
	add.l #64,%d2
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L72
	clr.l %d0
	jra .L63
	.size	psl_validate, .-psl_validate
	.align	2
	.globl	psl_apply
	.type	psl_apply, @function
psl_apply:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 60(%sp),%a2
	move.l 68(%sp),%a3
	move.l 72(%sp),%a4
	move.l 64(%sp),-(%sp)
	move.l %a2,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	tst.l %d0
	jne .L82
	tst.l %a3
	jeq .L85
	tst.l %a4
	jeq .L85
	clr.l %d1
.L86:
	move.l (%a3,%d1.l),%a1
	tst.l %a1
	jeq .L85
	move.l (%a4,%d1.l),%a0
	tst.l %a0
	jeq .L85
	cmp.l #-2331,%a1
	jhi .L85
	cmp.l #-2331,%a0
	jhi .L85
	addq.l #4,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L86
	move.l %a2,%d4
	add.l #91,%d4
	move.l %d4,%d5
	clr.l %d2
	sub.l %a1,%a1
.L93:
	move.l (%a3,%d2.l),%d3
	tst.l %d3
	jeq .L85
	move.l (%a4,%d2.l),%d1
	tst.l %d1
	jeq .L85
	move.l 64(%sp),%a0
	cmp.l 24(%a0,%d2.l),%d3
	jne .L85
	move.l %d3,%a5
	move.l %d1,%a6
	lea (2330,%a5),%a5
	sub.l %a0,%a0
	lea (2330,%a6),%a6
	move.l %a5,44(%sp)
	move.l %a6,52(%sp)
.L90:
	move.l (%a4,%a0.l*4),%d6
	move.l %d6,%d7
	add.l #2330,%d7
	cmp.l %d3,%d7
	jls .L87
	cmp.l 44(%sp),%d6
	jcs .L85
.L87:
	cmp.l %a1,%a0
	jeq .L88
	move.l (%a3,%a0.l*4),%a5
	lea (2330,%a5),%a6
	cmp.l %d3,%a6
	jls .L89
	cmp.l 44(%sp),%a5
	jcs .L85
.L89:
	cmp.l %d1,%d7
	jls .L88
	cmp.l 52(%sp),%d6
	jcs .L85
.L88:
	addq.l #1,%a0
	moveq #8,%d6
	cmp.l %a0,%d6
	jne .L90
	mvz.b 7(%a2),%d3
	move.l %a1,%d6
	btst %d6,%d3
	jeq .L91
	move.l %d1,%a0
	move.l %d5,%a5
	lea (120,%a0),%a0
	add.l #2168,%d1
.L92:
	mvz.b (%a0),%d6
	mvz.b (%a5),%d3
	cmp.l %d6,%d3
	jne .L99
	addq.l #1,%a5
	lea (32,%a0),%a0
	cmp.l %a0,%d1
	jne .L92
.L91:
	addq.l #1,%a1
	add.l #64,%d5
	addq.l #4,%d2
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L93
	clr.l %d1
.L97:
	mvz.b 7(%a2),%d2
	btst %d1,%d2
	jeq .L94
	move.w #120,%a1
	move.l %d4,%a5
.L96:
	move.b (%a5)+,%d3
	move.b 511(%a5),%d2
	mvz.b %d3,%d3
	mvz.b %d2,%d5
	cmp.l %d3,%d5
	jeq .L95
	move.l (%a3,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
	move.l (%a4,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
.L95:
	lea (32,%a1),%a1
	cmp.l #2168,%a1
	jne .L96
.L94:
	addq.l #1,%d1
	add.l #64,%d4
	moveq #8,%d2
	cmp.l %d1,%d2
	jne .L97
	clr.b %d6
	move.b %d6,10(%a2)
.L82:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L85:
	moveq #1,%d0
	jra .L82
.L99:
	moveq #3,%d0
	jra .L82
	.size	psl_apply, .-psl_apply
	.align	2
	.globl	psl_font_text_at
	.type	psl_font_text_at, @function
psl_font_text_at:
	lea (-40,%sp),%sp
	movem.l #1276,(%sp)
	move.l 48(%sp),%d2
	move.l 56(%sp),%a1
	tst.l 44(%sp)
	jeq .L130
	tst.l %a1
	jeq .L130
	moveq #57,%d0
	cmp.l 52(%sp),%d0
	jcs .L130
	moveq #1,%d6
.L133:
	move.b (%a1),%d0
	jeq .L130
	move.l %d2,%d1
	moveq #124,%d3
	addq.l #5,%d1
	cmp.l %d1,%d3
	jcc .L144
.L130:
	movem.l (%sp),#1276
	lea (40,%sp),%sp
	rts
.L144:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a1
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L134
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #letters,%a0
.L135:
	move.l %d2,%d5
	clr.l %d0
	lsl.l #3,%d5
	move.l %d5,28(%sp)
.L143:
	tst.l %a0
	jeq .L146
	mvz.b (%a0,%d0.l),%d1
.L136:
	moveq #58,%d7
	mvs.b -1(%a1),%d3
	cmp.l %d3,%d7
	jne .L137
	moveq #36,%d3
	btst %d0,%d3
	jeq .L138
.L148:
	moveq #4,%d1
	jra .L138
.L134:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d4
	cmp.l %d1,%d4
	jcs .L145
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #digits,%a0
	jra .L135
.L145:
	sub.l %a0,%a0
	jra .L135
.L146:
	clr.l %d1
	jra .L136
.L137:
	moveq #46,%d4
	cmp.l %d3,%d4
	jne .L139
	moveq #6,%d5
	cmp.l %d0,%d5
	jeq .L148
.L138:
	move.l 52(%sp),%d5
	add.l %d0,%d5
	move.l %d5,%d7
	lsr.l #3,%d7
	move.l 28(%sp),%d4
	clr.l %d3
	move.l %d7,%a2
	moveq #7,%d7
	sub.l %a2,%d7
	move.l %d7,32(%sp)
	moveq #7,%d7
	and.l %d7,%d5
	move.l %d6,%d7
	lsl.l %d5,%d7
	move.l %d7,36(%sp)
.L142:
	moveq #16,%d5
	lsr.l %d3,%d5
	and.l %d1,%d5
	tst.l %d5
	jeq .L141
	move.l 32(%sp),%a2
	add.l %d4,%a2
	add.l 44(%sp),%a2
	move.b (%a2),%d5
	or.l 36(%sp),%d5
	move.b %d5,(%a2)
.L141:
	addq.l #1,%d3
	addq.l #8,%d4
	moveq #5,%d5
	cmp.l %d3,%d5
	jne .L142
	addq.l #1,%d0
	moveq #7,%d7
	cmp.l %d0,%d7
	jne .L143
	addq.l #6,%d2
	jra .L133
.L139:
	moveq #45,%d7
	cmp.l %d3,%d7
	jne .L140
	moveq #3,%d3
	cmp.l %d0,%d3
	jne .L138
	moveq #14,%d1
	jra .L138
.L140:
	moveq #47,%d4
	cmp.l %d3,%d4
	jne .L138
	mvz.w %d0,%d1
	moveq #6,%d5
	lsl.l #2,%d1
	move.l %d1,%d3
	move.l %d6,%d1
	divu.l %d5,%d3
	lsl.l %d3,%d1
	jra .L138
	.size	psl_font_text_at, .-psl_font_text_at
	.align	2
	.globl	psl_font_clear
	.type	psl_font_clear, @function
psl_font_clear:
	lea (-36,%sp),%sp
	movem.l #7420,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%d2
	move.l 48(%sp),%d1
	move.l 52(%sp),%d0
	move.l 56(%sp),%a0
	tst.l %a2
	jeq .L161
	tst.l %d0
	jeq .L161
	tst.l %a0
	jeq .L161
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L161
	moveq #63,%d5
	cmp.l %d1,%d5
	jcs .L161
	move.w #128,%a1
	sub.l %d2,%a1
	cmp.l %a1,%d0
	jhi .L161
	move.w #64,%a1
	sub.l %d1,%a1
	cmp.l %a1,%a0
	jhi .L161
	lea -1(%a0,%d1.l),%a0
	move.l %d2,%d4
	moveq #7,%d5
	lsl.l #3,%d4
	and.l %d1,%d5
	move.l %d1,%d7
	moveq #7,%d1
	lsr.l #3,%d7
	move.w #255,%a3
	add.l %d2,%d0
	move.l %d7,%a1
	move.l %a0,%d3
	move.l %a0,%d6
	and.l %d1,%d3
	lea 7(%a2,%d4.l),%a4
	lsr.l #3,%d6
	move.l %d5,%a0
.L164:
	cmp.l %a1,%d6
	jcc .L168
.L161:
	movem.l (%sp),#7420
	lea (36,%sp),%sp
	rts
.L168:
	cmp.l %d7,%a1
	jne .L169
	move.l %a0,%d4
.L165:
	cmp.l %a1,%d6
	jne .L170
	move.l %d3,%d1
.L166:
	moveq #7,%d5
	sub.l %d1,%d5
	move.l %a3,%d1
	lsr.l %d5,%d1
	move.l %a3,%d5
	move.l %a4,%a2
	lsl.l %d4,%d5
	sub.l %a1,%a2
	move.l %d2,%d4
	and.l %d5,%d1
	not.l %d1
.L167:
	move.b (%a2),%d5
	addq.l #1,%d4
	addq.l #8,%a2
	and.l %d1,%d5
	move.b %d5,-8(%a2)
	cmp.l %d4,%d0
	jhi .L167
	addq.l #1,%a1
	jra .L164
.L169:
	clr.l %d4
	jra .L165
.L170:
	moveq #7,%d1
	jra .L166
	.size	psl_font_clear, .-psl_font_clear
	.align	2
	.globl	psl_font_small_text
	.type	psl_font_small_text, @function
psl_font_small_text:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 44(%sp),%a5
	move.l 52(%sp),%a4
	tst.l 40(%sp)
	jeq .L178
	tst.l %a4
	jeq .L178
	moveq #59,%d0
	cmp.l 48(%sp),%d0
	jcs .L178
	moveq #1,%d2
	lea pixel,%a3
.L181:
	move.b (%a4),%d0
	jeq .L178
	move.l %a5,%d1
	moveq #124,%d3
	addq.l #3,%d1
	cmp.l %d1,%d3
	jcc .L194
.L178:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L194:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a4
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L182
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #alpha.1,%a2
.L183:
	clr.l %d3
	moveq #4,%d5
.L193:
	tst.l %a2
	jeq .L196
	mvz.b (%a2,%d3.l),%d4
.L184:
	mvs.b -1(%a4),%d0
	moveq #58,%d1
	cmp.l %d0,%d1
	jne .L185
	moveq #-3,%d0
	and.l %d3,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L189
.L198:
	moveq #2,%d4
	jra .L189
.L182:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d3
	cmp.l %d1,%d3
	jcs .L195
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #digit.0,%a2
	jra .L183
.L195:
	sub.l %a2,%a2
	jra .L183
.L196:
	clr.l %d4
	jra .L184
.L185:
	moveq #46,%d1
	cmp.l %d0,%d1
	jne .L188
	moveq #4,%d0
	cmp.l %d3,%d0
	jeq .L198
.L189:
	clr.l %d6
.L192:
	move.l %d5,%d0
	lsr.l %d6,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L191
	clr.l -(%sp)
	move.l 52(%sp),%a0
	pea (%a0,%d3.l)
	pea (%a5,%d6.l)
	move.l 52(%sp),-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L191:
	addq.l #1,%d6
	moveq #3,%d0
	cmp.l %d6,%d0
	jne .L192
	addq.l #1,%d3
	moveq #5,%d1
	cmp.l %d3,%d1
	jne .L193
	addq.l #4,%a5
	jra .L181
.L188:
	moveq #45,%d1
	cmp.l %d0,%d1
	jne .L190
	moveq #2,%d0
	cmp.l %d3,%d0
	jne .L189
	moveq #7,%d4
	jra .L189
.L190:
	moveq #47,%d1
	cmp.l %d0,%d1
	jne .L187
	move.l %d3,%d0
	lsr.l #1,%d0
	move.l %d2,%d4
	lsl.l %d0,%d4
	jra .L189
.L187:
	moveq #91,%d1
	cmp.l %d0,%d1
	jne .L186
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L200
	moveq #6,%d4
	jra .L189
.L186:
	moveq #93,%d1
	cmp.l %d0,%d1
	jne .L189
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L201
	moveq #1,%d4
	jra .L189
.L200:
	moveq #4,%d4
	jra .L189
.L201:
	moveq #3,%d4
	jra .L189
	.size	psl_font_small_text, .-psl_font_small_text
	.align	2
	.globl	psl_font_box
	.type	psl_font_box, @function
psl_font_box:
	lea (-36,%sp),%sp
	movem.l #31772,(%sp)
	move.l 40(%sp),%d2
	move.l 44(%sp),%d3
	move.l 48(%sp),%a2
	move.l 52(%sp),%d0
	move.l 56(%sp),%a3
	tst.l %d2
	jeq .L213
	tst.l %d0
	jeq .L213
	tst.l %a3
	jeq .L213
	moveq #127,%d1
	cmp.l %d3,%d1
	jcs .L213
	moveq #63,%d1
	cmp.l %a2,%d1
	jcs .L213
	move.l #128,%d1
	sub.l %d3,%d1
	cmp.l %d1,%d0
	jhi .L213
	moveq #64,%d1
	sub.l %a2,%d1
	cmp.l %d1,%a3
	jhi .L213
	lea -1(%a2,%a3.l),%a6
	lea pixel,%a4
	add.l %d3,%d0
	move.l %d3,%d4
	move.l %a4,%a5
.L216:
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %d0,48(%sp)
	jsr (%a4)
	clr.l -(%sp)
	move.l %a6,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a4)
	lea (32,%sp),%sp
	addq.l #1,%d4
	move.l 32(%sp),%d0
	cmp.l %d4,%d0
	jhi .L216
	move.l %d0,%d4
	add.l %a2,%a3
	subq.l #1,%d4
.L217:
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a5)
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a5)
	addq.l #1,%a2
	lea (32,%sp),%sp
	cmp.l %a2,%a3
	jhi .L217
.L213:
	movem.l (%sp),#31772
	lea (36,%sp),%sp
	rts
	.size	psl_font_box, .-psl_font_box
	.align	2
	.globl	psl_font_dashed_box
	.type	psl_font_dashed_box, @function
psl_font_dashed_box:
	lea (-36,%sp),%sp
	movem.l #31772,(%sp)
	move.l 40(%sp),%d3
	move.l 44(%sp),%a2
	move.l 48(%sp),%a3
	move.l 52(%sp),%a5
	move.l 56(%sp),%a4
	tst.l %d3
	jeq .L226
	tst.l %a5
	jeq .L226
	tst.l %a4
	jeq .L226
	moveq #127,%d0
	cmp.l %a2,%d0
	jcs .L226
	moveq #63,%d0
	cmp.l %a3,%d0
	jcs .L226
	move.l #128,%d0
	sub.l %a2,%d0
	cmp.l %d0,%a5
	jhi .L226
	moveq #64,%d0
	sub.l %a3,%d0
	cmp.l %d0,%a4
	jhi .L226
	lea -1(%a3,%a4.l),%a0
	clr.l %d2
	lea pixel,%a6
	move.l %a0,32(%sp)
.L229:
	btst #1,%d2
	jne .L228
	clr.l -(%sp)
	move.l %a3,-(%sp)
	move.l %a2,%d4
	add.l %d2,%d4
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	clr.l -(%sp)
	move.l 52(%sp),-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (32,%sp),%sp
.L228:
	addq.l #1,%d2
	cmp.l %a5,%d2
	jne .L229
	lea -1(%a2,%a5.l),%a5
	clr.l %d2
	lea pixel,%a6
	move.l %a5,%d4
.L231:
	btst #1,%d2
	jne .L230
	clr.l -(%sp)
	lea (%a3,%d2.l),%a5
	move.l %a5,-(%sp)
	move.l %a2,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	clr.l -(%sp)
	move.l %a5,-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (32,%sp),%sp
.L230:
	addq.l #1,%d2
	cmp.l %a4,%d2
	jne .L231
.L226:
	movem.l (%sp),#31772
	lea (36,%sp),%sp
	rts
	.size	psl_font_dashed_box, .-psl_font_dashed_box
	.align	2
	.globl	psl_font_invert
	.type	psl_font_invert, @function
psl_font_invert:
	lea (-24,%sp),%sp
	movem.l #1148,(%sp)
	move.l 32(%sp),%d2
	move.l 36(%sp),%d4
	move.l 40(%sp),%d0
	move.l 44(%sp),%d1
	tst.l 28(%sp)
	jeq .L243
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L243
	moveq #63,%d3
	cmp.l %d4,%d3
	jcs .L243
	move.w #128,%a0
	sub.l %d2,%a0
	cmp.l %a0,%d0
	jhi .L243
	move.w #64,%a0
	sub.l %d4,%a0
	cmp.l %a0,%d1
	jhi .L243
	move.l %d2,%d5
	move.l %d4,%d6
	add.l %d0,%d5
	add.l %d1,%d6
	lea pixel,%a2
.L245:
	cmp.l %d2,%d5
	jls .L243
	move.l %d4,%d3
	jra .L247
.L246:
	pea 1.w
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 40(%sp),-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (16,%sp),%sp
.L247:
	cmp.l %d3,%d6
	jhi .L246
	addq.l #1,%d2
	jra .L245
.L243:
	movem.l (%sp),#1148
	lea (24,%sp),%sp
	rts
	.size	psl_font_invert, .-psl_font_invert
	.align	2
	.globl	psl_ui_phase
	.type	psl_ui_phase, @function
psl_ui_phase:
	move.l phase,%d0
	rts
	.size	psl_ui_phase, .-psl_ui_phase
	.align	2
	.globl	psl_ui_open
	.type	psl_ui_open, @function
psl_ui_open:
	moveq #1,%d0
	moveq #3,%d1
	move.l %d0,phase
	move.l 1175346752,%d0
	cmp.l %d0,%d1
	jcc .L253
	clr.l %d0
.L253:
	move.l %d0,cursor
	moveq #1,%d1
	clr.b %d0
	clr.l replace
	clr.l selected
	clr.l encoder_residual
	move.l %d1,1187497772
	move.b %d0,plan+10
	rts
	.size	psl_ui_open, .-psl_ui_open
	.align	2
	.globl	psl_native_source
	.type	psl_native_source, @function
psl_native_source:
	lea (-44,%sp),%sp
	movem.l #31996,(%sp)
	move.l 1187521622,%d3
	move.l 48(%sp),%a1
	move.b 269161680,%d1
	move.b 269161679,%d0
	tst.l %a1
	jne .L256
.L258:
	clr.l %d0
.L255:
	movem.l (%sp),#31996
	lea (44,%sp),%sp
	rts
.L256:
	move.l %d3,%d4
	add.l #-1074668000,%d4
	cmp.l #9535680,%d4
	jhi .L258
	move.l #635712,%d5
	remu.l %d5,%d2:%d4
	tst.l %d2
	jne .L258
	mvz.b %d1,%d6
	moveq #15,%d7
	cmp.l %d6,%d7
	jcs .L258
	mvz.b %d0,%d4
	lsr.l #2,%d4
	jne .L258
	move.b %d0,%d4
	clr.b %d7
	move.b %d1,4(%a1)
	ext.w %d1
	move.b %d0,5(%a1)
	move.l %d3,%a2
	add.l #585088,%a2
	move.l %d3,(%a1)
	mulu.w #36568,%d1
	lea (7,%a1),%a3
	lea (24,%a1),%a4
	ext.w %d4
	move.b %d7,6(%a1)
	mulu.w #6322,%d4
	move.l %d1,%d5
	add.l %d3,%d5
	add.l %d4,%a2
	lea (60,%a2),%a0
	move.l #714,%d4
	lea (34,%a2),%a5
.L266:
	move.b (%a5,%d2.l),%d1
	move.w %d1,%a6
	mvz.b %d1,%d1
	move.w %a6,%d7
	move.b %d7,(%a3)+
	moveq #1,%d7
	cmp.l %d1,%d7
	jcs .L267
	move.l %d1,%a6
	add.l %d4,%a6
	move.b (%a2,%a6.l),%d7
	move.w %d7,%a6
.L259:
	move.w %a6,%d7
	move.b %d7,7(%a3)
	moveq #1,%d7
	move.l %d5,(%a4)+
	cmp.l %d1,%d7
	jcs .L260
	mvz.b 2(%a0),%d1
	cmp.l %d1,%d7
	jne .L261
	mvz.b (%a0),%d1
	moveq #80,%d7
	cmp.l %d1,%d7
	jne .L262
	mvz.b 1(%a0),%d1
	moveq #76,%d7
	cmp.l %d1,%d7
	jeq .L260
.L262:
	mvz.b (%a0),%d1
	moveq #65,%d7
	cmp.l %d1,%d7
	jne .L263
	mvz.b 1(%a0),%d1
	moveq #66,%d7
	cmp.l %d1,%d7
	jeq .L260
.L263:
	mvz.b (%a0),%d1
	moveq #70,%d7
	cmp.l %d1,%d7
	jne .L261
	mvz.b 1(%a0),%d1
	moveq #77,%d7
	cmp.l %d1,%d7
	jeq .L260
.L261:
	mvz.b 2(%a0),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L264
	mvz.b 2(%a0),%d1
	subq.l #2,%d1
	tst.l %d1
	jne .L265
.L264:
	mvz.b (%a0),%d1
	moveq #83,%d7
	cmp.l %d1,%d7
	jne .L265
	mvz.b 1(%a0),%d1
	moveq #50,%d7
	cmp.l %d1,%d7
	jeq .L260
.L265:
	moveq #1,%d7
	move.b 6(%a1),%d1
	lsl.l %d2,%d7
	or.l %d7,%d1
	move.b %d1,6(%a1)
.L260:
	addq.l #1,%d2
	lea (30,%a0),%a0
	add.l #2330,%d5
	addq.l #5,%d4
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L266
	cmp.l 1187521622.l,%d3
	jne .L258
	mvz.b 269161680,%d1
	cmp.l %d6,%d1
	jne .L258
	move.b 269161679,%d1
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L255
.L267:
	move.w #-1,%a6
	jra .L259
	.size	psl_native_source, .-psl_native_source
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	cmp.l 1187521622.l,%d0
	jeq .L285
.L287:
	clr.l %d0
.L284:
	rts
.L285:
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L287
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L284
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L290
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L291
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L292
.L291:
	moveq #2,%d0
	jra .L288
.L290:
	clr.l %d0
.L288:
	rts
.L292:
	moveq #1,%d0
	jra .L288
	.size	psl_native_popup, .-psl_native_popup
	.align	2
	.globl	psl_native_cursor
	.type	psl_native_cursor, @function
psl_native_cursor:
	move.l 1175346752,%d0
	rts
	.size	psl_native_cursor, .-psl_native_cursor
	.align	2
	.globl	psl_native_set_cursor
	.type	psl_native_set_cursor, @function
psl_native_set_cursor:
	move.l 4(%sp),%d0
	moveq #3,%d1
	cmp.l %d0,%d1
	jcs .L294
	move.l %d0,1175346752
.L294:
	rts
	.size	psl_native_set_cursor, .-psl_native_set_cursor
	.align	2
	.type	move, @function
move:
	lea (-16,%sp),%sp
	move.l phase,%d0
	movem.l #1052,(%sp)
	move.l 20(%sp),%d1
	moveq #1,%d2
	cmp.l %d0,%d2
	jne .L297
	move.l cursor,%d0
	moveq #51,%d3
	cmp.l %d1,%d3
	jne .L298
	tst.l %d0
	jeq .L299
	subq.l #1,%d0
.L324:
	move.l %d0,cursor
.L299:
	move.l cursor,%d0
	moveq #3,%d2
	cmp.l %d0,%d2
	jcc .L300
	moveq #3,%d0
.L300:
	move.l %d0,-(%sp)
	jsr psl_native_set_cursor
	addq.l #4,%sp
.L301:
	moveq #1,%d2
	move.l %d2,1187497772
	movem.l (%sp),#1052
	lea (16,%sp),%sp
	rts
.L298:
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L299
	moveq #4,%d1
	cmp.l %d0,%d1
	jcs .L299
	addq.l #1,%d0
	jra .L324
.L297:
	subq.l #2,%d0
	tst.l %d0
	jne .L301
	move.l eligible,%a0
	tst.l %a0
	jeq .L301
	move.l cursor,%d0
	moveq #3,%d4
	moveq #51,%d2
	and.l %d0,%d4
	lsr.l #2,%d0
	move.l %d4,%a1
	cmp.l %d1,%d2
	jeq .L313
	moveq #32,%d3
	cmp.l %d1,%d3
	jne .L303
	moveq #1,%d2
.L302:
	lsl.l #2,%d0
	move.l %a1,%d1
	add.l %d2,%d1
.L304:
	moveq #3,%d4
	cmp.l %d1,%d4
	jcs .L301
	move.l %d0,%a1
	add.l %d1,%a1
	move.l %a0,%d4
	move.l %a1,%d3
	btst %d3,%d4
	jeq .L305
	move.l %a1,cursor
	jra .L301
.L313:
	moveq #-1,%d2
	jra .L302
.L305:
	add.l %d2,%d1
	jra .L304
.L303:
	moveq #52,%d2
	cmp.l %d1,%d2
	jne .L307
	tst.l %d0
	jeq .L301
.L308:
	moveq #1,%d1
	sub.l %d0,%d1
	lea (%a1,%d1.l*4),%a2
	clr.l %d0
	move.l %a2,%d2
.L312:
	move.l %a1,%d1
	sub.l %d0,%d1
	lsr.l #2,%d1
	jne .L309
	move.l %d2,%d1
	move.l %a0,%d4
	sub.l %d0,%d1
	btst %d1,%d4
	jne .L310
.L309:
	move.l %a1,%d1
	add.l %d0,%d1
	lsr.l #2,%d1
	jne .L311
	move.l %d2,%d1
	move.l %a0,%d4
	add.l %d0,%d1
	btst %d1,%d4
	jeq .L311
.L310:
	move.l %d1,cursor
	jra .L301
.L307:
	moveq #33,%d3
	cmp.l %d1,%d3
	jne .L301
	tst.l %d0
	jne .L301
	jra .L308
.L311:
	addq.l #1,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L312
	jra .L301
	.size	move, .-move
	.align	2
	.globl	module_enc
	.type	module_enc, @function
module_enc:
	move.l phase,%a0
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.l 16(%sp),%d1
	move.l 20(%sp),%d0
	tst.l %a0
	jeq .L347
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L327
	tst.l %d0
	jeq .L328
	tst.l %d1
	jne .L329
	tst.l %d0
	jle .L348
	move.l eligible,%d0
.L330:
	move.l %d0,selected
.L328:
	clr.l message
	moveq #1,%d0
	move.l %d0,1187497772
.L333:
	moveq #1,%d0
.L325:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L348:
	clr.l %d0
	jra .L330
.L329:
	moveq #1,%d2
	cmp.l %d1,%d2
	jne .L331
	move.l cursor,%d2
	move.l eligible,%d3
	btst %d2,%d3
	jeq .L328
	lsl.l %d2,%d1
	move.l selected,%d2
	tst.l %d0
	jle .L332
	or.l %d2,%d1
.L360:
	move.l %d1,selected
	jra .L328
.L332:
	not.l %d1
	and.l %d2,%d1
	jra .L360
.L331:
	subq.l #2,%d1
	tst.l %d1
	jne .L328
	tst.l action
	jne .L328
	tst.l %d0
	sgt %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,replace
	jra .L328
.L327:
	moveq #1,%d2
	cmp.l %a0,%d2
	jne .L333
	subq.l #6,%d1
	tst.l %d1
	jne .L333
	move.l encoder_residual,%d2
	tst.l %d2
	jge .L334
	tst.l %d0
	jgt .L350
.L335:
	move.l %d0,%d3
	tst.l %d0
	jge .L336
	addq.l #3,%d3
.L336:
	move.l %d0,%d1
	asr.l #2,%d3
	and.l #-2147483645,%d1
	tst.l %d0
	jge .L337
	subq.l #1,%d1
	moveq #-4,%d0
	or.l %d0,%d1
	addq.l #1,%d1
.L337:
	add.l %d1,%d2
	move.l %d2,%d0
	and.l #-2147483645,%d0
	tst.l %d2
	jge .L338
	subq.l #1,%d0
	moveq #-4,%d1
	or.l %d1,%d0
	addq.l #1,%d0
.L338:
	move.l %d0,encoder_residual
	tst.l %d2
	jge .L339
	addq.l #3,%d2
.L339:
	asr.l #2,%d2
	moveq #-6,%d0
	add.l %d3,%d2
	cmp.l %d2,%d0
	jle .L340
	moveq #-6,%d2
.L341:
	move.l %d2,%d3
	lea move,%a2
.L342:
	tst.l %d3
	jgt .L343
	move.l %d2,%d0
	tst.l %d2
	jge .L344
	clr.l %d0
.L344:
	sub.l %d0,%d2
	lea move,%a2
.L345:
	tst.l %d2
	jeq .L333
	pea 51.w
	jsr (%a2)
	addq.l #1,%d2
	addq.l #4,%sp
	jra .L345
.L334:
	tst.l %d2
	jeq .L335
	tst.l %d0
	jge .L335
.L350:
	clr.l %d2
	jra .L335
.L340:
	moveq #6,%d1
	cmp.l %d2,%d1
	jge .L341
	moveq #6,%d2
	jra .L341
.L343:
	pea 32.w
	jsr (%a2)
	subq.l #1,%d3
	addq.l #4,%sp
	jra .L342
.L347:
	clr.l %d0
	jra .L325
	.size	module_enc, .-module_enc
	.align	2
	.globl	psl_native_close_popup
	.type	psl_native_close_popup, @function
psl_native_close_popup:
	jmp 1074190164
	.size	psl_native_close_popup, .-psl_native_close_popup
	.align	2
	.globl	psl_native_redraw
	.type	psl_native_redraw, @function
psl_native_redraw:
	moveq #1,%d0
	move.l %d0,1187497772
	rts
	.size	psl_native_redraw, .-psl_native_redraw
	.align	2
	.globl	psl_native_part_menu_draw
	.type	psl_native_part_menu_draw, @function
psl_native_part_menu_draw:
	lea (-56,%sp),%sp
	movem.l #17436,(%sp)
	move.l 60(%sp),%d4
	move.l 72(%sp),%a2
	tst.l %d4
	jeq .L363
	tst.l %a2
	jeq .L363
	moveq #6,%d0
	cmp.l 64(%sp),%d0
	jne .L363
	moveq #5,%d1
	cmp.l 68(%sp),%d1
	jcs .L363
	lea (28,%sp),%a1
	move.l #1074524426,%a0
.L365:
	move.l (%a0)+,(%a1)+
	cmp.l #1074524454,%a0
	jne .L365
	move.w #44,%a6
	move.l %a2,%d3
	move.l %a2,%d2
	move.l %d4,40(%sp)
	add.l #24,%d3
.L368:
	move.l %d2,%a0
	move.l (%a0)+,-(%sp)
	pea -1.w
	move.l #1074505846,-(%sp)
	move.l %a0,%d2
	jsr 1073819440
	lea (12,%sp),%sp
	tst.l %d0
	jle .L366
	addq.l #6,%d0
	cmp.l %a6,%d0
	jls .L366
	move.l %d0,%a6
.L366:
	cmp.l %d2,%d3
	jne .L368
	moveq #116,%d0
	cmp.l %a6,%d0
	jcc .L369
	move.w #116,%a6
.L369:
	move.l #128,%d3
	clr.l %d2
	sub.l %a6,%d3
	lsr.l #1,%d3
	pea 46.w
	move.l %a6,-(%sp)
	pea 9.w
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	jsr psl_font_clear
	pea 46.w
	move.l %a6,-(%sp)
	pea 9.w
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	jsr psl_font_box
	move.l %d3,%d1
	addq.l #3,%d1
	move.l %d1,64(%sp)
	lea (40,%sp),%sp
.L371:
	move.l %d2,%d0
	move.l %d2,%d1
	lsl.l #3,%d0
	sub.l %d0,%d1
	move.l %d1,20(%sp)
	move.l (%a2,%d2.l*4),-(%sp)
	move.l %d1,%a0
	pea -1.w
	pea 47(%a0)
	move.l 36(%sp),-(%sp)
	pea 44(%sp)
	move.l #1074505846,-(%sp)
	jsr 1073818584
	lea (24,%sp),%sp
	cmp.l 68(%sp),%d2
	jne .L370
	pea 7.w
	moveq #11,%d0
	pea -4(%a6)
	sub.l 28(%sp),%d0
	move.l %d3,%a0
	move.l %d0,-(%sp)
	pea 2(%a0)
	move.l %d4,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L370:
	addq.l #1,%d2
	moveq #6,%d0
	cmp.l %d2,%d0
	jne .L371
.L363:
	movem.l (%sp),#17436
	lea (56,%sp),%sp
	rts
	.size	psl_native_part_menu_draw, .-psl_native_part_menu_draw
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"LOCK SAMPLES TO PATTERN"
.LC1:
	.string	"CLEAR SAMPLE LOCKS"
.LC2:
	.string	"    "
.LC3:
	.string	"[X] "
.LC4:
	.string	"[ ] "
.LC5:
	.string	"EXISTING LOCKS: KEEP"
.LC6:
	.string	"INCLUDES MANUAL LOCKS"
.LC7:
	.string	"REPLACE EXISTING: YES"
.LC8:
	.string	"C:REPLACE EXISTING OFF"
.LC9:
	.string	"ALL SAMPLE LOCKS"
.LC10:
	.string	"C:REPLACE EXISTING ON"
.LC11:
	.string	"STOPPING PLAYBACK..."
.LC12:
	.string	"NO:CANCEL"
.LC13:
	.string	"YES/NO:CLOSE"
.LC14:
	.string	"PATTERN "
.LC15:
	.string	"-"
.LC16:
	.string	"YES:APPLY NO:BACK"
.LC17:
	.string	"A:ALL B:TRACK"
.LC18:
	.string	"YES:NEXT NO:CLOSE"
	.text
	.align	2
	.globl	module_draw
	.type	module_draw, @function
module_draw:
	lea (-92,%sp),%sp
	movem.l #31996,(%sp)
	move.l phase,%d2
	move.l 96(%sp),%a6
	tst.l %d2
	jeq .L381
	tst.l %a6
	jeq .L381
	moveq #1,%d0
	cmp.l %d2,%d0
	jne .L383
	pea part_rows
	move.l cursor,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_native_part_menu_draw
	lea (16,%sp),%sp
.L381:
	movem.l (%sp),#31996
	lea (92,%sp),%sp
	rts
.L383:
	move.l %d2,%d0
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L417
	moveq #64,%d4
	sub.l %a2,%a2
	move.l %d4,52(%sp)
.L384:
	move.l 52(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_clear
	lea action,%a0
	move.l (%a0),68(%sp)
	lea (20,%sp),%sp
	tst.l 48(%sp)
	jne .L418
	move.l #.LC0,%d0
.L385:
	move.l %d0,-(%sp)
	pea 2(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	lea psl_font_small_text,%a3
	jsr (%a3)
	pea 7.w
	pea 114.w
	pea 1(%a2)
	pea 7.w
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (36,%sp),%sp
	moveq #5,%d0
	cmp.l %d2,%d0
	jne .L386
	pea .LC11
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC12
.L445:
	pea 26(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	pea 58.w
	pea 116.w
	pea 3.w
.L444:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
	jra .L381
.L417:
	moveq #58,%d5
	move.w #3,%a2
	move.l %d5,52(%sp)
	jra .L384
.L418:
	move.l #.LC1,%d0
	jra .L385
.L386:
	moveq #4,%d1
	cmp.l %d2,%d1
	jne .L387
	move.l message,-(%sp)
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC13
	jra .L445
.L387:
	moveq #3,%d4
	cmp.l %d2,%d4
	jne .L388
	pea .LC14
	move.l #635712,%d5
	move.l %sp,%d3
	add.l #72,%d3
	move.l %d3,-(%sp)
	moveq #10,%d7
	jsr text
	move.l plan,%d0
	add.l #-1074668000,%d0
	divu.l %d5,%d0
	add.l #65,%d0
	move.b %d0,84(%sp)
	mvz.b plan+4,%d0
	addq.l #8,%sp
	addq.l #1,%d0
	remu.l %d7,%d1:%d0
	divu.l %d7,%d0
	add.l #48,%d0
	move.b %d0,77(%sp)
	clr.b %d0
	add.l #48,%d1
	move.b %d1,78(%sp)
	move.b %d0,79(%sp)
	move.l %d3,-(%sp)
	pea 10.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L388:
	moveq #3,%d1
	cmp.l %d2,%d1
	seq %d0
	neg.l %d0
	tst.b %d0
	jeq .L389
	moveq #18,%d4
	move.l %d4,64(%sp)
.L390:
	moveq #3,%d7
	cmp.l %d2,%d7
	sne %d0
	neg.l %d0
	tst.b %d0
	jeq .L391
	lea (72,%sp),%a5
.L392:
	lea (3,%a5),%a0
	clr.l %d3
	move.l %a0,56(%sp)
	lea plan+91,%a0
	move.l %a0,60(%sp)
	lea psl_font_small_text,%a4
.L412:
	moveq #3,%d0
	moveq #3,%d1
	and.l %d3,%d0
	move.l %d3,%d4
	lsr.l #2,%d4
	move.l eligible,%d5
	lsr.l %d3,%d5
	move.l 64(%sp),%a3
	mulu.w #56,%d4
	lsl.l #3,%d0
	move.l %d4,%d6
	add.l #10,%d6
	move.l %d4,44(%sp)
	add.l %d0,%a3
	moveq #1,%d0
	and.l %d0,%d5
	cmp.l %d2,%d1
	jeq .L393
	tst.l %d5
	jeq .L419
	move.l selected,%d0
	btst %d3,%d0
	jeq .L420
	move.l #.LC3,%d0
.L394:
	move.l %d0,-(%sp)
	pea 72(%sp)
	jsr text
	addq.l #8,%sp
.L393:
	move.l %d3,%d0
	add.l #49,%d0
	moveq #3,%d7
	moveq #32,%d4
	move.b #84,(%a5)
	move.b %d0,1(%a5)
	move.b %d4,2(%a5)
	cmp.l %d2,%d7
	jne .L395
	tst.l %d5
	jeq .L396
	move.l selected,%d0
	btst %d3,%d0
	jne .L421
.L396:
	pea .LC15
	move.l 60(%sp),-(%sp)
	jsr text
	addq.l #8,%sp
.L398:
	pea 68(%sp)
	move.l %a3,-(%sp)
	move.l %d6,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_font_small_text
	lea (16,%sp),%sp
	tst.l %d5
	jne .L403
	tst.l 44(%sp)
	seq %d4
	neg.l %d4
	tst.b %d4
	jeq .L404
	moveq #58,%d7
.L405:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L406
	move.w #1,%a0
.L407:
	add.l %a3,%a0
.L408:
	cmp.l %d6,%d7
	jls .L411
	mvz.w %d6,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
.L410:
	move.w %d0,%d4
	moveq #3,%d5
	mulu.w #3,%d4
	add.l %d6,%d4
	and.l %d5,%d4
	tst.l %d4
	jne .L409
	moveq #7,%d5
	and.l %d0,%d5
	move.l %d0,%d4
	lsr.l #3,%d4
	move.l %d1,%a1
	sub.l %d4,%a1
	moveq #1,%d4
	add.l %a6,%a1
	lsl.l %d5,%d4
	move.b (%a1),%d5
	not.l %d4
	and.l %d5,%d4
	move.b %d4,(%a1)
.L409:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L410
	addq.l #1,%d6
	jra .L408
.L389:
	moveq #10,%d5
	move.l %d5,64(%sp)
	jra .L390
.L391:
	lea (68,%sp),%a5
	jra .L392
.L419:
	move.l #.LC2,%d0
	jra .L394
.L420:
	move.l #.LC4,%d0
	jra .L394
.L421:
	move.l 60(%sp),%a1
	clr.l %d0
	sub.l %a0,%a0
.L397:
	move.b (%a1)+,%d7
	addq.l #1,%a0
	move.b 511(%a1),%d1
	eor.l %d7,%d1
	tst.b %d1
	sne %d1
	mvs.b %d1,%d1
	sub.l %d1,%d0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L397
	moveq #99,%d4
	cmp.l %d0,%d4
	jcc .L399
	moveq #100,%d4
	move.l %d0,%d7
	divu.l %d4,%d7
	lea (4,%a5),%a0
	moveq #10,%d1
	remu.l %d1,%d4:%d7
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,3(%a5)
.L400:
	moveq #10,%d4
	move.l %d0,%d1
	divu.l %d4,%d1
	move.l %d1,%d7
	remu.l %d4,%d1:%d7
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L401
.L399:
	move.l 56(%sp),%a0
	moveq #9,%d7
	cmp.l %d0,%d7
	jcs .L400
.L401:
	moveq #10,%d4
	remu.l %d4,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L398
.L395:
	tst.l %d5
	jeq .L423
	lea captured+7,%a0
	tst.b (%a0,%d3.l)
	jeq .L424
	moveq #70,%d0
.L402:
	move.b %d0,3(%a5)
	clr.b %d0
	move.b %d0,4(%a5)
	jra .L398
.L423:
	moveq #45,%d0
	jra .L402
.L424:
	moveq #83,%d0
	jra .L402
.L404:
	moveq #114,%d7
	jra .L405
.L406:
	move.w #5,%a0
	jra .L407
.L403:
	moveq #2,%d7
	cmp.l %d2,%d7
	jne .L411
	cmp.l cursor.l,%d3
	jne .L411
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l 56(%sp),%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L411:
	moveq #64,%d0
	addq.l #1,%d3
	moveq #8,%d1
	add.l %d0,60(%sp)
	cmp.l %d3,%d1
	jne .L412
	subq.l #3,%d2
	tst.l %d2
	jne .L413
	moveq #1,%d5
	cmp.l 48(%sp),%d5
	jeq .L425
	tst.l replace
	jeq .L426
	move.l #.LC7,%d0
.L414:
	move.l %d0,-(%sp)
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	lea psl_font_small_text,%a3
	jsr (%a3)
	pea .LC16
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
.L415:
	move.l 52(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L444
.L425:
	move.l #.LC6,%d0
	jra .L414
.L426:
	move.l #.LC5,%d0
	jra .L414
.L413:
	move.l message,%d0
	tst.l %d0
	jne .L416
	moveq #1,%d7
	cmp.l 48(%sp),%d7
	jeq .L427
	tst.l replace
	jeq .L428
	move.l #.LC10,%d0
.L416:
	move.l %d0,-(%sp)
	pea 42.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC17
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (28,%sp),%sp
	move.l #.LC18,(%sp)
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	jra .L415
.L427:
	move.l #.LC9,%d0
	jra .L416
.L428:
	move.l #.LC8,%d0
	jra .L416
	.size	module_draw, .-module_draw
	.align	2
	.globl	psl_native_transport
	.type	psl_native_transport, @function
psl_native_transport:
	move.l #-2147463394,%a0
.L448:
	tst.b (%a0)
	jne .L451
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L448
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L452
.L450:
	moveq #1,%d0
.L446:
	rts
.L452:
	move.l #-2147457792,%a0
.L449:
	tst.b (%a0)
	jne .L450
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L449
	jra .L446
.L451:
	moveq #2,%d0
	jra .L446
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.globl	psl_native_stop
	.type	psl_native_stop, @function
psl_native_stop:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L456
.L458:
	clr.l %d0
.L455:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L456:
	tst.w 1175263050.l
	jne .L458
#APP
| 90 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d3
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	move.b 1175456540,%d2
	pea 36.w
	move.l #1074340436,%a2
	jsr (%a2)
	moveq #-128,%d0
	or.l %d2,%d0
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr (%a2)
	pea 36.w
	jsr (%a2)
	moveq #127,%d0
	and.l %d2,%d0
	move.l %d0,-(%sp)
	jsr (%a2)
#APP
| 93 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	moveq #1,%d0
	lea (16,%sp),%sp
	jra .L455
	.size	psl_native_stop, .-psl_native_stop
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	lea (-344,%sp),%sp
	movem.l #31996,(%sp)
	move.l 348(%sp),%a6
#APP
| 102 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d3
| 0 "" 2
#NO_APP
	move.l %d3,%d0
	and.l #1792,%d0
	cmp.l #1023,%d0
	jhi .L460
	move.l %d3,%d0
	and.l #-1793,%d0
	bset #10,%d0
#APP
| 104 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
.L460:
	tst.l %a6
	jeq .L464
	tst.b 10(%a6)
	jeq .L464
	jsr psl_native_transport
	tst.l %d0
	jne .L464
	move.l %sp,%d4
	add.l #160,%d4
	move.l %d4,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L464
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L465
	tst.w 1116(%a6)
	jne .L502
	clr.b %d0
	move.b %d0,10(%a6)
.L465:
#APP
| 176 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	jra .L459
.L502:
	clr.l %d0
	lea (280,%sp),%a0
.L466:
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b (%a1),%d1
	lea (216,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L466
	mvz.b 4(%a6),%d5
	mvz.b 7(%a6),%d6
	move.l %d4,%a1
	clr.l %d1
	lea (91,%a6),%a4
	clr.l %d4
	move.w %d5,%d0
	lea (24,%a1),%a1
	lea (96,%sp),%a2
	lea (128,%sp),%a5
	move.l %d5,74(%sp)
	move.l %d6,78(%sp)
	move.l %a1,62(%sp)
	move.l %a2,50(%sp)
	move.l %a4,54(%sp)
	move.l %a4,%d7
	mulu.w #36568,%d0
	move.l %a5,66(%sp)
	clr.l 58(%sp)
	move.l %d0,%a0
	add.l #268525902,%a0
.L476:
	move.l 62(%sp),%a1
	move.l 50(%sp),%a2
	move.l 66(%sp),%a4
	move.l (%a1),%d0
	move.l 78(%sp),%d5
	move.l %a0,(%a4)
	move.l %d0,(%a2)
	btst %d1,%d5
	jeq .L468
	mvz.w %d1,%d5
	sub.l %a1,%a1
	lsl.l #3,%d5
	lea (%a6,%d5.l),%a2
.L470:
	mvz.b (%a1,%a0.l),%d6
	mvz.b 27(%a2,%a1.l),%d5
	cmp.l %d6,%d5
	jne .L469
	addq.l #1,%a1
	moveq #8,%d6
	cmp.l %a1,%d6
	jne .L470
	moveq #1,%d6
	moveq #89,%d5
	lsl.l %d1,%d6
	lea (31,%a0),%a2
	lea (280,%sp),%a1
	move.l %d7,%a3
	move.l %a2,88(%sp)
	move.l %d6,70(%sp)
	not.l %d6
	move.l %d6,92(%sp)
.L475:
	move.b (%a3),86(%sp)
	move.l 88(%sp),%a4
	add.l %d5,%a4
	move.l %a4,82(%sp)
	mvz.b (%a4),%d6
	move.l %d6,%a4
	mvz.b 86(%sp),%d6
	cmp.l %a4,%d6
	jne .L469
	move.b 512(%a3),%d6
	addq.l #1,%a3
	move.b %d6,87(%sp)
	mvz.b %d6,%d6
	move.l %d6,46(%sp)
	cmp.l %a4,%d6
	jeq .L471
	moveq #10,%d6
	muls.l %d4,%d6
	move.l %d0,%a2
	addq.l #1,%d4
	lea (120,%a2),%a2
	move.l %d6,%a4
	move.l #edits,%d6
	move.l %a2,(%a4,%d6.l)
	move.l %a4,%a2
	add.l %d6,%a2
	move.b 86(%sp),%d6
	move.l 82(%sp),%a4
	move.l %a4,4(%a2)
	move.b %d6,8(%a2)
	move.b 87(%sp),%d6
	move.b %d6,9(%a2)
	move.l 70(%sp),%d6
	or.l %d6,58(%sp)
	move.l 46(%sp),%d6
	cmp.l #255,%d6
	jne .L472
	sub.l %a2,%a2
.L473:
	mvz.b 89(%a2,%d0.l),%d6
	cmp.l #255,%d6
	jne .L472
	addq.l #1,%a2
	moveq #31,%d6
	cmp.l %a2,%d6
	jne .L473
	move.b (%a1),%d6
	and.l 92(%sp),%d6
	jra .L531
.L472:
	move.b (%a1),%d6
	or.l 70(%sp),%d6
.L531:
	move.b %d6,(%a1)
.L471:
	addq.l #1,%a1
	add.l #32,%d0
	add.l #32,%d5
	cmp.l #2137,%d5
	jne .L475
.L468:
	addq.l #4,62(%sp)
	addq.l #4,50(%sp)
	addq.l #4,66(%sp)
	addq.l #1,%d1
	lea (2330,%a0),%a0
	add.l #64,%d7
	moveq #8,%d0
	cmp.l %d1,%d0
	jne .L476
	jsr psl_native_transport
	move.l %d0,%d5
	tst.l %d0
	jne .L469
	mvz.b 5(%a6),%d7
	move.l (%a6),%d6
	move.l %d7,-(%sp)
	move.l 78(%sp),-(%sp)
	move.l %d6,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L469
	lea (216,%sp),%a1
	move.l #1187501196,%a0
.L480:
	mvz.b (%a0),%d1
	mvz.b (%a1)+,%d0
	cmp.l %d1,%d0
	jeq .L479
	moveq #3,%d2
.L479:
	addq.l #1,%a0
	cmp.l #1187501260,%a0
	jne .L480
	mulu.w #6322,%d7
	move.l %d6,%a1
	add.l #585088,%a1
	clr.l %d1
	move.l #714,%d6
	add.l %d7,%a1
	lea (34,%a1),%a3
.L487:
	move.l 78(%sp),%d7
	btst %d1,%d7
	jeq .L481
	mvz.b (%a3,%d1.l),%d0
	mvz.b 11(%a6,%d1.l),%d7
	cmp.l %d0,%d7
	jne .L505
	move.l %d0,%a0
	add.l %d6,%a0
	mvz.b 19(%a6,%d1.l),%d0
	mvz.b (%a1,%a0.l),%d7
	cmp.l %d7,%d0
	jne .L505
.L482:
	mvz.w %d1,%d0
	move.l 96(%sp,%d1.l*4),%a2
	lsl.l #3,%d0
	lea (%a6,%d0.l),%a4
	clr.l %d0
.L484:
	mvz.b (%a2,%d0.l),%d7
	move.l %d7,62(%sp)
	mvz.b 27(%a4,%d0.l),%d7
	cmp.l 62(%sp),%d7
	jne .L507
	move.l (%a5),%a0
	mvz.b (%a0,%d0.l),%d7
	cmp.l 62(%sp),%d7
	jne .L507
.L483:
	addq.l #1,%d0
	moveq #8,%d7
	cmp.l %d0,%d7
	jne .L484
	move.l 54(%sp),%a4
	moveq #120,%d0
.L486:
	mvz.b (%a2,%d0.l),%d7
	move.l %d7,62(%sp)
	mvz.b (%a4)+,%d7
	cmp.l 62(%sp),%d7
	jne .L509
	move.l (%a5),%a0
	mvz.b (%a0,%d0.l),%d7
	cmp.l 62(%sp),%d7
	jne .L509
.L485:
	add.l #32,%d0
	cmp.l #2168,%d0
	jne .L486
.L481:
	moveq #64,%d0
	addq.l #1,%d1
	addq.l #4,%a5
	add.l %d0,54(%sp)
	addq.l #5,%d6
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L487
	tst.l %d2
	jne .L465
	clr.l %d0
	lea (280,%sp),%a2
	lea edits,%a1
.L490:
	move.b (%a2,%d0.l),%d6
	lea (216,%sp),%a0
	mvz.b (%a0,%d0.l),%d7
	mvz.b %d6,%d1
	cmp.l %d7,%d1
	jeq .L489
	moveq #10,%d1
	muls.l %d4,%d1
	move.l %d0,%a4
	add.l #1187501196,%a4
	addq.l #1,%d4
	lea (%a1,%d1.l),%a0
	move.b %d6,9(%a0)
	move.l %a4,(%a1,%d1.l)
	clr.l 4(%a0)
.L489:
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L490
	clr.l %d0
	lea psl_write_batch,%a2
.L491:
	cmp.l %d0,%d4
	jhi .L493
	clr.b %d7
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d6
	move.l %d6,269452696
	move.b %d7,10(%a6)
#APP
| 176 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	tst.l 58(%sp)
	jne .L494
.L459:
	move.l %d2,%d0
	movem.l (%sp),#31996
	lea (344,%sp),%sp
	rts
.L505:
	moveq #3,%d2
	jra .L482
.L507:
	moveq #3,%d2
	jra .L483
.L509:
	moveq #3,%d2
	jra .L485
.L493:
	move.l %d0,%d6
	add.l #16,%d6
	move.l %d6,%d1
	cmp.l %d6,%d4
	jcc .L492
	move.l %d4,%d1
.L492:
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	move.l %d6,%d0
	jra .L491
.L464:
#APP
| 176 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	moveq #1,%d2
	jra .L459
.L469:
#APP
| 176 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	moveq #3,%d2
	jra .L459
.L494:
	jsr 1073905152
.L500:
	move.l 58(%sp),%d1
	btst %d5,%d1
	jeq .L499
	move.l %d5,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L499:
	addq.l #1,%d5
	moveq #8,%d6
	cmp.l %d5,%d6
	jne .L500
	jra .L459
	.size	psl_native_commit, .-psl_native_commit
	.section	.rodata.str1.1
.LC19:
	.string	"SOURCE CHANGED - REOPEN"
.LC20:
	.string	"REFUSED - NO CHANGES"
	.text
	.align	2
	.type	finish_action, @function
finish_action:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	tst.l %d0
	jne .L533
	jra close_view
.L533:
	subq.l #3,%d0
	tst.l %d0
	jne .L535
	move.l #.LC19,%d0
.L534:
	move.l %d0,message
	moveq #4,%d1
	clr.b %d0
	move.l %d1,phase
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	rts
.L535:
	move.l #.LC20,%d0
	jra .L534
	.size	finish_action, .-finish_action
	.section	.rodata.str1.1
.LC21:
	.string	"RECORDER ACTIVE - REFUSED"
.LC22:
	.string	"STOP TIMED OUT - REFUSED"
	.text
	.align	2
	.globl	module_tick
	.type	module_tick, @function
module_tick:
	moveq #1,%d0
	cmp.l phase.l,%d0
	jne .L537
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jeq .L537
	jsr close_view
.L537:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L538
	subq.l #4,%d0
	tst.l %d0
	jeq .L538
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L539
.L541:
	jsr close_view
.L540:
	moveq #5,%d0
	cmp.l phase.l,%d0
	jne .L538
	jsr psl_native_transport
	tst.l %d0
	jne .L542
	jsr finish_action
.L538:
	move.l phase,%d0
	moveq #24,%d1
	move.l 4(%sp),%a0
	lsl.l %d1,%d0
	move.l selected,%d1
	swap %d1
	clr.w %d1
	or.l %d1,%d0
	mvz.w plan+1116,%d1
	or.l %d1,%d0
	move.l %d0,(%a0)
	rts
.L539:
	jsr psl_native_popup
	tst.l %d0
	jne .L541
	jra .L540
.L542:
	subq.l #2,%d0
	tst.l %d0
	jeq .L545
	move.l stop_ticks,%d0
	addq.l #1,%d0
	move.l %d0,stop_ticks
	moveq #119,%d1
	cmp.l %d0,%d1
	jcc .L544
	move.l #.LC22,%d0
.L543:
	move.l %d0,message
	moveq #4,%d1
	move.l %d1,phase
	clr.b %d0
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	jra .L538
.L545:
	move.l #.LC21,%d0
	jra .L543
.L544:
	tst.l stop_requested
	jne .L538
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L538
	.size	module_tick, .-module_tick
	.section	.rodata.str1.1
.LC23:
	.string	"ACTIVE PATTERN ONLY"
.LC24:
	.string	"SELECT TRACKS FIRST"
.LC25:
	.string	"CHECK SAMPLE ASSIGNMENTS"
	.text
	.align	2
	.globl	module_key
	.type	module_key, @function
module_key:
	lea (-84,%sp),%sp
	move.l 88(%sp),%d1
	movem.l #17468,(%sp)
	move.l 92(%sp),%d0
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L553
	moveq #31,%d3
	moveq #1,%d2
	and.l %d1,%d3
	move.l %d1,%d4
	lsr.l #5,%d4
	lea consumed,%a0
	lsl.l %d3,%d2
	move.l (%a0,%d4.l*4),%d3
	move.l %d2,%d5
	and.l %d3,%d5
	move.l %d5,%a6
	tst.l %d0
	jne .L554
	tst.l %d5
	jeq .L555
	not.l %d2
	and.l %d3,%d2
	move.l %d2,(%a0,%d4.l*4)
.L556:
	moveq #1,%d0
	jra .L555
.L554:
	tst.l %d5
	jne .L556
	move.l phase,%d0
	tst.l %d0
	jeq .L553
	moveq #5,%d5
	cmp.l %d0,%d5
	jne .L557
	moveq #39,%d0
	cmp.l %d1,%d0
	jeq .L553
	or.l %d3,%d2
	move.l %d2,(%a0,%d4.l*4)
	moveq #50,%d2
	cmp.l %d1,%d2
	jne .L556
.L563:
	jsr close_view
	jra .L556
.L557:
	move.l %d1,%a0
	moveq #3,%d4
	lea (-49,%a0),%a0
	cmp.l %a0,%d4
	jcc .L558
	lea (17,%a0),%a0
	moveq #1,%d5
	cmp.l %a0,%d5
	jcc .L558
.L561:
	jsr close_view
.L553:
	clr.l %d0
.L555:
	movem.l (%sp),#17468
	lea (84,%sp),%sp
	rts
.L558:
	moveq #1,%d4
	cmp.l %d0,%d4
	jne .L559
	moveq #49,%d5
	cmp.l %d1,%d5
	jne .L560
	moveq #3,%d4
	cmp.l cursor.l,%d4
	jcc .L561
.L559:
	or.l %d3,%d2
	move.l %d2,consumed+4
	moveq #50,%d2
	cmp.l %d1,%d2
	jne .L562
	subq.l #3,%d0
	tst.l %d0
	jne .L563
	moveq #2,%d5
	clr.b %d0
	move.l %d5,phase
	clr.l message
	move.b %d0,plan+10
.L578:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L556
.L560:
	moveq #50,%d5
	cmp.l %d1,%d5
	jne .L559
	jra .L561
.L562:
	move.l %d1,%a0
	moveq #1,%d2
	lea (-51,%a0),%a0
	cmp.l %a0,%d2
	jcc .L564
	lea (19,%a0),%a0
	cmp.l %a0,%d2
	jcs .L565
.L564:
	move.l %d1,-(%sp)
	jsr move
	addq.l #4,%sp
	jra .L556
.L565:
	moveq #1,%d4
	cmp.l %d0,%d4
	jne .L566
	moveq #4,%d5
	cmp.l cursor.l,%d5
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,action
	jsr psl_native_close_popup
	pea captured
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L567
	lea .LC23,%a2
	move.l %a2,message
	move.l %d5,phase
.L603:
	move.l %d4,1187497772
	jra .L556
.L567:
	clr.b %d4
	mvz.b captured+6,%d1
	moveq #2,%d2
	clr.l cursor
	clr.l replace
	move.l %d1,eligible
	clr.l selected
	move.l %d2,phase
	clr.l message
	move.b %d4,plan+10
	tst.l %d1
	jeq .L568
	clr.b %d2
.L569:
	move.l %a6,%d5
	move.l %d1,%d3
	lsr.l %d5,%d3
	addq.l #1,%a6
	btst #0,%d3
	jeq .L580
	tst.b %d2
	jeq .L568
	move.l %d5,cursor
.L568:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L555
.L580:
	moveq #1,%d2
	jra .L569
.L566:
	moveq #2,%d2
	cmp.l %d0,%d2
	jne .L570
	move.l %sp,%d4
	add.l #28,%d4
	move.l %d4,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L571
	move.l 28(%sp),%d3
	cmp.l captured.l,%d3
	jne .L571
	mvz.w 32(%sp),%d1
	mvz.w captured+4,%d0
	cmp.l %d1,%d0
	jne .L571
	move.b 34(%sp),%d2
	mvz.b %d2,%d0
	cmp.l eligible.l,%d0
	jeq .L572
.L571:
	move.l #.LC19,%d4
	moveq #4,%d5
	move.l %d4,message
	move.l %d5,phase
.L573:
	moveq #1,%d4
	jra .L603
.L572:
	move.w 32(%sp),%a2
	move.w %a2,26(%sp)
	move.l replace,-(%sp)
	move.l action,-(%sp)
	move.l selected,-(%sp)
	move.l %d4,-(%sp)
	pea plan
	jsr psl_prepare
	lea (20,%sp),%sp
	moveq #2,%d1
	cmp.l %d0,%d1
	jne .L574
	move.l #.LC24,%d2
	move.l %d2,message
	jra .L573
.L574:
	tst.l %d0
	jeq .L575
	move.l #.LC25,%d4
	move.l %d4,message
	jra .L573
.L575:
	move.w 26(%sp),%d5
	move.b %d2,captured+6
	move.l %d3,captured
	move.l #captured+24,%d0
	lea (35,%sp),%a1
	lea captured+7,%a0
	move.w %d5,captured+4
.L576:
	move.b (%a1)+,(%a0)+
	lea 52(%a6,%sp.l),%a2
	moveq #32,%d1
	move.b 7(%a1),7(%a0)
	move.l (%a2),(%a6,%d0.l)
	addq.l #4,%a6
	cmp.l %a6,%d1
	jne .L576
	moveq #3,%d2
	move.l %d2,phase
	jra .L573
.L570:
	subq.l #3,%d0
	tst.l %d0
	jne .L563
	jsr psl_native_transport
	moveq #2,%d1
	cmp.l %d0,%d1
	jne .L577
	clr.b %d4
	move.l #.LC21,%d2
	moveq #4,%d5
	move.l %d2,message
	move.l %d5,phase
	move.b %d4,plan+10
	jra .L578
.L577:
	tst.l %d0
	jne .L579
	jsr finish_action
	jra .L578
.L579:
	moveq #5,%d0
	move.l %d0,phase
	clr.l stop_ticks
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L578
	.size	module_key, .-module_key
	.align	2
	.globl	psl_open
	.type	psl_open, @function
psl_open:
	lea (-16,%sp),%sp
	movem.l #60,(%sp)
	move.l 36(%sp),%d2
	move.l 32(%sp),%d3
	move.l 20(%sp),%d5
	move.l 28(%sp),%d4
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l 36(%sp),-(%sp)
	move.l %d5,-(%sp)
	jsr 1074190668
	lea (20,%sp),%sp
	subq.l #4,%d5
	tst.l %d5
	jne .L604
	cmp.l #1175261212,%d4
	jne .L604
	cmp.l #1074502420,%d3
	jne .L604
	cmp.l #1074502404,%d2
	jne .L604
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jne .L604
	movem.l (%sp),#60
	lea (16,%sp),%sp
	jra psl_ui_open
.L604:
	movem.l (%sp),#60
	lea (16,%sp),%sp
	rts
	.size	psl_open, .-psl_open
	.section	.rodata
	.type	digit.0, @object
	.size	digit.0, 50
digit.0:
	.base64	"BwUFBQc="
	.base64	"AgYCAgc="
	.base64	"BgEHBAc="
	.base64	"BgECAQY="
	.base64	"BQUHAQE="
	.base64	"BwQGAQY="
	.base64	"AwQHBQc="
	.base64	"BwECAgI="
	.base64	"BwUHBQc="
	.base64	"BwUHAQY="
	.type	alpha.1, @object
	.size	alpha.1, 130
alpha.1:
	.base64	"AgUHBQU="
	.base64	"BgUGBQY="
	.base64	"AwQEBAM="
	.base64	"BgUFBQY="
	.base64	"BwQGBAc="
	.base64	"BwQGBAQ="
	.base64	"AwQFBQM="
	.base64	"BQUHBQU="
	.base64	"BwICAgc="
	.base64	"AQEBBQI="
	.base64	"BQUGBQU="
	.base64	"BAQEBAc="
	.base64	"BQcHBQU="
	.base64	"BQcHBwU="
	.base64	"AgUFBQI="
	.base64	"BgUGBAQ="
	.base64	"AgUFAwE="
	.base64	"BgUGBQU="
	.base64	"AwQCAQY="
	.base64	"BwICAgI="
	.base64	"BQUFBQc="
	.base64	"BQUFBQI="
	.base64	"BQUHBwU="
	.base64	"BQUCBQU="
	.base64	"BQUCAgI="
	.base64	"BwECBAc="
	.globl	psl_guard_spans
	.section	.bss
	.align	2
	.type	psl_guard_spans, @object
	.size	psl_guard_spans, 4
psl_guard_spans:
	.zero	4
	.globl	psl_guard_max
	.align	2
	.type	psl_guard_max, @object
	.size	psl_guard_max, 4
psl_guard_max:
	.zero	4
	.local	edits
	.comm	edits,5760,2
	.section	.rodata.str1.1
.LC26:
	.string	"RENAME"
.LC27:
	.string	"RELOAD"
.LC28:
	.string	"SAVE"
.LC29:
	.string	"SAVE ALL"
	.section	.rodata
	.align	2
	.type	part_rows, @object
	.size	part_rows, 24
part_rows:
	.long	.LC26
	.long	.LC27
	.long	.LC28
	.long	.LC29
	.long	.LC0
	.long	.LC1
	.local	encoder_residual
	.comm	encoder_residual,4,2
	.local	consumed
	.comm	consumed,8,2
	.local	message
	.comm	message,4,2
	.local	captured
	.comm	captured,56,2
	.local	plan
	.comm	plan,1120,2
	.local	eligible
	.comm	eligible,4,2
	.local	action
	.comm	action,4,2
	.local	replace
	.comm	replace,4,2
	.local	selected
	.comm	selected,4,2
	.local	cursor
	.comm	cursor,4,2
	.local	phase
	.comm	phase,4,2
	.local	stop_requested
	.comm	stop_requested,4,2
	.local	stop_ticks
	.comm	stop_ticks,4,2
	.type	digits, @object
	.size	digits, 70
digits:
	.base64	"DhETFRkRDg=="
	.base64	"BAwEBAQEDg=="
	.base64	"DhEBAgQIHw=="
	.base64	"HgEBDgEBHg=="
	.base64	"AgYKEh8CAg=="
	.base64	"HxAQHgEBHg=="
	.base64	"DhAQHhERDg=="
	.base64	"HwECBAgICA=="
	.base64	"DhERDhERDg=="
	.base64	"DhERDwEBDg=="
	.type	letters, @object
	.size	letters, 182
letters:
	.base64	"DhERHxEREQ=="
	.base64	"HhERHhERHg=="
	.base64	"DhEQEBARDg=="
	.base64	"HhERERERHg=="
	.base64	"HxAQHhAQHw=="
	.base64	"HxAQHhAQEA=="
	.base64	"DhEQFxERDg=="
	.base64	"ERERHxEREQ=="
	.base64	"HwQEBAQEHw=="
	.base64	"AQEBARERDg=="
	.base64	"ERIUGBQSEQ=="
	.base64	"EBAQEBAQHw=="
	.base64	"ERsVFREREQ=="
	.base64	"ERkVExEREQ=="
	.base64	"DhERERERDg=="
	.base64	"HhERHhAQEA=="
	.base64	"DhERERUSDQ=="
	.base64	"HhERHhQSEQ=="
	.base64	"DxAQDgEBHg=="
	.base64	"HwQEBAQEBA=="
	.base64	"ERERERERDg=="
	.base64	"EREREREKBA=="
	.base64	"ERERFRUVCg=="
	.base64	"EREKBAoREQ=="
	.base64	"EREKBAQEBA=="
	.base64	"HwECBAgQHw=="
	.ident	"GCC: (GNU) 16.2.0"
