#NO_APP
	.file	"translation.c"
	.text
#APP
	.globl psl_stock_sample_write
psl_stock_sample_write:
	lea -32(%sp),%sp
	movem.l %d2-%d7/%a2-%a3,(%sp)
	jmp 0x40040ee8

#NO_APP
	.align	2
	.type	nv_crc_byte, @function
nv_crc_byte:
	move.l %d2,-(%sp)
	mvz.b 15(%sp),%d0
	move.l 8(%sp),%d1
	eor.l %d1,%d0
	moveq #8,%d1
.L2:
	move.l %d0,%d2
	lsr.l #1,%d2
	subq.l #1,%d1
	move.l %d2,%a0
	moveq #1,%d2
	and.l %d2,%d0
	move.l %a0,%d2
	neg.l %d0
	and.l #-306674912,%d0
	eor.l %d2,%d0
	tst.l %d1
	jne .L2
	move.l (%sp)+,%d2
	rts
	.size	nv_crc_byte, .-nv_crc_byte
	.align	2
	.type	nv_header_crc, @function
nv_header_crc:
	move.l %a2,-(%sp)
	moveq #-1,%d0
	move.l %d2,-(%sp)
	clr.l %d2
	lea nv_crc_byte,%a2
.L5:
	move.l 12(%sp),%a0
	mvz.b (%a0,%d2.l),%d1
	addq.l #1,%d2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	cmp.l #520,%d2
	jne .L5
	move.l (%sp)+,%d2
	not.l %d0
	move.l (%sp)+,%a2
	rts
	.size	nv_header_crc, .-nv_header_crc
	.align	2
	.type	nv_record_crc, @function
nv_record_crc:
	lea (-16,%sp),%sp
	movem.l #15360,(%sp)
	move.l 28(%sp),%a2
	sub.l %a5,%a5
	move.l 32(%sp),%a4
	clr.l -(%sp)
	pea -1.w
	lea nv_crc_byte,%a3
	jsr (%a3)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	mvz.b %d1,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	move.l %a2,%d1
	mvz.b %d1,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	move.l 24(%sp),%d1
	lsl.l #3,%d1
	add.l %a2,%d1
	mulu.w #12,%d1
	move.l 20(%sp),%a2
	add.l %d1,%a2
	lea (1024,%a2),%a2
.L8:
	mvz.b (%a2,%a5.l),%d1
	addq.l #1,%a5
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #8,%d1
	cmp.l %a5,%d1
	jne .L8
	sub.l %a2,%a2
.L9:
	mvz.b (%a4,%a2.l),%d1
	addq.l #1,%a2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #8,%d1
	cmp.l %a2,%d1
	jne .L9
	lea (120,%a4),%a2
	lea (2168,%a4),%a4
.L10:
	mvz.b (%a2),%d1
	lea (32,%a2),%a2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l %a2,%a4
	jne .L10
	movem.l (%sp),#15360
	not.l %d0
	lea (16,%sp),%sp
	rts
	.size	nv_record_crc, .-nv_record_crc
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
.L16:
	move.b (%a1),%d0
	jne .L17
	clr.b (%a0)
	rts
.L17:
	move.b %d0,(%a0)+
	addq.l #1,%a1
	jra .L16
	.size	text, .-text
	.align	2
	.type	project_identity, @function
project_identity:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	clr.l %d1
	sub.l %a0,%a0
	lea identity,%a1
.L20:
	tst.l %a0
	jne .L25
	move.l %d1,%d0
	add.l #269452416,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L19:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L20
	tst.l %d2
	jne .L26
.L24:
	clr.l %d0
.L18:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L25:
	clr.b %d0
	jra .L19
.L26:
	clr.l %d1
	sub.l %a0,%a0
	lea identity+256,%a1
.L21:
	tst.l %a0
	jne .L27
	move.l %d1,%d0
	add.l #269452152,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L23:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L21
	tst.l %d2
	jeq .L24
	tst.b identity.l
	jeq .L24
	tst.b identity+256.l
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L18
.L27:
	clr.b %d0
	jra .L23
	.size	project_identity, .-project_identity
	.align	2
	.type	source_valid, @function
source_valid:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	tst.l %a0
	jne .L34
.L36:
	clr.l %d0
.L33:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L34:
	tst.l (%a0)
	jeq .L36
	mvz.b 4(%a0),%d0
	lsr.l #4,%d0
	jne .L36
	mvz.b 5(%a0),%d0
	lsr.l #2,%d0
	jne .L36
	mvz.b 6(%a0),%d2
	clr.l %d0
.L39:
	btst %d0,%d2
	jeq .L37
	tst.l 24(%a0,%d0.l*4)
	jeq .L36
	move.b 7(%a0,%d0.l),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	lsr.l #1,%d1
	jne .L36
	move.w %a1,%d3
	mvz.b 15(%a0,%d0.l),%d1
	tst.b %d3
	jeq .L40
	move.w #135,%a1
.L38:
	cmp.l %d1,%a1
	jcc .L37
	cmp.l #255,%d1
	jne .L36
.L37:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L39
	moveq #1,%d0
	jra .L33
.L40:
	move.w #127,%a1
	jra .L38
	.size	source_valid, .-source_valid
	.align	2
	.type	pixel, @function
pixel:
	move.l %d2,-(%sp)
	moveq #127,%d2
	move.l 12(%sp),%d0
	move.l 16(%sp),%d1
	cmp.l %d0,%d2
	jcs .L45
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L45
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
	jeq .L47
	eor.l %d1,%d0
.L48:
	move.b %d0,(%a0)
.L45:
	move.l (%sp)+,%d2
	rts
.L47:
	or.l %d1,%d0
	jra .L48
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
	tst.l %a2
	jeq .L66
	clr.b %d0
	move.b %d0,10(%a2)
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L66
	cmp.l #255,%d2
	jhi .L49
	move.b 6(%a3),%d3
	mvz.b %d3,%d1
	not.l %d1
	and.l %d2,%d1
	tst.l %d1
	jne .L49
	move.l 72(%sp),%d1
	or.l 76(%sp),%d1
	lsr.l #1,%d1
	jne .L49
	tst.l %d2
	jeq .L67
	clr.l %d1
.L54:
	btst %d1,%d2
	jeq .L53
	tst.l 72(%sp)
	jne .L53
	mvz.b 15(%a3,%d1.l),%d4
	cmp.l #255,%d4
	jeq .L49
.L53:
	addq.l #1,%d1
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L54
	move.l (%a3),(%a2)
	move.b 4(%a3),4(%a2)
	lea (7,%a3),%a0
	sub.l %a1,%a1
	move.l %a0,46(%sp)
	move.l %a2,%d4
	add.l #91,%d4
	lea (11,%a2),%a5
	lea (24,%a3),%a0
	move.b 5(%a3),5(%a2)
	move.b %d3,6(%a2)
	move.b %d2,7(%a2)
	move.b 75(%sp),8(%a2)
	move.b 79(%sp),9(%a2)
	clr.l 1632(%a2)
	move.l 88(%a3),604(%a2)
.L64:
	move.l 46(%sp),%a3
	move.l %a1,%d0
	addq.l #1,46(%sp)
	move.b (%a3)+,(%a5)+
	move.b 7(%a3),%d6
	move.b %d6,7(%a5)
	btst %d0,%d2
	jeq .L55
	mvz.w %a1,%d0
	move.l (%a0),%d5
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a4
	clr.l %d0
