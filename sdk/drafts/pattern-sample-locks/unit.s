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
	.type	nv_get32, @function
nv_get32:
	move.l %d2,-(%sp)
	moveq #24,%d2
	move.l 8(%sp),%a1
	move.b (%a1),%d1
	move.b 1(%a1),%d0
	lsl.l %d2,%d1
	move.w %d0,%a0
	move.b 2(%a1),%d0
	move.w %a0,%d2
	mvz.b %d0,%d0
	lsl.l #8,%d0
	mvz.b %d2,%d2
	swap %d2
	clr.w %d2
	or.l %d2,%d1
	mvz.b 3(%a1),%d2
	or.l %d2,%d1
	move.l (%sp)+,%d2
	or.l %d1,%d0
	rts
	.size	nv_get32, .-nv_get32
	.align	2
	.type	nv_header_crc, @function
nv_header_crc:
	move.l %a2,-(%sp)
	moveq #-1,%d0
	move.l %d2,-(%sp)
	clr.l %d2
	lea nv_crc_byte,%a2
.L6:
	move.l 12(%sp),%a0
	mvz.b (%a0,%d2.l),%d1
	addq.l #1,%d2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	cmp.l #520,%d2
	jne .L6
	move.l (%sp)+,%d2
	not.l %d0
	move.l (%sp)+,%a2
	rts
	.size	nv_header_crc, .-nv_header_crc
	.align	2
	.type	nv_entry_key, @function
nv_entry_key:
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
	add.l #64,%d1
	mvz.w %d1,%d1
	move.l 8(%sp),%a0
	lsl.l #4,%d1
	lea (%a0,%d1.l),%a1
	move.b (%a1),%d0
	mvz.b 1(%a1),%d2
	mvz.b %d0,%d0
	lsl.l #8,%d0
	or.l %d2,%d0
	cmp.l #2047,%d0
	jhi .L10
	lea 2(%a0,%d1.l),%a0
	move.b (%a0),%d1
	mvz.b 1(%a0),%d2
	mvz.b %d1,%d1
	lsl.l #8,%d1
	or.l %d2,%d1
	eor.l %d0,%d1
	cmp.l #65535,%d1
	jeq .L8
.L10:
	move.l #65535,%d0
.L8:
	move.l (%sp)+,%d2
	rts
	.size	nv_entry_key, .-nv_entry_key
	.align	2
	.type	nv_cache, @function
nv_cache:
	lea (-20,%sp),%sp
	movem.l #7180,(%sp)
	move.l 24(%sp),%a2
	pea 520(%a2)
	jsr nv_get32
	addq.l #4,%sp
	move.l %d0,%d3
	cmp.l nv_index_store.l,%a2
	jne .L15
	cmp.l nv_index_identity.l,%d0
	jeq .L14
.L15:
	lea nv_index,%a0
	move.l #nv_index+4096,%d0
	move.l %a0,%a3
.L17:
	move.w #-1,(%a0)+
	cmp.l %d0,%a0
	jne .L17
	clr.l %d2
	lea nv_entry_key,%a4
.L20:
	move.l %d2,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jeq .L18
	mvz.w (%a3,%d0.l*2),%d1
	cmp.l #65535,%d1
	jeq .L21
	move.l #65534,%d1
.L19:
	move.w %d1,(%a3,%d0.l*2)
.L18:
	addq.l #1,%d2
	cmp.l #704,%d2
	jne .L20
	move.l %a2,nv_index_store
	move.l %d3,nv_index_identity
.L14:
	movem.l (%sp),#7180
	lea (20,%sp),%sp
	rts
.L21:
	move.l %d2,%d1
	jra .L19
	.size	nv_cache, .-nv_cache
	.align	2
	.type	nv_find, @function
nv_find:
	move.l %d2,-(%sp)
	move.l 8(%sp),-(%sp)
	jsr nv_cache
	move.l 16(%sp),%d0
	addq.l #4,%sp
	lea nv_index,%a0
	mvz.w (%a0,%d0.l*2),%d2
	cmp.l #703,%d2
	jhi .L29
	move.l %d2,-(%sp)
	move.l 12(%sp),-(%sp)
	jsr nv_entry_key
	addq.l #8,%sp
	cmp.l 12(%sp),%d0
	jeq .L27
.L29:
	move.l #65535,%d2
.L27:
	move.l %d2,%d0
	move.l (%sp)+,%d2
	rts
	.size	nv_find, .-nv_find
	.align	2
	.type	nv_record_crc, @function
nv_record_crc:
	lea (-20,%sp),%sp
	moveq #-1,%d0
	movem.l #7180,(%sp)
	move.l 32(%sp),%a2
	move.l 24(%sp),%d2
	move.l %d2,%a4
	move.l %d2,%d3
	add.l #524,%d3
	lea (520,%a4),%a4
	lea nv_crc_byte,%a3
.L31:
	mvz.b (%a4)+,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l %a4,%d3
	jne .L31
	mvz.w 30(%sp),%d1
	sub.l %a4,%a4
	lsl.l #4,%d1
	add.l %d1,%d2
	add.l #1024,%d2
.L32:
	mvz.b (%a4,%d2.l),%d1
	addq.l #1,%a4
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #12,%d1
	cmp.l %a4,%d1
	jne .L32
	clr.l %d2
.L33:
	mvz.b (%a2,%d2.l),%d1
	addq.l #1,%d2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L33
	lea (120,%a2),%a4
	lea (2168,%a2),%a2
.L34:
	mvz.b (%a4),%d1
	lea (32,%a4),%a4
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l %a2,%a4
	jne .L34
	movem.l (%sp),#7180
	not.l %d0
	lea (20,%sp),%sp
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
.L41:
	move.b (%a1),%d0
	jne .L42
	clr.b (%a0)
	rts
.L42:
	move.b %d0,(%a0)+
	addq.l #1,%a1
	jra .L41
	.size	text, .-text
	.align	2
	.type	project_identity, @function
project_identity:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	clr.l %d1
	sub.l %a0,%a0
	lea identity,%a1
.L45:
	tst.l %a0
	jne .L50
	move.l %d1,%d0
	add.l #269452416,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L44:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L45
	tst.l %d2
	jne .L51
.L49:
	clr.l %d0
.L43:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L50:
	clr.b %d0
	jra .L44
.L51:
	clr.l %d1
	sub.l %a0,%a0
	lea identity+256,%a1
.L46:
	tst.l %a0
	jne .L52
	move.l %d1,%d0
	add.l #269452152,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L48:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L46
	tst.l %d2
	jeq .L49
	tst.b identity.l
	jeq .L49
	tst.b identity+256.l
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L43
.L52:
	clr.b %d0
	jra .L48
	.size	project_identity, .-project_identity
	.align	2
	.type	source_valid, @function
source_valid:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	tst.l %a0
	jne .L59
.L61:
	clr.l %d0
.L58:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L59:
	tst.l (%a0)
	jeq .L61
	mvz.b 4(%a0),%d0
	lsr.l #4,%d0
	jne .L61
	mvz.b 5(%a0),%d0
	lsr.l #2,%d0
	jne .L61
	mvz.b 6(%a0),%d2
	clr.l %d0
.L64:
	btst %d0,%d2
	jeq .L62
	tst.l 24(%a0,%d0.l*4)
	jeq .L61
	move.b 7(%a0,%d0.l),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	lsr.l #1,%d1
	jne .L61
	move.w %a1,%d3
	mvz.b 15(%a0,%d0.l),%d1
	tst.b %d3
	jeq .L65
	move.w #135,%a1
.L63:
	cmp.l %d1,%a1
	jcc .L62
	cmp.l #255,%d1
	jne .L61
.L62:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L64
	moveq #1,%d0
	jra .L58
.L65:
	move.w #127,%a1
	jra .L63
	.size	source_valid, .-source_valid
	.align	2
	.type	pixel, @function
pixel:
	move.l %d2,-(%sp)
	moveq #127,%d2
	move.l 12(%sp),%d0
	move.l 16(%sp),%d1
	cmp.l %d0,%d2
	jcs .L70
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L70
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
	jeq .L72
	eor.l %d1,%d0
.L73:
	move.b %d0,(%a0)
.L70:
	move.l (%sp)+,%d2
	rts
.L72:
	or.l %d1,%d0
	jra .L73
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
	jeq .L91
	clr.b %d0
	move.b %d0,10(%a2)
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L91
	cmp.l #255,%d2
	jhi .L74
	move.b 6(%a3),%d3
	mvz.b %d3,%d1
	not.l %d1
	and.l %d2,%d1
	tst.l %d1
	jne .L74
	move.l 72(%sp),%d1
	or.l 76(%sp),%d1
	lsr.l #1,%d1
	jne .L74
	tst.l %d2
	jeq .L92
	clr.l %d1
.L79:
	btst %d1,%d2
	jeq .L78
	tst.l 72(%sp)
	jne .L78
	mvz.b 15(%a3,%d1.l),%d4
	cmp.l #255,%d4
	jeq .L74
.L78:
	addq.l #1,%d1
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L79
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
.L89:
	move.l 46(%sp),%a3
	move.l %a1,%d0
	addq.l #1,46(%sp)
	move.b (%a3)+,(%a5)+
	move.b 7(%a3),%d6
	move.b %d6,7(%a5)
	btst %d0,%d2
	jeq .L80
	mvz.w %a1,%d0
	move.l (%a0),%d5
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a4
	clr.l %d0
