#NO_APP
	.file	"vector.c"
	.text
	.align	2
	.type	mg_dirty, @function
mg_dirty:
	move.l %d2,-(%sp)
	move.b 269161679,%d0
	mov3q.l #3,%d2
	move.l 1187521622,%a1
	add.l #610376,%a1
	move.b (%a1),%d1
	and.l %d0,%d2
	mov3q.l #1,%d0
	lsl.l %d2,%d0
	or.l %d0,%d1
	move.b %d1,(%a1)
	move.b 269161566,%d1
	or.l %d1,%d0
	move.b %d0,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	move.l (%sp)+,%d2
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jmp 1073905152
	.size	mg_dirty, .-mg_dirty
	.align	2
	.type	mg_forward, @function
mg_forward:
	move.l %d2,-(%sp)
	moveq #51,%d1
	move.l 8(%sp),%d0
	move.l 12(%sp),%a0
	cmp.l %d0,%d1
	jeq .L7
	moveq #32,%d2
	cmp.l %d0,%d2
	jeq .L8
	moveq #49,%d1
	cmp.l %d0,%d1
	jeq .L9
	moveq #50,%d2
	mov3q.l #3,%a1
	cmp.l %d0,%d2
	jeq .L4
.L3:
	move.l (%sp)+,%d2
	rts
.L7:
	sub.l %a1,%a1
.L4:
	mov3q.l #1,%d1
	cmp.l %a0,%d1
	jeq .L10
.L14:
	tst.l %a0
	jeq .L6
	mov3q.l #2,%d1
.L6:
	lea (%a1,%a1.l*2),%a1
	moveq #-3,%d2
	add.l %a1,%d1
	lea mg_saved,%a1
	move.l (%a1,%d1.l*4),%a1
	move.l %a1,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcs .L3
	move.l %a0,12(%sp)
	move.l %d0,8(%sp)
	move.l (%sp)+,%d2
	jmp (%a1)
.L10:
	clr.l %d1
	jra .L6
.L8:
	mov3q.l #1,%a1
	mov3q.l #1,%d1
	cmp.l %a0,%d1
	jne .L14
	jra .L10
.L9:
	mov3q.l #2,%a1
	mov3q.l #1,%d1
	cmp.l %a0,%d1
	jne .L14
	jra .L10
	.size	mg_forward, .-mg_forward
	.align	2
	.type	vector_generate.part.0, @function
vector_generate.part.0:
	lea (-960,%sp),%sp
	moveq #15,%d1
	movem.l #31996,(%sp)
	move.l 968(%sp),%a0
	mvz.b (%a0),%d0
	move.l %d0,78(%sp)
	cmp.l %d0,%d1
	jcc .L16
	moveq #15,%d2
	move.l %d2,78(%sp)
.L16:
	moveq #16,%d0
	move.l 968(%sp),%a0
	mvz.b 1(%a0),%d3
	move.l %d3,70(%sp)
	cmp.l %d3,%d0
	jcc .L17
	moveq #16,%d1
	move.l %d1,70(%sp)
.L17:
	moveq #11,%d0
	move.l 968(%sp),%a0
	mvz.b 2(%a0),%d2
	move.l %d2,66(%sp)
	cmp.l %d2,%d0
	jcc .L18
	moveq #11,%d1
	move.l %d1,66(%sp)
.L18:
	mov3q.l #4,%d0
	move.l 968(%sp),%a0
	mvz.b 3(%a0),%d2
	move.l %d2,82(%sp)
	cmp.l %d2,%d0
	jcc .L19
	mov3q.l #4,82(%sp)
.L19:
	move.l 968(%sp),%a0
	moveq #126,%d0
	mvz.b 4(%a0),%d1
	move.l %d1,62(%sp)
	cmp.l %d1,%d0
	jcc .L20
	moveq #126,%d1
	move.l %d1,62(%sp)
.L20:
	moveq #127,%d0
	move.l 968(%sp),%a0
	mvz.b 5(%a0),%d2
	move.l %d2,86(%sp)
	cmp.l %d2,%d0
	jcc .L21
	moveq #127,%d1
	move.l %d1,86(%sp)
.L21:
	moveq #12,%d0
	move.l 968(%sp),%a0
	mvz.b 6(%a0),%d2
	move.l %d2,58(%sp)
	cmp.l %d2,%d0
	jcc .L22
	moveq #12,%d1
	move.l %d1,58(%sp)
.L22:
	moveq #24,%d1
	move.l 968(%sp),%a0
	move.b 8(%a0),%d0
	mvz.b 7(%a0),%d2
	move.l %d2,%a6
	move.b %d0,91(%sp)
	cmp.l %d2,%d1
	jcc .L23
	move.w #24,%a6
.L23:
	move.l 968(%sp),%a0
	lea (-12,%a6),%a1
	move.l 972(%sp),%d6
	move.b 9(%a0),%d0
	move.l %a1,74(%sp)
	tst.b %d0
	jeq .L24
	moveq #64,%d1
	cmp.l %d6,%d1
	jcs .L95
	mvz.b %d0,%d0
	cmp.l %d6,%d0
	jcs .L96
.L24:
	move.l 964(%sp),%a0
	move.l %sp,%d0
	move.l 964(%sp),%a2
	add.l #960,%d0
	move.l %a2,%a1
	move.b 975(%sp),256(%a0)
	lea (704,%sp),%a0
	move.l %a0,%a3
.L27:
	st %d1
	clr.b (%a1)
	move.b %d1,3(%a1)
	move.b %d1,2(%a1)
	move.b %d1,1(%a1)
	move.l (%a1)+,(%a3)+
	cmp.l %a3,%d0
	jne .L27
	move.l 980(%sp),%d1
	move.l #-1640531527,%d4
	move.l 78(%sp),%d7
	moveq #11,%d3
	clr.l %d2
	eor.l %d4,%d1
	lsl.l %d3,%d7
	moveq #15,%d3
	lea (192,%sp),%a1
	lea (448,%sp),%a5
	move.l %a1,%d5
	move.l %d1,%d0
	clr.w %d0
	swap %d0
	eor.l %d1,%d0
	move.l #2146121005,%d1
	muls.l %d1,%d0
	move.l %d0,%d1
	lsr.l %d3,%d1
	eor.l %d1,%d0
	move.l #-2073254261,%d1
	muls.l %d1,%d0
	move.l %d0,%d3
	clr.w %d3
	swap %d3
	eor.l %d0,%d3
	mov3q.l #3,%d0
	and.l %d2,%d0
	mvz.w %d3,%d3
	tst.l %d0
	jeq .L28
.L98:
	add.l %d7,%d3
	move.l %d3,(%a5)
.L29:
	move.l %d5,%a3
	move.l %d2,%d0
	move.l %a0,50(%sp)
.L31:
	move.l -4(%a3),%d1
	lea (960,%sp),%a0
	lea (%a0,%d1.l*4),%a4
	cmp.l -512(%a4),%d3
	jcc .L92
	move.l %d1,(%a3)
	subq.l #1,%d0
	subq.l #4,%a3
	tst.l %d0
	jne .L31
.L92:
	lea (%sp,%d0.l*4),%a3
	move.l %d2,%d3
	add.l #-1640531527,%d4
	move.l 50(%sp),%a0
	addq.l #1,%d3
	addq.l #4,%a5
	addq.l #4,%d5
	move.l %d2,192(%a3)
	cmp.l %d6,%d3
	jeq .L97
.L61:
	move.l 980(%sp),%d1
	move.l %d3,%d2
	moveq #15,%d3
	eor.l %d4,%d1
	move.l %d1,%d0
	clr.w %d0
	swap %d0
	eor.l %d1,%d0
	move.l #2146121005,%d1
	muls.l %d1,%d0
	move.l %d0,%d1
	lsr.l %d3,%d1
	eor.l %d1,%d0
	move.l #-2073254261,%d1
	muls.l %d1,%d0
	move.l %d0,%d3
	clr.w %d3
	swap %d3
	eor.l %d0,%d3
	mov3q.l #3,%d0
	and.l %d2,%d0
	mvz.w %d3,%d3
	tst.l %d0
	jne .L98
.L28:
	move.l %d3,(%a5)
	tst.l %d2
	jne .L29
	clr.l %d0
	lea (%sp,%d0.l*4),%a3
	move.l %d2,%d3
	add.l #-1640531527,%d4
	addq.l #1,%d3
	addq.l #4,%a5
	addq.l #4,%d5
	move.l %d2,192(%a3)
	cmp.l %d6,%d3
	jne .L61
.L97:
	move.l 82(%sp),%a5
	moveq #24,%d5
	lea scales,%a3
	moveq #100,%d7
	move.w #12,%a4
	mvz.w (%a3,%a5.l*2),%d4
	move.l 74(%sp),%a3
	moveq #-12,%d0
	move.l 74(%sp),%a5
	sub.l %a6,%a4
	sub.l 66(%sp),%d5
	sub.l 58(%sp),%a3
	add.l 58(%sp),%a5
	clr.l 54(%sp)
	clr.l 50(%sp)
	move.l %a0,82(%sp)
	move.l %d2,46(%sp)
.L42:
	move.l %d5,%d1
	moveq #12,%d2
	add.l %d0,%d1
	remu.l %d2,%d6:%d1
	btst %d6,%d4
	jeq .L34
.L100:
	cmp.l %a3,%d0
	jge .L35
	move.l %a4,%d1
	add.l %d0,%d1
	tst.l %d1
	jlt .L99
	cmp.l %d1,%d7
	jle .L37
.L103:
	move.l %d0,54(%sp)
	moveq #12,%d2
	addq.l #1,%d0
	move.l %d1,%d7
	move.l %d5,%d1
	add.l %d0,%d1
	remu.l %d2,%d6:%d1
	btst %d6,%d4
	jne .L100
.L34:
	addq.l #1,%d0
	moveq #13,%d1
	cmp.l %d0,%d1
	jne .L42
.L105:
	move.w 72(%sp),%d0
	move.l 82(%sp),%a0
	move.l 46(%sp),%d2
	mulu.w %d3,%d0
	addq.l #8,%d0
	lsr.l #4,%d0
	jeq .L43
	mvz.w %d0,%d0
	lea (%a1,%d0.l*4),%a4
.L44:
	move.l (%a1)+,%d0
	lea (%sp,%d0.l*4),%a3
	moveq #1,%d0
	move.b %d0,704(%a3)
	cmp.l %a1,%a4
	jne .L44
.L43:
	moveq #12,%d1
	moveq #12,%d6
	move.l 66(%sp),%d0
	addq.l #7,%d0
	remu.l %d1,%d5:%d0
	mvz.w #254,%d1
	sub.l 86(%sp),%d1
	move.l 74(%sp),%a4
	move.l %d2,%a1
	move.l 74(%sp),%a5
	clr.l %d7
	moveq #12,%d0
	sub.l 66(%sp),%d0
	move.l %d5,70(%sp)
	mulu.w 978(%sp),%d1
	add.l 58(%sp),%a5
	add.l %d5,%d0
	remu.l %d6,%d5:%d0
	mvz.w #254,%d6
	sub.l 58(%sp),%a4
	move.l %a5,74(%sp)
	move.l 50(%sp),%d2
	move.l %d3,%a3
	divu.l %d6,%d1
	asr.l %d5,%d4
	move.l 78(%sp),%a5
	move.l %a2,82(%sp)
	move.l 980(%sp),50(%sp)
	mov3q.l #1,%d0
	and.l %d4,%d0
	move.b %d1,61(%sp)
	move.l %d0,78(%sp)
.L54:
	move.l %d7,%d6
	addq.l #1,%d7
	tst.b (%a0)
	jeq .L45
	move.l #-2048144789,%d1
	moveq #15,%d5
	muls.l %d7,%d1
	move.l 50(%sp),%d3
	move.l #2146121005,%d4
	eor.l %d3,%d1
	eor.l #-1255572915,%d1
	move.l %d1,%d0
	clr.w %d0
	swap %d0
	eor.l %d1,%d0
	muls.l %d4,%d0
	move.l %d0,%d1
	lsr.l %d5,%d1
	eor.l %d1,%d0
	move.l #-2073254261,%d1
	muls.l %d1,%d0
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	eor.l %d0,%d1
	tst.l %d2
	jeq .L62
	move.l %d1,%d0
	lsr.l #8,%d0
	remu.l %d2,%d4:%d0
	lea (%sp,%d4.l*4),%a6
	move.l 92(%a6),%d4
	add.l #-12,%d4
.L46:
	moveq #15,%d0
	and.l %d1,%d0
	cmp.l %a5,%d0
	jcc .L51
	moveq #48,%d0
	and.l %d1,%d0
	tst.l %d0
	jne .L64
	tst.l 78(%sp)
	jne .L101
.L64:
	move.l 66(%sp),%d0
.L48:
	btst #6,%d1
	jeq .L49
	add.l #-12,%d0
.L49:
	cmp.l %a4,%d0
	jlt .L51
	cmp.l 74(%sp),%d0
	jgt .L51
	move.l %d0,%d4
.L51:
	moveq #24,%d3
	move.l %d1,%d0
	lsr.l %d3,%d0
	mov3q.l #3,%d3
	muls.w #5,%d4
	move.l %d0,%d5
	remu.l %d3,%d0:%d5
	add.l #64,%d4
	move.b %d4,1(%a0)
	addq.l #2,%d0
	mulu.w 64(%sp),%d0
	lsr.l #2,%d0
	move.b %d0,2(%a0)
	mov3q.l #3,%d0
	and.l %d6,%d0
	tst.l %d0
	jeq .L52
	and.l #3145728,%d1
	tst.l %d1
	jeq .L52
	move.b 61(%sp),%d0
	move.b %d0,3(%a0)
.L45:
	addq.l #4,%a0
	cmp.l %a1,%d6
	jne .L54
	move.l 82(%sp),%a2
	move.l %a3,%d3
	tst.l 972(%sp)
	jeq .L55
	mvz.b 91(%sp),%d0
	moveq #63,%d4
	cmp.l %d0,%d4
	jcs .L102
	move.l 972(%sp),%d5
	move.l 968(%sp),%a0
	move.l 964(%sp),%a3
	remu.l %d5,%d2:%d0
	move.b 10(%a0),%d4
	mvz.w %d5,%d0
	move.l 972(%sp),%d1
	subq.l #1,%d5
	lea (%a3,%d0.l*4),%a1
	sub.l %d2,%d1
	move.l 972(%sp),%d2
.L58:
	move.l %d1,%d6
	addq.l #1,%d1
	remu.l %d2,%d0:%d6
	tst.b %d4
	jeq .L57
	move.l %d5,%d6
	sub.l %d0,%d6
	move.l %d6,%d0
.L57:
	remu.l %d3,%d6:%d0
	lea (960,%sp),%a3
	lea (%a3,%d6.l*4),%a0
	move.l -256(%a0),(%a2)+
	cmp.l %a1,%a2
	jne .L58
.L55:
	movem.l (%sp),#31996
	mov3q.l #1,%d0
	lea (960,%sp),%sp
	rts
.L99:
	neg.l %d1
	cmp.l %d1,%d7
	jgt .L103
.L37:
	addq.l #1,%d0
	jra .L42
.L35:
	cmp.l %a5,%d0
	jgt .L39
	move.l 50(%sp),%d1
	move.l %d0,%a0
	lea (12,%a0),%a0
	lea (%sp,%d1.l*4),%a6
	addq.l #1,%d1
	move.l %d1,50(%sp)
	move.l %a0,92(%a6)
.L39:
	move.l %a4,%d1
	add.l %d0,%d1
	tst.l %d1
	jlt .L104
.L40:
	cmp.l %d1,%d7
	jle .L34
	move.l %d0,54(%sp)
	move.l %d1,%d7
	addq.l #1,%d0
	moveq #13,%d1
	cmp.l %d0,%d1
	jne .L42
	jra .L105
.L104:
	neg.l %d1
	jra .L40
.L52:
	move.b 979(%sp),%d0
	move.b %d0,3(%a0)
	jra .L45
.L62:
	move.l 54(%sp),%d4
	jra .L46
.L102:
	move.l 972(%sp),%d5
	moveq #63,%d0
	move.l 968(%sp),%a0
	move.l 964(%sp),%a3
	remu.l %d5,%d2:%d0
	move.l 972(%sp),%d1
	mvz.w %d5,%d0
	move.b 10(%a0),%d4
	subq.l #1,%d5
	sub.l %d2,%d1
	lea (%a3,%d0.l*4),%a1
	move.l 972(%sp),%d2
	jra .L58
.L101:
	move.l 70(%sp),%d0
	jra .L48
.L96:
	move.l 964(%sp),%a0
	move.l %d0,%d6
	move.l 964(%sp),%a2
	move.l %sp,%d0
	move.l %a2,%a1
	add.l #960,%d0
	move.b 975(%sp),256(%a0)
	lea (704,%sp),%a0
	move.l %a0,%a3
	jra .L27
.L95:
	mvz.b %d0,%d0
	moveq #64,%d6
	cmp.l %d6,%d0
	jcc .L24
	jra .L96
	.size	vector_generate.part.0, .-vector_generate.part.0
	.align	2
	.type	generator_page, @function
generator_page:
	lea (-32,%sp),%sp
	movem.l #15420,(%sp)
	tst.l src_page_ready
	jeq .L107
	move.l 36(%sp),%d0
	cmp.l src_page_source.l,%d0
	jeq .L108
.L107:
	lea src_page,%a0
	move.l 36(%sp),%a1
	sub.l %a0,%a1
.L109:
	move.b (%a1,%a0.l),%d0
	move.b %d0,(%a0)+
	cmp.l #src_page+402,%a0
	jne .L109
	lea vector_control_names,%a5
	clr.l %d2
	lea src_page+202,%a1
	lea (formats.7),%a4
	lea src_page+22,%a2
	move.l #src_page+28,%d1
.L116:
	move.l (%a5)+,%a3
	sub.l %a0,%a0
.L110:
	move.b (%a3,%a0.l),%d0
	jeq .L111
	move.b %d0,(%a2,%a0.l)
	addq.l #1,%a0
	mov3q.l #5,%d3
	cmp.l %a0,%d3
	jne .L110
.L111:
	add.l %a2,%a0
.L113:
	clr.b (%a0)+
	cmp.l %a0,%d1
	jne .L113
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
	jcs .L117
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
	jne .L116
.L127:
	mvz.w #21845,%d3
	move.l 36(%sp),%d0
	move.l #1431655765,%d4
	move.l %d4,src_page+398
	mov3q.l #1,src_page_ready
	move.l %d3,src_page+394
	move.l %d0,src_page_source
.L108:
	move.l #src_page,%d0
	movem.l (%sp),#15420
	lea (32,%sp),%sp
	rts
.L117:
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
	jne .L116
	jra .L127
	.size	generator_page, .-generator_page
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"VEC"
	.text
	.align	2
	.type	vector_midi_page, @function
vector_midi_page:
	lea (-32,%sp),%sp
	move.l 40(%sp),%d1
	movem.l #31772,(%sp)
	move.l 36(%sp),%a1
	tst.l %d1
	jeq .L129
	mov3q.l #1,%d1
	and.l 44(%sp),%d1
	addq.l #1,%d1
.L129:
	lea 1(%a1,%d1.l),%a0
	move.l %d1,midi_view
	move.l %a0,%d4
	tst.l src_page_ready
	jne .L130
	cmp.l midi_page_built.l,%a0
	jeq .L131
.L130:
	lea src_page,%a0
	sub.l %a0,%a1
.L132:
	move.b (%a1,%a0.l),%d0
	move.b %d0,(%a0)+
	cmp.l #src_page+402,%a0
	jne .L132
	lea .LC0,%a1
	sub.l %a0,%a0
	lea src_page+4,%a2
.L133:
	move.b (%a1),%d0
	addq.l #1,%a1
	tst.b %d0
	jeq .L134
	move.b %d0,(%a2)+
	addq.l #1,%a0
	mov3q.l #5,%d0
	cmp.l %a0,%d0
	jne .L133
.L134:
	add.l #src_page+4,%a0
.L136:
	clr.b (%a0)+
	cmp.l #src_page+10,%a0
	jne .L136
	move.w %d1,%d2
	lea src_page+9,%a0
	mulu.w #13,%d2
	move.l %d2,%a1
	add.l #titles.2,%a1
