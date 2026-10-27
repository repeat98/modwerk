#NO_APP
	.file	"grain.c"
	.text
	.align	2
	.type	pan_birth, @function
pan_birth:
	lea (-16,%sp),%sp
	movem.l #3084,(%sp)
	move.l 24(%sp),%a2
	move.l #16777472,%d0
	move.l 28(%sp),%d2
	move.l 20(%sp),%a0
	move.l %d0,24(%a2)
	tst.l %d2
	jeq .L1
	move.l 124(%a0),%d1
	moveq #13,%d3
	move.l %d1,%d0
	mvz.w %d2,%d2
	lsl.l %d3,%d0
	moveq #17,%d3
	lea og_pan_root,%a3
	lsl.l #7,%d2
	eor.l %d1,%d0
	add.l #63,%d2
	move.l %d0,%d1
	lsr.l %d3,%d1
	moveq #127,%d3
	eor.l %d0,%d1
	move.l %d1,%d0
	lsl.l #5,%d0
	eor.l %d1,%d0
	divu.l %d3,%d2
	move.l %d0,124(%a0)
	clr.w %d0
	swap %d0
	move.l %d2,%d3
	add.l %d3,%d3
	addq.l #1,%d3
	mulu.w %d0,%d3
	mvz.w #128,%d0
	clr.w %d3
	swap %d3
	sub.l %d2,%d3
	sub.l %d3,%d0
	swap %d0
	clr.w %d0
	add.l #128,%d2
	add.l #128,%d3
	swap %d3
	clr.w %d3
	divu.l %d2,%d0
	move.l %d0,-(%sp)
	jsr (%a3)
	move.w %d0,24(%a2)
	divu.l %d2,%d3
	move.l %d3,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	move.w %d0,26(%a2)
.L1:
	movem.l (%sp),#3084
	lea (16,%sp),%sp
	rts
	.size	pan_birth, .-pan_birth
	.align	2
	.type	frame_pcm, @function
frame_pcm:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 16(%sp),%a1
	move.l 12(%sp),%d1
	move.l 20(%sp),%a0
	tst.l %a1
	jne .L7
	clr.l 4(%a0)
	clr.l (%a0)
.L6:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L7:
	mov3q.l #3,%d0
	cmp.l %d1,%d0
	jne .L9
	move.l (%a1),%d0
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	mvs.w %d1,%d1
	move.l %d1,(%a0)
.L12:
	mvs.w %d0,%d0
.L11:
	move.l %d0,4(%a0)
	jra .L6
.L9:
	mov3q.l #2,%d2
	cmp.l %d1,%d2
	jne .L10
	mvs.w (%a1),%d0
	move.l %d0,4(%a0)
	move.l %d0,(%a0)
	jra .L6
.L10:
	move.l %a1,%a2
	subq.l #1,%d1
	move.b (%a2)+,%d2
	lsl.l #8,%d2
	mvz.b (%a2),%d0
	or.l %d2,%d0
	mvs.w %d0,%d0
	move.l %d0,(%a0)
	tst.l %d1
	jne .L11
	move.b 3(%a1),%d1
	mvz.b 4(%a1),%d0
	lsl.l #8,%d1
	or.l %d1,%d0
	jra .L12
	.size	frame_pcm, .-frame_pcm
	.align	2
	.globl	og_hop
	.type	og_hop, @function
og_hop:
	move.l %d2,-(%sp)
	move.l 12(%sp),%d0
	move.l 8(%sp),%d1
	tst.l %d0
	jeq .L14
	moveq #127,%d2
	cmp.l %d0,%d2
	jne .L15
	move.l %d1,%d0
	mov3q.l #3,%d2
	addq.l #2,%d0
.L19:
	divu.l %d2,%d0
.L14:
	move.l (%sp)+,%d2
	rts
.L15:
	move.l %d0,%a1
	lea (%a1,%d0.l*2),%a0
	move.l %d1,%d0
	lsl.l #7,%d0
	move.l %a0,%d2
	sub.l %d1,%d0
	lea -1(%a0,%d0.l),%a1
	move.l %a1,%d0
	jra .L19
	.size	og_hop, .-og_hop
	.align	2
	.globl	og_stop
	.type	og_stop, @function
og_stop:
	move.l 4(%sp),%a0
	clr.l 12(%a0)
	clr.l 44(%a0)
	clr.l 76(%a0)
	clr.l 96(%a0)
	clr.l 108(%a0)
	clr.l 112(%a0)
	rts
	.size	og_stop, .-og_stop
	.align	2
	.globl	og_reset
	.type	og_reset, @function
og_reset:
	move.l %a2,-(%sp)
	move.l 8(%sp),%a2
	move.l %a2,-(%sp)
	jsr og_stop
	move.l 16(%sp),104(%a2)
	addq.l #4,%sp
	move.l #1520797,%d0
	move.l %d0,100(%a2)
	move.l #-1640531527,%d0
	move.l %d0,124(%a2)
	clr.w %d0
	move.w %d0,30(%a2)
	move.w %d0,62(%a2)
	move.w %d0,94(%a2)
	move.l (%sp)+,%a2
	rts
	.size	og_reset, .-og_reset
	.align	2
	.globl	og_scan_advance
	.type	og_scan_advance, @function
og_scan_advance:
	lea (-12,%sp),%sp
	move.l 28(%sp),%d0
	movem.l #1036,(%sp)
	lea (24,%sp),%a2
	moveq #12,%d2
	move.l 16(%sp),%a0
	muls.l (%a2),%d0
	move.l 20(%sp),%a1
	mvs.w 114(%a0),%d1
	add.l %d0,%d1
	move.l %d1,%d0
	asr.l %d2,%d0
	and.l #4095,%d1
	add.l 96(%a0),%d0
	move.w %d1,114(%a0)
	cmp.l %d0,%a1
	jhi .L23
	move.l %d0,%d1
	move.l %a1,%d3
	rems.l %d3,%d2:%d1
	move.l %d2,%d0
	tst.l %d2
	jge .L23
	add.l %a1,%d0
.L23:
	movem.l (%sp),#1036
	move.l %d0,96(%a0)
	lea (12,%sp),%sp
	rts
	.size	og_scan_advance, .-og_scan_advance
	.align	2
	.globl	og_engine
	.type	og_engine, @function