.L56:
	move.l %d5,%a3
	moveq #8,%d1
	lea (%a3,%d0.l),%a6
	move.b (%a6),27(%a4,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L56
	move.l 32(%a0),%a3
	move.l %d5,%a6
	lea (120,%a6),%a6
	clr.l %d1
	move.l %a3,52(%sp)
	move.l %d4,%a3
.L63:
	move.l %d1,%d7
	lsr.l #3,%d7
	moveq #7,%d0
	move.l %d5,%a4
	move.b (%a6),%d3
	sub.l %d7,%d0
	move.b (%a4,%d0.l),%d0
	move.b %d0,51(%sp)
	tst.l 52(%sp)
	jeq .L68
	move.l 52(%sp),%a4
	moveq #1,%d7
	move.b (%a4,%d1.l),%d0
	eor.l %d7,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L57:
	move.b %d0,(%a3)+
	moveq #1,%d7
	cmp.l 72(%sp),%d7
	jne .L58
	or.l 76(%sp),%d0
	jne .L69
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jeq .L60
.L89:
	move.w 1634(%a2),%d0
	addq.l #1,%d0
	move.w %d0,1634(%a2)
.L60:
	move.b %d3,%d0
	jra .L59
.L68:
	clr.l %d0
	jra .L57
.L58:
	moveq #7,%d7
	and.l %d1,%d7
	mvz.b 51(%sp),%d0
	btst %d7,%d0
	jeq .L60
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jne .L61
.L62:
	move.b %d6,%d0
.L59:
	move.b %d0,1028(%a3)
	eor.l %d3,%d0
	move.b %d3,516(%a3)
	addq.l #1,%d1
	lea (32,%a6),%a6
	tst.b %d0
	sne %d0
	move.w 1632(%a2),%d3
	ext.w %d0
	sub.l %d0,%d3
	move.w %d3,1632(%a2)
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L63
.L55:
	addq.l #1,%a1
	add.l #64,%d4
	addq.l #4,%a0
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L64
	moveq #1,%d4
	clr.l %d0
	move.b %d4,10(%a2)
.L49:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L61:
	tst.l 76(%sp)
	jne .L62
	jra .L89
.L69:
	st %d0
	jra .L59
.L66:
	moveq #1,%d0
	jra .L49
.L67:
	moveq #2,%d0
	jra .L49
	.size	psl_prepare, .-psl_prepare
	.align	2
	.globl	psl_validate
	.type	psl_validate, @function
psl_validate:
	lea (-36,%sp),%sp
	movem.l #31804,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%a3
	tst.l %a2
	jne .L91
.L93:
	moveq #1,%d0
.L90:
	movem.l (%sp),#31804
	lea (36,%sp),%sp
	rts
.L91:
	tst.b 10(%a2)
	jeq .L93
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L93
	move.l (%a2),%d0
	cmp.l (%a3),%d0
	jeq .L94
.L95:
	moveq #3,%d0
	jra .L90
.L94:
	mvz.b 4(%a3),%d1
	mvz.b 4(%a2),%d0
	cmp.l %d1,%d0
	jne .L95
	mvz.b 5(%a3),%d1
	mvz.b 5(%a2),%d0
	cmp.l %d1,%d0
	jne .L95
	mvz.b 6(%a3),%d1
	mvz.b 6(%a2),%d0
	cmp.l %d1,%d0
	jne .L95
	move.l 604(%a2),%d4
	cmp.l 88(%a3),%d4
	jne .L95
	mvz.b 7(%a2),%d3
	move.l %a2,%d2
	clr.l %d1
	add.l #91,%d2
	lea (24,%a3),%a4
.L100:
	btst %d1,%d3
	jeq .L96
	mvz.b 7(%a3,%d1.l),%d4
	mvz.b 11(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L95
	mvz.b 15(%a3,%d1.l),%d4
	mvz.b 19(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L95
	mvz.w %d1,%d0
	move.l (%a4),%a0
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a1
	clr.l %d0
.L97:
	mvz.b (%a0,%d0.l),%d5
	mvz.b 27(%a1,%d0.l),%d4
	cmp.l %d5,%d4
	jne .L95
	addq.l #1,%d0
	moveq #8,%d4
	cmp.l %d0,%d4
	jne .L97
	move.l 32(%a4),%a5
	move.l %d2,%a6
	lea (120,%a0),%a0
	sub.l %a1,%a1
.L99:
	tst.l %a5
	jeq .L101
	move.b (%a5,%a1.l),%d0
	moveq #1,%d4
	eor.l %d4,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L98:
	mvz.b (%a0),%d5
	mvz.b 517(%a6),%d4
	cmp.l %d5,%d4
	jne .L95
	mvz.b (%a6),%d4
	cmp.l %d0,%d4
	jne .L95
	addq.l #1,%a6
	addq.l #1,%a1
	lea (32,%a0),%a0
	moveq #64,%d0
	cmp.l %a1,%d0
	jne .L99
.L96:
	addq.l #1,%d1
	add.l #64,%d2
	addq.l #4,%a4
	moveq #8,%d4
	cmp.l %d1,%d4
	jne .L100
	clr.l %d0
	jra .L90
.L101:
	clr.l %d0
	jra .L98
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
	jne .L111
	tst.l %a3
	jeq .L114
	tst.l %a4
	jeq .L114
	clr.l %d1
.L115:
	move.l (%a3,%d1.l),%a1
	tst.l %a1
	jeq .L114
	move.l (%a4,%d1.l),%a0
	tst.l %a0
	jeq .L114
	cmp.l #-2331,%a1
	jhi .L114
	cmp.l #-2331,%a0
	jhi .L114
	addq.l #4,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L115
	move.l %a2,%d4
	add.l #608,%d4
	move.l %d4,%d5
	clr.l %d2
	sub.l %a1,%a1
.L122:
	move.l (%a3,%d2.l),%d3
	tst.l %d3
	jeq .L114
	move.l (%a4,%d2.l),%d1
	tst.l %d1
	jeq .L114
	move.l 64(%sp),%a0
	cmp.l 24(%a0,%d2.l),%d3
	jne .L114
	move.l %d3,%a5
	move.l %d1,%a6
	lea (2330,%a5),%a5
	sub.l %a0,%a0
	lea (2330,%a6),%a6
	move.l %a5,44(%sp)
	move.l %a6,52(%sp)
.L119:
	move.l (%a4,%a0.l*4),%d6
	move.l %d6,%d7
	add.l #2330,%d7
	cmp.l %d3,%d7
	jls .L116
	cmp.l 44(%sp),%d6
	jcs .L114
.L116:
	cmp.l %a1,%a0
	jeq .L117
	move.l (%a3,%a0.l*4),%a5
	lea (2330,%a5),%a6
	cmp.l %d3,%a6
	jls .L118
	cmp.l 44(%sp),%a5
	jcs .L114
.L118:
	cmp.l %d1,%d7
	jls .L117
	cmp.l 52(%sp),%d6
	jcs .L114
.L117:
	addq.l #1,%a0
	moveq #8,%d6
	cmp.l %a0,%d6
	jne .L119
	mvz.b 7(%a2),%d3
	move.l %a1,%d6
	btst %d6,%d3
	jeq .L120
	move.l %d1,%a0
	move.l %d5,%a5
	lea (120,%a0),%a0
	add.l #2168,%d1
.L121:
	mvz.b (%a0),%d6
	mvz.b (%a5),%d3
	cmp.l %d6,%d3
	jne .L128
	addq.l #1,%a5
	lea (32,%a0),%a0
	cmp.l %a0,%d1
	jne .L121
.L120:
	addq.l #1,%a1
	add.l #64,%d5
	addq.l #4,%d2
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L122
	clr.l %d1
.L126:
	mvz.b 7(%a2),%d2
	btst %d1,%d2
	jeq .L123
	move.w #120,%a1
	move.l %d4,%a5
.L125:
	move.b (%a5)+,%d3
	move.b 511(%a5),%d2
	mvz.b %d3,%d3
	mvz.b %d2,%d5
	cmp.l %d3,%d5
	jeq .L124
	move.l (%a3,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
	move.l (%a4,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
.L124:
	lea (32,%a1),%a1
	cmp.l #2168,%a1
	jne .L125
.L123:
	addq.l #1,%d1
	add.l #64,%d4
	moveq #8,%d2
	cmp.l %d1,%d2
	jne .L126
	clr.b %d6
	move.b %d6,10(%a2)
.L111:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L114:
	moveq #1,%d0
	jra .L111
.L128:
	moveq #3,%d0
	jra .L111
	.size	psl_apply, .-psl_apply
	.align	2
	.globl	psl_nv_matches
	.type	psl_nv_matches, @function
psl_nv_matches:
	lea (-12,%sp),%sp
	move.l 16(%sp),%a0
	movem.l #1036,(%sp)
	move.l 20(%sp),%a1
	tst.l %a0
	jne .L160
.L162:
	clr.l %d0
.L159:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L160:
	tst.l %a1
	jeq .L162
	clr.l %d0
	move.l #nv_tag,%d1
.L163:
	move.l %d1,%a2
	mvz.b (%a0,%d0.l),%d3
	mvz.b (%a2,%d0.l),%d2
	cmp.l %d3,%d2
	jne .L162
	addq.l #1,%d0
	moveq #8,%d2
	cmp.l %d0,%d2
	jne .L163
	move.l %a0,%d1
	clr.l %d0
	addq.l #8,%d1
.L164:
	move.l %d1,%a2
	mvz.b (%a2,%d0.l),%d3
	mvz.b (%a1,%d0.l),%d2
	cmp.l %d3,%d2
	jne .L162
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L164
	move.b 520(%a0),%d2
	move.b 521(%a0),%d1
	moveq #24,%d3
	move.b 522(%a0),%d0
	lsl.l %d3,%d2
	mvz.b %d1,%d1
	mvz.b %d0,%d0
	swap %d1
	clr.w %d1
	lsl.l #8,%d0
	or.l %d1,%d2
	mvz.b 523(%a0),%d1
	move.l %a0,-(%sp)
	or.l %d1,%d2
	or.l %d0,%d2
	jsr nv_header_crc
	addq.l #4,%sp
	cmp.l %d0,%d2
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L159
	.size	psl_nv_matches, .-psl_nv_matches
	.align	2
	.globl	psl_nv_begin
	.type	psl_nv_begin, @function
psl_nv_begin:
	lea (-28,%sp),%sp
	movem.l #7228,(%sp)
	move.l 32(%sp),%a2
	tst.l %a2
	jne .L171
.L173:
	clr.l %d2
.L170:
	move.l %d2,%d0
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L171:
	tst.l 36(%sp)
	jeq .L173
	move.l 36(%sp),-(%sp)
	move.l %a2,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L170
	moveq #1,%d3
	moveq #1,%d4
	moveq #1,%d1
	sub.l %a1,%a1
	lea nv_tag,%a3
.L179:
	lea (%a2,%a1.l),%a4
	tst.b (%a4)
	jeq .L175
	move.b (%a4),%d0
	not.l %d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d1
.L175:
	move.b (%a4),%d0
	move.w %d0,%a0
	move.b (%a3,%a1.l),%d0
	move.l %a0,%d5
	eor.l %d0,%d5
	tst.b %d5
	seq %d5
	mvs.b %d5,%d5
	neg.l %d5
	and.l %d5,%d4
	tst.b (%a4)
	jeq .L178
	mvz.b (%a4),%d5
	cmp.l #255,%d5
	jeq .L178
	move.b (%a4),%d5
	move.w %d5,%a0
	move.l %a0,%d5
	eor.l %d5,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d3
.L178:
	addq.l #1,%a1
	moveq #8,%d0
	cmp.l %a1,%d0
	jne .L179
	or.l %d4,%d1
	or.l %d3,%d1
	jeq .L170
	clr.b (%a2)
.L181:
	clr.b %d2
	move.b %d2,(%a2,%a1.l)
	addq.l #1,%a1
	cmp.l #25600,%a1
	jne .L181
.L182:
	lea (%a3,%d1.l),%a0
	moveq #8,%d0
	move.b (%a0),(%a2,%d1.l)
	addq.l #1,%d1
	cmp.l %d1,%d0
	jne .L182
	clr.l %d0
	lea (8,%a2),%a0
.L183:
	move.l 36(%sp),%a1
	lea (%a1,%d0.l),%a3
	move.b (%a3),(%a0,%d0.l)
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L183
	move.b #80,(%a2)
	moveq #24,%d2
	move.l %a2,-(%sp)
	jsr nv_header_crc
	addq.l #4,%sp
	move.l %d0,%d1
	lsr.l %d2,%d1
	moveq #1,%d2
	move.b %d1,520(%a2)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,521(%a2)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,522(%a2)
	move.b %d0,523(%a2)
	jra .L170
	.size	psl_nv_begin, .-psl_nv_begin
	.align	2
	.globl	psl_nv_read
	.type	psl_nv_read, @function
psl_nv_read:
	lea (-24,%sp),%sp
	movem.l #3132,(%sp)
	move.l 44(%sp),%a2
	move.l 28(%sp),%a3
	move.l 32(%sp),%d1
	move.l 36(%sp),%a1
	tst.l %a2
	jeq .L197
	clr.l %d0
.L199:
	clr.b %d2
	moveq #64,%d5
	move.b %d2,(%a2,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d5
	jne .L199
	tst.l %a3
	jeq .L197
	tst.l 40(%sp)
	jeq .L197
	cmp.l #255,%d1
	jhi .L197
	moveq #7,%d0
	cmp.l %a1,%d0
	jcs .L197
	move.l %d1,%d0
	moveq #24,%d5
	lsl.l #3,%d0
	move.l %d0,%d3
	add.l %a1,%d3
	mulu.w #12,%d3
	move.l %d3,%a0
	lea (1032,%a0),%a0
	add.l %a3,%a0
	move.b (%a0),%d2
	move.b 1(%a0),%d4
	move.b 2(%a0),%d0
	lsl.l %d5,%d2
	mvz.b %d4,%d4
	mvz.b %d0,%d0
	swap %d4
	clr.w %d4
	lsl.l #8,%d0
	or.l %d4,%d2
	mvz.b 3(%a0),%d4
	or.l %d4,%d2
	or.l %d0,%d2
	jeq .L197
	move.l 40(%sp),-(%sp)
	move.l %a1,-(%sp)
	move.l %d1,-(%sp)
	move.l %a3,-(%sp)
	jsr nv_record_crc
	lea (16,%sp),%sp
	cmp.l %d0,%d2
	jne .L197
	add.l #1024,%d3
	clr.l %d0
.L200:
	move.l %d0,%d1
	lsr.l #3,%d1
	moveq #7,%d2
	moveq #64,%d5
	and.l %d0,%d2
	add.l %d3,%d1
	mvz.b (%a3,%d1.l),%d1
	asr.l %d2,%d1
	moveq #1,%d2
	and.l %d2,%d1
	move.b %d1,(%a2,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d5
	jne .L200
.L197:
	movem.l (%sp),#3132
	lea (24,%sp),%sp
	rts
	.size	psl_nv_read, .-psl_nv_read
	.align	2
	.globl	psl_nv_invalidate
	.type	psl_nv_invalidate, @function
psl_nv_invalidate:
	move.l %d2,-(%sp)
	move.l 8(%sp),%a0
	move.l 12(%sp),%d1
	move.l 16(%sp),%d0
	tst.l %a0
	jeq .L215
	cmp.l #255,%d1
	jhi .L215
	moveq #7,%d2
	cmp.l %d0,%d2
	jcs .L215
	lsl.l #3,%d1
	add.l %d1,%d0
	mulu.w #12,%d0
	add.l #1032,%d0
	add.l %d0,%a0
	clr.b %d0
	clr.b (%a0)
	move.b %d0,1(%a0)
	move.b %d0,2(%a0)
	move.b %d0,3(%a0)
.L215:
	move.l (%sp)+,%d2
	rts
	.size	psl_nv_invalidate, .-psl_nv_invalidate
	.align	2
	.globl	psl_nv_publish
	.type	psl_nv_publish, @function
psl_nv_publish:
	lea (-40,%sp),%sp
	movem.l #7420,(%sp)
	move.l 44(%sp),%d2
	move.l 48(%sp),%d4
	move.l 52(%sp),%a4
	tst.l %d2
	jeq .L220
	tst.l 56(%sp)
	jeq .L220
	tst.l 60(%sp)
	jeq .L220
	cmp.l #255,%d4
	jhi .L220
	moveq #7,%d0
	cmp.l %a4,%d0
	jcs .L220
	move.l %d4,%d0
	lsl.l #3,%d0
	move.l %a4,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %d0,%d3
	add.l %a4,%d3
	mulu.w #12,%d3
	jsr psl_nv_invalidate
	move.l 68(%sp),%d7
	add.l #120,%d7
	lea (12,%sp),%sp
	clr.l %d1
	move.l %d3,%a0
	lea (1024,%a0),%a0
	add.l %d2,%a0
.L222:
	clr.b %d6
	move.l 60(%sp),%a3
	move.l %d7,%a2
	clr.l %d0
	add.l %d1,%a3
.L226:
	mvz.b (%a3,%d0.l),%d5
	move.l %d5,%a1
	moveq #1,%d5
	cmp.l %a1,%d5
	jne .L225
	mvz.b (%a2),%d5
	cmp.l #255,%d5
	jeq .L225
	move.l %a1,%d5
	lsl.l %d0,%d5
	or.l %d5,%d6
.L225:
	addq.l #1,%d0
	lea (32,%a2),%a2
	moveq #8,%d5
	cmp.l %d0,%d5
	jne .L226
	move.b %d6,(%a0)+
	add.l #256,%d7
	addq.l #8,%d1
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L222
	move.l 56(%sp),-(%sp)
	move.l %a4,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr nv_record_crc
	add.l #1032,%d3
	lea (16,%sp),%sp
	move.l %d2,%a0
	moveq #24,%d2
	move.l %d0,%d1
	lsr.l %d2,%d1
	add.l %d3,%a0
	move.b %d1,(%a0)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,1(%a0)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,2(%a0)
	move.b %d0,3(%a0)
.L220:
	movem.l (%sp),#7420
	lea (40,%sp),%sp
	rts
	.size	psl_nv_publish, .-psl_nv_publish
	.align	2
	.globl	psl_font_text_at
	.type	psl_font_text_at, @function
psl_font_text_at:
	lea (-40,%sp),%sp
	movem.l #1276,(%sp)
	move.l 48(%sp),%d2
	move.l 56(%sp),%a1
	tst.l 44(%sp)
	jeq .L238
	tst.l %a1
	jeq .L238
	moveq #57,%d0
	cmp.l 52(%sp),%d0
	jcs .L238
	moveq #1,%d6
.L241:
	move.b (%a1),%d0
	jeq .L238
	move.l %d2,%d1
	moveq #124,%d3
	addq.l #5,%d1
	cmp.l %d1,%d3
	jcc .L252
.L238:
	movem.l (%sp),#1276
	lea (40,%sp),%sp
	rts
.L252:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a1
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L242
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #letters,%a0
.L243:
	move.l %d2,%d5
	clr.l %d0
	lsl.l #3,%d5
	move.l %d5,28(%sp)
.L251:
	tst.l %a0
	jeq .L254
	mvz.b (%a0,%d0.l),%d1
.L244:
	moveq #58,%d7
	mvs.b -1(%a1),%d3
	cmp.l %d3,%d7
	jne .L245
	moveq #36,%d3
	btst %d0,%d3
	jeq .L246
.L256:
	moveq #4,%d1
	jra .L246
.L242:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d4
	cmp.l %d1,%d4
	jcs .L253
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #digits,%a0
	jra .L243
.L253:
	sub.l %a0,%a0
	jra .L243
.L254:
	clr.l %d1
	jra .L244
.L245:
	moveq #46,%d4
	cmp.l %d3,%d4
	jne .L247
	moveq #6,%d5
	cmp.l %d0,%d5
	jeq .L256
.L246:
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
.L250:
	moveq #16,%d5
	lsr.l %d3,%d5
	and.l %d1,%d5
	tst.l %d5
	jeq .L249
	move.l 32(%sp),%a2
	add.l %d4,%a2
	add.l 44(%sp),%a2
	move.b (%a2),%d5
	or.l 36(%sp),%d5
	move.b %d5,(%a2)
.L249:
	addq.l #1,%d3
	addq.l #8,%d4
	moveq #5,%d5
	cmp.l %d3,%d5
	jne .L250
	addq.l #1,%d0
	moveq #7,%d7
	cmp.l %d0,%d7
	jne .L251
	addq.l #6,%d2
	jra .L241
.L247:
	moveq #45,%d7
	cmp.l %d3,%d7
	jne .L248
	moveq #3,%d3
	cmp.l %d0,%d3
	jne .L246
	moveq #14,%d1
	jra .L246
.L248:
	moveq #47,%d4
	cmp.l %d3,%d4
	jne .L246
	mvz.w %d0,%d1
	moveq #6,%d5
	lsl.l #2,%d1
	move.l %d1,%d3
	move.l %d6,%d1
	divu.l %d5,%d3
	lsl.l %d3,%d1
	jra .L246
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
	jeq .L269
	tst.l %d0
	jeq .L269
	tst.l %a0
	jeq .L269
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L269
	moveq #63,%d5
	cmp.l %d1,%d5
	jcs .L269
	move.w #128,%a1
	sub.l %d2,%a1
	cmp.l %a1,%d0
	jhi .L269
	move.w #64,%a1
	sub.l %d1,%a1
	cmp.l %a1,%a0
	jhi .L269
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
.L272:
	cmp.l %a1,%d6
	jcc .L276
.L269:
	movem.l (%sp),#7420
	lea (36,%sp),%sp
	rts
.L276:
	cmp.l %d7,%a1
	jne .L277
	move.l %a0,%d4
.L273:
	cmp.l %a1,%d6
	jne .L278
	move.l %d3,%d1
.L274:
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
.L275:
	move.b (%a2),%d5
	addq.l #1,%d4
	addq.l #8,%a2
	and.l %d1,%d5
	move.b %d5,-8(%a2)
	cmp.l %d4,%d0
	jhi .L275
	addq.l #1,%a1
	jra .L272
.L277:
	clr.l %d4
	jra .L273
.L278:
	moveq #7,%d1
	jra .L274
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
	jeq .L286
	tst.l %a4
	jeq .L286
	moveq #59,%d0
	cmp.l 48(%sp),%d0
	jcs .L286
	moveq #1,%d2
	lea pixel,%a3
.L289:
	move.b (%a4),%d0
	jeq .L286
	move.l %a5,%d1
	moveq #124,%d3
	addq.l #3,%d1
	cmp.l %d1,%d3
	jcc .L302
.L286:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L302:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a4
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L290
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #alpha.1,%a2
.L291:
	clr.l %d3
	moveq #4,%d5
.L301:
	tst.l %a2
	jeq .L304
	mvz.b (%a2,%d3.l),%d4
.L292:
	mvs.b -1(%a4),%d0
	moveq #58,%d1
	cmp.l %d0,%d1
	jne .L293
	moveq #-3,%d0
	and.l %d3,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L297
.L306:
	moveq #2,%d4
	jra .L297
.L290:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d3
	cmp.l %d1,%d3
	jcs .L303
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #digit.0,%a2
	jra .L291
.L303:
	sub.l %a2,%a2
	jra .L291
.L304:
	clr.l %d4
	jra .L292
.L293:
	moveq #46,%d1
	cmp.l %d0,%d1
	jne .L296
	moveq #4,%d0
	cmp.l %d3,%d0
	jeq .L306
.L297:
	clr.l %d6
.L300:
	move.l %d5,%d0
	lsr.l %d6,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L299
	clr.l -(%sp)
	move.l 52(%sp),%a0
	pea (%a0,%d3.l)
	pea (%a5,%d6.l)
	move.l 52(%sp),-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L299:
	addq.l #1,%d6
	moveq #3,%d0
	cmp.l %d6,%d0
	jne .L300
	addq.l #1,%d3
	moveq #5,%d1
	cmp.l %d3,%d1
	jne .L301
	addq.l #4,%a5
	jra .L289
.L296:
	moveq #45,%d1
	cmp.l %d0,%d1
	jne .L298
	moveq #2,%d0
	cmp.l %d3,%d0
	jne .L297
	moveq #7,%d4
	jra .L297
.L298:
	moveq #47,%d1
	cmp.l %d0,%d1
	jne .L295
	move.l %d3,%d0
	lsr.l #1,%d0
	move.l %d2,%d4
	lsl.l %d0,%d4
	jra .L297
.L295:
	moveq #91,%d1
	cmp.l %d0,%d1
	jne .L294
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L308
	moveq #6,%d4
	jra .L297
.L294:
	moveq #93,%d1
	cmp.l %d0,%d1
	jne .L297
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L309
	moveq #1,%d4
	jra .L297
.L308:
	moveq #4,%d4
	jra .L297
.L309:
	moveq #3,%d4
	jra .L297
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
	jeq .L321
	tst.l %d0
	jeq .L321
	tst.l %a3
	jeq .L321
	moveq #127,%d1
	cmp.l %d3,%d1
	jcs .L321
	moveq #63,%d1
	cmp.l %a2,%d1
	jcs .L321
	move.l #128,%d1
	sub.l %d3,%d1
	cmp.l %d1,%d0
	jhi .L321
	moveq #64,%d1
	sub.l %a2,%d1
	cmp.l %d1,%a3
	jhi .L321
	lea -1(%a2,%a3.l),%a6
	lea pixel,%a4
	add.l %d3,%d0
	move.l %d3,%d4
	move.l %a4,%a5
.L324:
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
	jhi .L324
	move.l %d0,%d4
	add.l %a2,%a3
	subq.l #1,%d4
.L325:
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
	jhi .L325
.L321:
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
	jeq .L334
	tst.l %a5
	jeq .L334
	tst.l %a4
	jeq .L334
	moveq #127,%d0
	cmp.l %a2,%d0
	jcs .L334
	moveq #63,%d0
	cmp.l %a3,%d0
	jcs .L334
	move.l #128,%d0
	sub.l %a2,%d0
	cmp.l %d0,%a5
	jhi .L334
	moveq #64,%d0
	sub.l %a3,%d0
	cmp.l %d0,%a4
	jhi .L334
	lea -1(%a3,%a4.l),%a0
	clr.l %d2
	lea pixel,%a6
	move.l %a0,32(%sp)
.L337:
	btst #1,%d2
	jne .L336
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
.L336:
	addq.l #1,%d2
	cmp.l %a5,%d2
	jne .L337
	lea -1(%a2,%a5.l),%a5
	clr.l %d2
	lea pixel,%a6
	move.l %a5,%d4
.L339:
	btst #1,%d2
	jne .L338
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
.L338:
	addq.l #1,%d2
	cmp.l %a4,%d2
	jne .L339
.L334:
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
	jeq .L351
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L351
	moveq #63,%d3
	cmp.l %d4,%d3
	jcs .L351
	move.w #128,%a0
	sub.l %d2,%a0
	cmp.l %a0,%d0
	jhi .L351
	move.w #64,%a0
	sub.l %d4,%a0
	cmp.l %a0,%d1
	jhi .L351
	move.l %d2,%d5
	move.l %d4,%d6
	add.l %d0,%d5
	add.l %d1,%d6
	lea pixel,%a2
.L353:
	cmp.l %d2,%d5
	jls .L351
	move.l %d4,%d3
	jra .L355
.L354:
	pea 1.w
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 40(%sp),-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (16,%sp),%sp
.L355:
	cmp.l %d3,%d6
	jhi .L354
	addq.l #1,%d2
	jra .L353
.L351:
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
	jcc .L361
	clr.l %d0
.L361:
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
	.string	"MANUAL LOCKS: KEEP"
.LC6:
	.string	"REPLACE EXISTING: YES"
.LC7:
	.string	"EXISTING LOCKS: KEEP"
.LC8:
	.string	"INCLUDES MANUAL LOCKS"
.LC9:
	.string	"C:RETAIN MANUAL ON"
.LC10:
	.string	"C:REPLACE EXISTING ON"
.LC11:
	.string	"C:REPLACE EXISTING OFF"
.LC12:
	.string	"C:RETAIN MANUAL OFF"
.LC13:
	.string	"STOPPING PLAYBACK..."
.LC14:
	.string	"NO:CANCEL"
.LC15:
	.string	"YES/NO:CLOSE"
.LC16:
	.string	"PATTERN "
.LC17:
	.string	"-"
.LC18:
	.string	"YES:APPLY NO:BACK"
.LC19:
	.string	"A:ALL B:TRACK"
.LC20:
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
	jeq .L363
	tst.l %a6
	jeq .L363
	move.l %d2,%d0
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L403
	moveq #64,%d4
	sub.l %a2,%a2
	move.l %d4,52(%sp)
.L365:
	move.l 52(%sp),-(%sp)
	pea 116.w
	moveq #1,%d7
	move.l %a2,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_clear
	lea (20,%sp),%sp
	lea psl_font_small_text,%a3
	cmp.l %d2,%d7
	jne .L366
	lea part_rows,%a4
	addq.l #5,%a2
	clr.l %d2
	lea psl_font_invert,%a5
.L368:
	move.l (%a4)+,-(%sp)
	move.l %a2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	cmp.l cursor.l,%d2
	jne .L367
	pea 7.w
	pea 112.w
	pea -1(%a2)
	pea 8.w
	move.l %a6,-(%sp)
	jsr (%a5)
	lea (20,%sp),%sp
.L367:
	addq.l #1,%d2
	addq.l #8,%a2
	moveq #6,%d0
	cmp.l %d2,%d0
	jne .L368
.L433:
	pea 58.w
	pea 116.w
	pea 3.w
.L431:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
.L363:
	movem.l (%sp),#31996
	lea (92,%sp),%sp
	rts
.L403:
	moveq #58,%d5
	move.w #3,%a2
	move.l %d5,52(%sp)
	jra .L365
.L366:
	move.l action,%d1
	move.l %d1,48(%sp)
	tst.l %d1
	jne .L404
	move.l #.LC0,%d0
.L369:
	move.l %d0,-(%sp)
	moveq #5,%d4
	pea 2(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea 7.w
	pea 114.w
	pea 1(%a2)
	pea 7.w
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (36,%sp),%sp
	cmp.l %d2,%d4
	jne .L370
	pea .LC13
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC14
.L432:
	pea 26(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	jra .L433
.L404:
	move.l #.LC1,%d0
	jra .L369
.L370:
	moveq #4,%d5
	cmp.l %d2,%d5
	jne .L371
	move.l message,-(%sp)
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC15
	jra .L432
.L371:
	moveq #3,%d7
	cmp.l %d2,%d7
	jne .L372
	pea .LC16
	move.l #635712,%d4
	move.l %sp,%d3
	add.l #72,%d3
	move.l %d3,-(%sp)
	moveq #10,%d5
	jsr text
	move.l plan,%d0
	add.l #-1074668000,%d0
	divu.l %d4,%d0
	clr.b %d7
	add.l #65,%d0
	move.b %d0,84(%sp)
	mvz.b plan+4,%d0
	addq.l #8,%sp
	move.b %d7,79(%sp)
	addq.l #1,%d0
	remu.l %d5,%d1:%d0
	divu.l %d5,%d0
	add.l #48,%d0
	add.l #48,%d1
	move.b %d0,77(%sp)
	move.b %d1,78(%sp)
	move.l %d3,-(%sp)
	pea 10.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L372:
	moveq #3,%d1
	cmp.l %d2,%d1
	seq %d0
	neg.l %d0
	tst.b %d0
	jeq .L373
	moveq #18,%d4
	move.l %d4,64(%sp)
.L374:
	moveq #3,%d7
	cmp.l %d2,%d7
	sne %d0
	neg.l %d0
	tst.b %d0
	jeq .L375
	lea (72,%sp),%a5
.L376:
	lea (3,%a5),%a0
	clr.l %d3
	move.l %a0,60(%sp)
	lea plan+608,%a0
	move.l %a0,56(%sp)
	lea psl_font_small_text,%a4
.L396:
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
	jeq .L377
	tst.l %d5
	jeq .L405
	move.l selected,%d0
	btst %d3,%d0
	jeq .L406
	move.l #.LC3,%d0
.L378:
	move.l %d0,-(%sp)
	pea 72(%sp)
	jsr text
	addq.l #8,%sp
.L377:
	move.l %d3,%d0
	add.l #49,%d0
	moveq #3,%d7
	moveq #32,%d4
	move.b #84,(%a5)
	move.b %d0,1(%a5)
	move.b %d4,2(%a5)
	cmp.l %d2,%d7
	jne .L379
	tst.l %d5
	jeq .L380
	move.l selected,%d0
	btst %d3,%d0
	jne .L407
.L380:
	pea .LC17
	move.l 64(%sp),-(%sp)
	jsr text
	addq.l #8,%sp
.L382:
	pea 68(%sp)
	move.l %a3,-(%sp)
	move.l %d6,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_font_small_text
	lea (16,%sp),%sp
	tst.l %d5
	jne .L387
	tst.l 44(%sp)
	seq %d4
	neg.l %d4
	tst.b %d4
	jeq .L388
	moveq #58,%d7
.L389:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L390
	move.w #1,%a0
.L391:
	add.l %a3,%a0
.L392:
	cmp.l %d6,%d7
	jls .L395
	mvz.w %d6,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
.L394:
	move.w %d0,%d4
	moveq #3,%d5
	mulu.w #3,%d4
	add.l %d6,%d4
	and.l %d5,%d4
	tst.l %d4
	jne .L393
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
.L393:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L394
	addq.l #1,%d6
	jra .L392
.L373:
	moveq #10,%d5
	move.l %d5,64(%sp)
	jra .L374
.L375:
	lea (68,%sp),%a5
	jra .L376
.L405:
	move.l #.LC2,%d0
	jra .L378
.L406:
	move.l #.LC4,%d0
	jra .L378
.L407:
	move.l 56(%sp),%a1
	clr.l %d0
	sub.l %a0,%a0
.L381:
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
	jne .L381
	moveq #99,%d4
	cmp.l %d0,%d4
	jcc .L383
	moveq #100,%d4
	move.l %d0,%d7
	divu.l %d4,%d7
	lea (4,%a5),%a0
	moveq #10,%d1
	remu.l %d1,%d4:%d7
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,3(%a5)
.L384:
	moveq #10,%d4
	move.l %d0,%d1
	divu.l %d4,%d1
	move.l %d1,%d7
	remu.l %d4,%d1:%d7
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L385
.L383:
	move.l 60(%sp),%a0
	moveq #9,%d7
	cmp.l %d0,%d7
	jcs .L384
.L385:
	moveq #10,%d4
	remu.l %d4,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L382
.L379:
	tst.l %d5
	jeq .L409
	lea captured+7,%a0
	tst.b (%a0,%d3.l)
	jeq .L410
	moveq #70,%d0
.L386:
	move.b %d0,3(%a5)
	clr.b %d0
	move.b %d0,4(%a5)
	jra .L382
.L409:
	moveq #45,%d0
	jra .L386
.L410:
	moveq #83,%d0
	jra .L386
.L388:
	moveq #114,%d7
	jra .L389
.L390:
	move.w #5,%a0
	jra .L391
.L387:
	moveq #2,%d7
	cmp.l %d2,%d7
	jne .L395
	cmp.l cursor.l,%d3
	jne .L395
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l 56(%sp),%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L395:
	moveq #64,%d0
	addq.l #1,%d3
	moveq #8,%d1
	add.l %d0,56(%sp)
	cmp.l %d3,%d1
	jne .L396
	subq.l #3,%d2
	tst.l %d2
	jne .L397
	moveq #1,%d5
	move.l replace,%d0
	cmp.l 48(%sp),%d5
	jne .L398
	tst.l %d0
	jeq .L411
	move.l #.LC8,%d0
.L399:
	move.l %d0,-(%sp)
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	lea psl_font_small_text,%a3
	jsr (%a3)
	pea .LC18
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
.L400:
	move.l 52(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L431
.L398:
	tst.l %d0
	jeq .L412
	move.l #.LC6,%d0
	jra .L399
.L411:
	move.l #.LC5,%d0
	jra .L399
.L412:
	move.l #.LC7,%d0
	jra .L399
.L397:
	move.l message,%d0
	tst.l %d0
	jne .L401
	move.l replace,%d0
	moveq #1,%d7
	cmp.l 48(%sp),%d7
	jne .L402
	tst.l %d0
	jeq .L413
	move.l #.LC12,%d0
.L401:
	move.l %d0,-(%sp)
	pea 42.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC19
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (28,%sp),%sp
	move.l #.LC20,(%sp)
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	jra .L400
.L402:
	tst.l %d0
	jeq .L414
	move.l #.LC10,%d0
	jra .L401
.L413:
	move.l #.LC9,%d0
	jra .L401
.L414:
	move.l #.LC11,%d0
	jra .L401
	.size	module_draw, .-module_draw
	.align	2
	.globl	psl_native_source
	.type	psl_native_source, @function
psl_native_source:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 1187521622,%d5
	move.l 60(%sp),%a3
	move.b 269161680,%d4
	move.b 269161679,%d2
	tst.l %a3
	jeq .L435
	move.l %d5,%d3
	add.l #-1074668000,%d3
	cmp.l #9535680,%d3
	jls .L436
.L435:
	clr.l %d0
.L434:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L436:
	move.l #635712,%d1
	remu.l %d1,%d0:%d3
	divu.l %d1,%d3
	tst.l %d0
	jne .L435
	mvz.b %d4,%d6
	moveq #15,%d0
	cmp.l %d6,%d0
	jcs .L435
	mvz.b %d2,%d0
	lsr.l #2,%d0
	jne .L435
	move.b %d2,%d0
	move.l %d5,%a5
	add.l #585088,%a5
	mvz.w %d3,%d3
	move.b %d4,4(%a3)
	move.b %d2,5(%a3)
	lea origin_epoch,%a0
	lsl.l #4,%d3
	move.l %d5,(%a3)
	move.l (%a0),88(%a3)
	ext.w %d0
	mulu.w #6322,%d0
	add.l %d6,%d3
	move.l %d3,source_row
	add.l %d0,%a5
	clr.b %d0
	move.b %d0,6(%a3)
	jsr project_identity
	tst.l %d0
	jeq .L438
	pea identity
	move.l #269458176,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
.L438:
	ext.w %d4
	lea (60,%a5),%a2
	lea origin,%a4
	lea (24,%a3),%a1
	mulu.w #36568,%d4
	lea (34,%a5),%a6
	move.l %d4,%d7
	clr.l %d4
	add.l %d5,%d7
.L448:
	move.b (%a6,%d4.l),%d1
	move.w %d1,%a0
	mvz.b %d1,%d1
	move.l %d1,52(%sp)
	move.w %a0,%d1
	move.b %d1,7(%a3,%d4.l)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L449
	move.w %d4,%d1
	mulu.w #5,%d1
	move.l %d1,%a0
	lea (714,%a0),%a0
	add.l 52(%sp),%a0
	move.b (%a5,%a0.l),%d1
.L439:
	move.b %d1,15(%a3,%d4.l)
	move.l %d7,(%a1)+
	tst.l %d0
	jeq .L450
	move.l %a4,-(%sp)
	move.l %d7,-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	move.l #269458176,-(%sp)
	move.l %d0,68(%sp)
	move.l %a1,64(%sp)
	jsr psl_nv_read
	lea (20,%sp),%sp
	move.l 48(%sp),%d0
	move.l 44(%sp),%a1
.L441:
	move.l %a4,28(%a1)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L442
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jne .L443
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #80,%d1
	cmp.l %a0,%d1
	jne .L444
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #76,%d1
	cmp.l %a0,%d1
	jeq .L442
.L444:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #65,%d1
	cmp.l %a0,%d1
	jne .L445
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #66,%d1
	cmp.l %a0,%d1
	jeq .L442
.L445:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #70,%d1
	cmp.l %a0,%d1
	jne .L443
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #77,%d1
	cmp.l %a0,%d1
	jeq .L442
.L443:
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jeq .L446
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #2,%d1
	cmp.l %a0,%d1
	jne .L447
.L446:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #83,%d1
	cmp.l %a0,%d1
	jne .L447
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #50,%d1
	cmp.l %a0,%d1
	jeq .L442
.L447:
	move.b 6(%a3),%d1
	move.w %d1,%a0
	moveq #1,%d1
	lsl.l %d4,%d1
	move.l %d1,52(%sp)
	move.l %a0,%d1
	or.l 52(%sp),%d1
	move.b %d1,6(%a3)
.L442:
	addq.l #1,%d4
	lea (30,%a2),%a2
	add.l #2330,%d7
	lea (64,%a4),%a4
	moveq #8,%d1
	cmp.l %d4,%d1
	jne .L448
	cmp.l 1187521622.l,%d5
	jne .L435
	mvz.b 269161680,%d0
	cmp.l %d6,%d0
	jne .L435
	move.b 269161679,%d0
	eor.l %d2,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L434
.L449:
	st %d1
	jra .L439
.L450:
	sub.l %a0,%a0
.L440:
	clr.b %d1
	move.b %d1,(%a4,%a0.l)
	addq.l #1,%a0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L440
	jra .L441
	.size	psl_native_source, .-psl_native_source
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	cmp.l 1187521622.l,%d0
	jeq .L475
.L477:
	clr.l %d0
.L474:
	rts
.L475:
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L477
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L474
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L480
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L481
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L482
.L481:
	moveq #2,%d0
	jra .L478
.L480:
	clr.l %d0
.L478:
	rts
.L482:
	moveq #1,%d0
	jra .L478
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
	jcs .L484
	move.l %d0,1175346752
.L484:
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
	jne .L487
	move.l cursor,%d0
	moveq #51,%d3
	cmp.l %d1,%d3
	jne .L488
	tst.l %d0
	jeq .L489
	subq.l #1,%d0
.L514:
	move.l %d0,cursor
.L489:
	move.l cursor,%d0
	moveq #3,%d2
	cmp.l %d0,%d2
	jcc .L490
	moveq #3,%d0
.L490:
	move.l %d0,-(%sp)
	jsr psl_native_set_cursor
	addq.l #4,%sp
.L491:
	moveq #1,%d2
	move.l %d2,1187497772
	movem.l (%sp),#1052
	lea (16,%sp),%sp
	rts
.L488:
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L489
	moveq #4,%d1
	cmp.l %d0,%d1
	jcs .L489
	addq.l #1,%d0
	jra .L514
.L487:
	subq.l #2,%d0
	tst.l %d0
	jne .L491
	move.l eligible,%a0
	tst.l %a0
	jeq .L491
	move.l cursor,%d0
	moveq #3,%d4
	moveq #51,%d2
	and.l %d0,%d4
	lsr.l #2,%d0
	move.l %d4,%a1
	cmp.l %d1,%d2
	jeq .L503
	moveq #32,%d3
	cmp.l %d1,%d3
	jne .L493
	moveq #1,%d2
.L492:
	lsl.l #2,%d0
	move.l %a1,%d1
	add.l %d2,%d1
.L494:
	moveq #3,%d4
	cmp.l %d1,%d4
	jcs .L491
	move.l %d0,%a1
	add.l %d1,%a1
	move.l %a0,%d4
	move.l %a1,%d3
	btst %d3,%d4
	jeq .L495
	move.l %a1,cursor
	jra .L491
.L503:
	moveq #-1,%d2
	jra .L492
.L495:
	add.l %d2,%d1
	jra .L494
.L493:
	moveq #52,%d2
	cmp.l %d1,%d2
	jne .L497
	tst.l %d0
	jeq .L491
.L498:
	moveq #1,%d1
	sub.l %d0,%d1
	lea (%a1,%d1.l*4),%a2
	clr.l %d0
	move.l %a2,%d2
.L502:
	move.l %a1,%d1
	sub.l %d0,%d1
	lsr.l #2,%d1
	jne .L499
	move.l %d2,%d1
	move.l %a0,%d4
	sub.l %d0,%d1
	btst %d1,%d4
	jne .L500
.L499:
	move.l %a1,%d1
	add.l %d0,%d1
	lsr.l #2,%d1
	jne .L501
	move.l %d2,%d1
	move.l %a0,%d4
	add.l %d0,%d1
	btst %d1,%d4
	jeq .L501
.L500:
	move.l %d1,cursor
	jra .L491
.L497:
	moveq #33,%d3
	cmp.l %d1,%d3
	jne .L491
	tst.l %d0
	jne .L491
	jra .L498
.L501:
	addq.l #1,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L502
	jra .L491
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
	jeq .L539
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L517
	tst.l %d0
	jeq .L518
	tst.l %d1
	jne .L519
	tst.l %d0
	jle .L540
	move.l eligible,%d0
.L520:
	move.l %d0,selected
.L518:
	clr.l message
	moveq #1,%d2
	move.l %d2,1187497772
.L525:
	moveq #1,%d0
.L515:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L540:
	clr.l %d0
	jra .L520
.L519:
	moveq #1,%d2
	cmp.l %d1,%d2
	jne .L521
	move.l cursor,%d2
	move.l eligible,%d3
	btst %d2,%d3
	jeq .L518
	lsl.l %d2,%d1
	move.l selected,%d2
	tst.l %d0
	jle .L522
	or.l %d2,%d1
.L552:
	move.l %d1,selected
	jra .L518
.L522:
	not.l %d1
	and.l %d2,%d1
	jra .L552
.L521:
	subq.l #2,%d1
	tst.l %d1
	jne .L518
	moveq #1,%d1
	cmp.l action.l,%d1
	jne .L523
	add.l %d0,%d0
	subx.l %d0,%d0
	neg.l %d0
.L524:
	mvz.b %d0,%d0
	move.l %d0,replace
	jra .L518
.L523:
	tst.l %d0
	sgt %d0
	neg.l %d0
	jra .L524
.L517:
	moveq #1,%d2
	cmp.l %a0,%d2
	jne .L525
	subq.l #6,%d1
	tst.l %d1
	jne .L525
	move.l encoder_residual,%d2
	tst.l %d2
	jge .L526
	tst.l %d0
	jgt .L542
.L527:
	move.l %d0,%d3
	tst.l %d0
	jge .L528
	addq.l #3,%d3
.L528:
	move.l %d0,%d1
	asr.l #2,%d3
	and.l #-2147483645,%d1
	tst.l %d0
	jge .L529
	subq.l #1,%d1
	moveq #-4,%d0
	or.l %d0,%d1
	addq.l #1,%d1
.L529:
	add.l %d1,%d2
	move.l %d2,%d0
	and.l #-2147483645,%d0
	tst.l %d2
	jge .L530
	subq.l #1,%d0
	moveq #-4,%d1
	or.l %d1,%d0
	addq.l #1,%d0
.L530:
	move.l %d0,encoder_residual
	tst.l %d2
	jge .L531
	addq.l #3,%d2
.L531:
	asr.l #2,%d2
	moveq #-6,%d0
	add.l %d3,%d2
	cmp.l %d2,%d0
	jle .L532
	moveq #-6,%d2
.L533:
	move.l %d2,%d3
	lea move,%a2
.L534:
	tst.l %d3
	jgt .L535
	move.l %d2,%d0
	tst.l %d2
	jge .L536
	clr.l %d0
.L536:
	sub.l %d0,%d2
	lea move,%a2
.L537:
	tst.l %d2
	jeq .L525
	pea 51.w
	jsr (%a2)
	addq.l #1,%d2
	addq.l #4,%sp
	jra .L537
.L526:
	tst.l %d2
	jeq .L527
	tst.l %d0
	jge .L527
.L542:
	clr.l %d2
	jra .L527
.L532:
	moveq #6,%d1
	cmp.l %d2,%d1
	jge .L533
	moveq #6,%d2
	jra .L533
.L535:
	pea 32.w
	jsr (%a2)
	subq.l #1,%d3
	addq.l #4,%sp
	jra .L534
.L539:
	clr.l %d0
	jra .L515
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
	.globl	psl_native_transport
	.type	psl_native_transport, @function
psl_native_transport:
	move.l #-2147463394,%a0
.L557:
	tst.b (%a0)
	jne .L560
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L557
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L561
.L559:
	moveq #1,%d0
.L555:
	rts
.L561:
	move.l #-2147457792,%a0
.L558:
	tst.b (%a0)
	jne .L559
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L558
	jra .L555
.L560:
	moveq #2,%d0
	jra .L555
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.globl	psl_native_stop
	.type	psl_native_stop, @function
psl_native_stop:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L565
.L567:
	clr.l %d0
.L564:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L565:
	tst.w 1175263050.l
	jne .L567
#APP
| 85 "sdk/drafts/pattern-sample-locks/native.c" 1
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
| 88 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	moveq #1,%d0
	lea (16,%sp),%sp
	jra .L564
	.size	psl_native_stop, .-psl_native_stop
	.align	2
	.globl	psl_native_observe_key
	.type	psl_native_observe_key, @function
psl_native_observe_key:
	lea (-12,%sp),%sp
	movem.l #28,(%sp)
	tst.l 20(%sp)
	jeq .L568
	move.l 16(%sp),%d0
	add.l #-39,%d0
	lsr.l #1,%d0
	jne .L568
	tst.w 1175263050.l
	jne .L570
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L568
.L570:
	move.l 1187521622,%d0
	add.l #-1074668000,%d0
	move.b 269161680,%d4
	cmp.l #9535680,%d0
	jhi .L568
	move.l %d0,%d2
	move.l #635712,%d1
	remu.l %d1,%d3:%d2
	divu.l %d1,%d2
	tst.l %d3
	jne .L568
	mvz.b %d4,%d4
	moveq #15,%d0
	cmp.l %d4,%d0
	jcs .L568
	jsr project_identity
	tst.l %d0
	jeq .L568
	pea identity
	move.l #269458176,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L568
	mvz.w %d2,%d2
	lsl.l #4,%d2
	add.l %d4,%d2
	move.l #psl_nv_invalidate,%d4
.L571:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269458176,-(%sp)
	move.l %d4,%a0
	addq.l #1,%d3
	jsr (%a0)
	lea (12,%sp),%sp
	moveq #8,%d0
	cmp.l %d3,%d0
	jne .L571
	addq.l #1,origin_epoch
.L568:
	movem.l (%sp),#28
	lea (12,%sp),%sp
	rts
	.size	psl_native_observe_key, .-psl_native_observe_key
	.align	2
	.globl	psl_manual_sample
	.type	psl_manual_sample, @function
psl_manual_sample:
	link.w %fp,#-184
	moveq #7,%d0
	movem.l #1084,(%sp)
	move.b 269161676,%d1
	move.l 1175263052,%d4
	move.w 1175263050,%a0
	mvz.b %d1,%d3
	move.b %d1,-159(%fp)
	move.w %a0,-158(%fp)
	cmp.l %d3,%d0
	jcc .L586
.L588:
	clr.l -164(%fp)
	clr.l %d2
.L587:
	move.l 8(%fp),-(%sp)
	jsr psl_stock_sample_write
	addq.l #4,%sp
	tst.l -164(%fp)
	jeq .L585
	mvz.b -87(%fp),%d0
	move.l %d0,-(%sp)
	mvz.b -88(%fp),%d0
	move.l %d0,-(%sp)
	move.l -92(%fp),-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L585
	pea -156(%fp)
	move.l -68(%fp,%d3.l*4),-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269458176,-(%sp)
	jsr psl_nv_publish
	lea (20,%sp),%sp
.L585:
	movem.l -184(%fp),#1084
	unlk %fp
	rts
.L586:
	moveq #48,%d1
	cmp.l %d4,%d1
	jcs .L588
	moveq #15,%d2
	and.l %d4,%d2
	tst.l %d2
	jne .L588
	pea -92(%fp)
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L589
.L590:
	clr.l -164(%fp)
	jra .L587
.L589:
	jsr project_identity
	tst.l %d0
	jeq .L590
	pea identity
	move.l #269458176,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L590
	move.b -159(%fp),%d0
	move.l source_row,%d5
	ext.w %d0
	mvz.w %d0,%d0
	lsl.l #6,%d0
	move.l %d0,%a0
	add.l #origin,%a0
	move.l %a0,-164(%fp)
	clr.l %d0
	lea (-156,%fp),%a0
.L591:
	move.l -164(%fp),%a1
	moveq #64,%d1
	lea (%a1,%d0.l),%a2
	addq.l #1,%d0
	move.b (%a2),-1(%a0,%d0.l)
	cmp.l %d0,%d1
	jne .L591
	mvz.w -158(%fp),%d0
	add.l %d4,%a0
.L593:
	btst %d2,%d0
	jeq .L592
	clr.b %d1
	move.b %d1,(%a0,%d2.l)
.L592:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L593
	move.l %d3,-(%sp)
	move.l %d5,-(%sp)
	move.l #269458176,-(%sp)
	jsr psl_nv_invalidate
	lea (12,%sp),%sp
	move.l %d5,%d2
	moveq #1,%d0
	addq.l #1,origin_epoch
	move.l %d0,-164(%fp)
	jra .L587
	.size	psl_manual_sample, .-psl_manual_sample
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	lea (-372,%sp),%sp
	movem.l #31996,(%sp)
	move.l 376(%sp),%a6
	tst.l %a6
	jeq .L613
	tst.b 10(%a6)
	jne .L614
.L613:
	moveq #1,%d2
.L612:
	move.l %d2,%d0
	movem.l (%sp),#31996
	lea (372,%sp),%sp
	rts
.L614:
	jsr psl_native_transport
	tst.l %d0
	jne .L613
	move.l %sp,%d4
	add.l #280,%d4
	move.l %d4,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	move.l %d0,%d3
	tst.l %d0
	jeq .L613
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L612
	tst.w 1632(%a6)
	jne .L617
	clr.b %d0
	move.b %d0,10(%a6)
	jra .L612
.L617:
	jsr project_identity
	move.l %d0,%d2
	tst.l %d0
	jeq .L655
	pea identity
	move.l #269458176,-(%sp)
	jsr psl_nv_begin
	addq.l #8,%sp
	tst.l %d0
	jeq .L612
	clr.l %d0
	lea (216,%sp),%a0
.L619:
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b (%a1),%d1
	lea (152,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L619
	mvz.b 4(%a6),%d0
	mvz.b 7(%a6),%d2
	lea (608,%a6),%a1
	clr.l %d1
	lea (120,%sp),%a3
	mulu.w #36568,%d0
	move.l %sp,%d6
	move.l %sp,%d7
	move.l %d2,76(%sp)
	move.l %d4,70(%sp)
	add.l #304,%d6
	add.l #88,%d7
	move.l %a1,58(%sp)
	move.l %d0,%a0
	add.l #268525902,%a0
	move.l %a1,50(%sp)
	move.l %a3,62(%sp)
	clr.l 66(%sp)
	clr.l 54(%sp)
.L629:
	move.l %d6,%a2
	move.l %d7,%a1
	move.l (%a2),%d0
	move.l 62(%sp),%a2
	move.l 76(%sp),%d2
	move.l %d0,(%a1)
	move.l %a0,(%a2)
	btst %d1,%d2
	jeq .L620
	mvz.w %d1,%d2
	sub.l %a1,%a1
	lsl.l #3,%d2
	lea (%a6,%d2.l),%a2
.L622:
	mvz.b (%a1,%a0.l),%d3
	mvz.b 27(%a2,%a1.l),%d2
	cmp.l %d3,%d2
	jne .L621
	addq.l #1,%a1
	moveq #8,%d4
	cmp.l %a1,%d4
	jne .L622
	moveq #1,%d2
	add.l #120,%d0
	lsl.l %d1,%d2
	move.l 50(%sp),%a4
	moveq #89,%d3
	lea (31,%a0),%a2
	lea (216,%sp),%a1
	move.l %a2,80(%sp)
	move.l %d2,%d4
	not.l %d4
	move.l %d4,84(%sp)
.L628:
	move.b (%a4),74(%sp)
	move.l 80(%sp),%a5
	add.l %d3,%a5
	mvz.b (%a5),%d5
	move.l %d5,%a2
	mvz.b 74(%sp),%d5
	cmp.l %a2,%d5
	jne .L621
	move.b 512(%a4),%d4
	addq.l #1,%a4
	mvz.b %d4,%d5
	move.b %d4,75(%sp)
	move.l %d5,46(%sp)
	cmp.l %a2,%d5
	jeq .L623
	move.l 66(%sp),%d4
	moveq #10,%d5
	or.l %d2,54(%sp)
	muls.l %d5,%d4
	move.b 74(%sp),%d5
	addq.l #1,66(%sp)
	move.l %d4,%a2
	move.l #edits,%d4
	move.l %d0,(%a2,%d4.l)
	add.l %d4,%a2
	move.b 75(%sp),%d4
	move.b %d5,8(%a2)
	move.l %a5,4(%a2)
	move.l 46(%sp),%d5
	move.b %d4,9(%a2)
	cmp.l #255,%d5
	jne .L624
	move.l %d0,%a5
	sub.l %a2,%a2
	lea (-120,%a5),%a5
.L625:
	mvz.b 89(%a5,%a2.l),%d5
	cmp.l #255,%d5
	jne .L624
	addq.l #1,%a2
	moveq #31,%d4
	cmp.l %a2,%d4
	jne .L625
	move.b (%a1),%d5
	and.l 84(%sp),%d5
	jra .L703
.L624:
	move.b (%a1),%d5
	or.l %d2,%d5
.L703:
	move.b %d5,(%a1)
.L623:
	addq.l #1,%a1
	add.l #32,%d3
	add.l #32,%d0
	cmp.l #2137,%d3
	jne .L628
.L620:
	moveq #64,%d5
	addq.l #4,%d6
	addq.l #4,%d7
	addq.l #4,62(%sp)
	addq.l #1,%d1
	lea (2330,%a0),%a0
	moveq #8,%d0
	add.l %d5,50(%sp)
	cmp.l %d1,%d0
	jne .L629
#APP
| 154 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d4
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	jsr psl_native_transport
	move.l %d0,%d3
	tst.l %d0
	jeq .L630
.L704:
#APP
| 172 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d4,%sr
| 0 "" 2
#NO_APP
.L621:
	moveq #3,%d2
	jra .L612
.L630:
	mvz.b 5(%a6),%d6
	move.l (%a6),%d5
	move.l %d6,-(%sp)
	mvz.b 4(%a6),%d0
	move.l %d0,-(%sp)
	move.l %d5,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L704
	move.l origin_epoch,%d1
	cmp.l 604(%a6),%d1
	jne .L704
	lea (152,%sp),%a1
	clr.l %d2
	move.l #1187501196,%a0
.L634:
	mvz.b (%a0),%d1
	mvz.b (%a1)+,%d0
	cmp.l %d1,%d0
	jeq .L633
	moveq #3,%d2
.L633:
	addq.l #1,%a0
	cmp.l #1187501260,%a0
	jne .L634
	mulu.w #6322,%d6
	move.l %d5,%a1
	add.l #585088,%a1
	mvz.b 7(%a6),%d5
	clr.l %d1
	move.l %d5,62(%sp)
	move.l #714,%d5
	add.l %d6,%a1
	move.l 58(%sp),%d6
	lea (34,%a1),%a5
.L641:
	move.l 62(%sp),%d7
	btst %d1,%d7
	jeq .L635
	mvz.b (%a5,%d1.l),%d0
	mvz.b 11(%a6,%d1.l),%d7
	cmp.l %d0,%d7
	jne .L658
	move.l %d0,%a0
	add.l %d5,%a0
	mvz.b 19(%a6,%d1.l),%d0
	mvz.b (%a1,%a0.l),%d7
	cmp.l %d7,%d0
	jne .L658
.L636:
	mvz.w %d1,%d0
	move.l 88(%sp,%d1.l*4),%a2
	lsl.l #3,%d0
	lea (%a6,%d0.l),%a4
	clr.l %d0
.L638:
	mvz.b (%a2,%d0.l),%d7
	move.l %d7,76(%sp)
	mvz.b 27(%a4,%d0.l),%d7
	cmp.l 76(%sp),%d7
	jne .L660
	move.l (%a3),%a0
	mvz.b (%a0,%d0.l),%d7
	cmp.l 76(%sp),%d7
	jne .L660
.L637:
	addq.l #1,%d0
	moveq #8,%d7
	cmp.l %d0,%d7
	jne .L638
	move.l %d6,%a4
	moveq #120,%d0
.L640:
	mvz.b (%a2,%d0.l),%d7
	move.l %d7,76(%sp)
	mvz.b (%a4)+,%d7
	cmp.l 76(%sp),%d7
	jne .L662
	move.l (%a3),%a0
	mvz.b (%a0,%d0.l),%d7
	cmp.l 76(%sp),%d7
	jne .L662
.L639:
	add.l #32,%d0
	cmp.l #2168,%d0
	jne .L640
.L635:
	addq.l #1,%d1
	addq.l #4,%a3
	add.l #64,%d6
	addq.l #5,%d5
	moveq #8,%d0
	cmp.l %d1,%d0
	jne .L641
	tst.l %d2
	jeq .L663
#APP
| 172 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d4,%sr
| 0 "" 2
#NO_APP
	jra .L612
.L658:
	moveq #3,%d2
	jra .L636
.L660:
	moveq #3,%d2
	jra .L637
.L662:
	moveq #3,%d2
	jra .L639
.L663:
	clr.l %d5
	lea psl_nv_invalidate,%a2
.L642:
	move.l 54(%sp),%d1
	btst %d5,%d1
	jeq .L644
	move.l %d5,-(%sp)
	move.l source_row,-(%sp)
	move.l #269458176,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
.L644:
	addq.l #1,%d5
	moveq #8,%d7
	cmp.l %d5,%d7
	jne .L642
	lea edits,%a1
	clr.l %d0
.L645:
	cmp.l 66(%sp),%d0
	jne .L646
	clr.l %d0
	lea (216,%sp),%a0
.L648:
	move.b (%a0,%d0.l),%d1
	lea (152,%sp),%a1
	mvz.b (%a1,%d0.l),%d6
	mvz.b %d1,%d5
	cmp.l %d6,%d5
	jeq .L647
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b %d1,(%a1)
.L647:
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L648
	clr.b %d7
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d5
	move.l %d5,269452696
	move.b %d7,10(%a6)
#APP
| 172 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d4,%sr
| 0 "" 2
#NO_APP
	lea origin,%a3
	clr.l %d4
	lea psl_nv_publish,%a2
.L652:
	move.l 54(%sp),%d1
	btst %d4,%d1
	jeq .L649
	move.l 58(%sp),%a1
	sub.l %a0,%a0
.L651:
	move.b (%a1)+,%d1
	move.b 511(%a1),%d0
	mvz.b %d1,%d1
	mvz.b %d0,%d5
	cmp.l %d1,%d5
	jeq .L650
	not.l %d0
	tst.b %d0
	sne %d0
	neg.l %d0
	move.b %d0,(%a3,%a0.l)
.L650:
	addq.l #1,%a0
	moveq #64,%d5
	cmp.l %a0,%d5
	jne .L651
	move.l %a3,-(%sp)
	move.l 74(%sp),%a0
	move.l 24(%a0),-(%sp)
	move.l %d4,-(%sp)
	move.l source_row,-(%sp)
	move.l #269458176,-(%sp)
	jsr (%a2)
	lea (20,%sp),%sp
.L649:
	moveq #64,%d0
	addq.l #1,%d4
	lea (64,%a3),%a3
	moveq #8,%d1
	addq.l #4,70(%sp)
	add.l %d0,58(%sp)
	cmp.l %d4,%d1
	jne .L652
	addq.l #1,origin_epoch
	jsr 1073905152
.L654:
	move.l 54(%sp),%d4
	btst %d3,%d4
	jeq .L653
	move.l %d3,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L653:
	addq.l #1,%d3
	moveq #8,%d5
	cmp.l %d3,%d5
	jne .L654
	jra .L612
.L646:
	move.b 9(%a1),%d1
	move.l (%a1),%a0
	addq.l #1,%d0
	lea (10,%a1),%a1
	move.b %d1,(%a0)
	move.l -6(%a1),%a0
	move.b %d1,(%a0)
	jra .L645
.L655:
	move.l %d3,%d2
	jra .L612
	.size	psl_native_commit, .-psl_native_commit
	.section	.rodata.str1.1
.LC21:
	.string	"REFUSED - NO CHANGES"
.LC22:
	.string	"DONE - PROJECT NOT SAVED"
.LC23:
	.string	"SOURCE CHANGED - REOPEN"
	.text
	.align	2
	.type	finish_action, @function
finish_action:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	tst.l %d0
	jeq .L707
	subq.l #3,%d0
	tst.l %d0
	jne .L708
	move.l #.LC23,%d0
.L706:
	move.l %d0,message
	moveq #4,%d1
	clr.b %d0
	move.l %d1,phase
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	rts
.L707:
	move.l #.LC22,%d0
	jra .L706
.L708:
	move.l #.LC21,%d0
	jra .L706
	.size	finish_action, .-finish_action
	.section	.rodata.str1.1
.LC24:
	.string	"RECORDER ACTIVE - REFUSED"
.LC25:
	.string	"STOP TIMED OUT - REFUSED"
	.text
	.align	2
	.globl	module_tick
	.type	module_tick, @function
module_tick:
	moveq #1,%d0
	cmp.l phase.l,%d0
	jne .L710
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jeq .L710
	jsr close_view
.L710:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L711
	subq.l #4,%d0
	tst.l %d0
	jeq .L711
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L712
.L714:
	jsr close_view
.L713:
	moveq #5,%d0
	cmp.l phase.l,%d0
	jne .L711
	jsr psl_native_transport
	tst.l %d0
	jne .L715
	jsr finish_action
.L711:
	move.l phase,%d0
	moveq #24,%d1
	move.l 4(%sp),%a0
	lsl.l %d1,%d0
	move.l selected,%d1
	swap %d1
	clr.w %d1
	or.l %d1,%d0
	mvz.w plan+1632,%d1
	or.l %d1,%d0
	move.l %d0,(%a0)
	rts
.L712:
	jsr psl_native_popup
	tst.l %d0
	jne .L714
	jra .L713
.L715:
	subq.l #2,%d0
	tst.l %d0
	jeq .L718
	move.l stop_ticks,%d0
	addq.l #1,%d0
	move.l %d0,stop_ticks
	moveq #119,%d1
	cmp.l %d0,%d1
	jcc .L717
	move.l #.LC25,%d0
.L716:
	move.l %d0,message
	moveq #4,%d1
	move.l %d1,phase
	clr.b %d0
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	jra .L711
.L718:
	move.l #.LC24,%d0
	jra .L716
.L717:
	tst.l stop_requested
	jne .L711
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L711
	.size	module_tick, .-module_tick
	.section	.rodata.str1.1
.LC26:
	.string	"ACTIVE PATTERN ONLY"
.LC27:
	.string	"SELECT TRACKS FIRST"
.LC28:
	.string	"CHECK SAMPLE ASSIGNMENTS"
	.text
	.align	2
	.globl	module_key
	.type	module_key, @function
module_key:
	lea (-124,%sp),%sp
	moveq #63,%d1
	movem.l #19516,(%sp)
	move.l 128(%sp),%a6
	move.l 132(%sp),%d0
	cmp.l %a6,%d1
	jcs .L726
	moveq #31,%d3
	move.l %a6,%d2
	move.l %a6,%d1
	and.l %d3,%d2
	moveq #1,%d3
	lsr.l #5,%d1
	lea consumed,%a0
	move.l (%a0,%d1.l*4),%a1
	lsl.l %d2,%d3
	move.l %a1,%d2
	and.l %d3,%d2
	tst.l %d0
	jne .L727
	tst.l %d2
	jeq .L728
	not.l %d3
	move.l %a1,%d5
	and.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
.L729:
	moveq #1,%d0
	jra .L728
.L727:
	tst.l %d2
	jne .L729
	move.l phase,%d4
	moveq #5,%d5
	cmp.l %d4,%d5
	jeq .L730
	move.l %d0,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_native_observe_key
	addq.l #8,%sp
	tst.l %d4
	jeq .L726
	move.l %a6,%d0
	moveq #3,%d1
	add.l #-49,%d0
	cmp.l %d0,%d1
	jcc .L732
	add.l #17,%d0
	lsr.l #1,%d0
	jeq .L732
.L735:
	jsr close_view
.L726:
	clr.l %d0
.L728:
	movem.l (%sp),#19516
	lea (124,%sp),%sp
	rts
.L730:
	moveq #39,%d0
	cmp.l %a6,%d0
	jeq .L726
	move.l %a1,%d5
	moveq #50,%d0
	or.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
	cmp.l %a6,%d0
	jne .L729
.L737:
	jsr close_view
	jra .L729
.L732:
	moveq #1,%d0
	cmp.l %d4,%d0
	jne .L733
	moveq #49,%d1
	cmp.l %a6,%d1
	jne .L734
	moveq #3,%d5
	cmp.l cursor.l,%d5
	jcc .L735
.L733:
	or.l %d3,consumed+4
	moveq #50,%d1
	cmp.l %a6,%d1
	jne .L736
	subq.l #3,%d4
	tst.l %d4
	jne .L737
	clr.b %d0
	moveq #2,%d5
	move.l %d5,phase
	clr.l message
	move.b %d0,plan+10
.L747:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L729
.L734:
	moveq #50,%d0
	cmp.l %a6,%d0
	jne .L733
	jra .L735
.L736:
	move.l %a6,%d0
	moveq #1,%d3
	add.l #-51,%d0
	cmp.l %d0,%d3
	jcc .L738
	add.l #19,%d0
	cmp.l %d0,%d3
	jcs .L739
.L738:
	move.l %a6,-(%sp)
	jsr move
	addq.l #4,%sp
	jra .L729
.L739:
	moveq #1,%d5
	cmp.l %d4,%d5
	jne .L740
	moveq #4,%d1
	cmp.l cursor.l,%d1
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,action
	jsr psl_native_close_popup
	pea captured
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L741
	move.l #.LC26,%d3
	moveq #4,%d5
	move.l %d3,message
	moveq #1,%d0
	move.l %d5,phase
	move.l %d0,1187497772
	jra .L729
.L741:
	clr.b %d5
	mvz.b captured+6,%d1
	moveq #2,%d3
	clr.l cursor
	clr.l replace
	move.l %d1,eligible
	clr.l selected
	move.l %d3,phase
	clr.l message
	move.b %d5,plan+10
	tst.l %d1
	jeq .L742
	clr.b %d3
.L743:
	move.l %d1,%d4
	lsr.l %d2,%d4
	move.l %d2,%a0
	addq.l #1,%d2
	btst #0,%d4
	jeq .L754
	tst.b %d3
	jeq .L742
	move.l %a0,cursor
.L742:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L728
.L754:
	moveq #1,%d3
	jra .L743
.L740:
	moveq #2,%d3
	cmp.l %d4,%d3
	jne .L744
	lea (32,%sp),%a6
	move.l %a6,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L745
	move.l 32(%sp),%d4
	cmp.l captured.l,%d4
	jne .L745
	mvz.w captured+4,%d1
	mvz.w 36(%sp),%d0
	cmp.l %d1,%d0
	jne .L745
	move.b 38(%sp),%d3
	mvz.b %d3,%d0
	cmp.l eligible.l,%d0
	jeq .L746
.L745:
	move.l #.LC23,%d5
	moveq #4,%d0
	move.l %d5,message
.L778:
	move.l %d0,phase
	jra .L747
.L746:
	move.w 36(%sp),%d1
	moveq #2,%d5
	move.w %d1,30(%sp)
	move.l replace,-(%sp)
	move.l action,-(%sp)
	move.l selected,-(%sp)
	move.l %a6,-(%sp)
	pea plan
	jsr psl_prepare
	lea (20,%sp),%sp
	cmp.l %d0,%d5
	jne .L748
	lea .LC27,%a0
	move.l %a0,message
	jra .L747
.L748:
	tst.l %d0
	jeq .L749
	lea .LC28,%a2
	move.l %a2,message
	jra .L747
.L749:
	move.w 30(%sp),%a3
	move.b %d3,captured+6
	move.l %sp,%d0
	add.l #39,%d0
	move.l %d4,captured
	lea captured+7,%a6
	lea (56,%sp),%a1
	lea captured+24,%a0
	move.w %a3,captured+4
.L750:
	move.l %d0,%a2
	addq.l #1,%d2
	move.b (%a2)+,(%a6)+
	moveq #8,%d1
	move.b 7(%a2),7(%a6)
	lea (7,%a2),%a3
	move.l %a2,%d0
	move.l (%a1)+,(%a0)+
	move.l 28(%a1),28(%a0)
	cmp.l %d2,%d1
	jne .L750
	lea (120,%sp),%a0
	moveq #3,%d0
	move.l (%a0),captured+88
	jra .L778
.L744:
	subq.l #3,%d4
	tst.l %d4
	jne .L737
	jsr psl_native_transport
	moveq #2,%d5
	cmp.l %d0,%d5
	jne .L751
	clr.b %d0
	lea .LC24,%a0
	moveq #4,%d1
	move.l %a0,message
	move.l %d1,phase
	move.b %d0,plan+10
.L752:
	moveq #1,%d5
	move.l %d5,1187497772
	jra .L729
.L751:
	tst.l %d0
	jne .L753
	jsr finish_action
	jra .L752
.L753:
	moveq #5,%d3
	move.l %d3,phase
	clr.l stop_ticks
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L752
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
	jne .L779
	cmp.l #1175261212,%d4
	jne .L779
	cmp.l #1074502420,%d3
	jne .L779
	cmp.l #1074502404,%d2
	jne .L779
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jne .L779
	movem.l (%sp),#60
	lea (16,%sp),%sp
	jra psl_ui_open
.L779:
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
	.local	edits
	.comm	edits,5120,2
	.local	source_row
	.comm	source_row,4,2
	.local	origin_epoch
	.comm	origin_epoch,4,2
	.local	origin
	.comm	origin,512,1
	.local	identity
	.comm	identity,512,1
	.section	.rodata.str1.1
.LC29:
	.string	"RENAME"
.LC30:
	.string	"RELOAD"
.LC31:
	.string	"SAVE"
.LC32:
	.string	"SAVE ALL"
	.section	.rodata
	.align	2
	.type	part_rows, @object
	.size	part_rows, 24
part_rows:
	.long	.LC29
	.long	.LC30
	.long	.LC31
	.long	.LC32
	.long	.LC0
	.long	.LC1
	.local	encoder_residual
	.comm	encoder_residual,4,2
	.local	consumed
	.comm	consumed,8,2
	.local	message
	.comm	message,4,2
	.local	captured
	.comm	captured,92,2
	.local	plan
	.comm	plan,1636,2
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
	.type	nv_tag, @object
	.size	nv_tag, 8
nv_tag:
	.string	"PSLOWN\001"
	.ident	"GCC: (GNU) 16.2.0"
