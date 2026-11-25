#NO_APP
	.file	"translation.c"
	.text
	.align	2
	.type	close_view, @function
close_view:
	clr.b %d0
	clr.l phase
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
| 85 "sdk/octatrack/modules/pattern-sample-locks/native.c" 1
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
| 90 "sdk/octatrack/modules/pattern-sample-locks/native.c" 1
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
	.globl	module_enc
	.type	module_enc, @function
module_enc:
	move.l %d3,-(%sp)
	move.l phase,%a0
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
	move.l 16(%sp),%d0
	tst.l %a0
	jeq .L256
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L250
	tst.l %d0
	jeq .L251
	tst.l %d1
	jne .L252
	tst.l %d0
	jle .L257
	move.l eligible,%d1
.L253:
	tst.l %d0
	sgt %d0
	move.l %d1,selected
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,select_all
.L251:
	clr.l message
	moveq #1,%d0
	move.l %d0,1187497772
.L250:
	moveq #1,%d0
.L248:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L257:
	clr.l %d1
	jra .L253
.L252:
	moveq #1,%d3
	cmp.l %d1,%d3
	jne .L254
	move.l eligible,%d2
	move.l cursor,%a0
	move.l %a0,%d3
	btst %d3,%d2
	jeq .L251
	lsl.l %d3,%d1
	move.l selected,%a0
	clr.l select_all
	tst.l %d0
	jle .L255
	move.l %a0,%d0
	or.l %d1,%d0
	move.l %d0,selected
	jra .L251
.L255:
	not.l %d1
	move.l %a0,%d2
	and.l %d1,%d2
	move.l %d2,selected
	jra .L251
.L254:
	subq.l #2,%d1
	tst.l %d1
	jne .L251
	tst.l action
	jne .L251
	tst.l %d0
	sgt %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,replace
	jra .L251
.L256:
	clr.l %d0
	jra .L248
	.size	module_enc, .-module_enc
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
	jne .L265
.L267:
	clr.l %d0
.L264:
	movem.l (%sp),#31996
	lea (44,%sp),%sp
	rts
.L265:
	move.l %d3,%d4
	add.l #-1074668000,%d4
	cmp.l #9535680,%d4
	jhi .L267
	move.l #635712,%d5
	remu.l %d5,%d2:%d4
	tst.l %d2
	jne .L267
	mvz.b %d1,%d6
	moveq #15,%d7
	cmp.l %d6,%d7
	jcs .L267
	mvz.b %d0,%d4
	lsr.l #2,%d4
	jne .L267
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
.L275:
	move.b (%a5,%d2.l),%d1
	move.w %d1,%a6
	mvz.b %d1,%d1
	move.w %a6,%d7
	move.b %d7,(%a3)+
	moveq #1,%d7
	cmp.l %d1,%d7
	jcs .L276
	move.l %d1,%a6
	add.l %d4,%a6
	move.b (%a2,%a6.l),%d7
	move.w %d7,%a6
.L268:
	move.w %a6,%d7
	move.b %d7,7(%a3)
	moveq #1,%d7
	move.l %d5,(%a4)+
	cmp.l %d1,%d7
	jcs .L269
	mvz.b 2(%a0),%d1
	cmp.l %d1,%d7
	jne .L270
	mvz.b (%a0),%d1
	moveq #80,%d7
	cmp.l %d1,%d7
	jne .L271
	mvz.b 1(%a0),%d1
	moveq #76,%d7
	cmp.l %d1,%d7
	jeq .L269
.L271:
	mvz.b (%a0),%d1
	moveq #65,%d7
	cmp.l %d1,%d7
	jne .L272
	mvz.b 1(%a0),%d1
	moveq #66,%d7
	cmp.l %d1,%d7
	jeq .L269
.L272:
	mvz.b (%a0),%d1
	moveq #70,%d7
	cmp.l %d1,%d7
	jne .L270
	mvz.b 1(%a0),%d1
	moveq #77,%d7
	cmp.l %d1,%d7
	jeq .L269
.L270:
	mvz.b 2(%a0),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L273
	mvz.b 2(%a0),%d1
	subq.l #2,%d1
	tst.l %d1
	jne .L274