.L138:
	move.b (%a1)+,(%a0)+
	cmp.l #src_page+22,%a0
	jne .L138
	move.w %d1,%d0
	lea (formats.1),%a6
	lea src_page+202,%a1
	move.l #src_page+28,%d1
	lea midi_names,%a3
	mulu.w #6,%d0
	move.l %d0,%a5
	add.l #midi_layout,%a5
.L144:
	mvz.b (%a5)+,%d0
	move.l %d1,%a2
	sub.l %a0,%a0
	subq.l #6,%a2
	move.l (%a3,%d0.l*4),%a4
.L139:
	move.b (%a4,%a0.l),%d0
	jeq .L140
	move.b %d0,(%a2,%a0.l)
	addq.l #1,%a0
	mov3q.l #5,%d0
	cmp.l %a0,%d0
	jne .L139
.L140:
	add.l %a2,%a0
.L142:
	clr.b (%a0)+
	cmp.l %a0,%d1
	jne .L142
	moveq #64,%d2
	move.l (%a6)+,%d0
	moveq #24,%d1
	move.l %d0,%d3
	lsr.l %d1,%d3
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d0,3(%a1)
	addq.l #4,%a1
	move.b %d3,-4(%a1)
	move.b %d1,-2(%a1)
	moveq #103,%d1
	move.b %d2,44(%a1)
	move.l %d0,%d2
	moveq #4,%d0
	clr.w %d2
	swap %d2
	move.b %d1,46(%a1)
	move.l %a0,%d1
	addq.l #6,%d1
	move.b %d0,45(%a1)
	moveq #-92,%d0
	move.b %d0,47(%a1)
	move.b %d2,-3(%a1)
	cmp.l #formats.1+24,%a6
	jne .L144
	mvz.w #21845,%d1
	move.l #1431655765,%d2
	move.l %d2,src_page+398
	clr.l src_page_ready
	move.l %d1,src_page+394
	move.l %d4,midi_page_built
.L131:
	move.l #src_page,%d0
	movem.l (%sp),#31772
	lea (32,%sp),%sp
	rts
	.size	vector_midi_page, .-vector_midi_page
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
	jeq .L187
	lea (23,%sp),%a6
	sub.l %a1,%a1
.L172:
	move.l %a1,%d1
	add.l #489,%d1
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcc .L188
.L169:
	move.b (%a0,%d1.l),(%a6)
	addq.l #1,%a1
	moveq #9,%d1
	cmp.l %a1,%d1
	jeq .L171
	move.l %a1,%d1
	add.l #489,%d1
	addq.l #1,%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcs .L169
.L188:
	lea 63(%a1,%d0.l),%a2
	addq.l #1,%a1
	move.b (%a0,%a2.l),(%a6)+
	jra .L172
.L171:
	move.b 23(%sp),%d0
	moveq #15,%d1
	mov3q.l #4,%d2
	and.l %d0,%d1
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.w %d0,%a0
	move.b %d1,32(%sp)
	cmp.l %d0,%d2
	jcs .L189
	move.w %a0,%d0
	move.b 24(%sp),%d1
	moveq #16,%d2
	move.b %d0,35(%sp)
	moveq #31,%d0
	and.l %d1,%d0
	move.w %d0,%a0
	cmp.l %d0,%d2
	jcs .L190
.L174:
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
	jcs .L191
.L175:
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.b %d1,34(%sp)
	moveq #12,%d1
	move.w %d0,%a0
	cmp.l %d0,%d1
	jcs .L192
.L176:
	move.b 26(%sp),%d1
	move.w %a0,%d2
	mvz.b %d1,%d0
	move.b %d2,38(%sp)
	moveq #126,%d2
	cmp.l %d0,%d2
	jcs .L193
.L177:
	move.b 27(%sp),%d0
	move.b %d1,36(%sp)
	tst.b %d0
	jlt .L194
.L178:
	move.b 28(%sp),%d1
	move.b %d0,37(%sp)
	moveq #24,%d2
	mvz.b %d1,%d0
	cmp.l %d0,%d2
	jcs .L195
.L179:
	mvz.b 29(%sp),%d0
	move.b %d1,39(%sp)
	moveq #63,%d1
	cmp.l %d0,%d1
	jcs .L196
.L180:
	move.b 30(%sp),%d1
	lsl.l #8,%d0
	mvz.b %d1,%d2
	move.l %d2,%a0
	moveq #64,%d2
	cmp.l %a0,%d2
	jcs .L197
.L181:
	move.b %d1,%d0
	lea (32,%sp),%a3
	move.w %d0,40(%sp)
.L167:
	move.l 16(%sp),%a0
	move.l %a0,%d0
	move.l (%a3),(%a0)+
	move.l 36(%sp),(%a0)+
	move.w 40(%sp),(%a0)+
	movem.l (%sp),#19460
	move.b 42(%sp),(%a0)
	lea (44,%sp),%sp
	rts
.L197:
	moveq #64,%d1
	lea (32,%sp),%a3
	move.b %d1,%d0
	move.w %d0,40(%sp)
	jra .L167
.L196:
	move.b 30(%sp),%d1
	moveq #63,%d0
	lsl.l #8,%d0
	mvz.b %d1,%d2
	move.l %d2,%a0
	moveq #64,%d2
	cmp.l %a0,%d2
	jcc .L181
	jra .L197
.L195:
	moveq #24,%d1
	mvz.b 29(%sp),%d0
	move.b %d1,39(%sp)
	moveq #63,%d1
	cmp.l %d0,%d1
	jcc .L180
	jra .L196
.L194:
	moveq #127,%d0
	move.b 28(%sp),%d1
	moveq #24,%d2
	move.b %d0,37(%sp)
	mvz.b %d1,%d0
	cmp.l %d0,%d2
	jcc .L179
	jra .L195
.L193:
	moveq #126,%d1
	move.b 27(%sp),%d0
	move.b %d1,36(%sp)
	tst.b %d0
	jge .L178
	jra .L194
.L192:
	move.w #12,%a0
	move.b 26(%sp),%d1
	move.w %a0,%d2
	mvz.b %d1,%d0
	move.b %d2,38(%sp)
	moveq #126,%d2
	cmp.l %d0,%d2
	jcc .L177
	jra .L193
.L191:
	moveq #11,%d1
	mvz.b %d0,%d0
	lsr.l #4,%d0
	move.w %d0,%a0
	move.b %d1,34(%sp)
	moveq #12,%d1
	cmp.l %d0,%d1
	jcc .L176
	jra .L192
.L190:
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
	jcc .L175
	jra .L191
.L189:
	move.w #4,%a0
	move.b 24(%sp),%d1
	moveq #16,%d2
	move.w %a0,%d0
	move.b %d0,35(%sp)
	moveq #31,%d0
	and.l %d1,%d0
	move.w %d0,%a0
	cmp.l %d0,%d2
	jcc .L174
	jra .L190
.L187:
	lea (32,%sp),%a3
	sub.l %a1,%a1
	move.l %a3,%a2
.L168:
	move.l %a1,%d1
	add.l #489,%d1
	lea 63(%a1,%d0.l),%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcs .L165
.L198:
	addq.l #1,%a1
	move.b (%a0,%a6.l),(%a2)+
	move.l %a1,%d1
	add.l #489,%d1
	lea 63(%a1,%d0.l),%a6
	add.l %d0,%d1
	mov3q.l #2,%d2
	cmp.l %a1,%d2
	jcc .L198
.L165:
	move.b (%a0,%d1.l),(%a2)
	addq.l #1,%a1
	mov3q.l #6,%d1
	cmp.l %a1,%d1
	jeq .L167
	addq.l #1,%a2
	jra .L168
	.size	settings, .-settings
	.align	2
	.type	midi_control, @function
midi_control:
	subq.l #8,%sp
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	moveq #15,%d2
	move.l 24(%sp),%a0
	move.l 1187521622,%d0
	move.b 269161679,%d1
	cmp.l %a0,%d2
	jcs .L208
	mov3q.l #3,%d2
	and.l %d2,%d1
	move.l 20(%sp),%d2
	add.l #585088,%d0
	lsl.l #5,%d2
	move.l %d2,%a1
	mvz.w #6322,%d2
	lea (994,%a1),%a1
	muls.l %d2,%d1
	add.l %d1,%d0
	add.l %d0,%a1
	moveq #12,%d0
	cmp.l %a0,%d0
	jeq .L211
	moveq #13,%d0
	cmp.l %a0,%d0
	jeq .L212
	mov3q.l #4,%d1
	cmp.l %a0,%d1
	jne .L204
	mvz.b 2(%a1),%d1
.L202:
	lea midi_max,%a1
	mvz.b (%a1,%a0.l),%d0
	cmp.l %d0,%d1
	jcc .L199
	move.l %d1,%d0
.L199:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L211:
	mvz.b (%a1),%d1
	moveq #19,%d2
	mulu.w #43691,%d1
	lsr.l %d2,%d1
	jra .L202
.L208:
	move.l (%sp)+,%d2
	clr.l %d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L204:
	move.l 1187521622,%a1
	mov3q.l #3,%d2
	move.b 269161679,%d0
	move.l 20(%sp),%d1
	add.l #585088,%a1
	lsl.l #4,%d1
	and.l %d2,%d0
	mvz.w #6322,%d2
	move.l %d1,%a2
	lea (6206,%a2),%a2
	muls.l %d2,%d0
	moveq #22,%d2
	add.l %d0,%a1
	mvz.b (%a1,%a2.l),%d0
	cmp.l %d0,%d2
	jeq .L205
	mov3q.l #6,%d0
	cmp.l %a0,%d0
	jeq .L213
	move.l (%sp)+,%d2
	lea (first.3),%a1
	mvz.b (%a1,%a0.l),%d0
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
.L212:
	mvz.b 1(%a1),%d1
	jra .L202
.L205:
	move.l 1187521622,%d0
	add.l #585088,%d0
	move.b 269161679,%d2
	move.l %d0,12(%sp)
	lea midi_byte,%a1
	mvz.b (%a1,%a0.l),%d0
	move.l %d0,%a1
	add.l %d1,%a1
	mov3q.l #3,%d1
	move.b %d2,%d0
	mvz.w #6322,%d2
	lea (6194,%a1),%a1
	and.l %d1,%d0
	muls.l %d2,%d0
	add.l 12(%sp),%d0
	move.b (%a1,%d0.l),%d1
	add.l #64,%d1
	mvz.b %d1,%d1
	jra .L202
.L213:
	move.l 20(%sp),%d0
	addq.l #1,%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #8,%sp
	rts
	.size	midi_control, .-midi_control
	.section	.rodata.str1.1
.LC1:
	.string	"OFF"
.LC2:
	.string	"FWD"
.LC3:
	.string	""
.LC4:
	.string	"REV"
	.text
	.align	2
	.type	midi_format, @function
midi_format:
	lea (-24,%sp),%sp
	movem.l #3100,(%sp)
	move.l 32(%sp),%d2
	move.l 28(%sp),%a2
	mvz.b 269161676,%d3
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	jsr midi_control
	addq.l #8,%sp
	move.l %d0,%d1
	mov3q.l #4,%d0
	cmp.l %d2,%d0
	jeq .L249
	moveq #12,%d4
	cmp.l %d2,%d4
	jeq .L250
	mov3q.l #2,%d0
	cmp.l %d2,%d0
	jeq .L251
	mov3q.l #3,%d3
	cmp.l %d2,%d3
	jeq .L252
	moveq #11,%d0
	cmp.l %d2,%d0
	jeq .L253
	moveq #10,%d3
	cmp.l %d2,%d3
	jeq .L254
	moveq #14,%d4
	cmp.l %d2,%d4
	jeq .L255
	moveq #16,%d0
	cmp.l %d2,%d0
	jne .L256
	lea .LC3,%a0
.L227:
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
.L214:
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L251:
	moveq #12,%d2
	remu.l %d2,%d0:%d1
	lea (roots.0),%a0
	move.l (%a0,%d0.l*4),%a0
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
	jra .L214
.L249:
	move.l %a2,28(%sp)
	movem.l (%sp),#3100
	move.l %d1,32(%sp)
	move.l 1074609936,%a1
	lea (24,%sp),%sp
	jmp (%a1)
.L254:
	tst.l %d1
	jne .L245
.L222:
	lea .LC1,%a0
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
	jra .L214
.L256:
	subq.l #8,%d2
	tst.l %d2
	jne .L245
	move.l %d1,%d0
	add.l #-12,%d0
	tst.l %d0
	jlt .L257
	move.l %d0,%d1
.L245:
	move.l %a2,%a1
	mov3q.l #1,%a0
	clr.l %d0
.L230:
	moveq #99,%d3
	cmp.l %d1,%d3
	jcc .L232
	moveq #100,%d4
	moveq #10,%d3
	move.l %d1,%d0
	divu.l %d4,%d0
	add.l #48,%d0
	move.b %d0,(%a1)
	move.l %d1,%d0
	divu.l %d3,%d0
	lea 1(%a2,%a0.l),%a1
	move.l %d0,%d2
	remu.l %d3,%d4:%d2
	move.l %d4,%d0
	add.l #48,%d0
	move.b %d0,(%a2,%a0.l)
	addq.l #2,%a0
.L234:
	moveq #10,%d2
	remu.l %d2,%d0:%d1
	clr.b %d3
	add.l #48,%d0
	move.b %d0,(%a1)
	move.b %d3,(%a2,%a0.l)
	movem.l (%sp),#3100
	lea (24,%sp),%sp
	rts
.L232:
	moveq #9,%d2
	cmp.l %d1,%d2
	jcc .L234
	move.l %d0,%a0
	moveq #10,%d3
	move.l %d1,%d0
	divu.l %d3,%d0
	lea 1(%a2,%a0.l),%a1
	move.l %d0,%d2
	remu.l %d3,%d4:%d2
	move.l %d4,%d0
	add.l #48,%d0
	move.b %d0,(%a2,%a0.l)
	addq.l #2,%a0
	jra .L234
.L252:
	mov3q.l #5,%d4
	remu.l %d4,%d0:%d1
	lea vector_scale_names,%a0
	move.l (%a0,%d0.l*4),%a0
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
	jra .L214
.L253:
	tst.l %d1
	jeq .L235
	lea .LC4,%a0
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
	jra .L214
.L250:
	move.l 1074609928,%d2
	mov3q.l #2,-(%sp)
	move.l %d3,-(%sp)
	move.l %d1,28(%sp)
	jsr midi_control
	move.l %a2,36(%sp)
	move.l 28(%sp),%d1
	move.l %d2,%a1
	muls.l %d4,%d1
	movem.l 8(%sp),#3100
	add.l %d0,%d1
	move.l %d1,40(%sp)
	lea (32,%sp),%sp
	jmp (%a1)
.L235:
	lea .LC2,%a0
	move.b (%a0)+,%d0
	move.b %d0,(%a2)+
	jne .L227
	jra .L214
.L257:
	moveq #12,%d2
	mov3q.l #2,%a0
	move.l %a2,%a1
	sub.l %d1,%d2
	move.b #45,(%a1)+
	move.l %d2,%d1
	mov3q.l #1,%d0
	jra .L230
.L255:
	tst.l %d1
	jeq .L222
	move.l #268618112,%d0
	sub.l %d1,%d0
	lsl.l #2,%d0
	move.l %d0,%a1
	move.l (%a1),%a0
	tst.l %a0
	jne .L227
	move.l %a2,%a1
	mov3q.l #1,%a0
	clr.l %d0
	jra .L230
	.size	midi_format, .-midi_format
	.align	2
	.type	midi_format_0, @function
midi_format_0:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	lea midi_layout,%a0
	muls.l %d1,%d0
	mvz.b (%a0,%d0.l),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_0, .-midi_format_0
	.align	2
	.type	midi_format_1, @function
midi_format_1:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #midi_layout+1,%a0
	mvz.b (%a0),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_1, .-midi_format_1
	.align	2
	.type	midi_format_2, @function
midi_format_2:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #midi_layout+2,%a0
	mvz.b (%a0),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_2, .-midi_format_2
	.align	2
	.type	midi_format_3, @function
midi_format_3:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #midi_layout+3,%a0
	mvz.b (%a0),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_3, .-midi_format_3
	.align	2
	.type	midi_format_4, @function
midi_format_4:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #midi_layout+4,%a0
	mvz.b (%a0),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_4, .-midi_format_4
	.align	2
	.type	midi_format_5, @function
midi_format_5:
	move.l midi_view,%d0
	mov3q.l #6,%d1
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #midi_layout+5,%a0
	mvz.b (%a0),%d0
	move.l %d0,8(%sp)
	jra midi_format
	.size	midi_format_5, .-midi_format_5
	.align	2
	.type	midi_page1, @function
midi_page1:
	lea (-16,%sp),%sp
	movem.l #3084,(%sp)
	move.l 1187521622,%a0
	mov3q.l #3,%d3
	move.l 20(%sp),%d1
	move.l %d1,%d2
	lsl.l #5,%d2
	move.l 24(%sp),%a1
	add.l #585088,%a0
	lea (31,%sp),%a3
	move.l %d1,%a2
	add.l #-2147457426,%a2
	lea (994,%a1),%a1
	move.b 269161679,%d0
	add.l %d2,%a1
	mvz.w #6322,%d2
	and.l %d3,%d0
	muls.l %d2,%d0
	add.l %d0,%a0
	move.b (%a3),(%a0,%a1.l)
	move.b 269161679,%d0
	and.l %d3,%d0
	muls.l %d2,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b (%a3),(%a0,%a1.l)
	move.b (%a2),%d0
	mvz.b -2147483646,%d2
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jeq .L274
.L270:
	movem.l (%sp),#3084
	lea (16,%sp),%sp
	rts
.L274:
	move.l %d1,%a0
	add.l #-2147457418,%a0
	move.b (%a0),%d0
	mvz.b -2147483645,%d2
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jne .L270
	moveq #68,%d0
	muls.l %d1,%d0
	move.l 24(%sp),%a0
	add.l #1187474880,%a0
	move.b (%a3),(%a0,%d0.l)
	movem.l (%sp),#3084
	lea (16,%sp),%sp
	rts
	.size	midi_page1, .-midi_page1
	.align	2
	.type	mg_page_view, @function
mg_page_view:
	move.l 1175262852,%d1
	mov3q.l #4,%d0
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	cmp.l %d1,%d0
	jcs .L283
	tst.l 1175263034
	jne .L283
	tst.l 1175262868
	jne .L283
	move.l 24(%sp),%d0
	add.l #3089,%d0
	mvz.w %d0,%d0
	move.l 20(%sp),%a0
	lea (%a0,%d0.l*2),%a0
	move.b 1(%a0),%d0
	mvz.b (%a0),%d2
	move.l %d2,%a1
	moveq #77,%d2
	cmp.l %a1,%d2
	jne .L283
	tst.l 16(%sp)
	jeq .L283
	mvz.b %d0,%d0
	move.l 12(%sp),%a2
	move.l %d0,%a1
	move.l (%a2),%d0
	move.l %d0,%a2
	cmp.l 8(%a2),%a1
	jeq .L287
	move.b (%a0),%d0
.L283:
	move.l (%sp)+,%d2
	clr.l %d0
	move.l (%sp)+,%a2
	rts
.L287:
	mov3q.l #4,%d2
	or.l 12(%a2),%d2
	btst %d1,%d2
	jeq .L283
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
	.size	mg_page_view, .-mg_page_view
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
	jeq .L296
	mov3q.l #5,%d2
	move.l %a6,%d0
	cmp.l %a6,%d2
	jcc .L291
	subq.l #1,%d0
.L291:
	mvz.b 9(%sp,%d0.l),%d0
	move.l %d0,%a0
.L290:
	move.l 48(%sp),-(%sp)
	move.l 48(%sp),-(%sp)
	moveq #-2,%d0
	and.l 48(%sp),%d0
	lea vector_control_max,%a1
	mvz.b (%a1,%a6.l),%d1
	move.l %d0,-(%sp)
	move.l %d1,%d0
	cmp.l %d1,%a0
	jcc .L292
	move.l %a0,%d0
