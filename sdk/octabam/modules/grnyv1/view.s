#NO_APP
	.file	"view.c"
	.text
	.align	2
	.type	glyphs, @function
glyphs:
	lea (-24,%sp),%sp
	clr.l %d1
	mvz.w 30(%sp),%d0
	move.l 36(%sp),%a0
	sub.l %a1,%a1
	movem.l #1084,(%sp)
	move.l 32(%sp),%d3
	addq.l #1,%d3
	lsl.l #3,%d0
	add.l #68,%d0
	add.l frame_words,%d0
.L3:
	mvz.w %d1,%d2
	move.l %d1,%d4
	mov3q.l #6,%d5
	lsl.l #3,%d2
	move.l %d2,%a2
	add.l %d0,%a2
	remu.l %d5,%d2:%d4
	tst.l %d2
	jne .L2
	move.l (%a0)+,%a1
.L2:
	move.l %a1,%d2
	moveq #31,%d4
	and.l %d4,%d2
	move.l %a1,%d5
	lsr.l #5,%d5
	addq.l #1,%d1
	move.l %d5,%a1
	lsl.l %d3,%d2
	or.l %d2,(%a2)
	cmp.l 40(%sp),%d1
	jne .L3
	movem.l (%sp),#1084
	lea (24,%sp),%sp
	rts
	.size	glyphs, .-glyphs
	.align	2
	.type	compose, @function
compose:
	lea (-40,%sp),%sp
	clr.l %d0
	movem.l #15612,(%sp)
	lea og_peaks,%a2
	mov3q.l #1,%d3
	move.l %a2,%a0
.L7:
	mvz.w (%a0)+,%d1
	cmp.l %d3,%d1
	jls .L6
	move.l %d1,%d3
.L6:
	addq.l #1,%d0
	moveq #108,%d1
	cmp.l %d0,%d1
	jne .L7
	clr.l %d0
	clr.l %d2
	clr.l %d4
	sub.l %a0,%a0
	lea og_columns+8,%a3
	lea og_caption,%a4
	lea og_peak_heights,%a5
.L10:
	tst.l %d2
	jne .L8
	moveq #41,%d6
	cmp.l %d0,%d6
	jcs .L11
	move.l %d0,%d1
	mov3q.l #6,%d7
	divu.l %d7,%d1
	move.l (%a4,%d1.l*4),%a0
.L15:
	mov3q.l #6,%d2
.L8:
	move.w (%a2)+,%d1
	subq.l #1,%d2
	mulu.w #11,%d1
	divu.l %d3,%d1
	btst #0,%d0
	jeq .L12
	move.l %d1,%d6
	lsl.l #4,%d6
	or.l %d4,%d6
	move.b %d6,%d7
	move.l %d0,%d6
	lsr.l #1,%d6
	move.b %d7,(%a5,%d6.l)
.L9:
	move.l %d1,%d6
	mov3q.l #1,%d7
	add.l %d6,%d6
	addq.l #1,%d0
	addq.l #1,%d6
	lsl.l %d6,%d7
	moveq #19,%d6
	sub.l %d1,%d6
	move.l %d7,%a1
	subq.l #1,%a1
	move.l %a1,%d1
	moveq #62,%d7
	lsl.l %d6,%d1
	move.l %a0,%d6
	add.l %d6,%d6
	and.l %d7,%d6
	or.l %d6,%d1
	moveq #108,%d6
	move.l %d1,(%a3)+
	move.l %a0,%d1
	lsr.l #5,%d1
	move.l %d1,%a0
	cmp.l %d0,%d6
	jne .L10
	movem.l (%sp),#15612
	lea (40,%sp),%sp
	rts
.L11:
	sub.l %a0,%a0
	jra .L15
.L12:
	move.l %d1,%d4
	jra .L9
	.size	compose, .-compose
	.align	2
	.type	visible, @function
visible:
	lea (-12,%sp),%sp
	movem.l #28,(%sp)
	mvz.b 1187502296,%d0
	subq.l #4,%d0
	tst.l %d0
	jeq .L17
.L19:
	clr.l %d0
.L16:
	movem.l (%sp),#28
	lea (12,%sp),%sp
	rts
.L17:
	tst.l 1175263034
	jne .L19
	tst.l 1175262868
	jne .L19
	move.l 1175262812,%a0
	tst.l %a0
	jeq .L19
	tst.l (%a0)
	jne .L19
	move.b 269161676,%d0
	move.l 1187521622,%d1
	mov3q.l #7,%d3
	mvz.b %d0,%d2
	cmp.l %d2,%d3
	jcs .L19
	move.l %d1,%a0
	add.l #-1074668000,%a0
	cmp.l #10171391,%a0
	jhi .L19
	move.b 269161679,%d4
	add.l #585096,%d1
	add.l %d2,%d1
	move.w %d4,%a0
	mov3q.l #3,%d4
	move.l %a0,%d3
	and.l %d4,%d3
	mvz.w #6322,%d4
	muls.l %d4,%d3
	move.l %d3,%a0
	mvz.b (%a0,%d1.l),%d1
	subq.l #7,%d1
	tst.l %d1
	jne .L19
	addq.l #1,%d0
	mvz.b %d0,%d0
	jra .L16
	.size	visible, .-visible
	.align	2
	.type	caption, @function
