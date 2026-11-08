#NO_APP
	.file	"vector.c"
	.text
	.align	2
	.type	generator_page, @function
generator_page:
	lea (-32,%sp),%sp
	movem.l #15420,(%sp)
	tst.l src_page_ready
	jeq .L2
	move.l 36(%sp),%d0
	cmp.l src_page_source.l,%d0
	jeq .L3
.L2:
	lea src_page,%a0
	move.l 36(%sp),%a1
	sub.l %a0,%a1
.L4:
	move.b (%a1,%a0.l),%d0
	move.b %d0,(%a0)+
	cmp.l #src_page+402,%a0
	jne .L4
	lea vector_control_names,%a5
	clr.l %d2
	lea src_page+202,%a1
	lea (formats.2),%a4
	lea src_page+22,%a2
	move.l #src_page+28,%d1
.L11:
	move.l (%a5)+,%a3
	sub.l %a0,%a0
.L5:
	move.b (%a3,%a0.l),%d0
	jeq .L6
	move.b %d0,(%a2,%a0.l)
	addq.l #1,%a0
	mov3q.l #5,%d3
	cmp.l %a0,%d3
	jne .L5
.L6:
	add.l %a2,%a0
.L8:
	clr.b (%a0)+
	cmp.l %a0,%d1
	jne .L8
	move.l (%a4)+,%d0
	move.l %d0,%d3
	clr.w %d3
	swap %d3
	moveq #24,%d4
	move.l %d0,%d5
	lsr.l %d4,%d5
	move.l %d0,%d4
	lsr.l #8,%d4
	move.b %d0,3(%a1)
	mov3q.l #5,%d0
	move.b %d5,(%a1)
	move.b %d4,2(%a1)
	move.b %d3,1(%a1)
	cmp.l %d2,%d0
	jcs .L12
	move.l #generator_widget,%d0
	moveq #24,%d4
	move.l %d0,%d3
	move.l %d0,%d5
	clr.w %d3
	swap %d3
	lsr.l %d4,%d5
	move.l %d0,%d4
	lsr.l #8,%d4
	move.b %d0,51(%a1)
	addq.l #4,%a1
	move.b %d5,44(%a1)
	move.b %d4,46(%a1)
	addq.l #1,%d2
	addq.l #6,%a2
	addq.l #6,%d1
	moveq #12,%d0
	move.b %d3,45(%a1)
	cmp.l %d2,%d0
	jne .L11
.L22:
	mvz.w #21845,%d3
	move.l 36(%sp),%d0
	move.l #1431655765,%d4
	move.l %d4,src_page+398
	mov3q.l #1,src_page_ready
	move.l %d3,src_page+394
	move.l %d0,src_page_source
.L3:
	move.l #src_page,%d0
	movem.l (%sp),#15420
	lea (32,%sp),%sp
	rts
.L12:
	move.l #secondary_widget,%d0
	moveq #24,%d4
	move.l %d0,%d3
	move.l %d0,%d5
	clr.w %d3
	swap %d3
	lsr.l %d4,%d5
	move.l %d0,%d4
	lsr.l #8,%d4
	move.b %d0,51(%a1)
	addq.l #4,%a1
	move.b %d5,44(%a1)
	move.b %d4,46(%a1)
	addq.l #1,%d2
	addq.l #6,%a2
	addq.l #6,%d1
	moveq #12,%d0
	move.b %d3,45(%a1)
	cmp.l %d2,%d0
	jne .L11
	jra .L22
	.size	generator_page, .-generator_page
	.align	2
	.type	vector_generate.part.0, @function
vector_generate.part.0:
	lea (-968,%sp),%sp
	moveq #15,%d1
	movem.l #31996,(%sp)
	move.l 976(%sp),%a0
	mvz.b (%a0),%d0
	move.l %d0,62(%sp)
	cmp.l %d0,%d1
	jcc .L24
	moveq #15,%d2
	move.l %d2,62(%sp)
.L24:
	moveq #16,%d0
	move.l 976(%sp),%a0
	mvz.b 1(%a0),%d3
	move.l %d3,58(%sp)
	cmp.l %d3,%d0
	jcc .L25
	moveq #16,%d1
	move.l %d1,58(%sp)
.L25:
	moveq #11,%d0
	move.l 976(%sp),%a0
	mvz.b 2(%a0),%d2
	move.l %d2,74(%sp)
	cmp.l %d2,%d0
	jcc .L26
	moveq #11,%d1
	move.l %d1,74(%sp)
.L26:
	mov3q.l #4,%d0
	move.l 976(%sp),%a0
	mvz.b 3(%a0),%d2
	move.l %d2,66(%sp)
	cmp.l %d2,%d0
	jcc .L27
	mov3q.l #4,66(%sp)
.L27:
	move.l 976(%sp),%a0
	moveq #126,%d0
	mvz.b 4(%a0),%d1
	move.l %d1,70(%sp)
	cmp.l %d1,%d0
	jcc .L28
	moveq #126,%d1
	move.l %d1,70(%sp)
.L28:
	moveq #127,%d0
	move.l 976(%sp),%a0
	mvz.b 5(%a0),%d2
	move.l %d2,78(%sp)
	cmp.l %d2,%d0
	jcc .L29
	moveq #127,%d1
	move.l %d1,78(%sp)
.L29:
	moveq #12,%d0
	move.l 976(%sp),%a0
	mvz.b 6(%a0),%d2
	move.l %d2,50(%sp)
	cmp.l %d2,%d0
	jcc .L30
	moveq #12,%d1
	move.l %d1,50(%sp)
.L30:
	moveq #24,%d1
	move.l 976(%sp),%a0
	move.b 8(%a0),%d0
	mvz.b 7(%a0),%d2
	move.l %d2,54(%sp)
	move.b %d0,95(%sp)
	cmp.l %d2,%d1
	jcc .L31
	moveq #24,%d2
	move.l %d2,54(%sp)
.L31:
	move.l 976(%sp),%a0
	move.l 54(%sp),%a1
	move.l 980(%sp),%d4
	move.b 9(%a0),%d0
	lea (-12,%a1),%a1
	move.l %a1,82(%sp)
	tst.b %d0
	jeq .L32
	moveq #64,%d1
	cmp.l %d4,%d1
	jcs .L105
	mvz.b %d0,%d0
	cmp.l %d4,%d0
	jcs .L106
.L32:
	move.l 972(%sp),%a0
	lea (712,%sp),%a3
	lea (968,%sp),%a6
	move.b 983(%sp),256(%a0)
	move.l %a0,96(%sp)
	move.l %a3,%a1
.L35:
	st %d0
	clr.b (%a0)
	move.b %d0,3(%a0)
	move.b %d0,2(%a0)
	move.b %d0,1(%a0)
	move.l (%a0)+,(%a1)+
	cmp.l %a1,%a6
	jne .L35
	move.l 62(%sp),%d5
	moveq #11,%d1
	move.l #-1640531527,%d2
	clr.l %d6
	move.l #2146121005,%d7
	lsl.l %d1,%d5
	lea (200,%sp),%a2
	lea (456,%sp),%a4
	move.l %a2,%d3
	move.l %d5,%a6
	move.l 988(%sp),%d5
	move.l %d5,%d1
	eor.l %d2,%d1
	move.l %d1,%d0
	clr.w %d0
	swap %d0
	eor.l %d1,%d0
	muls.l %d7,%d0
	moveq #15,%d7
	move.l %d0,%d1
	lsr.l %d7,%d1
	eor.l %d1,%d0
	move.l #-2073254261,%d1
	muls.l %d1,%d0
	move.l %d0,%d7
	clr.w %d7
	swap %d7
	eor.l %d0,%d7
	mov3q.l #3,%d0
	and.l %d6,%d0
	mvz.w %d7,%d7
	tst.l %d0
	jeq .L36
.L108:
	add.l %a6,%d7
	move.l %d7,(%a4)
.L37:
	move.l %d3,%a0
	move.l %d6,%d0
.L39:
	move.l -4(%a0),%d1
	lea (968,%sp),%a5
	lea (%a5,%d1.l*4),%a1
	cmp.l -512(%a1),%d7
	jcc .L38
	move.l %d1,(%a0)
	subq.l #1,%d0
	subq.l #4,%a0
	tst.l %d0
	jne .L39
.L38:
	lea (%sp,%d0.l*4),%a0
	move.l %d6,%a5
	add.l #-1640531527,%d2
	addq.l #1,%a5
	addq.l #4,%a4
	addq.l #4,%d3
	move.l %d6,200(%a0)
	cmp.l %d4,%a5
	jeq .L107
.L69:
	move.l %d5,%d1
	move.l #2146121005,%d7
	eor.l %d2,%d1
	move.l %a5,%d6
	move.l %d1,%d0
	clr.w %d0
	swap %d0
	eor.l %d1,%d0
	muls.l %d7,%d0
	moveq #15,%d7
	move.l %d0,%d1
	lsr.l %d7,%d1
	eor.l %d1,%d0
	move.l #-2073254261,%d1
	muls.l %d1,%d0
	move.l %d0,%d7
	clr.w %d7
	swap %d7
	eor.l %d0,%d7
	mov3q.l #3,%d0
	and.l %d6,%d0
	mvz.w %d7,%d7
	tst.l %d0
	jne .L108
.L36:
	move.l %d7,(%a4)
	tst.l %d6
	jne .L37
	clr.l %d0
	lea (%sp,%d0.l*4),%a0
	move.l %d6,%a5
	add.l #-1640531527,%d2
	addq.l #1,%a5
	addq.l #4,%a4
	addq.l #4,%d3
	move.l %d6,200(%a0)
	cmp.l %d4,%a5
	jne .L69
.L107:
	move.w %a5,%d0
	mulu.w 60(%sp),%d0
	addq.l #8,%d0
	lsr.l #4,%d0
	jeq .L42
	mvz.w %d0,%d0
	lea (%a2,%d0.l*4),%a1
.L43:
	move.l (%a2)+,%d0
	lea (%sp,%d0.l*4),%a0
	moveq #1,%d0
	move.b %d0,712(%a0)
	cmp.l %a1,%a2
	jne .L43
.L42:
	moveq #12,%d1
	moveq #12,%d3
	move.l 74(%sp),%d0
	addq.l #7,%d0
	remu.l %d1,%d2:%d0
	mvz.w #254,%d1
	sub.l 78(%sp),%d1
	mvz.w #254,%d7
	move.l 82(%sp),%a1
	moveq #12,%d4
	moveq #12,%d0
	sub.l 74(%sp),%d0
	move.l %d2,90(%sp)
	mulu.w 986(%sp),%d1
	move.l 82(%sp),%a4
	add.l %d2,%d0
	remu.l %d3,%d2:%d0
	divu.l %d7,%d1
	move.w #24,%a0
	sub.l 50(%sp),%a1
	sub.l 74(%sp),%a0
	sub.l 54(%sp),%d4
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	move.b %d1,89(%sp)
	add.l 50(%sp),%a4
	clr.l 46(%sp)
	move.l %a1,%a6
	move.l %a5,82(%sp)
	move.l %d6,58(%sp)
	move.l %d0,78(%sp)
.L62:
	move.l 46(%sp),%a5
	addq.l #1,46(%sp)
	tst.b (%a3)
	jeq .L44
	move.l #-2048144789,%d1
	clr.l %d3
	move.l 46(%sp),%d6
	clr.l %d5
	lea scales,%a1
	moveq #-12,%d0
	move.l 988(%sp),%d7
	muls.l %d1,%d6
	move.l 66(%sp),%a2
	move.l %a3,54(%sp)
	mvz.w (%a1,%a2.l*2),%d2
	move.w #100,%a1
	eor.l %d7,%d6
	moveq #15,%d7
	eor.l #-1255572915,%d6
	move.l %d6,%d1
	clr.w %d1
	swap %d1
	eor.l %d6,%d1
	move.l #2146121005,%d6
	muls.l %d6,%d1
	move.l %d1,%d6
	lsr.l %d7,%d6
	eor.l %d6,%d1
	move.l #-2073254261,%d6
	muls.l %d6,%d1
	move.l %d1,%d6
	clr.w %d6
	swap %d6
	eor.l %d1,%d6
	move.l %d6,50(%sp)
.L53:
	move.l %d0,%d1
	moveq #12,%d6
	add.l %a0,%d1
	remu.l %d6,%d7:%d1
	btst %d7,%d2
	jeq .L45
.L110:
	cmp.l %a6,%d0
	jge .L46
	move.l %d4,%d1
	add.l %d0,%d1
	tst.l %d1
	jlt .L109
	cmp.l %d1,%a1
	jle .L48
.L113:
	move.l %d0,%d3
	addq.l #1,%d0
	move.l %d1,%a1
	moveq #12,%d6
	move.l %d0,%d1
	add.l %a0,%d1
	remu.l %d6,%d7:%d1
	btst %d7,%d2
	jne .L110
.L45:
	addq.l #1,%d0
	moveq #13,%d1
	cmp.l %d0,%d1
	jne .L53
.L115:
	move.l 50(%sp),%d6
	move.l 54(%sp),%a3
	tst.l %d5
	jeq .L54
	move.l %d6,%d0
	lsr.l #8,%d0
	remu.l %d5,%d1:%d0
	lea (%sp,%d1.l*4),%a1
	move.l 100(%a1),%d3
	add.l #-12,%d3
.L54:
	moveq #15,%d0
	and.l %d6,%d0
	cmp.l 62(%sp),%d0
	jcc .L59
	moveq #48,%d0
	and.l %d6,%d0
	tst.l %d0
	jne .L71
	and.l 78(%sp),%d2
	tst.l %d2
	jne .L111
.L71:
	move.l 74(%sp),%d0
.L56:
	btst #6,%d6
	jeq .L57
	add.l #-12,%d0
.L57:
	cmp.l %a6,%d0
	jlt .L59
	cmp.l %d0,%a4
	jlt .L59
	move.l %d0,%d3
.L59:
	moveq #24,%d0
	mov3q.l #3,%d2
	move.l %d6,%d1
	lsr.l %d0,%d1
	muls.w #5,%d3
	remu.l %d2,%d0:%d1
	add.l #64,%d3
	move.b %d3,1(%a3)
	addq.l #2,%d0
	mulu.w 72(%sp),%d0
	lsr.l #2,%d0
	move.b %d0,2(%a3)
	move.l %a5,%d0
	and.l %d2,%d0
	tst.l %d0
	jeq .L60
	and.l #3145728,%d6
	tst.l %d6
	jeq .L60
	move.b 89(%sp),%d0
	move.b %d0,3(%a3)