.L292:
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
.L296:
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
	jra .L290
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
	jcc .L301
	move.l (%sp)+,%d2
	addq.l #8,%sp
	rts
.L301:
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
	jcc .L306
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L306:
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
	jeq .L335
	mov3q.l #5,%d0
	cmp.l %d2,%d0
	jcs .L310
	mvz.b 17(%sp,%d2.l),%d0
	move.l %d2,%d1
	mov3q.l #1,%d3
	subq.l #2,%d1
	cmp.l %d1,%d3
	jcs .L309
	subq.l #2,%d2
	tst.l %d2
	jeq .L336
	mov3q.l #5,%d3
	remu.l %d3,%d1:%d0
	lea vector_scale_names,%a0
	move.l 32(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
.L316:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L316
.L307:
	movem.l (%sp),#16412
	lea (28,%sp),%sp
	rts
.L310:
	mvz.b 16(%sp,%d2.l),%d0
	moveq #11,%d4
	cmp.l %d2,%d4
	jne .L337
	tst.l %d0
	jeq .L327
	move.l 32(%sp),%a1
	lea .LC4,%a0
.L320:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jeq .L307
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L320
	jra .L307
.L335:
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
.L309:
	moveq #99,%d3
	cmp.l %d0,%d3
	jcc .L328
.L339:
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
.L325:
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
.L328:
	move.l 32(%sp),%a0
	mov3q.l #1,%a1
	clr.l %d1
	moveq #9,%d2
	cmp.l %d0,%d2
	jcc .L325
.L340:
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
	jra .L325
.L327:
	move.l 32(%sp),%a1
	lea .LC2,%a0
	jra .L320
.L336:
	moveq #12,%d2
	remu.l %d2,%d1:%d0
	lea (roots.6),%a0
	move.l 32(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
	jra .L316
.L337:
	moveq #10,%d4
	cmp.l %d2,%d4
	jne .L318
	tst.l %d0
	jne .L309
	move.l 32(%sp),%a1
	lea .LC1,%a0
	jra .L320
.L318:
	subq.l #8,%d2
	tst.l %d2
	jne .L309
	move.l %d0,%d1
	add.l #-12,%d1
	tst.l %d1
	jlt .L338
	move.l %d1,%d0
	moveq #99,%d3
	cmp.l %d0,%d3
	jcs .L339
	jra .L328
.L338:
	move.l 32(%sp),%a0
	moveq #12,%d2
	sub.l %d0,%d2
	move.l %d2,%d0
	mov3q.l #2,%a1
	move.b #45,(%a0)+
	mov3q.l #1,%d1
	moveq #9,%d2
	cmp.l %d0,%d2
	jcc .L325
	jra .L340
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
	jeq .L350
	lea .LC4,%a0
	move.l 16(%sp),%a1
.L349:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L349
	lea (12,%sp),%sp
	rts
.L350:
	move.l 16(%sp),%a1
	lea .LC2,%a0
	jra .L349
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
.L355:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L355
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
	lea (roots.6),%a0
	remu.l %d2,%d1:%d0
	move.l 20(%sp),%a1
	move.l (%a0,%d1.l*4),%a0
.L360:
	move.b (%a0)+,%d0
	move.b %d0,(%a1)+
	jne .L360
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
	jcc .L365
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
.L367:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L365:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L371
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
.L371:
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
	jra .L367
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
	jcc .L373
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
.L375:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L373:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L379
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
.L379:
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
	jra .L375
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
	jcc .L381
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
.L383:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L381:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L387
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
.L387:
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
	jra .L383
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
	jcc .L389
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
.L391:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L389:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L395
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
.L395:
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
	jra .L391
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
	jcc .L397
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
.L399:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L397:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L403
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
.L403:
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
	jra .L399
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
	jcc .L405
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
.L407:
	moveq #10,%d2
	remu.l %d2,%d1:%d0
	clr.b %d3
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d3,(%a6,%a1.l)
	movem.l (%sp),#16412
	lea (36,%sp),%sp
	rts
.L405:
	moveq #9,%d4
	cmp.l %d0,%d4
	jcs .L411
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
.L411:
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
	jra .L407
	.size	format_0, .-format_0
	.align	2
	.type	midi_set_control, @function
midi_set_control:
	lea (-44,%sp),%sp
	moveq #12,%d0
	movem.l #1084,(%sp)
	move.l 52(%sp),%d4
	move.l 48(%sp),%d2
	move.l 56(%sp),%d3
	cmp.l %d4,%d0
	jeq .L413
	mov3q.l #2,%d1
	cmp.l %d4,%d1
	jeq .L414
	moveq #13,%d5
	cmp.l %d4,%d5
	jeq .L415
	mov3q.l #4,%d0
	cmp.l %d4,%d0
	jeq .L431
.L417:
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	move.l %d2,%d5
	add.l #585088,%a0
	lsl.l #4,%d5
	and.l %d1,%d0
	mvz.w #6322,%d1
	move.l %d5,%a1
	moveq #22,%d5
	lea (6206,%a1),%a2
	move.l %a2,24(%sp)
	muls.l %d1,%d0
	add.l %d0,%a0
	mvz.b (%a0,%a2.l),%d0
	cmp.l %d0,%d5
	jeq .L432
	lea midi_byte,%a0
	clr.l %d1
	lea (6194,%a1),%a1
	moveq #13,%d0
	move.l %a0,32(%sp)
	move.l %a1,28(%sp)
	cmp.l %d1,%d0
	jcs .L421
.L433:
	moveq #11,%d5
	cmp.l %d1,%d5
	jcs .L422
	mov3q.l #4,%d0
	cmp.l %d1,%d0
	jeq .L422
.L423:
	move.l %d1,-(%sp)
	move.l #269161679,%a2
	move.l %d2,-(%sp)
	move.l %d1,28(%sp)
	jsr midi_control
	mov3q.l #3,%d5
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b (%a2),51(%sp)
	move.l 28(%sp),%d1
	move.l %d0,%a1
	move.l 40(%sp),%a2
	lea (-64,%a1),%a1
	move.l %a1,44(%sp)
	mvz.b (%a2,%d1.l),%d0
	addq.l #8,%sp
	lea (39,%sp),%a2
	move.l 28(%sp),%a1
	add.l %d0,%a1
	move.b 43(%sp),%d0
	and.l %d5,%d0
	mvz.w #6322,%d5
	muls.l %d5,%d0
	mov3q.l #3,%d5
	add.l %d0,%a0
	move.b (%a2),(%a0,%a1.l)
	move.b 269161679,%d0
	and.l %d5,%d0
	mvz.w #6322,%d5
	muls.l %d5,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b (%a2),(%a0,%a1.l)
.L422:
	addq.l #1,%d1
	moveq #13,%d0
	cmp.l %d1,%d0
	jcc .L433
.L421:
	moveq #16,%d5
	cmp.l %d1,%d5
	jne .L423
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	mvz.w #6322,%d5
	add.l #585088,%a0
	move.l 24(%sp),%a1
	add.l #-64,%d3
	move.l 32(%sp),%a2
	mvz.b (%a2,%d4.l),%d2
	and.l %d1,%d0
	move.l 24(%sp),%d1
	muls.l %d5,%d0
	mov3q.l #3,%d5
	add.l %d0,%a0
	moveq #22,%d0
	move.b %d0,(%a0,%d1.l)
	mvz.w #6322,%d1
	move.b 269161679,%d0
	and.l %d5,%d0
	moveq #22,%d5
	muls.l %d1,%d0
	mov3q.l #3,%d1
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b %d5,(%a0,%a1.l)
	mvz.w #6322,%d5
	move.l 28(%sp),%a1
	add.l %d2,%a1
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d0
	and.l %d1,%d0
	muls.l %d5,%d0
	add.l %d0,%a0
	move.b %d3,(%a0,%a1.l)
	move.b 269161679,%d0
	and.l %d1,%d0
	muls.l %d5,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b %d3,(%a0,%a1.l)
	movem.l (%sp),#1084
	lea (44,%sp),%sp
	rts
.L413:
	mov3q.l #2,-(%sp)
	move.l %d2,-(%sp)
	jsr midi_control
	move.l %d2,56(%sp)
	clr.l 60(%sp)
	moveq #12,%d1
	muls.l %d1,%d3
	add.l %d0,%d3
	move.l %d3,64(%sp)
	movem.l 8(%sp),#1084
	lea (52,%sp),%sp
	jra midi_page1
.L415:
	move.l %d3,56(%sp)
	move.l %d2,48(%sp)
	movem.l (%sp),#1084
	mov3q.l #1,52(%sp)
	lea (44,%sp),%sp
	jra midi_page1
.L431:
	move.l %d3,56(%sp)
	move.l %d2,48(%sp)
	movem.l (%sp),#1084
	mov3q.l #2,52(%sp)
	lea (44,%sp),%sp
	jra midi_page1
.L432:
	lea midi_byte,%a0
	mov3q.l #3,%d1
	move.l %a0,32(%sp)
	lea (6194,%a1),%a1
	add.l #-64,%d3
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.l %a1,28(%sp)
	mvz.w #6322,%d5
	move.b 269161679,%d0
	move.l 32(%sp),%a2
	move.l 28(%sp),%a1
	mvz.b (%a2,%d4.l),%d2
	add.l %d2,%a1
	and.l %d1,%d0
	muls.l %d5,%d0
	add.l %d0,%a0
	move.b %d3,(%a0,%a1.l)
	move.b 269161679,%d0
	and.l %d1,%d0
	muls.l %d5,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b %d3,(%a0,%a1.l)
	movem.l (%sp),#1084
	lea (44,%sp),%sp
	rts
.L414:
	move.l 1187521622,%a1
	mov3q.l #3,%d1
	move.b 269161679,%d0
	move.l %d2,%d5
	add.l #585088,%a1
	lsl.l #5,%d5
	and.l %d1,%d0
	mvz.w #6322,%d1
	move.l %d5,%a0
	moveq #19,%d5
	lea (994,%a0),%a0
	muls.l %d1,%d0
	moveq #9,%d1
	add.l %d0,%a1
	mvz.b (%a1,%a0.l),%d0
	mulu.w #43691,%d0
	lsr.l %d5,%d0
	cmp.l %d0,%d1
	jcc .L418
	moveq #9,%d0
.L418:
	mulu.w #12,%d0
	move.l %d0,%a0
	pea (%a0,%d3.l)
	clr.l -(%sp)
	move.l %d2,-(%sp)
	jsr midi_page1
	lea (12,%sp),%sp
	jra .L417
	.size	midi_set_control, .-midi_set_control
	.align	2
	.type	midi_generate, @function
midi_generate:
	link.w %fp,#-148
	movem.l #15612,(%sp)
	move.b 269161680,%d0
	move.l 1187521622,%d1
	add.l #-1073741824,%d1
	cmp.l #133169151,%d1
	jhi .L441
	mov3q.l #7,%d1
	cmp.l 8(%fp),%d1
	jcs .L441
	mvz.b %d0,%d1
	moveq #15,%d2
	cmp.l %d1,%d2
	jcs .L441
	ext.w %d0
	mvz.w #2224,%d6
	move.l 1187521622,%d1
	move.l %d1,%a0
	move.l 8(%fp),%d4
	move.b 269161679,%d3
	mulu.w #36568,%d0
	muls.l %d6,%d4
	lea (18640,%a0),%a0
	move.l %d4,%a1
	add.l %d0,%a1
	move.b %d3,-61(%fp)
	move.l %a1,-76(%fp)
	lea (%a1,%a0.l),%a5
	tst.l 12(%fp)
	jeq .L515
	move.l %d0,%a0
	move.l #36437,%a1
	add.l %d1,%a0
	tst.b (%a0,%a1.l)
	jeq .L444
.L519:
	move.b 40(%a5),%d3
	clr.l %d2
	lea midi_control,%a2
	mvz.b %d3,%d3
.L450:
	mov3q.l #6,%d7
	cmp.l %d2,%d7
	jne .L446
	mov3q.l #7,%d2
.L446:
	move.l %d2,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	mov3q.l #5,%d1
	cmp.l %d2,%d1
	jcc .L516
	move.b %d0,-52(%fp,%d2.l)
	addq.l #1,%d2
	moveq #12,%d4
	cmp.l %d2,%d4
	jne .L450
	mov3q.l #6,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	move.l %d0,-72(%fp)
	tst.l 16(%fp)
	jeq .L451
	addq.l #1,%d0
	moveq #127,%d6
	and.l %d0,%d6
	move.l %d6,-72(%fp)
.L451:
	move.l 1187521622,%d0
	move.l %d3,%a0
	move.b 269161679,%d1
	subq.l #1,%a0
	moveq #63,%d7
	cmp.l %a0,%d7
	jcs .L441
	mov3q.l #3,%d2
	and.l %d2,%d1
	move.l %d0,%a3
	add.l #585088,%a3
	move.l 8(%fp),%d0
	mvz.w #6322,%d4
	lsl.l #5,%d0
	muls.l %d4,%d1
	add.l #994,%d0
	add.l %d1,%a3
	add.l %d0,%a3
	tst.b 1(%a3)
	jlt .L441
	mvz.b 1(%a3),%d0
	moveq #127,%d6
	cmp.l %d0,%d6
	jcs .L441
	move.l -72(%fp),-(%sp)
	move.l %d0,-(%sp)
	moveq #19,%d4
	move.l %d3,-(%sp)
	pea -51(%fp)
	pea phrase
	jsr (vector_generate.part.0)
	pea 15.w
	move.l 8(%fp),-(%sp)
	jsr (%a2)
	pea 14.w
	move.l 8(%fp),-(%sp)
	move.l %d0,-92(%fp)
	jsr (%a2)
	move.b (%a3),%d3
	mvz.b (%a3),%d1
	lea (36,%sp),%sp
	move.l %a5,%a0
	move.l %d0,-84(%fp)
	move.w %d1,%d2
	move.l %fp,%d0
	add.l #-40,%d0
	sub.l %d0,%a0
	move.l %a0,-56(%fp)
	move.l -56(%fp),%a1
	move.l %d0,%a0
	mvz.b %d3,%d3
	move.l %fp,-100(%fp)
	mulu.w #43691,%d2
	lsr.l %d4,%d2
	muls.w #12,%d2
	sub.l %d2,%d1
	mvz.b %d1,%d1
	sub.l %d1,%d3
	move.l %d3,-88(%fp)
.L452:
	move.b (%a1,%a0.l),%d1
	move.b %d1,(%a0)+
	cmp.l -100(%fp),%a0
	jne .L452
	move.l -72(%fp),%d1
	move.l #-1640531527,%d6
	addq.l #1,%d1
	muls.l %d1,%d6
	move.l #-2048144789,%d1
	moveq #30,%d7
	move.l %d1,-96(%fp)
	move.l -92(%fp),%d1
	clr.l %d2
	sub.l -84(%fp),%d7
	move.l -76(%fp),%a4
	add.l #268546638,%a4
	lea phrase,%a1
	add.l %d1,%d1
	move.l -76(%fp),%a3
	add.l #268544592,%a3
	move.l %d6,-68(%fp)
	lea (2097,%a5),%a2
	move.l %d7,-60(%fp)
	lea (80,%a5),%a0
	addq.l #1,%d1
	move.l %d1,-80(%fp)
.L477:
	mov3q.l #7,%d6
	and.l %d2,%d6
	move.l %d2,%d3
	lsr.l #3,%d3
	lea (-32,%a0),%a5
	mov3q.l #1,%d4
	move.l %a5,-104(%fp)
	mov3q.l #7,%a5
	sub.l %d3,%a5
	add.l %d0,%a5
	move.l %a5,-108(%fp)
	mvz.b (%a5),%d1
	asr.l %d6,%d1
	and.l %d4,%d1
	tst.b (%a1)
	jeq .L453
	mvz.b 1(%a1),%d4
	mov3q.l #5,%d7
	add.l #-64,%d4
	divs.l %d7,%d4
	move.l -88(%fp),%d5
	add.l %d4,%d5
	tst.l %d5
	jlt .L487
	moveq #127,%d4
	cmp.l %d5,%d4
	jge .L454
	moveq #127,%d5
.L454:
	move.l -104(%fp),%a5
	mvz.b %d5,%d4
	mvz.b (%a5),%d7
	cmp.l %d4,%d7
	jeq .L483
.L482:
	move.l -104(%fp),%a5
	move.b %d5,(%a5)
	move.b %d5,-2(%a3)
	tst.b (%a1)
	jeq .L455
.L483:
	move.b 3(%a1),%d4
	mvz.b -31(%a0),%d7
	lea (-31,%a0),%a5
	move.l %a5,-104(%fp)
	mvz.b %d4,%d5
	cmp.l %d7,%d5
	jeq .L456
	move.l -104(%fp),%a5
	move.b %d4,(%a5)
	move.b %d4,-1(%a3)
	tst.b (%a1)
	jne .L456
.L457:
	mvz.b -30(%a0),%d4
	lea (-30,%a0),%a5
	move.l %a5,-104(%fp)
	cmp.l #255,%d4
	jeq .L517
	st %d4
.L458:
	mov3q.l #1,%d5
	move.l -104(%fp),%a5
	lsl.l %d6,%d5
	move.b %d4,(%a5)
	move.b %d4,(%a3)
	tst.b (%a1)
	jeq .L460
	move.l -108(%fp),%a5
	move.b (%a5),%d4
	or.l %d5,%d4
.L461:
	move.l -108(%fp),%a5
	move.b %d4,(%a5)
	move.b (%a1),%d4
	tst.l %d1
	jne .L462
.L520:
	tst.b %d4
	jeq .L464
.L463:
	tst.l -92(%fp)
	jeq .L490
	move.l -96(%fp),%d4
	moveq #15,%d6
	move.l -68(%fp),%d1
	move.l #739982445,%d7
	eor.l %d4,%d1
	move.l %d1,%d4
	lsr.l %d6,%d4
	moveq #12,%d6
	eor.l %d4,%d1
	muls.l %d7,%d1
	move.l -80(%fp),%d7
	move.l %d1,%d4
	lsr.l %d6,%d4
	eor.l %d4,%d1
	remu.l %d7,%d4:%d1
	move.l %d4,%d1
	sub.l -92(%fp),%d1
	lsl.l #7,%d1
	and.l #8064,%d1
.L466:
	tst.l -84(%fp)
	jeq .L468
	mov3q.l #3,%d4
	and.l %d2,%d4
	tst.l %d4
	jeq .L468
	or.l -60(%fp),%d1
.L468:
	move.l %d1,%d4
	lsr.l #8,%d4
.L465:
	move.l %a2,%a5
	mvz.b -(%a5),%d7
	mvz.b %d4,%d6
	cmp.l %d7,%d6
	jeq .L470
	move.b %d4,(%a5)
	move.b %d4,(%a4)
.L470:
	mvz.b (%a2),%d6
	mvz.b %d1,%d4
	cmp.l %d6,%d4
	jeq .L471
	move.b %d1,(%a2)
	move.b %d1,1(%a4)
.L471:
	clr.l %d1
	sub.l %d3,%d1
	move.l %d1,%d4
	add.l %d0,%d4
	move.l %d4,%a5
	move.l %d5,%d6
	move.b 15(%a5),%d1
	not.l %d6
	sub.l %a5,%a5
	sub.l %d3,%a5
	move.l %a5,%d7
	move.l %d4,%a5
	add.l %d0,%d7
	and.l %d6,%d1
	move.b %d1,15(%a5)
	move.l %d7,%a5
	move.b 39(%a5),%d1
	and.l %d6,%d1
	move.b %d1,39(%a5)
	move.b (%a1),%d1
	jeq .L464
	lea (locked.4),%a5
	move.b %d1,(%a5,%d2.l)
	move.w #23,%a5
	sub.l %d3,%a5
	add.l %d0,%a5
	move.b (%a5),%d1
	and.l %d6,%d1
.L476:
	move.b %d1,(%a5)
	move.l #-2048144789,%d1
	addq.l #1,%d2
	addq.l #4,%a1
	addq.l #2,%a2
	addq.l #2,%a4
	add.l %d1,-96(%fp)
	lea (32,%a3),%a3
	lea (32,%a0),%a0
	move.l #phrase+256,%d3
	cmp.l %d3,%a1
	jne .L477
	move.l #268544541,%a2
	sub.l %d0,%a2
	add.l -76(%fp),%a2
	move.l -56(%fp),%d1
	move.l %d0,%a0
	subq.l #1,%d1
.L479:
	move.b (%a0)+,%d0
	mvz.b (%a0,%d1.l),%d2
	mvz.b %d0,%d3
	cmp.l %d3,%d2
	jeq .L478
	move.b %d0,(%a0,%d1.l)
	move.b %d0,(%a2,%a0.l)
.L478:
	cmp.l -100(%fp),%a0
	jne .L479
	tst.l 16(%fp)
	jne .L518
	move.b -61(%fp),%d0
	mov3q.l #3,%d4
	mov3q.l #1,%d2
	move.l 1187521622,%a0
	move.l %d2,%d1
	add.l #610376,%a0
	move.b (%a0),%d3
	and.l %d4,%d0
	lsl.l %d0,%d1
	or.l %d1,%d3
	move.b %d3,(%a0)
	move.l #1187500772,%d3
	move.b 269161566,%d0
	or.l %d0,%d1
	move.b %d1,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	move.l 8(%fp),%d6
	move.l %d6,%d4
	lsl.l %d6,%d2
	lea (locked.4),%a0
	sub.l %a0,%d3
	not.l %d2
.L481:
	lea (%a0,%d3.l),%a1
	move.b (%a1),%d0
	move.b (%a0)+,%d1
	and.l %d2,%d0
	lsl.l %d4,%d1
	or.l %d1,%d0
	move.b %d0,(%a1)
	cmp.l #locked.4+64,%a0
	jne .L481
	move.l 8(%fp),%a0
	pea 8(%a0)
	jsr 1074387488
	movem.l -148(%fp),#15612
	addq.l #4,%sp
	mov3q.l #1,%d0
	unlk %fp
	rts
.L441:
	movem.l -148(%fp),#15612
	clr.l %d0
	unlk %fp
	rts
.L444:
	mvz.w #36435,%d0
	clr.l %d2
	lea midi_control,%a2
	move.b (%a0,%d0.l),%d3
	mvz.b %d3,%d3
	jra .L450
.L515:
	lea (24,%a5),%a1
	move.l %a5,%a0
.L440:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L441
	cmp.l %a1,%a0
	jne .L440
	lea (32,%a5),%a0
	lea (40,%a5),%a1
.L442:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L441
	cmp.l %a1,%a0
	jne .L442
	lea (48,%a5),%a0
	lea (2096,%a5),%a1
.L443:
	mvz.b (%a0),%d2
	addq.l #1,%a0
	cmp.l #255,%d2
	jne .L441
	cmp.l %a1,%a0
	jne .L443
	move.l %d0,%a0
	move.l #36437,%a1
	add.l %d1,%a0
	tst.b (%a0,%a1.l)
	jeq .L444
	jra .L519
.L516:
	move.b %d0,-51(%fp,%d2.l)
	addq.l #1,%d2
	jra .L450
.L455:
	mvz.b -31(%a0),%d4
	lea (-31,%a0),%a5
	move.l %a5,-104(%fp)
	cmp.l #255,%d4
	jeq .L457
	st %d4
	move.l -104(%fp),%a5
	move.b %d4,(%a5)
	move.b %d4,-1(%a3)
	tst.b (%a1)
	jeq .L457
	jra .L456
.L517:
	mov3q.l #1,%d5
	lsl.l %d6,%d5
.L460:
	move.l -108(%fp),%a5
	move.l %d5,%d6
	not.l %d6
	move.b (%a5),%d4
	move.l -108(%fp),%a5
	and.l %d6,%d4
	move.b %d4,(%a5)
	move.b (%a1),%d4
	tst.l %d1
	jeq .L520
.L462:
	tst.b %d4
	jne .L463
	clr.b %d1
	jra .L465
.L456:
	move.b 2(%a1),%d4
	mvz.b -30(%a0),%d5
	lea (-30,%a0),%a5
	move.l %a5,-104(%fp)
	mvz.b %d4,%d7
	cmp.l %d7,%d5
	jne .L458
	move.l -108(%fp),%a5
	mov3q.l #1,%d5
	lsl.l %d6,%d5
	move.b (%a5),%d4
	or.l %d5,%d4
	jra .L461
.L464:
	lea (-29,%a0),%a5
.L474:
	mvz.b (%a5),%d1
	addq.l #1,%a5
	cmp.l #255,%d1
	jne .L473
	cmp.l %a0,%a5
	jne .L474
	clr.b %d1
	lea (locked.4),%a5
	move.b %d1,(%a5,%d2.l)
.L512:
	move.w #23,%a5
	move.l %d5,%d6
	not.l %d6
	sub.l %d3,%a5
	add.l %d0,%a5
	move.b (%a5),%d1
	and.l %d6,%d1
	jra .L476
.L518:
	move.l -72(%fp),-(%sp)
	mov3q.l #6,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr midi_set_control
	mov3q.l #3,%d4
	mov3q.l #1,%d2
	lea (12,%sp),%sp
	move.b -61(%fp),%d0
	move.l 1187521622,%a0
	move.l %d2,%d1
	add.l #610376,%a0
	move.b (%a0),%d3
	and.l %d4,%d0
	lsl.l %d0,%d1
	or.l %d1,%d3
	move.b %d3,(%a0)
	move.l #1187500772,%d3
	move.b 269161566,%d0
	or.l %d0,%d1
	move.b %d1,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	move.l 8(%fp),%d6
	move.l %d6,%d4
	lsl.l %d6,%d2
	lea (locked.4),%a0
	sub.l %a0,%d3
	not.l %d2
	jra .L481
.L473:
	moveq #1,%d1
	lea (locked.4),%a5
	move.b %d1,(%a5,%d2.l)
	tst.b (%a1)
	jne .L512
	move.w #23,%a5
	sub.l %d3,%a5
	add.l %d0,%a5
	move.b (%a5),%d1
	or.l %d5,%d1
	jra .L476
.L453:
	move.l -104(%fp),%a5
	mvz.b (%a5),%d4
	cmp.l #255,%d4
	jeq .L455
	st %d5
	move.l -104(%fp),%a5
	move.b %d5,(%a5)
	move.b %d5,-2(%a3)
	tst.b (%a1)
	jne .L483
	jra .L455
.L487:
	clr.b %d5
	move.l -104(%fp),%a5
	mvz.b (%a5),%d7
	mvz.b %d5,%d4
	cmp.l %d4,%d7
	jne .L482
	jra .L483
.L490:
	clr.l %d1
	jra .L466
	.size	midi_generate, .-midi_generate
	.section	.rodata.str1.1
.LC5:
	.string	"VECTOR GENERATED"
.LC6:
	.string	"NO CHANGE"
	.text
	.align	2
	.type	vector_midi_yes, @function
vector_midi_yes:
	move.b 269161676,%d0
	mov3q.l #1,-(%sp)
	mov3q.l #1,-(%sp)
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr midi_generate
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L523
	move.l #.LC5,%d0
	pea 32.w
	move.l %d0,-(%sp)
	jsr 1074111160
	addq.l #8,%sp
	rts
.L523:
	move.l #.LC6,%d0
	pea 32.w
	move.l %d0,-(%sp)
	jsr 1074111160
	addq.l #8,%sp
	rts
	.size	vector_midi_yes, .-vector_midi_yes
	.align	2
	.type	vector_midi_knob, @function
vector_midi_knob:
	lea (-16,%sp),%sp
	move.l %d2,-(%sp)
	move.l 28(%sp),%a1
	mov3q.l #5,%d2
	move.b 269161676,%d1
	move.l 24(%sp),%d0
	move.l 32(%sp),12(%sp)
	cmp.l %a1,%d2
	jcs .L526
	tst.l %d0
	jeq .L528
	mov3q.l #1,%d0
	and.l 36(%sp),%d0
	addq.l #1,%d0
.L528:
	mov3q.l #6,%d2
	muls.l %d2,%d0
	moveq #15,%d2
	move.l %d0,%a0
	add.l #midi_layout,%a0
	mvz.b (%a0,%a1.l),%d0
	cmp.l %d0,%d2
	jcc .L537
.L526:
	move.l (%sp)+,%d2
	lea (16,%sp),%sp
	rts
.L537:
	mvz.b %d1,%d1
	move.l %d1,16(%sp)
	move.l %d0,-(%sp)
	move.l %d1,-(%sp)
	move.l %d0,12(%sp)
	jsr midi_control
	move.l %d0,%a1
	add.l 20(%sp),%d0
	addq.l #8,%sp
	move.l 4(%sp),%a0
	tst.l %d0
	jlt .L531
	move.l #midi_max,%d1
	mvz.b (%a0,%d1.l),%d1
	cmp.l %d1,%d0
	jge .L529
	move.l %d0,%d1
.L529:
	cmp.l %a1,%d1
	jeq .L526
	move.l %d1,-(%sp)
	move.l %a0,-(%sp)
	move.l 24(%sp),-(%sp)
	move.l %a0,16(%sp)
	move.l %a1,20(%sp)
	jsr midi_set_control
	clr.l -(%sp)
	mov3q.l #1,-(%sp)
	move.l 36(%sp),-(%sp)
	jsr midi_generate
	lea (24,%sp),%sp
	move.l 4(%sp),%a0
	tst.l %d0
	jne .L526
	move.l 8(%sp),32(%sp)
	move.l %a0,28(%sp)
	move.l 16(%sp),24(%sp)
	move.l (%sp)+,%d2
	lea (16,%sp),%sp
	jra midi_set_control
.L531:
	clr.l %d1
	jra .L529
	.size	vector_midi_knob, .-vector_midi_knob
	.align	2
	.type	vector_midi_assign.part.0, @function
vector_midi_assign.part.0:
	lea (-16,%sp),%sp
	movem.l #1052,(%sp)
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.l 20(%sp),%d3
	move.l %d3,%d1
	lsl.l #5,%d1
	mvz.w #6322,%d4
	add.l #585088,%a0
	move.b 269161679,%d0
	move.l %d1,%a1
	lea (994,%a1),%a1
	and.l %d2,%d0
	muls.l %d4,%d0
	add.l %d0,%a0
	mvz.b (%a0,%a1.l),%d2
	move.l %d3,%a0
	pea 1(%a0)
	mov3q.l #6,-(%sp)
	move.l %d3,-(%sp)
	jsr midi_set_control
	lea (12,%sp),%sp
	moveq #119,%d0
	cmp.l %d2,%d0
	jcs .L541
	move.l %d2,%d1
	moveq #12,%d4
	remu.l %d4,%d0:%d1
	lea midi_page1,%a2
	sub.l %d0,%d2
	move.l %d2,-(%sp)
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
	mov3q.l #3,%d2
.L540:
	pea 64.w
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a2)
	addq.l #1,%d2
	lea (12,%sp),%sp
	mov3q.l #6,%d0
	cmp.l %d2,%d0
	jne .L540
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d3,-(%sp)
	jsr midi_generate
	movem.l 12(%sp),#1052
	lea (28,%sp),%sp
	rts
.L541:
	moveq #108,%d2
	move.l %d2,-(%sp)
	clr.l -(%sp)
	move.l %d3,-(%sp)
	lea midi_page1,%a2
	mov3q.l #3,%d2
	jsr (%a2)
	lea (12,%sp),%sp
	jra .L540
	.size	vector_midi_assign.part.0, .-vector_midi_assign.part.0
	.align	2
	.type	vector_midi_assign, @function
vector_midi_assign:
	tst.l 8(%sp)
	jne .L549
	rts
.L549:
	jra (vector_midi_assign.part.0)
	.size	vector_midi_assign, .-vector_midi_assign
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
	jcc .L553
	moveq #4,%d0
.L553:
	move.b (%a0),%d1
	lsl.l #4,%d0
	moveq #15,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L554
	moveq #15,%d1
.L554:
	or.l %d1,%d0
	move.b %d0,(%a1)
	move.b 10(%a0),%d0
	jeq .L555
	moveq #1,%d0
.L555:
	move.b 1(%a0),%d1
	lsl.l #5,%d0
	moveq #16,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L556
	moveq #16,%d1
.L556:
	or.l %d1,%d0
	moveq #12,%d2
	move.b %d0,1(%a1)
	move.b 6(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L557
	moveq #12,%d0
.L557:
	move.b 2(%a0),%d1
	lsl.l #4,%d0
	moveq #11,%d3
	mvz.b %d1,%d2
	cmp.l %d2,%d3
	jcc .L558
	moveq #11,%d1
.L558:
	or.l %d1,%d0
	moveq #126,%d2
	move.b %d0,2(%a1)
	move.b 4(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L559
	moveq #126,%d0
.L559:
	move.b %d0,3(%a1)
	move.b 5(%a0),%d0
	jpl .L560
	moveq #127,%d0
.L560:
	move.b %d0,4(%a1)
	moveq #24,%d3
	move.b 7(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d3
	jcc .L561
	moveq #24,%d0
.L561:
	move.b %d0,5(%a1)
	moveq #63,%d2
	move.b 8(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L562
	moveq #63,%d0
.L562:
	move.b %d0,6(%a1)
	moveq #64,%d3
	move.b 9(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d3
	jcc .L563
	moveq #64,%d0
.L563:
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
.L572:
	move.b (%a4)+,%d2
	mov3q.l #2,%d0
	cmp.l %a6,%d0
	jcc .L576
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
	jne .L572
.L577:
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
.L576:
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
	jne .L572
	jra .L577
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
	jcc .L579
	moveq #4,%d1
.L579:
	move.b %d1,3(%a1)
	moveq #31,%d1
	moveq #16,%d2
	move.b 1(%a0),%d0
	and.l %d1,%d0
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L580
	moveq #16,%d1
.L580:
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
	jcc .L581
	moveq #11,%d1
.L581:
	move.b %d1,2(%a1)
	moveq #12,%d2
	mvz.b 2(%a0),%d0
	lsr.l #4,%d0
	move.b %d0,%d1
	cmp.l %d0,%d2
	jcc .L582
	moveq #12,%d1
.L582:
	move.b %d1,6(%a1)
	moveq #126,%d2
	move.b 3(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L583
	moveq #126,%d0
.L583:
	move.b %d0,4(%a1)
	move.b 4(%a0),%d0
	jpl .L584
	moveq #127,%d0
.L584:
	move.b %d0,5(%a1)
	moveq #24,%d2
	move.b 5(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L585
	moveq #24,%d0
.L585:
	move.b %d0,7(%a1)
	moveq #63,%d2
	move.b 6(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L586
	moveq #63,%d0
.L586:
	move.b %d0,8(%a1)
	moveq #64,%d2
	move.b 7(%a0),%d0
	mvz.b %d0,%d1
	cmp.l %d1,%d2
	jcc .L587
	moveq #64,%d0
.L587:
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
	jeq .L592
	tst.l %d1
	jeq .L592
	lea (-1,%a0),%a2
	moveq #63,%d2
	cmp.l %a2,%d2
	jcs .L592
	moveq #127,%d2
	cmp.l 28(%sp),%d2
	jcs .L592
	move.l %a0,24(%sp)
	move.l %d1,20(%sp)
	move.l %d0,16(%sp)
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	addq.l #4,%sp
	jra (vector_generate.part.0)
.L592:
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
	jeq .L602
	mvz.w #2329,%d0
	cmp.l 8(%sp),%d0
	jcc .L602
	move.l %d1,%d0
	move.l %d1,%a0
	add.l #64,%d0
.L603:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L602
	cmp.l %a0,%d0
	jne .L603
	move.l %d1,%a0
	move.l %d1,%d0
	lea (72,%a0),%a0
	add.l #80,%d0
.L604:
	addq.l #1,%a0
	tst.b -1(%a0)
	jne .L602
	cmp.l %a0,%d0
	jne .L604
	move.l %d1,%a0
	add.l #2137,%d1
	lea (89,%a0),%a0
.L605:
	mvz.b (%a0),%d0
	addq.l #1,%a0
	cmp.l #255,%d0
	jne .L602
	cmp.l %a0,%d1
	jne .L605
	mov3q.l #1,%d0
	rts
.L602:
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
	jeq .L612
	move.l 48(%sp),%d0
	cmp.l #2329,%d0
	jls .L612
	tst.l 52(%sp)
	jeq .L612
	move.l 52(%sp),%a0
	moveq #63,%d1
	move.b 256(%a0),%d4
	move.l %d4,%d0
	subq.l #1,%d0
	mvz.b %d0,%d0
	cmp.l %d0,%d1
	jcs .L612
	tst.l 56(%sp)
	jne .L615
	move.l 48(%sp),-(%sp)
	move.l %d3,-(%sp)
	jsr vector_track_empty
	addq.l #8,%sp
	tst.l %d0
	jeq .L611
.L615:
	mvz.b %d4,%d4
	move.l 52(%sp),%a2
	clr.l %d1
	move.l %a2,%a0
.L619:
	move.b (%a0),%d0
	mov3q.l #1,%d5
	mvz.b %d0,%d2
	cmp.l %d2,%d5
	jcs .L612
	cmp.l %d4,%d1
	jcs .L616
	tst.b %d0
	jne .L612
.L617:
	addq.l #1,%d1
	addq.l #4,%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L619
.L652:
	move.l %d3,%a3
	move.l %d3,%a1
	move.l %d3,%a4
	clr.l %d5
	lea (89,%a3),%a3
	lea (121,%a1),%a1
	lea (2202,%a4),%a4
.L631:
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
	jeq .L632
	move.b 1(%a2),%d2
.L620:
	move.b %d2,(%a3)
	tst.b (%a2)
	jeq .L633
	move.b 2(%a2),%d2
.L621:
	move.b %d2,13(%a3)
	tst.b (%a2)
	jeq .L634
	move.b 3(%a2),%d2
.L622:
	move.b %d2,15(%a3)
	mov3q.l #1,%d2
	lsl.l %d1,%d2
	move.b (%a0),%d1
	tst.b (%a2)
	jeq .L623
	or.l %d2,%d1
.L624:
	move.b %d1,(%a0)
	tst.l %d0
	jne .L625
	tst.b (%a2)
	jeq .L626
.L625:
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
.L626:
	move.l %a3,%a0
	clr.l %d1
.L627:
	move.b (%a0)+,%d0
	not.l %d0
	tst.b %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d1
	cmp.l %a1,%a0
	jne .L627
	move.w #23,%a0
	sub.l %d4,%a0
	add.l %d3,%a0
	move.b (%a0),%d0
	tst.b (%a2)
	jne .L628
	tst.l %d1
	jeq .L628
	or.l %d0,%d2
.L630:
	move.b %d2,(%a0)
	addq.l #1,%d5
	addq.l #4,%a2
	lea (32,%a3),%a3
	addq.l #2,%a4
	lea (32,%a1),%a1
	moveq #64,%d0
	cmp.l %d5,%d0
	jne .L631
	mov3q.l #1,%d0
.L611:
	movem.l (%sp),#15612
	lea (40,%sp),%sp
	rts
.L612:
	movem.l (%sp),#15612
	clr.l %d0
	lea (40,%sp),%sp
	rts
.L616:
	tst.b %d0
	jeq .L617
	move.b 1(%a0),%d0
	moveq #120,%d5
	mvz.b %d0,%d2
	subq.l #4,%d0
	mvz.b %d0,%d0
	subq.l #4,%d2
	cmp.l %d0,%d5
	jcs .L612
	mov3q.l #5,%d5
	rems.l %d5,%d0:%d2
	tst.l %d0
	jne .L612
	mvz.b 2(%a0),%d2
	moveq #126,%d5
	cmp.l %d2,%d5
	jcs .L611
	tst.b 3(%a0)
	jlt .L611
	addq.l #1,%d1
	addq.l #4,%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L619
	jra .L652
.L628:
	not.l %d2
	and.l %d0,%d2
	jra .L630
.L623:
	move.l %d2,%d7
	not.l %d7
	and.l %d7,%d1
	jra .L624
.L634:
	st %d2
	jra .L622
.L633:
	st %d2
	jra .L621
.L632:
	st %d2
	jra .L620
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
	jcs .L656
	mvz.b 34(%a0,%d0.l),%d1
	mov3q.l #1,%d2
	cmp.l %d1,%d2
	jcs .L656
	moveq #30,%d1
	moveq #83,%d2
	muls.l %d1,%d0
	lea 60(%a0,%d0.l),%a0
	mvz.b (%a0),%d0
	cmp.l %d0,%d2
	jeq .L660
.L656:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L660:
	mvz.b 1(%a0),%d0
	moveq #50,%d1
	cmp.l %d0,%d1
	jne .L656
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L657
	move.b 2(%a0),%d0
	mov3q.l #2,%d1
	move.l (%sp)+,%d2
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
.L657:
	move.l (%sp)+,%d2
	mov3q.l #1,%d0
	rts
	.size	vector_signed_track, .-vector_signed_track
	.align	2
	.type	generate_track, @function
generate_track:
	lea (-60,%sp),%sp
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	movem.l #17420,(%sp)
	cmp.l #133169151,%d0
	jls .L698
.L678:
	clr.l %d0
.L661:
	movem.l (%sp),#17420
	lea (60,%sp),%sp
	rts
.L698:
	move.l 1187521622,%a0
	mov3q.l #3,%d1
	move.b 269161679,%d0
	mvz.w #6322,%d2
	move.l 64(%sp),-(%sp)
	add.l #585088,%a0
	and.l %d1,%d0
	muls.l %d2,%d0
	pea (%a0,%d0.l)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L661
	move.b 269161680,%d0
	moveq #15,%d1
	mvz.b %d0,%d3
	move.l %d3,32(%sp)
	cmp.l %d3,%d1
	jcs .L678
	ext.w %d0
	move.l 1187521622,%d2
	lea staging,%a0
	move.w %d0,%d1
	move.l %d2,36(%sp)
	move.b 269161679,%d3
	move.w 66(%sp),%d0
	mulu.w #36568,%d1
	move.b %d3,47(%sp)
	mulu.w #2330,%d0
	add.l %d1,%d0
	add.l %d0,%d2
	move.l %d2,%a6
	sub.l %a0,%a6
	move.l %d0,28(%sp)
.L665:
	move.b (%a0,%a6.l),%d0
	move.b %d0,(%a0)+
	cmp.l #staging+2330,%a0
	jne .L665
	tst.l 68(%sp)
	jeq .L699
.L666:
	mvz.w #36437,%d0
	move.l 36(%sp),%a0
	add.l %d1,%a0
	tst.b (%a0,%d0.l)
	jeq .L667
	move.b staging+80,%d0
.L668:
	mvz.b %d0,%d0
	moveq #63,%d2
	move.l %d0,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcs .L678
	move.l 64(%sp),-(%sp)
	lea (53,%sp),%a0
	move.l %d0,20(%sp)
	jsr settings
	addq.l #4,%sp
	move.l 1187521622,%d1
	add.l #585088,%d1
	move.b 269161679,%d3
	move.w 66(%sp),%d2
	move.l 16(%sp),%d0
	move.w %d3,%a1
	mulu.w #30,%d2
	move.l %d2,%a0
	mov3q.l #3,%d2
	lea (497,%a0),%a0
	move.l %a1,%d3
	and.l %d2,%d3
	mvz.w #6322,%d2
	muls.l %d2,%d3
	add.l %d3,%d1
	move.b (%a0,%d1.l),%d1
	moveq #127,%d3
	and.l %d1,%d3
	move.l %d3,40(%sp)
	tst.l 72(%sp)
	jeq .L670
	move.l %d3,%d1
	moveq #127,%d2
	addq.l #1,%d1
	and.l %d1,%d2
	move.l %d2,40(%sp)
.L670:
	move.l 1187521622,%d1
	add.l #585088,%d1
	move.b 269161679,%d3
	move.w 66(%sp),%d2
	move.w %d3,%a1
	mulu.w #24,%d2
	move.l %d2,%a0
	mov3q.l #3,%d2
	lea (291,%a0),%a0
	move.l %a1,%d3
	and.l %d2,%d3
	mvz.w #6322,%d2
	muls.l %d2,%d3
	add.l %d3,%d1
	moveq #127,%d3
	mvz.b (%a0,%d1.l),%d1
	cmp.l %d1,%d3
	jcs .L678
	move.l 40(%sp),-(%sp)
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	pea 61(%sp)
	pea phrase
	jsr (vector_generate.part.0)
	move.l 88(%sp),-(%sp)
	pea phrase
	pea 2330.w
	pea staging
	jsr vector_write_phrase
	lea (36,%sp),%sp
	tst.l %d0
	jeq .L661
	move.l 36(%sp),%a1
	cmp.l 1187521622.l,%a1
	jne .L678
	mvz.b 269161680,%d1
	cmp.l 32(%sp),%d1
	jne .L678
	mvz.b 47(%sp),%d1
	mvz.b 269161679,%d2
	cmp.l %d1,%d2
	jne .L678
	move.l 28(%sp),%a1
	sub.l #staging-268525901,%a1
	lea staging,%a0
	move.l %a1,32(%sp)
.L673:
	lea (%a0,%a6.l),%a2
	move.b (%a0)+,%d1
	mvz.b (%a2),%d2
	move.l %a2,20(%sp)
	mvz.b %d1,%d3
	cmp.l %d2,%d3
	jeq .L672
	move.b %d1,(%a2)
	move.l 32(%sp),%a1
	lea (-1,%a0),%a2
	move.b (%a2),(%a1,%a0.l)
.L672:
	cmp.l #staging+2330,%a0
	jne .L673
	move.l 40(%sp),-(%sp)
	pea 53(%sp)
	move.l 72(%sp),-(%sp)
	move.l %d0,28(%sp)
	jsr save_settings
	mov3q.l #3,%d2
	mov3q.l #1,%a6
	move.l %a6,%d3
	move.b 59(%sp),%d1
	move.l 1187521622,%a1
	add.l #610376,%a1
	and.l %d2,%d1
	move.l %d1,56(%sp)
	move.l 56(%sp),%d2
	move.b (%a1),%d1
	lea (12,%sp),%sp
	lsl.l %d2,%d3
	or.l %d3,%d1
	move.b %d1,(%a1)
	move.b 269161566,%d1
	or.l %d3,%d1
	move.l %a6,%d3
	move.b %d1,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	move.l #1187501196,%a6
	move.l 64(%sp),%d1
	move.l 16(%sp),%d0
	lea staging+121,%a1
	lsl.l %d1,%d3
	move.l %d3,24(%sp)
	not.l %d3
	move.b %d3,23(%sp)
.L674:
	lea (-32,%a1),%a0
.L676:
	addq.l #1,%a0
	mvz.b -1(%a0),%d1
	cmp.l #255,%d1
	jne .L679
	cmp.l %a1,%a0
	jne .L676
	sub.l %a0,%a0
.L675:
	move.b (%a6),%d1
	move.b 23(%sp),%d3
	move.l %a0,%d2
	lea (32,%a1),%a1
	and.l %d3,%d1
	or.l %d2,%d1
	move.b %d1,(%a6)+
	cmp.l #1187501260,%a6
	jne .L674
	move.l 64(%sp),-(%sp)
	move.l %d0,20(%sp)
	jsr 1074387488
	addq.l #4,%sp
	mov3q.l #1,1187497772
	movem.l (%sp),#17420
	move.l 16(%sp),%d0
	lea (60,%sp),%sp
	rts
.L699:
	pea 2330.w
	pea staging
	move.l %d1,24(%sp)
	jsr vector_track_empty
	addq.l #8,%sp
	move.l 16(%sp),%d1
	tst.l %d0
	jne .L666
	movem.l (%sp),#17420
	lea (60,%sp),%sp
	rts
.L667:
	mvz.w #36435,%d0
	move.b (%a0,%d0.l),%d0
	jra .L668
.L679:
	move.b 27(%sp),%d2
	move.w %d2,%a0
	jra .L675
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
	jcs .L701
	lea (-22,%fp),%a1
	add.l 8(%fp),%a1
	move.l 12(%fp),%a0
	mvz.b (%a1),%d1
	add.l %d1,%a0
	tst.l %a0
	jlt .L721
.L704:
	move.l 8(%fp),%a2
	move.l #vector_control_max,%d0
	mvz.b (%a2,%d0.l),%d0
	cmp.l %d0,%a0
	jge .L707
	move.l %a0,%d0
.L707:
	cmp.l %d1,%d0
	jeq .L700
	move.b %d0,(%a1)
	move.l %d2,%d0
.L710:
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
	jeq .L722
.L711:
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L700:
	move.l -40(%fp),%d2
	move.l -36(%fp),%a2
	unlk %fp
	rts
.L701:
	mov3q.l #6,%d0
	cmp.l 8(%fp),%d0
	jeq .L703
	move.l 8(%fp),%d1
	move.l 12(%fp),%a0
	lea -23(%fp,%d1.l),%a1
	mvz.b (%a1),%d1
	add.l %d1,%a0
	tst.l %a0
	jge .L704
.L721:
	tst.l %d1
	jeq .L700
	clr.b %d0
	move.b %d0,(%a1)
	move.l %d2,%d0
	jra .L710
.L722:
	move.l %d2,-(%sp)
	pea -11(%fp)
	move.l -32(%fp),-(%sp)
	jsr (%a0)
	lea (12,%sp),%sp
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	jra .L700
.L703:
	move.l 12(%fp),%d0
	add.l %d2,%d0
	tst.l %d0
	jlt .L708
	moveq #127,%d1
	cmp.l %d0,%d1
	jge .L709
	moveq #127,%d0
.L709:
	cmp.l %d2,%d0
	jeq .L700
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
	jne .L711
	jra .L722
.L708:
	tst.b %d1
	jeq .L700
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
	jne .L711
	jra .L722
	.size	change_control, .-change_control
	.align	2
	.type	generator_view, @function
generator_view:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	move.l %d2,-(%sp)
	cmp.l #133169151,%d0
	jhi .L726
	tst.b -2147483627.l
	jeq .L734
.L726:
	clr.l %d0
.L723:
	move.l (%sp)+,%d2
	rts
.L734:
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
	jeq .L726
	move.l edit_view,%d0
	tst.l %d0
	jne .L726
	tst.b 1187502296.l
	jne .L723
	tst.l 1175263034
	jne .L723
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
.L741:
	mvz.b (%a4,%d1.l),%d0
	mov3q.l #1,%d6
	cmp.l %d0,%d6
	jcs .L739
	lea (%a6,%d4.l),%a0
	moveq #83,%d7
	mvz.b (%a0),%d0
	cmp.l %d0,%d7
	jeq .L766
.L739:
	addq.l #1,%d1
	lea (30,%a6),%a6
	lea (12,%a3),%a3
	cmp.l #240,%a6
	jne .L741
	move.l %d2,-(%sp)
	move.l 148(%sp),%a0
	clr.l %d5
	jsr (%a0)
	addq.l #4,%sp
	sub.l %a0,%a0
.L746:
	btst %d5,%d3
	jne .L767
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #240,%a0
	jne .L746
.L770:
	movem.l (%sp),#23804
	lea (136,%sp),%sp
	rts
.L766:
	mvz.b 1(%a0),%d0
	moveq #50,%d6
	cmp.l %d0,%d6
	jne .L739
	mvz.b 2(%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jeq .L737
	mvz.b 2(%a0),%d0
	subq.l #2,%d0
	tst.l %d0
	jne .L739
.L737:
	mov3q.l #1,%d0
	lsl.l %d1,%d0
	sub.l %a0,%a0
	or.l %d0,%d3
.L740:
	lea 60(%a6,%a0.l),%a1
	mov3q.l #5,%d7
	cmp.l %a0,%d7
	jcc .L738
.L768:
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
	jeq .L739
	lea 60(%a6,%a0.l),%a1
	mov3q.l #5,%d7
	cmp.l %a0,%d7
	jcs .L768
.L738:
	add.l %d2,%a1
	move.b (%a1),(%a3,%a0.l)
	clr.b (%a1)
	addq.l #1,%a0
	jra .L740
.L767:
	clr.l %d1
	lea (%a0,%d2.l),%a3
.L745:
	mov3q.l #5,%d4
	cmp.l %d1,%d4
	jcs .L743
.L769:
	lea (%a2,%d1.l),%a4
	mov3q.l #5,%d4
	move.l %d2,%a1
	add.l %d1,%a1
	move.b (%a4),60(%a0,%a1.l)
	addq.l #1,%d1
	cmp.l %d1,%d4
	jcc .L769
.L743:
	move.l %d1,%d6
	mov3q.l #6,%d7
	remu.l %d7,%d4:%d6
	lea (%a2,%d1.l),%a4
	addq.l #1,%d1
	lea (%a3,%d4.l),%a1
	moveq #12,%d4
	move.b (%a4),492(%a1)
	cmp.l %d1,%d4
	jne .L745
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #240,%a0
	jne .L746
	jra .L770
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
	jhi .L776
	tst.b -2147483627.l
	jeq .L779
.L776:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L779:
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
	jeq .L786
.L782:
	clr.l %d0
	rts
.L786:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L782
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L782
	jra st_selected
	.size	pool_context, .-pool_context
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
	jeq .L788
	mov3q.l #1,%d0
	lsl.l %d1,%d0
	move.l mine,%d2
	move.l %d2,20(%sp)
	and.l %d0,%d2
	tst.l %d2
	jne .L803
	tst.l %a0
	jne .L797
	mov3q.l #1,%d0
.L792:
	move.l %d1,%a2
	moveq #-3,%d2
	lea (%a2,%d1.l*2),%a2
	add.l %a2,%d0
	lea saved,%a2
	move.l (%a2,%d0.l*4),%d0
	move.l %d0,%d1
	subq.l #1,%d1
	cmp.l %d1,%d2
	jcs .L787
.L804:
	move.l %a1,32(%sp)
	move.l %a0,36(%sp)
	move.l (%sp)+,%d2
	move.l %d0,%a1
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	jmp (%a1)
.L797:
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
	jcc .L804
.L787:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	rts
.L803:
	tst.l %a0
	jne .L787
	not.l %d0
	and.l 20(%sp),%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	move.l %d0,mine
	lea (20,%sp),%sp
	rts
.L788:
	move.l %d1,16(%sp)
	move.l %a0,8(%sp)
	move.l %a1,12(%sp)
	jsr st_selected
	move.l 16(%sp),%d1
	move.l 8(%sp),%a0
	move.l 12(%sp),%a1
	tst.l %d0
	jeq .L793
	move.b 1175456541,%d0
	btst #5,%d0
	jne .L793
	moveq #62,%d0
	cmp.l %a1,%d0
	jeq .L805
	moveq #49,%d2
	cmp.l %a1,%d2
	jne .L793
	move.l %d1,16(%sp)
	move.l %a0,8(%sp)
	move.l %a1,12(%sp)
	jsr generator_view
	move.l 16(%sp),%d1
	move.l 8(%sp),%a0
	move.l 12(%sp),%a1
	tst.l %d0
	jeq .L793
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
	jeq .L796
	pea 32.w
	move.l #.LC5,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	lea (12,%sp),%sp
.L806:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	lea (20,%sp),%sp
	rts
.L793:
	clr.l %d0
	jra .L792
.L805:
	tst.b 1187502296.l
	jne .L793
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
.L796:
	pea 32.w
	move.l #.LC6,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	lea (12,%sp),%sp
	jra .L806
	.size	st_key, .-st_key
	.align	2
	.type	pool_flex, @function
pool_flex:
	move.l pool_bank,%d0
	cmp.l 1187521622.l,%d0
	jeq .L814
.L807:
	rts
.L814:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L807
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L807
	jsr st_selected
	tst.l %d0
	jeq .L807
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
	jeq .L822
.L815:
	rts
.L822:
	move.b 269161679,%d0
	mov3q.l #3,%d1
	and.l %d1,%d0
	cmp.l pool_part.l,%d0
	jne .L815
	mvz.b 269161676,%d0
	cmp.l pool_track.l,%d0
	jne .L815
	jsr st_selected
	tst.l %d0
	jeq .L815
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
	jhi .L825
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
	jcc .L832
.L825:
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
.L832:
	mov3q.l #1,%d2
	cmp.l 8(%sp),%d2
	jcs .L825
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L825
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
	jeq .L837
	jsr pool_context
	tst.l %d0
	jne .L847
.L837:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L840
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
	jcc .L848
.L840:
	move.l 12(%sp),%d0
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L848:
	mov3q.l #1,%d3
	cmp.l 12(%sp),%d3
	jcs .L840
	move.l %d0,-(%sp)
	move.l %d1,-(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L840
	move.l (%sp)+,%d2
	mov3q.l #5,%d0
	move.l (%sp)+,%d3
	rts
.L847:
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
	jne .L837
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
	jhi .L850
	mov3q.l #7,%d0
	cmp.l 68(%sp),%d0
	jcs .L850
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
	jne .L850
	cmp.l #25287,%a6
	jhi .L850
	move.l 68(%sp),%d1
	mov3q.l #1,%d2
	move.l 64(%sp),%a2
	lea 34(%a2,%d1.l),%a1
	mvz.b (%a1),%d1
	cmp.l %d1,%d2
	jcc .L879
	mov3q.l #1,32(%sp)
.L851:
	move.l 68(%sp),%d1
	moveq #30,%d0
	muls.l %d0,%d1
	tst.l 72(%sp)
	jne .L852
	tst.l pool_direct
	jeq .L853
	move.l %d1,20(%sp)
	move.l %a0,24(%sp)
	jsr pool_context
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	tst.l %d0
	jeq .L853
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
	jne .L853
	move.l 68(%sp),%d3
	cmp.l pool_track.l,%d3
	jne .L853
	mov3q.l #2,72(%sp)
.L852:
	move.l 68(%sp),-(%sp)
	move.l 68(%sp),-(%sp)
	move.l %d1,28(%sp)
	move.l %a0,32(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 20(%sp),%d1
	move.l 24(%sp),%a0
	tst.l %d0
	jeq .L880
.L855:
	move.l 64(%sp),%a1
	move.l #268525902,%d0
	sub.l 36(%sp),%d0
	lea 60(%a1,%d1.l),%a0
	lea 66(%a1,%d1.l),%a1
	move.l %a1,%d1
	move.l #268526334,%a1
	sub.l 36(%sp),%a1
.L862:
	move.b (%a0),(%a0,%d0.l)
	lea (432,%a0),%a2
	move.b (%a2),(%a1,%a0.l)
	addq.l #1,%a0
	cmp.l %a0,%d1
	jne .L862
	mov3q.l #1,%d0
	cmp.l 72(%sp),%d0
	jne .L849
	mvz.w #6322,%d1
	move.l %a6,%d0
	move.l #1187521622,%a0
	move.l (%a0),pool_bank
	mov3q.l #1,pool_pending
	divu.l %d1,%d0
	move.l 68(%sp),%d1
	move.l %d1,pool_track
	move.l %d0,pool_part
.L849:
	movem.l (%sp),#19468
	move.l 32(%sp),%d0
	lea (60,%sp),%sp
	rts
.L850:
	movem.l (%sp),#19468
	mov3q.l #1,32(%sp)
	move.l 32(%sp),%d0
	lea (60,%sp),%sp
	rts
.L853:
	move.l 68(%sp),-(%sp)
	move.l 68(%sp),-(%sp)
	move.l %d1,28(%sp)
	jsr vector_signed_track
	addq.l #8,%sp
	move.l 20(%sp),%d1
	tst.l %d0
	jeq .L855
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
	jra .L862
.L879:
	mvz.b (%a1),%d3
	move.l %d3,32(%sp)
	jra .L851
.L880:
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
.L859:
	move.l 40(%sp),%a1
	mov3q.l #2,%d2
	add.l %a0,%a1
	cmp.l %a0,%d2
	jcc .L881
	move.l %d0,%a3
	addq.l #1,%a0
	move.l 64(%sp),%a2
	moveq #9,%d2
	move.b (%a3),(%a2,%a1.l)
	cmp.l %a0,%d2
	jeq .L855
	addq.l #1,%d0
	jra .L859
.L881:
	move.l 64(%sp),%a2
	move.l %d0,%a3
	move.l 44(%sp),%a1
	add.l %a0,%a1
	addq.l #1,%a0
	move.b (%a3)+,(%a2,%a1.l)
	move.l %a3,%d0
	jra .L859
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
	jeq .L882
	lea pool_labels,%a3
	cmp.l 1175346732.l,%a3
	jeq .L893
	clr.l %d0
.L882:
	move.l (%sp)+,%a2
	move.l (%sp)+,%a3
	addq.l #8,%sp
	rts
.L893:
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
	jeq .L894
.L884:
	subq.l #7,%a2
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jne .L887
.L895:
	move.l (%sp)+,%a2
	mov3q.l #1,1187497772
	move.l (%sp)+,%a3
	addq.l #8,%sp
	rts
.L894:
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
	jeq .L895
.L887:
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
	jne .L884
	jra .L894
	.size	st_pool_choice_draw, .-st_pool_choice_draw
	.section	.rodata.str1.1
.LC7:
	.string	"\253 MACHINE:VECTOR \273"
	.text
	.align	2
	.globl	st_pool_choice_open
	.type	st_pool_choice_open, @function
st_pool_choice_open:
	jsr st_selected
	tst.l %d0
	jeq .L896
	tst.l 1175346736
	jne .L896
	tst.l 1175351520
	jne .L896
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
	lea (handlers.8),%a0
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
	jeq .L896
	clr.l -(%sp)
	pea .LC7
	move.l %d0,-(%sp)
	jsr 1074098360
	move.l #1074585796,-(%sp)
	jsr 1073943700
	lea (16,%sp),%sp
	jra st_pool_choice_draw
.L896:
	rts
	.size	st_pool_choice_open, .-st_pool_choice_open
	.align	2
	.globl	st_pool_choice_left
	.type	st_pool_choice_left, @function
st_pool_choice_left:
	tst.l 1175346736
	jeq .L906
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jeq .L913
.L906:
	rts
.L913:
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
	jeq .L914
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jeq .L927
.L914:
	addq.l #4,%sp
	rts
.L927:
	jsr pool_context
	tst.l %d0
	jeq .L914
	move.l 1175346752,%d1
	mov3q.l #1,%d0
	cmp.l %d1,%d0
	jcs .L914
	move.l %d1,(%sp)
	jsr 1074190164
	jsr pool_context
	tst.l %d0
	jeq .L914
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
	jeq .L928
	tst.l pool_direct
	jne .L945
.L930:
	move.l %a0,20(%sp)
	move.l %d1,16(%sp)
	lea (12,%sp),%sp
	jmp 1074235708
.L945:
	move.l %d1,4(%sp)
	move.l %a0,(%sp)
	jsr pool_context
	move.l 4(%sp),%d1
	move.l (%sp),%a0
	tst.l %d0
	jeq .L930
	tst.l 1175351520
	jeq .L930
	move.l pool_browse,%d0
	move.l %d0,8(%sp)
	jsr 1074235876
	clr.l pool_direct
	jsr st_pool_choice_open
	tst.l 1175346736
	jeq .L928
	move.l #pool_labels,%d0
	cmp.l 1175346732.l,%d0
	jne .L928
	move.l 8(%sp),-(%sp)
	move.l #1175346744,-(%sp)
	jsr 1074261424
	lea (20,%sp),%sp
	jra st_pool_choice_draw
.L928:
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
	jeq .L947
	tst.l 1175352218
	jne .L947
	mov3q.l #5,%d0
	cmp.l 1175352206.l,%d0
	jeq .L956
.L947:
	move.l %a0,16(%sp)
	move.l %d1,12(%sp)
	addq.l #8,%sp
	jmp 1074237596
.L956:
	move.l %d1,4(%sp)
	move.l %a0,(%sp)
	jsr st_selected
	move.l 4(%sp),%d1
	move.l (%sp),%a0
	tst.l %d0
	jeq .L947
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
	jeq .L957
	tst.l edit_view
	jne .L957
	tst.b 1187502296.l
	jne .L957
	tst.l 1175263034
	jne .L957
	tst.l 1175262868
	jne .L957
	move.l (%sp),-(%sp)
	jsr generator_page
	move.l %d0,4(%sp)
	addq.l #4,%sp
.L957:
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
	jhi .L965
	tst.b -2147483627.l
	jeq .L972
.L965:
	move.l (%sp)+,%d2
	move.l %d1,%d0
	addq.l #4,%sp
	rts
.L972:
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
	jeq .L965
	tst.l edit_view
	jne .L965
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
	jcc .L980
.L973:
	move.l (%sp)+,%d2
	lea (12,%sp),%sp
	rts
.L980:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L973
	tst.b -2147483627.l
	jne .L973
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
	jeq .L973
	tst.l edit_view
	jne .L973
	tst.b 1187502296.l
	jne .L973
	tst.l 1175263034
	jne .L973
	tst.l 1175262868
	jne .L973
	tst.l st_layer
	jne .L973
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
	jcc .L982
.L984:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L982:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L984
	tst.b -2147483627.l
	jne .L984
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
	jeq .L984
	tst.l edit_view
	jne .L984
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
	.globl	mg_page
	.type	mg_page, @function
mg_page:
	link.w %fp,#-16
	move.l #vector_midi,%d1
	move.l %d2,-(%sp)
	move.l #mg_page_layer,%d2
	move.l 1074061804,%d0
	move.l %d1,-16(%fp)
	cmp.l mg_active.l,%d2
	jeq .L1006
.L992:
	move.l 8(%fp),%d0
	move.l -20(%fp),%d2
	unlk %fp
	rts
.L1006:
	tst.l -2147483630
	jeq .L992
	move.l #1187521622,%a0
	move.l (%a0),%d1
	add.l #-1073741824,%d1
	cmp.l #133169151,%d1
	jhi .L992
	move.l #269161676,%a1
	mov3q.l #7,%d2
	mvz.b (%a1),%d1
	cmp.l %d1,%d2
	jcs .L992
	move.b (%a1),%d1
	move.l (%a0),%a0
	add.l #585088,%a0
	cmp.l #mg_page_site,%d0
	seq %d0
	mvz.b %d1,%d2
	move.b 269161679,%d1
	mvs.b %d0,%d0
	move.l %d2,%a1
	mov3q.l #3,%d2
	move.l %a1,-(%sp)
	neg.l %d0
	and.l %d2,%d1
	mvz.w #6322,%d2
	muls.l %d2,%d1
	pea (%a0,%d1.l)
	move.l %d0,-(%sp)
	pea -16(%fp)
	jsr mg_page_view
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L992
	move.l %d0,%a1
	move.l 20(%a1),%a0
	tst.l %a0
	jeq .L992
	move.l mg_second,%d1
	move.l 1175262852,%d0
	cmp.l #vector_midi_page,%a0
	jne .L994
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr (%a0)
	lea (12,%sp),%sp
	move.l -20(%fp),%d2
	move.l %d0,8(%fp)
	move.l 8(%fp),%d0
	unlk %fp
	rts
.L994:
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr (%a0)
	lea (12,%sp),%sp
	move.l -20(%fp),%d2
	move.l %d0,8(%fp)
	move.l 8(%fp),%d0
	unlk %fp
	rts
	.size	mg_page, .-mg_page
	.align	2
	.globl	mg_arp_setup
	.type	mg_arp_setup, @function
mg_arp_setup:
	move.l 1074061804,%a1
	move.l -2147483630,%d0
	move.l %d2,-(%sp)
	tst.l %d0
	jeq .L1007
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L1009
	move.l #269161676,%a0
	mov3q.l #7,%d1
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jcs .L1009
	move.b (%a0),%d0
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d1
	add.l #585088,%a0
	mvz.b %d0,%d0
	and.l %d2,%d1
	mvz.w #6322,%d2
	add.l #3089,%d0
	muls.l %d2,%d1
	moveq #77,%d2
	add.l %d1,%a0
	lea (%a0,%d0.l*2),%a0
	move.b 1(%a0),%d0
	mvz.b (%a0),%d1
	cmp.l %d1,%d2
	jne .L1009
	cmp.l #mg_page_site,%a1
	jne .L1009
	mvz.b %d0,%d0
	moveq #86,%d1
	cmp.l %d0,%d1
	jeq .L1011
	move.b (%a0),%d0
.L1009:
	clr.l %d0
.L1007:
	move.l (%sp)+,%d2
	rts
.L1011:
	mov3q.l #1,%d2
	eor.l %d2,mg_second
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	addq.l #4,%sp
	move.l (%sp)+,%d2
	mov3q.l #1,1187497772
	mov3q.l #1,%d0
	rts
	.size	mg_arp_setup, .-mg_arp_setup
	.align	2
	.globl	mg_track_tap
	.type	mg_track_tap, @function
mg_track_tap:
	mov3q.l #7,%d0
	cmp.l 4(%sp),%d0
	jcs .L1018
	move.l #mg_page_site,%d0
	cmp.l 1074061804.l,%d0
	jeq .L1022
.L1018:
	rts
.L1022:
	tst.l 1074513600
	jne .L1018
	clr.l 4(%sp)
	jmp 1073947176
	.size	mg_track_tap, .-mg_track_tap
	.section	.rodata.str1.1
.LC8:
	.string	"VECTOR"
	.text
	.align	2
	.globl	mg_note_setup_draw
	.type	mg_note_setup_draw, @function
mg_note_setup_draw:
	lea (-12,%sp),%sp
	move.l %a2,-(%sp)
	jsr mg_stock_note_draw
	move.l 1074061804,%d0
	move.l 1074513600,%a0
	cmp.l #mg_page_site,%d0
	jne .L1023
	tst.l %a0
	jne .L1040
.L1023:
	move.l (%sp)+,%a2
	lea (12,%sp),%sp
	rts
.L1040:
	tst.l -2147483630
	jeq .L1023
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L1023
	mvz.b 269161676,%d0
	mov3q.l #7,%d1
	cmp.l %d0,%d1
	jcs .L1023
	move.l 40(%a0),%a1
	lea (36,%a0),%a0
	move.l %a1,12(%sp)
	clr.l -(%sp)
	move.l %a0,12(%sp)
	pea -10(%a1)
	pea 50.w
	mov3q.l #2,-(%sp)
	mov3q.l #3,-(%sp)
	move.l %a0,-(%sp)
	jsr 1073816148
	pea .LC1
	mov3q.l #-1,-(%sp)
	move.l 44(%sp),%a2
	lea (-20,%a2),%a2
	move.l %a2,-(%sp)
	mov3q.l #5,-(%sp)
	move.l 48(%sp),-(%sp)
	move.l #1074505846,-(%sp)
	jsr 1073818584
	lea (48,%sp),%sp
	move.l mg_cursor,%d0
	tst.l %d0
	jeq .L1027
	move.l 12(%sp),%a2
	lea (-28,%a2),%a2
.L1028:
	pea .LC8
	mov3q.l #-1,-(%sp)
	move.l %a2,-(%sp)
	mov3q.l #5,-(%sp)
	move.l 24(%sp),-(%sp)
	move.l #1074505846,-(%sp)
	jsr 1073818584
	lea (24,%sp),%sp
	move.l mg_cursor,%d0
	mov3q.l #1,%d1
	cmp.l %d0,%d1
	jne .L1026
.L1027:
	mov3q.l #-1,-(%sp)
	pea 6(%a2)
	pea 50.w
	pea -1(%a2)
	mov3q.l #3,-(%sp)
	subq.l #8,%a2
	move.l 28(%sp),-(%sp)
	move.l %d0,28(%sp)
	jsr 1073816148
	lea (24,%sp),%sp
	tst.l 4(%sp)
	jeq .L1028
.L1026:
	move.l (%sp)+,%a2
	mov3q.l #1,1187497772
	lea (12,%sp),%sp
	rts
	.size	mg_note_setup_draw, .-mg_note_setup_draw
	.align	2
	.globl	mg_key
	.type	mg_key, @function
mg_key:
	link.w %fp,#-80
	moveq #51,%d0
	movem.l #1036,(%sp)
	move.l 12(%fp),%a1
	cmp.l 8(%fp),%d0
	jeq .L1071
	moveq #32,%d1
	cmp.l 8(%fp),%d1
	jeq .L1072
	moveq #49,%d2
	cmp.l 8(%fp),%d2
	jeq .L1073
	moveq #50,%d3
	cmp.l 8(%fp),%d3
	jeq .L1074
	move.l 1074061804,%d1
	mov3q.l #1,%d0
	lea vector_midi,%a0
	move.l %a0,-16(%fp)
	cmp.l %a1,%d0
	jne .L1043
	cmp.l #mg_page_site,%d1
	seq %d0
	move.l mg_active,%a0
	moveq #16,%d2
	move.l %d2,-58(%fp)
	mvs.b %d0,%d0
	neg.l %d0
	cmp.l #mg_list_layer,%a0
	jeq .L1122
.L1048:
	cmp.l #mg_page_layer,%a0
	jeq .L1123
.L1043:
	move.l %a1,-(%sp)
	move.l 8(%fp),-(%sp)
	jsr mg_forward
	addq.l #8,%sp
.L1041:
	movem.l -80(%fp),#1036
	unlk %fp
	rts
.L1122:
	cmp.l #mg_page_site,%d1
	jne .L1048
	tst.l -2147483630
	jeq .L1048
	move.l 1187521622,%d1
	add.l #-1073741824,%d1
	cmp.l #133169151,%d1
	jhi .L1048
	mvz.b 269161676,%d1
	mov3q.l #7,%d3
	cmp.l %d1,%d3
	jcs .L1048
	moveq #49,%d1
	cmp.l 8(%fp),%d1
	jeq .L1124
	moveq #51,%d1
	cmp.l 8(%fp),%d1
	jeq .L1065
	moveq #32,%d2
	cmp.l 8(%fp),%d2
	jne .L1048
	move.l -58(%fp),%d3
	or.l %d3,mg_mine
	cmp.l mg_cursor.l,%d0
	jls .L1057
	mov3q.l #1,mg_cursor
.L1057:
	jsr mg_note_setup_draw
.L1127:
	movem.l -80(%fp),#1036
	unlk %fp
	rts
.L1123:
	tst.l -2147483630
	jeq .L1043
	move.l #1187521622,%a0
	move.l (%a0),%d1
	add.l #-1073741824,%d1
	cmp.l #133169151,%d1
	jhi .L1043
	move.l #269161676,%a2
	mov3q.l #7,%d2
	mvz.b (%a2),%d1
	cmp.l %d1,%d2
	jcs .L1043
	move.b (%a2),-54(%fp)
	move.l (%a0),%a0
	mov3q.l #3,%d2
	add.l #585088,%a0
	move.b 269161679,%d1
	mvz.b -54(%fp),%d3
	move.l %d3,-(%sp)
	mvz.w #6322,%d3
	and.l %d2,%d1
	muls.l %d3,%d1
	pea (%a0,%d1.l)
	move.l %d0,-(%sp)
	pea -16(%fp)
	move.l %a1,-62(%fp)
	jsr mg_page_view
	lea (16,%sp),%sp
	move.l -62(%fp),%a1
	tst.l %d0
	jeq .L1043
	moveq #49,%d1
	cmp.l 8(%fp),%d1
	jeq .L1125
	moveq #50,%d0
	cmp.l 8(%fp),%d0
	jne .L1043
	tst.l mg_second
	jeq .L1043
	move.l -58(%fp),%d1
	mov3q.l #-1,-(%sp)
	clr.l mg_second
	or.l %d1,mg_mine
	jsr 1074059592
	movem.l -80(%fp),#1036
	mov3q.l #1,1187497772
	addq.l #4,%sp
	unlk %fp
	rts
.L1071:
	mov3q.l #1,-58(%fp)
.L1042:
	mov3q.l #1,%d0
	cmp.l %a1,%d0
	jeq .L1045
	move.l mg_mine,%d0
	move.l -58(%fp),%d1
	and.l %d0,%d1
	tst.l %d1
	jne .L1126
	move.l 1074061804,%d0
	move.l #vector_midi,%d1
	move.l %a1,-(%sp)
	move.l 8(%fp),-(%sp)
	move.l %d1,-16(%fp)
	jsr mg_forward
	addq.l #8,%sp
	jra .L1041
.L1045:
	move.l 1074061804,%d1
	move.l #vector_midi,%d2
	move.l mg_active,%a0
	move.l %d2,-16(%fp)
	cmp.l #mg_page_site,%d1
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	cmp.l #mg_list_layer,%a0
	jne .L1048
	jra .L1122
.L1126:
	tst.l %a1
	jne .L1041
	move.l -58(%fp),%d1
	not.l %d1
	and.l %d0,%d1
	movem.l -80(%fp),#1036
	move.l %d1,mg_mine
	unlk %fp
	rts
.L1072:
	mov3q.l #2,-58(%fp)
	jra .L1042
.L1073:
	mov3q.l #4,-58(%fp)
	jra .L1042
.L1074:
	moveq #8,%d3
	move.l %d3,-58(%fp)
	jra .L1042
.L1125:
	move.l %d0,%a2
	move.l 28(%a2),%a0
	tst.l %a0
	jeq .L1043
	move.l -58(%fp),%d1
	or.l %d1,mg_mine
	move.l 1175262852,%d0
	cmp.l #vector_midi_yes,%a0
	jne .L1068
	move.b 269161676,%d0
	mov3q.l #1,-(%sp)
	mov3q.l #1,-(%sp)
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr midi_generate
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L1080
	pea 32.w
	move.l #.LC5,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	addq.l #8,%sp
.L1070:
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L1128:
	movem.l -80(%fp),#1036
	unlk %fp
	rts
.L1080:
	pea 32.w
	move.l #.LC6,%d0
	move.l %d0,-(%sp)
	jsr 1074111160
	addq.l #8,%sp
	jra .L1070
.L1065:
	move.l -58(%fp),%d1
	move.l mg_cursor,%d0
	or.l %d1,mg_mine
	tst.l %d0
	jeq .L1057
	subq.l #1,%d0
	move.l %d0,mg_cursor
	jsr mg_note_setup_draw
	jra .L1127
.L1068:
	move.l %d0,-(%sp)
	jsr (%a0)
	addq.l #4,%sp
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	jra .L1128
.L1124:
	mov3q.l #1,-(%sp)
	pea 49.w
	move.l %d0,-62(%fp)
	jsr mg_forward
	addq.l #8,%sp
	move.l mg_cursor,%d2
	mvz.b 269161676,%d1
	move.l -62(%fp),%d0
	move.l %d2,-58(%fp)
	tst.l %d2
	jeq .L1075
	cmp.l %d2,%d0
	jcs .L1076
	move.l -16(%fp),%a0
	move.l %a0,-66(%fp)
	tst.l %a0
	jeq .L1077
	move.l 8(%a0),%d2
	move.l %d2,-58(%fp)
.L1050:
	move.l %d1,%a1
	lea (3089,%a1),%a1
	move.l %a1,%d2
	add.l %d2,%d2
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d3
	move.l %d2,-50(%fp)
	mov3q.l #3,%d2
	and.l %d2,%d3
	mvz.w #6322,%d2
	muls.l %d2,%d3
	add.l %d3,%a0
	add.l -50(%fp),%a0
	move.b 1(%a0),%d3
	mvz.b (%a0),%d2
	move.b %d3,-54(%fp)
	moveq #77,%d3
	cmp.l %d2,%d3
	jne .L1052
	tst.l %d0
	jeq .L1052
	mvz.b -54(%fp),%d0
	move.l -16(%fp),%a1
	cmp.l 8(%a1),%d0
	jeq .L1053
	move.b (%a0),%d0
	tst.l -66(%fp)
	jeq .L1054
.L1055:
	move.l %d1,%a0
	add.l #-2147457426,%a0
	move.b (%a0),%d0
	mvz.b -2147483646,%d2
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jeq .L1129
	move.w %d1,%d2
	move.l %d1,%d3
	move.l #mg_arp_page,%d0
	lsl.l #5,%d3
	lea mg_arp_setup_slots,%a0
	move.l %a0,-32(%fp)
	clr.l -36(%fp)
	mulu.w #68,%d2
	move.l %d3,%a1
	sub.l #mg_arp_page-1005,%d3
	move.l %d3,-20(%fp)
	move.l %d2,%a0
	move.l #-1187473662,%d2
	sub.l %a1,%d2
	add.l #1187474924,%a0
	move.l %d2,-24(%fp)
.L1060:
	move.l 1187521622,%a1
	move.l #269161679,%a2
	move.b (%a2),-51(%fp)
	mov3q.l #3,%d3
	move.l %d0,%a2
	add.l #585088,%a1
	move.b (%a2)+,-37(%fp)
	move.b -51(%fp),%d2
	move.l %a2,%d0
	move.l -20(%fp),%a2
	add.l %d0,%a2
	move.l %a2,-42(%fp)
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	add.l %d2,%a1
	move.b -37(%fp),%d2
	move.b %d2,(%a1,%a2.l)
	move.l #269161679,%a2
	move.b (%a2),%d3
	move.w %d3,%a1
	mov3q.l #3,%d3
	move.l %a1,%d2
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	move.l -42(%fp),%d3
	move.l %d2,%a1
	add.l #269110990,%a1
	move.b -37(%fp),%d2
	move.b %d2,(%a1,%d3.l)
	mov3q.l #3,%d3
	move.l 1187521622,%a1
	add.l #585088,%a1
	move.b (%a2),-39(%fp)
	move.l -32(%fp),%a2
	move.l %a1,-28(%fp)
	addq.l #1,-32(%fp)
	move.b (%a2)+,-54(%fp)
	move.b -39(%fp),%d2
	move.l -24(%fp),%a2
	add.l %a0,%a2
	move.l %a2,-46(%fp)
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	move.l %d2,%a1
	move.b -54(%fp),%d2
	add.l -28(%fp),%a1
	move.b %d2,(%a1,%a2.l)
	move.b 269161679,%d3
	move.w %d3,%a1
	mov3q.l #3,%d3
	move.l %a1,%d2
	and.l %d3,%d2
	mvz.w #6322,%d3
	muls.l %d3,%d2
	move.l -46(%fp),%d3
	move.l %d2,%a1
	add.l #269110990,%a1
	move.b -54(%fp),%d2
	move.b %d2,(%a1,%d3.l)
	tst.l -36(%fp)
	jeq .L1059
	move.b -37(%fp),-32(%a0)
.L1059:
	move.b -54(%fp),(%a0)+
	cmp.l #mg_arp_page+6,%d0
	jne .L1060
	move.l %d1,%d0
	lsl.l #4,%d0
	move.l %d0,%a1
	add.l #6210,%d0
	lea (6194,%a1),%a1
	move.l %d0,-54(%fp)
.L1061:
	move.l 1187521622,%a0
	mov3q.l #3,%d3
	move.b 269161679,%d0
	mvz.w #6322,%d2
	add.l #585088,%a0
	and.l %d3,%d0
	clr.b %d3
	muls.l %d2,%d0
	mov3q.l #3,%d2
	add.l %d0,%a0
	move.b %d3,(%a0,%a1.l)
	mvz.w #6322,%d3
	move.b 269161679,%d0
	and.l %d2,%d0
	muls.l %d3,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	clr.b %d0
	move.b %d0,(%a0,%a1.l)
	addq.l #1,%a1
	cmp.l -54(%fp),%a1
	jne .L1061
	tst.l -66(%fp)
	jeq .L1079
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	move.w #77,%a1
	mvz.w #6322,%d3
	add.l #585088,%a0
	add.l -50(%fp),%a0
	and.l %d2,%d0
	move.w %a1,%d2
	muls.l %d3,%d0
	mov3q.l #3,%d3
	move.b %d2,(%a0,%d0.l)
	mvz.w #6322,%d2
	move.l -50(%fp),%a0
	move.b 269161679,%d0
	and.l %d3,%d0
	move.w %a1,%d3
	muls.l %d2,%d0
	add.l %d0,%a0
	add.l #269110990,%a0
	move.b %d3,(%a0)
	tst.l -66(%fp)
	jeq .L1130
.L1063:
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	move.l %d1,%d3
	add.l #591267,%a0
	add.l %d3,%d3
	lea (-55,%fp),%a1
	move.l #269117169,%a2
	and.l %d2,%d0
	mvz.w #6322,%d2
	add.l %d3,%a0
	add.l %d3,%a2
	mvz.w #6322,%d3
	muls.l %d2,%d0
	mov3q.l #3,%d2
	move.b (%a1),(%a0,%d0.l)
	move.b 269161679,%d0
	and.l %d2,%d0
	muls.l %d3,%d0
	move.b (%a1),(%a2,%d0.l)
	move.l %d1,-62(%fp)
	jsr mg_dirty
	move.l -62(%fp),%d1
	tst.l -66(%fp)
	jeq .L1057
	move.l -66(%fp),%a1
	move.l 16(%a1),%a0
	tst.l %a0
	jeq .L1057
	cmp.l #vector_midi_assign,%a0
	jne .L1064
	move.l %d1,-(%sp)
	jsr (vector_midi_assign.part.0)
	addq.l #4,%sp
	jsr mg_note_setup_draw
	jra .L1127
.L1052:
	tst.l -66(%fp)
	jne .L1055
.L1054:
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	mvz.w #6322,%d3
	add.l #585088,%a0
	add.l -50(%fp),%a0
	and.l %d2,%d0
	moveq #77,%d2
	muls.l %d3,%d0
	mvz.b (%a0,%d0.l),%d0
	cmp.l %d0,%d2
	jeq .L1055
	jsr mg_note_setup_draw
	jra .L1127
.L1130:
	mvz.w #255,%d0
	move.l %d0,-58(%fp)
	jra .L1063
.L1075:
	clr.l -66(%fp)
	jra .L1050
.L1076:
	clr.l -66(%fp)
	clr.l -58(%fp)
	jra .L1050
.L1129:
	move.l %d1,%a0
	add.l #-2147457418,%a0
	move.b (%a0),%d0
	move.b -2147483645,%d3
	move.w %d3,%a0
	move.l %d1,%d3
	lsl.l #5,%d3
	move.l %a0,%d2
	eor.l %d2,%d0
	move.w %d1,%d2
	lea mg_arp_setup_slots,%a0
	move.l %a0,-32(%fp)
	move.l %d3,%a1
	sub.l #mg_arp_page-1005,%d3
	move.l %d3,-20(%fp)
	tst.b %d0
	seq %d0
	mulu.w #68,%d2
	move.l %d2,%a0
	move.l #-1187473662,%d2
	sub.l %a1,%d2
	mvs.b %d0,%d0
	add.l #1187474924,%a0
	move.l %d2,-24(%fp)
	neg.l %d0
	move.l %d0,-36(%fp)
	move.l #mg_arp_page,%d0
	jra .L1060
.L1079:
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	move.w #-1,%a1
	mvz.w #6322,%d3
	add.l #585088,%a0
	add.l -50(%fp),%a0
	and.l %d2,%d0
	move.w %a1,%d2
	muls.l %d3,%d0
	mov3q.l #3,%d3
	move.b %d2,(%a0,%d0.l)
	mvz.w #6322,%d2
	move.l -50(%fp),%a0
	move.b 269161679,%d0
	and.l %d3,%d0
	move.w %a1,%d3
	muls.l %d2,%d0
	add.l %d0,%a0
	add.l #269110990,%a0
	move.b %d3,(%a0)
	tst.l -66(%fp)
	jne .L1063
	jra .L1130
.L1053:
	cmp.l -66(%fp),%a1
	jeq .L1057
	move.l 16(%a1),%a0
	tst.l %a0
	jeq .L1055
	cmp.l #vector_midi_assign,%a0
	jeq .L1055
	clr.l -(%sp)
	move.l %d1,-(%sp)
	move.l %d1,-62(%fp)
	jsr (%a0)
	addq.l #8,%sp
	move.l -62(%fp),%d1
	jra .L1055
.L1064:
	mov3q.l #1,-(%sp)
	move.l %d1,-(%sp)
	jsr (%a0)
	addq.l #8,%sp
	jsr mg_note_setup_draw
	jra .L1127
.L1077:
	clr.l -58(%fp)
	jra .L1050
	.size	mg_key, .-mg_key
	.align	2
	.globl	mg_knob
	.type	mg_knob, @function
mg_knob:
	link.w %fp,#-16
	move.l #vector_midi,%d1
	move.l %d2,-(%sp)
	move.l 1074061804,%d0
	mov3q.l #5,%d2
	move.l %d1,-16(%fp)
	cmp.l 8(%fp),%d2
	jcs .L1131
	lea mg_page_layer,%a1
	cmp.l mg_active.l,%a1
	jeq .L1146
.L1131:
	move.l -20(%fp),%d2
	unlk %fp
	rts
.L1146:
	tst.l -2147483630
	jeq .L1131
	move.l #1187521622,%a0
	move.l (%a0),%d1
	add.l #-1073741824,%d1
	cmp.l #133169151,%d1
	jhi .L1131
	move.l #269161676,%a1
	mov3q.l #7,%d2
	mvz.b (%a1),%d1
	cmp.l %d1,%d2
	jcs .L1131
	move.b (%a1),%d1
	move.l (%a0),%a0
	add.l #585088,%a0
	cmp.l #mg_page_site,%d0
	seq %d0
	mvz.b %d1,%d2
	move.b 269161679,%d1
	mvs.b %d0,%d0
	move.l %d2,%a1
	mov3q.l #3,%d2
	move.l %a1,-(%sp)
	neg.l %d0
	and.l %d2,%d1
	mvz.w #6322,%d2
	muls.l %d2,%d1
	pea (%a0,%d1.l)
	move.l %d0,-(%sp)
	pea -16(%fp)
	jsr mg_page_view
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L1131
	move.l %d0,%a1
	move.l 24(%a1),%a0
	tst.l %a0
	jeq .L1131
	move.l mg_second,%d1
	move.l 1175262852,%d0
	cmp.l #vector_midi_knob,%a0
	jne .L1133
	move.l %d1,-(%sp)
	move.l 12(%fp),-(%sp)
	move.l 8(%fp),-(%sp)
	move.l %d0,-(%sp)
	jsr (%a0)
	lea (16,%sp),%sp
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L1147:
	move.l -20(%fp),%d2
	unlk %fp
	rts
.L1133:
	move.l %d1,-(%sp)
	move.l 12(%fp),-(%sp)
	move.l 8(%fp),-(%sp)
	move.l %d0,-(%sp)
	jsr (%a0)
	lea (16,%sp),%sp
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
	jra .L1147
	.size	mg_knob, .-mg_knob
	.align	2
	.globl	mg_tick
	.type	mg_tick, @function
mg_tick:
	link.w %fp,#-44
	move.l #1187521622,%a1
	movem.l #7180,(%sp)
	move.l 1074061804,%a2
	move.l #vector_midi,%d0
	moveq #28,%d3
	move.l (%a1),%a3
	move.l %d0,-16(%fp)
	cmp.l #mg_page_site,%a2
	seq %d0
	move.b -2147483645,%d1
	mvs.b %d0,%d0
	neg.l %d0
	move.w %d1,%a0
	move.l mg_seen,%d1
	move.l %a0,%d2
	lsl.l %d3,%d2
	eor.l %d2,%d0
	move.l %a3,%d2
	eor.l %d2,%d0
	cmp.l #mg_page_site,%a2
	jne .L1149
	eor.l #vector_midi,%d0
	cmp.l %d0,%d1
	jeq .L1150
	move.l %d0,mg_seen
	move.l (%a1),%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L1150
	move.l (%a1),%a4
	mov3q.l #3,%d3
	mvz.w #6322,%d2
	move.b 269161679,%d0
	add.l #585088,%a4
	move.w #1008,%a2
	move.l #1187474894,%a3
	move.l #-2147457418,%d1
	and.l %d3,%d0
	muls.l %d2,%d0
	add.l %d0,%a4
	lea (6179,%a4),%a0
	move.l %a0,-24(%fp)
.L1154:
	move.l -24(%fp),%a0
	move.l %a0,%a1
	moveq #77,%d3
	move.b (%a0),%d0
	mvz.b -(%a1),%d2
	cmp.l %d2,%d3
	jne .L1151
	mvz.b %d0,%d0
	move.l -16(%fp),%a0
	cmp.l 8(%a0),%d0
	jeq .L1152
	move.b (%a1),%d0
.L1151:
	addq.l #2,-24(%fp)
	addq.l #1,%d1
	lea (68,%a3),%a3
	lea (32,%a2),%a2
	cmp.l #-2147457410,%d1
	jne .L1154
.L1150:
	tst.l -2147483630
	jeq .L1155
	move.l #1187521622,%a0
	move.l (%a0),%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jhi .L1155
	mvz.b 269161676,%d1
	move.l (%a0),%d0
	mov3q.l #7,%d2
	move.b 269161679,%d3
	move.w %d3,%a0
	cmp.l %d1,%d2
	jcs .L1159
	move.l %a0,%d3
	mov3q.l #3,%d2
	and.l %d2,%d3
	mvz.w #6322,%d2
	add.l #585088,%d0
	muls.l %d2,%d3
	move.l %d3,%a0
	lea (%a0,%d0.l),%a2
	tst.l 1074513600
	jne .L1160
	move.l %d1,-(%sp)
	move.l %a2,-(%sp)
	mov3q.l #1,-(%sp)
	pea -16(%fp)
	move.l %d1,-20(%fp)
	clr.l mg_opened
	jsr mg_page_view
	lea (16,%sp),%sp
	move.l -20(%fp),%d1
	cmp.l mg_shown.l,%d1
	jeq .L1245
	clr.l mg_second
	move.l %d1,mg_shown
	tst.l %d0
	jeq .L1168
.L1174:
	lea mg_page_layer,%a2
.L1175:
	move.l mg_active,%a3
	cmp.l %a2,%a3
	jne .L1246
	tst.l (%a3)
	jeq .L1148
	tst.l mg_mine
	jne .L1148
	cmp.l #mg_page_layer,%a3
	seq %d0
	move.l %a3,-(%sp)
	move.l %d0,%d1
	neg.l %d1
	move.l %d1,%a4
	jsr 1073943660
	clr.l mg_active
	move.l 1175262812,%a0
	addq.l #4,%sp
	cmp.l #mg_list_layer,%a3
	jeq .L1176
.L1177:
	tst.l %a0
	jeq .L1197
	tst.l (%a0)
	jne .L1197
	lea mg_keys,%a0
	move.l %a0,-24(%fp)
	lea mg_saved,%a2
.L1188:
	move.l -24(%fp),%a0
	addq.l #1,-24(%fp)
	mvz.b (%a0)+,%d0
	sub.l %a0,%a0
	mulu.w #24,%d0
	move.l %d0,%a1
	add.l #1187502302,%a1
.L1187:
	move.l (%a1,%a0.l),%d0
	cmp.l #mg_key,%d0
	jeq .L1186
	move.l %d0,(%a2,%a0.l)
.L1186:
	addq.l #4,%a0
	moveq #12,%d0
	cmp.l %a0,%d0
	jne .L1187
	lea (12,%a2),%a2
	cmp.l #mg_saved+48,%a2
	jne .L1188
	clr.l (%a3)
	move.l %a3,-(%sp)
	jsr 1073943700
	cmp.l #mg_page_layer,%a3
	seq %d0
	move.l %a3,mg_active
	addq.l #4,%sp
	neg.l %d0
.L1184:
	move.w %a4,%d2
	mvz.b %d0,%d0
	mvz.b %d2,%d1
	cmp.l %d0,%d1
	jeq .L1148
	mov3q.l #-1,-(%sp)
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #4,%sp
.L1148:
	movem.l -44(%fp),#7180
	unlk %fp
	rts
.L1152:
	tst.b (%a4,%a2.l)
	jeq .L1151
	move.l 1187521622,%a0
	mov3q.l #3,%d2
	move.b 269161679,%d0
	mvz.w #6322,%d3
	add.l #585088,%a0
	and.l %d2,%d0
	muls.l %d3,%d0
	add.l %d0,%a0
	clr.b %d0
	move.b %d0,(%a0,%a2.l)
	move.b 269161679,%d0
	and.l %d2,%d0
	clr.b %d2
	muls.l %d3,%d0
	move.l %d0,%a0
	add.l #269110990,%a0
	move.b %d2,(%a0,%a2.l)
	move.l %d1,%a0
	move.b -8(%a0),%d0
	mvz.b -2147483646,%d2
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jeq .L1247
.L1153:
	move.l %d1,-20(%fp)
	jsr mg_dirty
	move.l -20(%fp),%d1
.L1249:
	addq.l #1,%d1
	addq.l #2,-24(%fp)
	lea (68,%a3),%a3
	lea (32,%a2),%a2
	cmp.l #-2147457410,%d1
	jne .L1154
	jra .L1150
.L1149:
	cmp.l %d0,%d1
	jeq .L1155
	move.l %d0,mg_seen
.L1155:
	tst.l mg_active
	jeq .L1248
	mvz.b 269161676,%d1
	move.l 1187521622,%d0
	move.b 269161679,%d0
.L1159:
	clr.l mg_opened
	cmp.l mg_shown.l,%d1
	jeq .L1167
	clr.l mg_second
	move.l %d1,mg_shown
.L1168:
	move.l mg_active,%d0
	tst.l %d0
	jeq .L1148
	tst.l mg_mine
	jne .L1148
	cmp.l #mg_page_layer,%d0
	seq %d1
	move.l %d0,-(%sp)
	move.l %d1,%d2
	neg.l %d2
	jsr 1073943660
	clr.l mg_active
	move.l 1175262812,%a0
	move.l %d2,%a4
	addq.l #4,%sp
.L1197:
	clr.b %d0
	jra .L1184
.L1247:
	move.b (%a0),%d0
	mvz.b -2147483645,%d2
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jne .L1153
	clr.b (%a3)
	move.l %d1,-20(%fp)
	jsr mg_dirty
	move.l -20(%fp),%d1
	jra .L1249
.L1176:
	tst.l 1074513572
	jne .L1197
	lea mg_keys,%a0
	lea mg_list_layer,%a3
	move.l %a0,-24(%fp)
	lea mg_saved,%a2
	jra .L1188
.L1246:
	tst.l mg_mine
	jne .L1148
	tst.l %a3
	jne .L1179
	move.l 1175262812,%a0
	cmp.l #mg_list_layer,%a2
	jeq .L1180
	tst.l %a0
	jeq .L1148
	tst.l (%a0)
	jne .L1148
	sub.l %a4,%a4
	move.l %a2,%a3
.L1252:
	lea mg_keys,%a0
	move.l %a0,-24(%fp)
	lea mg_saved,%a2
	jra .L1188
.L1248:
	movem.l -44(%fp),#7180
	clr.l mg_opened
	clr.l mg_second
	unlk %fp
	rts
.L1160:
	move.l mg_opened,%a3
	tst.l %a3
	jeq .L1250
.L1163:
	move.l %d1,-(%sp)
	move.l %a2,-(%sp)
	mov3q.l #1,-(%sp)
	pea -16(%fp)
	move.l %d1,-20(%fp)
	jsr mg_page_view
	lea (16,%sp),%sp
	move.l -20(%fp),%d1
	cmp.l mg_shown.l,%d1
	jeq .L1251
	clr.l mg_second
	move.l %d1,mg_shown
.L1172:
	lea mg_list_layer,%a2
	jra .L1175
.L1167:
	clr.l mg_second
	jra .L1168
.L1251:
	tst.l %d0
	jeq .L1170
	mov3q.l #2,%d3
	cmp.l 1175262852.l,%d3
	jeq .L1172
.L1170:
	clr.l mg_second
	lea mg_list_layer,%a2
	jra .L1175
.L1250:
	move.l %d1,%a0
	moveq #77,%d2
	lea (3089,%a0),%a0
	lea (%a2,%a0.l*2),%a1
	mov3q.l #1,mg_opened
	move.b 1(%a1),%d0
	mvz.b (%a1),%d3
	cmp.l %d3,%d2
	jne .L1165
	mvz.b %d0,%d0
	move.l -16(%fp),%a0
	cmp.l 8(%a0),%d0
	jeq .L1194
	move.b (%a1),%d0
.L1165:
	move.l %d1,-20(%fp)
	move.l %a3,mg_cursor
	jsr mg_note_setup_draw
	move.l -20(%fp),%d1
	jra .L1163
.L1180:
	tst.l 1074513572
	jne .L1148
	sub.l %a4,%a4
	move.l %a2,%a3
	jra .L1252
.L1245:
	tst.l %d0
	jeq .L1167
	mov3q.l #2,%d0
	cmp.l 1175262852.l,%d0
	jeq .L1174
	clr.l mg_second
	lea mg_page_layer,%a2
	jra .L1175
.L1194:
	mov3q.l #1,%a3
	move.l %d1,-20(%fp)
	move.l %a3,mg_cursor
	jsr mg_note_setup_draw
	move.l -20(%fp),%d1
	jra .L1163
.L1179:
	cmp.l #mg_page_layer,%a3
	seq %d0
	move.l %a3,-(%sp)
	move.l %d0,%d3
	neg.l %d3
	jsr 1073943660
	clr.l mg_active
	move.l 1175262812,%a0
	move.l %d3,%a4
	addq.l #4,%sp
	cmp.l #mg_list_layer,%a2
	jeq .L1176
	move.l %a2,%a3
	tst.l %a2
	jne .L1177
	clr.b %d0
	jra .L1184
	.size	mg_tick, .-mg_tick
	.align	2
	.globl	st_ui_tick
	.type	st_ui_tick, @function
st_ui_tick:
	lea (-64,%sp),%sp
	movem.l #19580,(%sp)
	jsr mg_tick
	tst.l pool_direct
	jeq .L1254
	tst.l 1175351520
	jne .L1341
	clr.l pool_direct
.L1254:
	tst.l pool_pending
	jne .L1342
.L1256:
	move.l 1187521622,%d0
	add.l #-1073741824,%d0
	cmp.l #133169151,%d0
	jls .L1258
	mov3q.l #1,%d1
	move.l -2147457608,%d0
	cmp.l %d0,%d1
	jeq .L1343
	move.l %d0,last_transport
.L1338:
	move.l 1187521622,%d3
	clr.l %d2
	mvz.b 269161679,%d1
	move.l %d1,40(%sp)
	mvz.b 269161676,%d4
.L1266:
	move.l layer_gen,%a2
	move.l active,%d0
	cmp.l shown_bank.l,%d3
	jeq .L1344
.L1273:
	tst.l %a2
	jeq .L1280
	tst.l %d0
	jne .L1298
	move.l 40(%sp),%d5
	clr.l edit_view
	move.l %d3,shown_bank
	move.l %d5,shown_part
	move.l %d4,shown_track
.L1275:
	move.l 1175262812,%a0
	tst.l %d2
	jeq .L1253
	tst.l %a0
	jeq .L1253
	tst.l (%a0)
	jne .L1253
	move.l #st_key,%d1
	move.l #1187503478,%a0
	lea saved-1187503478,%a1
.L1287:
	move.l (%a0),%d0
	cmp.l %d1,%d0
	jeq .L1286
	move.l %d0,(%a1,%a0.l)
.L1286:
	addq.l #4,%a0
	cmp.l #1187503490,%a0
	jne .L1287
	move.l #1187503790,%a0
	lea saved-1187503778,%a1
.L1289:
	move.l (%a0),%d0
	cmp.l %d1,%d0
	jeq .L1288
	move.l %d0,(%a1,%a0.l)
.L1288:
	addq.l #4,%a0
	cmp.l #1187503802,%a0
	jne .L1289
	jsr generator_view
	move.l %d0,layer_gen
	tst.l %d0
	jeq .L1300
	lea st_layer,%a0
	clr.l (%a0)
	move.l %a0,-(%sp)
	jsr 1073943700
	mov3q.l #-1,-(%sp)
	mov3q.l #1,active
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #8,%sp
.L1253:
	movem.l (%sp),#19580
	lea (64,%sp),%sp
	rts
.L1258:
	move.l 1187521622,%a2
	mov3q.l #3,%d5
	move.b 269161679,%d0
	mvz.w #6322,%d6
	add.l #585088,%a2
	sub.l %a6,%a6
	clr.l %d2
	lea vector_signed_track,%a3
	and.l %d5,%d0
	muls.l %d6,%d0
	add.l %d0,%a2
.L1262:
	move.l %a6,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	tst.l %d0
	jeq .L1261
	mov3q.l #1,%d0
	move.l %a6,%d1
	lsl.l %d1,%d0
	or.l %d0,%d2
.L1261:
	addq.l #1,%a6
	moveq #8,%d5
	cmp.l %a6,%d5
	jne .L1262
	move.l -2147457608,%d0
	mov3q.l #1,%d5
	cmp.l %d0,%d5
	jeq .L1345
.L1267:
	move.l %d0,last_transport
	move.l 1187521622,%d3
	move.b 269161679,%d5
	move.b %d5,47(%sp)
	mvz.b %d5,%d6
	mvz.b 269161676,%d4
	move.l %d6,40(%sp)
.L1293:
	move.w #497,%a6
	clr.l %d0
	lea (-435,%a2),%a3
.L1271:
	btst %d0,%d2
	jeq .L1270
	mvz.b (%a3,%a6.l),%d1
	mov3q.l #1,%d5
	cmp.l %d1,%d5
	jeq .L1346
.L1270:
	addq.l #1,%d0
	lea (30,%a6),%a6
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L1271
.L1347:
	mov3q.l #7,%d5
	cmp.l %d4,%d5
	jcs .L1294
	tst.b 34(%a2,%d4.l)
	jne .L1294
	move.l #1074606108,%d0
.L1272:
	move.l %d0,1074618188
	tst.l %d2
	jeq .L1266
	tst.l -2147483630
	seq %d2
	move.l layer_gen,%a2
	move.l active,%d0
	mvs.b %d2,%d2
	neg.l %d2
	cmp.l shown_bank.l,%d3
	jne .L1273
	jra .L1344
.L1346:
	move.l %d0,-(%sp)
	lea (57,%sp),%a0
	move.l %d0,36(%sp)
	move.l %d1,40(%sp)
	jsr settings
	move.l 1187521622,%a0
	add.l #585088,%a0
	move.b 269161679,%d5
	move.w %d5,%a1
	mov3q.l #3,%d5
	move.l %a1,%d6
	and.l %d5,%d6
	mvz.w #6322,%d5
	muls.l %d5,%d6
	add.l %d6,%a0
	move.b (%a0,%a6.l),%d6
	move.w %d6,%a0
	moveq #127,%d6
	move.l %a0,%d5
	and.l %d6,%d5
	mov3q.l #3,%d6
	move.l %d5,(%sp)
	pea 57(%sp)
	move.l 40(%sp),%d0
	move.l %d0,-(%sp)
	move.l %d0,44(%sp)
	jsr save_settings
	move.b 59(%sp),%d5
	move.l 1187521622,%a1
	add.l #610376,%a1
	and.l %d6,%d5
	move.l %d5,60(%sp)
	move.b (%a1),%d5
	move.l 48(%sp),%d1
	move.l 60(%sp),%d6
	lea (12,%sp),%sp
	lsl.l %d6,%d1
	move.w %d5,%a0
	move.l %a0,%d5
	or.l %d1,%d5
	move.b %d5,(%a1)
	move.b 269161566,%d6
	move.w %d6,%a0
	move.l %a0,%d5
	or.l %d5,%d1
	move.b %d1,269161566
	move.l 1187521622,%a0
	add.l #635698,%a0
	mov3q.l #1,(%a0)
	mov3q.l #1,269452696
	jsr 1073905152
	lea (30,%a6),%a6
	move.l 32(%sp),%d0
	moveq #8,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L1271
	jra .L1347
.L1342:
	jsr pool_context
	tst.l %d0
	jeq .L1348
	tst.l 1175346736
	jne .L1256
	tst.l 1175351520
	jne .L1256
	jsr st_pool_choice_open
	jra .L1256
.L1344:
	move.l 40(%sp),%d6
	cmp.l shown_part.l,%d6
	jne .L1273
	cmp.l shown_track.l,%d4
	jne .L1273
	tst.l %a2
	jeq .L1274
	tst.l %d0
	jeq .L1275
	lea st_layer,%a3
	tst.l %d2
	jeq .L1278
	tst.l st_layer
	jeq .L1277
.L1278:
	tst.l mine
	jne .L1253
	move.l %a3,-(%sp)
	jsr 1073943660
	clr.l active
	move.l %d3,shown_bank
	move.l %d4,shown_track
	lea (44,%sp),%a1
	addq.l #4,%sp
	move.l (%a1),shown_part
	jra .L1275
.L1345:
	cmp.l last_transport.l,%d5
	jeq .L1267
	tst.l %d2
	jeq .L1268
	sub.l %a3,%a3
	lea generate_track,%a6
.L1269:
	clr.l -(%sp)
	moveq #8,%d6
	clr.l -(%sp)
	move.l %a3,-(%sp)
	jsr (%a6)
	addq.l #1,%a3
	lea (12,%sp),%sp
	cmp.l %a3,%d6
	jne .L1269
	mov3q.l #1,last_transport
	move.l 1187521622,%d3
	move.b 269161679,%d0
	move.w #497,%a6
	lea (-435,%a2),%a3
	move.b %d0,47(%sp)
	mvz.b %d0,%d1
	clr.l %d0
	mvz.b 269161676,%d4
	move.l %d1,40(%sp)
	jra .L1271
.L1294:
	move.l #1074606510,%d0
	jra .L1272
.L1280:
	tst.l %d0
	jeq .L1349
	move.l #st_edit_layer,%d0
	tst.l mine
	jne .L1253
.L1350:
	move.l %d0,-(%sp)
	jsr 1073943660
	clr.l active
	clr.l edit_view
	move.l %d3,shown_bank
	lea (44,%sp),%a0
	addq.l #4,%sp
	move.l %d4,shown_track
	move.l (%a0),shown_part
	jra .L1275
.L1349:
	move.l 40(%sp),%d1
	clr.l edit_view
	move.l %d3,shown_bank
	move.l %d1,shown_part
	move.l %d4,shown_track
	jra .L1275
.L1298:
	move.l #st_layer,%d0
	tst.l mine
	jne .L1253
	jra .L1350
.L1343:
	mov3q.l #1,%d6
	cmp.l last_transport.l,%d6
	jeq .L1338
	mov3q.l #1,last_transport
	move.l 1187521622,%d3
	clr.l %d2
	mvz.b 269161679,%d1
	move.l %d1,40(%sp)
	mvz.b 269161676,%d4
	jra .L1266
.L1341:
	jsr pool_context
	tst.l %d0
	jne .L1254
	clr.l pool_direct
	jra .L1254
.L1348:
	clr.l pool_pending
	jra .L1256
.L1300:
	lea st_edit_layer,%a0
	clr.l (%a0)
	move.l %a0,-(%sp)
	jsr 1073943700
	mov3q.l #-1,-(%sp)
	mov3q.l #1,active
	jsr 1074059592
	mov3q.l #1,1187497772
	addq.l #8,%sp
	jra .L1253
.L1274:
	tst.l %d0
	jeq .L1275
	lea st_edit_layer,%a3
	tst.l %d2
	jeq .L1278
	tst.l st_edit_layer
	jne .L1278
.L1277:
	jsr generator_view
	cmp.l %d0,%a2
	jne .L1278
	movem.l (%sp),#19580
	lea (64,%sp),%sp
	rts
.L1268:
	mov3q.l #1,last_transport
	move.l 1187521622,%d3
	move.b 269161679,%d5
	move.b %d5,47(%sp)
	mvz.b %d5,%d6
	mvz.b 269161676,%d4
	move.l %d6,40(%sp)
	jra .L1293
	.size	st_ui_tick, .-st_ui_tick
	.section	.rodata
	.align	2
	.type	formats.1, @object
	.size	formats.1, 24
formats.1:
	.long	midi_format_0
	.long	midi_format_1
	.long	midi_format_2
	.long	midi_format_3
	.long	midi_format_4
	.long	midi_format_5
	.type	titles.2, @object
	.size	titles.2, 39
titles.2:
	.string	"VECTOR SRC"
	.zero	2
	.string	"VECTOR AMP 1"
	.string	"VECTOR AMP 2"
	.type	first.3, @object
	.size	first.3, 16
first.3:
	.base64	"CwsAAQAwAQwMAAAAAAAAAA=="
	.local	locked.4
	.comm	locked.4,64,1
	.section	.rodata.str1.1
.LC9:
	.string	"C"
.LC10:
	.string	"C#"
.LC11:
	.string	"D"
.LC12:
	.string	"D#"
.LC13:
	.string	"E"
.LC14:
	.string	"F"
.LC15:
	.string	"F#"
.LC16:
	.string	"G"
.LC17:
	.string	"G#"
.LC18:
	.string	"A"
.LC19:
	.string	"A#"
.LC20:
	.string	"B"
	.section	.rodata
	.align	2
	.type	roots.6, @object
	.size	roots.6, 48
roots.6:
	.long	.LC9
	.long	.LC10
	.long	.LC11
	.long	.LC12
	.long	.LC13
	.long	.LC14
	.long	.LC15
	.long	.LC16
	.long	.LC17
	.long	.LC18
	.long	.LC19
	.long	.LC20
	.set	roots.0,roots.6
	.align	2
	.type	formats.7, @object
	.size	formats.7, 48
formats.7:
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
	.type	handlers.8, @object
	.size	handlers.8, 8
handlers.8:
	.long	pool_static
	.long	pool_flex
	.type	mg_keys, @object
	.size	mg_keys, 4
mg_keys:
	.ascii	"3 12"
	.local	mg_opened
	.comm	mg_opened,4,2
	.local	mg_cursor
	.comm	mg_cursor,4,2
	.local	mg_shown
	.comm	mg_shown,4,2
	.local	mg_second
	.comm	mg_second,4,2
	.local	mg_mine
	.comm	mg_mine,4,2
	.local	mg_saved
	.comm	mg_saved,48,2
	.local	mg_active
	.comm	mg_active,4,2
	.local	mg_seen
	.comm	mg_seen,4,2
	.type	mg_arp_setup_slots, @object
	.size	mg_arp_setup_slots, 6
mg_arp_setup_slots:
	.base64	"AAAHAAAA"
	.type	mg_arp_page, @object
	.size	mg_arp_page, 6
mg_arp_page:
	.string	"@"
	.base64	"AAUABg=="
	.globl	vector_midi
	.align	2
	.type	vector_midi, @object
	.size	vector_midi, 36
vector_midi:
	.long	2
	.long	.LC8
	.long	86
	.long	1
	.long	vector_midi_assign
	.long	vector_midi_page
	.long	vector_midi_knob
	.long	vector_midi_yes
	.long	0
	.local	midi_view
	.comm	midi_view,4,2
	.data
	.align	2
	.type	midi_page_built, @object
	.size	midi_page_built, 4
midi_page_built:
	.zero	4
	.section	.rodata
	.type	midi_layout, @object
	.size	midi_layout, 18
midi_layout:
	.base64	"AAECAwwG"
	.base64	"DQUEBwgK"
	.base64	"CQsODxAQ"
	.type	midi_byte, @object
	.size	midi_byte, 16
midi_byte:
	.base64	"AAECAwQFBgcICQoLAAANDg=="
	.type	midi_max, @object
	.size	midi_max, 16
midi_max:
	.base64	"DxALBH5/fwwYP0ABCX8VFw=="
	.section	.rodata.str1.1
.LC21:
	.string	"TYPE"
.LC22:
	.string	"DENS"
.LC23:
	.string	"ROOT"
.LC24:
	.string	"SCAL"
.LC25:
	.string	"GATE"
.LC26:
	.string	"ACNT"
.LC27:
	.string	"SEED"
.LC28:
	.string	"SPAN"
.LC29:
	.string	"OFST"
.LC30:
	.string	"ROT"
.LC31:
	.string	"RPT"
.LC32:
	.string	"DIR"
.LC33:
	.string	"OCT"
.LC34:
	.string	"VEL"
.LC35:
	.string	"PROB"
.LC36:
	.string	"HUMN"
	.section	.rodata
	.align	2
	.type	midi_names, @object
	.size	midi_names, 68
midi_names:
	.long	.LC21
	.long	.LC22
	.long	.LC23
	.long	.LC24
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
	.long	.LC3
	.section	.rodata.str1.1
.LC37:
	.string	"001 STATIC"
.LC38:
	.string	"002 FLEX"
	.section	.rodata
	.align	2
	.type	pool_labels, @object
	.size	pool_labels, 8
pool_labels:
	.long	.LC37
	.long	.LC38
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
.LC39:
	.string	"CHR"
.LC40:
	.string	"MIN"
.LC41:
	.string	"MAJ"
.LC42:
	.string	"DOR"
.LC43:
	.string	"PENT"
	.section	.rodata
	.align	2
	.type	vector_scale_names, @object
	.size	vector_scale_names, 20
vector_scale_names:
	.long	.LC39
	.long	.LC40
	.long	.LC41
	.long	.LC42
	.long	.LC43
	.globl	vector_control_max
	.type	vector_control_max, @object
	.size	vector_control_max, 12
vector_control_max:
	.base64	"DxALBH5/fwwYP0AB"
	.globl	vector_control_names
	.align	2
	.type	vector_control_names, @object
	.size	vector_control_names, 48
vector_control_names:
	.long	.LC21
	.long	.LC22
	.long	.LC23
	.long	.LC24
	.long	.LC25
	.long	.LC26
	.long	.LC27
	.long	.LC28
	.long	.LC29
	.long	.LC30
	.long	.LC31
	.long	.LC32
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

| SPDX-License-Identifier: MIT
| The sites of the MIDI generator registry (midi_generators.c, events.json ot_midi_generators): the base's, and a
| card build's generator module patches the same ones. Each replays its own instructions, never stock's bytes.
        .text
        .balign 2
        .global mg_tap_site, mg_page_site, mg_setup_site
| Double-tap TRACK (0x40083afc, 10 bytes): d2 is the tapped track, the current one. Stock asks for MIDI mode
| (0x40033970) and does nothing in it (0x40083b7e).
mg_tap_site:
        jsr 0x40033970
        tst.l %d0
        beq.s 1f
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %d2,-(%sp)
        jsr mg_track_tap
        addq.l #4,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x40083b7e
1:      jmp 0x40083b06
| The main page drawer's MIDI arm (0x4004e1ea, 10 bytes): 0x40031ee0(-1, its page argument) is the descriptor; a
| generator's page replaces it. Stock pops the two arguments at 0x4004e1f4.
mg_page_site:
        move.l 8(%fp),-(%sp)
        pea -1.w
        jsr 0x40031ee0
        lea -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l %d0,-(%sp)
        jsr mg_page
        addq.l #4,%sp
        movem.l (%sp),%d1/%a0-%a1
        lea 12(%sp),%sp
        jmp 0x4004e1f4
| The setup opener 0x40032228(page) in MIDI mode, page 2 (0x40032280, 8 bytes): ARP SETUP's open routine from its
| window record, then 0x400322ec calls it. The opener has no frame here, so rts returns to its caller.
mg_setup_site:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr mg_arp_setup
        tst.l %d0
        movem.l (%sp),%d0-%d1/%a0-%a1   | movem and lea keep the condition codes
        lea 16(%sp),%sp
        bne.s 1f
        move.l 0x400cfeda,%a1
        jmp 0x400322ec
1:      rts
| MIDI NOTE SETUP's drawer 0x40036548 (8 bytes): its displaced prologue, filled from the user's own OS (the base's
| modwerk_stock_ placeholders; a card build's StockCopy of the same span), then the rest of it.
        .global mg_stock_note_draw
mg_stock_note_draw:
        .globl modwerk_stock_40036548_8
modwerk_stock_40036548_8:
        .space 8
        jmp 0x40036550

| Input layers (stock's list at 0x460d165c: a pushed layer links last). Keys: code, then the press, release and
| repeat handlers; encoders A-F: the turn handler.
        .data
        .balign 4
        .global mg_list_layer, mg_page_layer
mg_list_layer:
        .long 0,mg_list_keys,0,0,0,-1,-1
mg_page_layer:
        .long 0,mg_page_keys,mg_page_encs,0,0,-1,-1
mg_list_keys:
        .irp k,0x33,0x20,0x31
        .byte \k,0
        .long mg_key,mg_key,mg_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
mg_page_keys:
        .irp k,0x31,0x32
        .byte \k,0
        .long mg_key,mg_key,mg_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
mg_page_encs:
        .irp k,0,1,2,3,4,5
        .byte \k,0
        .long mg_knob,0,0,0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .text

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
