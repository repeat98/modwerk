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
	.type	psl_write_step, @function
psl_write_step:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
#APP
| 112 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d2
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	move.l -66600948,%a1
	clr.l %d0
	lea edits,%a0
.L6:
	addq.l #1,%d0
	move.b 8(%a0),%d1
	move.l (%a0),%a2
	lea (10,%a0),%a0
	move.b %d1,(%a2)
	move.l -6(%a0),%a2
	move.b %d1,(%a2)
	cmp.l 12(%sp),%d0
	jne .L6
	move.l 16(%sp),%a0
	add.l #1187501196,%a0
	move.b (%a0),%d0
	move.l 24(%sp),%d1
	not.l %d1
	or.l 20(%sp),%d0
	and.l %d1,%d0
	move.b %d0,(%a0)
	move.l -66600948,%d0
	sub.l %a1,%d0
#APP
| 117 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d2,%sr
| 0 "" 2
#NO_APP
	addq.l #1,psl_guard_spans
	cmp.l psl_guard_max.l,%d0
	jls .L5
	move.l %d0,psl_guard_max
.L5:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
	.size	psl_write_step, .-psl_write_step
	.align	2
	.type	source_valid, @function
source_valid:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	tst.l %a0
	jne .L10
.L12:
	clr.l %d0
.L9:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L10:
	tst.l (%a0)
	jeq .L12
	mvz.b 4(%a0),%d0
	lsr.l #4,%d0
	jne .L12
	mvz.b 5(%a0),%d0
	lsr.l #2,%d0
	jne .L12
	mvz.b 6(%a0),%d2
	clr.l %d0
.L15:
	btst %d0,%d2
	jeq .L13
	tst.l 24(%a0,%d0.l*4)
	jeq .L12
	move.b 7(%a0,%d0.l),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	lsr.l #1,%d1
	jne .L12
	move.w %a1,%d3
	mvz.b 15(%a0,%d0.l),%d1
	tst.b %d3
	jeq .L16
	move.w #135,%a1
.L14:
	cmp.l %d1,%a1
	jcc .L13
	cmp.l #255,%d1
	jne .L12
.L13:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L15
	moveq #1,%d0
	jra .L9
.L16:
	move.w #127,%a1
	jra .L14
	.size	source_valid, .-source_valid
	.align	2
	.type	pixel, @function
pixel:
	move.l %d2,-(%sp)
	moveq #127,%d2
	move.l 12(%sp),%d0
	move.l 16(%sp),%d1
	cmp.l %d0,%d2
	jcs .L21
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L21
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
	jeq .L23
	eor.l %d1,%d0
.L24:
	move.b %d0,(%a0)
.L21:
	move.l (%sp)+,%d2
	rts
.L23:
	or.l %d1,%d0
	jra .L24
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
	jeq .L40
	clr.b %d0
	move.b %d0,10(%a2)
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L40
	cmp.l #255,%d2
	jhi .L25
	move.b 6(%a3),%d4
	mvz.b %d4,%d1
	not.l %d1
	and.l %d2,%d1
	tst.l %d1
	jne .L25
	move.l 76(%sp),%d1
	or.l %d3,%d1
	lsr.l #1,%d1
	jne .L25
	tst.l %d2
	jeq .L41
	clr.l %d1
.L30:
	btst %d1,%d2
	jeq .L29
	tst.l %d3
	jne .L29
	mvz.b 15(%a3,%d1.l),%d5
	cmp.l #255,%d5
	jeq .L25
.L29:
	addq.l #1,%d1
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L30
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
.L38:
	move.b (%a4)+,(%a5)+
	move.b 7(%a4),%d0
	move.b %d0,55(%sp)
	move.b %d0,7(%a5)
	btst %d1,%d2
	jeq .L31
	mvz.w %d1,%d0
	move.l 24(%a3,%d1.l*4),%d6
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a1
	clr.l %d0