.L44:
	addq.l #4,%a3
	cmp.l 58(%sp),%a5
	jne .L62
	move.l 82(%sp),%a5
	tst.l 980(%sp)
	jeq .L63
	mvz.b 95(%sp),%d0
	moveq #63,%d3
	cmp.l %d0,%d3
	jcs .L112
	move.l 980(%sp),%d6
	move.l %d6,%d1
	move.l 972(%sp),%a2
	move.l %d6,%d4
	move.l 976(%sp),%a0
	subq.l #1,%d4
	remu.l %d6,%d2:%d0
	move.b 10(%a0),%d3
	mvz.w %d6,%d0
	move.l 96(%sp),%a0
	move.l %d6,%d5
	lea (%a2,%d0.l*4),%a1
	sub.l %d2,%d1
	move.l %a5,%d2
.L66:
	move.l %d1,%d6
	addq.l #1,%d1
	remu.l %d5,%d0:%d6
	tst.b %d3
	jeq .L65
	move.l %d4,%d6
	sub.l %d0,%d6
	move.l %d6,%d0
.L65:
	remu.l %d2,%d6:%d0
	lea (968,%sp),%a3
	lea (%a3,%d6.l*4),%a2
	move.l -256(%a2),(%a0)+
	cmp.l %a0,%a1
	jne .L66
.L63:
	movem.l (%sp),#31996
	mov3q.l #1,%d0
	lea (968,%sp),%sp
	rts
.L109:
	neg.l %d1
	cmp.l %d1,%a1
	jgt .L113
.L48:
	addq.l #1,%d0
	jra .L53
.L46:
	cmp.l %a4,%d0
	jgt .L50
	lea (%sp,%d5.l*4),%a2
	move.l %d0,%a3
	addq.l #1,%d5
	lea (12,%a3),%a3
	move.l %a3,100(%a2)
.L50:
	move.l %d4,%d1
	add.l %d0,%d1
	tst.l %d1
	jlt .L114
.L51:
	cmp.l %d1,%a1
	jle .L45
	move.l %d1,%a1
	move.l %d0,%d3
	moveq #13,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L53
	jra .L115
.L114:
	neg.l %d1
	jra .L51
.L60:
	move.b 987(%sp),%d0
	move.b %d0,3(%a3)
	jra .L44
.L112:
	move.l 980(%sp),%d6
	moveq #63,%d0
	move.l 976(%sp),%a0
	move.l %d6,%d1
	move.l 972(%sp),%a2
	move.l %d6,%d4
	remu.l %d6,%d2:%d0
	move.b 10(%a0),%d3
	mvz.w %d6,%d0
	move.l 96(%sp),%a0
	subq.l #1,%d4
	move.l %d6,%d5
	sub.l %d2,%d1
	lea (%a2,%d0.l*4),%a1
	move.l %a5,%d2
	jra .L66
.L111:
	move.l 90(%sp),%d0
	jra .L56
.L106:
	move.l 972(%sp),%a0
	move.l %d0,%d4
	lea (712,%sp),%a3
	lea (968,%sp),%a6
	move.b 983(%sp),256(%a0)
	move.l %a0,96(%sp)
	move.l %a3,%a1
	jra .L35
.L105:
	mvz.b %d0,%d0
	moveq #64,%d4
	cmp.l %d4,%d0
	jcc .L32
	jra .L106
	.size	vector_generate.part.0, .-vector_generate.part.0
	.align	2
	.type	settings, @function
settings:
	lea (-44,%sp),%sp
	movem.l #19460,(%sp)
	clr.w %d2
	move.l 1187521622,%d0
	move.l #540019724,%a1
	move.l %a0,16(%sp)
	move.l %d0,%a0
	add.l #585088,%a0
	clr.b %d0
	move.b 269161679,%d1
	move.w %d2,40(%sp)
	move.l #185270273,%d2
	move.l %d2,32(%sp)
	mov3q.l #3,%d2
	move.b %d0,42(%sp)
	move.w 50(%sp),%d0
	move.l %a1,36(%sp)
	and.l %d2,%d1
	mvz.w #6322,%d2
	mulu.w #30,%d0
	muls.l %d2,%d1
	add.l %d1,%a0
	mvz.b 62(%a0,%d0.l),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L140
	lea (23,%sp),%a6
	sub.l %a1,%a1
.L125:
	move.l %a1,%d1
	add.l #489,%d1
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcc .L141
.L122:
	move.b (%a0,%d1.l),(%a6)
	addq.l #1,%a1
	moveq #9,%d1
	cmp.l %a1,%d1
	jeq .L124
	move.l %a1,%d1
	add.l #489,%d1
	addq.l #1,%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcs .L122
.L141:
	lea 63(%a1,%d0.l),%a2
	addq.l #1,%a1
	move.b (%a0,%a2.l),(%a6)+
	jra .L125
.L124:
	move.b 23(%sp),%d0
	moveq #15,%d1
	mov3q.l #4,%d2
	and.l %d0,%d1
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.w %d0,%a0
	move.b %d1,32(%sp)
	cmp.l %d0,%d2
	jcs .L142
	move.w %a0,%d0
	move.b 24(%sp),%d1
	moveq #16,%d2
	move.b %d0,35(%sp)
	moveq #31,%d0
	and.l %d1,%d0
	move.w %d0,%a0
	cmp.l %d0,%d2
	jcs .L143
.L127:
	move.w %a0,%d2
	move.b 25(%sp),%d0
	lsr.l #5,%d1
	move.b %d2,33(%sp)
	mov3q.l #1,%d2
	and.l %d2,%d1
	moveq #15,%d2
	and.l %d0,%d2
	move.b %d1,42(%sp)
	move.b %d2,%d1
	move.l %d2,%a0
	moveq #11,%d2
	cmp.l %a0,%d2
	jcs .L144
.L128:
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.b %d1,34(%sp)
	moveq #12,%d1
	move.w %d0,%a0
	cmp.l %d0,%d1
	jcs .L145
.L129:
	move.b 26(%sp),%d1
	move.w %a0,%d2
	mvz.b %d1,%d0
	move.b %d2,38(%sp)
	moveq #126,%d2
	cmp.l %d0,%d2
	jcs .L146
.L130:
	move.b 27(%sp),%d0
	move.b %d1,36(%sp)
	tst.b %d0
	jlt .L147
.L131:
	move.b 28(%sp),%d1
	move.b %d0,37(%sp)
	moveq #24,%d2
	mvz.b %d1,%d0
	cmp.l %d0,%d2
	jcs .L148
.L132:
	mvz.b 29(%sp),%d0
	move.b %d1,39(%sp)
	moveq #63,%d1
	cmp.l %d0,%d1
	jcs .L149
.L133:
	move.b 30(%sp),%d1
	lsl.l #8,%d0
	mvz.b %d1,%d2
	move.l %d2,%a0
	moveq #64,%d2
	cmp.l %a0,%d2
	jcs .L150
.L134:
	move.b %d1,%d0
	lea (32,%sp),%a3
	move.w %d0,40(%sp)
.L120:
	move.l 16(%sp),%a0
	move.l %a0,%d0
	move.l (%a3),(%a0)+
	move.l 36(%sp),(%a0)+
	move.w 40(%sp),(%a0)+
	movem.l (%sp),#19460
	move.b 42(%sp),(%a0)
	lea (44,%sp),%sp
	rts
.L150:
	moveq #64,%d1
	lea (32,%sp),%a3
	move.b %d1,%d0
	move.w %d0,40(%sp)
	jra .L120
.L149:
	move.b 30(%sp),%d1
	moveq #63,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d2
	move.l %d2,%a0
	moveq #64,%d2
	cmp.l %a0,%d2
	jcc .L134
	jra .L150
.L148:
	moveq #24,%d1
	mvz.b 29(%sp),%d0
	move.b %d1,39(%sp)
	moveq #63,%d1
	cmp.l %d0,%d1
	jcc .L133
	jra .L149
.L147:
	moveq #127,%d0
	move.b 28(%sp),%d1
	moveq #24,%d2
	move.b %d0,37(%sp)
	mvz.b %d1,%d0
	cmp.l %d0,%d2
	jcc .L132
	jra .L148
.L146:
	moveq #126,%d1
	move.b 27(%sp),%d0
	move.b %d1,36(%sp)
	tst.b %d0
	jge .L131
	jra .L147
.L145:
	move.w #12,%a0
	move.b 26(%sp),%d1
	move.w %a0,%d2
	mvz.b %d1,%d0
	move.b %d2,38(%sp)
	moveq #126,%d2
	cmp.l %d0,%d2
	jcc .L130
	jra .L146
.L144:
	moveq #11,%d1
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.w %d0,%a0
	move.b %d1,34(%sp)
	moveq #12,%d1
	cmp.l %d0,%d1
	jcc .L129
	jra .L145
.L143:
	move.w #16,%a0
	move.b 25(%sp),%d0
	lsr.l #5,%d1
	move.w %a0,%d2
	move.b %d2,33(%sp)
	mov3q.l #1,%d2
	and.l %d2,%d1
	moveq #15,%d2
	and.l %d0,%d2
	move.b %d1,42(%sp)
	move.b %d2,%d1
	move.l %d2,%a0
	moveq #11,%d2
	cmp.l %a0,%d2
	jcc .L128
	jra .L144
.L142:
	move.w #4,%a0
	move.b 24(%sp),%d1
	moveq #16,%d2
	move.w %a0,%d0
	move.b %d0,35(%sp)
	moveq #31,%d0
	and.l %d1,%d0
	move.w %d0,%a0
	cmp.l %d0,%d2
	jcc .L127
	jra .L143
.L140:
	lea (32,%sp),%a3
	sub.l %a1,%a1
	move.l %a3,%a2
.L121:
	move.l %a1,%d1
	add.l #489,%d1
	lea 63(%a1,%d0.l),%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcs .L118
.L151:
	addq.l #1,%a1
	move.b (%a0,%a6.l),(%a2)+
	move.l %a1,%d1
	add.l #489,%d1
	lea 63(%a1,%d0.l),%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcc .L151
.L118:
	move.b (%a0,%d1.l),(%a2)
	addq.l #1,%a1
	mov3q.l #6,%d1
	cmp.l %a1,%d1
	jeq .L120
	addq.l #1,%a2
	jra .L121
	.size	settings, .-settings
	.align	2
	.type	any_vector, @function
any_vector:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L157
	move.w #34,%a1
	moveq #60,%d1
.L153:
	mov3q.l #3,%d2
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d0
	and.l %d2,%d0
	mvz.w #6322,%d2
	muls.l %d2,%d0
	mov3q.l #1,%d2
	add.l %d0,%a0
	mvz.b (%a0,%a1.l),%d0
	add.l %d1,%a0
	addq.l #1,%a1
	add.l #30,%d1
	cmp.l %d0,%d2
	jcs .L155
	mvz.b (%a0),%d0
	moveq #83,%d2
	cmp.l %d0,%d2
	jeq .L168
.L155:
	cmp.l #300,%d1
	jne .L153
.L157:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L168:
	mvz.b 1(%a0),%d0
	moveq #50,%d2
	cmp.l %d0,%d2
	jne .L155
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L156
	mvz.b 2(%a0),%d0
	subq.l #2,%d0
	tst.l %d0
	jne .L155
.L156:
	move.l (%sp)+,%d2
	mov3q.l #1,%d0
	rts
	.size	any_vector, .-any_vector
	.align	2
	.type	draw_generator_widget.part.0, @function
draw_generator_widget.part.0:
	lea (-12,%sp),%sp
	move.l %a6,-(%sp)
	move.l %d2,-(%sp)
	mvz.b 269161676,%d0
	move.l 36(%sp),%a6
	move.l %d0,-(%sp)
	lea (13,%sp),%a0
	jsr settings
	addq.l #4,%sp
	mov3q.l #6,%d0
	cmp.l %a6,%d0
	jeq .L177
	mov3q.l #5,%d2
	move.l %a6,%d0
	cmp.l %a6,%d2
	jcc .L172
	subq.l #1,%d0
.L172:
	mvz.b 9(%sp,%d0.l),%d0
	move.l %d0,%a0
.L171:
	move.l 48(%sp),-(%sp)
	move.l 48(%sp),-(%sp)
	moveq #-2,%d0
	and.l 48(%sp),%d0
	lea vector_control_max,%a1
	mvz.b (%a1,%a6.l),%d1
	move.l %d0,-(%sp)
	move.l %d1,%d0
	cmp.l %d1,%a0
	jcc .L173
	move.l %a0,%d0
.L173:
	mulu.w #127,%d0
	divu.l %d1,%d0
	move.l %d0,-(%sp)
	move.l 48(%sp),-(%sp)
	move.l 48(%sp),-(%sp)
	move.l 48(%sp),-(%sp)
	jsr 1074035124
	lea (28,%sp),%sp
	move.l (%sp)+,%d2
	move.l (%sp)+,%a6
	lea (12,%sp),%sp
	rts
.L177:
	move.b 269161676,%d0
	move.l 1187521622,%a1
	mov3q.l #3,%d2
	move.b 269161679,%d1
	add.l #585088,%a1
	mvz.b %d0,%d0
	and.l %d2,%d1
	mulu.w #30,%d0
	move.l %d0,%a0
	mvz.w #6322,%d0
	lea (497,%a0),%a0
	muls.l %d0,%d1
	add.l %d1,%a1
	move.b (%a1,%a0.l),%d0
	moveq #127,%d1
	and.l %d0,%d1
	move.l %d1,%a0
	jra .L171
	.size	draw_generator_widget.part.0, .-draw_generator_widget.part.0
	.align	2
	.type	secondary_widget, @function
secondary_widget:
	subq.l #8,%sp
	move.l %d2,-(%sp)
	moveq #11,%d2
	move.l 24(%sp),%d0
	move.l %d0,%d1
	move.l 16(%sp),%a0
	addq.l #6,%d1
	move.l 20(%sp),%a1
	move.l 32(%sp),4(%sp)
	move.l 36(%sp),8(%sp)
	cmp.l %d1,%d2
	jcc .L182
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L182:
	move.l 8(%sp),36(%sp)
	move.l 4(%sp),32(%sp)
	move.l %d1,28(%sp)
	move.l %d0,24(%sp)
	move.l %a1,20(%sp)
	move.l %a0,16(%sp)
	move.l (%sp)+,%d2
	addq.l #8,%sp
	jra (draw_generator_widget.part.0)
	.size	secondary_widget, .-secondary_widget
	.align	2
	.type	generator_widget, @function