og_engine:
	link.w %fp,#-400
	move.l 12(%fp),%a1
	movem.l #15612,(%sp)
	move.l 24(%fp),%a5
	move.l %a5,%d0
	subq.l #1,%d0
	lsr.l #6,%d0
	move.l 16(%fp),%a0
	move.l 8(%fp),-352(%fp)
	move.l %a1,-328(%fp)
	move.l 20(%fp),-208(%fp)
	move.l %a5,-260(%fp)
	tst.l %d0
	jne .L24
	move.l 4(%a1),%d2
	move.l %d2,-340(%fp)
	subq.l #1,%d2
	move.l %d2,-292(%fp)
	cmp.l #44860415,%d2
	jhi .L24
	clr.l %d0
	move.l -352(%fp),%a1
	move.b 116(%a1),%d4
	mvz.b 117(%a1),%d2
	lsr.l #1,%d2
	mvz.b %d4,%d3
.L28:
	move.b (%a0,%d0.l),%d1
	jpl .L27
	moveq #127,%d1
.L27:
	lea (-176,%fp),%a2
	addq.l #1,%d0
	move.b %d1,-1(%a2,%d0.l)
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L28
	clr.l %d0
.L29:
	lea (-176,%fp),%a0
	mov3q.l #6,%d1
	lea (%a0,%d0.l),%a1
	move.l -352(%fp),%a0
	move.b (%a1),116(%a0,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L29
	move.b -175(%fp),%d5
	mvz.b %d5,%d0
	move.b %d5,-229(%fp)
	move.l %d0,%d6
	lsr.l #1,%d6
	move.l %d6,-216(%fp)
	cmp.l %d2,%d6
	jeq .L30
	move.l %d0,-(%sp)
	move.l #-2147483648,%d6
	jsr og_size
	addq.l #4,%sp
	move.l -352(%fp),%a5
	lea og_shape_floor,%a2
	move.l -352(%fp),%a0
	mov3q.l #-1,%a1
	move.l %d0,%d1
	subq.l #1,%d1
	divu.l %d1,%d6
	addq.l #8,%a0
	lea (104,%a5),%a5
	clr.l %d1
	lea og_lengths_low,%a3
.L36:
	tst.l 4(%a0)
	jeq .L31
	move.b 20(%a0),%d1
	jne .L32
.L34:
	move.l %d6,%d5
.L33:
	move.l #-2147483648,%d1
	sub.l 8(%a0),%d1
	move.l %d5,12(%a0)
	divu.l %d5,%d1
	move.l (%a0),%d7
	addq.l #1,%d1
	add.l %d1,%d7
	move.l %d7,4(%a0)
	cmp.l %a1,%d1
	jcc .L35
	move.l %d1,%a1
.L35:
	mov3q.l #1,%d1
.L31:
	lea (32,%a0),%a0
	cmp.l %a5,%a0
	jne .L36
	tst.l %d1
	jeq .L37
	move.l -352(%fp),%a2
	move.l 108(%a2),%a0
	tst.l %a0
	jeq .L37
	mvz.b %d2,%d1
	mov3q.l #1,%d0
	moveq #59,%d5
	cmp.l %d2,%d5
	jcs .L38
	clr.l %d0
.L38:
	swap %d0
	clr.w %d0
	lea og_lengths_low,%a2
	clr.l %d5
	mvz.w (%a2,%d1.l*2),%d1
	move.l %d0,%a2
	move.l #-2147483648,%d0
	lea -1(%a2,%d1.l),%a2
	move.l %a2,%d1
	divu.l %d1,%d0
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.l %d1,%a2
.L39:
	move.w %a2,%d1
	move.l %a0,%d7
	lsr.l %d5,%d7
	move.l %d7,%d2
	clr.w %d2
	swap %d2
	tst.w %d1
	jne .L42
	tst.w %d2
	jeq .L204
	move.w %d0,%d1
.L44:
	mulu.w %d2,%d1
	move.w %d0,%d2
	mulu.w %d7,%d2
	clr.w %d2
	swap %d2
	add.l %d2,%d1
	swap %d1
	ext.l %d1
	tst.w %d1
	jne .L164
.L204:
	muls.l %d7,%d0
	move.l -352(%fp),%a0
	divu.l %d6,%d0
	lsl.l %d5,%d0
	move.l %d0,108(%a0)
.L37:
	move.l -352(%fp),%a2
	moveq #127,%d1
	mvz.b 116(%a2),%d0
	cmp.l %d0,%d1
	jne .L30
	cmp.l 108(%a2),%a1
	jcc .L30
	move.l %a1,108(%a2)
.L30:
	move.b -176(%fp),%d2
	move.b %d2,-230(%fp)
	tst.l %d3
	jeq .L48
	tst.b %d2
	jne .L49
.L48:
	move.l -352(%fp),%a0
	clr.l 108(%a0)
.L50:
	mvz.b -173(%fp),%d0
	add.l #-64,%d0
	move.w %d0,%d1
	jpl .L51
	move.l %d0,%d1
	neg.l %d1
.L51:
	muls.w %d0,%d1
	move.l -328(%fp),%a0
	mov3q.l #2,%d0
	mov3q.l #2,%d2
	mvs.w #-130,%d4
	clr.l -152(%fp)
	clr.l -144(%fp)
	clr.l -136(%fp)
	move.l %d1,-256(%fp)
	add.l %fp,%d4
	clr.l -236(%fp)
	clr.l -248(%fp)
	clr.l -284(%fp)
	lsl.l #2,%d1
	clr.l -300(%fp)
	clr.l -268(%fp)
	move.l %d4,-196(%fp)
	move.l %d1,-228(%fp)
	move.b 12(%a0),%d1
	eor.l %d0,%d1
	move.b 13(%a0),%d0
	tst.b %d1
	seq %d1
	eor.l %d2,%d0
	moveq #127,%d2
	mvs.b %d1,%d1
	tst.b %d0
	seq %d0
	neg.l %d1
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,%a0
	lea (%a0,%d1.l*2),%a0
	move.l %a0,-244(%fp)
	move.l -352(%fp),%a0
	mvz.w 112(%a0),%d1
	move.l 108(%a0),%a1
	move.l %d1,-304(%fp)
	move.l -292(%fp),%d1
	move.l %a1,-324(%fp)
	remu.l %d2,%d3:%d1
	divu.l %d2,%d1
	move.l %d3,-200(%fp)
	move.l %d1,-204(%fp)
.L140:
	move.l -300(%fp),%d0
	move.l -260(%fp),%d1
	lsl.l #3,%d0
	sub.l -300(%fp),%d1
	move.l -304(%fp),%d2
	lsr.l #8,%d2
	move.l -208(%fp),%a0
	move.l %d1,-332(%fp)
	add.l %d0,%a0
	move.l %a0,-336(%fp)
	tst.l %d2
	jne .L52
	moveq #16,%d3
	cmp.l %d1,%d3
	jcc .L53
	moveq #16,%d4
	move.l %d4,-332(%fp)
.L53:
	mvz.w -330(%fp),%d1
	lea (-64,%fp),%a0
	clr.l %d0
	add.l %d1,%d1
.L54:
	move.l -336(%fp),%a1
	move.w (%a1,%d0.l*4),(%a0)+
	addq.l #1,%d0
	cmp.l %d0,%d1
	jhi .L54
.L52:
	clr.l -316(%fp)
.L133:
	tst.l -324(%fp)
	jne .L55
	tst.b -230(%fp)
	jne .L56
	move.l -332(%fp),%d1
	sub.l -316(%fp),%d1
	move.l %d1,-320(%fp)
.L57:
	move.l -316(%fp),%d0
	clr.l %d6
	move.l -336(%fp),%a0
	lea (-156,%fp),%a3
	lea (24,%a3),%a5
	lsl.l #3,%d0
	move.l -352(%fp),%a2
	addq.l #4,%a2
	move.l %a0,-288(%fp)
	move.l %a5,-212(%fp)
	lea (%a0,%d0.l),%a1
	move.l %a1,-252(%fp)
.L130:
	move.l 8(%a2),%d1
	move.l %d1,-240(%fp)
	tst.l %d1
	jeq .L79
	move.l 12(%a2),%d4
	move.l %d1,%d0
	move.l 4(%a2),%d2
	sub.l %d2,%d0
	move.l 16(%a2),%d3
	move.l %d4,-220(%fp)
	move.l -320(%fp),%d4
	move.l %d2,-224(%fp)
	move.l %d3,-264(%fp)
	move.l (%a2),-280(%fp)
	cmp.l %d4,%d0
	jcc .L80
	move.l %d0,%d4
.L80:
	subq.l #1,%d0
	move.l %d0,-296(%fp)
	cmp.l %d0,%d4
	jcc .L81
	move.l %d4,-296(%fp)
.L81:
	move.w 24(%a2),%d0
	move.l %d0,%d5
	mvz.b %d5,%d5
	move.l %d5,-308(%fp)
	tst.l -296(%fp)
	jeq .L82
	lsr.l #8,%d0
	move.l #og_hann_gain,%d7
	move.l #1073741824,%a0
	move.l %d7,-80(%fp)
	mvz.b %d0,%d1
	move.l %d7,-84(%fp)
	move.l %a0,-76(%fp)
	tst.b %d0
	jeq .L83
	lea og_shape_rows,%a0
	moveq #20,%d2
	move.l -4(%a0,%d1.l*4),%d0
	move.l %d0,%d1
	lsr.l #7,%d1
	moveq #24,%d3
	and.l #8190,%d1
	add.l #og_shape_gain,%d1
	move.l %d1,-84(%fp)
	move.l %d0,%d1
	lsr.l %d2,%d1
	lsl.l %d3,%d0
	add.l %d1,%d1
	move.l %d0,-76(%fp)
	add.l #og_shape_gain,%d1
	move.l %d1,-80(%fp)
.L83:
	move.l -328(%fp),%a0
	move.l (%a3),%d2
	move.l -280(%fp),%d5
	clr.l -360(%fp)
	mvz.b 12(%a0),%d1
	mvz.b 13(%a0),%d0
	move.l 4(%a0),%a1
	move.l -264(%fp),-88(%fp)
	muls.w %d0,%d1
	move.l 20(%a2),-72(%fp)
	move.l %a1,-276(%fp)
	move.l 4(%a3),-192(%fp)
	move.l %d1,-312(%fp)
	move.l -220(%fp),-272(%fp)
.L124:
	move.l -328(%fp),%a0
	move.l -276(%fp),%a5
	sub.l %d5,%a5
	lea (-1,%a5),%a4
	tst.b 15(%a0)
	jeq .L84
	moveq #127,%d0
	cmp.l %a4,%d0
	jcs .L84
	tst.l -284(%fp)
	jne .L85
	pea -188(%fp)
	clr.l -(%sp)
	move.l %a0,-(%sp)
	jsr og_locate
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L143
	mov3q.l #1,-284(%fp)
.L86:
	pea -164(%fp)
	move.l %d0,-(%sp)
	move.l -244(%fp),-(%sp)
	move.l -284(%fp),-168(%fp)
	move.l -248(%fp),-164(%fp)
	move.l -236(%fp),-160(%fp)
	jsr frame_pcm
	lea (12,%sp),%sp
	move.l -164(%fp),-248(%fp)
	move.l -160(%fp),-236(%fp)
.L85:
	move.l -296(%fp),%d0
	sub.l -360(%fp),%d0
	tst.w -306(%fp)
	jeq .L87
	move.w #128,%a5
	sub.l %a4,%a5
.L87:
	cmp.l %a5,%d0
	jcc .L89
	move.l %d0,%a5
.L89:
	move.l %a5,%d3
	moveq #8,%d0
	cmp.l %a5,%d0
	jcc .L91
	moveq #8,%d3
.L91:
	sub.l %a4,%a4
.L103:
	tst.w -306(%fp)
	jeq .L92
	move.l %d5,%a5
	sub.l %a4,%a5
.L93:
	tst.l -192(%fp)
	jne .L94
	pea -192(%fp)
	move.l %a5,-(%sp)
	move.l -328(%fp),-(%sp)
	jsr og_locate
	lea (12,%sp),%sp
	move.l %d0,%d2
	tst.l %d0
	jeq .L94
	tst.w -306(%fp)
	jeq .L94
	mvz.w #6144,%d1
	move.l -312(%fp),%d7
	divu.l %d7,%d1
	move.l %a5,%d7
	remu.l %d1,%d0:%d7
	addq.l #1,%d0
	move.l %d0,-192(%fp)
.L94:
	pea -184(%fp)
	move.l %d2,-(%sp)
	move.l -244(%fp),-(%sp)
	clr.l -184(%fp)
	clr.l -180(%fp)
	jsr frame_pcm
	lea (12,%sp),%sp
	move.l -184(%fp),%a1
	mov3q.l #1,%d1
	move.l -180(%fp),%a0
	cmp.l -284(%fp),%d1
	jne .L98
	tst.l %d2
	jeq .L98
	mvz.w #129,%d0
	sub.l -276(%fp),%d0
	move.l %d0,%d1
	add.l %a5,%d1
	move.l -248(%fp),%d0
	sub.l %a1,%d0
	muls.l %d1,%d0
	asr.l #7,%d0
	add.l %a1,%d0
	mvs.w %d0,%d0
	move.l %d0,%a1
	move.l -236(%fp),%d0
	sub.l %a0,%d0
	muls.l %d1,%d0
	asr.l #7,%d0
	add.l %a0,%d0
	mvs.w %d0,%d0
	move.l %d0,%a0
.L98:
	lea (-132,%fp),%a5
	move.w %a1,(%a5,%a4.l*4)
	move.l -196(%fp),%a1
	move.w %a0,(%a1,%a4.l*4)
	tst.l %d2
	jeq .L100
	tst.w -306(%fp)
	jeq .L101
	sub.l -312(%fp),%d2
.L102:
	subq.l #1,-192(%fp)
.L100:
	addq.l #1,%a4
	cmp.l %d3,%a4
	jne .L103
	moveq #4,%d0
	move.l %fp,%d1
	mov3q.l #4,%a5
	add.l #-132,%d1
	lea og_mix_span,%a0
	move.b %d0,-66(%fp)
.L104:
	tst.w -306(%fp)
	jeq .L115
	cmp.l %d3,%d5
	jcs .L116
	move.l %d5,%a4
.L207:
	sub.l %d3,%a4
.L117:
	add.l -360(%fp),%d3
	move.l -360(%fp),%d0
	move.l %d3,-356(%fp)
.L118:
	cmp.l -356(%fp),%d0
	jcc .L109
	move.l -356(%fp),%d5
	sub.l %d0,%d5
	cmp.l %d0,%d6
	jhi .L119
.L121:
	move.l -356(%fp),%d7
.L120:
	move.l %d0,%d3
	lsl.l #3,%d3
	cmp.l %d0,%d6
	sls %d0
	pea -100(%fp)
	move.l %d1,-100(%fp)
	move.l %d1,-344(%fp)
	move.l %a0,-348(%fp)
	move.l %d3,%a1
	add.l -252(%fp),%a1
	neg.l %d0
	move.w %d5,-68(%fp)
	move.b %d0,-65(%fp)
	move.l %a1,-96(%fp)
	move.l -272(%fp),-92(%fp)
	jsr (%a0)
	addq.l #4,%sp
	move.l -344(%fp),%d1
	move.l -348(%fp),%a0
	cmp.l %d6,%d7
	jls .L122
	move.l %d7,%d6
.L122:
	move.l -264(%fp),%d3
	move.l %a5,%d0
	muls.l %d5,%d0
	muls.l %d3,%d5
	add.l %d0,%d1
	move.l %d7,%d0
	add.l %d5,-272(%fp)
	jra .L118
.L32:
	mvz.b %d1,%d1
	moveq #59,%d7
	mvz.b -1(%a2,%d1.l),%d1
	cmp.l %d1,%d7
	scs %d5
	mvz.w (%a3,%d1.l*2),%d1
	mvs.b %d5,%d5
	swap %d5
	clr.w %d5
	sub.l %d5,%d1
	cmp.l %d0,%d1
	jls .L34
	subq.l #1,%d1
	move.l #-2147483648,%d5
	divu.l %d1,%d5
	jra .L33
.L164:
	addq.l #1,%d5
	jra .L39
.L42:
	tst.w %d2
	jne .L164
	move.w %a2,%d2
	move.w %d7,%d1
	jra .L44
.L49:
	mvz.b %d4,%d4
	mvz.b -230(%fp),%d1
	cmp.l %d4,%d1
	jeq .L50
	move.l -352(%fp),%a1
	move.l %d1,%a5
	lea (108,%a1),%a2
	muls.l (%a2),%d3
	lea -1(%a5,%d3.l),%a5
	move.l %a5,%d0
	divu.l %d1,%d0
	move.l %d0,108(%a1)
	jra .L50
.L56:
	move.l -300(%fp),%a4
	add.l -316(%fp),%a4
	tst.l -256(%fp)
	jeq .L58
	move.l %a4,%d2
	sub.l -268(%fp),%d2
	move.l %d2,-(%sp)
	move.l -228(%fp),-(%sp)
	move.l -340(%fp),-(%sp)
	move.l -352(%fp),-(%sp)
	jsr og_scan_advance
	lea (16,%sp),%sp
.L58:
	clr.l %d3
	mov3q.l #-1,-324(%fp)
	move.l -352(%fp),%a2
	addq.l #8,%a2
.L61:
	move.l 4(%a2),%d4
	tst.l %d4
	jeq .L59
	sub.l (%a2),%d4
	cmp.l -324(%fp),%d4
	jcc .L60
	move.l %d4,-324(%fp)
.L60:
	addq.l #1,%d3
	lea (32,%a2),%a2
	mov3q.l #3,%d4
	cmp.l %d3,%d4
	jne .L61
	move.l -332(%fp),%d5
	sub.l -316(%fp),%d5
	move.l %d5,-320(%fp)
.L205:
	move.l %a4,-268(%fp)
.L62:
	move.l -324(%fp),%d3
	cmp.l -320(%fp),%d3
	jcc .L78
	move.l %d3,-320(%fp)
.L78:
	move.l -320(%fp),%d4
	sub.l %d4,-324(%fp)
	jra .L57
.L59:
	mvz.b -174(%fp),%d0
	move.l -204(%fp),%d1
	moveq #127,%d2
	move.l -352(%fp),%a0
	subq.l #8,%a2
	muls.l %d0,%d1
	mulu.w -198(%fp),%d0
	move.l %d1,%a3
	divu.l %d2,%d0
	add.l 96(%a0),%a3
	add.l %d0,%a3
	cmp.l -340(%fp),%a3
	jcs .L63
	sub.l -340(%fp),%a3
.L63:
	move.b -172(%fp),%d0
	jeq .L64
	mvz.b %d0,%d0
	moveq #15,%d5
	mvz.w #16129,%d6
	move.l -352(%fp),%a0
	muls.l %d0,%d0
	move.l -292(%fp),%d2
	lsl.l %d5,%d0
	add.l #8064,%d0
	divu.l %d6,%d0
	tst.b 123(%a0)
	jeq .L65
	cmp.l #88200,%d2
	jls .L65
	move.l #88200,%d2
.L65:
	move.l %d2,%d1
	moveq #15,%d5
	and.l #32767,%d1
	lsr.l %d5,%d2
	move.l -352(%fp),%a0
	moveq #17,%d6
	muls.l %d0,%d2
	muls.l %d0,%d1
	move.l 100(%a0),%d0
	lsr.l %d5,%d1
	moveq #13,%d5
	add.l %d2,%d1
	move.l %d0,%d2
	lsl.l %d5,%d2
	eor.l %d2,%d0
	move.l %d0,%d2
	lsr.l %d6,%d2
	eor.l %d2,%d0
	move.l %d1,%d2
	addq.l #1,%d2
	move.w %d2,%d6
	move.l %d0,%d5
	lsl.l #5,%d5
	eor.l %d0,%d5
	move.l %d2,%d0
	clr.w %d0
	swap %d0
	move.w %d5,%d7
	mulu.w %d5,%d6
	move.l %d5,100(%a0)
	clr.w %d5
	swap %d5
	clr.w %d6
	swap %d6
	mulu.w %d0,%d7
	mulu.w %d5,%d2
	mulu.w %d5,%d0
	add.l %d7,%d6
	move.l %d6,%d7
	mvz.w %d7,%d7
	clr.w %d6
	swap %d6
	add.l %a3,%d0
	add.l %d7,%d2
	clr.w %d2
	swap %d2
	add.l %d6,%d0
	add.l %d2,%d0
	cmp.l -340(%fp),%d0
	jcs .L67
	sub.l -340(%fp),%d0
.L67:
	lsr.l #1,%d1
	cmp.l %d1,%d0
	jcs .L68
	move.l %d0,%a3
	sub.l %d1,%a3
.L64:
	mvz.b -229(%fp),%d0
	move.l %a3,4(%a2)
	moveq #64,%d7
	move.l %a3,(%a2)
	clr.l 16(%a2)
	clr.l 8(%a2)
	move.l %d0,-(%sp)
	jsr og_size
	addq.l #4,%sp
	mvz.b -170(%fp),%d1
	move.l %d0,12(%a2)
	cmp.l %d1,%d7
	jeq .L142
	lea og_shape_caps,%a0
	mvz.b -213(%fp),%d2
	move.b (%a0,%d2.l),%d2
	cmp.l %d1,%d7
	jcc .L70
	lsl.l #4,%d1
	moveq #63,%d6
	mvz.b %d2,%d2
	lsr.l #4,%d2
	addq.l #1,%d2
	add.l #-962,%d1
	divu.l %d6,%d1
	cmp.l %d1,%d2
	jcc .L69
	move.l %d2,%d1
.L69:
	move.b -169(%fp),%d2
	move.b %d1,28(%a2)
	tst.b %d2
	jeq .L77
	move.w 30(%a2),%d5
	jeq .L74
	mvz.w %d5,%d5
.L75:
	move.l %d5,%d1
	moveq #9,%d6
	lsl.l #7,%d1
	mvz.b %d2,%d2
	mvz.w %d1,%d1
	eor.l %d5,%d1
	move.l %d1,%d5
	lsr.l %d6,%d5
	eor.l %d5,%d1
	move.l %d1,%d5
	lsl.l #8,%d5
	mvz.w %d5,%d5
	eor.l %d5,%d1
	move.w %d1,30(%a2)
	mulu.w #127,%d1
	clr.w %d1
	swap %d1
	cmp.l %d1,%d2
	jls .L77
	lea -1(%a3,%d0.l),%a3
	move.l -340(%fp),%d7
	mov3q.l #1,%d4
	move.l %a3,%d1
	remu.l %d7,%d2:%d1
	move.l %d2,4(%a2)
	move.l %d2,(%a2)
.L77:
	subq.l #1,%d0
	move.l #-2147483648,%d1
	divu.l %d0,%d1
	move.b %d4,29(%a2)
	mvz.b -171(%fp),%d0
	lsl.l #3,%d3
	move.l %d1,20(%a2)
	move.l %d0,-(%sp)
	move.l %a2,-(%sp)
	move.l -352(%fp),-(%sp)
	jsr pan_birth
	mvz.b -230(%fp),%d0
	move.l %d0,-(%sp)
	move.l 12(%a2),-(%sp)
	jsr og_hop
	lea (20,%sp),%sp
	move.l -332(%fp),%d1
	lea (%fp,%d3.l),%a0
	move.l %d0,-324(%fp)
	sub.l -316(%fp),%d1
	clr.l -152(%a0)
	move.l %d1,-320(%fp)
	jra .L205
.L68:
	move.l -340(%fp),%a3
	sub.l %d1,%a3
	add.l %d0,%a3
	jra .L64
.L70:
	move.w #64,%a0
	moveq #15,%d7
	and.l %d7,%d2
	sub.l %d1,%a0
	mvz.w %a0,%d1
	lsl.l #4,%d1
	addq.l #1,%d2
	add.l #63,%d1
	lsr.l #6,%d1
	cmp.l %d1,%d2
	jcc .L72
	move.l %d2,%d1
.L72:
	add.l #16,%d1
	jra .L69
.L142:
	clr.l %d1
	jra .L69
.L74:
	move.l %d3,%d5
	moveq #12,%d1
	lsl.l %d1,%d5
	eor.l #44257,%d5
	jra .L75
.L55:
	move.l -332(%fp),%d2
	sub.l -316(%fp),%d2
	move.l %d2,-320(%fp)
	tst.b -230(%fp)
	jne .L62
	jra .L57
.L149:
	move.l %d0,-360(%fp)
	move.l %a4,%d5
	jra .L124
.L143:
	mov3q.l #2,-284(%fp)
	jra .L86
.L92:
	lea (%a4,%d5.l),%a5
	jra .L93
.L101:
	add.l -312(%fp),%d2
	jra .L102
.L84:
	tst.l -192(%fp)
	jne .L105
	pea -192(%fp)
	move.l %d5,-(%sp)
	move.l -328(%fp),-(%sp)
	jsr og_locate
	lea (12,%sp),%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L106
	move.l -360(%fp),%d0
	addq.l #1,%d0
	cmp.l -360(%fp),%d6
	jhi .L107
	move.l -360(%fp),%d7
	move.l %d0,%d6
	move.l -252(%fp),%a0
	lsl.l #3,%d7
	clr.l 4(%a0,%d7.l)
	clr.l (%a0,%d7.l)
.L107:
	move.l -264(%fp),%d1
	add.l %d1,-272(%fp)
	tst.w -306(%fp)
	jeq .L108
	tst.l %d5
	jeq .L144
	move.l %d5,%a4
	subq.l #1,%a4
.L109:
	cmp.l -296(%fp),%d0
	jcs .L149
	move.l %d2,(%a3)
	move.l -192(%fp),4(%a3)
.L82:
	move.l -224(%fp),%d0
	add.l %d4,%d0
	cmp.l -240(%fp),%d0
	jne .L125
	clr.l 8(%a2)
.L125:
	move.l %d0,4(%a2)
	move.l -264(%fp),%d0
	muls.l %d4,%d0
	add.l -220(%fp),%d0
	move.l %d0,12(%a2)
	tst.w -306(%fp)
	jeq .L126
	cmp.l -340(%fp),%d4
	jcs .L127
	move.l -340(%fp),%d5
	move.l %d4,%d0
	remu.l %d5,%d7:%d0
	move.l %d7,%d4
.L127:
	cmp.l -280(%fp),%d4
	jhi .L128
	move.l -280(%fp),%d0
.L208:
	sub.l %d4,%d0
.L129:
	move.l %d0,(%a2)
.L79:
	lea (32,%a2),%a2
	addq.l #8,%a3
	cmp.l -212(%fp),%a3
	jne .L130
	move.l -316(%fp),%d0
	add.l %d6,%d0
	lsl.l #3,%d0
	move.l -336(%fp),%a0
	add.l %d0,%a0
.L131:
	cmp.l -320(%fp),%d6
	jcs .L132
	move.l -320(%fp),%d4
	add.l %d4,-316(%fp)
	move.l -316(%fp),%d5
	cmp.l -332(%fp),%d5
	jcs .L133
	move.l -304(%fp),%d6
	lsr.l #8,%d6
	jne .L134
	move.l -336(%fp),%a0
	clr.l %d1
	lea (-64,%fp),%a1
	addq.l #4,%a0
.L137:
	move.l -304(%fp),%d7
	lsr.l #8,%d7
	jeq .L135
	move.l -288(%fp),%a2
	move.l #-65536,%d0
	and.l %d0,(%a2)
	and.l %d0,(%a0)
.L136:
	addq.l #1,%d1
	addq.l #4,%a1
	addq.l #8,-288(%fp)
	addq.l #8,%a0
	cmp.l -332(%fp),%d1
	jne .L137
.L138:
	move.l -332(%fp),%d1
	add.l %d1,-300(%fp)
	move.l -300(%fp),%d2
	cmp.l -260(%fp),%d2
	jcs .L140
	move.l -352(%fp),%a0
	move.w -302(%fp),112(%a0)
	move.l -324(%fp),108(%a0)
	tst.l -256(%fp)
	jeq .L24
	movem.l -400(%fp),#15612
	move.l -260(%fp),%d1
	move.l %a0,8(%fp)
	move.l -228(%fp),16(%fp)
	sub.l -268(%fp),%d1
	move.l -340(%fp),12(%fp)
	move.l %d1,20(%fp)
	unlk %fp
	jra og_scan_advance
.L108:
	move.l %d5,%a4
	addq.l #1,%a4
	cmp.l -276(%fp),%a4
	jne .L109
	sub.l %a4,%a4
	jra .L109
.L106:
	tst.w -306(%fp)
	jeq .L105
	mvz.w #6144,%d0
	move.l -312(%fp),%d3
	divu.l %d3,%d0
	move.l %d5,%d3
	remu.l %d0,%d1:%d3
	addq.l #1,%d1
	move.l %d1,-192(%fp)
.L105:
	move.l -296(%fp),%d3
	move.l -192(%fp),%d0
	sub.l -360(%fp),%d3
	cmp.l %d3,%d0
	jcc .L112
	move.l %d0,%d3
.L112:
	tst.w -306(%fp)
	jeq .L113
	move.l -312(%fp),%d7
	neg.l %d7
	move.l %d7,%a5
	lea og_mix_span_reverse,%a0
.L114:
	sub.l %d3,%d0
	move.l %d0,-192(%fp)
	move.l %a5,%d0
	move.l %d2,%d1
	muls.l %d3,%d0
	move.b -241(%fp),-66(%fp)
	add.l %d0,%d2
	jra .L104
.L113:
	move.l -328(%fp),%a0
	tst.b 15(%a0)
	jeq .L147
	move.l %a5,%d1
	add.l #-129,%d1
	cmp.l %d3,%d1
	jcc .L147
	move.l %a5,%d3
	add.l #-128,%d3
.L147:
	move.l -312(%fp),%a5
	lea og_mix_span,%a0
	jra .L114
.L116:
	move.l -276(%fp),%a4
	add.l %d5,%a4
	jra .L207
.L115:
	move.l %d3,%a4
	add.l %d5,%a4
	cmp.l -276(%fp),%a4
	jne .L117
	sub.l %a4,%a4
	jra .L117
.L119:
	cmp.l -356(%fp),%d6
	jcc .L121
	move.l %d6,%d5
	move.l %d6,%d7
	sub.l %d0,%d5
	jra .L120
.L144:
	clr.l %d2
	jra .L109
.L128:
	move.l -340(%fp),%d0
	add.l -280(%fp),%d0
	jra .L208
.L126:
	move.l -280(%fp),%d0
	add.l %d4,%d0
	move.l %d0,%d1
	sub.l -340(%fp),%d1
	cmp.l %d1,%d4
	jls .L129
	move.l -340(%fp),%d2
	move.l %d0,%d1
	remu.l %d2,%d3:%d1
	move.l %d3,%d0
	jra .L129
.L132:
	clr.l 4(%a0)
	clr.l (%a0)
	addq.l #1,%d6
	addq.l #8,%a0
	jra .L131
.L135:
	move.l -288(%fp),%a5
	mvs.w (%a1),%d2
	addq.l #4,-304(%fp)
	mvs.w (%a5),%d0
	move.l -304(%fp),%d3
	sub.l %d2,%d0
	muls.l %d3,%d0
	asr.l #8,%d0
	add.l %d2,%d0
	swap %d0
	clr.w %d0
	mvs.w 2(%a1),%d2
	move.l %d0,(%a5)
	mvs.w (%a0),%d0
	sub.l %d2,%d0
	muls.l %d3,%d0
	asr.l #8,%d0
	add.l %d2,%d0
	swap %d0
	clr.w %d0
	move.l %d0,(%a0)
	jra .L136
.L134:
	move.l -332(%fp),%d0
	lsl.l #3,%d0
	add.l -336(%fp),%d0
.L139:
	move.l -336(%fp),%a0
	move.l #-65536,%d4
	and.l %d4,(%a0)
	addq.l #8,%a0
	and.l %d4,-4(%a0)
	move.l %a0,-336(%fp)
	cmp.l %d0,%a0
	jne .L139
	jra .L138
.L24:
	movem.l -400(%fp),#15612
	unlk %fp
	rts
	.size	og_engine, .-og_engine
	.globl	og_ui_source
	.text
	.align	4
	.type	og_ui_source, @object
	.size	og_ui_source, 24
og_ui_source:
	.zero	24
	.globl	og_peak_heights
	.type	og_peak_heights, @object
	.size	og_peak_heights, 54
og_peak_heights:
	.zero	54
	.globl	og_owner
	.align	4
	.type	og_owner, @object
	.size	og_owner, 4
og_owner:
	.long	8
	.globl	og_state
	.align	4
	.type	og_state, @object
	.size	og_state, 128
og_state:
	.zero	128
	.text
	.align	2
	.type	og_lengths_low, @object
	.size	og_lengths_low, 128
og_lengths_low:
	.word	441
	.word	480
	.word	522
	.word	568
	.word	617
	.word	672
	.word	730
	.word	795
	.word	864
	.word	940
	.word	1023
	.word	1112
	.word	1210
	.word	1316
	.word	1431
	.word	1557
	.word	1694
	.word	1842
	.word	2004
	.word	2180
	.word	2371
	.word	2579
	.word	2805
	.word	3051
	.word	3319
	.word	3610
	.word	3927
	.word	4272
	.word	4646
	.word	5054
	.word	5498
	.word	5980
	.word	6505
	.word	7075
	.word	7696
	.word	8371
	.word	9106
	.word	9905
	.word	10774
	.word	11719
	.word	12747
	.word	13865
	.word	15082
	.word	16405
	.word	17845
	.word	19410
	.word	21113
	.word	22966
	.word	24981
	.word	27172
	.word	29556
	.word	32150
	.word	-30566
	.word	-27497
	.word	-24160
	.word	-20530
	.word	-16581
	.word	-12286
	.word	-7614
	.word	-2532
	.word	2996
	.word	9009
	.word	15550
	.word	22664
	.ident	"GCC: (GNU) 16.2.0"

#APP
| og_mix_span (kernel.h): one head's span, mixed into the accumulator.
| scripts/build.py appends this file to the grain unit; host builds run the
| C twin in pitch.c, and the QEMU profiler's kernel-twin rows hold the two
| equal bit for bit (scripts/coldfire_profile.py).
|
| A span crosses the window's 1/128 segments; the code at .Lspan_seg splits
| it there, once a segment: the mirrored phase p (the phase below `half`,
| else 2^31 minus it), the segment's table entry `left` and the next one
| minus it, `delta` (0 at the release's top), and its frames, k =
| ceil((next boundary - p) / step) rising, (p mod 2^24) / step + 1 falling,
| 1 at the switch itself, where the window is the peak. Then the frame loop for the span's format, PAN scaling and
| add/store runs those k frames and returns there.
|
| Each frame: env = left + ((delta * (uint16)(p >> 8)) >> 16), the PCM (the
| upper two bytes of a 24-bit sample), 0.9.6's in-place PAN scaling
| (pcm * gain) >> 8 when a gain is not 256, then pcm * env added to (or, on
| `first`, stored in) two accumulator words. env is at most 21,845 and a
| PAN-scaled sample an int16, so every product is one muls.w; env is formed
| as (delta * u + (left << 16)) >> 16, which is exact because |delta * u|
| stays below 2^29 (the steepest SHPE row) and the sum below 2^31.
|
| One straight-line loop per format, PAN scaling and add/store, generated by
| the macros below (no unrolling: a loop is one frame), chosen once a span.
| The loops read the sample arena with as few accesses as the layout
| allows: PCM16 stereo one longword a frame, PCM16 mono one word, PCM24
| stereo one word (the left sample's upper bytes) and one longword (the
| right's) a frame. PCM24 stereo frames are 6 bytes in 6,144-byte pages, so
| they start at even addresses and that longword is word-aligned; at a frame
| on 0 mod 4 it is not longword-aligned, which ColdFire allows and splits.
| PCM24 mono frames are 3 bytes and start at odd addresses half the time, so
| their samples stay two byte reads.
|
| og_mix_span_reverse (REV) mixes the same span reading its frames
| downwards, from the first frame: the loops below with `dir` 1, which read
| by predecrement (PCM24 mono: the frame, then three bytes down), so a frame
| costs what it costs forwards. PCM24 stereo reads the right sample's
| longword first, then the left's word, and adds left then right as
| forwards.
|
| Registers in the loop: a0 the PCM, a1 the accumulator, a2 the segment's
| end in it, a3 the step (negative falling), a4 left << 16, a5 the span, a6
| the loop; d0 env, d1/d3 samples, d2 the phase p, d4 delta, d5 the next
| segment's phase, d6 gain_l, d7 gain_r. 44(sp) holds the span's end.
| d2-d7/a2-a6 are saved and restored. Only addressing forms make
| image-check admits: no scale-8, word-index or memory-indirect operands. No
| EMAC.

| The envelope of p in the low word of d0, then p += step.
        .macro ENV
        move.l %d2,%d0
        lsr.l #8,%d0
        mulu.w %d4,%d0
        add.l %a4,%d0
        swap %d0
        add.l %a3,%d2
        .endm

| One channel of one frame: the sample in the low word of \reg.
        .macro PUT reg, gain, scaled, op
        .if \scaled
        muls.w \gain,\reg
        asr.l #8,\reg
        .endif
        muls.w %d0,\reg
        \op\().l \reg,(%a1)+
        .endm

| One frame a pass for format \fmt (kernel.h; the pairs run as 3), upwards
| or, with \dir 1, downwards: a0 first moves past the first frame for the
| predecrementing reads. Chosen once a span: a6 takes the loop, then the
| first segment; each segment's frames end at a2.
        .macro LOOP fmt, scaled, op, dir=0
        .if \dir && \fmt == 1
        addq.l #6,%a0
        .endif
        .if \dir && \fmt == 2
        addq.l #2,%a0
        .endif
        .if \dir && \fmt == 3
        addq.l #4,%a0
        .endif
        lea 1f(%pc),%a6
        bra.w .Lspan_seg
1:      ENV
        .if \fmt == 0
        .if \dir
        move.b (%a0),%d1
        lsl.l #8,%d1
        move.b 1(%a0),%d1
        subq.l #3,%a0
        .else
        move.b (%a0)+,%d1
        lsl.l #8,%d1
        move.b (%a0)+,%d1
        addq.l #1,%a0
        .endif
        .endif
        .if \fmt == 1
        .if \dir
        move.l -(%a0),%d3
        lsr.l #8,%d3
        move.w -(%a0),%d1
        PUT %d1,%d6,\scaled,\op
        PUT %d3,%d7,\scaled,\op
        .else
        move.w (%a0)+,%d1
        PUT %d1,%d6,\scaled,\op
        move.l (%a0)+,%d1
        lsr.l #8,%d1
        PUT %d1,%d7,\scaled,\op
        .endif
        .endif
        .if \fmt == 2
        .if \dir
        move.w -(%a0),%d1
        .else
        move.w (%a0)+,%d1
        .endif
        .endif
        .if \fmt == 3
        .if \dir
        move.l -(%a0),%d1
        .else
        move.l (%a0)+,%d1
        .endif
        move.l %d1,%d3
        swap %d1
        PUT %d1,%d6,\scaled,\op
        PUT %d3,%d7,\scaled,\op
        .endif
        .if (\fmt & 1) == 0
        .if \scaled
        move.l %d1,%d3
        PUT %d1,%d6,1,\op
        PUT %d3,%d7,1,\op
        .else
        muls.w %d0,%d1
        \op\().l %d1,(%a1)+
        \op\().l %d1,(%a1)+
        .endif
        .endif
        cmpa.l %a2,%a1
        bne.s 1b
        bra.w .Lspan_next
        .endm

| The four formats for one PAN scaling and add/store; the format is in d0.
        .macro BANK scaled, op, dir=0
        subq.l #2,%d0
        bcs.w .Lpcm24\@
        beq.w .Lmono16\@
        LOOP 3,\scaled,\op,\dir
.Lmono16\@:
        LOOP 2,\scaled,\op,\dir
.Lpcm24\@:
        addq.l #1,%d0
        beq.w .Lstereo24\@
        LOOP 0,\scaled,\op,\dir
.Lstereo24\@:
        LOOP 1,\scaled,\op,\dir
        .endm

| The span into registers (above), its end on the stack; the format is
| left in d0.
        .macro PROLOGUE
        lea -48(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        movea.l 52(%sp),%a5
        movea.l (%a5),%a0
        movea.l 4(%a5),%a1
        move.l 8(%a5),%d5
        mvz.w 32(%a5),%d0
        lsl.l #3,%d0
        lea (%a1,%d0.l),%a2
        move.l %a2,44(%sp)
        move.l 28(%a5),%d7
        move.l %d7,%d6
        swap %d6
        mvz.b 34(%a5),%d0
        .endm

| The loops for one direction: store or add, PAN scaled or not.
        .macro ENTRY dir
        tst.b 35(%a5)
        bne.w .Lstore\@
        cmpi.l #0x01000100,%d7
        beq.w .Ladd\@
        BANK 1,add,\dir
.Ladd\@:
        BANK 0,add,\dir
.Lstore\@:
        cmpi.l #0x01000100,%d7
        beq.w .Lmove\@
        BANK 1,move,\dir
.Lmove\@:
        BANK 0,move,\dir
        .endm

        .text
        .even
        .global og_mix_span
og_mix_span:
        PROLOGUE
        ENTRY 0

        .even
        .global og_mix_span_reverse
og_mix_span_reverse:
        PROLOGUE
        ENTRY 1

| A segment from the phase in d5: p, the table entries, its frames, then
| the loop in a6. At exactly `half` the window is the peak for one frame.
.Lspan_seg:
        move.l 12(%a5),%d1              | step
        cmp.l 24(%a5),%d5               | half
        bcc.s .Lspan_falling
        move.l %d5,%d2                  | rising: p = phase
        movea.l %d1,%a3
        move.l #0x00ffffff,%d0
        and.l %d2,%d0
        neg.l %d0
        add.l %d1,%d0
        addi.l #0x00ffffff,%d0
        divu.l %d1,%d0                  | k = ceil((2^24 - p mod 2^24) / step)
        movea.l 16(%a5),%a4             | the attack half
        move.l %d2,%d3
        moveq #23,%d4
        lsr.l %d4,%d3
        bclr #0,%d3                     | 2i
.Lspan_entry:
        adda.l %d3,%a4
        mvz.w (%a4)+,%d3                | left = t[i]
        mvz.w (%a4),%d4
        sub.l %d3,%d4                   | delta = t[i+1] - t[i]
.Lspan_go:
        move.l %d0,%d1
        lsl.l #3,%d1
        lea (%a1,%d1.l),%a2             | the segment's end
        cmpa.l 44(%sp),%a2
        bls.s 1f
        movea.l 44(%sp),%a2             | the span's last segment
1:      mulu.l 12(%a5),%d0
        add.l %d0,%d5                   | the next segment's phase
        swap %d3
        movea.l %d3,%a4                 | left << 16
        jmp (%a6)
.Lspan_falling:
        beq.s .Lspan_top
        move.l #0x80000000,%d2
        sub.l %d5,%d2                   | p = 2^31 - phase
        move.l %d1,%d0
        neg.l %d0
        movea.l %d0,%a3
        move.l #0x00ffffff,%d0
        and.l %d2,%d0
        divu.l %d1,%d0
        addq.l #1,%d0                   | k = (p mod 2^24) / step + 1
        movea.l 20(%a5),%a4             | the release half
        move.l %d2,%d3
        moveq #23,%d4
        lsr.l %d4,%d3
        bclr #0,%d3                     | 2i
        bra.s .Lspan_entry
.Lspan_top:
        move.l %d5,%d3
        moveq #23,%d4
        lsr.l %d4,%d3                   | 2 * (half >> 24): half is a whole segment
        movea.l 16(%a5),%a4
        mvz.w (%a4,%d3.l),%d3           | left = attack[half >> 24], the peak
        moveq #0,%d4                    | delta 0
        moveq #1,%d0                    | one frame
        movea.l %d1,%a3
        move.l %d5,%d2                  | p: any, delta is 0
        bra.s .Lspan_go
.Lspan_next:
        cmpa.l 44(%sp),%a1
        bne.w .Lspan_seg
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea 48(%sp),%sp
        rts