.L273:
	mvz.b (%a0),%d1
	moveq #83,%d7
	cmp.l %d1,%d7
	jne .L274
	mvz.b 1(%a0),%d1
	moveq #50,%d7
	cmp.l %d1,%d7
	jeq .L269
.L274:
	moveq #1,%d7
	move.b 6(%a1),%d1
	lsl.l %d2,%d7
	or.l %d7,%d1
	move.b %d1,6(%a1)
.L269:
	addq.l #1,%d2
	lea (30,%a0),%a0
	add.l #2330,%d5
	addq.l #5,%d4
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L275
	cmp.l 1187521622.l,%d3
	jne .L267
	mvz.b 269161680,%d1
	cmp.l %d6,%d1
	jne .L267
	move.b 269161679,%d1
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L264
.L276:
	move.w #-1,%a6
	jra .L268
	.size	psl_native_source, .-psl_native_source
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"ACTIVE PATTERN ONLY"
	.text
	.align	2
	.globl	psl_ui_start
	.type	psl_ui_start, @function
psl_ui_start:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	tst.l 16(%sp)
	sne %d2
	pea captured
	mvs.b %d2,%d2
	neg.l %d2
	move.l %d2,action
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L294
	move.l #.LC0,%d0
	moveq #4,%d2
	move.l %d0,message
	move.l %d2,phase
.L316:
	movem.l (%sp),#1036
	moveq #1,%d0
	move.l %d0,1187497772
	lea (12,%sp),%sp
	rts
.L294:
	move.l %d2,%a2
	lea (%a2,%d2.l*4),%a0
	move.b captured+6,%d3
	lea preferences,%a1
	move.b (%a0,%a1.l),%d2
	mvz.b %d3,%d1
	move.l %d1,eligible
	tst.b %d2
	jeq .L296
	move.l %a1,%d0
	add.l %a0,%d0
	move.l %d0,%a2
	tst.b 4(%a2)
	jne .L297
	move.b 1(%a2),%d0
	clr.l select_all
	and.l %d3,%d0
	mvz.b %d0,%d0
	jra .L299
.L296:
	clr.l select_all
	clr.l %d0
.L299:
	move.l %d0,selected
	tst.l 16(%sp)
	jne .L300
	tst.b %d2
	jne .L301
	clr.l replace
.L302:
	clr.l cursor
	clr.l %d0
.L304:
	btst %d0,%d1
	jeq .L305
.L306:
	moveq #2,%d0
	move.l %d0,phase
	clr.b %d2
	clr.l message
	move.b %d2,plan+10
	jra .L316
.L297:
	moveq #1,%d0
	move.l %d0,select_all
	move.l %d1,%d0
	jra .L299
.L301:
	mvz.b preferences+3,%d0
	move.l %d0,replace
.L303:
	mvz.b 2(%a1,%a0.l),%d0
	moveq #7,%d2
	move.l %d0,cursor
	cmp.l %d0,%d2
	jcc .L304
.L305:
	clr.l cursor
	tst.l %d1
	jeq .L306
	clr.l %d0
	clr.b %d2
.L307:
	move.l %d1,%d3
	lsr.l %d0,%d3
	move.l %d0,%a0
	addq.l #1,%d0
	btst #0,%d3
	jeq .L308
	tst.b %d2
	jeq .L306
	move.l %a0,cursor
	jra .L306
.L300:
	clr.l replace
	tst.b %d2
	jeq .L302
	jra .L303
.L308:
	moveq #1,%d2
	jra .L307
	.size	psl_ui_start, .-psl_ui_start
	.align	2
	.type	psl_choose, @function
psl_choose:
	jra psl_ui_start
	.size	psl_choose, .-psl_choose
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	cmp.l 1187521622.l,%d0
	jeq .L319
.L321:
	clr.l %d0
.L318:
	rts
.L319:
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L321
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L318
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L324
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L325
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L326
.L325:
	moveq #2,%d0
	jra .L322
.L324:
	clr.l %d0
.L322:
	rts
.L326:
	moveq #1,%d0
	jra .L322
	.size	psl_native_popup, .-psl_native_popup
	.align	2
	.globl	module_tick
	.type	module_tick, @function