caption:
	lea (-44,%sp),%sp
	moveq #44,%d1
	move.l 48(%sp),%d0
	movem.l #23612,(%sp)
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #1187586780,%a0
	move.l (%a0),og_ui_name
	addq.l #4,%a0
	move.l (%a0),og_ui_name+4
	move.w 4(%a0),%d0
	swap %d0
	clr.w %d0
	move.l %d0,og_ui_name+8
	clr.l %d0
.L25:
	moveq #-4,%d1
	mov3q.l #3,%d3
	and.l %d0,%d1
	move.l %d1,%a0
	move.l %d0,%d1
	not.l %d1
	and.l %d3,%d1
	add.l #og_ui_name,%a0
	move.l (%a0),%d2
	lsl.l #3,%d1
	lsr.l %d1,%d2
	tst.b %d2
	jeq .L24
	move.b %d2,34(%sp,%d0.l)
	addq.l #1,%d0
	moveq #10,%d4
	cmp.l %d0,%d4
	jne .L25
.L26:
	mvz.b 30(%sp,%d0.l),%d1
	move.l %d0,%a1
	moveq #46,%d2
	subq.l #4,%a1
	cmp.l %d1,%d2
	jne .L39
	mvz.b 31(%sp,%d0.l),%d1
	moveq #25,%d3
	move.l %d1,%a0
	lea (-97,%a0),%a0
	cmp.l %a0,%d3
	jcs .L28
	add.l #-32,%d1
.L28:
	mvz.b 32(%sp,%d0.l),%d3
	swap %d1
	clr.w %d1
	moveq #25,%d4
	move.l %d3,%d2
	add.l #-97,%d2
	cmp.l %d2,%d4
	jcs .L29
	add.l #-32,%d3
.L29:
	move.l %d3,%d2
	moveq #25,%d5
	lsl.l #8,%d2
	mvz.b 33(%sp,%d0.l),%d3
	or.l %d2,%d1
	move.l %d3,%d2
	add.l #-97,%d2
	cmp.l %d2,%d5
	jcs .L30
	add.l #-32,%d3
.L30:
	or.l %d3,%d1
	cmp.l #5718358,%d1
	jeq .L27
	cmp.l #4278598,%d1
	jeq .L27
.L39:
	move.l %d0,%a1
	jra .L27
.L24:
	move.l %d0,%a1
	mov3q.l #3,%d5
	cmp.l %d0,%d5
	jcs .L26
.L27:
	lea og_caption,%a0
	clr.l %d0
	move.l %a0,%a2
	lea sample_columns,%a3
.L32:
	tst.l %a1
	jne .L41
	mov3q.l #3,%d1
	cmp.l %d0,%d1
	jcs .L41
	move.l (%a3,%d0.l*4),%d1
.L31:
	move.l %d1,(%a0)+
	addq.l #1,%d0
	mov3q.l #7,%d2
	cmp.l %d0,%d2
	jne .L32
	clr.l %d1
	lea font,%a3
.L33:
	cmp.l %a1,%d1
	jne .L37
	movem.l (%sp),#23612
	lea (44,%sp),%sp
	rts
.L41:
	clr.l %d1
	jra .L31
.L37:
	mvz.b 34(%sp,%d1.l),%d0
	mvz.w %d1,%d4
	moveq #25,%d3
	move.l %d0,%a0
	lea (-97,%a0),%a0
	cmp.l %a0,%d3
	jcs .L34
	add.l #-64,%d0
.L35:
	mvz.w (%a3,%d0.l*2),%d2
	sub.l %a0,%a0
.L36:
	lea (%a0,%d4.l*4),%a4
	mov3q.l #6,%d5
	addq.l #1,%a0
	move.l %a4,%d0
	remu.l %d5,%d3:%d0
	divu.l %d5,%d0
	moveq #31,%d5
	and.l %d2,%d5
	lsr.l #5,%d2
	mulu.w #5,%d3
	lsl.l %d3,%d5
	or.l %d5,(%a2,%d0.l*4)
	mov3q.l #3,%d0
	cmp.l %a0,%d0
	jne .L36
	addq.l #1,%d1
	jra .L33
.L34:
	add.l #-32,%d0
	moveq #63,%d5
	cmp.l %d0,%d5
	jcc .L35
	moveq #31,%d0
	jra .L35
	.size	caption, .-caption
	.align	2
	.globl	og_source
	.type	og_source, @function
