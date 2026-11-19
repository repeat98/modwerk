#NO_APP
	.file	"registration.c"
	.text
	.align	2
	.type	signed_track, @function
signed_track:
	move.l %d2,-(%sp)
	move.l 8(%sp),%a0
	move.l 12(%sp),%d0
	mvz.b 34(%a0,%d0.l),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L2
.L4:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L2:
	mulu.w #30,%d0
	moveq #70,%d1
	lea 60(%a0,%d0.l),%a0
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jne .L4
	mvz.b 1(%a0),%d0
	moveq #77,%d2
	cmp.l %d0,%d2
	jne .L4
	move.b 2(%a0),%d0
	mov3q.l #1,%d1
	move.l (%sp)+,%d2
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	signed_track, .-signed_track
	.align	2
	.globl	fm_admit_track
	.type	fm_admit_track, @function
fm_admit_track:
	mov3q.l #7,%d1
	cmp.l 8(%sp),%d1
	scc %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	fm_admit_track, .-fm_admit_track
	.align	2
	.globl	fm_type
	.type	fm_type, @function
fm_type:
	move.l %d2,-(%sp)
	move.l 1187521622,%d0
	mov3q.l #1,%d2
	move.b 269161679,%d1
	cmp.l 8(%sp),%d2
	jeq .L18
.L11:
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
.L18:
	mov3q.l #3,%d2
	and.l %d1,%d2
	mvz.w #6322,%d1
	add.l #585088,%d0
	move.l 12(%sp),%a0
	muls.l %d1,%d2
	add.l %d2,%d0
	move.l %d0,%a1
	mov3q.l #7,%d2
	lea (34,%a1),%a1
	sub.l %a1,%a0
	cmp.l %a0,%d2
	jcs .L11
	move.l %a0,-(%sp)
	move.l %d0,-(%sp)
	jsr signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L11
	mov3q.l #5,8(%sp)
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
	.size	fm_type, .-fm_type
	.align	2
	.globl	fm_track_page
	.type	fm_track_page, @function
fm_track_page:
	jmp 1074603216
	.size	fm_track_page, .-fm_track_page
	.align	2
	.globl	fm_ui_tick
	.type	fm_ui_tick, @function
fm_ui_tick:
	jsr 1074603216
	move.l %d0,1074618188
	rts
	.size	fm_ui_tick, .-fm_ui_tick
	.align	2
	.globl	fm_validate_part
	.type	fm_validate_part, @function
fm_validate_part:
	lea (-140,%sp),%sp
	movem.l #31996,(%sp)
	move.l 144(%sp),%d2
	mov3q.l #6,%a6
	lea (44,%sp),%a2
	clr.l %d5
	move.l %a2,%a4
	clr.l %d3
.L27:
	move.l %d5,-(%sp)
	move.l %d2,-(%sp)
	jsr signed_track
	addq.l #8,%sp
	tst.l %d0
	jne .L52
.L24:
	addq.l #1,%d5
	lea (30,%a6),%a6
	lea (12,%a4),%a4
	cmp.l #246,%a6
	jne .L27
	move.l %d2,-(%sp)
	jsr fm_stock_validate
	addq.l #4,%sp
	clr.l %d5
	mov3q.l #6,%a0
.L32:
	btst %d5,%d3
	jne .L53
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #246,%a0
	jne .L32
.L56:
	movem.l (%sp),#31996
	lea (140,%sp),%sp
	rts
.L52:
	mov3q.l #1,%d0
	lsl.l %d5,%d0
	sub.l %a0,%a0
	or.l %d0,%d3
.L26:
	move.l #1074606604,%a5
	mov3q.l #5,%d0
	add.l %a0,%a5
	lea 42(%a6,%a0.l),%a3
	move.l %a5,%a1
	cmp.l %a0,%d0
	jcc .L25
.L54:
	move.l %a0,%d1
	mov3q.l #6,%d7
	remu.l %d7,%d0:%d1
	lea (%a6,%d0.l),%a1
	moveq #12,%d0
	lea (474,%a1),%a1
	add.l %d2,%a1
	move.b (%a1),(%a4,%a0.l)
	addq.l #1,%a0
	move.b (%a5),(%a1)
	cmp.l %a0,%d0
	jeq .L24
	move.l #1074606604,%a5
	mov3q.l #5,%d0
	add.l %a0,%a5
	lea 42(%a6,%a0.l),%a3
	move.l %a5,%a1
	cmp.l %a0,%d0
	jcs .L54
.L25:
	lea (%a3,%d2.l),%a5
	move.b (%a5),(%a4,%a0.l)
	addq.l #1,%a0
	move.b (%a1),(%a5)
	jra .L26
.L53:
	clr.l %d1
	lea (%a0,%d2.l),%a3
.L31:
	mov3q.l #5,%d4
	cmp.l %d1,%d4
	jcs .L29
.L55:
	lea (%a2,%d1.l),%a4
	mov3q.l #5,%d4
	move.l %d2,%a1
	add.l %d1,%a1
	move.b (%a4),42(%a0,%a1.l)
	addq.l #1,%d1
	cmp.l %d1,%d4
	jcc .L55
.L29:
	move.l %d1,%d6
	mov3q.l #6,%d7
	remu.l %d7,%d4:%d6
	lea (%a2,%d1.l),%a4
	addq.l #1,%d1
	lea (%a3,%d4.l),%a1
	moveq #12,%d4
	move.b (%a4),474(%a1)
	cmp.l %d1,%d4
	jne .L31
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #246,%a0
	jne .L32
	jra .L56
	.size	fm_validate_part, .-fm_validate_part
	.globl	fm_defaults
	.section	.rodata
	.type	fm_defaults, @object
	.size	fm_defaults, 12
fm_defaults:
	.string	"@\f @"
	.string	"("
	.base64	"AAAAAAA="
	.ident	"GCC: (GNU) 16.2.0"