.L81:
	move.l %d5,%a3
	moveq #8,%d1
	lea (%a3,%d0.l),%a6
	move.b (%a6),27(%a4,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L81
	move.l 32(%a0),%a3
	move.l %d5,%a6
	lea (120,%a6),%a6
	clr.l %d1
	move.l %a3,52(%sp)
	move.l %d4,%a3
.L88:
	move.l %d1,%d7
	lsr.l #3,%d7
	moveq #7,%d0
	move.l %d5,%a4
	move.b (%a6),%d3
	sub.l %d7,%d0
	move.b (%a4,%d0.l),%d0
	move.b %d0,51(%sp)
	tst.l 52(%sp)
	jeq .L93
	move.l 52(%sp),%a4
	moveq #1,%d7
	move.b (%a4,%d1.l),%d0
	eor.l %d7,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L82:
	move.b %d0,(%a3)+
	moveq #1,%d7
	cmp.l 72(%sp),%d7
	jne .L83
	or.l 76(%sp),%d0
	jne .L94
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jeq .L85
.L114:
	move.w 1634(%a2),%d0
	addq.l #1,%d0
	move.w %d0,1634(%a2)
.L85:
	move.b %d3,%d0
	jra .L84
.L93:
	clr.l %d0
	jra .L82
.L83:
	moveq #7,%d7
	and.l %d1,%d7
	mvz.b 51(%sp),%d0
	btst %d7,%d0
	jeq .L85
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jne .L86
.L87:
	move.b %d6,%d0
.L84:
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
	jne .L88
.L80:
	addq.l #1,%a1
	add.l #64,%d4
	addq.l #4,%a0
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L89
	moveq #1,%d4
	clr.l %d0
	move.b %d4,10(%a2)
.L74:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L86:
	tst.l 76(%sp)
	jne .L87
	jra .L114
.L94:
	st %d0
	jra .L84
.L91:
	moveq #1,%d0
	jra .L74
.L92:
	moveq #2,%d0
	jra .L74
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
	jne .L116
.L118:
	moveq #1,%d0
.L115:
	movem.l (%sp),#31804
	lea (36,%sp),%sp
	rts
.L116:
	tst.b 10(%a2)
	jeq .L118
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L118
	move.l (%a2),%d0
	cmp.l (%a3),%d0
	jeq .L119
.L120:
	moveq #3,%d0
	jra .L115
.L119:
	mvz.b 4(%a3),%d1
	mvz.b 4(%a2),%d0
	cmp.l %d1,%d0
	jne .L120
	mvz.b 5(%a3),%d1
	mvz.b 5(%a2),%d0
	cmp.l %d1,%d0
	jne .L120
	mvz.b 6(%a3),%d1
	mvz.b 6(%a2),%d0
	cmp.l %d1,%d0
	jne .L120
	move.l 604(%a2),%d4
	cmp.l 88(%a3),%d4
	jne .L120
	mvz.b 7(%a2),%d3
	move.l %a2,%d2
	clr.l %d1
	add.l #91,%d2
	lea (24,%a3),%a4
.L125:
	btst %d1,%d3
	jeq .L121
	mvz.b 7(%a3,%d1.l),%d4
	mvz.b 11(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L120
	mvz.b 15(%a3,%d1.l),%d4
	mvz.b 19(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L120
	mvz.w %d1,%d0
	move.l (%a4),%a0
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a1
	clr.l %d0
.L122:
	mvz.b (%a0,%d0.l),%d5
	mvz.b 27(%a1,%d0.l),%d4
	cmp.l %d5,%d4
	jne .L120
	addq.l #1,%d0
	moveq #8,%d4
	cmp.l %d0,%d4
	jne .L122
	move.l 32(%a4),%a5
	move.l %d2,%a6
	lea (120,%a0),%a0
	sub.l %a1,%a1
.L124:
	tst.l %a5
	jeq .L126
	move.b (%a5,%a1.l),%d0
	moveq #1,%d4
	eor.l %d4,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L123:
	mvz.b (%a0),%d5
	mvz.b 517(%a6),%d4
	cmp.l %d5,%d4
	jne .L120
	mvz.b (%a6),%d4
	cmp.l %d0,%d4
	jne .L120
	addq.l #1,%a6
	addq.l #1,%a1
	lea (32,%a0),%a0
	moveq #64,%d0
	cmp.l %a1,%d0
	jne .L124
.L121:
	addq.l #1,%d1
	add.l #64,%d2
	addq.l #4,%a4
	moveq #8,%d4
	cmp.l %d1,%d4
	jne .L125
	clr.l %d0
	jra .L115
.L126:
	clr.l %d0
	jra .L123
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
	jne .L136
	tst.l %a3
	jeq .L139
	tst.l %a4
	jeq .L139
	clr.l %d1
.L140:
	move.l (%a3,%d1.l),%a1
	tst.l %a1
	jeq .L139
	move.l (%a4,%d1.l),%a0
	tst.l %a0
	jeq .L139
	cmp.l #-2331,%a1
	jhi .L139
	cmp.l #-2331,%a0
	jhi .L139
	addq.l #4,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L140
	move.l %a2,%d4
	add.l #608,%d4
	move.l %d4,%d5
	clr.l %d2
	sub.l %a1,%a1
.L147:
	move.l (%a3,%d2.l),%d3
	tst.l %d3
	jeq .L139
	move.l (%a4,%d2.l),%d1
	tst.l %d1
	jeq .L139
	move.l 64(%sp),%a0
	cmp.l 24(%a0,%d2.l),%d3
	jne .L139
	move.l %d3,%a5
	move.l %d1,%a6
	lea (2330,%a5),%a5
	sub.l %a0,%a0
	lea (2330,%a6),%a6
	move.l %a5,44(%sp)
	move.l %a6,52(%sp)
.L144:
	move.l (%a4,%a0.l*4),%d6
	move.l %d6,%d7
	add.l #2330,%d7
	cmp.l %d3,%d7
	jls .L141
	cmp.l 44(%sp),%d6
	jcs .L139
.L141:
	cmp.l %a1,%a0
	jeq .L142
	move.l (%a3,%a0.l*4),%a5
	lea (2330,%a5),%a6
	cmp.l %d3,%a6
	jls .L143
	cmp.l 44(%sp),%a5
	jcs .L139
.L143:
	cmp.l %d1,%d7
	jls .L142
	cmp.l 52(%sp),%d6
	jcs .L139
.L142:
	addq.l #1,%a0
	moveq #8,%d6
	cmp.l %a0,%d6
	jne .L144
	mvz.b 7(%a2),%d3
	move.l %a1,%d6
	btst %d6,%d3
	jeq .L145
	move.l %d1,%a0
	move.l %d5,%a5
	lea (120,%a0),%a0
	add.l #2168,%d1
.L146:
	mvz.b (%a0),%d6
	mvz.b (%a5),%d3
	cmp.l %d6,%d3
	jne .L153
	addq.l #1,%a5
	lea (32,%a0),%a0
	cmp.l %a0,%d1
	jne .L146
.L145:
	addq.l #1,%a1
	add.l #64,%d5
	addq.l #4,%d2
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L147
	clr.l %d1
.L151:
	mvz.b 7(%a2),%d2
	btst %d1,%d2
	jeq .L148
	move.w #120,%a1
	move.l %d4,%a5
.L150:
	move.b (%a5)+,%d3
	move.b 511(%a5),%d2
	mvz.b %d3,%d3
	mvz.b %d2,%d5
	cmp.l %d3,%d5
	jeq .L149
	move.l (%a3,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
	move.l (%a4,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
.L149:
	lea (32,%a1),%a1
	cmp.l #2168,%a1
	jne .L150
.L148:
	addq.l #1,%d1
	add.l #64,%d4
	moveq #8,%d2
	cmp.l %d1,%d2
	jne .L151
	clr.b %d6
	move.b %d6,10(%a2)
.L136:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L139:
	moveq #1,%d0
	jra .L136
.L153:
	moveq #3,%d0
	jra .L136
	.size	psl_apply, .-psl_apply
	.align	2
	.globl	psl_nv_matches
	.type	psl_nv_matches, @function
psl_nv_matches:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a2
	move.l 16(%sp),%a0
	tst.l %a2
	jne .L185
.L187:
	clr.l %d0
.L184:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L185:
	tst.l %a0
	jeq .L187
	clr.l %d0
	lea nv_tag,%a1
.L188:
	mvz.b (%a2,%d0.l),%d2
	mvz.b (%a1,%d0.l),%d1
	cmp.l %d2,%d1
	jne .L187
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L188
	clr.l %d0
	lea (8,%a2),%a1
.L189:
	mvz.b (%a1,%d0.l),%d2
	mvz.b (%a0,%d0.l),%d1
	cmp.l %d2,%d1
	jne .L187
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L189
	pea 520(%a2)
	jsr nv_get32
	move.l %a2,-(%sp)
	move.l %d0,%d2
	jsr nv_header_crc
	addq.l #8,%sp
	cmp.l %d2,%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L184
	.size	psl_nv_matches, .-psl_nv_matches
	.align	2
	.globl	psl_nv_begin
	.type	psl_nv_begin, @function
psl_nv_begin:
	lea (-28,%sp),%sp
	movem.l #7228,(%sp)
	move.l 32(%sp),%a2
	tst.l %a2
	jne .L196
.L198:
	clr.l %d2
.L195:
	move.l %d2,%d0
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L196:
	tst.l 36(%sp)
	jeq .L198
	move.l 36(%sp),-(%sp)
	move.l %a2,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L195
	moveq #1,%d3
	moveq #1,%d4
	moveq #1,%d1
	sub.l %a1,%a1
	lea nv_tag,%a3
.L204:
	lea (%a1,%a2.l),%a4
	tst.b (%a4)
	jeq .L200
	move.b (%a4),%d0
	not.l %d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d1
.L200:
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
	jeq .L203
	mvz.b (%a4),%d5
	cmp.l #255,%d5
	jeq .L203
	move.b (%a4),%d5
	move.w %d5,%a0
	move.l %a0,%d5
	eor.l %d5,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d3
.L203:
	addq.l #1,%a1
	moveq #8,%d0
	cmp.l %a1,%d0
	jne .L204
	or.l %d4,%d1
	or.l %d3,%d1
	jeq .L195
	clr.b (%a2)
	clr.l nv_index_store
.L206:
	clr.b %d2
	move.b %d2,(%a2,%a1.l)
	addq.l #1,%a1
	cmp.l #12288,%a1
	jne .L206
	move.l %a2,%d0
	add.l %a1,%d0
	lea (1024,%a2),%a0
.L207:
	st %d5
	move.b #-1,(%a0)
	lea (16,%a0),%a0
	move.b %d5,-15(%a0)
	cmp.l %d0,%a0
	jne .L207
.L208:
	lea (%a3,%d1.l),%a0
	moveq #8,%d0
	move.b (%a0),(%a2,%d1.l)
	addq.l #1,%d1
	cmp.l %d1,%d0
	jne .L208
	clr.l %d0
	lea (8,%a2),%a0
.L209:
	move.l 36(%sp),%a1
	lea (%a1,%d0.l),%a3
	move.b (%a3),(%a0,%d0.l)
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L209
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
	jra .L195
	.size	psl_nv_begin, .-psl_nv_begin
	.align	2
	.globl	psl_nv_reserve
	.type	psl_nv_reserve, @function
psl_nv_reserve:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%d2
	move.l 48(%sp),%d4
	tst.l %a2
	jeq .L225
	move.l %d2,%d0
	or.l %d4,%d0
	lsr.l #8,%d0
	jeq .L226
.L225:
	clr.l %d0
.L224:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L226:
	lsl.l #3,%d2
	move.l %a2,-(%sp)
	jsr nv_cache
	addq.l #4,%sp
	clr.l %d3
	clr.l %d5
	lea nv_index,%a4
	lea nv_find,%a5
	move.l %d2,%a3
.L231:
	btst %d5,%d4
	jeq .L229
	mvz.w (%a4,%a3.l*2),%d0
	cmp.l #65534,%d0
	jeq .L225
	move.l %a3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a5)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L229
	addq.l #1,%d3
.L229:
	addq.l #1,%d5
	addq.l #1,%a3
	moveq #8,%d0
	cmp.l %d5,%d0
	jne .L231
	clr.l %d5
	sub.l %a3,%a3
	lea nv_entry_key,%a4
.L232:
	cmp.l %d3,%d5
	jcs .L234
.L235:
	clr.l %d5
	lea nv_find,%a3
.L240:
	btst %d5,%d4
	jeq .L236
	move.l %d2,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L236
	clr.l %d3
	lea nv_entry_key,%a4
.L239:
	move.l %d3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L237
	move.l %d3,%d0
	add.l #64,%d0
	mvz.w %d0,%d0
	clr.b %d1
	sub.l %a1,%a1
	lsl.l #4,%d0
	lea 12(%a2,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	move.b %d1,2(%a0)
	move.b %d1,3(%a0)
	mvz.w %d3,%d1
	lsl.l #4,%d1
	lea (%a2,%d1.l),%a0
	lea (1028,%a0),%a0
.L238:
	clr.b %d6
	moveq #8,%d1
	move.b %d6,(%a0,%a1.l)
	addq.l #1,%a1
	cmp.l %a1,%d1
	jne .L238
	move.l #65535,%d1
	eor.l %d2,%d1
	lea 2(%a2,%d0.l),%a0
	move.l %d1,%d6
	lsr.l #8,%d6
	move.b %d6,(%a0)
	move.b %d1,1(%a0)
	lea (%a2,%d0.l),%a0
	move.l %d2,%d0
	lsr.l #8,%d0
	move.b %d0,(%a0)
	move.b %d2,1(%a0)
	lea nv_index,%a0
	move.w %d3,(%a0,%d2.l*2)
.L236:
	addq.l #1,%d5
	addq.l #1,%d2
	moveq #8,%d0
	cmp.l %d5,%d0
	jne .L240
	moveq #1,%d0
	jra .L224
.L234:
	move.l %a3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	addq.l #1,%a3
	cmp.l #65535,%d0
	seq %d0
	mvs.b %d0,%d0
	sub.l %d0,%d5
	cmp.l #704,%a3
	jne .L232
	cmp.l %d5,%d3
	jhi .L225
	jra .L235
.L237:
	addq.l #1,%d3
	cmp.l #704,%d3
	jne .L239
	jra .L236
	.size	psl_nv_reserve, .-psl_nv_reserve
	.align	2
	.globl	psl_nv_read
	.type	psl_nv_read, @function
psl_nv_read:
	lea (-20,%sp),%sp
	movem.l #3100,(%sp)
	move.l 40(%sp),%a3
	move.l 24(%sp),%a2
	move.l 28(%sp),%d0
	move.l 32(%sp),%a0
	tst.l %a3
	jeq .L254
	clr.l %d1
.L256:
	clr.b %d2
	moveq #64,%d3
	move.b %d2,(%a3,%d1.l)
	addq.l #1,%d1
	cmp.l %d1,%d3
	jne .L256
	tst.l %a2
	jeq .L254
	tst.l 36(%sp)
	jeq .L254
	cmp.l #255,%d0
	jhi .L254
	moveq #7,%d1
	cmp.l %a0,%d1
	jcs .L254
	lsl.l #3,%d0
	pea (%a0,%d0.l)
	move.l %a2,-(%sp)
	jsr nv_find
	addq.l #8,%sp
	move.l %d0,%d3
	cmp.l #65535,%d0
	jeq .L254
	move.l %d0,%d2
	add.l #64,%d2
	mvz.w %d2,%d2
	lsl.l #4,%d2
	pea 12(%a2,%d2.l)
	jsr nv_get32
	addq.l #4,%sp
	move.l %d0,%d4
	tst.l %d0
	jeq .L254
	move.l 36(%sp),-(%sp)
	move.l %d3,-(%sp)
	move.l %a2,-(%sp)
	jsr nv_record_crc
	lea (12,%sp),%sp
	cmp.l %d4,%d0
	jne .L254
	addq.l #4,%d2
	clr.l %d0
.L257:
	move.l %d0,%d1
	lsr.l #3,%d1
	moveq #7,%d3
	and.l %d0,%d3
	add.l %d2,%d1
	mvz.b (%a2,%d1.l),%d1
	asr.l %d3,%d1
	moveq #1,%d3
	and.l %d3,%d1
	move.b %d1,(%a3,%d0.l)
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L257
.L254:
	movem.l (%sp),#3100
	lea (20,%sp),%sp
	rts
	.size	psl_nv_read, .-psl_nv_read
	.align	2
	.globl	psl_nv_invalidate
	.type	psl_nv_invalidate, @function
psl_nv_invalidate:
	move.l 8(%sp),%d0
	move.l 12(%sp),%a0
	tst.l 4(%sp)
	jeq .L275
	cmp.l #255,%d0
	jhi .L275
	moveq #7,%d1
	cmp.l %a0,%d1
	jcs .L275
	lsl.l #3,%d0
	pea (%a0,%d0.l)
	move.l 8(%sp),-(%sp)
	jsr nv_find
	addq.l #8,%sp
	cmp.l #65535,%d0
	jeq .L275
	mvz.w %d0,%d0
	move.l 4(%sp),%a0
	lsl.l #4,%d0
	add.l #1036,%d0
	add.l %d0,%a0
	clr.b %d0
	clr.b (%a0)
	move.b %d0,1(%a0)
	move.b %d0,2(%a0)
	move.b %d0,3(%a0)
.L275:
	rts
	.size	psl_nv_invalidate, .-psl_nv_invalidate
	.align	2
	.globl	psl_nv_publish
	.type	psl_nv_publish, @function
psl_nv_publish:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 40(%sp),%a3
	move.l 44(%sp),%d3
	move.l 48(%sp),%d5
	tst.l %a3
	jeq .L283
	tst.l 52(%sp)
	jeq .L283
	tst.l 56(%sp)
	jeq .L283
	cmp.l #255,%d3
	jhi .L283
	moveq #7,%d0
	cmp.l %d5,%d0
	jcs .L283
	move.l %d3,%d0
	clr.l %d4
	lsl.l #3,%d0
	move.l 52(%sp),%d2
	add.l #120,%d2
	move.l %d2,%a0
	clr.l %d1
	move.l %d0,%a2
	add.l %d5,%a2
.L286:
	move.l 56(%sp),%a1
	mvz.b (%a1,%d1.l),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L295
	move.b (%a0),%d0
	not.l %d0
	tst.b %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
.L285:
	or.l %d0,%d4
	addq.l #1,%d1
	lea (32,%a0),%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L286
	move.l %a2,-(%sp)
	move.l %a3,-(%sp)
	lea nv_find,%a4
	jsr (%a4)
	addq.l #8,%sp
	tst.l %d4
	jne .L287
	cmp.l #65535,%d0
	jeq .L283
	add.l #64,%d0
	mvz.w %d0,%d0
	clr.b %d1
	st %d2
	moveq #-1,%d3
	lsl.l #4,%d0
	lea 12(%a3,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	move.b %d1,2(%a0)
	move.b %d1,3(%a0)
	lea (%a3,%d0.l),%a0
	move.b #-1,(%a0)
	move.b %d2,1(%a0)
	lea 2(%a3,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	lea nv_index,%a0
	move.w %d3,(%a0,%a2.l*2)
.L283:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L295:
	clr.l %d0
	jra .L285
.L287:
	cmp.l #65535,%d0
	jne .L288
	moveq #1,%d0
	lsl.l %d5,%d0
	move.l %d0,-(%sp)
	move.l %d3,-(%sp)
	move.l %a3,-(%sp)
	jsr psl_nv_reserve
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L283
	move.l %a2,-(%sp)
	move.l %a3,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
.L288:
	move.l %d0,%d1
	sub.l %a0,%a0
	lea (1028,%a3),%a1
	lsl.l #4,%d1
	clr.b %d5
	move.l %d1,%a2
	mvz.w %d0,%d1
	lea (1036,%a2),%a2
	add.l %a3,%a2
	clr.b (%a2)
	move.b %d5,1(%a2)
	move.b %d5,2(%a2)
	lsl.l #4,%d1
	move.b %d5,3(%a2)
	add.l %d1,%a1
.L289:
	clr.b %d4
	move.l 56(%sp),%a5
	move.l %d2,%a4
	clr.l %d1
	add.l %a0,%a5
.L293:
	mvz.b (%a5,%d1.l),%d3
	moveq #1,%d6
	cmp.l %d3,%d6
	jne .L292
	mvz.b (%a4),%d5
	cmp.l #255,%d5
	jeq .L292
	lsl.l %d1,%d3
	or.l %d3,%d4
.L292:
	addq.l #1,%d1
	lea (32,%a4),%a4
	moveq #8,%d3
	cmp.l %d1,%d3
	jne .L293
	move.b %d4,(%a1)+
	add.l #256,%d2
	addq.l #8,%a0
	moveq #64,%d5
	cmp.l %a0,%d5
	jne .L289
	move.l 52(%sp),-(%sp)
	move.l %d0,-(%sp)
	moveq #24,%d6
	move.l %a3,-(%sp)
	jsr nv_record_crc
	lea (12,%sp),%sp
	move.l %d0,%d1
	lsr.l %d6,%d1
	move.b %d1,(%a2)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,1(%a2)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,2(%a2)
	move.b %d0,3(%a2)
	jra .L283
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
	jeq .L313
	tst.l %a1
	jeq .L313
	moveq #57,%d0
	cmp.l 52(%sp),%d0
	jcs .L313
	moveq #1,%d6
.L316:
	move.b (%a1),%d0
	jeq .L313
	move.l %d2,%d1
	moveq #124,%d3
	addq.l #5,%d1
	cmp.l %d1,%d3
	jcc .L327
.L313:
	movem.l (%sp),#1276
	lea (40,%sp),%sp
	rts
.L327:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a1
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L317
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #letters,%a0
.L318:
	move.l %d2,%d5
	clr.l %d0
	lsl.l #3,%d5
	move.l %d5,28(%sp)
.L326:
	tst.l %a0
	jeq .L329
	mvz.b (%a0,%d0.l),%d1
.L319:
	moveq #58,%d7
	mvs.b -1(%a1),%d3
	cmp.l %d3,%d7
	jne .L320
	moveq #36,%d3
	btst %d0,%d3
	jeq .L321
.L331:
	moveq #4,%d1
	jra .L321
.L317:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d4
	cmp.l %d1,%d4
	jcs .L328
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #digits,%a0
	jra .L318
.L328:
	sub.l %a0,%a0
	jra .L318
.L329:
	clr.l %d1
	jra .L319
.L320:
	moveq #46,%d4
	cmp.l %d3,%d4
	jne .L322
	moveq #6,%d5
	cmp.l %d0,%d5
	jeq .L331
.L321:
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
.L325:
	moveq #16,%d5
	lsr.l %d3,%d5
	and.l %d1,%d5
	tst.l %d5
	jeq .L324
	move.l 32(%sp),%a2
	add.l %d4,%a2
	add.l 44(%sp),%a2
	move.b (%a2),%d5
	or.l 36(%sp),%d5
	move.b %d5,(%a2)
.L324:
	addq.l #1,%d3
	addq.l #8,%d4
	moveq #5,%d5
	cmp.l %d3,%d5
	jne .L325
	addq.l #1,%d0
	moveq #7,%d7
	cmp.l %d0,%d7
	jne .L326
	addq.l #6,%d2
	jra .L316
.L322:
	moveq #45,%d7
	cmp.l %d3,%d7
	jne .L323
	moveq #3,%d3
	cmp.l %d0,%d3
	jne .L321
	moveq #14,%d1
	jra .L321
.L323:
	moveq #47,%d4
	cmp.l %d3,%d4
	jne .L321
	mvz.w %d0,%d1
	moveq #6,%d5
	lsl.l #2,%d1
	move.l %d1,%d3
	move.l %d6,%d1
	divu.l %d5,%d3
	lsl.l %d3,%d1
	jra .L321
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
	jeq .L344
	tst.l %d0
	jeq .L344
	tst.l %a0
	jeq .L344
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L344
	moveq #63,%d5
	cmp.l %d1,%d5
	jcs .L344
	move.w #128,%a1
	sub.l %d2,%a1
	cmp.l %a1,%d0
	jhi .L344
	move.w #64,%a1
	sub.l %d1,%a1
	cmp.l %a1,%a0
	jhi .L344
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
.L347:
	cmp.l %a1,%d6
	jcc .L351
.L344:
	movem.l (%sp),#7420
	lea (36,%sp),%sp
	rts
.L351:
	cmp.l %d7,%a1
	jne .L352
	move.l %a0,%d4
.L348:
	cmp.l %a1,%d6
	jne .L353
	move.l %d3,%d1
.L349:
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
.L350:
	move.b (%a2),%d5
	addq.l #1,%d4
	addq.l #8,%a2
	and.l %d1,%d5
	move.b %d5,-8(%a2)
	cmp.l %d4,%d0
	jhi .L350
	addq.l #1,%a1
	jra .L347
.L352:
	clr.l %d4
	jra .L348
.L353:
	moveq #7,%d1
	jra .L349
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
	jeq .L361
	tst.l %a4
	jeq .L361
	moveq #59,%d0
	cmp.l 48(%sp),%d0
	jcs .L361
	moveq #1,%d2
	lea pixel,%a3
.L364:
	move.b (%a4),%d0
	jeq .L361
	move.l %a5,%d1
	moveq #124,%d3
	addq.l #3,%d1
	cmp.l %d1,%d3
	jcc .L377
.L361:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L377:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a4
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L365
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #alpha.1,%a2
.L366:
	clr.l %d3
	moveq #4,%d5
.L376:
	tst.l %a2
	jeq .L379
	mvz.b (%a2,%d3.l),%d4
.L367:
	mvs.b -1(%a4),%d0
	moveq #58,%d1
	cmp.l %d0,%d1
	jne .L368
	moveq #-3,%d0
	and.l %d3,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L372
.L381:
	moveq #2,%d4
	jra .L372
.L365:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d3
	cmp.l %d1,%d3
	jcs .L378
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #digit.0,%a2
	jra .L366
.L378:
	sub.l %a2,%a2
	jra .L366
.L379:
	clr.l %d4
	jra .L367
.L368:
	moveq #46,%d1
	cmp.l %d0,%d1
	jne .L371
	moveq #4,%d0
	cmp.l %d3,%d0
	jeq .L381
.L372:
	clr.l %d6
.L375:
	move.l %d5,%d0
	lsr.l %d6,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L374
	clr.l -(%sp)
	move.l 52(%sp),%a0
	pea (%a0,%d3.l)
	pea (%a5,%d6.l)
	move.l 52(%sp),-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L374:
	addq.l #1,%d6
	moveq #3,%d0
	cmp.l %d6,%d0
	jne .L375
	addq.l #1,%d3
	moveq #5,%d1
	cmp.l %d3,%d1
	jne .L376
	addq.l #4,%a5
	jra .L364
.L371:
	moveq #45,%d1
	cmp.l %d0,%d1
	jne .L373
	moveq #2,%d0
	cmp.l %d3,%d0
	jne .L372
	moveq #7,%d4
	jra .L372
.L373:
	moveq #47,%d1
	cmp.l %d0,%d1
	jne .L370
	move.l %d3,%d0
	lsr.l #1,%d0
	move.l %d2,%d4
	lsl.l %d0,%d4
	jra .L372
.L370:
	moveq #91,%d1
	cmp.l %d0,%d1
	jne .L369
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L383
	moveq #6,%d4
	jra .L372
.L369:
	moveq #93,%d1
	cmp.l %d0,%d1
	jne .L372
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L384
	moveq #1,%d4
	jra .L372
.L383:
	moveq #4,%d4
	jra .L372
.L384:
	moveq #3,%d4
	jra .L372
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
	jeq .L396
	tst.l %d0
	jeq .L396
	tst.l %a3
	jeq .L396
	moveq #127,%d1
	cmp.l %d3,%d1
	jcs .L396
	moveq #63,%d1
	cmp.l %a2,%d1
	jcs .L396
	move.l #128,%d1
	sub.l %d3,%d1
	cmp.l %d1,%d0
	jhi .L396
	moveq #64,%d1
	sub.l %a2,%d1
	cmp.l %d1,%a3
	jhi .L396
	lea -1(%a2,%a3.l),%a6
	lea pixel,%a4
	add.l %d3,%d0
	move.l %d3,%d4
	move.l %a4,%a5
.L399:
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
	jhi .L399
	move.l %d0,%d4
	add.l %a2,%a3
	subq.l #1,%d4
.L400:
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
	jhi .L400
.L396:
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
	jeq .L409
	tst.l %a5
	jeq .L409
	tst.l %a4
	jeq .L409
	moveq #127,%d0
	cmp.l %a2,%d0
	jcs .L409
	moveq #63,%d0
	cmp.l %a3,%d0
	jcs .L409
	move.l #128,%d0
	sub.l %a2,%d0
	cmp.l %d0,%a5
	jhi .L409
	moveq #64,%d0
	sub.l %a3,%d0
	cmp.l %d0,%a4
	jhi .L409
	lea -1(%a3,%a4.l),%a0
	clr.l %d2
	lea pixel,%a6
	move.l %a0,32(%sp)
.L412:
	btst #1,%d2
	jne .L411
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
.L411:
	addq.l #1,%d2
	cmp.l %a5,%d2
	jne .L412
	lea -1(%a2,%a5.l),%a5
	clr.l %d2
	lea pixel,%a6
	move.l %a5,%d4
.L414:
	btst #1,%d2
	jne .L413
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
.L413:
	addq.l #1,%d2
	cmp.l %a4,%d2
	jne .L414
.L409:
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
	jeq .L426
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L426
	moveq #63,%d3
	cmp.l %d4,%d3
	jcs .L426
	move.w #128,%a0
	sub.l %d2,%a0
	cmp.l %a0,%d0
	jhi .L426
	move.w #64,%a0
	sub.l %d4,%a0
	cmp.l %a0,%d1
	jhi .L426
	move.l %d2,%d5
	move.l %d4,%d6
	add.l %d0,%d5
	add.l %d1,%d6
	lea pixel,%a2
.L428:
	cmp.l %d2,%d5
	jls .L426
	move.l %d4,%d3
	jra .L430
.L429:
	pea 1.w
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 40(%sp),-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (16,%sp),%sp
.L430:
	cmp.l %d3,%d6
	jhi .L429
	addq.l #1,%d2
	jra .L428
.L426:
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
	jcc .L436
	clr.l %d0
.L436:
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
	jeq .L438
	tst.l %a6
	jeq .L438
	move.l %d2,%d0
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L478
	moveq #64,%d4
	sub.l %a2,%a2
	move.l %d4,52(%sp)
.L440:
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
	jne .L441
	lea part_rows,%a4
	addq.l #5,%a2
	clr.l %d2
	lea psl_font_invert,%a5
.L443:
	move.l (%a4)+,-(%sp)
	move.l %a2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	cmp.l cursor.l,%d2
	jne .L442
	pea 7.w
	pea 112.w
	pea -1(%a2)
	pea 8.w
	move.l %a6,-(%sp)
	jsr (%a5)
	lea (20,%sp),%sp
.L442:
	addq.l #1,%d2
	addq.l #8,%a2
	moveq #6,%d0
	cmp.l %d2,%d0
	jne .L443
.L508:
	pea 58.w
	pea 116.w
	pea 3.w
.L506:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
.L438:
	movem.l (%sp),#31996
	lea (92,%sp),%sp
	rts
.L478:
	moveq #58,%d5
	move.w #3,%a2
	move.l %d5,52(%sp)
	jra .L440
.L441:
	move.l action,%d1
	move.l %d1,48(%sp)
	tst.l %d1
	jne .L479
	move.l #.LC0,%d0
.L444:
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
	jne .L445
	pea .LC13
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC14
.L507:
	pea 26(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	jra .L508
.L479:
	move.l #.LC1,%d0
	jra .L444
.L445:
	moveq #4,%d5
	cmp.l %d2,%d5
	jne .L446
	move.l message,-(%sp)
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC15
	jra .L507
.L446:
	moveq #3,%d7
	cmp.l %d2,%d7
	jne .L447
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
.L447:
	moveq #3,%d1
	cmp.l %d2,%d1
	seq %d0
	neg.l %d0
	tst.b %d0
	jeq .L448
	moveq #18,%d4
	move.l %d4,64(%sp)
.L449:
	moveq #3,%d7
	cmp.l %d2,%d7
	sne %d0
	neg.l %d0
	tst.b %d0
	jeq .L450
	lea (72,%sp),%a5
.L451:
	lea (3,%a5),%a0
	clr.l %d3
	move.l %a0,60(%sp)
	lea plan+608,%a0
	move.l %a0,56(%sp)
	lea psl_font_small_text,%a4
.L471:
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
	jeq .L452
	tst.l %d5
	jeq .L480
	move.l selected,%d0
	btst %d3,%d0
	jeq .L481
	move.l #.LC3,%d0
.L453:
	move.l %d0,-(%sp)
	pea 72(%sp)
	jsr text
	addq.l #8,%sp
.L452:
	move.l %d3,%d0
	add.l #49,%d0
	moveq #3,%d7
	moveq #32,%d4
	move.b #84,(%a5)
	move.b %d0,1(%a5)
	move.b %d4,2(%a5)
	cmp.l %d2,%d7
	jne .L454
	tst.l %d5
	jeq .L455
	move.l selected,%d0
	btst %d3,%d0
	jne .L482
.L455:
	pea .LC17
	move.l 64(%sp),-(%sp)
	jsr text
	addq.l #8,%sp
.L457:
	pea 68(%sp)
	move.l %a3,-(%sp)
	move.l %d6,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_font_small_text
	lea (16,%sp),%sp
	tst.l %d5
	jne .L462
	tst.l 44(%sp)
	seq %d4
	neg.l %d4
	tst.b %d4
	jeq .L463
	moveq #58,%d7
.L464:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L465
	move.w #1,%a0
.L466:
	add.l %a3,%a0
.L467:
	cmp.l %d6,%d7
	jls .L470
	mvz.w %d6,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
.L469:
	move.w %d0,%d4
	moveq #3,%d5
	mulu.w #3,%d4
	add.l %d6,%d4
	and.l %d5,%d4
	tst.l %d4
	jne .L468
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
.L468:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L469
	addq.l #1,%d6
	jra .L467
.L448:
	moveq #10,%d5
	move.l %d5,64(%sp)
	jra .L449
.L450:
	lea (68,%sp),%a5
	jra .L451
.L480:
	move.l #.LC2,%d0
	jra .L453
.L481:
	move.l #.LC4,%d0
	jra .L453
.L482:
	move.l 56(%sp),%a1
	clr.l %d0
	sub.l %a0,%a0
.L456:
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
	jne .L456
	moveq #99,%d4
	cmp.l %d0,%d4
	jcc .L458
	moveq #100,%d4
	move.l %d0,%d7
	divu.l %d4,%d7
	lea (4,%a5),%a0
	moveq #10,%d1
	remu.l %d1,%d4:%d7
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,3(%a5)
.L459:
	moveq #10,%d4
	move.l %d0,%d1
	divu.l %d4,%d1
	move.l %d1,%d7
	remu.l %d4,%d1:%d7
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L460
.L458:
	move.l 60(%sp),%a0
	moveq #9,%d7
	cmp.l %d0,%d7
	jcs .L459
.L460:
	moveq #10,%d4
	remu.l %d4,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L457
.L454:
	tst.l %d5
	jeq .L484
	lea captured+7,%a0
	tst.b (%a0,%d3.l)
	jeq .L485
	moveq #70,%d0
.L461:
	move.b %d0,3(%a5)
	clr.b %d0
	move.b %d0,4(%a5)
	jra .L457
.L484:
	moveq #45,%d0
	jra .L461
.L485:
	moveq #83,%d0
	jra .L461
.L463:
	moveq #114,%d7
	jra .L464
.L465:
	move.w #5,%a0
	jra .L466
.L462:
	moveq #2,%d7
	cmp.l %d2,%d7
	jne .L470
	cmp.l cursor.l,%d3
	jne .L470
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l 56(%sp),%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L470:
	moveq #64,%d0
	addq.l #1,%d3
	moveq #8,%d1
	add.l %d0,56(%sp)
	cmp.l %d3,%d1
	jne .L471
	subq.l #3,%d2
	tst.l %d2
	jne .L472
	moveq #1,%d5
	move.l replace,%d0
	cmp.l 48(%sp),%d5
	jne .L473
	tst.l %d0
	jeq .L486
	move.l #.LC8,%d0
.L474:
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
.L475:
	move.l 52(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L506
.L473:
	tst.l %d0
	jeq .L487
	move.l #.LC6,%d0
	jra .L474
.L486:
	move.l #.LC5,%d0
	jra .L474
.L487:
	move.l #.LC7,%d0
	jra .L474
.L472:
	move.l message,%d0
	tst.l %d0
	jne .L476
	move.l replace,%d0
	moveq #1,%d7
	cmp.l 48(%sp),%d7
	jne .L477
	tst.l %d0
	jeq .L488
	move.l #.LC12,%d0
.L476:
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
	jra .L475
.L477:
	tst.l %d0
	jeq .L489
	move.l #.LC10,%d0
	jra .L476
.L488:
	move.l #.LC9,%d0
	jra .L476
.L489:
	move.l #.LC11,%d0
	jra .L476
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
	jeq .L510
	move.l %d5,%d3
	add.l #-1074668000,%d3
	cmp.l #9535680,%d3
	jls .L511
.L510:
	clr.l %d0
.L509:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L511:
	move.l #635712,%d1
	remu.l %d1,%d0:%d3
	divu.l %d1,%d3
	tst.l %d0
	jne .L510
	mvz.b %d4,%d6
	moveq #15,%d0
	cmp.l %d6,%d0
	jcs .L510
	mvz.b %d2,%d0
	lsr.l #2,%d0
	jne .L510
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
	jeq .L513
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
.L513:
	ext.w %d4
	lea (60,%a5),%a2
	lea origin,%a4
	lea (24,%a3),%a1
	mulu.w #36568,%d4
	lea (34,%a5),%a6
	move.l %d4,%d7
	clr.l %d4
	add.l %d5,%d7
.L523:
	move.b (%a6,%d4.l),%d1
	move.w %d1,%a0
	mvz.b %d1,%d1
	move.l %d1,52(%sp)
	move.w %a0,%d1
	move.b %d1,7(%a3,%d4.l)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L524
	move.w %d4,%d1
	mulu.w #5,%d1
	move.l %d1,%a0
	lea (714,%a0),%a0
	add.l 52(%sp),%a0
	move.b (%a5,%a0.l),%d1
.L514:
	move.b %d1,15(%a3,%d4.l)
	move.l %d7,(%a1)+
	tst.l %d0
	jeq .L525
	move.l %a4,-(%sp)
	move.l %d7,-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	move.l #269455360,-(%sp)
	move.l %d0,68(%sp)
	move.l %a1,64(%sp)
	jsr psl_nv_read
	lea (20,%sp),%sp
	move.l 48(%sp),%d0
	move.l 44(%sp),%a1
.L516:
	move.l %a4,28(%a1)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L517
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jne .L518
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #80,%d1
	cmp.l %a0,%d1
	jne .L519
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #76,%d1
	cmp.l %a0,%d1
	jeq .L517
.L519:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #65,%d1
	cmp.l %a0,%d1
	jne .L520
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #66,%d1
	cmp.l %a0,%d1
	jeq .L517
.L520:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #70,%d1
	cmp.l %a0,%d1
	jne .L518
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #77,%d1
	cmp.l %a0,%d1
	jeq .L517
.L518:
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jeq .L521
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #2,%d1
	cmp.l %a0,%d1
	jne .L522
.L521:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #83,%d1
	cmp.l %a0,%d1
	jne .L522
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #50,%d1
	cmp.l %a0,%d1
	jeq .L517
.L522:
	move.b 6(%a3),%d1
	move.w %d1,%a0
	moveq #1,%d1
	lsl.l %d4,%d1
	move.l %d1,52(%sp)
	move.l %a0,%d1
	or.l 52(%sp),%d1
	move.b %d1,6(%a3)
.L517:
	addq.l #1,%d4
	lea (30,%a2),%a2
	add.l #2330,%d7
	lea (64,%a4),%a4
	moveq #8,%d1
	cmp.l %d4,%d1
	jne .L523
	cmp.l 1187521622.l,%d5
	jne .L510
	mvz.b 269161680,%d0
	cmp.l %d6,%d0
	jne .L510
	move.b 269161679,%d0
	eor.l %d2,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L509
.L524:
	st %d1
	jra .L514
.L525:
	sub.l %a0,%a0
.L515:
	clr.b %d1
	move.b %d1,(%a4,%a0.l)
	addq.l #1,%a0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L515
	jra .L516
	.size	psl_native_source, .-psl_native_source
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	cmp.l 1187521622.l,%d0
	jeq .L550
.L552:
	clr.l %d0
.L549:
	rts
.L550:
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L552
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L549
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L555
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L556
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L557
.L556:
	moveq #2,%d0
	jra .L553
.L555:
	clr.l %d0
.L553:
	rts
.L557:
	moveq #1,%d0
	jra .L553
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
	jcs .L559
	move.l %d0,1175346752
.L559:
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
	jne .L562
	move.l cursor,%d0
	moveq #51,%d3
	cmp.l %d1,%d3
	jne .L563
	tst.l %d0
	jeq .L564
	subq.l #1,%d0
.L589:
	move.l %d0,cursor
.L564:
	move.l cursor,%d0
	moveq #3,%d2
	cmp.l %d0,%d2
	jcc .L565
	moveq #3,%d0
.L565:
	move.l %d0,-(%sp)
	jsr psl_native_set_cursor
	addq.l #4,%sp
.L566:
	moveq #1,%d2
	move.l %d2,1187497772
	movem.l (%sp),#1052
	lea (16,%sp),%sp
	rts
.L563:
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L564
	moveq #4,%d1
	cmp.l %d0,%d1
	jcs .L564
	addq.l #1,%d0
	jra .L589
.L562:
	subq.l #2,%d0
	tst.l %d0
	jne .L566
	move.l eligible,%a0
	tst.l %a0
	jeq .L566
	move.l cursor,%d0
	moveq #3,%d4
	moveq #51,%d2
	and.l %d0,%d4
	lsr.l #2,%d0
	move.l %d4,%a1
	cmp.l %d1,%d2
	jeq .L578
	moveq #32,%d3
	cmp.l %d1,%d3
	jne .L568
	moveq #1,%d2
.L567:
	lsl.l #2,%d0
	move.l %a1,%d1
	add.l %d2,%d1
.L569:
	moveq #3,%d4
	cmp.l %d1,%d4
	jcs .L566
	move.l %d0,%a1
	add.l %d1,%a1
	move.l %a0,%d4
	move.l %a1,%d3
	btst %d3,%d4
	jeq .L570
	move.l %a1,cursor
	jra .L566
.L578:
	moveq #-1,%d2
	jra .L567
.L570:
	add.l %d2,%d1
	jra .L569
.L568:
	moveq #52,%d2
	cmp.l %d1,%d2
	jne .L572
	tst.l %d0
	jeq .L566
.L573:
	moveq #1,%d1
	sub.l %d0,%d1
	lea (%a1,%d1.l*4),%a2
	clr.l %d0
	move.l %a2,%d2
.L577:
	move.l %a1,%d1
	sub.l %d0,%d1
	lsr.l #2,%d1
	jne .L574
	move.l %d2,%d1
	move.l %a0,%d4
	sub.l %d0,%d1
	btst %d1,%d4
	jne .L575
.L574:
	move.l %a1,%d1
	add.l %d0,%d1
	lsr.l #2,%d1
	jne .L576
	move.l %d2,%d1
	move.l %a0,%d4
	add.l %d0,%d1
	btst %d1,%d4
	jeq .L576
.L575:
	move.l %d1,cursor
	jra .L566
.L572:
	moveq #33,%d3
	cmp.l %d1,%d3
	jne .L566
	tst.l %d0
	jne .L566
	jra .L573
.L576:
	addq.l #1,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L577
	jra .L566
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
	jeq .L614
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L592
	tst.l %d0
	jeq .L593
	tst.l %d1
	jne .L594
	tst.l %d0
	jle .L615
	move.l eligible,%d0
.L595:
	move.l %d0,selected
.L593:
	clr.l message
	moveq #1,%d2
	move.l %d2,1187497772
.L600:
	moveq #1,%d0
.L590:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L615:
	clr.l %d0
	jra .L595
.L594:
	moveq #1,%d2
	cmp.l %d1,%d2
	jne .L596
	move.l cursor,%d2
	move.l eligible,%d3
	btst %d2,%d3
	jeq .L593
	lsl.l %d2,%d1
	move.l selected,%d2
	tst.l %d0
	jle .L597
	or.l %d2,%d1
.L627:
	move.l %d1,selected
	jra .L593
.L597:
	not.l %d1
	and.l %d2,%d1
	jra .L627
.L596:
	subq.l #2,%d1
	tst.l %d1
	jne .L593
	moveq #1,%d1
	cmp.l action.l,%d1
	jne .L598
	add.l %d0,%d0
	subx.l %d0,%d0
	neg.l %d0
.L599:
	mvz.b %d0,%d0
	move.l %d0,replace
	jra .L593
.L598:
	tst.l %d0
	sgt %d0
	neg.l %d0
	jra .L599
.L592:
	moveq #1,%d2
	cmp.l %a0,%d2
	jne .L600
	subq.l #6,%d1
	tst.l %d1
	jne .L600
	move.l encoder_residual,%d2
	tst.l %d2
	jge .L601
	tst.l %d0
	jgt .L617
.L602:
	move.l %d0,%d3
	tst.l %d0
	jge .L603
	addq.l #3,%d3
.L603:
	move.l %d0,%d1
	asr.l #2,%d3
	and.l #-2147483645,%d1
	tst.l %d0
	jge .L604
	subq.l #1,%d1
	moveq #-4,%d0
	or.l %d0,%d1
	addq.l #1,%d1
.L604:
	add.l %d1,%d2
	move.l %d2,%d0
	and.l #-2147483645,%d0
	tst.l %d2
	jge .L605
	subq.l #1,%d0
	moveq #-4,%d1
	or.l %d1,%d0
	addq.l #1,%d0
.L605:
	move.l %d0,encoder_residual
	tst.l %d2
	jge .L606
	addq.l #3,%d2
.L606:
	asr.l #2,%d2
	moveq #-6,%d0
	add.l %d3,%d2
	cmp.l %d2,%d0
	jle .L607
	moveq #-6,%d2
.L608:
	move.l %d2,%d3
	lea move,%a2
.L609:
	tst.l %d3
	jgt .L610
	move.l %d2,%d0
	tst.l %d2
	jge .L611
	clr.l %d0
.L611:
	sub.l %d0,%d2
	lea move,%a2
.L612:
	tst.l %d2
	jeq .L600
	pea 51.w
	jsr (%a2)
	addq.l #1,%d2
	addq.l #4,%sp
	jra .L612
.L601:
	tst.l %d2
	jeq .L602
	tst.l %d0
	jge .L602
.L617:
	clr.l %d2
	jra .L602
.L607:
	moveq #6,%d1
	cmp.l %d2,%d1
	jge .L608
	moveq #6,%d2
	jra .L608
.L610:
	pea 32.w
	jsr (%a2)
	subq.l #1,%d3
	addq.l #4,%sp
	jra .L609
.L614:
	clr.l %d0
	jra .L590
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
.L632:
	tst.b (%a0)
	jne .L635
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L632
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L636
.L634:
	moveq #1,%d0
.L630:
	rts
.L636:
	move.l #-2147457792,%a0
.L633:
	tst.b (%a0)
	jne .L634
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L633
	jra .L630
.L635:
	moveq #2,%d0
	jra .L630
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.globl	psl_native_stop
	.type	psl_native_stop, @function
psl_native_stop:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L640
.L642:
	clr.l %d0
.L639:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L640:
	tst.w 1175263050.l
	jne .L642
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
	jra .L639
	.size	psl_native_stop, .-psl_native_stop
	.align	2
	.globl	psl_native_observe_key
	.type	psl_native_observe_key, @function
psl_native_observe_key:
	lea (-12,%sp),%sp
	movem.l #28,(%sp)
	tst.l 20(%sp)
	jeq .L643
	move.l 16(%sp),%d0
	add.l #-39,%d0
	lsr.l #1,%d0
	jne .L643
	tst.w 1175263050.l
	jne .L645
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L643
.L645:
	move.l 1187521622,%d0
	add.l #-1074668000,%d0
	move.b 269161680,%d4
	cmp.l #9535680,%d0
	jhi .L643
	move.l %d0,%d2
	move.l #635712,%d1
	remu.l %d1,%d3:%d2
	divu.l %d1,%d2
	tst.l %d3
	jne .L643
	mvz.b %d4,%d4
	moveq #15,%d0
	cmp.l %d4,%d0
	jcs .L643
	jsr project_identity
	tst.l %d0
	jeq .L643
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L643
	mvz.w %d2,%d2
	lsl.l #4,%d2
	add.l %d4,%d2
	move.l #psl_nv_invalidate,%d4
.L646:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269455360,-(%sp)
	move.l %d4,%a0
	addq.l #1,%d3
	jsr (%a0)
	lea (12,%sp),%sp
	moveq #8,%d0
	cmp.l %d3,%d0
	jne .L646
	addq.l #1,origin_epoch
.L643:
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
	jcc .L661
.L663:
	clr.l -164(%fp)
	clr.l %d2
.L662:
	move.l 8(%fp),-(%sp)
	jsr psl_stock_sample_write
	addq.l #4,%sp
	tst.l -164(%fp)
	jeq .L660
	mvz.b -87(%fp),%d0
	move.l %d0,-(%sp)
	mvz.b -88(%fp),%d0
	move.l %d0,-(%sp)
	move.l -92(%fp),-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L660
	pea -156(%fp)
	move.l -68(%fp,%d3.l*4),-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_publish
	lea (20,%sp),%sp
.L660:
	movem.l -184(%fp),#1084
	unlk %fp
	rts
.L661:
	moveq #48,%d1
	cmp.l %d4,%d1
	jcs .L663
	moveq #15,%d2
	and.l %d4,%d2
	tst.l %d2
	jne .L663
	pea -92(%fp)
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L664
.L665:
	clr.l -164(%fp)
	jra .L662
.L664:
	jsr project_identity
	tst.l %d0
	jeq .L665
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L665
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
.L666:
	move.l -164(%fp),%a1
	moveq #64,%d1
	lea (%a1,%d0.l),%a2
	addq.l #1,%d0
	move.b (%a2),-1(%a0,%d0.l)
	cmp.l %d0,%d1
	jne .L666
	mvz.w -158(%fp),%d0
	add.l %d4,%a0
.L668:
	btst %d2,%d0
	jeq .L667
	clr.b %d1
	move.b %d1,(%a0,%d2.l)
.L667:
	addq.l #1,%d2
	moveq #16,%d1
	cmp.l %d2,%d1
	jne .L668
	move.l %d3,-(%sp)
	move.l %d5,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_invalidate
	lea (12,%sp),%sp
	move.l %d5,%d2
	moveq #1,%d0
	addq.l #1,origin_epoch
	move.l %d0,-164(%fp)
	jra .L662
	.size	psl_manual_sample, .-psl_manual_sample
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	lea (-372,%sp),%sp
	movem.l #31996,(%sp)
	move.l 376(%sp),%a6
	tst.l %a6
	jeq .L688
	tst.b 10(%a6)
	jne .L689
.L688:
	moveq #1,%d3
.L687:
	move.l %d3,%d0
	movem.l (%sp),#31996
	lea (372,%sp),%sp
	rts
.L689:
	jsr psl_native_transport
	tst.l %d0
	jne .L688
	move.l %sp,%d4
	add.l #280,%d4
	move.l %d4,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	move.l %d0,%d3
	tst.l %d0
	jeq .L688
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	tst.l %d0
	jeq .L691
.L693:
	move.l %d0,%d3
	jra .L687
.L691:
	tst.w 1632(%a6)
	jne .L692
	clr.b %d1
	move.b %d1,10(%a6)
	jra .L693
.L692:
	jsr project_identity
	move.l %d0,%d2
	tst.l %d0
	jeq .L687
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_begin
	addq.l #8,%sp
	tst.l %d0
	jeq .L731
	clr.l %d0
	lea (216,%sp),%a0
.L694:
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b (%a1),%d1
	lea (152,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L694
	mvz.b 4(%a6),%d0
	mvz.b 7(%a6),%d3
	lea (608,%a6),%a2
	clr.l %d1
	lea (304,%sp),%a1
	clr.l %d2
	mulu.w #36568,%d0
	lea (120,%sp),%a3
	move.l %sp,%d7
	add.l #88,%d7
	move.l %d3,76(%sp)
	move.l %d4,70(%sp)
	move.l %a1,58(%sp)
	move.l %a2,54(%sp)
	move.l %d0,%a0
	add.l #268525902,%a0
	move.l %a2,50(%sp)
	move.l %a3,62(%sp)
	clr.l 66(%sp)
.L704:
	move.l 58(%sp),%a1
	move.l %d7,%a2
	move.l (%a1),%d0
	move.l 62(%sp),%a1
	move.l 76(%sp),%d3
	move.l %d0,(%a2)
	move.l %a0,(%a1)
	btst %d1,%d3
	jeq .L695
	mvz.w %d1,%d3
	sub.l %a1,%a1
	lsl.l #3,%d3
	lea (%a6,%d3.l),%a2
.L697:
	mvz.b (%a1,%a0.l),%d4
	mvz.b 27(%a2,%a1.l),%d3
	cmp.l %d4,%d3
	jne .L696
	addq.l #1,%a1
	moveq #8,%d5
	cmp.l %a1,%d5
	jne .L697
	moveq #1,%d3
	add.l #120,%d0
	lsl.l %d1,%d3
	move.l 50(%sp),%a4
	moveq #89,%d4
	lea (31,%a0),%a2
	lea (216,%sp),%a1
	move.l %a2,80(%sp)
	move.l %d3,%d5
	not.l %d5
	move.l %d5,84(%sp)
.L703:
	move.b (%a4),74(%sp)
	move.l 80(%sp),%a5
	add.l %d4,%a5
	mvz.b (%a5),%d6
	move.l %d6,%a2
	mvz.b 74(%sp),%d5
	cmp.l %d6,%d5
	jne .L696
	move.b 512(%a4),%d5
	addq.l #1,%a4
	mvz.b %d5,%d6
	move.b %d5,75(%sp)
	move.l %d6,46(%sp)
	cmp.l %a2,%d6
	jeq .L698
	move.l 66(%sp),%d5
	moveq #10,%d6
	or.l %d3,%d2
	muls.l %d6,%d5
	move.b 74(%sp),%d6
	addq.l #1,66(%sp)
	move.l %d5,%a2
	move.l #edits,%d5
	move.l %d0,(%a2,%d5.l)
	add.l %d5,%a2
	move.b 75(%sp),%d5
	move.b %d6,8(%a2)
	move.l %a5,4(%a2)
	move.l 46(%sp),%d6
	move.b %d5,9(%a2)
	cmp.l #255,%d6
	jne .L699
	move.l %d0,%a5
	sub.l %a2,%a2
	lea (-120,%a5),%a5
.L700:
	mvz.b 89(%a5,%a2.l),%d5
	cmp.l #255,%d5
	jne .L699
	addq.l #1,%a2
	moveq #31,%d5
	cmp.l %a2,%d5
	jne .L700
	move.b (%a1),%d5
	and.l 84(%sp),%d5
	jra .L780
.L699:
	move.b (%a1),%d5
	or.l %d3,%d5
.L780:
	move.b %d5,(%a1)
.L698:
	addq.l #1,%a1
	add.l #32,%d4
	add.l #32,%d0
	cmp.l #2137,%d4
	jne .L703
.L695:
	moveq #64,%d6
	addq.l #4,%d7
	addq.l #4,58(%sp)
	addq.l #4,62(%sp)
	addq.l #1,%d1
	lea (2330,%a0),%a0
	moveq #8,%d0
	add.l %d6,50(%sp)
	cmp.l %d1,%d0
	jne .L704
	tst.b 8(%a6)
	jne .L705
	move.l %d2,-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_reserve
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L732
.L705:
#APP
| 155 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d5
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	jsr psl_native_transport
	move.l %d0,%d4
	tst.l %d0
	jeq .L706
.L781:
#APP
| 173 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d5,%sr
| 0 "" 2
#NO_APP
.L696:
	moveq #3,%d3
	jra .L687
.L706:
	mvz.b 5(%a6),%d7
	move.l (%a6),%d6
	move.l %d7,-(%sp)
	mvz.b 4(%a6),%d0
	move.l %d0,-(%sp)
	move.l %d6,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L781
	move.l origin_epoch,%d1
	cmp.l 604(%a6),%d1
	jne .L781
	lea (152,%sp),%a1
	clr.l %d3
	move.l #1187501196,%a0
.L710:
	mvz.b (%a0),%d1
	mvz.b (%a1)+,%d0
	cmp.l %d1,%d0
	jeq .L709
	moveq #3,%d3
.L709:
	addq.l #1,%a0
	cmp.l #1187501260,%a0
	jne .L710
	mulu.w #6322,%d7
	move.l %d6,%a1
	add.l #585088,%a1
	mvz.b 7(%a6),%d6
	move.l #714,%d0
	clr.l %d1
	move.l %d0,76(%sp)
	move.l %d6,58(%sp)
	add.l %d7,%a1
	lea (34,%a1),%a0
	move.l 54(%sp),%d7
	move.l %a0,62(%sp)
.L717:
	move.l 58(%sp),%d0
	btst %d1,%d0
	jeq .L711
	move.l 62(%sp),%a0
	mvz.b 11(%a6,%d1.l),%d0
	mvz.b (%a0,%d1.l),%d6
	cmp.l %d6,%d0
	jne .L735
	move.l 76(%sp),%a0
	add.l %d6,%a0
	mvz.b 19(%a6,%d1.l),%d0
	mvz.b (%a1,%a0.l),%d6
	cmp.l %d6,%d0
	jne .L735
.L712:
	mvz.w %d1,%d0
	move.l 88(%sp,%d1.l*4),%a2
	lsl.l #3,%d0
	lea (%a6,%d0.l),%a4
	clr.l %d0
.L714:
	mvz.b (%a2,%d0.l),%d6
	move.l %d6,%a5
	mvz.b 27(%a4,%d0.l),%d6
	cmp.l %a5,%d6
	jne .L737
	move.l (%a3),%a0
	mvz.b (%a0,%d0.l),%d6
	cmp.l %a5,%d6
	jne .L737
.L713:
	addq.l #1,%d0
	moveq #8,%d6
	cmp.l %d0,%d6
	jne .L714
	move.l %d7,%a4
	moveq #120,%d0
.L716:
	mvz.b (%a2,%d0.l),%d6
	move.l %d6,%a5
	mvz.b (%a4)+,%d6
	cmp.l %a5,%d6
	jne .L739
	move.l (%a3),%a0
	mvz.b (%a0,%d0.l),%d6
	cmp.l %a5,%d6
	jne .L739
.L715:
	add.l #32,%d0
	cmp.l #2168,%d0
	jne .L716
.L711:
	addq.l #1,%d1
	addq.l #4,%a3
	add.l #64,%d7
	addq.l #5,76(%sp)
	moveq #8,%d0
	cmp.l %d1,%d0
	jne .L717
	tst.l %d3
	jeq .L740
#APP
| 173 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d5,%sr
| 0 "" 2
#NO_APP
	jra .L687
.L735:
	moveq #3,%d3
	jra .L712
.L737:
	moveq #3,%d3
	jra .L713
.L739:
	moveq #3,%d3
	jra .L715
.L740:
	clr.l %d6
	lea psl_nv_invalidate,%a2
.L718:
	btst %d6,%d2
	jeq .L720
	move.l %d6,-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
.L720:
	addq.l #1,%d6
	moveq #8,%d1
	cmp.l %d6,%d1
	jne .L718
	lea edits,%a1
	clr.l %d0
.L721:
	cmp.l 66(%sp),%d0
	jne .L722
	clr.l %d0
	lea (216,%sp),%a0
.L724:
	move.b (%a0,%d0.l),%d1
	lea (152,%sp),%a1
	mvz.b (%a1,%d0.l),%d7
	mvz.b %d1,%d6
	cmp.l %d7,%d6
	jeq .L723
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b %d1,(%a1)
.L723:
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L724
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d6
	clr.b %d0
	move.l %d6,269452696
	move.b %d0,10(%a6)
#APP
| 173 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d5,%sr
| 0 "" 2
#NO_APP
	lea origin,%a3
	clr.l %d5
	lea psl_nv_publish,%a2
.L728:
	btst %d5,%d2
	jeq .L725
	move.l 54(%sp),%a1
	sub.l %a0,%a0
.L727:
	move.b (%a1)+,%d1
	move.b 511(%a1),%d0
	mvz.b %d1,%d1
	mvz.b %d0,%d6
	cmp.l %d1,%d6
	jeq .L726
	not.l %d0
	tst.b %d0
	sne %d0
	neg.l %d0
	move.b %d0,(%a3,%a0.l)
.L726:
	addq.l #1,%a0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L727
	move.l %a3,-(%sp)
	move.l 74(%sp),%a0
	move.l 24(%a0),-(%sp)
	move.l %d5,-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr (%a2)
	lea (20,%sp),%sp
.L725:
	moveq #64,%d0
	addq.l #1,%d5
	lea (64,%a3),%a3
	moveq #8,%d1
	addq.l #4,70(%sp)
	add.l %d0,54(%sp)
	cmp.l %d5,%d1
	jne .L728
	addq.l #1,origin_epoch
	jsr 1073905152
.L730:
	btst %d4,%d2
	jeq .L729
	move.l %d4,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L729:
	addq.l #1,%d4
	moveq #8,%d5
	cmp.l %d4,%d5
	jne .L730
	jra .L687
.L722:
	move.b 9(%a1),%d1
	move.l (%a1),%a0
	addq.l #1,%d0
	lea (10,%a1),%a1
	move.b %d1,(%a0)
	move.l -6(%a1),%a0
	move.b %d1,(%a0)
	jra .L721
.L731:
	move.l %d2,%d3
	jra .L687
.L732:
	moveq #4,%d3
	jra .L687
	.size	psl_native_commit, .-psl_native_commit
	.align	2
	.type	finish_action, @function
finish_action:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	lea CSWTCH.195,%a0
	lea (%a0,%d0.l*4),%a0
	clr.b %d0
	move.l (%a0),message
	move.b %d0,plan+10
	moveq #4,%d0
	move.l %d0,phase
	moveq #1,%d0
	move.l %d0,1187497772
	rts
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
	jne .L784
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jeq .L784
	jsr close_view
.L784:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L785
	subq.l #4,%d0
	tst.l %d0
	jeq .L785
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L786
.L788:
	jsr close_view
.L787:
	moveq #5,%d0
	cmp.l phase.l,%d0
	jne .L785
	jsr psl_native_transport
	tst.l %d0
	jne .L789
	jsr finish_action
.L785:
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
.L786:
	jsr psl_native_popup
	tst.l %d0
	jne .L788
	jra .L787
.L789:
	subq.l #2,%d0
	tst.l %d0
	jeq .L792
	move.l stop_ticks,%d0
	addq.l #1,%d0
	move.l %d0,stop_ticks
	moveq #119,%d1
	cmp.l %d0,%d1
	jcc .L791
	move.l #.LC22,%d0
.L790:
	move.l %d0,message
	moveq #4,%d1
	move.l %d1,phase
	clr.b %d0
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	jra .L785
.L792:
	move.l #.LC21,%d0
	jra .L790
.L791:
	tst.l stop_requested
	jne .L785
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L785
	.size	module_tick, .-module_tick
	.section	.rodata.str1.1
.LC23:
	.string	"ACTIVE PATTERN ONLY"
.LC24:
	.string	"SOURCE CHANGED - REOPEN"
.LC25:
	.string	"SELECT TRACKS FIRST"
.LC26:
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
	jcs .L800
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
	jne .L801
	tst.l %d2
	jeq .L802
	not.l %d3
	move.l %a1,%d5
	and.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
.L803:
	moveq #1,%d0
	jra .L802
.L801:
	tst.l %d2
	jne .L803
	move.l phase,%d4
	moveq #5,%d5
	cmp.l %d4,%d5
	jeq .L804
	move.l %d0,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_native_observe_key
	addq.l #8,%sp
	tst.l %d4
	jeq .L800
	move.l %a6,%d0
	moveq #3,%d1
	add.l #-49,%d0
	cmp.l %d0,%d1
	jcc .L806
	add.l #17,%d0
	lsr.l #1,%d0
	jeq .L806
.L809:
	jsr close_view
.L800:
	clr.l %d0
.L802:
	movem.l (%sp),#19516
	lea (124,%sp),%sp
	rts
.L804:
	moveq #39,%d0
	cmp.l %a6,%d0
	jeq .L800
	move.l %a1,%d5
	moveq #50,%d0
	or.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
	cmp.l %a6,%d0
	jne .L803
.L811:
	jsr close_view
	jra .L803
.L806:
	moveq #1,%d0
	cmp.l %d4,%d0
	jne .L807
	moveq #49,%d1
	cmp.l %a6,%d1
	jne .L808
	moveq #3,%d5
	cmp.l cursor.l,%d5
	jcc .L809
.L807:
	or.l %d3,consumed+4
	moveq #50,%d1
	cmp.l %a6,%d1
	jne .L810
	subq.l #3,%d4
	tst.l %d4
	jne .L811
	clr.b %d0
	moveq #2,%d5
	move.l %d5,phase
	clr.l message
	move.b %d0,plan+10
.L821:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L803
.L808:
	moveq #50,%d0
	cmp.l %a6,%d0
	jne .L807
	jra .L809
.L810:
	move.l %a6,%d0
	moveq #1,%d3
	add.l #-51,%d0
	cmp.l %d0,%d3
	jcc .L812
	add.l #19,%d0
	cmp.l %d0,%d3
	jcs .L813
.L812:
	move.l %a6,-(%sp)
	jsr move
	addq.l #4,%sp
	jra .L803
.L813:
	moveq #1,%d5
	cmp.l %d4,%d5
	jne .L814
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
	jne .L815
	move.l #.LC23,%d3
	moveq #4,%d5
	move.l %d3,message
	moveq #1,%d0
	move.l %d5,phase
	move.l %d0,1187497772
	jra .L803
.L815:
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
	jeq .L816
	clr.b %d3
.L817:
	move.l %d1,%d4
	lsr.l %d2,%d4
	move.l %d2,%a0
	addq.l #1,%d2
	btst #0,%d4
	jeq .L828
	tst.b %d3
	jeq .L816
	move.l %a0,cursor
.L816:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L802
.L828:
	moveq #1,%d3
	jra .L817
.L814:
	moveq #2,%d3
	cmp.l %d4,%d3
	jne .L818
	lea (32,%sp),%a6
	move.l %a6,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L819
	move.l 32(%sp),%d4
	cmp.l captured.l,%d4
	jne .L819
	mvz.w captured+4,%d1
	mvz.w 36(%sp),%d0
	cmp.l %d1,%d0
	jne .L819
	move.b 38(%sp),%d3
	mvz.b %d3,%d0
	cmp.l eligible.l,%d0
	jeq .L820
.L819:
	move.l #.LC24,%d5
	moveq #4,%d0
	move.l %d5,message
.L852:
	move.l %d0,phase
	jra .L821
.L820:
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
	jne .L822
	lea .LC25,%a0
	move.l %a0,message
	jra .L821
.L822:
	tst.l %d0
	jeq .L823
	lea .LC26,%a2
	move.l %a2,message
	jra .L821
.L823:
	move.w 30(%sp),%a3
	move.b %d3,captured+6
	move.l %sp,%d0
	add.l #39,%d0
	move.l %d4,captured
	lea captured+7,%a6
	lea (56,%sp),%a1
	lea captured+24,%a0
	move.w %a3,captured+4
.L824:
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
	jne .L824
	lea (120,%sp),%a0
	moveq #3,%d0
	move.l (%a0),captured+88
	jra .L852
.L818:
	subq.l #3,%d4
	tst.l %d4
	jne .L811
	jsr psl_native_transport
	moveq #2,%d5
	cmp.l %d0,%d5
	jne .L825
	clr.b %d0
	lea .LC21,%a0
	moveq #4,%d1
	move.l %a0,message
	move.l %d1,phase
	move.b %d0,plan+10
.L826:
	moveq #1,%d5
	move.l %d5,1187497772
	jra .L803
.L825:
	tst.l %d0
	jne .L827
	jsr finish_action
	jra .L826
.L827:
	moveq #5,%d3
	move.l %d3,phase
	clr.l stop_ticks
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L826
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
	jne .L853
	cmp.l #1175261212,%d4
	jne .L853
	cmp.l #1074502420,%d3
	jne .L853
	cmp.l #1074502404,%d2
	jne .L853
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jne .L853
	movem.l (%sp),#60
	lea (16,%sp),%sp
	jra psl_ui_open
.L853:
	movem.l (%sp),#60
	lea (16,%sp),%sp
	rts
	.size	psl_open, .-psl_open
	.section	.rodata.str1.1
.LC27:
	.string	"DONE - PROJECT NOT SAVED"
.LC28:
	.string	"REFUSED - NO CHANGES"
.LC29:
	.string	"OWNERSHIP STORE FULL"
	.section	.rodata
	.align	2
	.type	CSWTCH.195, @object
	.size	CSWTCH.195, 20
CSWTCH.195:
	.long	.LC27
	.long	.LC28
	.long	.LC28
	.long	.LC24
	.long	.LC29
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
.LC30:
	.string	"RENAME"
.LC31:
	.string	"RELOAD"
.LC32:
	.string	"SAVE"
.LC33:
	.string	"SAVE ALL"
	.section	.rodata
	.align	2
	.type	part_rows, @object
	.size	part_rows, 24
part_rows:
	.long	.LC30
	.long	.LC31
	.long	.LC32
	.long	.LC33
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
	.local	nv_index_identity
	.comm	nv_index_identity,4,2
	.local	nv_index_store
	.comm	nv_index_store,4,2
	.local	nv_index
	.comm	nv_index,4096,2
	.type	nv_tag, @object
	.size	nv_tag, 8
nv_tag:
	.string	"PSLOWN\002"
	.ident	"GCC: (GNU) 16.2.0"