og_source:
	move.l 4(%sp),%a1
	mov3q.l #7,%d0
	move.l 1187521622,%a0
	cmp.l %a1,%d0
	jcs .L54
	move.l %a0,%d0
	add.l #-1074668000,%d0
	cmp.l #10171391,%d0
	jhi .L54
	move.b 269161679,%d0
	mov3q.l #3,%d1
	add.l #585088,%a0
	and.l %d1,%d0
	mvz.w #6322,%d1
	muls.l %d1,%d0
	add.l %d0,%a0
	mvz.b 34(%a0,%a1.l),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L54
	lea (%a1,%a1.l*4),%a1
	add.l %a1,%a0
	mvz.b 715(%a0),%d0
	move.l %d0,4(%sp)
	jra og_describe
.L54:
	clr.l %d0
	rts
	.size	og_source, .-og_source
	.align	2
	.globl	og_ui
	.type	og_ui, @function
og_ui:
	lea (-96,%sp),%sp
	movem.l #31996,(%sp)
	jsr og_release_check
	jsr visible
	move.l %d0,%a2
	tst.l %d0
	jne .L57
	clr.l og_ui_wait
.L56:
	movem.l (%sp),#31996
	lea (96,%sp),%sp
	rts
.L57:
	move.l og_ui_wait,%a5
	tst.l %a5
	jeq .L102
	move.l %a5,%d0
	subq.l #1,%d0
.L59:
	move.l og_ui_frames,%d4
	move.l %d0,og_ui_wait
	tst.l %a5
	jeq .L60
	tst.l %d4
	jeq .L56
	cmp.l og_ui_scanned.l,%d4
	jhi .L60
	tst.l og_ui_stale
	jeq .L56
.L60:
	pea 72(%sp)
	pea -1(%a2)
	jsr og_source
	addq.l #8,%sp
	tst.l %d0
	jne .L61
	clr.l og_ui_frames
.L62:
	tst.l %a5
	jne .L56
	mov3q.l #1,1187497772
	jra .L56
.L102:
	mov3q.l #7,%d0
	jra .L59
.L61:
	moveq #24,%d2
	move.l 72(%sp),%d1
	move.l %d1,%d0
	lsl.l %d2,%d0
	move.l 80(%sp),%d5
	move.l 76(%sp),%d2
	eor.l %d5,%d0
	cmp.l og_ui_identity.l,%d0
	jne .L63
	cmp.l og_cached_track.l,%a2
	jne .L63
	cmp.l %d4,%d2
	jeq .L64
.L63:
	move.l %d0,og_ui_identity
	move.l %a2,og_cached_track
	move.l %d2,og_ui_frames
	clr.l og_ui_scanned
	clr.l og_ui_probed
	lea og_peaks,%a0
	clr.l %d0
.L65:
	addq.l #1,%d0
	moveq #108,%d6
	clr.w (%a0)+
	cmp.l %d0,%d6
	jne .L65
.L66:
	move.l %d1,-(%sp)
	jsr caption
	jsr compose
	clr.l og_ui_stale
	addq.l #4,%sp
	jra .L62
.L64:
	moveq #44,%d0
	muls.l %d1,%d0
	move.l og_ui_name,%a1
	move.l %d0,%a0
	add.l #1187586780,%a0
	cmp.l (%a0),%a1
	jne .L66
	move.l og_ui_name+4,%d5
	cmp.l 4(%a0),%d5
	jne .L66
	move.l %d0,%a0
	add.l #1187586788,%a0
	move.w (%a0),%d0
	swap %d0
	clr.w %d0
	cmp.l og_ui_name+8.l,%d0
	jne .L66
	tst.l og_ui_stale
	jeq .L68
	tst.l %a5
	jeq .L69
	cmp.l og_ui_scanned.l,%d4
	jhi .L68
.L69:
	jsr compose
	clr.l og_ui_stale
	jra .L62
.L68:
	move.l og_ui_probed,%d3
	moveq #107,%d6
	cmp.l %d3,%d6
	jcs .L70
	move.l %d3,%a2
	moveq #108,%d0
	lea (24,%a2),%a2
	cmp.l %a2,%d0
	jcc .L71
	move.w #108,%a2
.L71:
	move.l %d2,%d4
	moveq #108,%d1
	add.l #107,%d4
	divu.l %d1,%d4
	move.l %d4,%d6
	muls.l %d3,%d6
	move.l %d4,60(%sp)
.L72:
	cmp.l %a2,%d3
	jcs .L84
	move.l %a2,og_ui_probed
.L132:
	mov3q.l #1,og_ui_stale
	jra .L62
.L84:
	cmp.l %d6,%d2
	jls .L104
	move.l 60(%sp),%d5
	move.l %d2,%d0
	sub.l %d6,%d0
	cmp.l %d5,%d0
	jcc .L74
	move.l %d0,%d5
.L74:
	tst.l %d5
	jeq .L104
	move.w %d3,%d4
	sub.l %a6,%a6
	clr.l %d7
	sub.l %a4,%a4
	mulu.w #37,%d4
	move.l %d4,%a3