module_tick:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L328
	subq.l #4,%d0
	tst.l %d0
	jeq .L328
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L329
.L330:
	jsr close_view
.L328:
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
.L329:
	jsr psl_native_popup
	tst.l %d0
	jne .L330
	jra .L328
	.size	module_tick, .-module_tick
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
	jeq .L335
	tst.l %a6
	jeq .L335
	moveq #123,%d0
	cmp.l 44(%sp),%d0
	jcs .L335
	moveq #59,%d2
	cmp.l %d1,%d2
	jcs .L335
	lea (8,%sp),%a1
	move.l #1074524426,%a0
	move.l %a1,%d0
.L337:
	move.l (%a0)+,(%a1)+
	cmp.l #1074524454,%a0
	jne .L337
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
.L335:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a6
	lea (28,%sp),%sp
	rts
	.size	psl_native_text, .-psl_native_text
	.section	.rodata.str1.1
.LC1:
	.string	"LOCK SAMPLES TO PATTERN"
.LC2:
	.string	"CLEAR SAMPLE LOCKS"
.LC3:
	.string	"    "
.LC4:
	.string	"[X] "
.LC5:
	.string	"[ ] "
.LC6:
	.string	"EXISTING LOCKS: KEEP"
.LC7:
	.string	"INCLUDES MANUAL LOCKS"
.LC8:
	.string	"REPLACE EXISTING: YES"
.LC9:
	.string	"C:REPLACE EXISTING OFF"
.LC10:
	.string	"ALL SAMPLE LOCKS"
.LC11:
	.string	"C:REPLACE EXISTING ON"
.LC12:
	.string	"YES/NO:CLOSE"
.LC13:
	.string	"PATTERN "
.LC14:
	.string	"-"
.LC15:
	.string	"YES:APPLY NO:BACK"
.LC16:
	.string	"A:ALL B:TRACK"
.LC17:
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
	jeq .L345
	tst.l %a6
	jeq .L345
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L376
	move.w #2,%a2
	moveq #60,%d2
	move.l %d2,48(%sp)
.L347:
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
	jne .L377
	move.l #.LC1,%d0