.L32:
	move.l %d6,%a0
	moveq #8,%d4
	lea (%a0,%d0.l),%a6
	move.b (%a6),27(%a1,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d4
	jne .L32
	move.l 50(%sp),%d5
	move.l %d6,%a6
	lea (120,%a6),%a6
	sub.l %a0,%a0
.L37:
	move.b (%a6),%d4
	moveq #1,%d7
	cmp.l %d3,%d7
	jeq .L42
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
	jeq .L34
	mvz.b %d4,%d0
	cmp.l #255,%d0
	jne .L35
.L36:
	move.b 55(%sp),%d0
.L33:
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
	jne .L37
.L31:
	moveq #64,%d4
	addq.l #1,%d1
	add.l %d4,50(%sp)
	moveq #8,%d5
	cmp.l %d1,%d5
	jne .L38
	moveq #1,%d7
	clr.l %d0
	move.b %d7,10(%a2)
.L25:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L35:
	tst.l 76(%sp)
	jne .L36
	move.w 1118(%a2),%d0
	addq.l #1,%d0
	move.w %d0,1118(%a2)
.L34:
	move.b %d4,%d0
	jra .L33
.L42:
	st %d0
	jra .L33
.L40:
	moveq #1,%d0
	jra .L25
.L41:
	moveq #2,%d0
	jra .L25
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
	jne .L60
.L62:
	moveq #1,%d0
.L59:
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L60:
	tst.b 10(%a2)
	jeq .L62
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L62
	move.l (%a2),%d0
	cmp.l (%a3),%d0
	jeq .L63
.L64:
	moveq #3,%d0
	jra .L59
.L63:
	mvz.b 4(%a3),%d1
	mvz.b 4(%a2),%d0
	cmp.l %d1,%d0
	jne .L64
	mvz.b 5(%a3),%d1
	mvz.b 5(%a2),%d0
	cmp.l %d1,%d0
	jne .L64
	mvz.b 6(%a3),%d1
	mvz.b 6(%a2),%d0
	cmp.l %d1,%d0
	jne .L64
	mvz.b 7(%a2),%d3
	move.l %a2,%d2
	clr.l %d0
	add.l #91,%d2
.L68:
	btst %d0,%d3
	jeq .L65
	mvz.b 7(%a3,%d0.l),%d4
	mvz.b 11(%a2,%d0.l),%d1
	cmp.l %d4,%d1
	jne .L64
	mvz.b 15(%a3,%d0.l),%d4
	mvz.b 19(%a2,%d0.l),%d1
	cmp.l %d4,%d1
	jne .L64
	mvz.w %d0,%d1
	move.l 24(%a3,%d0.l*4),%a0
	lsl.l #3,%d1
	lea (%a2,%d1.l),%a1
	clr.l %d1
.L66:
	mvz.b (%a0,%d1.l),%d5
	mvz.b 27(%a1,%d1.l),%d4
	cmp.l %d5,%d4
	jne .L64
	addq.l #1,%d1
	moveq #8,%d4
	cmp.l %d1,%d4
	jne .L66
	lea (120,%a0),%a1
	lea (2168,%a0),%a0
	move.l %d2,%d1
.L67:
	move.l %d1,%a4
	mvz.b (%a1),%d5
	mvz.b (%a4),%d4
	cmp.l %d5,%d4
	jne .L64
	addq.l #1,%d1
	lea (32,%a1),%a1
	cmp.l %a1,%a0
	jne .L67
.L65:
	addq.l #1,%d0
	add.l #64,%d2
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L68
	clr.l %d0
	jra .L59
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
	jne .L78
	tst.l %a3
	jeq .L81
	tst.l %a4
	jeq .L81
	clr.l %d1
.L82:
	move.l (%a3,%d1.l),%a1
	tst.l %a1
	jeq .L81
	move.l (%a4,%d1.l),%a0
	tst.l %a0
	jeq .L81
	cmp.l #-2331,%a1
	jhi .L81
	cmp.l #-2331,%a0
	jhi .L81
	addq.l #4,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L82
	move.l %a2,%d4
	add.l #91,%d4
	move.l %d4,%d5
	clr.l %d2
	sub.l %a1,%a1
.L89:
	move.l (%a3,%d2.l),%d3
	tst.l %d3
	jeq .L81
	move.l (%a4,%d2.l),%d1
	tst.l %d1
	jeq .L81
	move.l 64(%sp),%a0
	cmp.l 24(%a0,%d2.l),%d3
	jne .L81
	move.l %d3,%a5
	move.l %d1,%a6
	lea (2330,%a5),%a5
	sub.l %a0,%a0
	lea (2330,%a6),%a6
	move.l %a5,44(%sp)
	move.l %a6,52(%sp)
.L86:
	move.l (%a4,%a0.l*4),%d6
	move.l %d6,%d7
	add.l #2330,%d7
	cmp.l %d3,%d7
	jls .L83
	cmp.l 44(%sp),%d6
	jcs .L81
.L83:
	cmp.l %a1,%a0
	jeq .L84
	move.l (%a3,%a0.l*4),%a5
	lea (2330,%a5),%a6
	cmp.l %d3,%a6
	jls .L85
	cmp.l 44(%sp),%a5
	jcs .L81
.L85:
	cmp.l %d1,%d7
	jls .L84
	cmp.l 52(%sp),%d6
	jcs .L81
.L84:
	addq.l #1,%a0
	moveq #8,%d6
	cmp.l %a0,%d6
	jne .L86
	mvz.b 7(%a2),%d3
	move.l %a1,%d6
	btst %d6,%d3
	jeq .L87
	move.l %d1,%a0
	move.l %d5,%a5
	lea (120,%a0),%a0
	add.l #2168,%d1
.L88:
	mvz.b (%a0),%d6
	mvz.b (%a5),%d3
	cmp.l %d6,%d3
	jne .L95
	addq.l #1,%a5
	lea (32,%a0),%a0
	cmp.l %a0,%d1
	jne .L88
.L87:
	addq.l #1,%a1
	add.l #64,%d5
	addq.l #4,%d2
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L89
	clr.l %d1
.L93:
	mvz.b 7(%a2),%d2
	btst %d1,%d2
	jeq .L90
	move.w #120,%a1
	move.l %d4,%a5
.L92:
	move.b (%a5)+,%d3
	move.b 511(%a5),%d2
	mvz.b %d3,%d3
	mvz.b %d2,%d5
	cmp.l %d3,%d5
	jeq .L91
	move.l (%a3,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
	move.l (%a4,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
.L91:
	lea (32,%a1),%a1
	cmp.l #2168,%a1
	jne .L92
.L90:
	addq.l #1,%d1
	add.l #64,%d4
	moveq #8,%d2
	cmp.l %d1,%d2
	jne .L93
	clr.b %d6
	move.b %d6,10(%a2)
.L78:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L81:
	moveq #1,%d0
	jra .L78
.L95:
	moveq #3,%d0
	jra .L78
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
	jeq .L126
	tst.l %a1
	jeq .L126
	moveq #57,%d0
	cmp.l 52(%sp),%d0
	jcs .L126
	moveq #1,%d6
.L129:
	move.b (%a1),%d0
	jeq .L126
	move.l %d2,%d1
	moveq #124,%d3
	addq.l #5,%d1
	cmp.l %d1,%d3
	jcc .L140
.L126:
	movem.l (%sp),#1276
	lea (40,%sp),%sp
	rts
.L140:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a1
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L130
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #letters,%a0
.L131:
	move.l %d2,%d5
	clr.l %d0
	lsl.l #3,%d5
	move.l %d5,28(%sp)
.L139:
	tst.l %a0
	jeq .L142
	mvz.b (%a0,%d0.l),%d1
.L132:
	moveq #58,%d7
	mvs.b -1(%a1),%d3
	cmp.l %d3,%d7
	jne .L133
	moveq #36,%d3
	btst %d0,%d3
	jeq .L134
.L144:
	moveq #4,%d1
	jra .L134
.L130:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d4
	cmp.l %d1,%d4
	jcs .L141
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #digits,%a0
	jra .L131
.L141:
	sub.l %a0,%a0
	jra .L131
.L142:
	clr.l %d1
	jra .L132
.L133:
	moveq #46,%d4
	cmp.l %d3,%d4
	jne .L135
	moveq #6,%d5
	cmp.l %d0,%d5
	jeq .L144
.L134:
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
.L138:
	moveq #16,%d5
	lsr.l %d3,%d5
	and.l %d1,%d5
	tst.l %d5
	jeq .L137
	move.l 32(%sp),%a2
	add.l %d4,%a2
	add.l 44(%sp),%a2
	move.b (%a2),%d5
	or.l 36(%sp),%d5
	move.b %d5,(%a2)
.L137:
	addq.l #1,%d3
	addq.l #8,%d4
	moveq #5,%d5
	cmp.l %d3,%d5
	jne .L138
	addq.l #1,%d0
	moveq #7,%d7
	cmp.l %d0,%d7
	jne .L139
	addq.l #6,%d2
	jra .L129
.L135:
	moveq #45,%d7
	cmp.l %d3,%d7
	jne .L136
	moveq #3,%d3
	cmp.l %d0,%d3
	jne .L134
	moveq #14,%d1
	jra .L134
.L136:
	moveq #47,%d4
	cmp.l %d3,%d4
	jne .L134
	mvz.w %d0,%d1
	moveq #6,%d5
	lsl.l #2,%d1
	move.l %d1,%d3
	move.l %d6,%d1
	divu.l %d5,%d3
	lsl.l %d3,%d1
	jra .L134
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
	jeq .L157
	tst.l %d0
	jeq .L157
	tst.l %a0
	jeq .L157
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L157
	moveq #63,%d5
	cmp.l %d1,%d5
	jcs .L157
	move.w #128,%a1
	sub.l %d2,%a1
	cmp.l %a1,%d0
	jhi .L157
	move.w #64,%a1
	sub.l %d1,%a1
	cmp.l %a1,%a0
	jhi .L157
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
.L160:
	cmp.l %a1,%d6
	jcc .L164
.L157:
	movem.l (%sp),#7420
	lea (36,%sp),%sp
	rts
.L164:
	cmp.l %d7,%a1
	jne .L165
	move.l %a0,%d4
.L161:
	cmp.l %a1,%d6
	jne .L166
	move.l %d3,%d1
.L162:
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
.L163:
	move.b (%a2),%d5
	addq.l #1,%d4
	addq.l #8,%a2
	and.l %d1,%d5
	move.b %d5,-8(%a2)
	cmp.l %d4,%d0
	jhi .L163
	addq.l #1,%a1
	jra .L160
.L165:
	clr.l %d4
	jra .L161
.L166:
	moveq #7,%d1
	jra .L162
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
	jeq .L174
	tst.l %a4
	jeq .L174
	moveq #59,%d0
	cmp.l 48(%sp),%d0
	jcs .L174
	moveq #1,%d2
	lea pixel,%a3
.L177:
	move.b (%a4),%d0
	jeq .L174
	move.l %a5,%d1
	moveq #124,%d3
	addq.l #3,%d1
	cmp.l %d1,%d3
	jcc .L190
.L174:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L190:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a4
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L178
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #alpha.1,%a2
.L179:
	clr.l %d3
	moveq #4,%d5
.L189:
	tst.l %a2
	jeq .L192
	mvz.b (%a2,%d3.l),%d4
.L180:
	mvs.b -1(%a4),%d0
	moveq #58,%d1
	cmp.l %d0,%d1
	jne .L181
	moveq #-3,%d0
	and.l %d3,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L185
.L194:
	moveq #2,%d4
	jra .L185
.L178:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d3
	cmp.l %d1,%d3
	jcs .L191
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #digit.0,%a2
	jra .L179
.L191:
	sub.l %a2,%a2
	jra .L179
.L192:
	clr.l %d4
	jra .L180
.L181:
	moveq #46,%d1
	cmp.l %d0,%d1
	jne .L184
	moveq #4,%d0
	cmp.l %d3,%d0
	jeq .L194
.L185:
	clr.l %d6
.L188:
	move.l %d5,%d0
	lsr.l %d6,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L187
	clr.l -(%sp)
	move.l 52(%sp),%a0
	pea (%a0,%d3.l)
	pea (%a5,%d6.l)
	move.l 52(%sp),-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L187:
	addq.l #1,%d6
	moveq #3,%d0
	cmp.l %d6,%d0
	jne .L188
	addq.l #1,%d3
	moveq #5,%d1
	cmp.l %d3,%d1
	jne .L189
	addq.l #4,%a5
	jra .L177
.L184:
	moveq #45,%d1
	cmp.l %d0,%d1
	jne .L186
	moveq #2,%d0
	cmp.l %d3,%d0
	jne .L185
	moveq #7,%d4
	jra .L185
.L186:
	moveq #47,%d1
	cmp.l %d0,%d1
	jne .L183
	move.l %d3,%d0
	lsr.l #1,%d0
	move.l %d2,%d4
	lsl.l %d0,%d4
	jra .L185
.L183:
	moveq #91,%d1
	cmp.l %d0,%d1
	jne .L182
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L196
	moveq #4,%d4
	jra .L185
.L182:
	moveq #93,%d1
	cmp.l %d0,%d1
	jne .L185
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L197
	moveq #1,%d4
	jra .L185
.L196:
	moveq #6,%d4
	jra .L185
.L197:
	moveq #3,%d4
	jra .L185
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
	jeq .L209
	tst.l %d0
	jeq .L209
	tst.l %a3
	jeq .L209
	moveq #127,%d1
	cmp.l %d3,%d1
	jcs .L209
	moveq #63,%d1
	cmp.l %a2,%d1
	jcs .L209
	move.l #128,%d1
	sub.l %d3,%d1
	cmp.l %d1,%d0
	jhi .L209
	moveq #64,%d1
	sub.l %a2,%d1
	cmp.l %d1,%a3
	jhi .L209
	lea -1(%a2,%a3.l),%a6
	lea pixel,%a4
	add.l %d3,%d0
	move.l %d3,%d4
	move.l %a4,%a5
.L212:
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
	jhi .L212
	move.l %d0,%d4
	add.l %a2,%a3
	subq.l #1,%d4
.L213:
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
	jhi .L213
.L209:
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
	jeq .L222
	tst.l %a5
	jeq .L222
	tst.l %a4
	jeq .L222
	moveq #127,%d0
	cmp.l %a2,%d0
	jcs .L222
	moveq #63,%d0
	cmp.l %a3,%d0
	jcs .L222
	move.l #128,%d0
	sub.l %a2,%d0
	cmp.l %d0,%a5
	jhi .L222
	moveq #64,%d0
	sub.l %a3,%d0
	cmp.l %d0,%a4
	jhi .L222
	lea -1(%a3,%a4.l),%a0
	clr.l %d2
	lea pixel,%a6
	move.l %a0,32(%sp)
.L225:
	btst #1,%d2
	jne .L224
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
.L224:
	addq.l #1,%d2
	cmp.l %a5,%d2
	jne .L225
	lea -1(%a2,%a5.l),%a5
	clr.l %d2
	lea pixel,%a6
	move.l %a5,%d4
.L227:
	btst #1,%d2
	jne .L226
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
.L226:
	addq.l #1,%d2
	cmp.l %a4,%d2
	jne .L227
.L222:
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
	jeq .L239
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L239
	moveq #63,%d3
	cmp.l %d4,%d3
	jcs .L239
	move.w #128,%a0
	sub.l %d2,%a0
	cmp.l %a0,%d0
	jhi .L239
	move.w #64,%a0
	sub.l %d4,%a0
	cmp.l %a0,%d1
	jhi .L239
	move.l %d2,%d5
	move.l %d4,%d6
	add.l %d0,%d5
	add.l %d1,%d6
	lea pixel,%a2
.L241:
	cmp.l %d2,%d5
	jls .L239
	move.l %d4,%d3
	jra .L243
.L242:
	pea 1.w
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 40(%sp),-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (16,%sp),%sp
.L243:
	cmp.l %d3,%d6
	jhi .L242
	addq.l #1,%d2
	jra .L241
.L239:
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
	move.l %d0,phase
	tst.l remembered
	jeq .L249
	move.l last_action,%d0
	addq.l #4,%d0
.L250:
	moveq #5,%d1
	cmp.l %d0,%d1
	jcc .L251
	clr.l %d0
.L251:
	move.l %d0,cursor
	moveq #1,%d1
	clr.b %d0
	clr.l replace
	clr.l selected
	clr.l encoder_residual
	move.l %d1,1187497772
	move.b %d0,plan+10
	rts
.L249:
	move.l 1175346752,%d0
	jra .L250
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
	jne .L254
.L256:
	clr.l %d0
.L253:
	movem.l (%sp),#31996
	lea (44,%sp),%sp
	rts
.L254:
	move.l %d3,%d4
	add.l #-1074668000,%d4
	cmp.l #9535680,%d4
	jhi .L256
	move.l #635712,%d5
	remu.l %d5,%d2:%d4
	tst.l %d2
	jne .L256
	mvz.b %d1,%d6
	moveq #15,%d7
	cmp.l %d6,%d7
	jcs .L256
	mvz.b %d0,%d4
	lsr.l #2,%d4
	jne .L256
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
.L264:
	move.b (%a5,%d2.l),%d1
	move.w %d1,%a6
	mvz.b %d1,%d1
	move.w %a6,%d7
	move.b %d7,(%a3)+
	moveq #1,%d7
	cmp.l %d1,%d7
	jcs .L265
	move.l %d1,%a6
	add.l %d4,%a6
	move.b (%a2,%a6.l),%d7
	move.w %d7,%a6
.L257:
	move.w %a6,%d7
	move.b %d7,7(%a3)
	moveq #1,%d7
	move.l %d5,(%a4)+
	cmp.l %d1,%d7
	jcs .L258
	mvz.b 2(%a0),%d1
	cmp.l %d1,%d7
	jne .L259
	mvz.b (%a0),%d1
	moveq #80,%d7
	cmp.l %d1,%d7
	jne .L260
	mvz.b 1(%a0),%d1
	moveq #76,%d7
	cmp.l %d1,%d7
	jeq .L258
.L260:
	mvz.b (%a0),%d1
	moveq #65,%d7
	cmp.l %d1,%d7
	jne .L261
	mvz.b 1(%a0),%d1
	moveq #66,%d7
	cmp.l %d1,%d7
	jeq .L258
.L261:
	mvz.b (%a0),%d1
	moveq #70,%d7
	cmp.l %d1,%d7
	jne .L259
	mvz.b 1(%a0),%d1
	moveq #77,%d7
	cmp.l %d1,%d7
	jeq .L258
.L259:
	mvz.b 2(%a0),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L262
	mvz.b 2(%a0),%d1
	subq.l #2,%d1
	tst.l %d1
	jne .L263
.L262:
	mvz.b (%a0),%d1
	moveq #83,%d7
	cmp.l %d1,%d7
	jne .L263
	mvz.b 1(%a0),%d1
	moveq #50,%d7
	cmp.l %d1,%d7
	jeq .L258
.L263:
	moveq #1,%d7
	move.b 6(%a1),%d1
	lsl.l %d2,%d7
	or.l %d7,%d1
	move.b %d1,6(%a1)
.L258:
	addq.l #1,%d2
	lea (30,%a0),%a0
	add.l #2330,%d5
	addq.l #5,%d4
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L264
	cmp.l 1187521622.l,%d3
	jne .L256
	mvz.b 269161680,%d1
	cmp.l %d6,%d1
	jne .L256
	move.b 269161679,%d1
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L253
.L265:
	move.w #-1,%a6
	jra .L257
	.size	psl_native_source, .-psl_native_source
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	cmp.l 1187521622.l,%d0
	jeq .L283
.L285:
	clr.l %d0
.L282:
	rts
.L283:
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L285
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L282
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L288
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L289
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L290
.L289:
	moveq #2,%d0
	jra .L286
.L288:
	clr.l %d0
.L286:
	rts
.L290:
	moveq #1,%d0
	jra .L286
	.size	psl_native_popup, .-psl_native_popup
	.align	2
	.globl	module_tick
	.type	module_tick, @function
module_tick:
	moveq #1,%d0
	cmp.l phase.l,%d0
	jne .L292
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jeq .L292
	jsr close_view
.L292:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L293
	subq.l #4,%d0
	tst.l %d0
	jeq .L293
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L294
.L295:
	jsr close_view
.L293:
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
.L294:
	jsr psl_native_popup
	tst.l %d0
	jne .L295
	jra .L293
	.size	module_tick, .-module_tick
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
	jcs .L303
	move.l %d0,1175346752
.L303:
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
	jne .L306
	move.l cursor,%d0
	moveq #51,%d3
	cmp.l %d1,%d3
	jne .L307
	tst.l %d0
	jeq .L308
	subq.l #1,%d0
.L333:
	move.l %d0,cursor
.L308:
	move.l cursor,%d0
	moveq #3,%d2
	cmp.l %d0,%d2
	jcc .L309
	moveq #3,%d0
.L309:
	move.l %d0,-(%sp)
	jsr psl_native_set_cursor
	addq.l #4,%sp
.L310:
	moveq #1,%d2
	move.l %d2,1187497772
	movem.l (%sp),#1052
	lea (16,%sp),%sp
	rts
.L307:
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L308
	moveq #4,%d1
	cmp.l %d0,%d1
	jcs .L308
	addq.l #1,%d0
	jra .L333
.L306:
	subq.l #2,%d0
	tst.l %d0
	jne .L310
	move.l eligible,%a0
	tst.l %a0
	jeq .L310
	move.l cursor,%d0
	moveq #3,%d4
	moveq #51,%d2
	and.l %d0,%d4
	lsr.l #2,%d0
	move.l %d4,%a1
	cmp.l %d1,%d2
	jeq .L322
	moveq #32,%d3
	cmp.l %d1,%d3
	jne .L312
	moveq #1,%d2
.L311:
	lsl.l #2,%d0
	move.l %a1,%d1
	add.l %d2,%d1
.L313:
	moveq #3,%d4
	cmp.l %d1,%d4
	jcs .L310
	move.l %d0,%a1
	add.l %d1,%a1
	move.l %a0,%d4
	move.l %a1,%d3
	btst %d3,%d4
	jeq .L314
	move.l %a1,cursor
	jra .L310
.L322:
	moveq #-1,%d2
	jra .L311
.L314:
	add.l %d2,%d1
	jra .L313
.L312:
	moveq #52,%d2
	cmp.l %d1,%d2
	jne .L316
	tst.l %d0
	jeq .L310
.L317:
	moveq #1,%d1
	sub.l %d0,%d1
	lea (%a1,%d1.l*4),%a2
	clr.l %d0
	move.l %a2,%d2
.L321:
	move.l %a1,%d1
	sub.l %d0,%d1
	lsr.l #2,%d1
	jne .L318
	move.l %d2,%d1
	move.l %a0,%d4
	sub.l %d0,%d1
	btst %d1,%d4
	jne .L319
.L318:
	move.l %a1,%d1
	add.l %d0,%d1
	lsr.l #2,%d1
	jne .L320
	move.l %d2,%d1
	move.l %a0,%d4
	add.l %d0,%d1
	btst %d1,%d4
	jeq .L320
.L319:
	move.l %d1,cursor
	jra .L310
.L316:
	moveq #33,%d3
	cmp.l %d1,%d3
	jne .L310
	tst.l %d0
	jne .L310
	jra .L317
.L320:
	addq.l #1,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L321
	jra .L310
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
	jeq .L356
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L336
	tst.l %d0
	jeq .L337
	tst.l %d1
	jne .L338
	tst.l %d0
	jle .L357
	move.l eligible,%d1
.L339:
	tst.l %d0
	sgt %d0
	move.l %d1,selected
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,select_all
.L337:
	clr.l message
	moveq #1,%d0
	move.l %d0,1187497772
.L342:
	moveq #1,%d0
.L334:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L357:
	clr.l %d1
	jra .L339
.L338:
	moveq #1,%d2
	cmp.l %d1,%d2
	jne .L340
	move.l cursor,%d2
	move.l eligible,%d3
	btst %d2,%d3
	jeq .L337
	lsl.l %d2,%d1
	move.l selected,%d2
	clr.l select_all
	tst.l %d0
	jle .L341
	or.l %d2,%d1
.L369:
	move.l %d1,selected
	jra .L337
.L341:
	not.l %d1
	and.l %d2,%d1
	jra .L369
.L340:
	subq.l #2,%d1
	tst.l %d1
	jne .L337
	tst.l action
	jne .L337
	tst.l %d0
	sgt %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,replace
	jra .L337
.L336:
	moveq #1,%d2
	cmp.l %a0,%d2
	jne .L342
	subq.l #6,%d1
	tst.l %d1
	jne .L342
	move.l encoder_residual,%d2
	tst.l %d2
	jge .L343
	tst.l %d0
	jgt .L359
.L344:
	move.l %d0,%d3
	tst.l %d0
	jge .L345
	addq.l #3,%d3
.L345:
	move.l %d0,%d1
	asr.l #2,%d3
	and.l #-2147483645,%d1
	tst.l %d0
	jge .L346
	subq.l #1,%d1
	moveq #-4,%d0
	or.l %d0,%d1
	addq.l #1,%d1
.L346:
	add.l %d1,%d2
	move.l %d2,%d0
	and.l #-2147483645,%d0
	tst.l %d2
	jge .L347
	subq.l #1,%d0
	moveq #-4,%d1
	or.l %d1,%d0
	addq.l #1,%d0
.L347:
	move.l %d0,encoder_residual
	tst.l %d2
	jge .L348
	addq.l #3,%d2
.L348:
	asr.l #2,%d2
	moveq #-6,%d0
	add.l %d3,%d2
	cmp.l %d2,%d0
	jle .L349
	moveq #-6,%d2
.L350:
	move.l %d2,%d3
	lea move,%a2
.L351:
	tst.l %d3
	jgt .L352
	move.l %d2,%d0
	tst.l %d2
	jge .L353
	clr.l %d0
.L353:
	sub.l %d0,%d2
	lea move,%a2
.L354:
	tst.l %d2
	jeq .L342
	pea 51.w
	jsr (%a2)
	addq.l #1,%d2
	addq.l #4,%sp
	jra .L354
.L343:
	tst.l %d2
	jeq .L344
	tst.l %d0
	jge .L344
.L359:
	clr.l %d2
	jra .L344
.L349:
	moveq #6,%d1
	cmp.l %d2,%d1
	jge .L350
	moveq #6,%d2
	jra .L350
.L352:
	pea 32.w
	jsr (%a2)
	subq.l #1,%d3
	addq.l #4,%sp
	jra .L351
.L356:
	clr.l %d0
	jra .L334
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
	.globl	psl_native_text
	.type	psl_native_text, @function
psl_native_text:
	lea (-28,%sp),%sp
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	move.l 48(%sp),%d1
	move.l 52(%sp),%a6
	tst.l 40(%sp)
	jeq .L372
	tst.l %a6
	jeq .L372
	moveq #123,%d0
	cmp.l 44(%sp),%d0
	jcs .L372
	moveq #59,%d2
	cmp.l %d1,%d2
	jcs .L372
	lea (8,%sp),%a1
	move.l #1074524426,%a0
	move.l %a1,%d0
.L374:
	move.l (%a0)+,(%a1)+
	cmp.l #1074524454,%a0
	jne .L374
	move.l 40(%sp),%a0
	moveq #59,%d2
	sub.l %d1,%d2
	move.l %a0,20(%sp)
	move.l %a6,-(%sp)
	pea -1.w
	move.l %d2,-(%sp)
	move.l 56(%sp),-(%sp)
	move.l %d0,-(%sp)
	move.l #1074505846,-(%sp)
	jsr 1073818584
	lea (24,%sp),%sp
.L372:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a6
	lea (28,%sp),%sp
	rts
	.size	psl_native_text, .-psl_native_text
	.align	2
	.globl	psl_native_part_menu_draw
	.type	psl_native_part_menu_draw, @function
psl_native_part_menu_draw:
	lea (-56,%sp),%sp
	movem.l #17436,(%sp)
	move.l 60(%sp),%d4
	move.l 72(%sp),%a2
	tst.l %d4
	jeq .L382
	tst.l %a2
	jeq .L382
	moveq #6,%d0
	cmp.l 64(%sp),%d0
	jne .L382
	moveq #5,%d1
	cmp.l 68(%sp),%d1
	jcs .L382
	lea (28,%sp),%a1
	move.l #1074524426,%a0
.L384:
	move.l (%a0)+,(%a1)+
	cmp.l #1074524454,%a0
	jne .L384
	move.w #44,%a6
	move.l %a2,%d3
	move.l %a2,%d2
	move.l %d4,40(%sp)
	add.l #24,%d3
.L387:
	move.l %d2,%a0
	move.l (%a0)+,-(%sp)
	pea -1.w
	move.l #1074505846,-(%sp)
	move.l %a0,%d2
	jsr 1073819440
	lea (12,%sp),%sp
	tst.l %d0
	jle .L385
	addq.l #6,%d0
	cmp.l %a6,%d0
	jls .L385
	move.l %d0,%a6
.L385:
	cmp.l %d2,%d3
	jne .L387
	moveq #116,%d0
	cmp.l %a6,%d0
	jcc .L388
	move.w #116,%a6
.L388:
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
.L390:
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
	jne .L389
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
.L389:
	addq.l #1,%d2
	moveq #6,%d0
	cmp.l %d2,%d0
	jne .L390
.L382:
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
	.string	"YES/NO:CLOSE"
.LC12:
	.string	"PATTERN "
.LC13:
	.string	"-"
.LC14:
	.string	"YES:APPLY NO:BACK"
.LC15:
	.string	"A:ALL B:TRACK"
.LC16:
	.string	"YES:NEXT NO:CLOSE"
	.text
	.align	2
	.globl	module_draw
	.type	module_draw, @function
module_draw:
	lea (-80,%sp),%sp
	move.l phase,%d0
	movem.l #31996,(%sp)
	move.l 84(%sp),%a6
	tst.l %d0
	jeq .L400
	tst.l %a6
	jeq .L400
	moveq #1,%d1
	cmp.l %d0,%d1
	jne .L402
	pea part_rows
	move.l cursor,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_native_part_menu_draw
	lea (16,%sp),%sp
.L400:
	movem.l (%sp),#31996
	lea (80,%sp),%sp
	rts
.L402:
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L432
	move.w #2,%a2
	moveq #60,%d6
	move.l %d6,48(%sp)
.L403:
	lea (3,%a2),%a0
	move.l %a0,52(%sp)
	move.l 48(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_clear
	lea (20,%sp),%sp
	tst.l action
	jne .L433
	move.l #.LC0,%d0
.L404:
	move.l %d0,-(%sp)
	move.l 56(%sp),-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	lea psl_native_text,%a3
	jsr (%a3)
	pea 7.w
	pea 114.w
	pea 2(%a2)
	pea 7.w
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (36,%sp),%sp
	move.l %a3,%a4
	move.l phase,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L405
	move.l message,-(%sp)
	pea 17(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC11
	pea 24(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	pea 58.w
	pea 116.w
	pea 3.w
.L457:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
	jra .L400
.L432:
	moveq #58,%d7
	move.w #3,%a2
	move.l %d7,48(%sp)
	jra .L403
.L433:
	move.l #.LC1,%d0
	jra .L404
.L405:
	subq.l #3,%d0
	tst.l %d0
	jne .L406
	pea .LC12
	move.l #635712,%d6
	pea 60(%sp)
	moveq #10,%d7
	jsr text
	move.l plan,%d0
	add.l #-1074668000,%d0
	divu.l %d6,%d0
	add.l #65,%d0
	move.b %d0,72(%sp)
	mvz.b plan+4,%d0
	addq.l #8,%sp
	addq.l #1,%d0
	remu.l %d7,%d1:%d0
	divu.l %d7,%d0
	add.l #48,%d0
	move.b %d0,65(%sp)
	clr.b %d0
	add.l #48,%d1
	move.b %d1,66(%sp)
	move.b %d0,67(%sp)
	pea 56(%sp)
	pea 10(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L406:
	move.l #plan+91,%d5
	clr.l %d2
.L427:
	move.l %d2,%d3
	lsr.l #2,%d3
	move.l phase,%d7
	moveq #3,%d1
	mulu.w #56,%d3
	move.l %d3,%d4
	add.l #10,%d4
	cmp.l %d7,%d1
	jne .L434
	moveq #14,%d1
.L407:
	moveq #3,%d0
	and.l %d2,%d0
	move.l eligible,%d6
	lsr.l %d2,%d6
	move.l 52(%sp),%a3
	mulu.w #7,%d0
	add.l %d0,%a3
	add.l %d1,%a3
	moveq #1,%d0
	moveq #3,%d1
	and.l %d0,%d6
	cmp.l %d7,%d1
	jeq .L435
	tst.l %d6
	jeq .L436
	move.l selected,%d0
	btst %d2,%d0
	jeq .L437
	move.l #.LC3,%d0
.L409:
	move.l %d0,-(%sp)
	pea 60(%sp)
	jsr text
	addq.l #8,%sp
	lea (60,%sp),%a1
.L408:
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d0,1(%a1)
	moveq #32,%d0
	move.b #84,(%a1)
	subq.l #3,%d7
	move.b %d0,2(%a1)
	tst.l %d7
	jne .L410
	lea (3,%a1),%a0
	tst.l %d6
	jeq .L411
	move.l selected,%d0
	btst %d2,%d0
	jne .L438
.L411:
	pea .LC13
	move.l %a0,-(%sp)
	jsr text
	addq.l #8,%sp
.L413:
	pea 56(%sp)
	move.l %a3,-(%sp)
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	move.l eligible,%d0
	move.l phase,%d6
	btst %d2,%d0
	jne .L418
	tst.l %d3
	seq %d3
	neg.l %d3
	tst.b %d3
	jeq .L419
	moveq #58,%d7
.L420:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L421
	move.w #1,%a0
.L422:
	add.l %a3,%a0
.L423:
	cmp.l %d4,%d7
	jls .L426
	mvz.w %d4,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
	move.l %d1,44(%sp)
.L425:
	move.w %d0,%d3
	moveq #3,%d1
	mulu.w #3,%d3
	add.l %d4,%d3
	and.l %d1,%d3
	tst.l %d3
	jne .L424
	moveq #7,%d1
	and.l %d0,%d1
	move.l %d0,%d3
	lsr.l #3,%d3
	move.l 44(%sp),%a1
	sub.l %d3,%a1
	moveq #1,%d3
	add.l %a6,%a1
	lsl.l %d1,%d3
	move.b (%a1),%d1
	not.l %d3
	move.w %d1,%a5
	move.l %a5,%d1
	and.l %d1,%d3
	move.b %d3,(%a1)
.L424:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L425
	addq.l #1,%d4
	jra .L423
.L434:
	moveq #7,%d1
	jra .L407
.L436:
	move.l #.LC2,%d0
	jra .L409
.L437:
	move.l #.LC4,%d0
	jra .L409
.L435:
	lea (56,%sp),%a1
	jra .L408
.L438:
	move.l %d5,%a5
	clr.l %d0
	clr.l %d6
.L412:
	move.b (%a5)+,%d7
	addq.l #1,%d6
	move.b 511(%a5),%d1
	eor.l %d7,%d1
	moveq #64,%d7
	tst.b %d1
	sne %d1
	mvs.b %d1,%d1
	sub.l %d1,%d0
	cmp.l %d6,%d7
	jne .L412
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L414
	moveq #100,%d1
	move.l %d0,%d7
	divu.l %d1,%d7
	lea (4,%a1),%a0
	move.l %d7,%d6
	moveq #10,%d7
	remu.l %d7,%d1:%d6
	add.l #48,%d1
	move.b %d1,3(%a1)
.L415:
	moveq #10,%d1
	move.l %d0,%d7
	divu.l %d1,%d7
	move.l %d7,%d6
	remu.l %d1,%d7:%d6
	move.l %d7,%d1
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L416
.L414:
	moveq #9,%d6
	cmp.l %d0,%d6
	jcs .L415
.L416:
	moveq #10,%d6
	remu.l %d6,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L413
.L410:
	tst.l %d6
	jeq .L439
	lea captured+7,%a0
	tst.b (%a0,%d2.l)
	jeq .L440
	moveq #70,%d0
.L417:
	move.b %d0,3(%a1)
	clr.b %d0
	move.b %d0,4(%a1)
	jra .L413
.L439:
	moveq #45,%d0
	jra .L417
.L440:
	moveq #83,%d0
	jra .L417
.L419:
	moveq #114,%d7
	jra .L420
.L421:
	move.w #5,%a0
	jra .L422
.L418:
	moveq #2,%d7
	cmp.l %d6,%d7
	jne .L426
	cmp.l cursor.l,%d2
	jne .L426
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l %d3,%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L426:
	addq.l #1,%d2
	add.l #64,%d5
	moveq #8,%d0
	cmp.l %d2,%d0
	jne .L427
	move.l %a2,%d3
	move.l %a2,%d2
	add.l #45,%d3
	add.l #52,%d2
	subq.l #3,%d6
	tst.l %d6
	jne .L428
	moveq #1,%d6
	cmp.l action.l,%d6
	jeq .L441
	tst.l replace
	jeq .L442
	move.l #.LC7,%d0
.L429:
	move.l %d0,-(%sp)
	move.l %d3,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC14
	move.l %d2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (32,%sp),%sp
.L430:
	move.l 48(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L457
.L441:
	move.l #.LC6,%d0
	jra .L429
.L442:
	move.l #.LC5,%d0
	jra .L429
.L428:
	move.l message,%d0
	tst.l %d0
	jne .L431
	moveq #1,%d7
	cmp.l action.l,%d7
	jeq .L443
	tst.l replace
	jeq .L444
	move.l #.LC10,%d0
.L431:
	move.l %d0,-(%sp)
	pea 38(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC15
	move.l %d3,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (28,%sp),%sp
	move.l #.LC16,(%sp)
	move.l %d2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	jra .L430
.L443:
	move.l #.LC9,%d0
	jra .L431
.L444:
	move.l #.LC8,%d0
	jra .L431
	.size	module_draw, .-module_draw
	.align	2
	.globl	psl_native_transport
	.type	psl_native_transport, @function
psl_native_transport:
	tst.l 1175263018
	jeq .L464
.L461:
	moveq #2,%d0
.L458:
	rts
.L464:
	move.l #-2147463394,%a0
.L459:
	tst.b (%a0)
	jne .L461
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L459
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L465
.L463:
	moveq #1,%d0
	jra .L458
.L465:
	move.l #-2147457792,%a0
.L462:
	tst.b (%a0)
	jne .L463
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L462
	jra .L458
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	lea (-328,%sp),%sp
	movem.l #31996,(%sp)
	move.l 332(%sp),%a6
#APP
| 100 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d1
| 0 "" 2
#NO_APP
	move.w %d1,%d0
	move.w %d1,62(%sp)
	and.l #1792,%d0
	cmp.l #511,%d0
	jhi .L469
	move.w %d1,%d0
	and.l #-1793,%d0
	bset #9,%d0
#APP
| 102 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
.L469:
	tst.l %a6
	jeq .L470
	tst.b 10(%a6)
	jeq .L470
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jeq .L470
	move.l %sp,%d7
	add.l #144,%d7
	move.l %d7,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L470
	move.l %d7,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L501
	tst.w 1116(%a6)
	jne .L505
	clr.b %d7
	move.b %d7,10(%a6)
.L501:
	move.w 62(%sp),%d1
#APP
| 180 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d1,%sr
| 0 "" 2
#NO_APP
	move.l %d2,%d0
	movem.l (%sp),#31996
	lea (328,%sp),%sp
	rts
.L505:
	clr.l %d0
	lea (264,%sp),%a0
.L472:
	clr.b %d1
	lea (200,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L472
	mvz.b 4(%a6),%d6
	mvz.b 7(%a6),%d1
	lea (91,%a6),%a3
	add.l #24,%d7
	lea (80,%sp),%a1
	clr.l %d3
	move.w %d6,%d0
	lea (112,%sp),%a2
	move.l %d6,68(%sp)
	move.l %d1,72(%sp)
	move.l %a1,48(%sp)
	move.l %a3,56(%sp)
	move.l %a3,%d5
	move.l %a2,52(%sp)
	mulu.w #36568,%d0
	move.l %d0,%a0
	clr.l %d0
	add.l #268525902,%a0
.L482:
	move.l 48(%sp),%a1
	move.l %d7,%a4
	move.l 52(%sp),%a3
	move.l 72(%sp),%d1
	move.l (%a4),64(%sp)
	move.l 64(%sp),(%a1)
	move.l %a0,(%a3)
	btst %d0,%d1
	jeq .L474
	mvz.w %d0,%d1
	sub.l %a1,%a1
	lsl.l #3,%d1
	lea (%a6,%d1.l),%a3
.L476:
	mvz.b (%a1,%a0.l),%d4
	mvz.b 27(%a3,%a1.l),%d1
	cmp.l %d4,%d1
	jne .L500
	addq.l #1,%a1
	moveq #8,%d6
	cmp.l %a1,%d6
	jne .L476
	moveq #1,%d1
	sub.l %a1,%a1
	lsl.l %d0,%d1
	lea (264,%sp),%a3
	lea (200,%sp),%a5
	move.l %d5,44(%sp)
.L481:
	move.l 44(%sp),%a4
	mvz.b 120(%a1,%a0.l),%d6
	mvz.b (%a4),%d4
	cmp.l %d6,%d4
	jne .L500
	mvz.b 512(%a4),%d4
	addq.l #1,%a4
	move.l %a4,44(%sp)
	cmp.l %d6,%d4
	jeq .L477
	or.l %d1,%d3
	cmp.l #255,%d4
	jne .L478
	move.l 64(%sp),%a4
	add.l %a1,%a4
	clr.l %d4
	move.l %a4,76(%sp)
.L479:
	move.l 76(%sp),%a4
	mvz.b 89(%a4,%d4.l),%d6
	cmp.l #255,%d6
	jne .L478
	addq.l #1,%d4
	moveq #31,%d6
	cmp.l %d4,%d6
	jne .L479
	move.b (%a3),%d4
	or.l %d1,%d4
	move.b %d4,(%a3)
	jra .L477
.L478:
	move.b (%a5),%d4
	or.l %d1,%d4
	move.b %d4,(%a5)
.L477:
	addq.l #1,%a3
	addq.l #1,%a5
	lea (32,%a1),%a1
	cmp.l #2048,%a1
	jne .L481
.L474:
	addq.l #4,%d7
	addq.l #4,48(%sp)
	addq.l #4,52(%sp)
	addq.l #1,%d0
	lea (2330,%a0),%a0
	add.l #64,%d5
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L482
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jeq .L500
	mvz.b 5(%a6),%d5
	move.l (%a6),%d4
	move.l %d5,-(%sp)
	move.l 72(%sp),-(%sp)
	move.l %d4,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L500
	mulu.w #6322,%d5
	move.l %d4,%a1
	add.l #585088,%a1
	move.l #714,%d4
	clr.l %d0
	add.l %d5,%a1
	move.l 56(%sp),%d5
	lea (34,%a1),%a4
.L490:
	move.l 72(%sp),%d7
	btst %d0,%d7
	jeq .L484
	mvz.b (%a4,%d0.l),%d1
	mvz.b 11(%a6,%d0.l),%d6
	cmp.l %d1,%d6
	jne .L507
	move.l %d1,%a0
	add.l %d4,%a0
	mvz.b 19(%a6,%d0.l),%d1
	mvz.b (%a1,%a0.l),%d6
	cmp.l %d6,%d1
	jne .L507
.L485:
	mvz.w %d0,%d1
	move.l 80(%sp,%d0.l*4),%a3
	lsl.l #3,%d1
	lea (%a6,%d1.l),%a5
	clr.l %d1
.L487:
	mvz.b (%a3,%d1.l),%d6
	mvz.b 27(%a5,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L509
	move.l (%a2),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L509
.L486:
	addq.l #1,%d1
	moveq #8,%d6
	cmp.l %d1,%d6
	jne .L487
	move.l %d5,%a5
	moveq #120,%d1
.L489:
	mvz.b (%a3,%d1.l),%d6
	mvz.b (%a5)+,%d7
	cmp.l %d6,%d7
	jne .L511
	move.l (%a2),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L511
.L488:
	add.l #32,%d1
	cmp.l #2168,%d1
	jne .L489
.L484:
	addq.l #1,%d0
	addq.l #4,%a2
	add.l #64,%d5
	addq.l #5,%d4
	moveq #8,%d7
	cmp.l %d0,%d7
	jne .L490
	tst.l %d2
	jeq .L512
.L500:
	moveq #3,%d2
	jra .L501
.L507:
	moveq #3,%d2
	jra .L485
.L509:
	moveq #3,%d2
	jra .L486
.L511:
	moveq #3,%d2
	jra .L488
.L512:
	clr.l %d4
	lea edits,%a2
.L491:
	mvz.b 7(%a6),%d1
	move.l 56(%sp),%a0
	clr.l %d5
	add.l %d4,%a0
	clr.l %d0
	move.l %d1,%a4
	mvz.w %d4,%d1
	lsl.l #5,%d1
	add.l #120,%d1
.L495:
	move.l %a4,%d6
	btst %d0,%d6
	jeq .L493
	move.b 512(%a0),%d7
	mvz.b (%a0),%d6
	move.w %d7,%a1
	mvz.b %d7,%d7
	cmp.l %d6,%d7
	jeq .L493
	moveq #10,%d6
	muls.l %d5,%d6
	move.l 80(%sp,%d0.l*4),%d7
	add.l %d1,%d7
	move.l 112(%sp,%d0.l*4),%a3
	add.l %d1,%a3
	move.l %d7,(%a2,%d6.l)
	move.w %a1,%d7
	move.l %a3,4(%a2,%d6.l)
	addq.l #1,%d5
	move.b %d7,8(%a2,%d6.l)
.L493:
	addq.l #1,%d0
	lea (64,%a0),%a0
	moveq #8,%d6
	cmp.l %d0,%d6
	jne .L495
	tst.l %d5
	jeq .L496
	lea (264,%sp),%a0
	mvz.b (%a0,%d4.l),%d0
	move.l %d0,-(%sp)
	lea (204,%sp),%a1
	mvz.b (%a1,%d4.l),%d0
	move.l %d0,-(%sp)
	move.l %d4,-(%sp)
	move.l %d5,-(%sp)
	jsr psl_write_step
	lea (16,%sp),%sp
.L496:
	addq.l #1,%d4
	moveq #64,%d0
	cmp.l %d4,%d0
	jne .L491
	clr.b %d7
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d6
	move.l %d6,269452696
	move.b %d7,10(%a6)
	tst.l %d3
	jeq .L501
	jsr 1073905152
	clr.l %d4
.L503:
	btst %d4,%d3
	jeq .L502
	move.l %d4,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L502:
	addq.l #1,%d4
	moveq #8,%d0
	cmp.l %d4,%d0
	jne .L503
	jra .L501
.L470:
	moveq #1,%d2
	jra .L501
	.size	psl_native_commit, .-psl_native_commit
	.section	.rodata.str1.1
.LC17:
	.string	"SOURCE CHANGED - REOPEN"
.LC18:
	.string	"REFUSED - NO CHANGES"
.LC19:
	.string	"ACTIVE PATTERN ONLY"
.LC20:
	.string	"SELECT TRACKS FIRST"
.LC21:
	.string	"CHECK SAMPLE ASSIGNMENTS"
.LC22:
	.string	"RECORDER ACTIVE - REFUSED"
	.text
	.align	2
	.globl	module_key
	.type	module_key, @function
module_key:
	lea (-84,%sp),%sp
	move.l 88(%sp),%d1
	movem.l #19516,(%sp)
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
	move.l %d1,%a0
	moveq #3,%d4
	lea (-49,%a0),%a0
	cmp.l %a0,%d4
	jcc .L557
	lea (17,%a0),%a0
	moveq #1,%d5
	cmp.l %a0,%d5
	jcc .L557
.L560:
	jsr close_view
.L553:
	clr.l %d0
.L555:
	movem.l (%sp),#19516
	lea (84,%sp),%sp
	rts
.L557:
	moveq #1,%d4
	cmp.l %d0,%d4
	jne .L558
	moveq #49,%d5
	cmp.l %d1,%d5
	jne .L559
	moveq #3,%d4
	cmp.l cursor.l,%d4
	jcc .L560
.L558:
	or.l %d3,%d2
	move.l %d2,consumed+4
	moveq #50,%d2
	cmp.l %d1,%d2
	jne .L561
	subq.l #3,%d0
	tst.l %d0
	jne .L562
	moveq #2,%d4
	moveq #1,%d0
	clr.b %d5
	move.l %d4,phase
	clr.l message
	move.l %d0,1187497772
	move.b %d5,plan+10
	jra .L556
.L559:
	moveq #50,%d5
	cmp.l %d1,%d5
	jne .L558
	jra .L560
.L562:
	jsr close_view
	jra .L556
.L561:
	move.l %d1,%a0
	moveq #1,%d2
	lea (-51,%a0),%a0
	cmp.l %a0,%d2
	jcc .L563
	lea (19,%a0),%a0
	cmp.l %a0,%d2
	jcs .L564
.L563:
	move.l %d1,-(%sp)
	jsr move
	addq.l #4,%sp
	jra .L556
.L564:
	moveq #1,%d3
	cmp.l %d0,%d3
	jne .L565
	moveq #4,%d4
	cmp.l cursor.l,%d4
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,action
	jsr psl_native_close_popup
	pea captured
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L566
	move.l #.LC19,%d5
	move.l %d5,message
	move.l %d4,phase
	move.l %d3,1187497772
	jra .L556
.L566:
	move.l action,%a2
	move.b captured+6,%d4
	lea preferences,%a1
	lea (%a2,%a2.l*4),%a0
	mvz.b %d4,%d2
	move.b (%a0,%a1.l),%d3
	move.l %d2,eligible
	tst.b %d3
	jeq .L567
	move.l %a1,%d1
	add.l %a0,%d1
	move.l %d1,%a3
	tst.b 4(%a3)
	jne .L568
	move.b 1(%a3),%d1
	clr.l select_all
	and.l %d4,%d1
	mvz.b %d1,%d1
	jra .L570
.L567:
	clr.l select_all
	clr.l %d1
.L570:
	move.l %d1,selected
	tst.l %a2
	jne .L571
	tst.b %d3
	jeq .L572
	mvz.b preferences+3,%d1
	move.l %d1,replace
.L573:
	mvz.b 2(%a1,%a0.l),%d1
	moveq #7,%d3
	move.l %d1,cursor
	cmp.l %d1,%d3
	jcc .L575
.L576:
	clr.l cursor
	tst.l %d2
	jeq .L577
	clr.b %d1
.L578:
	move.l %a6,%d4
	move.l %d2,%d3
	lsr.l %d4,%d3
	addq.l #1,%a6
	btst #0,%d3
	jeq .L591
	tst.b %d1
	jeq .L577
	move.l %d4,cursor
	jra .L577
.L568:
	moveq #1,%d1
	move.l %d1,select_all
	move.l %d2,%d1
	jra .L570
.L572:
	clr.l replace
.L574:
	clr.l cursor
	clr.l %d1
.L575:
	btst %d1,%d2
	jeq .L576
.L577:
	moveq #2,%d5
	moveq #1,%d2
	move.l %d5,phase
	clr.b %d1
	clr.l message
	move.l %d2,1187497772
	move.b %d1,plan+10
	jra .L555
.L571:
	clr.l replace
	tst.b %d3
	jne .L573
	jra .L574
.L591:
	moveq #1,%d1
	jra .L578
.L565:
	moveq #2,%d3
	cmp.l %d0,%d3
	jne .L579
	lea (28,%sp),%a2
	move.l %a2,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L580
	move.l 28(%sp),%d3
	cmp.l captured.l,%d3
	jne .L580
	mvz.w captured+4,%d1
	mvz.w 32(%sp),%d0
	cmp.l %d1,%d0
	jne .L580
	move.b 34(%sp),%d2
	mvz.b %d2,%d0
	cmp.l eligible.l,%d0
	jeq .L581
.L580:
	move.l #.LC17,%d4
	moveq #4,%d5
	move.l %d4,message
	move.l %d5,phase
.L582:
	moveq #1,%d2
	move.l %d2,1187497772
	jra .L556
.L581:
	move.w 32(%sp),%d4
	move.l replace,-(%sp)
	move.l action,-(%sp)
	move.l selected,-(%sp)
	move.l %a2,-(%sp)
	pea plan
	jsr psl_prepare
	lea (20,%sp),%sp
	moveq #2,%d1
	cmp.l %d0,%d1
	jne .L583
	move.l #.LC20,%d2
	move.l %d2,message
	jra .L582
.L583:
	tst.l %d0
	jeq .L584
	move.l #.LC21,%d3
	move.l %d3,message
	jra .L582
.L584:
	move.w %d4,captured+4
	move.b %d2,captured+6
	move.l %d3,captured
	lea (35,%sp),%a1
	lea captured+7,%a0
	lea captured+24,%a2
.L585:
	moveq #32,%d0
	move.b (%a1)+,(%a0)+
	lea 52(%a6,%sp.l),%a3
	move.b 7(%a1),7(%a0)
	move.l (%a3),(%a2,%a6.l)
	addq.l #4,%a6
	cmp.l %a6,%d0
	jne .L585
	moveq #3,%d1
	move.l %d1,phase
	jra .L582
.L579:
	subq.l #3,%d0
	tst.l %d0
	jne .L562
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jne .L586
	clr.b %d0
	move.l #.LC22,%d5
	moveq #4,%d1
	move.l %d5,message
	move.l %d1,phase
	move.b %d0,plan+10
.L587:
	moveq #1,%d5
	move.l %d5,1187497772
	jra .L556
.L586:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	tst.l %d0
	jne .L588
	move.l action,%a1
	moveq #1,%d2
	lea preferences,%a0
	lea (%a1,%a1.l*4),%a6
	lea selected+3,%a3
	lea (%a0,%a6.l),%a2
	move.b (%a3),1(%a2)
	lea cursor+3,%a3
	move.b %d2,(%a6,%a0.l)
	move.b (%a3),2(%a2)
	tst.l %a1
	jne .L589
	tst.l replace
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
.L589:
	add.l %a6,%a0
	move.b %d0,3(%a0)
	lea select_all+3,%a2
	moveq #1,%d0
	move.b (%a2),4(%a0)
	move.l %a1,last_action
	move.l %d0,remembered
	jsr close_view
	jra .L587
.L588:
	subq.l #3,%d0
	tst.l %d0
	jne .L592
	move.l #.LC17,%d0
.L590:
	clr.b %d2
	moveq #4,%d3
	moveq #1,%d4
	move.l %d0,message
	move.l %d3,phase
	move.l %d4,1187497772
	move.b %d2,plan+10
	jra .L587
.L592:
	move.l #.LC18,%d0
	jra .L590
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
	jne .L613
	cmp.l #1175261212,%d4
	jne .L613
	cmp.l #1074502420,%d3
	jne .L613
	cmp.l #1074502404,%d2
	jne .L613
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jne .L613
	movem.l (%sp),#60
	lea (16,%sp),%sp
	jra psl_ui_open
.L613:
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
	.comm	edits,80,2
	.section	.rodata.str1.1
.LC23:
	.string	"RENAME"
.LC24:
	.string	"RELOAD"
.LC25:
	.string	"SAVE"
.LC26:
	.string	"SAVE ALL"
	.section	.rodata
	.align	2
	.type	part_rows, @object
	.size	part_rows, 24
part_rows:
	.long	.LC23
	.long	.LC24
	.long	.LC25
	.long	.LC26
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
	.local	select_all
	.comm	select_all,4,2
	.local	remembered
	.comm	remembered,4,2
	.local	last_action
	.comm	last_action,4,2
	.local	preferences
	.comm	preferences,10,1
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