.L83:
	move.l %a3,%d0
	remu.l %d5,%d1:%d0
	pea 68(%sp)
	move.l %a6,%d0
	lsr.l #3,%d0
	add.l %d1,%d0
	remu.l %d5,%d1:%d0
	move.l %d1,%a0
	pea (%a0,%d6.l)
	pea 80(%sp)
	jsr og_locate
	lea (12,%sp),%sp
	move.l %d0,%a0
	tst.l %d0
	jeq .L82
	mvz.b 84(%sp),%d0
	mvz.b 85(%sp),%d4
	mov3q.l #2,%d1
	cmp.l %d0,%d1
	jne .L76
	cmp.l %d4,%d1
	jne .L77
	move.l (%a0),%d0
	move.l %d0,%d1
	swap %d1
	ext.l %d1
.L130:
	mvs.w %d0,%d0
.L78:
	tst.l %d1
	jge .L79
	neg.l %d1
.L79:
	tst.l %d0
	jge .L80
	neg.l %d0
.L80:
	cmp.l %d1,%d0
	jle .L81
	move.l %d0,%d1
.L81:
	cmp.l %d7,%d1
	jls .L82
	move.l %d1,%d7
.L82:
	addq.l #1,%a4
	add.l %d5,%a6
	lea (17,%a3),%a3
	moveq #8,%d0
	cmp.l %a4,%d0
	jne .L83
.L73:
	lea og_peaks,%a0
	move.w %d7,(%a0,%d3.l*2)
	add.l 60(%sp),%d6
	addq.l #1,%d3
	jra .L72
.L77:
	mvs.w (%a0),%d1
.L105:
	move.l %d1,%d0
	jra .L78
.L76:
	move.l %a0,%a1
	subq.l #2,%d4
	move.b (%a1)+,%d1
	move.l %d1,%d0
	lsl.l #8,%d0
	mvz.b (%a1),%d1
	or.l %d1,%d0
	mvs.w %d0,%d1
	tst.l %d4
	jne .L105
	move.b 3(%a0),%d4
	move.l %d4,%d0
	lsl.l #8,%d0
	mvz.b 4(%a0),%d4
	or.l %d4,%d0
	jra .L130
.L104:
	clr.l %d7
	jra .L73
.L70:
	move.l og_ui_scanned,%d3
	cmp.l %d3,%d4
	jls .L62
	move.b 85(%sp),%d5
	mov3q.l #2,%d0
	mov3q.l #2,%d4
	moveq #108,%d6
	move.l %d3,%d7
	eor.l %d5,%d0
	mvz.b %d5,%d5
	tst.b %d0
	seq %d0
	neg.l %d0
	mvz.b %d0,%d1
	move.b 84(%sp),%d0
	move.l %d1,%a1
	eor.l %d0,%d4
	mvz.b %d0,%d0
	muls.w %d5,%d0
	move.l %d2,%d5
	add.l #107,%d5
	tst.b %d4
	seq %d4
	neg.l %d4
	mvz.b %d4,%d4
	lea (%a1,%d4.l*2),%a4
	mvz.w #6144,%d4
	divu.l %d0,%d4
	divu.l %d6,%d5
	move.l %d4,%a2
	move.l %d3,%d6
	add.l %a2,%d6
	divu.l %d5,%d7
	move.l %d5,44(%sp)
	move.l %d7,%d4
	add.l #27,%d4
	muls.l %d5,%d4
	cmp.l %d6,%d4
	jcc .L85
	move.l %d4,%d6
.L85:
	move.l %d6,60(%sp)
	cmp.l %d6,%d2
	jcc .L86
	move.l %d2,60(%sp)
.L86:
	move.l 44(%sp),%d1
	moveq #26,%d0
	clr.l %d2
	sub.l %a6,%a6
	muls.l %d1,%d0
	lea og_peaks,%a3
	sub.l %d0,%d4
.L87:
	cmp.l 60(%sp),%d3
	jcs .L99
	sub.l 44(%sp),%d4
	cmp.l %d3,%d4
	jcc .L100
	neg.l %d2
	cmp.l %a6,%d2
	jle .L101
	move.l %d2,%a6
.L101:
	lea og_peaks,%a0
	mvz.w (%a0,%d7.l*2),%d0
	cmp.l %a6,%d0
	jcc .L100
	move.w %a6,(%a0,%d7.l*2)
.L100:
	move.l %d3,og_ui_scanned
	jra .L132
.L99:
	pea 68(%sp)
	move.l %d3,-(%sp)
	pea 80(%sp)
	jsr og_locate
	lea (12,%sp),%sp
	tst.l %d0
	jne .L88
	move.l %a2,%d6
	move.l %d3,%d5
	remu.l %d6,%d1:%d5
	sub.l %d1,%d6
	move.l %d6,68(%sp)
.L88:
	move.l 68(%sp),%a0
	move.l 60(%sp),%d1
	sub.l %d3,%d1
	cmp.l %d1,%a0
	jls .L89
	move.l %d1,68(%sp)
	move.l %d1,%a0
.L89:
	add.l %d3,%a0