.L348:
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
	jne .L349
	move.l message,-(%sp)
	pea 17(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC12
	pea 24(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	pea 58.w
	pea 116.w
	pea 3.w
.L401:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
.L345:
	movem.l (%sp),#31996
	lea (80,%sp),%sp
	rts
.L376:
	moveq #58,%d6
	move.w #3,%a2
	move.l %d6,48(%sp)
	jra .L347
.L377:
	move.l #.LC2,%d0
	jra .L348
.L349:
	subq.l #3,%d0
	tst.l %d0
	jne .L350
	pea .LC13
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
.L350:
	move.l #plan+91,%d5
	clr.l %d2
.L371:
	move.l %d2,%d3
	lsr.l #2,%d3
	move.l phase,%d7
	moveq #3,%d1
	mulu.w #56,%d3
	move.l %d3,%d4
	add.l #10,%d4
	cmp.l %d7,%d1
	jne .L378
	moveq #14,%d1
.L351:
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
	jeq .L379
	tst.l %d6
	jeq .L380
	move.l selected,%d0
	btst %d2,%d0
	jeq .L381
	move.l #.LC4,%d0
.L353:
	move.l %d0,-(%sp)
	pea 60(%sp)
	jsr text
	addq.l #8,%sp
	lea (60,%sp),%a1
.L352:
	move.l %d2,%d0
	add.l #49,%d0
	move.b %d0,1(%a1)
	moveq #32,%d0
	move.b #84,(%a1)
	subq.l #3,%d7
	move.b %d0,2(%a1)
	tst.l %d7
	jne .L354
	lea (3,%a1),%a0
	tst.l %d6
	jeq .L355
	move.l selected,%d0
	btst %d2,%d0
	jne .L382
.L355:
	pea .LC14
	move.l %a0,-(%sp)
	jsr text
	addq.l #8,%sp
.L357:
	pea 56(%sp)
	move.l %a3,-(%sp)
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	move.l eligible,%d0
	move.l phase,%d6
	btst %d2,%d0
	jne .L362
	tst.l %d3
	seq %d3
	neg.l %d3
	tst.b %d3
	jeq .L363
	moveq #58,%d7
.L364:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L365
	move.w #1,%a0
.L366:
	add.l %a3,%a0
.L367:
	cmp.l %d4,%d7
	jls .L370
	mvz.w %d4,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
	move.l %d1,44(%sp)
.L369:
	move.w %d0,%d3
	moveq #3,%d1
	mulu.w #3,%d3
	add.l %d4,%d3
	and.l %d1,%d3
	tst.l %d3
	jne .L368
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
.L368:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L369
	addq.l #1,%d4
	jra .L367
.L378:
	moveq #7,%d1
	jra .L351
.L380:
	move.l #.LC3,%d0
	jra .L353
.L381:
	move.l #.LC5,%d0
	jra .L353
.L379:
	lea (56,%sp),%a1
	jra .L352
.L382:
	move.l %d5,%a5
	clr.l %d0
	clr.l %d6
.L356:
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
	jne .L356
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L358
	moveq #100,%d1
	move.l %d0,%d7
	divu.l %d1,%d7
	lea (4,%a1),%a0
	move.l %d7,%d6
	moveq #10,%d7
	remu.l %d7,%d1:%d6
	add.l #48,%d1
	move.b %d1,3(%a1)
.L359:
	moveq #10,%d1
	move.l %d0,%d7
	divu.l %d1,%d7
	move.l %d7,%d6
	remu.l %d1,%d7:%d6
	move.l %d7,%d1
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L360
.L358:
	moveq #9,%d6
	cmp.l %d0,%d6
	jcs .L359
.L360:
	moveq #10,%d6
	remu.l %d6,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L357
.L354:
	tst.l %d6
	jeq .L383
	lea captured+7,%a0
	tst.b (%a0,%d2.l)
	jeq .L384
	moveq #70,%d0
.L361:
	move.b %d0,3(%a1)
	clr.b %d0
	move.b %d0,4(%a1)
	jra .L357
.L383:
	moveq #45,%d0
	jra .L361
.L384:
	moveq #83,%d0
	jra .L361
.L363:
	moveq #114,%d7
	jra .L364
.L365:
	move.w #5,%a0
	jra .L366
.L362:
	moveq #2,%d7
	cmp.l %d6,%d7
	jne .L370
	cmp.l cursor.l,%d2
	jne .L370
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l %d3,%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L370:
	addq.l #1,%d2
	add.l #64,%d5
	moveq #8,%d0
	cmp.l %d2,%d0
	jne .L371
	move.l %a2,%d3
	move.l %a2,%d2
	add.l #45,%d3
	add.l #52,%d2
	subq.l #3,%d6
	tst.l %d6
	jne .L372
	moveq #1,%d6
	cmp.l action.l,%d6
	jeq .L385
	tst.l replace
	jeq .L386
	move.l #.LC8,%d0
.L373:
	move.l %d0,-(%sp)
	move.l %d3,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC15
	move.l %d2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (32,%sp),%sp
.L374:
	move.l 48(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L401
.L385:
	move.l #.LC7,%d0
	jra .L373
.L386:
	move.l #.LC6,%d0
	jra .L373
.L372:
	move.l message,%d0
	tst.l %d0
	jne .L375
	moveq #1,%d7
	cmp.l action.l,%d7
	jeq .L387
	tst.l replace
	jeq .L388
	move.l #.LC11,%d0
.L375:
	move.l %d0,-(%sp)
	pea 38(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC16
	move.l %d3,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (28,%sp),%sp
	move.l #.LC17,(%sp)
	move.l %d2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	jra .L374
.L387:
	move.l #.LC10,%d0
	jra .L375
.L388:
	move.l #.LC9,%d0
	jra .L375
	.size	module_draw, .-module_draw
	.align	2
	.globl	psl_native_transport
	.type	psl_native_transport, @function
psl_native_transport:
	tst.l 1175263018
	jeq .L408
.L405:
	moveq #2,%d0
.L402:
	rts
.L408:
	move.l #-2147463394,%a0
.L403:
	tst.b (%a0)
	jne .L405
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L403
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L409
.L407:
	moveq #1,%d0
	jra .L402
.L409:
	move.l #-2147457792,%a0
.L406:
	tst.b (%a0)
	jne .L407
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L406
	jra .L402
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	lea (-328,%sp),%sp
	movem.l #31996,(%sp)
	move.l 332(%sp),%a6
#APP
| 73 "sdk/octatrack/modules/pattern-sample-locks/native.c" 1
	move.w %sr,%d1
| 0 "" 2
#NO_APP
	move.w %d1,%d0
	move.w %d1,62(%sp)
	and.l #1792,%d0
	cmp.l #511,%d0
	jhi .L413
	move.w %d1,%d0
	and.l #-1793,%d0
	bset #9,%d0
#APP
| 75 "sdk/octatrack/modules/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
.L413:
	tst.l %a6
	jeq .L414
	tst.b 10(%a6)
	jeq .L414
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jeq .L414
	move.l %sp,%d7
	add.l #144,%d7
	move.l %d7,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L414
	move.l %d7,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L445
	tst.w 1116(%a6)
	jne .L449
	clr.b %d7
	move.b %d7,10(%a6)
.L445:
	move.w 62(%sp),%d1
#APP
| 153 "sdk/octatrack/modules/pattern-sample-locks/native.c" 1
	move.w %d1,%sr
| 0 "" 2
#NO_APP
	move.l %d2,%d0
	movem.l (%sp),#31996
	lea (328,%sp),%sp
	rts
.L449:
	clr.l %d0
	lea (264,%sp),%a0
.L416:
	clr.b %d1
	lea (200,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L416
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
.L426:
	move.l 48(%sp),%a1
	move.l %d7,%a4
	move.l 52(%sp),%a3
	move.l 72(%sp),%d1
	move.l (%a4),64(%sp)
	move.l 64(%sp),(%a1)
	move.l %a0,(%a3)
	btst %d0,%d1
	jeq .L418
	mvz.w %d0,%d1
	sub.l %a1,%a1
	lsl.l #3,%d1
	lea (%a6,%d1.l),%a3
.L420:
	mvz.b (%a1,%a0.l),%d4
	mvz.b 27(%a3,%a1.l),%d1
	cmp.l %d4,%d1
	jne .L444
	addq.l #1,%a1
	moveq #8,%d6
	cmp.l %a1,%d6
	jne .L420
	moveq #1,%d1
	sub.l %a1,%a1
	lsl.l %d0,%d1
	lea (264,%sp),%a3
	lea (200,%sp),%a5
	move.l %d5,44(%sp)
.L425:
	move.l 44(%sp),%a4
	mvz.b 120(%a1,%a0.l),%d6
	mvz.b (%a4),%d4
	cmp.l %d6,%d4
	jne .L444
	mvz.b 512(%a4),%d4
	addq.l #1,%a4
	move.l %a4,44(%sp)
	cmp.l %d6,%d4
	jeq .L421
	or.l %d1,%d3
	cmp.l #255,%d4
	jne .L422
	move.l 64(%sp),%a4
	add.l %a1,%a4
	clr.l %d4
	move.l %a4,76(%sp)
.L423:
	move.l 76(%sp),%a4
	mvz.b 89(%a4,%d4.l),%d6
	cmp.l #255,%d6
	jne .L422
	addq.l #1,%d4
	moveq #31,%d6
	cmp.l %d4,%d6
	jne .L423
	move.b (%a3),%d4
	or.l %d1,%d4
	move.b %d4,(%a3)
	jra .L421
.L422:
	move.b (%a5),%d4
	or.l %d1,%d4
	move.b %d4,(%a5)
.L421:
	addq.l #1,%a3
	addq.l #1,%a5
	lea (32,%a1),%a1
	cmp.l #2048,%a1
	jne .L425
.L418:
	addq.l #4,%d7
	addq.l #4,48(%sp)
	addq.l #4,52(%sp)
	addq.l #1,%d0
	lea (2330,%a0),%a0
	add.l #64,%d5
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L426
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jeq .L444
	mvz.b 5(%a6),%d5
	move.l (%a6),%d4
	move.l %d5,-(%sp)
	move.l 72(%sp),-(%sp)
	move.l %d4,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L444
	mulu.w #6322,%d5
	move.l %d4,%a1
	add.l #585088,%a1
	move.l #714,%d4
	clr.l %d0
	add.l %d5,%a1
	move.l 56(%sp),%d5
	lea (34,%a1),%a4
.L434:
	move.l 72(%sp),%d7
	btst %d0,%d7
	jeq .L428
	mvz.b (%a4,%d0.l),%d1
	mvz.b 11(%a6,%d0.l),%d6
	cmp.l %d1,%d6
	jne .L451
	move.l %d1,%a0
	add.l %d4,%a0
	mvz.b 19(%a6,%d0.l),%d1
	mvz.b (%a1,%a0.l),%d6
	cmp.l %d6,%d1
	jne .L451
.L429:
	mvz.w %d0,%d1
	move.l 80(%sp,%d0.l*4),%a3
	lsl.l #3,%d1
	lea (%a6,%d1.l),%a5
	clr.l %d1
.L431:
	mvz.b (%a3,%d1.l),%d6
	mvz.b 27(%a5,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L453
	move.l (%a2),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L453
.L430:
	addq.l #1,%d1
	moveq #8,%d6
	cmp.l %d1,%d6
	jne .L431
	move.l %d5,%a5
	moveq #120,%d1
.L433:
	mvz.b (%a3,%d1.l),%d6
	mvz.b (%a5)+,%d7
	cmp.l %d6,%d7
	jne .L455
	move.l (%a2),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L455
.L432:
	add.l #32,%d1
	cmp.l #2168,%d1
	jne .L433
.L428:
	addq.l #1,%d0
	addq.l #4,%a2
	add.l #64,%d5
	addq.l #5,%d4
	moveq #8,%d7
	cmp.l %d0,%d7
	jne .L434
	tst.l %d2
	jeq .L456
.L444:
	moveq #3,%d2
	jra .L445
.L451:
	moveq #3,%d2
	jra .L429
.L453:
	moveq #3,%d2
	jra .L430
.L455:
	moveq #3,%d2
	jra .L432
.L456:
	clr.l %d4
	lea edits,%a2
.L435:
	mvz.b 7(%a6),%d1
	move.l 56(%sp),%a0
	clr.l %d5
	add.l %d4,%a0
	clr.l %d0
	move.l %d1,%a4
	mvz.w %d4,%d1
	lsl.l #5,%d1
	add.l #120,%d1
.L439:
	move.l %a4,%d6
	btst %d0,%d6
	jeq .L437
	move.b 512(%a0),%d7
	mvz.b (%a0),%d6
	move.w %d7,%a1
	mvz.b %d7,%d7
	cmp.l %d6,%d7
	jeq .L437
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
.L437:
	addq.l #1,%d0
	lea (64,%a0),%a0
	moveq #8,%d6
	cmp.l %d0,%d6
	jne .L439
	tst.l %d5
	jeq .L440
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
.L440:
	addq.l #1,%d4
	moveq #64,%d0
	cmp.l %d4,%d0
	jne .L435
	clr.b %d7
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d6
	move.l %d6,269452696
	move.b %d7,10(%a6)
	tst.l %d3
	jeq .L445
	jsr 1073905152
	clr.l %d4
.L447:
	btst %d4,%d3
	jeq .L446
	move.l %d4,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L446:
	addq.l #1,%d4
	moveq #8,%d0
	cmp.l %d4,%d0
	jne .L447
	jra .L445
.L414:
	moveq #1,%d2
	jra .L445
	.size	psl_native_commit, .-psl_native_commit
	.section	.rodata.str1.1
.LC18:
	.string	"SOURCE CHANGED - REOPEN"
.LC19:
	.string	"REFUSED - NO CHANGES"
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
	moveq #63,%d0
	move.l 88(%sp),%d1
	movem.l #19484,(%sp)
	move.l 92(%sp),%a0
	cmp.l %d1,%d0
	jcs .L497
	moveq #31,%d2
	moveq #1,%d0
	and.l %d1,%d2
	move.l %d1,%d3
	lsr.l #5,%d3
	lea consumed,%a1
	move.l (%a1,%d3.l*4),%d4
	lsl.l %d2,%d0
	move.l %d0,%d2
	and.l %d4,%d2
	move.l %d2,%a6
	tst.l %a0
	jne .L498
	tst.l %d2
	jeq .L499
	not.l %d0
	and.l %d4,%d0
	move.l %d0,(%a1,%d3.l*4)
.L500:
	move.w #1,%a0
	jra .L499
.L498:
	tst.l %d2
	jne .L500
	move.l phase,%a0
	tst.l %a0
	jeq .L497
	move.l %d1,%d2
	moveq #3,%d3
	add.l #-49,%d2
	cmp.l %d2,%d3
	jcc .L501
	add.l #17,%d2
	lsr.l #1,%d2
	jeq .L501
	jsr close_view
.L497:
	sub.l %a0,%a0
.L499:
	movem.l (%sp),#19484
	move.l %a0,%d0
	lea (84,%sp),%sp
	rts
.L501:
	or.l %d4,%d0
	moveq #50,%d4
	move.l %d0,consumed+4
	cmp.l %d1,%d4
	jne .L502
	moveq #3,%d0
	cmp.l %a0,%d0
	jne .L503
	moveq #2,%d1
	clr.b %d2
	move.l %d1,phase
	clr.l message
	move.b %d2,plan+10
.L521:
	moveq #1,%d3
	move.l %d3,1187497772
	jra .L500
.L503:
	jsr close_view
	jra .L500
.L502:
	move.l %d1,%d0
	moveq #1,%d4
	add.l #-51,%d0
	cmp.l %d0,%d4
	jcc .L504
	add.l #19,%d0
	cmp.l %d0,%d4
	jcs .L505
.L504:
	moveq #2,%d0
	cmp.l %a0,%d0
	jne .L506
	move.l eligible,%d3
	tst.l %d3
	jeq .L506
	move.l cursor,%d0
	moveq #3,%d2
	moveq #51,%d4
	and.l %d0,%d2
	lsr.l #2,%d0
	cmp.l %d1,%d4
	jeq .L530
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L508
	move.w #1,%a6
.L507:
	lsl.l #2,%d0
	move.l %d2,%d1
	add.l %a6,%d1
.L509:
	moveq #3,%d2
	cmp.l %d1,%d2
	jcs .L506
	move.l %d1,%d2
	add.l %d0,%d2
	btst %d2,%d3
	jeq .L510
	move.l %d2,cursor
.L506:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L500
.L530:
	move.w #-1,%a6
	jra .L507
.L510:
	add.l %a6,%d1
	jra .L509
.L508:
	moveq #52,%d4
	cmp.l %d1,%d4
	jne .L512
	tst.l %d0
	jeq .L506
.L513:
	move.w #1,%a0
	move.l %d2,%a1
	sub.l %d0,%a0
	lea (%a1,%a0.l*4),%a1
	move.l %a1,%d1
.L517:
	move.l %d2,%d0
	sub.l %a6,%d0
	lsr.l #2,%d0
	jne .L514
	move.l %d1,%d0
	sub.l %a6,%d0
	btst %d0,%d3
	jne .L515
.L514:
	move.l %d2,%d0
	add.l %a6,%d0
	lsr.l #2,%d0
	jne .L516
	move.l %d1,%d0
	add.l %a6,%d0
	btst %d0,%d3
	jeq .L516
.L515:
	move.l %d0,cursor
	jra .L506
.L512:
	tst.l %d0
	jne .L506
	jra .L513
.L516:
	addq.l #1,%a6
	moveq #4,%d0
	cmp.l %a6,%d0
	jne .L517
	jra .L506
.L505:
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L518
	move.l %sp,%d4
	add.l #28,%d4
	move.l %d4,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L519
	move.l 28(%sp),%d3
	cmp.l captured.l,%d3
	jne .L519
	mvz.w captured+4,%d1
	mvz.w 32(%sp),%d0
	cmp.l %d1,%d0
	jne .L519
	move.b 34(%sp),%d2
	mvz.b %d2,%d0
	cmp.l eligible.l,%d0
	jeq .L520
.L519:
	move.l #.LC18,%d3
	moveq #4,%d4
	move.l %d3,message
	move.l %d4,phase
	jra .L521
.L520:
	move.w 32(%sp),%a1
	move.w %a1,26(%sp)
	move.l replace,-(%sp)
	move.l action,-(%sp)
	move.l selected,-(%sp)
	move.l %d4,-(%sp)
	pea plan
	jsr psl_prepare
	lea (20,%sp),%sp
	moveq #2,%d1
	cmp.l %d0,%d1
	jne .L522
	move.l #.LC20,%d2
	move.l %d2,message
	jra .L521
.L522:
	tst.l %d0
	jeq .L523
	move.l #.LC21,%d3
	move.l %d3,message
	jra .L521
.L523:
	move.w 26(%sp),%d4
	move.b %d2,captured+6
	move.l %d3,captured
	move.l #captured+24,%d0
	lea (35,%sp),%a1
	lea captured+7,%a0
	move.w %d4,captured+4
.L524:
	move.b (%a1)+,(%a0)+
	lea 52(%a6,%sp.l),%a2
	moveq #32,%d1
	move.b 7(%a1),7(%a0)
	move.l (%a2),(%a6,%d0.l)
	addq.l #4,%a6
	cmp.l %a6,%d1
	jne .L524
	moveq #3,%d2
	move.l %d2,phase
	jra .L521
.L518:
	moveq #3,%d4
	cmp.l %a0,%d4
	jne .L503
	jsr psl_native_transport
	subq.l #2,%d0
	tst.l %d0
	jne .L525
	clr.b %d3
	move.l #.LC22,%d2
	moveq #4,%d4
	move.l %d2,message
	move.l %d4,phase
	move.b %d3,plan+10
.L526:
	moveq #1,%d0
	move.l %d0,1187497772
	jra .L500
.L525:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	tst.l %d0
	jne .L527
	move.l action,%a6
	moveq #1,%d1
	lea preferences,%a0
	lea (%a6,%a6.l*4),%a1
	lea selected+3,%a3
	move.b %d1,(%a1,%a0.l)
	move.l %a0,%d1
	add.l %a1,%d1
	move.l %d1,%a2
	move.b (%a3),1(%a2)
	lea cursor+3,%a3
	move.b (%a3),2(%a2)
	tst.l %a6
	jne .L528
	tst.l replace
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
.L528:
	add.l %a1,%a0
	lea select_all+3,%a1
	move.b %d0,3(%a0)
	move.b (%a1),4(%a0)
	jsr close_view
	jra .L526
.L527:
	subq.l #3,%d0
	tst.l %d0
	jne .L531
	move.l #.LC18,%d0
.L529:
	clr.b %d2
	moveq #4,%d3
	moveq #1,%d4
	move.l %d0,message
	move.l %d3,phase
	move.l %d4,1187497772
	move.b %d2,plan+10
	jra .L526
.L531:
	move.l #.LC19,%d0
	jra .L529
	.size	module_key, .-module_key
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
	.globl	psl_part_menu
	.section	.rodata.str1.1
.LC23:
	.string	"LOCKS"
	.data
	.align	2
	.type	psl_part_menu, @object
	.size	psl_part_menu, 24
psl_part_menu:
	.long	1
	.long	.LC23
	.long	2
	.long	psl_actions
	.long	psl_choose
	.long	psl_icon
	.section	.rodata
	.align	2
	.type	psl_icon, @object
	.size	psl_icon, 36
psl_icon:
	.long	0
	.long	1792
	.long	2176
	.long	2176
	.long	8128
	.long	7616
	.long	7616
	.long	8128
	.long	0
	.section	.rodata.str1.1
.LC24:
	.string	"LOCK SAMPLES"
.LC25:
	.string	"CLEAR LOCKS"
	.section	.rodata
	.align	2
	.type	psl_actions, @object
	.size	psl_actions, 8
psl_actions:
	.long	.LC24
	.long	.LC25
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