generator_widget:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	moveq #11,%d2
	move.l 20(%sp),%d0
	move.l 12(%sp),%d1
	move.l 16(%sp),%a0
	move.l 28(%sp),%a1
	move.l 32(%sp),4(%sp)
	cmp.l %d0,%d2
	jcc .L187
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L187:
	move.l 4(%sp),32(%sp)
	move.l %a1,28(%sp)
	move.l %d0,24(%sp)
	move.l %d0,20(%sp)
	move.l %a0,16(%sp)
	move.l %d1,12(%sp)
	move.l (%sp)+,%d2
	addq.l #4,%sp
	jra (draw_generator_widget.part.0)
	.size	generator_widget, .-generator_widget
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"FWD"
.LC1:
	.string	"OFF"
.LC2:
	.string	"REV"
	.text
	.align	2
	.type	format_control, @function
format_control:
	lea (-28,%sp),%sp
	movem.l #16412,(%sp)
	move.l 36(%sp),%d2
	lea (17,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	addq.l #4,%sp
	mov3q.l #6,%d0
	cmp.l %d2,%d0
	jeq .L216
	mov3q.l #5,%d0
	cmp.l %d2,%d0
	jcs .L191
	mvz.b 17(%sp,%d2.l),%d0
	move.l %d2,%d1
	mov3q.l #1,%d3
	subq.l #2,%d1
	cmp.l %d1,%d3
	jcs .L190
	subq.l #2,%d2
	tst.l %d2
	jeq .L217
	mov3q.l #5,%d3
	remu.l %d3,%d1:%d0
	lea vector_scale_names,%a0
	move.l 32(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
.L197:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L197
.L188:
	movem.l (%sp),#16412
	lea (28,%sp),%sp
	rts
.L191:
	mvz.b 16(%sp,%d2.l),%d0
	moveq #11,%d4
	cmp.l %d2,%d4
	jne .L218
	tst.l %d0
	jeq .L208
	move.l 32(%sp),%a1
	lea .LC2,%a0
.L201:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jeq .L188
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L201
	jra .L188
.L216:
	move.b 269161676,%d0
	move.l 1187521622,%a1
	mov3q.l #3,%d2
	move.b 269161679,%d1
	mvz.w #6322,%d3
	add.l #585088,%a1
	moveq #127,%d4
	mvz.b %d0,%d0
	and.l %d2,%d1
	mulu.w #30,%d0
	move.l %d0,%a0
	muls.l %d3,%d1
	lea (497,%a0),%a0
	add.l %d1,%a1
	move.b (%a1,%a0.l),%d0
	and.l %d4,%d0
.L190:
	moveq #99,%d3
	cmp.l %d0,%d3
	jcc .L209
.L220:
	moveq #100,%d4
	moveq #10,%d3
	move.l %d0,%d1
	mov3q.l #2,%a6
	divu.l %d4,%d1
	move.l 32(%sp),%a0
	mov3q.l #3,%a1
	add.l #48,%d1
	move.b %d1,(%a0)+
	move.l %d0,%d1
	divu.l %d3,%d1
	move.l %d1,%d2
	remu.l %d3,%d4:%d2
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,(%a0)
	move.l 32(%sp),%a0
	add.l %a6,%a0
.L206:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.l 32(%sp),%a0
	move.b %d3,(%a0,%a1.l)
	movem.l (%sp),#16412
	lea (28,%sp),%sp
	rts
.L209:
	move.l 32(%sp),%a0
	mov3q.l #1,%a1
	clr.l %d1
	moveq #9,%d2
	cmp.l %d0,%d2
	jcc .L206
.L221:
	move.l %a1,%a6
	moveq #10,%d3
	move.l %d1,%a1
	move.l %d0,%d1
	divu.l %d3,%d1
	addq.l #2,%a1
	move.l %d1,%d2
	remu.l %d3,%d4:%d2
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,(%a0)
	move.l 32(%sp),%a0
	add.l %a6,%a0
	jra .L206
.L208:
	move.l 32(%sp),%a1
	lea .LC0,%a0
	jra .L201
.L217:
	moveq #12,%d2
	remu.l %d2,%d1:%d0
	lea (roots.1),%a0
	move.l 32(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
	jra .L197
.L218:
	moveq #10,%d4
	cmp.l %d2,%d4
	jne .L199
	tst.l %d0
	jne .L190
	move.l 32(%sp),%a1
	lea .LC1,%a0
	jra .L201
.L199:
	subq.l #8,%d2
	tst.l %d2
	jne .L190
	move.l %d0,%d1
	add.l #-12,%d1
	tst.l %d1
	jlt .L219
	move.l %d1,%d0
	moveq #99,%d3
	cmp.l %d0,%d3
	jcs .L220
	jra .L209
.L219:
	move.l 32(%sp),%a0
	moveq #12,%d2
	sub.l %d0,%d2
	move.l %d2,%d0
	mov3q.l #2,%a1
	move.b #45,(%a0)+
	mov3q.l #1,%d1
	moveq #9,%d2
	cmp.l %d0,%d2
	jcc .L206
	jra .L221
	.size	format_control, .-format_control
	.align	2
	.type	format_10, @function
format_10:
	moveq #10,%d0
	move.l %d0,8(%sp)
	jra format_control
	.size	format_10, .-format_10
	.align	2
	.type	format_8, @function
format_8:
	moveq #8,%d0
	move.l %d0,8(%sp)
	jra format_control
	.size	format_8, .-format_8
	.align	2
	.type	format_6, @function
format_6:
	mov3q.l #6,8(%sp)
	jra format_control
	.size	format_6, .-format_6
	.align	2
	.type	format_11, @function
format_11:
	mvz.b 269161676,%d0
	lea (-12,%sp),%sp
	lea (1,%sp),%a0
	move.l %d0,-(%sp)
	jsr settings
	addq.l #4,%sp
	tst.b 11(%sp)
	jeq .L231
	lea .LC2,%a0
	move.l 16(%sp),%a1
.L230:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L230
	lea (12,%sp),%sp
	rts
.L231:
	move.l 16(%sp),%a1
	lea .LC0,%a0
	jra .L230
	.size	format_11, .-format_11
	.align	2
	.type	format_3, @function
format_3:
	lea (-12,%sp),%sp
	move.l %d2,-(%sp)
	mvz.b 269161676,%d0
	lea (5,%sp),%a0
	mov3q.l #5,%d2
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 12(%sp),%d0
	addq.l #4,%sp
	lea vector_scale_names,%a0
	remu.l %d2,%d1:%d0
	move.l 20(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
.L236:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L236
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
	.size	format_3, .-format_3
	.align	2
	.type	format_2, @function
format_2:
	lea (-12,%sp),%sp
	move.l %d2,-(%sp)
	moveq #12,%d2
	mvz.b 269161676,%d0
	lea (5,%sp),%a0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 11(%sp),%d0
	addq.l #4,%sp
	lea (roots.1),%a0
	remu.l %d2,%d1:%d0
	move.l 20(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
.L241:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L241
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
	.size	format_2, .-format_2
	.align	2
	.type	format_9, @function
format_9:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 37(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L246
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L248:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L246:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L252
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L252:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L248
	.size	format_9, .-format_9
	.align	2
	.type	format_7, @function
format_7:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 35(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L254
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L256:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L254:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L260
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L260:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L256
	.size	format_7, .-format_7
	.align	2
	.type	format_5, @function
format_5:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 34(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L262
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L264:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L262:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L268
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L268:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L264
	.size	format_5, .-format_5
	.align	2
	.type	format_4, @function
format_4:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 33(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L270
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L272:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L270:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L276
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L276:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L272
	.size	format_4, .-format_4
	.align	2
	.type	format_1, @function
format_1:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 30(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L278
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L280:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L278:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L284
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L284:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L280
	.size	format_1, .-format_1
	.align	2
	.type	format_0, @function
format_0:
	lea (-36,%sp),%sp
	movem.l #16412,(%sp)
	move.l 40(%sp),%a6
	lea (25,%sp),%a0
	mvz.b 269161676,%d0
	move.l %d0,-(%sp)
	jsr settings
	mvz.b 29(%sp),%d0
	addq.l #4,%sp
	moveq #99,%d1
	cmp.l %d0,%d1
	jcc .L286
	moveq #100,%d2
	mov3q.l #2,%a0
	move.l %d0,%d1
	mov3q.l #3,%a1
	divu.l %d2,%d1
	moveq #10,%d2
	add.l %a6,%a0
	mov3q.l #1,16(%sp)
	add.l #48,%d1
	move.b %d1,(%a6)
	move.l %d0,%d1
	divu.l %d2,%d1
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
.L288:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L286:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L292
	moveq #10,%d2
	mov3q.l #1,%a1
	remu.l %d2,%d1:%d0
	clr.b %d3
	move.l %a6,%a0
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L292:
	moveq #10,%d2
	mov3q.l #1,%a0
	move.l %d0,%d1
	mov3q.l #2,%a1
	divu.l %d2,%d1
	clr.l 16(%sp)
	add.l %a6,%a0
	move.l %d1,%d4
	remu.l %d2,%d3:%d4
	move.l 16(%sp),%d4
	move.l %d3,%d1
	add.l #48,%d1
	move.b %d1,(%a6,%d4.l)
	jra .L288
	.size	format_0, .-format_0
	.align	2
	.globl	vector_next_seed
	.type	vector_next_seed, @function
vector_next_seed:
	move.l 4(%sp),%d0
	moveq #127,%d1
	addq.l #1,%d0
	and.l %d1,%d0
	rts
	.size	vector_next_seed, .-vector_next_seed
	.align	2
	.globl	vector_pack
	.type	vector_pack, @function
vector_pack:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 16(%sp),%a0
	mov3q.l #4,%d2
	move.l 12(%sp),%a1
	move.b 3(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L296
	moveq #4,%d0
.L296:
	move.b (%a0),%d1
	lsl.l #4,%d0
	moveq #15,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L297
	moveq #15,%d1
.L297:
	or.l %d1,%d0
	move.b %d0,(%a1)
	move.b 10(%a0),%d0
	jeq .L298
	moveq #1,%d0
.L298:
	move.b 1(%a0),%d1
	lsl.l #5,%d0
	moveq #16,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L299
	moveq #16,%d1
.L299:
	or.l %d1,%d0
	moveq #12,%d2
	move.b %d0,1(%a1)
	move.b 6(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L300
	moveq #12,%d0
.L300:
	move.b 2(%a0),%d1
	lsl.l #4,%d0
	moveq #11,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L301
	moveq #11,%d1
.L301:
	or.l %d1,%d0
	moveq #126,%d2
	move.b %d0,2(%a1)
	move.b 4(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L302
	moveq #126,%d0
.L302:
	move.b %d0,3(%a1)
	move.b 5(%a0),%d0
	jpl .L303
	moveq #127,%d0
.L303:
	move.b %d0,4(%a1)
	moveq #24,%d3
	move.b 7(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d3
	jcc .L304
	moveq #24,%d0
.L304:
	move.b %d0,5(%a1)
	moveq #63,%d2
	move.b 8(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L305
	moveq #63,%d0
.L305:
	move.b %d0,6(%a1)
	moveq #64,%d3
	move.b 9(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d3
	jcc .L306
	moveq #64,%d0
.L306:
	moveq #127,%d1
	and.l 20(%sp),%d1
	move.b %d0,7(%a1)
	move.b %d1,8(%a1)
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
	.size	vector_pack, .-vector_pack
	.align	2
	.type	save_settings, @function
save_settings:
	lea (-40,%sp),%sp
	movem.l #23580,(%sp)
	move.l 52(%sp),-(%sp)
	move.l 52(%sp),-(%sp)
	lea (39,%sp),%a4
	move.l %a4,-(%sp)
	jsr vector_pack
	move.w 58(%sp),%d3
	sub.l %a6,%a6
	lea (12,%sp),%sp
	mulu.w #30,%d3
.L315:
	move.b (%a4)+,%d2
	mov3q.l #2,%d0
	cmp.l %a6,%d0
	jcc .L319
	move.l #269161679,%a3
	mov3q.l #3,%d4
	move.b (%a3),%d0
	move.l 1187521622,%a1
	add.l #585088,%a1
	move.b (%a3),%d1
	lea (489,%a6),%a2
	addq.l #1,%a6
	add.l %d3,%a2
	and.l %d4,%d0
	and.l %d4,%d1
	mvz.w #6322,%d4
	muls.l %d4,%d0
	muls.l %d4,%d1
	move.l %d0,%a0
	add.l #269110990,%a0
	moveq #9,%d0
	add.l %d1,%a1
	move.b %d2,(%a1,%a2.l)
	move.b %d2,(%a0,%a2.l)
	cmp.l %a6,%d0
	jne .L315
.L320:
	move.b (%a3),%d0
	move.l 1187521622,%a1
	mov3q.l #3,%d2
	move.b (%a3),%d1
	add.l #585088,%a1
	and.l %d2,%d0
	and.l %d2,%d1
	muls.l %d4,%d0
	muls.l %d4,%d1
	moveq #2,%d4
	move.l %d0,%a0
	add.l #269110990,%a0
	add.l %d1,%a1
	move.b %d4,62(%a1,%d3.l)
	move.b %d4,62(%a0,%d3.l)
	movem.l (%sp),#23580
	lea (40,%sp),%sp
	rts
.L319:
	move.l #269161679,%a3
	mov3q.l #3,%d4
	move.b (%a3),%d0
	move.l 1187521622,%a1
	add.l #585088,%a1
	move.b (%a3),%d1
	lea (63,%a6),%a2
	addq.l #1,%a6
	add.l %d3,%a2
	and.l %d4,%d0
	and.l %d4,%d1
	mvz.w #6322,%d4
	muls.l %d4,%d0
	muls.l %d4,%d1
	move.l %d0,%a0
	add.l #269110990,%a0
	moveq #9,%d0
	add.l %d1,%a1
	move.b %d2,(%a1,%a2.l)
	move.b %d2,(%a0,%a2.l)
	cmp.l %a6,%d0
	jne .L315
	jra .L320
	.size	save_settings, .-save_settings
	.align	2
	.globl	vector_unpack
	.type	vector_unpack, @function
vector_unpack:
	move.l %d2,-(%sp)
	moveq #15,%d1
	move.l 16(%sp),%a0
	mov3q.l #4,%d2
	move.l 8(%sp),%a1
	move.b (%a0),%d0
	and.l %d1,%d0
	move.b %d0,(%a1)
	mvz.b (%a0),%d0
	lsr.l #4,%d0
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L322
	moveq #4,%d1
.L322:
	move.b %d1,3(%a1)
	moveq #31,%d1
	moveq #16,%d2
	move.b 1(%a0),%d0
	and.l %d1,%d0
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L323
	moveq #16,%d1
.L323:
	move.b %d1,1(%a1)
	mov3q.l #1,%d1
	moveq #15,%d2
	mvz.b 1(%a0),%d0
	lsr.l #5,%d0
	and.l %d1,%d0
	move.b %d0,10(%a1)
	move.b 2(%a0),%d0
	and.l %d2,%d0
	moveq #11,%d2
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L324
	moveq #11,%d1
.L324:
	move.b %d1,2(%a1)
	moveq #12,%d2
	mvz.b 2(%a0),%d0
	lsr.l #4,%d0
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L325
	moveq #12,%d1
.L325:
	move.b %d1,6(%a1)
	moveq #126,%d2
	move.b 3(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L326
	moveq #126,%d0
.L326:
	move.b %d0,4(%a1)
	move.b 4(%a0),%d0
	jpl .L327
	moveq #127,%d0
.L327:
	move.b %d0,5(%a1)
	moveq #24,%d2
	move.b 5(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L328
	moveq #24,%d0
.L328:
	move.b %d0,7(%a1)
	moveq #63,%d2
	move.b 6(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L329
	moveq #63,%d0
.L329:
	move.b %d0,8(%a1)
	moveq #64,%d2
	move.b 7(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L330
	moveq #64,%d0
.L330:
	move.b %d0,9(%a1)
	moveq #127,%d1
	move.b 8(%a0),%d0
	move.l 12(%sp),%a0
	move.l (%sp)+,%d2
	and.l %d0,%d1
	move.l %d1,(%a0)
	rts
	.size	vector_unpack, .-vector_unpack
	.align	2
	.globl	vector_generate
	.type	vector_generate, @function
vector_generate:
	subq.l #4,%sp
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 16(%sp),%d0
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	tst.l %d0
	jeq .L335
	tst.l %d1
	jeq .L335
	lea (-1,%a0),%a2
	moveq #63,%d2
	cmp.l %a2,%d2
	jcs .L335
	moveq #127,%d2
	cmp.l 28(%sp),%d2
	jcs .L335
	move.l %a0,24(%sp)
	move.l %d1,20(%sp)
	move.l %d0,16(%sp)
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #4,%sp
	jra (vector_generate.part.0)
.L335:
	move.l (%sp)+,%d2
	clr.l %d0
	move.l (%sp)+,%a2
	addq.l #4,%sp
	rts
	.size	vector_generate, .-vector_generate
	.align	2
	.globl	vector_track_empty
	.type	vector_track_empty, @function
vector_track_empty:
	move.l 4(%sp),%d1
	tst.l %d1
	jeq .L345
	mvz.w #2329,%d0
	cmp.l 8(%sp),%d0
	jcc .L345
	move.l %d1,%d0
	move.l %d1,%a0
	add.l #64,%d0
.L346:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L345
	cmp.l %a0,%d0
	jne .L346
	move.l %d1,%a0
	move.l %d1,%d0
	lea (72,%a0),%a0
	add.l #80,%d0
.L347:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L345
	cmp.l %a0,%d0
	jne .L347
	move.l %d1,%a0
	add.l #2137,%d1
	lea (89,%a0),%a0
.L348:
	mvz.b (%a0),%d0
	addq.l #1,%a0
	cmp.l #255,%d0
	jne .L345
	cmp.l %a0,%d1
	jne .L348
	mov3q.l #1,%d0
	rts
.L345:
	clr.l %d0
	rts
	.size	vector_track_empty, .-vector_track_empty
	.align	2
	.globl	vector_write_phrase
	.type	vector_write_phrase, @function
vector_write_phrase:
	lea (-40,%sp),%sp
	movem.l #15612,(%sp)
	move.l 44(%sp),%d3
	tst.l %d3
	jeq .L355
	move.l 48(%sp),%d0
	cmp.l #2329,%d0
	jls .L355
	tst.l 52(%sp)
	jeq .L355
	move.l 52(%sp),%a0
	moveq #63,%d1
	move.b 256(%a0),%d4
	move.l %d4,%d0
	subq.l #1,%d0
	mvz.b %d0,%d0
	cmp.l %d0,%d1
	jcs .L355
	tst.l 56(%sp)
	jne .L358
	move.l 48(%sp),-(%sp)
	move.l %d3,-(%sp)
	jsr vector_track_empty
	addq.l #8,%sp
	tst.l %d0
	jeq .L354
.L358:
	mvz.b %d4,%d4
	move.l 52(%sp),%a2
	clr.l %d1
	move.l %a2,%a0
.L362:
	move.b (%a0),%d0
	mov3q.l #1,%d5
	mvz.b %d0,%d2
	cmp.l %d2,%d5
	jcs .L355
	cmp.l %d4,%d1
	jcs .L359
	tst.b %d0
	jne .L355
.L360:
	addq.l #1,%d1
	addq.l #4,%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L362
.L395:
	move.l %d3,%a3
	move.l %d3,%a1
	move.l %d3,%a4
	clr.l %d5
	lea (89,%a3),%a3
	lea (121,%a1),%a1
	lea (2202,%a4),%a4
.L374:
	mov3q.l #7,%d1
	and.l %d5,%d1
	move.l %d5,%d4
	lsr.l #3,%d4
	mov3q.l #7,%a0
	mov3q.l #1,%d2
	sub.l %d4,%a0
	add.l %d3,%a0
	mvz.b (%a0),%d0
	asr.l %d1,%d0
	and.l %d2,%d0
	tst.b (%a2)
	jeq .L375
	move.b 1(%a2),%d2
.L363:
	move.b %d2,(%a3)
	tst.b (%a2)
	jeq .L376
	move.b 2(%a2),%d2
.L364:
	move.b %d2,13(%a3)
	tst.b (%a2)
	jeq .L377
	move.b 3(%a2),%d2
.L365:
	move.b %d2,15(%a3)
	mov3q.l #1,%d2
	lsl.l %d1,%d2
	move.b (%a0),%d1
	tst.b (%a2)
	jeq .L366
	or.l %d2,%d1
.L367:
	move.b %d1,(%a0)
	tst.l %d0
	jne .L368
	tst.b (%a2)
	jeq .L369
.L368:
	clr.b %d0
	clr.b (%a4)
	move.w #15,%a5
	clr.l %d1
	sub.l %d4,%d1
	add.l %d3,%d1
	sub.l %d4,%a5
	move.w #79,%a0
	move.b %d0,1(%a4)
	move.l %d2,%d0
	not.l %d0
	sub.l %d4,%a0
	move.b (%a5,%d3.l),%d7
	and.l %d0,%d7
	move.b %d7,(%a5,%d3.l)
	move.l %d1,%a5
	move.b 31(%a5),%d7
	and.l %d0,%d7
	move.b %d7,31(%a5)
	move.b (%a0,%d3.l),%d1
	and.l %d1,%d0
	move.b %d0,(%a0,%d3.l)
.L369:
	move.l %a3,%a0
	clr.l %d1
.L370:
	move.b (%a0)+,%d0
	not.l %d0
	tst.b %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d1
	cmp.l %a1,%a0
	jne .L370
	move.w #23,%a0
	sub.l %d4,%a0
	add.l %d3,%a0
	move.b (%a0),%d0
	tst.b (%a2)
	jne .L371
	tst.l %d1
	jeq .L371
	or.l %d0,%d2
.L373:
	move.b %d2,(%a0)
	addq.l #1,%d5
	addq.l #4,%a2
	lea (32,%a3),%a3
	addq.l #2,%a4
	lea (32,%a1),%a1
	moveq #64,%d0
	cmp.l %d5,%d0
	jne .L374
	mov3q.l #1,%d0
.L354:
	movem.l (%sp),#15612
	lea (40,%sp),%sp
	rts
.L355:
	movem.l (%sp),#15612
	clr.l %d0
	lea (40,%sp),%sp
	rts
.L359:
	tst.b %d0
	jeq .L360
	move.b 1(%a0),%d0
	moveq #120,%d5
	mvz.b %d0,%d2
	subq.l #4,%d0
	mvz.b %d0,%d0
	subq.l #4,%d2
	cmp.l %d0,%d5
	jcs .L355
	mov3q.l #5,%d5
	rems.l %d5,%d0:%d2
	tst.l %d0
	jne .L355
	mvz.b 2(%a0),%d2
	moveq #126,%d5
	cmp.l %d2,%d5
	jcs .L354
	tst.b 3(%a0)
	jlt .L354
	addq.l #1,%d1
	addq.l #4,%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L362
	jra .L395
.L371:
	not.l %d2
	and.l %d0,%d2
	jra .L373
.L366:
	move.l %d2,%d7
	not.l %d7
	and.l %d7,%d1
	jra .L367
.L377:
	st %d2
	jra .L365
.L376:
	st %d2
	jra .L364
.L375:
	st %d2
	jra .L363
	.size	vector_write_phrase, .-vector_write_phrase
	.align	2
	.globl	vector_signed_track
	.type	vector_signed_track, @function
vector_signed_track:
	move.l %d2,-(%sp)
	move.l 12(%sp),%d0
	mov3q.l #7,%d1
	move.l 8(%sp),%a0
	cmp.l %d0,%d1
	jcs .L399
	mvz.b 34(%a0,%d0.l),%d1
	mov3q.l #1,%d2
	cmp.l %d1,%d2
	jcs .L399
	moveq #30,%d1
	moveq #83,%d2
	muls.l %d1,%d0
	lea 60(%a0,%d0.l),%a0
	mvz.b (%a0),%d0
	cmp.l %d0,%d2
	jeq .L403
.L399:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L403:
	mvz.b 1(%a0),%d0
	moveq #50,%d1
	cmp.l %d0,%d1
	jne .L399
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L400
	move.b 2(%a0),%d0
	mov3q.l #2,%d1
	move.l (%sp)+,%d2
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
.L400:
	move.l (%sp)+,%d2
	mov3q.l #1,%d0
	rts
	.size	vector_signed_track, .-vector_signed_track
	.align	2
	.type	generate_track, @function
generate_track:
	lea (-56,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	movem.l #17412,(%sp)
	cmp.l #133169151,%d0
	jls .L435
.L417:
	clr.l %d0
.L404:
	movem.l (%sp),#17412
	lea (56,%sp),%sp
	rts
.L435:
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	mvz.w #6322,%d2
	move.l 60(%sp),-(%sp)
	add.l #585088,%a0
	and.l %d1,%d0
	muls.l %d2,%d0
	pea (%a0,%d0.l)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L404
	move.b 269161680,%d0
	moveq #15,%d2
	mvz.b %d0,%d1
	move.l %d1,24(%sp)
	cmp.l %d1,%d2
	jcs .L417
	move.w 62(%sp),%d1
	move.l 1187521622,%a1
	ext.w %d0
	lea staging,%a0
	move.l %a1,28(%sp)
	move.b 269161679,%d2
	move.l 28(%sp),%a2
	mulu.w #2330,%d1
	move.b %d2,39(%sp)
	move.l %d1,%a6
	move.w %d0,%d1
	mulu.w #36568,%d1
	lea (%a6,%d1.l),%a1
	lea (%a2,%a1.l),%a6
	move.l %a1,32(%sp)
	sub.l %a0,%a6
.L408:
	move.b (%a0,%a6.l),%d0
	move.b %d0,(%a0)+
	cmp.l #staging+2330,%a0
	jne .L408
	tst.l 64(%sp)
	jeq .L436
.L409:
	mvz.w #36437,%d0
	move.l 28(%sp),%a0
	add.l %d1,%a0
	tst.b (%a0,%d0.l)
	jeq .L410
	move.b staging+80,%d0
.L411:
	mvz.b %d0,%d0
	moveq #63,%d2
	move.l %d0,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcs .L417
	move.l 60(%sp),-(%sp)
	lea (49,%sp),%a0
	move.l %d0,16(%sp)
	jsr settings
	move.w 66(%sp),%d2
	addq.l #4,%sp
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d1
	mulu.w #30,%d2
	move.l 12(%sp),%d0
	move.l %d2,%a1
	mov3q.l #3,%d2
	and.l %d2,%d1
	mvz.w #6322,%d2
	lea (497,%a1),%a1
	muls.l %d2,%d1
	moveq #127,%d2
	add.l %d1,%a0
	move.b (%a0,%a1.l),%d1
	and.l %d1,%d2
	move.l %d2,40(%sp)
	tst.l 68(%sp)
	jeq .L413
	move.l %d2,%d1
	moveq #127,%d2
	addq.l #1,%d1
	and.l %d1,%d2
	move.l %d2,40(%sp)
.L413:
	move.w 62(%sp),%d2
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d1
	mulu.w #24,%d2
	move.l %d2,%a1
	mov3q.l #3,%d2
	and.l %d2,%d1
	mvz.w #6322,%d2
	lea (291,%a1),%a1
	muls.l %d2,%d1
	moveq #127,%d2
	add.l %d1,%a0
	mvz.b (%a0,%a1.l),%d1
	cmp.l %d1,%d2
	jcs .L417
	move.l 40(%sp),-(%sp)
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	pea 57(%sp)
	pea phrase
	jsr (vector_generate.part.0)
	move.l 84(%sp),-(%sp)
	pea phrase
	pea 2330.w
	pea staging
	jsr vector_write_phrase
	lea (36,%sp),%sp
	tst.l %d0
	jeq .L404
	move.l 28(%sp),%a1
	cmp.l 1187521622.l,%a1
	jne .L417
	mvz.b 269161680,%d1
	cmp.l 24(%sp),%d1
	jne .L417
	mvz.b 39(%sp),%d1
	mvz.b 269161679,%d2
	cmp.l %d1,%d2
	jne .L417
	move.l 32(%sp),%a1
	sub.l #staging-268525901,%a1
	lea staging,%a0
	move.l %a1,24(%sp)
.L416:
	lea (%a0,%a6.l),%a2
	move.b (%a0)+,%d1
	mvz.b (%a2),%d2
	move.l %a2,16(%sp)
	move.l %d2,20(%sp)
	mvz.b %d1,%d2
	cmp.l 20(%sp),%d2
	jeq .L415
	move.b %d1,(%a2)
	move.l 24(%sp),%a1
	lea (-1,%a0),%a2
	move.b (%a2),(%a1,%a0.l)
.L415:
	cmp.l #staging+2330,%a0
	jne .L416
	move.l 40(%sp),-(%sp)
	pea 49(%sp)
	move.l 68(%sp),-(%sp)
	move.l %d0,24(%sp)
	jsr save_settings
	mov3q.l #3,%d2
	move.b 51(%sp),%d1
	move.l 1187521622,%a6
	add.l #610376,%a6
	lea (12,%sp),%sp
	and.l %d2,%d1
	move.b (%a6),%d2
	move.w %d2,%a1
	mov3q.l #1,%d2
	lsl.l %d1,%d2
	move.l %d2,%a0
	move.l %d2,%d1
	move.l %a1,%d2
	or.l %d2,%d1
	move.l %a0,%d2
	move.b %d1,(%a6)
	move.b 269161566,%d1
	or.l %d2,%d1
	move.b %d1,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	jsr 1073953240
	move.l 60(%sp),-(%sp)
	jsr 1074387488
	addq.l #4,%sp
	movem.l (%sp),#17412
	mov3q.l #1,1187497772
	move.l 12(%sp),%d0
	lea (56,%sp),%sp
	rts
.L436:
	pea 2330.w
	pea staging
	move.l %d1,20(%sp)
	jsr vector_track_empty
	addq.l #8,%sp
	move.l 12(%sp),%d1
	tst.l %d0
	jne .L409
	movem.l (%sp),#17412
	lea (56,%sp),%sp
	rts
.L410:
	mvz.w #36435,%d0
	move.b (%a0,%d0.l),%d0
	jra .L411
	.size	generate_track, .-generate_track
	.align	2
	.type	change_control, @function
change_control:
	link.w %fp,#-32
	lea (-22,%fp),%a0
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	mvz.b 269161676,%d1
	move.l %d1,-(%sp)
	move.l %d1,-32(%fp)
	jsr settings
	move.w -30(%fp),%d1
	addq.l #4,%sp
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.w -14(%fp),-3(%fp)
	move.b -12(%fp),-1(%fp)
	move.l -18(%fp),-7(%fp)
	move.l -22(%fp),-11(%fp)
	mulu.w #30,%d1
	move.b 269161679,%d0
	move.l %d1,%a1
	mov3q.l #3,%d1
	lea (497,%a1),%a1
	and.l %d1,%d0
	mvz.w #6322,%d1
	muls.l %d1,%d0
	add.l %d0,%a0
	move.b (%a0,%a1.l),%d1
	moveq #127,%d0
	and.l %d0,%d1
	mov3q.l #5,%d0
	mvz.b %d1,%d2
	cmp.l 8(%fp),%d0
	jcs .L438
	lea (-22,%fp),%a1
	add.l 8(%fp),%a1
	move.l 12(%fp),%a0
	mvz.b (%a1),%d1
	add.l %d1,%a0
	tst.l %a0
	jlt .L458
.L441:
	move.l 8(%fp),%a2
	move.l #vector_control_max,%d0
	mvz.b (%a2,%d0.l),%d0
	cmp.l %d0,%a0
	jge .L444
	move.l %a0,%d0
.L444:
	cmp.l %d1,%d0
	jeq .L437
	move.b %d0,(%a1)
	move.l %d2,%d0
.L447:
	move.l %d0,-(%sp)
	pea -22(%fp)
	move.l -32(%fp),-(%sp)
	lea save_settings,%a0
	move.l %a0,-28(%fp)
	jsr (%a0)
	clr.l -(%sp)
	mov3q.l #1,-(%sp)
	move.l -32(%fp),-(%sp)
	jsr generate_track
	lea (24,%sp),%sp
	move.l -28(%fp),%a0
	tst.l %d0
	jeq .L459
.L448:
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L437:
	move.l -40(%fp),%d2
	move.l -36(%fp),%a2
	unlk %fp
	rts
.L438:
	mov3q.l #6,%d0
	cmp.l 8(%fp),%d0
	jeq .L440
	move.l 8(%fp),%d1
	move.l 12(%fp),%a0
	lea -23(%fp,%d1.l),%a1
	mvz.b (%a1),%d1
	add.l %d1,%a0
	tst.l %a0
	jge .L441
.L458:
	tst.l %d1
	jeq .L437
	clr.b %d0
	move.b %d0,(%a1)
	move.l %d2,%d0
	jra .L447
.L459:
	move.l %d2,-(%sp)
	pea -11(%fp)
	move.l -32(%fp),-(%sp)
	jsr (%a0)
	lea (12,%sp),%sp
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	jra .L437
.L440:
	move.l 12(%fp),%d0
	add.l %d2,%d0
	tst.l %d0
	jlt .L445
	moveq #127,%d1
	cmp.l %d0,%d1
	jge .L446
	moveq #127,%d0
.L446:
	cmp.l %d2,%d0
	jeq .L437
	move.l %d0,-(%sp)
	pea -22(%fp)
	move.l -32(%fp),-(%sp)
	lea save_settings,%a0
	move.l %a0,-28(%fp)
	jsr (%a0)
	clr.l -(%sp)
	mov3q.l #1,-(%sp)
	move.l -32(%fp),-(%sp)
	jsr generate_track
	lea (24,%sp),%sp
	move.l -28(%fp),%a0
	tst.l %d0
	jne .L448
	jra .L459
.L445:
	tst.b %d1
	jeq .L437
	clr.l %d0
	move.l %d0,-(%sp)
	pea -22(%fp)
	move.l -32(%fp),-(%sp)
	lea save_settings,%a0
	move.l %a0,-28(%fp)
	jsr (%a0)
	clr.l -(%sp)
	mov3q.l #1,-(%sp)
	move.l -32(%fp),-(%sp)
	jsr generate_track
	lea (24,%sp),%sp
	move.l -28(%fp),%a0
	tst.l %d0
	jne .L448
	jra .L459
	.size	change_control, .-change_control
	.align	2
	.type	generator_view, @function
generator_view:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L463
	tst.b -2147483627.l
	jeq .L471
.L463:
	clr.l %d0
.L460:
	move.l (%sp)+,%d2
	rts
.L471:
	move.b 269161676,%d1
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	add.l #585088,%a0
	mvz.b %d1,%d1
	and.l %d2,%d0
	move.l %d1,-(%sp)
	mvz.w #6322,%d1
	muls.l %d1,%d0
	pea (%a0,%d0.l)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L463
	move.l edit_view,%d0
	tst.l %d0
	jne .L463
	tst.b 1187502296.l
	jne .L460
	tst.l 1175263034
	jne .L460
	tst.l 1175262868
	seq %d0
	move.l (%sp)+,%d2
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	generator_view, .-generator_view
	.align	2
	.globl	vector_validate_part
	.type	vector_validate_part, @function
vector_validate_part:
	lea (-136,%sp),%sp
	clr.l %d1
	movem.l #23804,(%sp)
	move.l 140(%sp),%d2
	move.l %d2,%a4
	lea (40,%sp),%a2
	sub.l %a6,%a6
	move.l %d2,%d4
	clr.l %d3
	move.l %a2,%a3
	add.l #60,%d4
	lea (34,%a4),%a4
.L478:
	mvz.b (%a4,%d1.l),%d0
	mov3q.l #1,%d6
	cmp.l %d0,%d6
	jcs .L476
	lea (%a6,%d4.l),%a0
	moveq #83,%d7
	mvz.b (%a0),%d0
	cmp.l %d0,%d7
	jeq .L503
.L476:
	addq.l #1,%d1
	lea (30,%a6),%a6
	lea (12,%a3),%a3
	cmp.l #240,%a6
	jne .L478
	move.l %d2,-(%sp)
	move.l 148(%sp),%a0
	clr.l %d5
	jsr (%a0)
	addq.l #4,%sp
	sub.l %a0,%a0
.L483:
	btst %d5,%d3
	jne .L504
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #240,%a0
	jne .L483
.L507:
	movem.l (%sp),#23804
	lea (136,%sp),%sp
	rts
.L503:
	mvz.b 1(%a0),%d0
	moveq #50,%d6
	cmp.l %d0,%d6
	jne .L476
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L474
	mvz.b 2(%a0),%d0
	subq.l #2,%d0
	tst.l %d0
	jne .L476
.L474:
	mov3q.l #1,%d0
	lsl.l %d1,%d0
	sub.l %a0,%a0
	or.l %d0,%d3
.L477:
	lea 60(%a6,%a0.l),%a1
	mov3q.l #5,%d7
	cmp.l %a0,%d7
	jcc .L475
.L505:
	move.l %a0,%d6
	mov3q.l #6,%d7
	remu.l %d7,%d0:%d6
	lea (%a6,%d0.l),%a1
	moveq #12,%d0
	lea (492,%a1),%a1
	add.l %d2,%a1
	move.b (%a1),(%a3,%a0.l)
	clr.b (%a1)
	addq.l #1,%a0
	cmp.l %a0,%d0
	jeq .L476
	lea 60(%a6,%a0.l),%a1
	mov3q.l #5,%d7
	cmp.l %a0,%d7
	jcs .L505
.L475:
	add.l %d2,%a1
	move.b (%a1),(%a3,%a0.l)
	clr.b (%a1)
	addq.l #1,%a0
	jra .L477
.L504:
	clr.l %d1
	lea (%a0,%d2.l),%a3
.L482:
	mov3q.l #5,%d4
	cmp.l %d1,%d4
	jcs .L480
.L506:
	lea (%a2,%d1.l),%a4
	mov3q.l #5,%d4
	move.l %d2,%a1
	add.l %d1,%a1
	move.b (%a4),60(%a0,%a1.l)
	addq.l #1,%d1
	cmp.l %d1,%d4
	jcc .L506
.L480:
	move.l %d1,%d6
	mov3q.l #6,%d7
	remu.l %d7,%d4:%d6
	lea (%a2,%d1.l),%a4
	addq.l #1,%d1
	lea (%a3,%d4.l),%a1
	moveq #12,%d4
	move.b (%a4),492(%a1)
	cmp.l %d1,%d4
	jne .L482
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #240,%a0
	jne .L483
	jra .L507
	.size	vector_validate_part, .-vector_validate_part
	.align	2
	.globl	st_validate_part
	.type	st_validate_part, @function
st_validate_part:
	pea st_stock_validate
	move.l 8(%sp),-(%sp)
	jsr vector_validate_part
	addq.l #8,%sp
	rts
	.size	st_validate_part, .-st_validate_part
	.align	2
	.globl	st_selected
	.type	st_selected, @function
st_selected:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L513
	tst.b -2147483627.l
	jeq .L516
.L513:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L516:
	move.b 269161676,%d1
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	add.l #585088,%a0
	mvz.b %d1,%d1
	and.l %d2,%d0
	move.l %d1,-(%sp)
	mvz.w #6322,%d1
	muls.l %d1,%d0
	pea (%a0,%d0.l)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l (%sp)+,%d2
	rts
	.size	st_selected, .-st_selected
	.align	2
	.type	pool_context, @function
pool_context:
	move.l pool_bank,%d0
	cmp.l 1187521622.l,%d0
	jeq .L523
.L519:
	clr.l %d0
	rts
.L523:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L519
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L519
	jra st_selected
	.size	pool_context, .-pool_context
	.section	.rodata.str1.1
.LC3:
	.string	"VECTOR GENERATED"
.LC4:
	.string	"NO CHANGE"
	.text
	.align	2
	.globl	st_key
	.type	st_key, @function
st_key:
	lea (-20,%sp),%sp
	moveq #49,%d0
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 32(%sp),%a1
	mov3q.l #1,%d2
	move.l 36(%sp),%a0
	cmp.l %a1,%d0
	sne %d1
	mvs.b %d1,%d1
	neg.l %d1
	cmp.l %a0,%d2
	jeq .L525
	mov3q.l #1,%d0
	lsl.l %d1,%d0
	move.l mine,%d2
	move.l %d2,20(%sp)
	and.l %d0,%d2
	tst.l %d2
	jne .L540
	tst.l %a0
	jne .L534
	mov3q.l #1,%d0
.L529:
	move.l %d1,%a2
	moveq #-3,%d2
	lea (%a2,%d1.l*2),%a2
	add.l %a2,%d0
	lea saved,%a2
	move.l (%a2,%d0.l*4),%d0
	move.l %d0,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcs .L524
.L541:
	move.l %a1,32(%sp)
	move.l %a0,36(%sp)
	move.l (%sp)+,%d2
	move.l %d0,%a1
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	jmp (%a1)
.L534:
	move.l %d1,%a2
	mov3q.l #2,%d0
	lea (%a2,%d1.l*2),%a2
	moveq #-3,%d2
	add.l %a2,%d0
	lea saved,%a2
	move.l (%a2,%d0.l*4),%d0
	move.l %d0,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcc .L541
.L524:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	rts
.L540:
	tst.l %a0
	jne .L524
	not.l %d0
	and.l 20(%sp),%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	move.l %d0,mine
	lea (20,%sp),%sp
	rts
.L525:
	move.l %d1,16(%sp)
	move.l %a0,8(%sp)
	move.l %a1,12(%sp)
	jsr st_selected
	move.l 16(%sp),%d1
	move.l 8(%sp),%a0
	move.l 12(%sp),%a1
	tst.l %d0
	jeq .L530
	move.b 1175456541,%d0
	btst #5,%d0
	jne .L530
	moveq #62,%d0
	cmp.l %a1,%d0
	jeq .L542
	moveq #49,%d2
	cmp.l %a1,%d2
	jne .L530
	move.l %d1,16(%sp)
	move.l %a0,8(%sp)
	move.l %a1,12(%sp)
	jsr generator_view
	move.l 16(%sp),%d1
	move.l 8(%sp),%a0
	move.l 12(%sp),%a1
	tst.l %d0
	jeq .L530
	mov3q.l #1,%d0
	or.l %d0,mine
	move.b 269161676,%d0
	mov3q.l #1,-(%sp)
	mov3q.l #1,-(%sp)
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr generate_track
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L533
	pea 32.w
	move.l #.LC3,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	lea (12,%sp),%sp
.L543:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	rts
.L530:
	clr.l %d0
	jra .L529
.L542:
	tst.b 1187502296.l
	jne .L530
	tst.l edit_view
	seq %d0
	mov3q.l #2,%d1
	or.l %d1,mine
	mov3q.l #-1,-(%sp)
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,edit_view
	jsr 1074059592
	addq.l #4,%sp
	move.l (%sp)+,%d2
	mov3q.l #1,1187497772
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	rts
.L533:
	pea 32.w
	move.l #.LC4,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	lea (12,%sp),%sp
	jra .L543
	.size	st_key, .-st_key
	.align	2
	.type	pool_flex, @function
pool_flex:
	move.l pool_bank,%d0
	cmp.l 1187521622.l,%d0
	jeq .L551
.L544:
	rts
.L551:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L544
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L544
	jsr st_selected
	tst.l %d0
	jeq .L544
	mov3q.l #1,pool_browse
	mov3q.l #1,pool_direct
	jsr st_stock_pool_open
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	rts
	.size	pool_flex, .-pool_flex
	.align	2
	.type	pool_static, @function
pool_static:
	move.l pool_bank,%d0
	cmp.l 1187521622.l,%d0
	jeq .L559
.L552:
	rts
.L559:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L552
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L552
	jsr st_selected
	tst.l %d0
	jeq .L552
	clr.l pool_browse
	mov3q.l #1,pool_direct
	jsr st_stock_pool_open
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	rts
	.size	pool_static, .-pool_static
	.align	2
	.globl	st_type
	.type	st_type, @function
st_type:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L562
	move.l 1187521622,%d0
	mov3q.l #3,%d2
	move.b 269161679,%d1
	add.l #585088,%d0
	move.l 12(%sp),%a0
	lea (-34,%a0),%a0
	and.l %d2,%d1
	mvz.w #6322,%d2
	muls.l %d2,%d1
	mov3q.l #7,%d2
	add.l %d1,%d0
	move.l %a0,%d1
	sub.l %d0,%d1
	cmp.l %d1,%d2
	jcc .L569
.L562:
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
.L569:
	mov3q.l #1,%d2
	cmp.l 8(%sp),%d2
	jcs .L562
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L562
	mov3q.l #5,8(%sp)
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
	.size	st_type, .-st_type
	.align	2
	.globl	st_chooser_type
	.type	st_chooser_type, @function
st_chooser_type:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	tst.l pool_direct
	jeq .L574
	jsr pool_context
	tst.l %d0
	jne .L584
.L574:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L577
	move.l 1187521622,%d1
	mov3q.l #3,%d3
	move.b 269161679,%d0
	add.l #585088,%d1
	move.w %d0,%a0
	move.l 16(%sp),%d0
	add.l #-34,%d0
	move.l %a0,%d2
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	add.l %d2,%d1
	sub.l %d1,%d0
	mov3q.l #7,%d2
	cmp.l %d0,%d2
	jcc .L585
.L577:
	move.l 12(%sp),%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L585:
	mov3q.l #1,%d3
	cmp.l 12(%sp),%d3
	jcs .L577
	move.l %d0,-(%sp)
	move.l %d1,-(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L577
	move.l (%sp)+,%d2
	mov3q.l #5,%d0
	move.l (%sp)+,%d3
	rts
.L584:
	move.l 1187521622,%d0
	mov3q.l #3,%d2
	move.b 269161679,%d1
	mvz.w #6322,%d3
	move.l pool_track,%a0
	add.l #585088,%d0
	lea (34,%a0),%a0
	and.l %d2,%d1
	muls.l %d3,%d1
	add.l %d1,%d0
	add.l %a0,%d0
	cmp.l 16(%sp),%d0
	jne .L574
	move.l (%sp)+,%d2
	move.l pool_browse,%d0
	move.l (%sp)+,%d3
	rts
	.size	st_chooser_type, .-st_chooser_type
	.align	2
	.globl	st_assign
	.type	st_assign, @function
st_assign:
	lea (-60,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	movem.l #19468,(%sp)
	cmp.l #133169151,%d0
	jhi .L587
	mov3q.l #7,%d0
	cmp.l 68(%sp),%d0
	jcs .L587
	move.l 1187521622,%d1
	move.l 64(%sp),%a0
	sub.l %d1,%a0
	move.l %a0,%a6
	add.l #-585088,%a6
	move.l %d1,36(%sp)
	mvz.w #6322,%d1
	move.l %a6,%d0
	remu.l %d1,%d2:%d0
	move.l %d2,%a0
	tst.l %d2
	jne .L587
	cmp.l #25287,%a6
	jhi .L587
	move.l 68(%sp),%d1
	mov3q.l #1,%d2
	move.l 64(%sp),%a2
	lea 34(%a2,%d1.l),%a1
	mvz.b (%a1),%d1
	cmp.l %d1,%d2
	jcc .L616
	mov3q.l #1,32(%sp)
.L588:
	move.l 68(%sp),%d1
	moveq #30,%d0
	muls.l %d0,%d1
	tst.l 72(%sp)
	jne .L589
	tst.l pool_direct
	jeq .L590
	move.l %d1,20(%sp)
	move.l %a0,24(%sp)
	jsr pool_context
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	tst.l %d0
	jeq .L590
	move.l 1187521622,%d0
	add.l #585088,%d0
	move.b 269161679,%d2
	move.w %d2,%a1
	mov3q.l #3,%d2
	move.l %a1,%d3
	and.l %d2,%d3
	mvz.w #6322,%d2
	muls.l %d2,%d3
	add.l %d3,%d0
	cmp.l 64(%sp),%d0
	jne .L590
	move.l 68(%sp),%d3
	cmp.l pool_track.l,%d3
	jne .L590
	mov3q.l #2,72(%sp)
.L589:
	move.l 68(%sp),-(%sp)
	move.l 68(%sp),-(%sp)
	move.l %d1,28(%sp)
	move.l %a0,32(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	tst.l %d0
	jeq .L617
.L592:
	move.l 64(%sp),%a1
	move.l #268525902,%d0
	sub.l 36(%sp),%d0
	lea 60(%a1,%d1.l),%a0
	lea 66(%a1,%d1.l),%a1
	move.l %a1,%d1
	move.l #268526334,%a1
	sub.l 36(%sp),%a1
.L599:
	move.b (%a0),(%a0,%d0.l)
	lea (432,%a0),%a2
	move.b (%a2),(%a1,%a0.l)
	addq.l #1,%a0
	cmp.l %a0,%d1
	jne .L599
	mov3q.l #1,%d0
	cmp.l 72(%sp),%d0
	jne .L586
	mvz.w #6322,%d1
	move.l %a6,%d0
	move.l #1187521622,%a0
	move.l (%a0),pool_bank
	mov3q.l #1,pool_pending
	divu.l %d1,%d0
	move.l 68(%sp),%d1
	move.l %d1,pool_track
	move.l %d0,pool_part
.L586:
	movem.l (%sp),#19468
	move.l 32(%sp),%d0
	lea (60,%sp),%sp
	rts
.L587:
	movem.l (%sp),#19468
	mov3q.l #1,32(%sp)
	move.l 32(%sp),%d0
	lea (60,%sp),%sp
	rts
.L590:
	move.l 68(%sp),-(%sp)
	move.l 68(%sp),-(%sp)
	move.l %d1,28(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 20(%sp),%d1
	tst.l %d0
	jeq .L592
	clr.b %d3
	move.l 64(%sp),%a0
	move.l #268525902,%d0
	move.l 64(%sp),%a1
	sub.l 36(%sp),%d0
	move.b %d3,62(%a0,%d1.l)
	move.b %d3,61(%a0,%d1.l)
	move.b %d3,60(%a0,%d1.l)
	lea 60(%a1,%d1.l),%a0
	lea 66(%a1,%d1.l),%a1
	move.l %a1,%d1
	move.l #268526334,%a1
	sub.l 36(%sp),%a1
	jra .L599
.L616:
	mvz.b (%a1),%d3
	move.l %d3,32(%sp)
	jra .L588
.L617:
	move.l 68(%sp),%a1
	moveq #50,%d2
	pea 1(%a1)
	pea vector_defaults
	move.l %sp,%d0
	add.l #59,%d0
	move.l %d0,-(%sp)
	move.l %d0,40(%sp)
	move.l %d1,32(%sp)
	move.l 76(%sp),%a2
	move.l %a0,36(%sp)
	lea 60(%a2,%d1.l),%a2
	move.l %a2,52(%sp)
	jsr vector_pack
	move.b #83,(%a2)
	move.l 76(%sp),%a1
	move.l 32(%sp),%d1
	move.l %d1,%a2
	lea (63,%a2),%a2
	move.b %d2,61(%a1,%d1.l)
	moveq #2,%d2
	move.b %d2,62(%a1,%d1.l)
	move.l %d1,%a1
	lea (489,%a1),%a1
	move.l 40(%sp),%d0
	lea (12,%sp),%sp
	move.l %a1,40(%sp)
	move.l 24(%sp),%a0
	move.l %a2,44(%sp)
.L596:
	move.l 40(%sp),%a1
	mov3q.l #2,%d2
	add.l %a0,%a1
	cmp.l %a0,%d2
	jcc .L618
	move.l %d0,%a3
	addq.l #1,%a0
	move.l 64(%sp),%a2
	moveq #9,%d2
	move.b (%a3),(%a2,%a1.l)
	cmp.l %a0,%d2
	jeq .L592
	addq.l #1,%d0
	jra .L596
.L618:
	move.l 64(%sp),%a2
	move.l %d0,%a3
	move.l 44(%sp),%a1
	add.l %a0,%a1
	addq.l #1,%a0
	move.b (%a3)+,(%a2,%a1.l)
	move.l %a3,%d0
	jra .L596
	.size	st_assign, .-st_assign
	.align	2
	.globl	st_pool_choice_draw
	.type	st_pool_choice_draw, @function
st_pool_choice_draw:
	subq.l #8,%sp
	move.l 1175346736,%d0
	move.l %a3,-(%sp)
	move.l %a2,-(%sp)
	tst.l %d0
	jeq .L619
	lea pool_labels,%a3
	cmp.l 1175346732.l,%a3
	jeq .L630
	clr.l %d0
.L619:
	move.l (%sp)+,%a2
	move.l (%sp)+,%a3
	addq.l #8,%sp
	rts
.L630:
	move.l %d0,%a0
	lea (36,%a0),%a0
	move.l %a0,12(%sp)
	move.l %a0,-(%sp)
	move.l %d0,12(%sp)
	jsr 1073960572
	move.l 12(%sp),%a1
	addq.l #4,%sp
	clr.l %d0
	move.l 40(%a1),%a2
	move.l (%a3)+,-(%sp)
	mov3q.l #-1,-(%sp)
	lea (-23,%a2),%a2
	move.l %a2,-(%sp)
	mov3q.l #5,-(%sp)
	move.l 28(%sp),-(%sp)
	move.l #1074505846,-(%sp)
	move.l %d0,32(%sp)
	jsr 1073818584
	lea (24,%sp),%sp
	move.l 8(%sp),%d0
	cmp.l 1175346752.l,%d0
	jeq .L631
.L621:
	subq.l #7,%a2
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jne .L624
.L632:
	move.l (%sp)+,%a2
	mov3q.l #1,1187497772
	move.l (%sp)+,%a3
	addq.l #8,%sp
	rts
.L631:
	move.l 12(%sp),%a1
	move.l (%a1),%a0
	mov3q.l #-1,-(%sp)
	pea 5(%a2)
	pea -5(%a0)
	pea -1(%a2)
	mov3q.l #3,-(%sp)
	move.l %a1,-(%sp)
	move.l %d0,32(%sp)
	jsr 1073816148
	lea (24,%sp),%sp
	subq.l #7,%a2
	mov3q.l #1,%d1
	move.l 8(%sp),%d0
	cmp.l %d0,%d1
	jeq .L632
.L624:
	move.l (%a3)+,-(%sp)
	mov3q.l #-1,-(%sp)
	move.l %a2,-(%sp)
	mov3q.l #5,-(%sp)
	mov3q.l #1,%d0
	move.l 28(%sp),-(%sp)
	move.l #1074505846,-(%sp)
	move.l %d0,32(%sp)
	jsr 1073818584
	lea (24,%sp),%sp
	move.l 8(%sp),%d0
	cmp.l 1175346752.l,%d0
	jne .L621
	jra .L631
	.size	st_pool_choice_draw, .-st_pool_choice_draw
	.section	.rodata.str1.1
.LC5:
	.string	"\253 MACHINE:VECTOR \273"
	.text
	.align	2
	.globl	st_pool_choice_open
	.type	st_pool_choice_open, @function
st_pool_choice_open:
	jsr st_selected
	tst.l %d0
	jeq .L633
	tst.l 1175346736
	jne .L633
	tst.l 1175351520
	jne .L633
	move.l #1187521622,%a0
	mov3q.l #3,%d1
	move.l (%a0),pool_bank
	move.b 269161679,%d0
	and.l %d0,%d1
	move.l %d1,pool_part
	mvz.b 269161676,%d0
	mov3q.l #2,-(%sp)
	mov3q.l #6,-(%sp)
	move.l #1175346744,-(%sp)
	move.l %d0,pool_track
	clr.l pool_direct
	clr.l pool_pending
	jsr 1074261088
	lea (12,%sp),%sp
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	move.l pool_track,%a1
	add.l #585088,%a0
	and.l %d1,%d0
	mvz.w #6322,%d1
	muls.l %d1,%d0
	add.l %d0,%a0
	mvz.b 34(%a0,%a1.l),%d0
	move.l %d0,-(%sp)
	move.l #1175346744,-(%sp)
	jsr 1074261424
	lea (handlers.3),%a0
	move.l %a0,1175346728
	move.l #pool_labels,%d0
	move.l %d0,1175346732
	clr.l 1175346740
	move.l #1074190164,-(%sp)
	mov3q.l #1,-(%sp)
	clr.l -(%sp)
	mov3q.l #-1,-(%sp)
	pea 64.w
	pea 110.w
	jsr 1074102940
	lea (32,%sp),%sp
	move.l %d0,1175346736
	tst.l %d0
	jeq .L633
	clr.l -(%sp)
	pea .LC5
	move.l %d0,-(%sp)
	jsr 1074098360
	move.l #1074585796,-(%sp)
	jsr 1073943700
	lea (16,%sp),%sp
	jra st_pool_choice_draw
.L633:
	rts
	.size	st_pool_choice_open, .-st_pool_choice_open
	.align	2
	.globl	st_pool_choice_left
	.type	st_pool_choice_left, @function
st_pool_choice_left:
	tst.l 1175346736
	jeq .L643
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jeq .L650
.L643:
	rts
.L650:
	jsr 1074190164
	clr.l pool_direct
	jsr st_stock_pool_open
	jmp 1074235708
	.size	st_pool_choice_left, .-st_pool_choice_left
	.align	2
	.globl	st_pool_choice_right
	.type	st_pool_choice_right, @function
st_pool_choice_right:
	subq.l #4,%sp
	tst.l 1175346736
	jeq .L651
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jeq .L664
.L651:
	addq.l #4,%sp
	rts
.L664:
	jsr pool_context
	tst.l %d0
	jeq .L651
	move.l 1175346752,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jcs .L651
	move.l %d1,(%sp)
	jsr 1074190164
	jsr pool_context
	tst.l %d0
	jeq .L651
	move.l (%sp),pool_browse
	mov3q.l #1,pool_direct
	jsr st_stock_pool_open
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	addq.l #4,%sp
	rts
	.size	st_pool_choice_right, .-st_pool_choice_right
	.align	2
	.globl	st_pool_left
	.type	st_pool_left, @function
st_pool_left:
	lea (-12,%sp),%sp
	move.l 16(%sp),%d1
	move.l 20(%sp),%a0
	tst.l 1175351520
	jeq .L665
	tst.l pool_direct
	jne .L682
.L667:
	move.l %a0,20(%sp)
	move.l %d1,16(%sp)
	lea (12,%sp),%sp
	jmp 1074235708
.L682:
	move.l %d1,4(%sp)
	move.l %a0,(%sp)
	jsr pool_context
	move.l 4(%sp),%d1
	move.l (%sp),%a0
	tst.l %d0
	jeq .L667
	tst.l 1175351520
	jeq .L667
	move.l pool_browse,%d0
	move.l %d0,8(%sp)
	jsr 1074235876
	clr.l pool_direct
	jsr st_pool_choice_open
	tst.l 1175346736
	jeq .L665
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jne .L665
	move.l 8(%sp),-(%sp)
	move.l #1175346744,-(%sp)
	jsr 1074261424
	lea (20,%sp),%sp
	jra st_pool_choice_draw
.L665:
	lea (12,%sp),%sp
	rts
	.size	st_pool_left, .-st_pool_left
	.align	2
	.globl	st_pool_right
	.type	st_pool_right, @function
st_pool_right:
	subq.l #8,%sp
	move.l 12(%sp),%d1
	move.l 16(%sp),%a0
	tst.l 1175351520
	jeq .L684
	tst.l 1175352218
	jne .L684
	mov3q.l #5,%d0
	cmp.l 1175352206.l,%d0
	jeq .L693
.L684:
	move.l %a0,16(%sp)
	move.l %d1,12(%sp)
	addq.l #8,%sp
	jmp 1074237596
.L693:
	move.l %d1,4(%sp)
	move.l %a0,(%sp)
	jsr st_selected
	move.l 4(%sp),%d1
	move.l (%sp),%a0
	tst.l %d0
	jeq .L684
	jsr 1074235876
	addq.l #8,%sp
	jra st_pool_choice_open
	.size	st_pool_right, .-st_pool_right
	.align	2
	.globl	st_draw_page
	.type	st_draw_page, @function
st_draw_page:
	subq.l #4,%sp
	jsr 1073946408
	move.l %d0,(%sp)
	jsr st_selected
	tst.l %d0
	jeq .L694
	tst.l edit_view
	jne .L694
	tst.b 1187502296.l
	jne .L694
	tst.l 1175263034
	jne .L694
	tst.l 1175262868
	jne .L694
	move.l (%sp),-(%sp)
	jsr generator_page
	move.l %d0,4(%sp)
	addq.l #4,%sp
.L694:
	move.l (%sp),%d0
	addq.l #4,%sp
	rts
	.size	st_draw_page, .-st_draw_page
	.align	2
	.globl	st_setup_page
	.type	st_setup_page, @function
st_setup_page:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l 12(%sp),%d1
	cmp.l #133169151,%d0
	jhi .L702
	tst.b -2147483627.l
	jeq .L709
.L702:
	move.l (%sp)+,%d2
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L709:
	move.b 269161676,%d0
	move.l 1187521622,%a0
	add.l #585088,%a0
	mvz.b %d0,%d2
	move.b 269161679,%d0
	move.l %d2,%a1
	mov3q.l #3,%d2
	move.l %a1,-(%sp)
	and.l %d2,%d0
	mvz.w #6322,%d2
	muls.l %d2,%d0
	pea (%a0,%d0.l)
	move.l %d1,12(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 4(%sp),%d1
	tst.l %d0
	jeq .L702
	tst.l edit_view
	jne .L702
	move.l %d1,12(%sp)
	move.l (%sp)+,%d2
	addq.l #4,%sp
	jra generator_page
	.size	st_setup_page, .-st_setup_page
	.align	2
	.globl	st_knob
	.type	st_knob, @function
st_knob:
	lea (-12,%sp),%sp
	mov3q.l #5,%d0
	move.l %d2,-(%sp)
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	cmp.l %d1,%d0
	jcc .L717
.L710:
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
.L717:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L710
	tst.b -2147483627.l
	jne .L710
	move.b 269161676,%d2
	move.l 1187521622,%a1
	add.l #585088,%a1
	move.b 269161679,%d0
	mvz.b %d2,%d2
	move.l %d2,12(%sp)
	mov3q.l #3,%d2
	and.l %d2,%d0
	mvz.w #6322,%d2
	move.l 12(%sp),-(%sp)
	muls.l %d2,%d0
	pea (%a1,%d0.l)
	move.l %d1,16(%sp)
	move.l %a0,12(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 8(%sp),%d1
	tst.l %d0
	jeq .L710
	tst.l edit_view
	jne .L710
	tst.b 1187502296.l
	jne .L710
	tst.l 1175263034
	jne .L710
	tst.l 1175262868
	jne .L710
	tst.l st_layer
	jne .L710
	move.l 4(%sp),24(%sp)
	move.l %d1,20(%sp)
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	jra change_control
	.size	st_knob, .-st_knob
	.align	2
	.globl	st_setup_knob
	.type	st_setup_knob, @function
st_setup_knob:
	move.l %d2,-(%sp)
	mov3q.l #5,%d0
	cmp.l 8(%sp),%d0
	jcc .L719
.L721:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L719:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L721
	tst.b -2147483627.l
	jne .L721
	move.b 269161676,%d1
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	add.l #585088,%a0
	mvz.b %d1,%d1
	and.l %d2,%d0
	move.l %d1,-(%sp)
	mvz.w #6322,%d1
	muls.l %d1,%d0
	pea (%a0,%d0.l)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L721
	tst.l edit_view
	jne .L721
	move.l 12(%sp),-(%sp)
	move.l 12(%sp),%a0
	pea 6(%a0)
	jsr change_control
	addq.l #8,%sp
	move.l (%sp)+,%d2
	mov3q.l #1,%d0
	rts
	.size	st_setup_knob, .-st_setup_knob
	.align	2
	.globl	st_ui_tick
	.type	st_ui_tick, @function
st_ui_tick:
	lea (-44,%sp),%sp
	movem.l #23564,(%sp)
	tst.l pool_direct
	jeq .L728
	tst.l 1175351520
	jne .L807
	clr.l pool_direct
.L728:
	tst.l pool_pending
	jne .L808
.L730:
	move.l -2147457608,%a2
	mov3q.l #1,%d0
	cmp.l %a2,%d0
	jeq .L796
.L814:
	lea any_vector,%a3
.L732:
	move.l %a2,last_transport
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L734
	move.w #62,%a4
	sub.l %a6,%a6
	lea vector_signed_track,%a2
.L736:
	move.l 1187521622,%a0
	mov3q.l #3,%d3
	move.b 269161679,%d0
	mvz.w #6322,%d1
	move.l %a6,-(%sp)
	add.l #585088,%a0
	and.l %d3,%d0
	muls.l %d1,%d0
	pea (%a0,%d0.l)
	jsr (%a2)
	addq.l #8,%sp
	tst.l %d0
	jeq .L735
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d0
	mvz.w #6322,%d2
	and.l %d3,%d0
	mov3q.l #1,%d3
	muls.l %d2,%d0
	add.l %d0,%a0
	mvz.b (%a0,%a4.l),%d0
	cmp.l %d0,%d3
	jeq .L809
.L735:
	addq.l #1,%a6
	lea (30,%a4),%a4
	moveq #8,%d0
	cmp.l %a6,%d0
	jne .L736
.L812:
	mvz.b 269161676,%d1
	mov3q.l #7,%d2
	cmp.l %d1,%d2
	jcs .L761
	move.l 1187521622,%a0
	mov3q.l #3,%d3
	move.b 269161679,%d0
	mvz.w #6322,%d2
	add.l #585088,%a0
	and.l %d3,%d0
	muls.l %d2,%d0
	add.l %d0,%a0
	tst.b 34(%a0,%d1.l)
	jne .L761
	move.l #1074606108,%d0
	move.l %d0,1074618188
.L734:
	jsr (%a3)
	move.l 1187521622,%a2
	mvz.b 269161679,%d1
	mvz.b 269161676,%d3
	move.l %d0,%a6
	move.l layer_gen,%a3
	move.l active,%d0
	move.l %d3,%a4
	cmp.l shown_bank.l,%a2
	jeq .L810
.L738:
	tst.l %a3
	jeq .L740
	tst.l %d0
	jeq .L799
	move.l #st_layer,%d0
	tst.l mine
	jeq .L811
.L727:
	movem.l (%sp),#23564
	lea (44,%sp),%sp
	rts
.L740:
	tst.l %d0
	jeq .L799
	move.l #st_edit_layer,%d0
	tst.l mine
	jne .L727
	jra .L811
.L809:
	move.l %a6,-(%sp)
	lea (37,%sp),%a0
	mov3q.l #3,%d2
	move.l %d0,32(%sp)
	jsr settings
	mvz.w #6322,%d3
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d1
	lea (435,%a4),%a1
	lea (30,%a4),%a4
	and.l %d2,%d1
	moveq #127,%d2
	muls.l %d3,%d1
	add.l %d1,%a0
	move.b (%a0,%a1.l),%d1
	and.l %d1,%d2
	move.l %d2,(%sp)
	pea 37(%sp)
	move.l %a6,-(%sp)
	jsr save_settings
	lea (12,%sp),%sp
	move.b 269161679,%d3
	move.l 28(%sp),%d0
	move.l 1187521622,%a1
	add.l #610376,%a1
	move.b (%a1),%d1
	move.w %d3,%a0
	mov3q.l #3,%d3
	move.l %a0,%d2
	and.l %d3,%d2
	lsl.l %d2,%d0
	or.l %d0,%d1
	move.b %d1,(%a1)
	move.b 269161566,%d1
	or.l %d1,%d0
	move.b %d0,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	addq.l #1,%a6
	moveq #8,%d0
	cmp.l %a6,%d0
	jne .L736
	jra .L812
.L810:
	cmp.l shown_part.l,%d1
	jne .L738
	cmp.l shown_track.l,%d3
	jne .L738
	tst.l %a3
	jeq .L743
	tst.l %d0
	jeq .L745
	lea st_layer,%a0
	tst.l %a6
	jeq .L748
	tst.l st_layer
	jeq .L747
.L748:
	tst.l mine
	jne .L727
	move.l %a0,-(%sp)
	move.l %d1,28(%sp)
	jsr 1073943660
	clr.l active
	move.l %a2,shown_bank
	move.l %a4,shown_track
	move.l 28(%sp),%d1
	addq.l #4,%sp
	move.l %d1,shown_part
.L745:
	move.l 1175262812,%a0
	tst.l %a6
	jeq .L727
	tst.l %a0
	jeq .L727
	tst.l (%a0)
	jne .L727
	move.l #st_key,%d1
	move.l #1187503478,%a0
	lea saved-1187503478,%a1
.L754:
	move.l (%a0),%d0
	cmp.l #st_key,%d0
	jeq .L753
	move.l %d0,(%a1,%a0.l)
.L753:
	addq.l #4,%a0
	cmp.l #1187503490,%a0
	jne .L754
	move.l #1187503790,%a0
	lea saved-1187503778,%a1
.L756:
	move.l (%a0),%d0
	cmp.l %d1,%d0
	jeq .L755
	move.l %d0,(%a1,%a0.l)
.L755:
	addq.l #4,%a0
	cmp.l #1187503802,%a0
	jne .L756
	jsr generator_view
	move.l %d0,layer_gen
	tst.l %d0
	jeq .L766
	lea st_layer,%a0
	clr.l (%a0)
	move.l %a0,-(%sp)
	jsr 1073943700
	mov3q.l #-1,-(%sp)
	mov3q.l #1,active
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #8,%sp
.L815:
	movem.l (%sp),#23564
	lea (44,%sp),%sp
	rts
.L808:
	jsr pool_context
	tst.l %d0
	jeq .L813
	tst.l 1175346736
	jne .L730
	tst.l 1175351520
	jne .L730
	jsr st_pool_choice_open
	move.l -2147457608,%a2
	mov3q.l #1,%d0
	cmp.l %a2,%d0
	jne .L814
.L796:
	mov3q.l #1,%d1
	lea any_vector,%a3
	cmp.l last_transport.l,%d1
	jeq .L732
	jsr (%a3)
	tst.l %d0
	jeq .L732
	sub.l %a4,%a4
	lea generate_track,%a6
.L733:
	clr.l -(%sp)
	moveq #8,%d2
	clr.l -(%sp)
	move.l %a4,-(%sp)
	jsr (%a6)
	addq.l #1,%a4
	lea (12,%sp),%sp
	cmp.l %a4,%d2
	jeq .L732
	clr.l -(%sp)
	moveq #8,%d2
	clr.l -(%sp)
	move.l %a4,-(%sp)
	jsr (%a6)
	addq.l #1,%a4
	lea (12,%sp),%sp
	cmp.l %a4,%d2
	jne .L733
	jra .L732
.L761:
	move.l #1074606510,%d0
	move.l %d0,1074618188
	jra .L734
.L799:
	clr.l edit_view
	move.l %a2,shown_bank
	move.l %d1,shown_part
	move.l %a4,shown_track
	jra .L745
.L807:
	jsr pool_context
	tst.l %d0
	jne .L728
	clr.l pool_direct
	jra .L728
.L813:
	clr.l pool_pending
	jra .L730
.L766:
	lea st_edit_layer,%a0
	clr.l (%a0)
	move.l %a0,-(%sp)
	jsr 1073943700
	mov3q.l #-1,-(%sp)
	mov3q.l #1,active
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #8,%sp
	jra .L815
.L811:
	move.l %d0,-(%sp)
	move.l %d1,28(%sp)
	jsr 1073943660
	clr.l active
	clr.l edit_view
	move.l %a2,shown_bank
	move.l 28(%sp),%d1
	addq.l #4,%sp
	move.l %a4,shown_track
	move.l %d1,shown_part
	jra .L745
.L743:
	tst.l %d0
	jeq .L745
	lea st_edit_layer,%a0
	tst.l %a6
	jeq .L748
	tst.l st_edit_layer
	jne .L748
.L747:
	move.l %d1,24(%sp)
	move.l %a0,28(%sp)
	jsr generator_view
	move.l 24(%sp),%d1
	move.l 28(%sp),%a0
	cmp.l %a3,%d0
	jne .L748
	move.l %a2,shown_bank
	movem.l (%sp),#23564
	lea (44,%sp),%sp
	rts
	.size	st_ui_tick, .-st_ui_tick
	.section	.rodata.str1.1
.LC6:
	.string	"C"
.LC7:
	.string	"C#"
.LC8:
	.string	"D"
.LC9:
	.string	"D#"
.LC10:
	.string	"E"
.LC11:
	.string	"F"
.LC12:
	.string	"F#"
.LC13:
	.string	"G"
.LC14:
	.string	"G#"
.LC15:
	.string	"A"
.LC16:
	.string	"A#"
.LC17:
	.string	"B"
	.section	.rodata
	.align	2
	.type	roots.1, @object
	.size	roots.1, 48
roots.1:
	.long	.LC6
	.long	.LC7
	.long	.LC8
	.long	.LC9
	.long	.LC10
	.long	.LC11
	.long	.LC12
	.long	.LC13
	.long	.LC14
	.long	.LC15
	.long	.LC16
	.long	.LC17
	.align	2
	.type	formats.2, @object
	.size	formats.2, 48
formats.2:
	.long	format_0
	.long	format_1
	.long	format_2
	.long	format_3
	.long	format_4
	.long	format_5
	.long	format_6
	.long	format_7
	.long	format_8
	.long	format_9
	.long	format_10
	.long	format_11
	.align	2
	.type	handlers.3, @object
	.size	handlers.3, 8
handlers.3:
	.long	pool_static
	.long	pool_flex
	.section	.rodata.str1.1
.LC18:
	.string	"001 STATIC"
.LC19:
	.string	"002 FLEX"
	.section	.rodata
	.align	2
	.type	pool_labels, @object
	.size	pool_labels, 8
pool_labels:
	.long	.LC18
	.long	.LC19
	.data
	.align	2
	.type	pool_browse, @object
	.size	pool_browse, 4
pool_browse:
	.zero	4
	.align	2
	.type	pool_direct, @object
	.size	pool_direct, 4
pool_direct:
	.zero	4
	.align	2
	.type	pool_pending, @object
	.size	pool_pending, 4
pool_pending:
	.zero	4
	.align	2
	.type	pool_track, @object
	.size	pool_track, 4
pool_track:
	.zero	4
	.align	2
	.type	pool_part, @object
	.size	pool_part, 4
pool_part:
	.zero	4
	.align	2
	.type	pool_bank, @object
	.size	pool_bank, 4
pool_bank:
	.zero	4
	.align	2
	.type	src_page_source, @object
	.size	src_page_source, 4
src_page_source:
	.zero	4
	.align	2
	.type	src_page_ready, @object
	.size	src_page_ready, 4
src_page_ready:
	.zero	4
	.type	src_page, @object
	.size	src_page, 402
src_page:
	.zero	402
	.type	phrase, @object
	.size	phrase, 257
phrase:
	.zero	257
	.type	staging, @object
	.size	staging, 2330
staging:
	.zero	2330
	.align	2
	.type	mine, @object
	.size	mine, 4
mine:
	.zero	4
	.align	2
	.type	last_transport, @object
	.size	last_transport, 4
last_transport:
	.zero	4
	.align	2
	.type	saved, @object
	.size	saved, 24
saved:
	.zero	24
	.align	2
	.type	layer_gen, @object
	.size	layer_gen, 4
layer_gen:
	.zero	4
	.align	2
	.type	edit_view, @object
	.size	edit_view, 4
edit_view:
	.zero	4
	.align	2
	.type	shown_track, @object
	.size	shown_track, 4
shown_track:
	.zero	4
	.align	2
	.type	shown_part, @object
	.size	shown_part, 4
shown_part:
	.zero	4
	.align	2
	.type	shown_bank, @object
	.size	shown_bank, 4
shown_bank:
	.zero	4
	.align	2
	.type	active, @object
	.size	active, 4
active:
	.zero	4
	.section	.rodata
	.align	2
	.type	scales, @object
	.size	scales, 10
scales:
	.word	4095
	.word	1453
	.word	2741
	.word	1709
	.word	1193
	.globl	vector_scale_names
	.section	.rodata.str1.1
.LC20:
	.string	"CHR"
.LC21:
	.string	"MIN"
.LC22:
	.string	"MAJ"
.LC23:
	.string	"DOR"
.LC24:
	.string	"PENT"
	.section	.rodata
	.align	2
	.type	vector_scale_names, @object
	.size	vector_scale_names, 20
vector_scale_names:
	.long	.LC20
	.long	.LC21
	.long	.LC22
	.long	.LC23
	.long	.LC24
	.globl	vector_control_max
	.type	vector_control_max, @object
	.size	vector_control_max, 12
vector_control_max:
	.base64	"DxALBH5/fwwYP0AB"
	.globl	vector_control_names
	.section	.rodata.str1.1
.LC25:
	.string	"TYPE"
.LC26:
	.string	"DENS"
.LC27:
	.string	"ROOT"
.LC28:
	.string	"SCAL"
.LC29:
	.string	"GATE"
.LC30:
	.string	"ACNT"
.LC31:
	.string	"SEED"
.LC32:
	.string	"SPAN"
.LC33:
	.string	"OFST"
.LC34:
	.string	"ROT"
.LC35:
	.string	"RPT"
.LC36:
	.string	"DIR"
	.section	.rodata
	.align	2
	.type	vector_control_names, @object
	.size	vector_control_names, 48
vector_control_names:
	.long	.LC25
	.long	.LC26
	.long	.LC27
	.long	.LC28
	.long	.LC29
	.long	.LC30
	.long	.LC31
	.long	.LC32
	.long	.LC33
	.long	.LC34
	.long	.LC35
	.long	.LC36
	.globl	vector_defaults
	.type	vector_defaults, @object
	.size	vector_defaults, 11
vector_defaults:
	.byte	11
	.byte	11
	.byte	0
	.byte	1
	.byte	32
	.byte	48
	.byte	12
	.byte	12
	.byte	0
	.byte	0
	.byte	0

#APP
/* Original VECTOR integration; registration seams adapted from octabam's */
/* MIT Analog BD machine.s (Sam Banks / repeat98). Replayed stock instructions */
/* are generated only in the private local build by prepare.py. */
        .text
        .global st_machine_name, st_src_names, st_main_commit
        .global st_src_commit, st_src_commit2, st_name_a, st_name_b
        .global st_setup_open, st_chooser_open, st_setup_row, st_chooser_row
        .global st_setup_edit6, st_setup_draw6, st_tick_hook
        .equ BANK_PTR, 0x46c82456
        .equ PART_OFF, 0x8ed80
st_machine_name:
        move.l 4(%sp),%d0
        cmpi.l #5,%d0
        beq.s 1f
        jmp st_name_replay
1:      lea st_name(%pc),%a0
        move.l %a0,%d0
        rts
st_src_names:
        .long 0x400b3eac,0x400b3e98,0x400b7c67,0x400b5413,0x400b7a63,st_name
st_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr st_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
st_main_commit:
        lea -32(%sp),%sp
        movem.l %d0-%d2/%a0-%a1,12(%sp)
        move.l %a1,%d2
        add.l %d0,%d2
        addi.l #PART_OFF,%d2
        move.l %d2,(%sp)
        move.l %d1,4(%sp)
        moveq #0,%d2
        cmpi.l #5,%d4
        bne.s 1f
        moveq #1,%d2
1:      move.l %d2,8(%sp)
        jsr st_assign
        cmpi.l #5,%d4
        bne.s 2f
        move.l %d0,%d4
2:      movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp st_main_replay
st_src_commit:
        pea 0x4005a61c
        bra.s st_src_common
st_src_commit2:
        pea 0x4005a856
st_src_common:
        move.l 0x460d5c30,%d1
        lea -32(%sp),%sp
        movem.l %d0/%d2-%d3/%a0-%a1,12(%sp)
        move.l %a1,%d3
        add.l %d0,%d3
        addi.l #PART_OFF,%d3
        move.l %d3,(%sp)
        move.l %d2,4(%sp)
        moveq #0,%d3
        cmpi.l #5,%d1
        bne.s 1f
        moveq #1,%d3
1:      move.l %d3,8(%sp)
        move.l %d1,%d3
        jsr st_assign
        cmpi.l #5,%d3
        beq.s 2f
        move.l %d3,%d0
2:      move.l %d0,%d1
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        rts
st_setup_open:
        move.b (%a0),%d3
        move.l %d0,-(%sp)
        mvs.b %d3,%d0
        bsr st_row_type
        move.l %d0,%d3
        move.l (%sp)+,%d0
        mvs.b %d3,%d4
        pea 0x400bb704
        jmp 0x400585e6
st_chooser_open:
        mvs.b (%a0),%d0
        bsr st_chooser_row_type
        move.l %d0,-(%sp)
        pea 0x460e7386
        jmp 0x40078890
st_name_a:
        bsr st_name_pick
        jmp 0x4003d722
st_name_b:
        bsr st_name_pick
        jmp 0x4004c374
st_name_pick:
        bsr st_row_type
        lea st_src_names(%pc),%a0
        move.l (%a0,%d0.l*4),%d1
        rts
st_setup_row:
        mvs.b (%a0),%d0
        lea 24(%sp),%sp
        bsr st_row_type
        jmp 0x4003c986
st_chooser_row:
        mvs.b (%a0),%d0
        bsr st_chooser_row_type
        cmp.l %d0,%d2
        bne.s 1f
        jmp 0x400786ce
1:      jmp 0x400786fc
st_chooser_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr st_chooser_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
/* SRC SETUP on row five edits the real underlying pool's settings. */
st_pool_kind:
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
st_setup_edit6:
        cmpi.l #5,%d2
        bne.s 1f
        lea -28(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,12(%sp)
        move.l %a3,(%sp)
        move.l %d3,4(%sp)
        jsr st_setup_knob
        move.l %d0,8(%sp)
        movem.l 12(%sp),%d0-%d1/%a0-%a1
        tst.l 8(%sp)
        lea 28(%sp),%sp
        beq.s 2f
        jmp 0x4003a624
2:
        bsr st_pool_kind
        move.l %d0,%d2
1:      jmp st_edit_replay
st_setup_draw6:
        cmpi.l #5,%d6
        bne.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l 92(%sp),(%sp)
        jsr st_setup_page
        move.l %d0,92(%sp)
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        move.l %d0,-(%sp)
        bsr st_pool_kind
        move.l %d0,%d6
        move.l (%sp)+,%d0
1:      jmp st_draw_replay
st_tick_hook:
        jsr 0x4005213c
        jsr 0x4007e940
        jsr st_ui_tick
        jmp 0x40052228
st_name:
        .asciz "VECTOR"
        .data
        .balign 4
        .global st_layer, st_edit_layer
st_layer:
        .long 0,st_keys,st_encs,0,0,-1,-1
st_edit_layer:
        .long 0,st_keys,0,0,0,-1,-1
st_keys:
        .irp k,0x31,0x3e
        .byte \k,0
        .long st_key,st_key,st_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
st_encs:
        .irp k,0,1,2,3,4,5
        .byte \k,0
        .long st_knob,0,0,0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0

/* Only the stock parameter-page DRAW call chooses the generator descriptor.
 * The parameter resolver and every playback/editor consumer remain stock. */
        .text
        .balign 2
        .global st_src_draw
st_src_draw:
        pea -1.w
        pea -1.w
        jsr st_draw_page
        jmp 0x4004e4d0

/* Stock double-tap TRACK enters the VECTOR backing-pool modal. */
        .global st_pool_open, st_stock_pool_open, st_list_draw, st_pool_title
st_pool_open:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_selected
        tst.l %d0
        beq.s .pool_stock
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp st_pool_choice_open
.pool_stock:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
st_stock_pool_open:
        move.l %a2,-(%sp)
        tst.l 0x460e70e0
        jmp 0x400791ec
st_list_draw:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_pool_choice_draw
        tst.l %d0
        beq.s .list_stock
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        rts
.list_stock:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        lea -24(%sp),%sp
        movem.l %d2-%d3/%a2-%a5,(%sp)
        jmp 0x4006d78c
st_pool_title:
        moveq #1,%d6
        cmpi.l #5,%d0
        bne.s .title_stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_selected
        tst.l %d0
        beq.s .title_unsigned
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        bra.s .title_pool
.title_unsigned:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
.title_stock:
        cmp.l %d0,%d6
        bcs.s .title_plain
.title_pool:
        jmp 0x40077b62
.title_plain:
        jmp 0x40077b70

/* Validate the rest of each Part with the real stock routine. */
        .text
        .balign 2
        .global st_validate, st_stock_validate
st_validate:
        jmp st_validate_part
st_stock_validate:
        lea -96(%sp),%sp
        movem.l %d2-%d7/%a2-%fp,(%sp)
        jmp 0x40002320

.text
.balign 2
st_name_replay:
.space 6
jmp 0x400334de
st_main_replay:
.space 6
jmp 0x40079822
st_edit_replay:
.space 8
jmp 0x4003a536
st_draw_replay:
.space 8
jmp 0x4003cda0