.L98:
	move.l %d3,%a1
	move.l %a0,%d3
	cmp.l %a0,%d4
	jcc .L90
	move.l %d4,%d3
.L90:
	tst.l %d0
	jeq .L91
	move.l %d3,%d1
	mov3q.l #3,%d5
	sub.l %a1,%d1
	cmp.l %a4,%d5
	jne .L92
	move.l %d0,56(%sp)
	move.l %d1,52(%sp)
	move.l %d0,%a1
	move.l %a6,%d6
#APP
| 272 "view.c" 1
	1:	move.l	(%a1)+,%d0
	mvs.w	%d0,%d5
	cmp.l	%d5,%d6
	jge	2f
	move.l	%d5,%d6
2:	cmp.l	%d5,%d2
	jle	3f
	move.l	%d5,%d2
3:	swap	%d0
	mvs.w	%d0,%d5
	cmp.l	%d5,%d6
	jge	4f
	move.l	%d5,%d6
4:	cmp.l	%d5,%d2
	jle	5f
	move.l	%d5,%d2
5:	subq.l	#1,%d1
	jne	1b

| 0 "" 2
#NO_APP
.L133:
	move.l %d6,%a6
.L131:
	move.l %a1,%d0
.L91:
	cmp.l %a0,%d4
	jhi .L87
	neg.l %d2
	cmp.l %a6,%d2
	jle .L96
	move.l %d2,%a6
.L96:
	mvz.w (%a3,%d7.l*2),%d1
	cmp.l %a6,%d1
	jcc .L97
	move.w %a6,(%a3,%d7.l*2)
.L97:
	move.l 44(%sp),%d1
	addq.l #1,%d7
	add.l %d4,%d1
	sub.l %a6,%a6
	clr.l %d2
	cmp.l %a0,%d4
	jne .L106
	move.l %d1,%d4
	jra .L87
.L106:
	move.l %d1,%d4
	jra .L98
.L92:
	mov3q.l #2,%d5
	cmp.l %a4,%d5
	jne .L93
	move.l %d1,64(%sp)
	move.l %d0,%a1
	move.l %a6,%d6
#APP
| 277 "view.c" 1
	1:	mvs.w	(%a1)+,%d5
	cmp.l	%d5,%d6
	jge	2f
	move.l	%d5,%d6
2:	cmp.l	%d5,%d2
	jle	3f
	move.l	%d5,%d2
3:	subq.l	#1,%d1
	jne	1b

| 0 "" 2
#NO_APP
	jra .L133
.L93:
	mov3q.l #1,%d5
	move.l %d1,64(%sp)
	move.l %d0,%a1
	cmp.l %a4,%d5
	jne .L94
	move.l %a6,%d6
#APP
| 281 "view.c" 1
	1:	move.b	0(%a1),%d5
	lsl.l	#8,%d5
	move.b	0+1(%a1),%d5
	mvs.w	%d5,%d5
	cmp.l	%d5,%d6
	jge	2f
	move.l	%d5,%d6
2:	cmp.l	%d5,%d2
	jle	3f
	move.l	%d5,%d2
3:	move.b	3(%a1),%d5
	lsl.l	#8,%d5
	move.b	3+1(%a1),%d5
	mvs.w	%d5,%d5
	cmp.l	%d5,%d6
	jge	4f
	move.l	%d5,%d6
4:	cmp.l	%d5,%d2
	jle	5f
	move.l	%d5,%d2
5:	addq.l	#6,%a1
	subq.l	#1,%d1
	jne	1b

| 0 "" 2
#NO_APP
	jra .L133
.L94:
	move.l %a6,%d5
#APP
| 285 "view.c" 1
	1:	move.b	0(%a1),%d6
	lsl.l	#8,%d6
	move.b	0+1(%a1),%d6
	mvs.w	%d6,%d6
	addq.l	#3,%a1
	cmp.l	%d6,%d5
	jge	2f
	move.l	%d6,%d5
2:	cmp.l	%d6,%d2
	jle	3f
	move.l	%d6,%d2
3:	subq.l	#1,%d1
	jne	1b

| 0 "" 2
#NO_APP
	move.l %d5,%a6
	jra .L131
	.size	og_ui, .-og_ui
	.align	2
	.globl	og_draw
	.type	og_draw, @function
og_draw:
	link.w %fp,#-128
	movem.l #15612,(%sp)
	move.l 8(%fp),%d2
	jsr visible
	tst.l %d0
	jeq .L134
	move.l 1187521622,%d1
	subq.l #1,%d0
	move.l %d1,%a0
	add.l #-1074668000,%a0
	cmp.l #10171391,%a0
	jhi .L136
	move.b 269161679,%d3
	mov3q.l #3,%d4
	move.w %d0,%d6
	mvz.w #6322,%d5
	add.l #585388,%d1
	sub.l %a0,%a0
	lea values,%a2
	and.l %d4,%d3
	mulu.w #24,%d6
	move.l %d6,%a1
	muls.l %d5,%d3
	add.l %d3,%d1
	add.l %d1,%a1
.L138:
	move.b (%a1,%a0.l),%d1
	jpl .L137
	moveq #127,%d1
.L137:
	move.b %d1,(%a2,%a0.l)
	addq.l #1,%a0
	mov3q.l #6,%d7
	cmp.l %a0,%d7
	jne .L138
.L136:
	move.w #128,%a0
	moveq #64,%d1
	mov3q.l #7,%d4
	move.l og_owner,%d3
	move.l %d1,-60(%fp)
	move.l %a0,-64(%fp)
	move.l %d2,%a0
	move.l %d2,%d1
	move.l %d2,frame_words
	mov3q.l #2,-56(%fp)
	move.l %d2,-52(%fp)
	clr.l -48(%fp)
	lea (64,%a0),%a0
	add.l #960,%d1
	cmp.l %d3,%d4
	jcs .L139
	cmp.l %d0,%d3
	jeq .L139
.L140:
	move.l #-33554432,%d5
	mov3q.l #1,%d6
	and.l %d5,(%a0)
	and.l %d6,4(%a0)
	addq.l #8,%a0
	cmp.l %d1,%a0
	jne .L140
	pea 39.w
	pea fract_on_t
	pea 16.w
	pea 34.w
	lea glyphs,%a2
	jsr (%a2)
	mov3q.l #3,-(%sp)
	pea -44(%fp)
	pea 16.w
	lea font,%a0
	pea 74.w
	mvz.w 34(%a0,%d3.l*2),%d0
	move.l %d0,-44(%fp)
	jsr (%a2)
	lea (32,%sp),%sp
.L141:
	move.l %fp,%d4
	moveq #10,%d3
	add.l #-64,%d4
	clr.l %d2
	lea values,%a2
.L168:
	mvz.b (%a2,%d2.l),%d0
	move.l %d4,-(%sp)
	clr.l -(%sp)
	clr.l -(%sp)
	move.l %d0,-(%sp)
	move.l %d2,-(%sp)
	mov3q.l #6,-(%sp)
	move.l %d3,-(%sp)
	jsr 1074035124
	addq.l #1,%d2
	add.l #18,%d3
	lea (28,%sp),%sp
	mov3q.l #6,%d5
	cmp.l %d2,%d5
	jne .L168
	mvs.w #-255,%d6
	move.l frame_words,%a0
	move.l %a0,%d0
	move.l %a0,%d5
	add.l #80,%d0
	lea control_columns,%a1
	add.l #944,%d5
	and.l %d6,64(%a0)
	and.l %d6,72(%a0)
.L170:
	move.l (%a1)+,%d2
	clr.l %d1
.L169:
	move.l %d2,%d4
	move.l %d0,%a2
	lsl.l #3,%d4
	move.l (%a2,%d1.l),%d3
	lsr.l #5,%d2
	moveq #48,%d7
	and.l #-33554687,%d3
	mvz.b %d4,%d4
	or.l %d4,%d3
	or.l #33554434,%d3
	move.l %d3,(%a2,%d1.l)
	addq.l #8,%d1
	cmp.l %d1,%d7
	jne .L169
	add.l #48,%d0
	cmp.l %d5,%d0
	jne .L170
	mvs.w #-255,%d0
	and.l %d0,944(%a0)
	and.l %d0,952(%a0)
.L134:
	movem.l -128(%fp),#15612
	unlk %fp
	rts
.L139:
	tst.l og_ui_frames
	jne .L142
.L143:
	move.l #-33554432,%d7
	mov3q.l #1,%d0
	and.l %d7,(%a0)
	and.l %d0,4(%a0)
	addq.l #8,%a0
	cmp.l %a0,%d1
	jne .L143
	pea 23.w
	pea sample_columns
	clr.l -(%sp)
	mov3q.l #2,-(%sp)
	lea glyphs,%a2
	jsr (%a2)
	lea (16,%sp),%sp
	move.l %d2,%a0
	add.l #944,%d2
	lea (80,%a0),%a0
.L144:
	moveq #8,%d1
	swap %d1
	or.l %d1,4(%a0)
	lea (16,%a0),%a0
	cmp.l %d2,%a0
	jne .L144
	pea 63.w
	pea load_flex_sample
	pea 10.w
	pea 21.w
	jsr (%a2)
.L196:
	lea (16,%sp),%sp
	jra .L141
.L142:
	lea og_columns,%a1
.L145:
	move.l #-33554432,%d2
	mov3q.l #1,%d0
	and.l %d2,(%a0)
	addq.l #8,%a0
	and.l -4(%a0),%d0
	or.l (%a1)+,%d0
	move.l %d0,-4(%a0)
	cmp.l %a0,%d1
	jne .L145
	move.b 269161676,%d3
	mvz.b %d3,%d0
	move.b %d3,-85(%fp)
	cmp.l og_owner.l,%d0
	jne .L146
	mulu.w #168,%d0
	move.l %d0,%a0
	add.l #-2147464744,%a0
	tst.b (%a0)
	jeq .L146
	move.l og_ui_identity,%d4
	cmp.l og_state+104.l,%d4
	jne .L146
	mvz.b og_state+118,%d1
	mvz.b og_state+117,%d4
	mov3q.l #1,%d3
.L147:
	moveq #127,%d6
	move.l og_ui_frames,%a0
	move.l %a0,%d0
	subq.l #1,%d0
	remu.l %d6,%d5:%d0
	divu.l %d6,%d0
	muls.l %d1,%d0
	mulu.w %d5,%d1
	divu.l %d6,%d1
	move.l %d0,%d6
	add.l %d1,%d6
	tst.l %d3
	jeq .L148
	add.l og_state+96,%d6
	cmp.l %a0,%d6
	jcs .L148
	sub.l %a0,%d6
.L148:
	move.l %d4,-(%sp)
	moveq #108,%d7
	jsr og_size
	move.l og_ui_frames,%d4
	addq.l #4,%sp
	mov3q.l #-1,-76(%fp)
	mov3q.l #-1,-72(%fp)
	move.l %d4,%d1
	add.l #107,%d1
	add.l %d6,%d0
	remu.l %d4,%d5:%d0
	divu.l %d7,%d1
	mov3q.l #-1,-68(%fp)
	move.l %d6,%d0
	divu.l %d1,%d0
	divu.l %d1,%d5
	move.l %d0,%d6
	addq.l #2,%d6
	move.l %d5,%a0
	addq.l #2,%a0
	tst.l %d3
	jeq .L149
	lea og_state,%a1
	clr.l %d7
.L151:
	move.l 12(%a1),%d5
	subq.l #1,%d5
	cmp.l #88199,%d5
	jhi .L150
	cmp.l (%a1),%d4
	jls .L150
	move.l 4(%a1),%a2
	cmp.l %d4,%a2
	jcc .L150
	move.l %a2,%d5
	divu.l %d1,%d5
	move.l %d5,%a3
	addq.l #2,%a3
	move.l %a3,-76(%fp,%d7.l*4)
.L150:
	addq.l #1,%d7
	lea (32,%a1),%a1
	mov3q.l #3,%d5
	cmp.l %d7,%d5
	jne .L151
.L149:
	move.l %d6,-44(%fp)
	move.l %a0,-40(%fp)
	lea (-76,%fp),%a2
	mov3q.l #3,%a1
	mov3q.l #2,%d4
.L153:
	move.l (%a2)+,%d1
	tst.l %d1
	jlt .L152
	move.l %d1,-40(%fp,%d4.l*4)
	move.l %d1,%d7
	subq.l #1,%d7
	move.l %d7,-44(%fp,%d4.l*4)
	move.l %d4,%d5
	addq.l #1,%d1
	addq.l #2,%d5
	move.l %d1,-44(%fp,%d5.l*4)
	addq.l #3,%d4
.L152:
	subq.l #1,%a1
	tst.l %a1
	jne .L153
	lea (-44,%fp),%a2
	clr.l %d5
	move.l frame_words,%a5
.L154:
	cmp.l %d5,%d4
	jne .L164
	add.l #10,%d0
	lsl.l #3,%d0
	move.l #-1073741824,%d1
	mvz.b -85(%fp),%d2
	mulu.w #48,%d2
	add.l %d0,%a5
	move.l #-2147483648,%d0
	or.l %d0,-4(%a5)
	move.l %d2,%a0
	add.l #-2147482324,%a0
	or.l %d1,4(%a5)
	or.l %d0,12(%a5)
	tst.b (%a0)
	jeq .L165
	pea 31.w
	pea tstr_off
	clr.l -(%sp)
	pea 77.w
.L197:
	jsr glyphs
	jra .L196
.L146:
	mvz.b values,%d1
	mvz.b values+1,%d4
	clr.l %d3
	jra .L147
.L164:
	move.l (%a2)+,%d1
	sub.l %a1,%a1
	lea (-44,%fp),%a3
.L155:
	cmp.l %d5,%a1
	jeq .L156
	cmp.l (%a3),%d1
	jne .L157
	cmp.l %d5,%a1
	jcs .L158
.L156:
	move.l %d1,%a1
	moveq #109,%d2
	subq.l #1,%a1
	cmp.l %a1,%d2
	jcs .L158
	cmp.l %d6,%d1
	jeq .L172
	cmp.l %a0,%d1
	jeq .L172
	sub.l %a1,%a1
.L159:
	lea (-76,%fp),%a4
	mov3q.l #3,%a3
.L163:
	move.l (%a4)+,%d7
	tst.l %d7
	jlt .L161
	move.l %d7,%d2
	subq.l #1,%d2
	cmp.l %d1,%d2
	jgt .L161
	addq.l #1,%d7
	cmp.l %d1,%d7
	jlt .L161
	move.l %a1,%d7
	or.l #2031616,%d7
	move.l %d7,%a1
.L161:
	subq.l #1,%a3
	tst.l %a3
	jne .L163
	addq.l #8,%d1
	mvz.w %d1,%d1
	move.l %a1,%d7
	add.l %d7,%d7
	lsl.l #3,%d1
	eor.l %d7,4(%a5,%d1.l)
.L158:
	addq.l #1,%d5
	jra .L154
.L157:
	addq.l #4,%a3
	addq.l #1,%a1
	jra .L155
.L172:
	move.l #1073741760,%a1
	jra .L159
.L165:
	move.l og_ui_frames,%d2
	cmp.l og_ui_scanned.l,%d2
	jls .L167
	pea 15.w
	pea load_flex_sample
	clr.l -(%sp)
	pea 85.w
	jra .L197
.L167:
	tst.l %d3
	jne .L141
	pea 15.w
	pea stop_columns
	clr.l -(%sp)
	pea 89.w
	jra .L197
	.size	og_draw, .-og_draw
	.text
	.align	4
	.type	frame_words, @object
	.size	frame_words, 4
frame_words:
	.zero	4
	.text
	.align	4
	.type	fract_on_t, @object
	.size	fract_on_t, 28
fract_on_t:
	.long	200279231
	.long	31651871
	.long	1041253951
	.long	1
	.long	99647039
	.long	31
	.long	2017
	.align	4
	.type	stop_columns, @object
	.size	stop_columns, 12
stop_columns:
	.long	1041266359
	.long	33094657
	.long	7359
	.align	4
	.type	tstr_off, @object
	.size	tstr_off, 24
tstr_off:
	.long	728762337
	.long	2065437
	.long	31935
	.long	33094656
	.long	200279231
	.long	1
	.align	2
	.type	font, @object
	.size	font, 128
font:
	.word	0
	.word	7841
	.word	7841
	.word	32095
	.word	7841
	.word	7841
	.word	27306
	.word	7841
	.word	17856
	.word	465
	.word	7841
	.word	4548
	.word	7841
	.word	4228
	.word	512
	.word	7841
	.word	14894
	.word	17394
	.word	24253
	.word	32433
	.word	31879
	.word	9911
	.word	30399
	.word	7969
	.word	32447
	.word	32439
	.word	7841
	.word	7841
	.word	7841
	.word	7841
	.word	7841
	.word	7841
	.word	7841
	.word	30910
	.word	10943
	.word	17983
	.word	14911
	.word	18111
	.word	1215
	.word	30271
	.word	31903
	.word	18417
	.word	32280
	.word	27807
	.word	16927
	.word	31967
	.word	31839
	.word	32319
	.word	7359
	.word	32047
	.word	31935
	.word	30391
	.word	2017
	.word	32287
	.word	15887
	.word	32159
	.word	27803
	.word	3971
	.word	20153
	.word	7841
	.word	7841
	.word	7841
	.word	7841
	.word	16912
	.globl	og_ui_name
	.text
	.align	4
	.type	og_ui_name, @object
	.size	og_ui_name, 12
og_ui_name:
	.zero	12
	.globl	og_caption
	.align	4
	.type	og_caption, @object
	.size	og_caption, 28
og_caption:
	.long	199259831
	.long	32734238
	.long	569384127
	.long	18545680
	.long	0
	.long	0
	.long	0
	.text
	.align	4
	.type	load_flex_sample, @object
	.size	load_flex_sample, 44
load_flex_sample:
	.long	602948127
	.long	31651871
	.long	14911
	.long	1244160
	.long	737165855
	.long	28470289
	.long	728760320
	.long	31651869
	.long	200309983
	.long	17333255
	.long	18111
	.align	4
	.type	sample_columns, @object
	.size	sample_columns, 16
sample_columns:
	.long	199259831
	.long	32734238
	.long	569384127
	.long	18545680
	.align	4
	.type	control_columns, @object
	.size	control_columns, 72
control_columns:
	.long	200278016
	.long	33094663
	.long	30391
	.long	31120384
	.long	730875889
	.long	18545683
	.long	32701440
	.long	552617663
	.long	31120399
	.long	31120384
	.long	200285375
	.long	15268895
	.long	1041159904
	.long	589267173
	.long	579552
	.long	1041159904
	.long	241140708
	.long	579552
	.globl	og_ui_stale
	.text
	.align	4
	.type	og_ui_stale, @object
	.size	og_ui_stale, 4
og_ui_stale:
	.zero	4
	.globl	og_ui_probed
	.align	4
	.type	og_ui_probed, @object
	.size	og_ui_probed, 4
og_ui_probed:
	.zero	4
	.globl	og_columns
	.align	4
	.type	og_columns, @object
	.size	og_columns, 448
og_columns:
	.zero	448
	.globl	og_peaks
	.align	2
	.type	og_peaks, @object
	.size	og_peaks, 216
og_peaks:
	.zero	216
	.type	values, @object
	.size	values, 6
values:
	.string	"\022V@"
	.zero	2
	.ident	"GCC: (GNU) 16.2.0"
